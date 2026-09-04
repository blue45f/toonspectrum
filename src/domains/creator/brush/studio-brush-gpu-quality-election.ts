export const STUDIO_BRUSH_GPU_QUALITY_ELECTION_VERSION = 1 as const;

export type StudioBrushGpuQualityPolicyKind =
  | "strict-continuous"
  | "soft-wet-continuous"
  | "record-only-discrete"
  | "record-only-transparent"
  | "eraser";

export interface StudioBrushLongStrokePerformanceEvidence {
  readonly drawMilliseconds: number;
  readonly frameP50Milliseconds: number;
  readonly frameP95Milliseconds: number;
  readonly frameP99Milliseconds: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMilliseconds: number;
  readonly inputDeliveryRatio: number;
  readonly heapGrowthBytes: number | null;
}

export interface StudioBrushLongStrokeQualityEvidence {
  readonly measured: boolean;
  readonly ownQualityPassed: boolean;
  readonly browserErrorCount: number;
  readonly refusedStrokeCount: number;
  readonly gpuSurfaceObserved: boolean;
  readonly liveToCommittedChangedRatio: number;
  readonly committedToSettledChangedRatio: number;
  readonly centerlineCoverage: number;
  readonly visiblePixels: number;
  readonly inkEnergy: number;
  readonly edgeDensity: number;
}

export interface StudioBrushCrossEngineQualityEvidence {
  readonly comparedPixels: number;
  /** Changed pixels divided by the union of baseline/GPU ink masks. */
  readonly changedInkRatio: number;
  readonly silhouetteIntersectionOverUnion: number;
  readonly inkEnergyRatio: number;
  readonly edgeDensityRatio: number;
  readonly gradientEnergyRatio: number;
  readonly luminanceHistogramIntersection: number;
  readonly horizontalProfileCorrelation: number;
  readonly verticalProfileCorrelation: number;
  readonly normalizedBoundsDrift: number;
  readonly normalizedCentroidDrift: number;
}

export interface StudioBrushGpuQualityElectionInput {
  readonly brushId: string;
  readonly policy: StudioBrushGpuQualityPolicyKind;
  readonly baseline: Readonly<{
    quality: StudioBrushLongStrokeQualityEvidence;
    performance: StudioBrushLongStrokePerformanceEvidence;
  }>;
  readonly gpu: Readonly<{
    quality: StudioBrushLongStrokeQualityEvidence;
    performance: StudioBrushLongStrokePerformanceEvidence;
  }>;
  readonly crossEngine: StudioBrushCrossEngineQualityEvidence;
}

export interface StudioBrushGpuQualityElectionThresholds {
  readonly maximumChangedInkRatio: number;
  readonly minimumSilhouetteIntersectionOverUnion: number;
  readonly minimumInkEnergyRatio: number;
  readonly maximumInkEnergyRatio: number;
  readonly minimumEdgeDensityRatio: number;
  readonly maximumEdgeDensityRatio: number;
  readonly minimumGradientEnergyRatio: number;
  readonly maximumGradientEnergyRatio: number;
  readonly minimumHistogramIntersection: number;
  readonly minimumProfileCorrelation: number;
  readonly maximumNormalizedBoundsDrift: number;
  readonly maximumNormalizedCentroidDrift: number;
  readonly maximumLiveCommitRegression: number;
  readonly maximumCommittedSettleRatio: number;
}

export interface StudioBrushGpuQualityElectionResult {
  readonly kind: "studio-brush-gpu-quality-election";
  readonly version: typeof STUDIO_BRUSH_GPU_QUALITY_ELECTION_VERSION;
  readonly brushId: string;
  readonly selected: "gpu" | "incumbent";
  readonly qualityEquivalent: boolean;
  readonly performanceNonInferior: boolean;
  readonly reasons: readonly string[];
  readonly ratios: Readonly<{
    draw: number;
    frameP50: number;
    frameP95: number;
    frameP99: number;
  }>;
  readonly thresholds: StudioBrushGpuQualityElectionThresholds;
}

