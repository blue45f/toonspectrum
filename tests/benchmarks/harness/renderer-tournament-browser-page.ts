import {
  sceneIRSchema,
  type PathVerbIR,
  type SceneIR,
  type SceneNodeIR,
} from "@toonspectrum/studio-project-model";

import {
  computeSceneFingerprint,
  type DeviceWorkloadProfile,
  type SceneFingerprint,
} from "../../../packages/studio-engine-registry/src/tournament";

export const RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL =
  "__TOONSPECTRUM_RENDERER_TOURNAMENT_BROWSER_RESULT__";
export const RENDERER_TOURNAMENT_BROWSER_CSP_VIOLATIONS_GLOBAL =
  "__TOONSPECTRUM_RENDERER_TOURNAMENT_CSP_VIOLATIONS__";
export const RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_RECEIPT_GLOBAL =
  "__TOONSPECTRUM_RENDERER_TOURNAMENT_BOOTSTRAP_RECEIPT__";
export const RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_ORDER = [
  "csp-listener-installed",
  "zod-jitless-configured",
  "entry-import-started",
  "page-module-evaluated",
] as const;
export const RENDERER_TOURNAMENT_BROWSER_SCENE_IDS = [
  "flat-simple",
  "curves-clips-gradients",
  "dense-strokes",
] as const;
export const RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS = [
  "vello-gpu-browser",
  "vello-cpu",
  "skia-canvaskit",
] as const;
export const RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES = 31;
export const RENDERER_TOURNAMENT_BROWSER_WARMUPS = 3;

export type RendererTournamentBrowserSceneId =
  (typeof RENDERER_TOURNAMENT_BROWSER_SCENE_IDS)[number];
export type RendererTournamentBrowserProviderId =
  (typeof RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS)[number];

