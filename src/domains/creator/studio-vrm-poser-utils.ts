import * as THREE from "three";

import {
  STUDIO_HUMANOID_BONE_NAMES,
  isStudioHumanoidBoneName,
} from "./studio-humanoid-bones";
import { POSER_FINGER_BONES } from "./studio-pose-presets";
import { classifyMeshName } from "./studio-vrm-costume";
import {
  cloneStudioVrmIkConstraints,
  parseStudioVrmIkConstraints,
} from "./studio-vrm-ik-constraints";
import {
  parseVrmPhysicsSettings,
  type VrmPhysicsSettings,
} from "./studio-vrm-physics";
import {
  EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
  normalizeStudioVrmPoseTranslations,
} from "./studio-vrm-pose-translations";
import { parseVrmProps, type PropInstance } from "./studio-vrm-props";
import { parseSceneProps, type SerializedSceneProps } from "./studio-vrm-scene-props";

import type {
  StudioVrmIkConstraint,
  StudioVrmPoseTranslations,
} from "./studio-vrm-scene-document";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

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
const FINGER_ROTATION_BONE_SET = new Set<VRMHumanBoneName>(FINGER_ROTATION_BONE_ORDER);
/**
 * Runtime pose application is deliberately derived from the same semantic allowlist used by the
 * portable pose-material boundary. Arbitrary object keys can therefore never address scene nodes,
 * while optional VRM bones (eyes, jaw, upper chest and toes included) are no longer dropped.
 */
export const STUDIO_VRM_APPLIED_HUMANOID_BONES = STUDIO_HUMANOID_BONE_NAMES;
const LIMB_BONE_SET = new Set<VRMHumanBoneName>(LIMB_BONE_ORDER);
const POST_DIRECTION_ROTATION_BONE_SET = new Set<VRMHumanBoneName>([
  "leftHand",
  "rightHand",
  "leftFoot",
  "leftToes",
  "rightFoot",
  "rightToes",
  ...FINGER_ROTATION_BONE_ORDER,
]);
const PRE_DIRECTION_ROTATION_BONE_ORDER = STUDIO_VRM_APPLIED_HUMANOID_BONES.filter(
  (boneName) =>
    !LIMB_BONE_SET.has(boneName) && !POST_DIRECTION_ROTATION_BONE_SET.has(boneName)
);
const POST_DIRECTION_ROTATION_BONE_ORDER = STUDIO_VRM_APPLIED_HUMANOID_BONES.filter(
  (boneName) => POST_DIRECTION_ROTATION_BONE_SET.has(boneName)
);
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
  const order = boneName.includes("Hand") || boneName.includes("Arm") || boneName.includes("Finger") ? "YXZ" : "XYZ";
  bone.rotation.set(rotation[0], rotation[1], rotation[2], order);
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

/**
 * World-space palm normal (out of the palm face, not the dorsal/back).
 *
 * Built from hand→middle × hand→thumb with a fixed winding that matches VRM
 * humanoid rest for both hands. (The opposite winding points out of the back
 * of the hand and made hanging-arm twist flip palms outward.)
 */
export function estimateVrmPalmNormal(vrm: VRM, side: "left" | "right"): THREE.Vector3 | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const hand = humanoid.getNormalizedBoneNode(`${side}Hand`);
  const middle = humanoid.getNormalizedBoneNode(`${side}MiddleProximal`);
  const thumb =
    humanoid.getNormalizedBoneNode(`${side}ThumbProximal`)
    ?? humanoid.getNormalizedBoneNode(`${side}ThumbMetacarpal`);
  if (!hand || !middle) return null;

  const handPos = new THREE.Vector3();
  const middlePos = new THREE.Vector3();
  hand.getWorldPosition(handPos);
  middle.getWorldPosition(middlePos);
  const along = middlePos.clone().sub(handPos);
  if (!normalizeDirection(along)) return null;

  const thumbPos = new THREE.Vector3();
  if (thumb) {
    thumb.getWorldPosition(thumbPos);
  } else {
    // Degenerate fallback: slight side offset so a normal still exists.
    thumbPos.copy(handPos).add(new THREE.Vector3(side === "left" ? -0.02 : 0.02, 0, 0));
  }
  const across = thumbPos.sub(handPos);
  if (!normalizeDirection(across)) return null;

  // along × across = palm-out. across × along was dorsal-out and inverted every correction.
  const palm = new THREE.Vector3().crossVectors(along, across);
  return normalizeDirection(palm) ? palm : null;
}

/**
 * Limb aiming uses setFromUnitVectors, which leaves an uncontrolled twist around the bone axis.
 * Most bundled VRoids then show palms facing outward or camera-back after natural idle aims.
 * Lumi happened to residual-twist into a readable pose; others did not.
 *
 * For relaxed / hanging arms, twist each hand so the palm faces:
 *   medial (toward midline) + slightly down + slightly character-forward (+Z).
 * Raised arms (wave, fist) are skipped so expressive poses stay intact.
 *
 * Returns how many hands were corrected.
 */
export function correctVrmHangingHandPalmTwist(vrm: VRM): number {
  const humanoid = vrm.humanoid;
  if (!humanoid) return 0;

  let corrected = 0;
  for (const side of ["left", "right"] as const) {
    if (orientRelaxedHandPalm(humanoid, side)) corrected += 1;
  }
  if (corrected > 0) {
    vrm.scene.updateMatrixWorld(true);
  }
  return corrected;
}

/**
 * Desired palm normal for a relaxed hand on a standing character facing +Z.
 * Pure "toward hips" pulls palms camera-back when hands sit in front of the torso.
 * Bias is medial + clearly down (toward thighs) + mild character-forward.
 */
export function desiredRelaxedPalmNormal(
  side: "left" | "right",
  handWorldPos: THREE.Vector3,
  spineWorldPos: THREE.Vector3,
): THREE.Vector3 {
  // Medial: left hand (+X) wants -X, right hand (-X) wants +X. Fall back to side label
  // when the hand sits near the midplane.
  const sideSign = Math.abs(handWorldPos.x) > 0.04
    ? Math.sign(handWorldPos.x)
    : (side === "left" ? 1 : -1);
  const medial = new THREE.Vector3(-sideSign, 0, 0);

  // Soft pull toward the torso (spine/chest) without letting a forward hand force -Z palms.
  const towardTorso = spineWorldPos.clone().sub(handWorldPos);
  if (normalizeDirection(towardTorso)) {
    // Keep medial + vertical contribution; crush rearward so palms don't face camera-back.
    towardTorso.x *= 0.45;
    // Prefer downward torso pull (thigh-facing) over upward chest pull.
    towardTorso.y = Math.min(0, towardTorso.y) * 0.55;
    towardTorso.z = Math.max(0, towardTorso.z) * 0.15;
  } else {
    towardTorso.set(0, 0, 0);
  }

  // Stronger down (−Y) + lighter forward so hanging palms read thigh-side, not palm-up.
  const desired = medial
    .multiplyScalar(0.62)
    .add(towardTorso)
    .add(new THREE.Vector3(0, -0.62, 0.28));
  if (!normalizeDirection(desired)) {
    return new THREE.Vector3(-sideSign, -0.62, 0.28).normalize();
  }
  return desired;
}

function measurePalmNormalFromBones(
  hand: THREE.Object3D,
  middle: THREE.Object3D,
  thumb: THREE.Object3D | null,
  side: "left" | "right",
): THREE.Vector3 | null {
  const handPos = new THREE.Vector3();
  const middlePos = new THREE.Vector3();
  hand.getWorldPosition(handPos);
  middle.getWorldPosition(middlePos);
  const along = middlePos.clone().sub(handPos);
  if (!normalizeDirection(along)) return null;
  const thumbPos = new THREE.Vector3();
  if (thumb) {
    thumb.getWorldPosition(thumbPos);
  } else {
    thumbPos.copy(handPos).add(new THREE.Vector3(side === "left" ? -0.02 : 0.02, 0, 0));
  }
  const across = thumbPos.sub(handPos);
  if (!normalizeDirection(across)) return null;
  // Same palm-out winding as estimateVrmPalmNormal (along × across).
  const palm = new THREE.Vector3().crossVectors(along, across);
  return normalizeDirection(palm) ? palm : null;
}

