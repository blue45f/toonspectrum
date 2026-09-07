import { describe, expect, it } from "vitest";

import {
  createDefaultCharacterPoseConstraintProfile,
  normalizeCharacterQuaternion,
  solveCharacterPoseV2,
} from "./character-pose-v2";

import type { CharacterPoseCandidateV2 } from "./character-pose-v2";

function candidate(): CharacterPoseCandidateV2 {
  return {
    candidateId: "photo-1",
    generationId: 3,
    source: "photo",
    root: { position: [0, 0.2, 0], rotation: [0, 0, 0, 1] },
    bones: {
      leftUpperArm: [0, 0.7, 0, 0.7],
      leftLowerArm: [0, 1, 0, 0],
      leftUpperLeg: [0.2, 0, 0, 0.98],
    },
    confidence: {
      overall: 0.8,
      regions: { "left-arm": 0.9, "left-leg": 0.2 },
      joints: {},
    },
    contacts: [{
      id: "left-foot-ground",
      kind: "ground",
      bone: "leftFoot",
      target: [0, 0, 0],
      weight: 1,
      tolerance: 0.01,
    }],
    warnings: [],
  };
}

describe("character pose v2", () => {
  it("normalizes invalid quaternions safely", () => {
    expect(normalizeCharacterQuaternion([0, 0, 0, 0])).toEqual([0, 0, 0, 1]);
    const value = normalizeCharacterQuaternion([0, 2, 0, 2]);
    expect(Math.hypot(...value)).toBeCloseTo(1);
  });

  it("preserves unselected and low-confidence regions", () => {
    const result = solveCharacterPoseV2({
      candidate: candidate(),
      selectedRegions: ["left-arm", "left-leg"],
      currentBones: {
        leftUpperArm: [0, 0, 0, 1],
        leftUpperLeg: [0, 0, 0, 1],
      },
      footPositions: { leftFoot: [0, 0.12, 0] },
      profile: createDefaultCharacterPoseConstraintProfile(),
    });
    expect(result.appliedBones).toContain("leftUpperArm");
    expect(result.preservedBones).toContain("leftUpperLeg");
    expect(result.candidate.bones.leftUpperLeg).toEqual([0, 0, 0, 1]);
    expect(result.groundedBy).toBeCloseTo(-0.12);
    expect(result.candidate.root.position[1]).toBeCloseTo(0.08);
  });

  it("clamps excessive joint swing and reports broken contacts", () => {
    const value = candidate();
    const result = solveCharacterPoseV2({
      candidate: value,
      currentBones: {},
      footPositions: { leftFoot: [0, 0.25, 0] },
      profile: {
        ...createDefaultCharacterPoseConstraintProfile(),
        smoothing: 0,
        joints: [{
          bone: "leftLowerArm",
          maximumSwingRadians: Math.PI / 4,
          minimumTwistRadians: -Math.PI,
          maximumTwistRadians: Math.PI,
        }],
      },
    });
    const arm = result.candidate.bones.leftLowerArm!;
    expect(2 * Math.acos(Math.abs(arm[3]))).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
    expect(result.candidate.warnings.some((warning) => warning.includes("접점"))).toBe(true);
  });
});
