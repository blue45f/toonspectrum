export const STUDIO_BRUSH_MEDIA_IDS = [
  "pencil-4b-rough",
  "g-pen-flex",
  "airbrush-grand-soft",
  "watercolor-wet-wash",
  "watercolor-dry-granule",
  "cotton-fiber",
  "oil",
  "highlighter",
] as const;

export type StudioBrushMediaId = (typeof STUDIO_BRUSH_MEDIA_IDS)[number];

export interface StudioBrushMediaCasePolicy {
  readonly id: StudioBrushMediaId;
  readonly medium:
    | "pencil"
    | "ink"
    | "airbrush"
    | "watercolor"
    | "granular-watercolor"
    | "fiber"
    | "oil"
    | "highlighter";
  readonly minimumChangedPixels: number;
  readonly minimumMeanChannelDelta: number;
  readonly minimumP95ChannelDelta: number;
  readonly minimumPathCoverage: number;
  readonly maximumLongestGapRatio: number;
  readonly minimumSettledToLiveEnergyRatio: number;
  readonly maximumLiveSettledDifferenceRatio: number;
  readonly maximumPassEnergyDropRatio: number;
  readonly maximumRegressedInkRatio: number;
  readonly maximumRegressedInkEnergyRatio: number;
  readonly maximumUndoResidualRatio: number;
  readonly maximumRedoDifferenceRatio: number;
  readonly maximumScallopResidualCoefficient: number;
  readonly maximumRepetitionScore: number;
  /** Diagnostic-only because textured media intentionally vary their silhouette. */
  readonly scallopWarningThreshold: number;
  /** Diagnostic-only baseline-relative channel variation floor for media expected to have grain. */
  readonly minimumTextureCoefficient: number | null;
}

const COMMON_HISTORY_POLICY = {
  minimumSettledToLiveEnergyRatio: 0.35,
  maximumLiveSettledDifferenceRatio: 0.72,
  maximumPassEnergyDropRatio: 0.12,
  maximumRegressedInkEnergyRatio: 0.12,
  maximumUndoResidualRatio: 0.025,
  maximumRedoDifferenceRatio: 0.18,
} as const;

/**
 * These are deliberately broad browser regression floors, not visual golden values.
 *
 * The gate is expected to run on different Chromium/GPU/font stacks, so it fails only when ink
 * disappears, a continuous route develops a large interior hole, repeated passes visibly remove
 * pigment, or history cannot recover the isolated stroke. The JSON report keeps the finer metrics
 * so the thresholds can be tightened from observed shipped evidence without inventing stability.
 */
