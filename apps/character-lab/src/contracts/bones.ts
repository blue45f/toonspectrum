/**
 * VRM 1.0 휴머노이드 본 어휘(55본). 순서는 apps/web `studio-humanoid-bones.ts`와 동일하다.
 * 절차적 스켈레톤(humanoid)·제작 패키지 본 매핑(authored)·포즈(animation)·비전(vision)이 같은 이름을 쓴다.
 */
export const HUMANOID_BONE_NAMES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

export type HumanoidBoneName = (typeof HUMANOID_BONE_NAMES)[number];

/** 부모 관계(VRM 1.0). hips만 루트(null). */
export const HUMANOID_BONE_PARENTS: Readonly<Record<HumanoidBoneName, HumanoidBoneName | null>> = {
  hips: null,
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftEye: "head",
  rightEye: "head",
  jaw: "head",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  leftThumbMetacarpal: "leftHand",
  leftThumbProximal: "leftThumbMetacarpal",
  leftThumbDistal: "leftThumbProximal",
  leftIndexProximal: "leftHand",
  leftIndexIntermediate: "leftIndexProximal",
  leftIndexDistal: "leftIndexIntermediate",
  leftMiddleProximal: "leftHand",
  leftMiddleIntermediate: "leftMiddleProximal",
  leftMiddleDistal: "leftMiddleIntermediate",
  leftRingProximal: "leftHand",
  leftRingIntermediate: "leftRingProximal",
  leftRingDistal: "leftRingIntermediate",
  leftLittleProximal: "leftHand",
  leftLittleIntermediate: "leftLittleProximal",
  leftLittleDistal: "leftLittleIntermediate",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  rightThumbMetacarpal: "rightHand",
  rightThumbProximal: "rightThumbMetacarpal",
  rightThumbDistal: "rightThumbProximal",
  rightIndexProximal: "rightHand",
  rightIndexIntermediate: "rightIndexProximal",
  rightIndexDistal: "rightIndexIntermediate",
  rightMiddleProximal: "rightHand",
  rightMiddleIntermediate: "rightMiddleProximal",
  rightMiddleDistal: "rightMiddleIntermediate",
  rightRingProximal: "rightHand",
  rightRingIntermediate: "rightRingProximal",
  rightRingDistal: "rightRingIntermediate",
  rightLittleProximal: "rightHand",
  rightLittleIntermediate: "rightLittleProximal",
  rightLittleDistal: "rightLittleIntermediate",
};

/** VRMC_vrm 1.0 필수 본 15개 */
export const REQUIRED_HUMANOID_BONES: readonly HumanoidBoneName[] = [
  "hips",
  "spine",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
];

const FINGER_PATTERN = /(Thumb|Index|Middle|Ring|Little)/u;

/** 손가락 본 30개(좌 15 + 우 15) */
export const FINGER_BONE_NAMES: readonly HumanoidBoneName[] = HUMANOID_BONE_NAMES.filter((name) =>
  FINGER_PATTERN.test(name),
);

export const LEFT_FINGER_BONE_NAMES: readonly HumanoidBoneName[] = FINGER_BONE_NAMES.filter((name) =>
  name.startsWith("left"),
);
export const RIGHT_FINGER_BONE_NAMES: readonly HumanoidBoneName[] = FINGER_BONE_NAMES.filter((name) =>
  name.startsWith("right"),
);

export type IkChainId = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

/** two-bone IK 체인: [루트, 중간, 말단] */
export const IK_CHAINS: Readonly<Record<IkChainId, readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName]>> = {
  leftArm: ["leftUpperArm", "leftLowerArm", "leftHand"],
  rightArm: ["rightUpperArm", "rightLowerArm", "rightHand"],
  leftLeg: ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
  rightLeg: ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
};

export const IK_CHAIN_IDS: readonly IkChainId[] = ["leftArm", "rightArm", "leftLeg", "rightLeg"];

export const POSE_SCOPES = ["full", "upper", "arms-hands", "lower", "left-hand", "right-hand"] as const;
export type PoseScope = (typeof POSE_SCOPES)[number];

export const POSE_SCOPE_LABELS_KO: Readonly<Record<PoseScope, string>> = {
  full: "전신",
  upper: "상체",
  "arms-hands": "팔·손",
  lower: "하체",
  "left-hand": "왼손",
  "right-hand": "오른손",
};

const TORSO_BONES: readonly HumanoidBoneName[] = ["spine", "chest", "upperChest", "neck", "head", "leftEye", "rightEye", "jaw"];
const ARM_BONES: readonly HumanoidBoneName[] = [
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
];
const LOWER_BONES: readonly HumanoidBoneName[] = [
  "hips",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
];

