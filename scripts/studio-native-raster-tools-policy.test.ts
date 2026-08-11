import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS,
  studioNativeRasterMatrixViolations,
  studioNativeRasterPerformanceWarnings,
  studioNativeRasterScenarioViolations,
  type StudioNativeRasterPerformanceEvidence,
  type StudioNativeRasterScenarioEvidence,
} from "./studio-native-raster-tools-policy";

function passingPerformanceEvidence(): StudioNativeRasterPerformanceEvidence {
  return {
    policy: "report-only",
    cold: {
      measurement: "retouch-activation-preparation-and-first-replayed-stroke",
      readiness: "native-vector-before-tool-activation",
      computeSettleFence: "tool-busy-control-enabled",
      operationSettleFence: "exact-raster-src-konva-layer-draw",
      persistenceFence: "post-effect-autosave-image-signature",
      activationToPointerDownMs: 45,
      activationToEditableImageSignatureMs: 820,
      pointerUpToEditableImageSignatureMs: 690,
    },
    wall: {
      dragMs: 130,
      pointerDownToOperationSettledMs: 960,
      pointerUpToOperationSettledMs: 830,
      activationToOperationSettledMs: 1_005,
      pointerUpToBusySettledMs: 780,
      activationToBusySettledMs: 955,
    },
    operationLongTasks: {
      supported: true,
      count: 1,
      totalDurationMs: 72,
      maxDurationMs: 72,
    },
    drag: {
      pathPointCount: 5,
      moveStepsPerSegment: 6,
      configuredStepDelayMs: 4,
      expectedPointerMoveCount: 24,
      observedTrustedPointerMoveCount: 24,
      frameIntervals: {
        sampleCount: 8,
        intervalCount: 7,
        meanMs: 16.7,
        medianMs: 16.7,
        p95Ms: 18.1,
        maxMs: 18.1,
        over50MsCount: 0,
        over100MsCount: 0,
      },
      longTasks: {
        supported: true,
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: null,
      },
      reactProfiler: {
        source: "armed-studio-render-counter",
        commitCount: 0,
        actualDurationMs: null,
        editorRenderCount: 0,
        canvasRenderCount: 0,
        operationEditorRenderCount: 2,
        operationCanvasRenderCount: 2,
      },
    },
    editableImage: {
      id: "image-1",
      documentWidth: 720,
      documentHeight: 440,
      pixelWidth: 720,
      pixelHeight: 440,
    },
    completion: {
      observation: "effect-autosave-signature-after-busy-settle",
      baselineImageSignature: "",
      observedImageSignature: "32000:before",
      finalImageSignature: "34000:after",
      signatureChanged: true,
      busySettled: true,
      busyTransitionObserved: true,
      exactRasterPresentation: true,
      presentedElementId: "image-1",
    },
    warm: {
      measurement: "second-trusted-pointer-stroke",
      readiness: "editable-raster-and-tool-ready",
      computeSettleFence: "tool-busy-control-enabled",
      operationSettleFence: "exact-raster-src-konva-layer-draw",
      persistenceFence: "post-effect-autosave-image-signature",
      wall: {
        pointerDownToPointerUpMs: 124,
        pointerUpToEditableImageSignatureMs: 410,
        pointerUpToBusySettledMs: 280,
        pointerUpToOperationSettledMs: 415,
      },
      operationLongTasks: {
        supported: true,
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: null,
      },
      drag: {
        pathPointCount: 5,
        moveStepsPerSegment: 6,
        configuredStepDelayMs: 4,
        expectedPointerMoveCount: 24,
        observedTrustedPointerMoveCount: 24,
        frameIntervals: {
          sampleCount: 8,
          intervalCount: 7,
          meanMs: 16.7,
          medianMs: 16.7,
          p95Ms: 18.1,
          maxMs: 18.1,
          over50MsCount: 0,
          over100MsCount: 0,
        },
        longTasks: {
          supported: true,
          count: 0,
          totalDurationMs: 0,
          maxDurationMs: null,
        },
        reactProfiler: {
          source: "armed-studio-render-counter",
          commitCount: 0,
          actualDurationMs: null,
          editorRenderCount: 0,
          canvasRenderCount: 0,
          operationEditorRenderCount: 2,
          operationCanvasRenderCount: 2,
        },
      },
      completion: {
        observation: "effect-autosave-signature-after-busy-settle",
        baselineImageSignature: "34000:after",
        observedImageSignature: "36000:warm",
        finalImageSignature: "36000:warm",
        signatureChanged: true,
        busySettled: true,
        busyTransitionObserved: true,
        exactRasterPresentation: true,
        presentedElementId: "image-1",
        undoRestoredColdBaseline: true,
      },
    },
  };
}