export interface RendererTournamentBrowserBootstrapReceipt {
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

interface BrowserMemorySignals {
  readonly performanceMemoryExposed: boolean;
  readonly usedJsHeapBytes: number | null;
  readonly totalJsHeapBytes: number | null;
  readonly jsHeapLimitBytes: number | null;
  readonly userAgentSpecificMemoryExposed: boolean;
  readonly userAgentSpecificMemoryBytes: number | null;
  readonly userAgentSpecificMemoryError: string | null;
}

interface ProviderRuntime {
  readonly providerId: RendererTournamentBrowserProviderId;
  readonly engineVersion: string;
  readonly adapterVersion: string | null;
  readonly timingScope: string;
  readonly wasmObservationSource: string | null;
  render(scene: SceneIR): Promise<Uint8Array>;
  wasmBytes(): number | null;
}

export interface RendererTournamentBrowserProviderAvailability {
  readonly providerId: RendererTournamentBrowserProviderId;
  readonly available: boolean;
  readonly reason: string | null;
  readonly engineVersion: string | null;
  readonly adapterVersion: string | null;
}

export interface RendererTournamentBrowserProfileResult {
  readonly schemaVersion: 1;
  readonly mode: "profile";
  readonly status: "ok" | "unsupported";
  readonly measuredAt: string;
  readonly profile: DeviceWorkloadProfile;
  readonly profileObservation: Readonly<Record<string, string>>;
  readonly userAgent: string;
  readonly userAgentData: unknown;
  readonly webGpuAdapter: unknown;
  readonly velloProbe: unknown;
  readonly providerAvailability: readonly RendererTournamentBrowserProviderAvailability[];
  readonly fingerprints: Readonly<Record<RendererTournamentBrowserSceneId, SceneFingerprint>>;
  readonly crossOriginIsolated: boolean;
  readonly secureContext: boolean;
  readonly bootstrapReceipt: RendererTournamentBrowserBootstrapReceipt;
  readonly cspViolations: readonly string[];
}

export interface RendererTournamentBrowserMeasurementResult {
  readonly schemaVersion: 1;
  readonly mode: "cold" | "warm" | "fault-control";
  readonly status: "ok" | "error";
  readonly measuredAt: string;
  readonly providerId: RendererTournamentBrowserProviderId;
  readonly sceneId: RendererTournamentBrowserSceneId;
  readonly fingerprint: SceneFingerprint;
  readonly engineVersion: string | null;
  readonly adapterVersion: string | null;
  readonly timingScope: string;
  readonly warmupsExcluded: number;
  readonly samplesMs: readonly number[];
  readonly wasmBytesSamples: readonly (number | null)[];
  readonly pixelsBase64: string | null;
  readonly pixelsSha256: string | null;
  readonly memorySignals: Readonly<{
    before: BrowserMemorySignals;
    after: BrowserMemorySignals;
    maxObservedUsedJsHeapBytes: number | null;
  }>;
  readonly wasmObservationSource: string | null;
  readonly unavailableMemoryReasons: Readonly<Record<string, string>>;
  readonly bootstrapReceipt: RendererTournamentBrowserBootstrapReceipt;
  readonly cspViolations: readonly string[];
  readonly corruption?: Readonly<{
    kind: "central-checkerboard-xor";
    changedPixels: number;
    changedChannels: number;
  }>;
  readonly error: string | null;
}

export interface RendererTournamentBrowserCspCaptureControlResult {
  readonly schemaVersion: 1;
  readonly mode: "csp-control";
  readonly status: "ok" | "error";
  readonly measuredAt: string;
  readonly attempted: true;
  readonly blocked: boolean;
  readonly errorName: string | null;
  readonly cspViolations: readonly string[];
  readonly bootstrapReceipt: RendererTournamentBrowserBootstrapReceipt;
  readonly error: string | null;
}

type PageResult =
  | RendererTournamentBrowserProfileResult
  | RendererTournamentBrowserMeasurementResult
  | RendererTournamentBrowserCspCaptureControlResult
  | Readonly<{
      schemaVersion: 1;
      mode: "error";
      status: "error";
      measuredAt: string;
      error: string;
      stack: string | null;
      cspViolations: readonly string[];
    }>;

interface NavigatorWithOptionalSignals extends Navigator {
  readonly deviceMemory?: number;
  readonly gpu?: GPU;
  readonly userAgentData?: {
    readonly brands?: readonly Readonly<{ brand: string; version: string }>[];
    readonly mobile?: boolean;
    readonly platform?: string;
    getHighEntropyValues?(hints: readonly string[]): Promise<Record<string, unknown>>;
  };
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: Readonly<{
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  }>;
  measureUserAgentSpecificMemory?(): Promise<Readonly<{ bytes: number }>>;
}

interface CanvasKitWithHeap {
  readonly HEAPU8?: Uint8Array;
}

interface MutableBootstrapReceipt {
  schemaVersion: 1;
  order: string[];
}

interface RendererTournamentBrowserGlobals {
  __zod_globalConfig?: Readonly<Record<string, unknown>>;
  [RENDERER_TOURNAMENT_BROWSER_CSP_VIOLATIONS_GLOBAL]?: unknown;
  [RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_RECEIPT_GLOBAL]?: unknown;
}

function browserBootstrapState(): Readonly<{
  cspViolations: string[];
  receipt: MutableBootstrapReceipt | null;
}> {
  if (typeof window === "undefined") {
    return { cspViolations: [], receipt: null };
  }
  const globals = globalThis as typeof globalThis & RendererTournamentBrowserGlobals;
  const violations = globals[RENDERER_TOURNAMENT_BROWSER_CSP_VIOLATIONS_GLOBAL];
  const receipt = globals[RENDERER_TOURNAMENT_BROWSER_BOOTSTRAP_RECEIPT_GLOBAL];
  if (!Array.isArray(violations) || !violations.every((value) => typeof value === "string")) {
    throw new Error("renderer tournament CSP bootstrap shared array is missing or invalid");
  }
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    Array.isArray(receipt) ||
    (receipt as MutableBootstrapReceipt).schemaVersion !== 1 ||
    !Array.isArray((receipt as MutableBootstrapReceipt).order)
  ) {
    throw new Error("renderer tournament bootstrap receipt is missing or invalid");
  }
  const mutableReceipt = receipt as MutableBootstrapReceipt;
  mutableReceipt.order.push("page-module-evaluated");
  return { cspViolations: violations as string[], receipt: mutableReceipt };
}

const bootstrapState = browserBootstrapState();
const cspViolations = bootstrapState.cspViolations;

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function indexBefore(order: readonly string[], left: string, right: string): boolean {
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  return leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex;
}

async function observeBootstrapReceipt(): Promise<RendererTournamentBrowserBootstrapReceipt> {
  if (!bootstrapState.receipt) {
    throw new Error("renderer tournament page evaluated without browser bootstrap receipt");
  }
  const globals = globalThis as typeof globalThis & RendererTournamentBrowserGlobals;
  const zodCore = await import("zod/v4/core");
  const order = [...bootstrapState.receipt.order];
  return {
    schemaVersion: 1,
    order,
    listenerInstalledBeforeZodConfig: indexBefore(
      order,
      "csp-listener-installed",
      "zod-jitless-configured",
    ),
    listenerInstalledBeforeEntryImport: indexBefore(
      order,
      "csp-listener-installed",
      "entry-import-started",
    ),
    zodJitlessConfiguredBeforeEntryImport: indexBefore(
      order,
      "zod-jitless-configured",
      "entry-import-started",
    ),
    pageModuleEvaluated: order.includes("page-module-evaluated"),
    zodGlobalConfigObservedByPage: globals.__zod_globalConfig?.jitless === true,
    zodCoreGlobalConfigJitless: zodCore.globalConfig.jitless === true,
    zodAllowsEvalValue: zodCore.util.allowsEval.value,
  };
}

