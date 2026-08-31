import {
  brushProgramIRSchema,
  strokeIRSchema,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  CompositionExecutionError,
  SURFACE_COMPOSITION_CAPABILITY,
  SurfaceBrushCancelledError,
  compositionProgramIRSchema,
  executeCompositionProgram,
  executeSurfaceBrushStroke,
} from "../brush-composition";

import type {
  SurfaceProjectionHit,
  SurfaceProjectionProvider,
  SurfaceTextureTransaction,
  VelloCompositionEngine,
} from "../brush-composition";
import type {
  BrushProgramIR,
  ModeledSampleIR,
  SceneIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

const WIDTH = 64;
const HEIGHT = 64;

function brush(overrides: Partial<BrushProgramIR> = {}): BrushProgramIR {
  return brushProgramIRSchema.parse({
    id: "surface-round",
    name: "Surface Round",
    stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
    geometry: {
      kind: "perfect-freehand",
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.5,
      capStart: true,
      capEnd: true,
    },
    tip: {
      kind: "round",
      hardness: 1,
      // Sparse test hits stay one operation each unless a test overrides it.
      spacingPct: 1000,
      angleJitterDeg: 0,
    },
    mixing: { kind: "none", strength: 0 },
    output: { target: "raster-tiles", bake: "flatten" },
    ...overrides,
  });
}

function sample(index: number, pressure: number): ModeledSampleIR {
  return {
    x: 8 + index * 4,
    y: 12,
    tMs: index * 8,
    pressure,
    velocity: index === 0 ? 0 : 0.5,
    altitudeDeg: 90,
    azimuthDeg: 0,
  };
}

function stroke(
  pressures: readonly number[],
  overrides: Partial<StrokeIR> = {},
): StrokeIR {
  return strokeIRSchema.parse({
    id: "surface-stroke-1",
    brushPresetId: "surface-round",
    seed: 17,
    color: { r: 0.2, g: 0.4, b: 0.8, a: 1 },
    baseSizePx: 8,
    samples: pressures.map((pressure, index) => sample(index, pressure)),
    ...overrides,
  });
}

interface ProviderRecorder {
  provider: SurfaceProjectionProvider;
  projected: number[];
  transactions: SurfaceTextureTransaction[];
  cancellations: string[];
}

function hitProvider(
  hits: readonly (SurfaceProjectionHit | null | Error)[],
  options: {
    id?: string;
    commit?: "success" | "throw" | "mismatch";
    onProject?: (sampleIndex: number) => void;
    width?: number;
    height?: number;
  } = {},
): ProviderRecorder {
  const projected: number[] = [];
  const transactions: SurfaceTextureTransaction[] = [];
  const cancellations: string[] = [];
  const provider: SurfaceProjectionProvider = {
    id: options.id ?? "mesh-raycast",
    textureSize: () => ({
      width: options.width ?? WIDTH,
      height: options.height ?? HEIGHT,
    }),
    projectSample: (_sample, context) => {
      projected.push(context.sampleIndex);
      options.onProject?.(context.sampleIndex);
      const hit = hits[context.sampleIndex] ?? null;
      if (hit instanceof Error) throw hit;
      return hit;
    },
    ...(options.commit
      ? {
          commitTextureOperations: (transaction: SurfaceTextureTransaction) => {
            transactions.push(transaction);
            if (options.commit === "throw") throw new Error("GPU upload failed");
            return {
              appliedOperations:
                options.commit === "mismatch"
                  ? transaction.operations.length - 1
                  : transaction.operations.length,
              changedTexels: 11,
              revision: "texture-r2",
            };
          },
        }
      : {}),
    cancelStroke: ({ reason }) => cancellations.push(reason),
  };
  return { provider, projected, transactions, cancellations };
}

function uvHit(
  u: number,
  v: number,
  overrides: Partial<SurfaceProjectionHit> = {},
): SurfaceProjectionHit {
  return {
    u,
    v,
    texelDensity: 1,
    triangleId: "triangle-a",
    islandId: "body",
    ...overrides,
  };
}

function alphaCount(pixels: Uint8Array): number {
  let count = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 0) > 0) count += 1;
  }
  return count;
}

function peakAlphaNear(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  let peak = 0;
  const centerX = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const centerY = Math.min(HEIGHT - 1, Math.max(0, Math.floor(y)));
  for (let py = Math.max(0, centerY - 2); py <= Math.min(HEIGHT - 1, centerY + 2); py += 1) {
    for (let px = Math.max(0, centerX - 2); px <= Math.min(width - 1, centerX + 2); px += 1) {
      peak = Math.max(peak, pixels[(py * width + px) * 4 + 3] ?? 0);
    }
  }
  return peak;
}

