/**
 * Actual Vite production build + Chromium module Dedicated Worker evidence for custom fonts.
 *
 * Reproduce from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/custom-font-sqlite-opfs-browser.ts
 *
 * Locally installed system-font bytes are streamed to the ephemeral preview origin. They are not
 * copied into the repository, scratch source, production bundle, screenshots, or result artifact.
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { build, preview, type Plugin, type PreviewServer } from "vite";

export const CUSTOM_FONT_SQLITE_OPFS_REPORT_SCHEMA_VERSION = 1 as const;
export const CUSTOM_FONT_SQLITE_OPFS_RESULT_GLOBAL =
  "__TOONSPECTRUM_CUSTOM_FONT_SQLITE_OPFS_RESULT__";
export const CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES = 30;
export const CUSTOM_FONT_MEDIUM_MIN_BYTES = 5 * 1024 * 1024;
export const CUSTOM_FONT_MEDIUM_MAX_BYTES = 30 * 1024 * 1024;
export const CUSTOM_FONT_LARGEST_TTC_MAX_BYTES = 128 * 1024 * 1024;

const RESULT_TIMEOUT_MS = 30 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/custom-font-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/custom-font-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:custom-font-sqlite-opfs-browser-page";
const FIXTURE_ROUTE_PREFIX = "/__custom-font-fixture__/";
const LICENSE_CAVEAT =
  "Locally installed macOS system font used only as benchmark input. The file is not copied, "
  + "committed, bundled, or redistributed; use and redistribution remain governed by the OS/font "
  + "license. This evidence grants no redistribution or embedding rights.";
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  "style-src 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

type JsonRecord = Record<string, unknown>;
type FontFormat = "ttf" | "otf" | "ttc" | "woff" | "woff2";

export interface CustomFontFixtureDescriptor {
  readonly id: "cjk-medium" | "largest-ttc";
  readonly class: "cjk-5-30-mib" | "largest-ttc-under-128-mib";
  readonly url: string;
  readonly sourcePath: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly contentHash: `sha256:${string}`;
  readonly format: FontFormat;
  readonly mimeType: string;
  readonly licenseCaveat: string;
}

interface SelectedFontFixture extends CustomFontFixtureDescriptor {
  readonly sourcePath: string;
}

export interface CustomFontSqliteOpfsDiagnostics {
  readonly browserVersion: string;
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly pageErrors: readonly string[];
  readonly requestFailures: readonly string[];
  readonly errorResponses: readonly string[];
  readonly requests: readonly Readonly<{
    method: string;
    resourceType: string;
    url: string;
  }>[];
  readonly responses: readonly Readonly<{ status: number; url: string }>[];
  readonly responseHeaders: Readonly<{
    contentSecurityPolicy: string;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
    crossOriginResourcePolicy: string;
  }>;
}

export interface CustomFontProductionAssetReceipt {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CustomFontSqliteOpfsArtifact {
  readonly schemaVersion: typeof CUSTOM_FONT_SQLITE_OPFS_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly fontSources: readonly CustomFontFixtureDescriptor[];
  readonly benchmark: unknown;
  readonly diagnostics: CustomFontSqliteOpfsDiagnostics;
  readonly productionBuild: Readonly<{
    mode: "vite-production-build";
    assets: readonly string[];
    assetReceipts: readonly CustomFontProductionAssetReceipt[];
    fontBytesBundled: false;
    scratchDirectory: string;
  }>;
  readonly validationIssues: readonly string[];
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nested(value: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return current;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sha256Valid(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function distributionValid(value: unknown, count: number): boolean {
  const candidate = record(value);
  const samples = candidate?.samplesMs;
  if (
    candidate?.sampleCount !== count
    || candidate?.percentileMethod !== "nearest-rank-ceil"
    || !Array.isArray(samples)
    || samples.length !== count
    || !samples.every((sample) => (finite(sample) ?? -1) >= 0)
  ) return false;
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
    return sorted[Math.min(sorted.length - 1, index)] ?? 0;
  };
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = finite(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, at(0.5))
    && close(candidate.p95Ms, at(0.95))
    && close(candidate.p99Ms, at(0.99));
}

function memoryReceiptHonest(value: unknown): boolean {
  const receipt = record(value);
  if (!receipt) return false;
  for (const [metric, reason] of [
    ["performanceMemory", "performanceMemoryUnavailableReason"],
    ["userAgentSpecificMemory", "userAgentSpecificMemoryUnavailableReason"],
  ] as const) {
    const measured = receipt[metric];
    const unavailableReason = receipt[reason];
    if (measured === null) {
      if (typeof unavailableReason !== "string" || unavailableReason.length === 0) return false;
    } else if (record(measured) === null || unavailableReason !== null) {
      return false;
    }
  }
  return true;
}

function fallbackZero(value: unknown): boolean {
  const receipt = record(value);
  return receipt?.indexedDbAccessCount === 0
    && receipt.localStorageAccessCount === 0
    && receipt.memoryDatabaseOpenCount === 0
    && receipt.memoryAssetStoreCount === 0
    && receipt.totalFallbackCount === 0;
}

export function validateCustomFontSqliteOpfsEvidence(
  benchmark: unknown,
  diagnostics: CustomFontSqliteOpfsDiagnostics,
  fontSources: readonly CustomFontFixtureDescriptor[],
  productionAssets: readonly string[],
  assetReceipts: readonly CustomFontProductionAssetReceipt[],
): readonly string[] {
  const issues: string[] = [];
  if (
    nested(benchmark, "status") !== "ok"
    || nested(benchmark, "pass") !== true
    || nested(benchmark, "primary", "status") !== "ok"
    || nested(benchmark, "primary", "pass") !== true
    || nested(benchmark, "primary", "execution")
      !== "vite-production-build-chromium-module-dedicated-worker-real-sqlite-opfs-sahpool-product-cas"
  ) {
    issues.push("browser did not produce passing custom-font production evidence");
  }

  const mediumSource = fontSources.find(({ id }) => id === "cjk-medium");
  const largestSource = fontSources.find(({ id }) => id === "largest-ttc");
  if (
    fontSources.length !== 2
    || !mediumSource
    || mediumSource.byteLength < CUSTOM_FONT_MEDIUM_MIN_BYTES
    || mediumSource.byteLength > CUSTOM_FONT_MEDIUM_MAX_BYTES
    || !sha256Valid(mediumSource.sha256)
    || mediumSource.contentHash !== `sha256:${mediumSource.sha256}`
    || !largestSource
    || largestSource.format !== "ttc"
    || largestSource.byteLength <= CUSTOM_FONT_MEDIUM_MAX_BYTES
    || largestSource.byteLength > CUSTOM_FONT_LARGEST_TTC_MAX_BYTES
    || !sha256Valid(largestSource.sha256)
    || largestSource.contentHash !== `sha256:${largestSource.sha256}`
    || fontSources.some(({ licenseCaveat }) => !licenseCaveat.includes("not copied")
      || !licenseCaveat.includes("no redistribution"))
  ) {
    issues.push("system CJK font source classes, receipts, or license caveat are incomplete");
  }

  const opened = nested(benchmark, "primary", "authority", "openedOpfsDatabaseFilenames");
  const installed = nested(benchmark, "primary", "authority", "installedOpfsDirectories");
  if (
    nested(benchmark, "primary", "authority", "repository")
      !== "StudioCustomFontSqliteOpfsRepository"
    || nested(benchmark, "primary", "authority", "repositoryFactory")
      !== "createStudioCustomFontSqliteOpfsRepository-no-options"
    || nested(benchmark, "primary", "authority", "repositoryAuthority") !== "sqlite-opfs"
    || nested(benchmark, "primary", "authority", "runtimeAcquire")
      !== "acquireStudioLocalDatabase"
    || nested(benchmark, "primary", "authority", "requestedVfs") !== "opfs"
    || nested(benchmark, "primary", "authority", "sqliteOpfsDirectory")
      !== "toonspectrum-studio-sqlite"
    || nested(benchmark, "primary", "authority", "sqliteDatabaseFilename")
      !== "studio-local-v12.db"
    || nested(benchmark, "primary", "authority", "expectedOpenFilename")
      !== "/studio-local-v12.db"
    || nested(benchmark, "primary", "authority", "casOpfsRoot")
      !== "toonspectrum-studio-assets"
    || nested(benchmark, "primary", "authority", "casKind") !== "opfs"
    || nested(benchmark, "primary", "authority", "namespace")
      !== "studio-custom-font-library-v12"
    || nested(benchmark, "primary", "authority", "manifestKey") !== "manifest-v1"
    || nested(benchmark, "primary", "authority", "normalCloseCompleted") !== true
    || !Array.isArray(opened)
    || opened.length !== 1
    || opened[0] !== "/studio-local-v12.db"
    || !Array.isArray(installed)
    || installed.length !== 1
    || installed[0] !== "toonspectrum-studio-sqlite"
  ) {
    issues.push("authority receipt does not prove the real shared SQLite/OPFS product repository");
  }

  if (
    nested(benchmark, "primary", "support", "wasm") !== true
    || nested(benchmark, "primary", "support", "opfs") !== true
    || nested(benchmark, "primary", "capabilities", "dedicatedWorker") !== true
    || nested(benchmark, "primary", "capabilities", "secureContext") !== true
    || nested(benchmark, "primary", "capabilities", "crossOriginIsolated") !== true
    || nested(benchmark, "primary", "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(benchmark, "primary", "capabilities", "syncAccessHandle") !== true
    || nested(benchmark, "primary", "capabilities", "cryptoSubtle") !== true
    || nested(benchmark, "primary", "capabilities", "webLocks") !== true
  ) {
    issues.push("required Dedicated Worker/SQLite/OPFS/crypto/Web Locks capabilities are incomplete");
  }

  for (const lane of ["medium", "largestTtc"] as const) {
    if (
      nested(benchmark, "primary", "classes", lane, "saveCycles")
        !== CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES
      || nested(benchmark, "primary", "classes", lane, "loadCycles")
        !== CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES
      || nested(benchmark, "primary", "classes", lane, "saveMismatchCount") !== 0
      || nested(benchmark, "primary", "classes", lane, "loadMismatchCount") !== 0
      || nested(benchmark, "primary", "classes", lane, "exactAfterEveryRepositoryVerifiedLoad")
        !== true
      || nested(benchmark, "primary", "classes", lane, "exactExplicitShaAfterLoads") !== true
      || !sha256Valid(nested(benchmark, "primary", "classes", lane, "finalExplicitSha256"))
      || !distributionValid(
        nested(benchmark, "primary", "classes", lane, "saveDistribution"),
        CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
      )
      || !distributionValid(
        nested(benchmark, "primary", "classes", lane, "loadDistribution"),
        CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
      )
    ) {
      issues.push(`${lane} does not retain 30 exact save/load samples and SHA verification`);
    }
  }

  if (
    nested(benchmark, "primary", "finalLibrary", "count") !== 2
    || nested(benchmark, "primary", "finalLibrary", "mediumExact") !== true
    || nested(benchmark, "primary", "finalLibrary", "largestTtcExact") !== true
    || nested(benchmark, "primary", "finalLibrary", "manifestCanonical") !== true
    || nested(benchmark, "primary", "finalLibrary", "manifestContainsBinaryEncoding") !== false
    || nested(benchmark, "primary", "operationCounts", "measuredSaves")
      !== CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES * 2
    || nested(benchmark, "primary", "operationCounts", "measuredLoads")
      !== CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES * 2
  ) {
    issues.push("final two-font canonical manifest or operation counts are incomplete");
  }

  const reopenReceipts = nested(benchmark, "normalReopen", "receipts");
  if (
    nested(benchmark, "normalReopen", "pass") !== true
    || nested(benchmark, "normalReopen", "normalCloseReopenInFreshWorker") !== true
    || nested(benchmark, "normalReopen", "recoveryCycles")
      !== CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES
    || nested(benchmark, "normalReopen", "allRecoverySamplesPassed") !== true
    || !distributionValid(
      nested(benchmark, "normalReopen", "reopenDatabaseDistribution"),
      CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normalReopen", "verifiedListDistribution"),
      CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normalReopen", "recoveryDistribution"),
      CUSTOM_FONT_SQLITE_OPFS_OPERATION_SAMPLES,
    )
    || (finite(nested(benchmark, "normalReopen", "recoveryLatencyMs")) ?? -1) < 0
    || !Array.isArray(reopenReceipts)
    || reopenReceipts.length !== 2
    || reopenReceipts.some((receipt) => record(receipt)?.exact !== true)
  ) {
    issues.push("normal close/reopen did not recover both exact fonts in a fresh Worker");
  }

  const decodeReceipts = nested(benchmark, "fontFace", "decodeReceipts");
  if (
    nested(benchmark, "fontFace", "pass") !== true
    || !Array.isArray(decodeReceipts)
    || decodeReceipts.length !== 2
    || decodeReceipts.some((receipt) => record(receipt)?.pass !== true)
    || nested(benchmark, "fontFace", "render", "deterministic") !== true
    || !sha256Valid(nested(benchmark, "fontFace", "render", "firstPixelSha256"))
    || nested(benchmark, "fontFace", "render", "firstPixelSha256")
      !== nested(benchmark, "fontFace", "render", "secondPixelSha256")
    || !sha256Valid(nested(benchmark, "fontFace", "render", "firstPngSha256"))
    || nested(benchmark, "fontFace", "render", "firstPngSha256")
      !== nested(benchmark, "fontFace", "render", "secondPngSha256")
    || (finite(nested(benchmark, "fontFace", "render", "nonWhitePixels")) ?? 0) <= 1_000
  ) {
    issues.push("recovered ArrayBuffer FontFace decode or deterministic CJK canvas render failed");
  }

  if (
    nested(benchmark, "faults", "pass") !== true
    || nested(benchmark, "faults", "missingCasObject", "failClosed", "pass") !== true
    || nested(benchmark, "faults", "corruptCasObject", "failClosed", "pass") !== true
    || nested(benchmark, "faults", "metadataMismatch", "failClosed", "pass") !== true
    || nested(benchmark, "faults", "missingCasObject", "recoveryExact") !== true
    || nested(benchmark, "faults", "corruptCasObject", "recoveryExact") !== true
    || nested(benchmark, "faults", "metadataMismatch", "recoveryExact") !== true
    || nested(benchmark, "faults", "partialListsReturned") !== 0
    || nested(benchmark, "faults", "silentFallbacks") !== 0
  ) {
    issues.push("missing/corrupt CAS or metadata mismatch did not fail closed and recover exactly");
  }

  if (
    nested(benchmark, "forcedTermination", "pass") !== true
    || nested(benchmark, "forcedTermination", "workerTerminateCalled") !== true
    || nested(benchmark, "forcedTermination", "committedReceipt", "manifestCommitted") !== true
    || nested(benchmark, "forcedTermination", "committedReceipt", "closeCalledBeforeReceipt")
      !== false
    || nested(benchmark, "forcedTermination", "recovery", "pass") !== true
    || nested(benchmark, "forcedTermination", "recovery", "exactHashAndBytes") !== true
    || !distributionValid(
      nested(benchmark, "forcedTermination", "internalRecoveryDistribution"),
      1,
    )
    || !distributionValid(
      nested(benchmark, "forcedTermination", "pageRecoveryDistribution"),
      1,
    )
    || (finite(nested(benchmark, "forcedTermination", "forcedRecoveryElapsedMs")) ?? -1) < 0
  ) {
    issues.push("forced Dedicated Worker termination did not recover the committed exact font");
  }

  for (const fallback of [
    nested(benchmark, "primary", "fallback"),
    nested(benchmark, "normalReopen", "fallback"),
    nested(benchmark, "faults", "fallback"),
    nested(benchmark, "forcedTermination", "committedReceipt", "fallback"),
    nested(benchmark, "forcedTermination", "recovery", "fallback"),
  ]) {
    if (!fallbackZero(fallback)) {
      issues.push("localStorage, IndexedDB, memory DB, or memory CAS fallback was observed");
      break;
    }
  }

  if (
    !memoryReceiptHonest(nested(benchmark, "primary", "memory", "before"))
    || !memoryReceiptHonest(nested(benchmark, "primary", "memory", "after"))
    || !memoryReceiptHonest(nested(benchmark, "pageMemory", "before"))
    || !memoryReceiptHonest(nested(benchmark, "pageMemory", "after"))
  ) {
    issues.push("memory evidence is estimated or omits an unavailable reason");
  }

  if (
    !productionAssets.some((asset) => asset.endsWith(".wasm"))
    || !productionAssets.some((asset) =>
      asset.includes("custom-font-sqlite-opfs-browser-worker") && asset.endsWith(".js"))
    || fontSources.some((source) => assetReceipts.some((asset) =>
      asset.bytes === source.byteLength || asset.sha256 === source.sha256))
  ) {
    issues.push("production bundle lacks Worker/WASM or contains a system-font payload");
  }

  const pageViolations = nested(benchmark, "pageSecurityPolicyViolations");
  const workerViolations = nested(benchmark, "primary", "securityPolicyViolations");
  if (
    !Array.isArray(pageViolations)
    || pageViolations.length !== 0
    || !Array.isArray(workerViolations)
    || workerViolations.length !== 0
  ) {
    issues.push("page or Worker reported CSP violations");
  }
  if (
    diagnostics.consoleErrors.length > 0
    || diagnostics.consoleWarnings.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.requestFailures.length > 0
    || diagnostics.errorResponses.length > 0
  ) {
    issues.push("Chromium diagnostics contain console/page/network errors or warnings");
  }
  if (
    diagnostics.responseHeaders.crossOriginOpenerPolicy !== "same-origin"
    || diagnostics.responseHeaders.crossOriginEmbedderPolicy !== "require-corp"
    || diagnostics.responseHeaders.crossOriginResourcePolicy !== "same-origin"
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("wasm-unsafe-eval")
  ) {
    issues.push("preview response lacks required COOP/COEP/CORP/wasm CSP headers");
  }
  return issues;
}

function sniffFontFormat(path: string): FontFormat {
  const descriptor = openSync(path, "r");
  try {
    const bytes = Buffer.alloc(4);
    if (readSync(descriptor, bytes, 0, 4, 0) !== 4) {
      throw new Error(`font is shorter than four bytes: ${path}`);
    }
    if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return "ttf";
    const magic = bytes.toString("ascii");
    if (magic === "OTTO") return "otf";
    if (magic === "ttcf") return "ttc";
    if (magic === "true") return "ttf";
    if (magic === "wOFF") return "woff";
    if (magic === "wOF2") return "woff2";
    throw new Error(`unrecognized font magic ${JSON.stringify(magic)}: ${path}`);
  } finally {
    closeSync(descriptor);
  }
}

function fontMime(format: FontFormat): string {
  return {
    ttf: "font/ttf",
    otf: "font/otf",
    ttc: "font/collection",
    woff: "font/woff",
    woff2: "font/woff2",
  }[format];
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function collectTtcFiles(directory: string, result: string[]): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTtcFiles(path, result);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".ttc") result.push(path);
  }
}

async function selectFontFixtures(): Promise<readonly SelectedFontFixture[]> {
  const preferredMedium = [
    // AppleGothic was measured first but Chromium 140 OTS rejects its legacy table directory
    // (bad rangeShift and missing required OS/2). Arial Unicode is the next local 5–30 MiB CJK
    // candidate and contains Korean, Japanese, and Chinese coverage for the render proof.
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/AppleMyungjo.ttf",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc",
  ];
  const mediumPath = preferredMedium.find((path) => {
    if (!existsSync(path)) return false;
    const size = statSync(path).size;
    return size >= CUSTOM_FONT_MEDIUM_MIN_BYTES && size <= CUSTOM_FONT_MEDIUM_MAX_BYTES;
  });
  if (!mediumPath) {
    throw new Error("no locally installed 5–30 MiB CJK font fixture is available");
  }

  const ttcFiles: string[] = [];
  for (const root of ["/System/Library/Fonts", "/Library/Fonts"]) collectTtcFiles(root, ttcFiles);
  const largestPath = ttcFiles
    .map((path) => ({ path, bytes: statSync(path).size }))
    .filter(({ bytes }) => bytes > CUSTOM_FONT_MEDIUM_MAX_BYTES
      && bytes <= CUSTOM_FONT_LARGEST_TTC_MAX_BYTES)
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))[0]?.path;
  if (!largestPath) {
    throw new Error("no locally installed 30–128 MiB TTC fixture is available");
  }

  const selected = [
    { id: "cjk-medium", class: "cjk-5-30-mib", path: mediumPath },
    { id: "largest-ttc", class: "largest-ttc-under-128-mib", path: largestPath },
  ] as const;
  return Promise.all(selected.map(async ({ id, class: fontClass, path }) => {
    const sourcePath = realpathSync(path);
    const byteLength = statSync(sourcePath).size;
    const sha256 = await sha256File(sourcePath);
    const format = sniffFontFormat(sourcePath);
    return {
      id,
      class: fontClass,
      url: `${FIXTURE_ROUTE_PREFIX}${id}`,
      sourcePath,
      fileName: basename(sourcePath),
      byteLength,
      sha256,
      contentHash: `sha256:${sha256}` as const,
      format,
      mimeType: fontMime(format),
      licenseCaveat: LICENSE_CAVEAT,
    };
  }));
}

function createFontFixturePlugin(fixtures: readonly SelectedFontFixture[]): Plugin {
  const byRoute = new Map(fixtures.map((fixture) => [fixture.url, fixture]));
  return {
    name: "toonspectrum-custom-font-system-fixtures",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url
          ? new URL(request.url, "http://127.0.0.1").pathname
          : "";
        const fixture = byRoute.get(requestUrl);
        if (!fixture) {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.end("method not allowed");
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", fixture.mimeType);
        response.setHeader("Content-Length", String(fixture.byteLength));
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        const stream = createReadStream(fixture.sourcePath);
        stream.once("error", (error) => {
          if (!response.headersSent) response.statusCode = 500;
          response.destroy(error);
        });
        stream.pipe(response);
      });
    },
  };
}

function walkFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolute = join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(absolute).isDirectory()
      ? walkFiles(absolute, relative)
      : [relative];
  }).sort();
}

function assetReceipts(
  directory: string,
  assets: readonly string[],
): CustomFontProductionAssetReceipt[] {
  return assets.map((path) => {
    const bytes = readFileSync(join(directory, path));
    return {
      path,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a custom-font OPFS benchmark port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function createHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Custom font SQLite OPFS production evidence</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Custom font SQLite OPFS production evidence</h1>",
    '<pre data-benchmark-output>running</pre>',
    "</main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function observePage(page: Page, browserVersion: string): CustomFontSqliteOpfsDiagnostics {
  const diagnostics = {
    browserVersion,
    consoleErrors: [] as string[],
    consoleWarnings: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
    errorResponses: [] as string[],
    requests: [] as Array<{ method: string; resourceType: string; url: string }>,
    responses: [] as Array<{ status: number; url: string }>,
    responseHeaders: {
      contentSecurityPolicy: "",
      crossOriginOpenerPolicy: "",
      crossOriginEmbedderPolicy: "",
      crossOriginResourcePolicy: "",
    },
  };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => diagnostics.requests.push({
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  }));
  page.on("requestfailed", (request) => diagnostics.requestFailures.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
  ));
  page.on("response", (response) => {
    diagnostics.responses.push({ status: response.status(), url: response.url() });
    if (response.status() >= 400) {
      diagnostics.errorResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return diagnostics;
}

async function waitForResult(page: Page): Promise<unknown> {
  await page.waitForFunction(
    (name) => (window as unknown as Record<string, unknown>)[name] !== undefined,
    CUSTOM_FONT_SQLITE_OPFS_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    CUSTOM_FONT_SQLITE_OPFS_RESULT_GLOBAL,
  );
}

export async function runCustomFontSqliteOpfsBrowserEvidence(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<CustomFontSqliteOpfsArtifact> {
  const fixtures = await selectFontFixtures();
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-custom-font-opfs-"));
  const sourceDirectory = join(scratch, "production-source");
  const distributionDirectory = join(scratch, "production-dist");
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(distributionDirectory, { recursive: true });
  const viteSourceDirectory = realpathSync(sourceDirectory);
  const viteDistributionDirectory = realpathSync(distributionDirectory);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(join(sourceDirectory, "entry.ts"), `import ${JSON.stringify(PAGE_ALIAS)};\n`);
  const fixtureDefine = JSON.stringify(fixtures);
  const plugin = createFontFixturePlugin(fixtures);

  await build({
    root: viteSourceDirectory,
    configFile: false,
    cacheDir: join(scratch, "vite-cache"),
    clearScreen: false,
    logLevel: "error",
    base: "/",
    plugins: [plugin],
    define: { __CUSTOM_FONT_BENCHMARK_FIXTURES__: fixtureDefine },
    resolve: { alias: [{ find: PAGE_ALIAS, replacement: PAGE_ENTRY }] },
    build: {
      outDir: viteDistributionDirectory,
      emptyOutDir: true,
      target: "es2022",
      minify: true,
      sourcemap: true,
      manifest: true,
    },
  });
  const assets = walkFiles(viteDistributionDirectory);
  const receipts = assetReceipts(viteDistributionDirectory, assets);
  const fontBytesBundled = fixtures.some((fixture) => receipts.some((asset) =>
    asset.bytes === fixture.byteLength || asset.sha256 === fixture.sha256));
  if (fontBytesBundled) {
    throw new Error("system font bytes unexpectedly appeared in the production build");
  }

  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let diagnostics: CustomFontSqliteOpfsDiagnostics;
  let benchmark: unknown;
  try {
    previewServer = await preview({
      root: viteSourceDirectory,
      configFile: false,
      clearScreen: false,
      logLevel: "error",
      plugins: [plugin],
      build: { outDir: viteDistributionDirectory },
      preview: {
        host: "127.0.0.1",
        port,
        strictPort: true,
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": CONTENT_SECURITY_POLICY,
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin",
          "Origin-Agent-Cluster": "?1",
          "X-Content-Type-Options": "nosniff",
        },
      },
    });
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--enable-precise-memory-info"],
    });
    context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    diagnostics = observePage(page, browser.version());
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    (diagnostics as { responseHeaders: CustomFontSqliteOpfsDiagnostics["responseHeaders"] })
      .responseHeaders = {
        contentSecurityPolicy: await response?.headerValue("content-security-policy") ?? "",
        crossOriginOpenerPolicy: await response?.headerValue("cross-origin-opener-policy") ?? "",
        crossOriginEmbedderPolicy: await response?.headerValue("cross-origin-embedder-policy") ?? "",
        crossOriginResourcePolicy:
          await response?.headerValue("cross-origin-resource-policy") ?? "",
      };
    benchmark = await waitForResult(page);
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const publicFixtures: CustomFontFixtureDescriptor[] = fixtures.map((fixture) => ({ ...fixture }));
  const validationIssues = validateCustomFontSqliteOpfsEvidence(
    benchmark,
    diagnostics,
    publicFixtures,
    assets,
    receipts,
  );
  const browserStatus = nested(benchmark, "status");
  const status: CustomFontSqliteOpfsArtifact["status"] = browserStatus === "unsupported"
    ? "unsupported"
    : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: CustomFontSqliteOpfsArtifact = {
    schemaVersion: CUSTOM_FONT_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    pass: status === "pass",
    fontSources: publicFixtures,
    benchmark,
    diagnostics,
    productionBuild: {
      mode: "vite-production-build",
      assets,
      assetReceipts: receipts,
      fontBytesBundled: false,
      scratchDirectory: scratch,
    },
    validationIssues,
  };
  writeJson(options.resultPath ?? TRACKED_RESULT, artifact);
  return artifact;
}

function emptyDiagnostics(): CustomFontSqliteOpfsDiagnostics {
  return {
    browserVersion: "unavailable",
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    requests: [],
    responses: [],
    responseHeaders: {
      contentSecurityPolicy: "",
      crossOriginOpenerPolicy: "",
      crossOriginEmbedderPolicy: "",
      crossOriginResourcePolicy: "",
    },
  };
}

async function main(): Promise<void> {
  const resultPath = process.env.TOONSPECTRUM_CUSTOM_FONT_OPFS_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runCustomFontSqliteOpfsBrowserEvidence({
      scratchDirectory: process.env.TOONSPECTRUM_CUSTOM_FONT_OPFS_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      browserVersion: artifact.diagnostics.browserVersion,
      fontSources: artifact.fontSources,
      medium: nested(artifact.benchmark, "primary", "classes", "medium"),
      largestTtc: nested(artifact.benchmark, "primary", "classes", "largestTtc"),
      normalReopen: nested(artifact.benchmark, "normalReopen"),
      fontFace: nested(artifact.benchmark, "fontFace"),
      faults: nested(artifact.benchmark, "faults"),
      forcedTermination: nested(artifact.benchmark, "forcedTermination"),
      diagnostics: artifact.diagnostics,
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: CustomFontSqliteOpfsArtifact = {
      schemaVersion: CUSTOM_FONT_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: "fail",
      pass: false,
      fontSources: [],
      benchmark: {
        status: "error",
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack ?? null }
          : { name: "NonError", message: String(error) },
      },
      diagnostics: emptyDiagnostics(),
      productionBuild: {
        mode: "vite-production-build",
        assets: [],
        assetReceipts: [],
        fontBytesBundled: false,
        scratchDirectory:
          process.env.TOONSPECTRUM_CUSTOM_FONT_OPFS_VERIFY_DIR ?? "unavailable",
      },
      validationIssues: ["benchmark orchestrator failed before valid browser evidence"],
    };
    writeJson(resultPath, failure);
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