const THRESHOLDS: Readonly<Record<StudioBrushGpuQualityPolicyKind, StudioBrushGpuQualityElectionThresholds>> =
  Object.freeze({
    "strict-continuous": Object.freeze({
      maximumChangedInkRatio: 0.12,
      minimumSilhouetteIntersectionOverUnion: 0.96,
      minimumInkEnergyRatio: 0.95,
      maximumInkEnergyRatio: 1.05,
      minimumEdgeDensityRatio: 0.92,
      maximumEdgeDensityRatio: 1.10,
      minimumGradientEnergyRatio: 0.90,
      maximumGradientEnergyRatio: 1.12,
      minimumHistogramIntersection: 0.96,
      minimumProfileCorrelation: 0.97,
      maximumNormalizedBoundsDrift: 0.015,
      maximumNormalizedCentroidDrift: 0.015,
      maximumLiveCommitRegression: 0.005,
      maximumCommittedSettleRatio: 0.001,
    }),
    "soft-wet-continuous": Object.freeze({
      maximumChangedInkRatio: 0.35,
      minimumSilhouetteIntersectionOverUnion: 0.82,
      minimumInkEnergyRatio: 0.85,
      maximumInkEnergyRatio: 1.18,
      minimumEdgeDensityRatio: 0.78,
      maximumEdgeDensityRatio: 1.28,
      minimumGradientEnergyRatio: 0.75,
      maximumGradientEnergyRatio: 1.30,
      minimumHistogramIntersection: 0.84,
      minimumProfileCorrelation: 0.82,
      maximumNormalizedBoundsDrift: 0.045,
      maximumNormalizedCentroidDrift: 0.04,
      maximumLiveCommitRegression: 0.03,
      maximumCommittedSettleRatio: 0.01,
    }),
    "record-only-discrete": Object.freeze({
      maximumChangedInkRatio: 0.45,
      minimumSilhouetteIntersectionOverUnion: 0.75,
      minimumInkEnergyRatio: 0.82,
      maximumInkEnergyRatio: 1.22,
      minimumEdgeDensityRatio: 0.72,
      maximumEdgeDensityRatio: 1.35,
      minimumGradientEnergyRatio: 0.72,
      maximumGradientEnergyRatio: 1.35,
      minimumHistogramIntersection: 0.80,
      minimumProfileCorrelation: 0.72,
      maximumNormalizedBoundsDrift: 0.06,
      maximumNormalizedCentroidDrift: 0.05,
      maximumLiveCommitRegression: 0.04,
      maximumCommittedSettleRatio: 0.005,
    }),
    "record-only-transparent": Object.freeze({
      maximumChangedInkRatio: 0,
      minimumSilhouetteIntersectionOverUnion: 1,
      minimumInkEnergyRatio: 1,
      maximumInkEnergyRatio: 1,
      minimumEdgeDensityRatio: 1,
      maximumEdgeDensityRatio: 1,
      minimumGradientEnergyRatio: 1,
      maximumGradientEnergyRatio: 1,
      minimumHistogramIntersection: 1,
      minimumProfileCorrelation: 1,
      maximumNormalizedBoundsDrift: 0,
      maximumNormalizedCentroidDrift: 0,
      maximumLiveCommitRegression: 0,
      maximumCommittedSettleRatio: 0,
    }),
    eraser: Object.freeze({
      maximumChangedInkRatio: 0,
      minimumSilhouetteIntersectionOverUnion: 1,
      minimumInkEnergyRatio: 1,
      maximumInkEnergyRatio: 1,
      minimumEdgeDensityRatio: 1,
      maximumEdgeDensityRatio: 1,
      minimumGradientEnergyRatio: 1,
      maximumGradientEnergyRatio: 1,
      minimumHistogramIntersection: 1,
      minimumProfileCorrelation: 1,
      maximumNormalizedBoundsDrift: 0,
      maximumNormalizedCentroidDrift: 0,
      maximumLiveCommitRegression: 0,
      maximumCommittedSettleRatio: 0,
    }),
  });

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function ratio(candidate: number, incumbent: number): number {
  return finite(candidate) && finite(incumbent) && incumbent > 0
    ? candidate / incumbent
    : Number.POSITIVE_INFINITY;
}

function inRange(value: number, minimum: number, maximum: number): boolean {
  return finite(value) && value >= minimum && value <= maximum;
}

/**
 * Quality is a hard prerequisite. Performance is a non-inferiority gate only: once the pictures
 * are equivalent, a statistically tied GPU path wins so the product can accumulate GPU evidence
 * without lowering texture, hand feel, or live/commit continuity.
 */