export const STUDIO_BRUSH_MEDIA_CASES: readonly StudioBrushMediaCasePolicy[] = [
  {
    ...COMMON_HISTORY_POLICY,
    id: "pencil-4b-rough",
    medium: "pencil",
    minimumChangedPixels: 48,
    minimumMeanChannelDelta: 10,
    minimumP95ChannelDelta: 18,
    minimumPathCoverage: 0.55,
    maximumLongestGapRatio: 0.18,
    maximumRegressedInkRatio: 0.3,
    maximumScallopResidualCoefficient: 0.34,
    maximumRepetitionScore: 0.52,
    scallopWarningThreshold: 0.35,
    minimumTextureCoefficient: 0.12,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "g-pen-flex",
    medium: "ink",
    minimumChangedPixels: 96,
    minimumMeanChannelDelta: 40,
    minimumP95ChannelDelta: 70,
    minimumPathCoverage: 0.86,
    maximumLongestGapRatio: 0.08,
    maximumRegressedInkRatio: 0.2,
    maximumScallopResidualCoefficient: 0.3,
    maximumRepetitionScore: 0.44,
    scallopWarningThreshold: 0.4,
    minimumTextureCoefficient: null,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "airbrush-grand-soft",
    medium: "airbrush",
    minimumChangedPixels: 240,
    minimumMeanChannelDelta: 6,
    minimumP95ChannelDelta: 12,
    minimumPathCoverage: 0.8,
    maximumLongestGapRatio: 0.1,
    maximumRegressedInkRatio: 0.26,
    maximumScallopResidualCoefficient: 0.2,
    maximumRepetitionScore: 0.44,
    scallopWarningThreshold: 0.09,
    minimumTextureCoefficient: 0.22,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "watercolor-wet-wash",
    medium: "watercolor",
    minimumChangedPixels: 180,
    minimumMeanChannelDelta: 8,
    minimumP95ChannelDelta: 15,
    minimumPathCoverage: 0.68,
    maximumLongestGapRatio: 0.15,
    maximumRegressedInkRatio: 0.34,
    maximumScallopResidualCoefficient: 0.24,
    maximumRepetitionScore: 0.5,
    scallopWarningThreshold: 0.12,
    minimumTextureCoefficient: 0.2,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "watercolor-dry-granule",
    medium: "granular-watercolor",
    minimumChangedPixels: 110,
    minimumMeanChannelDelta: 8,
    minimumP95ChannelDelta: 16,
    minimumPathCoverage: 0.58,
    maximumLongestGapRatio: 0.2,
    maximumRegressedInkRatio: 0.38,
    maximumScallopResidualCoefficient: 0.42,
    maximumRepetitionScore: 0.62,
    scallopWarningThreshold: 0.4,
    minimumTextureCoefficient: 0.24,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "cotton-fiber",
    medium: "fiber",
    minimumChangedPixels: 150,
    minimumMeanChannelDelta: 7,
    minimumP95ChannelDelta: 14,
    minimumPathCoverage: 0.55,
    maximumLongestGapRatio: 0.22,
    maximumRegressedInkRatio: 0.4,
    maximumScallopResidualCoefficient: 0.46,
    maximumRepetitionScore: 0.66,
    scallopWarningThreshold: 0.48,
    minimumTextureCoefficient: 0.26,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "oil",
    medium: "oil",
    minimumChangedPixels: 120,
    minimumMeanChannelDelta: 30,
    minimumP95ChannelDelta: 50,
    minimumPathCoverage: 0.65,
    maximumLongestGapRatio: 0.16,
    maximumRegressedInkRatio: 0.32,
    maximumScallopResidualCoefficient: 0.36,
    maximumRepetitionScore: 0.58,
    scallopWarningThreshold: 0.12,
    minimumTextureCoefficient: 0.12,
  },
  {
    ...COMMON_HISTORY_POLICY,
    id: "highlighter",
    medium: "highlighter",
    minimumChangedPixels: 180,
    minimumMeanChannelDelta: 18,
    minimumP95ChannelDelta: 28,
    minimumPathCoverage: 0.88,
    maximumLongestGapRatio: 0.08,
    maximumRegressedInkRatio: 0.2,
    maximumScallopResidualCoefficient: 0.16,
    maximumRepetitionScore: 0.42,
    scallopWarningThreshold: 0.08,
    minimumTextureCoefficient: null,
  },
] as const;

export interface StudioBrushMediaFrameMetrics {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly maxChannelDelta: number;
  /** Sum of baseline-relative maximum RGB channel deltas, measured in full-contrast pixels. */
  readonly inkEnergy: number;
  readonly meanChannelDelta: number;
  readonly p95ChannelDelta: number;
  /** Baseline-relative delta standard deviation divided by its mean. */
  readonly textureCoefficient: number;
  /** Normalized 0..1 entropy of the changed-pixel contrast histogram. */
  readonly textureEntropy: number;
  readonly pathCoverage: number;
  readonly longestGapSamples: number;
  readonly pathSamples: number;
  /** Cross-section width coefficient of variation; diagnostic because texture intentionally varies. */
  readonly scallopCoefficient: number | null;
  readonly fingerprint: string;
  readonly featureVector: readonly number[];
}

export interface StudioBrushMediaPixelDiff {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly maxChannelDelta: number;
}

export interface StudioBrushMediaTransitionMetrics extends StudioBrushMediaPixelDiff {
  readonly liveInkEnergy: number;
  readonly settledInkEnergy: number;
  readonly energyRatio: number;
  readonly comparedInkPixels: number;
  readonly differenceRatio: number;
  readonly ignoredCursorRadius: number;
}

export interface StudioBrushMediaAccumulationMetrics {
  readonly previousInkEnergy: number;
  readonly nextInkEnergy: number;
  readonly energyRatio: number;
  readonly regressedInkPixels: number;
  readonly previousInkPixels: number;
  readonly regressedInkRatio: number;
  readonly regressedInkEnergy: number;
  readonly regressedInkEnergyRatio: number;
  readonly maximumPigmentLossDelta: number;
}