function passingEvidence(
  id: StudioNativeRasterScenarioEvidence["id"] = "smudge",
): StudioNativeRasterScenarioEvidence {
  return {
    id,
    status: "passed",
    fixture: {
      usedExternalImageFixture: false,
      trustedCanvasPointerDowns: 2,
      trustedCanvasPointerMoves: 20,
      trustedCanvasPointerUps: 2,
      drawCount: 2,
      closedOutlinePointCount: 12,
      closedOutlineEndpointDistance: 0,
      internalLinePointCount: 6,
    },
    activation: { inactiveBefore: true, activeAfter: true },
    editableRaster: {
      expected: true,
      createdImage: true,
      nativeDrawCount: 2,
      hiddenNativeDrawCount: 2,
      selectedImageObserved: true,
    },
    firstGesture: {
      expected: true,
      replayed: true,
      rasterControlDiff: {
        changedPixels: 180,
        totalPixels: 20_000,
        maxChannelDelta: 80,
        meanChangedChannelDelta: 16,
      },
    },
    operationDiff: {
      changedPixels: 240,
      totalPixels: 20_000,
      maxChannelDelta: 90,
      meanChangedChannelDelta: 18,
    },
    undo: {
      attempted: true,
      restored: true,
      retainedEditableRasterWhenExpected: true,
      diffFromBefore: {
        changedPixels: 3,
        totalPixels: 20_000,
        maxChannelDelta: 3,
        meanChangedChannelDelta: 1,
      },
    },
    performance: null,
    browserErrors: [],
    failedResponses: [],
  };
}

