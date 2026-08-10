/**
 * Real Vite production build + Chromium 140 Dedicated Worker promotion gate for VRM assets.
 *
 * Reproduce from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/vrm-asset-sqlite-opfs-browser.ts
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

export const VRM_ASSET_SQLITE_OPFS_REPORT_SCHEMA_VERSION = 1 as const;
export const VRM_ASSET_SQLITE_OPFS_RESULT_GLOBAL =
  "__TOONSPECTRUM_VRM_ASSET_SQLITE_OPFS_RESULT__";
export const VRM_ASSET_SMALL_MODEL_BYTES = 1 * 1024 * 1024;
export const VRM_ASSET_SMALL_SAVE_SAMPLES = 100;
export const VRM_ASSET_SMALL_LOAD_SAMPLES = 100;
export const VRM_ASSET_LARGE_MODEL_BYTES = 32 * 1024 * 1024;
export const VRM_ASSET_LARGE_SAVE_SAMPLES = 2;
export const VRM_ASSET_LARGE_LOAD_SAMPLES = 5;
export const VRM_ASSET_TEXTURE_SAMPLES = 100;

const RESULT_TIMEOUT_MS = 20 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/vrm-asset-sqlite-opfs-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/vrm-asset-sqlite-opfs-browser.json",
);
const PAGE_ALIAS = "virtual:vrm-asset-sqlite-opfs-browser-page";
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

export interface VrmAssetSqliteOpfsDiagnostics {
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

export interface VrmAssetProductionAssetReceipt {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface VrmAssetSqliteOpfsArtifact {
  readonly schemaVersion: typeof VRM_ASSET_SQLITE_OPFS_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported" | "quarantined";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: VrmAssetSqliteOpfsDiagnostics;
  readonly productionBuild: Readonly<{
    mode: "vite-production-build";
    assets: readonly string[];
    assetReceipts: readonly VrmAssetProductionAssetReceipt[];
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

function memorySnapshotsValid(value: unknown): boolean {
  const receipt = record(value);
  const snapshots = receipt?.snapshots;
  if (
    receipt?.policy !== "measured-browser-fields-only-no-estimates"
    || !Array.isArray(snapshots)
    || snapshots.length < 1
  ) return false;
  const allowed = new Set([
    "jsHeapSizeLimitBytes",
    "totalJSHeapSizeBytes",
    "usedJSHeapSizeBytes",
    "userAgentSpecificMemoryBytes",
    "userAgentSpecificBreakdownCount",
  ]);
  return snapshots.every((snapshot) => {
    const candidate = record(snapshot);
    const measured = record(candidate?.measured);
    if (
      typeof candidate?.label !== "string"
      || !["measured", "partial", "unavailable"].includes(String(candidate.status))
      || !measured
    ) return false;
    return Object.entries(measured).every(([key, metric]) => (
      allowed.has(key)
      && typeof metric === "number"
      && Number.isFinite(metric)
      && metric >= 0
    ));
  });
}

export function validateVrmAssetSqliteOpfsEvidence(
  benchmark: unknown,
  diagnostics: VrmAssetSqliteOpfsDiagnostics,
  productionAssets: readonly string[],
  assetReceipts: readonly VrmAssetProductionAssetReceipt[],
): readonly string[] {
  const issues: string[] = [];
  if (
    nested(benchmark, "status") !== "ok"
    || nested(benchmark, "pass") !== true
    || nested(benchmark, "normal", "status") !== "ok"
    || nested(benchmark, "normal", "pass") !== true
    || nested(benchmark, "normal", "execution")
      !== "vite-production-build-chromium-140-dedicated-worker-opfs-sahpool-cas"
  ) {
    issues.push("browser did not produce passing VRM asset Dedicated Worker evidence");
  }

  const opened = nested(benchmark, "normal", "authority", "openedOpfsDatabaseFilenames");
  const installed = nested(benchmark, "normal", "authority", "installedOpfsDirectories");
  if (
    nested(benchmark, "normal", "authority", "kind")
      !== "sqlite-opfs-sahpool-plus-opfs-sha256-cas"
    || nested(benchmark, "normal", "authority", "repository")
      !== "StudioVrmAssetSqliteOpfsRepository"
    || nested(benchmark, "normal", "authority", "repositoryFactory")
      !== "createStudioVrmAssetSqliteOpfsRepository-no-options"
    || nested(benchmark, "normal", "authority", "runtimeAcquire")
      !== "acquireStudioLocalDatabase"
    || nested(benchmark, "normal", "authority", "requestedVfs") !== "opfs"
    || nested(benchmark, "normal", "authority", "sqliteOpfsDirectory")
      !== "toonspectrum-studio-sqlite"
    || nested(benchmark, "normal", "authority", "sqliteDatabaseFilename")
      !== "studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "expectedOpenFilename")
      !== "/studio-local-v12.db"
    || nested(benchmark, "normal", "authority", "casOpfsRoot")
      !== "toonspectrum-studio-vrm-assets-v12"
    || nested(benchmark, "normal", "authority", "modelNamespace")
      !== "studio-vrm-model-assets-v12"
    || nested(benchmark, "normal", "authority", "textureNamespace")
      !== "studio-vrm-texture-paint-assets-v12"
    || nested(benchmark, "normal", "authority", "manifestKey") !== "manifest-v1"
    || nested(benchmark, "normal", "authority", "repositoryAuthority") !== "sqlite-opfs"
    || nested(benchmark, "normal", "authority", "closeCompletedBeforeReopen") !== true
    || !Array.isArray(opened)
    || opened.length !== 2
    || opened.some((filename) => filename !== "/studio-local-v12.db")
    || !Array.isArray(installed)
    || installed.length !== 2
    || installed.some((directory) => directory !== "toonspectrum-studio-sqlite")
  ) {
    issues.push("authority receipt does not prove exact shared SQLite and native OPFS CAS use");
  }

  if (
    nested(benchmark, "normal", "support", "wasm") !== true
    || nested(benchmark, "normal", "support", "opfs") !== true
    || nested(benchmark, "normal", "capabilities", "dedicatedWorker") !== true
    || nested(benchmark, "normal", "capabilities", "secureContext") !== true
    || nested(benchmark, "normal", "capabilities", "crossOriginIsolated") !== true
    || nested(benchmark, "normal", "capabilities", "navigatorStorageGetDirectory") !== true
    || nested(benchmark, "normal", "capabilities", "syncAccessHandle") !== true
    || nested(benchmark, "normal", "capabilities", "cryptoSubtle") !== true
    || nested(benchmark, "normal", "capabilities", "compressionStream") !== true
  ) {
    issues.push("required Chromium Worker/SQLite/OPFS/crypto/PNG capabilities are incomplete");
  }

  if (
    nested(benchmark, "normal", "config", "smallModelBytes")
      !== VRM_ASSET_SMALL_MODEL_BYTES
    || nested(benchmark, "normal", "config", "smallModelSaveCount")
      !== VRM_ASSET_SMALL_SAVE_SAMPLES
    || nested(benchmark, "normal", "config", "smallModelLoadCount")
      !== VRM_ASSET_SMALL_LOAD_SAMPLES
    || nested(benchmark, "normal", "smallModels", "saveMismatchCount") !== 0
    || nested(benchmark, "normal", "smallModels", "loadMismatchCount") !== 0
    || !distributionValid(
      nested(benchmark, "normal", "smallModels", "saveDistribution"),
      VRM_ASSET_SMALL_SAVE_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normal", "smallModels", "loadDistribution"),
      VRM_ASSET_SMALL_LOAD_SAMPLES,
    )
  ) {
    issues.push("1 MiB 100-save/100-load raw timing or SHA/byte evidence is incomplete");
  }

  if (
    nested(benchmark, "normal", "largeModels", "status") !== "pass"
    || nested(benchmark, "normal", "largeModels", "requestedByteLength")
      !== VRM_ASSET_LARGE_MODEL_BYTES
    || nested(benchmark, "normal", "largeModels", "completedSaveCount")
      !== VRM_ASSET_LARGE_SAVE_SAMPLES
    || nested(benchmark, "normal", "largeModels", "completedLoadCount")
      !== VRM_ASSET_LARGE_LOAD_SAMPLES
    || nested(benchmark, "normal", "largeModels", "saveMismatchCount") !== 0
    || nested(benchmark, "normal", "largeModels", "loadMismatchCount") !== 0
    || !distributionValid(
      nested(benchmark, "normal", "largeModels", "saveDistribution"),
      VRM_ASSET_LARGE_SAVE_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normal", "largeModels", "loadDistribution"),
      VRM_ASSET_LARGE_LOAD_SAMPLES,
    )
  ) {
    issues.push("32 MiB exact-size lane failed or was quarantined; no smaller substitute is accepted");
  }

  if (
    nested(benchmark, "normal", "textures", "count") !== VRM_ASSET_TEXTURE_SAMPLES
    || nested(benchmark, "normal", "textures", "width") !== 256
    || nested(benchmark, "normal", "textures", "height") !== 256
    || (finite(nested(benchmark, "normal", "textures", "aggregateBytes")) ?? 0) <= 0
    || nested(benchmark, "normal", "textures", "saveMismatchCount") !== 0
    || nested(benchmark, "normal", "textures", "loadMismatchCount") !== 0
    || !distributionValid(
      nested(benchmark, "normal", "textures", "saveDistribution"),
      VRM_ASSET_TEXTURE_SAMPLES,
    )
    || !distributionValid(
      nested(benchmark, "normal", "textures", "loadDistribution"),
      VRM_ASSET_TEXTURE_SAMPLES,
    )
  ) {
    issues.push("100 authored PNG save/load timings or exact integrity evidence is incomplete");
  }

  if (
    nested(benchmark, "normal", "integrity", "exactShaAndBytesAfterReopen") !== true
    || nested(benchmark, "normal", "integrity", "expectedModelCount") !== 102
    || nested(benchmark, "normal", "integrity", "reopenedModelCount") !== 102
    || nested(benchmark, "normal", "integrity", "expectedTextureCount") !== 100
    || nested(benchmark, "normal", "integrity", "modelManifestExactAfterReopen") !== true
    || nested(benchmark, "normal", "integrity", "textureManifestExactAfterReopen") !== true
    || nested(benchmark, "normal", "integrity", "manifestContainsBase64") !== false
    || !/^sha256:[0-9a-f]{64}$/u.test(
      String(nested(benchmark, "normal", "integrity", "modelManifestSha256")),
    )
    || !/^sha256:[0-9a-f]{64}$/u.test(
      String(nested(benchmark, "normal", "integrity", "textureManifestSha256")),
    )
  ) {
    issues.push("normal close/reopen manifest or every-asset SHA/byte equality failed");
  }

  if (
    nested(benchmark, "normal", "policy", "legacyDataMigration") !== false
    || nested(benchmark, "normal", "policy", "productLegacyIndexedDbRead") !== false
    || nested(benchmark, "normal", "policy", "binaryStoredAsSqliteBase64") !== false
    || nested(benchmark, "normal", "policy", "manifestContainsBinaryEncoding") !== false
    || nested(benchmark, "normal", "policy", "manifestLastAuthority") !== true
    || nested(benchmark, "normal", "policy", "runtimeRendererObjectStored") !== false
  ) {
    issues.push("legacy/base64/runtime-object policy receipt is incomplete");
  }

  if (
    nested(benchmark, "normal", "fallback", "memoryDatabaseOpenCount") !== 0
    || nested(benchmark, "normal", "fallback", "memoryFilesystemFallbackCount") !== 0
    || nested(benchmark, "normal", "fallback", "localStorageApiPresent") !== false
    || nested(benchmark, "normal", "fallback", "localStorageReadCount") !== 0
    || nested(benchmark, "normal", "fallback", "localStorageWriteCount") !== 0
    || nested(benchmark, "normal", "fallback", "indexedDbInstrumentationInstalled") !== true
    || nested(benchmark, "normal", "fallback", "indexedDbOpenCount") !== 0
    || nested(benchmark, "normal", "fallback", "indexedDbDeleteDatabaseCount") !== 0
  ) {
    issues.push("memory/localStorage/IndexedDB fallback counts are not all measured zero");
  }

  if (
    nested(benchmark, "normal", "opfs", "expectedAssetCount") !== 202
    || nested(benchmark, "normal", "opfs", "casAfterReopen", "exists") !== true
    || nested(benchmark, "normal", "opfs", "casAfterReopen", "blobCount") !== 202
    || nested(benchmark, "normal", "opfs", "casAfterReopen", "commitCount") !== 202
    || (finite(nested(
      benchmark,
      "normal",
      "opfs",
      "casAfterReopen",
      "totalFileBytes",
    )) ?? 0) < 164 * 1024 * 1024
  ) {
    issues.push("physical OPFS CAS blob/marker/byte evidence is incomplete");
  }

  const seedModelHash = nested(
    benchmark,
    "forcedTermination",
    "seed",
    "modelHash",
  );
  const seedTextureHash = nested(
    benchmark,
    "forcedTermination",
    "seed",
    "textureHash",
  );
  if (
    nested(benchmark, "forcedTermination", "workerTerminateCalled") !== true
    || nested(benchmark, "forcedTermination", "closeCalledBeforeTerminate") !== false
    || nested(benchmark, "forcedTermination", "seed", "pass") !== true
    || nested(benchmark, "forcedTermination", "seed", "closeCalled") !== false
    || nested(benchmark, "forcedTermination", "verify", "pass") !== true
    || nested(benchmark, "forcedTermination", "verify", "reopenedExactShaAndBytes") !== true
    || nested(benchmark, "forcedTermination", "verify", "manifestContainsBase64") !== false
    || nested(benchmark, "forcedTermination", "verify", "modelHash") !== seedModelHash
    || nested(benchmark, "forcedTermination", "verify", "textureHash") !== seedTextureHash
    || nested(benchmark, "forcedTermination", "verify", "memoryDatabaseOpenCount") !== 0
    || nested(benchmark, "forcedTermination", "verify", "localStorageReadCount") !== 0
    || nested(benchmark, "forcedTermination", "verify", "localStorageWriteCount") !== 0
    || nested(benchmark, "forcedTermination", "verify", "indexedDbOpenCount") !== 0
    || nested(benchmark, "forcedTermination", "pass") !== true
  ) {
    issues.push("forced Worker termination did not reopen exact committed model and PNG bytes");
  }

  if (
    !memorySnapshotsValid(nested(benchmark, "normal", "memory"))
    || !memorySnapshotsValid(nested(benchmark, "memory"))
  ) {
    issues.push("memory receipt contains estimates, invalid fields, or no measured/unavailable status");
  }

  if (
    diagnostics.browserVersion !== "140.0.7339.186"
    && !diagnostics.browserVersion.startsWith("140.")
  ) {
    issues.push(`expected Chromium 140, observed ${diagnostics.browserVersion}`);
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
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("worker-src 'self'")
    || !Array.isArray(nested(benchmark, "normal", "securityPolicyViolations"))
    || (nested(benchmark, "normal", "securityPolicyViolations") as unknown[]).length !== 0
    || !Array.isArray(nested(benchmark, "pageSecurityPolicyViolations"))
    || (nested(benchmark, "pageSecurityPolicyViolations") as unknown[]).length !== 0
  ) {
    issues.push("production preview CSP/COOP/COEP/CORP receipt is incomplete");
  }

  if (
    !productionAssets.some((asset) => asset.endsWith(".wasm"))
    || productionAssets.filter((asset) => asset.endsWith(".js")).length < 2
    || assetReceipts.length !== productionAssets.length
    || assetReceipts.some((asset) => (
      !productionAssets.includes(asset.path)
      || !Number.isSafeInteger(asset.bytes)
      || asset.bytes < 1
      || !/^[0-9a-f]{64}$/u.test(asset.sha256)
    ))
  ) {
    issues.push("Vite production asset list, bytes, or SHA-256 receipts are incomplete");
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

function productionAssetReceipts(
  directory: string,
  assets: readonly string[],
): VrmAssetProductionAssetReceipt[] {
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
        reject(new Error("could not allocate a VRM asset OPFS browser port"));
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
    "<title>VRM asset SQLite OPFS browser promotion gate</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>VRM asset SQLite OPFS browser promotion gate</h1>",
    '<pre data-benchmark-output>running</pre>',
    "</main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function emptyDiagnostics(): VrmAssetSqliteOpfsDiagnostics {
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

function observePage(page: Page, browserVersion: string): VrmAssetSqliteOpfsDiagnostics {
  const diagnostics = {
    ...emptyDiagnostics(),
    browserVersion,
    consoleErrors: [] as string[],
    consoleWarnings: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
    errorResponses: [] as string[],
    requests: [] as Array<{ method: string; resourceType: string; url: string }>,
    responses: [] as Array<{ status: number; url: string }>,
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
    VRM_ASSET_SQLITE_OPFS_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (name) => (window as unknown as Record<string, unknown>)[name],
    VRM_ASSET_SQLITE_OPFS_RESULT_GLOBAL,
  );
}

export async function runVrmAssetSqliteOpfsBrowserEvidence(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<VrmAssetSqliteOpfsArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-vrm-asset-opfs-"));
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
  const assetReceipts = productionAssetReceipts(viteDistributionDirectory, assets);
  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let diagnostics: VrmAssetSqliteOpfsDiagnostics;
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
    const context = await browser.newContext();
    const page = await context.newPage();
    diagnostics = observePage(page, browser.version());
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    (diagnostics as {
      responseHeaders: VrmAssetSqliteOpfsDiagnostics["responseHeaders"];
    }).responseHeaders = {
      contentSecurityPolicy: await response?.headerValue("content-security-policy") ?? "",
      crossOriginOpenerPolicy: await response?.headerValue("cross-origin-opener-policy") ?? "",
      crossOriginEmbedderPolicy: await response?.headerValue("cross-origin-embedder-policy") ?? "",
      crossOriginResourcePolicy:
        await response?.headerValue("cross-origin-resource-policy") ?? "",
    };
    benchmark = await waitForResult(page);
    await context.close();
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }

  const validationIssues = validateVrmAssetSqliteOpfsEvidence(
    benchmark,
    diagnostics,
    assets,
    assetReceipts,
  );
  const browserStatus = nested(benchmark, "status");
  const status: VrmAssetSqliteOpfsArtifact["status"] = browserStatus === "unsupported"
    ? "unsupported"
    : browserStatus === "quarantined"
      ? "quarantined"
      : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: VrmAssetSqliteOpfsArtifact = {
    schemaVersion: VRM_ASSET_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    pass: status === "pass",
    benchmark,
    diagnostics,
    productionBuild: {
      mode: "vite-production-build",
      assets,
      assetReceipts,
      scratchDirectory: scratch,
    },
    validationIssues,
  };
  writeJson(options.resultPath ?? TRACKED_RESULT, artifact);
  return artifact;
}

async function main(): Promise<void> {
  const resultPath = process.env.TOONSPECTRUM_VRM_ASSET_OPFS_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runVrmAssetSqliteOpfsBrowserEvidence({
      scratchDirectory: process.env.TOONSPECTRUM_VRM_ASSET_OPFS_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      browserVersion: artifact.diagnostics.browserVersion,
      productionAssets: artifact.productionBuild.assetReceipts,
      opening: nested(artifact.benchmark, "normal", "opening"),
      smallModels: nested(artifact.benchmark, "normal", "smallModels"),
      largeModels: nested(artifact.benchmark, "normal", "largeModels"),
      textures: nested(artifact.benchmark, "normal", "textures"),
      integrity: nested(artifact.benchmark, "normal", "integrity"),
      fallback: nested(artifact.benchmark, "normal", "fallback"),
      forcedTermination: nested(artifact.benchmark, "forcedTermination"),
      memory: nested(artifact.benchmark, "memory"),
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass"
      ? 0
      : artifact.status === "unsupported" || artifact.status === "quarantined" ? 2 : 1;
  } catch (error) {
    const failure: VrmAssetSqliteOpfsArtifact = {
      schemaVersion: VRM_ASSET_SQLITE_OPFS_REPORT_SCHEMA_VERSION,
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
        assetReceipts: [],
        scratchDirectory:
          process.env.TOONSPECTRUM_VRM_ASSET_OPFS_VERIFY_DIR ?? "unavailable",
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
