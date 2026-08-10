/**
 * Production Vite build -> real Chromium renderer-tournament evidence.
 *
 * Run from the repository root:
 *
 *   pnpm exec tsx tests/benchmarks/harness/renderer-tournament-browser.ts
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

import { chromium } from "playwright";
import { build, preview } from "vite";

import {
  createFuzzyNeighborhoodGate,
  DEFAULT_GATE_FUZZY_DELTA,
  DEFAULT_GATE_MISMATCH_PCT,
  DEFAULT_HYSTERESIS_MIN_GAIN_PCT,
  deviceWorkloadPartitionKey,
  HysteresisPolicy,
  PromotionRegistry,
  ProviderCostModel,
  ProviderQuarantineRegistry,
  RemoteKillSwitch,
  runShadowComparison,
  runTournament,
  WinnerCache,
  type DeviceWorkloadProfile,
  type ProviderCostEvidence,
  type SceneFingerprint,
  type ShadowComparisonReport,
  type TournamentResult,
  type VisualGateResult,
} from "../../../packages/studio-engine-registry/src/tournament";

import {
  RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS,
  RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL,
  RENDERER_TOURNAMENT_BROWSER_SCENE_IDS,
  RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
  RENDERER_TOURNAMENT_BROWSER_WARMUPS,
  buildRendererTournamentScene,
  type RendererTournamentBrowserMeasurementResult,
  type RendererTournamentBrowserProfileResult,
  type RendererTournamentBrowserProviderId,
  type RendererTournamentBrowserSceneId,
} from "./renderer-tournament-browser-page";

import type { Browser, BrowserContext, Page, Response } from "playwright";
import type { PreviewServer } from "vite";

export const RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION = 2 as const;
export const RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES = 7;

const RESULT_TIMEOUT_MS = 8 * 60 * 1_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE_ENTRY = join(
  ROOT,
  "tests/benchmarks/harness/renderer-tournament-browser-page.ts",
);
const TRACKED_RESULT = join(
  ROOT,
  "tests/benchmarks/results/renderer-tournament-browser.json",
);
const PAGE_ALIAS = "virtual:renderer-tournament-browser-page";
const REFERENCE_PROVIDER_ID: RendererTournamentBrowserProviderId = "vello-cpu";
const FAULT_CONTROL_SCENE_ID: RendererTournamentBrowserSceneId = "dense-strokes";
const WEBGPU_ARGS = Object.freeze([
  "--no-sandbox",
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPU",
  "--use-angle=metal",
  "--disable-software-rasterizer",
  "--enable-precise-memory-info",
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
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

export interface RendererTournamentDistribution {
  readonly percentileMethod: "median-and-nearest-rank-ceil";
  readonly sampleCount: number;
  readonly samplesMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface RendererTournamentBrowserDiagnostics {
  readonly browserVersion: string;
  readonly hostPlatform: string;
  readonly launchArgs: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly pageErrors: readonly string[];
  readonly requestFailures: readonly string[];
  readonly errorResponses: readonly string[];
  readonly serverErrors: readonly string[];
  readonly cspViolations: readonly string[];
  readonly requestCount: number;
  readonly responseCount: number;
  readonly responseHeaders: Readonly<{
    contentSecurityPolicy: string;
    crossOriginOpenerPolicy: string;
    crossOriginEmbedderPolicy: string;
    crossOriginResourcePolicy: string;
  }>;
}

export interface RendererTournamentProviderMeasurement {
  readonly providerId: RendererTournamentBrowserProviderId;
  readonly sampleClassification: "actual-chromium-product-adapter-render";
  readonly syntheticTimingSamples: false;
  readonly status: "measured" | "unavailable";
  readonly unavailableReason: string | null;
  readonly engineVersion: string | null;
  readonly adapterVersion: string | null;
  readonly timingScope: string | null;
  readonly cold: RendererTournamentDistribution | null;
  readonly warm: RendererTournamentDistribution | null;
  readonly costEvidence: ProviderCostEvidence | null;
  readonly stageTiming: Readonly<{
    cpuPreparationMs: null;
    gpuPassMs: null;
    readbackMs: null;
    reasons: Readonly<Record<string, string>>;
  }>;
  readonly memory: Readonly<{
    peakCpuBytes: null;
    peakGpuBytes: null;
    peakWasmBytes: ProviderCostEvidence["memory"]["peakWasmBytes"];
    peakTextureBytes: null;
    peakBufferBytes: null;
    atlasOccupancyPct: null;
    atlasFragmentationPct: null;
    reasons: Readonly<Record<string, string>>;
    browserSignals: Readonly<{
      coldRuns: readonly RendererTournamentBrowserMeasurementResult["memorySignals"][];
      warmRun: RendererTournamentBrowserMeasurementResult["memorySignals"] | null;
    }>;
  }>;
  readonly visual: Readonly<{
    referenceProviderId: typeof REFERENCE_PROVIDER_ID;
    gate: VisualGateResult;
    fuzzyDelta: number;
    mismatchPctGate: number;
    pixelsBase64: string;
    pixelsSha256: string;
  }> | null;
}

export interface RendererTournamentSceneEvidence {
  readonly sceneId: RendererTournamentBrowserSceneId;
  readonly fingerprint: SceneFingerprint;
  readonly providers: readonly RendererTournamentProviderMeasurement[];
  readonly visualPassingProviders: readonly RendererTournamentBrowserProviderId[];
  readonly fastestVisualPassingProvider: RendererTournamentBrowserProviderId;
  readonly tournament: Readonly<{
    initialIncumbent: typeof REFERENCE_PROVIDER_ID;
    penDown: TournamentResult;
    penUp: TournamentResult;
    finalCachedWinner: RendererTournamentBrowserProviderId;
  }>;
  readonly shadow: Readonly<{
    winnerProviderId: RendererTournamentBrowserProviderId;
    shadowProviderId: RendererTournamentBrowserProviderId;
    report: ShadowComparisonReport;
    winnerOutputIdentityPreserved: boolean;
    winnerOutputDigestPreserved: boolean;
  }>;
  readonly promotion: Readonly<{
    providerId: RendererTournamentBrowserProviderId;
    measuredGainVsReferencePct: number;
    boundedCorpusOnly: true;
    soakPassed: false;
    outcome: ReturnType<PromotionRegistry["promote"]>;
    productWidePromotionClaimed: false;
  }>;
}

export interface RendererTournamentBrowserArtifact {
  readonly schemaVersion: typeof RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: "pass" | "fail" | "unsupported" | "quarantined";
  /** Quality/performance/evidence integrity passed independently of release policy. */
  readonly technicalPass: boolean;
  /** Technical evidence passed and every release gate, including CSP, is clean. */
  readonly releasePass: boolean;
  /** Backward-compatible release verdict. This must always equal releasePass. */
  readonly pass: boolean;
  readonly benchmark: Readonly<{
    execution: "vite-production-build-chromium-metal-webgpu";
    referencePolicy: Readonly<{
      providerId: typeof REFERENCE_PROVIDER_ID;
      role: "deterministic-vello-cpu-reference";
      sceneAuthority: "engine-neutral-scene-ir";
      note: string;
    }>;
    profile: RendererTournamentBrowserProfileResult;
    devicePartitionKey: string;
    sampling: Readonly<{
      coldSamplesPerProviderBucket: number;
      coldDefinition: string;
      warmupsExcluded: number;
      warmSamplesPerProviderBucket: number;
      warmDefinition: string;
      concurrentBenchmarks: "none";
    }>;
    scenes: readonly RendererTournamentSceneEvidence[];
    visualFailureControl: Readonly<{
      sampleClassification: "fault-injection-control-not-product-performance";
      syntheticTimingSamples: false;
      providerId: string;
      baseProviderId: RendererTournamentBrowserProviderId;
      sceneId: typeof FAULT_CONTROL_SCENE_ID;
      timing: RendererTournamentDistribution;
      gate: VisualGateResult;
      referenceWarmP50Ms: number;
      fasterThanReference: boolean;
      selectedWinnerId: typeof REFERENCE_PROVIDER_ID;
      exclusionReason: "visual-equivalence-gate-failed";
      pixelsBase64: string;
      pixelsSha256: string;
      corruption: NonNullable<RendererTournamentBrowserMeasurementResult["corruption"]>;
      quarantine: ReturnType<ProviderQuarantineRegistry["snapshot"]>;
    }>;
    hysteresisStabilityControl: Readonly<{
      sampleClassification: "repeatability-control-not-cross-provider-performance";
      syntheticTimingSamples: false;
      baseProviderId: typeof REFERENCE_PROVIDER_ID;
      sceneId: "flat-simple";
      measuredRuns: readonly RendererTournamentDistribution[];
      incumbentRunIndex: number;
      challengerRunIndex: number;
      measuredGainPct: number;
      thresholdPct: number;
      tournament: TournamentResult;
      outcome: "held-below-12-percent";
    }>;
    quarantines: readonly ReturnType<ProviderQuarantineRegistry["snapshot"]>[];
    csp: Readonly<{
      status: "clean" | "quarantined";
      cleanClaimed: boolean;
      violationCount: number;
      observedPatterns: readonly string[];
      disposition: string;
      likelySource: string | null;
      unsafeEvalAddedForBenchmark: false;
      jitDisabledForBenchmark: false;
    }>;
    packageVersions: Readonly<Record<string, string>>;
    claims: Readonly<{
      boundedCorpusOnly: true;
      productWidePromotion: false;
      cspNonInferiority: "not-measured";
      nodeTimingsMixedIntoBrowserProfile: false;
    }>;
  }> | null;
  readonly diagnostics: RendererTournamentBrowserDiagnostics;
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

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentileNearestRank(sorted: readonly number[], percentile: number): number {
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1),
  );
  return sorted[index]!;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function distribution(samples: readonly number[]): RendererTournamentDistribution {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error("timing distribution requires non-empty finite non-negative samples");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    percentileMethod: "median-and-nearest-rank-ceil",
    sampleCount: samples.length,
    samplesMs: [...samples],
    p50Ms: median(sorted),
    p95Ms: percentileNearestRank(sorted, 0.95),
    p99Ms: percentileNearestRank(sorted, 0.99),
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  };
}