async function waitForCspViolation(startCount: number): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (cspViolations.length <= startCount && performance.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function runCspCaptureControl(): Promise<RendererTournamentBrowserCspCaptureControlResult> {
  const bootstrapReceipt = await observeBootstrapReceipt();
  const startCount = cspViolations.length;
  let blocked = false;
  let errorName: string | null = null;
  try {
    // Deliberate positive control: strict script-src must block this while wasm-unsafe-eval stays.
    const evaluate = new Function("return 1");
    evaluate();
  } catch (error) {
    blocked = true;
    errorName = error instanceof Error ? error.name : null;
  }
  await waitForCspViolation(startCount);
  const observed = cspViolations.slice(startCount);
  const observedEvalViolation = observed.some((violation) =>
    /^(?:script-src|script-src-elem): eval$/u.test(violation));
  const status = blocked && errorName === "EvalError" && observedEvalViolation
    ? "ok"
    : "error";
  return {
    schemaVersion: 1,
    mode: "csp-control",
    status,
    measuredAt: new Date().toISOString(),
    attempted: true,
    blocked,
    errorName,
    cspViolations: observed,
    bootstrapReceipt,
    error: status === "ok"
      ? null
      : "strict-CSP positive control did not block eval and emit script-src violation",
  };
}

function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function rectanglePath(x: number, y: number, width: number, height: number) {
  return {
    verbs: [
      { v: "M" as const, x, y },
      { v: "L" as const, x: x + width, y },
      { v: "L" as const, x: x + width, y: y + height },
      { v: "L" as const, x, y: y + height },
      { v: "Z" as const },
    ],
  };
}

function buildFlatScene(): SceneIR {
  return sceneIRSchema.parse({
    version: 11,
    width: 128,
    height: 128,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [
      {
        id: "flat-blue",
        kind: "fill-path",
        path: rectanglePath(12, 14, 52, 44),
        paint: { kind: "solid", color: { r: 0.08, g: 0.34, b: 0.88, a: 1 } },
        fillRule: "nonzero",
        opacity: 1,
        blend: "src-over",
      },
      {
        id: "flat-coral",
        kind: "fill-path",
        path: rectanglePath(68, 62, 44, 46),
        paint: { kind: "solid", color: { r: 0.96, g: 0.31, b: 0.22, a: 1 } },
        fillRule: "nonzero",
        opacity: 1,
        blend: "src-over",
      },
      {
        id: "flat-line",
        kind: "stroke-path",
        path: {
          verbs: [
            { v: "M", x: 10, y: 102 },
            { v: "L", x: 118, y: 24 },
          ],
        },
        paint: { kind: "solid", color: { r: 0.08, g: 0.08, b: 0.1, a: 1 } },
        strokeWidth: 3,
        cap: "round",
        join: "round",
        miterLimit: 4,
        opacity: 1,
        blend: "src-over",
      },
    ],
  });
}

function buildRichScene(): SceneIR {
  const clip = {
    verbs: [
      { v: "M" as const, x: 18, y: 18 },
      { v: "C" as const, c1x: 18, c1y: 8, c2x: 40, c2y: 8, x: 52, y: 18 },
      { v: "L" as const, x: 174, y: 18 },
      { v: "Q" as const, cx: 184, cy: 18, x: 184, y: 30 },
      { v: "L" as const, x: 184, y: 166 },
      { v: "Q" as const, cx: 184, cy: 178, x: 172, y: 178 },
      { v: "L" as const, x: 30, y: 178 },
      { v: "Q" as const, cx: 18, cy: 178, x: 18, y: 166 },
      { v: "Z" as const },
    ],
  };
  return sceneIRSchema.parse({
    version: 11,
    width: 192,
    height: 192,
    background: { r: 0.055, g: 0.065, b: 0.09, a: 1 },
    nodes: [
      {
        id: "rich-clip-group",
        kind: "group",
        opacity: 0.92,
        blend: "src-over",
        clip,
        children: [
          {
            id: "rich-linear",
            kind: "fill-path",
            path: rectanglePath(4, 4, 184, 184),
            paint: {
              kind: "linear-gradient",
              from: [8, 12],
              to: [184, 176],
              stops: [
                { offset: 0, color: { r: 0.96, g: 0.18, b: 0.31, a: 1 } },
                { offset: 0.48, color: { r: 0.16, g: 0.78, b: 0.93, a: 0.96 } },
                { offset: 1, color: { r: 0.2, g: 0.1, b: 0.66, a: 1 } },
              ],
            },
            fillRule: "nonzero",
            opacity: 1,
            blend: "src-over",
          },
          {
            id: "rich-radial",
            kind: "fill-path",
            path: {
              verbs: [
                { v: "M", x: 42, y: 96 },
                { v: "C", c1x: 42, c1y: 54, c2x: 72, c2y: 36, x: 102, y: 42 },
                { v: "C", c1x: 144, c1y: 48, c2x: 162, c2y: 82, x: 154, y: 116 },
                { v: "Q", cx: 142, cy: 158, x: 92, y: 154 },
                { v: "C", c1x: 54, c1y: 150, c2x: 34, c2y: 128, x: 42, y: 96 },
                { v: "Z" },
              ],
            },
            paint: {
              kind: "radial-gradient",
              center: [96, 92],
              radius: 68,
              stops: [
                { offset: 0, color: { r: 1, g: 0.95, b: 0.52, a: 0.92 } },
                { offset: 0.55, color: { r: 1, g: 0.34, b: 0.16, a: 0.7 } },
                { offset: 1, color: { r: 0.2, g: 0.03, b: 0.24, a: 0.12 } },
              ],
            },
            fillRule: "evenodd",
            opacity: 0.84,
            blend: "screen",
          },
          {
            id: "rich-sweep",
            kind: "stroke-path",
            path: {
              verbs: [
                { v: "M", x: 30, y: 146 },
                { v: "C", c1x: 62, c1y: 70, c2x: 132, c2y: 164, x: 166, y: 52 },
              ],
            },
            paint: {
              kind: "sweep-gradient",
              center: [96, 96],
              startAngleDeg: 0,
              endAngleDeg: 360,
              stops: [
                { offset: 0, color: { r: 1, g: 0.1, b: 0.2, a: 1 } },
                { offset: 0.33, color: { r: 0.1, g: 1, b: 0.5, a: 1 } },
                { offset: 0.66, color: { r: 0.15, g: 0.4, b: 1, a: 1 } },
                { offset: 1, color: { r: 1, g: 0.1, b: 0.2, a: 1 } },
              ],
            },
            strokeWidth: 8,
            cap: "round",
            join: "round",
            miterLimit: 4,
            opacity: 0.88,
            blend: "lighten",
          },
        ],
      },
    ],
  });
}

function denseStrokeNode(index: number, size: number, rand: () => number): SceneNodeIR {
  const points = 12;
  const x0 = rand() * size;
  const y0 = rand() * size;
  const span = 18 + rand() * 104;
  const amplitude = 2 + rand() * 24;
  const frequency = 0.75 + rand() * 2.5;
  const phase = rand() * Math.PI * 2;
  const verbs: PathVerbIR[] = [];
  for (let point = 0; point < points; point += 1) {
    const t = point / (points - 1);
    const x = x0 + (t - 0.5) * span;
    const y = y0 + Math.sin(phase + t * Math.PI * 2 * frequency) * amplitude;
    verbs.push(point === 0 ? { v: "M", x, y } : { v: "L", x, y });
  }
  return {
    id: `dense-${index}`,
    kind: "stroke-path",
    path: { verbs },
    paint: {
      kind: "solid",
      color: { r: 0.04 + rand() * 0.2, g: 0.03 + rand() * 0.16, b: 0.08 + rand() * 0.24, a: 1 },
    },
    strokeWidth: 0.65 + rand() * 3.4,
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 0.72 + rand() * 0.28,
    blend: index % 19 === 0 ? "multiply" : "src-over",
  } as SceneNodeIR;
}

function buildDenseScene(): SceneIR {
  const size = 384;
  const rand = createLcg(0x5eed_12a4);
  const nodes: SceneNodeIR[] = [];
  for (let index = 0; index < 768; index += 1) {
    nodes.push(denseStrokeNode(index, size, rand));
  }
  return sceneIRSchema.parse({
    version: 11,
    width: size,
    height: size,
    background: { r: 0.965, g: 0.95, b: 0.91, a: 1 },
    nodes,
  });
}

export function buildRendererTournamentScene(
  sceneId: RendererTournamentBrowserSceneId,
): SceneIR {
  switch (sceneId) {
    case "flat-simple":
      return buildFlatScene();
    case "curves-clips-gradients":
      return buildRichScene();
    case "dense-strokes":
      return buildDenseScene();
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function observeMemory(): Promise<BrowserMemorySignals> {
  const measuredPerformance = performance as PerformanceWithMemory;
  const browserMemory = measuredPerformance.memory;
  let userAgentSpecificMemoryBytes: number | null = null;
  let userAgentSpecificMemoryError: string | null = null;
  if (typeof measuredPerformance.measureUserAgentSpecificMemory === "function") {
    try {
      const measurement = await measuredPerformance.measureUserAgentSpecificMemory();
      userAgentSpecificMemoryBytes = finiteOrNull(measurement.bytes);
    } catch (error) {
      userAgentSpecificMemoryError = errorMessage(error);
    }
  }
  return {
    performanceMemoryExposed: browserMemory !== undefined,
    usedJsHeapBytes: finiteOrNull(browserMemory?.usedJSHeapSize),
    totalJsHeapBytes: finiteOrNull(browserMemory?.totalJSHeapSize),
    jsHeapLimitBytes: finiteOrNull(browserMemory?.jsHeapSizeLimit),
    userAgentSpecificMemoryExposed:
      typeof measuredPerformance.measureUserAgentSpecificMemory === "function",
    userAgentSpecificMemoryBytes,
    userAgentSpecificMemoryError,
  };
}

function usedJsHeapBytes(): number | null {
  return finiteOrNull((performance as PerformanceWithMemory).memory?.usedJSHeapSize);
}

async function loadProviderRuntime(
  providerId: RendererTournamentBrowserProviderId,
): Promise<ProviderRuntime> {
  if (providerId === "vello-gpu-browser") {
    const engine = await import("@toonspectrum/studio-engine-vello");
    const module = await engine.loadVelloGpuBrowser();
    const initOutput = await module.default();
    return {
      providerId,
      engineVersion: engine.velloGpuBrowserProviderDescriptor.version,
      adapterVersion: module.adapter_version(),
      timingScope:
        "dynamic provider chunk + wasm init for cold; zod normalization + SceneIR JSON serde + WebGPU render + full RGBA8 readback for render samples",
      wasmObservationSource: "pkg-gpu InitOutput.memory.buffer.byteLength",
      render: (scene) => engine.renderSceneToPixelsGpu(scene),
      wasmBytes: () => initOutput.memory.buffer.byteLength,
    };
  }
  if (providerId === "vello-cpu") {
    const [engine, rawModule] = await Promise.all([
      import("@toonspectrum/studio-engine-vello"),
      import("../../../crates/studio-engine-vello/pkg/studio_engine_vello.js"),
    ]);
    await engine.loadVelloWasm();
    const initOutput = await rawModule.default();
    return {
      providerId,
      engineVersion: engine.velloCpuProviderDescriptor.version,
      adapterVersion: engine.adapterVersion(),
      timingScope:
        "dynamic provider chunk + wasm init for cold; zod normalization + SceneIR JSON serde + deterministic CPU raster + RGBA8 wasm boundary for render samples",
      wasmObservationSource: "pkg InitOutput.memory.buffer.byteLength",
      render: async (scene) => engine.renderSceneToPixels(scene),
      wasmBytes: () => initOutput.memory.buffer.byteLength,
    };
  }
  const [canvasKitModule, wasmAsset, adapter] = await Promise.all([
    import("canvaskit-wasm"),
    import("canvaskit-wasm/bin/canvaskit.wasm?url"),
    import("@toonspectrum/studio-engine-skia"),
  ]);
  const canvasKit = await canvasKitModule.default({
    locateFile(file: string) {
      return file.endsWith(".wasm") ? wasmAsset.default : file;
    },
  });
  const heap = (canvasKit as unknown as CanvasKitWithHeap).HEAPU8;
  return {
    providerId,
    engineVersion: adapter.canvasKitProviderDescriptor.version,
    adapterVersion: adapter.canvasKitProviderDescriptor.version,
    timingScope:
      "dynamic provider chunk + wasm init for cold; SceneIR-to-Skia lowering + CPU raster surface flush + RGBA8 readPixels for render samples",
    wasmObservationSource: heap
      ? "CanvasKit runtime HEAPU8.buffer.byteLength"
      : null,
    render: async (scene) => adapter.renderSceneToPixels(canvasKit, scene),
    wasmBytes: () => heap?.buffer.byteLength ?? null,
  };
}

function corruptPixels(pixels: Uint8Array, width: number, height: number) {
  const copy = pixels.slice();
  const left = Math.floor(width * 0.25);
  const right = Math.ceil(width * 0.75);
  const top = Math.floor(height * 0.25);
  const bottom = Math.ceil(height * 0.75);
  let changedPixels = 0;
  let changedChannels = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if ((x + y) % 2 !== 0) continue;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const index = offset + channel;
        copy[index] = 255 - (copy[index] ?? 0);
        changedChannels += 1;
      }
      changedPixels += 1;
    }
  }
  return { pixels: copy, changedPixels, changedChannels };
}

