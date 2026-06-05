import { describe, expect, it } from "vitest";

import { POSE_PRESETS } from "./StudioVrmPoser";

const MAX_SINGLE_AXIS_DEGREES = 90;
const MAX_HEAD_AXIS_DEGREES = 10;
const MAX_TORSO_AXIS_DEGREES = 9;
const MIN_DEFAULT_ARM_Z_DEGREES = 74;
const MIN_UPPER_ARM_REST_Z_DEGREES = 78;
const MAX_UPPER_ARM_XY_DEGREES = 8;
const MAX_FOREARM_AXIS_DEGREES = 12;
const MAX_HAND_AXIS_DEGREES = 8;
const MAX_LEG_AXIS_DEGREES = 20;
const MAX_Y_OFFSET = 0.12;
const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["hips", "spine", "chest"]);
const UPPER_ARM_BONES = new Set(["leftUpperArm", "rightUpperArm"]);
const FOREARM_BONES = new Set(["leftLowerArm", "rightLowerArm"]);
const HAND_BONES = new Set(["leftHand", "rightHand"]);
const LEG_BONES = new Set(["leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot"]);

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

  it("keeps every pose with upper arms resting close to the body", () => {
    const wideUpperArms = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) => {
        if (!UPPER_ARM_BONES.has(boneName)) return [];

        const [x, y, z] = rotation.map(toDegrees);
        const issues = [];
        if (Math.abs(x) > MAX_UPPER_ARM_XY_DEGREES) issues.push(`${pose.id}:${boneName}:x:${x}`);
        if (Math.abs(y) > MAX_UPPER_ARM_XY_DEGREES) issues.push(`${pose.id}:${boneName}:y:${y}`);
        if (Math.abs(z) < MIN_UPPER_ARM_REST_Z_DEGREES || Math.abs(z) > MAX_SINGLE_AXIS_DEGREES) issues.push(`${pose.id}:${boneName}:z:${z}`);
        return issues;
      })
    );

    expect(wideUpperArms).toEqual([]);
  });

  it("keeps forearms and hands from making exaggerated gestures", () => {
    const awkwardArmEnds = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) => {
        const limit = FOREARM_BONES.has(boneName) ? MAX_FOREARM_AXIS_DEGREES : HAND_BONES.has(boneName) ? MAX_HAND_AXIS_DEGREES : null;
        if (limit === null) return [];

        return rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > limit ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        });
      })
    );

    expect(awkwardArmEnds).toEqual([]);
  });

  it("keeps lower-body movement subtle instead of forcing broken sitting or running poses", () => {
    const awkwardLegs = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) => {
        if (!LEG_BONES.has(boneName)) return [];

        return rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > MAX_LEG_AXIS_DEGREES ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        });
      })
    );

    const awkwardOffsets = POSE_PRESETS.flatMap((pose) => (Math.abs(pose.yOffset ?? 0) > MAX_Y_OFFSET ? [`${pose.id}:yOffset:${pose.yOffset}`] : []));

    expect([...awkwardLegs, ...awkwardOffsets]).toEqual([]);
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
