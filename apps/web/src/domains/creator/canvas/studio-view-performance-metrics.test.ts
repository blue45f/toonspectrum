import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS,
  normalizeStudioViewZoomPercent,
  summarizeStudioViewFrameDurations,
} from "./studio-view-performance-metrics";

describe("studio view performance metrics", () => {
  it("ignores invalid and suspended-tab frame durations", () => {
    expect(
      summarizeStudioViewFrameDurations([
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1,
        0,
        1001,
      ])
    ).toBe(EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS);
  });

  it("summarizes average, p95 and slow-frame ratio deterministically", () => {
    expect(summarizeStudioViewFrameDurations([16, 16, 20, 40])).toEqual({
      fps: 43.5,
      averageFrameMs: 23,
      p95FrameMs: 40,
      slowFramePercent: 50,
      sampleCount: 4,
    });
  });

  it("reports a 60 Hz frame interval as approximately 60 fps", () => {
    const metrics = summarizeStudioViewFrameDurations([
      1000 / 60,
      1000 / 60,
      1000 / 60,
    ]);
    expect(metrics.fps).toBe(60);
    expect(metrics.p95FrameMs).toBe(16.7);
  });

  it("normalizes both percentage and scale-style zoom values", () => {
    expect(normalizeStudioViewZoomPercent(125)).toBe(125);
    expect(normalizeStudioViewZoomPercent(1.5)).toBe(150);
    expect(normalizeStudioViewZoomPercent(Number.NaN)).toBe(100);
    expect(normalizeStudioViewZoomPercent(100_000)).toBe(6400);
  });
});
