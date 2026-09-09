import { brushRuntimeCapabilityFingerprint } from "./brush-studio-v5-runtime-compiler";
import {
  BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION,
  type BrushRuntimeBenchmarkReceipt,
  type BrushRuntimeCapabilities,
} from "./brush-studio-v5-runtime-types";

interface BrowserGpuBuffer {
  destroy(): void;
}

interface BrowserGpuComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

interface BrowserGpuComputePass {
  setPipeline(pipeline: BrowserGpuComputePipeline): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}

interface BrowserGpuCommandEncoder {
  beginComputePass(): BrowserGpuComputePass;
  finish(): unknown;
}

interface BrowserGpuQueue {
  submit(commands: readonly unknown[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

interface BrowserGpuDevice {
  readonly features: ReadonlySet<string>;
  readonly queue: BrowserGpuQueue;
  createBuffer(descriptor: Readonly<{ size: number; usage: number }>): BrowserGpuBuffer;
  createShaderModule(descriptor: Readonly<{ code: string }>): unknown;
  createComputePipelineAsync(descriptor: Readonly<{
    layout: "auto";
    compute: Readonly<{ module: unknown; entryPoint: string }>;
  }>): Promise<BrowserGpuComputePipeline>;
  createBindGroup(descriptor: Readonly<{
    layout: unknown;
    entries: readonly Readonly<{ binding: number; resource: Readonly<{ buffer: BrowserGpuBuffer }> }>[];
  }>): unknown;
  createCommandEncoder(): BrowserGpuCommandEncoder;
  destroy?(): void;
}

interface BrowserGpuAdapter {
  readonly features: ReadonlySet<string>;
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserGpu {
  requestAdapter(options?: Readonly<{ powerPreference?: "high-performance" | "low-power" }>): Promise<BrowserGpuAdapter | null>;
}

interface NavigatorWithGpu extends Navigator {
  readonly gpu?: BrowserGpu;
  readonly deviceMemory?: number;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasPointerPrototypeMethod(name: "getCoalescedEvents" | "getPredictedEvents"): boolean {
  if (typeof PointerEvent === "undefined") return false;
  const prototype = PointerEvent.prototype as unknown as Record<string, unknown>;
  return typeof prototype[name] === "function";
}

function detectWebGl2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2", { antialias: false, alpha: true }));
  } catch {
    return false;
  }
}

function detectHover(): boolean {
  try {
    return typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(any-hover: hover)").matches;
  } catch {
    return false;
  }
}

function baseCapabilitySnapshot(): Omit<BrushRuntimeCapabilities, "webgpuAdapter" | "webgpuTimestampQuery"> {
  const navigatorValue = typeof navigator === "undefined" ? null : navigator as NavigatorWithGpu;
  return Object.freeze({
    scannedAt: new Date().toISOString(),
    secureContext: globalThis.isSecureContext === true,
    webgpu: Boolean(navigatorValue?.gpu),
    webgl2: detectWebGl2(),
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    pointerRawUpdate: typeof globalThis !== "undefined" && "onpointerrawupdate" in globalThis,
    coalescedEvents: hasPointerPrototypeMethod("getCoalescedEvents"),
    predictedEvents: hasPointerPrototypeMethod("getPredictedEvents"),
    hover: detectHover(),
    hardwareConcurrency: Math.max(1, navigatorValue?.hardwareConcurrency ?? 1),
    deviceMemoryGb: typeof navigatorValue?.deviceMemory === "number" ? navigatorValue.deviceMemory : null,
  });
}

export function detectSynchronousBrushRuntimeCapabilities(): BrushRuntimeCapabilities {
  return Object.freeze({
    ...baseCapabilitySnapshot(),
    webgpuAdapter: false,
    webgpuTimestampQuery: false,
  });
}

export async function scanBrushRuntimeCapabilities(): Promise<BrushRuntimeCapabilities> {
  const base = baseCapabilitySnapshot();
  const gpu = typeof navigator === "undefined" ? undefined : (navigator as NavigatorWithGpu).gpu;
  if (!gpu) return Object.freeze({ ...base, webgpuAdapter: false, webgpuTimestampQuery: false });
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return Object.freeze({ ...base, webgpuAdapter: false, webgpuTimestampQuery: false });
    const timestampQuery = adapter.features.has("timestamp-query");
    return Object.freeze({ ...base, webgpuAdapter: true, webgpuTimestampQuery: timestampQuery });
  } catch {
    return Object.freeze({ ...base, webgpuAdapter: false, webgpuTimestampQuery: false });
  }
}

function runCpuDabKernel(workItems: number, seed: number): number {
  let state = seed >>> 0;
  let checksum = 0;
  for (let index = 0; index < workItems; index += 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489917) >>> 0;
    state ^= state >>> 16;
    const pressure = ((state & 1023) + 1) / 1024;
    const tilt = (((state >>> 10) & 511) - 255) / 255;
    const radius = 0.35 + pressure * pressure * 9.65;
    const grain = Math.sin(index * 0.017 + tilt * 2.3) * 0.5 + 0.5;
    const coverage = Math.max(0, Math.min(1, pressure * 0.72 + grain * 0.28));
    checksum = (checksum + Math.round(radius * coverage * 4096) + state) >>> 0;
  }
  return checksum >>> 0;
}

function benchmarkCpuDabs(iterations: number): Readonly<{
  millionMarksPerSecond: number;
  p50Ms: number;
  p95Ms: number;
  checksum: number;
}> {
  const workItems = 180_000;
  const timings: number[] = [];
  let checksum = 0;
  for (let iteration = 0; iteration < iterations + 2; iteration += 1) {
    const start = now();
    checksum ^= runCpuDabKernel(workItems, 0x9e3779b9 ^ iteration);
    const duration = Math.max(0.001, now() - start);
    if (iteration >= 2) timings.push(duration);
  }
  const p50Ms = percentile(timings, 0.5);
  const p95Ms = percentile(timings, 0.95);
  return Object.freeze({
    millionMarksPerSecond: round((workItems / Math.max(0.001, p50Ms)) / 1000),
    p50Ms: round(p50Ms),
    p95Ms: round(p95Ms),
    checksum: checksum >>> 0,
  });
}

async function benchmarkEventLoop(iterations: number): Promise<Readonly<{ p50Ms: number; p95Ms: number }>> {
  const timings: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = now();
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    timings.push(Math.max(0, now() - start));
  }
  return Object.freeze({
    p50Ms: round(percentile(timings, 0.5)),
    p95Ms: round(percentile(timings, 0.95)),
  });
}