export function electStudioBrushGpuQuality(
  input: StudioBrushGpuQualityElectionInput,
): StudioBrushGpuQualityElectionResult {
  const thresholds = THRESHOLDS[input.policy] ?? THRESHOLDS["strict-continuous"];
  const reasons: string[] = [];
  const baselineQuality = input.baseline.quality;
  const gpuQuality = input.gpu.quality;
  const cross = input.crossEngine;

  if (typeof input.brushId !== "string" || input.brushId.length === 0) reasons.push("invalid-brush-id");
  if (input.policy === "eraser") reasons.push("eraser-transparent-overlay-ineligible");
  if (input.policy === "record-only-transparent") reasons.push("transparent-tool-has-no-pixel-election");
  if (!baselineQuality.measured || !gpuQuality.measured) reasons.push("measurement-incomplete");
  if (!baselineQuality.ownQualityPassed) reasons.push("incumbent-quality-failed");
  if (!gpuQuality.ownQualityPassed) reasons.push("gpu-quality-failed");
  if (baselineQuality.browserErrorCount > 0 || gpuQuality.browserErrorCount > 0) {
    reasons.push("browser-errors");
  }
  if (baselineQuality.refusedStrokeCount > 0 || gpuQuality.refusedStrokeCount > 0) {
    reasons.push("stroke-refused");
  }
  if (!gpuQuality.gpuSurfaceObserved) reasons.push("gpu-surface-not-observed");
  if (baselineQuality.visiblePixels <= 0 || gpuQuality.visiblePixels <= 0) reasons.push("missing-visible-ink");
  if (input.baseline.performance.inputDeliveryRatio < 0.98 || input.gpu.performance.inputDeliveryRatio < 0.98) {
    reasons.push("input-delivery");
  }
  if (cross.comparedPixels <= 0) reasons.push("cross-engine-images-missing");
  if (cross.changedInkRatio > thresholds.maximumChangedInkRatio) reasons.push("changed-ink-ratio");
  if (cross.silhouetteIntersectionOverUnion < thresholds.minimumSilhouetteIntersectionOverUnion) {
    reasons.push("silhouette-iou");
  }
  if (!inRange(cross.inkEnergyRatio, thresholds.minimumInkEnergyRatio, thresholds.maximumInkEnergyRatio)) {
    reasons.push("ink-energy");
  }
  if (!inRange(cross.edgeDensityRatio, thresholds.minimumEdgeDensityRatio, thresholds.maximumEdgeDensityRatio)) {
    reasons.push("edge-density");
  }
  if (!inRange(
    cross.gradientEnergyRatio,
    thresholds.minimumGradientEnergyRatio,
    thresholds.maximumGradientEnergyRatio,
  )) reasons.push("gradient-energy");
  if (cross.luminanceHistogramIntersection < thresholds.minimumHistogramIntersection) {
    reasons.push("luminance-histogram");
  }
  if (
    cross.horizontalProfileCorrelation < thresholds.minimumProfileCorrelation
    || cross.verticalProfileCorrelation < thresholds.minimumProfileCorrelation
  ) reasons.push("ink-profile");
  if (cross.normalizedBoundsDrift > thresholds.maximumNormalizedBoundsDrift) {
    reasons.push("bounds-drift");
  }
  if (cross.normalizedCentroidDrift > thresholds.maximumNormalizedCentroidDrift) {
    reasons.push("centroid-drift");
  }
  if (
    gpuQuality.liveToCommittedChangedRatio
      > baselineQuality.liveToCommittedChangedRatio + thresholds.maximumLiveCommitRegression
  ) reasons.push("live-commit-regression");
  if (gpuQuality.committedToSettledChangedRatio > thresholds.maximumCommittedSettleRatio) {
    reasons.push("post-commit-instability");
  }
  if (gpuQuality.centerlineCoverage + 0.01 < baselineQuality.centerlineCoverage) {
    reasons.push("centerline-coverage-regression");
  }

  const ratios = Object.freeze({
    draw: ratio(input.gpu.performance.drawMilliseconds, input.baseline.performance.drawMilliseconds),
    frameP50: ratio(
      input.gpu.performance.frameP50Milliseconds,
      input.baseline.performance.frameP50Milliseconds,
    ),
    frameP95: ratio(
      input.gpu.performance.frameP95Milliseconds,
      input.baseline.performance.frameP95Milliseconds,
    ),
    frameP99: ratio(
      input.gpu.performance.frameP99Milliseconds,
      input.baseline.performance.frameP99Milliseconds,
    ),
  });
  const heapRegression = input.gpu.performance.heapGrowthBytes !== null
    && input.baseline.performance.heapGrowthBytes !== null
    && input.gpu.performance.heapGrowthBytes
      > input.baseline.performance.heapGrowthBytes + 8 * 1024 * 1024;
  const performanceNonInferior = ratios.draw <= 1.05
    && ratios.frameP50 <= 1.05
    && ratios.frameP95 <= 1.05
    && ratios.frameP99 <= 1.10
    && input.gpu.performance.longTaskCount <= input.baseline.performance.longTaskCount + 1
    && input.gpu.performance.longTaskTotalMilliseconds
      <= input.baseline.performance.longTaskTotalMilliseconds + 100
    && !heapRegression;
  if (!performanceNonInferior) reasons.push("performance-regression");

  const qualityReasons = new Set([
    "invalid-brush-id",
    "eraser-transparent-overlay-ineligible",
    "transparent-tool-has-no-pixel-election",
    "measurement-incomplete",
    "incumbent-quality-failed",
    "gpu-quality-failed",
    "browser-errors",
    "stroke-refused",
    "gpu-surface-not-observed",
    "missing-visible-ink",
    "input-delivery",
    "cross-engine-images-missing",
    "changed-ink-ratio",
    "silhouette-iou",
    "ink-energy",
    "edge-density",
    "gradient-energy",
    "luminance-histogram",
    "ink-profile",
    "bounds-drift",
    "centroid-drift",
    "live-commit-regression",
    "post-commit-instability",
    "centerline-coverage-regression",
  ]);
  const qualityEquivalent = reasons.every((reason) => !qualityReasons.has(reason));
  const selected = qualityEquivalent && performanceNonInferior ? "gpu" : "incumbent";
  return Object.freeze({
    kind: "studio-brush-gpu-quality-election",
    version: STUDIO_BRUSH_GPU_QUALITY_ELECTION_VERSION,
    brushId: input.brushId,
    selected,
    qualityEquivalent,
    performanceNonInferior,
    reasons: Object.freeze(reasons),
    ratios,
    thresholds,
  });
}
