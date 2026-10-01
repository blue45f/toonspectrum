/**
 * ViewportPane의 순수 상호작용 로직: 관절 라벨, 핸들 필터, 관절 드래그 계산, HUD 문구.
 * React·DOM·Babylon을 모른다 — 엔진이 보고한 카메라(`ViewportCameraInfo`)·스켈레톤·핸들만 받는다.
 *
 * 관절 드래그 규약: 핸들은 본의 월드 원점이고, 핸들을 끌면 그 본의 **부모 관절**(피벗)이 시선 둘레로 돈다
 * (손 핸들을 끌면 아래팔이, 팔꿈치 핸들을 끌면 위팔이 돈다). 부모가 없는 루트(hips)는 자기 원점 둘레로 돈다.
 * 포인터 시작·현재 픽셀을 "피벗을 지나 시선에 수직인 평면"으로 역투영한 두 점이 `dragJointDetailed`의 from/to다.
 * 스켈레톤은 엔진의 포즈 프레임 스켈레톤(`render/pose-skeleton`)이라 절차·패키지 소스 모두 같은 식으로 계산된다.
 */
import { dragJointDetailed } from "../../../animation/joint-drag";
import { computeWorldTransforms, indexBones } from "../../../animation/skeleton-fk";
import { FINGER_BONE_NAMES, isHumanoidBoneName } from "../../../contracts";
import { unprojectToViewPlane } from "../../../render/viewport-math";

import type { HumanoidBoneName, HudSample, JointDragHandle, Pose, SkeletonData, Vec3 } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";

// ---------------------------------------------------------------- 라벨

const SIDE_LABELS_KO = { left: "왼쪽", right: "오른쪽" } as const;
const BODY_LABELS_KO: Readonly<Record<string, string>> = {
  hips: "골반",
  spine: "척추",
  chest: "가슴",
  upperChest: "상흉부",
  neck: "목",
  head: "머리",
  jaw: "턱",
  Eye: "눈",
  Shoulder: "어깨",
  UpperArm: "위팔",
  LowerArm: "아래팔",
  Hand: "손",
  UpperLeg: "허벅지",
  LowerLeg: "종아리",
  Foot: "발",
  Toes: "발가락",
};
const FINGER_LABELS_KO: Readonly<Record<string, string>> = { Thumb: "엄지", Index: "검지", Middle: "중지", Ring: "약지", Little: "소지" };
const SEGMENT_LABELS_KO: Readonly<Record<string, string>> = { Metacarpal: "중수", Proximal: "1마디", Intermediate: "2마디", Distal: "끝마디" };

