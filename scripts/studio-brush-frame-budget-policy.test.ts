import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_FRAME_BUDGET_IDS,
  countStudioBrushMissedFrames,
  evaluateStudioBrushFrameBudget,
  studioBrushFramePercentile,
  summarizeStudioBrushFrameBudget,
  type StudioBrushFrameBudgetMetrics,
} from "./studio-brush-frame-budget-policy";

function healthy(
  overrides: Partial<StudioBrushFrameBudgetMetrics> = {},
): StudioBrushFrameBudgetMetrics {
  return {
    id: "g-pen-flex",
    firstPixelMs: 8,
    firstPixelChangedPixels: 24,
    firstPixelMaxChannelDelta: 80,
    firstPixelTimedOut: false,
    nominalFrameMs: 16.67,
    warmupFrameIntervalsMs: [16.5, 16.7, 16.8, 16.6],
    moveFrameIntervalsMs: [16.4, 16.6, 16.7, 16.8, 16.5, 16.9, 17, 16.7],
    moveToFrameLatenciesMs: [4, 8, 11, 14, 6, 9, 12, 15],
    expectedPointerMoves: 72,
    observedPointerMoves: 72,
    observedCoalescedSamples: 72,
    strokeDurationMs: 280,
    longTaskDurationsMs: [],
    compositorCanvasCount: 5,
    settleMs: 42,
    settleTimedOut: false,
    ...overrides,
  };
}

describe("Studio continuous brush frame-budget policy", () => {
  it("covers the representative media, including wet-ink regression brushes", () => {
    expect(STUDIO_BRUSH_FRAME_BUDGET_IDS).toEqual([
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
    ]);
  });

  it("uses nearest-rank percentiles and a refresh-relative missed-frame count", () => {
    expect(studioBrushFramePercentile([3, 1, 9, 5, 7], 0.5)).toBe(5);
    expect(studioBrushFramePercentile([3, 1, 9, 5, 7], 0.95)).toBe(9);
    expect(countStudioBrushMissedFrames([16.7, 17, 34, 51], 16.67)).toBe(3);
  });

  it("accepts responsive continuous ink without hardware-specific warnings", () => {
    const result = evaluateStudioBrushFrameBudget(healthy());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual(expect.objectContaining({
      moveFrameSampleCount: 8,
      missedFrames: 0,
      frameMissRatio: 0,
      inputDeliveryRatio: 1,
    }));
  });

  it("keeps competitive 60 Hz tails diagnostic while blocking multi-frame stalls", () => {
    const warning = evaluateStudioBrushFrameBudget(healthy({
      moveFrameIntervalsMs: [16, 16, 17, 18, 20, 36, 38, 42],
      moveToFrameLatenciesMs: [4, 8, 12, 16, 20, 24, 42, 45],
      longTaskDurationsMs: [58],
      settleMs: 130,
    }));
    expect(warning.ok).toBe(true);
    expect(new Set(warning.findings.map((finding) => finding.code))).toEqual(new Set([
      "move-frame-tail",
      "move-to-frame-tail",
      "long-stroke-frame-miss",
      "long-task-tail",
      "slow-settle",
    ]));

    const stalled = evaluateStudioBrushFrameBudget(healthy({
      moveFrameIntervalsMs: [16, 16, 17, 18, 120, 230],
      moveToFrameLatenciesMs: [4, 8, 12, 18, 120, 230],
      longTaskDurationsMs: [240],
      settleMs: 220,
    }));
    expect(stalled.ok).toBe(false);
    expect(new Set(stalled.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "move-frame-stall",
      "move-to-frame-stall",
      "long-stroke-frame-miss",
      "long-task-stall",
      "settle-stall",
    ]));
  });

  it("fails missing first pixels, insufficient samples, delivery loss, and settle timeout", () => {
    const result = evaluateStudioBrushFrameBudget(healthy({
      firstPixelMs: null,
      firstPixelChangedPixels: 0,
      firstPixelMaxChannelDelta: 0,
      firstPixelTimedOut: true,
      moveFrameIntervalsMs: [16],
      moveToFrameLatenciesMs: [],
      expectedPointerMoves: 72,
      observedPointerMoves: 20,
      compositorCanvasCount: 0,
      settleTimedOut: true,
    }));
    expect(result.ok).toBe(false);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "first-pixel-missing",
      "compositor-surface-missing",
      "continuous-profile-missing",
      "pointer-delivery-loss",
      "settle-timeout",
    ]));
  });

  it("summarizes input delivery and long-task tails without counting malformed samples", () => {
    const summary = summarizeStudioBrushFrameBudget(healthy({
      moveFrameIntervalsMs: [16, Number.NaN, -1, 32],
      moveToFrameLatenciesMs: [5, Number.POSITIVE_INFINITY, 15],
      expectedPointerMoves: 100,
      observedPointerMoves: 80,
      longTaskDurationsMs: [52, Number.NaN, 81],
    }));
    expect(summary.moveFrameSampleCount).toBe(2);
    expect(summary.moveFrameP95Ms).toBe(32);
    expect(summary.moveToFrameP95Ms).toBe(15);
    expect(summary.inputDeliveryRatio).toBe(0.8);
    expect(summary.longestLongTaskMs).toBe(81);
  });
});
