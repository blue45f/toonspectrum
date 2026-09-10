import { describe, expect, it } from "vitest";

import {
  resolveStudioBg3dInsertQualityPlan,
  STUDIO_BG3D_INSERT_MAX_EDGE,
  StudioBg3dInsertQualityPolicyError,
} from "./studio-bg3d-insert-quality-policy";

const generous = Object.freeze({
  deviceMaxPixels: 16_777_216,
  rendererMaxPixels: 16_777_216,
});

describe("BG3D canvas insert quality policy", () => {
  it("renders a portrait webtoon frame at production resolution", () => {
    expect(
      resolveStudioBg3dInsertQualityPlan({
        exportHeight: 1_280,
        aspectRatio: 0.75,
        ...generous,
      }),
    ).toMatchObject({
      requestedHeight: 2_160,
      expectedWidth: 1_620,
      expectedHeight: 2_160,
      qualityTier: "production",
      budgetScale: 1,
    });
  });

  it("fits an ultra-wide frame inside the maximum edge without distortion", () => {
    const aspectRatio = 2.4;
    const plan = resolveStudioBg3dInsertQualityPlan({
      exportHeight: 2_160,
      aspectRatio,
      ...generous,
    });

    expect(Math.max(plan.expectedWidth, plan.expectedHeight)).toBe(
      STUDIO_BG3D_INSERT_MAX_EDGE,
    );
    expect(plan.expectedWidth / plan.expectedHeight).toBeCloseTo(aspectRatio, 2);
  });

  it("uniformly scales under a constrained GPU budget", () => {
    const plan = resolveStudioBg3dInsertQualityPlan({
      exportHeight: 4_096,
      aspectRatio: 1,
      deviceMaxPixels: 2_000_000,
      rendererMaxPixels: 8_000_000,
    });

    expect(plan.expectedWidth * plan.expectedHeight).toBeLessThanOrEqual(2_010_000);
    expect(plan.expectedWidth / plan.expectedHeight).toBeCloseTo(1, 12);
    expect(plan.qualityTier).toBe("constrained");
    expect(plan.budgetScale).toBeLessThan(0.75);
  });

  it("is deterministic because display DPR is not an input", () => {
    const input = { exportHeight: 1_800, aspectRatio: 16 / 9, ...generous };
    expect(resolveStudioBg3dInsertQualityPlan(input)).toEqual(
      resolveStudioBg3dInsertQualityPlan({ ...input }),
    );
  });

  it.each([
    { exportHeight: Number.NaN, aspectRatio: 1 },
    { exportHeight: 1_000, aspectRatio: 0 },
    { exportHeight: 1_000, aspectRatio: Number.POSITIVE_INFINITY },
  ])("fails closed for invalid dimensions: %o", ({ exportHeight, aspectRatio }) => {
    expect(() =>
      resolveStudioBg3dInsertQualityPlan({
        exportHeight,
        aspectRatio,
        ...generous,
      }),
    ).toThrow(StudioBg3dInsertQualityPolicyError);
  });

  it("rejects an unusably small pixel budget", () => {
    expect(() =>
      resolveStudioBg3dInsertQualityPlan({
        exportHeight: 2_160,
        aspectRatio: 1,
        deviceMaxPixels: 1_024,
        rendererMaxPixels: 16_777_216,
      }),
    ).toThrowError(expect.objectContaining({ code: "PIXEL_BUDGET_TOO_SMALL" }));
  });
});
