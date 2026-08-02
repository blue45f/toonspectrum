import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
  validateStudioHokusaiLiveIntegrationResult,
  type StudioHokusaiLiveFamilyIntegrationEvidence,
  type StudioHokusaiLiveIntegrationResult,
} from "./verify-studio-hokusai-live-integration.mts";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;

function family(
  presetId: "pencil" | "charcoal" | "oil",
  brushName: "연필" | "목탄" | "유화 붓",
): StudioHokusaiLiveFamilyIntegrationEvidence {
  return {
    brushId: presetId,
    brushName,
    presetId,
    blankNativePageElementCount: 0,
    workerBeginCount: 1,
    liveFrameCount: 3,
    blankFrameCount: 0,
    firstLiveFrame: {
      strokeId: `stroke-${presetId}`,
      phase: "live",
      sequence: 1,
      pixelHash: HASH_A,
      pixelBytes: 8_192,
      nonZeroAlphaPixels: 600,
      blank: false,
    },
    workerCompleteCount: 1,
    completeReceipt: {
      strokeId: `stroke-${presetId}`,
      presetId,
      sampleCount: 19,
      finalSequence: 4,
      inputHash: HASH_B,
      lastLivePixelHash: HASH_A,
      settledPixelHash: HASH_A,
      pngHash: HASH_C,
      exactLiveCommitParity: true,
      materialTexture: "studio-hokusai-material-texture-v2",
      endpointPolicy: "tapered-start-no-dab-carrier-v1",
      colorOpacityApplication: "worker-once-before-material-transfer-v1",
      quality: {
        nonZeroPixels: 2_000,
        alphaMean: presetId === "charcoal" ? 0.4 : 0.55,
        alphaStandardDeviation:
          presetId === "pencil" ? 42 : presetId === "charcoal" ? 52 : 64,
        edgeDensity:
          presetId === "pencil" ? 0.42 : presetId === "charcoal" ? 0.21 : 0.33,
        neighbourDifference:
          presetId === "pencil" ? 13 : presetId === "charcoal" ? 7 : 10,
        periodicity: 0.12,
        circleCarrierExposure: 0.1,
        startBackMassRatio: 0.04,
        centerlineGapsAfterStart: 0,
        horizontalVariation: 8,
        verticalVariation: presetId === "oil" ? 12 : 10,
        directionalAnisotropy: presetId === "oil" ? 1.5 : 1.25,
      },
      complete: true,
    },
    trustedPointerSampleCount: 17,
    canonicalSourceId: `stroke-${presetId}`,
    canonicalImageId: `image-${presetId}`,
    canonicalPairElementCount: 2,
    hiddenDrawCount: 1,
    canonicalReceiptCount: 1,
    provisionalVisibleDrawCount: 0,
    receiptSourceMatched: true,
    receiptPresetMatched: true,
    receiptWorkerHashMatched: true,
    undoLayerCount: 0,
    redoLayerCount: 2,
    reloadLayerCount: 2,
    redoReceiptPreserved: true,
    reloadReceiptPreserved: true,
    screenshotLive: `/tmp/${presetId}-live.png`,
    screenshotCommitted: `/tmp/${presetId}-committed.png`,
    screenshotReloaded: `/tmp/${presetId}-reloaded.png`,
  };
}

function successfulResult(): StudioHokusaiLiveIntegrationResult {
  return {
    status: "ok",
    schemaVersion: STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
    execution: "vite-production-preview-shipped-studio-direct-pointer",
    families: [
      family("pencil", "연필"),
      family("charcoal", "목탄"),
      family("oil", "유화 붓"),
    ],
    fallback: {
      mode: "canvas-horizontal-flip",
      blankNativePageElementCount: 0,
      hokusaiBeginDelta: 0,
      hokusaiFrameDelta: 0,
      hokusaiCompleteDelta: 0,
      trustedPointerSampleCount: 17,
      persistedVectorPointCount: 18,
      lostInputSamples: 0,
      persistedVectorPathDistance: 612,
      persistedElementCount: 1,
      visibleDrawCount: 1,
      canonicalReceiptCount: 0,
      undoLayerCount: 0,
      screenshot: "/tmp/fallback.png",
    },
    diagnostics: {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    },
    issues: [],
    evidenceDirectory: "/tmp/hokusai-live-integration",
  };
}

