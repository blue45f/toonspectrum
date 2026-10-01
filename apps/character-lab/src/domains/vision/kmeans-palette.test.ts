import { describe, expect, it } from "vitest";

import { hexToOklab } from "../../shared/color";

import { extractPalette, oklabChroma, oklabHueDeg, samplePixels } from "./kmeans-palette";

function rgbaOf(colors: readonly (readonly [number, number, number, number])[], counts: readonly number[]): Uint8ClampedArray {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const out = new Uint8ClampedArray(total * 4);
  let cursor = 0;
  colors.forEach((color, index) => {
    for (let i = 0; i < (counts[index] ?? 0); i += 1) {
      out.set(color, cursor);
      cursor += 4;
    }
  });
  return out;
}

describe("vision/kmeans-palette", () => {
  it("같은 입력·같은 시드는 같은 결과를 내고 시드가 다르면 결과 집합은 같다(2군집 분리)", () => {
    const rgba = rgbaOf(
      [
        [220, 30, 30, 255],
        [30, 30, 220, 255],
      ],
      [60, 40],
    );
    const a = extractPalette(rgba, { k: 2, seed: 7 });
    const b = extractPalette(rgba, { k: 2, seed: 7 });
    const c = extractPalette(rgba, { k: 2, seed: 99 });
    expect(a).toEqual(b);
    expect(a.map((entry) => entry.hex)).toEqual(["#dc1e1e", "#1e1edc"]);
    expect(a.map((entry) => entry.weight)).toEqual([0.6, 0.4]);
    expect(c.map((entry) => entry.hex)).toEqual(a.map((entry) => entry.hex));
  });

  it("k가 서로 다른 색 수보다 크면 빈 군집은 결과에서 빠진다", () => {
    const rgba = rgbaOf(
      [
        [255, 255, 255, 255],
        [0, 0, 0, 255],
      ],
      [10, 10],
    );
    const palette = extractPalette(rgba, { k: 5, seed: 1 });
    expect(palette.length).toBe(2);
    expect(palette.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1, 12);
  });

  it("투명 픽셀은 표본에서 빠지고 전부 투명이면 빈 팔레트다", () => {
    const rgba = rgbaOf(
      [
        [255, 0, 0, 0],
        [0, 255, 0, 255],
      ],
      [50, 50],
    );
    const palette = extractPalette(rgba, { k: 3, seed: 1 });
    expect(palette.map((entry) => entry.hex)).toEqual(["#00ff00"]);
    expect(extractPalette(rgbaOf([[1, 2, 3, 0]], [4]))).toEqual([]);
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
  });

  it("표본은 maxSamples 이하로 결정적 stride 축소된다", () => {
    const rgba = rgbaOf([[10, 20, 30, 255]], [1000]);
    const samples = samplePixels(rgba, { alphaMin: 128, maxSamples: 100, space: "oklab" });
    expect(samples.length).toBeLessThanOrEqual(100);
    expect(samples.length).toBeGreaterThan(0);
  });

  it("선형 sRGB 공간에서도 동작하고 oklab 보조 함수가 범위 안 값을 낸다", () => {
    const rgba = rgbaOf([[128, 64, 32, 255]], [8]);
    const palette = extractPalette(rgba, { k: 1, space: "linear-srgb" });
    expect(palette[0]?.hex).toBe("#804020");
    const lab = hexToOklab("#804020");
    expect(lab).not.toBeNull();
    if (lab) {
      expect(oklabChroma(lab)).toBeGreaterThan(0);
      const hue = oklabHueDeg(lab);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