function unavailableMemoryReasons(runtime: ProviderRuntime): Record<string, string> {
  return {
    peakCpuBytes:
      "Chromium exposes page-wide JS/user-agent memory signals, not provider-attributed native CPU peak memory; those signals are recorded separately and are not relabeled",
    peakGpuBytes:
      runtime.providerId === "vello-gpu-browser"
        ? "WebGPU exposes limits but no allocation or peak-residency query for wgpu/Vello internal resources"
        : "CPU/WASM provider does not allocate an observable WebGPU device in this benchmark",
    peakWasmBytes: runtime.wasmObservationSource ??
      "provider runtime does not expose its WebAssembly.Memory or Emscripten heap view",
    peakTextureBytes:
      "provider adapter does not expose exact live texture allocation bytes and WebGPU has no portable query",
    peakBufferBytes:
      "provider adapter does not expose exact live buffer allocation bytes and WebGPU has no portable query",
    atlasOccupancyPct:
      "no renderer adapter in this bounded SceneIR corpus exposes atlas occupancy telemetry",
    atlasFragmentationPct:
      "no renderer adapter in this bounded SceneIR corpus exposes atlas fragmentation telemetry",
    cpuPreparationMs:
      "committed adapter API exposes only end-to-end render calls; SceneIR normalization/lowering cannot be split without production instrumentation",
    gpuPassMs:
      runtime.providerId === "vello-gpu-browser"
        ? "renderSceneToPixelsGpu resolves after submit and readback; adapter exposes no timestamp-query split"
        : "provider is a CPU/WASM raster lane without a separately observable GPU pass",
    readbackMs:
      runtime.providerId === "vello-gpu-browser"
        ? "committed pixel API combines WebGPU work and readback in one Promise; no separate readback timer is exposed"
        : "readPixels/RGBA boundary is part of the committed end-to-end render API and is not separately exposed",
  };
}

