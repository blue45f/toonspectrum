import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT,
  STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES,
  STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS,
  STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES,
  STUDIO_BRUSH_COMPETITIVE_WORKLOADS,
  STUDIO_BRUSH_FRAME_BUDGET_IDS,
  countStudioBrushMissedFrames,
  evaluateStudioBrushCompetitiveCoverage,
  evaluateStudioBrushCompetitiveLongSession,
  evaluateStudioBrushFrameBudget,
  studioBrushFramePercentile,
  summarizeStudioBrushFrameBudget,
  type StudioBrushCompetitiveCoverageCase,
  type StudioBrushCompetitiveLongSessionEvidence,
  type StudioBrushCompetitiveRouteDiagnostics,
  type StudioBrushFrameBudgetMetrics,
} from "./studio-brush-frame-budget-policy";

function routeDiagnostics(
  providerRoute = "canvas2d-dynamic-coverage",
  targetInputSamples = 999,
): StudioBrushCompetitiveRouteDiagnostics {
  const sourceCount = targetInputSamples + 1;
  const stampCacheWidth = providerRoute === "canvas2d-stamp" ? 64 : 0;
  const stampCacheHeight = providerRoute === "canvas2d-stamp" ? 64 : 0;
  const stampCacheBytes = stampCacheWidth * stampCacheHeight * 4;
  const strokeBudgetAuthority = {
    sourceCount,
    dabCount: 1_240,
    markCount: 1_240,
    arcLength: 1_024,
    lastSourceIndex: sourceCount - 1,
    endpointDigest: "sha256:endpoint",
    symmetryDigest: "sha256:symmetry",
    policy: "uncapped-paged",
    qualityTier: "canonical",
    providerRoute,
    programDigest: "sha256:program",
  } as const;
  return {
    sourceCount: 1,
    sourceBytes: 1_024,
    derivedCount: 1,
    derivedBytes: 2_048,
    rgbaCount: 1,
    rgbaBytes: 4_096,
    canvasCount: 1,
    canvasBytes: 4_096,
    queueCount: 0,
    queueBytes: 0,
    handoffCount: 0,
    handoffBytes: 0,
    historyCount: 1,
    historyBytes: 128,
    historyRetainedReferenceCount: 1,
    scratchCount: 0,
    scratchBytes: 0,
    afterAckRafCount: 2,
    afterAckTransientCount: 0,
    afterAckTransientBytes: 0,
    wetDerivedCacheReleasedOnEviction: true,
    hokusaiAppendQueueCount: 0,
    hokusaiAppendQueueBytes: 0,
    hokusaiPrefixVisitCount: 0,
    eraserMainLayerDrawsPerAppend: 0,
    failedHandoffStrokeIdCount: 0,
    failedHandoffBytes: 0,
    failedHandoffOldestAgeMs: 0,
    failedHandoffSpilled: false,
    stampCacheActualBytes: stampCacheBytes,
    stampCacheExpectedBytes: stampCacheBytes,
    stampCacheWidth,
    stampCacheHeight,
    liveInkAckReleased: true,
    liveInkPageEpochReleased: true,
    committedDrawStatus: "rendered-exact",
    committedDrawScale: 2,
    committedDrawTileCount: 1,
    committedDrawBytes: 4_096,
    committedDrawReferenceCount: 1,
    committedDrawAcknowledged: true,
    dryCommittedContourVisitCount: 2_000,
    dryCommittedContourCount: 1_900,
    dryCommittedBoundedOverlapCount: 100,
    strokeBudgetReceipt: {
      requested: strokeBudgetAuthority,
      accepted: strokeBudgetAuthority,
      firstDegradedDab: null,
    },
  };
}

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
    pointerAppendDurationsMs: Array.from({ length: 72 }, (_, index) => 2 + index % 3),
    pointerUpMainThreadMs: 8,
    pointerUpToFirstFrameMs: 12,
    blankFrameObservationCount: 20,
    blankFrameCount: 0,
    observedProviderRoute: "canvas2d-dynamic-coverage",
    routeDiagnostics: routeDiagnostics(),
    strokeDurationMs: 600,
    longTaskDurationsMs: [],
    longTaskObserverAvailable: true,
    compositorCanvasCount: 5,
    settleMs: 8,
    settleTimedOut: false,
    ...overrides,
  };
}

