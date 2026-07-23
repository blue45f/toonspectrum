/**
 * Studio 3D 데생 인형 — 포즈 프리셋 라이브러리 + 미러 유틸 + 직렬화(순수 데이터 계층).
 *
 * 포즈는 관절 오일러(rad) 맵과 골반 오프셋(m)만으로 표현되어 체형 파라미터와 독립적으로
 * 재사용된다. 직렬화는 다른 Studio 문서와 같은 버전드 + 방어적 정규화 계약을 따른다:
 * 알 수 없는 관절은 버리고, 각도는 표준 범위 접기 + 관절 한계 클램프를 거친다.
 * Three.js import 없음 — 결정적이고 단위 테스트 가능하다.
 */

import {
  STUDIO_MANNEQUIN_JOINT_IDS,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";

export interface StudioMannequinPose {
  /** 관절 오일러(XYZ, rad). 항등 회전 관절은 생략 가능. */
  readonly joints: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>;
  /** rest 골반 위치에 더하는 오프셋(m) — 앉기/점프/눕기용. */
  readonly pelvisOffset: StudioMannequinVec3;
}

export interface StudioMannequinPosePreset {
  readonly id: string;
  readonly label: string;
  readonly pose: StudioMannequinPose;
}

const PELVIS_OFFSET_LIMIT = 2;

function deg3(x: number, y: number, z: number): StudioMannequinVec3 {
  return [(x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180];
}

export function createStudioMannequinRestPose(): StudioMannequinPose {
  return { joints: {}, pelvisOffset: [0, 0, 0] };
}

type JointMap = Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;

function pose(joints: JointMap, pelvisOffset: StudioMannequinVec3 = [0, 0, 0]): StudioMannequinPose {
  return { joints, pelvisOffset };
}

/**
 * 프리셋 각도는 전부 관절 한계 안에서 손으로 저작했다(테스트가 클램프 불변을 검증).
 * 좌표 감각: 팔다리 rest 는 −Y로 늘어짐. X− = 앞으로 스윙(팔·다리), 팔꿈치 X− = 앞굽힘,
 * 무릎 X+ = 뒤굽힘, 왼쪽 Z+ = 바깥 벌림(오른쪽은 부호 반전), 몸통 X+ = 앞으로 숙임.
 */
export const STUDIO_MANNEQUIN_POSE_PRESETS: readonly StudioMannequinPosePreset[] = Object.freeze([
  {
    id: "stand",
    label: "서기",
    pose: pose({
      spine: deg3(2, 0, 0),
      leftUpperArm: deg3(-4, 0, 8),
      rightUpperArm: deg3(-4, 0, -8),
      leftLowerArm: deg3(-14, 0, 0),
      rightLowerArm: deg3(-14, 0, 0),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }),
  },
  {
    id: "attention",
    label: "차렷",
    pose: pose({
      leftUpperArm: deg3(0, 0, 3),
      rightUpperArm: deg3(0, 0, -3),
      leftLowerArm: deg3(-4, 0, 0),
      rightLowerArm: deg3(-4, 0, 0),
      leftUpperLeg: deg3(0, 0, 1),
      rightUpperLeg: deg3(0, 0, -1),
    }),
  },
  {
    id: "walk",
    label: "걷기",
    pose: pose({
      pelvis: deg3(0, -6, 0),
      chest: deg3(0, 7, 0),
      leftUpperLeg: deg3(-26, 0, 2),
      leftLowerLeg: deg3(10, 0, 0),
      leftFoot: deg3(6, 0, 0),
      rightUpperLeg: deg3(20, 0, -2),
      rightLowerLeg: deg3(30, 0, 0),
      rightFoot: deg3(18, 0, 0),
      leftUpperArm: deg3(22, 0, 6),
      leftLowerArm: deg3(-20, 0, 0),
      rightUpperArm: deg3(-26, 0, -6),
      rightLowerArm: deg3(-38, 0, 0),
    }),
  },
  {
    id: "run",
    label: "달리기",
    pose: pose({
      spine: deg3(14, 0, 0),
      chest: deg3(8, 6, 0),
      leftUpperLeg: deg3(-62, 0, 3),
      leftLowerLeg: deg3(48, 0, 0),
      leftFoot: deg3(-12, 0, 0),
      rightUpperLeg: deg3(34, 0, -3),
      rightLowerLeg: deg3(96, 0, 0),
      rightFoot: deg3(28, 0, 0),
      leftUpperArm: deg3(34, 0, 6),
      leftLowerArm: deg3(-72, 0, 0),
      rightUpperArm: deg3(-48, 0, -6),
      rightLowerArm: deg3(-92, 0, 0),
    }, [0, 0.04, 0]),
  },
  {
    id: "sit-chair",
    label: "앉기(의자)",
    pose: pose({
      spine: deg3(6, 0, 0),
      leftUpperLeg: deg3(-84, 0, 6),
      rightUpperLeg: deg3(-84, 0, -6),
      leftLowerLeg: deg3(82, 0, 0),
      rightLowerLeg: deg3(82, 0, 0),
      leftFoot: deg3(2, 0, 0),
      rightFoot: deg3(2, 0, 0),
      leftUpperArm: deg3(-26, 0, 6),
      rightUpperArm: deg3(-26, 0, -6),
      leftLowerArm: deg3(-44, 0, 0),
      rightLowerArm: deg3(-44, 0, 0),
    }, [0, -0.42, 0]),
  },
  {
    id: "kneel",
    label: "무릎앉기",
    pose: pose({
      spine: deg3(4, 0, 0),
      leftUpperLeg: deg3(-72, 0, 4),
      leftLowerLeg: deg3(70, 0, 0),
      leftFoot: deg3(-8, 0, 0),
      rightUpperLeg: deg3(12, 0, -4),
      rightLowerLeg: deg3(112, 0, 0),
      rightFoot: deg3(42, 0, 0),
      leftUpperArm: deg3(-12, 0, 8),
      leftLowerArm: deg3(-16, 0, 0),
      rightUpperArm: deg3(-30, 0, -6),
      rightLowerArm: deg3(-52, 0, 0),
    }, [0, -0.45, 0]),
  },
  {
    id: "jump",
    label: "점프",
    pose: pose({
      spine: deg3(-6, 0, 0),
      leftUpperArm: deg3(-10, 0, 150),
      rightUpperArm: deg3(-10, 0, -150),
      leftLowerArm: deg3(-18, 0, 0),
      rightLowerArm: deg3(-18, 0, 0),
      leftUpperLeg: deg3(-36, 0, 6),
      rightUpperLeg: deg3(-36, 0, -6),
      leftLowerLeg: deg3(64, 0, 0),
      rightLowerLeg: deg3(64, 0, 0),
      leftFoot: deg3(30, 0, 0),
      rightFoot: deg3(30, 0, 0),
    }, [0, 0.28, 0]),
  },
  {
    id: "punch",
    label: "펀치",
    pose: pose({
      spine: deg3(0, -12, 0),
      chest: deg3(0, -28, 0),
      head: deg3(0, 24, 0),
      rightUpperArm: deg3(-88, 0, -12),
      rightLowerArm: deg3(-6, 0, 0),
      leftUpperArm: deg3(-38, 0, 20),
      leftLowerArm: deg3(-118, 0, 0),
      leftUpperLeg: deg3(-18, 0, 4),
      leftLowerLeg: deg3(12, 0, 0),
      rightUpperLeg: deg3(24, 0, -6),
      rightLowerLeg: deg3(22, 0, 0),
    }),
  },
  {
    id: "arms-spread",
    label: "양팔벌리기",
    pose: pose({
      leftUpperArm: deg3(0, 0, 86),
      rightUpperArm: deg3(0, 0, -86),
      leftLowerArm: deg3(-4, 0, 0),
      rightLowerArm: deg3(-4, 0, 0),
      leftHand: deg3(0, 0, 6),
      rightHand: deg3(0, 0, -6),
      leftUpperLeg: deg3(0, 0, 10),
      rightUpperLeg: deg3(0, 0, -10),
    }),
  },
  {
    id: "selfie",
    label: "셀카",
    pose: pose({
      spine: deg3(0, 0, 6),
      chest: deg3(0, -6, 4),
      neck: deg3(0, -8, -4),
      head: deg3(-4, -18, -8),
      rightUpperArm: deg3(-118, 0, -26),
      rightLowerArm: deg3(-30, 0, 0),
      rightHand: deg3(-20, 0, 10),
      leftUpperArm: deg3(8, 0, 26),
      leftLowerArm: deg3(-96, 0, 0),
      leftHand: deg3(0, 0, -40),
    }),
  },
  {
    id: "lie-down",
    label: "누움",
    pose: pose({
      pelvis: deg3(-90, 0, 0),
      head: deg3(12, 0, 0),
      leftUpperArm: deg3(4, 0, 10),
      rightUpperArm: deg3(4, 0, -10),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }, [0, -0.72, 0]),
  },
  {
    id: "think",
    label: "생각하기",
    pose: pose({
      spine: deg3(4, 0, 0),
      neck: deg3(6, 6, 0),
      head: deg3(10, 14, 8),
      rightUpperArm: deg3(-42, 0, -14),
      rightLowerArm: deg3(-126, 0, 0),
      rightHand: deg3(-28, 0, 0),
      leftUpperArm: deg3(-22, 0, 8),
      leftLowerArm: deg3(-86, 22, 0),
    }),
  },
  {
    id: "wave",
    label: "손흔들기",
    pose: pose({
      head: deg3(0, 0, -8),
      rightUpperArm: deg3(-16, 0, -128),
      rightLowerArm: deg3(-48, 0, 0),
      rightHand: deg3(0, 0, 24),
      leftUpperArm: deg3(-4, 0, 8),
      leftLowerArm: deg3(-12, 0, 0),
      leftUpperLeg: deg3(0, 0, 4),
      rightUpperLeg: deg3(0, 0, -4),
    }),
  },
  {
    id: "bow",
    label: "인사",
    pose: pose({
      spine: deg3(32, 0, 0),
      chest: deg3(26, 0, 0),
      neck: deg3(14, 0, 0),
      head: deg3(10, 0, 0),
      leftUpperArm: deg3(-8, 0, 4),
      rightUpperArm: deg3(-8, 0, -4),
      leftLowerArm: deg3(-10, 0, 0),
      rightLowerArm: deg3(-10, 0, 0),
      leftLowerLeg: deg3(4, 0, 0),
      rightLowerLeg: deg3(4, 0, 0),
    }),
  },
]);

export function findStudioMannequinPosePreset(id: unknown): StudioMannequinPosePreset | null {
  if (typeof id !== "string") return null;
  return STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === id) ?? null;
}

// ── 미러 ────────────────────────────────────────────────────────────────────

function mirrorJointId(jointId: StudioMannequinJointId): StudioMannequinJointId {
  if (jointId.startsWith("left")) {
    return `right${jointId.slice("left".length)}` as StudioMannequinJointId;
  }
  if (jointId.startsWith("right")) {
    return `left${jointId.slice("right".length)}` as StudioMannequinJointId;
  }
  return jointId;
}

function mirrorRotation(rotation: StudioMannequinVec3): StudioMannequinVec3 {
  // 하우스 미러 계약: YZ 평면 반사 = X 유지, Y/Z 부호 반전.
  return [rotation[0], -rotation[1], -rotation[2]];
}

/** 좌우 반전 포즈(관절 스왑 + Y/Z 부호 반전 + 골반 X 오프셋 반전). 두 번 적용하면 원본. */
export function mirrorStudioMannequinPose(input: StudioMannequinPose): StudioMannequinPose {
  const joints: JointMap = {};
  for (const [jointId, rotation] of Object.entries(input.joints)) {
    if (!isStudioMannequinJointId(jointId) || !rotation) continue;
    joints[mirrorJointId(jointId)] = mirrorRotation(rotation);
  }
  return {
    joints,
    pelvisOffset: [-input.pelvisOffset[0], input.pelvisOffset[1], input.pelvisOffset[2]],
  };
}

// ── 정규화 + 직렬화 ─────────────────────────────────────────────────────────

export const STUDIO_MANNEQUIN_POSE_DOC_KIND = "studio-mannequin-pose" as const;
export const STUDIO_MANNEQUIN_POSE_DOC_VERSION = 1 as const;
export const STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES = 16 * 1024;

function clampOffsetAxis(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const clamped = Math.min(PELVIS_OFFSET_LIMIT, Math.max(-PELVIS_OFFSET_LIMIT, value));
  const quantized = Math.round(clamped * 1e6) / 1e6;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function normalizePelvisOffset(value: unknown): StudioMannequinVec3 {
  const source = Array.isArray(value) ? value : [];
  return [clampOffsetAxis(source[0]), clampOffsetAxis(source[1]), clampOffsetAxis(source[2])];
}

function isIdentityRotation(rotation: StudioMannequinVec3): boolean {
  return rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0;
}

/**
 * 알 수 없는 입력을 항상 유효한 포즈로 정규화한다. 알 수 없는 관절 키는 버리고, 각도는
 * 표준 범위 접기 + 관절 한계 클램프, 항등 회전은 생략해 표현을 canonical 하게 만든다.
 */
export function normalizeStudioMannequinPose(input: unknown): StudioMannequinPose {
  const source = (typeof input === "object" && input !== null ? input : {}) as {
    joints?: unknown;
    pelvisOffset?: unknown;
  };
  const joints: JointMap = {};
  const sourceJoints = (typeof source.joints === "object" && source.joints !== null
    ? source.joints
    : {}) as Record<string, unknown>;
  // 순서를 관절 정의 순으로 고정해 직렬화 출력을 결정적으로 만든다.
  for (const jointId of STUDIO_MANNEQUIN_JOINT_IDS) {
    if (!Object.hasOwn(sourceJoints, jointId)) continue;
    const rotation = clampStudioMannequinJointRotation(jointId, sourceJoints[jointId]);
    if (isIdentityRotation(rotation)) continue;
    joints[jointId] = rotation;
  }
  return { joints, pelvisOffset: normalizePelvisOffset(source.pelvisOffset) };
}

export function serializeStudioMannequinPose(input: StudioMannequinPose): string {
  const normalized = normalizeStudioMannequinPose(input);
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_POSE_DOC_KIND,
    version: STUDIO_MANNEQUIN_POSE_DOC_VERSION,
    joints: normalized.joints,
    pelvisOffset: normalized.pelvisOffset,
  });
}

