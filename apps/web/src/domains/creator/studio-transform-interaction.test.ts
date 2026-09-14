import { describe, expect, it } from "vitest";

import {
  constrainStudioTransformBox,
  STUDIO_TRANSFORM_ROTATION_SNAPS,
  STUDIO_TRANSFORM_ROTATION_STEP_DEG,
  studioTransformMinimumDocumentSize,
} from "./studio-transform-interaction";

describe("Studio natural transform math", () => {
  it("offers every 15-degree precision stop without making free rotation sticky", () => {
    expect(STUDIO_TRANSFORM_ROTATION_STEP_DEG).toBe(15);
    expect(STUDIO_TRANSFORM_ROTATION_SNAPS).toHaveLength(24);
    expect(STUDIO_TRANSFORM_ROTATION_SNAPS).toEqual(
      Array.from({ length: 24 }, (_, index) => index * 15),
    );
  });

  it("keeps geometry independent from the screen-space handle size", () => {
    expect(studioTransformMinimumDocumentSize(1)).toBe(1);
    expect(studioTransformMinimumDocumentSize(2)).toBe(0.5);
    expect(studioTransformMinimumDocumentSize(0)).toBe(1);
  });

  it("returns an unconstrained finite box by identity", () => {
    const oldBox = { x: 0, y: 0, width: 100, height: 50 };
    const nextBox = { x: 10, y: 5, width: 40, height: 20 };
    expect(constrainStudioTransformBox(oldBox, nextBox, 1)).toBe(nextBox);
  });

  it("interpolates to the minimum instead of jumping back to the previous box", () => {
    const oldBox = { x: 0, y: 0, width: 100, height: 50 };
    const nextBox = { x: 49.875, y: 0, width: 0.25, height: 50 };
    const constrained = constrainStudioTransformBox(oldBox, nextBox, 0.5);

    expect(constrained).not.toBe(oldBox);
    expect(constrained.width).toBeCloseTo(0.5);
    expect(constrained.x + constrained.width / 2).toBeCloseTo(50);
    expect(constrained.height).toBe(50);
  });

  it("rejects invalid frames but lets legacy sub-pixel objects grow", () => {
    const oldBox = { x: 2, y: 3, width: 0.25, height: 0.25 };
    expect(
      constrainStudioTransformBox(
        oldBox,
        { x: Number.NaN, y: 3, width: 2, height: 2 },
        1,
      ),
    ).toBe(oldBox);
    const growing = { x: 2, y: 3, width: 0.5, height: 0.5 };
    expect(constrainStudioTransformBox(oldBox, growing, 1)).toBe(growing);
  });
});
