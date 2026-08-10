import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT,
  FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
  validateFilterLibraryOpfsBrowserEvidence,
  type FilterLibraryOpfsBrowserArtifact,
  type FilterLibraryOpfsBrowserDiagnostics,
} from "../benchmarks/harness/filter-library-opfs-browser";

const ROOT = resolve(import.meta.dirname, "../..");
const CLIENT_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/filter-library-opfs-browser-client.ts",
);
const PAGE_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/filter-library-opfs-browser-page.ts",
);
const ORCHESTRATOR_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/filter-library-opfs-browser.ts",
);
const RESULT_PATH = resolve(
  ROOT,
  "tests/benchmarks/results/filter-library-opfs-browser.json",
);

function readArtifact(): FilterLibraryOpfsBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as FilterLibraryOpfsBrowserArtifact;
}

function passingDiagnostics(): FilterLibraryOpfsBrowserDiagnostics {
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

describe("SQLite filter-library Chromium Dedicated Worker OPFS evidence", () => {
  it("uses only the V12 product OPFS database and filter repository", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    expect(source).toContain("const PRESET_COUNT = 10_000;");
    expect(source).toContain('openStudioLocalDatabase({ vfs: "opfs", loadSqlite })');
    expect(source.match(
      /^\s+database = await openStudioLocalDatabase\(\{ vfs: "opfs", loadSqlite \}\);$/gmu,
    ))
      .toHaveLength(2);
    expect(source).toContain("createSqliteFilterLibraryRepository(database)");
    expect(source).toContain("await database.close()");
    expect(source).toContain("trackedSqliteApi");
    expect(source).toContain("openedMemoryDatabaseFilenames");
    expect(source).toContain("inspectProductOpfsDirectory");
    expect(source).toContain("sqlRecordToStudioFilterPreset");
    expect(source).not.toContain('vfs: "memory"');
    expect(source).not.toContain("window.localStorage");
    expect(source).not.toContain("globalThis.localStorage");
    expect(source).not.toContain('"studio-local.db"');
    expect(FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT).toBe(10_000);
  });

  it("builds a real module Dedicated Worker with isolated production headers", () => {
    const pageSource = readFileSync(PAGE_PATH, "utf8");
    const orchestratorSource = readFileSync(ORCHESTRATOR_PATH, "utf8");
    expect(pageSource).toContain("new Worker(");
    expect(pageSource).toContain('type: "module"');
    expect(pageSource).toContain("filter-library-opfs-browser-client.ts");
    expect(orchestratorSource).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(orchestratorSource).toContain('"Cross-Origin-Embedder-Policy": "require-corp"');
    expect(orchestratorSource).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(orchestratorSource).toContain("'wasm-unsafe-eval'");
    expect(orchestratorSource).toContain("vite-production-build");
    expect(orchestratorSource).toContain(
      'args: ["--no-sandbox", "--enable-precise-memory-info"]',
    );
  });

  it("pins a passing real Chromium OPFS artifact", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("pass");
    expect(artifact.pass).toBe(true);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateFilterLibraryOpfsBrowserEvidence(
      artifact.benchmark,
      artifact.diagnostics,
      artifact.productionBuild.assets,
    )).toEqual([]);
  });

  it("keeps raw timings, exact row identity, V12 open receipts and physical bytes", () => {
    const artifact = readArtifact();
    const benchmark = artifact.benchmark as {
      authority: {
        openedOpfsDatabaseFilenames: string[];
        nonV12DatabaseOpenCount: number;
        memoryDatabaseOpenCount: number;
        localStorageFallbackUsed: boolean;
      };
      insertion: {
        batchSamples: unknown[];
        distribution: { samplesMs: unknown[]; p50Ms: number; p95Ms: number; p99Ms: number };
      };
      keysetFullScan: {
        pageReceipts: unknown[];
        distribution: { samplesMs: unknown[]; p50Ms: number; p95Ms: number; p99Ms: number };
        expectedOrderDigestSha256: string;
        observedOrderDigestSha256: string;
      };
      idLookup: { distribution: { samplesMs: unknown[] } };
      queries: Array<{ distribution: { samplesMs: unknown[] } }>;
      opfs: { final: { entries: unknown[]; fileCount: number; totalFileBytes: number } };
    };
    expect(benchmark.authority.openedOpfsDatabaseFilenames).toEqual([
      "/studio-local-v12.db",
      "/studio-local-v12.db",
    ]);
    expect(benchmark.authority.nonV12DatabaseOpenCount).toBe(0);
    expect(benchmark.authority.memoryDatabaseOpenCount).toBe(0);
    expect(benchmark.authority.localStorageFallbackUsed).toBe(false);
    expect(benchmark.insertion.batchSamples).toHaveLength(40);
    expect(benchmark.insertion.distribution.samplesMs).toHaveLength(40);
    expect(benchmark.keysetFullScan.pageReceipts).toHaveLength(39);
    expect(benchmark.keysetFullScan.distribution.samplesMs).toHaveLength(39);
    expect(benchmark.idLookup.distribution.samplesMs).toHaveLength(200);
    expect(benchmark.queries).toHaveLength(4);
    for (const query of benchmark.queries) {
      expect(query.distribution.samplesMs).toHaveLength(60);
    }
    expect(benchmark.keysetFullScan.expectedOrderDigestSha256).toHaveLength(64);
    expect(benchmark.keysetFullScan.observedOrderDigestSha256)
      .toBe(benchmark.keysetFullScan.expectedOrderDigestSha256);
    expect(benchmark.opfs.final.fileCount).toBeGreaterThan(0);
    expect(benchmark.opfs.final.totalFileBytes).toBeGreaterThan(0);
    expect(benchmark.opfs.final.entries.length).toBeGreaterThan(0);
  });

  it("pins broad latency regression gates without replacing raw evidence", () => {
    const benchmark = readArtifact().benchmark as {
      insertion: { distribution: { p99Ms: number } };
      keysetFullScan: { distribution: { p99Ms: number } };
      idLookup: { distribution: { p99Ms: number } };
      queries: Array<{ id: string; distribution: { p99Ms: number } }>;
    };
    expect(benchmark.insertion.distribution.p99Ms).toBeLessThan(500);
    expect(benchmark.keysetFullScan.distribution.p99Ms).toBeLessThan(250);
    expect(benchmark.idLookup.distribution.p99Ms).toBeLessThan(100);
    for (const query of benchmark.queries) {
      expect(query.distribution.p99Ms, query.id).toBeLessThan(250);
    }
  });

  it("refuses memory, non-V12 filenames, localStorage or browser diagnostics", () => {
    const artifact = readArtifact();
    const memoryBacked = structuredClone(artifact.benchmark) as {
      authority?: Record<string, unknown>;
    };
    memoryBacked.authority = {
      ...(memoryBacked.authority ?? {}),
      openedOpfsDatabaseFilenames: ["/studio-local-v12.db", "/wrong.db"],
      nonV12DatabaseOpenCount: 1,
      memoryDatabaseOpenCount: 1,
      memoryVfsUsed: true,
      localStorageFallbackUsed: true,
    };
    expect(validateFilterLibraryOpfsBrowserEvidence(
      memoryBacked,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain(
      "authority receipt does not prove two V12-only product OPFS opens with zero fallback",
    );

    expect(validateFilterLibraryOpfsBrowserEvidence(
      artifact.benchmark,
      { ...passingDiagnostics(), consoleErrors: ["synthetic console failure"] },
      ["assets/sqlite3.wasm"],
    )).toContain("Chromium diagnostics contain console/page/network errors or warnings");
  });
});