/** 관절 핸들 라벨(한글). 알 수 없는 본은 이름 그대로. */
export function jointLabelKo(bone: string): string {
  const direct = BODY_LABELS_KO[bone];
  if (direct) return direct;
  const sided = /^(left|right)([A-Z][A-Za-z]*)$/u.exec(bone);
  if (!sided) return bone;
  const side = SIDE_LABELS_KO[sided[1] as "left" | "right"];
  const rest = sided[2] ?? "";
  const body = BODY_LABELS_KO[rest];
  if (body) return `${side} ${body}`;
  const finger = /^(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/u.exec(rest);
  if (finger) return `${side} ${FINGER_LABELS_KO[finger[1] as string]} ${SEGMENT_LABELS_KO[finger[2] as string]}`;
  return bone;
}

// ---------------------------------------------------------------- 핸들 필터

const FINGER_SET: ReadonlySet<string> = new Set(FINGER_BONE_NAMES);
/** 시선 둘레 회전이 의미 없는 본(눈·턱)은 핸들을 만들지 않는다 */
const NO_HANDLE: ReadonlySet<string> = new Set(["leftEye", "rightEye", "jaw"]);

export interface HandleFilter {
  readonly fingers: boolean;
}

export function isFingerBone(bone: string): boolean {
  return FINGER_SET.has(bone);
}

/** 표시할 핸들: 눈·턱 제외, 손가락은 옵션. */
export function visibleHandles(handles: readonly JointDragHandle[], filter: HandleFilter): readonly JointDragHandle[] {
  return handles.filter((handle) => !NO_HANDLE.has(handle.bone) && (filter.fingers || !FINGER_SET.has(handle.bone)));
}

/** 핸들 목록의 변화 감지용 키(렌더 픽셀을 소수 첫째 자리까지, 본 순서 포함). 같으면 React 상태를 갱신하지 않는다. */
export function handlesKey(handles: readonly JointDragHandle[]): string {
  return handles.map((handle) => `${handle.bone}:${handle.screen[0].toFixed(1)},${handle.screen[1].toFixed(1)}`).join("|");
}

// ---------------------------------------------------------------- 관절 드래그

export interface DragPivot {
  /** 실제로 회전하는 본(핸들 본의 부모, 루트면 자기 자신) */
  readonly pivotBone: HumanoidBoneName;
  /** 피벗의 월드 원점(현재 포즈 기준 FK) */
  readonly pivotWorld: Vec3;
}

/**
 * 핸들 본에서 드래그 피벗을 정한다. 스켈레톤에서 부모 사슬을 거슬러 처음 만나는 휴머노이드 본이 피벗이다
 * (보조 본은 건너뛴다). 휴머노이드 본이 아니거나 스켈레톤에 없으면 null.
 */
export function resolveDragPivot(skeleton: SkeletonData, pose: Pose, handleBone: HumanoidBoneName): DragPivot | null {
  const byName = indexBones(skeleton);
  const handle = byName.get(handleBone);
  if (!handle) return null;
  let pivot = handle.parent !== null ? byName.get(handle.parent) : undefined;
  while (pivot && !isHumanoidBoneName(pivot.name)) pivot = pivot.parent !== null ? byName.get(pivot.parent) : undefined;
  const pivotName = pivot?.name ?? handleBone;
  if (!isHumanoidBoneName(pivotName)) return null;
  const world = computeWorldTransforms(skeleton, pose).get(pivotName);
  if (!world) return null;
  return { pivotBone: pivotName, pivotWorld: world.position };
}

export interface JointDragInput {
  readonly skeleton: SkeletonData;
  /** 드래그 시작 시점의 적용 중 포즈(플랜 boneRotations) */
  readonly startPose: Pose;
  readonly pivot: DragPivot;
  readonly camera: ViewportCameraInfo;
  readonly startPixel: readonly [number, number];
  readonly currentPixel: readonly [number, number];
}

export interface JointDragOutcome {
  readonly pose: Pose;
  readonly pivotBone: HumanoidBoneName;
  /** 화면 평면에서 요청된 회전각(도) */
  readonly requestedDeg: number;
  /** 관절 제한으로 요청과 달라졌는지 */
  readonly clamped: boolean;
}

/**
 * 시작 포즈에서 포인터 이동량만큼 피벗을 돌린 결과. 매번 시작 포즈에서 계산하므로 오차가 누적되지 않는다.
 * 역투영이 불가능하면(피벗이 카메라 뒤쪽·시선과 평행) null.
 */
export function computeJointDrag(input: JointDragInput): JointDragOutcome | null {
  const { camera, pivot } = input;
  const from = unprojectToViewPlane(camera, input.startPixel[0], input.startPixel[1], pivot.pivotWorld);
  const to = unprojectToViewPlane(camera, input.currentPixel[0], input.currentPixel[1], pivot.pivotWorld);
  if (!from || !to) return null;
  const result = dragJointDetailed(input.startPose, input.skeleton, pivot.pivotBone, from, to, { position: camera.position, forward: camera.forward });
  return { pose: result.pose, pivotBone: pivot.pivotBone, requestedDeg: result.requestedDeg, clamped: result.clamped };
}

// ---------------------------------------------------------------- HUD

export interface HudRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}

/** HUD 표 행(한글). GPU 시간이 없으면 미지원이라고 적는다(빈 값으로 숨기지 않는다). */
export function hudRows(sample: HudSample): readonly HudRow[] {
  return [
    { key: "frame", label: "프레임", value: formatMs(sample.frameMs) },
    { key: "p95", label: "프레임 p95", value: formatMs(sample.frameMsP95) },
    { key: "gpu", label: "GPU 시간", value: sample.gpuFrameMs === null ? "미지원" : formatMs(sample.gpuFrameMs) },
    { key: "draw", label: "드로 콜", value: String(sample.drawCalls) },
    { key: "meshes", label: "활성 메시", value: String(sample.activeMeshes) },
    { key: "tris", label: "삼각형", value: sample.triangles.toLocaleString("ko-KR") },
    { key: "backend", label: "backend", value: sample.backend },
    { key: "adapter", label: "어댑터", value: sample.adapterLabel },
    { key: "physics", label: "물리", value: sample.physicsProvider },
    { key: "shading", label: "셰이딩", value: sample.shadingMode === "toon" ? "툰" : "PBR" },
  ];
}
