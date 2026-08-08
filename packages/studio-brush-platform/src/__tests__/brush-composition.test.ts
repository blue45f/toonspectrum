import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  COMPOSITION_PRESETS,
  CompositionExecutionError,
  UNAVAILABLE_COMPOSITION_ROWS,
  V12_SECTION_12_2_ROW_NAMES,
  compositionLayerIRSchema,
  compositionProgramIRSchema,
  describeCompositionChain,
  executeCompositionProgram,
  standardCompositionStrokeSamples,
} from "../brush-composition";
import { standardZigzagStrokeSamples } from "../raster-compile";

import type {
  CompositionEngines,
  CompositionProgramIR,
  VelloCompositionEngine,
} from "../brush-composition";
import type { LibMypaintRaw } from "../libmypaint/index";
import type { HokusaiModuleLike } from "../raster-compile";
import type { ModeledSampleIR, SceneIR } from "@toonspectrum/studio-project-model";

/**
 * Composition brush program contracts (V12 §12.2): IR schema invariants,
 * §12.2 row coverage (presets + explicit unavailable manifest partition the
 * table exactly), stage contract enforcement, warning prefixes, determinism
 * and composite semantics. Engines are structural fakes here — the real
 * wasm chain is gated by tests/visual/brush-composition.test.ts.
 */

const WIDTH = 64;
const HEIGHT = 48;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Structural engine fakes (deterministic, dependency-free)
// ---------------------------------------------------------------------------

/** Vello fake: fills every pixel with the first fill-path node's color. */
function fakeVelloFill(): VelloCompositionEngine {
  return {
    renderScene(scene: SceneIR): Uint8Array {
      const frame = new Uint8Array(scene.width * scene.height * 4);
      const node = scene.nodes[0];
      if (!node || node.kind !== "fill-path" || node.paint.kind !== "solid") {
        return frame;
      }
      const { r, g, b, a } = node.paint.color;
      for (let at = 0; at < scene.width * scene.height; at += 1) {
        frame[at * 4] = Math.round(r * 255);
        frame[at * 4 + 1] = Math.round(g * 255);
        frame[at * 4 + 2] = Math.round(b * 255);
        frame[at * 4 + 3] = Math.round(a * 255);
      }
      return frame;
    },
  };
}

/** Vello fake: plots each outline verb endpoint (frame depends on the path). */
function fakeVelloPlot(): VelloCompositionEngine {
  return {
    renderScene(scene: SceneIR): Uint8Array {
      const frame = new Uint8Array(scene.width * scene.height * 4);
      for (const node of scene.nodes) {
        if (node.kind !== "fill-path") continue;
        for (const verb of node.path.verbs) {
          if (verb.v === "Z") continue;
          const x = Math.min(scene.width - 1, Math.max(0, Math.round(verb.x)));
          const y = Math.min(scene.height - 1, Math.max(0, Math.round(verb.y)));
          const base = (y * scene.width + x) * 4;
          frame[base] = 10;
          frame[base + 1] = 10;
          frame[base + 2] = 10;
          frame[base + 3] = 255;
        }
      }
      return frame;
    },
  };
}

interface FakeLibmypaintRecorder {
  raw: LibMypaintRaw;
  strokes: Array<{ x: number; y: number; tiltX: number; tiltY: number }>;
}