const SCOPE_BONES: Readonly<Record<PoseScope, readonly HumanoidBoneName[]>> = {
  full: HUMANOID_BONE_NAMES,
  upper: [...TORSO_BONES, ...ARM_BONES, ...FINGER_BONE_NAMES],
  "arms-hands": [...ARM_BONES, ...FINGER_BONE_NAMES],
  lower: LOWER_BONES,
  "left-hand": ["leftHand", ...LEFT_FINGER_BONE_NAMES],
  "right-hand": ["rightHand", ...RIGHT_FINGER_BONE_NAMES],
};

/** 스코프에 포함되는 본 목록(HUMANOID_BONE_NAMES 순서 유지) */
export function bonesInScope(scope: PoseScope): readonly HumanoidBoneName[] {
  if (scope === "full") return HUMANOID_BONE_NAMES;
  const allowed = new Set<HumanoidBoneName>(SCOPE_BONES[scope]);
  return HUMANOID_BONE_NAMES.filter((name) => allowed.has(name));
}

const BONE_SET: ReadonlySet<string> = new Set(HUMANOID_BONE_NAMES);

export function isHumanoidBoneName(value: string): value is HumanoidBoneName {
  return BONE_SET.has(value);
}

/** 본의 조상 목록(가까운 순, hips까지) */
export function boneAncestors(name: HumanoidBoneName): readonly HumanoidBoneName[] {
  const out: HumanoidBoneName[] = [];
  let cursor = HUMANOID_BONE_PARENTS[name];
  while (cursor !== null) {
    out.push(cursor);
    cursor = HUMANOID_BONE_PARENTS[cursor];
  }
  return out;
}

export interface JointLimit {
  /** 부모 축 기준 최대 스윙 각(도) */
  readonly swing: number;
  /** 본 축 기준 최대 트위스트 각(도) */
  readonly twist: number;
}

function limits(swing: number, twist: number): JointLimit {
  return { swing, twist };
}

const FINGER_LIMIT = limits(95, 10);

/** 관절 드래그 클램프 한계(도). 손가락은 전부 같은 값. */
export const JOINT_LIMITS_DEG: Readonly<Record<HumanoidBoneName, JointLimit>> = {
  hips: limits(180, 180),
  spine: limits(35, 30),
  chest: limits(25, 25),
  upperChest: limits(20, 20),
  neck: limits(40, 45),
  head: limits(45, 70),
  leftEye: limits(25, 0),
  rightEye: limits(25, 0),
  jaw: limits(30, 0),
  leftUpperLeg: limits(120, 45),
  leftLowerLeg: limits(150, 10),
  leftFoot: limits(50, 25),
  leftToes: limits(40, 0),
  rightUpperLeg: limits(120, 45),
  rightLowerLeg: limits(150, 10),
  rightFoot: limits(50, 25),
  rightToes: limits(40, 0),
  leftShoulder: limits(25, 10),
  leftUpperArm: limits(160, 80),
  leftLowerArm: limits(150, 90),
  leftHand: limits(80, 40),
  leftThumbMetacarpal: FINGER_LIMIT,
  leftThumbProximal: FINGER_LIMIT,
  leftThumbDistal: FINGER_LIMIT,
  leftIndexProximal: FINGER_LIMIT,
  leftIndexIntermediate: FINGER_LIMIT,
  leftIndexDistal: FINGER_LIMIT,
  leftMiddleProximal: FINGER_LIMIT,
  leftMiddleIntermediate: FINGER_LIMIT,
  leftMiddleDistal: FINGER_LIMIT,
  leftRingProximal: FINGER_LIMIT,
  leftRingIntermediate: FINGER_LIMIT,
  leftRingDistal: FINGER_LIMIT,
  leftLittleProximal: FINGER_LIMIT,
  leftLittleIntermediate: FINGER_LIMIT,
  leftLittleDistal: FINGER_LIMIT,
  rightShoulder: limits(25, 10),
  rightUpperArm: limits(160, 80),
  rightLowerArm: limits(150, 90),
  rightHand: limits(80, 40),
  rightThumbMetacarpal: FINGER_LIMIT,
  rightThumbProximal: FINGER_LIMIT,
  rightThumbDistal: FINGER_LIMIT,
  rightIndexProximal: FINGER_LIMIT,
  rightIndexIntermediate: FINGER_LIMIT,
  rightIndexDistal: FINGER_LIMIT,
  rightMiddleProximal: FINGER_LIMIT,
  rightMiddleIntermediate: FINGER_LIMIT,
  rightMiddleDistal: FINGER_LIMIT,
  rightRingProximal: FINGER_LIMIT,
  rightRingIntermediate: FINGER_LIMIT,
  rightRingDistal: FINGER_LIMIT,
  rightLittleProximal: FINGER_LIMIT,
  rightLittleIntermediate: FINGER_LIMIT,
  rightLittleDistal: FINGER_LIMIT,
};