function close(actual: unknown, expected: number): boolean {
  const number = finite(actual);
  return number !== null && Math.abs(number - expected) <= 0.000_001;
}

function distributionIssues(
  value: unknown,
  expectedSamples: number,
  label: string,
): string[] {
  const item = record(value);
  const samples = item?.samplesMs;
  if (!Array.isArray(samples)) return [`${label}: raw timing samples are absent`];
  if (
    samples.length !== expectedSamples ||
    item.sampleCount !== expectedSamples ||
    item.percentileMethod !== "median-and-nearest-rank-ceil" ||
    samples.some((sample) => finite(sample) === null || (sample as number) < 0)
  ) {
    return [`${label}: timing sample count or values are invalid`];
  }
  const recomputed = distribution(samples as number[]);
  const fields = ["p50Ms", "p95Ms", "p99Ms", "minMs", "maxMs"] as const;
  if (fields.some((field) => !close(item[field], recomputed[field]))) {
    return [`${label}: percentile summary is not reproducible from raw samples`];
  }
  if (!(recomputed.p50Ms <= recomputed.p95Ms && recomputed.p95Ms <= recomputed.p99Ms)) {
    return [`${label}: p50/p95/p99 are not ordered`];
  }
  return [];
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function digestHex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeVisual(measurement: RendererTournamentProviderMeasurement): Uint8Array {
  if (!measurement.visual) {
    throw new Error(`${measurement.providerId} has no visual pixels`);
  }
  return fromBase64(measurement.visual.pixelsBase64);
}

function gainPct(incumbentMs: number, challengerMs: number): number {
  return incumbentMs > 0 ? ((incumbentMs - challengerMs) / incumbentMs) * 100 : 0;
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("failed to allocate renderer tournament preview port"));
        return;
      }
      server.close((error) => (error ? rejectPort(error) : resolvePort(address.port)));
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
    "<title>Renderer Tournament browser benchmark</title>",
    "</head>",
    "<body>",
    '<main><h1>Renderer Tournament browser benchmark</h1></main>',
    '<script type="module" src="/entry.ts"></script>',
    "</body>",
    "</html>",
  ].join("");
}

function emptyDiagnostics(): RendererTournamentBrowserDiagnostics {
  return {
    browserVersion: "unavailable",
    hostPlatform: process.platform,
    launchArgs: WEBGPU_ARGS,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    serverErrors: [],
    cspViolations: [],
    requestCount: 0,
    responseCount: 0,
    responseHeaders: {
      contentSecurityPolicy: "",
      crossOriginOpenerPolicy: "",
      crossOriginEmbedderPolicy: "",
      crossOriginResourcePolicy: "",
    },
  };
}

interface MutableDiagnostics {
  browserVersion: string;
  hostPlatform: string;
  launchArgs: readonly string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  requestFailures: string[];
  errorResponses: string[];
  serverErrors: string[];
  cspViolations: string[];
  requestCount: number;
  responseCount: number;
  responseHeaders: RendererTournamentBrowserDiagnostics["responseHeaders"];
}

function observePage(page: Page, diagnostics: MutableDiagnostics): void {
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", () => {
    diagnostics.requestCount += 1;
  });
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    diagnostics.responseCount += 1;
    if (response.status() >= 400) {
      diagnostics.errorResponses.push(`${response.status()} ${response.url()}`);
    }
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
}

async function captureResponseHeaders(
  response: Response | null,
  diagnostics: MutableDiagnostics,
): Promise<void> {
  if (!response || diagnostics.responseHeaders.contentSecurityPolicy) return;
  diagnostics.responseHeaders = {
    contentSecurityPolicy: await response.headerValue("content-security-policy") ?? "",
    crossOriginOpenerPolicy:
      await response.headerValue("cross-origin-opener-policy") ?? "",
    crossOriginEmbedderPolicy:
      await response.headerValue("cross-origin-embedder-policy") ?? "",
    crossOriginResourcePolicy:
      await response.headerValue("cross-origin-resource-policy") ?? "",
  };
}

async function waitForPageResult(page: Page): Promise<unknown> {
  await page.waitForFunction(
    (key) => (window as unknown as Record<string, unknown>)[key] !== undefined,
    RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL,
    { timeout: RESULT_TIMEOUT_MS },
  );
  return page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key],
    RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL,
  );
}

function appendCspViolations(value: unknown, diagnostics: MutableDiagnostics): void {
  const violations = record(value)?.cspViolations;
  if (!Array.isArray(violations)) return;
  for (const violation of violations) {
    if (typeof violation === "string") diagnostics.cspViolations.push(violation);
  }
}

async function runIsolatedPage(
  browser: Browser,
  baseUrl: string,
  query: Readonly<Record<string, string>>,
  diagnostics: MutableDiagnostics,
): Promise<unknown> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    observePage(page, diagnostics);
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await page.goto(url.href, { waitUntil: "load", timeout: 45_000 });
    await captureResponseHeaders(response, diagnostics);
    const result = await waitForPageResult(page);
    appendCspViolations(result, diagnostics);
    return result;
  } finally {
    await context?.close().catch(() => undefined);
  }
}

function parseProfile(value: unknown): RendererTournamentBrowserProfileResult {
  const item = record(value);
  if (item?.schemaVersion !== 1 || item.mode !== "profile" || item.status !== "ok") {
    throw new Error(`profile page failed: ${JSON.stringify(value)}`);
  }
  return value as RendererTournamentBrowserProfileResult;
}

