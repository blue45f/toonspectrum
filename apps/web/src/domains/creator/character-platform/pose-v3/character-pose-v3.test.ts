import { describe, expect, it } from "vitest";

import { migrateCharacterPoseV2ToV3 } from "./character-pose-migrate";
import { solveCharacterGroundBalance } from "./character-ground-balance-solver";
import { limitCharacterSwingTwist } from "./character-swing-twist";
import { solveCharacterTwoBoneIk } from "./character-two-bone-ik";
import {
  buildCharacterSupportPolygon,
  characterCenterOfMass,
  characterSupportMargin,
} from "./character-support-polygon";

import type { CharacterPoseCandidateV2 } from "../pose/character-pose-v2";

const candidate: CharacterPoseCandidateV2 = {
  candidateId: "pose:photo-1",
  generationId: 1,
  source: "photo",
  root: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
  bones: { leftUpperArm: [0, 0, 0, 1] },
  confidence: { overall: 0.9, regions: {}, joints: { leftUpperArm: 0.9 } },
  contacts: [{
    id: "left-foot-ground",
    kind: "ground",
    bone: "leftFoot",
    target: [0, 0, 0],
    weight: 1,
    tolerance: 0.003,
  }],
  warnings: [],
};

describe("character pose v3 foundation", () => {
  it("migrates V2 without losing the original candidate or contacts", () => {
    const migrated = migrateCharacterPoseV2ToV3(candidate);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.legacySource).toBe(candidate);
    expect(migrated.contacts[0]).toMatchObject({ mode: "support", bone: "leftFoot" });
  });

  it("clamps twist and elliptical swing independently", () => {
    const result = limitCharacterSwingTwist(
      [0.6, 0.6, 0.6, 0.2],
      {
        twistAxis: [0, 1, 0],
        maximumPrimarySwingRadians: 0.4,
        maximumSecondarySwingRadians: 0.2,
        minimumTwistRadians: -0.25,
        maximumTwistRadians: 0.25,
      },
    );
    expect(result.twistRadians).toBeLessThanOrEqual(0.25);
    expect(Math.hypot(result.primarySwingRadians / 0.4, result.secondarySwingRadians / 0.2)).toBeLessThanOrEqual(1.000001);
    expect(result.swingClamped || result.twistClamped).toBe(true);
  });

  it("solves a two-bone limb toward a reachable target while preserving lengths", () => {
    const result = solveCharacterTwoBoneIk({
      start: [0, 0, 0],
      joint: [1, 0, 0],
      end: [2, 0, 0],
      target: [1.2, 1.2, 0],
      pole: [0, 0, 1],
      stretch: 1,
    });
    expect(result.reachable).toBe(true);
    expect(result.error).toBeLessThan(1e-5);
    expect(Math.hypot(...result.joint)).toBeCloseTo(1, 5);
    expect(Math.hypot(
      result.end[0] - result.joint[0],
      result.end[1] - result.joint[1],
      result.end[2] - result.joint[2],
    )).toBeCloseTo(1, 5);
  });

  it("computes support margin and applies bounded ground/balance correction", () => {
    const polygon = buildCharacterSupportPolygon([[-0.2, -0.1], [0.2, -0.1], [0.2, 0.1], [-0.2, 0.1]]);
    expect(characterSupportMargin([0, 0], polygon)).toBeGreaterThan(0);
    expect(characterCenterOfMass([
      { id: "torso", position: [0.5, 1, 0], mass: 2 },
      { id: "legs", position: [0, 0.5, 0], mass: 2 },
    ])).toEqual([0.25, 0.75, 0]);

    const solved = solveCharacterGroundBalance({
      rootPosition: [0, 0.1, 0],
      groundY: 0,
      contacts: [{ id: "heel", position: [0, 0.02, 0], weight: 1 }],
      supportPoints: polygon,
      massSegments: [{ id: "body", position: [0.5, 1, 0], mass: 1 }],
      dramaticImbalance: false,
      targetMargin: 0.02,
      maximumHorizontalCorrection: 0.4,
    });
    expect(solved.verticalCorrection).toBeCloseTo(-0.02);
    expect(solved.horizontalCorrection[0]).toBeLessThan(0);
    expect(solved.marginAfter).toBeGreaterThan(solved.marginBefore);
  });
});
