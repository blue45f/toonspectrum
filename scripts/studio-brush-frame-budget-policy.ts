export const STUDIO_BRUSH_FRAME_BUDGET_IDS = [
  "pen",
  "g-pen-flex",
  "pencil-4b-rough",
  "airbrush-grand-soft",
  "watercolor-wet-wash",
  "ink-wash",
  "inkwash-bleed-wash",
  "sumi-wash-fray",
  "oil",
  "highlighter",
] as const;

export type StudioBrushFrameBudgetId = (typeof STUDIO_BRUSH_FRAME_BUDGET_IDS)[number];

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
  readonly strokeDurationMs: number;
  readonly longTaskDurationsMs: readonly number[];
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
  readonly nominalFrameMs: number;
  readonly moveFrameSampleCount: number;
  readonly moveFrameP50Ms: number;
  readonly moveFrameP95Ms: number;
  readonly moveFrameMaxMs: number;
  readonly moveToFrameP50Ms: number;
  readonly moveToFrameP95Ms: number;
  readonly moveToFrameMaxMs: number;
  readonly missedFrames: number;
  readonly frameMissRatio: number;
  readonly inputDeliveryRatio: number;
  readonly longestLongTaskMs: number;
  readonly settleMs: number;
}

export interface StudioBrushFrameBudgetFinding {
  readonly level: "error" | "warning";
  readonly code:
    | "first-pixel-missing"
    | "first-pixel-stall"
    | "compositor-surface-missing"
    | "continuous-profile-missing"
    | "pointer-delivery-loss"
    | "move-frame-stall"
    | "move-frame-tail"
    | "move-to-frame-stall"
    | "move-to-frame-tail"
    | "long-stroke-frame-miss"
    | "long-task-stall"
    | "long-task-tail"
    | "settle-timeout"
    | "settle-stall"
    | "slow-settle";
  readonly message: string;
}

export interface StudioBrushFrameBudgetEvaluation {
  readonly ok: boolean;
  readonly summary: StudioBrushFrameBudgetSummary;
  readonly findings: readonly StudioBrushFrameBudgetFinding[];
}

export const STUDIO_BRUSH_FRAME_BUDGETS = {
  strictFirstPixelMs: 200,
  warningFirstPixelMs: 50,
  strictMoveFrameP95Ms: 100,
  warningMoveFrameP95Ms: 34,
  strictMoveToFrameP95Ms: 100,
  warningMoveToFrameP95Ms: 40,
  strictFrameMissRatio: 0.5,
  warningFrameMissRatio: 0.08,
  strictInputDeliveryRatio: 0.5,
  warningInputDeliveryRatio: 0.9,
  strictLongTaskMs: 200,
  warningLongTaskMs: 50,
  strictSettleMs: 200,
  warningSettleMs: 100,
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
  const missedFrames = countStudioBrushMissedFrames(moveFrames, metrics.nominalFrameMs);
  const longTasks = finiteSorted(metrics.longTaskDurationsMs);
  return {
    firstPixelMs: metrics.firstPixelMs,
    nominalFrameMs: metrics.nominalFrameMs,
    moveFrameSampleCount: moveFrames.length,
    moveFrameP50Ms: studioBrushFramePercentile(moveFrames, 0.5),
    moveFrameP95Ms: studioBrushFramePercentile(moveFrames, 0.95),
    moveFrameMaxMs: moveFrames.at(-1) ?? Number.POSITIVE_INFINITY,
    moveToFrameP50Ms: studioBrushFramePercentile(moveToFrame, 0.5),
    moveToFrameP95Ms: studioBrushFramePercentile(moveToFrame, 0.95),
    moveToFrameMaxMs: moveToFrame.at(-1) ?? Number.POSITIVE_INFINITY,
    missedFrames,
    frameMissRatio: safeRatio(missedFrames, moveFrames.length + missedFrames),
    inputDeliveryRatio: Math.min(
      1,
      safeRatio(metrics.observedPointerMoves, metrics.expectedPointerMoves),
    ),
    longestLongTaskMs: longTasks.at(-1) ?? 0,
    settleMs: metrics.settleMs,
  };
}

