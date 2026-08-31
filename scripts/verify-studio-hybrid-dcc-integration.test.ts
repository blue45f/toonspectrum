import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION,
  countStudioHybridDccFreshOpfsFiles,
  normalizeStudioHybridDccHeadlessGpuDiagnostics,
  type StudioHybridDccIntegrationResult,
  validateStudioHybridDccIntegrationResult,
} from "./verify-studio-hybrid-dcc-integration.mts";

const ASSET_ID = "unit-cube-1";
const SOURCE_HASH = `sha256:${"a".repeat(64)}`;
const FILE_HASH = `sha256:${"b".repeat(64)}` as const;
const BASELINE_FILE_HASH = `sha256:${"c".repeat(64)}` as const;
const WORKSPACE_STATE_HASH = `sha256:${"d".repeat(64)}`;
const INITIAL_TRANSFORM = {
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: [1, 1, 1],
} as const;
const TARGET_TRANSFORM = {
  position: [2.25, 0, 0],
  rotationDeg: [0, 30, 0],
  scale: [1, 1, 1.5],
} as const;
const UNDONE_TRANSFORM = {
  ...TARGET_TRANSFORM,
  scale: [1, 1, 1],
} as const;
const OPFS_FILE = {
  path: "toonspectrum-hybrid-dcc-v1/dcc-workspaces/document/cp-1-e1-c0.bin",
  byteLength: 8_192,
  sha256: FILE_HASH,
} as const;
const OPFS_BASELINE_FILE = {
  ...OPFS_FILE,
  sha256: BASELINE_FILE_HASH,
} as const;

function successfulResult(): StudioHybridDccIntegrationResult {
  return {
    status: "ok",
    schemaVersion: STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION,
    execution: "vite-production-preview-shipped-studio-ui",
    route: "/studio",
    blank: {
      studioEditorVisible: true,
      nativeLayerCount: 0,
      entrySelector: '[data-studio-hybrid-dcc-open="true"]',
      entryVisible: true,
      dialogVisible: true,
      initialAssetCount: 0,
      initialActiveAssetId: "none",
      blankViewportVisible: true,
      screenshot: "/tmp/01-blank-hybrid-dcc.png",
    },
    selection: {
      assetId: ASSET_ID,
      assetCount: 1,
      outlinerIdentityVisible: true,
      viewportVisible: true,
      webglContextLost: false,
      objectSelectionMode: "object",
      objectSelectionSummary: "오브젝트 편집",
      componentSelectionMode: "face",
      componentSelectedElementCount: 1,
      componentSelectionSummary: "면 1개 선택",
      trustedCanvasPointerAttempts: 1,
      screenshot: "/tmp/02-component-selection.png",
    },
    trsHistory: {
      assetId: ASSET_ID,
      before: INITIAL_TRANSFORM,
      edited: TARGET_TRANSFORM,
      afterOneUndo: UNDONE_TRANSFORM,
      afterOneRedo: TARGET_TRANSFORM,
      undoEnabled: true,
      redoEnabledAfterUndo: true,
      stableIdThroughHistory: true,
      screenshot: "/tmp/03-trs-redo-saved.png",
    },
    persistence: {
      opfsGetDirectoryAvailable: true,
      webLocksAvailable: true,
      redoBaselineSequence: 6,
      redoPersistedSequence: 7,
      redoReceiptSourceHash: FILE_HASH,
      redoReceiptDocumentStateHash: WORKSPACE_STATE_HASH,
      redoWorkspaceStateHash: WORKSPACE_STATE_HASH,
      filesBeforeRedo: [OPFS_BASELINE_FILE],
      freshRedoFileCount: 1,
      statusBeforeReload: "saved",
      filesBeforeReload: [OPFS_FILE],
      totalBytesBeforeReload: OPFS_FILE.byteLength,
      pageReloadObserved: true,
      navigationType: "reload",
      recoveryStatus: "saved",
      recoveredAssetId: ASSET_ID,
      recoveredTransform: TARGET_TRANSFORM,
      filesAfterReload: [OPFS_FILE],
      unchangedDurableFileCount: 1,
      screenshot: "/tmp/04-reloaded-recovered.png",
    },
    workerExport: {
      requestCount: 1,
      responseCount: 1,
      workerErrorCount: 0,
      terminationCount: 1,
      request: {
        constructorIndex: 0,
        workerUrl: "http://127.0.0.1:5173/assets/studio-hybrid-dcc-glb-export.worker-abcd.js",
        workerName: "studio-hybrid-dcc-glb-export",
        version: 2,
        kind: "export-batch",
        requestId: 1,
        inputTransport: "transferable-packed-soa-v1",
        maxResponseBytes: 100 * 1024 * 1024,
        transferCount: 1,
        payloads: [{
          assetId: ASSET_ID,
          sourceRevision: 1,
          sourceHash: SOURCE_HASH,
          packedByteLength: 4_096,
        }],
      },
      response: {
        constructorIndex: 0,
        version: 2,
        kind: "result",
        requestId: 1,
        code: null,
        totalByteLength: 1_024,
        items: [{
          ok: true,
          byteLength: 1_024,
          magic: 0x46546c67,
          version: 2,
          declaredLength: 1_024,
          fileName: `${ASSET_ID}.glb`,
          mimeType: "model/gltf-binary",
          reportStatus: "exported",
          errorCount: 0,
          lossCount: 0,
          warningCount: 0,
          issueCount: 0,
          maxIssueIdListLength: 0,
          metricsGlbByteLength: 1_024,
          metricsTriangleCount: 12,
          metricsVertexCount: 8,
          sourceAssetId: ASSET_ID,
          sourceRevision: 1,
          sourceHash: SOURCE_HASH,
        }],
      },
    },
    bg3d: {
      handoffButtonVisible: true,
      dialogVisible: true,
      sourceAssetIdentityVisible: true,
      sourceAssetId: ASSET_ID,
      hybridDccReopened: true,
      reopenedAssetId: ASSET_ID,
      reopenedTransform: TARGET_TRANSFORM,
      renderedFraming: {
        width: 960,
        height: 540,
        subjectPixelCount: 64_800,
        subjectPixelRatio: 0.125,
        bounds: { left: 280, top: 110, right: 679, bottom: 449 },
        minimumEdgeMarginRatio: 90 / 540,
        fullyInsideViewport: true,
      },
      screenshotHandoff: "/tmp/05-bg3d-handoff.png",
      screenshotReopened: "/tmp/06-hybrid-dcc-reopened.png",
    },
    diagnostics: {
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    },
    blocker: null,
    issues: [],
    evidenceDirectory: "/tmp/toonspectrum-studio-hybrid-dcc-integration",
  };
}