function fakeVello(): VelloCompositionEngine {
  return {
    renderScene(scene: SceneIR): Uint8Array {
      const pixels = new Uint8Array(scene.width * scene.height * 4);
      pixels[0] = 24;
      pixels[1] = 48;
      pixels[2] = 72;
      pixels[3] = 255;
      return pixels;
    },
  };
}

describe("executeSurfaceBrushStroke real UV texture lane", () => {
  it("emits ordered pressure-bearing operations, non-neutral pixels, and a real commit", () => {
    const recorder = hitProvider(
      [uvHit(0.2, 0.5), uvHit(0.5, 0.5), uvHit(0.8, 0.5)],
      { commit: "success" },
    );
    const input = stroke([0.2, 0.55, 0.9]);
    const first = executeSurfaceBrushStroke(brush(), input, recorder.provider);
    const second = executeSurfaceBrushStroke(brush(), input, recorder.provider, {
      commit: false,
    });

    expect(SURFACE_COMPOSITION_CAPABILITY.entryPoint).toBe("executeSurfaceBrushStroke");
    expect(first.operations.length).toBeGreaterThanOrEqual(3);
    expect(first.operations.map((operation) => operation.sequence)).toEqual(
      first.operations.map((_, index) => index),
    );
    expect(first.operations.at(-1)?.pressure).toBe(0.9);
    expect(first.operations.every((operation) => operation.projection === "primary")).toBe(
      true,
    );
    expect(first.receipt).toMatchObject({
      providerId: "mesh-raycast",
      inputSamples: 3,
      projectedSamples: 3,
      missedSamples: 0,
      runs: 1,
      seamBreaks: 0,
      committed: true,
    });
    expect(first.receipt.changedTexels).toBeGreaterThan(0);
    expect(alphaCount(first.pixels)).toBeGreaterThan(0);
    expect(recorder.transactions).toHaveLength(1);
    expect(recorder.transactions[0]?.operations).toEqual(first.operations);
    expect(second.operations).toEqual(first.operations);
    expect(second.pixels).toEqual(first.pixels);
  });

  it("preserves pressure precision in operations and RGBA8 response", () => {
    const pressures = [0.125, 0.5, 0.875] as const;
    const hits = [uvHit(0.18, 0.5), uvHit(0.5, 0.5), uvHit(0.82, 0.5)];
    const result = executeSurfaceBrushStroke(
      brush(),
      stroke(pressures),
      hitProvider(hits).provider,
    );
    const endpoints = result.operations.filter((operation) => operation.interpolation === 1);
    expect(endpoints.map((operation) => operation.pressure)).toEqual(pressures);
    expect(endpoints.map((operation) => operation.opacity)).toEqual(pressures);

    const measured = endpoints.map((operation) =>
      peakAlphaNear(result.pixels, result.width, operation.x, operation.y),
    );
    expect(measured[0]).toBeCloseTo(Math.round(pressures[0] * 255), -1);
    expect(measured[1]).toBeCloseTo(Math.round(pressures[1] * 255), -1);
    expect(measured[2]).toBeCloseTo(Math.round(pressures[2] * 255), -1);
    expect(measured[0]).toBeLessThan(measured[1] ?? 0);
    expect(measured[1]).toBeLessThan(measured[2] ?? 0);
  });

  it("keeps adjacent triangles continuous but splits island and stretched UV seams", () => {
    const input = stroke([0.5, 0.5, 0.5, 0.5], {
      baseSizePx: 1,
      samples: [
        sample(0, 0.5),
        { ...sample(1, 0.5), x: 9 },
        { ...sample(2, 0.5), x: 10 },
        { ...sample(3, 0.5), x: 11 },
      ],
    });
    const result = executeSurfaceBrushStroke(
      brush(),
      input,
      hitProvider([
        uvHit(0.1, 0.4, { triangleId: "tri-a", islandId: "body" }),
        uvHit(0.15, 0.4, { triangleId: "tri-b", islandId: "body" }),
        uvHit(0.8, 0.4, { triangleId: "tri-c", islandId: "body" }),
        uvHit(0.82, 0.4, { triangleId: "tri-d", islandId: "sleeve" }),
      ]).provider,
      { seamBreakTexels: 4, seamStretchRatio: 2 },
    );

    expect(result.receipt.seamBreaks).toBe(2);
    expect(result.receipt.runs).toBe(3);
    const endpointRuns = result.operations
      .filter((operation) => operation.interpolation === 1)
      .map((operation) => operation.run);
    expect(endpointRuns).toEqual([0, 0, 1, 2]);
    expect(result.warnings.some((warning) => warning.includes("UV jump"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("UV island changed"))).toBe(
      true,
    );
  });

  it("uses world distance and triangle texel density to distinguish a fast drag from a seam", () => {
    const input = stroke([0.5, 0.5], { baseSizePx: 1 });
    const first = uvHit(0.1, 0.4, {
      world: { x: 0, y: 0, z: 0 },
      texelsPerWorldUnit: 8,
    });
    const fastDrag = executeSurfaceBrushStroke(
      brush(),
      input,
      hitProvider([
        first,
        uvHit(0.6, 0.4, {
          world: { x: 1, y: 0, z: 0 },
          texelsPerWorldUnit: 8,
        }),
      ]).provider,
      { seamBreakTexels: 4, seamStretchRatio: 4 },
    );
    const seam = executeSurfaceBrushStroke(
      brush(),
      input,
      hitProvider([
        first,
        uvHit(0.6, 0.4, {
          world: { x: 0.1, y: 0, z: 0 },
          texelsPerWorldUnit: 8,
        }),
      ]).provider,
      { seamBreakTexels: 4, seamStretchRatio: 4 },
    );
    expect(fastDrag.receipt.seamBreaks).toBe(0);
    expect(fastDrag.receipt.runs).toBe(1);
    expect(seam.receipt.seamBreaks).toBe(1);
    expect(seam.receipt.runs).toBe(2);
  });

  it("splits a run on a miss without interpolating ink across the gap", () => {
    const result = executeSurfaceBrushStroke(
      brush(),
      stroke([0.5, 0.5, 0.5]),
      hitProvider([uvHit(0.2, 0.5), null, uvHit(0.8, 0.5)]).provider,
    );
    expect(result.receipt).toMatchObject({
      projectedSamples: 2,
      missedSamples: 1,
      runs: 2,
    });
    expect(new Set(result.operations.map((operation) => operation.run))).toEqual(
      new Set([0, 1]),
    );
    expect(result.operations.every((operation) => operation.x < 20 || operation.x > 44)).toBe(
      true,
    );
    expect(result.warnings).toContain(
      "surface.sample[1]: ray miss; no texture operation emitted and the UV run was split",
    );
  });

  it("rejects legacy fallback options before either provider is entered", () => {
    const primary = hitProvider([uvHit(0.2, 0.5), null, uvHit(0.8, 0.5)], {
      id: "three-raycast",
    });
    const fallback = hitProvider([null, uvHit(0.5, 0.5), null], {
      id: "planar-fallback",
    });
    const legacyOptions = {
      missPolicy: "fallback",
      fallbackProvider: fallback.provider,
    } as unknown as Parameters<typeof executeSurfaceBrushStroke>[3];
    expect(() =>
      executeSurfaceBrushStroke(
        brush(),
        stroke([0.4, 0.6, 0.8]),
        primary.provider,
        legacyOptions,
      ),
    ).toThrowError(/automatic fallback options are forbidden/);
    expect(primary.projected).toEqual([]);
    expect(fallback.projected).toEqual([]);
  });

  it("rejects misses when requested and rolls back the provider", () => {
    const recorder = hitProvider([uvHit(0.2, 0.5), null]);
    expect(() =>
      executeSurfaceBrushStroke(brush(), stroke([0.4, 0.6]), recorder.provider, {
        missPolicy: "reject",
      }),
    ).toThrowError(/ray missed and missPolicy is reject/);
    expect(recorder.cancellations).toEqual(["projection-failed"]);
  });

  it("cancels mid-stroke without returning or committing a partial transaction", () => {
    const controller = new AbortController();
    const recorder = hitProvider(
      [uvHit(0.2, 0.5), uvHit(0.5, 0.5), uvHit(0.8, 0.5)],
      {
        commit: "success",
        onProject: (sampleIndex) => {
          if (sampleIndex === 1) controller.abort("user-cancelled");
        },
      },
    );
    let caught: unknown;
    try {
      executeSurfaceBrushStroke(brush(), stroke([0.4, 0.6, 0.8]), recorder.provider, {
        signal: controller.signal,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SurfaceBrushCancelledError);
    expect(caught).toMatchObject({ processedSamples: 2, abortReason: "user-cancelled" });
    expect(recorder.transactions).toHaveLength(0);
    expect(recorder.cancellations).toEqual(["aborted"]);
  });

  it("rejects NaN UVs, radius overflow, and dynamic-product overflow", () => {
    expect(() =>
      executeSurfaceBrushStroke(
        brush(),
        stroke([0.5]),
        hitProvider([uvHit(Number.NaN, 0.5)]).provider,
      ),
    ).toThrowError(/UV must be finite/);

    expect(() =>
      executeSurfaceBrushStroke(
        brush(),
        stroke([0.5]),
        hitProvider([uvHit(0.5, 0.5, { texelDensity: 1e12 })]).provider,
      ),
    ).toThrowError(/radius must be finite/);

    const overflowBrush = brush({
      sizeDynamics: [
        { input: "constant", curve: [1, 1], min: 1e308, max: 1e308 },
        { input: "constant", curve: [1, 1], min: 1e308, max: 1e308 },
      ],
    });
    expect(() =>
      executeSurfaceBrushStroke(
        overflowBrush,
        stroke([0.5]),
        hitProvider([uvHit(0.5, 0.5)]).provider,
      ),
    ).toThrowError(/mapping product overflowed/);
  });

  it("surfaces projection and commit failures without switching providers", () => {
    const failed = hitProvider([new Error("BVH unavailable")], { id: "bvh" });
    expect(() =>
      executeSurfaceBrushStroke(brush(), stroke([0.5]), failed.provider),
    ).toThrowError(/surface\.provider\[bvh\]\.sample\[0\]: BVH unavailable/);
    expect(failed.cancellations).toEqual(["projection-failed"]);

    const commitFailed = hitProvider([uvHit(0.5, 0.5)], { commit: "throw" });
    expect(() =>
      executeSurfaceBrushStroke(brush(), stroke([0.5]), commitFailed.provider),
    ).toThrowError(/commit: GPU upload failed/);
    expect(commitFailed.cancellations).toEqual(["commit-failed"]);
  });

  it("rejects unsupported tip/mixing semantics rather than approximating them", () => {
    expect(() =>
      executeSurfaceBrushStroke(
        brush({ tip: { kind: "image", imageAssetId: "tip-1", hardness: 1, spacingPct: 10, angleJitterDeg: 0 } }),
        stroke([0.5]),
        hitProvider([uvHit(0.5, 0.5)]).provider,
      ),
    ).toThrowError(/image tips need a provider-specific stamp sampler/);
    expect(() =>
      executeSurfaceBrushStroke(
        brush({ mixing: { kind: "wet", strength: 0.8 } }),
        stroke([0.5]),
        hitProvider([uvHit(0.5, 0.5)]).provider,
      ),
    ).toThrowError(/wet mixing needs a texture-neighborhood backend/);
  });

  it("keeps the existing 2D composition output byte-compatible when a surface provider is present", () => {
    const program = compositionProgramIRSchema.parse({
      id: "two-d",
      name: "two-d",
      lane: "stable",
      input: { backend: "ema", strength: 0, predictionMs: 0 },
      layers: [
        {
          id: "line",
          geometry: { kind: "vector-outline" },
          engine: { engine: "vector-fill", baseSizePx: 4 },
        },
      ],
    });
    const input = stroke([0.4, 0.8]).samples;
    const baseline = executeCompositionProgram(program, input, { vello: fakeVello() }, {
      width: WIDTH,
      height: HEIGHT,
    });
    const withSurface = executeCompositionProgram(
      program,
      input,
      {
        vello: fakeVello(),
        surface: hitProvider([uvHit(0.2, 0.5), uvHit(0.8, 0.5)]).provider,
      },
      { width: WIDTH, height: HEIGHT },
    );
    expect(withSurface.pixels).toEqual(baseline.pixels);
    expect(withSurface.layers).toEqual(baseline.layers);
    expect(withSurface.warnings).toEqual(baseline.warnings);
  });

  it("rejects invalid provider receipts instead of claiming partial texture success", () => {
    const recorder = hitProvider([uvHit(0.5, 0.5)], { commit: "mismatch" });
    expect(() =>
      executeSurfaceBrushStroke(brush(), stroke([0.5]), recorder.provider),
    ).toThrowError(CompositionExecutionError);
    expect(recorder.cancellations).toEqual(["commit-failed"]);
  });
});