async function runMeasurement(
  mode: "cold" | "warm" | "fault-control",
  providerId: RendererTournamentBrowserProviderId,
  sceneId: RendererTournamentBrowserSceneId,
): Promise<RendererTournamentBrowserMeasurementResult> {
  const bootstrapReceipt = await observeBootstrapReceipt();
  const scene = buildRendererTournamentScene(sceneId);
  const fingerprint = computeSceneFingerprint(scene);
  const before = await observeMemory();
  const samplesMs: number[] = [];
  const wasmBytesSamples: Array<number | null> = [];
  let maxObservedUsedJsHeapBytes = usedJsHeapBytes();
  let runtime: ProviderRuntime | null = null;
  let pixels: Uint8Array | null = null;
  let corruption: RendererTournamentBrowserMeasurementResult["corruption"];
  try {
    if (mode === "cold") {
      const start = performance.now();
      runtime = await loadProviderRuntime(providerId);
      pixels = await runtime.render(scene);
      samplesMs.push(performance.now() - start);
      wasmBytesSamples.push(runtime.wasmBytes());
    } else {
      runtime = await loadProviderRuntime(providerId);
      for (let index = 0; index < RENDERER_TOURNAMENT_BROWSER_WARMUPS; index += 1) {
        await runtime.render(scene);
      }
      for (let index = 0; index < RENDERER_TOURNAMENT_BROWSER_WARM_SAMPLES; index += 1) {
        const start = performance.now();
        const rendered = await runtime.render(scene);
        if (mode === "fault-control") {
          const corrupted = corruptPixels(rendered, scene.width, scene.height);
          pixels = corrupted.pixels;
          corruption = {
            kind: "central-checkerboard-xor",
            changedPixels: corrupted.changedPixels,
            changedChannels: corrupted.changedChannels,
          };
        } else {
          pixels = rendered;
        }
        samplesMs.push(performance.now() - start);
        wasmBytesSamples.push(runtime.wasmBytes());
        const heap = usedJsHeapBytes();
        if (heap !== null) {
          maxObservedUsedJsHeapBytes = Math.max(
            maxObservedUsedJsHeapBytes ?? 0,
            heap,
          );
        }
      }
    }
    if (!pixels || !runtime) throw new Error("provider returned no pixels");
    const after = await observeMemory();
    return {
      schemaVersion: 1,
      mode,
      status: "ok",
      measuredAt: new Date().toISOString(),
      providerId,
      sceneId,
      fingerprint,
      engineVersion: runtime.engineVersion,
      adapterVersion: runtime.adapterVersion,
      timingScope: runtime.timingScope,
      warmupsExcluded: mode === "cold" ? 0 : RENDERER_TOURNAMENT_BROWSER_WARMUPS,
      samplesMs,
      wasmBytesSamples,
      pixelsBase64: toBase64(pixels),
      pixelsSha256: await sha256(pixels),
      memorySignals: { before, after, maxObservedUsedJsHeapBytes },
      wasmObservationSource: runtime.wasmObservationSource,
      unavailableMemoryReasons: unavailableMemoryReasons(runtime),
      bootstrapReceipt,
      cspViolations: [...cspViolations],
      ...(corruption ? { corruption } : {}),
      error: null,
    };
  } catch (error) {
    const after = await observeMemory();
    return {
      schemaVersion: 1,
      mode,
      status: "error",
      measuredAt: new Date().toISOString(),
      providerId,
      sceneId,
      fingerprint,
      engineVersion: runtime?.engineVersion ?? null,
      adapterVersion: runtime?.adapterVersion ?? null,
      timingScope: runtime?.timingScope ?? "provider initialization failed",
      warmupsExcluded: mode === "cold" ? 0 : RENDERER_TOURNAMENT_BROWSER_WARMUPS,
      samplesMs,
      wasmBytesSamples,
      pixelsBase64: null,
      pixelsSha256: null,
      memorySignals: { before, after, maxObservedUsedJsHeapBytes },
      wasmObservationSource: runtime?.wasmObservationSource ?? null,
      unavailableMemoryReasons: runtime ? unavailableMemoryReasons(runtime) : {},
      bootstrapReceipt,
      cspViolations: [...cspViolations],
      error: errorMessage(error),
    };
  }
}

