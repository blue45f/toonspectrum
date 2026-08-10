import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface CandidateEvidence {
  backend: string;
  updateLatencyMs: { p50: number; p95: number; p99: number };
  strokeLatencyMs: { p50: number; p95: number; p99: number };
  metricsPerStroke: {
    inputCount: number;
    inputPayloadBytes: number;
    wasmToJsPayloadBytes: number;
    deltaPayloadBytes: number;
    peakTrackedVectorBytes: number;
    peakWasmHeapBytes: number;
    gpuReadbackCount: number;
  };
  finalMesh: { vertexCount: number; triangleCount: number; sha256: string };
  deltaSha256: string;
  exactFinalParityRuns: number;
}

interface IncrementalArtifact {
  schema: string;
  runtime: { execution: string };
  upstream: { commit: string; license: string };
  workload: { points: number; measuredStrokes: number; channels: string[] };
  candidates: {
    upstreamInProgressStroke: CandidateEvidence;
    retainedSingleShotFallback: CandidateEvidence;
  };
  evidence: {
    finalMeshByteExactAcrossAllMeasuredRuns: boolean;
    upstreamWasmToJsPayloadReductionVsFallback: number;
    gpuReadbackCount: number;
  };
}

const artifact = JSON.parse(
  readFileSync(
    new URL("../benchmarks/results/ink-mesh-incremental.json", import.meta.url),
    "utf8",
  ),
) as IncrementalArtifact;

describe("Google Ink incremental mesh committed evidence", () => {
  it("pins real upstream WASM, all pen channels, and exact final mesh parity", () => {
    expect(artifact.schema).toBe("toon-ink-mesh-incremental-benchmark-v1");
    expect(artifact.runtime.execution).toBe(
      "real committed Emscripten WASM in Node; no mock",
    );
    expect(artifact.upstream).toEqual({
      repository: "https://github.com/google/ink",
      commit: "1d0daba661f3035f42f3649b8e6a0061b47aa759",
      license: "Apache-2.0",
    });
    expect(artifact.workload).toMatchObject({ points: 240, measuredStrokes: 40 });
    expect(artifact.workload.channels).toEqual([
      "x",
      "y",
      "tMs",
      "pressure",
      "tiltRad",
      "orientationRad",
    ]);

    const incremental = artifact.candidates.upstreamInProgressStroke;
    const fallback = artifact.candidates.retainedSingleShotFallback;
    expect(artifact.evidence.finalMeshByteExactAcrossAllMeasuredRuns).toBe(true);
    expect(incremental.exactFinalParityRuns).toBe(40);
    expect(fallback.exactFinalParityRuns).toBe(40);
    expect(incremental.finalMesh).toEqual(fallback.finalMesh);
    expect(incremental.deltaSha256).toBe(fallback.deltaSha256);
    expect(incremental.finalMesh.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps the measured incremental path faster, smaller, bounded, and readback-free", () => {
    const incremental = artifact.candidates.upstreamInProgressStroke;
    const fallback = artifact.candidates.retainedSingleShotFallback;
    expect(incremental.updateLatencyMs.p95).toBeLessThan(fallback.updateLatencyMs.p95);
    expect(incremental.strokeLatencyMs.p95).toBeLessThan(fallback.strokeLatencyMs.p95);
    expect(incremental.metricsPerStroke.wasmToJsPayloadBytes).toBeLessThan(
      fallback.metricsPerStroke.wasmToJsPayloadBytes,
    );
    expect(artifact.evidence.upstreamWasmToJsPayloadReductionVsFallback).toBeGreaterThan(0.85);
    expect(incremental.metricsPerStroke.inputCount).toBe(artifact.workload.points);
    expect(incremental.metricsPerStroke.deltaPayloadBytes).toBe(
      fallback.metricsPerStroke.deltaPayloadBytes,
    );
    expect(incremental.metricsPerStroke.peakTrackedVectorBytes).toBeGreaterThan(0);
    expect(incremental.metricsPerStroke.peakWasmHeapBytes).toBeGreaterThan(0);
    expect(incremental.metricsPerStroke.gpuReadbackCount).toBe(0);
    expect(fallback.metricsPerStroke.gpuReadbackCount).toBe(0);
    expect(artifact.evidence.gpuReadbackCount).toBe(0);
  });
});