/**
 * Cross-machine production-preview policy.
 *
 * The strict limits reject only visibly broken response paths and multi-frame stalls. Competitive
 * 60/120 Hz targets are warnings until enough CI hardware history exists to make them portable.
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
  } else if (metrics.firstPixelMs >= STUDIO_BRUSH_FRAME_BUDGETS.strictFirstPixelMs) {
    add(
      "error",
      "first-pixel-stall",
      `${metrics.id}: first pixel stalled for ${metrics.firstPixelMs.toFixed(1)}ms`,
    );
  } else if (metrics.firstPixelMs > STUDIO_BRUSH_FRAME_BUDGETS.warningFirstPixelMs) {
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
    summary.moveFrameSampleCount < STUDIO_BRUSH_FRAME_BUDGETS.minimumMoveFrameSamples
    || metrics.moveToFrameLatenciesMs.length === 0
  ) {
    add(
      "error",
      "continuous-profile-missing",
      `${metrics.id}: continuous stroke produced only ${summary.moveFrameSampleCount} move frames`,
    );
  }

  if (summary.inputDeliveryRatio < STUDIO_BRUSH_FRAME_BUDGETS.strictInputDeliveryRatio) {
    add(
      "error",
      "pointer-delivery-loss",
      `${metrics.id}: observed ${(summary.inputDeliveryRatio * 100).toFixed(1)}% of dispatched moves`,
    );
  } else if (
    summary.inputDeliveryRatio < STUDIO_BRUSH_FRAME_BUDGETS.warningInputDeliveryRatio
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
      summary.moveFrameP95Ms >= STUDIO_BRUSH_FRAME_BUDGETS.strictMoveFrameP95Ms
      || summary.moveFrameMaxMs >= STUDIO_BRUSH_FRAME_BUDGETS.strictLongTaskMs
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
    && summary.moveFrameP95Ms > STUDIO_BRUSH_FRAME_BUDGETS.warningMoveFrameP95Ms
  ) {
    add(
      "warning",
      "move-frame-tail",
      `${metrics.id}: move-frame p95 ${summary.moveFrameP95Ms.toFixed(1)}ms`,
    );
  }

  if (
    Number.isFinite(summary.moveToFrameP95Ms)
    && summary.moveToFrameP95Ms >= STUDIO_BRUSH_FRAME_BUDGETS.strictMoveToFrameP95Ms
  ) {
    add(
      "error",
      "move-to-frame-stall",
      `${metrics.id}: input→next-frame p95 ${summary.moveToFrameP95Ms.toFixed(1)}ms`,
    );
  } else if (
    Number.isFinite(summary.moveToFrameP95Ms)
    && summary.moveToFrameP95Ms > STUDIO_BRUSH_FRAME_BUDGETS.warningMoveToFrameP95Ms
  ) {
    add(
      "warning",
      "move-to-frame-tail",
      `${metrics.id}: input→next-frame p95 ${summary.moveToFrameP95Ms.toFixed(1)}ms`,
    );
  }

  if (summary.frameMissRatio > STUDIO_BRUSH_FRAME_BUDGETS.strictFrameMissRatio) {
    add(
      "error",
      "long-stroke-frame-miss",
      `${metrics.id}: missed ${summary.missedFrames} frames `
        + `(${(summary.frameMissRatio * 100).toFixed(1)}%)`,
    );
  } else if (summary.frameMissRatio > STUDIO_BRUSH_FRAME_BUDGETS.warningFrameMissRatio) {
    add(
      "warning",
      "long-stroke-frame-miss",
      `${metrics.id}: missed ${summary.missedFrames} frames `
        + `(${(summary.frameMissRatio * 100).toFixed(1)}%)`,
    );
  }

  if (summary.longestLongTaskMs >= STUDIO_BRUSH_FRAME_BUDGETS.strictLongTaskMs) {
    add(
      "error",
      "long-task-stall",
      `${metrics.id}: main-thread long task lasted ${summary.longestLongTaskMs.toFixed(1)}ms`,
    );
  } else if (summary.longestLongTaskMs >= STUDIO_BRUSH_FRAME_BUDGETS.warningLongTaskMs) {
    add(
      "warning",
      "long-task-tail",
      `${metrics.id}: main-thread long task lasted ${summary.longestLongTaskMs.toFixed(1)}ms`,
    );
  }

  if (metrics.settleTimedOut) {
    add("error", "settle-timeout", `${metrics.id}: pointerup settlement timed out`);
  } else if (metrics.settleMs >= STUDIO_BRUSH_FRAME_BUDGETS.strictSettleMs) {
    add(
      "error",
      "settle-stall",
      `${metrics.id}: pointerup settlement stalled for ${metrics.settleMs.toFixed(1)}ms`,
    );
  } else if (metrics.settleMs > STUDIO_BRUSH_FRAME_BUDGETS.warningSettleMs) {
    add(
      "warning",
      "slow-settle",
      `${metrics.id}: pointerup settled after ${metrics.settleMs.toFixed(1)}ms`,
    );
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    summary,
    findings,
  };
}
