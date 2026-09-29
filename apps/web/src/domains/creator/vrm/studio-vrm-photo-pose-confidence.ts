import type {
  StudioVrmPhotoPoseConfidenceSummary,
  StudioVrmPhotoPoseJointConfidence,
} from "./studio-vrm-photo-pose";

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * MediaPipe 관절 신뢰도 임계값. `summarizeStudioVrmPhotoPoseConfidence`가
 * 저신뢰 그룹을 가르는 0.5 기준과 같은 값을 쓴다.
 */
export const STUDIO_VRM_PHOTO_POSE_LOW_CONFIDENCE_JOINT_THRESHOLD = 0.5;

export type StudioVrmPhotoPoseJointKey = keyof StudioVrmPhotoPoseJointConfidence;

export const STUDIO_VRM_PHOTO_POSE_JOINT_LABELS: Readonly<
  Record<StudioVrmPhotoPoseJointKey, string>
> = {
  leftShoulder: "왼쪽 어깨",
  rightShoulder: "오른쪽 어깨",
  leftElbow: "왼쪽 팔꿈치",
  rightElbow: "오른쪽 팔꿈치",
  leftWrist: "왼쪽 손목",
  rightWrist: "오른쪽 손목",
  leftHip: "왼쪽 엉덩이",
  rightHip: "오른쪽 엉덩이",
  leftKnee: "왼쪽 무릎",
  rightKnee: "오른쪽 무릎",
  leftAnkle: "왼쪽 발목",
  rightAnkle: "오른쪽 발목",
};

/**
 * MediaPipe 관절 → 해당 랜드마크가 회전을 결정하는 VRM 휴머노이드 본.
 * 저신뢰 관절은 이 본들에 노란색 마커로 표시되고, 마커 클릭 시 같은 본들의
 * 수동 회전 조정으로 이어진다.
 */
export const STUDIO_VRM_PHOTO_POSE_JOINT_BONES: Readonly<
  Record<StudioVrmPhotoPoseJointKey, readonly VRMHumanBoneName[]>
> = {
  leftShoulder: ["leftShoulder"],
  rightShoulder: ["rightShoulder"],
  leftElbow: ["leftUpperArm", "leftLowerArm"],
  rightElbow: ["rightUpperArm", "rightLowerArm"],
  leftWrist: ["leftLowerArm", "leftHand"],
  rightWrist: ["rightLowerArm", "rightHand"],
  leftHip: ["hips", "leftUpperLeg"],
  rightHip: ["hips", "rightUpperLeg"],
  leftKnee: ["leftUpperLeg", "leftLowerLeg"],
  rightKnee: ["rightUpperLeg", "rightLowerLeg"],
  leftAnkle: ["leftLowerLeg", "leftFoot"],
  rightAnkle: ["rightLowerLeg", "rightFoot"],
};

const JOINT_DISPLAY_ORDER: readonly StudioVrmPhotoPoseJointKey[] = [
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
];

/** 신뢰도가 임계값 미만인 관절을 화면 표시 순서대로 돌려준다. */
export function listStudioVrmPhotoPoseLowConfidenceJoints(
  confidence: StudioVrmPhotoPoseConfidenceSummary,
): readonly StudioVrmPhotoPoseJointKey[] {
  return JOINT_DISPLAY_ORDER.filter(
    (joint) => confidence.joints[joint] < STUDIO_VRM_PHOTO_POSE_LOW_CONFIDENCE_JOINT_THRESHOLD,
  );
}

/**
 * 저신뢰 관절이 구동하는 VRM 본을 중복 없이 화면 표시 순서대로 돌려준다.
 * 3D 뷰어 하이라이트와 수동 보정 진입점이 같은 목록을 공유한다.
 */
export function listStudioVrmPhotoPoseLowConfidenceBones(
  confidence: StudioVrmPhotoPoseConfidenceSummary,
): readonly VRMHumanBoneName[] {
  const bones: VRMHumanBoneName[] = [];
  for (const joint of listStudioVrmPhotoPoseLowConfidenceJoints(confidence)) {
    for (const bone of STUDIO_VRM_PHOTO_POSE_JOINT_BONES[joint]) {
      if (!bones.includes(bone)) bones.push(bone);
    }
  }
  return Object.freeze(bones);
}
