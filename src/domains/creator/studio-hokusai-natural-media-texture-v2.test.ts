import { describe, expect, it } from "vitest";

import {
  applyStudioHokusaiNaturalMediaTextureV2,
  STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS,
  STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION,
} from "./studio-hokusai-natural-media-texture-v2";

import type {
  StudioHokusaiNaturalMediaPresetId,
  StudioHokusaiNaturalMediaRenderPlan,
} from "./studio-hokusai-natural-media-contract";

const WIDTH = 96;
const HEIGHT = 48;
const DIRTY = [4, 4, 88, 40] as const;

function plan(
  presetId: StudioHokusaiNaturalMediaPresetId,
  seed = 0x1234_5678,
): StudioHokusaiNaturalMediaRenderPlan {
  return {
    kind: "studio-hokusai-natural-media/render-plan",
    version: "studio-hokusai-natural-media-v1",
    engine: {
      id: "reearth-hokusai",
      version: "0.3.0",
      brushFormat: "libmypaint-myb-v3",
      alpha: "transparent-straight-rgba8",
      execution: "dedicated-worker-wasm",
    },
    source: {
      elementId: "texture-fixture",
      brushId: "pencil",
      sourcePointCount: 3,
      revision: "hokusai-source-v1:0123456789abcdef",
    },
    presetId,
    color: "#705848",
    opacity: 1,
    seed,
    logicalBounds: { x: 120, y: 240, width: WIDTH, height: HEIGHT },
    raster: {
      width: WIDTH,
      height: HEIGHT,
      scale: 1,
      radiusPixels: 12,
    },
    samples: [
      { x: 8, y: 24, pressure: 0.2, tiltX: 0, tiltY: 0, timeMilliseconds: 0 },
      { x: 48, y: 24, pressure: 0.8, tiltX: 0, tiltY: 0, timeMilliseconds: 16 },
      { x: 88, y: 24, pressure: 0.4, tiltX: 0, tiltY: 0, timeMilliseconds: 32 },
    ],
  };
}

function ribbon(alpha: number): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 10; y < 38; y += 1) {
    for (let x = 4; x < 92; x += 1) {
      const index = (y * WIDTH + x) * 4;
      pixels[index] = 112;
      pixels[index + 1] = 88;
      pixels[index + 2] = 72;
      pixels[index + 3] = alpha;
    }
  }
  return pixels;
}

function channelValues(
  pixels: Uint8Array,
  channel: 0 | 1 | 2 | 3,
): number[] {
  const values = [];
  for (let y = 10; y < 38; y += 1) {
    for (let x = 4; x < 92; x += 1) {
      values.push(pixels[(y * WIDTH + x) * 4 + channel] ?? 0);
    }
  }
  return values;
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
      / values.length,
  );
}

function meanNeighbourDifference(
  pixels: Uint8Array,
  deltaX: number,
  deltaY: number,
): number {
  let difference = 0;
  let count = 0;
  for (let y = 11; y < 37; y += 1) {
    for (let x = 5; x < 91; x += 1) {
      const current = (y * WIDTH + x) * 4;
      const neighbour = (
        (y + deltaY) * WIDTH + x + deltaX
      ) * 4;
      difference += Math.abs(
        (pixels[current] ?? 0) - (pixels[neighbour] ?? 0),
      );
      count += 1;
    }
  }
  return difference / count;
}

