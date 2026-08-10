import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CUSTOM_FONT_LARGEST_TTC_MAX_BYTES,
  CUSTOM_FONT_MEDIUM_MAX_BYTES,
  CUSTOM_FONT_MEDIUM_MIN_BYTES,
  CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
  validateCustomFontSqliteOpfsEvidence,
  type CustomFontSqliteOpfsArtifact,
} from "../benchmarks/harness/custom-font-sqlite-opfs-browser";

type JsonRecord = Record<string, unknown>;

const RESULT_PATH = resolve(
  process.cwd(),
  "tests/benchmarks/results/custom-font-sqlite-opfs-browser.json",
);

function artifact(): CustomFontSqliteOpfsArtifact {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as CustomFontSqliteOpfsArtifact;
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

describe("custom-font SQLite/OPFS real Chromium promotion artifact", () => {
  it("passes the complete production-build evidence validator", () => {
    const value = artifact();
    expect(value).toMatchObject({ schemaVersion: 1, status: "pass", pass: true });
    expect(value.diagnostics.browserVersion).toMatch(/^140\./u);
    expect(validateCustomFontSqliteOpfsEvidence(
      value.benchmark,
      value.diagnostics,
      value.fontSources,
      value.productionBuild.assets,
      value.productionBuild.assetReceipts,
    )).toEqual([]);
    expect(value.productionBuild.mode).toBe("vite-production-build");
    expect(value.productionBuild.fontBytesBundled).toBe(false);
    expect(value.productionBuild.assets.some((asset) => asset.endsWith(".wasm"))).toBe(true);
    expect(value.productionBuild.assets.some((asset) =>
      asset.includes("custom-font-sqlite-opfs-browser-worker") && asset.endsWith(".js")))
      .toBe(true);
  });

  it("pins a real 5–30 MiB CJK file and the largest local TTC below 128 MiB", () => {
    const value = artifact();
    const medium = value.fontSources.find(({ id }) => id === "cjk-medium");
    const largest = value.fontSources.find(({ id }) => id === "largest-ttc");
    expect(medium).toMatchObject({
      class: "cjk-5-30-mib",
      sourcePath: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
      format: "ttf",
      mimeType: "font/ttf",
    });
    expect(medium?.byteLength).toBeGreaterThanOrEqual(CUSTOM_FONT_MEDIUM_MIN_BYTES);
    expect(medium?.byteLength).toBeLessThanOrEqual(CUSTOM_FONT_MEDIUM_MAX_BYTES);
    expect(medium?.contentHash).toBe(`sha256:${medium?.sha256}`);
    expect(largest).toMatchObject({
      class: "largest-ttc-under-128-mib",
      sourcePath: "/System/Library/Fonts/Supplemental/Songti.ttc",
      format: "ttc",
      mimeType: "font/collection",
    });
    expect(largest?.byteLength).toBeGreaterThan(CUSTOM_FONT_MEDIUM_MAX_BYTES);
    expect(largest?.byteLength).toBeLessThanOrEqual(CUSTOM_FONT_LARGEST_TTC_MAX_BYTES);
    expect(largest?.contentHash).toBe(`sha256:${largest?.sha256}`);
    expect(value.fontSources.every(({ licenseCaveat }) =>
      licenseCaveat.includes("not copied")
      && licenseCaveat.includes("no redistribution"))).toBe(true);
    for (const source of value.fontSources) {
      expect(value.productionBuild.assetReceipts.some((asset) =>
        asset.bytes === source.byteLength || asset.sha256 === source.sha256)).toBe(false);
    }
  });

  it("retains every raw p50/p95/p99 sample for 30 real saves and loads per class", () => {
    const benchmark = record(artifact().benchmark);
    for (const lane of ["medium", "largestTtc"] as const) {
      const evidence = record(nested(benchmark, "primary", "classes", lane));
      expect(evidence).toMatchObject({
        saveCycles: CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
        loadCycles: CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
        saveMismatchCount: 0,
        loadMismatchCount: 0,
        exactAfterEveryRepositoryVerifiedLoad: true,
        exactExplicitShaAfterLoads: true,
      });
      for (const distributionKey of ["saveDistribution", "loadDistribution"] as const) {
        const receipt = record(evidence[distributionKey]);
        expect(receipt.sampleCount).toBe(CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES);
        expect(receipt.samplesMs as number[]).toHaveLength(
          CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
        );
        expect(Number(receipt.p50Ms)).toBeGreaterThanOrEqual(0);
        expect(Number(receipt.p95Ms)).toBeGreaterThanOrEqual(Number(receipt.p50Ms));
        expect(Number(receipt.p99Ms)).toBeGreaterThanOrEqual(Number(receipt.p95Ms));
      }
    }
    expect(nested(benchmark, "primary", "operationCounts")).toEqual({
      baselineSaves: 3,
      measuredSaves: 60,
      measuredLoads: 60,
      measuredDeletes: 61,
    });
  });

  it("pins normal fresh-Worker recovery and recovered ArrayBuffer FontFace pixels", () => {
    const benchmark = record(artifact().benchmark);
    expect(benchmark.normalReopen).toMatchObject({
      pass: true,
      normalCloseReopenInFreshWorker: true,
      receipts: [{ exact: true }, { exact: true }],
      closeCompleted: true,
    });
    expect(Number(nested(benchmark, "normalReopen", "recoveryLatencyMs")))
      .toBeGreaterThanOrEqual(0);
    expect(benchmark.normalReopen).toMatchObject({
      recoveryCycles: CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
      allRecoverySamplesPassed: true,
    });
    for (const distributionKey of [
      "reopenDatabaseDistribution",
      "verifiedListDistribution",
      "recoveryDistribution",
    ] as const) {
      const receipt = record(nested(benchmark, "normalReopen", distributionKey));
      expect(receipt.sampleCount).toBe(CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES);
      expect(receipt.samplesMs as number[]).toHaveLength(
        CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
      );
      expect(Number(receipt.p50Ms)).toBeGreaterThanOrEqual(0);
      expect(Number(receipt.p95Ms)).toBeGreaterThanOrEqual(Number(receipt.p50Ms));
      expect(Number(receipt.p99Ms)).toBeGreaterThanOrEqual(Number(receipt.p95Ms));
    }
    expect(benchmark.fontFace).toMatchObject({
      pass: true,
      decodeReceipts: [
        { pass: true, status: "loaded", documentFontsCheck: true },
        { pass: true, status: "loaded", documentFontsCheck: true },
      ],
      render: {
        deterministic: true,
        browserRasterEvidenceScope:
          "same-production-build-same-Chromium-same-system-font-bytes-two-renders",
      },
    });
    expect(nested(benchmark, "fontFace", "render", "firstPixelSha256"))
      .toBe(nested(benchmark, "fontFace", "render", "secondPixelSha256"));
    expect(nested(benchmark, "fontFace", "render", "firstPngSha256"))
      .toBe(nested(benchmark, "fontFace", "render", "secondPngSha256"));
    expect(Number(nested(benchmark, "fontFace", "render", "nonWhitePixels")))
      .toBeGreaterThan(1_000);
  });

  it("fails closed for missing, same-length corrupt, and metadata-mismatched fonts", () => {
    const faults = record(nested(artifact().benchmark, "faults"));
    expect(faults).toMatchObject({
      pass: true,
      missingCasObject: {
        failClosed: { pass: true, returnedPartialList: false, error: { code: "corrupt" } },
        recoveryExact: true,
      },
      corruptCasObject: {
        mutation: "same-length-final-byte-xor-ff-on-physical-opfs-blob",
        failClosed: { pass: true, returnedPartialList: false, error: { code: "corrupt" } },
        recoveryExact: true,
      },
      metadataMismatch: {
        mutation: "canonical-manifest-byteLength-and-totalBytes-plus-one",
        failClosed: { pass: true, returnedPartialList: false, error: { code: "corrupt" } },
        originalManifestRestored: true,
        recoveryExact: true,
      },
      partialListsReturned: 0,
      silentFallbacks: 0,
    });
  });

  it("pins committed-write Worker termination recovery with no pre-termination close", () => {
    const forced = record(nested(artifact().benchmark, "forcedTermination"));
    expect(forced).toMatchObject({
      pass: true,
      workerTerminateCalled: true,
      committedReceipt: {
        pass: true,
        manifestCommitted: true,
        databaseIntentionallyLeftOpen: true,
        closeCalledBeforeReceipt: false,
      },
      recovery: {
        pass: true,
        exactHashAndBytes: true,
        closeCalledAfterVerification: true,
      },
    });
    expect(Number(forced.terminateCallDelayMs)).toBeGreaterThanOrEqual(0);
    for (const distributionKey of [
      "internalRecoveryDistribution",
      "pageRecoveryDistribution",
    ] as const) {
      const receipt = record(forced[distributionKey]);
      expect(receipt).toMatchObject({ sampleCount: 1, percentileMethod: "nearest-rank-ceil" });
      expect(receipt.samplesMs as number[]).toHaveLength(1);
      expect(receipt.p50Ms).toBe(receipt.p95Ms);
      expect(receipt.p95Ms).toBe(receipt.p99Ms);
    }
    expect(Number(forced.forcedRecoveryElapsedMs)).toBeGreaterThanOrEqual(0);
  });

  it("records zero product fallback and honest measured-or-null memory", () => {
    const benchmark = record(artifact().benchmark);
    const fallbacks = [
      nested(benchmark, "primary", "fallback"),
      nested(benchmark, "normalReopen", "fallback"),
      nested(benchmark, "faults", "fallback"),
      nested(benchmark, "forcedTermination", "committedReceipt", "fallback"),
      nested(benchmark, "forcedTermination", "recovery", "fallback"),
    ];
    for (const value of fallbacks) {
      expect(value).toMatchObject({
        indexedDbAccessCount: 0,
        localStorageAccessCount: 0,
        memoryDatabaseOpenCount: 0,
        memoryAssetStoreCount: 0,
        totalFallbackCount: 0,
      });
    }
    for (const value of [
      nested(benchmark, "primary", "memory", "before"),
      nested(benchmark, "primary", "memory", "after"),
      nested(benchmark, "pageMemory", "before"),
      nested(benchmark, "pageMemory", "after"),
    ]) {
      const receipt = record(value);
      if (receipt.performanceMemory === null) {
        expect(receipt.performanceMemoryUnavailableReason).toEqual(expect.any(String));
      } else {
        expect(receipt.performanceMemoryUnavailableReason).toBeNull();
      }
      if (receipt.userAgentSpecificMemory === null) {
        expect(receipt.userAgentSpecificMemoryUnavailableReason).toEqual(expect.any(String));
      } else {
        expect(receipt.userAgentSpecificMemoryUnavailableReason).toBeNull();
      }
    }
  });

  it("records clean browser diagnostics and makes fallback tampering fail validation", () => {
    const value = artifact();
    expect(value.diagnostics).toMatchObject({
      consoleErrors: [],
      consoleWarnings: [],
      pageErrors: [],
      requestFailures: [],
      errorResponses: [],
    });
    expect(nested(value.benchmark, "pageSecurityPolicyViolations")).toEqual([]);
    expect(nested(value.benchmark, "primary", "securityPolicyViolations")).toEqual([]);
    const tampered = structuredClone(value.benchmark) as JsonRecord;
    record(nested(tampered, "primary", "fallback")).localStorageAccessCount = 1;
    record(nested(tampered, "primary", "fallback")).totalFallbackCount = 1;
    const issues = validateCustomFontSqliteOpfsEvidence(
      tampered,
      value.diagnostics,
      value.fontSources,
      value.productionBuild.assets,
      value.productionBuild.assetReceipts,
    );
    expect(issues).toContain(
      "localStorage, IndexedDB, memory DB, or memory CAS fallback was observed",
    );
  });
});
