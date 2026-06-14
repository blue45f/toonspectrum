// VRM 포즈·표정 프리셋 확장 팩 — 코미Po!(ComiPo!)식 "원클릭 포즈/표정 갈아끼우기".
// StudioVrmPoser의 PoseBoneMap/applyPoseToVrm·applyExpressionWeightsToVrm 규약과 구조적으로 호환:
//  - rotation: 정규화 본의 오일러 회전(라디안). 코어(hips/spine/chest/neck/head)·말단(hand/foot)에 사용.
//  - direction: 사지(팔다리) 월드 방향 타깃. sideX는 좌우 대칭 자동 처리(양수 = 몸 바깥쪽).
// 외부 에셋 없음 — 순수 데이터 모듈.

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export type PoseVec3 = readonly [number, number, number];
export type PoseSideAwareDirection = { sideX: number; y: number; z?: number };
export type PoseDirectionTarget = PoseVec3 | PoseSideAwareDirection;
export type PoseBoneSpec = { direction?: PoseDirectionTarget; rotation?: PoseVec3 };
export type PoseBoneMapSpec = Partial<Record<VRMHumanBoneName, PoseBoneSpec>>;

export interface StudioPosePreset {
  id: string;
  label: string;
  tone: string;
  yOffset?: number;
  bones: PoseBoneMapSpec;
}

export interface StudioExpressionPreset {
  id: string;
  label: string;
  emoji: string;
  tone: string;
  // VRM 표준 표정(blendshape) 이름 → 가중치(0~1) 조합
  weights: Record<string, number>;
}

// 포저(applyPoseToVrm)가 손가락 회전(오일러)으로 적용하는 본 — 모델에 없으면 안전하게 무시된다.
export const POSER_FINGER_BONES: readonly VRMHumanBoneName[] = [
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
];

// 포저(applyPoseToVrm)가 실제로 적용하는 본 집합 — 테스트에서 본 이름 검증에 사용.
export const POSER_KNOWN_BONES: readonly VRMHumanBoneName[] = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
  ...POSER_FINGER_BONES,
];

// VRM 1.0 표준 프리셋 표정 이름(+표준 시선) — 표정 프리셋 가중치 키 검증용.
export const VRM_STANDARD_EXPRESSIONS: readonly string[] = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "blinkLeft",
  "blinkRight",
  "lookUp",
  "lookDown",
  "lookLeft",
  "lookRight",
];

const d = (deg: number) => (deg * Math.PI) / 180;

function aim(sideX: number, y: number, z = 0): PoseBoneSpec {
  return { direction: { sideX, y, z } };
}

function rotate(rotation: PoseVec3): PoseBoneSpec {
  return { rotation };
}

// 자연스러운 기본 사지(차렷보다 살짝 이완) — 코어만 덮어쓰면 되는 베이스.
const BASE_LIMBS: PoseBoneMapSpec = {
  leftUpperArm: aim(0.35, -0.94),
  rightUpperArm: aim(0.35, -0.94),
  leftLowerArm: aim(0.2, -0.98),
  rightLowerArm: aim(0.2, -0.98),
  leftHand: rotate([0, 0, d(2)]),
  rightHand: rotate([0, 0, d(-2)]),
  leftUpperLeg: aim(0.08, -1),
  rightUpperLeg: aim(0.08, -1),
  leftLowerLeg: aim(0.03, -1),
  rightLowerLeg: aim(0.03, -1),
  leftFoot: rotate([0, 0, 0]),
  rightFoot: rotate([0, 0, 0]),
};

function basePose(core: PoseBoneMapSpec = {}): PoseBoneMapSpec {
  return { ...BASE_LIMBS, ...core };
}

// ── 자연 아이들(스폰 기본) 포즈 ─────────────────────────────────────────
// 새 VRM 캐릭터를 추가하면 T-포즈 대신 아래 포즈 중 하나가 캐릭터 id 해시로
// 결정적으로 선택·적용된다(같은 캐릭터 = 항상 같은 포즈, Math.random 금지).
// 설계 원칙: 컨트라포스토 체중이동(골반 2~4° 기울임 + 어깨/척추 카운터 회전),
// 팔꿈치 10~18° 이완, 어깨 내림 3~5°, 손목 안쪽 5~8°, 머리 2~4° 기울임, 좌우 비대칭.

