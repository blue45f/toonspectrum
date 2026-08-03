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

function fullLayout(
  dirtyBounds: readonly [number, number, number, number] = DIRTY,
) {
  return {
    frameBounds: [0, 0, WIDTH, HEIGHT] as const,
    dirtyBounds,
  };
}

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

function periodicDabStroke(alpha: number): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  const centers = Array.from({ length: 10 }, (_, index) => 8 + index * 8);
  const radius = 5.5;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let coverage = 0;
      for (const centerX of centers) {
        const distance = Math.hypot(x - centerX, y - 24);
        if (distance >= radius) continue;
        coverage = Math.max(coverage, Math.sqrt(1 - distance / radius));
      }
      if (coverage <= 0) continue;
      const index = (y * WIDTH + x) * 4;
      pixels[index] = 112;
      pixels[index + 1] = 88;
      pixels[index + 2] = 72;
      pixels[index + 3] = Math.round(alpha * coverage);
    }
  }
  return pixels;
}

function crossedStroke(alpha: number): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 4; y < 44; y += 1) {
    for (let x = 16; x < 80; x += 1) {
      const station = (x - 16) / 64;
      const upperY = 8 + station * 32;
      const lowerY = 40 - station * 32;
      const distance = Math.min(Math.abs(y - upperY), Math.abs(y - lowerY));
      if (distance > 4) continue;
      const index = (y * WIDTH + x) * 4;
      pixels[index] = 112;
      pixels[index + 1] = 88;
      pixels[index + 2] = 72;
      pixels[index + 3] = Math.round(alpha * Math.sqrt(1 - distance / 4));
    }
  }
  return pixels;
}

function centrelineAlpha(pixels: Uint8Array): number[] {
  const values = [];
  for (let x = 8; x <= 80; x += 1) {
    values.push(pixels[(24 * WIDTH + x) * 4 + 3] ?? 0);
  }
  return values;
}

function packedFrame(
  source: Uint8Array,
  bounds: readonly [number, number, number, number],
): Uint8Array {
  const [x, y, width, height] = bounds;
  const packed = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * WIDTH + x) * 4;
    packed.set(
      source.subarray(sourceStart, sourceStart + width * 4),
      row * width * 4,
    );
  }
  return packed;
}