function applyWorldTwistToHand(
  hand: THREE.Object3D,
  worldAxis: THREE.Vector3,
  angle: number,
): void {
  if (!hand.parent || !Number.isFinite(angle) || Math.abs(angle) < THREE.MathUtils.degToRad(1)) {
    return;
  }
  const parentWorldQ = new THREE.Quaternion();
  hand.parent.getWorldQuaternion(parentWorldQ);
  const handWorldQ = new THREE.Quaternion();
  hand.getWorldQuaternion(handWorldQ);
  const twist = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle);
  const newWorldQ = twist.clone().multiply(handWorldQ);
  hand.quaternion.copy(parentWorldQ.clone().invert().multiply(newWorldQ));
  hand.updateMatrixWorld(true);
}

function orientRelaxedHandPalm(
  humanoid: NonNullable<VRM["humanoid"]>,
  side: "left" | "right",
): boolean {
  const hand = humanoid.getNormalizedBoneNode(`${side}Hand`);
  const lowerArm = humanoid.getNormalizedBoneNode(`${side}LowerArm`);
  const middle = humanoid.getNormalizedBoneNode(`${side}MiddleProximal`);
  const thumb =
    humanoid.getNormalizedBoneNode(`${side}ThumbProximal`)
    ?? humanoid.getNormalizedBoneNode(`${side}ThumbMetacarpal`);
  const spine =
    humanoid.getNormalizedBoneNode("chest")
    ?? humanoid.getNormalizedBoneNode("spine")
    ?? humanoid.getNormalizedBoneNode("hips");
  if (!hand || !lowerArm || !middle || !spine || !hand.parent) return false;

  const handPos = new THREE.Vector3();
  const lowerPos = new THREE.Vector3();
  hand.getWorldPosition(handPos);
  lowerArm.getWorldPosition(lowerPos);

  // Twist axis = forearm (lower arm → hand).
  const forearmAxis = handPos.clone().sub(lowerPos);
  if (!normalizeDirection(forearmAxis)) return false;
  // Skip clearly raised arms. Allow slight forward hang (natural idle often has z>0).
  if (forearmAxis.y > -0.15) return false;

  const palm = measurePalmNormalFromBones(hand, middle, thumb, side);
  if (!palm) return false;

  const spinePos = new THREE.Vector3();
  spine.getWorldPosition(spinePos);
  const desired = desiredRelaxedPalmNormal(side, handPos, spinePos);

  // Pass 1 — twist around the forearm for medial + down + mild forward.
  const palmProj = palm.clone().addScaledVector(forearmAxis, -palm.dot(forearmAxis));
  const desiredProj = desired.clone().addScaledVector(forearmAxis, -desired.dot(forearmAxis));
  if (!normalizeDirection(palmProj) || !normalizeDirection(desiredProj)) return false;

  const sin = forearmAxis.dot(new THREE.Vector3().crossVectors(palmProj, desiredProj));
  const cos = palmProj.dot(desiredProj);
  let angle = Math.atan2(sin, cos);
  if (!Number.isFinite(angle)) return false;
  // Cap so we never spin a hand more than ~150° in one pass.
  angle = THREE.MathUtils.clamp(angle, -Math.PI * 0.85, Math.PI * 0.85);
  let changed = false;
  if (Math.abs(angle) >= THREE.MathUtils.degToRad(1.5)) {
    applyWorldTwistToHand(hand, forearmAxis, angle);
    changed = true;
  }

  // Pass 2 — hanging forearms are nearly vertical, so pure twist keeps palm.y near 0.
  // A small extra pitch tips the palm toward the thighs (−Y) without undoing medial.
  const palmAfter = measurePalmNormalFromBones(hand, middle, thumb, side);
  if (!palmAfter) return changed;
  const TARGET_PALM_Y = -0.32;
  if (palmAfter.y > TARGET_PALM_Y + 0.03) {
    // Pitch axis ⊥ forearm; pick the rotation sign that actually lowers palm.y.
    const worldDown = new THREE.Vector3(0, -1, 0);
    const pitchAxis = new THREE.Vector3().crossVectors(forearmAxis, worldDown);
    if (normalizeDirection(pitchAxis)) {
      const excess = palmAfter.y - TARGET_PALM_Y;
      const magnitude = THREE.MathUtils.clamp(
        excess * 1.35,
        THREE.MathUtils.degToRad(2),
        Math.PI * 0.38,
      );
      // Probe both directions with a temporary quaternion so we do not flip the wrong way.
      const parentWorldQ = new THREE.Quaternion();
      hand.parent!.getWorldQuaternion(parentWorldQ);
      const baseLocal = hand.quaternion.clone();
      const handWorldQ = new THREE.Quaternion();
      hand.getWorldQuaternion(handWorldQ);
      let bestAngle = 0;
      let bestY = palmAfter.y;
      for (const sign of [1, -1] as const) {
        const trial = magnitude * sign;
        const twist = new THREE.Quaternion().setFromAxisAngle(pitchAxis, trial);
        const newWorldQ = twist.clone().multiply(handWorldQ);
        hand.quaternion.copy(parentWorldQ.clone().invert().multiply(newWorldQ));
        hand.updateMatrixWorld(true);
        const trialPalm = measurePalmNormalFromBones(hand, middle, thumb, side);
        const trialY = trialPalm?.y ?? Number.POSITIVE_INFINITY;
        if (trialY < bestY - 0.01) {
          bestY = trialY;
          bestAngle = trial;
        }
        // Restore for the next probe.
        hand.quaternion.copy(baseLocal);
        hand.updateMatrixWorld(true);
      }
      if (bestAngle !== 0 && bestY < palmAfter.y - 0.015) {
        applyWorldTwistToHand(hand, pitchAxis, bestAngle);
        changed = true;
      }
    }
  }

  return changed;
}

const translatedBoneBasePositions = new WeakMap<THREE.Object3D, THREE.Vector3>();

function restoreTranslatedBoneBase(node: THREE.Object3D | null): void {
  if (!node) return;
  const existing = translatedBoneBasePositions.get(node);
  if (existing) {
    node.position.copy(existing);
    return;
  }
  translatedBoneBasePositions.set(node, node.position.clone());
}

function sceneLocalTranslationToBoneLocal(
  scene: THREE.Object3D,
  node: THREE.Object3D,
  translation: Vec3,
): THREE.Vector3 | null {
  const parent = node.parent;
  if (!parent) return null;
  scene.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const sceneOriginWorld = new THREE.Vector3(0, 0, 0).applyMatrix4(scene.matrixWorld);
  const sceneEndpointWorld = new THREE.Vector3(...translation).applyMatrix4(scene.matrixWorld);
  const worldDelta = sceneEndpointWorld.sub(sceneOriginWorld);
  const parentInverse = parent.matrixWorld.clone().invert();
  const parentOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(parentInverse);
  const parentEndpoint = worldDelta.clone().applyMatrix4(parentInverse);
  const result = parentEndpoint.sub(parentOrigin);
  return [result.x, result.y, result.z].every(Number.isFinite) ? result : null;
}

function applyPoseTranslations(
  vrm: VRM,
  translations: StudioVrmPoseTranslations,
): boolean {
  const humanoid = vrm.humanoid;
  if (!humanoid) return false;
  const hips = humanoid.getNormalizedBoneNode("hips");
  const spine = humanoid.getNormalizedBoneNode("spine");
  const hasHipsTranslation = translations.hips.some((coordinate) => coordinate !== 0);
  const hasSpineTranslation = translations.spine.some((coordinate) => coordinate !== 0);
  if (hasHipsTranslation) {
    if (!hips) return false;
    const hipsLocal = sceneLocalTranslationToBoneLocal(vrm.scene, hips, translations.hips);
    if (!hipsLocal) return false;
    hips.position.add(hipsLocal);
    vrm.scene.updateMatrixWorld(true);
  }
  if (hasSpineTranslation) {
    if (!spine) return false;
    const spineLocal = sceneLocalTranslationToBoneLocal(vrm.scene, spine, translations.spine);
    if (!spineLocal) return false;
    spine.position.add(spineLocal);
    vrm.scene.updateMatrixWorld(true);
  }
  return true;
}