// 손가락 릴랙스 범위(도) — 자연스럽게 살짝 굽힘.
export const RELAXED_FINGER_CURL_MIN_DEG = 12;
export const RELAXED_FINGER_CURL_MAX_DEG = 25;

const FINGER_SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;
const FINGER_NAMES = ["Index", "Middle", "Ring", "Little"] as const;
// 검지→새끼로 갈수록 살짝 더 말리는 자연스러운 캐스케이드.
const FINGER_CURL_PROFILE: Record<(typeof FINGER_NAMES)[number], number> = { Index: 0.9, Middle: 1, Ring: 1.06, Little: 1.12 };
const SEGMENT_CURL_PROFILE: Record<(typeof FINGER_SEGMENTS)[number], number> = { Proximal: 1, Intermediate: 1.18, Distal: 0.82 };

function clampDeg(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// 정규화 본 규약: 손바닥 쪽 굽힘은 왼손 -z / 오른손 +z 회전. 엄지는 과굽힘 없이 안쪽으로만 살짝.
export function relaxedFingers(leftCurlDeg: number, rightCurlDeg: number): PoseBoneMapSpec {
  const bones: PoseBoneMapSpec = {};

  (["left", "right"] as const).forEach((side) => {
    const baseDeg = side === "left" ? leftCurlDeg : rightCurlDeg;
    const sign = side === "left" ? -1 : 1;

    FINGER_NAMES.forEach((finger) => {
      FINGER_SEGMENTS.forEach((segment) => {
        const curlDeg = clampDeg(baseDeg * FINGER_CURL_PROFILE[finger] * SEGMENT_CURL_PROFILE[segment], RELAXED_FINGER_CURL_MIN_DEG, RELAXED_FINGER_CURL_MAX_DEG);
        bones[`${side}${finger}${segment}` as VRMHumanBoneName] = rotate([0, 0, sign * d(curlDeg)]);
      });
    });

    bones[`${side}ThumbMetacarpal` as VRMHumanBoneName] = rotate([0, sign * d(baseDeg * 0.35), sign * d(baseDeg * 0.2)]);
    bones[`${side}ThumbProximal` as VRMHumanBoneName] = rotate([0, sign * d(baseDeg * 0.3), sign * d(baseDeg * 0.25)]);
    bones[`${side}ThumbDistal` as VRMHumanBoneName] = rotate([0, sign * d(baseDeg * 0.25), 0]);
  });

  return bones;
}

function idlePose(core: PoseBoneMapSpec, leftCurlDeg: number, rightCurlDeg: number): PoseBoneMapSpec {
  return { ...BASE_LIMBS, ...relaxedFingers(leftCurlDeg, rightCurlDeg), ...core };
}

export const NATURAL_IDLE_POSES: StudioPosePreset[] = [
  {
    id: "ni_weight_left",
    label: "자연 대기 A",
    tone: "왼발 체중 컨트라포스토",
    bones: idlePose(
      {
        hips: rotate([0, d(2), d(3)]),
        spine: rotate([d(1), d(-1), d(-2)]),
        chest: rotate([d(-1), d(-2), d(-1)]),
        neck: rotate([0, d(2), d(-1)]),
        head: rotate([d(1), d(-3), d(2.5)]),
        leftShoulder: rotate([0, 0, d(-4.5)]),
        rightShoulder: rotate([0, 0, d(3)]),
        leftUpperArm: aim(0.3, -0.95, -0.03),
        rightUpperArm: aim(0.36, -0.94, 0.05),
        leftLowerArm: aim(0.16, -0.96, 0.2),
        rightLowerArm: aim(0.2, -0.94, 0.28),
        leftHand: rotate([d(2), d(3), d(6)]),
        rightHand: rotate([d(1), d(-4), d(-7.5)]),
        leftUpperLeg: aim(0.05, -1, -0.01),
        rightUpperLeg: aim(0.14, -0.98, 0.12),
        leftLowerLeg: aim(0.02, -1, 0.01),
        rightLowerLeg: aim(0.06, -0.97, -0.16),
        leftFoot: rotate([0, d(-2), 0]),
        rightFoot: rotate([d(2), d(8), d(-1)]),
      },
      16,
      19
    ),
  },
  {
    id: "ni_weight_right",
    label: "자연 대기 B",
    tone: "오른발 체중 컨트라포스토",
    bones: idlePose(
      {
        hips: rotate([d(1), d(-3), d(-2.5)]),
        spine: rotate([0, d(2), d(1.5)]),
        chest: rotate([d(-2), d(1), d(1)]),
        neck: rotate([d(1), d(-2), d(1)]),
        head: rotate([d(-1), d(4), d(-3)]),
        leftShoulder: rotate([0, 0, d(-3)]),
        rightShoulder: rotate([0, 0, d(4.5)]),
        leftUpperArm: aim(0.37, -0.93, 0.06),
        rightUpperArm: aim(0.31, -0.95, -0.02),
        leftLowerArm: aim(0.21, -0.93, 0.3),
        rightLowerArm: aim(0.15, -0.97, 0.18),
        leftHand: rotate([d(1), d(4), d(7)]),
        rightHand: rotate([d(2), d(-3), d(-5.5)]),
        leftUpperLeg: aim(0.15, -0.97, 0.1),
        rightUpperLeg: aim(0.04, -1, 0),
        leftLowerLeg: aim(0.05, -0.96, -0.18),
        rightLowerLeg: aim(0.02, -1, 0.02),
        leftFoot: rotate([d(1), d(9), 0]),
        rightFoot: rotate([0, d(-3), d(1)]),
      },
      20,
      15
    ),
  },
  {
    id: "ni_calm_front",
    label: "자연 대기 C",
    tone: "손 모은 차분한 대기",
    bones: idlePose(
      {
        hips: rotate([d(1), d(1), d(2)]),
        spine: rotate([d(2), 0, d(-1)]),
        chest: rotate([d(1), d(-1), d(-1)]),
        neck: rotate([d(2), d(1), 0]),
        head: rotate([d(2), d(2), d(2)]),
        leftShoulder: rotate([0, d(2), d(-3.5)]),
        rightShoulder: rotate([0, d(-2), d(4)]),
        leftUpperArm: aim(0.22, -0.9, 0.16),
        rightUpperArm: aim(0.25, -0.88, 0.2),
        leftLowerArm: aim(0.02, -0.88, 0.34),
        rightLowerArm: aim(0.02, -0.87, 0.34),
        leftHand: rotate([d(3), d(5), d(7)]),
        rightHand: rotate([d(4), d(-6), d(-8)]),
        leftUpperLeg: aim(0.07, -1, 0.01),
        rightUpperLeg: aim(0.1, -0.99, 0.05),
        leftLowerLeg: aim(0.03, -0.99, -0.05),
        rightLowerLeg: aim(0.04, -0.98, -0.1),
        leftFoot: rotate([0, d(3), 0]),
        rightFoot: rotate([d(1), d(-6), 0]),
      },
      22,
      24
    ),
  },
  {
    id: "ni_open_easy",
    label: "자연 대기 D",
    tone: "가슴 연 여유로운 대기",
    bones: idlePose(
      {
        hips: rotate([d(-1), d(4), d(-3.5)]),
        spine: rotate([d(-2), d(-2), d(2)]),
        chest: rotate([d(-2), d(-1), d(1.5)]),
        neck: rotate([0, d(2), d(-1)]),
        head: rotate([d(-2), d(3), d(-2)]),
        leftShoulder: rotate([0, 0, d(-3)]),
        rightShoulder: rotate([0, d(-1), d(3.5)]),
        leftUpperArm: aim(0.4, -0.92, -0.06),
        rightUpperArm: aim(0.34, -0.94, 0.04),
        leftLowerArm: aim(0.24, -0.95, 0.16),
        rightLowerArm: aim(0.17, -0.95, 0.25),
        leftHand: rotate([0, d(3), d(5)]),
        rightHand: rotate([d(2), d(-5), d(-6)]),
        leftUpperLeg: aim(0.13, -0.98, -0.06),
        rightUpperLeg: aim(0.05, -1, 0.02),
        leftLowerLeg: aim(0.05, -0.99, -0.08),
        rightLowerLeg: aim(0.02, -1, 0),
        leftFoot: rotate([0, d(7), d(-1)]),
        rightFoot: rotate([0, d(-2), 0]),
      },
      14,
      17
    ),
  },
];

// djb2 해시 — 캐릭터 id로 아이들 포즈를 결정적으로 고른다.
export function naturalIdleSeed(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

export function pickNaturalIdlePose(characterId: string): StudioPosePreset {
  return NATURAL_IDLE_POSES[naturalIdleSeed(characterId) % NATURAL_IDLE_POSES.length];
}

// ── 포즈 프리셋 22종 (기본 제공 포즈와 id가 겹치지 않도록 xp_ 접두) ──────
export const EXTRA_POSE_PRESETS: StudioPosePreset[] = [
  {
    id: "xp_idle_relax",
    label: "서있기(휴식)",
    tone: "힘 뺀 기본 대기",
    bones: basePose({
      hips: rotate([0, 0, d(2)]),
      spine: rotate([d(1), 0, d(-2)]),
      chest: rotate([d(-1), 0, d(-1)]),
      head: rotate([d(1), 0, d(2)]),
      leftUpperLeg: aim(0.16, -0.99),
      rightUpperLeg: aim(0.05, -1),
    }),
  },
  {
    id: "xp_hands_on_hips",
    label: "양손 허리",
    tone: "자신만만 스탠딩",
    bones: basePose({
      hips: rotate([0, d(2), d(1.5)]),
      spine: rotate([d(-3), d(-1), d(-1)]),
      chest: rotate([d(-4), d(-1), d(-0.5)]),
      head: rotate([d(-2), d(2), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-2)]),
      rightShoulder: rotate([0, 0, d(3)]),
      leftUpperArm: aim(0.76, -0.57, 0.08),
      leftLowerArm: aim(-0.74, -0.58, 0.2),
      leftHand: rotate([0, d(14), d(11)]),
      rightUpperArm: aim(0.8, -0.53, 0.12),
      rightLowerArm: aim(-0.7, -0.62, 0.16),
      rightHand: rotate([0, d(-17), d(-9)]),
    }),
  },
  {
    id: "xp_one_hand_hip",
    label: "한손 허리",
    tone: "여유로운 포즈",
    bones: basePose({
      hips: rotate([0, 0, d(3)]),
      spine: rotate([d(-2), 0, d(-3)]),
      chest: rotate([d(-2), 0, d(-1)]),
      head: rotate([0, d(4), d(3)]),
      rightUpperArm: aim(0.75, -0.58, 0.1),
      rightLowerArm: aim(-0.7, -0.62, 0.18),
      rightHand: rotate([0, d(-15), d(-10)]),
    }),
  },
  {
    id: "xp_sprint",
    label: "전력 질주",
    tone: "역동적인 대시",
    yOffset: -0.04,
    bones: basePose({
      hips: rotate([d(-14), d(-6), 0]),
      spine: rotate([d(16), d(5), 0]),
      chest: rotate([d(4), d(3), 0]),
      head: rotate([d(-8), d(-5), 0]),
      leftUpperArm: aim(0.28, -0.42, -0.86),
      leftLowerArm: aim(0.15, 0.2, -0.95),
      rightUpperArm: aim(0.28, -0.3, 0.92),
      rightLowerArm: aim(0.15, 0.35, 0.9),
      leftUpperLeg: aim(0.08, -0.2, 0.97),
      leftLowerLeg: aim(0.03, -0.75, 0.65),
      rightUpperLeg: aim(0.08, -0.45, -0.88),
      rightLowerLeg: aim(0.03, -0.6, -0.78),
    }),
  },
  {
    id: "xp_chair_sit",
    label: "의자 앉기",
    tone: "바른 자세 착석",
    yOffset: -0.12,
    bones: basePose({
      hips: rotate([d(-6), d(2), d(1)]),
      spine: rotate([d(6), d(-1), d(-1)]),
      chest: rotate([d(1), d(-1), 0]),
      head: rotate([d(-1), d(3), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3)]),
      rightShoulder: rotate([0, 0, d(3.5)]),
      leftUpperLeg: aim(0.17, -0.19, 0.96),
      rightUpperLeg: aim(0.12, -0.22, 0.97),
      leftLowerLeg: aim(0.07, -0.9, -0.4),
      rightLowerLeg: aim(0.04, -0.93, -0.33),
      leftUpperArm: aim(0.28, -0.82, 0.38),
      rightUpperArm: aim(0.33, -0.78, 0.42),
      leftLowerArm: aim(0.06, -0.74, 0.66),
      rightLowerArm: aim(0.1, -0.7, 0.7),
      leftFoot: rotate([d(-6), d(-3), 0]),
      rightFoot: rotate([d(-5), d(4), 0]),
    }),
  },
  {
    id: "xp_kneel",
    label: "무릎 꿇기",
    tone: "정중한 자세",
    yOffset: -0.42,
    bones: basePose({
      hips: rotate([d(4), d(-2), d(1)]),
      spine: rotate([d(2), d(1), d(-1)]),
      head: rotate([d(2), d(-2), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3)]),
      rightShoulder: rotate([0, 0, d(2.5)]),
      leftUpperLeg: aim(0.14, -0.84, -0.51),
      rightUpperLeg: aim(0.11, -0.86, -0.49),
      leftLowerLeg: aim(0.06, -0.24, -0.96),
      rightLowerLeg: aim(0.04, -0.26, -0.95),
      leftUpperArm: aim(0.28, -0.93, 0.18),
      rightUpperArm: aim(0.32, -0.91, 0.23),
      leftLowerArm: aim(0.08, -0.96, 0.26),
      rightLowerArm: aim(0.12, -0.94, 0.3),
      leftFoot: rotate([d(35), d(2), 0]),
      rightFoot: rotate([d(33), d(-2), 0]),
    }),
  },
  {
    id: "xp_finger_heart",
    label: "손하트",
    tone: "팬서비스 컷",
    bones: basePose({
      spine: rotate([0, 0, d(-3)]),
      head: rotate([d(2), d(-5), d(-8)]),
      rightUpperArm: aim(0.42, 0.12, 0.5),
      rightLowerArm: aim(-0.4, 0.72, 0.5),
      rightHand: rotate([d(10), d(-20), d(-12)]),
    }),
  },
  {
    id: "xp_double_v",
    label: "양손 브이",
    tone: "신난 셀카 포즈",
    bones: basePose({
      chest: rotate([d(-3), 0, 0]),
      head: rotate([d(-2), 0, d(6)]),
      leftUpperArm: aim(0.6, 0.12, 0.4),
      leftLowerArm: aim(0.2, 0.85, 0.42),
      leftHand: rotate([d(-10), 0, d(12)]),
      rightUpperArm: aim(0.6, 0.12, 0.4),
      rightLowerArm: aim(0.2, 0.85, 0.42),
      rightHand: rotate([d(-10), 0, d(-12)]),
    }),
  },
  {
    id: "xp_point_you",
    label: "지목(삿대질)",
    tone: "\"바로 너!\" 컷",
    bones: basePose({
      hips: rotate([d(-3), d(-5), 0]),
      spine: rotate([d(6), d(4), 0]),
      chest: rotate([d(3), d(3), 0]),
      head: rotate([d(-3), d(-4), 0]),
      rightUpperArm: aim(0.22, 0.05, 0.97),
      rightLowerArm: aim(0.12, 0.02, 0.99),
      rightHand: rotate([0, 0, d(-5)]),
      leftUpperArm: aim(0.4, -0.9, -0.1),
    }),
  },
  {
    id: "xp_shock_hands",
    label: "놀람 양손",
    tone: "\"헉!\" 리액션",
    bones: basePose({
      hips: rotate([d(3), d(-2), 0]),
      spine: rotate([d(-6), d(1), d(-1)]),
      chest: rotate([d(-5), d(1), 0]),
      head: rotate([d(-7), d(-2), d(1)]),
      leftUpperArm: aim(0.74, 0.2, 0.3),
      leftLowerArm: aim(0.3, 0.8, 0.4),
      leftHand: rotate([d(-18), d(2), d(12)]),
      rightUpperArm: aim(0.7, 0.15, 0.35),
      rightLowerArm: aim(0.26, 0.84, 0.36),
      rightHand: rotate([d(-23), d(-2), d(-9)]),
      leftUpperLeg: aim(0.12, -0.96, -0.22),
    }),
  },
  {
    id: "xp_teary",
    label: "울먹임",
    tone: "눈물 그렁그렁",
    bones: basePose({
      spine: rotate([d(8), d(-1), d(1)]),
      chest: rotate([d(5), d(-1), d(-1)]),
      neck: rotate([d(7), d(1), 0]),
      head: rotate([d(7), d(2), d(3)]),
      leftShoulder: rotate([0, 0, d(-4)]),
      rightShoulder: rotate([0, 0, d(3)]),
      leftUpperArm: aim(0.18, -0.4, 0.6),
      leftLowerArm: aim(-0.28, 0.78, 0.48),
      leftHand: rotate([d(13), d(2), d(9)]),
      rightUpperArm: aim(0.14, -0.44, 0.64),
      rightLowerArm: aim(-0.32, 0.74, 0.52),
      rightHand: rotate([d(17), d(-2), d(-7)]),
    }),
  },
  {
    id: "xp_banzai",
    label: "만세",
    tone: "두 팔 번쩍",
    bones: basePose({
      hips: rotate([d(2), 0, 0]),
      spine: rotate([d(-5), 0, 0]),
      chest: rotate([d(-4), 0, 0]),
      head: rotate([d(-6), 0, 0]),
      leftUpperArm: aim(0.3, 0.92, 0.14),
      leftLowerArm: aim(0.14, 0.98, 0.06),
      leftHand: rotate([0, 0, d(8)]),
      rightUpperArm: aim(0.3, 0.92, 0.14),
      rightLowerArm: aim(0.14, 0.98, 0.06),
      rightHand: rotate([0, 0, d(-8)]),
    }),
  },
  {
    id: "xp_guard_up",
    label: "싸움 자세(가드)",
    tone: "주먹 들고 대비",
    yOffset: -0.05,
    bones: basePose({
      hips: rotate([d(-5), d(-10), 0]),
      spine: rotate([d(6), d(8), 0]),
      chest: rotate([d(2), d(5), 0]),
      head: rotate([d(-3), d(-9), 0]),
      leftUpperArm: aim(0.42, -0.08, 0.66),
      leftLowerArm: aim(-0.2, 0.7, 0.6),
      leftHand: rotate([d(-23), d(3), d(12)]),
      rightUpperArm: aim(0.38, -0.16, 0.58),
      rightLowerArm: aim(-0.24, 0.66, 0.64),
      rightHand: rotate([d(-27), d(-3), d(-9)]),
      leftUpperLeg: aim(0.14, -0.72, 0.66),
      rightUpperLeg: aim(0.14, -0.86, -0.48),
      leftLowerLeg: aim(0.04, -0.95, 0.3),
      rightLowerLeg: aim(0.04, -0.92, -0.36),
    }),
  },
  {
    id: "xp_shrug",
    label: "어깨 으쓱",
    tone: "\"몰라~\" 제스처",
    bones: basePose({
      spine: rotate([d(-2), d(1), d(-1)]),
      head: rotate([d(2), d(-2), d(8)]),
      leftShoulder: rotate([0, 0, d(4)]),
      rightShoulder: rotate([0, 0, d(-3)]),
      leftUpperArm: aim(0.84, -0.4, 0.16),
      leftLowerArm: aim(0.74, 0.43, 0.32),
      leftHand: rotate([d(-58), d(2), d(16)]),
      rightUpperArm: aim(0.8, -0.44, 0.2),
      rightLowerArm: aim(0.7, 0.47, 0.28),
      rightHand: rotate([d(-62), d(-2), d(-14)]),
    }),
  },
  {
    id: "xp_phone_look",
    label: "스마트폰 보기",
    tone: "폰 보며 딴청",
    bones: basePose({
      spine: rotate([d(6), 0, 0]),
      chest: rotate([d(4), 0, 0]),
      neck: rotate([d(10), 0, 0]),
      head: rotate([d(10), 0, 0]),
      rightUpperArm: aim(0.28, -0.5, 0.65),
      rightLowerArm: aim(-0.45, 0.4, 0.78),
      rightHand: rotate([d(20), d(-15), 0]),
      leftUpperArm: aim(0.3, -0.62, 0.5),
      leftLowerArm: aim(-0.4, 0.25, 0.85),
      leftHand: rotate([d(20), d(15), 0]),
    }),
  },
  {
    id: "xp_chin_rest",
    label: "턱 괴기",
    tone: "골똘한 생각",
    bones: basePose({
      spine: rotate([d(7), 0, d(2)]),
      chest: rotate([d(4), 0, 0]),
      neck: rotate([d(4), 0, 0]),
      head: rotate([d(3), d(6), d(8)]),
      rightUpperArm: aim(0.2, -0.45, 0.74),
      rightLowerArm: aim(-0.32, 0.86, 0.36),
      rightHand: rotate([d(-15), d(-20), d(-10)]),
      leftUpperArm: aim(0.32, -0.88, 0.3),
      leftLowerArm: aim(-0.5, -0.55, 0.62),
    }),
  },
  {
    id: "xp_polite_bow",
    label: "인사 꾸벅",
    tone: "공손한 목례",
    yOffset: -0.02,
    bones: basePose({
      hips: rotate([d(8), 0, 0]),
      spine: rotate([d(22), 0, 0]),
      chest: rotate([d(14), 0, 0]),
      neck: rotate([d(10), 0, 0]),
      head: rotate([d(8), 0, 0]),
      leftUpperArm: aim(0.2, -0.94, 0.26),
      rightUpperArm: aim(0.2, -0.94, 0.26),
      leftLowerArm: aim(0.08, -0.96, 0.22),
      rightLowerArm: aim(0.08, -0.96, 0.22),
    }),
  },
  {
    id: "xp_jump_joy",
    label: "신나는 점프",
    tone: "공중에서 환호",
    yOffset: 0.16,
    bones: basePose({
      hips: rotate([d(-6), 0, 0]),
      spine: rotate([d(-4), 0, d(3)]),
      chest: rotate([d(4), 0, 0]),
      head: rotate([d(-7), 0, d(-4)]),
      leftUpperArm: aim(0.65, 0.74, 0.12),
      leftLowerArm: aim(0.32, 0.93, 0.1),
      rightUpperArm: aim(0.58, 0.78, 0.08),
      rightLowerArm: aim(0.27, 0.95, 0.06),
      leftUpperLeg: aim(0.1, -0.5, 0.86),
      leftLowerLeg: aim(0.05, -0.8, -0.58),
      rightUpperLeg: aim(0.12, -0.92, 0.12),
      rightLowerLeg: aim(0.05, -0.55, -0.82),
      leftFoot: rotate([d(-20), 0, 0]),
      rightFoot: rotate([d(-18), 0, 0]),
    }),
  },
  {
    id: "xp_look_back",
    label: "뒤돌아보기",
    tone: "어깨 너머 시선",
    bones: basePose({
      hips: rotate([0, d(-8), 0]),
      spine: rotate([d(2), d(-20), 0]),
      chest: rotate([d(1), d(-18), 0]),
      neck: rotate([0, d(-11), 0]),
      head: rotate([0, d(-11), d(-3)]),
      rightUpperArm: aim(0.4, -0.9, -0.15),
      leftUpperArm: aim(0.35, -0.92, 0.1),
    }),
  },
  {
    id: "xp_lying_down",
    label: "누워있기",
    tone: "바닥에 벌렁",
    yOffset: -0.55,
    bones: basePose({
      hips: rotate([d(-85), 0, 0]),
      spine: rotate([d(2), d(-1), 0]),
      chest: rotate([d(1), d(1), 0]),
      neck: rotate([d(6), d(-1), 0]),
      head: rotate([d(6), d(3), d(2)]),
      leftUpperArm: aim(0.55, -0.15, -0.5),
      rightUpperArm: aim(0.45, -0.22, -0.6),
      leftLowerArm: aim(0.34, -0.08, -0.66),
      rightLowerArm: aim(0.26, -0.12, -0.74),
      leftUpperLeg: aim(0.15, -0.1, 0.94),
      rightUpperLeg: aim(0.1, -0.14, 0.96),
      leftLowerLeg: aim(0.07, -0.16, 0.93),
      rightLowerLeg: aim(0.04, -0.2, 0.91),
    }),
  },
  {
    id: "xp_hands_behind",
    label: "뒷짐",
    tone: "느긋한 산책",
    bones: basePose({
      spine: rotate([d(-3), d(-1), 0]),
      chest: rotate([d(-4), d(1), 0]),
      head: rotate([d(-2), d(2), d(1)]),
      leftShoulder: rotate([0, 0, d(-2.5)]),
      rightShoulder: rotate([0, 0, d(2)]),
      leftUpperArm: aim(0.26, -0.8, -0.44),
      leftLowerArm: aim(-0.53, -0.52, -0.53),
      rightUpperArm: aim(0.22, -0.84, -0.4),
      rightLowerArm: aim(-0.57, -0.48, -0.57),
    }),
  },
  {
    id: "xp_propose_kneel",
    label: "한쪽 무릎(프로포즈)",
    tone: "극적인 고백 컷",
    yOffset: -0.3,
    bones: basePose({
      hips: rotate([d(2), 0, 0]),
      spine: rotate([d(4), 0, 0]),
      head: rotate([d(-3), 0, 0]),
      rightUpperLeg: aim(0.12, -0.8, -0.55),
      rightLowerLeg: aim(0.05, -0.3, -0.93),
      leftUpperLeg: aim(0.12, -0.45, 0.87),
      leftLowerLeg: aim(0.05, -0.95, -0.2),
      rightUpperArm: aim(0.25, -0.2, 0.9),
      rightLowerArm: aim(0.1, 0.05, 0.97),
      rightHand: rotate([d(-30), 0, 0]),
      leftUpperArm: aim(0.35, -0.9, 0.1),
      rightFoot: rotate([d(30), 0, 0]),
    }),
  },
];