async function highEntropyUserAgentData(): Promise<Record<string, unknown>> {
  const uaData = (navigator as NavigatorWithOptionalSignals).userAgentData;
  if (!uaData) return {};
  const basic: Record<string, unknown> = {
    brands: uaData.brands ?? null,
    mobile: uaData.mobile ?? null,
    platform: uaData.platform ?? null,
  };
  if (typeof uaData.getHighEntropyValues !== "function") return basic;
  try {
    return {
      ...basic,
      ...(await uaData.getHighEntropyValues([
        "architecture",
        "bitness",
        "fullVersionList",
        "model",
        "platformVersion",
        "wow64",
      ])),
    };
  } catch (error) {
    return { ...basic, highEntropyError: errorMessage(error) };
  }
}

function observedCanvasColorSpace(): string | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const attributes = (
    context as CanvasRenderingContext2D & {
      getContextAttributes?(): { colorSpace?: string };
    } | null
  )?.getContextAttributes?.();
  return typeof attributes?.colorSpace === "string" ? attributes.colorSpace : null;
}

function chromiumVersion(userAgentData: Record<string, unknown>): string | null {
  const fullVersions = userAgentData.fullVersionList;
  if (!Array.isArray(fullVersions)) return null;
  for (const item of fullVersions) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (
      typeof record.brand === "string" &&
      /Chromium|Google Chrome/u.test(record.brand) &&
      typeof record.version === "string"
    ) {
      return record.version;
    }
  }
  return null;
}

