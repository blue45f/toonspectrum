/**
 * Real Chromium Dedicated Worker + production-bundled SQLite OPFS SAH-pool
 * benchmark for the unlimited Studio filter catalog.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/filter-library-opfs-browser.ts
 *
 * Exit codes:
 *   0 = real OPFS SQLite run passed every evidence gate
 *   1 = build/browser/integrity/measurement failure
 *   2 = honest environment unsupported result (never counted as pass)
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

export const FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION = 1 as const;
export const FILTER_LIBRARY_OPFS_BROWSER_RESULT_GLOBAL =
  "__TOONSPECTRUM_FILTER_LIBRARY_OPFS_BROWSER_RESULT__";
export const FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT = 10_000;

const RESULT_TIMEOUT_MS = 10 * 60 * 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/harness/filter-library-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/results/filter-library-opfs-browser.json",
);
const CLIENT_ALIAS = "virtual:filter-library-opfs-browser-client";
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

export interface FilterLibraryOpfsBrowserDiagnostics {
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
  readonly responses: readonly Readonly<{
    status: number;
    url: string;
  }>[];
  readonly responseHeaders: Readonly<{
    contentSecurityPolicy: string;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
    crossOriginResourcePolicy: string;
  }>;
}

export interface FilterLibraryOpfsBrowserArtifact {
  readonly schemaVersion: typeof FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: FilterLibraryOpfsBrowserDiagnostics;
  readonly productionBuild: Readonly<{
    mode: "vite-production-build";
    assets: readonly string[];
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

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function distributionIsComplete(value: unknown, expectedSamples: number): boolean {
  const candidate = record(value);
  const samples = candidate?.samplesMs;
  if (
    candidate?.sampleCount !== expectedSamples
    || candidate?.percentileMethod !== "nearest-rank-ceil"
    || !Array.isArray(samples)
    || samples.length !== expectedSamples
    || !samples.every((sample) => numberValue(sample) !== null && (sample as number) >= 0)
  ) {
    return false;
  }
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

/** Pure gate consumed by the standalone runner and the focused Vitest contract. */
export function validateFilterLibraryOpfsBrowserEvidence(
  benchmark: unknown,
  diagnostics: FilterLibraryOpfsBrowserDiagnostics,
  productionAssets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const result = record(benchmark);
  if (
    result?.status !== "ok"
    || result.pass !== true
    || result.schemaVersion !== FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION
    || result.execution
      !== "vite-production-build-chromium-dedicated-worker-opfs-sahpool"
  ) {
    const reason = typeof result?.reason === "string" ? `: ${result.reason}` : "";
    issues.push(`browser did not produce passing Dedicated Worker OPFS evidence${reason}`);
  }

  const openedFilenames = nested(result, "authority", "openedOpfsDatabaseFilenames");
  const installedDirectories = nested(result, "authority", "installedOpfsDirectories");
  if (
    nested(result, "authority", "kind") !== "sqlite-opfs-sahpool"
    || nested(result, "authority", "requestedVfs") !== "opfs"
    || nested(result, "authority", "productRepository")
      !== "createSqliteFilterLibraryRepository"
    || nested(result, "authority", "opfsDirectory") !== "toonspectrum-studio-sqlite"
    || nested(result, "authority", "logicalDatabaseFilename") !== "studio-local-v12.db"
    || nested(result, "authority", "expectedOpenFilename") !== "/studio-local-v12.db"
    || nested(result, "authority", "opfsDatabaseOpenCount") !== 2
    || nested(result, "authority", "nonV12DatabaseOpenCount") !== 0
    || nested(result, "authority", "memoryDatabaseOpenCount") !== 0
    || nested(result, "authority", "memoryVfsUsed") !== false
    || nested(result, "authority", "localStorageApiPresent") !== false
    || nested(result, "authority", "localStorageFallbackUsed") !== false
    || nested(result, "authority", "closeCompletedBeforeReopen") !== true
    || !Array.isArray(openedFilenames)
    || openedFilenames.length !== 2
    || openedFilenames.some((filename) => filename !== "/studio-local-v12.db")
    || !Array.isArray(installedDirectories)
    || installedDirectories.length !== 2
    || installedDirectories.some((directory) => directory !== "toonspectrum-studio-sqlite")
  ) {
    issues.push(
      "authority receipt does not prove two V12-only product OPFS opens with zero fallback",
    );
  }
  if (
    nested(result, "policy", "noFilterCatalogCap") !== true
    || nested(result, "policy", "legacyDataMigration") !== false
    || nested(result, "policy", "discardExistingStudioData") !== true
  ) {
    issues.push("V12 uncapped/discard policy receipt is incomplete");
  }
  if (
    nested(result, "support", "wasm") !== true
    || nested(result, "support", "opfs") !== true
    || nested(result, "capabilities", "dedicatedWorker") !== true
    || nested(result, "capabilities", "secureContext") !== true
    || nested(result, "capabilities", "crossOriginIsolated") !== true
    || nested(result, "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(result, "capabilities", "syncAccessHandle") !== true
  ) {
    issues.push("required Dedicated Worker/OPFS/SAH-pool capabilities were absent");
  }
  if (
    nested(result, "config", "presetCount") !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || nested(result, "config", "insertBatchSize") !== 250
    || nested(result, "config", "insertBatchCount") !== 40
    || nested(result, "insertion", "initialCount") !== 0
    || nested(result, "insertion", "insertedCount")
      !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || !distributionIsComplete(nested(result, "insertion", "distribution"), 40)
  ) {
    issues.push("exact 10,000-row insertion or its 40 raw transaction samples are incomplete");
  }
  const insertSamples = nested(result, "insertion", "batchSamples");
  if (
    !Array.isArray(insertSamples)
    || insertSamples.length !== 40
    || insertSamples.some((sample) => record(sample)?.count !== 250)
  ) {
    issues.push("raw 250-row insert batch receipts are incomplete");
  }
  if (
    nested(result, "durability", "closedOnce") !== true
    || nested(result, "durability", "reopenProbeId") !== "opfs-filter-09999"
    || numberValue(nested(result, "durability", "reopenMs")) === null
  ) {
    issues.push("close/reopen durability receipt is incomplete");
  }
  const expectedDigest = nested(result, "keysetFullScan", "expectedOrderDigestSha256");
  const observedDigest = nested(result, "keysetFullScan", "observedOrderDigestSha256");
  if (
    nested(result, "keysetFullScan", "pageCount") !== 39
    || nested(result, "keysetFullScan", "observedCount")
      !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || nested(result, "keysetFullScan", "uniqueCount")
      !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || nested(result, "keysetFullScan", "firstPageTotalCount")
      !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || nested(result, "keysetFullScan", "duplicateCount") !== 0
    || nested(result, "keysetFullScan", "missingCount") !== 0
    || nested(result, "keysetFullScan", "unexpectedCount") !== 0
    || nested(result, "keysetFullScan", "orderMismatchCount") !== 0
    || typeof expectedDigest !== "string"
    || expectedDigest.length !== 64
    || expectedDigest !== observedDigest
    || !distributionIsComplete(nested(result, "keysetFullScan", "distribution"), 39)
  ) {
    issues.push("full keyset scan did not prove all 10,000 deterministic IDs after reopen");
  }
  const pageReceipts = nested(result, "keysetFullScan", "pageReceipts");
  if (!Array.isArray(pageReceipts) || pageReceipts.length !== 39) {
    issues.push("raw keyset page receipts are incomplete");
  }
  if (
    nested(result, "structuredIntegrity", "validatedCanonicalRowCount")
      !== FILTER_LIBRARY_OPFS_BROWSER_EXPECTED_COUNT
    || nested(result, "structuredIntegrity", "lookupMismatchCount") !== 0
    || nested(result, "structuredIntegrity", "allChecksPassed") !== true
    || nested(result, "idLookup", "mismatchCount") !== 0
    || !distributionIsComplete(nested(result, "idLookup", "distribution"), 200)
  ) {
    issues.push("canonical payload/index validation or ID lookup evidence failed");
  }

  const queries = nested(result, "queries");
  const expectedQueryCounts = new Map([
    ["nfkc-search-comic", 1_667],
    ["category-comic", 1_667],
    ["favorite-only", 770],
    ["category-engine-favorite", 129],
  ]);
  if (!Array.isArray(queries) || queries.length !== expectedQueryCounts.size) {
    issues.push("search/category/engine/favorite evidence is incomplete");
  } else {
    for (const query of queries) {
      const candidate = record(query);
      const expected = typeof candidate?.id === "string"
        ? expectedQueryCounts.get(candidate.id)
        : undefined;
      if (
        expected === undefined
        || candidate?.expectedCount !== expected
        || candidate.observedTotalCount !== expected
        || candidate.mismatchCount !== 0
        || !distributionIsComplete(candidate.distribution, 60)
      ) {
        issues.push(`query evidence failed for ${String(candidate?.id ?? "unknown")}`);
      }
    }
  }
  if (
    nested(result, "opfs", "afterInsert", "exists") !== true
    || nested(result, "opfs", "final", "exists") !== true
    || (numberValue(nested(result, "opfs", "final", "fileCount")) ?? 0) <= 0
    || (numberValue(nested(result, "opfs", "final", "totalFileBytes")) ?? 0) <= 0
  ) {
    issues.push("physical OPFS directory/file evidence is absent");
  }
  if (!productionAssets.some((asset) => asset.endsWith(".wasm"))) {
    issues.push("production bundle does not contain the sqlite3.wasm asset");
  }
  const workerViolations = nested(result, "securityPolicyViolations");
  const pageViolations = nested(result, "pageSecurityPolicyViolations");
  if (
    !Array.isArray(workerViolations)
    || workerViolations.length !== 0
    || !Array.isArray(pageViolations)
    || pageViolations.length !== 0
  ) {
    issues.push("browser reported Content Security Policy violations");
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
    issues.push("preview response did not carry required COOP/COEP/CORP/CSP headers");
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
        reject(new Error("could not allocate a Chromium OPFS benchmark port"));
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
    "<title>Studio filter library SQLite OPFS benchmark</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Studio filter library SQLite OPFS benchmark</h1>",
    '<pre data-benchmark-output>running</pre>',
    "</main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function observePage(page: Page, browserVersion: string): FilterLibraryOpfsBrowserDiagnostics {
  const mutable = {
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
    if (message.type() === "error") mutable.consoleErrors.push(message.text());
    if (message.type() === "warning") mutable.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => mutable.pageErrors.push(error.message));
  page.on("request", (request) => {
    mutable.requests.push({
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    });
  });
  page.on("requestfailed", (request) => {
    mutable.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
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
    (globalName) => (window as unknown as Record<string, unknown>)[globalName] !== undefined,
    FILTER_LIBRARY_OPFS_BROWSER_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (globalName) => (window as unknown as Record<string, unknown>)[globalName],
    FILTER_LIBRARY_OPFS_BROWSER_RESULT_GLOBAL,
  );
}

export async function runFilterLibraryOpfsBrowserBenchmark(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<FilterLibraryOpfsBrowserArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-filter-library-opfs-"));
  const sourceDirectory = join(scratch, "production-source");
  const distributionDirectory = join(scratch, "production-dist");
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(distributionDirectory, { recursive: true });
  const viteSourceDirectory = realpathSync(sourceDirectory);
  const viteDistributionDirectory = realpathSync(distributionDirectory);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(join(sourceDirectory, "entry.ts"), `import ${JSON.stringify(CLIENT_ALIAS)};\n`);

  await build({
    root: viteSourceDirectory,
    configFile: false,
    cacheDir: join(scratch, "vite-cache"),
    clearScreen: false,
    logLevel: "error",
    base: "/",
    resolve: {
      alias: [{ find: CLIENT_ALIAS, replacement: PAGE_ENTRY }],
    },
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

  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let diagnostics: FilterLibraryOpfsBrowserDiagnostics;
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
    (diagnostics as { responseHeaders: FilterLibraryOpfsBrowserDiagnostics["responseHeaders"] })
      .responseHeaders = {
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

  const validationIssues = validateFilterLibraryOpfsBrowserEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = record(benchmark)?.status;
  const status: FilterLibraryOpfsBrowserArtifact["status"] =
    browserStatus === "unsupported"
      ? "unsupported"
      : validationIssues.length === 0
        ? "pass"
        : "fail";
  const artifact: FilterLibraryOpfsBrowserArtifact = {
    schemaVersion: FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    pass: status === "pass",
    benchmark,
    diagnostics,
    productionBuild: {
      mode: "vite-production-build",
      assets,
      scratchDirectory: scratch,
    },
    validationIssues,
  };
  writeJson(options.resultPath ?? TRACKED_RESULT, artifact);
  return artifact;
}

async function main(): Promise<void> {
  try {
    const artifact = await runFilterLibraryOpfsBrowserBenchmark({
      scratchDirectory: process.env.TOONSPECTRUM_FILTER_LIBRARY_OPFS_VERIFY_DIR,
      resultPath: process.env.TOONSPECTRUM_FILTER_LIBRARY_OPFS_RESULT ?? TRACKED_RESULT,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: process.env.TOONSPECTRUM_FILTER_LIBRARY_OPFS_RESULT ?? TRACKED_RESULT,
      scratch: artifact.productionBuild.scratchDirectory,
      authority: nested(artifact.benchmark, "authority"),
      insertion: nested(artifact.benchmark, "insertion", "distribution"),
      keyset: nested(artifact.benchmark, "keysetFullScan", "distribution"),
      lookup: nested(artifact.benchmark, "idLookup", "distribution"),
      queries: nested(artifact.benchmark, "queries"),
      opfs: nested(artifact.benchmark, "opfs", "final"),
      storage: nested(artifact.benchmark, "storage", "final"),
      memory: nested(artifact.benchmark, "memory", "final"),
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: FilterLibraryOpfsBrowserArtifact = {
      schemaVersion: FILTER_LIBRARY_OPFS_BROWSER_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: "fail",
      pass: false,
      benchmark: {
        status: "error",
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack ?? null }
          : { name: "NonError", message: String(error) },
      },
      diagnostics: {
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
      },
      productionBuild: {
        mode: "vite-production-build",
        assets: [],
        scratchDirectory:
          process.env.TOONSPECTRUM_FILTER_LIBRARY_OPFS_VERIFY_DIR ?? "unavailable",
      },
      validationIssues: ["benchmark orchestrator failed before a valid browser result"],
    };
    writeJson(process.env.TOONSPECTRUM_FILTER_LIBRARY_OPFS_RESULT ?? TRACKED_RESULT, failure);
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