export interface StudioBrushMediaArtifactQualityMetrics {
  readonly visiblePixels: number;
  readonly meanVisibleDelta: number;
  readonly p95VisibleDelta: number;
  readonly scallopResidualCoefficient: number | null;
  readonly widthSampleCount: number;
  readonly repetitionScore: number;
  readonly repetitionRawCorrelation: number;
  readonly repetitionAxis: "x" | "y" | null;
  readonly repetitionPeriodPx: number | null;
  readonly repetitionSamplePairs: number;
}

export interface StudioBrushMediaCaseMetrics {
  readonly id: StudioBrushMediaId;
  readonly live: StudioBrushMediaFrameMetrics;
  readonly settled: StudioBrushMediaFrameMetrics;
  readonly pass2: StudioBrushMediaFrameMetrics;
  readonly pass3: StudioBrushMediaFrameMetrics;
  readonly pixelQuality: StudioBrushMediaArtifactQualityMetrics;
  readonly liveToSettled: StudioBrushMediaTransitionMetrics;
  readonly undoToBaseline: StudioBrushMediaPixelDiff;
  readonly redoToSettled: StudioBrushMediaPixelDiff;
  readonly pass1ToPass2: StudioBrushMediaAccumulationMetrics;
  readonly pass2ToPass3: StudioBrushMediaAccumulationMetrics;
}

export interface StudioBrushMediaPolicyFinding {
  readonly level: "error" | "warning";
  readonly code:
    | "no-visible-media"
    | "live-stroke-missing"
    | "faint-media"
    | "settled-stroke-disappeared"
    | "live-settled-divergence"
    | "interior-gap"
    | "pigment-regressed"
    | "pigment-energy-loss"
    | "undo-residue"
    | "redo-diverged"
    | "settle-churn"
    | "scallop-variance"
    | "scallop-artifact"
    | "repeated-grid-pattern"
    | "texture-flatness"
    | "fingerprint-collision";
  readonly message: string;
}

