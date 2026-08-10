import { statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  INK_STROKE_MODELER_COMMIT,
  InkModelerError,
  loadInkStrokeModeler,
  type InkModeledPoint,
  type InkRawPoint,
  type InkStrokeModeler,
} from "../ink-modeler";
import { applyStabilizer, pathJitterEnergy } from "../stabilizer";

import type { ModeledSampleIR, StabilizerGraphIR } from "@toonspectrum/studio-project-model";

/**
 * ADR-0009 / ADR-0011 lane 3 PoC contracts + measured comparison probe.
 *
 * Contract scope: loader idempotence, determinism, output density,
 * endpoint convergence without prediction, pressure passthrough, error
 * mapping. The probe (INK_MODELER_POC=1) records the 4-metric comparison vs
 * the first-party stabilizer into tests/benchmarks/results/ink-modeler-poc.json
 * WITHOUT a verdict — the gate decision belongs to the blind lab (ADR-0009).
 */

// ---------------------------------------------------------------------------
// Deterministic synthetic corpus (Brush Fidelity style, seeded)

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

const STEP_MS = 8; // 125 Hz pen cadence

/** Straight horizontal line with ±1.5px perpendicular jitter. */
function genLineJitter(seed: number): InkRawPoint[] {
  const random = mulberry32(seed);
  const points: InkRawPoint[] = [];
  for (let i = 0; i < 120; i += 1) {
    points.push({
      x: 100 + i * 4,
      y: 200 + (i === 0 || i === 119 ? 0 : (random() - 0.5) * 3),
      tMs: i * STEP_MS,
      pressure: 0.5 + 0.2 * Math.sin(i / 10),
    });
  }
  return points;
}

const CURVE_APEX = { x: 340, y: 120 };

/** V-shaped sharp corner; the apex sample itself is exact (no jitter). */
function genSharpCurve(seed: number): InkRawPoint[] {
  const random = mulberry32(seed);
  const points: InkRawPoint[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const leg = i <= 60 ? i / 60 : (i - 60) / 60;
    const exact = i === 0 || i === 60 || i === 120;
    const x = i <= 60 ? 100 + (CURVE_APEX.x - 100) * leg : CURVE_APEX.x + (580 - CURVE_APEX.x) * leg;
    const y = i <= 60 ? 400 + (CURVE_APEX.y - 400) * leg : CURVE_APEX.y + (400 - CURVE_APEX.y) * leg;
    points.push({
      x: x + (exact ? 0 : (random() - 0.5) * 1.5),
      y: y + (exact ? 0 : (random() - 0.5) * 1.5),
      tMs: i * STEP_MS,
      pressure: 0.6,
    });
  }
  return points;
}

/** Velocity ramp 0.2 → 4 px/ms along x with a gentle sine in y. */
function genSpeedRamp(seed: number): InkRawPoint[] {
  const random = mulberry32(seed);
  const points: InkRawPoint[] = [];
  let x = 100;
  for (let i = 0; i < 140; i += 1) {
    const speed = 0.2 + (4 - 0.2) * (i / 139);
    if (i > 0) x += speed * STEP_MS;
    points.push({
      x,
      y: 300 + Math.sin(i / 12) * 40 + (i === 0 || i === 139 ? 0 : (random() - 0.5) * 1.2),
      tMs: i * STEP_MS,
      pressure: 0.7,
    });
  }
  return points;
}