// ── 표정 프리셋 14종 — VRM 표준 표정 가중치 "조합"을 원클릭 적용 ─────────
export const EXPRESSION_PRESETS: StudioExpressionPreset[] = [
  { id: "xf_joy", label: "기쁨", emoji: "😊", tone: "밝은 미소", weights: { happy: 1 } },
  { id: "xf_grin", label: "활짝웃음", emoji: "😆", tone: "눈웃음 + 함박", weights: { happy: 1, blink: 1, aa: 0.3 } },
  { id: "xf_sad", label: "슬픔", emoji: "😢", tone: "축 처진 표정", weights: { sad: 1 } },
  { id: "xf_tears", label: "눈물", emoji: "😭", tone: "울음 직전", weights: { sad: 1, blink: 0.55, ou: 0.3 } },
  { id: "xf_angry", label: "분노", emoji: "😠", tone: "정색 화남", weights: { angry: 1 } },
  { id: "xf_grudge", label: "킹받음", emoji: "😤", tone: "웃는데 화남", weights: { angry: 0.7, happy: 0.4, ih: 0.35 } },
  { id: "xf_surprised", label: "놀람", emoji: "😲", tone: "동공 지진", weights: { surprised: 1, oh: 0.55 } },
  { id: "xf_blank", label: "멍", emoji: "😶", tone: "넋 나간 얼굴", weights: { relaxed: 0.4, aa: 0.15, lookUp: 0.3 } },
  { id: "xf_shy", label: "부끄러움", emoji: "😳", tone: "시선 회피", weights: { happy: 0.4, sad: 0.25, lookDown: 0.6 } },
  { id: "xf_wink", label: "윙크", emoji: "😉", tone: "한쪽 눈 찡긋", weights: { happy: 0.7, blinkRight: 1, ih: 0.25 } },
  { id: "xf_sleepy", label: "졸림", emoji: "😪", tone: "반쯤 감긴 눈", weights: { relaxed: 0.8, blink: 0.8, aa: 0.2 } },
  { id: "xf_neutral", label: "무표정", emoji: "😐", tone: "표정 초기화", weights: {} },
  { id: "xf_determined", label: "결의", emoji: "😼", tone: "불타는 의지", weights: { angry: 0.45, happy: 0.3, ee: 0.4 } },
  { id: "xf_pout", label: "새침(삐짐)", emoji: "😗", tone: "입 삐죽", weights: { angry: 0.3, ou: 0.7, lookLeft: 0.3 } },
];
