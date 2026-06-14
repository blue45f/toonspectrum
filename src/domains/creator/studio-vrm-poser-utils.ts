import { type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";

export type Vec3 = readonly [number, number, number];
export type SideAwareDirection = {
  sideX: number;
  y: number;
  z?: number;
};
export type DirectionTarget = Vec3 | SideAwareDirection;
export type PoseBone = {
  direction?: DirectionTarget;
  rotation?: Vec3;
};
export type PoseBoneMap = Partial<Record<VRMHumanBoneName, PoseBone>>;

export type PosePreset = {
  id: string;
  label: string;
  tone: string;
  yOffset?: number;
  bones: PoseBoneMap;
};

export const d = THREE.MathUtils.degToRad;

function aim(sideX: number, y: number, z = 0): PoseBone {
  return { direction: { sideX, y, z } };
}

function rotate(rotation: Vec3): PoseBone {
  return { rotation };
}

const NATURAL_LIMBS: PoseBoneMap = {
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

function naturalPose(core: PoseBoneMap = {}) {
  return { ...NATURAL_LIMBS, ...core };
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: "default",
    label: "기본",
    tone: "편한 스탠딩",
    bones: naturalPose({
      hips: rotate([0, d(1), d(1.5)]),
      spine: rotate([d(1), d(-1), d(-1)]),
      chest: rotate([d(-1), d(-1), d(-0.5)]),
      neck: rotate([d(1), d(1), 0]),
      head: rotate([d(-1), d(-2), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3.5)]),
      rightShoulder: rotate([0, 0, d(3)]),
      leftUpperArm: aim(0.31, -0.95, -0.02),
      rightUpperArm: aim(0.37, -0.93, 0.04),
      leftLowerArm: aim(0.17, -0.97, 0.18),
      rightLowerArm: aim(0.21, -0.95, 0.24),
      leftHand: rotate([0, d(2), d(5)]),
      rightHand: rotate([0, d(-3), d(-6)]),
      leftUpperLeg: aim(0.06, -1, -0.01),
      rightUpperLeg: aim(0.11, -0.99, 0.06),
      leftLowerLeg: aim(0.02, -1, 0.01),
      rightLowerLeg: aim(0.05, -0.98, -0.09),
      leftFoot: rotate([0, d(-2), 0]),
      rightFoot: rotate([d(1), d(5), 0]),
    }),
  },
  {
    id: "wave",
    label: "손인사",
    tone: "반가운 손짓",
    bones: naturalPose({
      spine: rotate([d(-1), d(-2), 0]),
      chest: rotate([d(1), d(-3), 0]),
      head: rotate([d(-2), d(3), d(3)]),
      rightUpperArm: aim(0.48, 0.66, 0.08),
      rightLowerArm: aim(0.18, 0.96, 0.1),
      rightHand: rotate([0, 0, d(-15)]),
    }),
  },
  {
    id: "point",
    label: "대화",
    tone: "자연스러운 대화",
    bones: naturalPose({
      hips: rotate([0, d(-2), 0]),
      spine: rotate([d(-1), d(3), 0]),
      chest: rotate([d(1), d(4), 0]),
      head: rotate([d(-1), d(-4), 0]),
      rightUpperArm: aim(0.62, -0.12, 0.28),
      rightLowerArm: aim(0.3, 0.05, 0.95),
      rightHand: rotate([0, d(-10), d(-10)]),
    }),
  },
  {
    id: "cheer",
    label: "기쁨",
    tone: "만세 포즈",
    bones: naturalPose({
      hips: rotate([d(-1), 0, 0]),
      spine: rotate([d(-3), 0, 0]),
      chest: rotate([d(4), 0, 0]),
      head: rotate([d(-6), 0, 0]),
      leftUpperArm: aim(0.55, 0.83),
      leftLowerArm: aim(0.22, 0.97),
      rightUpperArm: aim(0.55, 0.83),
      rightLowerArm: aim(0.22, 0.97),
    }),
  },
  {
    id: "think",
    label: "생각",
    tone: "고민 컷",
    bones: naturalPose({
      hips: rotate([0, d(2), 0]),
      spine: rotate([d(3), d(-3), 0]),
      chest: rotate([d(1), d(-4), 0]),
      neck: rotate([d(1), d(3), 0]),
      head: rotate([d(6), d(-4), d(-4)]),
      rightUpperArm: aim(0.38, -0.25, 0.25),
      rightLowerArm: aim(-0.28, 0.55, 0.78),
      rightHand: rotate([d(15), d(10), d(-15)]),
    }),
  },
  {
    id: "sit",
    label: "앉기",
    tone: "낮은 자세",
    yOffset: -0.08,
    bones: naturalPose({
      hips: rotate([d(-4), d(2), d(1)]),
      spine: rotate([d(4), d(-1), d(-1)]),
      chest: rotate([d(-1), d(-1), 0]),
      head: rotate([d(-2), d(3), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3)]),
      rightShoulder: rotate([0, 0, d(2.5)]),
      leftUpperLeg: aim(0.15, -0.26, 0.95),
      rightUpperLeg: aim(0.1, -0.3, 0.94),
      leftLowerLeg: aim(0.07, -0.86, -0.48),
      rightLowerLeg: aim(0.04, -0.9, -0.42),
      leftFoot: rotate([d(-4), d(-2), d(1)]),
      rightFoot: rotate([d(-3), d(3), d(-1)]),
    }),
  },
  {
    id: "run",
    label: "걷기",
    tone: "한 걸음",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(-2), d(-3), 0]),
      spine: rotate([d(3), d(2), 0]),
      chest: rotate([d(-1), d(2), 0]),
      head: rotate([d(-2), d(-3), 0]),
      leftUpperArm: aim(0.32, -0.75, -0.55),
      leftLowerArm: aim(0.18, -0.85, -0.48),
      rightUpperArm: aim(0.32, -0.65, 0.68),
      rightLowerArm: aim(0.18, -0.8, 0.56),
      leftUpperLeg: aim(0.08, -0.55, 0.83),
      leftLowerLeg: aim(0.03, -0.96, 0.25),
      rightUpperLeg: aim(0.08, -0.72, -0.7),
      rightLowerLeg: aim(0.03, -0.9, 0.44),
    }),
  },
  {
    id: "present",
    label: "설명",
    tone: "차분한 안내",
    bones: naturalPose({
      hips: rotate([0, d(3), 0]),
      spine: rotate([d(-1), d(-3), 0]),
      chest: rotate([d(1), d(-4), 0]),
      head: rotate([d(-1), d(4), 0]),
      rightUpperArm: aim(0.48, -0.2, 0.55),
      rightLowerArm: aim(0.18, 0.05, 0.98),
      rightHand: rotate([0, d(-10), d(-10)]),
    }),
  },
  {
    id: "support",
    label: "응원",
    tone: "화이팅 응원",
    bones: naturalPose({
      hips: rotate([d(-1), d(-2), 0]),
      spine: rotate([d(-3), d(2), 0]),
      chest: rotate([d(4), d(2), 0]),
      head: rotate([d(-2), d(-1), 0]),
      leftUpperArm: aim(0.42, 0.9),
      leftLowerArm: aim(0.1, 0.99),
      leftHand: rotate([0, 0, d(10)]),
      rightUpperArm: aim(0.42, 0.9),
      rightLowerArm: aim(0.1, 0.99),
      rightHand: rotate([0, 0, d(-10)]),
    }),
  },
  {
    id: "despair",
    label: "낙담",
    tone: "차분한 저점",
    yOffset: -0.03,
    bones: naturalPose({
      hips: rotate([d(4), d(1), 0]),
      spine: rotate([d(8), d(-1), d(1)]),
      chest: rotate([d(6), 0, d(-1)]),
      neck: rotate([d(8), d(1), 0]),
      head: rotate([d(6), d(-2), d(2)]),
      leftShoulder: rotate([0, 0, d(-5)]),
      rightShoulder: rotate([0, 0, d(4)]),
      leftUpperArm: aim(0.3, -0.95, 0.08),
      rightUpperArm: aim(0.26, -0.96, 0.04),
      leftLowerArm: aim(0.14, -0.98, 0.06),
      rightLowerArm: aim(0.1, -0.99, 0.02),
      leftHand: rotate([d(5), d(2), d(3)]),
      rightHand: rotate([d(3), d(-1), d(-2)]),
    }),
  },
  {
    id: "attack",
    label: "준비",
    tone: "대치 상태",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-4), d(-6), 0]),
      spine: rotate([d(4), d(4), 0]),
      chest: rotate([d(-1), d(4), 0]),
      head: rotate([d(-3), d(-5), 0]),
      leftUpperArm: aim(0.52, 0.08, 0.58),
      leftLowerArm: aim(0.22, 0.13, 0.96),
      rightUpperArm: aim(0.48, 0.02, 0.52),
      rightLowerArm: aim(0.18, 0.07, 0.98),
      leftUpperLeg: aim(0.1, -0.7, 0.7),
      rightUpperLeg: aim(0.1, -0.82, -0.56),
    }),
  },
  {
    id: "defense",
    label: "방어",
    tone: "조심스러운 자세",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-3), d(4), 0]),
      spine: rotate([d(3), d(-4), 0]),
      chest: rotate([d(2), d(-5), 0]),
      head: rotate([d(-2), d(5), 0]),
      leftUpperArm: aim(0.6, 0.3, 0.33),
      leftLowerArm: aim(0.2, 0.72, 0.66),
      rightUpperArm: aim(0.56, 0.25, 0.38),
      rightLowerArm: aim(0.16, 0.68, 0.7),
      leftUpperLeg: aim(0.1, -0.88, 0.46),
      rightUpperLeg: aim(0.1, -0.9, -0.42),
    }),
  },
  {
    id: "peace",
    label: "브이",
    tone: "셀카 포즈",
    bones: naturalPose({
      hips: rotate([0, d(-4), 0]),
      spine: rotate([d(2), d(4), 0]),
      chest: rotate([d(-1), d(4), d(2)]),
      head: rotate([d(4), d(-8), d(-5)]),
      rightUpperArm: aim(0.4, 0.58, 0.35),
      rightLowerArm: aim(0.1, 0.82, 0.55),
      rightHand: rotate([0, 0, d(-15)]),
    }),
  },
  {
    id: "fist",
    label: "화이팅",
    tone: "결의 컷",
    bones: naturalPose({
      hips: rotate([d(-2), d(4), 0]),
      spine: rotate([d(-3), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      head: rotate([d(-3), d(-4), 0]),
      rightUpperArm: aim(0.35, 0.93, 0.05),
      rightLowerArm: aim(0.08, 0.99, 0.02),
      rightHand: rotate([0, 0, 0]),
    }),
  },
  {
    id: "flying",
    label: "비상",
    tone: "날아오르기",
    yOffset: 0.14,
    bones: naturalPose({
      hips: rotate([d(45), 0, 0]),
      spine: rotate([d(-12), 0, 0]),
      chest: rotate([d(-5), 0, 0]),
      head: rotate([d(-10), 0, 0]),
      leftUpperArm: aim(0.74, 0.53, -0.4),
      rightUpperArm: aim(0.7, 0.57, -0.44),
      leftLowerArm: aim(0.57, 0.7, -0.4),
      rightLowerArm: aim(0.53, 0.74, -0.44),
      leftUpperLeg: aim(0.13, -0.43, -0.89),
      rightUpperLeg: aim(0.11, -0.47, -0.87),
      leftLowerLeg: aim(0.07, -0.78, -0.62),
      rightLowerLeg: aim(0.05, -0.82, -0.58),
    }),
  },
  {
    id: "heart",
    label: "하트",
    tone: "볼하트 연출",
    bones: naturalPose({
      hips: rotate([0, d(3), 0]),
      spine: rotate([d(2), 0, 0]),
      chest: rotate([d(-2), 0, 0]),
      head: rotate([d(3), d(8), d(5)]),
      leftUpperArm: aim(0.38, 0.92),
      leftLowerArm: aim(-0.45, 0.8),
      leftHand: rotate([0, 0, d(15)]),
      rightUpperArm: aim(0.38, 0.92),
      rightLowerArm: aim(-0.45, 0.8),
      rightHand: rotate([0, 0, d(-10)]),
    }),
  },
  {
    id: "shy",
    label: "부끄럼",
    tone: "수줍은 자세",
    bones: naturalPose({
      spine: rotate([d(1), d(-2), 0]),
      head: rotate([d(8), d(3), d(5)]),
      leftShoulder: rotate([0, 0, d(-2)]),
      rightShoulder: rotate([0, 0, d(2.5)]),
      leftUpperArm: aim(-0.2, -0.56, 0.8),
      rightUpperArm: aim(-0.24, -0.6, 0.76),
      leftLowerArm: aim(-0.18, 0.15, 0.97),
      rightLowerArm: aim(-0.22, 0.09, 0.97),
    }),
  },
  {
    id: "arrogant",
    label: "팔짱",
    tone: "거만한 태도",
    bones: naturalPose({
      spine: rotate([d(-3), d(-1), 0]),
      chest: rotate([d(-2), d(1), 0]),
      head: rotate([d(-4), d(2), d(1.5)]),
      leftUpperArm: aim(-0.5, -0.22, 0.5),
      leftLowerArm: aim(-0.82, 0.2, 0.44),
      rightUpperArm: aim(-0.6, -0.18, 0.4),
      rightLowerArm: aim(-0.88, 0.15, 0.36),
    }),
  },
  {
    id: "shock",
    label: "깜짝",
    tone: "충격 유발",
    bones: naturalPose({
      spine: rotate([d(5), d(1), 0]),
      chest: rotate([d(4), d(-1), 0]),
      head: rotate([d(8), d(-2), d(1)]),
      leftUpperArm: aim(0.64, 0.54, 0.28),
      leftLowerArm: aim(0.24, 0.91, 0.3),
      leftHand: rotate([d(13), d(11), d(12)]),
      rightUpperArm: aim(0.6, 0.5, 0.33),
      rightLowerArm: aim(0.2, 0.93, 0.26),
      rightHand: rotate([d(17), d(-9), d(-8)]),
    }),
  },
  {
    id: "surrender",
    label: "항복",
    tone: "당황한 양손",
    bones: naturalPose({
      head: rotate([d(6), 0, 0]),
      leftUpperArm: aim(0.46, 0.88, 0.04),
      leftLowerArm: aim(0.14, 0.98, 0.02),
      rightUpperArm: aim(0.46, 0.88, 0.04),
      rightLowerArm: aim(0.14, 0.98, 0.02),
    }),
  },
  {
    id: "phone",
    label: "통화",
    tone: "전화 연출",
    bones: naturalPose({
      rightUpperArm: aim(0.36, -0.24, 0.34),
      rightLowerArm: aim(-0.18, 0.72, 0.66),
      rightHand: rotate([d(10), d(-15), d(-10)]),
    }),
  },
  {
    id: "salute",
    label: "경례",
    tone: "절제된 인사",
    bones: naturalPose({
      head: rotate([d(-2), d(-5), 0]),
      rightUpperArm: aim(0.45, 0.28, 0.35),
      rightLowerArm: aim(-0.45, 0.58, 0.68),
      rightHand: rotate([d(5), d(15), d(-15)]),
    }),
  },
  {
    id: "fighting",
    label: "격투",
    tone: "전투 준비 자세",
    yOffset: -0.03,
    bones: naturalPose({
      hips: rotate([d(-5), d(-10), 0]),
      spine: rotate([d(5), d(8), 0]),
      chest: rotate([d(-2), d(6), 0]),
      head: rotate([d(-4), d(-8), 0]),
      leftUpperArm: aim(0.55, 0.1, 0.6),
      leftLowerArm: aim(0.1, 0.45, 0.88),
      leftHand: rotate([d(10), 0, d(10)]),
      rightUpperArm: aim(0.5, -0.15, 0.55),
      rightLowerArm: aim(0.15, 0.5, 0.85),
      rightHand: rotate([d(10), 0, d(-10)]),
      leftUpperLeg: aim(0.15, -0.65, 0.75),
      rightUpperLeg: aim(0.1, -0.85, -0.52),
      leftLowerLeg: aim(0.05, -0.92, 0.38),
      rightLowerLeg: aim(0.03, -0.95, -0.3),
    }),
  },
  {
    id: "thinking",
    label: "생각중",
    tone: "턱을 괴고 생각",
    bones: naturalPose({
      hips: rotate([0, d(5), 0]),
      spine: rotate([d(4), d(-5), 0]),
      chest: rotate([d(2), d(-4), 0]),
      neck: rotate([d(2), d(4), 0]),
      head: rotate([d(8), d(-6), d(-5)]),
      rightUpperArm: aim(0.35, -0.2, 0.3),
      rightLowerArm: aim(-0.35, 0.6, 0.7),
      rightHand: rotate([d(20), d(15), d(-10)]),
      leftUpperArm: aim(-0.4, -0.3, 0.5),
      leftLowerArm: aim(-0.6, 0.15, 0.78),
      leftHand: rotate([d(5), 0, d(5)]),
    }),
  },
  {
    id: "pray",
    label: "기도",
    tone: "합장/기도",
    bones: naturalPose({
      spine: rotate([d(3), 0, 0]),
      chest: rotate([d(2), 0, 0]),
      neck: rotate([d(4), 0, 0]),
      head: rotate([d(8), 0, 0]),
      leftUpperArm: aim(-0.4, -0.25, 0.6),
      leftLowerArm: aim(-0.55, 0.35, 0.75),
      leftHand: rotate([d(10), d(-15), d(15)]),
      rightUpperArm: aim(-0.4, -0.25, 0.6),
      rightLowerArm: aim(-0.55, 0.35, 0.75),
      rightHand: rotate([d(10), d(15), d(-15)]),
    }),
  },
  {
    id: "dance",
    label: "댄스",
    tone: "춤추는 자세",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(-3), d(-8), d(3)]),
      spine: rotate([d(-2), d(6), d(-2)]),
      chest: rotate([d(3), d(5), d(-3)]),
      head: rotate([d(-4), d(-6), d(4)]),
      leftUpperArm: aim(0.62, 0.7, 0.15),
      leftLowerArm: aim(0.3, 0.92, 0.2),
      leftHand: rotate([0, 0, d(15)]),
      rightUpperArm: aim(0.5, -0.4, 0.4),
      rightLowerArm: aim(0.2, -0.2, 0.96),
      rightHand: rotate([0, 0, d(-10)]),
      leftUpperLeg: aim(0.1, -0.6, 0.79),
      leftLowerLeg: aim(0.05, -0.85, 0.52),
      rightUpperLeg: aim(0.18, -0.88, -0.42),
      rightLowerLeg: aim(0.05, -0.72, -0.69),
    }),
  },
  {
    id: "bow",
    label: "인사",
    tone: "깊은 인사",
    yOffset: -0.04,
    bones: naturalPose({
      hips: rotate([d(25), 0, 0]),
      spine: rotate([d(15), 0, 0]),
      chest: rotate([d(8), 0, 0]),
      neck: rotate([d(5), 0, 0]),
      head: rotate([d(3), 0, 0]),
      leftUpperArm: aim(0.2, -0.98),
      rightUpperArm: aim(0.2, -0.98),
      leftLowerArm: aim(0.1, -0.99),
      rightLowerArm: aim(0.1, -0.99),
    }),
  },
  {
    id: "crouch",
    label: "쪼그림",
    tone: "웅크리기",
    yOffset: -0.18,
    bones: naturalPose({
      hips: rotate([d(-15), 0, 0]),
      spine: rotate([d(12), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      neck: rotate([d(3), 0, 0]),
      head: rotate([d(-5), 0, 0]),
      leftUpperArm: aim(0.32, -0.63, 0.52),
      leftLowerArm: aim(0.17, -0.28, 0.94),
      rightUpperArm: aim(0.28, -0.67, 0.48),
      rightLowerArm: aim(0.13, -0.32, 0.94),
      leftUpperLeg: aim(0.14, -0.13, 0.98),
      rightUpperLeg: aim(0.1, -0.17, 0.97),
      leftLowerLeg: aim(0.06, -0.94, -0.33),
      rightLowerLeg: aim(0.04, -0.96, -0.27),
      leftFoot: rotate([d(-8), d(2), d(1)]),
      rightFoot: rotate([d(-7), d(-3), d(-1)]),
    }),
  },
  {
    id: "heroic",
    label: "영웅",
    tone: "영웅적 포즈",
    bones: naturalPose({
      hips: rotate([d(-2), d(-6), 0]),
      spine: rotate([d(-4), d(4), 0]),
      chest: rotate([d(-3), d(4), 0]),
      head: rotate([d(-4), d(-3), 0]),
      leftUpperArm: aim(0.45, -0.5, 0.15),
      leftLowerArm: aim(0.2, -0.92, 0.32),
      leftHand: rotate([0, 0, d(5)]),
      rightUpperArm: aim(0.6, 0.78, 0.1),
      rightLowerArm: aim(0.2, 0.96, 0.15),
      rightHand: rotate([0, 0, d(-5)]),
      leftUpperLeg: aim(0.12, -0.7, 0.7),
      rightUpperLeg: aim(0.05, -0.99, -0.1),
    }),
  },
  {
    id: "shy2",
    label: "수줍음",
    tone: "수줍은 자세",
    bones: naturalPose({
      hips: rotate([d(2), d(4), 0]),
      spine: rotate([d(3), d(-3), 0]),
      chest: rotate([d(2), d(-2), 0]),
      head: rotate([d(10), d(6), d(5)]),
      leftUpperArm: aim(-0.3, -0.55, 0.72),
      leftLowerArm: aim(-0.5, 0.2, 0.84),
      leftHand: rotate([d(5), 0, d(5)]),
      rightUpperArm: aim(-0.3, -0.55, 0.72),
      rightLowerArm: aim(-0.5, 0.2, 0.84),
      rightHand: rotate([d(5), 0, d(-5)]),
      leftUpperLeg: aim(0.15, -0.98, 0.1),
      rightUpperLeg: aim(0.05, -0.95, -0.3),
    }),
  },
  {
    id: "lean",
    label: "기대기",
    tone: "벽에 기대기",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(3), d(-5), d(-4)]),
      spine: rotate([d(-2), d(3), d(2)]),
      chest: rotate([d(-1), d(2), d(1)]),
      head: rotate([d(-3), d(-3), d(-2)]),
      leftUpperArm: aim(0.35, -0.94),
      rightUpperArm: aim(-0.2, -0.4, 0.5),
      rightLowerArm: aim(-0.6, 0.3, 0.72),
      rightHand: rotate([0, d(-10), d(-5)]),
      leftUpperLeg: aim(0.1, -0.85, 0.52),
      rightUpperLeg: aim(0.08, -0.92, -0.38),
      rightLowerLeg: aim(0.03, -0.88, -0.47),
    }),
  },
  {
    id: "crossArms",
    label: "팔짱",
    tone: "팔짱 끼기",
    bones: naturalPose({
      spine: rotate([d(-2), d(1), 0]),
      chest: rotate([d(-3), d(-1), 0]),
      head: rotate([d(-3), d(-2), d(1)]),
      leftUpperArm: aim(-0.52, -0.22, 0.52),
      leftLowerArm: aim(-0.85, 0.16, 0.42),
      leftHand: rotate([d(4), d(-9), d(9)]),
      rightUpperArm: aim(-0.58, -0.28, 0.44),
      rightLowerArm: aim(-0.9, 0.09, 0.34),
      rightHand: rotate([d(6), d(11), d(-7)]),
    }),
  },
  {
    id: "run2",
    label: "달리기",
    tone: "달리는 자세",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-6), d(-5), 0]),
      spine: rotate([d(6), d(4), 0]),
      chest: rotate([d(-2), d(3), 0]),
      head: rotate([d(-3), d(-4), 0]),
      leftUpperArm: aim(0.3, -0.6, -0.72),
      leftLowerArm: aim(0.15, -0.7, -0.7),
      rightUpperArm: aim(0.3, -0.5, 0.8),
      rightLowerArm: aim(0.15, -0.6, 0.78),
      leftUpperLeg: aim(0.1, -0.35, 0.93),
      leftLowerLeg: aim(0.03, -0.82, 0.57),
      rightUpperLeg: aim(0.1, -0.6, -0.79),
      rightLowerLeg: aim(0.03, -0.88, 0.48),
    }),
  },
  {
    id: "jump",
    label: "점프",
    tone: "점프 자세",
    yOffset: 0.1,
    bones: naturalPose({
      hips: rotate([d(-8), 0, 0]),
      spine: rotate([d(-4), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      head: rotate([d(-6), 0, 0]),
      leftUpperArm: aim(0.58, 0.8, 0.14),
      leftLowerArm: aim(0.27, 0.95, 0.1),
      rightUpperArm: aim(0.52, 0.84, 0.1),
      rightLowerArm: aim(0.23, 0.97, 0.06),
      leftUpperLeg: aim(0.12, -0.52, 0.85),
      leftLowerLeg: aim(0.06, -0.8, -0.59),
      rightUpperLeg: aim(0.09, -0.58, 0.81),
      rightLowerLeg: aim(0.04, -0.84, -0.55),
      leftFoot: rotate([d(-16), 0, d(1)]),
      rightFoot: rotate([d(-13), 0, d(-1)]),
    }),
  },
];

const CORE_ROTATION_BONE_ORDER = ["hips", "spine", "chest", "neck", "head", "leftShoulder", "rightShoulder"] as const satisfies readonly VRMHumanBoneName[];
const LIMB_BONE_ORDER = [
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
] as const satisfies readonly VRMHumanBoneName[];
const END_EFFECTOR_ROTATION_BONE_ORDER = ["leftHand", "rightHand", "leftFoot", "rightFoot"] as const satisfies readonly VRMHumanBoneName[];
// 손가락 본(오일러 회전 전용) — 모델에 해당 본이 없으면 그대로 건너뛴다.
const FINGER_ROTATION_BONE_ORDER = [
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
] as const satisfies readonly VRMHumanBoneName[];
export const ZERO_ROTATION: Vec3 = [0, 0, 0];
const MIN_DIRECTION_LENGTH_SQ = 0.000001;

type LimbBoneName = (typeof LIMB_BONE_ORDER)[number];

const LIMB_CHILD_BONE: Record<LimbBoneName, VRMHumanBoneName> = {
  leftUpperArm: "leftLowerArm",
  rightUpperArm: "rightLowerArm",
  leftLowerArm: "leftHand",
  rightLowerArm: "rightHand",
  leftUpperLeg: "leftLowerLeg",
  rightUpperLeg: "rightLowerLeg",
  leftLowerLeg: "leftFoot",
  rightLowerLeg: "rightFoot",
};

function normalizeDirection(direction: THREE.Vector3) {
  const lengthSq = direction.lengthSq();
  if (lengthSq < MIN_DIRECTION_LENGTH_SQ) return false;
  direction.multiplyScalar(1 / Math.sqrt(lengthSq));
  return true;
}

export function getPoseBoneRotation(poseBone: PoseBone | undefined) {
  return poseBone?.rotation ?? ZERO_ROTATION;
}

function applyEulerRotation(humanoid: NonNullable<VRM["humanoid"]>, boneName: VRMHumanBoneName, rotation: Vec3) {
  const bone = humanoid.getNormalizedBoneNode(boneName);
  if (!bone) return;
  bone.rotation.set(rotation[0], rotation[1], rotation[2]);
  bone.updateMatrixWorld(true);
}

function getBoneWorldDirection(bone: THREE.Object3D, child: THREE.Object3D, out: THREE.Vector3) {
  const bonePosition = new THREE.Vector3();
  const childPosition = new THREE.Vector3();
  bone.getWorldPosition(bonePosition);
  child.getWorldPosition(childPosition);
  out.subVectors(childPosition, bonePosition);
  return normalizeDirection(out);
}

function isVec3Direction(target: DirectionTarget): target is Vec3 {
  return Array.isArray(target);
}

function resolveTargetWorldDirection(target: DirectionTarget, restWorldDirection: THREE.Vector3, out: THREE.Vector3) {
  if (isVec3Direction(target)) {
    out.set(target[0], target[1], target[2]);
  } else {
    const sideSign = Math.abs(restWorldDirection.x) > MIN_DIRECTION_LENGTH_SQ ? Math.sign(restWorldDirection.x) : 0;
    out.set(sideSign * target.sideX, target.y, target.z ?? 0);
  }

  return normalizeDirection(out);
}

function aimBoneToWorldDirection(humanoid: NonNullable<VRM["humanoid"]>, boneName: LimbBoneName, target: DirectionTarget) {
  const bone = humanoid.getNormalizedBoneNode(boneName);
  const child = humanoid.getNormalizedBoneNode(LIMB_CHILD_BONE[boneName]);
  if (!bone || !child) return;

  const restWorldDirection = new THREE.Vector3();
  if (!getBoneWorldDirection(bone, child, restWorldDirection)) return;

  const targetWorldDirection = new THREE.Vector3();
  if (!resolveTargetWorldDirection(target, restWorldDirection, targetWorldDirection)) return;

  const parentInverseWorldQuaternion = new THREE.Quaternion();
  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentInverseWorldQuaternion).invert();
  } else {
    parentInverseWorldQuaternion.identity();
  }

  const restParentDirection = restWorldDirection.clone().applyQuaternion(parentInverseWorldQuaternion);
  const targetParentDirection = targetWorldDirection.clone().applyQuaternion(parentInverseWorldQuaternion);
  if (!normalizeDirection(restParentDirection) || !normalizeDirection(targetParentDirection)) return;

  const aimQuaternion = new THREE.Quaternion().setFromUnitVectors(restParentDirection, targetParentDirection);
  bone.quaternion.premultiply(aimQuaternion);
  bone.updateMatrixWorld(true);
}

