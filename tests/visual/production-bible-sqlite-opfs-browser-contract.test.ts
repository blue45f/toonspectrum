import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRODUCTION_BIBLE_SQLITE_OPFS_LOAD_SAMPLES,
  PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
  PRODUCTION_BIBLE_SQLITE_OPFS_SAVE_SAMPLES,
  validateProductionBibleSqliteOpfsEvidence,
  type ProductionBibleSqliteOpfsArtifact,
  type ProductionBibleSqliteOpfsDiagnostics,
} from "../benchmarks/harness/production-bible-sqlite-opfs-browser";

const ROOT = resolve(import.meta.dirname, "../..");
const CLIENT_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/production-bible-sqlite-opfs-browser-client.ts",
);
const PAGE_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/production-bible-sqlite-opfs-browser-page.ts",
);
const ORCHESTRATOR_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/production-bible-sqlite-opfs-browser.ts",
);
const RESULT_PATH = resolve(
  ROOT,
  "tests/benchmarks/results/production-bible-sqlite-opfs-browser.json",
);

function artifact(): ProductionBibleSqliteOpfsArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as ProductionBibleSqliteOpfsArtifact;
}

function passingDiagnostics(): ProductionBibleSqliteOpfsDiagnostics {
  return {
    browserVersion: "test",
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    requests: [],
    responses: [],
    responseHeaders: {
      contentSecurityPolicy: "script-src 'self' 'wasm-unsafe-eval'",
      crossOriginOpenerPolicy: "same-origin",
      crossOriginEmbedderPolicy: "require-corp",
      crossOriginResourcePolicy: "same-origin",
    },
  };
}

describe("Production Bible Chromium SQLite OPFS evidence", () => {
  it("runs the option-free product persistence over the shared V12 OPFS authority", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    expect(source).toContain("createStudioProductionBibleSqlitePersistence()");
    expect(source).toContain("acquireStudioLocalDatabase(() => openStudioLocalDatabase({");
    expect(source).toContain('vfs: "opfs"');
    expect(source).toContain("closeStudioLocalDatabaseRuntime()");
    expect(source).toContain("studioProductionBibleLegacyStorageKey(legacyScope)");
    expect(source).toContain("persistence.load(v12LegacyTargetKey)");
    expect(source).not.toContain("persistence.load(legacyKey)");
    expect(source).not.toContain('vfs: "memory"');
    expect(source).not.toContain("globalThis.localStorage");
    expect(source).not.toContain("window.localStorage");
  });

  it("terminates the seed Worker without close and starts a distinct recovery Worker", () => {
    const source = readFileSync(PAGE_PATH, "utf8");
    expect(source).toContain('runWorkerPhase("termination-seed"');
    expect(source).toContain("seed.worker.terminate()");
    expect(source).toContain('runWorkerPhase("termination-verify"');
    expect(source.indexOf("seed.worker.terminate()"))
      .toBeLessThan(source.indexOf('runWorkerPhase("termination-verify"'));
  });

  it("serves a Vite production build with Worker/wasm isolation headers", () => {
    const source = readFileSync(ORCHESTRATOR_PATH, "utf8");
    expect(source).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(source).toContain('"Cross-Origin-Embedder-Policy": "require-corp"');
    expect(source).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(source).toContain("'wasm-unsafe-eval'");
    expect(source).toContain('args: ["--no-sandbox", "--enable-precise-memory-info"]');
  });

  it("pins passing raw Chromium evidence or an explicit unsupported artifact", () => {
    const result = artifact();
    expect(result.schemaVersion).toBe(PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION);
    expect(result.generatedAt).toMatch(/^20\d\d-/u);
    expect(["pass", "unsupported"]).toContain(result.status);
    if (result.status === "unsupported") {
      expect(result.pass).toBe(false);
      expect(result.validationIssues.length).toBeGreaterThan(0);
      return;
    }
    expect(result.pass).toBe(true);
    expect(result.validationIssues).toEqual([]);
    expect(validateProductionBibleSqliteOpfsEvidence(
      result.benchmark,
      result.diagnostics,
      result.productionBuild.assets,
    )).toEqual([]);
  });

  it("retains raw distributions, canonical receipts, and honest fault quarantine", () => {
    const result = artifact();
    if (result.status !== "pass") return;
    const benchmark = result.benchmark as {
      normal: {
        saves: { distribution: { samplesMs: unknown[] } };
        loads: { distribution: { samplesMs: unknown[] } };
        canonical: { digestSha256: string; strictRoundTrip: boolean };
        faults: {
          quota: { actualBrowserQuotaEnforcement: string; silentFallback: boolean };
          sahInstall: { errorSurfaced: boolean; silentFallback: boolean };
        };
      };
      forcedTermination: {
        workerTerminateCalled: boolean;
        closeCalledBeforeTerminate: boolean;
        verify: { reopenedCanonicalExact: boolean };
      };
    };
    expect(benchmark.normal.saves.distribution.samplesMs)
      .toHaveLength(PRODUCTION_BIBLE_SQLITE_OPFS_SAVE_SAMPLES);
    expect(benchmark.normal.loads.distribution.samplesMs)
      .toHaveLength(PRODUCTION_BIBLE_SQLITE_OPFS_LOAD_SAMPLES);
    expect(benchmark.normal.canonical.digestSha256).toHaveLength(64);
    expect(benchmark.normal.canonical.strictRoundTrip).toBe(true);
    expect(benchmark.normal.faults.quota).toEqual(expect.objectContaining({
      actualBrowserQuotaEnforcement: "quarantined-no-portable-quota-control",
      silentFallback: false,
    }));
    expect(benchmark.normal.faults.sahInstall).toEqual(expect.objectContaining({
      errorSurfaced: true,
      silentFallback: false,
    }));
    expect(benchmark.forcedTermination).toEqual(expect.objectContaining({
      workerTerminateCalled: true,
      closeCalledBeforeTerminate: false,
    }));
    expect(benchmark.forcedTermination.verify.reopenedCanonicalExact).toBe(true);
  });

  it("rejects memory-backed, legacy-reading, or fake termination evidence", () => {
    const result = artifact();
    const memoryBacked = structuredClone(result.benchmark) as {
      normal?: { authority?: Record<string, unknown> };
    };
    memoryBacked.normal = memoryBacked.normal ?? {};
    memoryBacked.normal.authority = {
      ...(memoryBacked.normal.authority ?? {}),
      requestedVfs: "memory",
      memoryDatabaseOpenCount: 1,
    };
    expect(validateProductionBibleSqliteOpfsEvidence(
      memoryBacked,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain(
      "authority receipt does not prove two product V12 OPFS opens without fallback",
    );

    const legacyRead = structuredClone(result.benchmark) as {
      normal?: { policy?: Record<string, unknown> };
    };
    legacyRead.normal = legacyRead.normal ?? {};
    legacyRead.normal.policy = {
      ...(legacyRead.normal.policy ?? {}),
      legacyKeyReadByProduct: true,
    };
    expect(validateProductionBibleSqliteOpfsEvidence(
      legacyRead,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain("scope isolation, legacy discard, or strict corruption gate failed");

    const fakeTermination = structuredClone(result.benchmark) as {
      forcedTermination?: Record<string, unknown>;
    };
    fakeTermination.forcedTermination = {
      ...(fakeTermination.forcedTermination ?? {}),
      closeCalledBeforeTerminate: true,
    };
    expect(validateProductionBibleSqliteOpfsEvidence(
      fakeTermination,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain("forced Dedicated Worker termination did not recover exact canonical bytes");
  });
});
