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

export const WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION = 2 as const;
export const WGSL_PIPELINE_CACHE_RESULT_GLOBAL =
  "__TOONSPECTRUM_WGSL_PIPELINE_CACHE_RESULT__";
export const WGSL_PIPELINE_CACHE_CSP_VIOLATIONS_GLOBAL =
  "__TOONSPECTRUM_WGSL_PIPELINE_CACHE_CSP_VIOLATIONS__";
export const WGSL_PIPELINE_CACHE_BOOTSTRAP_RECEIPT_GLOBAL =
  "__TOONSPECTRUM_WGSL_PIPELINE_CACHE_BOOTSTRAP_RECEIPT__";
export const WGSL_PIPELINE_CACHE_BOOTSTRAP_ORDER = [
  "csp-listener-installed",
  "zod-jitless-configured",
  "entry-import-started",
  "page-module-evaluated",
] as const;
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
const FORBIDDEN_BROWSER_JIT_FLAG =
  /(?:^|[\s,;=:"'])(?:--?)?(?:jitless|disable-jit|no-jit|no-opt|no-turbofan)(?=$|[\s,;=:"'])/iu;
export const WGSL_PIPELINE_CACHE_WEBGPU_ARGS = Object.freeze([
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPU",
  "--use-angle=metal",
  "--disable-software-rasterizer",
]);
export const WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY = [
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
  readonly actualBrowserCommandLine: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly pageErrors: readonly string[];
  readonly requestFailures: readonly string[];
  readonly errorResponses: readonly string[];
  readonly cspViolations: readonly string[];
  readonly responseHeaders: Readonly<{
    contentSecurityPolicy: string;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
  }>;
}

export interface WgslPipelineCacheCspPositiveControl {
  readonly freshContext: true;
  readonly sameStrictCsp: true;
  readonly attempted: true;
  readonly blocked: true;
  readonly errorName: "EvalError";
  readonly violationCount: number;
  readonly observedPatterns: readonly string[];
  readonly responseContentSecurityPolicy: string;
  readonly bootstrapReceipt: WgslPipelineCacheBootstrapReceipt;
}

export interface WgslPipelineCacheBootstrapReceipt {
  readonly schemaVersion: 1;
  readonly order: readonly string[];
  readonly listenerInstalledBeforeZodConfig: boolean;
  readonly listenerInstalledBeforeEntryImport: boolean;
  readonly zodJitlessConfiguredBeforeEntryImport: boolean;
  readonly pageModuleEvaluated: boolean;
  readonly zodGlobalConfigObservedByPage: boolean;
  readonly zodCoreGlobalConfigJitless: boolean;
  readonly zodAllowsEvalValue: boolean;
}

export interface WgslPipelineCacheBrowserArtifact {
  readonly schemaVersion: typeof WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "quarantined" | "unsupported";
  readonly pass: boolean;
  readonly benchmark: unknown;
  readonly diagnostics: WgslPipelineCacheBrowserDiagnostics;
  readonly cspPositiveControl: WgslPipelineCacheCspPositiveControl | null;
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

function exactStringArray(
  value: unknown,
  expected?: readonly string[],
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    (expected === undefined || JSON.stringify(value) === JSON.stringify(expected))
  );
}

export function actualBrowserCommandLineIsJitSafe(value: unknown): boolean {
  return (
    exactStringArray(value) &&
    value.length > 0 &&
    value.every((argument) => !FORBIDDEN_BROWSER_JIT_FLAG.test(argument))
  );
}

function bootstrapReceiptIsValid(
  value: unknown,
): value is WgslPipelineCacheBootstrapReceipt {
  const receipt = record(value);
  return Boolean(
    receipt &&
      receipt.schemaVersion === 1 &&
      exactStringArray(receipt.order, WGSL_PIPELINE_CACHE_BOOTSTRAP_ORDER) &&
      receipt.listenerInstalledBeforeZodConfig === true &&
      receipt.listenerInstalledBeforeEntryImport === true &&
      receipt.zodJitlessConfiguredBeforeEntryImport === true &&
      receipt.pageModuleEvaluated === true &&
      receipt.zodGlobalConfigObservedByPage === true &&
      receipt.zodCoreGlobalConfigJitless === true &&
      receipt.zodAllowsEvalValue === false
  );
}

function cspPositiveControlIsValid(value: unknown): boolean {
  const control = record(value);
  const observedPatterns = control?.observedPatterns;
  return Boolean(
    control &&
      control.freshContext === true &&
      control.sameStrictCsp === true &&
      control.attempted === true &&
      control.blocked === true &&
      control.errorName === "EvalError" &&
      exactStringArray(observedPatterns) &&
      observedPatterns.length > 0 &&
      control.violationCount === observedPatterns.length &&
      observedPatterns.includes("script-src: eval") &&
      control.responseContentSecurityPolicy ===
        WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY &&
      bootstrapReceiptIsValid(control.bootstrapReceipt)
  );
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
  cspPositiveControl: unknown = undefined,
): readonly string[] {
  const issues: string[] = [];
  const diagnosticsRecord = record(diagnostics);
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
  if (!bootstrapReceiptIsValid(nested(benchmark, "bootstrapReceipt"))) {
    issues.push("bootstrap order or Zod strict-CSP runtime receipt is invalid");
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
  const diagnosticArrays = [
    diagnosticsRecord?.consoleErrors,
    diagnosticsRecord?.consoleWarnings,
    diagnosticsRecord?.pageErrors,
    diagnosticsRecord?.requestFailures,
    diagnosticsRecord?.errorResponses,
    diagnosticsRecord?.cspViolations,
  ];
  if (!diagnosticArrays.every((value) => exactStringArray(value))) {
    issues.push("browser diagnostics must be complete string arrays");
  } else if (
    diagnosticArrays.slice(0, 5).some((value) => value.length > 0)
  ) {
    issues.push("browser diagnostics contain runtime or network failures");
  }
  const benchmarkViolations = nested(benchmark, "cspViolations");
  const diagnosticViolations = diagnosticsRecord?.cspViolations;
  if (
    !exactStringArray(benchmarkViolations) ||
    !exactStringArray(diagnosticViolations) ||
    JSON.stringify(benchmarkViolations) !== JSON.stringify(diagnosticViolations)
  ) {
    issues.push("CSP violations are missing, non-string, or suppressed");
  } else if (diagnosticViolations.length > 0) {
    issues.push("strict-CSP violations quarantine this browser evidence");
  }
  const responseHeaders = record(diagnosticsRecord?.responseHeaders);
  if (
    typeof diagnosticsRecord?.browserVersion !== "string" ||
    diagnosticsRecord.browserVersion.length === 0 ||
    !exactStringArray(
      diagnosticsRecord.launchArgs,
      WGSL_PIPELINE_CACHE_WEBGPU_ARGS,
    ) ||
    responseHeaders?.contentSecurityPolicy !==
      WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY ||
    responseHeaders.crossOriginOpenerPolicy !== "same-origin" ||
    responseHeaders.crossOriginEmbedderPolicy !== "require-corp" ||
    !exactStringArray(productionAssets) ||
    productionAssets.length === 0 ||
    !productionAssets.some((asset) => asset.endsWith(".js"))
  ) {
    issues.push("production build, exact CSP, or hardware WebGPU receipt is incomplete");
  }
  if (
    !actualBrowserCommandLineIsJitSafe(
      diagnosticsRecord?.actualBrowserCommandLine,
    ) ||
    !WGSL_PIPELINE_CACHE_WEBGPU_ARGS.every(
      (argument) =>
        (diagnosticsRecord?.actualBrowserCommandLine as
          | readonly unknown[]
          | undefined)?.includes(argument) === true,
    )
  ) {
    issues.push("actual Chromium argv is missing or disables the browser JIT");
  }
  if (!cspPositiveControlIsValid(cspPositiveControl)) {
    issues.push("fresh-context strict-CSP positive control is missing or invalid");
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
    typeof item.generatedAt !== "string" ||
    !record(item.benchmark)
  ) {
    issues.push("top-level WGSL pipeline cache artifact schema/evidence is invalid");
  }
  const diagnostics = record(item?.diagnostics);
  const production = record(item?.productionBuild);
  if (
    !diagnostics ||
    production?.mode !== "vite-production-build" ||
    !exactStringArray(production.assets)
  ) {
    issues.push("top-level diagnostics or production build receipt is absent");
    return issues;
  }
  const recomputed = validateWgslPipelineCacheEvidence(
    item?.benchmark,
    diagnostics as unknown as WgslPipelineCacheBrowserDiagnostics,
    production.assets,
    item?.cspPositiveControl,
  );
  issues.push(...recomputed);
  const diagnosticViolations = diagnostics.cspViolations;
  const expectedStatus: WgslPipelineCacheBrowserArtifact["status"] =
    nested(item?.benchmark, "status") === "unsupported"
      ? "unsupported"
      : exactStringArray(diagnosticViolations) && diagnosticViolations.length > 0
        ? "quarantined"
        : recomputed.length === 0
          ? "pass"
          : "fail";
  if (
    item?.status !== expectedStatus ||
    item.pass !== (expectedStatus === "pass")
  ) {
    issues.push("top-level WGSL pipeline cache artifact verdict is invalid");
  }
  const recordedIssues = item?.validationIssues;
  if (
    !exactStringArray(recordedIssues) ||
    JSON.stringify(recordedIssues) !== JSON.stringify(recomputed)
  ) {
    issues.push("artifact validation issues do not match recomputed evidence");
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

export function createWgslPipelineCacheCspBootstrapSource(): string {
  return [
    "// Observe strict-CSP before any dependency-bearing module can evaluate.",
    `const cspViolationsGlobal = ${JSON.stringify(WGSL_PIPELINE_CACHE_CSP_VIOLATIONS_GLOBAL)};`,
    `const bootstrapReceiptGlobal = ${JSON.stringify(WGSL_PIPELINE_CACHE_BOOTSTRAP_RECEIPT_GLOBAL)};`,
    "const cspViolations = [];",
    "const bootstrapOrder = [];",
    "globalThis[cspViolationsGlobal] = cspViolations;",
    "const bootstrapReceipt = { schemaVersion: 1, order: bootstrapOrder };",
    "globalThis[bootstrapReceiptGlobal] = bootstrapReceipt;",
    'document.addEventListener("securitypolicyviolation", (event) => {',
    '  const directive = typeof event.effectiveDirective === "string" ? event.effectiveDirective : "unknown";',
    '  const blocked = typeof event.blockedURI === "string" && event.blockedURI.length > 0 ? event.blockedURI : "inline";',
    "  cspViolations.push(`${directive}: ${blocked}`);",
    "});",
    'bootstrapOrder.push("csp-listener-installed");',
    "// Preserve the realm object and all existing properties; disable only Zod parser codegen.",
    "const existingZodConfig = globalThis.__zod_globalConfig;",
    'const zodConfig = existingZodConfig && typeof existingZodConfig === "object"',
    "  ? existingZodConfig",
    "  : {};",
    "if (zodConfig !== existingZodConfig) globalThis.__zod_globalConfig = zodConfig;",
    "zodConfig.jitless = true;",
    'bootstrapOrder.push("zod-jitless-configured");',
    'bootstrapOrder.push("entry-import-started");',
    'await import("./entry.ts");',
    "",
  ].join("\n");
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
    '<script type="module" src="/bootstrap.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function emptyDiagnostics(): WgslPipelineCacheBrowserDiagnostics {
  return {
    browserVersion: "unavailable",
    launchArgs: WGSL_PIPELINE_CACHE_WEBGPU_ARGS,
    actualBrowserCommandLine: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    cspViolations: [],
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
  actualBrowserCommandLine: readonly string[],
): WgslPipelineCacheBrowserDiagnostics {
  const diagnostics: {
    browserVersion: string;
    launchArgs: readonly string[];
    actualBrowserCommandLine: readonly string[];
    consoleErrors: string[];
    consoleWarnings: string[];
    pageErrors: string[];
    requestFailures: string[];
    errorResponses: string[];
    cspViolations: string[];
    responseHeaders: WgslPipelineCacheBrowserDiagnostics["responseHeaders"];
  } = {
    ...emptyDiagnostics(),
    browserVersion,
    actualBrowserCommandLine,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    cspViolations: [],
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

async function chromiumCommandLine(browser: Browser): Promise<readonly string[]> {
  const session = await browser.newBrowserCDPSession();
  try {
    const response = (await session.send("Browser.getBrowserCommandLine")) as {
      readonly arguments?: unknown;
    };
    if (!exactStringArray(response.arguments) || response.arguments.length === 0) {
      throw new Error("CDP Browser.getBrowserCommandLine returned no argv");
    }
    return [...response.arguments];
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function runCspPositiveControl(
  browser: Browser,
  baseUrl: string,
): Promise<WgslPipelineCacheCspPositiveControl> {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${baseUrl}?mode=csp-control`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    const result = record(await waitForBenchmark(page));
    const violations = result?.cspViolations;
    const responseContentSecurityPolicy =
      (await response?.headerValue("content-security-policy")) ?? "";
    if (
      result?.schemaVersion !== WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION ||
      result.mode !== "csp-control" ||
      result.status !== "ok" ||
      result.pass !== true ||
      result.attempted !== true ||
      result.blocked !== true ||
      result.errorName !== "EvalError" ||
      !exactStringArray(violations) ||
      !violations.includes("script-src: eval") ||
      responseContentSecurityPolicy !==
        WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY ||
      !bootstrapReceiptIsValid(result.bootstrapReceipt)
    ) {
      throw new Error(
        `strict-CSP positive control failed: ${JSON.stringify(result)}`,
      );
    }
    return {
      freshContext: true,
      sameStrictCsp: true,
      attempted: true,
      blocked: true,
      errorName: "EvalError",
      violationCount: violations.length,
      observedPatterns: [...violations],
      responseContentSecurityPolicy,
      bootstrapReceipt:
        result.bootstrapReceipt as unknown as WgslPipelineCacheBootstrapReceipt,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
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
    join(sourceDirectory, "bootstrap.ts"),
    createWgslPipelineCacheCspBootstrapSource(),
  );
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
  let cspPositiveControl: WgslPipelineCacheCspPositiveControl;
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
          "Content-Security-Policy": WGSL_PIPELINE_CACHE_CONTENT_SECURITY_POLICY,
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      },
    });
    browser = await chromium.launch({
      headless: true,
      args: [...WGSL_PIPELINE_CACHE_WEBGPU_ARGS],
    });
    const actualBrowserCommandLine = await chromiumCommandLine(browser);
    const baseUrl = `http://127.0.0.1:${port}/`;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    diagnostics = observePage(
      page,
      browser.version(),
      actualBrowserCommandLine,
    );
    const response = await page.goto(baseUrl, {
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
    const pageCspViolations = nested(benchmark, "cspViolations");
    if (
      Array.isArray(pageCspViolations) &&
      pageCspViolations.every((value) => typeof value === "string")
    ) {
      (diagnostics as { cspViolations: string[] }).cspViolations.push(
        ...(pageCspViolations as string[]),
      );
    }
    cspPositiveControl = await runCspPositiveControl(browser, baseUrl);
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }
  const validationIssues = validateWgslPipelineCacheEvidence(
    benchmark,
    diagnostics,
    assets,
    cspPositiveControl,
  );
  const benchmarkStatus = nested(benchmark, "status");
  const status: WgslPipelineCacheBrowserArtifact["status"] =
    benchmarkStatus === "unsupported"
      ? "unsupported"
      : diagnostics.cspViolations.length > 0
        ? "quarantined"
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
    cspPositiveControl,
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
        schemaVersion: WGSL_PIPELINE_CACHE_REPORT_SCHEMA_VERSION,
        status: "error",
        pass: false,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack ?? null }
            : { name: "NonError", message: String(error) },
      },
      diagnostics: emptyDiagnostics(),
      cspPositiveControl: null,
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
