/**
 * Real Chromium + production-bundled Vite gate for CRDT recovery-vault v6 SQLite/OPFS.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser.ts
 *
 * Exit codes: 0 pass, 1 measured failure, 2 honest environment unsupported.
 */

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";

export const CRDT_RECOVERY_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION = 1 as const;
export const CRDT_RECOVERY_SQLITE_OPFS_BROWSER_RESULT_GLOBAL =
  "__TOONSPECTRUM_CRDT_RECOVERY_SQLITE_OPFS_BROWSER_RESULT__";
export const CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES = 30;
export const CRDT_RECOVERY_SQLITE_OPFS_BROWSER_EXPORT_SAMPLES = 31;

const RESULT_TIMEOUT_MS = 20 * 60 * 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/results/crdt-recovery-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:crdt-recovery-sqlite-opfs-browser-page";
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  "style-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

type JsonRecord = Record<string, unknown>;

export interface CrdtRecoverySqliteOpfsBrowserDiagnostics {
  readonly browserVersion: string;
  readonly consoleErrors: readonly string[];
  readonly expectedQuarantinedConsoleErrors: readonly string[];
  readonly unexpectedConsoleErrors: readonly string[];
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

export interface CrdtRecoverySqliteOpfsBrowserArtifact {
  readonly schemaVersion: typeof CRDT_RECOVERY_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: CrdtRecoverySqliteOpfsBrowserDiagnostics;
  readonly productionBuild: Readonly<{
    mode: "vite-production-build";
    assets: readonly string[];
    assetBytes: Readonly<Record<string, number>>;
    totalBytes: number;
    scratchDirectory: string;
    buildMs: number;
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

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function distributionIsComplete(value: unknown, sampleCount: number): boolean {
  const candidate = record(value);
  const samples = candidate?.samplesMs;
  if (
    candidate?.sampleCount !== sampleCount
    || candidate.percentileMethod !== "nearest-rank-ceil"
    || !Array.isArray(samples)
    || samples.length !== sampleCount
    || !samples.every((sample) => finiteNumber(sample) !== null && Number(sample) >= 0)
  ) return false;
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
    return sorted[Math.min(sorted.length - 1, index)] ?? 0;
  };
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = finiteNumber(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, at(0.5))
    && close(candidate.p95Ms, at(0.95))
    && close(candidate.p99Ms, at(0.99));
}

function hasSha256(value: unknown): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? ""));
}

function memoryReceiptIsHonest(value: unknown): boolean {
  const receipt = record(value);
  if (!receipt) return false;
  return ["performanceMemory", "userAgentSpecific"].every((key) =>
    receipt[key] === null || record(receipt[key]) !== null);
}

