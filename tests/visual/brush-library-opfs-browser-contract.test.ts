import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRUSH_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT,
  BRUSH_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
  validateBrushLibraryOpfsBrowserEvidence,
  type BrushLibraryOpfsBrowserArtifact,
  type BrushLibraryOpfsBrowserDiagnostics,
} from "../benchmarks/harness/brush-library-opfs-browser";

const ROOT = resolve(import.meta.dirname, "../..");
const CLIENT_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/brush-library-opfs-browser-client.ts",
);
const ORCHESTRATOR_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/brush-library-opfs-browser.ts",
);
const RESULT_PATH = resolve(
  ROOT,
  "tests/benchmarks/results/brush-library-opfs-browser.json",
);

function readArtifact(): BrushLibraryOpfsBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as BrushLibraryOpfsBrowserArtifact;
}

function passingDiagnostics(): BrushLibraryOpfsBrowserDiagnostics {
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

describe("SQLite brush-library Chromium OPFS evidence contract", () => {
  it("uses the product OPFS database and repository without a silent fallback", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    expect(source).toContain("const BRUSH_COUNT = 10_000;");
    expect(source).toContain('openStudioLocalDatabase({ vfs: "opfs", loadSqlite })');
    expect(source).toContain("createSqliteBrushLibraryRepository(database)");
    expect(source).toContain("await database.close()");
    expect(source.match(/openStudioLocalDatabase\(\{ vfs: "opfs", loadSqlite \}\)/gu))
      .toHaveLength(2);
    expect(source).toContain("inspectProductOpfsDirectory");
    expect(source).toContain("sqlRecordToStudioBrush");
    expect(source).not.toContain('vfs: "memory"');
    expect(source).not.toContain("window.localStorage");
    expect(source).not.toContain("globalThis.localStorage");
    expect(BRUSH_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT).toBe(10_000);
  });

  it("serves a production bundle with COOP, COEP, CORP and wasm CSP", () => {
    const source = readFileSync(ORCHESTRATOR_PATH, "utf8");
    expect(source).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(source).toContain('"Cross-Origin-Embedder-Policy": "require-corp"');
    expect(source).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(source).toContain("'wasm-unsafe-eval'");
    expect(source).toContain("vite-production-build");
    expect(source).toContain('args: ["--no-sandbox", "--enable-precise-memory-info"]');
  });

  it("pins a real artifact that is either passing OPFS evidence or explicit unsupported", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(BRUSH_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(["pass", "unsupported"]).toContain(artifact.status);

    if (artifact.status === "unsupported") {
      expect(artifact.pass).toBe(false);
      expect((artifact.benchmark as { status?: unknown }).status).toBe("unsupported");
      expect((artifact.benchmark as { reason?: unknown }).reason).toEqual(expect.any(String));
      expect(artifact.validationIssues.length).toBeGreaterThan(0);
      return;
    }

    expect(artifact.pass).toBe(true);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateBrushLibraryOpfsBrowserEvidence(
      artifact.benchmark,
      artifact.diagnostics,
      artifact.productionBuild.assets,
    )).toEqual([]);
  });

  it("keeps full raw timing samples and non-estimated identity receipts", () => {
    const artifact = readArtifact();
    if (artifact.status !== "pass") return;
    const benchmark = artifact.benchmark as {
      insertion: {
        batchSamples: unknown[];
        distribution: { samplesMs: unknown[] };
      };
      keysetFullScan: {
        pageReceipts: unknown[];
        distribution: { samplesMs: unknown[] };
        expectedOrderDigestSha256: string;
        observedOrderDigestSha256: string;
      };
      idLookup: { distribution: { samplesMs: unknown[] } };
      filters: Array<{ distribution: { samplesMs: unknown[] } }>;
      opfs: { final: { entries: unknown[]; fileCount: number; totalFileBytes: number } };
    };
    expect(benchmark.insertion.batchSamples).toHaveLength(50);
    expect(benchmark.insertion.distribution.samplesMs).toHaveLength(50);
    expect(benchmark.keysetFullScan.pageReceipts).toHaveLength(39);
    expect(benchmark.keysetFullScan.distribution.samplesMs).toHaveLength(39);
    expect(benchmark.idLookup.distribution.samplesMs).toHaveLength(200);
    expect(benchmark.filters).toHaveLength(3);
    for (const filter of benchmark.filters) {
      expect(filter.distribution.samplesMs).toHaveLength(60);
    }
    expect(benchmark.keysetFullScan.expectedOrderDigestSha256).toHaveLength(64);
    expect(benchmark.keysetFullScan.observedOrderDigestSha256)
      .toBe(benchmark.keysetFullScan.expectedOrderDigestSha256);
    expect(benchmark.opfs.final.fileCount).toBeGreaterThan(0);
    expect(benchmark.opfs.final.totalFileBytes).toBeGreaterThan(0);
    expect(benchmark.opfs.final.entries.length).toBeGreaterThan(0);
  });

  it("refuses to call unsupported or memory-backed evidence a pass", () => {
    const artifact = readArtifact();
    const benchmark = structuredClone(artifact.benchmark) as Record<string, unknown>;
    benchmark.status = "unsupported";
    benchmark.pass = false;
    benchmark.reason = "synthetic unsupported contract check";
    expect(validateBrushLibraryOpfsBrowserEvidence(
      benchmark,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain(
      "browser did not produce a passing real OPFS benchmark: synthetic unsupported contract check",
    );

    const memoryBacked = structuredClone(artifact.benchmark) as {
      authority?: Record<string, unknown>;
    };
    memoryBacked.authority = {
      ...(memoryBacked.authority ?? {}),
      requestedVfs: "memory",
      memoryVfsUsed: true,
    };
    expect(validateBrushLibraryOpfsBrowserEvidence(
      memoryBacked,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    )).toContain(
      "authority receipt does not prove product SQLite OPFS SAH-pool without fallback",
    );
  });
});