function competitiveCoverage(): StudioBrushCompetitiveCoverageCase[] {
  return STUDIO_BRUSH_FRAME_BUDGET_IDS.flatMap((id) => (
    STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES.map((execution) => ({
      id,
      workloadId: execution.workloadId,
      pointerRateHz: execution.pointerRateHz,
      targetInputSamples: execution.targetInputSamples,
      observedInputSamples: execution.targetInputSamples,
      intendedStrokeDurationMs: execution.intendedStrokeDurationMs,
      observedStrokeDurationMs: execution.intendedStrokeDurationMs,
      requestedViewportWidth: STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.width,
      requestedViewportHeight: STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.height,
      actualViewportWidth: STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.width,
      actualViewportHeight: STUDIO_BRUSH_COMPETITIVE_DESKTOP_VIEWPORT.height,
      requestedDeviceScaleFactor: execution.deviceScaleFactor,
      actualDeviceScaleFactor: execution.deviceScaleFactor,
      expectedProviderRoute: STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES[id],
      observedProviderRoute: STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES[id],
      routeDiagnostics: routeDiagnostics(
        STUDIO_BRUSH_COMPETITIVE_PROVIDER_ROUTES[id],
        execution.targetInputSamples,
      ),
      hardAcceptanceOk: true,
    }))
  ));
}

function longSessionEvidence(): StudioBrushCompetitiveLongSessionEvidence[] {
  return STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS.map((commitCount) => ({
    commitCount,
    observedCommitCount: commitCount,
    historyRetainedReferenceCount: commitCount,
    historyEstimatedBytes: commitCount * 64,
    rendererPlanCacheCount: 4,
    rendererPlanCacheBytes: 2_000_000,
    wetPlanCacheCount: 2,
    wetPlanCacheBytes: 1_000_000,
    rendererPlanCacheCountAfterUndo: 0,
    rendererPlanCacheBytesAfterUndo: 0,
    wetPlanCacheCountAfterUndo: 0,
    wetPlanCacheBytesAfterUndo: 0,
    rendererPlanCacheCountAfterReopen: 1,
    rendererPlanCacheBytesAfterReopen: 256_000,
    wetPlanCacheCountAfterReopen: 1,
    wetPlanCacheBytesAfterReopen: 128_000,
    wetDerivedCacheReleasedOnEviction: true,
    undoPixelDiffCount: 0,
    reopenPixelDiffCount: 0,
  }));
}

