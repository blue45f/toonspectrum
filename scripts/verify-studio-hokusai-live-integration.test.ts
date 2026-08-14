import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
  validateStudioHokusaiLiveIntegrationResult,
  type StudioHokusaiDefaultShelfIntegrationEvidence,
  type StudioHokusaiExplicitInspectorIntegrationEvidence,
  type StudioHokusaiLiveIntegrationResult,
} from "./verify-studio-hokusai-live-integration.mts";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;

function shelfEntry(
  presetId: "pencil" | "charcoal" | "oil",
  brushName: "연필" | "목탄" | "유화 붓",
): StudioHokusaiDefaultShelfIntegrationEvidence {
  return {
    brushId: presetId,
    brushName,
    presetId,
    blankNativePageElementCount: 0,
    liveReadyCount: 0,
    liveWorkerConstructionCount: 0,
    liveBeginCount: 0,
    liveFrameCount: 0,
    liveCompleteCount: 0,
    liveFailureCount: 0,
    productReadyCount: 0,
    productWorkerConstructionCount: 0,
    productReadyProtocolValidCount: 0,
    productRenderCount: 0,
    productResultCount: 0,
    productFailureCount: 0,
    productPngDataUrlCount: 0,
    trustedPointerSampleCount: 17,
    vectorElementId: `${presetId}-vector`,
    committedElementCount: 1,
    visibleVectorCount: 1,
    undoLayerCount: 0,
    screenshot: `/tmp/${presetId}-blocked-shelf-vector.png`,
  };
}

function explicitInspector(): StudioHokusaiExplicitInspectorIntegrationEvidence {
  return {
    mode: "selected-stroke-explicit-conversion",
    presetId: "charcoal",
    materialProfileId: "charcoal",
    blankNativePageElementCount: 0,
    liveReadyCount: 0,
    liveWorkerConstructionCount: 0,
    liveBeginCount: 0,
    liveFrameCount: 0,
    liveCompleteCount: 0,
    liveFailureCount: 0,
    trustedPointerSampleCount: 17,
    sourceSelectedBeforeConversion: true,
    productReadyCount: 2,
    productWorkerConstructionCount: 2,
    productReadyProtocolValidCount: 2,
    productRenderCount: 1,
    productResultCount: 1,
    productFailureCount: 0,
    productPngDataUrlCount: 1,
    productRender: {
      version: 3,
      requestId: 1,
      engineEpoch: 1,
      sourceElementId: "source-charcoal",
      sourceRevision: `hokusai-source-v1:${"d".repeat(16)}`,
      presetId: "charcoal",
      materialProfileId: "charcoal",
      sourcePointCount: 18,
    },
    productReceipt: {
      version: 3,
      requestId: 1,
      engineEpoch: 1,
      receiptKind: "studio-hokusai/receipt",
      receiptVersion: 3,
      receiptRequestId: 1,
      receiptEngineEpoch: 1,
      sourceElementId: "source-charcoal",
      presetId: "charcoal",
      materialProfileId: "charcoal",
      inputHash: HASH_A,
      pixelHash: HASH_B,
      pngHash: HASH_C,
      adapterVersion: "0.3.0-packed-dirty-frame-adapter.3-profile-routing",
      execution: "dedicated-worker-wasm-packed-dirty-frame",
      pngByteLength: 128,
      pngSignatureValid: true,
      complete: true,
    },
    sourceElementId: "source-charcoal",
    convertedImageId: "image-charcoal",
    convertedPairElementCount: 2,
    hiddenDrawCount: 1,
    visibleImageCount: 1,
    convertedImageHasPngSource: true,
    convertedImageSelected: true,
    receiptSourceMatched: true,
    receiptPresetMatched: true,
    receiptRequestMatched: true,
    undoLayerCount: 1,
    redoLayerCount: 2,
    reloadLayerCount: 2,
    sourceRestoredByUndo: true,
    pairRestoredByRedo: true,
    pairPreservedByReload: true,
    redoSourceElementId: "source-charcoal",
    redoImageElementId: "image-charcoal",
    reloadSourceElementId: "source-charcoal",
    reloadImageElementId: "image-charcoal",
    screenshotConverted: "/tmp/explicit-inspector-01-converted.png",
    screenshotReloaded: "/tmp/explicit-inspector-02-reloaded.png",
  };
}

