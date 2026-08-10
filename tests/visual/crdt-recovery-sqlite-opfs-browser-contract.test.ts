import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CRDT_RECOVERY_SQLITE_OPFS_BROWSER_EXPORT_SAMPLES,
  CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
  validateCrdtRecoverySqliteOpfsBrowserEvidence,
  type CrdtRecoverySqliteOpfsBrowserArtifact,
} from "../benchmarks/harness/crdt-recovery-sqlite-opfs-browser";

type JsonRecord = Record<string, unknown>;

const RESULT_PATH = resolve(
  process.cwd(),
  "tests/benchmarks/results/crdt-recovery-sqlite-opfs-browser.json",
);
const WORKER_PATH = resolve(
  process.cwd(),
  "tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser-worker.ts",
);
const PAGE_PATH = resolve(
  process.cwd(),
  "tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser-page.ts",
);

function artifact(): CrdtRecoverySqliteOpfsBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as CrdtRecoverySqliteOpfsBrowserArtifact;
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("expected a JSON object");
  }
  return value as JsonRecord;
}

function nested(value: unknown, ...keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) current = record(current)[key];
  return current;
}

describe("CRDT recovery-vault v6 real Chromium SQLite/OPFS artifact", () => {
  it("pins the exact artifact schema and passes the production evidence validator", () => {
    const value = artifact();
    expect(Object.keys(value)).toEqual([
      "schemaVersion",
      "generatedAt",
      "status",
      "pass",
      "benchmark",
      "diagnostics",
      "productionBuild",
      "validationIssues",
    ]);
    expect(value).toMatchObject({ schemaVersion: 1, status: "pass", pass: true });
    expect(value.diagnostics.browserVersion).toBe("140.0.7339.186");
    expect(validateCrdtRecoverySqliteOpfsBrowserEvidence(
      value.benchmark,
      value.diagnostics,
      value.productionBuild.assets,
    )).toEqual([]);
    expect(value.productionBuild).toMatchObject({ mode: "vite-production-build" });
    expect(value.productionBuild.assets.some((asset) => asset.endsWith(".wasm"))).toBe(true);
    expect(value.productionBuild.assets.some((asset) =>
      asset.includes("crdt-recovery-sqlite-opfs-browser-worker")
      && asset.endsWith(".js"))).toBe(true);
    expect(Object.keys(value.productionBuild.assetBytes)).toEqual(value.productionBuild.assets);
    expect(value.productionBuild.totalBytes).toBeGreaterThan(0);
  });

  it("pins 4,127 exact updates, 95 structured rows, and the reopened export digest", () => {
    const benchmark = record(artifact().benchmark);
    expect(benchmark.authority).toMatchObject({
      kind: "shared-sqlite-opfs-crdt-recovery-v6",
      requestedVfs: "opfs",
      sqliteOpfsDirectory: "toonspectrum-studio-sqlite",
      sqliteFilename: "studio-local-v12.db",
      schemaVersion: 6,
      table: "crdt_recovery_v12_rows",
      openedMemoryDatabaseFilenames: [],
    });
    expect(nested(benchmark, "gracefulRestart", "seed", "exact")).toEqual({
      frontierCount: 31,
      updateCount: 4_127,
      markerCount: 1,
      digest: "sha256:5c5db83b6b043e1afa8445e810719f3c45a9dc09c77100363fb4a8280f0be530",
      match: true,
    });
    expect(nested(benchmark, "gracefulRestart", "reopen", "exact")).toMatchObject({
      frontierCount: 31,
      updateCount: 4_127,
      markerCount: 1,
      digest: "sha256:5c5db83b6b043e1afa8445e810719f3c45a9dc09c77100363fb4a8280f0be530",
      bundleDigest: "sha256:5c5db83b6b043e1afa8445e810719f3c45a9dc09c77100363fb4a8280f0be530",
      match: true,
      exportedCount: 31,
      loadMismatchCount: 0,
    });
    expect(nested(benchmark, "gracefulRestart", "reopen", "rows")).toEqual({
      rowCount: 95,
      payloadBytes: 1_883_363,
      kindCounts: {
        "frontier-chunk": 63,
        "frontier-manifest": 31,
        "permanent-rejection": 1,
      },
      rowKeysUnique: true,
    });
  });

  it("retains every sample and exact nearest-rank p50/p95/p99 measurement", () => {
    const metrics = record(record(artifact().benchmark).metrics);
    for (const key of ["save", "load", "bundleBuild"] as const) {
      const receipt = record(metrics[key]);
      expect(receipt.sampleCount).toBe(CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
      expect(receipt.samplesMs as number[])
        .toHaveLength(CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
      expect(Number(receipt.p50Ms)).toBeGreaterThanOrEqual(0);
      expect(Number(receipt.p95Ms)).toBeGreaterThanOrEqual(Number(receipt.p50Ms));
      expect(Number(receipt.p99Ms)).toBeGreaterThanOrEqual(Number(receipt.p95Ms));
    }
    const exportReceipt = record(metrics.export);
    expect(exportReceipt.sampleCount).toBe(CRDT_RECOVERY_SQLITE_OPFS_BROWSER_EXPORT_SAMPLES);
    expect(exportReceipt.samplesMs as number[])
      .toHaveLength(CRDT_RECOVERY_SQLITE_OPFS_BROWSER_EXPORT_SAMPLES);
    expect(metrics).toMatchObject({
      payloadBytes: 1_883_363,
      rowCount: 95,
      workerPeakMemoryBytes: null,
      workerPeakMemoryReason: expect.any(String),
    });
    expect(Number(record(metrics.save).p99Ms)).toBeLessThan(1_000);
    expect(Number(record(metrics.load).p99Ms)).toBeLessThan(1_000);
    expect(Number(record(metrics.export).p99Ms)).toBeLessThan(100);
    expect(Number(record(metrics.bundleBuild).p99Ms)).toBeLessThan(100);
  });

  it("pins commit-then-terminate recovery and typed fail-closed corruption", () => {
    const benchmark = record(artifact().benchmark);
    expect(benchmark.forcedTermination).toMatchObject({
      pass: true,
      workerTerminateCalled: true,
      databaseCloseCalledBeforeTerminate: false,
      seed: {
        pass: true,
        updateCount: 257,
        databaseIntentionallyLeftOpen: true,
      },
      verify: {
        pass: true,
        exact: {
          frontierCount: 1,
          updateCount: 257,
          markerCount: 1,
          match: true,
        },
      },
    });
    expect(benchmark.corruption).toMatchObject({
      attempted: true,
      safeTestSeam: true,
      pass: true,
      seed: { changedRows: 1 },
      verify: {
        pass: true,
        failClosed: true,
        returnedPartialFrontierCount: 0,
        error: { name: "StudioCrdtRecoveryCorruptionError" },
      },
    });
  });

  it("records the bounded SAH-pool single-owner limitation without claiming support", () => {
    const value = artifact();
    const benchmark = record(value.benchmark);
    expect(benchmark.contention).toMatchObject({
      attempted: true,
      bounded: true,
      claim: "quarantined-single-owner",
      concurrentOwnershipSupported: false,
      gatePass: true,
      owner: { pass: true },
      contender: {
        pass: false,
        knownSingleOwnerRejection: true,
        error: { name: "SqliteUnavailableError" },
      },
      finalVerification: {
        pass: true,
        owner: { exact: true },
        contender: { expectedCommitted: false, exact: true, digest: null },
      },
      quarantinedReason: expect.any(String),
    });
    expect(benchmark.claims).toEqual({
      browserOpfsDurability: true,
      multiWorkerConcurrentOwnership: null,
      osCrashPowerLoss: null,
      quotaExhaustion: null,
      externalCspParity: false,
    });
    expect(value.diagnostics.consoleErrors).toHaveLength(7);
    expect(value.diagnostics.expectedQuarantinedConsoleErrors)
      .toEqual(value.diagnostics.consoleErrors);
    expect(value.diagnostics).toMatchObject({
      unexpectedConsoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      errorResponses: [],
    });
  });

  it("pins zero fallback, production product-factory wiring, and tamper rejection", () => {
    const value = artifact();
    const benchmark = record(value.benchmark);
    expect(benchmark.fallback).toEqual({
      workerCount: 9,
      workerIndexedDbAccessCount: 0,
      workerLocalStorageAccessCount: 0,
      pageIndexedDbAccessCount: 0,
      pageLocalStorageAccessCount: 0,
      memoryDatabaseOpenCount: 0,
      durableMemoryFallbackSuccessCount: 0,
      totalFallbackCount: 0,
      workerProbesInstalledInEveryWorker: true,
      pageProbes: {
        indexedDbProbeInstalled: true,
        localStorageProbeInstalled: true,
      },
    });
    expect(benchmark.remainingFaultGates).toEqual([
      "full-browser-process-crash",
      "os-crash-and-power-loss",
      "opfs-quota-exhaustion",
      "sah-pool-capacity-exhaustion",
      "long-duration-multi-tab-contention",
      "cross-platform-filesystem-matrix",
    ]);

    const workerSource = readFileSync(WORKER_PATH, "utf8");
    const pageSource = readFileSync(PAGE_PATH, "utf8");
    expect(workerSource).toContain("createStudioCrdtRecoveryVault()");
    expect(workerSource).toContain("acquireStudioLocalDatabase");
    expect(workerSource).toContain('vfs: "opfs"');
    expect(workerSource).not.toContain('vfs: "memory"');
    expect(workerSource).not.toContain("localStorage.setItem");
    expect(workerSource).not.toContain("indexedDB.open");
    expect(pageSource).toContain("crdt-recovery-sqlite-opfs-browser-worker.ts");

    const tampered = structuredClone(value.benchmark) as JsonRecord;
    record(tampered.fallback).totalFallbackCount = 1;
    record(record(tampered.metrics).save).p50Ms = 999_999;
    record(tampered.claims).osCrashPowerLoss = true;
    const issues = validateCrdtRecoverySqliteOpfsBrowserEvidence(
      tampered,
      value.diagnostics,
      value.productionBuild.assets,
    );
    expect(issues).toContain("legacy browser-KV or memory durable fallback access was observed");
    expect(issues).toContain("save p50/p95/p99 distribution is incomplete");
    expect(issues).toContain("artifact makes an unsupported durability, quota, or CSP parity claim");
  });
});
