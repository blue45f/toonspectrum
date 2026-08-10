/**
 * Real Chromium 140 + Vite production-bundled BG3D SQLite/OPFS promotion benchmark.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/bg3d-libraries-sqlite-opfs-browser.ts
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

export const BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION = 1 as const;
export const BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_RESULT_GLOBAL =
  "__TOONSPECTRUM_BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_RESULT__";
export const BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES = 100;
export const BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES = Object.freeze([
  1 * 1024 * 1024,
  32 * 1024 * 1024,
]);

const RESULT_TIMEOUT_MS = 20 * 60 * 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/harness/bg3d-libraries-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:bg3d-libraries-sqlite-opfs-browser-page";
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

export interface Bg3dLibrariesSqliteOpfsBrowserDiagnostics {
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

export interface Bg3dLibrariesSqliteOpfsBrowserArtifact {
  readonly schemaVersion: typeof BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: Bg3dLibrariesSqliteOpfsBrowserDiagnostics;
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

function numberValue(value: unknown): number | null {
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
    || !samples.every((sample) => numberValue(sample) !== null && Number(sample) >= 0)
  ) return false;
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const rank = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
    return sorted[Math.min(sorted.length - 1, rank)] ?? 0;
  };
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = numberValue(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, at(0.5))
    && close(candidate.p95Ms, at(0.95))
    && close(candidate.p99Ms, at(0.99));
}

function validateMemoryReceipt(value: unknown): boolean {
  const receipt = record(value);
  if (!receipt) return false;
  for (const key of ["performanceMemory", "userAgentSpecific"] as const) {
    if (receipt[key] !== null && record(receipt[key]) === null) return false;
  }
  return true;
}

/** Pure promotion gate shared by the runner and tracked-result contract test. */
export function validateBg3dLibrariesSqliteOpfsBrowserEvidence(
  benchmark: unknown,
  diagnostics: Bg3dLibrariesSqliteOpfsBrowserDiagnostics,
  productionAssets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const result = record(benchmark);
  const primary = record(result?.primary);
  if (
    result?.status !== "ok"
    || result.pass !== true
    || result.schemaVersion !== BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION
    || result.execution !== "vite-production-build-chromium-dedicated-workers"
    || primary?.status !== "ok"
    || primary.pass !== true
    || primary.execution !== "vite-production-build-chromium-dedicated-worker-opfs-sahpool"
  ) {
    issues.push("browser did not produce a passing production Dedicated Worker benchmark");
  }
  if (!diagnostics.browserVersion.startsWith("140.")) {
    issues.push(`measured browser is not Chromium 140: ${diagnostics.browserVersion}`);
  }
  if (
    nested(primary, "authority", "kind") !== "sqlite-opfs-sha256-cas"
    || nested(primary, "authority", "requestedVfs") !== "opfs"
    || nested(primary, "authority", "sqliteOpfsDirectory") !== "toonspectrum-studio-sqlite"
    || nested(primary, "authority", "sqliteFilename") !== "studio-local-v12.db"
    || nested(primary, "authority", "casOpfsRoot") !== "toonspectrum-studio-bg3d-libraries-v12"
    || nested(primary, "authority", "manifestNamespace") !== "studio-bg3d-libraries-v12"
    || nested(primary, "authority", "normalCloseCompletedBeforeReopen") !== true
    || numberValue(nested(primary, "authority", "coldOpenMs")) === null
    || numberValue(nested(primary, "authority", "reopenMs")) === null
  ) {
    issues.push("authority receipt does not prove the shared V12 SQLite/OPFS product path");
  }
  if (
    nested(primary, "support", "wasm") !== true
    || nested(primary, "support", "opfs") !== true
    || nested(primary, "capabilities", "secureContext") !== true
    || nested(primary, "capabilities", "crossOriginIsolated") !== true
    || nested(primary, "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(primary, "capabilities", "syncAccessHandle") !== true
    || nested(primary, "capabilities", "webLocks") !== true
  ) {
    issues.push("Chromium did not expose the required OPFS SAH-pool/Web Locks capabilities");
  }

  const writes = nested(primary, "models", "writes");
  if (!Array.isArray(writes)) {
    issues.push("model write receipts are absent");
  } else {
    for (const requiredBytes of BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES) {
      const write = writes.find((candidate) => record(candidate)?.bytes === requiredBytes);
      if (
        record(write)?.expectedHash !== record(write)?.storedHash
        || record(write)?.returnedBytes !== requiredBytes
        || record(write)?.exactBytes !== true
        || !/^sha256:[0-9a-f]{64}$/u.test(String(record(write)?.expectedHash ?? ""))
      ) {
        issues.push(`exact ${requiredBytes}-byte GLB write receipt failed`);
      }
    }
  }
  const reads = nested(primary, "models", "reads");
  if (!Array.isArray(reads)) {
    issues.push("model read distributions are absent");
  } else {
    for (const requiredBytes of BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REQUIRED_MODEL_BYTES) {
      const read = reads.find((candidate) => record(candidate)?.bytes === requiredBytes);
      if (
        record(read)?.mismatchCount !== 0
        || !distributionIsComplete(
          record(read)?.distribution,
          BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
        )
      ) issues.push(`100-sample verified CAS read distribution failed for ${requiredBytes} bytes`);
    }
  }
  const physical = nested(primary, "models", "physicalCas");
  if (
    !Array.isArray(physical)
    || physical.length < 3
    || physical.some((receipt) => record(receipt)?.exact !== true)
  ) issues.push("physical OPFS CAS SHA/size equality receipts are incomplete");
  if (
    nested(primary, "models", "thumbnail", "exactAfterReopen") !== true
    || !/^sha256:[0-9a-f]{64}$/u.test(
      String(nested(primary, "models", "thumbnail", "hash") ?? ""),
    )
  ) issues.push("image thumbnail did not round-trip through OPFS CAS exactly");

  if (
    nested(primary, "templates", "count") !== BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES
    || nested(primary, "templates", "mismatchCount") !== 0
    || !distributionIsComplete(
      nested(primary, "templates", "writeDistribution"),
      BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
    )
    || !distributionIsComplete(
      nested(primary, "templates", "listDistribution"),
      BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
    )
  ) issues.push("100-sample canonical template write/list evidence failed");
  if (
    nested(primary, "metadata", "count") !== BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES
    || nested(primary, "metadata", "mismatchCount") !== 0
    || !distributionIsComplete(
      nested(primary, "metadata", "writeDistribution"),
      BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
    )
    || !distributionIsComplete(
      nested(primary, "metadata", "getDistribution"),
      BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_OPERATION_SAMPLES,
    )
  ) issues.push("100-sample canonical metadata write/get evidence failed");
  if (
    nested(primary, "manifests", "canonical") !== true
    || nested(primary, "manifests", "containsBase64OrDataUrl") !== false
    || nested(primary, "manifests", "casIndexContainsBase64OrDataUrl") !== false
  ) issues.push("SQLite/CAS manifests are noncanonical or contain base64/data URLs");

  if (
    nested(result, "forcedTermination", "pass") !== true
    || nested(result, "forcedTermination", "workerTerminateCalled") !== true
    || nested(result, "forcedTermination", "databaseCloseCalledBeforeTerminate") !== false
    || nested(result, "forcedTermination", "commit", "databaseIntentionallyLeftOpen") !== true
    || nested(result, "forcedTermination", "recovery", "exactHashAndBytes") !== true
  ) issues.push("forced Dedicated Worker terminate/reopen durability evidence failed");
  if (
    nested(result, "contention", "attempted") !== true
    || nested(result, "contention", "supported") !== true
    || nested(result, "contention", "pass") !== true
    || (numberValue(nested(result, "contention", "contenderBObservedWaitMs")) ?? 0) < 150
    || nested(result, "contention", "productWritePresentAfterFreshWorkerReopen") !== true
    || nested(result, "contention", "dualProductAuthorityWorkers", "status") !== "infeasible"
    || typeof nested(result, "contention", "dualProductAuthorityWorkers", "reason") !== "string"
  ) issues.push("two-Worker product Web Locks contention/lost-update evidence failed");
  if (
    nested(result, "finalVerification", "pass") !== true
    || nested(result, "finalVerification", "expectedModelsPresent") !== true
    || nested(result, "finalVerification", "contentionWritesPresent") !== true
    || nested(result, "finalVerification", "manifestsContainNoBase64") !== true
  ) issues.push("fresh final Worker did not observe all committed manifests and CAS identities");
  if (
    nested(result, "fallback", "totalFallbackCount") !== 0
    || nested(result, "fallback", "indexedDbAccessCount") !== 0
    || nested(result, "fallback", "localStorageAccessCount") !== 0
    || nested(result, "fallback", "memoryDatabaseOpenCount") !== 0
    || nested(result, "fallback", "memoryAssetStoreCount") !== 0
    || nested(result, "fallback", "probesInstalledInEveryWorker") !== true
  ) issues.push("legacy or non-durable fallback access was observed");

  const ran100MiB = nested(primary, "config", "ran100MiB");
  if (ran100MiB === true) {
    const optionalWrite = Array.isArray(writes)
      ? writes.find((candidate) => record(candidate)?.bytes === 100 * 1024 * 1024)
      : null;
    if (record(optionalWrite)?.exactBytes !== true) {
      issues.push("100 MiB was selected as safe but did not produce exact write evidence");
    }
  } else if (
    ran100MiB !== false
    || typeof nested(primary, "config", "skipped100MiBReason") !== "string"
  ) {
    issues.push("100 MiB dimension is neither measured nor explicitly recorded as infeasible");
  }
  if (
    !validateMemoryReceipt(nested(primary, "memory", "before"))
    || !validateMemoryReceipt(nested(primary, "memory", "after"))
    || !validateMemoryReceipt(nested(result, "pageMemory", "before"))
    || !validateMemoryReceipt(nested(result, "pageMemory", "after"))
  ) issues.push("memory evidence substitutes a non-null estimate for an unavailable browser API");
  if (!Array.isArray(result?.infeasibleDimensions) || result.infeasibleDimensions.length < 4) {
    issues.push("infeasible browser/device dimensions were not explicitly recorded");
  }

  if (!productionAssets.some((asset) => asset.endsWith(".wasm"))) {
    issues.push("Vite production assets do not include sqlite3.wasm");
  }
  if (!productionAssets.some((asset) => asset.endsWith(".js") && asset.includes("worker"))) {
    issues.push("Vite production assets do not expose a Dedicated Worker bundle");
  }
  if (
    diagnostics.consoleErrors.length > 0
    || diagnostics.consoleWarnings.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.requestFailures.length > 0
    || diagnostics.errorResponses.length > 0
  ) issues.push("Chromium diagnostics contain console/page/network errors or warnings");
  if (
    diagnostics.responseHeaders.crossOriginOpenerPolicy !== "same-origin"
    || diagnostics.responseHeaders.crossOriginEmbedderPolicy !== "require-corp"
    || diagnostics.responseHeaders.crossOriginResourcePolicy !== "same-origin"
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("wasm-unsafe-eval")
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("worker-src 'self'")
  ) issues.push("preview response lacks required COOP/COEP/CORP/CSP headers");
  if (!Array.isArray(result?.pageSecurityPolicyViolations)
    || result.pageSecurityPolicyViolations.length !== 0) {
    issues.push("page reported Content Security Policy violations");
  }
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
        reject(new Error("could not allocate a BG3D browser benchmark port"));
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
    "<title>ToonSpectrum BG3D SQLite OPFS browser benchmark</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>BG3D SQLite OPFS browser benchmark</h1>",
    '<pre data-benchmark-output>running</pre>',
    "</main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function observePage(
  page: Page,
  browserVersion: string,
): Bg3dLibrariesSqliteOpfsBrowserDiagnostics {
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
    BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_RESULT_GLOBAL,
  );
}

