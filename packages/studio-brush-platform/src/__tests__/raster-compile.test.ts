import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { BrushCompileError } from "../compile";
import {
  HOKUSAI_EVALUATED_SETTINGS,
  HOKUSAI_INPUT_NAMES,
  compileRasterBrush,
  renderCompiledBrushStroke,
  standardZigzagStrokeSamples,
} from "../raster-compile";

import type {
  HokusaiBrushLike,
  HokusaiModuleLike,
  RasterStrokeSample,
} from "../raster-compile";
import type { BrushProgramIR } from "@toonspectrum/studio-project-model";

function toBase64(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function mybProgram(id: string, document: unknown): BrushProgramIR {
  return brushProgramIRSchema.parse({
    id,
    name: id,
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference: ["hokusai-natural-media"],
    sourcePayload: { format: "myb-v3", base64: toBase64(document) },
  });
}

const WASH_DOC = {
  version: 3,
  group: "test",
  comment: "unit wash",
  settings: {
    radius_logarithmic: {
      base_value: 2.1,
      inputs: { pressure: [[0, -1.2], [1, 0.9]] },
    },
    opaque: { base_value: 0.8, inputs: { pressure: [[0, -0.6], [1, 0.1]] } },
    opaque_multiply: { base_value: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
    hardness: { base_value: 0.4 },
    dabs_per_actual_radius: { base_value: 3.2 },
    slow_tracking: { base_value: 2.5 },
    smudge: { base_value: 0.3 },
    color_h: { base_value: 0.6 },
    color_s: { base_value: 0.5 },
    color_v: { base_value: 0.4 },
  },
};

describe("compileRasterBrush — lane gating", () => {
  it("rejects vector-lane programs (mirror of compileVectorBrush's raster rejection)", () => {
    const vectorProgram = brushProgramIRSchema.parse({ id: "pen", name: "pen" });
    expect(() => compileRasterBrush(vectorProgram)).toThrow(BrushCompileError);
  });

  it("accepts raster-tiles targets and hokusai provider preferences", () => {
    expect(() => compileRasterBrush(mybProgram("wash", WASH_DOC))).not.toThrow();
    const preferenceOnly = brushProgramIRSchema.parse({
      id: "imported",
      name: "imported",
      providerPreference: ["hokusai-natural-media"],
      sourcePayload: { format: "myb-v3", base64: toBase64(WASH_DOC) },
    });
    expect(() => compileRasterBrush(preferenceOnly)).not.toThrow();
  });
});

describe("compileRasterBrush — myb-v3 source path", () => {
  it("passes every hokusai-evaluated setting through verbatim", () => {
    const compiled = compileRasterBrush(mybProgram("wash", WASH_DOC));
    expect(compiled.unmapped).toEqual([]);
    expect(compiled.warnings).toEqual([]);
    const { settings } = compiled.hokusaiSettings;
    expect(Object.keys(settings)).toEqual(
      Object.keys(WASH_DOC.settings).sort(),
    );
    expect(settings["radius_logarithmic"]?.base_value).toBe(2.1);
    expect(settings["radius_logarithmic"]?.inputs["pressure"]).toEqual([
      [0, -1.2],
      [1, 0.9],
    ]);
    expect(settings["opaque_multiply"]?.inputs["pressure"]).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(settings["smudge"]?.base_value).toBe(0.3);
    expect(compiled.hokusaiSettings.group).toBe("test");
    expect(compiled.hokusaiSettings.comment).toBe("unit wash");
  });

  it("is deterministic regardless of source key order", () => {
    const shuffled = {
      version: 3,
      settings: {
        color_v: { base_value: 0.4 },
        opaque: { base_value: 0.8, inputs: { pressure: [[0, -0.6], [1, 0.1]] } },
        radius_logarithmic: { base_value: 2.1 },
      },
    };
    const ordered = {
      version: 3,
      settings: {
        radius_logarithmic: { base_value: 2.1 },
        opaque: { base_value: 0.8, inputs: { pressure: [[0, -0.6], [1, 0.1]] } },
        color_v: { base_value: 0.4 },
      },
    };
    const a = compileRasterBrush(mybProgram("a", shuffled));
    const b = compileRasterBrush(mybProgram("b", ordered));
    expect(a.mybJson).toBe(b.mybJson);
  });

  it("surfaces every unmapped setting and input dimension", () => {
    const compiled = compileRasterBrush(
      mybProgram("exotic", {
        version: 3,
        settings: {
          opaque: {
            base_value: 0.5,
            inputs: {
              pressure: [[0, 0], [1, 1]],
              future_input: [[0, 0], [1, 1]],
            },
          },
          future_setting: { base_value: 1, inputs: { pressure: [[0, 0], [1, 1]] } },
          restore_color: { base_value: 1 },
          smudge: { base_value: 0.2, inputs: { viewzoom: [[0, 0], [1, 1]] } },
        },
      }),
    );
    expect(compiled.unmapped).toEqual([
      "future_setting",
      "future_setting.inputs.pressure",
      "opaque.inputs.future_input",
    ]);
    expect(compiled.warnings).toHaveLength(2);
    expect(compiled.warnings[0]).toContain("restore_color");
    expect(compiled.warnings[1]).toContain("viewzoom");
    // Undriven-but-parsed inputs stay in the emitted document (round-trip),
    // unmapped ones do not.
    expect(compiled.hokusaiSettings.settings["smudge"]?.inputs["viewzoom"]).toBeDefined();
    expect(compiled.hokusaiSettings.settings["opaque"]?.inputs["future_input"]).toBeUndefined();
    expect(compiled.hokusaiSettings.settings["future_setting"]).toBeUndefined();
  });

  it("refuses invalid payloads loudly", () => {
    const badVersion = mybProgram("v2", { version: 2, settings: {} });
    expect(() => compileRasterBrush(badVersion)).toThrow(BrushCompileError);
    const badCurve = mybProgram("curve", {
      version: 3,
      settings: { opaque: { base_value: 1, inputs: { pressure: [[0, 0]] } } },
    });
    expect(() => compileRasterBrush(badCurve)).toThrow(BrushCompileError);
    const notJson = brushProgramIRSchema.parse({
      id: "x",
      name: "x",
      output: { target: "raster-tiles", bake: "flatten" },
      sourcePayload: { format: "myb-v3", base64: globalThis.btoa("nope{") },
    });
    expect(() => compileRasterBrush(notJson)).toThrow(BrushCompileError);
  });

  it("known-set constants stay in sync with hokusai-core 0.3.0", () => {
    // Guard against accidental edits: 62 evaluated settings + restore_color
    // (parsed-inert) = the 63 cnames of hokusai-core setting.rs; 19 inputs.
    expect(HOKUSAI_EVALUATED_SETTINGS.size).toBe(62);
    expect(HOKUSAI_INPUT_NAMES.size).toBe(19);
    expect(HOKUSAI_EVALUATED_SETTINGS.has("restore_color")).toBe(false);
  });
});

describe("compileRasterBrush — IR synthesis path", () => {
  const irProgram = brushProgramIRSchema.parse({
    id: "ir-wash",
    name: "IR Wash",
    output: { target: "raster-tiles", bake: "flatten" },
    stabilizer: { kind: "ema", strength: 0.4, predictionMs: 0 },
    sizeDynamics: [
      { input: "pressure", curve: [0.2, 1], min: 0.3, max: 1 },
      { input: "velocity", curve: [0, 1], min: 0, max: 1 },
    ],
    flowDynamics: [{ input: "pressure", curve: [0, 1], min: 0.1, max: 0.9 }],
    tip: { kind: "round", hardness: 0.6, spacingPct: 10, angleJitterDeg: 0 },
    mixing: { kind: "smudge", strength: 0.35 },
  });

  it("lowers stabilizer/tip/mixing/dynamics into hokusai settings", () => {
    const compiled = compileRasterBrush(irProgram);
    const { settings } = compiled.hokusaiSettings;
    expect(settings["slow_tracking"]?.base_value).toBeCloseTo(4);
    expect(settings["hardness"]?.base_value).toBeCloseTo(0.6);
    expect(settings["dabs_per_actual_radius"]?.base_value).toBeCloseTo(5);
    expect(settings["smudge"]?.base_value).toBeCloseTo(0.35);
    // Size multiplier k → ln(k) radius delta: p=0 → 0.3+0.7*0.2=0.44.
    const radiusCurve = settings["radius_logarithmic"]?.inputs["pressure"];
    expect(radiusCurve?.[0]?.[1]).toBeCloseTo(Math.log(0.44));
    expect(radiusCurve?.[1]?.[1]).toBeCloseTo(0);
    // Flow v → delta against base opacity 1: p=0 → 0.1-1 = -0.9.
    const opaqueCurve = settings["opaque"]?.inputs["pressure"];
    expect(settings["opaque"]?.base_value).toBe(1);
    expect(opaqueCurve?.[0]?.[1]).toBeCloseTo(-0.9);
    expect(opaqueCurve?.[1]?.[1]).toBeCloseTo(-0.1);
    // Non-pressure dynamics are surfaced, not guessed.
    expect(compiled.unmapped).toEqual(["sizeDynamics[1].input=velocity"]);
    expect(
      compiled.warnings.some((warning) => warning.includes("slow_tracking")),
    ).toBe(true);
  });

  it("surfaces wet mixing and prediction as unmapped", () => {
    const wet = brushProgramIRSchema.parse({
      id: "wet",
      name: "wet",
      output: { target: "raster-tiles", bake: "flatten" },
      stabilizer: { kind: "ema", strength: 0.2, predictionMs: 12 },
      mixing: { kind: "wet", strength: 0.5 },
    });
    const compiled = compileRasterBrush(wet);
    expect(
      compiled.unmapped.some((entry) => entry.startsWith("mixing.kind=wet")),
    ).toBe(true);
    expect(
      compiled.unmapped.some((entry) => entry.startsWith("stabilizer.predictionMs")),
    ).toBe(true);
  });
});

describe("standardZigzagStrokeSamples + renderCompiledBrushStroke", () => {
  it("produces a linear 0→1 pressure ramp with monotone x progress", () => {
    const samples = standardZigzagStrokeSamples(192, 96, 96);
    expect(samples).toHaveLength(96);
    expect(samples[0]?.pressure).toBe(0);
    expect(samples.at(-1)?.pressure).toBe(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.pressure).toBeGreaterThan(samples[index - 1]!.pressure);
      expect(samples[index]!.x).toBeGreaterThan(samples[index - 1]!.x);
      expect(samples[index]!.tMs).toBeGreaterThan(samples[index - 1]!.tMs);
    }
    const ys = samples.map((sample) => sample.y);
    // Amplitude leaves ≥24px of dab headroom against both canvas edges.
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(24);
    expect(Math.max(...ys)).toBeLessThanOrEqual(72);
  });

  it("drives the injected engine with the full stroke lifecycle", () => {
    const events: string[] = [];
    const fed: RasterStrokeSample[] = [];
    class FakeBrush implements HokusaiBrushLike {
      constructor(public json: string) {
        events.push("brush:new");
      }
      free(): void {
        events.push("brush:free");
      }
      setColorHsv(): void {
        events.push("brush:color");
      }
      setRadiusLog(): void {
        events.push("brush:radius");
      }
    }
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
        public seed: number,
      ) {
        events.push("canvas:new");
      }
      beginStroke(): void {
        events.push("begin");
      }
      addSample(
        _brush: HokusaiBrushLike,
        x: number,
        y: number,
        pressure: number,
        tiltX: number,
        tiltY: number,
        tMs: number,
      ): boolean {
        fed.push({ x, y, pressure, tiltX, tiltY, tMs });
        return true;
      }
      finishStroke(): boolean {
        events.push("finish");
        return true;
      }
      fullFrame(): Uint8Array {
        events.push("frame");
        return new Uint8Array(4);
      }
      dispose(): void {
        events.push("dispose");
      }
      free(): void {
        events.push("canvas:free");
      }
    }
    const host: HokusaiModuleLike = {
      HokusaiBrush: FakeBrush,
      HokusaiCanvas: FakeCanvas,
    };
    const compiled = compileRasterBrush(mybProgram("wash", WASH_DOC));
    const result = renderCompiledBrushStroke(host, compiled, {
      width: 64,
      height: 32,
      sampleCount: 8,
      colorHsv: [0.1, 0.2, 0.3],
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    expect(fed).toHaveLength(8);
    expect(fed[0]?.pressure).toBe(0);
    expect(fed.at(-1)?.pressure).toBe(1);
    expect(events).toEqual([
      "brush:new",
      "canvas:new",
      "brush:color",
      "begin",
      "finish",
      "frame",
      "dispose",
      "canvas:free",
      "brush:free",
    ]);
  });
});
