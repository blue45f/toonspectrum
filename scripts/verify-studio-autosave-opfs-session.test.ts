import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createStudioAutosaveOpfsBrowserHarnessSource,
  createStudioAutosaveOpfsBrowserRunPlan,
  STUDIO_AUTOSAVE_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
  type StudioAutosaveOpfsBrowserDiagnostics,
  validateStudioAutosaveOpfsBrowserResult,
} from "./verify-studio-autosave-opfs-session.mts";

const DOCUMENT_ID = `autosave-${"a".repeat(48)}`;
const DOCUMENT_KEY =
  "toonspectrum-studio-autosave:v2:browser-opfs-test-run";
const EXPECTED_LOCK = `toonspectrum-opfs-recovery:${DOCUMENT_ID}`;

function payload(savedAt: string, id: string) {
  return {
    state: "snapshot",
    savedAt,
    sequence: id === "checkpoint-stroke" ? 1 : 2,
    revision: id === "checkpoint-stroke" ? 1 : 2,
    payload: {
      version: 2,
      savedAt,
      pagesList: [{
        id: "page",
        elements: [{ id, type: "draw" }],
        canvasH: 2_000,
      }],
      currentPageId: "page",
    },
  };
}

function diagnostics(
  overrides: Partial<StudioAutosaveOpfsBrowserDiagnostics> = {},
): StudioAutosaveOpfsBrowserDiagnostics {
  return {
    browserVersion: "Chromium test",
    contentSecurityPolicy:
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    fiveHundredResponses: [],
    cspViolations: [],
    requests: [
      {
        method: "GET",
        resourceType: "document",
        url: "http://127.0.0.1:4173/",
      },
      {
        method: "GET",
        resourceType: "script",
        url: "http://127.0.0.1:4173/assets/index-abcd.js",
      },
    ],
    responses: [
      { status: 200, url: "http://127.0.0.1:4173/" },
      { status: 200, url: "http://127.0.0.1:4173/assets/index-abcd.js" },
    ],
    ...overrides,
  };
}

function successfulResult() {
  const checkpointSavedAt = "2026-07-30T00:00:00.000Z";
  const migrationSavedAt = "2026-07-30T00:00:10.000Z";
  const clearSavedAt = "2026-07-30T00:00:20.000Z";
  return {
    status: "ok",
    schemaVersion: STUDIO_AUTOSAVE_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
    execution: "focused-vite-production-build-and-preview",
    document: {
      key: DOCUMENT_KEY,
      journalDocumentId: DOCUMENT_ID,
    },
    native: {
      capabilities: {
        navigatorStorageGetDirectory: true,
        webLocksRequest: true,
      },
      getDirectoryCalls: 6,
      estimateCalls: 4,
      lockRequests: new Array(12).fill(EXPECTED_LOCK),
      expectedLockName: EXPECTED_LOCK,
      filesAfterCheckpoint: [
        `recovery-journals/${DOCUMENT_ID}/head-a.bin`,
        `recovery-journals/${DOCUMENT_ID}/manifest-a.bin`,
        `recovery-journals/${DOCUMENT_ID}/cp-1.bin`,
        `recovery-journals/${DOCUMENT_ID}/writer-lease.bin`,
      ],
      filesAfterCleanup: [],
    },
    checkpoint: {
      savedAt: checkpointSavedAt,
      receipt: {
        authority: "opfs-journal",
        savedAt: checkpointSavedAt,
        sequence: 1,
        revision: 1,
      },
      sqliteMirrorState: "snapshot",
      sqliteMirror: payload(checkpointSavedAt, "checkpoint-stroke"),
      afterReload: payload(checkpointSavedAt, "checkpoint-stroke"),
      pageReloadObserved: true,
      navigationType: "reload",
    },
    migration: {
      savedAt: migrationSavedAt,
      fallbackKind: "sqlite-fallback",
      reconciliation: {
        candidate: {
          key: DOCUMENT_KEY,
          payload: payload(
            migrationSavedAt,
            "newer-sqlite-fallback-stroke",
          ).payload,
        },
        authority: "opfs-journal",
        migratedToOpfs: true,
      },
      afterFreshSessionRead: payload(
        migrationSavedAt,
        "newer-sqlite-fallback-stroke",
      ),
    },
    clear: {
      savedAt: clearSavedAt,
      receipt: {
        authority: "opfs-journal",
        savedAt: clearSavedAt,
        sequence: 3,
        revision: 3,
      },
      afterFreshSessionRead: {
        state: "cleared",
        savedAt: clearSavedAt,
        sequence: 3,
        revision: 3,
      },
      reconciliation: {
        candidate: null,
        authority: "opfs-journal",
        migratedToOpfs: false,
      },
      stalePrimaryRemoved: true,
      staleSidecarRemoved: true,
      sqliteAfterClear: {
        state: "cleared",
        savedAt: clearSavedAt,
      },
      finalFreshSessionRead: {
        state: "cleared",
        savedAt: clearSavedAt,
        sequence: 3,
        revision: 3,
      },
    },
    cleanup: {
      opfsDocumentRemoved: true,
      sqliteRowRemoved: true,
      localStorageCleared: true,
      sessionStorageCleared: true,
    },
    securityPolicyViolations: [],
  };
}