export function applyPoseToVrm(
  vrm: VRM,
  bones: PoseBoneMap,
  yOffset: number,
  rawTranslations: StudioVrmPoseTranslations = EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return false;
  const translations = normalizeStudioVrmPoseTranslations(rawTranslations);
  if (!translations) return false;

  humanoid.resetNormalizedPose();
  const hips = humanoid.getNormalizedBoneNode("hips");
  const spine = humanoid.getNormalizedBoneNode("spine");
  restoreTranslatedBoneBase(hips);
  restoreTranslatedBoneBase(spine);
  vrm.scene.position.set(translations.root[0], yOffset, translations.root[2]);
  vrm.scene.updateMatrixWorld(true);

  PRE_DIRECTION_ROTATION_BONE_ORDER.forEach((boneName) => {
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

  POST_DIRECTION_ROTATION_BONE_ORDER.forEach((boneName) => {
    // Finger curls always go through applyFingerRotations so model-axis polarity can be fixed.
    if (FINGER_ROTATION_BONE_SET.has(boneName)) return;
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });

  // After limb aims + wrist eulers: fix hanging-arm palm twist (Harin / VRoid outward palms).
  correctVrmHangingHandPalmTwist(vrm);

  // Optional finger eulers carried in the pose map (natural idle, extras) — polarity-aware.
  const fingerEdits: Partial<Record<VRMHumanBoneName, Vec3>> = {};
  for (const boneName of FINGER_ROTATION_BONE_ORDER) {
    const rotation = bones[boneName]?.rotation;
    if (rotation) fingerEdits[boneName] = rotation;
  }
  if (Object.keys(fingerEdits).length > 0) {
    applyFingerRotations(vrm, fingerEdits);
    // Finger curls rotate proximal phalanges and can nudge the measured palm normal —
    // re-seat hanging-hand medial/down after curl polarity settles.
    correctVrmHangingHandPalmTwist(vrm);
  }

  humanoid.update();
  if (!applyPoseTranslations(vrm, translations)) return false;
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

/** Mannequin clay gray — never cache as native albedo factor. */
export const STUDIO_VRM_MANNEQUIN_COLOR_HEX = "#b7b2a8" as const;

function colorHexLower(color: THREE.Color): string {
  return `#${color.getHexString().toLowerCase()}`;
}

export function isVrmMannequinPaintColor(color: THREE.Color): boolean {
  return colorHexLower(color) === STUDIO_VRM_MANNEQUIN_COLOR_HEX;
}

/** Near-black lit factors multiply texture albedo to pure black — refuse as "native". */
export function isVrmNearBlackLitColor(color: THREE.Color): boolean {
  return color.r <= 0.02 && color.g <= 0.02 && color.b <= 0.02;
}

/**
 * Map a single mesh/material name to a recolor slot.
 * Hair before bare "top" (Hair_Top); face before body/head; cloth before generic body.
 */
export function classifyVrmCustomColorPart(nameRaw: string): string | null {
  const name = nameRaw.toLowerCase();
  if (!name.trim()) return null;
  if (name.includes("hair") || name.includes("kami")) return "hair";
  if (
    name.includes("face")
    || name.includes("eye")
    || name.includes("mouth")
    || name.includes("brow")
    || name.includes("lash")
    || name.includes("tooth")
  ) {
    return "face";
  }
  // Clothing before body — VRoid bakes Tops/Bottoms materials onto a node named "Body".
  // Bottoms before generic "cloth" so names like Bottoms_01_CLOTH do not fall into tops.
  if (
    name.includes("bottoms")
    || name.includes("bottom")
    || name.includes("pants")
    || name.includes("skirt")
    || name.includes("shoes")
    || name.includes("boot")
    || name.includes("sock")
    || name.includes("acc")
  ) {
    return "bottoms";
  }
  if (
    name.includes("tops")
    || name.includes("clothes")
    || name.includes("cloth")
    || name.includes("shirt")
    || name.includes("jacket")
    || name.includes("coat")
    || name.includes("wear")
    || /(^|[^a-z])top([^a-z]|$)/.test(name)
  ) {
    return "tops";
  }
  if (
    name.includes("body")
    || name.includes("skin")
    || name.includes("hand")
    || name.includes("leg")
    || name.includes("arm")
    || name.includes("foot")
    || name.includes("head")
    || name.includes("neck")
    || name.includes("torso")
  ) {
    return "body";
  }
  return null;
}

/**
 * Prefer material name over mesh name so multi-material "Body" meshes (skin + tops + bottoms
 * + hair) recolor only the matching primitive, not the entire body as one slot.
 */
export function classifyVrmCustomColorPartForMaterial(
  meshName: string,
  materialName?: string | null,
): string | null {
  return classifyVrmCustomColorPart(materialName ?? "")
    ?? classifyVrmCustomColorPart(meshName);
}

function isActiveCustomColorHex(hex: string | undefined): hex is string {
  if (!hex || typeof hex !== "string") return false;
  const normalized = hex.trim().toLowerCase();
  return normalized !== "" && normalized !== "#ffffff" && normalized !== "#fff";
}

function isMToonOutlineMaterial(mat: THREE.Material & { isOutline?: boolean }): boolean {
  return mat.isOutline === true;
}

export function scrubVrmMannequinColorCaches(vrm: VRM) {
  vrm.scene.traverse((obj) => {
    if (!(obj as Partial<THREE.Mesh>).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat?.userData) continue;
      mat.userData.__vrmMannequinActive = false;
      const original = mat.userData.__vrmCustomColorOriginal as THREE.Color | undefined;
      if (original && (isVrmMannequinPaintColor(original) || isVrmNearBlackLitColor(original))) {
        delete mat.userData.__vrmCustomColorOriginal;
        mat.userData.__vrmCustomColorApplied = false;
      }
    }
  });
}

/**
 * Safety net for "original clothes flash then pure black":
 * textured materials whose lit factor collapsed to near-black (color × map = black).
 * Skips mannequin paint, outline materials, and materials with an active custom recolor.
 * Returns how many materials were repaired.
 */
export function repairVrmTexturedNearBlackLitFactors(vrm: VRM): number {
  let repaired = 0;
  vrm.scene.traverse((obj) => {
    if (!(obj as Partial<THREE.Mesh>).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      const colored = mat as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
        isOutline?: boolean;
        userData: Record<string, unknown>;
      };
      if (!colored?.color || !colored.map) continue;
      if (colored.userData.__vrmMannequinActive === true) continue;
      if (isMToonOutlineMaterial(colored)) continue;
      if (colored.userData.__vrmCustomColorApplied === true) continue;
      if (colored.userData.__vrmCostumeRecolorApplied === true) continue;
      if (!isVrmNearBlackLitColor(colored.color) && !isVrmMannequinPaintColor(colored.color)) continue;
      colored.color.set("#ffffff");
      colored.needsUpdate = true;
      if (colored.userData.__vrmCustomColorOriginal) {
        delete colored.userData.__vrmCustomColorOriginal;
      }
      repaired += 1;
    }
  });
  return repaired;
}

/**
 * Recolor VRM mesh slots without destroying native albedo.
 * - Classify per material (VRoid Body mesh holds skin+tops+bottoms together).
 * - No active custom hex → leave materials alone (textures + lit factor).
 * - Never cache mannequin clay or near-black as "native" (black × texture = pure black clothes).
 * - After idle pass, repair any textured near-black lit factors left by races.
 */
export function applyVrmCustomColors(vrm: VRM, customColors: Record<string, string>) {
  let anyActiveCustom = false;
  vrm.scene.traverse((obj) => {
    if (!(obj as Partial<THREE.Mesh>).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.forEach((mat) => {
      const colored = mat as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
        isOutline?: boolean;
        name?: string;
        userData: Record<string, unknown>;
      };
      if (!colored.color) return;
      if (colored.userData.__vrmMannequinActive === true) return;
      // Outline pass materials must keep their own factors — recoloring them blacks silhouettes.
      if (isMToonOutlineMaterial(colored)) return;

      const part = classifyVrmCustomColorPartForMaterial(mesh.name, colored.name);
      const customHex = part ? customColors[part] : undefined;
      const hasCustom = isActiveCustomColorHex(customHex);
      if (hasCustom) anyActiveCustom = true;
      let original = colored.userData.__vrmCustomColorOriginal as THREE.Color | undefined;

      if (original && (isVrmMannequinPaintColor(original) || isVrmNearBlackLitColor(original))) {
        delete colored.userData.__vrmCustomColorOriginal;
        colored.userData.__vrmCustomColorApplied = false;
        original = undefined;
      }

      if (hasCustom) {
        if (!original) {
          if (isVrmMannequinPaintColor(colored.color) || isVrmNearBlackLitColor(colored.color)) {
            // Prefer white lit factor so textured clothing keeps albedo under a tint.
            original = new THREE.Color("#ffffff");
          } else {
            original = colored.color.clone();
          }
          colored.userData.__vrmCustomColorOriginal = original;
        }
        colored.color.set(customHex);
        colored.needsUpdate = true;
        colored.userData.__vrmCustomColorApplied = true;
        return;
      }

      if (colored.userData.__vrmCustomColorApplied === true && original) {
        colored.color.copy(original);
        colored.needsUpdate = true;
        colored.userData.__vrmCustomColorApplied = false;
      }
    });
  });

  // Idle / post-restore pass: heal textured clothes that collapsed to pure black lit×map.
  if (!anyActiveCustom) {
    repairVrmTexturedNearBlackLitFactors(vrm);
  }
}

// ── 재질 효과(MToon 셰이딩/외곽선/림라이트) ─────────────────────────────

export type VrmMaterialFx = {
  shadeColor: string | null; // shadeColorFactor — 그림자(셰이딩) 색, 베이스 색과 별개
  outlineColor: string | null; // outlineColorFactor — 외곽선/선화 색
  rimColor: string | null; // parametricRimColorFactor — 림 라이트(윤곽 발광) 색
  rimIntensity: number; // rimLightingMixFactor 0-1 — rimColor 없이 세팅해도 안 보이므로 페어드 슬라이더 필수
  emissiveColor: string | null; // emissive — 발광 색(야광/네온 연출)
  emissiveIntensity: number; // emissiveIntensity 0-1
};

export const DEFAULT_VRM_MATERIAL_FX: VrmMaterialFx = {
  shadeColor: null,
  outlineColor: null,
  rimColor: null,
  rimIntensity: 0,
  emissiveColor: null,
  emissiveIntensity: 0,
};

// MToonMaterial은 트랜지티브 의존성(@pixiv/three-vrm-materials-mtoon이 package.json 직접 의존성이
// 아님)이라 패키지를 import하지 않고 구조적으로 타이핑한다 — applyVrmCustomColors의
// `mat as THREE.Material & { color?: THREE.Color }` 패턴과 동일.
interface MToonUniformMaterial {
  isMToonMaterial?: boolean;
  shadeColorFactor?: THREE.Color;
  outlineColorFactor?: THREE.Color;
  parametricRimColorFactor?: THREE.Color;
  rimLightingMixFactor?: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
}

/** VRM 씬에 MToon 재질이 하나라도 있는지 — 재질 효과 섹션의 표시 가드에 쓰인다. */
export function hasVrmMToonMaterial(vrm: VRM): boolean {
  let found = false;
  vrm.scene.traverse((obj) => {
    if (found || !(obj as Partial<THREE.Mesh>).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((m) => (m as MToonUniformMaterial | undefined)?.isMToonMaterial)) found = true;
  });
  return found;
}

interface VrmMaterialFxOriginal {
  shadeColor?: THREE.Color;
  outlineColor?: THREE.Color;
  rimColor?: THREE.Color;
  rimIntensity?: number;
  emissiveColor?: THREE.Color;
  emissiveIntensity?: number;
}

/**
 * MToon 재질의 그림자·외곽선·림라이트·발광 색/강도 유니폼을 적용한다.
 * 표준 재질(MeshStandardMaterial 등)에는 해당 유니폼이 없어 자동으로 건너뛴다.
 * 정점/지오메트리는 절대 건드리지 않는다 — 재질 색상 유니폼만 갱신.
 *
 * fx 필드가 꺼지면(falsy) 단순히 아무 일도 안 하면 이전에 적용해 둔 색이 그대로 남아 "끄기"/
 * "초기화" 버튼이 시각적으로 무효과가 된다 — 그래서 재질(mat.userData)에 원본 유니폼 값을 최초
 * 1회만 캐시해 두고, 필드가 꺼진 경우 그 원본으로 되돌린다.
 */
export function applyVrmMaterialFx(vrm: VRM, fx: VrmMaterialFx) {
  vrm.scene.traverse((obj) => {
    if (!(obj as Partial<THREE.Mesh>).isMesh) return;
    const mesh = obj as THREE.Mesh;
    // 눈/얼굴 하이라이트 텍스처가 emissive를 쓰는 모델이 많아, 발광색만은 보호 카테고리를 피한다
    // (studio-vrm-costume의 protected 판정 재사용 — 의상 보호 로직과 동일한 안전장치).
    const { protected: guard } = classifyMeshName(mesh.name);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.forEach((m) => {
      const mat = m as THREE.Material & MToonUniformMaterial & { userData: Record<string, unknown> };
      if (!mat.isMToonMaterial) return; // MToon 전용 유니폼 — 표준 재질(MeshStandardMaterial 등)엔 없음

      let original = mat.userData.__vrmMaterialFxOriginal as VrmMaterialFxOriginal | undefined;
      if (!original) {
        original = {
          shadeColor: mat.shadeColorFactor?.clone(),
          outlineColor: mat.outlineColorFactor?.clone(),
          rimColor: mat.parametricRimColorFactor?.clone(),
          rimIntensity: mat.rimLightingMixFactor,
          emissiveColor: mat.emissive?.clone(),
          emissiveIntensity: mat.emissiveIntensity,
        };
        mat.userData.__vrmMaterialFxOriginal = original;
      }

      if (fx.shadeColor) mat.shadeColorFactor?.set(fx.shadeColor);
      else if (original.shadeColor) mat.shadeColorFactor?.copy(original.shadeColor);

      if (fx.outlineColor) mat.outlineColorFactor?.set(fx.outlineColor);
      else if (original.outlineColor) mat.outlineColorFactor?.copy(original.outlineColor);

      if (fx.rimColor) {
        mat.parametricRimColorFactor?.set(fx.rimColor);
        mat.rimLightingMixFactor = fx.rimIntensity;
      } else {
        if (original.rimColor) mat.parametricRimColorFactor?.copy(original.rimColor);
        if (original.rimIntensity !== undefined) mat.rimLightingMixFactor = original.rimIntensity;
      }

      if (guard !== "eye" && guard !== "face") {
        if (fx.emissiveColor) {
          mat.emissive?.set(fx.emissiveColor);
          mat.emissiveIntensity = fx.emissiveIntensity;
        } else {
          if (original.emissiveColor) mat.emissive?.copy(original.emissiveColor);
          if (original.emissiveIntensity !== undefined) mat.emissiveIntensity = original.emissiveIntensity;
        }
      }
      mat.needsUpdate = true;
    });
  });
}

// ── 신규 순수 헬퍼: finger / bodyScale / lighting / full state ─────────────

export type FingerRotationMap = Partial<Record<VRMHumanBoneName, Vec3>>;

function middleTipPalmDot(vrm: VRM, side: "left" | "right"): number | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const hand = humanoid.getNormalizedBoneNode(`${side}Hand`);
  const tip =
    humanoid.getNormalizedBoneNode(`${side}MiddleDistal`)
    ?? humanoid.getNormalizedBoneNode(`${side}MiddleProximal`);
  if (!hand || !tip) return null;
  const palm = estimateVrmPalmNormal(vrm, side);
  if (!palm) return null;
  const tipDir = tip.getWorldPosition(new THREE.Vector3())
    .sub(hand.getWorldPosition(new THREE.Vector3()));
  if (!normalizeDirection(tipDir)) return null;
  return tipDir.dot(palm);
}

