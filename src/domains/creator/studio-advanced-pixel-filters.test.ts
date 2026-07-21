import { describe, expect, it } from "vitest";

import {
  applyStudioClouds,
  applyStudioConvolution,
  applyStudioExposureAdjustment,
  applyStudioMorphology,
  applyStudioPixelOffset,
  applyStudioUnsharpMask,
  isIdentityStudioConvolution,
  normalizeStudioConvolution,
  normalizeStudioExposureAdjustment,
  normalizeStudioMorphology,
  normalizeStudioPixelOffset,
  normalizeStudioUnsharpMask,
} from "./studio-advanced-pixel-filters";

function image(
  width: number,
  height: number,
  pixels: readonly [number, number, number, number][],
) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels.flat()),
  };
}

function grayscale(values: readonly number[], alpha = 173) {
  return image(values.length, 1, values.map((value) => [value, value, value, alpha]));
}

describe("studio advanced pixel filter normalization", () => {
  it("clamps hostile parameters to the bounded Worker contract", () => {
    expect(normalizeStudioExposureAdjustment({ exposure: 99, gamma: 0, offset: -4 })).toEqual({
      exposure: 5,
      gamma: 0.1,
      offset: -1,
    });
    expect(normalizeStudioUnsharpMask({ amount: 99, radius: 99, threshold: -4 })).toEqual({
      amount: 3,
      radius: 5,
      threshold: 0,
    });
    expect(normalizeStudioMorphology({ mode: "unknown", radius: 99 })).toEqual({
      mode: "dilate",
      radius: 4,
    });
    expect(normalizeStudioPixelOffset({ x: Number.NaN, y: -99_999, edge: "unknown" })).toEqual({
      x: 0,
      y: -4_096,
      edge: "transparent",
    });
    expect(normalizeStudioConvolution({
      kernel: Array.from({ length: 9 }, () => 1_000),
      divisor: 0,
      bias: -999,
    })).toEqual({
      kernel: Array.from({ length: 9 }, () => 16),
      divisor: 1,
      bias: -255,
    });
  });
});

describe("studio advanced pixel filters", () => {
  it("applies exposure/gamma/offset while preserving alpha", () => {
    const source = grayscale([64, 128, 192]);
    applyStudioExposureAdjustment(source, { exposure: 1, gamma: 1, offset: 0 });
    expect(Array.from(source.data.filter((_, index) => index % 4 === 0))).toEqual([128, 255, 255]);
    expect(Array.from(source.data.filter((_, index) => index % 4 === 3))).toEqual([173, 173, 173]);
  });

  it("unsharp mask increases a hard edge and honors its threshold", () => {
    const source = grayscale([80, 100, 180, 200, 220]);
    const before = Array.from(source.data);
    applyStudioUnsharpMask(source, { amount: 1, radius: 1, threshold: 0 });
    expect(source.data[2 * 4]).toBeGreaterThan(before[2 * 4]!);
    expect(source.data[3]).toBe(173);

    const thresholded = grayscale([80, 100, 180, 200, 220]);
    applyStudioUnsharpMask(thresholded, { amount: 1, radius: 1, threshold: 255 });
    expect(Array.from(thresholded.data)).toEqual(before);
  });

  it("dilate and erode expand RGBA extrema, including mask alpha", () => {
    const brightCenter = image(3, 3, Array.from({ length: 9 }, (_, index) => {
      const center = index === 4;
      const value = center ? 255 : 0;
      return [value, value, value, center ? 240 : 16] as [number, number, number, number];
    }));
    applyStudioMorphology(brightCenter, { mode: "dilate", radius: 1 });
    expect(Array.from(brightCenter.data.filter((_, index) => index % 4 === 0)))
      .toEqual(Array.from({ length: 9 }, () => 255));
    expect(Array.from(brightCenter.data.filter((_, index) => index % 4 === 3)))
      .toEqual(Array.from({ length: 9 }, () => 240));

    const darkCenter = image(3, 3, Array.from({ length: 9 }, (_, index) => {
      const center = index === 4;
      const value = center ? 0 : 255;
      return [value, value, value, center ? 12 : 232] as [number, number, number, number];
    }));
    applyStudioMorphology(darkCenter, { mode: "erode", radius: 1 });
    expect(Array.from(darkCenter.data.filter((_, index) => index % 4 === 0)))
      .toEqual(Array.from({ length: 9 }, () => 0));
    expect(Array.from(darkCenter.data.filter((_, index) => index % 4 === 3)))
      .toEqual(Array.from({ length: 9 }, () => 12));
  });

  it("pixel offset supports transparent and wrapping edges", () => {
    const transparent = grayscale([10, 20, 30], 255);
    applyStudioPixelOffset(transparent, { x: 1, y: 0, edge: "transparent" });
    expect(Array.from(transparent.data)).toEqual([
      0, 0, 0, 0,
      10, 10, 10, 255,
      20, 20, 20, 255,
    ]);

    const wrapped = grayscale([10, 20, 30], 255);
    applyStudioPixelOffset(wrapped, { x: 1, y: 0, edge: "wrap" });
    expect(Array.from(wrapped.data.filter((_, index) => index % 4 === 0))).toEqual([30, 10, 20]);
  });

  it("keeps identity convolution untouched and applies a bounded edge kernel", () => {
    const identity = grayscale([20, 40, 80]);
    const before = Array.from(identity.data);
    expect(isIdentityStudioConvolution({
      kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      divisor: 1,
      bias: 0,
    })).toBe(true);
    applyStudioConvolution(identity, {
      kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      divisor: 1,
      bias: 0,
    });
    expect(Array.from(identity.data)).toEqual(before);

    const edge = grayscale([20, 40, 80]);
    applyStudioConvolution(edge, {
      kernel: [0, 0, 0, -1, 1, 0, 0, 0, 0],
      divisor: 1,
      bias: 128,
    });
    expect(Array.from(edge.data)).not.toEqual(before);
    expect(edge.data[3]).toBe(173);
  });

  it("clouds are deterministic by seed and preserve alpha", () => {
    const first = grayscale(Array.from({ length: 32 }, () => 128));
    const second = grayscale(Array.from({ length: 32 }, () => 128));
    const different = grayscale(Array.from({ length: 32 }, () => 128));
    applyStudioClouds(first, { amount: 0.8, scale: 12, seed: 42, mode: "overlay" });
    applyStudioClouds(second, { amount: 0.8, scale: 12, seed: 42, mode: "overlay" });
    applyStudioClouds(different, { amount: 0.8, scale: 12, seed: 43, mode: "overlay" });
    expect(Array.from(first.data)).toEqual(Array.from(second.data));
    expect(Array.from(first.data)).not.toEqual(Array.from(different.data));
    expect(Array.from(first.data.filter((_, index) => index % 4 === 3)))
      .toEqual(Array.from({ length: 32 }, () => 173));
  });
});