function parseMeasurement(value: unknown): RendererTournamentBrowserMeasurementResult {
  const item = record(value);
  if (
    item?.schemaVersion !== 1 ||
    !["cold", "warm", "fault-control"].includes(String(item.mode)) ||
    item.status !== "ok"
  ) {
    throw new Error(`measurement page failed: ${JSON.stringify(value)}`);
  }
  return value as RendererTournamentBrowserMeasurementResult;
}

function recordCostSamples(
  model: ProviderCostModel,
  profile: DeviceWorkloadProfile,
  providerId: string,
  bucket: string,
  coldRuns: readonly RendererTournamentBrowserMeasurementResult[],
  warmRun: RendererTournamentBrowserMeasurementResult,
): void {
  for (const run of coldRuns) {
    const milliseconds = run.samplesMs[0];
    if (milliseconds === undefined) throw new Error(`${providerId}: cold sample missing`);
    const wasmBytes = run.wasmBytesSamples[0];
    model.record(
      providerId,
      bucket,
      {
        coldMs: milliseconds,
        ...(wasmBytes === null || wasmBytes === undefined
          ? {}
          : { memory: { peakWasmBytes: wasmBytes } }),
      },
      profile,
    );
  }
  for (let index = 0; index < warmRun.samplesMs.length; index += 1) {
    const milliseconds = warmRun.samplesMs[index];
    if (milliseconds === undefined) continue;
    const wasmBytes = warmRun.wasmBytesSamples[index];
    model.record(
      providerId,
      bucket,
      {
        warmMs: milliseconds,
        ...(wasmBytes === null || wasmBytes === undefined
          ? {}
          : { memory: { peakWasmBytes: wasmBytes } }),
      },
      profile,
    );
  }
}

function providerWarmP50(measurement: RendererTournamentProviderMeasurement): number {
  if (!measurement.warm) throw new Error(`${measurement.providerId}: warm evidence absent`);
  return measurement.warm.p50Ms;
}

function createTournamentReceipt(
  sceneId: RendererTournamentBrowserSceneId,
  fingerprint: SceneFingerprint,
  profile: DeviceWorkloadProfile,
  model: ProviderCostModel,
  providers: readonly RendererTournamentProviderMeasurement[],
): RendererTournamentSceneEvidence["tournament"] {
  const eligible = providers.filter(
    (provider) => provider.status === "measured" && provider.visual?.gate.pass === true,
  );
  const reference = eligible.find((provider) => provider.providerId === REFERENCE_PROVIDER_ID);
  if (!reference) throw new Error(`${sceneId}: vello-cpu reference unavailable or divergent`);
  const cache = new WinnerCache();
  cache.set(fingerprint.bucket, profile, {
    providerId: REFERENCE_PROVIDER_ID,
    expectedWarmMs: providerWarmP50(reference),
    decidedAtSample: model.sampleCount(
      REFERENCE_PROVIDER_ID,
      fingerprint.bucket,
      profile,
    ),
  });
  const candidates = eligible.map((provider) => ({
    providerId: provider.providerId,
    render: (): Uint8Array => {
      throw new Error("measured cached tournament path must not re-render");
    },
  }));
  const request = {
    scene: buildRendererTournamentScene(sceneId),
    profile,
    candidates,
    costModel: model,
    winnerCache: cache,
    killSwitch: new RemoteKillSwitch(),
  };
  const penDown = runTournament({ ...request, penDown: true });
  const penUp = runTournament({ ...request, penDown: false });
  const final = cache.get(fingerprint.bucket, profile);
  if (!final) throw new Error(`${sceneId}: tournament did not retain a cached winner`);
  return {
    initialIncumbent: REFERENCE_PROVIDER_ID,
    penDown,
    penUp,
    finalCachedWinner: final.providerId as RendererTournamentBrowserProviderId,
  };
}

async function shadowReceipt(
  winner: RendererTournamentProviderMeasurement,
  shadow: RendererTournamentProviderMeasurement,
  width: number,
  height: number,
): Promise<RendererTournamentSceneEvidence["shadow"]> {
  const gate = createFuzzyNeighborhoodGate();
  const winnerPixels = decodeVisual(winner);
  const shadowPixels = decodeVisual(shadow);
  let resolveReport: (report: ShadowComparisonReport) => void = () => undefined;
  const reportPromise = new Promise<ShadowComparisonReport>((resolveReportPromise) => {
    resolveReport = resolveReportPromise;
  });
  const output = await runShadowComparison({
    winnerRender: () => winnerPixels,
    shadowRender: () => shadowPixels,
    gate,
    width,
    height,
    onReport: resolveReport,
  });
  const report = await reportPromise;
  return {
    winnerProviderId: winner.providerId,
    shadowProviderId: shadow.providerId,
    report,
    winnerOutputIdentityPreserved: output === winnerPixels,
    winnerOutputDigestPreserved: digestHex(output) === digestHex(winnerPixels),
  };
}

