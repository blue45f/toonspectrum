export interface StudioViewPerformanceMetrics {
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly p95FrameMs: number;
  readonly slowFramePercent: number;
  readonly sampleCount: number;
}

export const EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS: StudioViewPerformanceMetrics =
  Object.freeze({
    fps: 0,
    averageFrameMs: 0,
    p95FrameMs: 0,
    slowFramePercent: 0,
    sampleCount: 0,
  });

const SLOW_FRAME_THRESHOLD_MS = 1000 / 60;

function roundTo(value: number, fractionDigits: number): number {
  const scale = 10 ** fractionDigits;
  return Math.round(value * scale) / scale;
}

export function summarizeStudioViewFrameDurations(
  durations: readonly number[]
): StudioViewPerformanceMetrics {
  const valid = durations.filter(
    (duration) => Number.isFinite(duration) && duration > 0 && duration <= 1000
  );
  if (valid.length === 0) return EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS;

  const averageFrameMs =
    valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const sorted = [...valid].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p95FrameMs = sorted[p95Index] ?? averageFrameMs;
  const slowFrames = valid.filter(
    (duration) => duration > SLOW_FRAME_THRESHOLD_MS
  ).length;

  return Object.freeze({
    fps: roundTo(1000 / averageFrameMs, 1),
    averageFrameMs: roundTo(averageFrameMs, 1),
    p95FrameMs: roundTo(p95FrameMs, 1),
    slowFramePercent: roundTo((slowFrames / valid.length) * 100, 1),
    sampleCount: valid.length,
  });
}

/**
 * Studio historically stores zoom as a percentage, while a few lower-level
 * surfaces expose a CSS-style scale. Accept both so the diagnostic HUD remains
 * accurate while the command layer is consolidated.
 */
export function normalizeStudioViewZoomPercent(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  const percent = Math.abs(zoom) <= 8 ? zoom * 100 : zoom;
  return Math.round(Math.max(1, Math.min(6400, percent)));
}
