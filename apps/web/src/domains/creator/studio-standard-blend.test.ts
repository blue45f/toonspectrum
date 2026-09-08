import { describe, expect, it } from "vitest";

import {
  STUDIO_STANDARD_BLEND_MODES,
  blendStudioStandardRgb,
  compositeStudioFilterResult,
  isStudioStandardBlendMode,
} from "./studio-standard-blend";
import type { StudioImageDataLike } from "./studio-filters";

function image(rgba: readonly number[], width = rgba.length / 4): StudioImageDataLike {
  return {
    width,
    height: 1,
    data: new Uint8ClampedArray(rgba),
  };
}

describe("studio standard blend", () => {
  it("publishes the complete editable smart-filter blend catalog", () => {
    expect(STUDIO_STANDARD_BLEND_MODES).toEqual([
      "normal",
      "multiply",
      "screen",
      "overlay",
      "soft-light",
      "hard-light",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
    ]);
    for (const mode of STUDIO_STANDARD_BLEND_MODES) {
      expect(isStudioStandardBlendMode(mode)).toBe(true);
    }
    expect(isStudioStandardBlendMode("not-real")).toBe(false);
  });

  it("matches bounded separable channel formulas", () => {
    const base = [200, 100, 50] as const;
    const filtered = [100, 200, 250] as const;
    expect(blendStudioStandardRgb("multiply", base, filtered).map(Math.round))
      .toEqual([78, 78, 49]);
    expect(blendStudioStandardRgb("screen", base, filtered).map(Math.round))
      .toEqual([222, 222, 251]);
    expect(blendStudioStandardRgb("difference", base, filtered).map(Math.round))
      .toEqual([100, 100, 200]);
    expect(blendStudioStandardRgb("exclusion", [255, 0, 128], [255, 255, 128]).map(Math.round))
      .toEqual([0, 255, 127]);
  });

  it("keeps non-separable color and luminosity components stable", () => {
    const base = [32, 126, 214] as const;
    const filtered = [220, 74, 35] as const;
    const luminance = (value: readonly number[]) =>
      0.299 * value[0]! + 0.587 * value[1]! + 0.114 * value[2]!;
    const color = blendStudioStandardRgb("color", base, filtered);
    const luminosity = blendStudioStandardRgb("luminosity", base, filtered);
    expect(luminance(color)).toBeCloseTo(luminance(base), 8);
    expect(luminance(luminosity)).toBeCloseTo(luminance(filtered), 8);
    expect(blendStudioStandardRgb("hue", base, filtered)).not.toEqual(base);
    expect(blendStudioStandardRgb("saturation", base, filtered)).not.toEqual(base);
  });

  it("preserves the established premultiplied cross-fade for alpha-removing filters", () => {
    const base = image([255, 255, 255, 255]);
    const filtered = image([0, 0, 0, 0]);
    compositeStudioFilterResult(base, filtered, 0.5);
    expect(Array.from(base.data)).toEqual([255, 255, 255, 128]);
  });

  it("applies blend color first and then the smart-filter strength", () => {
    const base = image([200, 100, 50, 255]);
    const filtered = image([100, 200, 250, 255]);
    compositeStudioFilterResult(base, filtered, 0.5, "multiply");
    expect(Array.from(base.data)).toEqual([139, 89, 50, 255]);
  });

  it("rejects surfaces that cannot represent one shared pixel program", () => {
    expect(() => compositeStudioFilterResult(
      image([0, 0, 0, 255]),
      image([0, 0, 0, 255, 0, 0, 0, 255], 2),
      1,
    )).toThrow(/RGBA/);
  });
});
