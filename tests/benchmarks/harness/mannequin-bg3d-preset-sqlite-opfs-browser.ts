/**
 * Real Vite production build + Chromium Dedicated Worker + OPFS SAH-pool evidence.
 *
 * Reproduce:
 *   pnpm exec tsx tests/benchmarks/harness/mannequin-bg3d-preset-sqlite-opfs-browser.ts
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

export const MANNEQUIN_BG3D_SQLITE_OPFS_REPORT_SCHEMA_VERSION = 1 as const;
export const MANNEQUIN_BG3D_SQLITE_OPFS_RESULT_GLOBAL =
  "__TOONSPECTRUM_MANNEQUIN_BG3D_SQLITE_OPFS_RESULT__";
export const MANNEQUIN_BG3D_SQLITE_OPFS_SAVE_SAMPLES = 100;
export const MANNEQUIN_BG3D_SQLITE_OPFS_LOAD_SAMPLES = 100;

const RESULT_TIMEOUT_MS = 6 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/mannequin-bg3d-preset-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/mannequin-bg3d-preset-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:mannequin-bg3d-preset-sqlite-opfs-browser-page";
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

export interface MannequinBg3dSqliteOpfsDiagnostics {
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

export interface MannequinBg3dSqliteOpfsArtifact {
  readonly schemaVersion: typeof MANNEQUIN_BG3D_SQLITE_OPFS_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: MannequinBg3dSqliteOpfsDiagnostics;
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

function stringArrayEquals(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
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

function sha256Valid(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function memoryReceiptValid(value: unknown): boolean {
  const receipt = record(value);
  if (!receipt) return false;
  const performanceExposed = receipt.performanceMemoryApiExposed;
  const performanceMemory = receipt.performanceMemory;
  const specificExposed = receipt.userAgentSpecificMemoryApiExposed;
  const specificMemory = receipt.userAgentSpecificMemory;
  const specificError = receipt.userAgentSpecificMemoryError;
  if (typeof performanceExposed !== "boolean" || typeof specificExposed !== "boolean") {
    return false;
  }
  if (performanceExposed ? record(performanceMemory) === null : performanceMemory !== null) {
    return false;
  }
  if (!specificExposed) return specificMemory === null && specificError === null;
  return (record(specificMemory) !== null && specificError === null)
    || (specificMemory === null && record(specificError) !== null);
}

export function validateMannequinBg3dSqliteOpfsEvidence(
  benchmark: unknown,
  diagnostics: MannequinBg3dSqliteOpfsDiagnostics,
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
    issues.push("browser did not produce passing mannequin/BG3D OPFS evidence");
  }

  const opened = nested(benchmark, "normal", "authority", "openedOpfsDatabaseFilenames");
  const directories = nested(benchmark, "normal", "authority", "installedOpfsDirectories");
  if (
    nested(benchmark, "normal", "authority", "kind") !== "sqlite-opfs-sahpool"
    || nested(benchmark, "normal", "authority", "productFactoriesUseDefaultAcquire") !== true
    || nested(benchmark, "normal", "authority", "runtimeAcquire")
      !== "acquireStudioLocalDatabase"
    || nested(benchmark, "normal", "authority", "requestedVfs") !== "opfs"
    || !stringArrayEquals(nested(benchmark, "normal", "authority", "namespaces"), [
      "studio-mannequin-state-v12",
      "studio-bg3d-lt-user-presets-v12",
    ])
    || !stringArrayEquals(nested(benchmark, "normal", "authority", "keys"), [
      "state-v1",
      "library-v1",
    ])
    || nested(benchmark, "normal", "authority", "logicalDatabaseFilename")
      !== "studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "expectedOpenFilename")
      !== "/studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "memoryDatabaseOpenCount") !== 0
    || !stringArrayEquals(
      nested(benchmark, "normal", "authority", "openedMemoryDatabaseFilenames"),
      [],
    )
    || nested(benchmark, "normal", "authority", "localStorageApiPresent") !== false
    || nested(benchmark, "normal", "authority", "localStorageReadCount") !== 0
    || nested(benchmark, "normal", "authority", "localStorageWriteCount") !== 0
    || nested(benchmark, "normal", "authority", "localStorageFallbackUsed") !== false
    || nested(benchmark, "normal", "authority", "memoryFallbackUsed") !== false
    || nested(benchmark, "normal", "authority", "closeCompletedBeforeReopen") !== true
    || !Array.isArray(opened)
    || opened.length !== 2
    || opened.some((name) => name !== "/studio-local-v12.db")
    || !Array.isArray(directories)
    || directories.length !== 2
    || directories.some((name) => name !== "toonspectrum-studio-sqlite")
  ) {
    issues.push("authority receipt does not prove two V12 OPFS opens with zero fallback");
  }

  for (const lane of ["mannequin", "bg3dLt"] as const) {
    if (
      nested(benchmark, "normal", lane, "persistedBeforeCloseExact") !== true
      || nested(benchmark, "normal", lane, "reopenedCanonicalBytesExact") !== true
      || nested(benchmark, "normal", lane, "reopenedSemanticExact") !== true
      || nested(benchmark, "normal", lane, "loads", "mismatchCount") !== 0
      || nested(benchmark, "normal", lane, "saves", "successfulCount")
        !== MANNEQUIN_BG3D_SQLITE_OPFS_SAVE_SAMPLES
      || nested(benchmark, "normal", lane, "loads", "successfulCount")
        !== MANNEQUIN_BG3D_SQLITE_OPFS_LOAD_SAMPLES
      || !distributionValid(
        nested(benchmark, "normal", lane, "saves", "distribution"),
        MANNEQUIN_BG3D_SQLITE_OPFS_SAVE_SAMPLES,
      )
      || !distributionValid(
        nested(benchmark, "normal", lane, "loads", "distribution"),
        MANNEQUIN_BG3D_SQLITE_OPFS_LOAD_SAMPLES,
      )
      || !sha256Valid(nested(benchmark, "normal", lane, "canonicalSha256"))
      || nested(benchmark, "normal", lane, "canonicalSha256")
        !== nested(benchmark, "normal", lane, "reopenedSha256")
      || (finite(nested(benchmark, "normal", lane, "canonicalBytes")) ?? 0) <= 0
    ) {
      issues.push(`${lane} canonical save/load/reopen evidence is incomplete`);
    }
  }

  if (
    nested(benchmark, "normal", "mannequin", "jointCount") !== 19
    || nested(benchmark, "normal", "mannequin", "bodyParamCount") !== 7
    || nested(benchmark, "normal", "mannequin", "pelvisAxisCount") !== 3
    || nested(benchmark, "normal", "bg3dLt", "presetCount") !== 32
    || nested(benchmark, "normal", "bg3dLt", "idLength") !== 80
    || nested(benchmark, "normal", "bg3dLt", "nameLength") !== 60
    || nested(benchmark, "normal", "bg3dLt", "descriptionLength") !== 240
    || (finite(nested(benchmark, "normal", "bg3dLt", "canonicalBytes")) ?? Infinity)
      > 64 * 1024
  ) {
    issues.push("workloads are not the schema-maximum canonical fixtures");
  }

  if (
    nested(benchmark, "forcedTermination", "workerTerminateCalled") !== true
    || nested(benchmark, "forcedTermination", "closeCalledBeforeTerminate") !== false
    || nested(benchmark, "forcedTermination", "seed", "pass") !== true
    || nested(benchmark, "forcedTermination", "seed", "memoryDatabaseOpenCount") !== 0
    || nested(benchmark, "forcedTermination", "seed", "localStorageApiPresent") !== false
    || nested(benchmark, "forcedTermination", "verify", "pass") !== true
    || nested(benchmark, "forcedTermination", "verify", "reopenedCanonicalExact") !== true
    || nested(benchmark, "forcedTermination", "verify", "memoryDatabaseOpenCount") !== 0
    || nested(benchmark, "forcedTermination", "verify", "localStorageApiPresent") !== false
    || nested(benchmark, "forcedTermination", "verify", "mannequin", "canonicalBytesExact")
      !== true
    || nested(benchmark, "forcedTermination", "verify", "mannequin", "semanticExact") !== true
    || nested(benchmark, "forcedTermination", "verify", "bg3dLt", "canonicalBytesExact") !== true
    || nested(benchmark, "forcedTermination", "verify", "bg3dLt", "semanticExact") !== true
    || nested(benchmark, "forcedTermination", "pass") !== true
  ) {
    issues.push("forced Dedicated Worker termination did not recover both exact canonical rows");
  }

  if (
    nested(benchmark, "normal", "memory", "unavailableApisRemainNull") !== true
    || !memoryReceiptValid(nested(benchmark, "normal", "memory", "before"))
    || !memoryReceiptValid(nested(benchmark, "normal", "memory", "after"))
  ) {
    issues.push("memory evidence uses a placeholder instead of measured values or honest nulls");
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
    issues.push("browser reported Worker/page CSP violations");
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
        reject(new Error("could not allocate a mannequin/BG3D OPFS port"));
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
    "<title>Mannequin and BG3D LT SQLite OPFS evidence</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Mannequin and BG3D LT SQLite OPFS evidence</h1>",
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
): MannequinBg3dSqliteOpfsDiagnostics {
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
    MANNEQUIN_BG3D_SQLITE_OPFS_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    MANNEQUIN_BG3D_SQLITE_OPFS_RESULT_GLOBAL,
  );
}

export async function runMannequinBg3dSqliteOpfsBrowserEvidence(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<MannequinBg3dSqliteOpfsArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-mannequin-bg3d-opfs-"));
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
  let diagnostics: MannequinBg3dSqliteOpfsDiagnostics;
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
    (diagnostics as { responseHeaders: MannequinBg3dSqliteOpfsDiagnostics["responseHeaders"] })
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

  const validationIssues = validateMannequinBg3dSqliteOpfsEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const browserStatus = nested(benchmark, "status");
  const status: MannequinBg3dSqliteOpfsArtifact["status"] = browserStatus === "unsupported"
    ? "unsupported"
    : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: MannequinBg3dSqliteOpfsArtifact = {
    schemaVersion: MANNEQUIN_BG3D_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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

function emptyDiagnostics(): MannequinBg3dSqliteOpfsDiagnostics {
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
  const resultPath = process.env.TOONSPECTRUM_MANNEQUIN_BG3D_OPFS_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runMannequinBg3dSqliteOpfsBrowserEvidence({
      scratchDirectory: process.env.TOONSPECTRUM_MANNEQUIN_BG3D_OPFS_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      opening: nested(artifact.benchmark, "normal", "opening"),
      mannequin: nested(artifact.benchmark, "normal", "mannequin"),
      bg3dLt: nested(artifact.benchmark, "normal", "bg3dLt"),
      memory: nested(artifact.benchmark, "normal", "memory"),
      forcedTermination: nested(artifact.benchmark, "forcedTermination"),
      opfs: nested(artifact.benchmark, "normal", "opfs"),
      diagnostics: artifact.diagnostics,
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: MannequinBg3dSqliteOpfsArtifact = {
      schemaVersion: MANNEQUIN_BG3D_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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
          process.env.TOONSPECTRUM_MANNEQUIN_BG3D_OPFS_VERIFY_DIR ?? "unavailable",
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
