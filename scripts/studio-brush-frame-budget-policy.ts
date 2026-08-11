export const STUDIO_BRUSH_FRAME_BUDGET_IDS = [
  "pen",
  "g-pen-flex",
  "pencil-4b-rough",
  "pencil",
  "crayon",
  "calligraphy",
  "oil-filbert",
  "paint-tube",
  "airbrush-grand-soft",
  "airbrush-fine",
  "standard-eraser",
  "watercolor-wet-wash",
  "ink-wash",
  "inkwash-bleed-wash",
  "sumi-wash-fray",
  "oil",
  "highlighter",
] as const;

export type StudioBrushFrameBudgetId = (typeof STUDIO_BRUSH_FRAME_BUDGET_IDS)[number];

export const STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT = {
  width: 1_536,
  height: 960,
} as const;

export const STUDIO_BRUSH_COMPETITIVE_WORKLOADS = [
  {
    id: "samples-1k",
    targetInputSamples: 1_000,
    minimumStrokeDurationMs: 0,
  },
  {
    id: "samples-8k",
    targetInputSamples: 8_000,
    minimumStrokeDurationMs: 0,
  },
  {
    id: "samples-50k",
    targetInputSamples: 50_000,
    minimumStrokeDurationMs: 0,
  },
  {
    id: "duration-30s",
    targetInputSamples: null,
    minimumStrokeDurationMs: 30_000,
  },
] as const;

export type StudioBrushCompetitiveWorkload =
  (typeof STUDIO_BRUSH_COMPETITIVE_WORKLOADS)[number];
export type StudioBrushCompetitiveWorkloadId = StudioBrushCompetitiveWorkload["id"];

export const STUDIO_BRUSH_COMPETITIVE_POINTER_RATES_HZ = [120, 240] as const;
export type StudioBrushCompetitivePointerRateHz =
  (typeof STUDIO_BRUSH_COMPETITIVE_POINTER_RATES_HZ)[number];
export const STUDIO_BRUSH_COMPETITIVE_DEVICE_SCALE_FACTORS = [1, 2] as const;
export type StudioBrushCompetitiveDeviceScaleFactor =
  (typeof STUDIO_BRUSH_COMPETITIVE_DEVICE_SCALE_FACTORS)[number];

export const STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES = {
  pen: "webgpu-causal-ink",
  "g-pen-flex": "canvas2d-dynamic-coverage",
  "pencil-4b-rough": "canvas2d-dynamic-coverage",
  pencil: "canvas2d-dynamic-coverage",
  crayon: "canvas2d-dynamic-coverage",
  calligraphy: "canvas2d-dynamic-coverage",
  "oil-filbert": "canvas2d-dynamic-coverage",
  "paint-tube": "canvas2d-dynamic-coverage",
  "airbrush-grand-soft": "canvas2d-dynamic-coverage",
  "airbrush-fine": "canvas2d-stamp",
  "standard-eraser": "konva-eraser-mask",
  "watercolor-wet-wash": "canvas2d-dynamic-coverage",
  "ink-wash": "canvas2d-dynamic-coverage",
  "inkwash-bleed-wash": "canvas2d-dynamic-coverage",
  "sumi-wash-fray": "canvas2d-dynamic-coverage",
  oil: "canvas2d-dynamic-coverage",
  highlighter: "canvas2d-dynamic-coverage",
} as const satisfies Readonly<Record<StudioBrushFrameBudgetId, string>>;

export interface StudioBrushCompetitiveExecutionCase {
  readonly workloadId: StudioBrushCompetitiveWorkloadId;
  readonly pointerRateHz: StudioBrushCompetitivePointerRateHz;
  readonly deviceScaleFactor: StudioBrushCompetitiveDeviceScaleFactor;
  readonly targetInputSamples: number;
  readonly intendedStrokeDurationMs: number;
}

export const STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES =
  STUDIO_BRUSH_COMPETITIVE_WORKLOADS.flatMap((workload) => (
    STUDIO_BRUSH_COMPETITIVE_POINTER_RATES_HZ.flatMap((pointerRateHz) => (
      STUDIO_BRUSH_COMPETITIVE_DEVICE_SCALE_FACTORS.map((deviceScaleFactor) => {
        const targetInputSamples = workload.targetInputSamples
          ?? Math.round(pointerRateHz * workload.minimumStrokeDurationMs / 1_000);
        return {
          workloadId: workload.id,
          pointerRateHz,
          deviceScaleFactor,
          targetInputSamples,
          intendedStrokeDurationMs: workload.minimumStrokeDurationMs > 0
            ? workload.minimumStrokeDurationMs
            : targetInputSamples / pointerRateHz * 1_000,
        };
      })
    ))
  )) satisfies readonly StudioBrushCompetitiveExecutionCase[];

export interface StudioBrushCompetitiveCoverageCase {
  readonly id: StudioBrushFrameBudgetId;
  readonly workloadId: StudioBrushCompetitiveWorkloadId;
  readonly pointerRateHz: StudioBrushCompetitivePointerRateHz;
  readonly targetInputSamples: number;
  readonly observedInputSamples: number;
  readonly intendedStrokeDurationMs: number;
  readonly observedStrokeDurationMs: number;
  readonly requestedViewportWidth: number;
  readonly requestedViewportHeight: number;
  readonly actualViewportWidth: number;
  readonly actualViewportHeight: number;
  readonly requestedDeviceScaleFactor: StudioBrushCompetitiveDeviceScaleFactor;
  readonly actualDeviceScaleFactor: number;
  readonly expectedProviderRoute: string;
  readonly observedProviderRoute: string | null;
  readonly routeDiagnostics: StudioBrushCompetitiveRouteDiagnostics | null;
  readonly hardAcceptanceOk: boolean;
}

