import { describe, expect, it } from "vitest";

import { POSE_PRESETS } from "./StudioVrmPoser";

const MAX_SINGLE_AXIS_DEGREES = 90;
const MAX_HEAD_AXIS_DEGREES = 10;
const MAX_TORSO_AXIS_DEGREES = 9;
const MIN_DEFAULT_ARM_Z_DEGREES = 74;
const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["hips", "spine", "chest"]);

function toDegrees(radians: number) {
  return Math.round((radians * 180) / Math.PI);
}

describe("StudioVrmPoser pose presets", () => {
  it("keeps bundled poses inside restrained single-axis rotation ranges", () => {
    const overloadedRotations = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) =>
        rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > MAX_SINGLE_AXIS_DEGREES ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        })
      )
    );

    expect(overloadedRotations).toEqual([]);
  });

  it("keeps head and torso motion subtle so poses do not look contorted", () => {
    const awkwardCoreRotations = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) => {
        const limit = HEAD_BONES.has(boneName) ? MAX_HEAD_AXIS_DEGREES : TORSO_BONES.has(boneName) ? MAX_TORSO_AXIS_DEGREES : null;
        if (limit === null) return [];

        return rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > limit ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        });
      })
    );

    expect(awkwardCoreRotations).toEqual([]);
  });

  it("uses a relaxed default stance with arms resting near the sides", () => {
    const defaultPose = POSE_PRESETS.find((pose) => pose.id === "default");
    const leftUpperArmZ = Math.abs(toDegrees(defaultPose?.bones.leftUpperArm?.[2] ?? 0));
    const rightUpperArmZ = Math.abs(toDegrees(defaultPose?.bones.rightUpperArm?.[2] ?? 0));

    expect(defaultPose?.bones.leftUpperArm?.[2]).toBeDefined();
    expect(defaultPose?.bones.rightUpperArm?.[2]).toBeDefined();
    expect(leftUpperArmZ).toBeGreaterThanOrEqual(MIN_DEFAULT_ARM_Z_DEGREES);
    expect(leftUpperArmZ).toBeLessThanOrEqual(MAX_SINGLE_AXIS_DEGREES);
    expect(rightUpperArmZ).toBeGreaterThanOrEqual(MIN_DEFAULT_ARM_Z_DEGREES);
    expect(rightUpperArmZ).toBeLessThanOrEqual(MAX_SINGLE_AXIS_DEGREES);
  });

  it("offers calm comic-panel pose options with natural labels", () => {
    expect(POSE_PRESETS.map((pose) => pose.id)).toEqual([
      "default",
      "wave",
      "point",
      "cheer",
      "think",
      "sit",
      "run",
      "present",
      "support",
      "despair",
      "attack",
      "defense",
    ]);
    expect(POSE_PRESETS.map((pose) => pose.label)).toEqual([
      "기본",
      "손인사",
      "대화",
      "기쁨",
      "생각",
      "앉기",
      "걷기",
      "설명",
      "응원",
      "낙담",
      "준비",
      "방어",
    ]);
  });
});
