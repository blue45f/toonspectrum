import { describe, expect, it } from "vitest";

import { applyStudioSkiaRoundedCornerAlphaToPixels } from "./studio-skia-rounded-corner-raster";

function opaque(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4).fill(255);
}

describe("applyStudioSkiaRoundedCornerAlphaToPixels", () => {
  it("clips only the rounded corners and preserves the authored body", () => {
    const target = opaque(6, 6);
    expect(applyStudioSkiaRoundedCornerAlphaToPixels({
      target,
      width: 6,
      height: 6,
      contentOffsetX: 1,
      contentOffsetY: 1,
      contentWidth: 4,
      contentHeight: 4,
      radius: 2,
    })).toBe(true);

    const alpha = (x: number, y: number) => target[(y * 6 + x) * 4 + 3];
    expect(alpha(1, 1)).toBeLessThan(255);
    expect(alpha(2, 2)).toBe(255);
    expect(alpha(3, 3)).toBe(255);
    expect(alpha(4, 4)).toBeLessThan(255);
    expect(alpha(0, 0)).toBe(255);
  });

  it("rejects malformed buffers and treats zero radius as an exact no-op", () => {
    expect(applyStudioSkiaRoundedCornerAlphaToPixels({
      target: new Uint8ClampedArray(3),
      width: 1,
      height: 1,
      contentOffsetX: 0,
      contentOffsetY: 0,
      contentWidth: 1,
      contentHeight: 1,
      radius: 1,
    })).toBe(false);

    const target = opaque(2, 2);
    const before = new Uint8ClampedArray(target);
    expect(applyStudioSkiaRoundedCornerAlphaToPixels({
      target,
      width: 2,
      height: 2,
      contentOffsetX: 0,
      contentOffsetY: 0,
      contentWidth: 2,
      contentHeight: 2,
      radius: 0,
    })).toBe(true);
    expect(target).toEqual(before);
  });
});