function toModeledSamples(points: readonly InkRawPoint[]): ModeledSampleIR[] {
  return points.map((point, index) => {
    const previous = index > 0 ? points[index - 1] : undefined;
    const dt = previous === undefined ? 1 : point.tMs - previous.tMs;
    const dist =
      previous === undefined ? 0 : Math.hypot(point.x - previous.x, point.y - previous.y);
    return {
      x: point.x,
      y: point.y,
      tMs: point.tMs,
      pressure: point.pressure ?? 0.5,
      velocity: dist / Math.max(dt, 1e-6),
      altitudeDeg: 90,
      azimuthDeg: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Metrics (recorded, not judged)

interface XY {
  x: number;
  y: number;
}

function minDistanceTo(points: readonly XY[], target: XY): number {
  let best = Number.POSITIVE_INFINITY;
  for (const point of points) {
    best = Math.min(best, Math.hypot(point.x - target.x, point.y - target.y));
  }
  return best;
}

function endpointMetrics(output: readonly XY[], raw: readonly InkRawPoint[]) {
  const last = raw[raw.length - 1];
  const outLast = output[output.length - 1];
  const outPenultimate = output.length > 1 ? output[output.length - 2] : outLast;
  if (last === undefined || outLast === undefined || outPenultimate === undefined) {
    return { endpointDistancePx: Number.NaN, penultimateGapPx: Number.NaN };
  }
  return {
    endpointDistancePx: Math.hypot(outLast.x - last.x, outLast.y - last.y),
    penultimateGapPx: Math.hypot(outPenultimate.x - last.x, outPenultimate.y - last.y),
  };
}

function asJitterSamples(points: readonly XY[]): ModeledSampleIR[] {
  return points.map((point, index) => ({
    x: point.x,
    y: point.y,
    tMs: index,
    pressure: 0.5,
    velocity: 0,
    altitudeDeg: 90,
    azimuthDeg: 0,
  }));
}

// ---------------------------------------------------------------------------

const POC_ENABLED = process.env.INK_MODELER_POC === "1";

let modeler: InkStrokeModeler;

beforeAll(async () => {
  modeler = await loadInkStrokeModeler();
});

describe("ink-modeler loader + contracts", () => {
  it("loads once and models a basic stroke with finite values", async () => {
    const again = await loadInkStrokeModeler(); // idempotent singleton
    const raw = genLineJitter(1234);
    const output = again.modelStroke(raw);
    expect(output.length).toBeGreaterThan(0);
    for (const point of output) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.tMs)).toBe(true);
    }
  });

  it("is deterministic across repeated runs", () => {
    const raw = genSharpCurve(99);
    const a = modeler.modelStroke(raw);
    const b = modeler.modelStroke(raw);
    expect(b).toStrictEqual(a);
  });

  it("upsamples to at least the input density with non-decreasing time", () => {
    const raw = genSpeedRamp(7);
    const output = modeler.modelStroke(raw);
    // 125 Hz input under a 180 Hz minimum output rate.
    expect(output.length).toBeGreaterThanOrEqual(raw.length);
    for (let i = 1; i < output.length; i += 1) {
      expect(output[i]!.tMs).toBeGreaterThanOrEqual(output[i - 1]!.tMs);
    }
  });

  it("converges to the raw endpoint without predicted spatial extension", () => {
    const raw = genLineJitter(42);
    const last = raw[raw.length - 1]!;
    const output = modeler.modelStroke(raw);
    const outLast = output[output.length - 1]!;
    // End-of-stroke chain catches the tip up to the pen-up anchor…
    expect(Math.hypot(outLast.x - last.x, outLast.y - last.y)).toBeLessThan(0.5);
    // …with bounded catch-up time and no extrapolation beyond the anchor:
    // at most end_of_stroke_max_iterations (20) extra ticks at minOutputRate.
    expect(outLast.tMs).toBeLessThanOrEqual(last.tMs + (20 + 1) * (1000 / 180));
    const maxRawX = Math.max(...raw.map((point) => point.x));
    expect(Math.max(...output.map((point) => point.x))).toBeLessThanOrEqual(maxRawX + 0.5);
  });

  it("interpolates pressure from the raw stream", () => {
    const raw = genSpeedRamp(3).map((point) => ({ ...point, pressure: 0.7 }));
    const output = modeler.modelStroke(raw);
    for (const point of output) {
      expect(point.pressure).toBeCloseTo(0.7, 4);
    }
  });

  it("forwards unknown pressure as the -1 sentinel", () => {
    const raw = genLineJitter(5).map(({ x, y, tMs }) => ({ x, y, tMs }));
    const output = modeler.modelStroke(raw);
    for (const point of output) {
      expect(point.pressure).toBe(-1);
    }
  });

  it("rejects fewer than 2 points", () => {
    expect(() => modeler.modelStroke([{ x: 0, y: 0, tMs: 0 }])).toThrow(InkModelerError);
  });

  it("rejects non-increasing timestamps with kInvalidArgument", () => {
    const raw = genLineJitter(11);
    raw[10] = { ...raw[10]!, tMs: raw[9]!.tMs };
    let caught: unknown;
    try {
      modeler.modelStroke(raw);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InkModelerError);
    expect((caught as InkModelerError).code).toBe(3);
  });

  it("rejects invalid params via the wasm status boundary", () => {
    let caught: unknown;
    try {
      modeler.modelStroke(genLineJitter(2), { minOutputRate: -5 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InkModelerError);
    expect((caught as InkModelerError).code).toBe(3);
  });

  it("suppresses high-frequency jitter on a straight stroke", () => {
    const raw = genLineJitter(1234);
    const output = modeler.modelStroke(raw);
    const energyIn = pathJitterEnergy(toModeledSamples(raw));
    const energyOut = pathJitterEnergy(asJitterSamples(output));
    expect(energyOut).toBeLessThan(energyIn);
  });

  it("bounds corner rounding to ~1.5 raw pen steps at the apex", () => {
    // The mass-spring position model rounds sharp corners (measured ~5.7px on
    // this corpus — the exact number is recorded by the PoC probe, judged by
    // the blind lab). Contract here: rounding stays bounded relative to the
    // raw pen cadence instead of drifting unbounded.
    const raw = genSharpCurve(1234);
    const stepDistancePx = Math.hypot(340 - 100, 120 - 400) / 60; // leg step ≈ 6.14px
    const output = modeler.modelStroke(raw);
    expect(minDistanceTo(output, CURVE_APEX)).toBeLessThan(stepDistancePx * 1.5);
  });
});

// ---------------------------------------------------------------------------
// Measured comparison probe (writes tests/benchmarks/results/ink-modeler-poc.json)

interface CandidateRow {
  candidate: string;
  highFreqReductionPct: number;
  cornerErrorPx: number;
  endpoint: Record<string, { endpointDistancePx: number; penultimateGapPx: number }>;
  throughputPtsPerMs: number;
}

describe.runIf(POC_ENABLED)("ink-modeler PoC probe", () => {
  it("records the 4-metric comparison vs the first-party stabilizer", () => {
    const seed = 1234;
    const inputs = {
      lineJitter: genLineJitter(seed),
      sharpCurve: genSharpCurve(seed),
      speedRamp: genSpeedRamp(seed),
    } as const;

    const stabilizerConfigs: Array<{ name: string; config: StabilizerGraphIR }> = [
      { name: "stabilizer-ema-0.35", config: { kind: "ema", strength: 0.35, predictionMs: 0 } },
      { name: "stabilizer-ema-0.7", config: { kind: "ema", strength: 0.7, predictionMs: 0 } },
      { name: "stabilizer-spring-0.35", config: { kind: "spring", strength: 0.35, predictionMs: 0 } },
      { name: "stabilizer-spring-0.7", config: { kind: "spring", strength: 0.7, predictionMs: 0 } },
    ];

    const candidates: Array<{
      name: string;
      run: (input: readonly InkRawPoint[]) => XY[];
    }> = [
      {
        name: "ink-stroke-modeler",
        run: (input) => modeler.modelStroke(input) as InkModeledPoint[],
      },
      ...stabilizerConfigs.map(({ name, config }) => ({
        name,
        run: (input: readonly InkRawPoint[]) => applyStabilizer(toModeledSamples(input), config),
      })),
    ];

    const rows: CandidateRow[] = candidates.map(({ name, run }) => {
      const lineOut = run(inputs.lineJitter);
      const curveOut = run(inputs.sharpCurve);
      const energyIn = pathJitterEnergy(toModeledSamples(inputs.lineJitter));
      const energyOut = pathJitterEnergy(asJitterSamples(lineOut));
      const endpoint: CandidateRow["endpoint"] = {};
      for (const [inputName, input] of Object.entries(inputs)) {
        endpoint[inputName] = endpointMetrics(run(input), input);
      }

      // Throughput: full-boundary cost (wasm crossing included for ink).
      const allInputs = Object.values(inputs);
      const totalPoints = allInputs.reduce((sum, input) => sum + input.length, 0);
      for (let warmup = 0; warmup < 10; warmup += 1) {
        for (const input of allInputs) run(input);
      }
      const repeats = 100;
      const start = performance.now();
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        for (const input of allInputs) run(input);
      }
      const elapsedMs = performance.now() - start;

      return {
        candidate: name,
        highFreqReductionPct: round4((1 - energyOut / energyIn) * 100),
        cornerErrorPx: round4(minDistanceTo(curveOut, CURVE_APEX)),
        endpoint: Object.fromEntries(
          Object.entries(endpoint).map(([key, value]) => [
            key,
            {
              endpointDistancePx: round4(value.endpointDistancePx),
              penultimateGapPx: round4(value.penultimateGapPx),
            },
          ]),
        ),
        throughputPtsPerMs: round2((totalPoints * repeats) / elapsedMs),
      };
    });

    const wasmPath = fileURLToPath(
      new URL("../ink-modeler/ink_stroke_modeler.wasm", import.meta.url),
    );
    const report = {
      harness:
        "packages/studio-brush-platform/src/__tests__/ink-modeler.test.ts (INK_MODELER_POC=1)",
      generatedAt: new Date().toISOString(),
      host: {
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model ?? "unknown",
        node: process.version,
      },
      upstream: {
        repo: "https://github.com/google/ink-stroke-modeler",
        commit: INK_STROKE_MODELER_COMMIT,
        emcc: "6.0.6",
        wasmBytes: statSync(wasmPath).size,
      },
      inkParams:
        "defaults per packages/studio-brush-platform/src/ink-modeler.ts INK_DEFAULT_PARAMS " +
        "(minOutputRate 180, wobble 40ms/50–54px/s, spring 11/32400, drag 72, prediction off)",
      inputs: {
        seed,
        stepMs: STEP_MS,
        lineJitter: { points: inputs.lineJitter.length, jitterPx: 1.5 },
        sharpCurve: { points: inputs.sharpCurve.length, apex: CURVE_APEX, jitterPx: 0.75 },
        speedRamp: { points: inputs.speedRamp.length, speedPxPerMs: [0.2, 4] },
      },
      metrics: {
        highFreqReductionPct:
          "1 - jitterEnergy(out)/jitterEnergy(in) on lineJitter (chord-perpendicular MSE)",
        cornerErrorPx: "min distance of output polyline to the exact sharpCurve apex",
        endpoint:
          "distance of last (and second-to-last) output point to the raw pen-up point " +
          "(wet trailing; note: the first-party stabilizer snaps its final sample by design)",
        throughputPtsPerMs:
          "raw input points modeled per ms, full JS/wasm boundary, 100 repeats after 10 warmups",
      },
      candidates: rows,
      note:
        "numbers only — no verdict here; promotion is decided by the blind lab gate " +
        "(ADR-0009) and recorded in ADR-0011 lane 3",
    };
    const outPath = fileURLToPath(
      new URL("../../../../tests/benchmarks/results/ink-modeler-poc.json", import.meta.url),
    );
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(Number.isFinite(row.highFreqReductionPct)).toBe(true);
      expect(Number.isFinite(row.cornerErrorPx)).toBe(true);
      expect(Number.isFinite(row.throughputPtsPerMs)).toBe(true);
    }
  });
});

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