export interface StudioBrushMediaCaseEvaluation {
  readonly ok: boolean;
  readonly findings: readonly StudioBrushMediaPolicyFinding[];
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return numerator <= 0 ? 1 : Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

export function evaluateStudioBrushMediaCase(
  policy: StudioBrushMediaCasePolicy,
  metrics: StudioBrushMediaCaseMetrics,
): StudioBrushMediaCaseEvaluation {
  const findings: StudioBrushMediaPolicyFinding[] = [];
  const error = (
    code: StudioBrushMediaPolicyFinding["code"],
    message: string,
  ): void => {
    findings.push({ level: "error", code, message });
  };
  const warning = (
    code: StudioBrushMediaPolicyFinding["code"],
    message: string,
  ): void => {
    findings.push({ level: "warning", code, message });
  };

  if (metrics.live.changedPixels < Math.max(12, Math.floor(policy.minimumChangedPixels * 0.2))) {
    error(
      "live-stroke-missing",
      `${policy.id}: live stroke changed only ${metrics.live.changedPixels} pixels`,
    );
  }
  if (metrics.settled.changedPixels < policy.minimumChangedPixels) {
    error(
      "no-visible-media",
      `${policy.id}: settled stroke changed ${metrics.settled.changedPixels} pixels; `
        + `minimum ${policy.minimumChangedPixels}`,
    );
  }
  if (
    metrics.settled.meanChannelDelta < policy.minimumMeanChannelDelta
    || metrics.settled.p95ChannelDelta < policy.minimumP95ChannelDelta
  ) {
    error(
      "faint-media",
      `${policy.id}: settled contrast mean Δ${metrics.settled.meanChannelDelta.toFixed(1)} `
        + `/ P95 Δ${metrics.settled.p95ChannelDelta}; minimum `
        + `Δ${policy.minimumMeanChannelDelta}/Δ${policy.minimumP95ChannelDelta}`,
    );
  }

  const settledToLiveEnergy = metrics.liveToSettled.energyRatio;
  if (settledToLiveEnergy < policy.minimumSettledToLiveEnergyRatio) {
    error(
      "settled-stroke-disappeared",
      `${policy.id}: pointerup retained only ${(settledToLiveEnergy * 100).toFixed(1)}% `
        + "of live ink energy",
    );
  } else if (
    metrics.liveToSettled.changedPixels
      > Math.max(80, Math.floor(metrics.settled.changedPixels * 0.35))
  ) {
    warning(
      "settle-churn",
      `${policy.id}: live→settled changed ${metrics.liveToSettled.changedPixels} pixels`,
    );
  }
  if (
    metrics.liveToSettled.differenceRatio
      > policy.maximumLiveSettledDifferenceRatio
  ) {
    error(
      "live-settled-divergence",
      `${policy.id}: live→settled pixel difference is `
        + `${(metrics.liveToSettled.differenceRatio * 100).toFixed(1)}% of compared ink`,
    );
  } else if (
    metrics.liveToSettled.differenceRatio
      > policy.maximumLiveSettledDifferenceRatio * 0.72
  ) {
    warning(
      "live-settled-divergence",
      `${policy.id}: live→settled pixel difference is elevated at `
        + `${(metrics.liveToSettled.differenceRatio * 100).toFixed(1)}%`,
    );
  }

  const longestGapRatio = safeRatio(
    metrics.settled.longestGapSamples,
    metrics.settled.pathSamples,
  );
  if (
    metrics.settled.pathCoverage < policy.minimumPathCoverage
    || longestGapRatio > policy.maximumLongestGapRatio
  ) {
    error(
      "interior-gap",
      `${policy.id}: path coverage ${(metrics.settled.pathCoverage * 100).toFixed(1)}%, `
        + `longest gap ${(longestGapRatio * 100).toFixed(1)}%`,
    );
  }

  for (const [label, accumulation] of [
    ["pass 1→2", metrics.pass1ToPass2],
    ["pass 2→3", metrics.pass2ToPass3],
  ] as const) {
    if (
      accumulation.energyRatio < 1 - policy.maximumPassEnergyDropRatio
      || accumulation.regressedInkRatio > policy.maximumRegressedInkRatio
    ) {
      error(
        "pigment-regressed",
        `${policy.id}: ${label} energy ${(accumulation.energyRatio * 100).toFixed(1)}%, `
          + `regressed pixels ${(accumulation.regressedInkRatio * 100).toFixed(1)}%`,
      );
    } else if (
      accumulation.energyRatio < 0.98
      || accumulation.regressedInkRatio > 0.08
    ) {
      warning(
        "pigment-regressed",
        `${policy.id}: ${label} has mild diagnostic regression `
          + `(${(accumulation.energyRatio * 100).toFixed(1)}% energy, `
          + `${(accumulation.regressedInkRatio * 100).toFixed(1)}% pixels)`,
      );
    }
    if (
      accumulation.regressedInkEnergyRatio
        > policy.maximumRegressedInkEnergyRatio
    ) {
      error(
        "pigment-energy-loss",
        `${policy.id}: ${label} removed `
          + `${(accumulation.regressedInkEnergyRatio * 100).toFixed(1)}% pigment energy `
          + `(maximum pixel loss Δ${accumulation.maximumPigmentLossDelta})`,
      );
    } else if (
      accumulation.regressedInkEnergyRatio
        > policy.maximumRegressedInkEnergyRatio * 0.65
    ) {
      warning(
        "pigment-energy-loss",
        `${policy.id}: ${label} has elevated local pigment loss `
          + `(${(accumulation.regressedInkEnergyRatio * 100).toFixed(1)}%)`,
      );
    }
  }

  const undoResidualRatio = safeRatio(
    metrics.undoToBaseline.changedPixels,
    metrics.settled.changedPixels,
  );
  if (
    metrics.undoToBaseline.changedPixels > 12
    && undoResidualRatio > policy.maximumUndoResidualRatio
  ) {
    error(
      "undo-residue",
      `${policy.id}: Undo left ${metrics.undoToBaseline.changedPixels} perceptible pixels `
        + `(${(undoResidualRatio * 100).toFixed(1)}% of the stroke)`,
    );
  }

  const redoDifferenceRatio = safeRatio(
    metrics.redoToSettled.changedPixels,
    metrics.settled.changedPixels,
  );
  if (redoDifferenceRatio > policy.maximumRedoDifferenceRatio) {
    error(
      "redo-diverged",
      `${policy.id}: Redo differs from settled output by `
        + `${(redoDifferenceRatio * 100).toFixed(1)}%`,
    );
  }

  if (
    metrics.settled.scallopCoefficient !== null
    && metrics.settled.scallopCoefficient > policy.scallopWarningThreshold
  ) {
    warning(
      "scallop-variance",
      `${policy.id}: cross-section width coefficient is `
        + metrics.settled.scallopCoefficient.toFixed(3),
    );
  }
  if (
    metrics.pixelQuality.scallopResidualCoefficient !== null
    && metrics.pixelQuality.scallopResidualCoefficient
      > policy.maximumScallopResidualCoefficient
  ) {
    error(
      "scallop-artifact",
      `${policy.id}: detrended cross-section residual is `
        + metrics.pixelQuality.scallopResidualCoefficient.toFixed(3),
    );
  } else if (
    metrics.pixelQuality.scallopResidualCoefficient !== null
    && metrics.pixelQuality.scallopResidualCoefficient
      > policy.maximumScallopResidualCoefficient * 0.72
  ) {
    warning(
      "scallop-artifact",
      `${policy.id}: detrended cross-section residual is elevated at `
        + metrics.pixelQuality.scallopResidualCoefficient.toFixed(3),
    );
  }
  if (metrics.pixelQuality.repetitionScore > policy.maximumRepetitionScore) {
    error(
      "repeated-grid-pattern",
      `${policy.id}: ${metrics.pixelQuality.repetitionAxis ?? "unknown"}-axis repetition `
        + `score ${metrics.pixelQuality.repetitionScore.toFixed(3)} at `
        + `${metrics.pixelQuality.repetitionPeriodPx ?? "unknown"}px`,
    );
  } else if (
    metrics.pixelQuality.repetitionScore > policy.maximumRepetitionScore * 0.72
  ) {
    warning(
      "repeated-grid-pattern",
      `${policy.id}: diagnostic repetition score `
        + `${metrics.pixelQuality.repetitionScore.toFixed(3)} at `
        + `${metrics.pixelQuality.repetitionPeriodPx ?? "unknown"}px`,
    );
  }
  if (
    policy.minimumTextureCoefficient !== null
    && metrics.settled.textureCoefficient < policy.minimumTextureCoefficient
  ) {
    warning(
      "texture-flatness",
      `${policy.id}: texture coefficient ${metrics.settled.textureCoefficient.toFixed(3)} `
        + `is below the ${policy.minimumTextureCoefficient.toFixed(3)} diagnostic floor`,
    );
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    findings,
  };
}

export interface StudioBrushMediaSuiteEvaluation {
  readonly ok: boolean;
  readonly uniqueFingerprintCount: number;
  readonly nearestPair: Readonly<{
    left: StudioBrushMediaId;
    right: StudioBrushMediaId;
    distance: number;
  }> | null;
  readonly findings: readonly StudioBrushMediaPolicyFinding[];
}

function featureDistance(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let squared = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    squared += delta * delta;
  }
  return Math.sqrt(squared / length);
}

