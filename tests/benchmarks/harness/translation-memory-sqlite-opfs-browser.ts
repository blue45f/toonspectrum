/**
 * Real Chromium Dedicated Worker + product SQLite OPFS SAH-pool probe for translation memory.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/translation-memory-sqlite-opfs-browser.ts
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

export const TRANSLATION_MEMORY_SQLITE_OPFS_REPORT_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_MEMORY_SQLITE_OPFS_RESULT_GLOBAL =
  "__TOONSPECTRUM_TRANSLATION_MEMORY_SQLITE_OPFS_RESULT__";
export const TRANSLATION_MEMORY_SQLITE_OPFS_ENTRY_COUNT = 512;
export const TRANSLATION_MEMORY_SQLITE_OPFS_SAVE_SAMPLES = 30;
export const TRANSLATION_MEMORY_SQLITE_OPFS_LOAD_SAMPLES = 50;

const RESULT_TIMEOUT_MS = 5 * 60 * 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/harness/translation-memory-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:translation-memory-sqlite-opfs-browser-page";
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

export interface TranslationMemorySqliteOpfsDiagnostics {
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

export interface TranslationMemorySqliteOpfsArtifact {
  readonly schemaVersion: typeof TRANSLATION_MEMORY_SQLITE_OPFS_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: TranslationMemorySqliteOpfsDiagnostics;
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

function finiteNumber(value: unknown): number | null {
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
    || !samples.every((sample) => (finiteNumber(sample) ?? -1) >= 0)
  ) {
    return false;
  }
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const rank = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
    return sorted[Math.min(sorted.length - 1, rank)] ?? 0;
  };
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = finiteNumber(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, at(0.5))
    && close(candidate.p95Ms, at(0.95))
    && close(candidate.p99Ms, at(0.99));
}

export function validateTranslationMemorySqliteOpfsEvidence(
  benchmark: unknown,
  diagnostics: TranslationMemorySqliteOpfsDiagnostics,
  productionAssets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const result = record(benchmark);
  if (
    result?.status !== "ok"
    || result.pass !== true
    || result.schemaVersion !== TRANSLATION_MEMORY_SQLITE_OPFS_REPORT_SCHEMA_VERSION
    || result.execution
      !== "vite-production-build-chromium-dedicated-worker-opfs-sahpool"
  ) {
    issues.push("browser did not produce passing Dedicated Worker translation-memory evidence");
  }

  const opened = nested(result, "authority", "openedOpfsDatabaseFilenames");
  const directories = nested(result, "authority", "installedOpfsDirectories");
  if (
    nested(result, "authority", "kind") !== "sqlite-opfs-sahpool"
    || nested(result, "authority", "requestedVfs") !== "opfs"
    || nested(result, "authority", "productPersistence")
      !== "createStudioTranslationMemorySqlitePersistence"
    || nested(result, "authority", "namespace") !== "studio-translation-memory-v12"
    || nested(result, "authority", "key") !== "library-v1"
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
    || !Array.isArray(opened)
    || opened.length !== 2
    || opened.some((filename) => filename !== "/studio-local-v12.db")
    || !Array.isArray(directories)
    || directories.length !== 2
    || directories.some((directory) => directory !== "toonspectrum-studio-sqlite")
  ) {
    issues.push("authority receipt does not prove two exact V12 OPFS opens without fallback");
  }

  if (
    nested(result, "policy", "legacyDataMigration") !== false
    || nested(result, "policy", "discardExistingStudioData") !== true
    || nested(result, "policy", "oldLocalStorageRead") !== false
    || nested(result, "policy", "legacyKeyProbeEmpty") !== true
    || nested(result, "policy", "legacyNamespaceProbeEmpty") !== true
  ) {
    issues.push("legacy discard/no-auto-import receipt is incomplete");
  }

  if (
    nested(result, "support", "wasm") !== true
    || nested(result, "support", "opfs") !== true
    || nested(result, "capabilities", "dedicatedWorker") !== true
    || nested(result, "capabilities", "secureContext") !== true
    || nested(result, "capabilities", "crossOriginIsolated") !== true
    || nested(result, "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(result, "capabilities", "syncAccessHandle") !== true
    || nested(result, "capabilities", "cryptoSubtle") !== true
  ) {
    issues.push("Chromium Dedicated Worker/OPFS/SAH-pool capability receipt is incomplete");
  }

  if (
    nested(result, "config", "entryCount") !== TRANSLATION_MEMORY_SQLITE_OPFS_ENTRY_COUNT
    || nested(result, "config", "saveSampleCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_SAVE_SAMPLES
    || nested(result, "config", "loadSampleCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_LOAD_SAMPLES
    || (finiteNumber(nested(result, "config", "canonicalBytes")) ?? 0) <= 0
    || nested(result, "saves", "successfulCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_SAVE_SAMPLES
    || nested(result, "loads", "successfulCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_LOAD_SAMPLES
    || nested(result, "loads", "mismatchCount") !== 0
    || !distributionIsComplete(
      nested(result, "saves", "distribution"),
      TRANSLATION_MEMORY_SQLITE_OPFS_SAVE_SAMPLES,
    )
    || !distributionIsComplete(
      nested(result, "loads", "distribution"),
      TRANSLATION_MEMORY_SQLITE_OPFS_LOAD_SAMPLES,
    )
  ) {
    issues.push("raw save/load sample distributions or exact corpus counts are incomplete");
  }

  const expectedDigest = nested(result, "integrity", "expectedSha256");
  if (
    nested(result, "integrity", "expectedEntryCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_ENTRY_COUNT
    || nested(result, "integrity", "reopenedEntryCount")
      !== TRANSLATION_MEMORY_SQLITE_OPFS_ENTRY_COUNT
    || nested(result, "integrity", "noEntryLoss") !== true
    || nested(result, "integrity", "canonicalJsonExact") !== true
    || nested(result, "integrity", "rawBeforeCloseExact") !== true
    || nested(result, "integrity", "rawAfterReopenExact") !== true
    || typeof expectedDigest !== "string"
    || !/^[0-9a-f]{64}$/u.test(expectedDigest)
    || nested(result, "integrity", "rawBeforeCloseSha256") !== expectedDigest
    || nested(result, "integrity", "reopenedSha256") !== expectedDigest
  ) {
    issues.push("canonical JSON/hash evidence does not prove lossless close/reopen");
  }

  if (
    nested(result, "search", "exactFound") !== true
    || nested(result, "search", "exactReusable") !== true
    || nested(result, "search", "exactTranslation")
      !== nested(result, "search", "expectedTranslation")
    || nested(result, "search", "fuzzyFound") !== true
    || (finiteNumber(nested(result, "search", "fuzzyScore")) ?? 0) < 0.86
    || nested(result, "search", "fuzzyAutoApply") !== false
    || nested(result, "search", "localeIsolationExactCount") !== 0
    || nested(result, "search", "localeIsolationFuzzyCount") !== 0
  ) {
    issues.push("reopened exact/fuzzy/language-isolation search semantics failed");
  }

  if (
    nested(result, "opfs", "final", "exists") !== true
    || (finiteNumber(nested(result, "opfs", "final", "fileCount")) ?? 0) <= 0
    || (finiteNumber(nested(result, "opfs", "final", "totalFileBytes")) ?? 0) <= 0
  ) {
    issues.push("physical OPFS file receipt is absent");
  }

  if (
    diagnostics.consoleErrors.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.requestFailures.length > 0
    || diagnostics.errorResponses.length > 0
    || diagnostics.responseHeaders.crossOriginOpenerPolicy !== "same-origin"
    || diagnostics.responseHeaders.crossOriginEmbedderPolicy !== "require-corp"
    || diagnostics.responseHeaders.crossOriginResourcePolicy !== "same-origin"
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("worker-src 'self'")
    || !productionAssets.some((asset) => asset.endsWith(".wasm"))
    || !productionAssets.some((asset) => asset.endsWith(".js"))
    || (nested(result, "securityPolicyViolations") as unknown[] | undefined)?.length !== 0
    || (nested(result, "pageSecurityPolicyViolations") as unknown[] | undefined)?.length !== 0
  ) {
    issues.push("production build, CSP, network, or browser diagnostics are not clean");
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
        reject(new Error("could not allocate a translation-memory probe port"));
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
    "<title>Studio translation-memory SQLite OPFS probe</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Studio translation-memory SQLite OPFS probe</h1>",
    '<pre data-benchmark-output>running</pre>',
    "</main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function emptyDiagnostics(): TranslationMemorySqliteOpfsDiagnostics {
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

function observePage(
  page: Page,
  browserVersion: string,
): TranslationMemorySqliteOpfsDiagnostics {
  const mutable = emptyDiagnostics() as {
    browserVersion: string;
    consoleErrors: string[];
    consoleWarnings: string[];
    pageErrors: string[];
    requestFailures: string[];
    errorResponses: string[];
    requests: Array<{ method: string; resourceType: string; url: string }>;
    responses: Array<{ status: number; url: string }>;
    responseHeaders: TranslationMemorySqliteOpfsDiagnostics["responseHeaders"];
  };
  mutable.browserVersion = browserVersion;
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
    TRANSLATION_MEMORY_SQLITE_OPFS_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (globalName) => (window as unknown as Record<string, unknown>)[globalName],
    TRANSLATION_MEMORY_SQLITE_OPFS_RESULT_GLOBAL,
  );
}

export async function runTranslationMemorySqliteOpfsBrowserProbe(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<TranslationMemorySqliteOpfsArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-translation-memory-opfs-"));
  const sourceDirectory = join(scratch, "production-source");
  const distributionDirectory = join(scratch, "production-dist");
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(distributionDirectory, { recursive: true });
  const viteSourceDirectory = realpathSync(sourceDirectory);
  const viteDistributionDirectory = realpathSync(distributionDirectory);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(join(sourceDirectory, "entry.ts"), `import ${JSON.stringify(PAGE_ALIAS)};\n`);

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
  const assets = walkFiles(viteDistributionDirectory);

  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let diagnostics: TranslationMemorySqliteOpfsDiagnostics;
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
    (diagnostics as {
      responseHeaders: TranslationMemorySqliteOpfsDiagnostics["responseHeaders"];
    }).responseHeaders = {
      contentSecurityPolicy: await response?.headerValue("content-security-policy") ?? "",
      crossOriginOpenerPolicy:
        await response?.headerValue("cross-origin-opener-policy") ?? "",
      crossOriginEmbedderPolicy:
        await response?.headerValue("cross-origin-embedder-policy") ?? "",
      crossOriginResourcePolicy:
        await response?.headerValue("cross-origin-resource-policy") ?? "",
    };
    benchmark = await waitForResult(page);
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const validationIssues = validateTranslationMemorySqliteOpfsEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = record(benchmark)?.status;
  const status: TranslationMemorySqliteOpfsArtifact["status"] =
    browserStatus === "unsupported"
      ? "unsupported"
      : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: TranslationMemorySqliteOpfsArtifact = {
    schemaVersion: TRANSLATION_MEMORY_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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
  const resultPath = process.env.TOONSPECTRUM_TRANSLATION_MEMORY_OPFS_RESULT
    ?? TRACKED_RESULT;
  try {
    const artifact = await runTranslationMemorySqliteOpfsBrowserProbe({
      scratchDirectory: process.env.TOONSPECTRUM_TRANSLATION_MEMORY_OPFS_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      scratch: artifact.productionBuild.scratchDirectory,
      authority: nested(artifact.benchmark, "authority"),
      opening: nested(artifact.benchmark, "opening"),
      saves: nested(artifact.benchmark, "saves", "distribution"),
      loads: nested(artifact.benchmark, "loads", "distribution"),
      integrity: nested(artifact.benchmark, "integrity"),
      search: nested(artifact.benchmark, "search"),
      opfs: nested(artifact.benchmark, "opfs", "final"),
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: TranslationMemorySqliteOpfsArtifact = {
      schemaVersion: TRANSLATION_MEMORY_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: "fail",
      pass: false,
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
        scratchDirectory:
          process.env.TOONSPECTRUM_TRANSLATION_MEMORY_OPFS_VERIFY_DIR ?? "unavailable",
      },
      validationIssues: ["probe orchestrator failed before a valid browser result"],
    };
    writeJson(resultPath, failure);
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
