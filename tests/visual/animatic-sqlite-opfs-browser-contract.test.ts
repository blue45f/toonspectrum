import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANIMATIC_SQLITE_OPFS_BROWSER_LOAD_SAMPLE_COUNT,
  ANIMATIC_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
  ANIMATIC_SQLITE_OPFS_BROWSER_SAVE_SAMPLE_COUNT,
  ANIMATIC_SQLITE_OPFS_BROWSER_SEGMENT_COUNT,
  validateAnimaticSqliteOpfsBrowserEvidence,
  type AnimaticSqliteOpfsBrowserArtifact,
  type AnimaticSqliteOpfsBrowserDiagnostics,
} from "../benchmarks/harness/animatic-sqlite-opfs-browser";

const ROOT = resolve(import.meta.dirname, "../..");
const CLIENT_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/animatic-sqlite-opfs-browser-client.ts",
);
const PAGE_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/animatic-sqlite-opfs-browser-page.ts",
);
const ORCHESTRATOR_PATH = resolve(
  ROOT,
  "tests/benchmarks/harness/animatic-sqlite-opfs-browser.ts",
);
const RESULT_PATH = resolve(
  ROOT,
  "tests/benchmarks/results/animatic-sqlite-opfs-browser.json",
);

function readArtifact(): AnimaticSqliteOpfsBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as AnimaticSqliteOpfsBrowserArtifact;
}

