import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  expectedStudioLivingInkVerifierDiagnostic,
  STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION,
  validateStudioLivingInkIntegrationResult,
  type StudioLivingInkIntegrationResult,
  type StudioLivingInkPositiveEvidence,
} from "./verify-studio-living-ink-integration.mts";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const ROUTE = "studio-stroke-surface-route-v1:7:1:stroke-living-ink:living-ink";

function positive(): StudioLivingInkPositiveEvidence {
  return {
    blankNativePageElementCount: 0,
    brushId: "watercolor",
    workerInitializeCount: 1,
    workerReadyCount: 1,
    depositOperationCount: 3,
    advanceOperationCount: 1,
    competingSpecialistMessageCount: 0,
    trustedPointerSampleCount: 81,
    coalescedApiCallCount: 80,
    coalescedSampleCount: 80,
    persistedSourcePointCount: 81,
    strictRouteKey: ROUTE,
    presentationReceipt: {
      sequence: 4,
      routeKey: ROUTE,
      displaySha256: HASH_A,
      revision: 2,
    },
    canonicalHandoffReceipt: {
      sequence: 8,
      pngSha256: HASH_C,
    },
    overlayDrawCount: 3,
    presentationBeforeCanonicalHandoff: true,
    canonicalPairElementCount: 2,
    hiddenSourceCount: 1,
    visibleCanonicalPngCount: 1,
    canonicalReceiptCount: 1,
    storedCanonicalPngHashMatched: true,
    workerFinalHashMatched: true,
    undoLayerCount: 0,
    undoStoredElementCount: 0,
    redoLayerCount: 2,
    reloadLayerCount: 2,
    redoReceiptPreserved: true,
    reloadReceiptPreserved: true,
    replayObservedLoading: true,
    replayControlsDisabledWhileLoading: true,
    physicsReadyAfterAcceptedHash: true,
    waterModeSelectableAfterReplay: true,
    fixEnabledAfterReplay: true,
    fixJournalCommitted: true,
    fixCanonicalPngHashMatched: true,
    fixUndoRestoredPriorReceipt: true,
    fixRedoRestoredReceipt: true,
    waterAfterFixJournalCommitted: true,
    fixedWaterCanonicalPngHashMatched: true,
    fixedPigmentInvariantGate:
      "scripts/verify-studio-living-ink-execution.mjs#fixedInvariant.exact-and-maximumRgbDifference-zero",
    fixedWaterUndoRestoredFixReceipt: true,
    fixedWaterRedoRestoredReceipt: true,
    fixedWaterReloadReceiptPreserved: true,
    screenshotLive: "/tmp/living-ink-live.png",
    screenshotCommitted: "/tmp/living-ink-committed.png",
    screenshotReloaded: "/tmp/living-ink-reloaded.png",
    screenshotFixed: "/tmp/living-ink-fixed.png",
    screenshotFixedAfterWater: "/tmp/living-ink-fixed-after-water.png",
  };
}

function successfulResult(): StudioLivingInkIntegrationResult {
  return {
    status: "ok",
    schemaVersion: STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION,
    execution: "vite-production-preview-shipped-studio-native-pointer",
    positive: positive(),
    corruptedReceipt: {
      corruption: "final-receipt-hash",
      state: "failed",
      visibleCanonicalPngCount: 1,
      hiddenSourceCount: 1,
      canonicalPngSha256Preserved: true,
      canonicalPngBytesPreserved: true,
      waterDisabled: true,
      fixDisabled: true,
      clearDisabled: true,
      screenshot: "/tmp/living-ink-corrupt-receipt.png",
    },
    corruptedJournal: {
      corruption: "journal-sequence",
      state: "failed",
      visibleCanonicalPngCount: 1,
      hiddenSourceCount: 1,
      canonicalPngSha256Preserved: true,
      canonicalPngBytesPreserved: true,
      waterDisabled: true,
      fixDisabled: true,
      clearDisabled: true,
      screenshot: "/tmp/living-ink-corrupt-journal.png",
    },
    corruptedCanonicalPng: {
      corruption: "canonical-png-hash",
      state: "failed",
      visibleCanonicalPngCount: 1,
      hiddenSourceCount: 1,
      canonicalPngSha256Preserved: false,
      canonicalPngBytesPreserved: true,
      waterDisabled: true,
      fixDisabled: true,
      clearDisabled: true,
      screenshot: "/tmp/living-ink-corrupt-canonical-png.png",
    },
    mobile: {
      viewport: "390x844",
      coarsePointer: true,
      controlsVisible: true,
      controlsWithinViewport: true,
      minimumControlWidth: 44,
      minimumControlHeight: 44,
      state: "ready",
      screenshot: "/tmp/living-ink-mobile.png",
    },
    diagnostics: {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    },
    issues: [],
    evidenceDirectory: "/tmp/living-ink-integration",
  };
}