describe("Studio native-raster browser gate policy", () => {
  it("accepts complete trusted-pointer, raster-copy, pixel-diff and Undo evidence", () => {
    expect(studioNativeRasterScenarioViolations(passingEvidence())).toEqual([]);
  });

  it("rejects imported fixtures, first-gesture loss and Undo that removes the editable copy", () => {
    const evidence = passingEvidence();
    evidence.fixture.usedExternalImageFixture = true;
    evidence.firstGesture.replayed = false;
    evidence.undo.retainedEditableRasterWhenExpected = false;

    expect(studioNativeRasterScenarioViolations(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("external/imported image"),
      expect.stringContaining("first pointer gesture"),
      expect.stringContaining("one-step Undo"),
    ]));
  });

  it("does not accept vector-to-raster conversion as cold retouch replay evidence", () => {
    const evidence = passingEvidence("smudge");
    evidence.firstGesture.replayed = true;
    evidence.firstGesture.rasterControlDiff = {
      changedPixels: 0,
      totalPixels: 20_000,
      maxChannelDelta: 0,
      meanChangedChannelDelta: 0,
    };

    expect(studioNativeRasterScenarioViolations(evidence)).toContain(
      "smudge: cold first gesture was not distinguished from raster preparation",
    );
  });

  it("requires the complete quick matrix exactly once", () => {
    const complete = STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS.map((id) => {
      const evidence = passingEvidence(id);
      if (id === "filter-whole") evidence.editableRaster.hiddenNativeDrawCount = 0;
      return evidence;
    });
    expect(studioNativeRasterMatrixViolations(complete)).toEqual([]);
    expect(studioNativeRasterMatrixViolations(complete.slice(1))).toContain(
      "matrix: missing required scenario paint-bucket",
    );
    expect(studioNativeRasterMatrixViolations([...complete, complete[0]!])).toContain(
      "matrix: duplicate scenario paint-bucket",
    );
  });

  it("distinguishes a non-destructive whole-page filter layer from destructive pixel targets", () => {
    const pageFilter = passingEvidence("filter-whole");
    pageFilter.editableRaster.hiddenNativeDrawCount = 0;
    expect(studioNativeRasterScenarioViolations(pageFilter)).toEqual([]);

    const smudge = passingEvidence("smudge");
    smudge.editableRaster.hiddenNativeDrawCount = 0;
    expect(studioNativeRasterScenarioViolations(smudge)).toContain(
      "smudge: destructive pixel target did not hide both preserved native sources",
    );
  });

  it("reports raster performance warnings without turning them into functional violations", () => {
    const evidence = passingEvidence("smudge");
    evidence.performance = passingPerformanceEvidence();
    evidence.performance.drag.frameIntervals.maxMs = 350;
    evidence.performance.drag.longTasks.maxDurationMs = 1_250;
    evidence.performance.operationLongTasks.maxDurationMs = 2_500;
    evidence.performance.wall.pointerUpToOperationSettledMs = 18_000;

    expect(studioNativeRasterPerformanceWarnings(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("rAF interval"),
      expect.stringContaining("long task"),
      expect.stringContaining("operation long task"),
      expect.stringContaining("pointerup-to-settled"),
    ]));
    expect(studioNativeRasterScenarioViolations(evidence)).toEqual([]);
  });

  it("reports the second warm stroke separately without making advisory regressions functional", () => {
    const evidence = passingEvidence("heal");
    evidence.performance = passingPerformanceEvidence();
    evidence.performance.warm.drag.frameIntervals.maxMs = 360;
    evidence.performance.warm.drag.longTasks.maxDurationMs = 1_300;
    evidence.performance.warm.operationLongTasks.maxDurationMs = 2_700;
    evidence.performance.warm.wall.pointerUpToOperationSettledMs = 19_000;
    evidence.performance.warm.drag.reactProfiler.commitCount = 60;
    evidence.performance.warm.completion.signatureChanged = false;
    evidence.performance.warm.completion.busySettled = false;
    evidence.performance.warm.completion.busyTransitionObserved = false;
    evidence.performance.warm.completion.exactRasterPresentation = false;
    evidence.performance.warm.drag.observedTrustedPointerMoveCount = 22;
    evidence.performance.warm.drag.frameIntervals.intervalCount = 0;
    evidence.performance.warm.completion.undoRestoredColdBaseline = false;

    expect(studioNativeRasterPerformanceWarnings(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("warm editable image signature"),
      expect.stringContaining("warm busy-settle"),
      expect.stringContaining("warm busy transition"),
      expect.stringContaining("warm exact raster presentation"),
      expect.stringContaining("warm trusted pointermove"),
      expect.stringContaining("warm drag rAF intervals"),
      expect.stringContaining("warm stroke Undo"),
      expect.stringContaining("warm drag max rAF interval"),
      expect.stringContaining("warm drag long task"),
      expect.stringContaining("warm pointerup operation long task"),
      expect.stringContaining("warm pointerup-to-settled"),
      expect.stringContaining("warm drag React commit count"),
    ]));
    expect(studioNativeRasterScenarioViolations(evidence)).toEqual([]);
  });

  it("keeps missing cold instrumentation advisory-only", () => {
    const evidence = passingEvidence("smudge");
    evidence.performance = passingPerformanceEvidence();
    evidence.performance.completion.busySettled = false;
    evidence.performance.completion.busyTransitionObserved = false;
    evidence.performance.completion.exactRasterPresentation = false;
    evidence.performance.drag.observedTrustedPointerMoveCount = 20;
    evidence.performance.drag.frameIntervals.intervalCount = 0;

    expect(studioNativeRasterPerformanceWarnings(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("cold busy-settle"),
      expect.stringContaining("cold busy transition"),
      expect.stringContaining("cold exact raster presentation"),
      expect.stringContaining("cold trusted pointermove"),
      expect.stringContaining("cold drag rAF intervals"),
    ]));
    expect(studioNativeRasterScenarioViolations(evidence)).toEqual([]);
  });

  it("keeps performance collection optional outside the five measured retouch scenarios", () => {
    expect(studioNativeRasterPerformanceWarnings(passingEvidence("paint-bucket"))).toEqual([]);
    expect(studioNativeRasterPerformanceWarnings(passingEvidence("smudge"))).toEqual([
      "smudge: performance observation is unavailable",
    ]);
  });

  it("keeps the production verifier native-pointer-only and on the repository Playwright runtime", () => {
    const source = readFileSync(
      new URL("./verify-studio-native-raster-tools.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('from "playwright"');
    expect(source).toContain("page.mouse.down()");
    expect(source).toContain("page.mouse.up()");
    expect(source).toContain("NATIVE_OUTLINE_DOCUMENT_POINTS");
    expect(source).toContain("NATIVE_INTERNAL_LINE_DOCUMENT_POINTS");
    expect(source).toContain("PerformanceObserver");
    expect(source).toContain('entryTypes: ["longtask"]');
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("__studioHotPathRenderCounters");
    expect(source).toContain("pointerUpToOperationSettledMs");
    expect(source).toContain("pointerUpToBusySettledMs");
    expect(source).toContain("operationLongTasks");
    expect(source).toContain("waitForRasterEffectBusyAndDurableAutosave");
    expect(source).toContain("waitForRasterOperationSettled");
    expect(source).toContain("waitForExactRasterImagePresentation");
    expect(source).toContain("readExactRasterImagePresentation");
    expect(source).toContain("__studioRasterImagePresentationProbe");
    expect(source).toContain("waitForRasterDurableAutosaveAfterOperation");
    expect(source).toContain("createStudioAutosaveOpfsSession");
    expect(source).toContain("readLatest");
    expect(source).toContain("studio-autosave-opfs-session-");
    expect(source).toContain("studio-autosave-opfs-session\\.ts");
    expect(source).toContain('url.includes("/@vite/client")');
    expect(source).toContain("__studioNativeRasterAutosaveReadError");
    expect(source).toContain("선택 후 변형");
    expect(source).toContain("markRasterOperationSettled");
    expect(source).toContain('computeSettleFence: "tool-busy-control-enabled"');
    expect(source).toContain('operationSettleFence: "exact-raster-src-konva-layer-draw"');
    expect(source).toContain('persistenceFence: "post-effect-autosave-image-signature"');
    expect(source).toContain('measurement: "retouch-activation-preparation-and-first-replayed-stroke"');
    expect(source).toContain('measurement: "heal-first-stroke-on-prepared-raster"');
    expect(source).toContain('measurement: "second-trusted-pointer-stroke"');
    expect(source).toContain("warmDocumentPath");
    expect(source).toContain("warmUndoBaselineSnapshot");
    expect(source).toContain("capturePreparedRasterOnlyControl");
    expect(source).toContain("assertEquivalentNativeFixture");
    expect(source).toContain("measured.screenshot.equals(control.screenshot)");
    expect(source).toContain("operationTimeoutMs");
    expect(source).toContain("persistenceTimeoutMs");
    expect(source).toContain("00-cold-raster-only-control.png");
    expect(source).toContain("performHealGesture");
    expect(source).toContain('page.keyboard.down("Alt")');
    expect(source).toContain("TOONSPECTRUM_NATIVE_RASTER_CANVAS_HEIGHT");
    expect(source).toContain("setCanvasHeightThroughShippedUi");
    expect(source).toContain('[data-studio-main-menu-trigger="canvas"]');
    expect(source).toContain('name: "캔버스 크기 · 문서 설정…"');
    expect(source).toContain("Open background editor · resize tool");
    expect(source).toContain('[data-studio-background-panel="true"]');
    expect(source).toContain('resizer.locator("#studio-canvas-h-input")');
    expect(source).toContain("process.env.TOONSPECTRUM_NATIVE_RASTER_CONCURRENCY ?? 1");
    expect(source).toContain("--cancellation-race=");
    expect(source).toContain("installRasterPreparationCancellationProbe");
    expect(source).toContain("__studioRasterPreparationCancellationProbe");
    expect(source).toContain("delayedSvgWorkerRequests");
    expect(source).toContain("probe.abortCalls === 1");
    expect(source).toContain("probe.retouchReplayPosts === 0");
    expect(source).toContain("finalSnapshot.imageCount === 0");
    expect(source).toContain("finalSnapshot.hiddenDrawCount === 0");
    expect(source).not.toContain("@playwright/test");
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toContain("createFixturePng");
    expect(source).not.toContain("data:image/");
    expect(source).not.toContain("_clip");
    expect(source).not.toContain("FilePayload");
  });

  it("fixes the operation fence before autosave JSON polling begins", () => {
    const source = readFileSync(
      new URL("./verify-studio-native-raster-tools.mts", import.meta.url),
      "utf8",
    );
    const operationStart = source.indexOf("async function waitForRasterOperationSettled");
    const autosaveStart = source.indexOf(
      "async function waitForRasterDurableAutosaveAfterOperation",
    );
    expect(operationStart).toBeGreaterThan(-1);
    expect(autosaveStart).toBeGreaterThan(operationStart);
    expect(source.slice(operationStart, autosaveStart)).not.toContain("readDocumentSnapshot");
    const operationSource = source.slice(operationStart, autosaveStart);
    expect(operationSource.indexOf("waitForExactRasterImagePresentation"))
      .toBeLessThan(operationSource.indexOf("markRasterOperationSettled"));
    expect(operationSource).toContain("markRasterOperationSettled(page, presentation)");
    expect(source).toMatch(
      /const operation = await waitForRasterOperationSettled[\s\S]+const snapshot = await waitForRasterDurableAutosaveAfterOperation/u,
    );
  });
});
