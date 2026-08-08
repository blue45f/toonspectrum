import { beforeAll, describe, expect, it } from "vitest";

import { loadInkStrokeModeler } from "../ink-modeler";
import { applyStabilizer } from "../stabilizer";
import {
  DEFAULT_STABILIZER_BACKEND_ID,
  STABILIZER_BACKEND_IDS,
  StabilizerProviderError,
  selectStabilizerBackend,
} from "../stabilizer-provider";

import type { InkStrokeModeler } from "../ink-modeler";
import type { ModeledSampleIR } from "@toonspectrum/studio-project-model";

/**
 * Stabilizer provider seam contracts (ADR-0011 lane 3 promotion prep):
 * one deterministic interface over the three lanes, first-party delegation
 * verbatim, ink lane numerically identical to the PoC harness path
 * (../__tests__/ink-modeler.test.ts calls modeler.modelStroke directly),
 * opt-in gate + explicit unknown-id / wasm-not-loaded errors.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEP_MS = 8; // 125 Hz pen cadence, same as the PoC corpus

/** Deterministic jittered line as IR samples (Brush Fidelity style, seeded). */
function genSamples(seed: number, count = 120): ModeledSampleIR[] {
  const random = mulberry32(seed);
  const samples: ModeledSampleIR[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push({
      x: 100 + i * 4,
      y: 200 + (i === 0 || i === count - 1 ? 0 : (random() - 0.5) * 3),
      tMs: i * STEP_MS,
      pressure: 0.5 + 0.2 * Math.sin(i / 10),
      velocity: 0.5,
      altitudeDeg: 90,
      azimuthDeg: 0,
    });
  }
  return samples;
}

function deepClone(samples: readonly ModeledSampleIR[]): ModeledSampleIR[] {
  return samples.map((sample) => ({ ...sample }));
}

let inkModeler: InkStrokeModeler;

beforeAll(async () => {
  inkModeler = await loadInkStrokeModeler();
});

describe("stabilizer provider seam — registry + selection", () => {
  it("registers exactly the three lanes with ema as the default", () => {
    expect([...STABILIZER_BACKEND_IDS]).toStrictEqual(["ema", "spring", "ink-stroke-modeler"]);
    expect(DEFAULT_STABILIZER_BACKEND_ID).toBe("ema");
    expect(selectStabilizerBackend().id).toBe("ema");
  });

  it("selects each first-party lane by id without any opt-in flag", () => {
    expect(selectStabilizerBackend("ema").id).toBe("ema");
    expect(selectStabilizerBackend("spring").id).toBe("spring");
  });

  it("rejects unknown backend ids with an explicit error listing known lanes", () => {
    expect(() => selectStabilizerBackend("catmull-rom")).toThrow(StabilizerProviderError);
    expect(() => selectStabilizerBackend("catmull-rom")).toThrow(
      /unknown stabilizer backend "catmull-rom".*ema, spring, ink-stroke-modeler/,
    );
  });

  it("gates the ink lane behind explicit opt-in (ADR-0009 fallback principle)", () => {
    expect(() => selectStabilizerBackend("ink-stroke-modeler")).toThrow(StabilizerProviderError);
    expect(() => selectStabilizerBackend("ink-stroke-modeler", { allowInk: false })).toThrow(
      /opt-in/,
    );
    expect(selectStabilizerBackend("ink-stroke-modeler", { allowInk: true }).id).toBe(
      "ink-stroke-modeler",
    );
  });

  it("fails loudly when the ink lane is processed without a loaded wasm modeler", () => {
    const backend = selectStabilizerBackend("ink-stroke-modeler", { allowInk: true });
    expect(() => backend.process(genSamples(1))).toThrow(StabilizerProviderError);
    expect(() => backend.process(genSamples(1))).toThrow(/no loaded wasm modeler/);
  });
});

