/**
 * Deterministic election contract for the product-connected textured WebGPU renderer.
 *
 * A candidate may replace the incumbent only when it is pixel-identical at the RGBA16F storage
 * boundary, compiles without GPU diagnostics, materially lowers CPU transport cost, and improves
 * end-to-end p95 without hiding regressions behind a faster median.
 */

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BENCHMARK_REVISION = 1 as const;

export interface StudioEngineWebGpuBrushBenchmarkDistribution {
  readonly samplesMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
}

export interface StudioEngineWebGpuBrushBenchmarkEngineEvidence {
  readonly id: "v1-general" | "v2-compact";
  readonly instanceBytesPerDab: number;
  readonly verticesPerDab: number;
  readonly cpuPack: StudioEngineWebGpuBrushBenchmarkDistribution;
  readonly execute: StudioEngineWebGpuBrushBenchmarkDistribution;
  readonly instanceUploads: number | null;
  readonly instanceUploadBytes: number | null;
  readonly reusedInstanceUploads: number | null;
}

export interface StudioEngineWebGpuBrushBenchmarkQualityEvidence {
  readonly comparedHalfWords: number;
  readonly exactHalfWordMismatches: number;
  readonly maximumAbsoluteHalfWordDelta: number;
  readonly shaderCompilationAvailable: boolean;
  readonly shaderCompilationMessages: number;
  readonly scopedGpuErrors: number;
  readonly uncapturedGpuErrors: number;
}

export interface StudioEngineWebGpuBrushBenchmarkReport {
  readonly kind: "studio-engine-webgpu-textured-brush-benchmark";
  readonly revision: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BENCHMARK_REVISION;
  readonly dabCount: number;
  readonly warmupIterations: number;
  readonly measuredIterations: number;
  readonly v1: StudioEngineWebGpuBrushBenchmarkEngineEvidence;
  readonly v2: StudioEngineWebGpuBrushBenchmarkEngineEvidence;
  readonly quality: StudioEngineWebGpuBrushBenchmarkQualityEvidence;
}

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_ELECTION_THRESHOLDS = Object.freeze({
  maximumQualityHalfWordMismatches: 0,
  maximumAbsoluteHalfWordDelta: 0,
  maximumShaderCompilationMessages: 0,
  maximumScopedGpuErrors: 0,
  maximumUncapturedGpuErrors: 0,
  maximumInstanceByteRatio: 0.45,
  maximumVertexRatio: 0.67,
  maximumCpuPackP95Ratio: 0.72,
  maximumExecuteP50Ratio: 1,
  maximumExecuteP95Ratio: 0.97,
  maximumExecuteP99Ratio: 1.05,
} as const);

export type StudioEngineWebGpuBrushBenchmarkElection = Readonly<{
  selected: "v1-general" | "v2-compact";
  accepted: boolean;
  reasons: readonly string[];
  ratios: Readonly<{
    instanceBytes: number;
    vertices: number;
    cpuPackP95: number;
    executeP50: number;
    executeP95: number;
    executeP99: number;
  }>;
}>;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function ratio(candidate: number, incumbent: number): number {
  return finitePositive(candidate) && finitePositive(incumbent)
    ? candidate / incumbent
    : Number.POSITIVE_INFINITY;
}

export function electStudioEngineWebGpuTexturedBrushRuntime(
  report: StudioEngineWebGpuBrushBenchmarkReport,
): StudioEngineWebGpuBrushBenchmarkElection {
  const ratios = Object.freeze({
    instanceBytes: ratio(
      report.v2.instanceBytesPerDab,
      report.v1.instanceBytesPerDab,
    ),
    vertices: ratio(report.v2.verticesPerDab, report.v1.verticesPerDab),
    cpuPackP95: ratio(report.v2.cpuPack.p95Ms, report.v1.cpuPack.p95Ms),
    executeP50: ratio(report.v2.execute.p50Ms, report.v1.execute.p50Ms),
    executeP95: ratio(report.v2.execute.p95Ms, report.v1.execute.p95Ms),
    executeP99: ratio(report.v2.execute.p99Ms, report.v1.execute.p99Ms),
  });
  const threshold = STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_ELECTION_THRESHOLDS;
  const reasons: string[] = [];
  if (
    report.kind !== "studio-engine-webgpu-textured-brush-benchmark"
    || report.revision !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BENCHMARK_REVISION
    || !Number.isSafeInteger(report.dabCount)
    || report.dabCount <= 0
    || !Number.isSafeInteger(report.measuredIterations)
    || report.measuredIterations < 8
    || report.v1.id !== "v1-general"
    || report.v2.id !== "v2-compact"
  ) reasons.push("invalid-report");
  if (
    report.quality.exactHalfWordMismatches
      > threshold.maximumQualityHalfWordMismatches
    || report.quality.maximumAbsoluteHalfWordDelta
      > threshold.maximumAbsoluteHalfWordDelta
  ) reasons.push("quality-parity");
  if (!report.quality.shaderCompilationAvailable) reasons.push("shader-compilation-unavailable");
  if (
    report.quality.shaderCompilationMessages
      > threshold.maximumShaderCompilationMessages
  ) reasons.push("shader-diagnostics");
  if (report.quality.scopedGpuErrors > threshold.maximumScopedGpuErrors) {
    reasons.push("scoped-gpu-errors");
  }
  if (report.quality.uncapturedGpuErrors > threshold.maximumUncapturedGpuErrors) {
    reasons.push("uncaptured-gpu-errors");
  }
  if (ratios.instanceBytes > threshold.maximumInstanceByteRatio) {
    reasons.push("instance-bandwidth");
  }
  if (ratios.vertices > threshold.maximumVertexRatio) reasons.push("vertex-count");
  if (ratios.cpuPackP95 > threshold.maximumCpuPackP95Ratio) {
    reasons.push("cpu-pack-p95");
  }
  if (ratios.executeP50 > threshold.maximumExecuteP50Ratio) {
    reasons.push("execute-p50");
  }
  if (ratios.executeP95 > threshold.maximumExecuteP95Ratio) {
    reasons.push("execute-p95");
  }
  if (ratios.executeP99 > threshold.maximumExecuteP99Ratio) {
    reasons.push("execute-p99");
  }
  const accepted = reasons.length === 0;
  return Object.freeze({
    selected: accepted ? "v2-compact" : "v1-general",
    accepted,
    reasons: Object.freeze(reasons),
    ratios,
  });
}
