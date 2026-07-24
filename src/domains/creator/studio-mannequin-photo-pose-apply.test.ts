import { describe, expect, it } from "vitest";

import { createStudioMannequinPhotoPoseApplyPlan } from "./studio-mannequin-photo-pose-apply";

describe("createStudioMannequinPhotoPoseApplyPlan", () => {
  it("creates pose snapshot from joint eulers", () => {
    const plan = createStudioMannequinPhotoPoseApplyPlan({
      joints: {
        leftUpperArm: [0.1, 0, 0.4],
        rightUpperArm: [0.1, 0, -0.4],
      },
    });

    expect(plan.appliedJoints).toEqual(["leftUpperArm", "rightUpperArm"]);
    expect(plan.skippedJoints).toEqual([]);
    expect(plan.pose.joints.leftUpperArm).toBeDefined();
    expect(plan.pose.joints.rightUpperArm).toBeDefined();
  });

  it("calculates arm pose from 2D landmarks", () => {
    const plan = createStudioMannequinPhotoPoseApplyPlan({
      landmarks: {
        leftShoulder: { x: 0.4, y: 0.3 },
        leftElbow: { x: 0.6, y: 0.5 },
        leftWrist: { x: 0.7, y: 0.8 },
      },
    });

    expect(plan.appliedJoints).toContain("leftUpperArm");
    expect(plan.appliedJoints).toContain("leftLowerArm");
    expect(plan.pose.joints.leftUpperArm).toBeDefined();
  });
});