describe("Studio Hybrid DCC production-preview integration evidence", () => {
  it("establishes an authoritative guest session before entering the user-scoped recovery gate", () => {
    const source = readFileSync(
      new URL("./verify-studio-hybrid-dcc-integration.mts", import.meta.url),
      "utf8",
    );
    const installIndex = source.indexOf("await installStudioGuestSessionBoundary(page)");
    const monitorIndex = source.indexOf("await installStudioStateAndWorkerMonitor(page)");
    const runIndex = source.indexOf("await runVerticalSlice(page, studioUrl, evidence)");

    expect(source).toContain('page.route("**/api/auth/session"');
    expect(source).toContain('status: 200');
    expect(source).toContain('contentType: "application/json; charset=utf-8"');
    expect(source).toContain('body: JSON.stringify({ authenticated: false, user: null })');
    expect(source).toContain("const componentQueue = new Int32Array(totalPixels)");
    expect(source).toContain("if (componentCount <= subjectPixelCount) continue");
    expect(installIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(monitorIndex);
    expect(monitorIndex).toBeLessThan(runIndex);
  });

  it("accepts the complete shipped-UI, OPFS reload, GLB Worker, BG3D, and reopen proof", () => {
    expect(validateStudioHybridDccIntegrationResult(successfulResult())).toEqual([]);
  });

  it("classifies an unavailable UI boundary as blocked and still fails closed", () => {
    const result: StudioHybridDccIntegrationResult = {
      ...successfulResult(),
      status: "blocked",
      blocker: {
        boundary: "component-selection-ray-hit",
        message: "No component selection was visible after trusted canvas input",
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toEqual(expect.arrayContaining([
      "integration run did not report ok",
      "blocked UI boundary: component-selection-ray-hit",
    ]));
  });

  it("rejects a nonblank workspace or mode-only component evidence without a ray-hit selection", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      blank: { ...base.blank!, nativeLayerCount: 1, initialAssetCount: 1 },
      selection: {
        ...base.selection!,
        componentSelectedElementCount: 0,
        componentSelectionSummary: "면 0개 선택",
        trustedCanvasPointerAttempts: 0,
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toEqual(expect.arrayContaining([
      "scenario did not enter blank Studio and open Hybrid DCC through shipped UI",
      "primitive identity and visible object/face selection were not proven by UI input",
    ]));
  });

  it("rejects partial TRS editing, two-step history, or unstable object identity", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      trsHistory: {
        ...base.trsHistory!,
        edited: { ...TARGET_TRANSFORM, rotationDeg: [0, 0, 0] },
        afterOneUndo: INITIAL_TRANSFORM,
        stableIdThroughHistory: false,
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "numeric TRS edit and exactly one Undo/Redo did not preserve object identity",
    );
  });

  it("rejects browser-storage fallback, missing real reload, or changed OPFS receipts", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      persistence: {
        ...base.persistence!,
        opfsGetDirectoryAvailable: false,
        statusBeforeReload: "session-only",
        pageReloadObserved: false,
        navigationType: "navigate",
        filesAfterReload: [{ ...OPFS_FILE, sha256: `sha256:${"c".repeat(64)}` }],
        unchangedDurableFileCount: 0,
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "OPFS autosave did not survive an actual page reload with stable ID and TRS",
    );
  });

  it("rejects a saved badge without a newer Redo receipt, matching document hash, and OPFS file", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      persistence: {
        ...base.persistence!,
        redoPersistedSequence: base.persistence!.redoBaselineSequence,
        redoReceiptDocumentStateHash: "stale-undo-hash",
        filesBeforeReload: [OPFS_BASELINE_FILE],
        freshRedoFileCount: 0,
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "OPFS autosave did not survive an actual page reload with stable ID and TRS",
    );
  });

  it("fails closed on missing, malformed, or duplicate OPFS file arrays", () => {
    const base = successfulResult();
    const cases = [
      {
        ...base.persistence!,
        filesBeforeRedo: undefined,
      },
      {
        ...base.persistence!,
        filesBeforeRedo: [{ ...OPFS_BASELINE_FILE, sha256: "not-a-sha256" }],
      },
      {
        ...base.persistence!,
        filesBeforeReload: [OPFS_FILE, OPFS_FILE],
        filesAfterReload: [OPFS_FILE, OPFS_FILE],
        totalBytesBeforeReload: OPFS_FILE.byteLength * 2,
        unchangedDurableFileCount: 2,
      },
    ];

    for (const persistence of cases) {
      expect(validateStudioHybridDccIntegrationResult({
        ...base,
        persistence,
      })).toContain(
        "OPFS autosave did not survive an actual page reload with stable ID and TRS",
      );
    }
  });

  it("counts only new or content-changed OPFS identities as a fresh durable generation", () => {
    expect(countStudioHybridDccFreshOpfsFiles([OPFS_BASELINE_FILE], [OPFS_FILE])).toBe(1);
    expect(countStudioHybridDccFreshOpfsFiles([OPFS_FILE], [OPFS_FILE])).toBe(0);
    expect(countStudioHybridDccFreshOpfsFiles([], [OPFS_FILE])).toBe(1);
  });

  it("rejects a sync/fake export, malformed GLB, or over-budget diagnostics", () => {
    const base = successfulResult();
    const request = base.workerExport!.request!;
    const response = base.workerExport!.response!;
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      workerExport: {
        ...base.workerExport!,
        terminationCount: 0,
        request: { ...request, transferCount: 0, maxResponseBytes: 1 },
        response: {
          ...response,
          totalByteLength: 8,
          items: [{
            ...response.items[0]!,
            byteLength: 8,
            magic: 0,
            declaredLength: 99,
            issueCount: 4_097,
            maxIssueIdListLength: 1_025,
          }],
        },
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "shipped BG3D handoff did not prove a bounded nonempty GLB Worker response",
    );
  });

  it("rejects a BG3D label or Hybrid DCC reopen identity mismatch", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      bg3d: {
        ...base.bg3d!,
        sourceAssetIdentityVisible: false,
        reopenedAssetId: "replacement-cube",
        reopenedTransform: INITIAL_TRANSFORM,
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "BG3D did not visibly frame the asset or DCC reopen changed stable identity/TRS",
    );
  });

  it("rejects a handed-off subject that touches the WebGL viewport edge", () => {
    const baseline = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...baseline,
      bg3d: baseline.bg3d ? {
        ...baseline.bg3d,
        renderedFraming: {
          ...baseline.bg3d.renderedFraming,
          bounds: { left: 0, top: 0, right: 959, bottom: 539 },
          minimumEdgeMarginRatio: 0,
          fullyInsideViewport: false,
        },
      } : null,
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toContain(
      "BG3D did not visibly frame the asset or DCC reopen changed stable identity/TRS",
    );
  });

  it("rejects every console, page, request, and 5xx diagnostic channel", () => {
    const base = successfulResult();
    const result: StudioHybridDccIntegrationResult = {
      ...base,
      diagnostics: {
        consoleErrors: ["unexpected console error"],
        consoleWarnings: ["unexpected console warning"],
        pageErrors: ["unhandled rejection"],
        requestFailures: ["GET /asset.js net::ERR_FAILED"],
        fiveHundredResponses: ["500 /api/unexpected"],
      },
    };
    expect(validateStudioHybridDccIntegrationResult(result)).toEqual(expect.arrayContaining([
      "browser diagnostics contain consoleErrors",
      "browser diagnostics contain consoleWarnings",
      "browser diagnostics contain pageErrors",
      "browser diagnostics contain requestFailures",
      "browser diagnostics contain fiveHundredResponses",
    ]));
  });

  it("allows only exact headless GPU warnings after the complete product path succeeds", () => {
    const studioUrl = "http://127.0.0.1:5199/studio";
    const diagnostics = normalizeStudioHybridDccHeadlessGpuDiagnostics({
      consoleErrors: [],
      consoleWarnings: [
        "[.WebGL-0x12c001c1500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels @ http://127.0.0.1:5199/studio",
        "No available adapters. @ http://127.0.0.1:5199/studio",
        "No available adapters. @ http://127.0.0.1:5199/studio?room=work-instant-test",
        "[.WebGL-0x12c001c1500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (this message will no longer repeat) @ http://127.0.0.1:5199/studio/3d/dcc/model?room=work-instant-test",
      ],
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    }, studioUrl, true);
    expect(diagnostics.consoleWarnings).toEqual([]);
  });

  it("does not allow headless warnings before success or when message/source semantics differ", () => {
    const studioUrl = "http://127.0.0.1:5199/studio";
    const exactWarnings = [
      "[.WebGL-0x12c001c1500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels @ http://127.0.0.1:5199/studio",
      "No available adapters. @ http://127.0.0.1:5199/studio",
    ];
    expect(normalizeStudioHybridDccHeadlessGpuDiagnostics({
      consoleErrors: [],
      consoleWarnings: exactWarnings,
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    }, studioUrl, false).consoleWarnings).toEqual(exactWarnings);

    const unexpected = [
      "WebGPU validation failed: No available adapters. @ http://127.0.0.1:5199/studio",
      "[.WebGL-0x12c001c1500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels @ http://127.0.0.1:5199/admin",
      "[.WebGL-0x12c001c1500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to TextureUpload @ http://127.0.0.1:5199/studio",
      "No available adapters. @ http://127.0.0.1:5200/studio/3d/dcc/model?room=work-instant-test",
    ];
    expect(normalizeStudioHybridDccHeadlessGpuDiagnostics({
      consoleErrors: [],
      consoleWarnings: unexpected,
      pageErrors: [],
      requestFailures: [],
      fiveHundredResponses: [],
    }, studioUrl, true).consoleWarnings).toEqual(unexpected);
  });

  it("drives the real /studio UI and observes Worker/OPFS without importing product internals", () => {
    const source = readFileSync(
      new URL("./verify-studio-hybrid-dcc-integration.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("vite-production-preview-shipped-studio-ui");
    expect(source).toContain("const studioUrl = `${origin}studio`");
    expect(source).toContain('name: "프로젝트 작업"');
    expect(source).toContain("[data-studio-project-actions-menu=\"true\"]");
    expect(source).toContain("[data-studio-hybrid-dcc-open=\"true\"]");
    expect(source).toContain('name: /^큐브 추가/u');
    expect(source).toContain('name: "면 선택 모드 (3)"');
    expect(source).toContain("page.mouse.click(");
    expect(source).toContain('commitTransformField(page, panel, "위치 X"');
    expect(source).toContain('commitTransformField(page, panel, "회전 Y"');
    expect(source).toContain('commitTransformField(page, panel, "크기 Z"');
    expect(source).toContain('name: "마지막 3D 편집 되돌리기"');
    expect(source).toContain('name: "되돌린 3D 편집 다시 실행"');
    expect(source).toContain('page.reload({ waitUntil: "domcontentloaded"');
    expect(source).toContain("navigator.storage?.getDirectory");
    expect(source).toContain("new Proxy(nativeWorker");
    expect(source).toContain('value.kind === "export-batch"');
    expect(source).toContain('name: /^3D 배경·컷 편집기로 열기/u');
    expect(source).toContain('page.getByTestId("studio-bg3d-dialog")');
    expect(source).toContain('canvas[aria-label="편집 메시 3D 렌더"], canvas[data-engine^="three.js"]');
    expect(source).not.toContain(".isVisible({ timeout:");
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toContain("page.evaluate(() => import(");
    expect(source).not.toMatch(/(?:pnpm|npm|yarn)[^\n]*\bbuild\b/u);
  });

  it("preselects one explicit BG3D backend before inspecting the handed-off layer", () => {
    const source = readFileSync(
      new URL("./verify-studio-hybrid-dcc-integration.mts", import.meta.url),
      "utf8",
    );
    const viewTabIndex = source.indexOf('const viewTab = bg3dDialog.getByRole("tab"');
    const selectionIndex = source.indexOf(
      'getByTestId("studio-bg3d-engine-preference-webgl2")',
      viewTabIndex,
    );
    const activeIndex = source.indexOf(
      '[data-testid="studio-bg3d-engine-active-backend"]',
      selectionIndex,
    );
    const canvasIndex = source.indexOf(
      'getByTestId("studio-bg3d-viewport").locator("canvas")',
      activeIndex,
    );
    const layersIndex = source.indexOf("const layersTab =", canvasIndex);
    const identityIndex = source.indexOf(
      'getByRole("button", { name: assetId, exact: true })',
      layersIndex,
    );

    expect(viewTabIndex).toBeGreaterThan(-1);
    expect(selectionIndex).toBeGreaterThan(viewTabIndex);
    expect(source).toContain("await webgl2.click();");
    expect(source).not.toContain("if (await webgl2");
    expect(activeIndex).toBeGreaterThan(selectionIndex);
    expect(canvasIndex).toBeGreaterThan(activeIndex);
    expect(layersIndex).toBeGreaterThan(canvasIndex);
    expect(identityIndex).toBeGreaterThan(layersIndex);
  });

  it("anchors a durable receipt and OPFS signature before Redo, then requires a matching generation", () => {
    const source = readFileSync(
      new URL("./verify-studio-hybrid-dcc-integration.mts", import.meta.url),
      "utf8",
    );
    const anchorIndex = source.indexOf(
      "const redoPersistenceAnchor = await readPersistenceAnchor(page, panel)",
    );
    const redoIndex = source.indexOf("await redo.click()", anchorIndex);
    const persistenceIndex = source.indexOf(
      "const redoPersistence = await waitForFreshSavedPersistence(",
      redoIndex,
    );

    expect(anchorIndex).toBeGreaterThan(-1);
    expect(redoIndex).toBeGreaterThan(anchorIndex);
    expect(persistenceIndex).toBeGreaterThan(redoIndex);
    expect(source).toContain("sequence > baselineSequence");
    expect(source).toContain("=== expectedHash");
    expect(source).not.toContain('[data-studio-hybrid-dcc-persistence="saving"]');
  });
});