function zeroFingerSide(
  humanoid: NonNullable<VRM["humanoid"]>,
  side: "left" | "right",
): void {
  for (const boneName of FINGER_ROTATION_BONE_ORDER) {
    if (!String(boneName).startsWith(side)) continue;
    const node = humanoid.getNormalizedBoneNode(boneName);
    if (node) node.rotation.set(0, 0, 0);
  }
}

function applyFingerSide(
  humanoid: NonNullable<VRM["humanoid"]>,
  fingers: FingerRotationMap,
  side: "left" | "right",
  polarity: 1 | -1,
): void {
  for (const boneName of FINGER_ROTATION_BONE_ORDER) {
    if (!String(boneName).startsWith(side)) continue;
    const rot = fingers[boneName];
    if (!rot) continue;
    applyEulerRotation(humanoid, boneName, [
      polarity * rot[0],
      polarity * rot[1],
      polarity * rot[2],
    ]);
  }
}

/**
 * Some bundled VRM rest axes (notably sample.vrm / 루미) mirror finger local Z relative to
 * typical VRoid samples. After the body/palm pose is live, pick the curl polarity that moves
 * the middle fingertip toward the palm (−palm normal), not into hyperextension.
 */
export function resolveFingerCurlPolarity(
  vrm: VRM,
  fingers: FingerRotationMap,
  side: "left" | "right",
): 1 | -1 {
  const humanoid = vrm.humanoid;
  if (!humanoid) return 1;
  const hasSide = FINGER_ROTATION_BONE_ORDER.some(
    (boneName) => String(boneName).startsWith(side) && fingers[boneName],
  );
  if (!hasSide) return 1;

  zeroFingerSide(humanoid, side);
  humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  const baseline = middleTipPalmDot(vrm, side);
  if (baseline === null) return 1;

  applyFingerSide(humanoid, fingers, side, 1);
  humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  const positive = middleTipPalmDot(vrm, side);
  if (positive === null) return 1;

  // Prefer the polarity that decreases tip·palm (curl into the palm surface).
  // If +1 makes the tip more palm-normal-aligned, the axes are inverted → use -1.
  return positive - baseline > 0.04 ? -1 : 1;
}

