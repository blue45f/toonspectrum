import { describe, expect, it } from "vitest";

import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { HUMANOID_BONE_NAMES } from "../../../contracts";
import { projectToPixel } from "../../../render/viewport-math";
import { qRotateVec3, v3Add, v3Length, v3Sub } from "../../../shared/math";

import { computeJointDrag, handlesKey, hudRows, isFingerBone, jointLabelKo, resolveDragPivot, visibleHandles } from "./viewport-interactions";

import type { HumanoidBoneName, HudSample, JointDragHandle, Pose, Quat, Vec3 } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";

const SKELETON = createReferenceSkeleton();

/** 정면(+Z)에서 몸 중심을 보는 카메라 */
const CAMERA: ViewportCameraInfo = {
  position: [0, 1.1, 4],
  forward: [0, 0, -1],
  right: [1, 0, 0],
  up: [0, 1, 0],
  fovY: 0.8,
  width: 800,
  height: 800,
};

function worldOf(pose: Pose, bone: HumanoidBoneName): Vec3 {
  const world = computeWorldTransforms(SKELETON, pose).get(bone);
  if (!world) throw new Error(`본 없음: ${bone}`);
  return world.position;
}

function pixelOf(world: Vec3): readonly [number, number] {
  const pixel = projectToPixel(CAMERA, world);
  if (!pixel) throw new Error("투영 불가");
  return pixel;
}

describe("jointLabelKo", () => {
  it("몸통·좌우 사지·손가락을 한글로 라벨링하고 모르는 이름은 그대로 돌려준다", () => {
    expect(jointLabelKo("hips")).toBe("골반");
    expect(jointLabelKo("head")).toBe("머리");
    expect(jointLabelKo("leftUpperArm")).toBe("왼쪽 위팔");
    expect(jointLabelKo("rightLowerLeg")).toBe("오른쪽 종아리");
    expect(jointLabelKo("leftToes")).toBe("왼쪽 발가락");
    expect(jointLabelKo("rightIndexIntermediate")).toBe("오른쪽 검지 2마디");
    expect(jointLabelKo("leftThumbMetacarpal")).toBe("왼쪽 엄지 중수");
    expect(jointLabelKo("mixamorig:Foo")).toBe("mixamorig:Foo");
  });

  it("55개 휴머노이드 본이 모두 한글 라벨을 갖는다(영문 이름 그대로 나오지 않는다)", () => {
    for (const bone of HUMANOID_BONE_NAMES) expect(jointLabelKo(bone), bone).not.toBe(bone);
  });
});

describe("visibleHandles·handlesKey", () => {
  const handle = (bone: HumanoidBoneName, x: number, y: number): JointDragHandle => ({ bone, screen: [x, y], world: [0, 0, 0] });
  const all = [handle("hips", 1, 2), handle("leftHand", 3, 4), handle("leftIndexProximal", 5, 6), handle("leftEye", 7, 8), handle("jaw", 9, 10)];

  it("눈·턱은 항상 빼고 손가락은 옵션이다", () => {
    expect(visibleHandles(all, { fingers: false }).map((h) => h.bone)).toEqual(["hips", "leftHand"]);
    expect(visibleHandles(all, { fingers: true }).map((h) => h.bone)).toEqual(["hips", "leftHand", "leftIndexProximal"]);
    expect(isFingerBone("leftIndexProximal")).toBe(true);
    expect(isFingerBone("leftHand")).toBe(false);
  });

  it("키는 소수 첫째 자리 변화에만 반응한다", () => {
    const base = handlesKey([handle("hips", 10.01, 20.02)]);
    expect(handlesKey([handle("hips", 10.04, 20.03)])).toBe(base);
    expect(handlesKey([handle("hips", 10.2, 20.03)])).not.toBe(base);
    expect(handlesKey([handle("spine", 10.01, 20.02)])).not.toBe(base);
  });
});

