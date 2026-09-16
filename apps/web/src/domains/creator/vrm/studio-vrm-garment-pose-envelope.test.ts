import { describe, expect, it } from "vitest";

import {
  inspectStudioVrmGarmentPoseEnvelope,
  studioVrmGarmentPoseAllowanceForRegions,
} from "./studio-vrm-garment-pose-envelope";
import type { PoseBoneMap } from "./studio-vrm-poser-utils";

const relaxed: PoseBoneMap = {
  hips: { rotation: [0, 0.02, 0.02] },
  spine: { rotation: [0.02, -0.02, -0.02] },
  leftUpperArm: { direction: { sideX: 0.35, y: -0.94, z: 0 } },
  rightUpperArm: { direction: { sideX: 0.35, y: -0.94, z: 0 } },
  leftLowerArm: { direction: { sideX: 0.2, y: -0.98, z: 0 } },
  rightLowerArm: { direction: { sideX: 0.2, y: -0.98, z: 0 } },
  leftUpperLeg: { direction: { sideX: 0.08, y: -1, z: 0 } },
  rightUpperLeg: { direction: { sideX: 0.08, y: -1, z: 0 } },
};

const actionPose: PoseBoneMap = {
  hips: { rotation: [0.72, 0.12, 0.35] },
  spine: { rotation: [-0.48, 0.22, -0.32] },
  leftUpperArm: { direction: { sideX: 0.32, y: 0.92, z: 0.18 } },
  rightUpperArm: { direction: { sideX: 0.8, y: 0.18, z: 0.55 } },
  leftLowerArm: { direction: { sideX: 0.18, y: 0.96, z: 0.12 } },
  rightLowerArm: { direction: { sideX: 0.12, y: 0.18, z: 0.98 } },
  leftUpperLeg: { direction: { sideX: 0.45, y: -0.34, z: 0.82 } },
  rightUpperLeg: { direction: { sideX: 0.15, y: -0.52, z: -0.84 } },
  leftLowerLeg: { direction: { sideX: 0.04, y: -0.35, z: -0.94 } },
  rightLowerLeg: { direction: { sideX: 0.04, y: -0.44, z: 0.9 } },
  leftFoot: { rotation: [0.55, 0.05, 0.31] },
};

describe("studio VRM garment pose envelope", () => {
  it("keeps relaxed standing poses at the authored motion allowance", () => {
    const envelope = inspectStudioVrmGarmentPoseEnvelope(relaxed);
    expect(envelope.peakLoad).toBeLessThan(0.02);
    expect(Object.values(envelope.allowanceM).every((value) => value < 0.0001)).toBe(true);
  });

  it("adds bounded region-specific room for raised arms and deeply flexed legs", () => {
    const envelope = inspectStudioVrmGarmentPoseEnvelope(actionPose);
    expect(envelope.allowanceM.arms).toBeGreaterThan(0.01);
    expect(envelope.allowanceM.legs).toBeGreaterThan(0.008);
    expect(envelope.allowanceM.torso).toBeGreaterThan(0.002);
    expect(envelope.allowanceM.arms).toBeLessThanOrEqual(0.018);
    expect(envelope.allowanceM.legs).toBeLessThanOrEqual(0.018);
  });

  it("uses the most demanding covered region and produces deterministic signatures", () => {
    const first = inspectStudioVrmGarmentPoseEnvelope(actionPose);
    const second = inspectStudioVrmGarmentPoseEnvelope({ ...actionPose });
    expect(studioVrmGarmentPoseAllowanceForRegions(first, ["torso", "arms"]))
      .toBe(first.allowanceM.arms);
    expect(second.signature).toBe(first.signature);
    expect(inspectStudioVrmGarmentPoseEnvelope(relaxed).signature).not.toBe(first.signature);
  });

  it("fails closed for malformed rotation and direction values", () => {
    const malformed = inspectStudioVrmGarmentPoseEnvelope({
      spine: { rotation: [Number.NaN, 99, 0] },
      leftUpperArm: { direction: { sideX: Number.POSITIVE_INFINITY, y: 0 } },
    });
    expect(malformed.peakLoad).toBe(0);
    expect(Object.values(malformed.allowanceM).every((value) => value === 0)).toBe(true);
  });
});