export interface StudioBrushCompetitiveRouteDiagnostics {
  readonly sourceCount: number;
  readonly sourceBytes: number;
  readonly derivedCount: number;
  readonly derivedBytes: number;
  readonly rgbaCount: number;
  readonly rgbaBytes: number;
  readonly canvasCount: number;
  readonly canvasBytes: number;
  readonly queueCount: number;
  readonly queueBytes: number;
  readonly handoffCount: number;
  readonly handoffBytes: number;
  readonly historyCount: number;
  readonly historyBytes: number;
  readonly historyRetainedReferenceCount: number;
  readonly scratchCount: number;
  readonly scratchBytes: number;
  readonly afterAckRafCount: number;
  readonly afterAckTransientCount: number;
  readonly afterAckTransientBytes: number;
  readonly wetDerivedCacheReleasedOnEviction: boolean;
  readonly hokusaiAppendQueueCount: number;
  readonly hokusaiAppendQueueBytes: number;
  readonly hokusaiPrefixVisitCount: number;
  readonly eraserMainLayerDrawsPerAppend: number;
  readonly failedHandoffStrokeIdCount: number;
  readonly failedHandoffBytes: number;
  readonly failedHandoffOldestAgeMs: number;
  readonly failedHandoffSpilled: boolean;
  readonly stampCacheActualBytes: number;
  readonly stampCacheExpectedBytes: number;
  readonly stampCacheWidth: number;
  readonly stampCacheHeight: number;
  readonly liveInkAckReleased: boolean;
  readonly liveInkPageEpochReleased: boolean;
  readonly committedDrawStatus: "rendered-exact" | "fallback" | "partial" | "blank";
  readonly committedDrawScale: number;
  readonly committedDrawTileCount: number;
  readonly committedDrawBytes: number;
  readonly committedDrawReferenceCount: number;
  readonly committedDrawAcknowledged: boolean;
  readonly dryCommittedContourVisitCount: number;
  readonly dryCommittedContourCount: number;
  readonly dryCommittedBoundedOverlapCount: number;
  readonly strokeBudgetReceipt: StudioBrushCompetitiveStrokeBudgetReceipt | null;
}

export interface StudioBrushCompetitiveStrokeBudgetAuthority {
  readonly sourceCount: number;
  readonly dabCount: number;
  readonly markCount: number;
  readonly arcLength: number;
  readonly lastSourceIndex: number;
  readonly endpointDigest: string;
  readonly symmetryDigest: string;
  readonly policy: string;
  readonly qualityTier: string;
  readonly providerRoute: string;
  readonly programDigest: string;
}

export interface StudioBrushCompetitiveStrokeBudgetReceipt {
  readonly requested: StudioBrushCompetitiveStrokeBudgetAuthority;
  readonly accepted: StudioBrushCompetitiveStrokeBudgetAuthority;
  readonly firstDegradedDab: number | null;
}

export interface StudioBrushCompetitiveCoverageEvaluation {
  readonly ok: boolean;
  readonly expectedCaseCount: number;
  readonly observedCaseCount: number;
  readonly missingCases: readonly string[];
  readonly duplicateCases: readonly string[];
  readonly invalidCases: readonly string[];
}

export const STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS = [
  1_000,
  6_205,
  8_000,
] as const;

export interface StudioBrushCompetitiveLongSessionEvidence {
  readonly commitCount: number;
  readonly observedCommitCount: number;
  readonly historyRetainedReferenceCount: number;
  readonly historyEstimatedBytes: number;
  readonly rendererPlanCacheCount: number;
  readonly rendererPlanCacheBytes: number;
  readonly wetPlanCacheCount: number;
  readonly wetPlanCacheBytes: number;
  readonly rendererPlanCacheCountAfterUndo: number;
  readonly rendererPlanCacheBytesAfterUndo: number;
  readonly wetPlanCacheCountAfterUndo: number;
  readonly wetPlanCacheBytesAfterUndo: number;
  readonly rendererPlanCacheCountAfterReopen: number;
  readonly rendererPlanCacheBytesAfterReopen: number;
  readonly wetPlanCacheCountAfterReopen: number;
  readonly wetPlanCacheBytesAfterReopen: number;
  readonly wetDerivedCacheReleasedOnEviction: boolean;
  readonly undoPixelDiffCount: number;
  readonly reopenPixelDiffCount: number;
}

export interface StudioBrushCompetitiveLongSessionEvaluation {
  readonly ok: boolean;
  readonly missingCommitCounts: readonly number[];
  readonly invalidCases: readonly string[];
}

export interface StudioBrushRenderCallPhase {
  readonly totalCalls: number;
  readonly markCalls: number;
  readonly pathCalls: number;
  readonly clearCalls: number;
  readonly pixelReadCalls: number;
  readonly allocationCalls: number;
  readonly methods: Readonly<Record<string, number>>;
}

export interface StudioBrushRenderSurfaceDiagnostics {
  readonly id: string;
  readonly moving: StudioBrushRenderCallPhase;
  readonly release: StudioBrushRenderCallPhase;
}

export interface StudioBrushRenderWorkloadDiagnostics {
  readonly surfaces: readonly StudioBrushRenderSurfaceDiagnostics[];
  readonly movingCallsPerFrame: readonly number[];
  readonly movingMarksPerFrame: readonly number[];
  readonly pointerUpToFirstFrameMs: number | null;
  readonly movingLongTaskDurationsMs: readonly number[];
  readonly releaseLongTaskDurationsMs: readonly number[];
  readonly heapUsedAtPointerDown: number | null;
  readonly heapUsedAtPointerUp: number | null;
  readonly heapUsedAfterRelease: number | null;
}

export interface StudioBrushFrameRuntimeSample {
  readonly nominalFrameMs: number;
  readonly warmupFrameIntervalsMs: readonly number[];
  readonly moveFrameIntervalsMs: readonly number[];
  readonly moveToFrameLatenciesMs: readonly number[];
  readonly expectedPointerMoves: number;
  readonly observedPointerMoves: number;
  readonly observedCoalescedSamples: number;
  /** Synchronous pointermove dispatch through the product append path, measured capture→microtask. */
  readonly pointerAppendDurationsMs: readonly number[];
  /** Synchronous pointerup dispatch through the seal/handoff path, measured capture→microtask. */
  readonly pointerUpMainThreadMs: number | null;
  readonly pointerUpToFirstFrameMs: number | null;
  /** Frames sampled after ink first became visible in the compositor route. */
  readonly blankFrameObservationCount: number;
  /** Observed compositor frames that returned to the pre-stroke baseline after ink was visible. */
  readonly blankFrameCount: number;
  /** Product-sealed canonical provider route exposed by the active selection receipt. */
  readonly observedProviderRoute: string | null;
  /** Full-gate resource accounting snapshot; null until the product diagnostics seam is present. */
  readonly routeDiagnostics: StudioBrushCompetitiveRouteDiagnostics | null;
  readonly strokeDurationMs: number;
  readonly longTaskDurationsMs: readonly number[];
  readonly longTaskObserverAvailable: boolean;
  readonly compositorCanvasCount: number;
  readonly renderWorkload?: StudioBrushRenderWorkloadDiagnostics;
}