describe("resolveDragPivot", () => {
  it("핸들 본의 부모 관절이 피벗이고 월드 원점은 FK 값이다", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    expect(pivot?.pivotBone).toBe("leftUpperArm");
    expect(v3Length(v3Sub(pivot?.pivotWorld ?? [9, 9, 9], worldOf({}, "leftUpperArm")))).toBeLessThan(1e-9);
    expect(resolveDragPivot(SKELETON, {}, "head")?.pivotBone).toBe("neck");
  });

  it("루트(hips)는 자기 자신이 피벗이고 스켈레톤에 없는 본은 null이다", () => {
    expect(resolveDragPivot(SKELETON, {}, "hips")?.pivotBone).toBe("hips");
    expect(resolveDragPivot({ bones: [] }, {}, "head")).toBeNull();
  });

  it("보조 본(휴머노이드가 아닌 부모)은 건너뛰고 첫 휴머노이드 조상을 피벗으로 쓴다", () => {
    const skeleton = {
      bones: [
        { name: "hips", parent: null, restTranslation: [0, 1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat },
        { name: "aux_root", parent: "hips", restTranslation: [0, 0.1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat, auxiliary: true },
        { name: "spine", parent: "aux_root", restTranslation: [0, 0.1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat },
      ],
    };
    const pivot = resolveDragPivot(skeleton, {}, "spine");
    expect(pivot?.pivotBone).toBe("hips");
    expect(pivot?.pivotWorld).toEqual([0, 1, 0]);
  });
});

describe("computeJointDrag", () => {
  it("팔꿈치를 어깨 둘레로 −45°(아래쪽) 끌면 위팔이 그만큼 돌고 팔꿈치가 목표 픽셀의 월드 점으로 간다", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    expect(pivot).not.toBeNull();
    if (!pivot) return;
    const elbow = worldOf({}, "leftLowerArm");
    const around = Math.PI / 4;
    // 어깨(피벗) 둘레로 Z축 −45°: +X로 뻗은 팔이 아래로 내려간다
    const zRotation: Quat = [0, 0, -Math.sin(around / 2), Math.cos(around / 2)];
    const target = v3Add(pivot.pivotWorld, qRotateVec3(zRotation, v3Sub(elbow, pivot.pivotWorld)));
    const outcome = computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: CAMERA, startPixel: pixelOf(elbow), currentPixel: pixelOf(target) });
    expect(outcome).not.toBeNull();
    if (!outcome) return;
    expect(outcome.pivotBone).toBe("leftUpperArm");
    expect(Math.abs(outcome.requestedDeg)).toBeCloseTo(45, 3);
    expect(outcome.clamped).toBe(false);
    const after = worldOf(outcome.pose, "leftLowerArm");
    expect(v3Length(v3Sub(after, target))).toBeLessThan(2e-3);
    // 시작 포즈의 다른 본은 보존된다
    expect(Object.keys(outcome.pose)).toEqual(["leftUpperArm"]);
  });

  it("누적 오차가 없다: 같은 시작 포즈에서 같은 입력은 같은 결과(결정적)이고 시작 포즈의 다른 본을 유지한다", () => {
    const startPose: Pose = { head: [0, 0.1, 0, 0.995] };
    const pivot = resolveDragPivot(SKELETON, startPose, "leftHand");
    if (!pivot) throw new Error("피벗 없음");
    const hand = worldOf(startPose, "leftHand");
    const input = { skeleton: SKELETON, startPose, pivot, camera: CAMERA, startPixel: pixelOf(hand), currentPixel: [pixelOf(hand)[0] + 20, pixelOf(hand)[1] + 60] as const };
    const a = computeJointDrag(input);
    const b = computeJointDrag(input);
    expect(a).toEqual(b);
    expect(a?.pose.head).toEqual(startPose.head);
    expect(a?.pose.leftLowerArm).toBeDefined();
  });

  it("관절 제한을 넘기는 드래그는 clamped=true로 보고한다(무음 클램프 없음)", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    if (!pivot) throw new Error("피벗 없음");
    const elbow = worldOf({}, "leftLowerArm");
    // 팔꿈치를 어깨 바로 위·뒤로 반 바퀴 이상 돌리는 목표: 시선 평면에서 180°
    const mirrored = v3Add(pivot.pivotWorld, v3Sub(pivot.pivotWorld, elbow));
    const outcome = computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: CAMERA, startPixel: pixelOf(elbow), currentPixel: pixelOf(mirrored) });
    expect(outcome?.clamped).toBe(true);
    expect(Math.abs(outcome?.requestedDeg ?? 0)).toBeGreaterThan(150);
  });

  it("피벗이 카메라 뒤쪽이면 null이다(역투영 불가)", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "head");
    if (!pivot) throw new Error("피벗 없음");
    const behind: ViewportCameraInfo = { ...CAMERA, position: [0, 1.1, -4] };
    expect(computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: behind, startPixel: [400, 300], currentPixel: [420, 300] })).toBeNull();
  });
});

describe("hudRows", () => {
  const sample: HudSample = {
    frameMs: 16.66,
    frameMsP95: 21.04,
    gpuFrameMs: null,
    drawCalls: 42,
    activeMeshes: 9,
    triangles: 123456,
    backend: "webgpu",
    adapterLabel: "Test GPU",
    physicsProvider: "builtin-pbd",
    shadingMode: "toon",
  };

  it("GPU 시간이 없으면 '미지원'을 적고 수치를 한글 단위로 서식한다", () => {
    const rows = new Map(hudRows(sample).map((row) => [row.key, row.value]));
    expect(rows.get("frame")).toBe("16.7 ms");
    expect(rows.get("p95")).toBe("21.0 ms");
    expect(rows.get("gpu")).toBe("미지원");
    expect(rows.get("draw")).toBe("42");
    expect(rows.get("shading")).toBe("툰");
    expect(rows.get("backend")).toBe("webgpu");
    expect(hudRows({ ...sample, gpuFrameMs: 3.21 }).find((row) => row.key === "gpu")?.value).toBe("3.2 ms");
    expect(hudRows({ ...sample, frameMs: Number.NaN }).find((row) => row.key === "frame")?.value).toBe("—");
  });
});
