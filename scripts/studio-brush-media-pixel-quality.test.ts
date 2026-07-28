import { describe, expect, it } from "vitest";

import {
  analyzeStudioBrushMediaPixelQuality,
  type StudioBrushMediaPixelImage,
  type StudioBrushMediaPixelPoint,
} from "./studio-brush-media-pixel-quality";

const WIDTH = 128;
const HEIGHT = 72;

function image(
  painter?: (x: number, y: number) => number,
): StudioBrushMediaPixelImage {
  const data = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const delta = painter?.(x, y) ?? 0;
      const value = 255 - delta;
      const offset = (y * WIDTH + x) * 3;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
  return { width: WIDTH, height: HEIGHT, channels: 3, data };
}

const baseline = image();
const routePoints: readonly StudioBrushMediaPixelPoint[] = Array.from(
  { length: 97 },
  (_, index) => ({ x: 16 + index, y: HEIGHT / 2 }),
);

function analyze(frame: StudioBrushMediaPixelImage) {
  return analyzeStudioBrushMediaPixelQuality({
    baseline,
    frame,
    routePoints,
    crossSectionRadius: 18,
  });
}

describe("Studio brush-media pixel quality metrics", () => {
  it("reports the visible contrast distribution without counting near-identical pixels", () => {
    const result = analyze(image((x, y) => (
      x >= 16 && x <= 112 && Math.abs(y - HEIGHT / 2) <= 4 ? 80 : 2
    )));

    expect(result.visiblePixels).toBe(97 * 9);
    expect(result.meanVisibleDelta).toBe(80);
    expect(result.p95VisibleDelta).toBe(80);
  });

  it("separates smooth taper from high-frequency cross-section scalloping", () => {
    const smooth = analyze(image((x, y) => {
      if (x < 16 || x > 112) return 0;
      const halfWidth = 4 + Math.round((x - 16) / 32);
      return Math.abs(y - HEIGHT / 2) <= halfWidth ? 120 : 0;
    }));
    const scalloped = analyze(image((x, y) => {
      if (x < 16 || x > 112) return 0;
      const halfWidth = x % 6 < 3 ? 4 : 10;
      return Math.abs(y - HEIGHT / 2) <= halfWidth ? 120 : 0;
    }));

    expect(smooth.scallopResidualCoefficient).not.toBeNull();
    expect(scalloped.scallopResidualCoefficient).not.toBeNull();
    expect(smooth.scallopResidualCoefficient!).toBeLessThan(0.08);
    expect(scalloped.scallopResidualCoefficient!).toBeGreaterThan(0.2);
    expect(scalloped.scallopResidualCoefficient!)
      .toBeGreaterThan(smooth.scallopResidualCoefficient! * 4);
  });

  it("finds a sharp repeated tile/grid period but not deterministic organic grain", () => {
    const tiled = analyze(image((x, y) => {
      if (x < 8 || x >= 120 || y < 8 || y >= 64) return 0;
      return ((x % 12) < 4 || (y % 12) < 4) ? 120 : 24;
    }));
    let seed = 0x6d2b79f5;
    const organicValues = new Uint8Array(WIDTH * HEIGHT);
    for (let index = 0; index < organicValues.length; index += 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
      organicValues[index] = 18 + ((seed ^ (seed >>> 14)) >>> 0) % 103;
    }
    const organic = analyze(image((x, y) => (
      x >= 8 && x < 120 && y >= 8 && y < 64
        ? organicValues[y * WIDTH + x] ?? 0
        : 0
    )));

    expect(tiled.repetitionPeriodPx).toBe(12);
    expect(tiled.repetitionRawCorrelation).toBeGreaterThan(0.8);
    expect(tiled.repetitionScore).toBeGreaterThan(0.45);
    expect(organic.repetitionScore).toBeLessThan(0.25);
  });

  it("returns neutral defect metrics for a blank frame", () => {
    expect(analyze(image())).toMatchObject({
      visiblePixels: 0,
      meanVisibleDelta: 0,
      p95VisibleDelta: 0,
      scallopResidualCoefficient: null,
      widthSampleCount: 0,
      repetitionScore: 0,
      repetitionAxis: null,
      repetitionPeriodPx: null,
    });
  });
});