export interface StudioBrushFrameBudgetMetrics extends StudioBrushFrameRuntimeSample {
  readonly id: StudioBrushFrameBudgetId;
  readonly firstPixelMs: number | null;
  readonly firstPixelChangedPixels: number;
  readonly firstPixelMaxChannelDelta: number;
  readonly firstPixelTimedOut: boolean;
  readonly settleMs: number;
  readonly settleTimedOut: boolean;
}

export interface StudioBrushFrameBudgetSummary {
  readonly firstPixelMs: number | null;
  readonly firstPixelVsyncExcessMs: number | null;
  readonly nominalFrameMs: number;
  readonly moveFrameSampleCount: number;
  readonly moveFrameP50Ms: number;
  readonly moveFrameP95Ms: number;
  readonly moveFrameMaxMs: number;
  readonly moveToFrameP50Ms: number;
  readonly moveToFrameP95Ms: number;
  readonly moveToFrameP99Ms: number;
  readonly moveToFrameMaxMs: number;
  readonly moveToFrameP99VsyncExcessMs: number;
  readonly missedFrames: number;
  readonly frameMissRatio: number;
  readonly inputDeliveryRatio: number;
  readonly inputDeliveryExact: boolean;
  readonly pointerAppendSampleCount: number;
  readonly pointerAppendP50Ms: number;
  readonly pointerAppendP95Ms: number;
  readonly pointerAppendP99Ms: number;
  readonly pointerAppendMaxMs: number;
  readonly pointerUpMainThreadMs: number | null;
  readonly blankFrameObservationCount: number;
  readonly blankFrameCount: number;
  readonly longTaskCount: number;
  readonly longestLongTaskMs: number;
  readonly settleMs: number;
}

export interface StudioBrushFrameBudgetFinding {
  readonly level: "error" | "warning";
  readonly code:
    | "first-pixel-missing"
    | "first-pixel-stall"
    | "first-pixel-vsync-excess"
    | "compositor-surface-missing"
    | "continuous-profile-missing"
    | "pointer-delivery-loss"
    | "pointer-append-profile-missing"
    | "pointer-append-p95"
    | "pointer-append-p99"
    | "blank-frame-profile-missing"
    | "blank-frame"
    | "pointerup-main-profile-missing"
    | "pointerup-main-stall"
    | "pointerup-main-tail"
    | "move-frame-stall"
    | "move-frame-tail"
    | "move-to-frame-stall"
    | "move-to-frame-tail"
    | "move-to-frame-vsync-excess"
    | "long-stroke-frame-miss"
    | "long-task-stall"
    | "long-task-tail"
    | "long-task-profile-missing"
    | "settle-timeout"
    | "settle-stall"
    | "slow-settle";
  readonly message: string;
}

export interface StudioBrushFrameBudgetEvaluation {
  readonly ok: boolean;
  readonly summary: StudioBrushFrameBudgetSummary;
  readonly findings: readonly StudioBrushFrameBudgetFinding[];
  readonly legacyTelemetry: StudioBrushLegacyFrameBudgetTelemetry;
}

export interface StudioBrushLegacyFrameBudgetTelemetry {
  readonly ok: boolean;
  readonly findings: readonly StudioBrushFrameBudgetFinding[];
}

/**
 * Historical cross-machine thresholds. These values are retained for trend comparison only and
 * must never decide the competitive acceptance result or process exit code.
 */
export const STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS = {
  fatalFirstPixelMs: 200,
  warningFirstPixelMs: 50,
  fatalMoveFrameP95Ms: 100,
  warningMoveFrameP95Ms: 34,
  fatalMoveToFrameP95Ms: 100,
  warningMoveToFrameP95Ms: 40,
  fatalFrameMissRatio: 0.5,
  warningFrameMissRatio: 0.08,
  fatalInputDeliveryRatio: 0.5,
  warningInputDeliveryRatio: 0.9,
  fatalLongTaskMs: 200,
  warningLongTaskMs: 50,
  fatalSettleMs: 200,
  warningSettleMs: 100,
  minimumMoveFrameSamples: 6,
} as const;

export const STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS = {
  firstPixelVsyncExcessMs: 8,
  pointerAppendP95Ms: 8,
  pointerAppendP99Ms: 16.7,
  moveToFrameP99VsyncExcessMs: 16.7,
  longTaskMs: 50,
  pointerUpMainThreadTargetMs: 16,
  pointerUpMainThreadAbsoluteMs: 50,
  settleTargetMs: 16,
  settleAbsoluteMs: 50,
  minimumMoveFrameSamples: 6,
} as const;

function finiteSorted(values: readonly number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
}

export function studioBrushFramePercentile(
  values: readonly number[],
  quantile: number,
): number {
  const sorted = finiteSorted(values);
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index]!;
}

export function countStudioBrushMissedFrames(
  intervalsMs: readonly number[],
  nominalFrameMs: number,
): number {
  if (!Number.isFinite(nominalFrameMs) || nominalFrameMs <= 0) return 0;
  return finiteSorted(intervalsMs).reduce((sum, interval) => (
    sum + Math.max(0, Math.round(interval / nominalFrameMs) - 1)
  ), 0);
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return numerator <= 0 ? 1 : 0;
  return numerator / denominator;
}

