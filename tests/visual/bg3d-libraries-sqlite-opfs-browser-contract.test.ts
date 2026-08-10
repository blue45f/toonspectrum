import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
  BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES,
  validateBg3dLibrariesSqliteOpfsBrowserEvidence,
  type Bg3dLibrariesSqliteOpfsBrowserArtifact,
} from "../benchmarks/harness/bg3d-libraries-sqlite-opfs-browser";

type JsonRecord = Record<string, unknown>;

const RESULT_PATH = resolve(
  process.cwd(),
  "tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json",
);

function artifact(): Bg3dLibrariesSqliteOpfsBrowserArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as Bg3dLibrariesSqliteOpfsBrowserArtifact;
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

describe("BG3D SQLite/OPFS real Chromium promotion artifact", () => {
  it("passes the complete production-build evidence validator on Chromium 140", () => {
    const value = artifact();
    expect(value).toMatchObject({ schemaVersion: 1, status: "pass", pass: true });
    expect(value.diagnostics.browserVersion).toBe("140.0.7339.186");
    expect(validateBg3dLibrariesSqliteOpfsBrowserEvidence(
      value.benchmark,
      value.diagnostics,
      value.productionBuild.assets,
    )).toEqual([]);
    expect(value.productionBuild.mode).toBe("vite-production-build");
    expect(value.productionBuild.assets.some((asset) => asset.endsWith(".wasm"))).toBe(true);
    expect(value.productionBuild.assets.some((asset) =>
      asset.includes("bg3d-libraries-sqlite-opfs-browser-worker") && asset.endsWith(".js")))
      .toBe(true);
    expect(value.productionBuild.totalBytes).toBeGreaterThan(0);
    expect(Object.keys(value.productionBuild.assetBytes)).toEqual(value.productionBuild.assets);
  });

  it("pins exact 1/32/100 MiB hashes, physical CAS bytes, and 100-read distributions", () => {
    const benchmark = record(artifact().benchmark);
    const primary = record(benchmark.primary);
    const models = record(primary.models);
    const writes = models.writes as JsonRecord[];
    const reads = models.reads as JsonRecord[];
    const physical = models.physicalCas as JsonRecord[];
    expect(writes.map(({ bytes }) => bytes)).toEqual([
      ...BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES,
      100 * 1024 * 1024,
    ]);
    for (const write of writes) {
      expect(write.expectedHash).toBe(write.storedHash);
      expect(write.returnedBytes).toBe(write.bytes);
      expect(write.exactBytes).toBe(true);
    }
    for (const byteSize of BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES) {
      const read = reads.find(({ bytes }) => bytes === byteSize);
      expect(read).toBeDefined();
      expect(read?.mismatchCount).toBe(0);
      expect(record(read?.distribution).sampleCount)
        .toBe(BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
      expect(record(read?.distribution).samplesMs as number[])
        .toHaveLength(BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
    }
    expect(reads.find(({ bytes }) => bytes === 100 * 1024 * 1024)).toMatchObject({
      mismatchCount: 0,
      distribution: { sampleCount: 5 },
    });
    expect(physical).toHaveLength(4);
    expect(physical.every(({ exact }) => exact === true)).toBe(true);
    expect(record(models.thumbnail)).toMatchObject({
      bytes: 58,
      exactAfterReopen: true,
    });
  });

  it("pins canonical manifests, 100 template/metadata samples, and zero fallback", () => {
    const benchmark = record(artifact().benchmark);
    const primary = record(benchmark.primary);
    expect(primary.manifests).toMatchObject({
      canonical: true,
      containsBase64OrDataUrl: false,
      casIndexContainsBase64OrDataUrl: false,
    });
    for (const lane of ["templates", "metadata"] as const) {
      const receipt = record(primary[lane]);
      expect(receipt.count).toBe(BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
      for (const distributionKey of lane === "templates"
        ? ["writeDistribution", "listDistribution"]
        : ["writeDistribution", "getDistribution"]) {
        expect(record(receipt[distributionKey]).sampleCount)
          .toBe(BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
        expect(record(receipt[distributionKey]).samplesMs as number[])
          .toHaveLength(BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES);
      }
    }
    expect(benchmark.fallback).toEqual({
      indexedDbAccessCount: 0,
      localStorageAccessCount: 0,
      memoryDatabaseOpenCount: 0,
      memoryAssetStoreCount: 0,
      totalFallbackCount: 0,
      probesInstalledInEveryWorker: true,
    });
  });

  it("pins normal reopen, forced Worker termination recovery, and measured lock waiting", () => {
    const benchmark = record(artifact().benchmark);
    expect(nested(benchmark, "primary", "authority", "normalCloseCompletedBeforeReopen"))
      .toBe(true);
    expect(benchmark.forcedTermination).toMatchObject({
      pass: true,
      workerTerminateCalled: true,
      databaseCloseCalledBeforeTerminate: false,
      commit: { databaseIntentionallyLeftOpen: true },
      recovery: { pass: true, exactHashAndBytes: true },
    });
    expect(benchmark.contention).toMatchObject({
      attempted: true,
      supported: true,
      pass: true,
      mode: "dedicated-worker-lock-holder-plus-product-authority-writer",
      productWritePresentAfterFreshWorkerReopen: true,
      dualProductAuthorityWorkers: {
        status: "infeasible",
        attemptedInExploratoryRun: true,
      },
    });
    expect(Number(nested(benchmark, "contention", "contenderBObservedWaitMs")))
      .toBeGreaterThanOrEqual(150);
    expect(benchmark.finalVerification).toMatchObject({
      pass: true,
      modelCount: 4,
      templateCount: 100,
      metadataCount: 101,
      manifestsContainNoBase64: true,
    });
  });

  it("keeps broad regression ceilings while retaining every raw latency sample", () => {
    const benchmark = record(artifact().benchmark);
    const primary = record(benchmark.primary);
    expect(Number(nested(primary, "authority", "coldOpenMs"))).toBeLessThan(5_000);
    expect(Number(nested(primary, "authority", "reopenMs"))).toBeLessThan(1_000);
    const reads = nested(primary, "models", "reads") as JsonRecord[];
    const p99 = (bytes: number): number => Number(record(
      reads.find((receipt) => receipt.bytes === bytes)?.distribution,
    ).p99Ms);
    expect(p99(1 * 1024 * 1024)).toBeLessThan(100);
    expect(p99(32 * 1024 * 1024)).toBeLessThan(1_000);
    expect(p99(100 * 1024 * 1024)).toBeLessThan(2_000);
    expect(Number(nested(primary, "templates", "writeDistribution", "p99Ms")))
      .toBeLessThan(250);
    expect(Number(nested(primary, "templates", "listDistribution", "p99Ms")))
      .toBeLessThan(250);
    expect(Number(nested(primary, "metadata", "writeDistribution", "p99Ms")))
      .toBeLessThan(100);
    expect(Number(nested(primary, "metadata", "getDistribution", "p99Ms")))
      .toBeLessThan(50);
  });

  it("records only exposed memory and explicitly preserves infeasible dimensions", () => {
    const benchmark = record(artifact().benchmark);
    expect(nested(benchmark, "primary", "memory", "before", "performanceMemory")).toBeNull();
    expect(nested(benchmark, "primary", "memory", "before", "userAgentSpecific")).toBeNull();
    expect(nested(benchmark, "pageMemory", "before", "performanceMemory"))
      .toMatchObject({ usedJSHeapSizeBytes: expect.any(Number) });
    expect(nested(benchmark, "pageMemory", "before", "userAgentSpecific")).toBeNull();
    expect(benchmark.infeasibleDimensions as unknown[]).toHaveLength(7);
    expect(artifact().diagnostics).toMatchObject({
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      errorResponses: [],
    });
  });

  it("makes fallback and percentile tampering fail the promotion validator", () => {
    const value = artifact();
    const tampered = structuredClone(value.benchmark) as JsonRecord;
    record(tampered.fallback).indexedDbAccessCount = 1;
    record(tampered.fallback).totalFallbackCount = 1;
    const reads = nested(tampered, "primary", "models", "reads") as JsonRecord[];
    record(reads[0]?.distribution).p50Ms = 999_999;
    const issues = validateBg3dLibrariesSqliteOpfsBrowserEvidence(
      tampered,
      value.diagnostics,
      value.productionBuild.assets,
    );
    expect(issues).toContain("legacy or non-durable fallback access was observed");
    expect(issues).toContain(
      "100-sample verified CAS read distribution failed for 1048576 bytes",
    );
  });
});
