import { describe, expect, it } from "vitest";

import { resolveStudioBg3dInsertQualityPlan } from "./studio-bg3d-insert-quality-policy";

const budget = Object.freeze({
  deviceMaxPixels: 16_777_216,
  rendererMaxPixels: 16_777_216,
});

describe("BG3D extreme insert aspect ratios", () => {
  it.each([0.1, 0.2, 5, 10])("preserves aspect ratio %f inside the maximum edge", (aspectRatio) => {
    const plan = resolveStudioBg3dInsertQualityPlan({
      exportHeight: 2_160,
      aspectRatio,
      ...budget,
    });

    const actualAspectRatio = plan.expectedWidth / plan.expectedHeight;
    const relativeAspectError = Math.abs(actualAspectRatio - aspectRatio) / aspectRatio;

    // Integer output pixels cannot represent every extreme ratio exactly. Keep the
    // quantization error below 0.1% while still using the available 4K edge budget.
    expect(relativeAspectError).toBeLessThanOrEqual(0.001);
    expect(Math.max(plan.expectedWidth, plan.expectedHeight)).toBeLessThanOrEqual(4_096);
    expect(Math.min(plan.expectedWidth, plan.expectedHeight)).toBeGreaterThanOrEqual(64);
  });
});