async function providerAvailability(): Promise<RendererTournamentBrowserProviderAvailability[]> {
  const rows: RendererTournamentBrowserProviderAvailability[] = [];
  for (const providerId of RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS) {
    try {
      const runtime = await loadProviderRuntime(providerId);
      rows.push({
        providerId,
        available: true,
        reason: null,
        engineVersion: runtime.engineVersion,
        adapterVersion: runtime.adapterVersion,
      });
    } catch (error) {
      rows.push({
        providerId,
        available: false,
        reason: errorMessage(error),
        engineVersion: null,
        adapterVersion: null,
      });
    }
  }
  return rows;
}

async function runProfile(): Promise<RendererTournamentBrowserProfileResult> {
  const bootstrapReceipt = await observeBootstrapReceipt();
  const nav = navigator as NavigatorWithOptionalSignals;
  const userAgentData = await highEntropyUserAgentData();
  let adapterReceipt: Record<string, unknown> | null = null;
  let maxTextureDimension2D: number | null = null;
  if (nav.gpu) {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (adapter) {
      adapterReceipt = {
        vendor: adapter.info.vendor || null,
        architecture: adapter.info.architecture || null,
        device: adapter.info.device || null,
        description: adapter.info.description || null,
      };
      const device = await adapter.requestDevice();
      maxTextureDimension2D = device.limits.maxTextureDimension2D;
      device.destroy();
    }
  }
  let velloProbe: unknown;
  try {
    const engine = await import("@toonspectrum/studio-engine-vello");
    velloProbe = await engine.probeWebGpu();
  } catch (error) {
    velloProbe = { supported: false, reason: errorMessage(error) };
  }
  const availability = await providerAvailability();
  const browserVersion = chromiumVersion(userAgentData);
  const operatingSystem =
    typeof userAgentData.platform === "string"
      ? userAgentData.platform
      : navigator.platform || null;
  const architecture =
    typeof userAgentData.architecture === "string"
      ? userAgentData.architecture
      : null;
  const gpuVendor =
    typeof adapterReceipt?.vendor === "string" ? adapterReceipt.vendor : null;
  const gpuArchitecture =
    typeof adapterReceipt?.architecture === "string"
      ? adapterReceipt.architecture
      : null;
  const colorSpace = observedCanvasColorSpace();
  const engineReceipt = availability.map((row) => ({
    providerId: row.providerId,
    engineVersion: row.engineVersion,
    adapterVersion: row.adapterVersion,
    available: row.available,
  }));
  const engineHash = await sha256(JSON.stringify(engineReceipt));
  const deviceTraits = {
    browserEngine: "Chromium",
    browserVersion,
    operatingSystem,
    architecture,
    logicalCpuCount: finiteOrNull(navigator.hardwareConcurrency),
    deviceMemoryGiB: finiteOrNull(nav.deviceMemory),
    gpuBackend: nav.gpu ? "webgpu" : "none",
    gpuVendor,
    gpuArchitecture,
    maxTextureDimension2D,
    devicePixelRatio: finiteOrNull(window.devicePixelRatio),
    colorSpace,
    powerPreference: null,
  } as const;
  const deviceHash = await sha256(JSON.stringify(deviceTraits));
  const profile: DeviceWorkloadProfile = {
    profileVersion: 1,
    deviceHash,
    engineHash,
    gpu: nav.gpu !== undefined,
    runtime: "browser-main",
    workload: "preview",
    ...deviceTraits,
  };
  const profileObservation: Record<string, string> = {
    browserEngine: "navigator.userAgentData fullVersionList / Chromium production harness",
    browserVersion: browserVersion
      ? "navigator.userAgentData.getHighEntropyValues(fullVersionList)"
      : "unavailable: fullVersionList not exposed",
    operatingSystem: operatingSystem
      ? "navigator.userAgentData.platform (navigator.platform fallback)"
      : "unavailable: no platform signal",
    architecture: architecture
      ? "navigator.userAgentData high-entropy architecture"
      : "unavailable: high-entropy architecture not exposed",
    logicalCpuCount: "navigator.hardwareConcurrency",
    deviceMemoryGiB: nav.deviceMemory === undefined
      ? "unavailable: navigator.deviceMemory not exposed"
      : "navigator.deviceMemory",
    gpuBackend: nav.gpu ? "navigator.gpu present; benchmark uses WebGPU" : "navigator.gpu absent",
    gpuVendor: gpuVendor
      ? "GPUAdapter.info.vendor"
      : "unavailable: GPUAdapter.info.vendor empty",
    gpuArchitecture: gpuArchitecture
      ? "GPUAdapter.info.architecture"
      : "unavailable: GPUAdapter.info.architecture empty",
    maxTextureDimension2D: maxTextureDimension2D === null
      ? "unavailable: GPUDevice limits not obtainable"
      : "GPUDevice.limits.maxTextureDimension2D",
    devicePixelRatio: "window.devicePixelRatio",
    colorSpace: colorSpace
      ? "CanvasRenderingContext2D.getContextAttributes().colorSpace"
      : "unavailable: 2D context colorSpace attribute not exposed",
    powerPreference:
      "unavailable: WebGPU accepts a request hint but does not expose the selected adapter power mode",
  };
  const fingerprints = Object.fromEntries(
    RENDERER_TOURNAMENT_BROWSER_SCENE_IDS.map((sceneId) => [
      sceneId,
      computeSceneFingerprint(buildRendererTournamentScene(sceneId)),
    ]),
  ) as Record<RendererTournamentBrowserSceneId, SceneFingerprint>;
  return {
    schemaVersion: 1,
    mode: "profile",
    status: availability.some((row) => row.available) ? "ok" : "unsupported",
    measuredAt: new Date().toISOString(),
    profile,
    profileObservation,
    userAgent: navigator.userAgent,
    userAgentData,
    webGpuAdapter: adapterReceipt,
    velloProbe,
    providerAvailability: availability,
    fingerprints,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    secureContext: globalThis.isSecureContext,
    bootstrapReceipt,
    cspViolations: [...cspViolations],
  };
}

