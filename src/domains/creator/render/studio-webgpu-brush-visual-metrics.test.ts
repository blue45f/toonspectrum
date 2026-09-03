import { describe, expect, it } from "vitest";

import {
  analyzeStudioWebGpuBrushRgba16F,
  compareStudioWebGpuBrushAlphaMonotonicity,
  compareStudioWebGpuBrushRgba16F,
  studioWebGpuFloat16ToNumber,
  studioWebGpuRgba16FDiffToRgba8,
  studioWebGpuRgba16FToRgba8,
} from "./studio-webgpu-brush-visual-metrics";

function float32ToFloat16(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  if (value === Number.POSITIVE_INFINITY) return 0x7c00;
  if (value === Number.NEGATIVE_INFINITY) return 0xfc00;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const absolute = Math.abs(value);
  if (absolute === 0) return sign;
  if (absolute >= 65_504) return sign | 0x7bff;
  if (absolute < 2 ** -14) {
    return sign | Math.min(0x03ff, Math.round(absolute / 2 ** -24));
  }
  const exponent = Math.floor(Math.log2(absolute));
  const normalized = absolute / 2 ** exponent - 1;
  let storedExponent = exponent + 15;
  let fraction = Math.round(normalized * 1024);
  if (fraction === 1024) {
    fraction = 0;
    storedExponent += 1;
  }
  if (storedExponent >= 31) return sign | 0x7c00;
  return sign | (storedExponent << 10) | fraction;
}

function surface(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): Uint16Array {
  const words = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = Math.max(0, Math.min(1, alphaAt(x, y)));
      const offset = (y * width + x) * 4;
      words[offset] = float32ToFloat16(alpha * 0.5);
      words[offset + 1] = float32ToFloat16(alpha * 0.25);
      words[offset + 2] = float32ToFloat16(alpha * 0.75);
      words[offset + 3] = float32ToFloat16(alpha);
    }
  }
  return words;
}

describe("studio WebGPU brush visual metrics", () => {
  it("decodes the finite binary16 landmarks used by rgba16float readback", () => {
    expect(studioWebGpuFloat16ToNumber(0x0000)).toBe(0);
    expect(studioWebGpuFloat16ToNumber(0x3c00)).toBe(1);
    expect(studioWebGpuFloat16ToNumber(0x3800)).toBe(0.5);
    expect(studioWebGpuFloat16ToNumber(0xbc00)).toBe(-1);
    expect(studioWebGpuFloat16ToNumber(0x0001)).toBe(2 ** -24);
  });

  it("measures one continuous textured ribbon and its centerline thickness", () => {
    const width = 32;
    const height = 24;
    const centerline = Array.from({ length: 24 }, (_, index) => ({
      x: index + 4,
      y: 12,
    }));
    const words = surface(width, height, (x, y) => {
      if (x < 3 || x > 28 || Math.abs(y - 12) > 3) return 0;
      const edge = Math.max(0, 1 - Math.abs(y - 12) / 4);
      const grain = ((x * 13 + y * 7) % 11) / 40;
      return Math.max(0.08, edge - grain);
    });
    const metrics = analyzeStudioWebGpuBrushRgba16F(
      words,
      width,
      height,
      centerline,
    );

    expect(metrics.coveredPixels).toBeGreaterThan(100);
    expect(metrics.componentCount).toBe(1);
    expect(metrics.largestComponentRatio).toBe(1);
    expect(metrics.centerlineCoverageRatio).toBe(1);
    expect(metrics.centerlineMaximumGap).toBe(0);
    expect(metrics.thicknessMean).not.toBeNull();
    expect(metrics.thicknessMean!).toBeGreaterThan(5);
    expect(metrics.thicknessCoefficientOfVariation!).toBeLessThan(0.25);
    expect(metrics.alphaEntropyBits).toBeGreaterThan(0);
    expect(metrics.localContrast).toBeGreaterThan(0);
    expect(metrics.laplacianEnergy).toBeGreaterThan(0);
    expect(metrics.frequency.highFrequencyRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.frequency.highFrequencyRatio).toBeLessThanOrEqual(1);
    expect(metrics.frequency.repetitionPeak).toBeGreaterThanOrEqual(0);
    expect(metrics.frequency.repetitionPeak).toBeLessThanOrEqual(1);
  });

  it("reports exact equality and visible alpha changes independently", () => {
    const width = 8;
    const height = 8;
    const baseline = surface(width, height, (x, y) => (
      x >= 2 && x <= 5 && y >= 2 && y <= 5 ? 0.5 : 0
    ));
    const identical = baseline.slice();
    const changed = baseline.slice();
    changed[(3 * width + 3) * 4 + 3] = float32ToFloat16(0.75);

    expect(compareStudioWebGpuBrushRgba16F(baseline, identical)).toEqual({
      comparedHalfWords: width * height * 4,
      exactHalfWordMismatches: 0,
      maximumAbsoluteHalfWordDelta: 0,
      floatMeanAbsoluteError: 0,
      floatRootMeanSquareError: 0,
      peakSignalToNoiseRatio: null,
      alphaStructuralSimilarity: 1,
    });
    const comparison = compareStudioWebGpuBrushRgba16F(baseline, changed);
    expect(comparison.exactHalfWordMismatches).toBe(1);
    expect(comparison.maximumAbsoluteHalfWordDelta).toBeGreaterThan(0);
    expect(comparison.floatMeanAbsoluteError).toBeGreaterThan(0);
    expect(comparison.floatRootMeanSquareError).toBeGreaterThan(0);
    expect(comparison.peakSignalToNoiseRatio).not.toBeNull();
    expect(comparison.alphaStructuralSimilarity).toBeLessThan(1);
  });

  it("detects destructive temporal regressions but accepts source-over growth", () => {
    const width = 12;
    const height = 8;
    const prefix = surface(width, height, (x, y) => (
      x >= 1 && x <= 5 && y >= 2 && y <= 5 ? 0.4 : 0
    ));
    const extended = surface(width, height, (x, y) => (
      x >= 1 && x <= 9 && y >= 2 && y <= 5 ? 0.6 : 0
    ));
    const eroded = surface(width, height, (x, y) => (
      x >= 1 && x <= 9 && y >= 2 && y <= 5 ? (x <= 5 ? 0.2 : 0.6) : 0
    ));

    expect(compareStudioWebGpuBrushAlphaMonotonicity(prefix, extended)).toEqual({
      comparedPixels: width * height,
      decreasedPixels: 0,
      maximumDecrease: 0,
      meanDecrease: 0,
    });
    const regression = compareStudioWebGpuBrushAlphaMonotonicity(prefix, eroded);
    expect(regression.decreasedPixels).toBe(20);
    expect(regression.maximumDecrease).toBeGreaterThan(0.19);
  });

  it("converts linear premultiplied readback and differences into stable evidence pixels", () => {
    const width = 2;
    const height = 1;
    const left = surface(width, height, (x) => (x === 0 ? 1 : 0.5));
    const right = left.slice();
    right[7] = float32ToFloat16(0.25);

    const rgba8 = studioWebGpuRgba16FToRgba8(left, width, height);
    expect(rgba8).toHaveLength(8);
    expect([...rgba8.slice(0, 4)]).toEqual([188, 137, 225, 255]);
    const diff = studioWebGpuRgba16FDiffToRgba8(left, right, width, height);
    expect(diff).toHaveLength(8);
    expect(diff[3]).toBe(255);
    expect(diff[7]).toBe(255);
    expect(diff[4]).toBeGreaterThan(0);
  });
});