describe("Studio Hokusai natural-media texture v2", () => {
  it("is exact for the same seed and visibly separates the three media", () => {
    const hashes = new Set<string>();
    for (const presetId of ["pencil", "charcoal", "oil"] as const) {
      const first = ribbon(220);
      const second = ribbon(220);
      const firstMetrics = applyStudioHokusaiNaturalMediaTextureV2(
        first,
        plan(presetId),
        DIRTY,
      );
      const secondMetrics = applyStudioHokusaiNaturalMediaTextureV2(
        second,
        plan(presetId),
        DIRTY,
      );
      expect(first).toEqual(second);
      expect(firstMetrics).toEqual(secondMetrics);
      expect(firstMetrics).toMatchObject({
        version: STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION,
        presetId,
        visiblePixels: 88 * 28,
      });
      expect(firstMetrics.alphaChangedPixels).toBeGreaterThan(2_000);
      expect(standardDeviation(channelValues(first, 3))).toBeGreaterThan(5);
      hashes.add(Array.from(first).join(","));
    }
    expect(hashes.size).toBe(3);
  });

  it("preserves non-decreasing retrace alpha and cannot punch centreline gaps", () => {
    for (const presetId of ["pencil", "charcoal", "oil"] as const) {
      const onePass = ribbon(96);
      const retraced = ribbon(196);
      applyStudioHokusaiNaturalMediaTextureV2(
        onePass,
        plan(presetId),
        DIRTY,
      );
      applyStudioHokusaiNaturalMediaTextureV2(
        retraced,
        plan(presetId),
        DIRTY,
      );
      for (let y = 10; y < 38; y += 1) {
        for (let x = 4; x < 92; x += 1) {
          const alphaIndex = (y * WIDTH + x) * 4 + 3;
          expect(retraced[alphaIndex]).toBeGreaterThanOrEqual(
            onePass[alphaIndex] ?? 0,
          );
          expect(onePass[alphaIndex]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("makes oil bristles vary across the dominant stroke more than along it", () => {
    const pixels = ribbon(220);
    const metrics = applyStudioHokusaiNaturalMediaTextureV2(
      pixels,
      plan("oil"),
      DIRTY,
    );
    const along = meanNeighbourDifference(pixels, 1, 0);
    const across = meanNeighbourDifference(pixels, 0, 1);
    expect(metrics.dominantDirectionRadians).toBeCloseTo(0, 6);
    expect(metrics.directionIndexMode).toBe("local-grid");
    expect(metrics.directionIndexSegments).toBe(2);
    expect(metrics.directionIndexCellReferences)
      .toBeLessThanOrEqual(
        STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS.maxCellReferences,
      );
    expect(across).toBeGreaterThan(along * 2);
  });

  it("falls back to the bounded global direction for hostile zigzags and segment counts", () => {
    const base = plan("oil");
    const zigzagSamples = Array.from({ length: 64 }, (_, index) => ({
      x: index % 2 === 0 ? 0 : 2_047,
      y: index % 2 === 0 ? 0 : 2_047,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      timeMilliseconds: index,
    }));
    const zigzagPlan: StudioHokusaiNaturalMediaRenderPlan = {
      ...base,
      raster: {
        width: 2_048,
        height: 2_048,
        scale: 1,
        radiusPixels: 1,
      },
      logicalBounds: { x: 0, y: 0, width: 2_048, height: 2_048 },
      samples: zigzagSamples,
    };
    const zigzagPixel = new Uint8Array([112, 88, 72, 220]);
    const zigzagMetrics = applyStudioHokusaiNaturalMediaTextureV2(
      zigzagPixel,
      zigzagPlan,
      [0, 0, 1, 1],
    );
    expect(zigzagMetrics.directionIndexMode)
      .toBe("global-budget-fallback");
    expect(zigzagMetrics.directionIndexSegments)
      .toBeLessThanOrEqual(
        STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS.maxSegments,
      );
    expect(zigzagMetrics.directionIndexCellReferences)
      .toBeLessThanOrEqual(
        STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS.maxCellReferences,
      );
    expect(zigzagPixel[3]).toBeGreaterThan(0);

    const overSegmentSamples = Array.from({
      length: STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS.maxSegments + 2,
    }, (_, index) => ({
      x: index % WIDTH,
      y: index % HEIGHT,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      timeMilliseconds: index,
    }));
    const overSegmentPixel = new Uint8Array([112, 88, 72, 220]);
    const overSegmentMetrics = applyStudioHokusaiNaturalMediaTextureV2(
      overSegmentPixel,
      { ...base, samples: overSegmentSamples },
      [0, 0, 1, 1],
    );
    expect(overSegmentMetrics).toMatchObject({
      directionIndexMode: "global-budget-fallback",
      directionIndexSegments: 0,
      directionIndexCellReferences: 0,
    });
    expect(overSegmentPixel[3]).toBeGreaterThan(0);
  });

  it("does not alter transparent pixels, pixels outside dirty bounds or flat media", () => {
    const flat = ribbon(220);
    const before = flat.slice();
    const metrics = applyStudioHokusaiNaturalMediaTextureV2(
      flat,
      plan("calligraphy"),
      DIRTY,
    );
    expect(flat).toEqual(before);
    expect(metrics).toMatchObject({
      presetId: "calligraphy",
      alphaChangedPixels: 0,
      colorChangedPixels: 0,
    });

    const pencil = ribbon(220);
    const outsideIndex = (2 * WIDTH + 2) * 4;
    pencil[outsideIndex] = 100;
    pencil[outsideIndex + 1] = 80;
    pencil[outsideIndex + 2] = 60;
    pencil[outsideIndex + 3] = 200;
    applyStudioHokusaiNaturalMediaTextureV2(
      pencil,
      plan("pencil"),
      DIRTY,
    );
    expect(Array.from(pencil.slice(outsideIndex, outsideIndex + 4)))
      .toEqual([100, 80, 60, 200]);
  });
});
