import {
  STUDIO_BRUSH_FRAME_BUDGET_IDS,
  type StudioBrushFrameBudgetId,
} from "./studio-brush-frame-budget-policy";

export const STUDIO_BRUSH_LATENCY_IDS = STUDIO_BRUSH_FRAME_BUDGET_IDS;

export type StudioBrushLatencyId = StudioBrushFrameBudgetId;

export interface StudioBrushInputLatencySample {
  readonly phase: "pointerdown" | "pointermove";
  readonly sampleIndex: number;
  readonly latencyMs: number | null;
  readonly changedPixels: number;
  readonly maxChannelDelta: number;
  readonly rafIntervalsMs: readonly number[];
  readonly droppedVisualFrames: number;
  readonly timedOut: boolean;
}

export interface StudioBrushSettleSample {
  readonly observationMs: number;
  readonly firstVisualChangeMs: number | null;
  readonly lastVisualChangeMs: number | null;
  readonly settleMs: number;
  readonly liveToSettledChangedPixels: number;
  readonly liveToSettledMaxChannelDelta: number;
  readonly droppedVisualFrames: number;
  readonly timedOut: boolean;
}

export interface StudioBrushLatencyCaseMetrics {
  readonly id: StudioBrushLatencyId;
  readonly pointerDown: StudioBrushInputLatencySample;
  readonly pointerMoves: readonly StudioBrushInputLatencySample[];
  readonly pointerUp: StudioBrushSettleSample;
}

export interface StudioBrushLatencySummary {
  readonly sampleCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly droppedVisualFrames: number;
}

export interface StudioBrushLatencyFinding {
  readonly level: "error" | "warning";
  readonly code:
    | "pixel-response-missing"
    | "input-stall"
    | "slow-input-tail"
    | "dropped-visual-frames"
    | "settle-timeout"
    | "settle-stall"
    | "slow-settle"
    | "large-live-settled-diff";
  readonly message: string;
}

export interface StudioBrushLatencyEvaluation {
  readonly ok: boolean;
  readonly summary: StudioBrushLatencySummary;
  readonly findings: readonly StudioBrushLatencyFinding[];
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index]!;
}

export function summarizeStudioBrushInputLatency(
  samples: readonly StudioBrushInputLatencySample[],
): StudioBrushLatencySummary {
  const finite = samples
    .flatMap((sample) => (
      sample.latencyMs !== null && Number.isFinite(sample.latencyMs)
        ? [sample.latencyMs]
        : []
    ))
    .sort((left, right) => left - right);
  return {
    sampleCount: finite.length,
    p50Ms: percentile(finite, 0.5),
    p95Ms: percentile(finite, 0.95),
    maxMs: finite.at(-1) ?? Number.POSITIVE_INFINITY,
    droppedVisualFrames: samples.reduce(
      (sum, sample) => sum + sample.droppedVisualFrames,
      0,
    ),
  };
}

/**
 * Cross-machine policy: only missing ink, a 200ms input stall, or an unfinished settle is fatal.
 * Normal timing differences remain diagnostics until CI/browser distributions justify tighter
 * hardware-specific budgets.
 */
export function evaluateStudioBrushLatencyCase(
  metrics: StudioBrushLatencyCaseMetrics,
): StudioBrushLatencyEvaluation {
  const samples = [metrics.pointerDown, ...metrics.pointerMoves];
  const summary = summarizeStudioBrushInputLatency(samples);
  const findings: StudioBrushLatencyFinding[] = [];

  for (const sample of samples) {
    const label = sample.phase === "pointerdown"
      ? "pointerdown"
      : `pointermove ${sample.sampleIndex}`;
    if (
      sample.timedOut
      || sample.latencyMs === null
      || sample.changedPixels <= 0
      || sample.maxChannelDelta <= 0
    ) {
      findings.push({
        level: "error",
        code: "pixel-response-missing",
        message: `${metrics.id}: ${label} produced no measurable pixel response`,
      });
      continue;
    }
    if (sample.latencyMs >= 200) {
      findings.push({
        level: "error",
        code: "input-stall",
        message: `${metrics.id}: ${label} stalled for ${sample.latencyMs.toFixed(1)}ms`,
      });
    }
  }

  if (
    Number.isFinite(summary.p95Ms)
    && (summary.p95Ms > 50 || summary.maxMs > 100)
  ) {
    findings.push({
      level: "warning",
      code: "slow-input-tail",
      message: `${metrics.id}: input p95 ${summary.p95Ms.toFixed(1)}ms, `
        + `max ${summary.maxMs.toFixed(1)}ms`,
    });
  }
  if (summary.droppedVisualFrames > 0) {
    findings.push({
      level: "warning",
      code: "dropped-visual-frames",
      message: `${metrics.id}: ${summary.droppedVisualFrames} delayed RAF intervals`,
    });
  }
  if (metrics.pointerUp.timedOut) {
    findings.push({
      level: "error",
      code: "settle-timeout",
      message: `${metrics.id}: pointerup did not reach a bounded settled observation`,
    });
  } else if (metrics.pointerUp.settleMs >= 200) {
    findings.push({
      level: "error",
      code: "settle-stall",
      message: `${metrics.id}: pointerup settlement stalled for `
        + `${metrics.pointerUp.settleMs.toFixed(1)}ms`,
    });
  } else if (metrics.pointerUp.settleMs > 100) {
    findings.push({
      level: "warning",
      code: "slow-settle",
      message: `${metrics.id}: pointerup settled after ${metrics.pointerUp.settleMs.toFixed(1)}ms`,
    });
  }
  if (metrics.pointerUp.liveToSettledChangedPixels > 1_000) {
    findings.push({
      level: "warning",
      code: "large-live-settled-diff",
      message: `${metrics.id}: live→settled changed `
        + `${metrics.pointerUp.liveToSettledChangedPixels} sampled pixels`,
    });
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    summary,
    findings,
  };
}
