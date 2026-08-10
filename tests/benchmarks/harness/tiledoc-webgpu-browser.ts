/**
 * Real product tiled-document benchmark: production Vite bundle -> Chromium -> Metal WebGPU.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/tiledoc-webgpu-browser.ts
 *
 * Exit codes: 0 pass, 1 failed evidence, 2 explicit environment unsupported.
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

export const TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION = 1 as const;
export const TILEDOC_WEBGPU_BROWSER_RESULT_GLOBAL =
  "__TOONSPECTRUM_TILEDOC_WEBGPU_BROWSER_RESULT__";
export const TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT = 100;
export const TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT = 200;
export const TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES = 209_715_200;
export const TILEDOC_WEBGPU_BROWSER_INTERACTION_SAMPLES = 201;

const RESULT_TIMEOUT_MS = 15 * 60 * 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/harness/tiledoc-webgpu-browser-page.ts"
);
const TRACKED_RESULT = join(
  REPOSITORY_ROOT,
  "tests/benchmarks/results/tiledoc-webgpu-browser.json"
);
const CLIENT_ALIAS = "virtual:tiledoc-webgpu-browser-client";
const METAL_WEBGPU_ARGS = Object.freeze([
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPU",
  "--use-angle=metal",
  "--disable-software-rasterizer",
  "--enable-precise-memory-info",
  "--js-flags=--expose-gc",
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

type JsonRecord = Record<string, unknown>;

export interface TiledocWebGpuBrowserDiagnostics {
  readonly browserVersion: string;
  readonly hostPlatform: NodeJS.Platform;
  readonly launchArgs: readonly string[];
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

export interface TiledocWebGpuBrowserArtifact {
  readonly schemaVersion: typeof TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: TiledocWebGpuBrowserDiagnostics;
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

function positiveNumber(value: unknown): boolean {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric > 0;
}

function distributionIsComplete(value: unknown, expectedSamples: number): boolean {
  const candidate = record(value);
  const samples = candidate?.samplesMs;
  if (
    candidate?.sampleCount !== expectedSamples
    || candidate.percentileMethod !== "nearest-rank-ceil"
    || !Array.isArray(samples)
    || samples.length !== expectedSamples
    || samples.some((sample) => (finiteNumber(sample) ?? -1) < 0)
  ) {
    return false;
  }
  const sorted = [...samples as number[]].sort((left, right) => left - right);
  const nearestRank = (quantile: number): number => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1)
    );
    return sorted[index] ?? Number.NaN;
  };
  const close = (actual: unknown, expected: number): boolean => {
    const numeric = finiteNumber(actual);
    return numeric !== null && Math.abs(numeric - expected) <= 0.0002;
  };
  return close(candidate.p50Ms, nearestRank(0.5))
    && close(candidate.p95Ms, nearestRank(0.95))
    && close(candidate.p99Ms, nearestRank(0.99))
    && close(candidate.maxMs, sorted.at(-1) ?? Number.NaN);
}

function countersAreNonNegative(value: unknown): boolean {
  const candidate = record(value);
  return !!candidate && Object.values(candidate).every((entry) => (
    finiteNumber(entry) !== null && Number(entry) >= 0
  ));
}

function validateCase(
  candidate: unknown,
  expected: Readonly<{ id: string; width: number; height: number }>,
  issues: string[]
): void {
  const item = record(candidate);
  const prefix = expected.id;
  if (
    item?.id !== expected.id
    || nested(item, "dimensions", "width") !== expected.width
    || nested(item, "dimensions", "height") !== expected.height
  ) {
    issues.push(`${prefix}: exact document dimensions are absent`);
  }
  if (
    nested(item, "exactWorkload", "layerCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT
    || nested(item, "exactWorkload", "tileSize") !== 512
    || nested(item, "exactWorkload", "exactTileCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT
    || nested(item, "exactWorkload", "expectedTileCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT
    || nested(item, "exactWorkload", "exactResidentBytes") !== TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES
    || nested(item, "exactWorkload", "expectedResidentBytes") !== TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES
    || nested(item, "exactWorkload", "bytesPerTile") !== 1_048_576
    || nested(item, "exactWorkload", "proxyOrReductionUsed") !== false
  ) {
    issues.push(`${prefix}: exact 100-layer/200×512²/~200MiB workload was reduced or unproven`);
  }
  for (const scenario of ["panZoom", "edit", "reorder"] as const) {
    const scenarioValue = nested(item, "scenarios", scenario);
    if (!distributionIsComplete(
      nested(scenarioValue, "distribution"),
      TILEDOC_WEBGPU_BROWSER_INTERACTION_SAMPLES
    )) {
      issues.push(`${prefix}: ${scenario} lacks 201 recomputable raw timing samples`);
    }
    if (
      nested(scenarioValue, "declaredLayerCount") !== undefined
      && nested(scenarioValue, "declaredLayerCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT
    ) {
      issues.push(`${prefix}: ${scenario} did not retain the 100-layer document contract`);
    }
    if (!countersAreNonNegative(nested(scenarioValue, "counters"))) {
      issues.push(`${prefix}: ${scenario} counter deltas are incomplete`);
    }
  }
  if (
    nested(item, "scenarios", "panZoom", "all100LayersVisible") !== true
    || nested(item, "scenarios", "edit", "visibleLayerCount") !== 100
    || nested(item, "scenarios", "reorder", "visibleLayerCount") !== 100
  ) {
    issues.push(`${prefix}: interactive scenarios did not present all 100 layers`);
  }
  if (
    nested(item, "device", "ownership") !== "studio-gpu-fabric"
    || nested(item, "device", "sharedDevice") !== true
    || nested(item, "device", "activeLeasesAfterInitialization") !== 2
  ) {
    issues.push(`${prefix}: product bridge did not share the StudioGpuFabric device`);
  }
  if (
    !positiveNumber(nested(item, "upload", "sourceUploadCount"))
    || !positiveNumber(nested(item, "upload", "sourcePayloadBytesUploaded"))
    || !positiveNumber(nested(item, "upload", "physicalBytesUploaded"))
    || !positiveNumber(nested(item, "residency", "sourceCacheHits"))
    || !positiveNumber(nested(item, "residency", "retainedCacheHits"))
    || !positiveNumber(nested(item, "residency", "compositeCacheReuses"))
    || !positiveNumber(nested(item, "residency", "peakTrackedGpuBytes"))
  ) {
    issues.push(`${prefix}: real upload, retained residency, or cache reuse was not measured`);
  }
  if (
    nested(item, "readback", "hotPathReadbackCount") !== 0
    || nested(item, "readback", "validationReadbackCount") !== 2
    || !positiveNumber(nested(item, "readback", "validationReadbackBytes"))
    || nested(item, "readback", "timingScope")
      !== "validation readbacks executed after all interaction timing"
  ) {
    issues.push(`${prefix}: readback boundary is not zero-hot-path/two-post-timing probes`);
  }
  const digestA = nested(item, "quality", "digestA");
  if (
    nested(item, "quality", "passed") !== true
    || nested(item, "quality", "deterministic") !== true
    || typeof digestA !== "string"
    || digestA.length !== 64
    || digestA !== nested(item, "quality", "digestB")
    || (finiteNumber(nested(item, "quality", "maxLinearDelta")) ?? Infinity) > 0.002
  ) {
    issues.push(`${prefix}: deterministic post-timing texture quality probe failed`);
  }
  if (
    nested(item, "recovery", "passed") !== true
    || !positiveNumber(nested(item, "recovery", "deviceLossCount"))
    || (finiteNumber(nested(item, "recovery", "epochAfterLoss")) ?? 0)
      <= (finiteNumber(nested(item, "recovery", "epochBeforeLoss")) ?? Infinity)
    || nested(item, "scenarios", "resize", "passed") !== true
    || nested(item, "ownership", "onePrimarySurface") !== true
    || nested(item, "ownership", "primarySurfaceCount") !== 1
  ) {
    issues.push(`${prefix}: loss/resize/one-primary-surface recovery evidence failed`);
  }
  if (
    !positiveNumber(nested(item, "memory", "peakObservedJsHeapBytes"))
    || nested(item, "memory", "wasmUsed") !== false
    || nested(item, "memory", "wasmMemoryBytes") !== 0
    || nested(item, "residency", "browserExposedGpuAllocationBytes") !== null
    || typeof nested(item, "residency", "browserGpuMemoryReason") !== "string"
  ) {
    issues.push(`${prefix}: browser JS/GPU/WASM memory disclosure is incomplete`);
  }
  const gates = record(item?.gates);
  if (!gates || Object.values(gates).some((gate) => gate !== true)) {
    issues.push(`${prefix}: one or more product benchmark gates failed`);
  }
}

/** Pure evidence gate shared by the standalone runner and focused Vitest contract. */
export function validateTiledocWebGpuBrowserEvidence(
  benchmark: unknown,
  diagnostics: TiledocWebGpuBrowserDiagnostics,
  productionAssets: readonly string[]
): readonly string[] {
  const issues: string[] = [];
  const result = record(benchmark);
  if (
    result?.schemaVersion !== TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION
    || result.status !== "ok"
    || result.pass !== true
    || result.execution !== "vite-production-build-chromium-metal-webgpu"
  ) {
    const reason = typeof result?.reason === "string" ? `: ${result.reason}` : "";
    issues.push(`browser did not produce passing Metal WebGPU evidence${reason}`);
  }
  if (
    diagnostics.hostPlatform !== "darwin"
    || !diagnostics.launchArgs.includes("--use-angle=metal")
    || !diagnostics.launchArgs.includes("--disable-software-rasterizer")
    || nested(result, "browser", "webGpuExposed") !== true
    || nested(result, "browser", "secureContext") !== true
    || nested(result, "browser", "crossOriginIsolated") !== true
    || !record(result?.adapter)
  ) {
    issues.push("run did not prove Chromium Metal WebGPU with hardware fallback disabled");
  }
  if (
    nested(result, "configuration", "exactLayerCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_LAYER_COUNT
    || nested(result, "configuration", "exactTileCount") !== TILEDOC_WEBGPU_BROWSER_EXACT_TILE_COUNT
    || nested(result, "configuration", "exactResidentBytes") !== TILEDOC_WEBGPU_BROWSER_EXACT_RESIDENT_BYTES
    || nested(result, "configuration", "samplesPerInteractiveScenario")
      !== TILEDOC_WEBGPU_BROWSER_INTERACTION_SAMPLES
  ) {
    issues.push("top-level exact workload and sample-count contract is incomplete");
  }
  const cases = result?.cases;
  const expected = [
    { id: "8k-100-layer", width: 8192, height: 8192 },
    { id: "webtoon-30720-100-layer", width: 2048, height: 30_720 },
  ] as const;
  if (!Array.isArray(cases) || cases.length !== expected.length) {
    issues.push("both exact 8K and 30,720px document cases are required");
  } else {
    for (const definition of expected) {
      validateCase(
        cases.find((candidate) => record(candidate)?.id === definition.id),
        definition,
        issues
      );
    }
  }
  if (!Array.isArray(result?.cspViolations) || result.cspViolations.length !== 0) {
    issues.push("browser reported Content Security Policy violations");
  }
  if (
    diagnostics.consoleErrors.length > 0
    || diagnostics.consoleWarnings.length > 0
    || diagnostics.pageErrors.length > 0
    || diagnostics.requestFailures.length > 0
    || diagnostics.errorResponses.length > 0
  ) {
    issues.push("Chromium diagnostics contain console/page/network warnings or errors");
  }
  if (
    diagnostics.responseHeaders.crossOriginOpenerPolicy !== "same-origin"
    || diagnostics.responseHeaders.crossOriginEmbedderPolicy !== "require-corp"
    || diagnostics.responseHeaders.crossOriginResourcePolicy !== "same-origin"
    || !diagnostics.responseHeaders.contentSecurityPolicy.includes("script-src 'self'")
  ) {
    issues.push("preview response lacks required CSP/COOP/COEP/CORP headers");
  }
  if (
    productionAssets.length === 0
    || !productionAssets.some((asset) => asset.endsWith(".js"))
  ) {
    issues.push("production Vite bundle assets are absent");
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
        reject(new Error("could not allocate a tiledoc WebGPU benchmark port"));
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
    "<title>Studio tiled document Metal WebGPU benchmark</title>",
    "</head>",
    "<body>",
    "<main><h1>Studio tiled document Metal WebGPU benchmark</h1></main>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function observePage(page: Page, browserVersion: string): TiledocWebGpuBrowserDiagnostics {
  const mutable = {
    browserVersion,
    hostPlatform: process.platform,
    launchArgs: [...METAL_WEBGPU_ARGS],
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
  page.on("request", (request) => mutable.requests.push({
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  }));
  page.on("requestfailed", (request) => mutable.requestFailures.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`
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
    (globalName) => (window as unknown as Record<string, unknown>)[globalName] !== undefined,
    TILEDOC_WEBGPU_BROWSER_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS }
  );
  return page.evaluate(
    (globalName) => (window as unknown as Record<string, unknown>)[globalName],
    TILEDOC_WEBGPU_BROWSER_RESULT_GLOBAL
  );
}

function emptyDiagnostics(): TiledocWebGpuBrowserDiagnostics {
  return {
    browserVersion: "unavailable",
    hostPlatform: process.platform,
    launchArgs: METAL_WEBGPU_ARGS,
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

export async function runTiledocWebGpuBrowserBenchmark(
  options: { scratchDirectory?: string; resultPath?: string } = {}
): Promise<TiledocWebGpuBrowserArtifact> {
  const scratch = options.scratchDirectory
    ?? mkdtempSync(join(tmpdir(), "toonspectrum-tiledoc-webgpu-"));
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
    resolve: { alias: [{ find: CLIENT_ALIAS, replacement: PAGE_ENTRY }] },
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
  let diagnostics: TiledocWebGpuBrowserDiagnostics;
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
    browser = await chromium.launch({ headless: true, args: [...METAL_WEBGPU_ARGS] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    diagnostics = observePage(page, browser.version());
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    (diagnostics as { responseHeaders: TiledocWebGpuBrowserDiagnostics["responseHeaders"] })
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

  const validationIssues = validateTiledocWebGpuBrowserEvidence(
    benchmark,
    diagnostics,
    assets
  );
  const browserStatus = record(benchmark)?.status;
  const status: TiledocWebGpuBrowserArtifact["status"] = browserStatus === "unsupported"
    ? "unsupported"
    : validationIssues.length === 0 ? "pass" : "fail";
  const artifact: TiledocWebGpuBrowserArtifact = {
    schemaVersion: TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION,
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
  const resultPath = process.env.TOONSPECTRUM_TILEDOC_WEBGPU_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runTiledocWebGpuBrowserBenchmark({
      scratchDirectory: process.env.TOONSPECTRUM_TILEDOC_WEBGPU_VERIFY_DIR,
      resultPath,
    });
    console.log(JSON.stringify({
      status: artifact.status,
      pass: artifact.pass,
      result: resultPath,
      scratch: artifact.productionBuild.scratchDirectory,
      adapter: nested(artifact.benchmark, "adapter"),
      cases: Array.isArray(nested(artifact.benchmark, "cases"))
        ? (nested(artifact.benchmark, "cases") as unknown[]).map((item) => ({
            id: nested(item, "id"),
            panZoom: nested(item, "scenarios", "panZoom", "distribution"),
            edit: nested(item, "scenarios", "edit", "distribution"),
            reorder: nested(item, "scenarios", "reorder", "distribution"),
            upload: nested(item, "upload"),
            residency: nested(item, "residency"),
            memory: nested(item, "memory"),
            quality: nested(item, "quality"),
            recovery: nested(item, "recovery"),
          }))
        : [],
      diagnostics: artifact.diagnostics,
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: TiledocWebGpuBrowserArtifact = {
      schemaVersion: TILEDOC_WEBGPU_BROWSER_REPORT_SCHEMA_VERSION,
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
        scratchDirectory: process.env.TOONSPECTRUM_TILEDOC_WEBGPU_VERIFY_DIR ?? "unavailable",
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