/** JSON 문자열/객체 어느 쪽이든 안전하게 파싱한다. 계약 위반이면 null. */
export function parseStudioMannequinPose(raw: unknown): StudioMannequinPose | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_POSE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as { kind?: unknown; version?: unknown };
  if (doc.kind !== STUDIO_MANNEQUIN_POSE_DOC_KIND) return null;
  if (doc.version !== STUDIO_MANNEQUIN_POSE_DOC_VERSION) return null;
  return normalizeStudioMannequinPose(value);
}

// ── 세션 상태(체형 + 포즈) 영속 계약 ─────────────────────────────────────────

export const STUDIO_MANNEQUIN_STATE_STORAGE_KEY = "toonspectrum-studio-mannequin-state:v1";
export const STUDIO_MANNEQUIN_STATE_DOC_KIND = "studio-mannequin-state" as const;
export const STUDIO_MANNEQUIN_STATE_DOC_VERSION = 1 as const;
export const STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES = 24 * 1024;

export interface StudioMannequinPersistentState {
  readonly params: StudioMannequinBodyParams;
  readonly pose: StudioMannequinPose;
}

export function serializeStudioMannequinState(input: StudioMannequinPersistentState): string {
  return JSON.stringify({
    kind: STUDIO_MANNEQUIN_STATE_DOC_KIND,
    version: STUDIO_MANNEQUIN_STATE_DOC_VERSION,
    params: clampStudioMannequinBodyParams(input.params),
    pose: normalizeStudioMannequinPose(input.pose),
  });
}

export function parseStudioMannequinState(raw: unknown): StudioMannequinPersistentState | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as { kind?: unknown; version?: unknown; params?: unknown; pose?: unknown };
  if (doc.kind !== STUDIO_MANNEQUIN_STATE_DOC_KIND) return null;
  if (doc.version !== STUDIO_MANNEQUIN_STATE_DOC_VERSION) return null;
  return {
    params: clampStudioMannequinBodyParams(doc.params),
    pose: normalizeStudioMannequinPose(doc.pose),
  };
}