export function applyFingerRotations(vrm: VRM, fingers: FingerRotationMap) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;
  if (Object.keys(fingers).length === 0) return;

  // Body/palm pose must already be on the skeleton (applyPoseToVrm first).
  vrm.scene.updateMatrixWorld(true);
  const leftPolarity = resolveFingerCurlPolarity(vrm, fingers, "left");
  const rightPolarity = resolveFingerCurlPolarity(vrm, fingers, "right");

  // resolve* leaves each side at its trial pose; re-apply both with chosen polarities.
  zeroFingerSide(humanoid, "left");
  zeroFingerSide(humanoid, "right");
  applyFingerSide(humanoid, fingers, "left", leftPolarity);
  applyFingerSide(humanoid, fingers, "right", rightPolarity);
  humanoid.update();
  vrm.scene.updateMatrixWorld(true);
}

export type BodyScale = {
  height: number; // 0.7 ~ 1.4
  width: number; // 0.7 ~ 1.3
};

export function applyBodyScale(vrm: VRM, scale: BodyScale) {
  const s = Math.max(0.5, Math.min(1.6, scale.height || 1));
  const w = Math.max(0.5, Math.min(1.6, scale.width || 1));
  const sc = (vrm.scene as any).scale; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (sc && typeof sc.set === "function") sc.set(w, s, w);
  vrm.scene.updateMatrixWorld(true);
}

export type LightingParams = {
  intensity: number; // 0.2~3
  colorTemp: number; // 0=cool blue ~1=warm orange
  directionDeg: number; // azimuth
};

export function computeLightingUniforms(params: LightingParams) {
  const i = Math.max(0.1, Math.min(4, params.intensity ?? 1));
  const t = Math.max(0, Math.min(1, params.colorTemp ?? 0.5));
  const dir = (params.directionDeg ?? 45) * (Math.PI / 180);
  // simple: cool (high blue) to warm (high red/yellow)
  const r = 1.0 - t * 0.3;
  const g = 0.95 - t * 0.15;
  const b = 0.85 + t * 0.1;
  return {
    intensity: i,
    color: [r, g, b] as const,
    dir: { x: Math.cos(dir), y: -0.6, z: Math.sin(dir) },
  };
}

export type EnvVariant = "none" | "floor" | "wall" | "room" | "outdoor";

export type FullVrmState = {
  version: 3;
  /**
   * 이 상태를 캡처한 VRM 라이브러리 엔트리. 저장 상태의 명시적 모델 간 이식은 허용하지만,
   * 편집 undo/redo는 이 소유권이 현재 모델과 일치할 때만 복원한다.
   */
  modelId?: string;
  poseId?: string;
  bones: PoseBoneMap;
  yOffset: number;
  /** Canonical v3 root/hips/spine translation state; absent v2 payloads migrate to zero. */
  poseTranslations: StudioVrmPoseTranslations;
  /** Canonical scene-local persistent hand/foot targets; absent v2 payloads migrate to empty. */
  ikConstraints: readonly StudioVrmIkConstraint[];
  /** 캐릭터 루트의 사용자 Y축 회전(라디안, -PI~PI). */
  bodyRotation: number;
  expressionId?: string;
  expressionWeights?: Record<string, number>;
  costume?: unknown;
  /** 실장착 워드로브(studio-vrm-wardrobe SerializedWardrobe) — 옵셔널 하위호환. */
  wardrobe?: unknown;
  props?: unknown;
  /** 캐릭터 주변 월드/본 배치 동물·이펙트 상태. */
  sceneProps?: unknown;
  physics?: unknown;
  bodyScale?: BodyScale;
  lighting?: LightingParams;
  env?: EnvVariant;
  fingerOverrides?: FingerRotationMap;
  materialFx?: VrmMaterialFx;
  /** VRoid형 비파괴 얼굴·헤어·체형 조형 상태. 구버전 저장본과 호환되는 선택 필드. */
  avatarForge?: unknown;
  /** 원본 VRM의 머리·피부·의상 재질에 적용한 비파괴 색상 오버라이드. */
  customColors?: Record<string, string>;
};

/** Historical v2 payloads are accepted at read boundaries and promoted by serializeFullVrmState. */
export type FullVrmStateInput = Partial<Omit<FullVrmState, "version" | "ikConstraints">> & {
  version: 2 | 3;
  ikConstraints?: unknown;
};

const MAX_VRM_MODEL_ID_LENGTH = 256;
const MAX_VRM_STATE_TEXT_LENGTH = 256;
const MAX_VRM_RUNTIME_NUMBER = 10_000;
const MAX_VRM_RUNTIME_DATA_DEPTH = 16;
const MAX_VRM_RUNTIME_DATA_NODES = 8_192;
const MAX_VRM_RUNTIME_ARRAY_ITEMS = 1_024;
const MAX_VRM_RUNTIME_OBJECT_KEYS = 1_024;
const MAX_VRM_RUNTIME_STRING_LENGTH = 1_024;
const SAFE_VRM_RUNTIME_KEY_PATTERN = /^[\p{L}\p{N}_. :/@+-]{1,64}$/u;
const CSS_HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FORBIDDEN_VRM_RUNTIME_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FINGER_BONE_SET = new Set<string>(POSER_FINGER_BONES);
const FULL_VRM_STATE_KEYS = new Set([
  "version",
  "modelId",
  "poseId",
  "bones",
  "yOffset",
  "poseTranslations",
  "ikConstraints",
  "bodyRotation",
  "expressionId",
  "expressionWeights",
  "costume",
  "wardrobe",
  "props",
  "sceneProps",
  "physics",
  "bodyScale",
  "lighting",
  "env",
  "fingerOverrides",
  "materialFx",
  "avatarForge",
  "customColors",
]);
const FULL_VRM_FRAGMENT_KEYS = new Set([
  ...FULL_VRM_STATE_KEYS,
  "tool",
  "modelName",
  "vrmProps",
]);

function isFullVrmStateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFullVrmKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteFullVrmNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isStrictFullVrmVec3(value: unknown, maxAbs = MAX_VRM_RUNTIME_NUMBER): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((coordinate) => isFiniteFullVrmNumber(coordinate, -maxAbs, maxAbs));
}

function isStrictFullVrmPoseBones(value: unknown): value is PoseBoneMap {
  if (!isFullVrmStateRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > STUDIO_HUMANOID_BONE_NAMES.length) return false;
  for (const [boneName, rawBone] of entries) {
    if (!isStudioHumanoidBoneName(boneName) || !isFullVrmStateRecord(rawBone)) return false;
    const keys = Object.keys(rawBone);
    if (
      keys.length === 0
      || keys.some((key) => key !== "rotation" && key !== "direction")
    ) return false;
    if (Object.prototype.hasOwnProperty.call(rawBone, "rotation")
      && !isStrictFullVrmVec3(rawBone.rotation, Math.PI * 4)) return false;
    if (Object.prototype.hasOwnProperty.call(rawBone, "direction")) {
      const direction = rawBone.direction;
      if (Array.isArray(direction)) {
        if (!isStrictFullVrmVec3(direction, 4)) return false;
      } else if (
        !isFullVrmStateRecord(direction)
        || !hasOnlyFullVrmKeys(direction, new Set(["sideX", "y", "z"]))
        || !Object.prototype.hasOwnProperty.call(direction, "sideX")
        || !Object.prototype.hasOwnProperty.call(direction, "y")
        || !isFiniteFullVrmNumber(direction.sideX, -4, 4)
        || !isFiniteFullVrmNumber(direction.y, -4, 4)
        || (Object.prototype.hasOwnProperty.call(direction, "z")
          && !isFiniteFullVrmNumber(direction.z, -4, 4))
      ) return false;
    }
  }
  return true;
}

function isStrictFullVrmFingerOverrides(value: unknown): value is FingerRotationMap {
  if (!isFullVrmStateRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= POSER_FINGER_BONES.length
    && entries.every(([boneName, rotation]) => (
      FINGER_BONE_SET.has(boneName) && isStrictFullVrmVec3(rotation, Math.PI * 4)
    ));
}

function isSafeFullVrmRuntimeKey(key: string): boolean {
  return SAFE_VRM_RUNTIME_KEY_PATTERN.test(key)
    && !FORBIDDEN_VRM_RUNTIME_KEYS.has(key.toLowerCase());
}

function isStrictFullVrmNumberRecord(
  value: unknown,
  maxEntries: number,
  min: number,
  max: number,
): value is Record<string, number> {
  if (!isFullVrmStateRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= maxEntries && entries.every(([key, entry]) => (
    isSafeFullVrmRuntimeKey(key) && isFiniteFullVrmNumber(entry, min, max)
  ));
}

function isStrictFullVrmBodyScale(value: unknown): value is BodyScale {
  return isFullVrmStateRecord(value)
    && Object.keys(value).length === 2
    && Object.prototype.hasOwnProperty.call(value, "height")
    && Object.prototype.hasOwnProperty.call(value, "width")
    && isFiniteFullVrmNumber(value.height, 0.5, 1.6)
    && isFiniteFullVrmNumber(value.width, 0.5, 1.6);
}

function isStrictFullVrmCustomColors(value: unknown): value is Record<string, string> {
  if (!isFullVrmStateRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 32 && entries.every(([key, color]) => (
    isSafeFullVrmRuntimeKey(key)
    && typeof color === "string"
    && CSS_HEX_COLOR_PATTERN.test(color)
  ));
}

function isStrictFullVrmMaterialFx(value: unknown): boolean {
  if (!isFullVrmStateRecord(value)) return false;
  const colorKeys = ["shadeColor", "outlineColor", "rimColor", "emissiveColor"] as const;
  const allowed = new Set([...colorKeys, "rimIntensity", "emissiveIntensity"]);
  return Object.keys(value).length <= allowed.size
    && hasOnlyFullVrmKeys(value, allowed)
    && colorKeys.every((key) => (
      !Object.prototype.hasOwnProperty.call(value, key)
      || value[key] === null
      || (typeof value[key] === "string" && CSS_HEX_COLOR_PATTERN.test(value[key]))
    ))
    && (!Object.prototype.hasOwnProperty.call(value, "rimIntensity")
      || isFiniteFullVrmNumber(value.rimIntensity, 0, 1))
    && (!Object.prototype.hasOwnProperty.call(value, "emissiveIntensity")
      || isFiniteFullVrmNumber(value.emissiveIntensity, 0, 1));
}

function isStrictFullVrmLighting(value: unknown): value is LightingParams {
  if (!isFullVrmStateRecord(value)) return false;
  return Object.keys(value).length === 3
    && hasOnlyFullVrmKeys(value, new Set(["intensity", "colorTemp", "directionDeg"]))
    && isFiniteFullVrmNumber(value.intensity, 0.1, 4)
    && isFiniteFullVrmNumber(value.colorTemp, 0, 1)
    && isFiniteFullVrmNumber(value.directionDeg, -180, 180);
}

function isStrictFullVrmPhysics(value: unknown): value is VrmPhysicsSettings {
  if (!isFullVrmStateRecord(value)) return false;
  const keys = new Set([
    "version",
    "stiffnessScale",
    "gravityScale",
    "windDirectionDeg",
    "windStrength",
  ]);
  if (Object.keys(value).length !== keys.size || !hasOnlyFullVrmKeys(value, keys)) return false;
  const normalized = parseVrmPhysicsSettings(value);
  return value.version === normalized.version
    && value.stiffnessScale === normalized.stiffnessScale
    && value.gravityScale === normalized.gravityScale
    && value.windDirectionDeg === normalized.windDirectionDeg
    && value.windStrength === normalized.windStrength;
}

function isSafeFullVrmOpaqueId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_VRM_STATE_TEXT_LENGTH) {
    return false;
  }
  return value === value.trim() && !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isBoundedFullVrmRuntimeData(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): boolean {
  state.nodes += 1;
  if (state.nodes > MAX_VRM_RUNTIME_DATA_NODES || depth > MAX_VRM_RUNTIME_DATA_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return Array.from(value).length <= MAX_VRM_RUNTIME_STRING_LENGTH;
  if (Array.isArray(value)) {
    return value.length <= MAX_VRM_RUNTIME_ARRAY_ITEMS
      && value.every((item) => isBoundedFullVrmRuntimeData(item, state, depth + 1));
  }
  if (!isFullVrmStateRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_VRM_RUNTIME_OBJECT_KEYS
    && entries.every(([key, entry]) => (
      isSafeFullVrmRuntimeKey(key)
      && isBoundedFullVrmRuntimeData(entry, state, depth + 1)
    ));
}

function hasStrictFullVrmRuntimeFields(value: Record<string, unknown>): boolean {
  if (!isStrictFullVrmPoseBones(value.bones)) return false;
  if (value.modelId !== undefined && normalizeFullVrmModelId(value.modelId) !== value.modelId) return false;
  if (value.poseId !== undefined && !isSafeFullVrmOpaqueId(value.poseId)) return false;
  if (value.expressionId !== undefined && !isSafeFullVrmOpaqueId(value.expressionId)) return false;
  if (value.expressionWeights !== undefined
    && !isStrictFullVrmNumberRecord(value.expressionWeights, 64, 0, 1)) return false;
  if (value.fingerOverrides !== undefined
    && !isStrictFullVrmFingerOverrides(value.fingerOverrides)) return false;
  if (value.bodyScale !== undefined && !isStrictFullVrmBodyScale(value.bodyScale)) return false;
  if (value.customColors !== undefined && !isStrictFullVrmCustomColors(value.customColors)) return false;
  if (value.materialFx !== undefined && !isStrictFullVrmMaterialFx(value.materialFx)) return false;
  if (value.lighting !== undefined && !isStrictFullVrmLighting(value.lighting)) return false;
  if (value.physics !== undefined && !isStrictFullVrmPhysics(value.physics)) return false;
  if (value.env !== undefined && !["none", "floor", "wall", "room", "outdoor"].includes(String(value.env))) {
    return false;
  }
  for (const key of ["costume", "wardrobe", "props", "sceneProps", "avatarForge"] as const) {
    if (value[key] !== undefined && !isBoundedFullVrmRuntimeData(value[key], { nodes: 0 })) return false;
  }
  return true;
}

/** 외부 저장/공유 데이터가 NaN, Infinity, 과도한 회전을 React/Three 상태에 주입하지 못하게 한다. */
export function normalizeVrmBodyRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-Math.PI, Math.min(Math.PI, value));
}

function normalizeFullVrmYOffset(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-10, Math.min(10, Object.is(value, -0) ? 0 : value));
}

/**
 * 모델 ID는 opaque storage key로 취급하되, 히스토리 소유권 비교에 부적합한 빈 값·제어문자·
 * 과도한 문자열은 보존하지 않는다.
 */
export function normalizeFullVrmModelId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value || value.length > MAX_VRM_MODEL_ID_LENGTH || value !== value.trim()) return undefined;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return undefined;
  }
  return value;
}