export function applyPoseToVrm(vrm: VRM, bones: PoseBoneMap, yOffset: number) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return false;

  humanoid.resetNormalizedPose();
  vrm.scene.position.y = yOffset;
  vrm.scene.updateMatrixWorld(true);

  CORE_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });
  vrm.scene.updateMatrixWorld(true);

  LIMB_BONE_ORDER.forEach((boneName) => {
    const poseBone = bones[boneName];
    if (!poseBone) return;

    if (poseBone.direction) {
      aimBoneToWorldDirection(humanoid, boneName, poseBone.direction);
      return;
    }

    if (poseBone.rotation) {
      applyEulerRotation(humanoid, boneName, poseBone.rotation);
    }
  });

  END_EFFECTOR_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });

  FINGER_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });

  humanoid.update();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return true;
}

export function applyExpressionWeightsToVrm(vrm: VRM, weights: Record<string, number>) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return false;

  expressionManager.resetValues();

  Object.entries(weights).forEach(([name, weight]) => {
    if (expressionManager.getExpression(name)) {
      expressionManager.setValue(name, weight);
    }
  });

  expressionManager.update();
  vrm.update(0);
  return true;
}

export function applyVrmCustomColors(vrm: VRM, customColors: Record<string, string>) {
  vrm.scene.traverse((obj) => {
    if ((obj as Partial<THREE.Mesh>).isMesh) {
      const mesh = obj as THREE.Mesh;
      const name = mesh.name.toLowerCase();

      let part: string | null = null;
      if (name.includes("tops") || name.includes("top") || name.includes("clothes") || name.includes("shirt")) part = "tops";
      else if (name.includes("bottoms") || name.includes("bottom") || name.includes("pants") || name.includes("skirt") || name.includes("shoes") || name.includes("acc")) part = "bottoms";
      else if (name.includes("hair")) part = "hair";
      else if (name.includes("body") || name.includes("skin") || name.includes("hand") || name.includes("leg") || name.includes("arm") || name.includes("head") || name.includes("foot")) part = "body";
      else if (name.includes("face") || name.includes("eye") || name.includes("mouth") || name.includes("brow")) part = "face";

      if (part && customColors[part]) {
        const hex = customColors[part]!;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        materials.forEach((mat) => {
          const colored = mat as THREE.Material & { color?: THREE.Color };
          if (colored.color) {
            colored.color.set(hex);
            colored.needsUpdate = true;
          }
        });
      }
    }
  });
}