export function summarizeStudioBrushFrameBudget(
  metrics: StudioBrushFrameBudgetMetrics,
): StudioBrushFrameBudgetSummary {
  const moveFrames = finiteSorted(metrics.moveFrameIntervalsMs);
  const moveToFrame = finiteSorted(metrics.moveToFrameLatenciesMs);
  const pointerAppend = finiteSorted(metrics.pointerAppendDurationsMs);
  const missedFrames = countStudioBrushMissedFrames(moveFrames, metrics.nominalFrameMs);
  const longTasks = finiteSorted(metrics.longTaskDurationsMs);
  const firstPixelVsyncExcessMs = metrics.firstPixelMs !== null
    && Number.isFinite(metrics.firstPixelMs)
    && Number.isFinite(metrics.nominalFrameMs)
    && metrics.nominalFrameMs > 0
    ? Math.max(0, metrics.firstPixelMs - metrics.nominalFrameMs)
    : null;
  return {
    firstPixelMs: metrics.firstPixelMs,
    firstPixelVsyncExcessMs,
    nominalFrameMs: metrics.nominalFrameMs,
    moveFrameSampleCount: moveFrames.length,
    moveFrameP50Ms: studioBrushFramePercentile(moveFrames, 0.5),
    moveFrameP95Ms: studioBrushFramePercentile(moveFrames, 0.95),
    moveFrameMaxMs: moveFrames.at(-1) ?? Number.POSITIVE_INFINITY,
    moveToFrameP50Ms: studioBrushFramePercentile(moveToFrame, 0.5),
    moveToFrameP95Ms: studioBrushFramePercentile(moveToFrame, 0.95),
    moveToFrameP99Ms: studioBrushFramePercentile(moveToFrame, 0.99),
    moveToFrameMaxMs: moveToFrame.at(-1) ?? Number.POSITIVE_INFINITY,
    moveToFrameP99VsyncExcessMs: Math.max(
      0,
      studioBrushFramePercentile(moveToFrame, 0.99) - metrics.nominalFrameMs,
    ),
    missedFrames,
    frameMissRatio: safeRatio(missedFrames, moveFrames.length + missedFrames),
    inputDeliveryRatio: Math.min(
      1,
      safeRatio(metrics.observedPointerMoves, metrics.expectedPointerMoves),
    ),
    inputDeliveryExact:
      metrics.expectedPointerMoves > 0
      && metrics.observedPointerMoves === metrics.expectedPointerMoves,
    pointerAppendSampleCount: pointerAppend.length,
    pointerAppendP50Ms: studioBrushFramePercentile(pointerAppend, 0.5),
    pointerAppendP95Ms: studioBrushFramePercentile(pointerAppend, 0.95),
    pointerAppendP99Ms: studioBrushFramePercentile(pointerAppend, 0.99),
    pointerAppendMaxMs: pointerAppend.at(-1) ?? Number.POSITIVE_INFINITY,
    pointerUpMainThreadMs:
      metrics.pointerUpMainThreadMs !== null
      && Number.isFinite(metrics.pointerUpMainThreadMs)
        ? metrics.pointerUpMainThreadMs
        : null,
    blankFrameObservationCount: metrics.blankFrameObservationCount,
    blankFrameCount: metrics.blankFrameCount,
    longTaskCount: longTasks.filter(
      (duration) => duration >= STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.longTaskMs,
    ).length,
    longestLongTaskMs: longTasks.at(-1) ?? 0,
    settleMs: metrics.settleMs,
  };
}

/**
 * Historical diagnostics retained so old report series remain comparable. Its `ok` value is
 * telemetry and must not control the competitive gate or process exit code.
 */
export function evaluateStudioBrushLegacyFrameBudgetTelemetry(
  metrics: StudioBrushFrameBudgetMetrics,
): StudioBrushLegacyFrameBudgetTelemetry {
  const summary = summarizeStudioBrushFrameBudget(metrics);
  const findings: StudioBrushFrameBudgetFinding[] = [];
  const add = (
    level: StudioBrushFrameBudgetFinding["level"],
    code: StudioBrushFrameBudgetFinding["code"],
    message: string,
  ): void => {
    findings.push({ level, code, message });
  };

  if (
    metrics.firstPixelTimedOut
    || metrics.firstPixelMs === null
    || metrics.firstPixelChangedPixels <= 0
    || metrics.firstPixelMaxChannelDelta <= 0
  ) {
    add("error", "first-pixel-missing", `${metrics.id}: pointerdown produced no visible ink`);
  } else if (
    metrics.firstPixelMs >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalFirstPixelMs
  ) {
    add(
      "error",
      "first-pixel-stall",
      `${metrics.id}: first pixel stalled for ${metrics.firstPixelMs.toFixed(1)}ms`,
    );
  } else if (
    metrics.firstPixelMs > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningFirstPixelMs
  ) {
    add(
      "warning",
      "first-pixel-stall",
      `${metrics.id}: first pixel arrived after ${metrics.firstPixelMs.toFixed(1)}ms`,
    );
  }

  if (metrics.compositorCanvasCount <= 0) {
    add(
      "error",
      "compositor-surface-missing",
      `${metrics.id}: no compositor canvas was present during the stroke`,
    );
  }
  if (
    summary.moveFrameSampleCount
      < STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.minimumMoveFrameSamples
    || metrics.moveToFrameLatenciesMs.length === 0
  ) {
    add(
      "error",
      "continuous-profile-missing",
      `${metrics.id}: continuous stroke produced only ${summary.moveFrameSampleCount} move frames`,
    );
  }

  if (
    summary.inputDeliveryRatio
      < STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalInputDeliveryRatio
  ) {
    add(
      "error",
      "pointer-delivery-loss",
      `${metrics.id}: observed ${(summary.inputDeliveryRatio * 100).toFixed(1)}% of dispatched moves`,
    );
  } else if (
    summary.inputDeliveryRatio
      < STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningInputDeliveryRatio
  ) {
    add(
      "warning",
      "pointer-delivery-loss",
      `${metrics.id}: observed ${(summary.inputDeliveryRatio * 100).toFixed(1)}% of dispatched moves`,
    );
  }

  if (
    Number.isFinite(summary.moveFrameP95Ms)
    && (
      summary.moveFrameP95Ms
        >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalMoveFrameP95Ms
      || summary.moveFrameMaxMs
        >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalLongTaskMs
    )
  ) {
    add(
      "error",
      "move-frame-stall",
      `${metrics.id}: move-frame p95 ${summary.moveFrameP95Ms.toFixed(1)}ms, `
        + `max ${summary.moveFrameMaxMs.toFixed(1)}ms`,
    );
  } else if (
    Number.isFinite(summary.moveFrameP95Ms)
    && summary.moveFrameP95Ms
      > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningMoveFrameP95Ms
  ) {
    add(
      "warning",
      "move-frame-tail",
      `${metrics.id}: move-frame p95 ${summary.moveFrameP95Ms.toFixed(1)}ms`,
    );
  }

  if (
    Number.isFinite(summary.moveToFrameP95Ms)
    && summary.moveToFrameP95Ms
      >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalMoveToFrameP95Ms
  ) {
    add(
      "error",
      "move-to-frame-stall",
      `${metrics.id}: input→next-frame p95 ${summary.moveToFrameP95Ms.toFixed(1)}ms`,
    );
  } else if (
    Number.isFinite(summary.moveToFrameP95Ms)
    && summary.moveToFrameP95Ms
      > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningMoveToFrameP95Ms
  ) {
    add(
      "warning",
      "move-to-frame-tail",
      `${metrics.id}: input→next-frame p95 ${summary.moveToFrameP95Ms.toFixed(1)}ms`,
    );
  }

  if (
    summary.frameMissRatio > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalFrameMissRatio
  ) {
    add(
      "error",
      "long-stroke-frame-miss",
      `${metrics.id}: missed ${summary.missedFrames} frames `
        + `(${(summary.frameMissRatio * 100).toFixed(1)}%)`,
    );
  } else if (
    summary.frameMissRatio > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningFrameMissRatio
  ) {
    add(
      "warning",
      "long-stroke-frame-miss",
      `${metrics.id}: missed ${summary.missedFrames} frames `
        + `(${(summary.frameMissRatio * 100).toFixed(1)}%)`,
    );
  }

  if (
    summary.longestLongTaskMs >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalLongTaskMs
  ) {
    add(
      "error",
      "long-task-stall",
      `${metrics.id}: main-thread long task lasted ${summary.longestLongTaskMs.toFixed(1)}ms`,
    );
  } else if (
    summary.longestLongTaskMs >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningLongTaskMs
  ) {
    add(
      "warning",
      "long-task-tail",
      `${metrics.id}: main-thread long task lasted ${summary.longestLongTaskMs.toFixed(1)}ms`,
    );
  }

  if (metrics.settleTimedOut) {
    add("error", "settle-timeout", `${metrics.id}: pointerup settlement timed out`);
  } else if (metrics.settleMs >= STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.fatalSettleMs) {
    add(
      "error",
      "settle-stall",
      `${metrics.id}: pointerup settlement stalled for ${metrics.settleMs.toFixed(1)}ms`,
    );
  } else if (metrics.settleMs > STUDIO_BRUSH_LEGACY_TELEMETRY_THRESHOLDS.warningSettleMs) {
    add(
      "warning",
      "slow-settle",
      `${metrics.id}: pointerup settled after ${metrics.settleMs.toFixed(1)}ms`,
    );
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    findings,
  };
}