/**
 * Undo/redo는 명시적 포즈 이식이 아니다. 소유권이 없거나 현재 모델과 다르면 fail closed한다.
 * 구버전 저장 상태는 명시적 불러오기 경로에서는 계속 사용할 수 있다.
 */
export function canRestoreFullVrmHistoryState(state: FullVrmStateInput, activeModelId: unknown): boolean {
  const stateModelId = normalizeFullVrmModelId(state.modelId);
  const currentModelId = normalizeFullVrmModelId(activeModelId);
  return stateModelId !== undefined && currentModelId !== undefined && stateModelId === currentModelId;
}

export function serializeFullVrmState(
  state: Partial<Omit<FullVrmState, "version" | "ikConstraints">> & {
    version?: 2 | 3;
    ikConstraints?: unknown;
  },
): FullVrmState {
  const poseTranslations = normalizeStudioVrmPoseTranslations(state.poseTranslations)
    ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS;
  const ikConstraints = parseStudioVrmIkConstraints(state.ikConstraints ?? []) ?? [];
  return {
    version: 3,
    modelId: normalizeFullVrmModelId(state.modelId),
    poseId: state.poseId,
    bones: state.bones || {},
    yOffset: normalizeFullVrmYOffset(state.yOffset),
    poseTranslations,
    ikConstraints: cloneStudioVrmIkConstraints(ikConstraints),
    bodyRotation: normalizeVrmBodyRotation(state.bodyRotation),
    expressionId: state.expressionId,
    expressionWeights: state.expressionWeights,
    costume: state.costume,
    wardrobe: state.wardrobe,
    props: state.props,
    sceneProps: state.sceneProps,
    physics: state.physics,
    bodyScale: state.bodyScale,
    lighting: state.lighting,
    env: state.env,
    fingerOverrides: state.fingerOverrides,
    materialFx: state.materialFx,
    avatarForge: state.avatarForge,
    customColors: state.customColors,
  };
}

/** Strict external reader: current v3 must contain the exact canonical persistent-IK block. */
export function deserializeFullVrmState(value: unknown): FullVrmState | null {
  if (!isFullVrmStateRecord(value) || (value.version !== 2 && value.version !== 3)) return null;
  const keys = Object.keys(value);
  if (
    keys.some((key) => !FULL_VRM_STATE_KEYS.has(key))
    || !Object.prototype.hasOwnProperty.call(value, "bones")
    || !Object.prototype.hasOwnProperty.call(value, "yOffset")
    || !Object.prototype.hasOwnProperty.call(value, "bodyRotation")
    || !hasStrictFullVrmRuntimeFields(value)
  ) return null;
  const hasPoseTranslations = Object.prototype.hasOwnProperty.call(value, "poseTranslations");
  const normalizedTranslations = hasPoseTranslations
    ? normalizeStudioVrmPoseTranslations(value.poseTranslations)
    : null;
  if (value.version === 2) {
    if (Object.prototype.hasOwnProperty.call(value, "ikConstraints")) return null;
    if (
      hasPoseTranslations
      && (!normalizedTranslations
        || JSON.stringify(normalizedTranslations) !== JSON.stringify(value.poseTranslations))
    ) return null;
  } else {
    if (!Object.prototype.hasOwnProperty.call(value, "ikConstraints")) return null;
    const constraints = parseStudioVrmIkConstraints(value.ikConstraints);
    if (!constraints || JSON.stringify(constraints) !== JSON.stringify(value.ikConstraints)) return null;
    if (
      !hasPoseTranslations
      || !normalizedTranslations
      || JSON.stringify(normalizedTranslations) !== JSON.stringify(value.poseTranslations)
    ) return null;
  }
  if (
    typeof value.yOffset !== "number"
    || normalizeFullVrmYOffset(value.yOffset) !== value.yOffset
    || normalizeVrmBodyRotation(value.bodyRotation) !== value.bodyRotation
    || !isFullVrmStateRecord(value.bones)
  ) return null;
  return serializeFullVrmState(value as FullVrmStateInput);
}

export function applyFullState(vrm: VRM, state: FullVrmStateInput, applyers: {
  applyPose: (
    bones: PoseBoneMap,
    y: number,
    translations: StudioVrmPoseTranslations,
  ) => void;
  applyExpr: (weights: Record<string, number>) => void;
  applyCostume?: (c: unknown) => void;
  applyWardrobe?: (w: unknown) => void;
  applyProps?: (p: unknown) => void;
  applySceneProps?: (p: unknown) => void;
  applyPhysics?: (p: unknown) => void;
  applyMaterialFx?: (fx: VrmMaterialFx) => void;
  applyCustomColors?: (colors: Record<string, string>) => void;
}) {
  if (state.bones) applyers.applyPose(
    stripFingerBones(state.bones),
    state.yOffset ?? 0,
    normalizeStudioVrmPoseTranslations(state.poseTranslations)
      ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
  );
  if (state.expressionWeights) applyers.applyExpr(state.expressionWeights);
  if (state.bodyScale) applyBodyScale(vrm, state.bodyScale);
  if (state.fingerOverrides) applyFingerRotations(vrm, state.fingerOverrides);
  if (state.costume && applyers.applyCostume) applyers.applyCostume(state.costume);
  if (state.wardrobe && applyers.applyWardrobe) applyers.applyWardrobe(state.wardrobe);
  // Full-state 복원은 authoritative 하다. props 필드가 없더라도 빈 배열을 전달해 이전 장착물이
  // 다음 문서에 눌어붙지 않게 하고, 외부/구버전 입력은 반드시 동일 parser를 통과시킨다.
  if (applyers.applyProps) applyers.applyProps(parseVrmProps(state.props));
  if (applyers.applySceneProps) applyers.applySceneProps(parseSceneProps(state.sceneProps));
  if (state.physics && applyers.applyPhysics) applyers.applyPhysics(state.physics);
  if (state.materialFx && applyers.applyMaterialFx) applyers.applyMaterialFx(state.materialFx);
  if (state.customColors && applyers.applyCustomColors) applyers.applyCustomColors(state.customColors);
  // lighting/env applied in scene setup (UI side)
}

export function stripFingerBones(bones: PoseBoneMap): PoseBoneMap {
  const result: PoseBoneMap = {};
  (Object.keys(bones) as VRMHumanBoneName[]).forEach((k) => {
    if (!POSER_FINGER_BONES.includes(k)) {
      result[k] = bones[k];
    }
  });
  return result;
}