/** Minimal LibMypaintRaw double: plots strokeTo samples onto the surface. */
function fakeLibmypaint(
  knownSettings: readonly string[],
  knownInputs: readonly string[] = ["pressure"],
): FakeLibmypaintRecorder {
  const surfaces = new Map<number, { width: number; height: number; alpha: Uint8Array }>();
  const strokes: FakeLibmypaintRecorder["strokes"] = [];
  let nextHandle = 1;
  const raw = {
    version: () => "fake libmypaint",
    settingCount: () => knownSettings.length,
    inputCount: () => knownInputs.length,
    settingId: (name: string) => knownSettings.indexOf(name),
    inputId: (name: string) => knownInputs.indexOf(name),
    brushNew: () => nextHandle++,
    brushFree: () => undefined,
    brushSetBaseValue: () => undefined,
    brushGetBaseValue: () => 0,
    brushSetMappingN: () => undefined,
    brushSetMappingPoint: () => undefined,
    brushNewStroke: () => undefined,
    surfaceNew: (width: number, height: number) => {
      const handle = nextHandle++;
      surfaces.set(handle, { width, height, alpha: new Uint8Array(width * height) });
      return handle;
    },
    surfaceFree: (surface: number) => {
      surfaces.delete(surface);
    },
    strokeTo: (
      _brush: number,
      surface: number,
      x: number,
      y: number,
      pressure: number,
      tiltX: number,
      tiltY: number,
    ) => {
      strokes.push({ x, y, tiltX, tiltY });
      const target = surfaces.get(surface);
      if (!target) return 0;
      const px = Math.min(target.width - 1, Math.max(0, Math.round(x)));
      const py = Math.min(target.height - 1, Math.max(0, Math.round(y)));
      const at = py * target.width + px;
      target.alpha[at] = Math.max(
        target.alpha[at] ?? 0,
        Math.round(40 + pressure * 215),
      );
      return 1;
    },
    surfaceToRgba8: (surface: number, width: number, height: number) => {
      const target = surfaces.get(surface);
      const frame = new Uint8Array(width * height * 4);
      if (!target) return frame;
      for (let at = 0; at < width * height; at += 1) {
        const alpha = target.alpha[at] ?? 0;
        frame[at * 4] = 30;
        frame[at * 4 + 1] = 20;
        frame[at * 4 + 2] = 60;
        frame[at * 4 + 3] = alpha;
      }
      return frame;
    },
    module: {},
  } as unknown as LibMypaintRaw;
  return { raw, strokes };
}

interface FakeHokusaiRecorder {
  module: HokusaiModuleLike;
  mybJsons: string[];
}

/** Minimal Hokusai double: plots addSample positions onto the frame. */
function fakeHokusai(): FakeHokusaiRecorder {
  const mybJsons: string[] = [];

  class FakeBrush {
    constructor(mybJson: string) {
      mybJsons.push(mybJson);
    }
    free(): void {}
    setColorHsv(): void {}
    setRadiusLog(): void {}
  }

  class FakeCanvas {
    private readonly alpha: Uint8Array;
    constructor(
      private readonly width: number,
      private readonly height: number,
    ) {
      this.alpha = new Uint8Array(width * height);
    }
    beginStroke(): void {}
    addSample(
      _brush: unknown,
      x: number,
      y: number,
      pressure: number,
    ): boolean {
      const px = Math.min(this.width - 1, Math.max(0, Math.round(x)));
      const py = Math.min(this.height - 1, Math.max(0, Math.round(y)));
      const at = py * this.width + px;
      this.alpha[at] = Math.max(this.alpha[at] ?? 0, Math.round(30 + pressure * 225));
      return true;
    }
    finishStroke(): boolean {
      return true;
    }
    fullFrame(): Uint8Array {
      const frame = new Uint8Array(this.width * this.height * 4);
      for (let at = 0; at < this.width * this.height; at += 1) {
        frame[at * 4] = 70;
        frame[at * 4 + 1] = 40;
        frame[at * 4 + 2] = 10;
        frame[at * 4 + 3] = this.alpha[at] ?? 0;
      }
      return frame;
    }
    dispose(): void {}
    free(): void {}
  }

  return {
    module: {
      HokusaiBrush: FakeBrush,
      HokusaiCanvas: FakeCanvas,
    } as unknown as HokusaiModuleLike,
    mybJsons,
  };
}

// ---------------------------------------------------------------------------
// Program/sample builders
// ---------------------------------------------------------------------------

function samples(count = 24): ModeledSampleIR[] {
  return standardCompositionStrokeSamples(WIDTH, HEIGHT, count);
}

function vectorProgram(
  overrides: Partial<CompositionProgramIR> = {},
): CompositionProgramIR {
  return compositionProgramIRSchema.parse({
    id: "unit-vector",
    name: "unit-vector",
    lane: "stable",
    input: { backend: "ema", strength: 0.3, predictionMs: 0 },
    layers: [
      {
        id: "line",
        geometry: { kind: "vector-outline" },
        engine: {
          engine: "vector-fill",
          color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          baseSizePx: 4,
        },
      },
    ],
    ...overrides,
  });
}