/**
 * Competitive long-stroke acceptance. Unlike the legacy telemetry above, every error here blocks
 * the browser gate. Timing is measured on the synchronous pointer/append path so a normal refresh
 * interval is not incorrectly charged as handler work.
 */
export function evaluateStudioBrushFrameBudget(
  metrics: StudioBrushFrameBudgetMetrics,
): StudioBrushFrameBudgetEvaluation {
  const summary = summarizeStudioBrushFrameBudget(metrics);
  const findings: StudioBrushFrameBudgetFinding[] = [];
  const add = (
    level: StudioBrushFrameBudgetFinding["level"],
    code: StudioBrushFrameBudgetFinding["code"],
    message: string,
  ): void => {
    findings.push({ level, code, message });
  };

  if (
    metrics.firstPixelTimedOut
    || metrics.firstPixelMs === null
    || metrics.firstPixelChangedPixels <= 0
    || metrics.firstPixelMaxChannelDelta <= 0
  ) {
    add("error", "first-pixel-missing", `${metrics.id}: pointerdown produced no visible ink`);
  } else if (
    summary.firstPixelVsyncExcessMs === null
    || summary.firstPixelVsyncExcessMs
      > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.firstPixelVsyncExcessMs
  ) {
    add(
      "error",
      "first-pixel-vsync-excess",
      `${metrics.id}: first visible pixel exceeded one vsync by `
        + `${summary.firstPixelVsyncExcessMs?.toFixed(1) ?? "unknown"}ms`,
    );
  }

  if (metrics.compositorCanvasCount <= 0) {
    add(
      "error",
      "compositor-surface-missing",
      `${metrics.id}: no compositor canvas was present during the stroke`,
    );
  }
  if (
    summary.moveFrameSampleCount
      < STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.minimumMoveFrameSamples
    || metrics.moveToFrameLatenciesMs.length === 0
  ) {
    add(
      "error",
      "continuous-profile-missing",
      `${metrics.id}: continuous stroke produced only ${summary.moveFrameSampleCount} move frames`,
    );
  } else if (
    Number.isFinite(summary.moveToFrameP99VsyncExcessMs)
    && summary.moveToFrameP99VsyncExcessMs
      > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.moveToFrameP99VsyncExcessMs
  ) {
    add(
      "error",
      "move-to-frame-vsync-excess",
      `${metrics.id}: input→frame p99 exceeded one vsync by `
        + `${summary.moveToFrameP99VsyncExcessMs.toFixed(2)}ms`,
    );
  }

  if (!summary.inputDeliveryExact) {
    add(
      "error",
      "pointer-delivery-loss",
      `${metrics.id}: observed ${metrics.observedPointerMoves}/`
        + `${metrics.expectedPointerMoves} dispatched moves`,
    );
  }

  if (
    summary.pointerAppendSampleCount === 0
    || summary.pointerAppendSampleCount < metrics.observedPointerMoves
  ) {
    add(
      "error",
      "pointer-append-profile-missing",
      `${metrics.id}: measured ${summary.pointerAppendSampleCount}/`
        + `${metrics.observedPointerMoves} pointer append dispatches`,
    );
  } else {
    if (
      summary.pointerAppendP95Ms
        > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.pointerAppendP95Ms
    ) {
      add(
        "error",
        "pointer-append-p95",
        `${metrics.id}: pointer/append p95 ${summary.pointerAppendP95Ms.toFixed(2)}ms`,
      );
    }
    if (
      summary.pointerAppendP99Ms
        > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.pointerAppendP99Ms
    ) {
      add(
        "error",
        "pointer-append-p99",
        `${metrics.id}: pointer/append p99 ${summary.pointerAppendP99Ms.toFixed(2)}ms`,
      );
    }
  }

  if (
    !Number.isSafeInteger(summary.blankFrameObservationCount)
    || summary.blankFrameObservationCount <= 0
  ) {
    add(
      "error",
      "blank-frame-profile-missing",
      `${metrics.id}: no post-ink compositor frame was sampled`,
    );
  } else if (summary.blankFrameCount !== 0) {
    add(
      "error",
      "blank-frame",
      `${metrics.id}: observed ${summary.blankFrameCount} blank compositor frames`,
    );
  }

  if (!metrics.longTaskObserverAvailable) {
    add(
      "error",
      "long-task-profile-missing",
      `${metrics.id}: browser long-task observation is unavailable`,
    );
  } else if (summary.longTaskCount > 0) {
    add(
      "error",
      "long-task-stall",
      `${metrics.id}: observed ${summary.longTaskCount} main-thread tasks >=`
        + `${STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.longTaskMs}ms`,
    );
  }

  if (summary.pointerUpMainThreadMs === null) {
    add(
      "error",
      "pointerup-main-profile-missing",
      `${metrics.id}: pointerup main-thread duration was not measured`,
    );
  } else if (
    summary.pointerUpMainThreadMs
      > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.pointerUpMainThreadAbsoluteMs
  ) {
    add(
      "error",
      "pointerup-main-stall",
      `${metrics.id}: pointerup main-thread work took `
        + `${summary.pointerUpMainThreadMs.toFixed(2)}ms`,
    );
  } else if (
    summary.pointerUpMainThreadMs
      > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.pointerUpMainThreadTargetMs
  ) {
    add(
      "warning",
      "pointerup-main-tail",
      `${metrics.id}: pointerup main-thread work exceeded the 16ms target at `
        + `${summary.pointerUpMainThreadMs.toFixed(2)}ms`,
    );
  }

  if (metrics.settleTimedOut) {
    add("error", "settle-timeout", `${metrics.id}: pointerup settlement timed out`);
  } else if (metrics.settleMs > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.settleAbsoluteMs) {
    add(
      "error",
      "settle-stall",
      `${metrics.id}: pointerup completion took ${metrics.settleMs.toFixed(2)}ms`,
    );
  } else if (metrics.settleMs > STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.settleTargetMs) {
    add(
      "warning",
      "slow-settle",
      `${metrics.id}: pointerup completion exceeded the 16ms target at `
        + `${metrics.settleMs.toFixed(2)}ms`,
    );
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    summary,
    findings,
    legacyTelemetry: evaluateStudioBrushLegacyFrameBudgetTelemetry(metrics),
  };
}

