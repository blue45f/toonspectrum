import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  applyStudioVrmGroundBalanceTranslation,
  planStudioVrmGroundBalance,
} from "./studio-vrm-ground-balance";
import { EMPTY_STUDIO_VRM_POSE_TRANSLATIONS } from "./studio-vrm-pose-translations";

const centered = {
  leftFoot: [-0.12, 0, 0] as const,
  rightFoot: [0.12, 0, 0] as const,
  hips: [0, 0.92, 0] as const,
  spine: [0, 1.12, 0] as const,
  chest: [0, 1.34, 0] as const,
  upperChest: [0, 1.46, 0] as const,
  head: [0, 1.68, 0] as const,
};

describe("studio VRM ground balance", () => {
  it("leaves a centered standing pose unchanged", () => {
    const plan = planStudioVrmGroundBalance(centered, 0);
    expect(plan).not.toBeNull();
    expect(plan?.outsideDistanceM).toBe(0);
    expect(plan?.correctionDistanceM).toBe(0);
    expect(plan?.floorDeltaM).toBe(0);
  });

  it("moves a leaning upper body toward the two-foot support segment", () => {
    const leaning = {
      ...centered,
      hips: [0.3, 0.92, 0.06] as const,
      spine: [0.36, 1.12, 0.08] as const,
      chest: [0.42, 1.34, 0.1] as const,
      upperChest: [0.45, 1.46, 0.12] as const,
      head: [0.49, 1.68, 0.14] as const,
    };
    const plan = planStudioVrmGroundBalance(leaning, 0);
    expect(plan?.outsideDistanceM ?? 0).toBeGreaterThan(0.2);
    expect(plan?.correctionWorld[0] ?? 0).toBeLessThan(0);
    expect(plan?.correctionWorld[2] ?? 0).toBeLessThan(0);
    expect(plan?.correctionDistanceM ?? 0).toBeLessThanOrEqual(0.08);
  });
  it("handles a narrow or coincident support stance deterministically", () => {
    const plan = planStudioVrmGroundBalance({
      ...centered,
      leftFoot: [0, 0.03, 0],
      rightFoot: [0, 0.03, 0],
      hips: [0.16, 0.9, 0],
      head: [0.22, 1.65, 0],
    }, 0);
    expect(plan).not.toBeNull();
    expect(plan?.supportRadiusM).toBeGreaterThanOrEqual(0.035);
    expect(plan?.correctionDistanceM ?? 0).toBeGreaterThan(0);
    expect(plan?.floorDeltaM).toBeCloseTo(-0.03, 6);
  });

  it("rejects invalid coordinates and floor heights", () => {
    expect(planStudioVrmGroundBalance({
      ...centered,
      hips: [Number.NaN, 1, 0],
    }, 0)).toBeNull();
    expect(planStudioVrmGroundBalance(centered, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("converts a world correction into scene-local spine translation", () => {
    const scene = new THREE.Group();
    scene.rotation.y = Math.PI / 2;
    scene.scale.setScalar(2);
    scene.updateMatrixWorld(true);
    const result = applyStudioVrmGroundBalanceTranslation(
      scene,
      EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
      [0.06, 0, 0],
    );
    expect(result).not.toBeNull();
    expect(result?.appliedWorld[0]).toBeCloseTo(0.06, 6);
    expect(result?.appliedWorld[1]).toBeCloseTo(0, 6);
    expect(result?.appliedWorld[2]).toBeCloseTo(0, 6);
    expect(Math.hypot(...(result?.translations.spine ?? [0, 0, 0]))).toBeCloseTo(0.03, 6);
  });

  it("respects the canonical spine translation limit", () => {
    const scene = new THREE.Group();
    scene.updateMatrixWorld(true);
    const result = applyStudioVrmGroundBalanceTranslation(scene, {
      ...EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
      spine: [0.74, 0, 0],
    }, [0.08, 0, 0]);
    expect(result?.translations.spine[0]).toBe(0.75);
    expect(result?.limited).toBe(true);
    expect(result?.appliedWorld[0]).toBeCloseTo(0.01, 6);
  });
});
