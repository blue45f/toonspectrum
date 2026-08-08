import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES,
  NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION,
  finalizeNaturalMediaFullsizeBenchmark,
  naturalMediaPercentile,
  parseNaturalMediaFullsizeBenchmarkResult,
} from "../natural-media-fullsize-benchmark";

import type {
  NaturalMediaEngineEvidence,
  NaturalMediaFullsizeBenchmarkDraft,
  NaturalMediaFullsizeBenchmarkResult,
} from "../natural-media-fullsize-benchmark";

const WIDTH = 1000;
const HEIGHT = 1000;
const PROFILE = Array.from({ length: WIDTH }, (_, index) => index + 1);
const TOTAL_ALPHA = PROFILE.reduce((sum, value) => sum + value, 0);
const PRESSURES = [0.2, 0.4, 0.6, 0.8, 1] as const;
const COMMITTED_RESULT_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "tests",
  "benchmarks",
  "results",
  "libmypaint-fullsize.json",
);

function evidence(
  engine: "libmypaint" | "hokusai",
  samplesMs: readonly number[],
): NaturalMediaEngineEvidence {
  const p50Ms = naturalMediaPercentile(samplesMs, 0.5);
  const p95Ms = naturalMediaPercentile(samplesMs, 0.95);
  const hash = (engine === "libmypaint" ? "a" : "b").repeat(64);
  return {
    engine,
    version: `${engine}-test-pin`,
    brushId: "wash",
    timing: {
      warmupRuns: 2,
      measuredRuns: samplesMs.length,
      samplesMs,
      p50Ms,
      p95Ms,
      megapixelsPerSecondAtP50: Math.round((1000 / p50Ms) * 1e3) / 1e3,
    },
    determinism: { hashes: [hash, hash], pass: true },
    frame: {
      sha256: hash,
      totalAlpha: TOTAL_ALPHA,
      inkedPixels: 10_000,
      meanInkedAlpha: TOTAL_ALPHA / (10_000 * 255),
      columnInkProfile: PROFILE,
    },
    pressureFidelity: {
      samples: PRESSURES.map((pressure, index) => ({
        pressure,
        totalAlpha: (index + 1) * 1000,
        inkedPixels: (index + 1) * 100,
        sha256: "c".repeat(64),
      })),
      totalAlphaCorrelation: 1,
      inkedPixelCorrelation: 1,
      nonDecreasingAlphaSteps: 4,
      nonDecreasingInkedPixelSteps: 4,
      highPressureAddsInk: true,
      pass: true,
    },
    noSilentLoss: {
      sourceSettings: 1,
      sourceInputs: 1,
      engineSettings: 1,
      engineInputs: 1,
      applied: ["radius_logarithmic"],
      unknownSettings: [],
      unknownInputs: [],
      unmapped: [],
      warnings: [],
      unaccountedDimensions: [],
      pass: true,
    },
    memory: {
      nodeOldSpaceLimitMiB: 512,
      baseline: {
        rssBytes: 100_000_000,
        heapUsedBytes: 20_000_000,
        externalBytes: 10_000_000,
        arrayBuffersBytes: 5_000_000,
      },
      peakObserved: {
        rssBytes: 150_000_000,
        heapUsedBytes: 30_000_000,
        externalBytes: 20_000_000,
        arrayBuffersBytes: 15_000_000,
      },
      processPeakRssBytes: 160_000_000,
      rssIncreaseFromBaselineBytes: 50_000_000,
      wasmHeapBytes: 67_108_864,
      withinBound: true,
      note: "synthetic schema fixture",
    },
  };
}

function draft(
  hokusaiSamples: readonly number[] = [7, 8, 9, 10, 11, 12, 13],
): NaturalMediaFullsizeBenchmarkDraft {
  return {
    schemaVersion: NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION,
    generatedAt: "2026-08-09T00:00:00.000Z",
    gitCommit: "f".repeat(40),
    command: "pnpm exec tsx tests/benchmarks/harness/libmypaint-fullsize.ts",
    host: {
      platform: "darwin",
      arch: "arm64",
      node: "v24.16.0",
      cpuModel: "test cpu",
      logicalCpus: 10,
      totalMemoryBytes: 32 * 1024 * 1024 * 1024,
      loadAverage: [1, 1, 1],
    },
    pins: {
      libmypaint: "v1.6.1 test pin",
      hokusai: "hokusai-core 0.3.0 test pin",
      libmypaintWasmBytes: 82_503,
      hokusaiWasmBytes: 185_000,
    },
    workload: {
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      rgbaFrameBytes: WIDTH * HEIGHT * 4,
      rgbaFrameByteLimit: NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES,
      baseDabDiameterPx: 1000,
      radiusLogarithmic: Math.log(500),
      strokeSamples: 32,
      warmupRuns: 2,
      measuredRuns: 7,
      pressureLevels: PRESSURES,
      sequentialWorkers: true,
      workerTimeoutMs: 900_000,
      description: "synthetic full-size contract fixture",
    },
    brushes: {
      wash: {
        libmypaint: evidence("libmypaint", [10, 11, 12, 13, 14, 15, 16]),
        hokusai: evidence("hokusai", hokusaiSamples),
      },
    },
    notes: ["synthetic"],
  };
}