export function applyPoserVisualState(
  vrm: VRM,
  state: {
    bones: PoseBoneMap;
    yOffset?: number;
    poseTranslations?: StudioVrmPoseTranslations;
    fingerEdits?: FingerRotationMap;
    bodyScale?: BodyScale;
  }
) {
  const {
    bones,
    yOffset = 0,
    poseTranslations = EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
    fingerEdits = {},
    bodyScale,
  } = state;
  applyPoseToVrm(vrm, stripFingerBones(bones), yOffset, poseTranslations);
  if (Object.keys(fingerEdits).length) {
    applyFingerRotations(vrm, fingerEdits);
    // Match applyPoseToVrm: finger curl can lift palm.y; re-tip hanging hands down/medial.
    correctVrmHangingHandPalmTwist(vrm);
  }
  if (bodyScale) {
    applyBodyScale(vrm, bodyScale);
  }
}

/**
 * Pure planner for full state restore (AC2).
 * Returns a plan object with every React state field + stripped bones.
 */
export function planFullStateRestore(state: FullVrmStateInput): {
  modelId?: string;
  strippedBones: PoseBoneMap;
  yOffset: number;
  poseTranslations: StudioVrmPoseTranslations;
  ikConstraints: readonly StudioVrmIkConstraint[];
  bodyRotation: number;
  expressionWeights: Record<string, number>;
  bodyScale?: BodyScale;
  lighting?: LightingParams;
  env?: EnvVariant;
  fingerOverrides?: FingerRotationMap;
  costume?: unknown;
  wardrobe?: unknown;
  /** 항상 정규화된 소품 목록. props가 없는 authoritative 상태는 빈 목록으로 복원한다. */
  propsItems: PropInstance[];
  sceneProps: SerializedSceneProps;
  physics?: unknown;
  materialFx?: VrmMaterialFx;
  avatarForge?: unknown;
  customColors?: Record<string, string>;
} {
  return {
    modelId: normalizeFullVrmModelId(state.modelId),
    strippedBones: stripFingerBones(state.bones || {}),
    yOffset: state.yOffset ?? 0,
    poseTranslations: normalizeStudioVrmPoseTranslations(state.poseTranslations)
      ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
    ikConstraints: cloneStudioVrmIkConstraints(
      parseStudioVrmIkConstraints(state.ikConstraints) ?? [],
    ),
    bodyRotation: normalizeVrmBodyRotation(state.bodyRotation),
    expressionWeights: state.expressionWeights || {},
    bodyScale: state.bodyScale,
    lighting: state.lighting,
    env: state.env,
    fingerOverrides: state.fingerOverrides,
    costume: state.costume,
    wardrobe: state.wardrobe,
    propsItems: parseVrmProps(state.props).items,
    sceneProps: parseSceneProps(state.sceneProps),
    physics: state.physics,
    materialFx: state.materialFx,
    avatarForge: state.avatarForge,
    customColors: state.customColors,
  };
}

/**
 * 공유 PNG와 캔버스 삽입 PNG가 동일한 authoritative full-state 직렬화를 사용하게 한다.
 * 기존 재편집 payload가 기대하는 `vrmProps` 별칭은 유지한다.
 */
export function buildVrmPoseDataUrlMetadata(state: Partial<FullVrmState>, modelName: string) {
  const { props, ...fullState } = serializeFullVrmState(state);
  return {
    tool: "vrm-poser" as const,
    ...fullState,
    modelName,
    vrmProps: props,
  };
}

/**
 * Pure helpers so component handlers can delegate.
 * Tests import and call these (aliased as handle*) to drive the exact shipped restore logic.
 */
export function buildFullVrmStateFromSharedDataUrl(dataUrl: string): FullVrmState | null {
  try {
    const hashIndex = dataUrl.indexOf("#");
    if (hashIndex === -1) return null;
    const hashStr = dataUrl.substring(hashIndex + 1);
    const poseData: unknown = JSON.parse(decodeURIComponent(hashStr));
    if (!isFullVrmStateRecord(poseData)) return null;
    const keys = Object.keys(poseData);
    if (
      keys.some((key) => !FULL_VRM_FRAGMENT_KEYS.has(key))
      || (poseData.tool !== undefined && poseData.tool !== "vrm-poser")
      || (poseData.version !== undefined && poseData.version !== 2 && poseData.version !== 3)
    ) return null;
    const sourceVersion = poseData.version === 3 ? 3 : 2;
    if (sourceVersion === 3) {
      for (const requiredKey of [
        "bones",
        "yOffset",
        "bodyRotation",
        "poseTranslations",
        "ikConstraints",
      ]) {
        if (!Object.prototype.hasOwnProperty.call(poseData, requiredKey)) return null;
      }
    }
    const candidate = {
      version: sourceVersion,
      modelId: poseData.modelId,
      poseId: poseData.poseId,
      bones: poseData.bones || {},
      yOffset: typeof poseData.yOffset === "number" ? poseData.yOffset : 0,
      bodyRotation: sourceVersion === 2 && poseData.bodyRotation === undefined
        ? 0
        : poseData.bodyRotation,
      expressionId: poseData.expressionId,
      expressionWeights: poseData.expressionWeights || {},
      bodyScale: poseData.bodyScale,
      fingerOverrides: poseData.fingerOverrides,
      lighting: poseData.lighting,
      env: poseData.env,
      costume: poseData.costume,
      wardrobe: poseData.wardrobe,
      props: poseData.props != null
        ? parseVrmProps(poseData.props)
        : poseData.vrmProps != null
          ? parseVrmProps(poseData.vrmProps)
          : undefined,
      sceneProps: poseData.sceneProps != null ? parseSceneProps(poseData.sceneProps) : undefined,
      physics: poseData.physics,
      materialFx: poseData.materialFx,
      avatarForge: poseData.avatarForge,
      customColors: poseData.customColors,
      ...(sourceVersion === 3 || Object.prototype.hasOwnProperty.call(poseData, "poseTranslations")
        ? { poseTranslations: poseData.poseTranslations }
        : {}),
      ...(sourceVersion === 3 ? { ikConstraints: poseData.ikConstraints } : {}),
    };
    return deserializeFullVrmState(candidate);
  } catch {
    return null;
  }
}

/**
 * Factory so that the real handlers inside the component and the tests
 * use the exact same logic objects.
 * Tests call the returned handle* functions with controlled deps.
 */
export function createFullStateLoadHandlers(deps: {
  savedFullStates: Record<string, FullVrmState>;
  commitFullStateRestore: (s: FullVrmState, vrm: VRM | null) => void;
  vrmRef: { current: VRM | null };
  setActivePoseId?: (id: string) => void;
  setCustomColors?: (c: Record<string, string>) => void;
  alertFn?: (msg: string) => void;
}) {
  return {
    handleLoadFullLocal(name: string) {
      const s = deps.savedFullStates[name];
      if (!s) return;
      deps.commitFullStateRestore(s, deps.vrmRef.current);
    },
    handlePasteFullStateFromParsed(s: FullVrmStateInput | null) {
      const full = deserializeFullVrmState(s);
      if (!full) return;
      deps.commitFullStateRestore(full, deps.vrmRef.current);
    },
    handleSelectSharedPose(asset: { dataUrl: string }) {
      const full = buildFullVrmStateFromSharedDataUrl(asset.dataUrl);
      if (!full) {
        deps.alertFn?.("이 포즈 에셋에는 3D 설정 정보가 포함되어 있지 않습니다.");
        return false;
      }
      deps.commitFullStateRestore(full, deps.vrmRef.current);

      try {
        const hashIndex = asset.dataUrl.indexOf("#");
        if (hashIndex !== -1) {
          const poseData = JSON.parse(decodeURIComponent(asset.dataUrl.substring(hashIndex + 1)));
          if (poseData.customColors && deps.setCustomColors) {
            deps.setCustomColors(poseData.customColors);
          }
        }
      } catch {}
      return true;
    },
  };
}