export function evaluateStudioBrushMediaSuite(
  cases: readonly StudioBrushMediaCaseMetrics[],
): StudioBrushMediaSuiteEvaluation {
  const findings: StudioBrushMediaPolicyFinding[] = [];
  const fingerprints = new Set(cases.map((entry) => entry.pass3.fingerprint));
  const minimumUnique = Math.max(1, cases.length - 1);
  if (fingerprints.size < minimumUnique) {
    findings.push({
      level: "error",
      code: "fingerprint-collision",
      message: `only ${fingerprints.size}/${cases.length} representative media fingerprints are unique`,
    });
  }

  let nearestPair: StudioBrushMediaSuiteEvaluation["nearestPair"] = null;
  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cases.length; rightIndex += 1) {
      const left = cases[leftIndex]!;
      const right = cases[rightIndex]!;
      const distance = featureDistance(
        left.pass3.featureVector,
        right.pass3.featureVector,
      );
      if (!nearestPair || distance < nearestPair.distance) {
        nearestPair = { left: left.id, right: right.id, distance };
      }
    }
  }

  if (nearestPair && nearestPair.distance < 0.0125) {
    findings.push({
      level: "warning",
      code: "fingerprint-collision",
      message: `${nearestPair.left}/${nearestPair.right} normalized visual features are `
        + `very close (${nearestPair.distance.toFixed(4)})`,
    });
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    uniqueFingerprintCount: fingerprints.size,
    nearestPair,
    findings,
  };
}