function mutableResult(): NaturalMediaFullsizeBenchmarkResult {
  return structuredClone(finalizeNaturalMediaFullsizeBenchmark(draft()));
}

describe("full-size natural-media benchmark schema", () => {
  it("uses nearest-rank percentiles over committed raw samples", () => {
    expect(naturalMediaPercentile([9, 1, 5, 7, 3, 11, 13], 0.5)).toBe(7);
    expect(naturalMediaPercentile([9, 1, 5, 7, 3, 11, 13], 0.95)).toBe(13);
  });

  it("recomputes a passing quality + 20% throughput verdict", () => {
    const result = finalizeNaturalMediaFullsizeBenchmark(draft());
    expect(result.comparisons).toEqual([
      expect.objectContaining({
        brushId: "wash",
        qualityParityPass: true,
        hokusaiThroughputOverLibmypaint: 1.3,
        hokusaiPasses20pctGate: true,
      }),
    ]);
    expect(result.gate.verdict).toBe("hokusai-qualified-to-demote-libmypaint");
    expect(parseNaturalMediaFullsizeBenchmarkResult(result)).toBe(result);
  });

  it("retains libmypaint when Hokusai misses the 20% threshold", () => {
    const result = finalizeNaturalMediaFullsizeBenchmark(
      draft([10, 11, 12, 13, 14, 15, 16]),
    );
    expect(result.comparisons[0]?.qualityParityPass).toBe(true);
    expect(result.comparisons[0]?.hokusaiThroughputOverLibmypaint).toBe(1);
    expect(result.gate.hokusaiPasses20pctGate).toBe(false);
    expect(result.gate.verdict).toBe("retain-libmypaint-reference");
  });

  it("rejects percentile tampering", () => {
    const result = mutableResult();
    const timing = result.brushes["wash"]?.libmypaint.timing as {
      p50Ms: number;
    };
    timing.p50Ms = 999;
    expect(() => parseNaturalMediaFullsizeBenchmarkResult(result)).toThrow(
      /percentiles are not recomputable/,
    );
  });

  it("rejects a silent-loss pass bit that hides an unaccounted dimension", () => {
    const result = mutableResult();
    const loss = result.brushes["wash"]?.hokusai.noSilentLoss as unknown as {
      unaccountedDimensions: string[];
      pass: boolean;
    };
    loss.unaccountedDimensions.push("opaque.inputs.future-axis");
    expect(() => parseNaturalMediaFullsizeBenchmarkResult(result)).toThrow(
      /noSilentLoss.pass drift/,
    );
  });

  it("rejects a result that labels a non-full-size dab as the lane-11 gate", () => {
    const result = mutableResult();
    const workload = result.workload as { baseDabDiameterPx: number };
    workload.baseDabDiameterPx = 180;
    expect(() => parseNaturalMediaFullsizeBenchmarkResult(result)).toThrow(
      /workload bounds drift/,
    );
  });

  it("parses the committed real 1000px evidence and recomputes its verdict", () => {
    const result = parseNaturalMediaFullsizeBenchmarkResult(
      JSON.parse(readFileSync(COMMITTED_RESULT_PATH, "utf8")) as unknown,
    );
    expect(result.workload).toMatchObject({
      baseDabDiameterPx: 1000,
      canvasWidth: 1792,
      canvasHeight: 1536,
      warmupRuns: 2,
      measuredRuns: 9,
      sequentialWorkers: true,
    });
    expect(result.gate).toMatchObject({
      allDeterministic: true,
      allNoSilentLossPass: true,
      allMemoryWithinBound: true,
      hokusaiPasses20pctGate: false,
      verdict: "retain-libmypaint-reference",
    });
  });
});