function competitiveCoverageKey(
  id: StudioBrushFrameBudgetId,
  workloadId: StudioBrushCompetitiveWorkloadId,
  pointerRateHz: StudioBrushCompetitivePointerRateHz,
  deviceScaleFactor: StudioBrushCompetitiveDeviceScaleFactor,
): string {
  return `${id}:${workloadId}:${pointerRateHz}hz:dpr${deviceScaleFactor}`;
}

export function evaluateStudioBrushCompetitiveCoverage(
  evidence: readonly StudioBrushCompetitiveCoverageCase[],
): StudioBrushCompetitiveCoverageEvaluation {
  const expectedCases = STUDIO_BRUSH_FRAME_BUDGET_IDS.flatMap((id) => (
    STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES.map((execution) => ({ id, execution }))
  ));
  const expectedKeys = expectedCases.map(({ id, execution }) => competitiveCoverageKey(
    id,
    execution.workloadId,
    execution.pointerRateHz,
    execution.deviceScaleFactor,
  ));
  const expected = new Set(expectedKeys);
  const expectedExecutionByKey = new Map(expectedCases.map(({ id, execution }) => [
    competitiveCoverageKey(
      id,
      execution.workloadId,
      execution.pointerRateHz,
      execution.deviceScaleFactor,
    ),
    execution,
  ]));
  const counts = new Map<string, number>();
  const invalidCases: string[] = [];

  for (const candidate of evidence) {
    const key = competitiveCoverageKey(
      candidate.id,
      candidate.workloadId,
      candidate.pointerRateHz,
      candidate.requestedDeviceScaleFactor,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!expected.has(key)) {
      invalidCases.push(`${key}:unknown-case`);
      continue;
    }
    const expectedExecution = expectedExecutionByKey.get(key)!;
    if (
      candidate.targetInputSamples !== expectedExecution.targetInputSamples
      || candidate.observedInputSamples !== expectedExecution.targetInputSamples
    ) {
      invalidCases.push(`${key}:input-samples`);
    }
    if (
      Math.abs(
        candidate.intendedStrokeDurationMs - expectedExecution.intendedStrokeDurationMs,
      ) > 0.01
    ) {
      invalidCases.push(`${key}:intended-duration`);
    }
    const observedPointerRateHz = candidate.observedStrokeDurationMs > 0
      ? candidate.observedInputSamples / candidate.observedStrokeDurationMs * 1_000
      : 0;
    if (
      candidate.observedStrokeDurationMs < candidate.intendedStrokeDurationMs * 0.98
      || observedPointerRateHz < candidate.pointerRateHz * 0.9
      || observedPointerRateHz > candidate.pointerRateHz * 1.05
    ) {
      invalidCases.push(`${key}:duration-or-pointer-rate`);
    }
    if (
      candidate.requestedViewportWidth !== STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.width
      || candidate.requestedViewportHeight !== STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.height
      || candidate.actualViewportWidth !== candidate.requestedViewportWidth
      || candidate.actualViewportHeight !== candidate.requestedViewportHeight
      || candidate.actualDeviceScaleFactor !== candidate.requestedDeviceScaleFactor
    ) {
      invalidCases.push(`${key}:viewport-or-dpr`);
    }
    if (
      candidate.expectedProviderRoute !== STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES[candidate.id]
      || candidate.observedProviderRoute !== candidate.expectedProviderRoute
    ) {
      invalidCases.push(`${key}:provider-route`);
    }
    const diagnostics = candidate.routeDiagnostics;
    if (!diagnostics) {
      invalidCases.push(`${key}:route-diagnostics-missing`);
    } else {
      const numericDiagnostics = [
        diagnostics.sourceCount,
        diagnostics.sourceBytes,
        diagnostics.derivedCount,
        diagnostics.derivedBytes,
        diagnostics.rgbaCount,
        diagnostics.rgbaBytes,
        diagnostics.canvasCount,
        diagnostics.canvasBytes,
        diagnostics.queueCount,
        diagnostics.queueBytes,
        diagnostics.handoffCount,
        diagnostics.handoffBytes,
        diagnostics.historyCount,
        diagnostics.historyBytes,
        diagnostics.historyRetainedReferenceCount,
        diagnostics.scratchCount,
        diagnostics.scratchBytes,
        diagnostics.afterAckRafCount,
        diagnostics.afterAckTransientCount,
        diagnostics.afterAckTransientBytes,
        diagnostics.hokusaiAppendQueueCount,
        diagnostics.hokusaiAppendQueueBytes,
        diagnostics.hokusaiPrefixVisitCount,
        diagnostics.eraserMainLayerDrawsPerAppend,
        diagnostics.failedHandoffStrokeIdCount,
        diagnostics.failedHandoffBytes,
        diagnostics.failedHandoffOldestAgeMs,
        diagnostics.stampCacheActualBytes,
        diagnostics.stampCacheExpectedBytes,
        diagnostics.stampCacheWidth,
        diagnostics.stampCacheHeight,
        diagnostics.committedDrawScale,
        diagnostics.committedDrawTileCount,
        diagnostics.committedDrawBytes,
        diagnostics.committedDrawReferenceCount,
        diagnostics.dryCommittedContourVisitCount,
        diagnostics.dryCommittedContourCount,
        diagnostics.dryCommittedBoundedOverlapCount,
      ];
      if (numericDiagnostics.some((value) => !Number.isFinite(value) || value < 0)) {
        invalidCases.push(`${key}:route-diagnostics-malformed`);
      }
      const integerDiagnostics = [
        diagnostics.sourceCount,
        diagnostics.sourceBytes,
        diagnostics.derivedCount,
        diagnostics.derivedBytes,
        diagnostics.rgbaCount,
        diagnostics.rgbaBytes,
        diagnostics.canvasCount,
        diagnostics.canvasBytes,
        diagnostics.queueCount,
        diagnostics.queueBytes,
        diagnostics.handoffCount,
        diagnostics.handoffBytes,
        diagnostics.historyCount,
        diagnostics.historyBytes,
        diagnostics.historyRetainedReferenceCount,
        diagnostics.scratchCount,
        diagnostics.scratchBytes,
        diagnostics.afterAckRafCount,
        diagnostics.afterAckTransientCount,
        diagnostics.afterAckTransientBytes,
        diagnostics.hokusaiAppendQueueCount,
        diagnostics.hokusaiAppendQueueBytes,
        diagnostics.hokusaiPrefixVisitCount,
        diagnostics.eraserMainLayerDrawsPerAppend,
        diagnostics.failedHandoffStrokeIdCount,
        diagnostics.failedHandoffBytes,
        diagnostics.stampCacheActualBytes,
        diagnostics.stampCacheExpectedBytes,
        diagnostics.stampCacheWidth,
        diagnostics.stampCacheHeight,
        diagnostics.committedDrawTileCount,
        diagnostics.committedDrawBytes,
        diagnostics.committedDrawReferenceCount,
        diagnostics.dryCommittedContourVisitCount,
        diagnostics.dryCommittedContourCount,
        diagnostics.dryCommittedBoundedOverlapCount,
      ];
      if (integerDiagnostics.some((value) => !Number.isSafeInteger(value))) {
        invalidCases.push(`${key}:route-diagnostics-noninteger`);
      }
      if (
        diagnostics.afterAckRafCount > 2
        || diagnostics.afterAckTransientCount !== 0
        || diagnostics.afterAckTransientBytes !== 0
      ) {
        invalidCases.push(`${key}:ack-transient-retention`);
      }
      if (
        diagnostics.historyRetainedReferenceCount > candidate.observedInputSamples * 2
        || !diagnostics.wetDerivedCacheReleasedOnEviction
      ) {
        invalidCases.push(`${key}:history-or-wet-cache-retention`);
      }
      if (
        diagnostics.hokusaiAppendQueueCount > 2
        || diagnostics.hokusaiAppendQueueBytes > 196_608
        || diagnostics.hokusaiPrefixVisitCount !== 0
      ) {
        invalidCases.push(`${key}:hokusai-queue-or-prefix`);
      }
      if (diagnostics.eraserMainLayerDrawsPerAppend !== 0) {
        invalidCases.push(`${key}:eraser-main-layer-draw`);
      }
      if (
        diagnostics.failedHandoffStrokeIdCount > 64
        || diagnostics.failedHandoffBytes > 67_108_864
        || (
          diagnostics.failedHandoffOldestAgeMs > 30_000
          && !diagnostics.failedHandoffSpilled
        )
      ) {
        invalidCases.push(`${key}:failed-handoff-unbounded`);
      }
      if (
        diagnostics.stampCacheActualBytes !== diagnostics.stampCacheExpectedBytes
        || (
          candidate.expectedProviderRoute === "canvas2d-stamp"
          && (
            diagnostics.stampCacheWidth <= 0
            || diagnostics.stampCacheHeight <= 0
            || diagnostics.stampCacheExpectedBytes
              !== diagnostics.stampCacheWidth * diagnostics.stampCacheHeight * 4
          )
        )
      ) {
        invalidCases.push(`${key}:stamp-cache-accounting`);
      }
      if (!diagnostics.liveInkAckReleased || !diagnostics.liveInkPageEpochReleased) {
        invalidCases.push(`${key}:live-ink-release`);
      }
      if (
        diagnostics.committedDrawStatus !== "rendered-exact"
        || diagnostics.committedDrawScale <= 0
        || diagnostics.committedDrawTileCount <= 0
        || diagnostics.committedDrawBytes <= 0
        || diagnostics.committedDrawReferenceCount <= 0
        || !diagnostics.committedDrawAcknowledged
      ) {
        invalidCases.push(`${key}:committed-draw-receipt`);
      }
      if (
        diagnostics.dryCommittedContourVisitCount
          > diagnostics.dryCommittedContourCount
            + diagnostics.dryCommittedBoundedOverlapCount
      ) {
        invalidCases.push(`${key}:dry-contour-prefix-replay`);
      }
      const strokeBudget = diagnostics.strokeBudgetReceipt;
      if (!strokeBudget) {
        invalidCases.push(`${key}:stroke-budget-receipt-missing`);
      } else {
        const requested = strokeBudget.requested;
        const accepted = strokeBudget.accepted;
        if (
          requested.sourceCount !== accepted.sourceCount
          || requested.dabCount !== accepted.dabCount
          || requested.markCount !== accepted.markCount
          || requested.arcLength !== accepted.arcLength
          || requested.lastSourceIndex !== accepted.lastSourceIndex
          || requested.endpointDigest !== accepted.endpointDigest
          || requested.symmetryDigest !== accepted.symmetryDigest
          || requested.policy !== accepted.policy
          || requested.qualityTier !== accepted.qualityTier
          || requested.providerRoute !== accepted.providerRoute
          || requested.programDigest !== accepted.programDigest
          || accepted.providerRoute !== candidate.expectedProviderRoute
          || requested.endpointDigest.length === 0
          || requested.symmetryDigest.length === 0
          || requested.programDigest.length === 0
          || requested.sourceCount !== candidate.targetInputSamples + 1
          || requested.lastSourceIndex !== requested.sourceCount - 1
          || requested.policy !== "uncapped-paged"
          || requested.qualityTier !== "canonical"
          || strokeBudget.firstDegradedDab !== null
        ) {
          invalidCases.push(`${key}:stroke-budget-degraded`);
        }
      }
    }
    if (!candidate.hardAcceptanceOk) invalidCases.push(`${key}:hard-acceptance`);
  }

  const missingCases = expectedKeys.filter((key) => !counts.has(key));
  const duplicateCases = [...counts]
    .filter(([, count]) => count !== 1)
    .map(([key]) => key)
    .sort();
  invalidCases.sort();

  return {
    ok:
      missingCases.length === 0
      && duplicateCases.length === 0
      && invalidCases.length === 0,
    expectedCaseCount: expectedKeys.length,
    observedCaseCount: evidence.length,
    missingCases,
    duplicateCases,
    invalidCases,
  };
}