function successfulResult(): StudioHokusaiLiveIntegrationResult {
  return {
    status: "ok",
    schemaVersion: STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
    execution: "vite-production-preview-shipped-studio-policy-and-explicit-inspector",
    shelf: [
      shelfEntry("pencil", "연필"),
      shelfEntry("charcoal", "목탄"),
      shelfEntry("oil", "유화 붓"),
    ],
    explicitInspector: explicitInspector(),
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
  it("accepts blocked default shelves plus one explicit inspector conversion", () => {
    expect(validateStudioHokusaiLiveIntegrationResult(successfulResult())).toEqual([]);
  });

  it("rejects a normal shelf that starts Hokusai live or loses trusted vector input", () => {
    const result = successfulResult();
    result.shelf[0] = {
      ...result.shelf[0]!,
      liveReadyCount: 1,
      liveBeginCount: 1,
      visibleVectorCount: 0,
    };
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toEqual(expect.arrayContaining([
      "pencil: blocked normal shelf created Hokusai Worker traffic",
      "pencil: blocked shelf route lost vector input or failed one-step Undo",
    ]));
  });

  it("rejects silent live/product Worker construction and live failure on normal shelves", () => {
    const result = successfulResult();
    result.shelf[0] = {
      ...result.shelf[0]!,
      liveWorkerConstructionCount: 1,
    };
    result.shelf[1] = {
      ...result.shelf[1]!,
      productWorkerConstructionCount: 1,
    };
    result.shelf[2] = {
      ...result.shelf[2]!,
      liveFailureCount: 1,
    };
    expect(validateStudioHokusaiLiveIntegrationResult(result)).toEqual(expect.arrayContaining([
      "pencil: blocked normal shelf created Hokusai Worker traffic",
      "charcoal: blocked normal shelf created Hokusai Worker traffic",
      "oil: blocked normal shelf created Hokusai Worker traffic",
    ]));
  });

  it("requires the exact expected settled Worker and protocol-ready counts", () => {
    const result = successfulResult();
    const inspector = result.explicitInspector!;
    const invalid: StudioHokusaiLiveIntegrationResult = {
      ...result,
      explicitInspector: {
        ...inspector,
        productWorkerConstructionCount: 3,
        productReadyCount: 3,
        productReadyProtocolValidCount: 3,
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(invalid)).toContain(
      "explicit inspector Worker receipt is incomplete or mismatched",
    );
  });

  it("directly rejects forged receipt identity even when summary booleans claim a match", () => {
    const result = successfulResult();
    const inspector = result.explicitInspector!;
    const invalid: StudioHokusaiLiveIntegrationResult = {
      ...result,
      explicitInspector: {
        ...inspector,
        receiptSourceMatched: true,
        receiptPresetMatched: true,
        receiptRequestMatched: true,
        productReceipt: {
          ...inspector.productReceipt!,
          sourceElementId: "forged-source",
          presetId: "oil",
          materialProfileId: "oil",
          receiptRequestId: 9,
        },
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(invalid)).toContain(
      "explicit inspector Worker receipt is incomplete or mismatched",
    );
  });

  it("rejects live failure traffic and a missing actual PNG data URL/signature", () => {
    const result = successfulResult();
    const inspector = result.explicitInspector!;
    const invalid: StudioHokusaiLiveIntegrationResult = {
      ...result,
      explicitInspector: {
        ...inspector,
        liveFailureCount: 1,
        productPngDataUrlCount: 0,
        convertedImageHasPngSource: false,
        productReceipt: {
          ...inspector.productReceipt!,
          pngSignatureValid: false,
        },
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(invalid)).toEqual(expect.arrayContaining([
      "explicit settled inspector conversion incorrectly entered Hokusai live",
      "explicit inspector Worker receipt is incomplete or mismatched",
      "explicit inspector did not create one hidden source and one visible PNG image",
    ]));
  });

  it("rejects a corrupt explicit Worker receipt or an incomplete converted pair", () => {
    const result = successfulResult();
    const inspector = result.explicitInspector!;
    const invalid: StudioHokusaiLiveIntegrationResult = {
      ...result,
      explicitInspector: {
        ...inspector,
        productFailureCount: 1,
        productReceipt: {
          ...inspector.productReceipt!,
          pngHash: "not-a-hash",
        },
        visibleImageCount: 0,
        receiptSourceMatched: false,
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(invalid)).toEqual(expect.arrayContaining([
      "explicit inspector Worker receipt is incomplete or mismatched",
      "explicit inspector did not create one hidden source and one visible PNG image",
    ]));
  });

  it("rejects changed source/image identities across Redo and durable reload", () => {
    const result = successfulResult();
    const inspector = result.explicitInspector!;
    const invalid: StudioHokusaiLiveIntegrationResult = {
      ...result,
      explicitInspector: {
        ...inspector,
        pairRestoredByRedo: true,
        pairPreservedByReload: true,
        redoSourceElementId: "replacement-source",
        redoImageElementId: "replacement-image",
        reloadSourceElementId: "replacement-source",
        reloadImageElementId: "replacement-image",
      },
    };
    expect(validateStudioHokusaiLiveIntegrationResult(invalid)).toContain(
      "explicit inspector pair identity failed one-step Undo/Redo or durable reload",
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

  it("uses shipped shelf and inspector UI without an upload, hidden opt-in, or implicit build", () => {
    const source = readFileSync(
      new URL("./verify-studio-hokusai-live-integration.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('page.mouse.down()');
    expect(source).toContain('page.mouse.up()');
    expect(source).toContain('new Proxy(nativeWorker');
    expect(source).toContain('options.name === "studio-hokusai-live-brush"');
    expect(source).toContain('options.name === "studio-hokusai-natural-media"');
    expect(source).toContain('value.type === "studio-hokusai-live/begin"');
    expect(source).toContain('value.type === "studio-hokusai/render"');
    expect(source).toContain('value.type === "studio-hokusai/result"');
    expect(source).toContain('[data-studio-hokusai-natural-media="true"]');
    expect(source).toContain('[data-studio-sheet-id="props"]');
    expect(source).toContain('name: "선택 획을 자연매체로 변환"');
    expect(source).toContain('[data-studio-layer-row="true"]');
    expect(source).toContain('[data-studio-layer-selection-marker]');
    expect(source).toContain('data-studio-layer-selection-state');
    expect(source).toContain('[data-studio-rail-tool-id="select"]');
    expect(source).toContain('page.keyboard.press("Meta+z")');
    expect(source).toContain('page.keyboard.press("Meta+Shift+z")');
    expect(source).toContain('page.reload({ waitUntil: "domcontentloaded"');
    expect(source).toContain('name: "복구하기"');
    expect(source).not.toContain("waitForWorkerReady");
    expect(source).not.toContain("readStoredDocument");
    expect(source).not.toContain("waitForStoredDocument");
    expect(source).not.toContain("canonicalPair");
    expect(source).not.toContain("explicitExperimentalOptIn");
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toMatch(/(?:pnpm|npm|yarn)[^\n]*\bbuild\b/u);
    expect(source).not.toContain("page.evaluate(() => import(");
  });
});