function passingDiagnostics(): AnimaticSqliteOpfsBrowserDiagnostics {
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

describe("animatic SQLite Chromium Dedicated Worker OPFS evidence", () => {
  it("uses only the production V12 OPFS database and animatic persistence", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    expect(source).toContain("createStudioAnimaticSqlitePersistence");
    expect(source).toContain('openStudioLocalDatabase({ vfs: "opfs", loadSqlite })');
    expect(source.match(
      /^\s+database = await openStudioLocalDatabase\(\{ vfs: "opfs", loadSqlite \}\);$/gmu,
    )).toHaveLength(2);
    expect(source).toContain("trackedSqliteApi");
    expect(source).toContain("openedMemoryDatabaseFilenames");
    expect(source).toContain("await database.close()");
    expect(source).toContain("STUDIO_ANIMATIC_SQLITE_NAMESPACE");
    expect(source).not.toContain('vfs: "memory"');
    expect(source).not.toContain("window.localStorage");
    expect(source).not.toContain("globalThis.localStorage");
    expect(source).not.toContain('new api.oo1.DB(":memory:"');
    expect(source).not.toContain('logicalDatabaseFilename: "studio-local.db"');
  });

  it("builds a real module Dedicated Worker with isolated production headers", () => {
    const pageSource = readFileSync(PAGE_PATH, "utf8");
    const orchestratorSource = readFileSync(ORCHESTRATOR_PATH, "utf8");
    expect(pageSource).toContain("new Worker(");
    expect(pageSource).toContain('type: "module"');
    expect(pageSource).toContain("animatic-sqlite-opfs-browser-client.ts");
    expect(orchestratorSource).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(orchestratorSource).toContain(
      '"Cross-Origin-Embedder-Policy": "require-corp"',
    );
    expect(orchestratorSource).toContain(
      '"Cross-Origin-Resource-Policy": "same-origin"',
    );
    expect(orchestratorSource).toContain("'wasm-unsafe-eval'");
    expect(orchestratorSource).toContain('args: ["--no-sandbox", "--enable-precise-memory-info"]');
    expect(orchestratorSource).toContain("vite-production-build");
  });

  it("pins passing real Chromium OPFS evidence", () => {
    const artifact = readArtifact();
    expect(artifact.schemaVersion).toBe(ANIMATIC_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toMatch(/^20\d\d-/u);
    expect(artifact.status).toBe("pass");
    expect(artifact.pass).toBe(true);
    expect(artifact.validationIssues).toEqual([]);
    expect(validateAnimaticSqliteOpfsBrowserEvidence(
      artifact.benchmark,
      artifact.diagnostics,
      artifact.productionBuild.assets,
    )).toEqual([]);
  });

  it("pins the maximum legal document and every raw save/load sample", () => {
    const benchmark = readArtifact().benchmark as {
      authority: {
        openedOpfsDatabaseFilenames: string[];
        oldDatabaseFilenameOpenCount: number;
        memoryDatabaseOpenCount: number;
        localStorageFallbackUsed: boolean;
      };
      config: {
        segmentCount: number;
        cameraKeyframeCount: number;
        cueCount: number;
        nextCueRejected: boolean;
        maximumSourceExportBytes: number;
        exportByteCap: number;
        uniqueSequentialEditCount: number;
      };
      saves: { distribution: { samplesMs: unknown[] } };
      loads: { distribution: { samplesMs: unknown[] }; mismatchCount: number };
      opfs: { final: { fileCount: number; totalFileBytes: number; entries: unknown[] } };
    };
    expect(benchmark.authority.openedOpfsDatabaseFilenames).toEqual([
      "/studio-local-v12.db",
      "/studio-local-v12.db",
    ]);
    expect(benchmark.authority.oldDatabaseFilenameOpenCount).toBe(0);
    expect(benchmark.authority.memoryDatabaseOpenCount).toBe(0);
    expect(benchmark.authority.localStorageFallbackUsed).toBe(false);
    expect(benchmark.config.segmentCount).toBe(ANIMATIC_SQLITE_OPFS_BROWSER_SEGMENT_COUNT);
    expect(benchmark.config.cameraKeyframeCount).toBe(2_880);
    expect(benchmark.config.cueCount).toBe(1_139);
    expect(benchmark.config.nextCueRejected).toBe(true);
    expect(benchmark.config.maximumSourceExportBytes).toBe(799_973);
    expect(benchmark.config.exportByteCap).toBe(800_000);
    expect(benchmark.config.uniqueSequentialEditCount)
      .toBe(ANIMATIC_SQLITE_OPFS_BROWSER_SAVE_SAMPLE_COUNT);
    expect(benchmark.saves.distribution.samplesMs)
      .toHaveLength(ANIMATIC_SQLITE_OPFS_BROWSER_SAVE_SAMPLE_COUNT);
    expect(benchmark.loads.distribution.samplesMs)
      .toHaveLength(ANIMATIC_SQLITE_OPFS_BROWSER_LOAD_SAMPLE_COUNT);
    expect(benchmark.loads.mismatchCount).toBe(0);
    expect(benchmark.opfs.final.fileCount).toBeGreaterThan(0);
    expect(benchmark.opfs.final.totalFileBytes).toBeGreaterThan(0);
    expect(benchmark.opfs.final.entries.length).toBeGreaterThan(0);
  });

  it("pins exact canonical bytes, digest, reopen, and separate-key fail-closed behavior", () => {
    const benchmark = readArtifact().benchmark as {
      semanticIntegrity: {
        canonicalBytes: number;
        persistedBeforeCloseBytes: number;
        reopenedBytes: number;
        canonicalDigestSha256: string;
        persistedBeforeCloseDigestSha256: string;
        reopenedDigestSha256: string;
        persistedBeforeCloseExact: boolean;
        reopenedCanonicalBytesExact: boolean;
        normalizedDocumentExact: boolean;
      };
      corruption: {
        status: string;
        documentIsNull: boolean;
        failClosed: boolean;
        mainDocumentIntact: boolean;
      };
      memory: {
        final: {
          performanceMemory: unknown;
          userAgentSpecific: unknown;
          unavailableIsNull: boolean;
        };
      };
    };
    const semantic = benchmark.semanticIntegrity;
    expect(semantic.canonicalBytes).toBe(799_973);
    expect(semantic.persistedBeforeCloseBytes).toBe(semantic.canonicalBytes);
    expect(semantic.reopenedBytes).toBe(semantic.canonicalBytes);
    expect(semantic.canonicalDigestSha256).toHaveLength(64);
    expect(semantic.persistedBeforeCloseDigestSha256).toBe(semantic.canonicalDigestSha256);
    expect(semantic.reopenedDigestSha256).toBe(semantic.canonicalDigestSha256);
    expect(semantic.persistedBeforeCloseExact).toBe(true);
    expect(semantic.reopenedCanonicalBytesExact).toBe(true);
    expect(semantic.normalizedDocumentExact).toBe(true);
    expect(benchmark.corruption).toMatchObject({
      status: "invalid",
      documentIsNull: true,
      failClosed: true,
      mainDocumentIntact: true,
    });
    expect(benchmark.memory.final.performanceMemory).toBeNull();
    expect(benchmark.memory.final.userAgentSpecific).toBeNull();
    expect(benchmark.memory.final.unavailableIsNull).toBe(true);
  });

  it("keeps broad latency regression gates without replacing raw evidence", () => {
    const benchmark = readArtifact().benchmark as {
      opening: { coldOpenMs: number; reopenMs: number };
      saves: { distribution: { p99Ms: number } };
      loads: { distribution: { p99Ms: number } };
    };
    expect(benchmark.opening.coldOpenMs).toBeLessThan(5_000);
    expect(benchmark.opening.reopenMs).toBeLessThan(1_000);
    expect(benchmark.saves.distribution.p99Ms).toBeLessThan(500);
    expect(benchmark.loads.distribution.p99Ms).toBeLessThan(250);
  });

  it("rejects memory/legacy fallback, semantic loss, corruption leakage, and diagnostics", () => {
    const artifact = readArtifact();
    const invalid = structuredClone(artifact.benchmark) as {
      authority?: Record<string, unknown>;
      semanticIntegrity?: Record<string, unknown>;
      corruption?: Record<string, unknown>;
    };
    invalid.authority = {
      ...(invalid.authority ?? {}),
      openedOpfsDatabaseFilenames: ["/studio-local-v12.db", "/studio-local.db"],
      nonV12DatabaseOpenCount: 1,
      oldDatabaseFilenameOpenCount: 1,
      memoryDatabaseOpenCount: 1,
      memoryVfsUsed: true,
      localStorageFallbackUsed: true,
    };
    invalid.semanticIntegrity = {
      ...(invalid.semanticIntegrity ?? {}),
      reopenedCanonicalBytesExact: false,
    };
    invalid.corruption = { ...(invalid.corruption ?? {}), failClosed: false };
    const issues = validateAnimaticSqliteOpfsBrowserEvidence(
      invalid,
      passingDiagnostics(),
      ["assets/sqlite3.wasm"],
    );
    expect(issues).toContain(
      "authority receipt does not prove two V12-only OPFS opens with zero fallback",
    );
    expect(issues).toContain("canonical bytes/digest or normalized semantic preservation failed");
    expect(issues).toContain(
      "separate-key corruption did not fail closed while preserving the main document",
    );

    expect(validateAnimaticSqliteOpfsBrowserEvidence(
      artifact.benchmark,
      { ...passingDiagnostics(), consoleWarnings: ["synthetic warning"] },
      ["assets/sqlite3.wasm"],
    )).toContain("Chromium diagnostics contain console/page/network errors or warnings");
  });
});