function compositePackedFrame(
  destination: Uint8Array,
  packed: Uint8Array,
  bounds: readonly [number, number, number, number],
): void {
  const [x, y, width, height] = bounds;
  expect(packed.byteLength).toBe(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * width * 4;
    const destinationStart = ((y + row) * WIDTH + x) * 4;
    destination.set(
      packed.subarray(sourceStart, sourceStart + width * 4),
      destinationStart,
    );
  }
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
        fullLayout(),
      );
      const secondMetrics = applyStudioHokusaiNaturalMediaTextureV2(
        second,
        plan(presetId),
        fullLayout(),
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
        fullLayout(),
      );
      applyStudioHokusaiNaturalMediaTextureV2(
        retraced,
        plan(presetId),
        fullLayout(),
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

  it("does not expose periodic dab joints across a long charcoal carrier", () => {
    const source = periodicDabStroke(210);
    const before = centrelineAlpha(source);
    const textured = source.slice();
    applyStudioHokusaiNaturalMediaTextureV2(
      textured,
      plan("charcoal"),
      {
        frameBounds: [0, 0, WIDTH, HEIGHT],
        dirtyBounds: [0, 0, WIDTH, HEIGHT],
      },
    );
    const after = centrelineAlpha(textured);

    expect(Math.min(...before)).toBeGreaterThan(0);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(48);
    expect(standardDeviation(after)).toBeLessThan(
      standardDeviation(before) * 1.3,
    );
    expect(after.every((alpha) => alpha > 0)).toBe(true);
  });

  it("keeps crossed charcoal retraces monotonic without erasing pigment", () => {
    const firstPass = crossedStroke(112);
    const retraced = crossedStroke(224);
    applyStudioHokusaiNaturalMediaTextureV2(
      firstPass,
      plan("charcoal"),
      fullLayout([0, 0, WIDTH, HEIGHT]),
    );
    applyStudioHokusaiNaturalMediaTextureV2(
      retraced,
      plan("charcoal"),
      fullLayout([0, 0, WIDTH, HEIGHT]),
    );
    for (let index = 3; index < firstPass.length; index += 4) {
      if ((firstPass[index] ?? 0) <= 0) continue;
      expect(retraced[index]).toBeGreaterThanOrEqual(firstPass[index] ?? 0);
    }
    expect(retraced[(24 * WIDTH + 48) * 4 + 3]).toBeGreaterThan(96);
  });

  it("keeps antialiased small-radius graphite visibly legible", () => {
    const pixels = ribbon(24);
    const before = channelValues(pixels, 3);
    applyStudioHokusaiNaturalMediaTextureV2(
      pixels,
      {
        ...plan("pencil"),
        raster: {
          width: WIDTH,
          height: HEIGHT,
          scale: 1,
          radiusPixels: 1.25,
        },
      },
      fullLayout(),
    );
    const after = channelValues(pixels, 3);
    const mean = after.reduce((sum, value) => sum + value, 0) / after.length;
    expect(Math.min(...after)).toBeGreaterThan(0);
    expect(mean).toBeGreaterThan(40);
    expect(standardDeviation(after)).toBeGreaterThan(4.5);
    expect(after.every((value, index) => value >= (before[index] ?? 0))).toBe(true);
  });

  it("renders a packed dirty frame byte-identically to the same full-frame region", () => {
    for (const presetId of ["pencil", "charcoal", "oil"] as const) {
      const full = ribbon(196);
      const packed = packedFrame(full, DIRTY);
      const fullMetrics = applyStudioHokusaiNaturalMediaTextureV2(
        full,
        plan(presetId),
        fullLayout(),
      );
      const packedMetrics = applyStudioHokusaiNaturalMediaTextureV2(
        packed,
        plan(presetId),
        {
          frameBounds: DIRTY,
          dirtyBounds: DIRTY,
        },
      );
      expect(packed).toEqual(packedFrame(full, DIRTY));
      expect(packedMetrics).toEqual(fullMetrics);
    }
  });

  it("matches a fresh irregular patch partition across the 64px tile boundary", () => {
    const partition = [
      [4, 4, 60, 16],
      [64, 4, 28, 16],
      [4, 20, 34, 24],
      [38, 20, 54, 24],
    ] as const;
    for (const presetId of ["pencil", "charcoal", "oil"] as const) {
      const source = ribbon(196);
      const full = source.slice();
      const composed = source.slice();
      applyStudioHokusaiNaturalMediaTextureV2(
        full,
        plan(presetId),
        fullLayout(),
      );
      for (const bounds of partition) {
        const patch = packedFrame(source, bounds);
        applyStudioHokusaiNaturalMediaTextureV2(
          patch,
          plan(presetId),
          {
            frameBounds: bounds,
            dirtyBounds: bounds,
          },
        );
        compositePackedFrame(composed, patch, bounds);
      }
      expect(composed).toEqual(full);
    }
  });

  it("keeps a long dabbed charcoal stroke byte-identical across live dirty patches", () => {
    const partition = [
      [0, 0, 31, HEIGHT],
      [31, 0, 33, HEIGHT],
      [64, 0, WIDTH - 64, HEIGHT],
    ] as const;
    const source = periodicDabStroke(210);
    const canonical = source.slice();
    const live = source.slice();
    applyStudioHokusaiNaturalMediaTextureV2(
      canonical,
      plan("charcoal"),
      fullLayout([0, 0, WIDTH, HEIGHT]),
    );
    for (const bounds of partition) {
      const patch = packedFrame(source, bounds);
      applyStudioHokusaiNaturalMediaTextureV2(
        patch,
        plan("charcoal"),
        { frameBounds: bounds, dirtyBounds: bounds },
      );
      compositePackedFrame(live, patch, bounds);
    }
    expect(live).toEqual(canonical);
  });

  it("rejects malformed, overflowing and mismatched packed layouts", () => {
    const base = ribbon(196);
    const renderPlan = plan("pencil");
    const invalidLayouts = [
      {
        frameBounds: [4, 4, 88, 40] as const,
        dirtyBounds: [3, 4, 1, 1] as const,
      },
      {
        frameBounds: [4, 4, 88, 40] as const,
        dirtyBounds: [4, 4, 89, 40] as const,
      },
      {
        frameBounds: [95, 0, 2, 1] as const,
        dirtyBounds: [95, 0, 2, 1] as const,
      },
      {
        frameBounds: [4, 4, 0, 40] as const,
        dirtyBounds: [4, 4, 1, 1] as const,
      },
    ];
    for (const layout of invalidLayouts) {
      expect(() => applyStudioHokusaiNaturalMediaTextureV2(
        base,
        renderPlan,
        layout,
      )).toThrowError(RangeError);
    }
    expect(() => applyStudioHokusaiNaturalMediaTextureV2(
      new Uint8Array(DIRTY[2] * DIRTY[3] * 4 - 1),
      renderPlan,
      {
        frameBounds: DIRTY,
        dirtyBounds: DIRTY,
      },
    )).toThrowError(RangeError);
  });

  it("makes oil bristles vary across the dominant stroke more than along it", () => {
    const pixels = ribbon(220);
    const metrics = applyStudioHokusaiNaturalMediaTextureV2(
      pixels,
      plan("oil"),
      fullLayout(),
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
      {
        frameBounds: [0, 0, 1, 1],
        dirtyBounds: [0, 0, 1, 1],
      },
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
      {
        frameBounds: [0, 0, 1, 1],
        dirtyBounds: [0, 0, 1, 1],
      },
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
      fullLayout(),
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
      fullLayout(),
    );
    expect(Array.from(pencil.slice(outsideIndex, outsideIndex + 4)))
      .toEqual([100, 80, 60, 200]);
  });
});
