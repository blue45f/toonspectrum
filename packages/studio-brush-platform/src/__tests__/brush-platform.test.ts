
import {
  EngineCapabilityRegistry,
  HybridExecutionPlanner,
} from "@toonspectrum/studio-engine-registry";
import {
  brushProgramIRSchema,
  deviceCalibrationIRSchema,
  fnv1a64Hex,
  canonicalJson,
  pathBounds,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { BrushCompileError, compileVectorBrush } from "../compile";
import { effectiveSizeAt } from "../geometry";
import { modelRawInput } from "../input";
import { hokusaiProviderDescriptor, registerBrushPlatformProviders } from "../providers";
import { applyStabilizer, pathJitterEnergy } from "../stabilizer";

import type {
  ModeledSampleIR,
  RawInputSampleIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

const calibration = deviceCalibrationIRSchema.parse({
  deviceId: "test-pen",
  pressureCurve: [0, 1],
});

function rawSample(overrides: Partial<RawInputSampleIR>): RawInputSampleIR {
  return {
    x: 0,
    y: 0,
    tMs: 0,
    pressure: 0.5,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    pointerType: "pen",
    phase: "move",
    source: "raw",
    ...overrides,
  };
}

/** Deterministic jittery diagonal: y = x + high-frequency hand tremor. */
function jitteryLine(count: number): ModeledSampleIR[] {
  const samples: ModeledSampleIR[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const noise = (index % 2 === 0 ? 1 : -1) * 2.2 + Math.sin(index * 0.9) * 0.6;
    samples.push({
      x: t * 100,
      y: t * 100 + noise,
      tMs: index * 8,
      pressure: 0.6,
      velocity: 1,
      altitudeDeg: 90,
      azimuthDeg: 0,
    });
  }
  return samples;
}

describe("input modeling", () => {
  it("drops predicted samples and keeps coalesced ones", () => {
    const modeled = modelRawInput(
      [
        rawSample({ tMs: 0, phase: "down" }),
        rawSample({ x: 4, tMs: 8, source: "coalesced" }),
        rawSample({ x: 8, tMs: 16, source: "predicted" }),
        rawSample({ x: 6, tMs: 16, phase: "up" }),
      ],
      calibration,
    );
    expect(modeled).toHaveLength(3);
    expect(modeled.map((sample) => sample.x)).toEqual([0, 4, 6]);
  });

  it("computes smoothed velocity in px/ms", () => {
    const modeled = modelRawInput(
      [
        rawSample({ tMs: 0 }),
        rawSample({ x: 8, tMs: 8 }),
        rawSample({ x: 16, tMs: 16 }),
      ],
      calibration,
      { velocitySmoothing: 1 },
    );
    expect(modeled[1]?.velocity).toBeCloseTo(1);
    expect(modeled[2]?.velocity).toBeCloseTo(1);
  });
});

describe("stabilizer", () => {
  it.each(["ema", "spring"] as const)("%s reduces jitter and preserves endpoints", (kind) => {
    const noisy = jitteryLine(48);
    const stabilized = applyStabilizer(noisy, {
      kind,
      strength: 0.7,
      predictionMs: 0,
    });
    expect(stabilized).toHaveLength(noisy.length);
    expect(pathJitterEnergy(stabilized)).toBeLessThan(pathJitterEnergy(noisy) * 0.6);
    const lastIn = noisy.at(-1);
    const lastOut = stabilized.at(-1);
    expect(lastOut?.x).toBe(lastIn?.x);
    expect(lastOut?.y).toBe(lastIn?.y);
  });

  it("strength 0 and kind none are passthrough", () => {
    const noisy = jitteryLine(16);
    expect(applyStabilizer(noisy, { kind: "none", strength: 1, predictionMs: 0 })).toEqual(noisy);
    expect(applyStabilizer(noisy, { kind: "ema", strength: 0, predictionMs: 0 })).toEqual(noisy);
  });
});

describe("vector brush compile + bake", () => {
  const program = brushProgramIRSchema.parse({
    id: "v11-g-pen",
    name: "V11 G-Pen",
    stabilizer: { kind: "ema", strength: 0.4, predictionMs: 0 },
    sizeDynamics: [{ input: "pressure", curve: [0.2, 1], min: 0.3, max: 1 }],
  });

  function stroke(): StrokeIR {
    return {
      id: "stroke-1",
      brushPresetId: program.id,
      seed: 7,
      color: { r: 0.1, g: 0.1, b: 0.12, a: 1 },
      baseSizePx: 8,
      samples: jitteryLine(32),
    };
  }

  it("bakes an editable closed fill path covering the stroke chord", () => {
    const compiled = compileVectorBrush(program);
    const node = compiled.bake(stroke());
    if (node.kind !== "fill-path") throw new Error("expected fill-path bake");
    expect(node.path.verbs.at(-1)?.v).toBe("Z");
    const bounds = pathBounds(node.path);
    expect(bounds).not.toBeNull();
    expect((bounds?.maxX ?? 0) - (bounds?.minX ?? 0)).toBeGreaterThan(80);
  });

  it("bake is deterministic (same stroke → identical path digest)", () => {
    const compiled = compileVectorBrush(program);
    const a = fnv1a64Hex(canonicalJson(compiled.bake(stroke())));
    const b = fnv1a64Hex(canonicalJson(compiled.bake(stroke())));
    expect(a).toBe(b);
  });

  it("pressure dynamics scale effective size", () => {
    const light = effectiveSizeAt(program, 10, { ...jitteryLine(3)[1]!, pressure: 0 });
    const heavy = effectiveSizeAt(program, 10, { ...jitteryLine(3)[1]!, pressure: 1 });
    // curve [0.2, 1] with min 0.3/max 1: p=0 → 0.3 + 0.7*0.2 = 0.44 → 4.4px.
    expect(light).toBeCloseTo(4.4);
    expect(heavy).toBeCloseTo(10);
    expect(heavy).toBeGreaterThan(light * 2);
  });

  it("rejects raster-tile programs and gated google-ink geometry", () => {
    expect(() =>
      compileVectorBrush(
        brushProgramIRSchema.parse({
          id: "wet",
          name: "wet",
          output: { target: "raster-tiles", bake: "flatten" },
        }),
      ),
    ).toThrow(BrushCompileError);
    expect(() =>
      compileVectorBrush(
        brushProgramIRSchema.parse({
          id: "ink",
          name: "ink",
          geometry: {
            kind: "google-ink-mesh",
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            capStart: true,
            capEnd: true,
          },
        }),
      ),
    ).toThrow(BrushCompileError);
  });
});

describe("provider registration + planner routing", () => {
  it("registers stroke-geometry and natural-media providers and routes them", () => {
    const registry = new EngineCapabilityRegistry();
    registerBrushPlatformProviders(registry);
    const planner = new HybridExecutionPlanner(registry);
    const plan = planner.plan({
      surfaceId: "studio-main",
      mode: "interactive",
      primaryCandidates: ["hokusai-natural-media"],
      islands: [
        {
          islandId: "inking",
          kind: "stroke-geometry",
          requiredCapabilities: ["stroke.geometry.pressure-outline"],
          availableTransports: ["shared-array-buffer-tile"],
        },
        {
          islandId: "watercolor",
          kind: "natural-media",
          requiredCapabilities: ["brush.natural-media.myb"],
          availableTransports: ["shared-array-buffer-tile"],
        },
      ],
    });
    expect(plan.islands.map((island) => island.providerId)).toEqual([
      "perfect-freehand",
      "hokusai-natural-media",
    ]);
  });

  it("keeps the Hokusai natural-media lane fail-closed without a texture-substituting fallback", () => {
    // V17.1: no texture-equivalence certification exists for a Skia rendition of Hokusai
    // natural-media output, so the descriptor must not advertise a fallback provider — a
    // device-incapable host hides natural-media brushes instead of silently substituting
    // texture. Restoring a fallback requires a checked-in equivalence certification.
    expect(hokusaiProviderDescriptor.fallbackProviderId).toBeNull();
    const registry = new EngineCapabilityRegistry();
    registerBrushPlatformProviders(registry);
    expect(registry.fallbackChain("hokusai-natural-media")).toEqual([
      "hokusai-natural-media",
    ]);
  });
});
