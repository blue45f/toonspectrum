import { describe, expect, it } from "vitest";

import {
  STUDIO_P5_BRUSH_GOLDEN_QUALITY_POLICIES,
  evaluateStudioP5BrushGoldenQuality,
  type StudioP5BrushGoldenDeterminismEvidence,
  type StudioP5BrushGoldenFrameInput,
  type StudioP5BrushGoldenQualityPolicy,
} from "./studio-p5-brush-golden-quality-policy";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;

const DETERMINISTIC: StudioP5BrushGoldenDeterminismEvidence =
  Object.freeze({
    firstPixelHash: HASH_A,
    replayPixelHash: HASH_A,
    independentWorkerPixelHash: HASH_A,
    exactPixelReplay: true,
  });

const SYNTHETIC_POLICY: StudioP5BrushGoldenQualityPolicy = Object.freeze({
  technique: "hatch",
  minimumPaintedPixels: 32,
  minimumNonTransparentCoverage: 0.01,
  minimumPaintedCoverage: 0.01,
  maximumPaintedCoverage: 0.8,
  minimumBoundsCanvasCoverage: 0.05,
  minimumBoundsOccupancy: 0.05,
  maximumBoundsOccupancy: 0.9,
  minimumColorBucketCount: 3,
  minimumAlphaBucketCount: 2,
  minimumLuminanceStandardDeviation: 4,
  minimumNeighborLinkRatio: 0.25,
  minimumEdgeDensity: 0.01,
  minimumTextureScore: 0.04,
});

function frame(
  width: number,
  height: number,
  pixel: (
    x: number,
    y: number,
  ) => readonly [number, number, number, number] | null,
): StudioP5BrushGoldenFrameInput {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      if (!value) continue;
      rgba.set(value, (y * width + x) * 4);
    }
  }
  return Object.freeze({ rgba, width, height });
}

function texturedFrame(): StudioP5BrushGoldenFrameInput {
  return frame(32, 24, (x, y) => {
    if (x < 3 || x > 28 || y < 3 || y > 20) return null;
    // Connected woven bands with regular openings, varied RGB and alpha.
    if ((x + y) % 5 === 0 && x % 3 !== 0) return null;
    const phase = (x * 17 + y * 29) % 5;
    return [
      28 + phase * 27,
      42 + ((phase + 2) % 5) * 24,
      70 + ((phase + 4) % 5) * 20,
      159 + phase * 19,
    ];
  });
}

function codes(
  result: ReturnType<typeof evaluateStudioP5BrushGoldenQuality>,
): Set<string> {
  return new Set(result.findings.map((entry) => entry.code));
}