function gpuBufferUsage(): number | null {
  const value = (globalThis as typeof globalThis & { GPUBufferUsage?: Readonly<Record<string, number>> }).GPUBufferUsage;
  if (!value) return null;
  const storage = value.STORAGE ?? 0;
  const copyDst = value.COPY_DST ?? 0;
  return storage | copyDst;
}

async function benchmarkWebGpu(iterations: number): Promise<Readonly<{
  p50Ms: number;
  p95Ms: number;
  workItems: number;
}> | null> {
  const gpu = typeof navigator === "undefined" ? undefined : (navigator as NavigatorWithGpu).gpu;
  const usage = gpuBufferUsage();
  if (!gpu || usage === null) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const workItems = 262_144;
  const buffer = device.createBuffer({ size: workItems * 4, usage });
  try {
    const shader = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<u32>;
        fn hash32(value: u32) -> u32 {
          var x = value;
          x = ((x >> 16u) ^ x) * 0x45d9f3bu;
          x = ((x >> 16u) ^ x) * 0x45d9f3bu;
          return (x >> 16u) ^ x;
        }
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
          if (gid.x >= arrayLength(&data)) { return; }
          data[gid.x] = hash32(gid.x + 0x9e3779b9u);
        }
      `,
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: shader, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });
    const timings: number[] = [];
    for (let iteration = 0; iteration < iterations + 2; iteration += 1) {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(workItems / 64));
      pass.end();
      const start = now();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const duration = Math.max(0.001, now() - start);
      if (iteration >= 2) timings.push(duration);
    }
    return Object.freeze({
      p50Ms: round(percentile(timings, 0.5)),
      p95Ms: round(percentile(timings, 0.95)),
      workItems,
    });
  } finally {
    buffer.destroy();
    device.destroy?.();
  }
}

export async function benchmarkBrushRuntime(
  capabilitiesInput?: BrushRuntimeCapabilities,
  iterations = 7,
): Promise<BrushRuntimeBenchmarkReceipt> {
  const capabilities = capabilitiesInput ?? await scanBrushRuntimeCapabilities();
  const boundedIterations = Math.max(3, Math.min(15, Math.round(iterations)));
  const cpu = benchmarkCpuDabs(boundedIterations);
  const eventLoop = await benchmarkEventLoop(Math.max(8, boundedIterations * 2));
  let gpu: Awaited<ReturnType<typeof benchmarkWebGpu>> = null;
  if (capabilities.webgpu && capabilities.webgpuAdapter) {
    try { gpu = await benchmarkWebGpu(boundedIterations); } catch { gpu = null; }
  }
  const cpuStable = cpu.p50Ms <= 0 || cpu.p95Ms / cpu.p50Ms <= 2.8;
  const gpuStable = !gpu || gpu.p50Ms <= 0 || gpu.p95Ms / gpu.p50Ms <= 3;
  return Object.freeze({
    schemaVersion: BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION,
    measuredAt: new Date().toISOString(),
    capabilityFingerprint: brushRuntimeCapabilityFingerprint(capabilities),
    iterations: boundedIterations,
    cpuDabMillionMarksPerSecond: cpu.millionMarksPerSecond,
    eventLoopP50Ms: eventLoop.p50Ms,
    eventLoopP95Ms: eventLoop.p95Ms,
    webgpuDispatchP50Ms: gpu?.p50Ms ?? null,
    webgpuDispatchP95Ms: gpu?.p95Ms ?? null,
    webgpuWorkItems: gpu?.workItems ?? 0,
    checksum: cpu.checksum,
    stable: cpuStable && gpuStable && eventLoop.p95Ms < 50,
  });
}

export function isBrushRuntimeBenchmarkReceipt(value: unknown): value is BrushRuntimeBenchmarkReceipt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrushRuntimeBenchmarkReceipt>;
  return candidate.schemaVersion === BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION
    && typeof candidate.measuredAt === "string"
    && typeof candidate.capabilityFingerprint === "string"
    && typeof candidate.iterations === "number"
    && typeof candidate.cpuDabMillionMarksPerSecond === "number"
    && typeof candidate.eventLoopP50Ms === "number"
    && typeof candidate.eventLoopP95Ms === "number"
    && (typeof candidate.webgpuDispatchP50Ms === "number" || candidate.webgpuDispatchP50Ms === null)
    && (typeof candidate.webgpuDispatchP95Ms === "number" || candidate.webgpuDispatchP95Ms === null)
    && typeof candidate.webgpuWorkItems === "number"
    && typeof candidate.checksum === "number"
    && typeof candidate.stable === "boolean";
}