describe("Studio competitive continuous brush frame-budget policy", () => {
  it("covers every requested route representative", () => {
    expect(STUDIO_BRUSH_FRAME_BUDGET_IDS).toEqual([
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
    ]);
  });

  it("materializes 1k, 8k, 50k, and 30s at 120/240Hz and DPR1/2", () => {
    expect(STUDIO_BRUSH_COMPETITIVE_WORKLOADS.map((workload) => workload.id)).toEqual([
      "samples-1k",
      "samples-8k",
      "samples-50k",
      "duration-30s",
    ]);
    expect(STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES).toHaveLength(16);
    expect(STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES).toContainEqual({
      workloadId: "samples-50k",
      pointerRateHz: 120,
      deviceScaleFactor: 1,
      targetInputSamples: 50_000,
      intendedStrokeDurationMs: 50_000 / 120 * 1_000,
    });
    expect(STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES).toContainEqual({
      workloadId: "duration-30s",
      pointerRateHz: 240,
      deviceScaleFactor: 2,
      targetInputSamples: 7_200,
      intendedStrokeDurationMs: 30_000,
    });
  });

  it("uses nearest-rank percentiles and a refresh-relative missed-frame count", () => {
    expect(studioBrushFramePercentile([3, 1, 9, 5, 7], 0.5)).toBe(5);
    expect(studioBrushFramePercentile([3, 1, 9, 5, 7], 0.95)).toBe(9);
    expect(countStudioBrushMissedFrames([16.7, 17, 34, 51], 16.67)).toBe(3);
  });

  it("accepts competitive ink and keeps legacy telemetry separate", () => {
    const result = evaluateStudioBrushFrameBudget(healthy());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.legacyTelemetry.ok).toBe(true);
    expect(result.summary).toEqual(expect.objectContaining({
      firstPixelVsyncExcessMs: 0,
      pointerAppendP95Ms: 4,
      pointerAppendP99Ms: 4,
      inputDeliveryExact: true,
      blankFrameCount: 0,
    }));
  });

  it("hard-fails timings that the historical 34-200ms telemetry accepted", () => {
    const result = evaluateStudioBrushFrameBudget(healthy({
      firstPixelMs: 100,
      moveToFrameLatenciesMs: [34, 36, 38, 40, 42, 44, 46, 48],
      pointerAppendDurationsMs: Array.from({ length: 72 }, () => 34),
      pointerUpMainThreadMs: 34,
      longTaskDurationsMs: [58],
      settleMs: 34,
    }));
    expect(result.ok).toBe(false);
    expect(result.legacyTelemetry.ok).toBe(true);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "first-pixel-vsync-excess",
      "move-to-frame-vsync-excess",
      "pointer-append-p95",
      "pointer-append-p99",
      "long-task-stall",
    ]));
    expect(new Set(result.findings.filter((finding) => finding.level === "warning")
      .map((finding) => finding.code))).toEqual(new Set([
      "pointerup-main-tail",
      "slow-settle",
    ]));
  });

  it("accepts exact hard boundaries and rejects absolute pointerup/settle overruns", () => {
    const boundary = evaluateStudioBrushFrameBudget(healthy({
      firstPixelMs: 24.67,
      moveToFrameLatenciesMs: Array.from({ length: 100 }, (_, index) => (
        index === 99 ? 33.37 : 16
      )),
      pointerAppendDurationsMs: Array.from({ length: 100 }, (_, index) => (
        index < 95 ? 8 : 16.7
      )),
      expectedPointerMoves: 100,
      observedPointerMoves: 100,
      pointerUpMainThreadMs: 16,
      settleMs: 16,
    }));
    expect(boundary.ok).toBe(true);
    expect(boundary.findings).toEqual([]);

    const absolute = evaluateStudioBrushFrameBudget(healthy({
      pointerUpMainThreadMs: 50.01,
      settleMs: 50.01,
    }));
    expect(absolute.ok).toBe(false);
    expect(new Set(absolute.findings.map((finding) => finding.code))).toEqual(new Set([
      "pointerup-main-stall",
      "settle-stall",
    ]));
  });

  it("fails missing pixels, profiles, exact delivery, and blank frames", () => {
    const result = evaluateStudioBrushFrameBudget(healthy({
      firstPixelMs: null,
      firstPixelChangedPixels: 0,
      firstPixelMaxChannelDelta: 0,
      firstPixelTimedOut: true,
      moveFrameIntervalsMs: [16],
      moveToFrameLatenciesMs: [],
      expectedPointerMoves: 72,
      observedPointerMoves: 71,
      pointerAppendDurationsMs: [],
      pointerUpMainThreadMs: null,
      blankFrameObservationCount: 0,
      blankFrameCount: 1,
      compositorCanvasCount: 0,
      longTaskObserverAvailable: false,
      settleTimedOut: true,
    }));
    expect(result.ok).toBe(false);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "first-pixel-missing",
      "compositor-surface-missing",
      "continuous-profile-missing",
      "pointer-delivery-loss",
      "pointer-append-profile-missing",
      "blank-frame-profile-missing",
      "long-task-profile-missing",
      "pointerup-main-profile-missing",
      "settle-timeout",
    ]));
  });

  it("summarizes append and compositor tails without counting malformed values", () => {
    const summary = summarizeStudioBrushFrameBudget(healthy({
      moveFrameIntervalsMs: [16, Number.NaN, -1, 32],
      moveToFrameLatenciesMs: [5, Number.POSITIVE_INFINITY, 15],
      pointerAppendDurationsMs: [2, Number.NaN, -1, 7],
      expectedPointerMoves: 100,
      observedPointerMoves: 80,
      longTaskDurationsMs: [52, Number.NaN, 81],
    }));
    expect(summary.moveFrameSampleCount).toBe(2);
    expect(summary.moveFrameP95Ms).toBe(32);
    expect(summary.moveToFrameP95Ms).toBe(15);
    expect(summary.pointerAppendP95Ms).toBe(7);
    expect(summary.inputDeliveryRatio).toBe(0.8);
    expect(summary.inputDeliveryExact).toBe(false);
    expect(summary.longTaskCount).toBe(2);
    expect(summary.longestLongTaskMs).toBe(81);
  });

  it("requires every exact workload/rate/DPR/provider/resource case once", () => {
    const complete = competitiveCoverage();
    const accepted = evaluateStudioBrushCompetitiveCoverage(complete);
    expect(accepted.ok).toBe(true);
    expect(accepted.expectedCaseCount).toBe(272);
    expect(accepted.observedCaseCount).toBe(272);

    const malformed = complete.slice(1);
    malformed.push({
      ...complete[1]!,
      observedInputSamples: complete[1]!.observedInputSamples - 1,
      actualDeviceScaleFactor: 3,
      observedProviderRoute: null,
      routeDiagnostics: null,
      hardAcceptanceOk: false,
    });
    const rejected = evaluateStudioBrushCompetitiveCoverage(malformed);
    expect(rejected.ok).toBe(false);
    expect(rejected.missingCases).toHaveLength(1);
    expect(rejected.invalidCases).toEqual(expect.arrayContaining([
      expect.stringContaining(":input-samples"),
      expect.stringContaining(":viewport-or-dpr"),
      expect.stringContaining(":provider-route"),
      expect.stringContaining(":route-diagnostics-missing"),
      expect.stringContaining(":hard-acceptance"),
    ]));
  });

  it("rejects ACK retention, prefix replay, and degraded stroke-budget receipts", () => {
    const complete = competitiveCoverage();
    const target = complete[0]!;
    complete[0] = {
      ...target,
      routeDiagnostics: {
        ...target.routeDiagnostics!,
        afterAckRafCount: 3,
        afterAckTransientBytes: 1,
        dryCommittedContourVisitCount: 2_001,
        committedDrawStatus: "fallback",
        committedDrawAcknowledged: false,
        strokeBudgetReceipt: {
          ...target.routeDiagnostics!.strokeBudgetReceipt!,
          accepted: {
            ...target.routeDiagnostics!.strokeBudgetReceipt!.accepted,
            sourceCount: 999,
          },
          firstDegradedDab: 900,
        },
      },
    };
    const result = evaluateStudioBrushCompetitiveCoverage(complete);
    expect(result.ok).toBe(false);
    expect(result.invalidCases).toEqual(expect.arrayContaining([
      expect.stringContaining(":ack-transient-retention"),
      expect.stringContaining(":committed-draw-receipt"),
      expect.stringContaining(":dry-contour-prefix-replay"),
      expect.stringContaining(":stroke-budget-degraded"),
    ]));
  });

  it("rejects superlinear history snapshots, cache growth, and parity drift", () => {
    expect(evaluateStudioBrushCompetitiveLongSession(longSessionEvidence()).ok).toBe(true);
    const rejected = longSessionEvidence();
    rejected[2] = {
      ...rejected[2]!,
      historyRetainedReferenceCount: 32_000_000,
      rendererPlanCacheCount: 40,
      rendererPlanCacheBytes: 100_000_000,
      undoPixelDiffCount: 1,
      reopenPixelDiffCount: 2,
    };
    const result = evaluateStudioBrushCompetitiveLongSession(rejected);
    expect(result.ok).toBe(false);
    expect(result.invalidCases).toEqual(expect.arrayContaining([
      "8000:history-superlinear",
      "8000:undo-pixel-parity",
      "8000:reopen-pixel-parity",
      "cache-plateau",
    ]));
  });
});
