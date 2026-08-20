import {
  brushProgramIRSchema,
  strokeIRSchema,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  CompositionExecutionError,
  carryDynamicsOntoCenterline,
  executeSurfaceBrushStroke,
} from "../brush-composition";

import type {
  SurfaceProjectionHit,
  SurfaceProjectionProvider,
} from "../brush-composition";
import type {
  BrushProgramIR,
  ModeledSampleIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * V19 §2.2/§5 — sensor passthrough through the composition stage. The
 * centerline resampler must carry the optional sensor channels from the
 * nearest source sample (never lerp, never inject defaults), and the surface
 * "twist" dynamic input must consume twistDeg when present while still
 * failing closed when the hardware never reported the channel.
 */

const SENSOR_CHANNELS = [
  "twistDeg",
  "tangentialPressure",
  "contactWidth",
  "contactHeight",
  "buttons",
  "source",
  "sourceSampleIndex",
] as const;

function bareSample(
  x: number,
  overrides: Partial<ModeledSampleIR> = {},
): ModeledSampleIR {
  return {
    x,
    y: 0,
    tMs: x,
    pressure: 0.5,
    velocity: 1,
    altitudeDeg: 90,
    azimuthDeg: 0,
    ...overrides,
  };
}

describe("carryDynamicsOntoCenterline sensor passthrough", () => {
  const lowerChannels = {
    twistDeg: 10,
    tangentialPressure: -0.5,
    contactWidth: 3,
    contactHeight: 2,
    buttons: 1,
    source: "raw",
    sourceSampleIndex: 0,
  } as const;
  const upperChannels = {
    twistDeg: 350,
    tangentialPressure: 0.25,
    contactWidth: 4,
    contactHeight: 5,
    buttons: 3,
    source: "coalesced",
    sourceSampleIndex: 2,
  } as const;

  it("carries present channels from the nearest source sample (t < 0.5 → lower, else upper)", () => {
    const source = [
      bareSample(0, { pressure: 0.2, ...lowerChannels }),
      bareSample(100, { pressure: 0.8, ...upperChannels }),
    ];
    const points = [
      [0, 0],
      [25, 0],
      [50, 0],
      [75, 0],
      [100, 0],
    ] as const;
    const carried = carryDynamicsOntoCenterline(points, source);
    expect(carried).toHaveLength(5);
    // t = 0 and 0.25 → lower neighbour; t = 0.5, 0.75, 1 → upper neighbour.
    expect(carried[0]).toMatchObject(lowerChannels);
    expect(carried[1]).toMatchObject(lowerChannels);
    expect(carried[2]).toMatchObject(upperChannels);
    expect(carried[3]).toMatchObject(upperChannels);
    expect(carried[4]).toMatchObject(upperChannels);
    // Interpolated dynamics stay linear — passthrough must not disturb them.
    expect(carried[2]?.pressure).toBeCloseTo(0.5, 10);
  });

  it("uses nearest-sample for twist, never angle interpolation", () => {
    const source = [
      bareSample(0, { twistDeg: 10 }),
      bareSample(100, { twistDeg: 350 }),
    ];
    const carried = carryDynamicsOntoCenterline(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ] as const,
      source,
    );
    // A lerp (or wraparound lerp) would produce 180 (or 0) at the midpoint.
    expect(carried.map((sample) => sample.twistDeg)).toEqual([10, 350, 350]);
  });

  it("keeps channels absent when the source never carried them", () => {
    const source = [bareSample(0, { pressure: 0.2 }), bareSample(100, { pressure: 0.8 })];
    const carried = carryDynamicsOntoCenterline(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ] as const,
      source,
    );
    for (const sample of carried) {
      for (const channel of SENSOR_CHANNELS) {
        expect(channel in sample).toBe(false);
      }
    }
    // The rebuilt dynamics themselves are still interpolated, not dropped.
    expect(carried[1]?.pressure).toBeCloseTo(0.5, 10);
  });

  it("resolves presence per channel on the nearest sample — no cross-neighbour fill", () => {
    const source = [
      bareSample(0, { twistDeg: 45 }),
      bareSample(100, { buttons: 2 }),
    ];
    const carried = carryDynamicsOntoCenterline(
      [
        [0, 0],
        [20, 0],
        [80, 0],
        [100, 0],
      ] as const,
      source,
    );
    expect(carried[1]?.twistDeg).toBe(45);
    expect(carried[1] && "buttons" in carried[1]).toBe(false);
    expect(carried[2]?.buttons).toBe(2);
    expect(carried[2] && "twistDeg" in carried[2]).toBe(false);
  });
});

function twistBrush(): BrushProgramIR {
  return brushProgramIRSchema.parse({
    id: "surface-twist",
    name: "Surface Twist",
    stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
    geometry: {
      kind: "perfect-freehand",
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.5,
      capStart: true,
      capEnd: true,
    },
    tip: { kind: "round", hardness: 1, spacingPct: 1000, angleJitterDeg: 0 },
    mixing: { kind: "none", strength: 0 },
    output: { target: "raster-tiles", bake: "flatten" },
    sizeDynamics: [{ input: "twist", curve: [0, 1], min: 0, max: 1 }],
  });
}

function twistStroke(samples: readonly ModeledSampleIR[]): StrokeIR {
  return strokeIRSchema.parse({
    id: "surface-twist-stroke",
    brushPresetId: "surface-twist",
    seed: 17,
    color: { r: 0.2, g: 0.4, b: 0.8, a: 1 },
    baseSizePx: 8,
    samples: [...samples],
  });
}

function uvProvider(): SurfaceProjectionProvider {
  return {
    id: "mesh-raycast",
    textureSize: () => ({ width: 64, height: 64 }),
    projectSample: (_sample, context): SurfaceProjectionHit => ({
      u: 0.25 + context.sampleIndex * 0.25,
      v: 0.5,
      texelDensity: 1,
      triangleId: "triangle-a",
      islandId: "body",
    }),
  };
}

describe("surface twist dynamic input", () => {
  it("consumes twistDeg when present (radius follows twist/360 through the mapping)", () => {
    const result = executeSurfaceBrushStroke(
      twistBrush(),
      twistStroke([
        bareSample(8, { twistDeg: 180 }),
        bareSample(16, { tMs: 24, twistDeg: 90 }),
      ]),
      uvProvider(),
    );
    const endpoints = result.operations.filter(
      (operation) => operation.interpolation === 1,
    );
    // radius = baseSizePx(8) · texelDensity(1) · (twistDeg / 360) / 2.
    expect(endpoints[0]?.radiusTexels).toBeCloseTo(2, 10);
    expect(endpoints.at(-1)?.radiusTexels).toBeCloseTo(1, 10);
  });

  it("still fails closed with the typed error when twistDeg is absent", () => {
    const run = (): unknown =>
      executeSurfaceBrushStroke(
        twistBrush(),
        twistStroke([bareSample(8)]),
        uvProvider(),
      );
    expect(run).toThrowError(CompositionExecutionError);
    expect(run).toThrowError(
      /surface\.dynamics\.sample\[0\].*does not carry twistDeg.*refusing silent substitution/,
    );
  });
});