describe("stabilizer provider seam — first-party delegation", () => {
  it("ema delegates verbatim to applyStabilizer for the same strength", () => {
    const samples = genSamples(42);
    const viaProvider = selectStabilizerBackend("ema").process(samples, { strength: 0.6 });
    const direct = applyStabilizer(samples, { kind: "ema", strength: 0.6, predictionMs: 0 });
    expect(viaProvider).toStrictEqual(direct);
  });

  it("spring delegates verbatim to applyStabilizer for the same strength", () => {
    const samples = genSamples(43);
    const viaProvider = selectStabilizerBackend("spring").process(samples, { strength: 0.5 });
    const direct = applyStabilizer(samples, { kind: "spring", strength: 0.5, predictionMs: 0 });
    expect(viaProvider).toStrictEqual(direct);
  });

  it("defaults omitted params to the IR schema defaults (strength 0.35)", () => {
    const samples = genSamples(44);
    const viaProvider = selectStabilizerBackend("ema").process(samples);
    const direct = applyStabilizer(samples, { kind: "ema", strength: 0.35, predictionMs: 0 });
    expect(viaProvider).toStrictEqual(direct);
  });

  it("rejects out-of-schema params instead of silently clamping", () => {
    const backend = selectStabilizerBackend("ema");
    const samples = genSamples(45);
    expect(() => backend.process(samples, { strength: 1.5 })).toThrow(StabilizerProviderError);
    expect(() => backend.process(samples, { strength: Number.NaN })).toThrow(
      /strength must be a finite number/,
    );
    expect(() => backend.process(samples, { predictionMs: 60 })).toThrow(/predictionMs/);
  });

  it("is deterministic: identical input reproduces identical output (ema + spring)", () => {
    for (const id of ["ema", "spring"] as const) {
      const backend = selectStabilizerBackend(id);
      const a = backend.process(genSamples(7), { strength: 0.7 });
      const b = backend.process(genSamples(7), { strength: 0.7 });
      expect(b).toStrictEqual(a);
    }
  });

  it("never mutates the input samples and returns fresh arrays", () => {
    const samples = genSamples(46);
    const snapshot = deepClone(samples);
    const output = selectStabilizerBackend("spring").process(samples, { strength: 0.8 });
    expect(samples).toStrictEqual(snapshot);
    expect(output).not.toBe(samples);
  });
});

describe("stabilizer provider seam — ink lane", () => {
  function inkBackend() {
    return selectStabilizerBackend("ink-stroke-modeler", { allowInk: true, inkModeler });
  }

  it("is deterministic: identical input reproduces identical output", () => {
    const backend = inkBackend();
    const a = backend.process(genSamples(1234));
    const b = backend.process(genSamples(1234));
    expect(b).toStrictEqual(a);
  });

  it("matches the PoC harness numerics for identical default model params", () => {
    const samples = genSamples(1234);
    const viaProvider = inkBackend().process(samples);
    // PoC harness path (ink-modeler.test.ts): modelStroke on the raw stream.
    const direct = inkModeler.modelStroke(
      samples.map(({ x, y, tMs, pressure }) => ({ x, y, tMs, pressure })),
    );
    expect(viaProvider.map(({ x, y, tMs }) => ({ x, y, tMs }))).toStrictEqual(
      direct.map(({ x, y, tMs }) => ({ x, y, tMs })),
    );
  });

  it("forwards custom model params to the wasm boundary unchanged", () => {
    const samples = genSamples(99);
    const ink = { minOutputRate: 240, wobble: { enabled: false } };
    const viaProvider = inkBackend().process(samples, { ink });
    const direct = inkModeler.modelStroke(
      samples.map(({ x, y, tMs, pressure }) => ({ x, y, tMs, pressure })),
      ink,
    );
    expect(viaProvider.map(({ x, y, tMs }) => ({ x, y, tMs }))).toStrictEqual(
      direct.map(({ x, y, tMs }) => ({ x, y, tMs })),
    );
    // Different params must actually change the output (density rises with
    // the higher minimum output rate) — proves forwarding is not a no-op.
    expect(viaProvider.length).toBeGreaterThan(inkBackend().process(samples).length);
  });

  it("maps modeled output back into IR samples (pressure bounds + speed magnitude)", () => {
    const samples = genSamples(5);
    const viaProvider = inkBackend().process(samples);
    const direct = inkModeler.modelStroke(
      samples.map(({ x, y, tMs, pressure }) => ({ x, y, tMs, pressure })),
    );
    expect(viaProvider).toHaveLength(direct.length);
    viaProvider.forEach((sample, index) => {
      const source = direct[index]!;
      expect(sample.pressure).toBeGreaterThanOrEqual(0);
      expect(sample.pressure).toBeLessThanOrEqual(1);
      expect(sample.velocity).toBeCloseTo(Math.hypot(source.velocityX, source.velocityY), 12);
      expect(sample.altitudeDeg).toBe(90);
      expect(sample.azimuthDeg).toBe(0);
    });
  });

  it("propagates the wasm boundary's explicit errors (non-increasing timestamps)", () => {
    const samples = genSamples(3);
    samples[10] = { ...samples[10]!, tMs: samples[9]!.tMs };
    expect(() => inkBackend().process(samples)).toThrow(/strictly increasing tMs/);
  });

  it("never mutates the input samples", () => {
    const samples = genSamples(47);
    const snapshot = deepClone(samples);
    inkBackend().process(samples);
    expect(samples).toStrictEqual(snapshot);
  });
});