/** Pure gate shared by the runner and the tracked-result Vitest contract. */
export function validateCrdtRecoverySqliteOpfsBrowserEvidence(
  benchmark: unknown,
  diagnostics: CrdtRecoverySqliteOpfsBrowserDiagnostics,
  productionAssets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const result = record(benchmark);
  if (
    result?.status !== "ok"
    || result.pass !== true
    || result.schemaVersion !== CRDT_RECOVERY_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION
    || result.execution !== "vite-production-build-chromium-dedicated-workers"
  ) issues.push("browser did not produce a passing Dedicated Worker OPFS benchmark");

  if (!/^\d+\./u.test(diagnostics.browserVersion)) {
    issues.push("measured Chromium version is absent");
  }
  if (
    nested(result, "authority", "kind") !== "shared-sqlite-opfs-crdt-recovery-v6"
    || nested(result, "authority", "requestedVfs") !== "opfs"
    || nested(result, "authority", "sqliteOpfsDirectory") !== "toonspectrum-studio-sqlite"
    || nested(result, "authority", "sqliteFilename") !== "studio-local-v12.db"
    || nested(result, "authority", "schemaVersion") !== 6
    || nested(result, "authority", "table") !== "crdt_recovery_v12_rows"
    || !Array.isArray(nested(result, "authority", "installedOpfsDirectories"))
    || !(nested(result, "authority", "installedOpfsDirectories") as unknown[])
      .includes("toonspectrum-studio-sqlite")
    || !Array.isArray(nested(result, "authority", "openedOpfsDatabaseFilenames"))
    || !(nested(result, "authority", "openedOpfsDatabaseFilenames") as unknown[])
      .includes("/studio-local-v12.db")
    || !Array.isArray(nested(result, "authority", "openedMemoryDatabaseFilenames"))
    || (nested(result, "authority", "openedMemoryDatabaseFilenames") as unknown[]).length !== 0
  ) issues.push("authority receipt does not prove the shared v6 SQLite/OPFS product path");

  const seed = nested(result, "gracefulRestart", "seed");
  const reopen = nested(result, "gracefulRestart", "reopen");
  if (
    nested(result, "gracefulRestart", "pass") !== true
    || nested(seed, "execution") !==
      "vite-production-build-chromium-dedicated-worker-opfs-sahpool"
    || nested(seed, "capabilities", "dedicatedWorker") !== true
    || nested(seed, "capabilities", "secureContext") !== true
    || nested(seed, "capabilities", "crossOriginIsolated") !== true
    || nested(seed, "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(seed, "capabilities", "syncAccessHandle") !== true
    || nested(seed, "support", "wasm") !== true
    || nested(seed, "support", "opfs") !== true
  ) issues.push("normal close/reopen did not run in a real isolated OPFS Worker");
  if (
    nested(seed, "expected", "frontierCount") !== 31
    || nested(seed, "expected", "updateCount") !== 4_127
    || nested(seed, "expected", "rowCount") !== 95
    || !hasSha256(nested(seed, "expected", "digest"))
    || nested(seed, "exact", "frontierCount") !== 31
    || nested(seed, "exact", "updateCount") !== 4_127
    || nested(seed, "exact", "markerCount") !== 1
    || nested(seed, "exact", "match") !== true
    || nested(seed, "exact", "digest") !== nested(seed, "expected", "digest")
    || nested(seed, "rows", "rowCount") !== 95
    || nested(seed, "rows", "kindCounts", "permanent-rejection") !== 1
    || nested(seed, "rows", "kindCounts", "frontier-chunk") !== 63
    || nested(seed, "rows", "kindCounts", "frontier-manifest") !== 31
    || nested(seed, "rows", "rowKeysUnique") !== true
    || nested(seed, "gracefulCloseCompleted") !== true
  ) issues.push("multi-chunk marker/frontier seed receipt is incomplete or lossy");
  if (
    nested(reopen, "exact", "frontierCount") !== 31
    || nested(reopen, "exact", "updateCount") !== 4_127
    || nested(reopen, "exact", "markerCount") !== 1
    || nested(reopen, "exact", "exportedCount") !== 31
    || nested(reopen, "exact", "loadMismatchCount") !== 0
    || nested(reopen, "exact", "match") !== true
    || nested(reopen, "exact", "digest") !== nested(seed, "expected", "digest")
    || nested(reopen, "exact", "bundleDigest") !== nested(seed, "expected", "digest")
    || nested(reopen, "rows", "rowCount") !== 95
    || nested(reopen, "gracefulCloseCompleted") !== true
  ) issues.push("fresh Worker reopen/export did not preserve exact updates and digest");

  if (!distributionIsComplete(
    nested(result, "metrics", "save"),
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
  )) issues.push("save p50/p95/p99 distribution is incomplete");
  if (!distributionIsComplete(
    nested(result, "metrics", "load"),
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
  )) issues.push("load p50/p95/p99 distribution is incomplete");
  if (!distributionIsComplete(
    nested(result, "metrics", "export"),
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_EXPORT_SAMPLES,
  )) issues.push("export-status p50/p95/p99 distribution is incomplete");
  if (!distributionIsComplete(
    nested(result, "metrics", "bundleBuild"),
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
  )) issues.push("bundle-build p50/p95/p99 distribution is incomplete");
  if (
    (finiteNumber(nested(result, "metrics", "payloadBytes")) ?? 0) <= 0
    || nested(result, "metrics", "rowCount") !== 95
    || nested(result, "metrics", "workerPeakMemoryBytes") !== null
    || typeof nested(result, "metrics", "workerPeakMemoryReason") !== "string"
  ) issues.push("payload/row/memory measurements do not distinguish null from zero");

  if (
    nested(result, "forcedTermination", "pass") !== true
    || nested(result, "forcedTermination", "workerTerminateCalled") !== true
    || nested(result, "forcedTermination", "databaseCloseCalledBeforeTerminate") !== false
    || nested(result, "forcedTermination", "seed", "databaseIntentionallyLeftOpen") !== true
    || nested(result, "forcedTermination", "verify", "exact", "match") !== true
    || nested(result, "forcedTermination", "verify", "exact", "updateCount") !== 257
    || nested(result, "forcedTermination", "verify", "exact", "markerCount") !== 1
  ) issues.push("commit-then-terminate fresh-Worker recovery evidence failed");
  if (
    nested(result, "corruption", "attempted") !== true
    || nested(result, "corruption", "safeTestSeam") !== true
    || nested(result, "corruption", "pass") !== true
    || nested(result, "corruption", "seed", "changedRows") !== 1
    || nested(result, "corruption", "verify", "failClosed") !== true
    || nested(result, "corruption", "verify", "returnedPartialFrontierCount") !== 0
    || nested(result, "corruption", "verify", "error", "name") !==
      "StudioCrdtRecoveryCorruptionError"
  ) issues.push("canonical-row corruption was not rejected fail-closed");

  const contentionClaim = nested(result, "contention", "claim");
  const supportedContention = contentionClaim === "supported-and-exact"
    && nested(result, "contention", "concurrentOwnershipSupported") === true
    && nested(result, "contention", "contender", "pass") === true;
  const quarantinedContention = contentionClaim === "quarantined-single-owner"
    && nested(result, "contention", "concurrentOwnershipSupported") === false
    && nested(result, "contention", "contender", "knownSingleOwnerRejection") === true
    && typeof nested(result, "contention", "quarantinedReason") === "string"
    && nested(result, "claims", "multiWorkerConcurrentOwnership") === null;
  if (
    nested(result, "contention", "attempted") !== true
    || nested(result, "contention", "bounded") !== true
    || nested(result, "contention", "gatePass") !== true
    || nested(result, "contention", "owner", "pass") !== true
    || nested(result, "contention", "finalVerification", "pass") !== true
    || (!supportedContention && !quarantinedContention)
  ) issues.push("multi-Worker contention was neither proven nor honestly quarantined");

  if (
    nested(result, "fallback", "workerIndexedDbAccessCount") !== 0
    || nested(result, "fallback", "workerLocalStorageAccessCount") !== 0
    || nested(result, "fallback", "pageIndexedDbAccessCount") !== 0
    || nested(result, "fallback", "pageLocalStorageAccessCount") !== 0
    || nested(result, "fallback", "memoryDatabaseOpenCount") !== 0
    || nested(result, "fallback", "durableMemoryFallbackSuccessCount") !== 0
    || nested(result, "fallback", "totalFallbackCount") !== 0
    || nested(result, "fallback", "workerProbesInstalledInEveryWorker") !== true
  ) issues.push("legacy browser-KV or memory durable fallback access was observed");
  if (
    nested(result, "claims", "browserOpfsDurability") !== true
    || nested(result, "claims", "osCrashPowerLoss") !== null
    || nested(result, "claims", "quotaExhaustion") !== null
    || nested(result, "claims", "externalCspParity") !== false
  ) issues.push("artifact makes an unsupported durability, quota, or CSP parity claim");
  if (
    !Array.isArray(result?.remainingFaultGates)
    || !(result.remainingFaultGates as unknown[]).includes("full-browser-process-crash")
    || !(result.remainingFaultGates as unknown[]).includes("os-crash-and-power-loss")
    || !(result.remainingFaultGates as unknown[]).includes("opfs-quota-exhaustion")
    || !Array.isArray(result.quarantinedLimitations)
    || result.quarantinedLimitations.length < 4
  ) issues.push("remaining external fault gates are not explicit");
  if (
    !memoryReceiptIsHonest(nested(result, "pageMemory", "before"))
    || !memoryReceiptIsHonest(nested(result, "pageMemory", "after"))
  ) issues.push("unavailable browser memory evidence is not represented as null");

  if (!productionAssets.some((asset) => asset.endsWith(".wasm"))) {
    issues.push("Vite production assets do not include sqlite3.wasm");
  }
  if (!productionAssets.some((asset) =>
    asset.endsWith(".js") && asset.includes("worker"))) {
    issues.push("Vite production assets do not include a Dedicated Worker bundle");
  }
  if (
    diagnostics.unexpectedConsoleErrors.length > 0
    || diagnostics.consoleWarnings.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.requestFailures.length > 0
    || diagnostics.errorResponses.length > 0
  ) issues.push("Chromium diagnostics contain console/page/network errors or warnings");
  if (
    quarantinedContention
    && (
      diagnostics.expectedQuarantinedConsoleErrors.length === 0
      || diagnostics.expectedQuarantinedConsoleErrors.length !==
        diagnostics.consoleErrors.length
    )
  ) issues.push("SAH-pool contention quarantine did not retain its exact console diagnostics");
  if (
    diagnostics.responseHeaders.crossOriginOpenerPolicy !== "same-origin"
    || diagnostics.responseHeaders.crossOriginEmbedderPolicy !== "require-corp"
    || diagnostics.responseHeaders.crossOriginResourcePolicy !== "same-origin"
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("wasm-unsafe-eval")
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("worker-src 'self'")
  ) issues.push("preview response lacks required COOP/COEP/CORP/CSP headers");
  if (
    !Array.isArray(result?.pageSecurityPolicyViolations)
    || result.pageSecurityPolicyViolations.length !== 0
  ) issues.push("page reported a Content Security Policy violation");
  return issues;
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

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
  <body><pre data-benchmark-output>running</pre><script type="module" src="/entry.ts"></script></body>
</html>`;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("unable to allocate a Chromium benchmark port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function observePage(
  page: Page,
  browserVersion: string,
): CrdtRecoverySqliteOpfsBrowserDiagnostics {
  const mutable = {
    browserVersion,
    consoleErrors: [] as string[],
    expectedQuarantinedConsoleErrors: [] as string[],
    unexpectedConsoleErrors: [] as string[],
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
    if (message.type() === "error") mutable.consoleErrors.push(message.text());
    if (message.type() === "warning") mutable.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => mutable.pageErrors.push(error.message));
  page.on("request", (request) => mutable.requests.push({
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  }));
  page.on("requestfailed", (request) => mutable.requestFailures.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
  ));
  page.on("response", (response) => {
    mutable.responses.push({ status: response.status(), url: response.url() });
    if (response.status() >= 400) {
      mutable.errorResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return mutable;
}

async function waitForResult(page: Page): Promise<unknown> {
  await page.waitForFunction(
    (name) => (window as unknown as Record<string, unknown>)[name] !== undefined,
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    CRDT_RECOVERY_SQLITE_OPFS_BROWSER_RESULT_GLOBAL,
  );
}

export async function runCrdtRecoverySqliteOpfsBrowserBenchmark(
  options: { readonly scratchDirectory?: string; readonly resultPath?: string } = {},
): Promise<CrdtRecoverySqliteOpfsBrowserArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-crdt-recovery-sqlite-opfs-"));
  const sourceDirectory = join(scratch, "production-source");
  const distributionDirectory = join(scratch, "production-dist");
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(distributionDirectory, { recursive: true });
  const viteSourceDirectory = realpathSync(sourceDirectory);
  const viteDistributionDirectory = realpathSync(distributionDirectory);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(join(sourceDirectory, "entry.ts"), `import ${JSON.stringify(PAGE_ALIAS)};\n`);

  const buildStartedAt = performance.now();
  await build({
    root: viteSourceDirectory,
    configFile: false,
    cacheDir: join(scratch, "vite-cache"),
    clearScreen: false,
    logLevel: "error",
    base: "/",
    resolve: { alias: [{ find: PAGE_ALIAS, replacement: PAGE_ENTRY }] },
    worker: { format: "es" },
    build: {
      outDir: viteDistributionDirectory,
      emptyOutDir: true,
      target: "es2022",
      minify: true,
      sourcemap: true,
      manifest: true,
      assetsInlineLimit: 0,
    },
  });
  const buildMs = Number((performance.now() - buildStartedAt).toFixed(4));
  const assets = walkFiles(viteDistributionDirectory);
  const assetBytes = Object.fromEntries(assets.map((asset) => [
    asset,
    statSync(join(viteDistributionDirectory, asset)).size,
  ]));
  const totalBytes = Object.values(assetBytes).reduce((sum, bytes) => sum + bytes, 0);

  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let diagnostics: CrdtRecoverySqliteOpfsBrowserDiagnostics;
  let benchmark: unknown;
  try {
    previewServer = await preview({
      root: viteSourceDirectory,
      configFile: false,
      clearScreen: false,
      logLevel: "error",
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
        },
      },
    });
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--enable-precise-memory-info"],
    });
    const page = await browser.newPage();
    diagnostics = observePage(page, browser.version());
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    (diagnostics as { responseHeaders: typeof diagnostics.responseHeaders }).responseHeaders = {
      contentSecurityPolicy: await response?.headerValue("content-security-policy") ?? "",
      crossOriginOpenerPolicy: await response?.headerValue("cross-origin-opener-policy") ?? "",
      crossOriginEmbedderPolicy: await response?.headerValue("cross-origin-embedder-policy") ?? "",
      crossOriginResourcePolicy: await response?.headerValue("cross-origin-resource-policy") ?? "",
    };
    benchmark = await waitForResult(page);
    const quarantinedContention = nested(benchmark, "contention", "claim") ===
      "quarantined-single-owner";
    const expectedPattern = /^(?:opfs-sahpool: NoModificationAllowedError:|opfs-sahpool removeVfs\(\) failed with no recovery strategy: NoModificationAllowedError:)/u;
    const mutableDiagnostics = diagnostics as unknown as {
      expectedQuarantinedConsoleErrors: string[];
      unexpectedConsoleErrors: string[];
    };
    mutableDiagnostics.expectedQuarantinedConsoleErrors = quarantinedContention
      ? diagnostics.consoleErrors.filter((message) => expectedPattern.test(message))
      : [];
    mutableDiagnostics.unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) =>
      !mutableDiagnostics.expectedQuarantinedConsoleErrors.includes(message));
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const validationIssues = validateCrdtRecoverySqliteOpfsBrowserEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = record(benchmark)?.status;
  const status: CrdtRecoverySqliteOpfsBrowserArtifact["status"] =
    browserStatus === "unsupported"
      ? "unsupported"
      : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: CrdtRecoverySqliteOpfsBrowserArtifact = {
    schemaVersion: CRDT_RECOVERY_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    pass: status === "pass",
    benchmark,
    diagnostics,
    productionBuild: {
      mode: "vite-production-build",
      assets,
      assetBytes,
      totalBytes,
      scratchDirectory: scratch,
      buildMs,
    },
    validationIssues,
  };
  writeJson(options.resultPath ?? TRACKED_RESULT, artifact);
  return artifact;
}

async function main(): Promise<void> {
  try {
    const artifact = await runCrdtRecoverySqliteOpfsBrowserBenchmark({
      scratchDirectory: process.env.TOONSPECTRUM_CRDT_RECOVERY_SQLITE_OPFS_VERIFY_DIR,
      resultPath: process.env.TOONSPECTRUM_CRDT_RECOVERY_SQLITE_OPFS_RESULT ?? TRACKED_RESULT,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: process.env.TOONSPECTRUM_CRDT_RECOVERY_SQLITE_OPFS_RESULT ?? TRACKED_RESULT,
      browserVersion: artifact.diagnostics.browserVersion,
      buildMs: artifact.productionBuild.buildMs,
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "unsupported" ? 2 : artifact.pass ? 0 : 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : null;
if (executedPath === import.meta.url) await main();
