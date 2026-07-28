import { describe, expect, it } from "vitest";

import {
  evaluateStudioBrushLatencyCase,
  summarizeStudioBrushInputLatency,
  type StudioBrushInputLatencySample,
  type StudioBrushLatencyCaseMetrics,
} from "./studio-brush-latency-policy";

function sample(
  sampleIndex: number,
  latencyMs: number | null,
  overrides: Partial<StudioBrushInputLatencySample> = {},
): StudioBrushInputLatencySample {
  return {
    phase: sampleIndex === 0 ? "pointerdown" : "pointermove",
    sampleIndex,
    latencyMs,
    changedPixels: 12,
    maxChannelDelta: 40,
    rafIntervalsMs: [16.7],
    droppedVisualFrames: 0,
    timedOut: false,
    ...overrides,
  };
}

function healthy(): StudioBrushLatencyCaseMetrics {
  return {
    id: "g-pen-flex",
    pointerDown: sample(0, 8),
    pointerMoves: [sample(1, 12), sample(2, 18), sample(3, 22)],
    pointerUp: {
      observationMs: 320,
      firstVisualChangeMs: 18,
      lastVisualChangeMs: 42,
      settleMs: 58,
      liveToSettledChangedPixels: 120,
      liveToSettledMaxChannelDelta: 24,
      droppedVisualFrames: 0,
      timedOut: false,
    },
  };
}

describe("Studio browser brush-latency policy", () => {
  it("reports nearest-rank p50/p95/max and dropped visual frames", () => {
    const summary = summarizeStudioBrushInputLatency([
      sample(0, 8),
      sample(1, 12, { droppedVisualFrames: 1 }),
      sample(2, 18),
      sample(3, 40, { droppedVisualFrames: 2 }),
    ]);
    expect(summary).toEqual({
      sampleCount: 4,
      p50Ms: 12,
      p95Ms: 40,
      maxMs: 40,
      droppedVisualFrames: 3,
    });
  });

  it("accepts responsive visible ink with a bounded pointerup settle", () => {
    const result = evaluateStudioBrushLatencyCase(healthy());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("fails missing pixels, 200ms stalls, and settle timeout without overfitting fast tails", () => {
    const result = evaluateStudioBrushLatencyCase({
      ...healthy(),
      pointerDown: sample(0, null, {
        changedPixels: 0,
        maxChannelDelta: 0,
        timedOut: true,
      }),
      pointerMoves: [
        sample(1, 205),
        sample(2, 72, { droppedVisualFrames: 2 }),
      ],
      pointerUp: {
        ...healthy().pointerUp,
        timedOut: true,
      },
    });
    expect(result.ok).toBe(false);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "pixel-response-missing",
      "input-stall",
      "settle-timeout",
    ]));
    expect(result.findings.some((finding) => (
      finding.level === "warning" && finding.code === "slow-input-tail"
    ))).toBe(true);
  });

  it("keeps a sub-200ms settle tail and large live diff diagnostic-only", () => {
    const result = evaluateStudioBrushLatencyCase({
      ...healthy(),
      pointerUp: {
        ...healthy().pointerUp,
        settleMs: 180,
        liveToSettledChangedPixels: 1_400,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "slow-settle",
      "large-live-settled-diff",
    ]);
  });

  it("fails a pointerup settlement that crosses the 200ms stall boundary", () => {
    const result = evaluateStudioBrushLatencyCase({
      ...healthy(),
      pointerUp: {
        ...healthy().pointerUp,
        settleMs: 240,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      level: "error",
      code: "settle-stall",
    }));
  });
});