function libmypaintProgram(
  settings: Record<string, { base_value: number; inputs?: Record<string, Array<[number, number]>> }>,
): CompositionProgramIR {
  return compositionProgramIRSchema.parse({
    id: "unit-lmp",
    name: "unit-lmp",
    lane: "stable",
    layers: [
      {
        id: "wash",
        geometry: { kind: "raster-dab" },
        engine: { engine: "libmypaint", settings },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Schema + preset manifest
// ---------------------------------------------------------------------------

describe("CompositionProgramIR schema", () => {
  it("presets all parse and carry §12.2 row names verbatim", () => {
    const rowNames = new Set(V12_SECTION_12_2_ROW_NAMES);
    const ids = new Set<string>();
    for (const preset of COMPOSITION_PRESETS) {
      expect(() => compositionProgramIRSchema.parse(preset)).not.toThrow();
      expect(rowNames.has(preset.name), `${preset.name} is a §12.2 row`).toBe(true);
      expect(ids.has(preset.id), `${preset.id} unique`).toBe(false);
      ids.add(preset.id);
    }
  });

  it("presets + unavailable manifest partition the §12.2 table exactly", () => {
    const implemented = COMPOSITION_PRESETS.map((preset) => preset.name);
    const unavailable = UNAVAILABLE_COMPOSITION_ROWS.map((row) => row.name);
    const union = [...implemented, ...unavailable].sort();
    expect(union).toEqual([...V12_SECTION_12_2_ROW_NAMES].sort());
    expect(new Set(union).size).toBe(V12_SECTION_12_2_ROW_NAMES.length);
    for (const row of UNAVAILABLE_COMPOSITION_ROWS) {
      expect(row.missing.length, `${row.name} names its missing provider`).toBeGreaterThan(
        0,
      );
    }
  });

  it("rejects a vector-outline geometry paired with a raster engine", () => {
    const result = compositionLayerIRSchema.safeParse({
      id: "bad",
      geometry: { kind: "vector-outline" },
      engine: { engine: "libmypaint", settings: {} },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a raster-dab geometry paired with the vector-fill engine", () => {
    const result = compositionLayerIRSchema.safeParse({
      id: "bad",
      geometry: { kind: "raster-dab" },
      engine: { engine: "vector-fill" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-bounds composite opacity and unknown blend modes", () => {
    const base = {
      id: "bad",
      geometry: { kind: "raster-dab" },
      engine: { engine: "libmypaint", settings: {} },
    };
    expect(
      compositionLayerIRSchema.safeParse({
        ...base,
        composite: { blend: "src-over", opacity: 1.5 },
      }).success,
    ).toBe(false);
    expect(
      compositionLayerIRSchema.safeParse({
        ...base,
        composite: { blend: "screen", opacity: 1 },
      }).success,
    ).toBe(false);
  });

  it("materializes stage defaults (input backend, composite policy)", () => {
    const parsed = compositionProgramIRSchema.parse({
      id: "defaults",
      name: "defaults",
      lane: "stable",
      layers: [
        {
          id: "only",
          geometry: { kind: "raster-dab" },
          engine: { engine: "libmypaint", settings: {} },
        },
      ],
    });
    expect(parsed.input).toEqual({ backend: "ema", strength: 0.35, predictionMs: 0 });
    expect(parsed.layers[0]?.composite).toEqual({ blend: "src-over", opacity: 1 });
    expect(parsed.laneNote).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Executor stage contracts
// ---------------------------------------------------------------------------

describe("executeCompositionProgram stage contracts", () => {
  it("fails loudly on empty stroke input, naming the input stage", () => {
    expect(() =>
      executeCompositionProgram(vectorProgram(), [], { vello: fakeVelloFill() }),
    ).toThrowError(/input\[ema\]: stroke input is empty/);
  });

  it("requires an injected ink modeler for the ink-stroke-modeler backend", () => {
    const program = vectorProgram({
      input: { backend: "ink-stroke-modeler", strength: 0, predictionMs: 0 },
    });
    expect(() =>
      executeCompositionProgram(program, samples(), { vello: fakeVelloFill() }),
    ).toThrowError(/input\[ink-stroke-modeler\].*modeler/);
  });

  it("requires engines.vello for vector-fill layers", () => {
    expect(() => executeCompositionProgram(vectorProgram(), samples(), {})).toThrowError(
      CompositionExecutionError,
    );
    expect(() =>
      executeCompositionProgram(vectorProgram(), samples(), {}),
    ).toThrowError(/layer\[line\]\.engine\[vector-fill\]: needs engines\.vello/);
  });

  it("requires fitPolyline when a layer requests the Kurbo centerline fit", () => {
    const program = vectorProgram({
      layers: [
        {
          id: "fit",
          geometry: { kind: "vector-outline", kurboFitAccuracy: 0.35 },
          engine: { engine: "vector-fill" },
        },
      ],
    } as Partial<CompositionProgramIR>);
    expect(() =>
      executeCompositionProgram(program, samples(), { vello: fakeVelloFill() }),
    ).toThrowError(/kurbo-centerline.*fitPolyline/);
  });

  it("rejects a kurbo fit that collapses the centerline", () => {
    const program = vectorProgram({
      layers: [
        {
          id: "fit",
          geometry: { kind: "vector-outline", kurboFitAccuracy: 0.35 },
          engine: { engine: "vector-fill" },
        },
      ],
    } as Partial<CompositionProgramIR>);
    const collapsing: VelloCompositionEngine = {
      ...fakeVelloFill(),
      fitPolyline: () => ({ verbs: [{ v: "M", x: 0, y: 0 }] }),
    };
    expect(() =>
      executeCompositionProgram(program, samples(), { vello: collapsing }),
    ).toThrowError(/collapsed the centerline to 1 verbs/);
  });

  it("requires the matching wasm engine for each raster lane", () => {
    const lmpProgram = libmypaintProgram({ opaque: { base_value: 1 } });
    expect(() => executeCompositionProgram(lmpProgram, samples(), {})).toThrowError(
      /layer\[wash\]\.engine\[libmypaint\]: needs engines\.libmypaint/,
    );
    const hokusaiProgram = compositionProgramIRSchema.parse({
      id: "unit-hokusai",
      name: "unit-hokusai",
      lane: "stable",
      layers: [
        {
          id: "dab",
          geometry: { kind: "raster-dab" },
          engine: { engine: "hokusai" },
        },
      ],
    });
    expect(() => executeCompositionProgram(hokusaiProgram, samples(), {})).toThrowError(
      /layer\[dab\]\.engine\[hokusai\]: needs engines\.hokusai/,
    );
  });

  it("rejects an engine frame that violates the width*height*4 contract", () => {
    const brokenVello: VelloCompositionEngine = {
      renderScene: () => new Uint8Array(16),
    };
    expect(() =>
      executeCompositionProgram(vectorProgram(), samples(), { vello: brokenVello }),
    ).toThrowError(/contract requires width\*height\*4/);
  });

  it("rejects a zero-ink layer frame instead of silently compositing it", () => {
    const emptyVello: VelloCompositionEngine = {
      renderScene: (scene) => new Uint8Array(scene.width * scene.height * 4),
    };
    expect(() =>
      executeCompositionProgram(vectorProgram(), samples(), { vello: emptyVello }),
    ).toThrowError(/zero ink/);
  });
});

// ---------------------------------------------------------------------------
// Determinism, composite semantics, warnings, reports
// ---------------------------------------------------------------------------

describe("executeCompositionProgram semantics", () => {
  const options = { width: WIDTH, height: HEIGHT, seed: 7 };

  it("is deterministic: identical program + input + engines → identical pixels", () => {
    const program = compositionProgramIRSchema.parse({
      id: "unit-multi",
      name: "unit-multi",
      lane: "stable",
      layers: [
        {
          id: "base",
          geometry: { kind: "raster-dab" },
          engine: { engine: "hokusai" },
        },
        {
          id: "mix",
          geometry: { kind: "raster-dab" },
          engine: { engine: "libmypaint", settings: { opaque: { base_value: 1 } } },
          composite: { blend: "src-over", opacity: 0.9 },
        },
      ],
    });
    const engines: CompositionEngines = {
      hokusai: fakeHokusai().module,
      libmypaint: fakeLibmypaint(["opaque"]).raw,
    };
    const first = executeCompositionProgram(program, samples(), engines, options);
    const second = executeCompositionProgram(program, samples(), engines, options);
    expect(sha256(second.pixels)).toBe(sha256(first.pixels));
    expect(second.warnings).toEqual(first.warnings);
  });

  it("changing only the stabilizer backend changes the rendered pixels", () => {
    const engines: CompositionEngines = { vello: fakeVelloPlot() };
    const jittered = samples(48).map((sample, index) => ({
      ...sample,
      y: sample.y + (index % 2 === 0 ? 2.5 : -2.5),
    }));
    const ema = executeCompositionProgram(
      vectorProgram({ input: { backend: "ema", strength: 0.8, predictionMs: 0 } }),
      jittered,
      engines,
      options,
    );
    const spring = executeCompositionProgram(
      vectorProgram({ input: { backend: "spring", strength: 0.8, predictionMs: 0 } }),
      jittered,
      engines,
      options,
    );
    expect(sha256(spring.pixels)).not.toBe(sha256(ema.pixels));
  });

  it("composites layers in declared order (order manipulation is visible)", () => {
    const layerA = {
      id: "a",
      geometry: { kind: "vector-outline" },
      engine: {
        engine: "vector-fill",
        color: { r: 0.9, g: 0.1, b: 0.1, a: 1 },
        baseSizePx: 4,
      },
    };
    const layerB = {
      id: "b",
      geometry: { kind: "vector-outline" },
      engine: {
        engine: "vector-fill",
        color: { r: 0.1, g: 0.1, b: 0.9, a: 1 },
        baseSizePx: 4,
      },
    };
    const engines: CompositionEngines = { vello: fakeVelloFill() };
    const forward = executeCompositionProgram(
      vectorProgram({ layers: [layerA, layerB] } as Partial<CompositionProgramIR>),
      samples(),
      engines,
      options,
    );
    const reversed = executeCompositionProgram(
      vectorProgram({ layers: [layerB, layerA] } as Partial<CompositionProgramIR>),
      samples(),
      engines,
      options,
    );
    expect(sha256(reversed.pixels)).not.toBe(sha256(forward.pixels));
    // Fill fake paints every pixel: the last src-over layer wins.
    expect(forward.pixels[2]).toBeGreaterThan(forward.pixels[0] ?? 0);
    expect(reversed.pixels[0]).toBeGreaterThan(reversed.pixels[2] ?? 0);
  });

  it("multiply darkens the backdrop where src-over would replace it", () => {
    const gray = {
      geometry: { kind: "vector-outline" },
      engine: {
        engine: "vector-fill",
        color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        baseSizePx: 4,
      },
    };
    const base = { ...gray, id: "base" };
    const engines: CompositionEngines = { vello: fakeVelloFill() };
    const srcOver = executeCompositionProgram(
      vectorProgram({
        layers: [base, { ...gray, id: "top", composite: { blend: "src-over", opacity: 1 } }],
      } as Partial<CompositionProgramIR>),
      samples(),
      engines,
      options,
    );
    const multiply = executeCompositionProgram(
      vectorProgram({
        layers: [base, { ...gray, id: "top", composite: { blend: "multiply", opacity: 1 } }],
      } as Partial<CompositionProgramIR>),
      samples(),
      engines,
      options,
    );
    // src-over keeps 0.5 gray; multiply yields 0.5 * 0.5 = 0.25.
    expect(srcOver.pixels[0]).toBe(128);
    expect(multiply.pixels[0]).toBe(64);
    expect(srcOver.pixels[3]).toBe(255);
    expect(multiply.pixels[3]).toBe(255);
  });

  it("scales a layer by its composite opacity", () => {
    const black = {
      id: "veil",
      geometry: { kind: "vector-outline" },
      engine: {
        engine: "vector-fill",
        color: { r: 0, g: 0, b: 0, a: 1 },
        baseSizePx: 4,
      },
      composite: { blend: "src-over", opacity: 0.25 },
    };
    const engines: CompositionEngines = { vello: fakeVelloFill() };
    const result = executeCompositionProgram(
      vectorProgram({ layers: [black] } as Partial<CompositionProgramIR>),
      samples(),
      engines,
      options,
    );
    // White backdrop through a 25% black veil → 0.75 gray.
    expect(result.pixels[0]).toBe(191);
  });

  it("prefixes libmypaint injection reports with the layer + engine stage", () => {
    const recorder = fakeLibmypaint(["opaque"], ["pressure"]);
    const program = libmypaintProgram({
      opaque: { base_value: 1, inputs: { mystery_axis: [[0, 0], [1, 1]] } },
      totally_unknown_setting: { base_value: 0.5 },
    });
    const result = executeCompositionProgram(
      program,
      samples(),
      { libmypaint: recorder.raw },
      options,
    );
    expect(result.warnings).toContain(
      "layer[wash].engine[libmypaint] unknown setting: totally_unknown_setting",
    );
    expect(result.warnings).toContain(
      "layer[wash].engine[libmypaint] unknown input: opaque.inputs.mystery_axis",
    );
  });

  it("never synthesizes in-engine smoothing for hokusai layers (stage 1 owns it)", () => {
    const recorder = fakeHokusai();
    const program = compositionProgramIRSchema.parse({
      id: "unit-hokusai-smoothing",
      name: "unit-hokusai-smoothing",
      lane: "stable",
      input: { backend: "ema", strength: 0.9, predictionMs: 0 },
      layers: [
        {
          id: "dab",
          geometry: { kind: "raster-dab" },
          engine: { engine: "hokusai" },
        },
      ],
    });
    const result = executeCompositionProgram(
      program,
      samples(),
      { hokusai: recorder.module },
      options,
    );
    expect(recorder.mybJsons).toHaveLength(1);
    expect(recorder.mybJsons[0]).not.toContain("slow_tracking");
    expect(
      result.warnings.some((warning) => warning.includes("stabilizer")),
    ).toBe(false);
  });

  it("fits the CENTERLINE (never the outline polygon) and reports the fit", () => {
    const fitCalls: Array<{ count: number; closed: boolean | undefined }> = [];
    const vello: VelloCompositionEngine = {
      ...fakeVelloPlot(),
      fitPolyline: (points, fitOptions) => {
        fitCalls.push({ count: points.length, closed: fitOptions.closed });
        const first = points[0] ?? ([0, 0] as const);
        const last = points[points.length - 1] ?? first;
        return {
          verbs: [
            { v: "M", x: first[0], y: first[1] },
            { v: "L", x: last[0], y: last[1] },
          ],
        };
      },
    };
    const input = samples(24);
    const program = vectorProgram({
      layers: [
        {
          id: "fit",
          geometry: { kind: "vector-outline", kurboFitAccuracy: 0.35 },
          engine: { engine: "vector-fill", baseSizePx: 6 },
        },
      ],
    } as Partial<CompositionProgramIR>);
    const result = executeCompositionProgram(program, input, { vello }, options);
    // Exactly one fit, fed the 24 stabilized centerline samples, open path —
    // an outline-polygon fit would carry hundreds of points and closed: true.
    expect(fitCalls).toEqual([{ count: input.length, closed: false }]);
    expect(result.layers[0]?.centerlineVerbs).toBe(2);
    // M + 16 fixed flatten steps per segment, duplicates dropped.
    expect(result.layers[0]?.geometrySamples).toBe(17);
  });

  it("carries pressure onto the fitted centerline by arc length (no invented dynamics)", () => {
    const carried: number[] = [];
    const vello: VelloCompositionEngine = {
      renderScene: (scene) => {
        const frame = new Uint8Array(scene.width * scene.height * 4);
        frame[3] = 255;
        return frame;
      },
      fitPolyline: (points) => {
        const first = points[0] ?? ([0, 0] as const);
        const last = points[points.length - 1] ?? first;
        return {
          verbs: [
            { v: "M", x: first[0], y: first[1] },
            { v: "L", x: last[0], y: last[1] },
          ],
        };
      },
    };
    // A straight ramp: arc-length position equals pressure position, so the
    // carried pressures must reproduce the ramp monotonically.
    const ramp: ModeledSampleIR[] = [];
    for (let index = 0; index < 32; index += 1) {
      const t = index / 31;
      ramp.push({
        x: 8 + t * 48,
        y: 24,
        tMs: index * 6,
        pressure: 0.1 + 0.9 * t,
        velocity: 1,
        altitudeDeg: 90,
        azimuthDeg: 0,
      });
    }
    const spy: VelloCompositionEngine = {
      ...vello,
      renderScene: (scene) => {
        const node = scene.nodes[0];
        if (node?.kind === "fill-path") carried.push(node.path.verbs.length);
        return vello.renderScene(scene);
      },
    };
    const program = vectorProgram({
      layers: [
        {
          id: "fit",
          geometry: { kind: "vector-outline", thinning: 1, kurboFitAccuracy: 0.35 },
          engine: { engine: "vector-fill", baseSizePx: 8 },
        },
      ],
    } as Partial<CompositionProgramIR>);
    const withFit = executeCompositionProgram(program, ramp, { vello: spy }, options);
    expect(withFit.layers[0]?.geometrySamples).toBe(17);
    expect(carried[0]).toBeGreaterThan(4);
    // thinning 1 makes width track pressure: the outline must stay asymmetric
    // (a lost pressure ramp would collapse it to a constant-width sliver).
    const noFit = executeCompositionProgram(
      vectorProgram({
        layers: [
          {
            id: "fit",
            geometry: { kind: "vector-outline", thinning: 1 },
            engine: { engine: "vector-fill", baseSizePx: 8 },
          },
        ],
      } as Partial<CompositionProgramIR>),
      ramp,
      { vello: spy },
      options,
    );
    expect(noFit.layers[0]?.centerlineVerbs).toBeUndefined();
    expect(noFit.layers[0]?.geometrySamples).toBe(ramp.length);
  });

  it("lowers IR tilt onto the engines' [-1, 1] tilt plane", () => {
    const recorder = fakeLibmypaint(["opaque"]);
    const program = libmypaintProgram({ opaque: { base_value: 1 } });
    const tilted: ModeledSampleIR[] = samples(8).map((sample, index) => ({
      ...sample,
      altitudeDeg: index === 0 ? 0 : 90,
      azimuthDeg: 0,
    }));
    executeCompositionProgram(program, tilted, { libmypaint: recorder.raw }, options);
    const first = recorder.strokes[0];
    const second = recorder.strokes[1];
    expect(first?.tiltX).toBeCloseTo(1, 6);
    expect(first?.tiltY).toBeCloseTo(0, 6);
    expect(second?.tiltX).toBeCloseTo(0, 6);
    expect(second?.tiltY).toBeCloseTo(0, 6);
  });

  it("reports per-layer ink and the input stage sample counts", () => {
    const recorder = fakeLibmypaint(["opaque"]);
    const program = libmypaintProgram({ opaque: { base_value: 1 } });
    const input = samples(24);
    const result = executeCompositionProgram(
      program,
      input,
      { libmypaint: recorder.raw },
      options,
    );
    expect(result.input).toEqual({ backend: "ema", inSamples: 24, outSamples: 24 });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]?.id).toBe("wash");
    expect(result.layers[0]?.engine).toBe("libmypaint");
    expect(result.layers[0]?.inkedPixels).toBeGreaterThan(0);
    expect(result.width).toBe(WIDTH);
    expect(result.height).toBe(HEIGHT);
    expect(result.pixels).toHaveLength(WIDTH * HEIGHT * 4);
  });
});

// ---------------------------------------------------------------------------
// Shared stroke input + chain description
// ---------------------------------------------------------------------------

describe("standardCompositionStrokeSamples", () => {
  it("lifts the standard preview zigzag verbatim into ModeledSampleIR", () => {
    const lifted = standardCompositionStrokeSamples(192, 96, 96);
    const zigzag = standardZigzagStrokeSamples(192, 96, 96);
    expect(lifted).toHaveLength(zigzag.length);
    for (const [index, sample] of lifted.entries()) {
      expect(sample.x).toBe(zigzag[index]?.x);
      expect(sample.y).toBe(zigzag[index]?.y);
      expect(sample.pressure).toBe(zigzag[index]?.pressure);
      expect(sample.tMs).toBe(zigzag[index]?.tMs);
      expect(Number.isFinite(sample.velocity)).toBe(true);
      expect(sample.velocity).toBeGreaterThanOrEqual(0);
      expect(sample.altitudeDeg).toBe(90);
      expect(sample.azimuthDeg).toBe(0);
    }
    expect(lifted[0]?.velocity).toBe(0);
    expect(lifted[1]?.velocity).toBeGreaterThan(0);
  });
});

describe("describeCompositionChain", () => {
  it("names backend, geometry (with kurbo centerline), engine and composite policy", () => {
    const preset = COMPOSITION_PRESETS.find((entry) => entry.id === "g-pen-mapping-pen");
    expect(preset).toBeDefined();
    const chain = describeCompositionChain(preset!);
    expect(chain).toBe(
      "ink-stroke-modeler → [nib: kurbo-centerline+vector-outline → vector-fill → src-over@1]",
    );
  });

  it("lists multi-layer chains in composite order", () => {
    const preset = COMPOSITION_PRESETS.find((entry) => entry.id === "calligraphy");
    expect(preset).toBeDefined();
    const chain = describeCompositionChain(preset!);
    expect(chain).toContain("coat: kurbo-centerline+vector-outline → vector-fill → multiply@0.85");
    expect(chain).toContain("core: vector-outline → vector-fill → src-over@1");
    expect(chain.indexOf("coat")).toBeLessThan(chain.indexOf("core"));
  });
});
