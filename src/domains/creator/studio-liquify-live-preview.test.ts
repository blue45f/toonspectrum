import { describe, expect, it } from "vitest";

import {
  planStudioLiquifyLivePreview,
  studioLiquifyLivePreviewScale,
} from "./studio-liquify-live-preview";

describe("studio liquify live preview plan", () => {
  it("never upscales and caps the longest edge", () => {
    expect(studioLiquifyLivePreviewScale(200, 100, 384)).toBe(1);
    expect(studioLiquifyLivePreviewScale(2000, 1000, 384)).toBeCloseTo(384 / 2000, 6);
  });

  it("thins and scales stroke points into device space for Worker bake", () => {
    const points = Array.from({ length: 200 }, (_, index) => ({
      x: index / 199,
      y: 0.4,
      pressure: 0.7,
    }));
    const plan = planStudioLiquifyLivePreview({
      points,
      sourceWidth: 2000,
      sourceHeight: 1000,
      elementWidth: 500,
      radiusCanvasPx: 40,
      maxEdge: 384,
    });
    expect(plan).not.toBeNull();
    expect(plan!.width).toBe(384);
    expect(plan!.height).toBe(192);
    expect(plan!.points.length).toBeLessThanOrEqual(96);
    expect(plan!.points[0]!.x).toBeCloseTo(0, 5);
    expect(plan!.points[plan!.points.length - 1]!.x).toBeCloseTo(384, 5);
    expect(plan!.radiusDevice).toBeCloseTo((40 / 500) * 2000 * (384 / 2000), 5);
  });

  it("returns null for empty journals", () => {
    expect(
      planStudioLiquifyLivePreview({
        points: [],
        sourceWidth: 100,
        sourceHeight: 100,
        elementWidth: 100,
        radiusCanvasPx: 20,
      }),
    ).toBeNull();
  });
});