function packageVersion(packagePath: string): string {
  const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string") throw new Error(`${packagePath}: version absent`);
  return parsed.version;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readonlyDiagnostics(value: MutableDiagnostics): RendererTournamentBrowserDiagnostics {
  return {
    ...value,
    consoleErrors: [...value.consoleErrors],
    consoleWarnings: [...value.consoleWarnings],
    pageErrors: [...value.pageErrors],
    requestFailures: [...value.requestFailures],
    errorResponses: [...value.errorResponses],
    serverErrors: [...value.serverErrors],
    cspViolations: [...value.cspViolations],
  };
}

function fingerprintMatches(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function providerIdsExact(providers: unknown): boolean {
  if (!Array.isArray(providers) || providers.length !== RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS.length) {
    return false;
  }
  return RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS.every(
    (providerId) => providers.filter(
      (provider) => record(provider)?.providerId === providerId,
    ).length === 1,
  );
}

export function validateRendererTournamentBrowserArtifact(
  artifact: unknown,
): readonly string[] {
  const issues: string[] = [];
  const root = record(artifact);
  const benchmark = record(root?.benchmark);
  const diagnostics = record(root?.diagnostics);
  const production = record(root?.productionBuild);
  if (
    root?.schemaVersion !== RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION ||
    typeof root.generatedAt !== "string" ||
    !benchmark
  ) {
    issues.push("top-level renderer tournament artifact schema/evidence is invalid");
    return issues;
  }
  if (
    benchmark.execution !== "vite-production-build-chromium-metal-webgpu" ||
    record(benchmark.referencePolicy)?.providerId !== REFERENCE_PROVIDER_ID ||
    record(benchmark.claims)?.boundedCorpusOnly !== true ||
    record(benchmark.claims)?.productWidePromotion !== false ||
    record(benchmark.claims)?.nodeTimingsMixedIntoBrowserProfile !== false
  ) {
    issues.push("execution/reference/bounded-claim receipt is incomplete");
  }
  const profileResult = record(benchmark.profile);
  const profile = record(profileResult?.profile);
  const observations = record(profileResult?.profileObservation);
  if (
    profileResult?.mode !== "profile" ||
    profileResult.status !== "ok" ||
    profile?.profileVersion !== 1 ||
    profile.runtime !== "browser-main" ||
    profile.workload !== "preview" ||
    typeof profile.deviceHash !== "string" ||
    typeof profile.engineHash !== "string" ||
    typeof benchmark.devicePartitionKey !== "string" ||
    benchmark.devicePartitionKey !== deviceWorkloadPartitionKey(profile as unknown as DeviceWorkloadProfile)
  ) {
    issues.push("Chromium DeviceWorkloadProfile or partition key is invalid");
  }
  const nullableProfileFields = [
    "browserVersion",
    "operatingSystem",
    "architecture",
    "deviceMemoryGiB",
    "gpuVendor",
    "gpuArchitecture",
    "colorSpace",
    "powerPreference",
  ] as const;
  for (const field of nullableProfileFields) {
    if (profile?.[field] === null && typeof observations?.[field] !== "string") {
      issues.push(`profile field ${field} is null without an observation reason`);
    }
  }
  const scenes = benchmark.scenes;
  if (!Array.isArray(scenes) || scenes.length !== RENDERER_TOURNAMENT_BROWSER_SCENE_IDS.length) {
    issues.push("exactly three renderer tournament scene buckets are required");
    return issues;
  }
  const buckets = new Set<string>();
  const visualGate = createFuzzyNeighborhoodGate();
  for (const sceneId of RENDERER_TOURNAMENT_BROWSER_SCENE_IDS) {
    const scene = scenes.find((candidate) => record(candidate)?.sceneId === sceneId);
    const sceneRecord = record(scene);
    const fingerprint = record(sceneRecord?.fingerprint);
    const providers = sceneRecord?.providers;
    if (
      !sceneRecord ||
      fingerprint?.fingerprintVersion !== 2 ||
      typeof fingerprint.bucket !== "string" ||
      !providerIdsExact(providers)
    ) {
      issues.push(`${sceneId}: fingerprint or provider inventory is incomplete`);
      continue;
    }
    buckets.add(fingerprint.bucket);
    const measuredProviders = (providers as unknown[]).filter(
      (provider) => record(provider)?.status === "measured",
    );
    const unavailableProviders = (providers as unknown[]).filter(
      (provider) => record(provider)?.status === "unavailable",
    );
    for (const provider of unavailableProviders) {
      const item = record(provider)!;
      if (
        item.sampleClassification !== "actual-chromium-product-adapter-render" ||
        item.syntheticTimingSamples !== false
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: timing sample origin is dishonest`);
      }
      if (typeof item.unavailableReason !== "string" || item.unavailableReason.length === 0) {
        issues.push(`${sceneId}/${String(item.providerId)}: unavailable provider lacks exact reason`);
      }
    }
    const reference = measuredProviders.find(
      (provider) => record(provider)?.providerId === REFERENCE_PROVIDER_ID,
    );
    const referenceVisual = record(record(reference)?.visual);
    if (!referenceVisual || typeof referenceVisual.pixelsBase64 !== "string") {
      issues.push(`${sceneId}: deterministic vello-cpu reference pixels are absent`);
      continue;
    }
    const referencePixels = fromBase64(referenceVisual.pixelsBase64);
    for (const provider of measuredProviders) {
      const item = record(provider)!;
      if (
        item.sampleClassification !== "actual-chromium-product-adapter-render" ||
        item.syntheticTimingSamples !== false
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: timing sample origin is dishonest`);
      }
      issues.push(...distributionIssues(
        item.cold,
        RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES,
        `${sceneId}/${String(item.providerId)}/cold`,
      ));
      issues.push(...distributionIssues(
        item.warm,
        RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
        `${sceneId}/${String(item.providerId)}/warm`,
      ));
      const evidence = record(item.costEvidence);
      const coldEvidence = record(evidence?.coldMs);
      const warmEvidence = record(evidence?.warmMs);
      if (
        coldEvidence?.samples !== RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES ||
        warmEvidence?.samples !== RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: ProviderCostModel sample counts drifted`);
      }
      const memory = record(item.memory);
      const memoryReasons = record(memory?.reasons);
      for (const axis of [
        "peakCpuBytes",
        "peakGpuBytes",
        "peakTextureBytes",
        "peakBufferBytes",
        "atlasOccupancyPct",
        "atlasFragmentationPct",
      ]) {
        if (memory?.[axis] !== null || typeof memoryReasons?.[axis] !== "string") {
          issues.push(`${sceneId}/${String(item.providerId)}: ${axis} must be honest null + reason`);
        }
      }
      const wasmEvidence = record(memory?.peakWasmBytes);
      if (wasmEvidence) {
        if (
          (finite(wasmEvidence.p50) ?? 0) <= 0 ||
          (finite(wasmEvidence.p95) ?? 0) <= 0 ||
          (finite(wasmEvidence.p99) ?? 0) <= 0
        ) {
          issues.push(`${sceneId}/${String(item.providerId)}: WASM memory percentiles are invalid`);
        }
      } else if (
        item.providerId === "vello-gpu-browser" ||
        item.providerId === "vello-cpu"
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: exposed WASM memory was not measured`);
      } else if (typeof memoryReasons?.peakWasmBytes !== "string") {
        issues.push(`${sceneId}/${String(item.providerId)}: unavailable WASM memory lacks a reason`);
      }
      const stage = record(item.stageTiming);
      const stageReasons = record(stage?.reasons);
      for (const axis of ["cpuPreparationMs", "gpuPassMs", "readbackMs"]) {
        if (stage?.[axis] !== null || typeof stageReasons?.[axis] !== "string") {
          issues.push(`${sceneId}/${String(item.providerId)}: ${axis} must be null + API reason`);
        }
      }
      const visual = record(item.visual);
      const gate = record(visual?.gate);
      if (
        !visual ||
        typeof visual.pixelsBase64 !== "string" ||
        typeof visual.pixelsSha256 !== "string" ||
        sha256HexForValidation(fromBase64(visual.pixelsBase64)) !== visual.pixelsSha256
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: visual pixels/digest are invalid`);
        continue;
      }
      const pixels = fromBase64(visual.pixelsBase64);
      const recomputedGate = visualGate(
        pixels,
        referencePixels,
        fingerprint.canvasWidth as number,
        fingerprint.canvasHeight as number,
      );
      if (
        gate?.pass !== recomputedGate.pass ||
        !close(gate?.mismatchPct, recomputedGate.mismatchPct)
      ) {
        issues.push(`${sceneId}/${String(item.providerId)}: visual gate is not reproducible`);
      }
    }
    const passing = measuredProviders
      .filter((provider) => record(record(provider)?.visual)?.gate &&
        record(record(record(provider)?.visual)?.gate)?.pass === true)
      .sort((left, right) =>
        (finite(record(record(left)?.warm)?.p50Ms) ?? Number.POSITIVE_INFINITY) -
        (finite(record(record(right)?.warm)?.p50Ms) ?? Number.POSITIVE_INFINITY)
      );
    if (
      passing.length === 0 ||
      sceneRecord.fastestVisualPassingProvider !== record(passing[0])?.providerId
    ) {
      issues.push(`${sceneId}: fastest visual-passing winner is not reproducible`);
    }
    const tournament = record(sceneRecord.tournament);
    const penDown = record(tournament?.penDown);
    const penUp = record(tournament?.penUp);
    if (
      tournament?.initialIncumbent !== REFERENCE_PROVIDER_ID ||
      penDown?.winnerId !== REFERENCE_PROVIDER_ID ||
      penDown.decision !== "hysteresis-hold" ||
      penUp?.decision !== "switched" ||
      penUp.winnerId !== sceneRecord.fastestVisualPassingProvider ||
      tournament?.finalCachedWinner !== penUp?.winnerId
    ) {
      issues.push(`${sceneId}: WinnerCache/pen-down/pen-up receipt is inconsistent`);
    }
    const shadow = record(sceneRecord.shadow);
    const shadowReport = record(shadow?.report);
    const shadowGate = record(shadowReport?.gate);
    if (
      shadow?.winnerOutputIdentityPreserved !== true ||
      shadow?.winnerOutputDigestPreserved !== true ||
      shadowReport?.error !== null ||
      shadowGate?.pass !== true
    ) {
      issues.push(`${sceneId}: shadow comparison affected output or failed visual gate`);
    }
    const promotion = record(sceneRecord.promotion);
    const outcome = record(promotion?.outcome);
    if (
      promotion?.boundedCorpusOnly !== true ||
      promotion?.soakPassed !== false ||
      promotion?.productWidePromotionClaimed !== false ||
      outcome?.promoted !== false
    ) {
      issues.push(`${sceneId}: bounded evidence was misrepresented as product-wide promotion`);
    }
  }
  if (buckets.size !== RENDERER_TOURNAMENT_BROWSER_SCENE_IDS.length) {
    issues.push("SceneFingerprint v2 did not produce three materially distinct buckets");
  }
  const fault = record(benchmark.visualFailureControl);
  const faultTiming = record(fault?.timing);
  const faultGate = record(fault?.gate);
  if (
    fault?.sceneId !== FAULT_CONTROL_SCENE_ID ||
    fault?.fasterThanReference !== true ||
    fault?.selectedWinnerId !== REFERENCE_PROVIDER_ID ||
    fault?.exclusionReason !== "visual-equivalence-gate-failed" ||
    faultGate?.pass !== false ||
    record(fault?.quarantine)?.quarantined !== true
  ) {
    issues.push("measured faster-but-divergent control did not lose and quarantine");
  }
  if (
    fault?.sampleClassification !== "fault-injection-control-not-product-performance" ||
    fault.syntheticTimingSamples !== false
  ) {
    issues.push("visual failure control was mislabeled as product performance");
  }
  issues.push(...distributionIssues(
    faultTiming,
    RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
    "visual-failure-control",
  ));
  const denseScene = record((scenes as unknown[]).find(
    (scene) => record(scene)?.sceneId === FAULT_CONTROL_SCENE_ID,
  ));
  const denseProviders = denseScene?.providers;
  const denseReference = Array.isArray(denseProviders)
    ? record(denseProviders.find(
      (provider) => record(provider)?.providerId === REFERENCE_PROVIDER_ID,
    ))
    : null;
  const denseReferenceVisual = record(denseReference?.visual);
  const denseReferenceWarm = record(denseReference?.warm);
  const denseFingerprint = record(denseScene?.fingerprint);
  if (
    typeof fault?.pixelsBase64 !== "string" ||
    typeof fault.pixelsSha256 !== "string" ||
    typeof denseReferenceVisual?.pixelsBase64 !== "string" ||
    finite(denseFingerprint?.canvasWidth) === null ||
    finite(denseFingerprint?.canvasHeight) === null
  ) {
    issues.push("visual failure control lacks raw pixels or dense reference dimensions");
  } else {
    const faultPixels = fromBase64(fault.pixelsBase64);
    const referencePixels = fromBase64(denseReferenceVisual.pixelsBase64);
    const recomputedFaultGate = visualGate(
      faultPixels,
      referencePixels,
      denseFingerprint.canvasWidth as number,
      denseFingerprint.canvasHeight as number,
    );
    if (
      sha256HexForValidation(faultPixels) !== fault.pixelsSha256 ||
      faultGate?.pass !== recomputedFaultGate.pass ||
      !close(faultGate?.mismatchPct, recomputedFaultGate.mismatchPct)
    ) {
      issues.push("visual failure control pixels, digest, or fuzzy gate are not reproducible");
    }
  }
  const recomputedFaultIsFaster =
    finite(faultTiming?.p50Ms) !== null && finite(denseReferenceWarm?.p50Ms) !== null
      ? (faultTiming!.p50Ms as number) < (denseReferenceWarm!.p50Ms as number)
      : null;
  if (
    recomputedFaultIsFaster === null ||
    fault?.fasterThanReference !== recomputedFaultIsFaster ||
    !close(fault?.referenceWarmP50Ms, denseReferenceWarm?.p50Ms as number)
  ) {
    issues.push("visual failure control speed comparison is not reproducible");
  }
  const control = record(benchmark.hysteresisStabilityControl);
  const controlRuns = control?.measuredRuns;
  const controlTournament = record(control?.tournament);
  if (
    !Array.isArray(controlRuns) ||
    controlRuns.length < 2 ||
    (finite(control?.measuredGainPct) ?? 100) <= 0 ||
    (finite(control?.measuredGainPct) ?? 100) >= DEFAULT_HYSTERESIS_MIN_GAIN_PCT ||
    control?.thresholdPct !== DEFAULT_HYSTERESIS_MIN_GAIN_PCT ||
    control?.outcome !== "held-below-12-percent" ||
    controlTournament?.decision !== "hysteresis-hold"
  ) {
    issues.push("real repeated-render control did not exercise the 12% hold");
  }
  if (
    control?.sampleClassification !== "repeatability-control-not-cross-provider-performance" ||
    control.syntheticTimingSamples !== false
  ) {
    issues.push("hysteresis repeatability control was mislabeled as provider performance");
  }
  if (
    !diagnostics ||
    !Array.isArray(diagnostics.consoleErrors) ||
    diagnostics.consoleErrors.length > 0 ||
    !Array.isArray(diagnostics.pageErrors) ||
    diagnostics.pageErrors.length > 0 ||
    !Array.isArray(diagnostics.requestFailures) ||
    diagnostics.requestFailures.length > 0 ||
    !Array.isArray(diagnostics.errorResponses) ||
    diagnostics.errorResponses.length > 0 ||
    !Array.isArray(diagnostics.serverErrors) ||
    diagnostics.serverErrors.length > 0 ||
    !Array.isArray(diagnostics.cspViolations)
  ) {
    issues.push("Chromium console/page/request/5xx diagnostics contain errors or CSP diagnostics are absent");
  }
  const csp = record(benchmark.csp);
  const cspViolations = Array.isArray(diagnostics?.cspViolations)
    ? diagnostics.cspViolations.filter((value): value is string => typeof value === "string")
    : [];
  const observedCspPatterns = [...new Set(cspViolations)].sort();
  const recordedCspPatterns = Array.isArray(csp?.observedPatterns)
    ? csp.observedPatterns
    : [];
  if (
    !csp ||
    csp.cleanClaimed !== (cspViolations.length === 0) ||
    csp.violationCount !== cspViolations.length ||
    csp.unsafeEvalAddedForBenchmark !== false ||
    csp.jitDisabledForBenchmark !== false ||
    typeof csp.disposition !== "string" ||
    csp.disposition.length === 0 ||
    JSON.stringify(recordedCspPatterns) !== JSON.stringify(observedCspPatterns) ||
    (cspViolations.length === 0
      ? csp.status !== "clean"
      : csp.status !== "quarantined")
  ) {
    issues.push("CSP violations are missing, suppressed, or represented as clean");
  }
  const headers = record(diagnostics?.responseHeaders);
  const assets = production?.assets;
  if (
    production?.mode !== "vite-production-build" ||
    !Array.isArray(assets) ||
    !assets.some((asset) => typeof asset === "string" && asset.endsWith(".js")) ||
    !assets.some((asset) => typeof asset === "string" && asset.endsWith(".wasm")) ||
    typeof headers?.contentSecurityPolicy !== "string" ||
    !headers.contentSecurityPolicy.includes("wasm-unsafe-eval") ||
    headers.crossOriginOpenerPolicy !== "same-origin" ||
    headers.crossOriginEmbedderPolicy !== "require-corp"
  ) {
    issues.push("Vite production build, WASM assets, CSP, or isolation headers are incomplete");
  }
  const recordedIssues = root.validationIssues;
  if (!Array.isArray(recordedIssues) || recordedIssues.length !== 0) {
    issues.push("artifact records unresolved validation issues");
  }
  const expectedTechnicalPass = issues.length === 0;
  const expectedReleasePass = expectedTechnicalPass && csp?.status === "clean";
  const expectedStatus = expectedTechnicalPass
    ? expectedReleasePass ? "pass" : "quarantined"
    : "fail";
  if (
    root.technicalPass !== expectedTechnicalPass ||
    root.releasePass !== expectedReleasePass ||
    root.pass !== expectedReleasePass ||
    root.status !== expectedStatus
  ) {
    issues.push("top-level technical/release verdict is inconsistent with evidence and CSP");
  }
  return issues;
}

function sha256HexForValidation(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runRendererTournamentBrowserBenchmark(
  options: { scratchDirectory?: string; resultPath?: string } = {},
): Promise<RendererTournamentBrowserArtifact> {
  const scratch = options.scratchDirectory ??
    mkdtempSync(join(tmpdir(), "toonspectrum-renderer-tournament-"));
  const sourcePath = join(scratch, "production-source");
  const distributionPath = join(scratch, "production-dist");
  mkdirSync(sourcePath, { recursive: true });
  mkdirSync(distributionPath, { recursive: true });
  const sourceDirectory = realpathSync(sourcePath);
  const distributionDirectory = realpathSync(distributionPath);
  writeFileSync(join(sourceDirectory, "index.html"), createHtml());
  writeFileSync(join(sourceDirectory, "entry.ts"), `import ${JSON.stringify(PAGE_ALIAS)};\n`);
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
  const mutableDiagnostics: MutableDiagnostics = {
    ...emptyDiagnostics(),
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    serverErrors: [],
    cspViolations: [],
  };
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
          "Origin-Agent-Cluster": "?1",
        },
      },
    });
    browser = await chromium.launch({ headless: true, args: [...WEBGPU_ARGS] });
    mutableDiagnostics.browserVersion = browser.version();
    const baseUrl = `http://127.0.0.1:${port}/`;
    const profile = parseProfile(await runIsolatedPage(
      browser,
      baseUrl,
      { mode: "profile" },
      mutableDiagnostics,
    ));
    const availability = new Map(
      profile.providerAvailability.map((provider) => [provider.providerId, provider]),
    );
    const costModel = new ProviderCostModel();
    const sceneRows: Array<{
      sceneId: RendererTournamentBrowserSceneId;
      fingerprint: SceneFingerprint;
      providers: RendererTournamentProviderMeasurement[];
    }> = [];
    for (const sceneId of RENDERER_TOURNAMENT_BROWSER_SCENE_IDS) {
      const providers: RendererTournamentProviderMeasurement[] = [];
      const fingerprint = profile.fingerprints[sceneId];
      for (const providerId of RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS) {
        const providerAvailabilityRow = availability.get(providerId);
        if (!providerAvailabilityRow?.available) {
          providers.push({
            providerId,
            sampleClassification: "actual-chromium-product-adapter-render",
            syntheticTimingSamples: false,
            status: "unavailable",
            unavailableReason:
              providerAvailabilityRow?.reason ?? "provider missing from Chromium capability profile",
            engineVersion: providerAvailabilityRow?.engineVersion ?? null,
            adapterVersion: providerAvailabilityRow?.adapterVersion ?? null,
            timingScope: null,
            cold: null,
            warm: null,
            costEvidence: null,
            stageTiming: {
              cpuPreparationMs: null,
              gpuPassMs: null,
              readbackMs: null,
              reasons: { unavailable: providerAvailabilityRow?.reason ?? "not available" },
            },
            memory: {
              peakCpuBytes: null,
              peakGpuBytes: null,
              peakWasmBytes: null,
              peakTextureBytes: null,
              peakBufferBytes: null,
              atlasOccupancyPct: null,
              atlasFragmentationPct: null,
              reasons: { unavailable: providerAvailabilityRow?.reason ?? "not available" },
              browserSignals: { coldRuns: [], warmRun: null },
            },
            visual: null,
          });
          continue;
        }
        const coldRuns: RendererTournamentBrowserMeasurementResult[] = [];
        for (let sample = 0; sample < RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES; sample += 1) {
          coldRuns.push(parseMeasurement(await runIsolatedPage(
            browser,
            baseUrl,
            { mode: "cold", provider: providerId, scene: sceneId },
            mutableDiagnostics,
          )));
        }
        const warmRun = parseMeasurement(await runIsolatedPage(
          browser,
          baseUrl,
          { mode: "warm", provider: providerId, scene: sceneId },
          mutableDiagnostics,
        ));
        if (!fingerprintMatches(warmRun.fingerprint, fingerprint)) {
          throw new Error(`${sceneId}/${providerId}: fingerprint drift across browser runs`);
        }
        recordCostSamples(
          costModel,
          profile.profile,
          providerId,
          fingerprint.bucket,
          coldRuns,
          warmRun,
        );
        const evidence = costModel.evidence(providerId, fingerprint.bucket, profile.profile);
        if (!evidence) throw new Error(`${sceneId}/${providerId}: cost evidence missing`);
        const reasons = warmRun.unavailableMemoryReasons;
        providers.push({
          providerId,
          sampleClassification: "actual-chromium-product-adapter-render",
          syntheticTimingSamples: false,
          status: "measured",
          unavailableReason: null,
          engineVersion: warmRun.engineVersion,
          adapterVersion: warmRun.adapterVersion,
          timingScope: warmRun.timingScope,
          cold: distribution(coldRuns.flatMap((run) => run.samplesMs)),
          warm: distribution(warmRun.samplesMs),
          costEvidence: evidence,
          stageTiming: {
            cpuPreparationMs: null,
            gpuPassMs: null,
            readbackMs: null,
            reasons: {
              cpuPreparationMs: reasons.cpuPreparationMs ?? "adapter stage unavailable",
              gpuPassMs: reasons.gpuPassMs ?? "adapter stage unavailable",
              readbackMs: reasons.readbackMs ?? "adapter stage unavailable",
            },
          },
          memory: {
            peakCpuBytes: null,
            peakGpuBytes: null,
            peakWasmBytes: evidence.memory.peakWasmBytes,
            peakTextureBytes: null,
            peakBufferBytes: null,
            atlasOccupancyPct: null,
            atlasFragmentationPct: null,
            reasons: {
              peakCpuBytes: reasons.peakCpuBytes ?? "not exposed",
              peakGpuBytes: reasons.peakGpuBytes ?? "not exposed",
              peakWasmBytes: warmRun.wasmObservationSource
                ? `measured: ${warmRun.wasmObservationSource}`
                : reasons.peakWasmBytes ?? "not exposed",
              peakTextureBytes: reasons.peakTextureBytes ?? "not exposed",
              peakBufferBytes: reasons.peakBufferBytes ?? "not exposed",
              atlasOccupancyPct: reasons.atlasOccupancyPct ?? "not exposed",
              atlasFragmentationPct: reasons.atlasFragmentationPct ?? "not exposed",
            },
            browserSignals: {
              coldRuns: coldRuns.map((run) => run.memorySignals),
              warmRun: warmRun.memorySignals,
            },
          },
          visual: {
            referenceProviderId: REFERENCE_PROVIDER_ID,
            gate: { pass: false, mismatchPct: Number.NaN },
            fuzzyDelta: DEFAULT_GATE_FUZZY_DELTA,
            mismatchPctGate: DEFAULT_GATE_MISMATCH_PCT,
            pixelsBase64: warmRun.pixelsBase64!,
            pixelsSha256: warmRun.pixelsSha256!,
          },
        });
      }
      const reference = providers.find(
        (provider) => provider.providerId === REFERENCE_PROVIDER_ID && provider.status === "measured",
      );
      if (!reference?.visual) throw new Error(`${sceneId}: vello-cpu reference is unavailable`);
      const referencePixels = decodeVisual(reference);
      const gate = createFuzzyNeighborhoodGate();
      for (const provider of providers) {
        if (!provider.visual) continue;
        const result = gate(
          decodeVisual(provider),
          referencePixels,
          fingerprint.canvasWidth,
          fingerprint.canvasHeight,
        );
        (provider as { visual: NonNullable<RendererTournamentProviderMeasurement["visual"]> })
          .visual = { ...provider.visual, gate: result };
      }
      sceneRows.push({ sceneId, fingerprint, providers });
    }

    const finalizedScenes: RendererTournamentSceneEvidence[] = [];
    for (const row of sceneRows) {
      const passing = row.providers
        .filter((provider) => provider.status === "measured" && provider.visual?.gate.pass)
        .sort((left, right) => providerWarmP50(left) - providerWarmP50(right));
      if (passing.length === 0) throw new Error(`${row.sceneId}: no visual-passing provider`);
      const tournament = createTournamentReceipt(
        row.sceneId,
        row.fingerprint,
        profile.profile,
        costModel,
        row.providers,
      );
      const selected = row.providers.find(
        (provider) => provider.providerId === tournament.finalCachedWinner,
      );
      if (!selected) throw new Error(`${row.sceneId}: selected provider row absent`);
      const shadowProvider = row.providers.find(
        (provider) =>
          provider.status === "measured" &&
          provider.visual?.gate.pass === true &&
          provider.providerId !== selected.providerId,
      ) ?? selected;
      const shadow = await shadowReceipt(
        selected,
        shadowProvider,
        row.fingerprint.canvasWidth,
        row.fingerprint.canvasHeight,
      );
      const reference = row.providers.find(
        (provider) => provider.providerId === REFERENCE_PROVIDER_ID,
      )!;
      const measuredGainVsReferencePct = gainPct(
        providerWarmP50(reference),
        providerWarmP50(selected),
      );
      const promotions = new PromotionRegistry();
      const outcome = promotions.promote(selected.providerId, {
        visualGate: selected.visual?.gate.pass === true,
        hysteresisGain: measuredGainVsReferencePct,
        soakPassed: false,
      });
      finalizedScenes.push({
        sceneId: row.sceneId,
        fingerprint: row.fingerprint,
        providers: row.providers,
        visualPassingProviders: passing.map((provider) => provider.providerId),
        fastestVisualPassingProvider: passing[0]!.providerId,
        tournament,
        shadow,
        promotion: {
          providerId: selected.providerId,
          measuredGainVsReferencePct,
          boundedCorpusOnly: true,
          soakPassed: false,
          outcome,
          productWidePromotionClaimed: false,
        },
      });
    }

    const dense = finalizedScenes.find((scene) => scene.sceneId === FAULT_CONTROL_SCENE_ID)!;
    const denseReference = dense.providers.find(
      (provider) => provider.providerId === REFERENCE_PROVIDER_ID,
    )!;
    const fasterBase = dense.providers
      .filter(
        (provider) =>
          provider.status === "measured" &&
          provider.providerId !== REFERENCE_PROVIDER_ID &&
          providerWarmP50(provider) < providerWarmP50(denseReference),
      )
      .sort((left, right) => providerWarmP50(left) - providerWarmP50(right))[0];
    if (!fasterBase) {
      throw new Error("dense scene has no browser-measured candidate faster than vello-cpu");
    }
    const faultRun = parseMeasurement(await runIsolatedPage(
      browser,
      baseUrl,
      {
        mode: "fault-control",
        provider: fasterBase.providerId,
        scene: FAULT_CONTROL_SCENE_ID,
      },
      mutableDiagnostics,
    ));
    const faultTiming = distribution(faultRun.samplesMs);
    const faultPixels = fromBase64(faultRun.pixelsBase64!);
    const faultGate = createFuzzyNeighborhoodGate()(
      faultPixels,
      decodeVisual(denseReference),
      dense.fingerprint.canvasWidth,
      dense.fingerprint.canvasHeight,
    );
    const faultProviderId = `${fasterBase.providerId}-corruption-control`;
    const quarantine = new ProviderQuarantineRegistry();
    for (let failure = 0; failure < quarantine.policy.visualFailureThreshold; failure += 1) {
      quarantine.recordVisualGate(faultProviderId, faultGate);
    }
    const quarantineSnapshot = quarantine.snapshot(faultProviderId);
    if (!quarantineSnapshot || !faultRun.corruption) {
      throw new Error("fault-control quarantine/corruption receipt absent");
    }

    const stabilityRuns: RendererTournamentDistribution[] = [];
    const originalFlatReference = finalizedScenes
      .find((scene) => scene.sceneId === "flat-simple")!
      .providers.find((provider) => provider.providerId === REFERENCE_PROVIDER_ID)!;
    stabilityRuns.push(originalFlatReference.warm!);
    let stabilityPair: { incumbent: number; challenger: number; gain: number } | null = null;
    for (let attempt = 0; attempt < 6 && !stabilityPair; attempt += 1) {
      const repeat = parseMeasurement(await runIsolatedPage(
        browser,
        baseUrl,
        { mode: "warm", provider: REFERENCE_PROVIDER_ID, scene: "flat-simple" },
        mutableDiagnostics,
      ));
      stabilityRuns.push(distribution(repeat.samplesMs));
      for (let left = 0; left < stabilityRuns.length; left += 1) {
        for (let right = left + 1; right < stabilityRuns.length; right += 1) {
          const a = stabilityRuns[left]!.p50Ms;
          const b = stabilityRuns[right]!.p50Ms;
          const incumbent = a >= b ? left : right;
          const challenger = a >= b ? right : left;
          const gain = gainPct(
            stabilityRuns[incumbent]!.p50Ms,
            stabilityRuns[challenger]!.p50Ms,
          );
          if (gain > 0 && gain < DEFAULT_HYSTERESIS_MIN_GAIN_PCT) {
            stabilityPair = { incumbent, challenger, gain };
            break;
          }
        }
        if (stabilityPair) break;
      }
    }
    if (!stabilityPair) {
      throw new Error("could not obtain an actual repeated-render pair inside 12% hysteresis");
    }
    const flatScene = finalizedScenes.find((scene) => scene.sceneId === "flat-simple")!;
    const stabilityModel = new ProviderCostModel();
    const incumbentId = "vello-cpu-repeat-incumbent";
    const challengerId = "vello-cpu-repeat-challenger";
    for (const milliseconds of stabilityRuns[stabilityPair.incumbent]!.samplesMs) {
      stabilityModel.record(incumbentId, flatScene.fingerprint.bucket, { warmMs: milliseconds }, profile.profile);
    }
    for (const milliseconds of stabilityRuns[stabilityPair.challenger]!.samplesMs) {
      stabilityModel.record(challengerId, flatScene.fingerprint.bucket, { warmMs: milliseconds }, profile.profile);
    }
    const stabilityCache = new WinnerCache();
    stabilityCache.set(flatScene.fingerprint.bucket, profile.profile, {
      providerId: incumbentId,
      expectedWarmMs: stabilityRuns[stabilityPair.incumbent]!.p50Ms,
      decidedAtSample: RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
    });
    const stabilityTournament = runTournament({
      scene: buildRendererTournamentScene("flat-simple"),
      profile: profile.profile,
      candidates: [
        { providerId: incumbentId, render: () => { throw new Error("cached control rendered"); } },
        { providerId: challengerId, render: () => { throw new Error("cached control rendered"); } },
      ],
      costModel: stabilityModel,
      winnerCache: stabilityCache,
      killSwitch: new RemoteKillSwitch(),
      hysteresis: new HysteresisPolicy(),
      penDown: false,
    });

    const benchmark: NonNullable<RendererTournamentBrowserArtifact["benchmark"]> = {
      execution: "vite-production-build-chromium-metal-webgpu",
      referencePolicy: {
        providerId: REFERENCE_PROVIDER_ID,
        role: "deterministic-vello-cpu-reference",
        sceneAuthority: "engine-neutral-scene-ir",
        note:
          "Every provider consumes the same stable SceneIR. vello_cpu 0.2.0 is the committed deterministic reference renderer; CanvasKit remains an independent third engine when available.",
      },
      profile,
      devicePartitionKey: deviceWorkloadPartitionKey(profile.profile),
      sampling: {
        coldSamplesPerProviderBucket: RENDERER_TOURNAMENT_BROWSER_COLD_SAMPLES,
        coldDefinition:
          "fresh Chromium context: dynamic provider chunk + WASM initialization + first adapter render/readback",
        warmupsExcluded: RENDERER_TOURNAMENT_BROWSER_WARMUPS,
        warmSamplesPerProviderBucket: RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES,
        warmDefinition:
          "fresh provider context initialized once, three adapter renders excluded, then 31 consecutive real renders",
        concurrentBenchmarks: "none",
      },
      scenes: finalizedScenes,
      visualFailureControl: {
        sampleClassification: "fault-injection-control-not-product-performance",
        syntheticTimingSamples: false,
        providerId: faultProviderId,
        baseProviderId: fasterBase.providerId,
        sceneId: FAULT_CONTROL_SCENE_ID,
        timing: faultTiming,
        gate: faultGate,
        referenceWarmP50Ms: providerWarmP50(denseReference),
        fasterThanReference: faultTiming.p50Ms < providerWarmP50(denseReference),
        selectedWinnerId: REFERENCE_PROVIDER_ID,
        exclusionReason: "visual-equivalence-gate-failed",
        pixelsBase64: faultRun.pixelsBase64!,
        pixelsSha256: faultRun.pixelsSha256!,
        corruption: faultRun.corruption,
        quarantine: quarantineSnapshot,
      },
      hysteresisStabilityControl: {
        sampleClassification: "repeatability-control-not-cross-provider-performance",
        syntheticTimingSamples: false,
        baseProviderId: REFERENCE_PROVIDER_ID,
        sceneId: "flat-simple",
        measuredRuns: stabilityRuns,
        incumbentRunIndex: stabilityPair.incumbent,
        challengerRunIndex: stabilityPair.challenger,
        measuredGainPct: stabilityPair.gain,
        thresholdPct: DEFAULT_HYSTERESIS_MIN_GAIN_PCT,
        tournament: stabilityTournament,
        outcome: "held-below-12-percent",
      },
      quarantines: [quarantineSnapshot],
      csp: {
        status: mutableDiagnostics.cspViolations.length === 0 ? "clean" : "quarantined",
        cleanClaimed: mutableDiagnostics.cspViolations.length === 0,
        violationCount: mutableDiagnostics.cspViolations.length,
        observedPatterns: [...new Set(mutableDiagnostics.cspViolations)].sort(),
        disposition: mutableDiagnostics.cspViolations.length === 0
          ? "no securitypolicyviolation event observed"
          : "retained as an explicit release quarantine; renderer timing and visual evidence remain usable, but this run does not claim CSP-clean execution",
        likelySource: mutableDiagnostics.cspViolations.every(
          (violation) => violation === "script-src: eval",
        )
          ? "inference from source audit: Zod allowsEval caught Function probe under strict CSP"
          : null,
        unsafeEvalAddedForBenchmark: false,
        jitDisabledForBenchmark: false,
      },
      packageVersions: {
        playwright: packageVersion(join(ROOT, "node_modules/playwright/package.json")),
        vite: packageVersion(join(ROOT, "node_modules/vite/package.json")),
        canvaskitWasm: packageVersion(join(ROOT, "node_modules/canvaskit-wasm/package.json")),
        studioEngineRegistry: packageVersion(join(ROOT, "packages/studio-engine-registry/package.json")),
        studioEngineVello: packageVersion(join(ROOT, "packages/studio-engine-vello/package.json")),
        studioEngineSkia: packageVersion(join(ROOT, "packages/studio-engine-skia/package.json")),
      },
      claims: {
        boundedCorpusOnly: true,
        productWidePromotion: false,
        cspNonInferiority: "not-measured",
        nodeTimingsMixedIntoBrowserProfile: false,
      },
    };
    const cspClean = benchmark.csp.status === "clean";
    const provisional: RendererTournamentBrowserArtifact = {
      schemaVersion: RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: cspClean ? "pass" : "quarantined",
      technicalPass: true,
      releasePass: cspClean,
      pass: cspClean,
      benchmark,
      diagnostics: readonlyDiagnostics(mutableDiagnostics),
      productionBuild: {
        mode: "vite-production-build",
        assets,
        scratchDirectory: scratch,
      },
      validationIssues: [],
    };
    const validationIssues = validateRendererTournamentBrowserArtifact(provisional);
    return {
      ...provisional,
      status: validationIssues.length === 0 ? provisional.status : "fail",
      technicalPass: validationIssues.length === 0,
      releasePass: validationIssues.length === 0 && provisional.releasePass,
      pass: validationIssues.length === 0 && provisional.releasePass,
      validationIssues,
    };
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const resultPath = process.env.TOONSPECTRUM_RENDERER_TOURNAMENT_RESULT ?? TRACKED_RESULT;
  try {
    const artifact = await runRendererTournamentBrowserBenchmark({
      scratchDirectory: process.env.TOONSPECTRUM_RENDERER_TOURNAMENT_VERIFY_DIR,
      resultPath,
    });
    writeJson(resultPath, artifact);
    console.log(JSON.stringify({
      status: artifact.status,
      technicalPass: artifact.technicalPass,
      releasePass: artifact.releasePass,
      pass: artifact.pass,
      result: resultPath,
      profile: artifact.benchmark?.profile.profile,
      scenes: artifact.benchmark?.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        bucket: scene.fingerprint.bucket,
        providers: scene.providers.map((provider) => ({
          providerId: provider.providerId,
          status: provider.status,
          cold: provider.cold && {
            p50Ms: provider.cold.p50Ms,
            p95Ms: provider.cold.p95Ms,
            p99Ms: provider.cold.p99Ms,
          },
          warm: provider.warm && {
            p50Ms: provider.warm.p50Ms,
            p95Ms: provider.warm.p95Ms,
            p99Ms: provider.warm.p99Ms,
          },
          visualGate: provider.visual?.gate ?? null,
          peakWasmBytes: provider.memory.peakWasmBytes,
        })),
        tournament: scene.tournament,
      })),
      visualFailureControl: artifact.benchmark && {
        providerId: artifact.benchmark.visualFailureControl.providerId,
        baseProviderId: artifact.benchmark.visualFailureControl.baseProviderId,
        sceneId: artifact.benchmark.visualFailureControl.sceneId,
        timing: artifact.benchmark.visualFailureControl.timing,
        gate: artifact.benchmark.visualFailureControl.gate,
        fasterThanReference: artifact.benchmark.visualFailureControl.fasterThanReference,
        selectedWinnerId: artifact.benchmark.visualFailureControl.selectedWinnerId,
        quarantine: artifact.benchmark.visualFailureControl.quarantine,
      },
      hysteresisStabilityControl: artifact.benchmark && {
        sceneId: artifact.benchmark.hysteresisStabilityControl.sceneId,
        measuredRunP50Ms: artifact.benchmark.hysteresisStabilityControl.measuredRuns.map(
          (run) => run.p50Ms,
        ),
        measuredGainPct: artifact.benchmark.hysteresisStabilityControl.measuredGainPct,
        thresholdPct: artifact.benchmark.hysteresisStabilityControl.thresholdPct,
        decision: artifact.benchmark.hysteresisStabilityControl.tournament.decision,
      },
      diagnostics: {
        browserVersion: artifact.diagnostics.browserVersion,
        consoleErrors: artifact.diagnostics.consoleErrors,
        pageErrors: artifact.diagnostics.pageErrors,
        requestFailures: artifact.diagnostics.requestFailures,
        errorResponses: artifact.diagnostics.errorResponses,
        serverErrors: artifact.diagnostics.serverErrors,
        cspViolations: artifact.diagnostics.cspViolations,
        requestCount: artifact.diagnostics.requestCount,
        responseCount: artifact.diagnostics.responseCount,
      },
      validationIssues: artifact.validationIssues,
    }, null, 2));
    process.exitCode = artifact.status === "pass"
      ? 0
      : artifact.status === "unsupported" || artifact.status === "quarantined" ? 2 : 1;
  } catch (error) {
    const failure: RendererTournamentBrowserArtifact = {
      schemaVersion: RENDERER_TOURNAMENT_BROWSER_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: "fail",
      technicalPass: false,
      releasePass: false,
      pass: false,
      benchmark: null,
      diagnostics: emptyDiagnostics(),
      productionBuild: {
        mode: "vite-production-build",
        assets: [],
        scratchDirectory:
          process.env.TOONSPECTRUM_RENDERER_TOURNAMENT_VERIFY_DIR ?? "unavailable",
      },
      validationIssues: [
        `benchmark orchestrator failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
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
