import { describe, expect, it } from "vitest";

import {
  electStudioEngineWebGpuTexturedBrushRuntime,
  type StudioEngineWebGpuBrushBenchmarkDistribution,
  type StudioEngineWebGpuBrushBenchmarkReport,
} from "./studio-engine-webgpu-textured-brush-benchmark-contract";

function distribution(value: number): StudioEngineWebGpuBrushBenchmarkDistribution {
  return {
    samplesMs: Array.from({ length: 12 }, () => value),
    p50Ms: value,
    p95Ms: value,
    p99Ms: value,
    meanMs: value,
  };
}

function report(
  overrides: Partial<StudioEngineWebGpuBrushBenchmarkReport> = {},
): StudioEngineWebGpuBrushBenchmarkReport {
  return {
    kind: "studio-engine-webgpu-textured-brush-benchmark",
    revision: 1,
    dabCount: 4096,
    warmupIterations: 4,
    measuredIterations: 12,
    v1: {
      id: "v1-general",
      instanceBytesPerDab: 112,
      verticesPerDab: 6,
      cpuPack: distribution(10),
      execute: distribution(10),
      instanceUploads: null,
      instanceUploadBytes: null,
      reusedInstanceUploads: null,
    },
    v2: {
      id: "v2-compact",
      instanceBytesPerDab: 48,
      verticesPerDab: 4,
      cpuPack: distribution(5),
      execute: distribution(9),
      instanceUploads: 1,
      instanceUploadBytes: 4096 * 48,
      reusedInstanceUploads: 15,
    },
    quality: {
      comparedHalfWords: 512 * 256 * 4,
      exactHalfWordMismatches: 0,
      maximumAbsoluteHalfWordDelta: 0,
      shaderCompilationAvailable: true,
      shaderCompilationMessages: 0,
      scopedGpuErrors: 0,
      uncapturedGpuErrors: 0,
    },
    ...overrides,
  };
}

describe("textured WebGPU brush engine election", () => {
  it("selects v2 only when quality is exact and p95 improves materially", () => {
    const result = electStudioEngineWebGpuTexturedBrushRuntime(report());
    expect(result).toMatchObject({
      selected: "v2-compact",
      accepted: true,
      reasons: [],
    });
    expect(result.ratios.instanceBytes).toBeCloseTo(48 / 112, 12);
    expect(result.ratios.vertices).toBeCloseTo(4 / 6, 12);
  });

  it("keeps v1 when one half-float component changes", () => {
    const candidate = report();
    const result = electStudioEngineWebGpuTexturedBrushRuntime(report({
      quality: { ...candidate.quality, exactHalfWordMismatches: 1 },
    }));
    expect(result.selected).toBe("v1-general");
    expect(result.reasons).toContain("quality-parity");
  });

  it("keeps v1 when a fast median hides a p95 regression", () => {
    const candidate = report();
    const result = electStudioEngineWebGpuTexturedBrushRuntime(report({
      v2: {
        ...candidate.v2,
        execute: {
          ...candidate.v2.execute,
          p50Ms: 7,
          p95Ms: 10.1,
          p99Ms: 10.1,
        },
      },
    }));
    expect(result.selected).toBe("v1-general");
    expect(result.reasons).toContain("execute-p95");
  });

  it("keeps v1 on shader or GPU diagnostics", () => {
    const candidate = report();
    const result = electStudioEngineWebGpuTexturedBrushRuntime(report({
      quality: {
        ...candidate.quality,
        shaderCompilationMessages: 1,
        uncapturedGpuErrors: 1,
      },
    }));
    expect(result.selected).toBe("v1-general");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "shader-diagnostics",
      "uncaptured-gpu-errors",
    ]));
  });
});