export async function runBg3dLibrariesSqliteOpfsBrowserBenchmark(
  options: { readonly scratchDirectory?: string; readonly resultPath?: string } = {},
): Promise<Bg3dLibrariesSqliteOpfsBrowserArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-bg3d-sqlite-opfs-"));
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
    build: {
      outDir: viteDistributionDirectory,
      emptyOutDir: true,
      target: "es2022",
      minify: true,
      sourcemap: true,
      manifest: true,
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
  let diagnostics: Bg3dLibrariesSqliteOpfsBrowserDiagnostics;
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
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const validationIssues = validateBg3dLibrariesSqliteOpfsBrowserEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = record(benchmark)?.status;
  const status: Bg3dLibrariesSqliteOpfsBrowserArtifact["status"] =
    browserStatus === "unsupported"
      ? "unsupported"
      : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: Bg3dLibrariesSqliteOpfsBrowserArtifact = {
    schemaVersion: BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
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
    const artifact = await runBg3dLibrariesSqliteOpfsBrowserBenchmark({
      scratchDirectory: process.env.TOONSPECTRUM_BG3D_SQLITE_OPFS_VERIFY_DIR,
      resultPath: process.env.TOONSPECTRUM_BG3D_SQLITE_OPFS_RESULT ?? TRACKED_RESULT,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: process.env.TOONSPECTRUM_BG3D_SQLITE_OPFS_RESULT ?? TRACKED_RESULT,
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
