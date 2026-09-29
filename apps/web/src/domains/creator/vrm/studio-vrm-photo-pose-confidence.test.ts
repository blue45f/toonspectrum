import { describe, expect, it } from "vitest";

import {
  listStudioVrmPhotoPoseLowConfidenceBones,
  listStudioVrmPhotoPoseLowConfidenceJoints,
  STUDIO_VRM_PHOTO_POSE_JOINT_BONES,
  STUDIO_VRM_PHOTO_POSE_JOINT_LABELS,
  STUDIO_VRM_PHOTO_POSE_LOW_CONFIDENCE_JOINT_THRESHOLD,
  type StudioVrmPhotoPoseJointKey,
} from "./studio-vrm-photo-pose-confidence";

import type { StudioVrmPhotoPoseConfidenceSummary } from "./studio-vrm-photo-pose";

const ALL_JOINTS = [
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
] as const satisfies readonly StudioVrmPhotoPoseJointKey[];

function makeConfidence(
  joints: Partial<Record<StudioVrmPhotoPoseJointKey, number>>,
): StudioVrmPhotoPoseConfidenceSummary {
  const resolved = Object.fromEntries(
    ALL_JOINTS.map((joint) => [joint, joints[joint] ?? 0.95]),
  ) as Record<StudioVrmPhotoPoseJointKey, number>;
  return {
    overall: 0.9,
    coverage: 1,
    quality: "high",
    groups: { torso: 0.9, leftArm: 0.9, rightArm: 0.9, leftLeg: 0.9, rightLeg: 0.9 },
    joints: resolved,
    lowConfidenceGroups: [],
  };
}

describe("studio-vrm-photo-pose-confidence", () => {
  it("임계값 미만 관절만 화면 표시 순서대로 나열한다", () => {
    expect(STUDIO_VRM_PHOTO_POSE_LOW_CONFIDENCE_JOINT_THRESHOLD).toBe(0.5);
    const confidence = makeConfidence({ rightKnee: 0.2, leftElbow: 0.49, leftWrist: 0.5 });
    expect(listStudioVrmPhotoPoseLowConfidenceJoints(confidence)).toEqual([
      "leftElbow",
      "rightKnee",
    ]);
  });

  it("모든 관절 라벨과 본 매핑이 비어 있지 않다", () => {
    for (const joint of ALL_JOINTS) {
      expect(STUDIO_VRM_PHOTO_POSE_JOINT_LABELS[joint]).toMatch(/\S/u);
      expect(STUDIO_VRM_PHOTO_POSE_JOINT_BONES[joint].length).toBeGreaterThan(0);
    }
  });

  it("저신뢰 관절의 VRM 본을 중복 없이 순서대로 모은다", () => {
    const confidence = makeConfidence({ leftElbow: 0.1, leftWrist: 0.1, rightAnkle: 0.3 });
    expect(listStudioVrmPhotoPoseLowConfidenceBones(confidence)).toEqual([
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightLowerLeg",
      "rightFoot",
    ]);
  });

  it("저신뢰 관절이 없으면 빈 목록을 돌려준다", () => {
    expect(listStudioVrmPhotoPoseLowConfidenceJoints(makeConfidence({}))).toEqual([]);
    expect(listStudioVrmPhotoPoseLowConfidenceBones(makeConfidence({}))).toEqual([]);
  });
});