describe("Studio autosave native OPFS production-preview verifier", () => {
  it("accepts complete checkpoint, reload, migration, tombstone, and cleanup evidence", () => {
    expect(
      validateStudioAutosaveOpfsBrowserResult(
        successfulResult(),
        diagnostics(),
        [
          "index.html",
          "assets/index-abcd.js",
          "assets/index-abcd.js.map",
          "assets/sqlite3-abcd.wasm",
        ],
      ),
    ).toEqual([]);
  });

  it("fails a browser-storage fallback masquerading as a durable checkpoint", () => {
    const result = successfulResult();
    result.checkpoint.receipt.authority = "browser-storage-fallback";
    result.native.getDirectoryCalls = 0;
    result.native.lockRequests = [];
    result.native.filesAfterCheckpoint = [];
    const issues = validateStudioAutosaveOpfsBrowserResult(
      result,
      diagnostics(),
      ["index.html", "assets/index-abcd.js", "assets/sqlite3-abcd.wasm"],
    );
    expect(issues).toContain(
      "real navigator.storage.getDirectory and origin-wide Web Locks were not observed",
    );
    expect(issues).toContain(
      "native OPFS files were not created and uniquely cleaned up",
    );
    expect(issues).toContain(
      "checkpoint save -> real page reload -> durable read did not round-trip",
    );
  });

  it("fails missing reload, fallback migration, or durable tombstone proof", () => {
    const result = successfulResult();
    result.checkpoint.pageReloadObserved = false;
    result.checkpoint.navigationType = "navigate";
    result.migration.reconciliation.migratedToOpfs = false;
    result.clear.reconciliation.candidate = {
      key: DOCUMENT_KEY,
      payload: payload(
        "2026-07-30T00:00:00.000Z",
        "checkpoint-stroke",
      ).payload,
    };
    const issues = validateStudioAutosaveOpfsBrowserResult(
      result,
      diagnostics(),
      ["index.html", "assets/index-abcd.js", "assets/sqlite3-abcd.wasm"],
    );
    expect(issues).toContain(
      "checkpoint save -> real page reload -> durable read did not round-trip",
    );
    expect(issues).toContain(
      "newer SQLite fallback was not promoted into native OPFS",
    );
    expect(issues).toContain(
      "durable clear tombstone did not suppress and remove stale browser recovery",
    );
  });

  it("fails console, page, request, 5xx, CSP, and source-module requests", () => {
    const issues = validateStudioAutosaveOpfsBrowserResult(
      successfulResult(),
      diagnostics({
        consoleErrors: ["unexpected console error"],
        pageErrors: ["uncaught"],
        requestFailures: ["GET /missing"],
        fiveHundredResponses: ["500 /broken"],
        cspViolations: [{
          effectiveDirective: "script-src-elem",
          blockedUri: "inline",
        }],
        requests: [{
          method: "GET",
          resourceType: "script",
          url: "http://127.0.0.1:4173/src/browser-harness.ts",
        }],
      }),
      ["index.html", "assets/index-abcd.js", "assets/sqlite3-abcd.wasm"],
    );
    expect(issues).toContain(
      "Chromium observed console, page, request, 5xx, or CSP failures",
    );
    expect(issues).toContain(
      "the browser did not execute a focused Vite production bundle",
    );
  });

  it("builds an isolated production harness around public product contracts and real browser APIs", () => {
    const source = createStudioAutosaveOpfsBrowserHarnessSource(
      "/Users/example/toonspectrum",
    );
    expect(source).toContain("createStudioAutosaveOpfsSession");
    expect(source).toContain("persistStudioAutosaveWithOpfsPrimary");
    expect(source).toContain("reconcileStudioAutosaveWithOpfsPrimary");
    expect(source).toContain("acquireStudioAutosaveSqliteStore");
    expect(source).toContain("acquireStudioLocalDatabase");
    expect(source).toContain("navigator.storage.getDirectory()");
    expect(source).toContain("navigator.locks.request(");
    expect(source).toContain("window.sessionStorage");
    expect(source).toContain("removeEntry(journalDocumentId, { recursive: true })");
    expect(source).not.toContain("createStudioOpfsMemoryFileSystem");
    expect(source).not.toContain("createStudioOpfsLocalStorageFileSystem");

    const verifierSource = readFileSync(
      new URL("./verify-studio-autosave-opfs-session.mts", import.meta.url),
      "utf8",
    );
    expect(verifierSource).toContain("await build({");
    expect(verifierSource).toContain("previewServer = await preview({");
    expect(verifierSource).toContain("await page.reload(");
    expect(verifierSource).not.toContain("createViteServer");
  });

  it("isolates all generated and result files under the selected evidence root", () => {
    const plan = createStudioAutosaveOpfsBrowserRunPlan(
      "/tmp/toonspectrum-opfs-proof",
    );
    expect(plan).toMatchObject({
      scratch: "/tmp/toonspectrum-opfs-proof",
      sourceDirectory:
        "/tmp/toonspectrum-opfs-proof/production-source",
      distributionDirectory:
        "/tmp/toonspectrum-opfs-proof/production-dist",
      browserHarness:
        "/tmp/toonspectrum-opfs-proof/production-source/browser-harness.js",
      htmlEntry:
        "/tmp/toonspectrum-opfs-proof/production-source/index.html",
      evidence: {
        browserResult:
          "/tmp/toonspectrum-opfs-proof/browser-result.json",
        diagnostics:
          "/tmp/toonspectrum-opfs-proof/diagnostics.json",
        productionBuild:
          "/tmp/toonspectrum-opfs-proof/production-build.json",
        observations:
          "/tmp/toonspectrum-opfs-proof/observations.json",
        summary:
          "/tmp/toonspectrum-opfs-proof/summary.json",
      },
    });
  });
});
