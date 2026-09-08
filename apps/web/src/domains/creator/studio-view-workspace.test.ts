import { describe, expect, it } from "vitest";

import {
  clampStudioViewMagnification,
  deriveStudioViewBaseScale,
  parseStudioViewMagnificationPercent,
  resolveStudioViewMagnificationBounds,
  studioMagnificationToSliderPosition,
  studioSliderPositionToMagnification,
  studioUserZoomForMagnification,
  STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX,
} from "./studio-view-workspace";

describe("studio view workspace precision math", () => {
  it("keeps effective magnification separate from the user zoom multiplier", () => {
    const baseScale = deriveStudioViewBaseScale(0.8, 2);
    expect(baseScale).toBeCloseTo(0.4);
    expect(resolveStudioViewMagnificationBounds(baseScale)).toEqual({
      min: 0.08,
      max: 2,
    });
    expect(studioUserZoomForMagnification(1, baseScale)).toBeCloseTo(2.5);
  });

  it("clamps exact percentage requests to the existing canvas engine limits", () => {
    const bounds = { min: 0.1, max: 2.5 };
    expect(clampStudioViewMagnification(0.01, bounds)).toBe(0.1);
    expect(clampStudioViewMagnification(9, bounds)).toBe(2.5);
    expect(clampStudioViewMagnification(Number.NaN, bounds)).toBe(0.1);
  });

  it("round-trips logarithmic slider positions across the full zoom range", () => {
    const bounds = { min: 0.1, max: 5 };
    for (const magnification of [0.1, 0.25, 1, 2, 5]) {
      const position = studioMagnificationToSliderPosition(
        magnification,
        bounds
      );
      const restored = studioSliderPositionToMagnification(position, bounds);
      expect(restored).toBeCloseTo(magnification, 2);
    }
    expect(studioMagnificationToSliderPosition(bounds.min, bounds)).toBe(0);
    expect(studioMagnificationToSliderPosition(bounds.max, bounds)).toBe(
      STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX
    );
  });

  it("accepts forgiving percentage input without accepting invalid zooms", () => {
    expect(parseStudioViewMagnificationPercent("125")).toBe(1.25);
    expect(parseStudioViewMagnificationPercent(" 125% ")).toBe(1.25);
    expect(parseStudioViewMagnificationPercent("62,5")).toBe(0.625);
    expect(parseStudioViewMagnificationPercent("0")).toBeNull();
    expect(parseStudioViewMagnificationPercent("hello")).toBeNull();
  });
});
