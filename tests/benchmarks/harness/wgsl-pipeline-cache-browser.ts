/**
 * Production Vite build -> Chromium Metal WebGPU evidence for the bounded WGSL
 * pipeline cache. Run from the repository root:
 *
 *   pnpm exec tsx tests/benchmarks/harness/wgsl-pipeline-cache-browser.ts
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

import { chromium } from "playwright";
import { build, preview } from "vite";

import type { Browser, Page } from "playwright";
import type { PreviewServer } from "vite";

export const WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION = 1 as const;
export const WGSL_PIPELINE_CACHE_RESULT_GLOBAL =
  "__TOONSPECTRUM_WGSL_PIPELINE_CACHE_RESULT__";
export const WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES = 61;

const RESULT_TIMEOUT_MS = 5 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/wgsl-pipeline-cache-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/wgsl-pipeline-cache.json",
);
const PAGE_ALIAS = "virtual:wgsl-pipeline-cache-browser-page";
const WEBGPU_ARGS = Object.freeze([
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPU",
  "--use-angle=metal",
  "--disable-software-rasterizer",
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
  "style-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

type JsonRecord = Record<string, unknown>;

export interface WgslPipelineCacheBrowserDiagnostics {
  readonly browserVersion: string;
  readonly launchArgs: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly pageErrors: readonly string[];
  readonly requestFailures: readonly string[];
  readonly errorResponses: readonly string[];
  readonly responseHeaders: Readonly<{
    contentSecurityPolicy: string;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
  }>;
}

export interface WgslPipelineCacheBrowserArtifact {
  readonly schemaVersion: typeof WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: WgslPipelineCacheBrowserDiagnostics;
  readonly productionBuild: Readonly<{
    mode: "vite-production-build";
    assets: readonly string[];
    scratchDirectory: string;
  }>;
  readonly validationIssues: readonly string[];
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
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

function close(actual: unknown, expected: number): boolean {
  const numeric = finite(actual);
  return numeric !== null && Math.abs(numeric - expected) <= 0.000002;
}

function distributionValid(value: unknown): boolean {
  const distribution = record(value);
  const samples = distribution?.samplesMs;
  if (
    distribution?.sampleCount !== WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES ||
    distribution.percentileMethod !== "nearest-rank-ceil" ||
    !Array.isArray(samples) ||
    samples.length !== WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES ||
    samples.some((sample) => (finite(sample) ?? -1) < 0)
  ) {
    return false;
  }
  const sorted = [...(samples as number[])].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1),
    );
    return sorted[index]!;
  };
  const mean = samples.reduce((sum, sample) => sum + (sample as number), 0) / samples.length;
  return (
    close(distribution.p50Ms, at(0.5)) &&
    close(distribution.p95Ms, at(0.95)) &&
    close(distribution.p99Ms, at(0.99)) &&
    close(distribution.minMs, sorted[0]!) &&
    close(distribution.maxMs, sorted.at(-1)!) &&
    close(distribution.meanMs, mean)
  );
}

function jankReceiptValid(value: unknown): boolean {
  const jank = record(value);
  const longTasks = jank?.longTasks;
  return (
    jank?.frameGapThresholdMs === 20 &&
    (finite(jank.frameGapsOverThreshold) ?? -1) >= 0 &&
    (finite(jank.p99OverP50) ?? -1) >= 0 &&
    typeof jank.longTaskObserverSupported === "boolean" &&
    (finite(jank.longTaskCount) ?? -1) >= 0 &&
    Array.isArray(longTasks) &&
    longTasks.length === jank.longTaskCount &&
    longTasks.every((task) => {
      const item = record(task);
      return (
        (finite(item?.startTime) ?? -1) >= 0 &&
        (finite(item?.duration) ?? -1) >= 0
      );
    }) &&
    (finite(jank.longestLongTaskMs) ?? -1) >= 0 &&
    (finite(jank.totalBlockingTimeMs) ?? -1) >= 0
  );
}

export function validateWgslPipelineCacheEvidence(
  benchmark: unknown,
  diagnostics: WgslPipelineCacheBrowserDiagnostics,
  productionAssets: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  if (
    nested(benchmark, "schemaVersion") !==
      WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION ||
    nested(benchmark, "status") !== "ok" ||
    nested(benchmark, "pass") !== true ||
    nested(benchmark, "execution") !==
      "vite-production-build-chromium-metal-webgpu"
  ) {
    issues.push("browser did not produce passing production WebGPU evidence");
  }
  if (
    nested(benchmark, "workload", "generator") !== "composeWgslVariant" ||
    nested(benchmark, "workload", "sampleCountPerApproach") !==
      WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES ||
    nested(benchmark, "workload", "percentileMethod") !== "nearest-rank-ceil" ||
    typeof nested(benchmark, "workload", "representativeVariantKey") !== "string" ||
    !/^[a-f0-9]{64}$/u.test(
      String(nested(benchmark, "workload", "representativeWgslSha256") ?? ""),
    )
  ) {
    issues.push("deterministic composeWgslVariant workload receipt is incomplete");
  }
  for (const approach of ["uncachedRepeatedCreation", "cachedValueUpdates"] as const) {
    if (
      !distributionValid(nested(benchmark, "approaches", approach, "operation")) ||
      !distributionValid(nested(benchmark, "approaches", approach, "frameGap")) ||
      !jankReceiptValid(nested(benchmark, "approaches", approach, "jank"))
    ) {
      issues.push(`${approach} lacks recomputable p50/p95/p99 or jank samples`);
    }
  }
  if (
    nested(benchmark, "approaches", "uncachedRepeatedCreation", "pipelineCreations") !==
      WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES ||
    nested(benchmark, "approaches", "cachedValueUpdates", "pipelineCompileInvocations") !== 1 ||
    nested(benchmark, "approaches", "cachedValueUpdates", "samePipelineReference") !== true ||
    nested(benchmark, "approaches", "cachedValueUpdates", "cacheStats", "hits") !==
      WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES
  ) {
    issues.push("cache-hit path did not eliminate repeated pipeline creation");
  }
  const structureKeys = nested(benchmark, "controls", "structureVariantKeys");
  if (
    !Array.isArray(structureKeys) ||
    structureKeys.length !== 3 ||
    new Set(structureKeys).size !== 3 ||
    nested(benchmark, "controls", "boundedLruBeforeControl", "entries") !== 2 ||
    nested(benchmark, "controls", "boundedLruBeforeControl", "estimatedBytes") !== 20 ||
    nested(benchmark, "controls", "boundedLruBeforeControl", "evictions") !== 1
  ) {
    issues.push("structure-key separation or bounded LRU receipt failed");
  }
  if (
    nested(benchmark, "controls", "inFlight", "requests") !== 16 ||
    nested(benchmark, "controls", "inFlight", "compileInvocations") !== 1 ||
    nested(benchmark, "controls", "inFlight", "samePipelineReference") !== true ||
    nested(benchmark, "controls", "inFlight", "stats", "inFlightHits") !== 15 ||
    nested(benchmark, "controls", "killedRequestRejected") !== true ||
    nested(benchmark, "controls", "afterControl", "remoteRevision") !== 42
  ) {
    issues.push("in-flight dedup or revisioned remote control evidence failed");
  }
  const gates = record(nested(benchmark, "gates"));
  if (!gates || Object.values(gates).some((gate) => gate !== true)) {
    issues.push("one or more production pipeline-cache gates failed");
  }
  if (
    diagnostics.consoleErrors.length > 0 ||
    diagnostics.pageErrors.length > 0 ||
    diagnostics.requestFailures.length > 0 ||
    diagnostics.errorResponses.length > 0
  ) {
    issues.push("browser diagnostics contain runtime or network failures");
  }
  if (
    !diagnostics.launchArgs.includes("--use-angle=metal") ||
    !diagnostics.launchArgs.includes("--disable-software-rasterizer") ||
    !diagnostics.responseHeaders.contentSecurityPolicy.includes("default-src 'none'") ||
    productionAssets.length === 0 ||
    !productionAssets.some((asset) => asset.endsWith(".js"))
  ) {
    issues.push("production build, CSP, or hardware WebGPU launch receipt is incomplete");
  }
  return issues;
}

export function validateWgslPipelineCacheArtifact(
  artifact: unknown,
): readonly string[] {
  const item = record(artifact);
  const issues: string[] = [];
  if (
    item?.schemaVersion !== WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION ||
    item.status !== "pass" ||
    item.pass !== true ||
    typeof item.generatedAt !== "string"
  ) {
    issues.push("top-level WGSL pipeline cache artifact schema/status is invalid");
  }
  const diagnostics = item?.diagnostics as
    | WgslPipelineCacheBrowserDiagnostics
    | undefined;
  const production = record(item?.productionBuild);
  if (
    !diagnostics ||
    !Array.isArray(diagnostics.consoleErrors) ||
    !Array.isArray(production?.assets)
  ) {
    issues.push("top-level diagnostics or production build receipt is absent");
    return issues;
  }
  const recomputed = validateWgslPipelineCacheEvidence(
    item?.benchmark,
    diagnostics,
    production.assets as string[],
  );
  issues.push(...recomputed);
  const recordedIssues = item?.validationIssues;
  if (!Array.isArray(recordedIssues) || recordedIssues.length !== 0) {
    issues.push("artifact records unresolved validation issues");
  }
  return issues;
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        rejectPort(new Error("failed to allocate preview port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });
}

function walkFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const absolute = join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      return statSync(absolute).isDirectory()
        ? walkFiles(absolute, relative)
        : [relative];
    });
}

function createHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>WGSL pipeline cache benchmark</title>",
    "</head>",
    "<body>",
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function emptyDiagnostics(): WgslPipelineCacheBrowserDiagnostics {
  return {
    browserVersion: "unavailable",
    launchArgs: WEBGPU_ARGS,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    responseHeaders: {
      contentSecurityPolicy: "",
      crossOriginOpenerPolicy: "",
      crossOriginEmbedderPolicy: "",
    },
  };
}

function observePage(
  page: Page,
  browserVersion: string,
): WgslPipelineCacheBrowserDiagnostics {
  const diagnostics: {
    browserVersion: string;
    launchArgs: readonly string[];
    consoleErrors: string[];
    consoleWarnings: string[];
    pageErrors: string[];
    requestFailures: string[];
    errorResponses: string[];
    responseHeaders: WgslPipelineCacheBrowserDiagnostics["responseHeaders"];
  } = {
    ...emptyDiagnostics(),
    browserVersion,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.errorResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return diagnostics;
}

async function waitForBenchmark(page: Page): Promise<unknown> {
  await page.waitForFunction(
    (key) => (window as unknown as Record<string, unknown>)[key] !== undefined,
    WGSL_PIPELINE_CACHE_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key],
    WGSL_PIPELINE_CACHE_RESULT_GLOBAL,
  );
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function runWgslPipelineCacheBrowserBenchmark(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<WgslPipelineCacheBrowserArtifact> {
  const scratch =
    options.scratchDirectory ??
    mkdtempSync(join(tmpdir(), "toonspectrum-wgsl-pipeline-cache-"));
  const sourcePath = join(scratch, "production-source");
  const distributionPath = join(scratch, "production-dist");
  mkdirSync(sourcePath, { recursive: true });
  mkdirSync(distributionPath, { recursive: true });
  const sourceDirectory = realpathSync(sourcePath);
  const distributionDirectory = realpathSync(distributionPath);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(
    join(sourceDirectory, "entry.ts"),
    `import ${JSON.stringify(PAGE_ALIAS)};\n`,
  );
  await build({
    root: sourceDirectory,
    configFile: false,
    cacheDir: join(scratch, "vite-cache"),
    clearScreen: false,
    logLevel: "error",
    base: "/",
    resolve: { alias: [{ find: PAGE_ALIAS, replacement: PAGE_ENTRY }] },
    build: {
      outDir: distributionDirectory,
      emptyOutDir: true,
      target: "es2022",
      minify: true,
      sourcemap: true,
      manifest: true,
    },
  });
  const assets = walkFiles(distributionDirectory);
  const port = await findFreePort();
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;
  let diagnostics: WgslPipelineCacheBrowserDiagnostics;
  let benchmark: unknown;
  try {
    previewServer = await preview({
      root: sourceDirectory,
      configFile: false,
      clearScreen: false,
      logLevel: "error",
      build: { outDir: distributionDirectory },
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
        },
      },
    });
    browser = await chromium.launch({ headless: true, args: [...WEBGPU_ARGS] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    diagnostics = observePage(page, browser.version());
    const response = await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    (diagnostics as { responseHeaders: typeof diagnostics.responseHeaders })
      .responseHeaders = {
      contentSecurityPolicy:
        (await response?.headerValue("content-security-policy")) ?? "",
      crossOriginOpenerPolicy:
        (await response?.headerValue("cross-origin-opener-policy")) ?? "",
      crossOriginEmbedderPolicy:
        (await response?.headerValue("cross-origin-embedder-policy")) ?? "",
    };
    benchmark = await waitForBenchmark(page);
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }
  const validationIssues = validateWgslPipelineCacheEvidence(
    benchmark,
    diagnostics,
    assets,
  );
  const benchmarkStatus = nested(benchmark, "status");
  const status: WgslPipelineCacheBrowserArtifact["status"] =
    benchmarkStatus === "unsupported"
      ? "unsupported"
      : validationIssues.length === 0
        ? "pass"
        : "fail";
  const artifact: WgslPipelineCacheBrowserArtifact = {
    schemaVersion: WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION,
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
  const resultPath =
    process.env.TOONSPECTRUM_WGSL_PIPELINE_CACHE_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runWgslPipelineCacheBrowserBenchmark({ resultPath });
    console.log(
      JSON.stringify(
        {
          status: artifact.status,
          pass: artifact.pass,
          result: resultPath,
          adapter: nested(artifact.benchmark, "adapter"),
          uncached: nested(
            artifact.benchmark,
            "approaches",
            "uncachedRepeatedCreation",
          ),
          cached: nested(
            artifact.benchmark,
            "approaches",
            "cachedValueUpdates",
          ),
          comparison: nested(artifact.benchmark, "comparison"),
          gates: nested(artifact.benchmark, "gates"),
          validationIssues: artifact.validationIssues,
        },
        null,
        2,
      ),
    );
    process.exitCode =
      artifact.status === "pass" ? 0 : artifact.status === "unsupported" ? 2 : 1;
  } catch (error) {
    const failure: WgslPipelineCacheBrowserArtifact = {
      schemaVersion: WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: "fail",
      pass: false,
      benchmark: {
        schemaVersion: 1,
        status: "error",
        pass: false,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack ?? null }
            : { name: "NonError", message: String(error) },
      },
      diagnostics: emptyDiagnostics(),
      productionBuild: {
        mode: "vite-production-build",
        assets: [],
        scratchDirectory: "unavailable",
      },
      validationIssues: ["benchmark orchestrator failed"],
    };
    writeJson(resultPath, failure);
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) await main();