export function evaluateStudioBrushCompetitiveLongSession(
  evidence: readonly StudioBrushCompetitiveLongSessionEvidence[],
): StudioBrushCompetitiveLongSessionEvaluation {
  const expected = new Set<number>(STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS);
  const counts = new Map<number, number>();
  const invalidCases: string[] = [];

  for (const candidate of evidence) {
    counts.set(candidate.commitCount, (counts.get(candidate.commitCount) ?? 0) + 1);
    if (!expected.has(candidate.commitCount)) {
      invalidCases.push(`${candidate.commitCount}:unknown-count`);
      continue;
    }
    const numericValues = [
      candidate.observedCommitCount,
      candidate.historyRetainedReferenceCount,
      candidate.historyEstimatedBytes,
      candidate.rendererPlanCacheCount,
      candidate.rendererPlanCacheBytes,
      candidate.wetPlanCacheCount,
      candidate.wetPlanCacheBytes,
      candidate.rendererPlanCacheCountAfterUndo,
      candidate.rendererPlanCacheBytesAfterUndo,
      candidate.wetPlanCacheCountAfterUndo,
      candidate.wetPlanCacheBytesAfterUndo,
      candidate.rendererPlanCacheCountAfterReopen,
      candidate.rendererPlanCacheBytesAfterReopen,
      candidate.wetPlanCacheCountAfterReopen,
      candidate.wetPlanCacheBytesAfterReopen,
      candidate.undoPixelDiffCount,
      candidate.reopenPixelDiffCount,
    ];
    if (numericValues.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      invalidCases.push(`${candidate.commitCount}:malformed-metrics`);
      continue;
    }
    if (candidate.observedCommitCount !== candidate.commitCount) {
      invalidCases.push(`${candidate.commitCount}:commit-delivery`);
    }
    if (
      candidate.historyRetainedReferenceCount > candidate.commitCount * 2
      || candidate.historyEstimatedBytes > candidate.commitCount * 128
    ) {
      invalidCases.push(`${candidate.commitCount}:history-superlinear`);
    }
    if (
      candidate.rendererPlanCacheCountAfterUndo > 1
      || candidate.wetPlanCacheCountAfterUndo > 1
      || candidate.rendererPlanCacheBytesAfterUndo > 1_048_576
      || candidate.wetPlanCacheBytesAfterUndo > 1_048_576
    ) {
      invalidCases.push(`${candidate.commitCount}:undo-cache-retention`);
    }
    if (
      candidate.rendererPlanCacheCountAfterReopen > 1
      || candidate.wetPlanCacheCountAfterReopen > 1
      || candidate.rendererPlanCacheBytesAfterReopen > 1_048_576
      || candidate.wetPlanCacheBytesAfterReopen > 1_048_576
    ) {
      invalidCases.push(`${candidate.commitCount}:reopen-cache-retention`);
    }
    if (candidate.undoPixelDiffCount !== 0) {
      invalidCases.push(`${candidate.commitCount}:undo-pixel-parity`);
    }
    if (candidate.reopenPixelDiffCount !== 0) {
      invalidCases.push(`${candidate.commitCount}:reopen-pixel-parity`);
    }
    if (!candidate.wetDerivedCacheReleasedOnEviction) {
      invalidCases.push(`${candidate.commitCount}:wet-cache-eviction`);
    }
  }

  for (const [commitCount, count] of counts) {
    if (count !== 1) invalidCases.push(`${commitCount}:duplicate-count`);
  }

  const completeEvidence = evidence
    .filter((candidate) => expected.has(candidate.commitCount))
    .sort((left, right) => left.commitCount - right.commitCount);
  const first = completeEvidence[0];
  const last = completeEvidence.at(-1);
  if (first && last && first !== last) {
    const rendererCountGrowth = last.rendererPlanCacheCount - first.rendererPlanCacheCount;
    const rendererByteGrowth = last.rendererPlanCacheBytes - first.rendererPlanCacheBytes;
    const wetCountGrowth = last.wetPlanCacheCount - first.wetPlanCacheCount;
    const wetByteGrowth = last.wetPlanCacheBytes - first.wetPlanCacheBytes;
    if (
      rendererCountGrowth > 1
      || rendererByteGrowth > 1_048_576
      || wetCountGrowth > 1
      || wetByteGrowth > 1_048_576
    ) {
      invalidCases.push("cache-plateau");
    }
  }

  const missingCommitCounts = STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS
    .filter((commitCount) => !counts.has(commitCount));
  invalidCases.sort();
  return {
    ok: missingCommitCounts.length === 0 && invalidCases.length === 0,
    missingCommitCounts,
    invalidCases,
  };
}