describe("Studio p5.brush golden quality policy", () => {
  it("accepts connected, spatially distributed, tone-varied texture", () => {
    const result = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      texturedFrame(),
      DETERMINISTIC,
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.metrics).toMatchObject({
      totalPixels: 768,
      paintedBounds: {
        left: 3,
        top: 3,
        right: 28,
        bottom: 20,
      },
    });
    expect(result.metrics?.colorBucketCount).toBeGreaterThanOrEqual(3);
    expect(result.metrics?.alphaBucketCount).toBeGreaterThanOrEqual(2);
    expect(result.metrics?.neighborLinkRatio).toBeGreaterThan(0.25);
    expect(result.metrics?.textureScore).toBeGreaterThan(0.04);
  });

  it("fails closed for an empty transparent frame with actionable reasons", () => {
    const result = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      frame(16, 16, () => null),
      DETERMINISTIC,
    );

    expect(result.ok).toBe(false);
    expect([...codes(result)]).toEqual(expect.arrayContaining([
      "no-non-transparent-pixels",
      "insufficient-painted-pixels",
      "painted-coverage-too-low",
      "painted-bounds-missing",
      "insufficient-color-diversity",
      "insufficient-alpha-diversity",
      "insufficient-luminance-variation",
      "insufficient-connectivity",
      "insufficient-edge-structure",
      "insufficient-texture",
    ]));
    expect(result.metrics?.paintedPixels).toBe(0);
  });

  it("rejects a flat solid block rather than treating silhouette edges as texture", () => {
    const solid = frame(32, 32, (x, y) => (
      x >= 8 && x <= 23 && y >= 8 && y <= 23
        ? [35, 55, 75, 255]
        : null
    ));
    const result = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      solid,
      DETERMINISTIC,
    );

    expect(result.ok).toBe(false);
    expect([...codes(result)]).toEqual(expect.arrayContaining([
      "bounds-occupancy-too-high",
      "insufficient-color-diversity",
      "insufficient-alpha-diversity",
      "insufficient-luminance-variation",
      "insufficient-texture",
    ]));
    expect(result.metrics?.boundsOccupancy).toBe(1);
    expect(result.metrics?.edgeDensity).toBeGreaterThan(0);
    expect(result.metrics?.textureScore).toBe(0);
  });

  it("reports same-Worker and independent-Worker nondeterminism separately", () => {
    const result = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      texturedFrame(),
      {
        firstPixelHash: HASH_A,
        replayPixelHash: HASH_B,
        independentWorkerPixelHash: HASH_C,
        exactPixelReplay: false,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.determinism).toEqual({
      hashesWellFormed: true,
      exactPixelReplay: false,
      sameWorkerHashEqual: false,
      independentWorkerHashEqual: false,
    });
    expect([...codes(result)]).toEqual(expect.arrayContaining([
      "same-worker-replay-mismatch",
      "independent-worker-replay-mismatch",
    ]));
  });

  it("rejects malformed hashes and malformed rasters before scanning", () => {
    const malformedHash = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      texturedFrame(),
      {
        ...DETERMINISTIC,
        independentWorkerPixelHash: "not-a-sha256",
      },
    );
    expect(codes(malformedHash)).toContain("invalid-determinism-evidence");

    const malformedRaster = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      {
        rgba: new Uint8Array(7),
        width: 32,
        height: 24,
      },
      DETERMINISTIC,
    );
    expect(malformedRaster.metrics).toBeNull();
    expect(codes(malformedRaster)).toContain("rgba-byte-length-mismatch");

    const overBudget = evaluateStudioP5BrushGoldenQuality(
      SYNTHETIC_POLICY,
      {
        rgba: new Uint8Array(0),
        width: 8_192,
        height: 8_192,
      },
      DETERMINISTIC,
    );
    expect(overBudget.metrics).toBeNull();
    expect(codes(overBudget)).toContain("invalid-raster-dimensions");
  });

  it("uses scanline-bounded scratch memory and exposes all production techniques", () => {
    const wide = evaluateStudioP5BrushGoldenQuality(
      {
        ...SYNTHETIC_POLICY,
        minimumPaintedPixels: 1,
        minimumNonTransparentCoverage: 0,
        minimumPaintedCoverage: 0,
        maximumPaintedCoverage: 1,
        minimumBoundsCanvasCoverage: 0,
        minimumBoundsOccupancy: 0,
        maximumBoundsOccupancy: 1,
        minimumColorBucketCount: 1,
        minimumAlphaBucketCount: 1,
        minimumLuminanceStandardDeviation: 0,
        minimumNeighborLinkRatio: 0,
        minimumEdgeDensity: 0,
        minimumTextureScore: 0,
      },
      frame(8_192, 1, (x) => (
        x === 4_096 ? [30, 60, 90, 180] : null
      )),
      DETERMINISTIC,
    );

    expect(wide.ok).toBe(true);
    expect(wide.metrics?.scratchByteLength).toBe(8_192 * 3 + 512);
    expect(wide.metrics?.scratchByteLength).toBeLessThan(26_000);
    expect(Object.keys(STUDIO_P5_BRUSH_GOLDEN_QUALITY_POLICIES).sort())
      .toEqual(["flow-field", "hatch", "mass"]);
  });
});