function parseSceneId(value: string | null): RendererTournamentBrowserSceneId {
  if (
    value &&
    (RENDERER_TOURNAMENT_BROWSER_SCENE_IDS as readonly string[]).includes(value)
  ) {
    return value as RendererTournamentBrowserSceneId;
  }
  throw new Error(`invalid or missing scene query: ${String(value)}`);
}

function parseProviderId(value: string | null): RendererTournamentBrowserProviderId {
  if (
    value &&
    (RENDERER_TOURNAMENT_BROWSER_PROVIDER_IDS as readonly string[]).includes(value)
  ) {
    return value as RendererTournamentBrowserProviderId;
  }
  throw new Error(`invalid or missing provider query: ${String(value)}`);
}

async function main(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const mode = query.get("mode") ?? "profile";
  let result: PageResult;
  if (mode === "profile") {
    result = await runProfile();
  } else if (mode === "csp-control") {
    result = await runCspCaptureControl();
  } else if (mode === "cold" || mode === "warm" || mode === "fault-control") {
    result = await runMeasurement(
      mode,
      parseProviderId(query.get("provider")),
      parseSceneId(query.get("scene")),
    );
  } else {
    throw new Error(`unsupported benchmark mode: ${mode}`);
  }
  (window as unknown as Record<string, unknown>)[
    RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL
  ] = result;
}

if (typeof window !== "undefined") {
  void main().catch((error: unknown) => {
    (window as unknown as Record<string, unknown>)[
      RENDERER_TOURNAMENT_BROWSER_RESULT_GLOBAL
    ] = {
      schemaVersion: 1,
      mode: "error",
      status: "error",
      measuredAt: new Date().toISOString(),
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      cspViolations: [...cspViolations],
    } satisfies PageResult;
  });
}