describe("Studio Hokusai production-preview integration evidence", () => {
  it("accepts complete real-pointer, Worker, canonical-pair, history, and reload evidence", () => {
    expect(validateStudioHokusaiLiveIntegrationResult(successfulResult())).toEqual([]);
  });

  it("rejects a blank first live frame, missing pointer samples, or provisional vector duplicate", () => {
    const result = successfulResult();
    const pencil = result.families[0]!;
    result.families[0] = {
      ...pencil,
      blankFrameCount: 1,
      firstLiveFrame: {
        ...pencil.firstLiveFrame!,
        nonZeroAlphaPixels: 0,
        blank: true,
      },
      completeReceipt: {
        ...pencil.completeReceipt!,
        sampleCount: pencil.trustedPointerSampleCount - 1,
      },
      provisionalVisibleDrawCount: 1,
    };
    const issues = validateStudioHokusaiLiveIntegrationResult(result);
    expect(issues).toContain("pencil: live frames are missing or include a blank frame");
    expect(issues).toContain("pencil: first live overlay frame lacks visible receipted pixels");
    expect(issues).toContain("pencil: canonical Worker receipt is incomplete or lost pointer samples");
    expect(issues).toContain(
      "pencil: pointerup did not yield exactly one hidden DrawEl/canonical ImageEl pair",
    );
  });

  it("rejects split history or a receipt that changes across Redo/save-reload", () => {
    const result = successfulResult();
    result.families[1] = {
      ...result.families[1]!,
      undoLayerCount: 1,
      redoReceiptPreserved: false,
      reloadReceiptPreserved: false,
    };
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toContain(
      "charcoal: one-step Undo/Redo or save-reload receipt preservation failed",
    );
  });

  it("rejects a fallback that enters Hokusai or loses any trusted vector input sample", () => {
    const result = successfulResult();
    result.fallback = {
      ...result.fallback!,
      hokusaiBeginDelta: 1,
      persistedVectorPointCount: 12,
      lostInputSamples: 5,
    };
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toContain(
      "flipped-view fallback lost vector input or incorrectly entered Hokusai",
    );
  });

  it("rejects smooth, faint, periodic, bulb-ended, or indistinguishable product pixels", () => {
    const result = successfulResult();
    const pencil = result.families[0]!;
    result.families[0] = {
      ...pencil,
      completeReceipt: {
        ...pencil.completeReceipt!,
        quality: {
          ...pencil.completeReceipt!.quality!,
          alphaMean: 0.04,
          alphaStandardDeviation: 2,
          edgeDensity: 0.01,
          neighbourDifference: 0.4,
          periodicity: 0.9,
          circleCarrierExposure: 0.7,
          startBackMassRatio: 0.8,
          centerlineGapsAfterStart: 4,
          directionalAnisotropy: 1,
        },
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toEqual(expect.arrayContaining([
      "pencil: actual canonical pixels failed material quality gates",
    ]));
  });

  it("rejects three nominally passing families when their texture fingerprints collapse", () => {
    const result = successfulResult();
    const sharedQuality = {
      ...result.families[0]!.completeReceipt!.quality!,
      edgeDensity: 0.25,
      alphaStandardDeviation: 44,
      directionalAnisotropy: 1.08,
    };
    const collapsed = result.families.map((entry) => ({
      ...entry,
      completeReceipt: {
        ...entry.completeReceipt!,
        quality: { ...sharedQuality },
      },
    }));
    result.families.splice(0, result.families.length, ...collapsed);
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toContain(
      "pencil graphite, charcoal grain, and oil bristles are not measurably separated",
    );
  });

  it("rejects browser console, request, page, and 5xx diagnostics", () => {
    const result = successfulResult();
    result.diagnostics.consoleErrors.push("unexpected console error");
    result.diagnostics.consoleWarnings.push("unexpected warning");
    result.diagnostics.pageErrors.push("unhandled rejection");
    result.diagnostics.requestFailures.push("GET /asset.js net::ERR_FAILED");
    result.diagnostics.fiveHundredResponses.push("500 /api/unexpected");
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toEqual(expect.arrayContaining([
      "browser diagnostics contain consoleErrors",
      "browser diagnostics contain consoleWarnings",
      "browser diagnostics contain pageErrors",
      "browser diagnostics contain requestFailures",
      "browser diagnostics contain fiveHundredResponses",
    ]));
  });

  it("uses shipped UI and direct pointer input without an upload, mock renderer, or implicit build", () => {
    const source = readFileSync(
      new URL("./verify-studio-hokusai-live-integration.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('page.mouse.down()');
    expect(source).toContain('page.mouse.up()');
    expect(source).toContain('new Proxy(nativeWorker');
    expect(source).toContain('const monitorBootstrap = (input: Readonly<{');
    expect(source).toContain('"var __name = function(target) { return target; };"');
    expect(source).toContain('value.type === "studio-hokusai-live/frame"');
    expect(source).toContain('value.type === "studio-hokusai-live/complete"');
    expect(source).toContain("measureQuality");
    expect(source).toContain("startBackMassRatio");
    expect(source).toContain("colorOpacityApplication");
    expect(source).toContain('[data-studio-hokusai-live-overlay="true"]');
    expect(source).toContain('[data-studio-layer-row="true"]');
    expect(source).toContain('data-studio-inspector-primary-tab="layers"');
    expect(source).toContain('page.keyboard.press("Meta+z")');
    expect(source).toContain('page.keyboard.press("Meta+Shift+z")');
    expect(source).toContain('page.reload({ waitUntil: "domcontentloaded"');
    expect(source).toContain('name: "복구하기"');
    expect(source).toContain('"preview"');
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toMatch(/(?:pnpm|npm|yarn)[^\n]*\bbuild\b/u);
    expect(source).not.toContain("page.evaluate(() => import(");
  });
});
