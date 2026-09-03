/** Real Chromium A/B benchmark for the product-connected textured WebGPU brush path. */

import {
  createStudioEngineWebGpuPresentationSurface,
  type StudioEngineWebGpuPresentationFrameLease,
  type StudioEngineWebGpuPresentationSurface,
} from "../src/domains/creator/render/studio-engine-webgpu-presentation-surface";
import {
  fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics,
  type StudioEngineWebGpuTexturedBrushPlan,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-plan";
import {
  electStudioEngineWebGpuTexturedBrushRuntime,
  type StudioEngineWebGpuBrushBenchmarkDistribution,
  type StudioEngineWebGpuBrushBenchmarkReport,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-benchmark-contract";
import {
  createStudioEngineWebGpuTexturedBrushRuntime as createV1Runtime,
  packStudioEngineWebGpuTexturedBrushDabs as packV1Dabs,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
  type StudioEngineWebGpuTexturedBrushExecutionResult,
  type StudioEngineWebGpuTexturedBrushFrame,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime";
import {
  createStudioEngineWebGpuTexturedBrushRuntime as createV2Runtime,
  packStudioEngineWebGpuTexturedBrushDabsV2 as packV2Dabs,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_SHADER,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
  type StudioEngineWebGpuTexturedBrushRuntime as StudioEngineWebGpuTexturedBrushRuntimeV2,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime-v2";
import { sha256HexPortable } from "../src/domains/creator/studio-sha256";

const WIDTH = 256;
const HEIGHT = 128;
const DAB_COUNT = 4_096;
const CPU_WARMUP = 20;
const CPU_ITERATIONS = 80;
const GPU_WARMUP = 3;
const GPU_ITERATIONS = 12;
const MAP_READ = 0x0001;
const BUFFER_COPY_DST = 0x0008;
const ROW_ALIGNMENT = 256;
const BYTES_PER_RGBA16F_PIXEL = 8;

type RuntimeBoundary = Readonly<{
  deviceEpoch: number;
  execute(
    frame: StudioEngineWebGpuTexturedBrushFrame,
    signal?: AbortSignal,
  ): Promise<StudioEngineWebGpuTexturedBrushExecutionResult>;
}>;

type BenchmarkBrowserResult =
  | Readonly<{
      status: "ok";
      adapter: Readonly<{
        vendor: string;
        architecture: string;
        device: string;
        description: string;
        isFallbackAdapter: boolean | null;
      }>;
      report: StudioEngineWebGpuBrushBenchmarkReport;
      election: ReturnType<typeof electStudioEngineWebGpuTexturedBrushRuntime>;
      v2Stats: ReturnType<StudioEngineWebGpuTexturedBrushRuntimeV2["stats"]>;
      shaderCompilationAvailable: boolean;
      cpuChecksum: number;
    }>
  | Readonly<{
      status: "unsupported";
      reason: "adapter-unavailable" | "device-unavailable" | "webgpu-unavailable";
      message: string;
    }>
  | Readonly<{
      status: "error";
      message: string;
      stack: string | null;
    }>;

declare global {
  interface Window {
    __studioEngineWebGpuTexturedBrushV2BenchmarkResult?: BenchmarkBrowserResult;
  }
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function deepFreeze<T>(value: T): T {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
    || ArrayBuffer.isView(value)
  ) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function distribution(samples: readonly number[]): StudioEngineWebGpuBrushBenchmarkDistribution {
  invariant(samples.length > 0, "empty benchmark distribution");
  const sorted = [...samples].sort((left, right) => left - right);
  const quantile = (value: number) => sorted[
    Math.min(sorted.length - 1, Math.floor(value * sorted.length))
  ]!;
  const rounded = samples.map((value) => Number(value.toFixed(5)));
  return Object.freeze({
    samplesMs: Object.freeze(rounded),
    p50Ms: Number(quantile(0.5).toFixed(5)),
    p95Ms: Number(quantile(0.95).toFixed(5)),
    p99Ms: Number(quantile(0.99).toFixed(5)),
    meanMs: Number(
      (samples.reduce((total, value) => total + value, 0) / samples.length).toFixed(5),
    ),
  });
}

function makeTip(): Uint8Array {
  const size = 32;
  const bytes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radial = Math.max(0, 1 - Math.hypot(dx, dy));
      const fibre = 0.84 + 0.16 * Math.sin(x * 1.7 + y * 0.31);
      bytes[y * size + x] = Math.round(Math.min(1, radial * 1.35 * fibre) * 255);
    }
  }
  return bytes;
}

function buildPlan(): StudioEngineWebGpuTexturedBrushPlan {
  const tipBytes = makeTip();
  const dabs: StudioEngineWebGpuTexturedBrushPlan["dabs"] = Array.from(
    { length: DAB_COUNT },
    (_, index) => {
      const column = index % 128;
      const row = Math.floor(index / 128);
      const wave = Math.sin(index * 0.071);
      const pressure = Math.fround(0.2 + 0.78 * ((index % 37) / 36));
      const radius = Math.fround(1.4 + pressure * 2.4);
      const angle = Math.fround(index * 0.017 + wave * 0.18);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const roundness = Math.fround(0.42 + 0.5 * ((index % 19) / 18));
      const opacity = Math.fround(0.82);
      const flow = Math.fround(0.46);
      const alpha = Math.fround(opacity * flow * (0.72 + 0.28 * pressure));
      const x = Math.fround(3 + column * 1.97 + wave * 1.2);
      const y = Math.fround(3 + row * 3.78 + Math.cos(index * 0.053) * 1.1);
      return deepFreeze({
        index,
        stationX: x,
        stationY: y,
        x,
        y,
        pressure,
        diameter: Math.fround(radius * 2),
        opacity,
        flow,
        grainDepth: Math.fround(0.3 + pressure * 0.62),
        color: {
          space: "linear-srgb" as const,
          alphaMode: "straight" as const,
          components: [
            Math.fround(0.09 + pressure * 0.18),
            Math.fround(0.035 + (index % 11) * 0.002),
            Math.fround(0.015 + (index % 7) * 0.001),
            alpha,
          ] as const,
        },
        composite: {
          porterDuff: "source-over" as const,
          blendMode: "normal" as const,
        },
        tip: {
          hardness: Math.fround(0.38 + pressure * 0.55),
          roundness,
          angleRadians: angle,
          localToDocument: [
            Math.fround(cosine * radius),
            Math.fround(sine * radius),
            Math.fround(-sine * radius * roundness),
            Math.fround(cosine * radius * roundness),
          ] as const,
        },
      });
    },
  );
  const withoutFingerprint: StudioEngineWebGpuTexturedBrushPlan = {
    kind: "studio-engine-webgpu-textured-brush-plan",
    version: 1,
    loweringVersion: 1,
    mode: "rebuild",
    strokeId: "webgpu-v2-benchmark",
    commandSequence: 1,
    dualTip: "extension-required",
    textureFormat: "rgba16float",
    colorModel: "scene-linear-premultiplied",
    tip: deepFreeze({
      assetIndex: 0,
      channel: "alpha",
      filtering: "bilinear",
      edgeMode: "transparent-zero-border",
      hardnessTransfer: "zero-to-one-smoothstep",
    }),
    grain: deepFreeze({
      kind: "procedural-integer-noise",
      assetIndex: null,
      space: "stroke",
      scale: 2.75,
      depth: 0.9,
      contrast: 0.52,
      invert: false,
      seed: 0xfedc_ba98,
      originX: dabs[0]!.x,
      originY: dabs[0]!.y,
      filtering: "integer-cell",
      edgeMode: "infinite",
    }),
    grainSamplingSemantics: "specialist-texture-v1",
    assets: deepFreeze([deepFreeze({
      assetIndex: 0,
      role: "tip",
      assetId: "webgpu-v2-benchmark-tip",
      contentHash: `sha256:${sha256HexPortable(tipBytes)}`,
      width: 32,
      height: 32,
      channel: "alpha",
      format: "r8-unorm",
      byteLength: tipBytes.byteLength,
      bytes: tipBytes,
    })]),
    dabs: deepFreeze(dabs),
    batches: deepFreeze([deepFreeze({
      key: "webgpu-v2-benchmark-tip|none|source-over",
      tipAssetIndex: 0,
      grainAssetIndex: null,
      porterDuff: "source-over",
      firstInstance: 0,
      instanceCount: dabs.length,
    })]),
  };
  const semanticFingerprint =
    fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(withoutFingerprint);
  invariant(semanticFingerprint, "benchmark plan fingerprint failed");
  return deepFreeze({ ...withoutFingerprint, semanticFingerprint });
}

function iterationPlan(
  base: StudioEngineWebGpuTexturedBrushPlan,
): StudioEngineWebGpuTexturedBrushPlan {
  return Object.freeze({ ...base });
}

function createSurface(
  device: GPUDevice,
  canvasFormat: "bgra8unorm" | "rgba8unorm",
): StudioEngineWebGpuPresentationSurface {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgpu");
  invariant(context, "webgpu canvas context unavailable");
  const created = createStudioEngineWebGpuPresentationSurface({
    device,
    context,
    canvas,
    canvasFormat,
    ownsDevice: false,
  });
  invariant(created.status === "ready", "presentation surface creation failed");
  const configured = created.surface.configure({
    presentationEpoch: 1,
    resizeEpoch: 1,
    viewportEpoch: 1,
    flipEpoch: 1,
    cssWidth: WIDTH,
    cssHeight: HEIGHT,
    dpr: 1,
    viewport: {
      logicalWidth: WIDTH,
      logicalHeight: HEIGHT,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      flipX: false,
      flipY: false,
    },
  });
  invariant(configured.status === "ready", "presentation surface configuration failed");
  return created.surface;
}

function begin(
  surface: StudioEngineWebGpuPresentationSurface,
  runtime: RuntimeBoundary,
  requestSequence: number,
  plan: StudioEngineWebGpuTexturedBrushPlan,
): StudioEngineWebGpuPresentationFrameLease {
  const fingerprint = fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(plan);
  invariant(fingerprint, "frame fingerprint failed");
  const result = surface.beginFrame({
    requestSequence,
    deviceEpoch: runtime.deviceEpoch,
    presentationEpoch: 1,
    resizeEpoch: 1,
    viewportEpoch: 1,
    flipEpoch: 1,
    sourceFrameFingerprint: fingerprint,
  });
  invariant(result.status === "ready", `beginFrame failed: ${result.status}`);
  return result.frame;
}

async function executeOnce(
  runtime: RuntimeBoundary,
  surface: StudioEngineWebGpuPresentationSurface,
  requestSequence: number,
  plan: StudioEngineWebGpuTexturedBrushPlan,
): Promise<Readonly<{
  elapsedMs: number;
  lease: StudioEngineWebGpuPresentationFrameLease;
}>> {
  const lease = begin(surface, runtime, requestSequence, plan);
  const start = performance.now();
  const result = await runtime.execute({
    requestSequence,
    deviceEpoch: runtime.deviceEpoch,
    plan,
    presentationLease: lease,
  });
  const elapsedMs = performance.now() - start;
  if (result.status !== "completed") {
    surface.abortFrame(lease);
    throw new Error(`runtime execution failed: ${result.status}${
      "reason" in result ? `:${result.reason}` : ""
    }`);
  }
  return { elapsedMs, lease };
}

async function executePair(
  runtime: RuntimeBoundary,
  surface: StudioEngineWebGpuPresentationSurface,
  firstRequestSequence: number,
  plan: StudioEngineWebGpuTexturedBrushPlan,
): Promise<number> {
  const start = performance.now();
  for (let offset = 0; offset < 2; offset += 1) {
    const execution = await executeOnce(
      runtime,
      surface,
      firstRequestSequence + offset,
      plan,
    );
    const aborted = surface.abortFrame(execution.lease);
    invariant(aborted.status === "aborted", "benchmark frame abort failed");
  }
  return performance.now() - start;
}

async function readHalfWords(
  device: GPUDevice,
  texture: GPUTexture,
): Promise<Uint16Array> {
  const rowBytes = WIDTH * BYTES_PER_RGBA16F_PIXEL;
  const bytesPerRow = Math.ceil(rowBytes / ROW_ALIGNMENT) * ROW_ALIGNMENT;
  const bufferSize = bytesPerRow * HEIGHT;
  const buffer = device.createBuffer({
    label: "Studio textured brush v2 benchmark readback",
    size: bufferSize,
    usage: MAP_READ | BUFFER_COPY_DST,
  });
  const encoder = device.createCommandEncoder({
    label: "Studio textured brush v2 benchmark readback encoder",
  });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow, rowsPerImage: HEIGHT },
    { width: WIDTH, height: HEIGHT, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(MAP_READ, 0, bufferSize);
  const source = new Uint16Array(buffer.getMappedRange(0, bufferSize));
  const sourceWordsPerRow = bytesPerRow / Uint16Array.BYTES_PER_ELEMENT;
  const targetWordsPerRow = WIDTH * 4;
  const result = new Uint16Array(targetWordsPerRow * HEIGHT);
  for (let row = 0; row < HEIGHT; row += 1) {
    result.set(
      source.subarray(
        row * sourceWordsPerRow,
        row * sourceWordsPerRow + targetWordsPerRow,
      ),
      row * targetWordsPerRow,
    );
  }
  buffer.unmap();
  buffer.destroy();
  return result;
}

async function renderHalfWords(
  device: GPUDevice,
  runtime: RuntimeBoundary,
  surface: StudioEngineWebGpuPresentationSurface,
  requestSequence: number,
  plan: StudioEngineWebGpuTexturedBrushPlan,
): Promise<Uint16Array> {
  const execution = await executeOnce(runtime, surface, requestSequence, plan);
  const pixels = await readHalfWords(device, execution.lease.workSurface.texture);
  const aborted = surface.abortFrame(execution.lease);
  invariant(aborted.status === "aborted", "quality frame abort failed");
  return pixels;
}

function compareHalfWords(left: Uint16Array, right: Uint16Array) {
  invariant(left.length === right.length, "quality buffers differ in length");
  let exactHalfWordMismatches = 0;
  let maximumAbsoluteHalfWordDelta = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = Math.abs(left[index]! - right[index]!);
    if (delta !== 0) exactHalfWordMismatches += 1;
    maximumAbsoluteHalfWordDelta = Math.max(maximumAbsoluteHalfWordDelta, delta);
  }
  return {
    comparedHalfWords: left.length,
    exactHalfWordMismatches,
    maximumAbsoluteHalfWordDelta,
  };
}

function benchmarkCpuPack(plan: StudioEngineWebGpuTexturedBrushPlan) {
  const v2Scratch = new Float32Array(
    plan.dabs.length * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS,
  );
  let checksum = 0;
  for (let index = 0; index < CPU_WARMUP; index += 1) {
    checksum += packV1Dabs(plan)[index % plan.dabs.length]!;
    checksum += packV2Dabs(plan, v2Scratch)[index % plan.dabs.length]!;
  }
  const v1Samples: number[] = [];
  const v2Samples: number[] = [];
  const measureV1 = () => {
    const start = performance.now();
    const packed = packV1Dabs(plan);
    v1Samples.push(performance.now() - start);
    checksum += packed[(v1Samples.length * 17) % packed.length]!;
  };
  const measureV2 = () => {
    const start = performance.now();
    const packed = packV2Dabs(plan, v2Scratch);
    v2Samples.push(performance.now() - start);
    checksum += packed[(v2Samples.length * 19) % packed.length]!;
  };
  for (let index = 0; index < CPU_ITERATIONS; index += 1) {
    if ((index & 1) === 0) {
      measureV1();
      measureV2();
    } else {
      measureV2();
      measureV1();
    }
  }
  return {
    v1: distribution(v1Samples),
    v2: distribution(v2Samples),
    checksum: Number(checksum.toFixed(5)),
  };
}

async function main(): Promise<BenchmarkBrowserResult> {
  const gpu = navigator.gpu;
  if (!gpu) {
    return { status: "unsupported", reason: "webgpu-unavailable", message: "navigator.gpu missing" };
  }
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    return { status: "unsupported", reason: "adapter-unavailable", message: "requestAdapter returned null" };
  }
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (error) {
    return {
      status: "unsupported",
      reason: "device-unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const uncapturedErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => {
    uncapturedErrors.push(event.error.message);
  });
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");

  const shaderModule = device.createShaderModule({
    label: "Studio compact textured brush v2 benchmark compilation",
    code: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_SHADER,
  });
  const compilationInfo = "getCompilationInfo" in shaderModule
    ? await shaderModule.getCompilationInfo()
    : null;
  const shaderCompilationMessages = compilationInfo?.messages.length ?? 0;

  const format = gpu.getPreferredCanvasFormat();
  invariant(
    format === "bgra8unorm" || format === "rgba8unorm",
    `unsupported canvas format ${format}`,
  );
  const v1Surface = createSurface(device, format);
  const v2Surface = createSurface(device, format);
  const v1Created = createV1Runtime({
    device,
    presentationOnly: true,
    ownsDevice: false,
  });
  const v2Created = createV2Runtime({
    device,
    presentationOnly: true,
    ownsDevice: false,
  });
  invariant(v1Created.status === "ready", `v1 runtime unavailable: ${v1Created.status}`);
  invariant(v2Created.status === "ready", `v2 runtime unavailable: ${v2Created.status}`);
  const v1 = v1Created.runtime;
  const v2 = v2Created.runtime;
  const basePlan = buildPlan();
  const cpu = benchmarkCpuPack(basePlan);

  let v1Sequence = 1;
  let v2Sequence = 1;
  for (let index = 0; index < GPU_WARMUP; index += 1) {
    const plan = iterationPlan(basePlan);
    if ((index & 1) === 0) {
      await executePair(v1, v1Surface, v1Sequence, plan);
      await executePair(v2, v2Surface, v2Sequence, plan);
    } else {
      await executePair(v2, v2Surface, v2Sequence, plan);
      await executePair(v1, v1Surface, v1Sequence, plan);
    }
    v1Sequence += 2;
    v2Sequence += 2;
  }

  const v1ExecuteSamples: number[] = [];
  const v2ExecuteSamples: number[] = [];
  for (let index = 0; index < GPU_ITERATIONS; index += 1) {
    const plan = iterationPlan(basePlan);
    if ((index & 1) === 0) {
      v1ExecuteSamples.push(await executePair(v1, v1Surface, v1Sequence, plan));
      v2ExecuteSamples.push(await executePair(v2, v2Surface, v2Sequence, plan));
    } else {
      v2ExecuteSamples.push(await executePair(v2, v2Surface, v2Sequence, plan));
      v1ExecuteSamples.push(await executePair(v1, v1Surface, v1Sequence, plan));
    }
    v1Sequence += 2;
    v2Sequence += 2;
  }

  const qualityPlan = iterationPlan(basePlan);
  const v1Pixels = await renderHalfWords(device, v1, v1Surface, v1Sequence, qualityPlan);
  const v2Pixels = await renderHalfWords(device, v2, v2Surface, v2Sequence, qualityPlan);
  const qualityDelta = compareHalfWords(v1Pixels, v2Pixels);
  await device.queue.onSubmittedWorkDone();
  const validationError = await device.popErrorScope();
  const outOfMemoryError = await device.popErrorScope();
  const v2Stats = v2.stats();

  const report: StudioEngineWebGpuBrushBenchmarkReport = Object.freeze({
    kind: "studio-engine-webgpu-textured-brush-benchmark",
    revision: 1,
    dabCount: DAB_COUNT,
    warmupIterations: GPU_WARMUP,
    measuredIterations: GPU_ITERATIONS,
    v1: Object.freeze({
      id: "v1-general",
      instanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
      verticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB,
      cpuPack: cpu.v1,
      execute: distribution(v1ExecuteSamples),
      instanceUploads: null,
      instanceUploadBytes: null,
      reusedInstanceUploads: null,
    }),
    v2: Object.freeze({
      id: "v2-compact",
      instanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
      verticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
      cpuPack: cpu.v2,
      execute: distribution(v2ExecuteSamples),
      instanceUploads: v2Stats.instanceUploads,
      instanceUploadBytes: v2Stats.instanceUploadBytes,
      reusedInstanceUploads: v2Stats.reusedInstanceUploads,
    }),
    quality: Object.freeze({
      ...qualityDelta,
      shaderCompilationAvailable: compilationInfo !== null,
      shaderCompilationMessages,
      scopedGpuErrors: Number(validationError !== null) + Number(outOfMemoryError !== null),
      uncapturedGpuErrors: uncapturedErrors.length,
    }),
  });
  const election = electStudioEngineWebGpuTexturedBrushRuntime(report);
  v1Surface.dispose();
  v2Surface.dispose();
  v1.dispose();
  v2.dispose();
  device.destroy();

  const adapterInfo = adapter.info;
  return Object.freeze({
    status: "ok",
    adapter: Object.freeze({
      vendor: adapterInfo.vendor,
      architecture: adapterInfo.architecture,
      device: adapterInfo.device,
      description: adapterInfo.description,
      isFallbackAdapter: "isFallbackAdapter" in adapter
        ? Boolean(adapter.isFallbackAdapter)
        : null,
    }),
    report,
    election,
    v2Stats,
    shaderCompilationAvailable: compilationInfo !== null,
    cpuChecksum: cpu.checksum,
  });
}

void main().then(
  (result) => {
    window.__studioEngineWebGpuTexturedBrushV2BenchmarkResult = result;
  },
  (error) => {
    window.__studioEngineWebGpuTexturedBrushV2BenchmarkResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    };
  },
);
