/**
 * Real Chromium Dedicated Worker + product Production Bible SQLite OPFS SAH-pool probe.
 *
 * Reproduce:
 *   pnpm exec tsx tests/benchmarks/harness/production-bible-sqlite-opfs-browser.ts
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

export const PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION = 1 as const;
export const PRODUCTION_BIBLE_SQLITE_OPFS_RESULT_GLOBAL =
  "__TOONSPECTRUM_PRODUCTION_BIBLE_SQLITE_OPFS_RESULT__";
export const PRODUCTION_BIBLE_SQLITE_OPFS_SAVE_SAMPLES = 60;
export const PRODUCTION_BIBLE_SQLITE_OPFS_LOAD_SAMPLES = 60;

const RESULT_TIMEOUT_MS = 5 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/production-bible-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/production-bible-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:production-bible-sqlite-opfs-browser-page";
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

export interface ProductionBibleSqliteOpfsDiagnostics {
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

export interface ProductionBibleSqliteOpfsArtifact {
  readonly schemaVersion: typeof PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: ProductionBibleSqliteOpfsDiagnostics;
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

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  ) {
    return false;
  }
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const at = (quantile: number): number =>
    sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? 0;
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = finite(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, at(0.5))
    && close(candidate.p95Ms, at(0.95))
    && close(candidate.p99Ms, at(0.99));
}

export function validateProductionBibleSqliteOpfsEvidence(
  benchmark: unknown,
  diagnostics: ProductionBibleSqliteOpfsDiagnostics,
  assets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  if (
    nested(benchmark, "status") !== "ok"
    || nested(benchmark, "pass") !== true
    || nested(benchmark, "normal", "status") !== "ok"
    || nested(benchmark, "normal", "pass") !== true
    || nested(benchmark, "normal", "execution")
      !== "vite-production-build-chromium-dedicated-worker-opfs-sahpool"
  ) {
    issues.push("browser did not produce passing Production Bible OPFS evidence");
  }
  const opened = nested(benchmark, "normal", "authority", "openedOpfsDatabaseFilenames");
  const directories = nested(benchmark, "normal", "authority", "installedOpfsDirectories");
  if (
    nested(benchmark, "normal", "authority", "kind") !== "sqlite-opfs-sahpool"
    || nested(benchmark, "normal", "authority", "productPersistence")
      !== "createStudioProductionBibleSqlitePersistence"
    || nested(benchmark, "normal", "authority", "productFactoryUsesDefaultAcquire") !== true
    || nested(benchmark, "normal", "authority", "runtimeAcquire")
      !== "acquireStudioLocalDatabase"
    || nested(benchmark, "normal", "authority", "requestedVfs") !== "opfs"
    || nested(benchmark, "normal", "authority", "namespace")
      !== "studio-production-bible-v12"
    || nested(benchmark, "normal", "authority", "logicalDatabaseFilename")
      !== "studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "expectedOpenFilename")
      !== "/studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "memoryDatabaseOpenCount") !== 0
    || nested(benchmark, "normal", "authority", "localStorageFallbackUsed") !== false
    || nested(benchmark, "normal", "authority", "closeCompletedBeforeReopen") !== true
    || !Array.isArray(opened)
    || opened.length !== 2
    || opened.some((name) => name !== "/studio-local-v12.db")
    || !Array.isArray(directories)
    || directories.length !== 2
    || directories.some((name) => name !== "toonspectrum-studio-sqlite")
  ) {
    issues.push("authority receipt does not prove two product V12 OPFS opens without fallback");
  }
  if (
    nested(benchmark, "normal", "canonical", "strictRoundTrip") !== true
    || nested(benchmark, "normal", "canonical", "persistedBeforeCloseExact") !== true
    || nested(benchmark, "normal", "canonical", "reopenedExact") !== true
    || nested(benchmark, "normal", "loads", "mismatchCount") !== 0
    || !distributionValid(
      nested(benchmark, "normal", "saves", "distribution"),
      PRODUCTION_BIBLE_SQLITE_OPFS_SAVE_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normal", "loads", "distribution"),
      PRODUCTION_BIBLE_SQLITE_OPFS_LOAD_SAMPLES,
    )
  ) {
    issues.push("canonical close/reopen round-trip or raw timing samples are incomplete");
  }
  if (
    nested(benchmark, "normal", "isolation", "pass") !== true
    || nested(benchmark, "normal", "policy", "legacyDataMigration") !== false
    || nested(benchmark, "normal", "policy", "discardExistingStudioData") !== true
    || nested(benchmark, "normal", "policy", "legacyKeyReadByProduct") !== false
    || nested(benchmark, "normal", "policy", "legacyPayloadRemainedUntouched") !== true
    || nested(benchmark, "normal", "corruption", "failClosed") !== true
  ) {
    issues.push("scope isolation, legacy discard, or strict corruption gate failed");
  }
  if (
    nested(benchmark, "normal", "faults", "quota", "loadBackend") !== "unavailable"
    || nested(benchmark, "normal", "faults", "quota", "saveBackend") !== "memory"
    || nested(benchmark, "normal", "faults", "quota", "silentFallback") !== false
    || nested(benchmark, "normal", "faults", "quota", "actualBrowserQuotaEnforcement")
      !== "quarantined-no-portable-quota-control"
    || nested(benchmark, "normal", "faults", "sahInstall", "loadBackend")
      !== "unavailable"
    || nested(benchmark, "normal", "faults", "sahInstall", "saveBackend") !== "memory"
    || nested(benchmark, "normal", "faults", "sahInstall", "silentFallback") !== false
  ) {
    issues.push("quota or SAH-pool failure did not remain explicit without silent fallback");
  }
  if (
    nested(benchmark, "forcedTermination", "workerTerminateCalled") !== true
    || nested(benchmark, "forcedTermination", "closeCalledBeforeTerminate") !== false
    || nested(benchmark, "forcedTermination", "seed", "pass") !== true
    || nested(benchmark, "forcedTermination", "verify", "pass") !== true
    || nested(benchmark, "forcedTermination", "verify", "reopenedCanonicalExact") !== true
    || nested(benchmark, "forcedTermination", "pass") !== true
  ) {
    issues.push("forced Dedicated Worker termination did not recover exact canonical bytes");
  }
  if (
    nested(benchmark, "normal", "opfs", "exists") !== true
    || (finite(nested(benchmark, "normal", "opfs", "fileCount")) ?? 0) <= 0
    || (finite(nested(benchmark, "normal", "opfs", "totalFileBytes")) ?? 0) <= 0
  ) {
    issues.push("physical OPFS file-byte evidence is absent");
  }
  if (!assets.some((asset) => asset.endsWith(".wasm"))) {
    issues.push("production bundle does not contain sqlite3.wasm");
  }
  const workerViolations = nested(benchmark, "normal", "securityPolicyViolations");
  const pageViolations = nested(benchmark, "pageSecurityPolicyViolations");
  if (
    !Array.isArray(workerViolations)
    || workerViolations.length !== 0
    || !Array.isArray(pageViolations)
    || pageViolations.length !== 0
  ) {
    issues.push("browser reported worker/page CSP violations");
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
    issues.push("preview response lacks COOP/COEP/CORP/wasm CSP headers");
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
        reject(new Error("could not allocate a Production Bible OPFS port"));
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
    "<title>Production Bible SQLite OPFS browser evidence</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Production Bible SQLite OPFS browser evidence</h1>",
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
): ProductionBibleSqliteOpfsDiagnostics {
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
    PRODUCTION_BIBLE_SQLITE_OPFS_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    PRODUCTION_BIBLE_SQLITE_OPFS_RESULT_GLOBAL,
  );
}

export async function runProductionBibleSqliteOpfsBrowserEvidence(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<ProductionBibleSqliteOpfsArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-production-bible-opfs-"));
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
  let diagnostics: ProductionBibleSqliteOpfsDiagnostics;
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
    (diagnostics as { responseHeaders: ProductionBibleSqliteOpfsDiagnostics["responseHeaders"] })
      .responseHeaders = {
        contentSecurityPolicy: await response?.headerValue("content-security-policy") ?? "",
        crossOriginOpenerPolicy: await response?.headerValue("cross-origin-opener-policy") ?? "",
        crossOriginEmbedderPolicy: await response?.headerValue("cross-origin-embedder-policy") ?? "",
        crossOriginResourcePolicy:
          await response?.headerValue("cross-origin-resource-policy") ?? "",
      };
    benchmark = await waitForResult(page);
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const validationIssues = validateProductionBibleSqliteOpfsEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = nested(benchmark, "status");
  const status: ProductionBibleSqliteOpfsArtifact["status"] = browserStatus === "unsupported"
    ? "unsupported"
    : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: ProductionBibleSqliteOpfsArtifact = {
    schemaVersion: PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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

function emptyDiagnostics(): ProductionBibleSqliteOpfsDiagnostics {
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
  const resultPath = process.env.TOONSPECTRUM_PRODUCTION_BIBLE_OPFS_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runProductionBibleSqliteOpfsBrowserEvidence({
      scratchDirectory: process.env.TOONSPECTRUM_PRODUCTION_BIBLE_OPFS_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      opening: nested(artifact.benchmark, "normal", "opening"),
      saves: nested(artifact.benchmark, "normal", "saves", "distribution"),
      loads: nested(artifact.benchmark, "normal", "loads", "distribution"),
      canonical: nested(artifact.benchmark, "normal", "canonical"),
      isolation: nested(artifact.benchmark, "normal", "isolation"),
      faults: nested(artifact.benchmark, "normal", "faults"),
      forcedTermination: nested(artifact.benchmark, "forcedTermination"),
      opfs: nested(artifact.benchmark, "normal", "opfs"),
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: ProductionBibleSqliteOpfsArtifact = {
      schemaVersion: PRODUCTION_BIBLE_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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
          process.env.TOONSPECTRUM_PRODUCTION_BIBLE_OPFS_VERIFY_DIR ?? "unavailable",
      },
      validationIssues: ["benchmark orchestrator failed before a valid browser result"],
    };
    writeJson(resultPath, failure);
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