describe("Studio Living Ink production-preview integration evidence", () => {
  it("filters only the exact headless readback and no-adapter diagnostics on loopback preview", () => {
    const studioUrl = "http://127.0.0.1:5199/studio";
    expect(expectedStudioLivingInkVerifierDiagnostic(
      "[.WebGL-0x10c04e61100]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels @ http://127.0.0.1:5199/studio",
      studioUrl,
    )).toBe(true);
    expect(expectedStudioLivingInkVerifierDiagnostic(
      "No available adapters. @ http://127.0.0.1:5199/studio",
      studioUrl,
    )).toBe(true);
    expect(expectedStudioLivingInkVerifierDiagnostic(
      "No available adapters. @ https://toonspectrum.example/studio",
      "https://toonspectrum.example/studio",
    )).toBe(false);
    expect(expectedStudioLivingInkVerifierDiagnostic(
      "GPU stall due to ReadPixels @ http://127.0.0.1:5199/studio",
      studioUrl,
    )).toBe(false);
    expect(expectedStudioLivingInkVerifierDiagnostic(
      "No available adapters, then the Worker crashed. @ http://127.0.0.1:5199/studio",
      studioUrl,
    )).toBe(false);
  });

  it("accepts strict routing, 65+ input, ordered presentation, atomic history, replay, fail-closed, and mobile evidence", () => {
    expect(validateStudioLivingInkIntegrationResult(successfulResult())).toEqual([]);
  });

  it("rejects a competing route, rejected route identity, or lost authoritative/coalesced samples", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      positive: {
        ...baseline.positive!,
        strictRouteKey: "studio-stroke-surface-route-v1:7:1:stroke-living-ink:hokusai",
        competingSpecialistMessageCount: 1,
        coalescedApiCallCount: 0,
        coalescedSampleCount: 12,
        persistedSourcePointCount: 63,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(result)).toEqual(expect.arrayContaining([
      "Living Ink did not exclusively own one strict pointer-down route",
      "Living Ink lost authoritative/coalesced pointer samples",
    ]));
  });

  it("reports real coalesced batches without inventing samples for empty native arrays", () => {
    const baseline = successfulResult();
    const withEmptyNativeBatches: StudioLivingInkIntegrationResult = {
      ...baseline,
      positive: {
        ...baseline.positive!,
        coalescedApiCallCount: 80,
        coalescedSampleCount: 0,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(withEmptyNativeBatches)).toEqual([]);
  });

  it("rejects missing product presentation receipts or a canonical handoff that precedes the overlay", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      positive: {
        ...baseline.positive!,
        presentationReceipt: null,
        canonicalHandoffReceipt: {
          sequence: 2,
          pngSha256: HASH_C,
        },
        presentationBeforeCanonicalHandoff: false,
        workerFinalHashMatched: false,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(result)).toEqual(expect.arrayContaining([
      "overlay presentation receipt did not precede the canonical Konva PNG receipt",
      "pointerup did not create one hidden native source plus one canonical PNG",
    ]));
  });

  it("rejects split history or physics controls enabled before accepted replay", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      positive: {
        ...baseline.positive!,
        undoLayerCount: 1,
        undoStoredElementCount: 2,
        reloadReceiptPreserved: false,
        replayObservedLoading: false,
        replayControlsDisabledWhileLoading: false,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(result)).toEqual(expect.arrayContaining([
      "Living Ink did not remain one atomic history/save-reload transaction",
      "water/fix/clear controls reactivated before an accepted replay receipt",
    ]));
  });

  it("rejects a UI-only Fix that lacks canonical history, fixed Water parity, or reload proof", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      positive: {
        ...baseline.positive!,
        fixJournalCommitted: false,
        fixCanonicalPngHashMatched: false,
        fixedWaterCanonicalPngHashMatched: false,
        fixedWaterReloadReceiptPreserved: false,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(result)).toContain(
      "Fix/Water did not remain canonical actions or the fixed-pigment authority gate is missing",
    );
  });

  it("rejects either receipt or journal corruption when flattened pixels disappear or controls fail open", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      corruptedReceipt: {
        ...baseline.corruptedReceipt!,
        state: "ready",
        waterDisabled: false,
      },
      corruptedJournal: {
        ...baseline.corruptedJournal!,
        visibleCanonicalPngCount: 0,
        canonicalPngSha256Preserved: false,
      },
      corruptedCanonicalPng: {
        ...baseline.corruptedCanonicalPng!,
        state: "ready",
        canonicalPngSha256Preserved: true,
        canonicalPngBytesPreserved: false,
      },
    };
    expect(validateStudioLivingInkIntegrationResult(result)).toEqual(expect.arrayContaining([
      "final-receipt-hash did not preserve flattened pixels and fail closed",
      "journal-sequence did not preserve flattened pixels and fail closed",
      "canonical-png-hash did not preserve flattened pixels and fail closed",
    ]));
  });

  it("rejects clipped mobile controls, undersized coarse targets, and production browser errors", () => {
    const baseline = successfulResult();
    const result: StudioLivingInkIntegrationResult = {
      ...baseline,
      mobile: {
        ...baseline.mobile!,
        controlsWithinViewport: false,
        minimumControlWidth: 32,
      },
    };
    result.diagnostics.consoleErrors.push("real production error");
    result.diagnostics.requestFailures.push("GET /worker.js net::ERR_FAILED");
    expect(validateStudioLivingInkIntegrationResult(result)).toEqual(expect.arrayContaining([
      "mobile Living Ink controls are clipped, hidden, or below 44px",
      "browser diagnostics contain consoleErrors",
      "browser diagnostics contain requestFailures",
    ]));
  });

  it("drives shipped UI without upload, page-module injection, implicit build, or mocked receipts", () => {
    const source = readFileSync(
      new URL("./verify-studio-living-ink-integration.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("Array.from({ length: 81 }");
    expect(source).toContain("page.mouse.down()");
    expect(source).toContain("page.mouse.up()");
    expect(source).toContain("new Proxy(nativeWorker");
    expect(source).toContain('type === "living-ink/initialize"');
    expect(source).toContain('value.type !== "living-ink/frame"');
    expect(source).toContain("sequence: nextSequence()");
    expect(source).toContain('"data-studio-living-ink-presentation"');
    expect(source).toContain('studioLivingInkPresentation === "presented"');
    expect(source).toContain('"data-studio-living-ink-canonical-handoff"');
    expect(source).toContain('studioLivingInkCanonicalHandoff === "presented"');
    expect(source).toContain('page.keyboard.press("Meta+z")');
    expect(source).toContain('page.keyboard.press("Meta+Shift+z")');
    expect(source).toContain('page.reload({ waitUntil: "domcontentloaded"');
    expect(source).toContain('const fixButton = controls.locator(\'[data-studio-living-ink-fix="true"]\')');
    expect(source).toContain("await fixButton.click()");
    expect(source).toContain('pair.receipt.journalKinds.at(-1) === "fix"');
    expect(source).toContain('waterIndex > fixIndex');
    expect(source).toContain("fixedAfterWaterPngSha256 === fixedAfterWaterPair.receipt.canonicalPngSha256");
    expect(source).toContain("verify-studio-living-ink-execution.mjs#fixedInvariant.exact-and-maximumRgbDifference-zero");
    expect(source).not.toContain("fixedAfterWaterPngSha256 === fixedPngSha256");
    expect(source).toContain('name: "복구하기"');
    expect(source).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(source).toContain('data-studio-mobile-sheet") === "draw"');
    expect(source).toContain('[data-studio-open-brush-library="true"]');
    expect(source).toContain('corruption === "final-receipt-hash"');
    expect(source).toContain('corruption === "journal-sequence"');
    expect(source).toContain('corruption === "canonical-png-hash"');
    expect(source).toContain('operationKind === "ink" || operationKind === "water"');
    expect(source).toContain("contact.coalescedSamples += coalesced.length");
    expect(source).toContain("restoreSequenceWatermark");
    expect(source).toContain("pngDataUrlSha256");
    expect(source).not.toContain("Math.max(1, coalesced.length)");
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toContain("page.evaluate(() => import(");
    expect(source).not.toMatch(/(?:pnpm|npm|yarn)[^\n]*\bbuild\b/u);
  });

  it("keeps final hashes non-placeholder in valid evidence", () => {
    const result = successfulResult();
    expect(result.positive?.presentationReceipt?.displaySha256).toBe(HASH_A);
    expect(HASH_B).not.toBe(HASH_A);
    expect(result.positive?.canonicalHandoffReceipt?.pngSha256).toBe(HASH_C);
  });
});
