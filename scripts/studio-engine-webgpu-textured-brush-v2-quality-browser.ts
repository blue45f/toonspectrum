/**
 * Real-browser V1/V2 WebGPU brush comparison across visual texture, continuity, temporal growth,
 * CPU packing and cold/hot GPU execution. Every quality case renders to the same RGBA16F surface.
 */

import {
  createStudioEngineWebGpuPresentationSurface,
  type StudioEngineWebGpuPresentationFrameLease,
  type StudioEngineWebGpuPresentationSurface,
} from "../src/domains/creator/render/studio-engine-webgpu-presentation-surface";
import {
  electStudioEngineWebGpuTexturedBrushRuntime,
  type StudioEngineWebGpuBrushBenchmarkDistribution,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-benchmark-contract";
import {
  fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics,
  type StudioEngineWebGpuTexturedBrushPlan,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-plan";
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
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
  type StudioEngineWebGpuTexturedBrushRuntime as StudioEngineWebGpuTexturedBrushRuntimeV2,
} from "../src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime-v2";
import {
  analyzeStudioWebGpuBrushRgba16F,
  compareStudioWebGpuBrushAlphaMonotonicity,
  compareStudioWebGpuBrushRgba16F,
  studioWebGpuRgba16FDiffToRgba8,
  studioWebGpuRgba16FToRgba8,
  type StudioWebGpuBrushPoint,
} from "../src/domains/creator/render/studio-webgpu-brush-visual-metrics";
import { sha256HexPortable } from "../src/domains/creator/studio-sha256";

const WIDTH = 512;
const HEIGHT = 256;
const MAP_READ = 0x0001;
const BUFFER_COPY_DST = 0x0008;
const ROW_ALIGNMENT = 256;
const BYTES_PER_RGBA16F_PIXEL = 8;
const CPU_WARMUP = 12;
const CPU_ITERATIONS = 48;
const GPU_WARMUP = 2;
const GPU_COLD_ITERATIONS = 8;
const GPU_HOT_ITERATIONS = 8;
const CPU_DAB_COUNTS = [64, 256, 1_024, 4_096, 16_384] as const;
const GPU_DAB_COUNTS = [256, 1_024, 4_096] as const;

interface RuntimeBoundary {
  readonly deviceEpoch: number;
  execute(
    frame: StudioEngineWebGpuTexturedBrushFrame,
    signal?: AbortSignal,
  ): Promise<StudioEngineWebGpuTexturedBrushExecutionResult>;
  dispose(): void;
}

interface CaseDefinition {
  readonly id: string;
  readonly label: string;
  readonly dabCount: number;
  readonly tip: "fibre" | "rake" | "chalk";
  readonly grainScale: number;
  readonly grainContrast: number;
  readonly path: (t: number, index: number, count: number) => StudioWebGpuBrushPoint;
  readonly pressure: (t: number, index: number) => number;
  readonly radius: (t: number, pressure: number) => number;
  readonly roundness: (t: number, index: number) => number;
  readonly angleOffset?: (t: number, index: number) => number;
  readonly minimumCenterlineCoverage: number;
  readonly maximumCenterlineGap: number;
  readonly minimumLargestComponentRatio: number;
}

type BrowserResult =
  | Readonly<{
      status: "ok";
      adapter: Readonly<{
        vendor: string;
        architecture: string;
        device: string;
        description: string;
        isFallbackAdapter: boolean | null;
      }>;
      dimensions: Readonly<{ width: number; height: number }>;
      constants: Readonly<{
        v1InstanceBytesPerDab: number;
        v2InstanceBytesPerDab: number;
        v1VerticesPerDab: number;
        v2VerticesPerDab: number;
      }>;
      cases: readonly VisualCaseResult[];
      temporal: readonly TemporalCaseResult[];
      cpuScaling: readonly ScalingResult[];
      gpuColdScaling: readonly ScalingResult[];
      gpuHotScaling: readonly ScalingResult[];
      v2Stats: ReturnType<StudioEngineWebGpuTexturedBrushRuntimeV2["stats"]>;
      shaderCompilationAvailable: boolean;
      shaderCompilationMessages: readonly string[];
      scopedGpuErrors: readonly string[];
      uncapturedGpuErrors: readonly string[];
      election: ReturnType<typeof electStudioEngineWebGpuTexturedBrushRuntime>;
    }>
  | Readonly<{
      status: "unsupported";
      reason: "adapter-unavailable" | "device-unavailable" | "webgpu-unavailable";
      message: string;
    }>
  | Readonly<{ status: "error"; message: string; stack: string | null }>;

interface VisualCaseResult {
  readonly id: string;
  readonly label: string;
  readonly dabCount: number;
  readonly comparison: ReturnType<typeof compareStudioWebGpuBrushRgba16F>;
  readonly v1Metrics: ReturnType<typeof analyzeStudioWebGpuBrushRgba16F>;
  readonly v2Metrics: ReturnType<typeof analyzeStudioWebGpuBrushRgba16F>;
  readonly thresholds: Readonly<{
    minimumCenterlineCoverage: number;
    maximumCenterlineGap: number;
    minimumLargestComponentRatio: number;
  }>;
  readonly v1Png: string;
  readonly v2Png: string;
  readonly diffPng: string;
}

interface TemporalCaseResult {
  readonly fraction: number;
  readonly dabCount: number;
  readonly v1V2Comparison: ReturnType<typeof compareStudioWebGpuBrushRgba16F>;
  readonly v1Growth: ReturnType<typeof compareStudioWebGpuBrushAlphaMonotonicity> | null;
  readonly v2Growth: ReturnType<typeof compareStudioWebGpuBrushAlphaMonotonicity> | null;
  readonly v1Metrics: ReturnType<typeof analyzeStudioWebGpuBrushRgba16F>;
  readonly v2Metrics: ReturnType<typeof analyzeStudioWebGpuBrushRgba16F>;
}

interface ScalingResult {
  readonly dabCount: number;
  readonly v1: StudioEngineWebGpuBrushBenchmarkDistribution;
  readonly v2: StudioEngineWebGpuBrushBenchmarkDistribution;
  readonly p50Ratio: number;
  readonly p95Ratio: number;
  readonly p99Ratio: number;
}

declare global {
  interface Window {
    __studioEngineWebGpuTexturedBrushV2QualityResult?: BrowserResult;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distribution(samples: readonly number[]): StudioEngineWebGpuBrushBenchmarkDistribution {
  invariant(samples.length > 0, "empty benchmark distribution");
  const sorted = [...samples].sort((left, right) => left - right);
  const quantile = (value: number) => sorted[
    Math.min(sorted.length - 1, Math.floor(value * sorted.length))
  ]!;
  return Object.freeze({
    samplesMs: Object.freeze(samples.map((value) => Number(value.toFixed(5)))),
    p50Ms: Number(quantile(0.5).toFixed(5)),
    p95Ms: Number(quantile(0.95).toFixed(5)),
    p99Ms: Number(quantile(0.99).toFixed(5)),
    meanMs: Number(
      (samples.reduce((total, value) => total + value, 0) / samples.length).toFixed(5),
    ),
  });
}

function ratio(candidate: number, baseline: number): number {
  return Number((candidate / baseline).toFixed(5));
}

function makeTip(kind: CaseDefinition["tip"]): Uint8Array {
  const size = 32;
  const bytes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radial = Math.max(0, 1 - Math.hypot(dx, dy));
      let texture: number;
      if (kind === "fibre") {
        texture = 0.78 + 0.22 * Math.sin(x * 1.73 + y * 0.29);
      } else if (kind === "rake") {
        texture = 0.24 + 0.76 * Math.pow(Math.max(0, Math.sin(x * 1.34)), 2.8);
      } else {
        const cell = ((x * 29 + y * 17 + (x ^ y) * 11) % 31) / 30;
        texture = 0.58 + cell * 0.42;
      }
      bytes[y * size + x] = Math.round(clamp01(radial * 1.45 * texture) * 255);
    }
  }
  return bytes;
}

function samplePath(
  definition: CaseDefinition,
  count = definition.dabCount,
): readonly StudioWebGpuBrushPoint[] {
  return Array.from({ length: count }, (_, index) => definition.path(
    count <= 1 ? 0 : index / (count - 1),
    index,
    count,
  ));
}

function buildPlan(
  definition: CaseDefinition,
  requestedCount = definition.dabCount,
  commandSequence = 1,
): StudioEngineWebGpuTexturedBrushPlan {
  const count = Math.max(1, Math.min(requestedCount, definition.dabCount));
  const fullPath = samplePath(definition);
  const path = fullPath.slice(0, count);
  const tipBytes = makeTip(definition.tip);
  const dabs: StudioEngineWebGpuTexturedBrushPlan["dabs"] = path.map((point, index) => {
    const t = definition.dabCount <= 1 ? 0 : index / (definition.dabCount - 1);
    const previous = fullPath[Math.max(0, index - 1)] ?? point;
    const next = fullPath[Math.min(fullPath.length - 1, index + 1)] ?? point;
    const tangentAngle = Math.atan2(next.y - previous.y, next.x - previous.x);
    const pressure = Math.fround(clamp01(definition.pressure(t, index)));
    const radius = Math.fround(Math.max(0.35, definition.radius(t, pressure)));
    const roundness = Math.fround(
      Math.max(0.12, Math.min(1, definition.roundness(t, index))),
    );
    const angle = Math.fround(tangentAngle + (definition.angleOffset?.(t, index) ?? 0));
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const opacity = Math.fround(0.86);
    const flow = Math.fround(0.48);
    const alpha = Math.fround(opacity * flow * (0.68 + pressure * 0.32));
    return deepFreeze({
      index,
      stationX: Math.fround(point.x),
      stationY: Math.fround(point.y),
      x: Math.fround(point.x),
      y: Math.fround(point.y),
      pressure,
      diameter: Math.fround(radius * 2),
      opacity,
      flow,
      grainDepth: Math.fround(0.35 + pressure * 0.6),
      color: {
        space: "linear-srgb" as const,
        alphaMode: "straight" as const,
        components: [
          Math.fround(0.08 + pressure * 0.2),
          Math.fround(0.03 + (index % 13) * 0.0015),
          Math.fround(0.012 + (index % 7) * 0.001),
          alpha,
        ] as const,
      },
      composite: {
        porterDuff: "source-over" as const,
        blendMode: "normal" as const,
      },
      tip: {
        hardness: Math.fround(0.36 + pressure * 0.56),
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
  });
  const withoutFingerprint: StudioEngineWebGpuTexturedBrushPlan = {
    kind: "studio-engine-webgpu-textured-brush-plan",
    version: 1,
    loweringVersion: 1,
    mode: "rebuild",
    strokeId: `${definition.id}-${count}`,
    commandSequence,
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
      scale: definition.grainScale,
      depth: 0.9,
      contrast: definition.grainContrast,
      invert: false,
      seed: (0x6a09_e667 ^ definition.id.length) >>> 0,
      originX: dabs[0]!.x,
      originY: dabs[0]!.y,
      filtering: "integer-cell",
      edgeMode: "infinite",
    }),
    grainSamplingSemantics: "specialist-texture-v1",
    assets: deepFreeze([deepFreeze({
      assetIndex: 0,
      role: "tip",
      assetId: `${definition.id}-${definition.tip}`,
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
      key: `${definition.id}|source-over`,
      tipAssetIndex: 0,
      grainAssetIndex: null,
      porterDuff: "source-over",
      firstInstance: 0,
      instanceCount: dabs.length,
    })]),
  };
  const semanticFingerprint =
    fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(withoutFingerprint);
  invariant(semanticFingerprint, `${definition.id}: plan fingerprint failed`);
  return deepFreeze({ ...withoutFingerprint, semanticFingerprint });
}

const CASES: readonly CaseDefinition[] = deepFreeze([
  {
    id: "pressure-ramp",
    label: "pressure ramp",
    dabCount: 768,
    tip: "fibre",
    grainScale: 3.2,
    grainContrast: 0.46,
    path: (t) => ({ x: 24 + t * 464, y: 37 + Math.sin(t * Math.PI * 3) * 5 }),
    pressure: (t) => 0.08 + Math.sin(t * Math.PI) * 0.9,
    radius: (_t, pressure) => 1.3 + pressure * 7.4,
    roundness: () => 0.72,
    minimumCenterlineCoverage: 0.985,
    maximumCenterlineGap: 2,
    minimumLargestComponentRatio: 0.985,
  },
  {
    id: "tight-s-curve",
    label: "tight S curve",
    dabCount: 1_024,
    tip: "fibre",
    grainScale: 2.6,
    grainContrast: 0.54,
    path: (t) => ({ x: 28 + t * 456, y: 128 + Math.sin(t * Math.PI * 4) * 78 }),
    pressure: (t) => 0.38 + 0.54 * (0.5 + 0.5 * Math.sin(t * Math.PI * 5)),
    radius: (_t, pressure) => 2 + pressure * 5.5,
    roundness: (t) => 0.48 + 0.32 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2)),
    minimumCenterlineCoverage: 0.99,
    maximumCenterlineGap: 1,
    minimumLargestComponentRatio: 0.99,
  },
  {
    id: "fast-zigzag",
    label: "fast sparse zigzag",
    dabCount: 512,
    tip: "chalk",
    grainScale: 4.1,
    grainContrast: 0.62,
    path: (t) => {
      const teeth = 10;
      const phase = (t * teeth) % 1;
      const triangle = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
      return { x: 24 + t * 464, y: 128 + triangle * 86 };
    },
    pressure: (_t, index) => 0.2 + 0.76 * ((index % 17) / 16),
    radius: (_t, pressure) => 2.2 + pressure * 5.2,
    roundness: (_t, index) => 0.38 + (index % 5) * 0.09,
    minimumCenterlineCoverage: 0.965,
    maximumCenterlineGap: 3,
    minimumLargestComponentRatio: 0.96,
  },
  {
    id: "spiral",
    label: "curvature spiral",
    dabCount: 1_536,
    tip: "rake",
    grainScale: 3.4,
    grainContrast: 0.58,
    path: (t) => {
      const angle = t * Math.PI * 9;
      const radius = 10 + t * 105;
      return { x: 256 + Math.cos(angle) * radius, y: 128 + Math.sin(angle) * radius };
    },
    pressure: (t) => 0.25 + 0.7 * t,
    radius: (_t, pressure) => 2 + pressure * 5.8,
    roundness: () => 0.32,
    angleOffset: (_t, index) => Math.sin(index * 0.17) * 0.13,
    minimumCenterlineCoverage: 0.985,
    maximumCenterlineGap: 2,
    minimumLargestComponentRatio: 0.985,
  },
  {
    id: "figure-eight",
    label: "self-crossing figure eight",
    dabCount: 1_536,
    tip: "fibre",
    grainScale: 2.8,
    grainContrast: 0.5,
    path: (t) => ({
      x: 256 + Math.sin(t * Math.PI * 2) * 185,
      y: 128 + Math.sin(t * Math.PI * 4) * 88,
    }),
    pressure: (t) => 0.35 + 0.6 * (0.5 + 0.5 * Math.cos(t * Math.PI * 6)),
    radius: (_t, pressure) => 2 + pressure * 5.6,
    roundness: () => 0.64,
    minimumCenterlineCoverage: 0.99,
    maximumCenterlineGap: 1,
    minimumLargestComponentRatio: 0.99,
  },
  {
    id: "micro-jitter",
    label: "micro jitter continuity",
    dabCount: 2_048,
    tip: "chalk",
    grainScale: 2.2,
    grainContrast: 0.64,
    path: (t, index) => ({
      x: 22 + t * 468,
      y: 128 + Math.sin(index * 0.91) * 2.2 + Math.sin(index * 0.17) * 4,
    }),
    pressure: (_t, index) => 0.3 + 0.64 * ((index % 29) / 28),
    radius: (_t, pressure) => 1.5 + pressure * 3.4,
    roundness: () => 0.78,
    minimumCenterlineCoverage: 0.985,
    maximumCenterlineGap: 2,
    minimumLargestComponentRatio: 0.985,
  },
  {
    id: "dense-texture-field",
    label: "dense texture spectrum field",
    dabCount: 4_096,
    tip: "rake",
    grainScale: 2.75,
    grainContrast: 0.7,
    path: (_t, index) => {
      const column = index % 128;
      const row = Math.floor(index / 128);
      return {
        x: 4 + column * 3.94 + Math.sin(index * 0.071) * 1.1,
        y: 4 + row * 7.75 + Math.cos(index * 0.053) * 1.2,
      };
    },
    pressure: (_t, index) => 0.2 + 0.78 * ((index % 37) / 36),
    radius: (_t, pressure) => 1.4 + pressure * 2.5,
    roundness: (_t, index) => 0.38 + 0.54 * ((index % 19) / 18),
    angleOffset: (_t, index) => index * 0.017,
    minimumCenterlineCoverage: 0,
    maximumCenterlineGap: 4_096,
    minimumLargestComponentRatio: 0,
  },
]);

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
): Promise<Readonly<{ elapsedMs: number; lease: StudioEngineWebGpuPresentationFrameLease }>> {
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

async function readHalfWords(
  device: GPUDevice,
  texture: GPUTexture,
): Promise<Uint16Array> {
  const rowBytes = WIDTH * BYTES_PER_RGBA16F_PIXEL;
  const bytesPerRow = Math.ceil(rowBytes / ROW_ALIGNMENT) * ROW_ALIGNMENT;
  const bufferSize = bytesPerRow * HEIGHT;
  const buffer = device.createBuffer({
    label: "Studio textured brush V2 quality readback",
    size: bufferSize,
    usage: MAP_READ | BUFFER_COPY_DST,
  });
  const encoder = device.createCommandEncoder({
    label: "Studio textured brush V2 quality readback encoder",
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
      source.subarray(row * sourceWordsPerRow, row * sourceWordsPerRow + targetWordsPerRow),
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

function toDataUrl(pixels: Uint8ClampedArray): string {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  invariant(context, "2d evidence context unavailable");
  context.putImageData(new ImageData(pixels, WIDTH, HEIGHT), 0, 0);
  return canvas.toDataURL("image/png");
}

function scalingResult(
  dabCount: number,
  v1Samples: readonly number[],
  v2Samples: readonly number[],
): ScalingResult {
  const v1 = distribution(v1Samples);
  const v2 = distribution(v2Samples);
  return Object.freeze({
    dabCount,
    v1,
    v2,
    p50Ratio: ratio(v2.p50Ms, v1.p50Ms),
    p95Ratio: ratio(v2.p95Ms, v1.p95Ms),
    p99Ratio: ratio(v2.p99Ms, v1.p99Ms),
  });
}

function benchmarkCpu(definition: CaseDefinition, dabCount: number): ScalingResult {
  const plan = buildPlan(
    { ...definition, dabCount: Math.max(definition.dabCount, dabCount) },
    dabCount,
  );
  const scratch = new Float32Array(
    dabCount * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS,
  );
  let checksum = 0;
  for (let index = 0; index < CPU_WARMUP; index += 1) {
    checksum += packV1Dabs(plan)[index % plan.dabs.length]!;
    checksum += packV2Dabs(plan, scratch)[index % plan.dabs.length]!;
  }
  invariant(Number.isFinite(checksum), "CPU benchmark checksum failed");
  const v1Samples: number[] = [];
  const v2Samples: number[] = [];
  for (let index = 0; index < CPU_ITERATIONS; index += 1) {
    const v1Start = performance.now();
    const v1 = packV1Dabs(plan);
    v1Samples.push(performance.now() - v1Start);
    const v2Start = performance.now();
    const v2 = packV2Dabs(plan, scratch);
    v2Samples.push(performance.now() - v2Start);
    checksum += v1[index % v1.length]! + v2[index % v2.length]!;
  }
  invariant(Number.isFinite(checksum), "CPU benchmark checksum drifted");
  return scalingResult(dabCount, v1Samples, v2Samples);
}

async function benchmarkGpu(
  mode: "cold" | "hot",
  definition: CaseDefinition,
  dabCount: number,
  v1: RuntimeBoundary,
  v2: RuntimeBoundary,
  v1Surface: StudioEngineWebGpuPresentationSurface,
  v2Surface: StudioEngineWebGpuPresentationSurface,
  sequences: { v1: number; v2: number },
): Promise<ScalingResult> {
  const base = buildPlan(
    { ...definition, dabCount: Math.max(definition.dabCount, dabCount) },
    dabCount,
  );
  const iterations = mode === "cold" ? GPU_COLD_ITERATIONS : GPU_HOT_ITERATIONS;
  const v1Samples: number[] = [];
  const v2Samples: number[] = [];
  const planFor = (iteration: number) => {
    if (mode === "hot") return base;
    const candidate: StudioEngineWebGpuTexturedBrushPlan = {
      ...base,
      commandSequence: 100 + iteration,
      strokeId: `${base.strokeId}-cold-${iteration}`,
      semanticFingerprint: undefined,
    };
    const semanticFingerprint =
      fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(candidate);
    invariant(semanticFingerprint, "cold benchmark fingerprint failed");
    return deepFreeze({ ...candidate, semanticFingerprint });
  };
  for (let index = 0; index < GPU_WARMUP; index += 1) {
    const plan = planFor(-index - 1);
    const first = await executeOnce(v1, v1Surface, sequences.v1++, plan);
    v1Surface.abortFrame(first.lease);
    const second = await executeOnce(v2, v2Surface, sequences.v2++, plan);
    v2Surface.abortFrame(second.lease);
  }
  for (let index = 0; index < iterations; index += 1) {
    const plan = planFor(index);
    if ((index & 1) === 0) {
      const first = await executeOnce(v1, v1Surface, sequences.v1++, plan);
      v1Samples.push(first.elapsedMs);
      v1Surface.abortFrame(first.lease);
      const second = await executeOnce(v2, v2Surface, sequences.v2++, plan);
      v2Samples.push(second.elapsedMs);
      v2Surface.abortFrame(second.lease);
    } else {
      const second = await executeOnce(v2, v2Surface, sequences.v2++, plan);
      v2Samples.push(second.elapsedMs);
      v2Surface.abortFrame(second.lease);
      const first = await executeOnce(v1, v1Surface, sequences.v1++, plan);
      v1Samples.push(first.elapsedMs);
      v1Surface.abortFrame(first.lease);
    }
  }
  return scalingResult(dabCount, v1Samples, v2Samples);
}

async function main(): Promise<BrowserResult> {
  const gpu = navigator.gpu;
  if (!gpu) {
    return {
      status: "unsupported",
      reason: "webgpu-unavailable",
      message: "navigator.gpu missing",
    };
  }
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    return {
      status: "unsupported",
      reason: "adapter-unavailable",
      message: "requestAdapter returned null",
    };
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

  const uncapturedGpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => {
    uncapturedGpuErrors.push(event.error.message);
  });
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  // The runtime owns the canonical WGSL module. Scoped validation plus the existing dedicated
  // compile/parity gate is authoritative here; this harness avoids a second shader copy.
  const compilation = null;
  const shaderCompilationMessages: string[] = [];
  const canvasFormat = gpu.getPreferredCanvasFormat();
  invariant(
    canvasFormat === "bgra8unorm" || canvasFormat === "rgba8unorm",
    `unsupported canvas format ${canvasFormat}`,
  );
  const v1Surface = createSurface(device, canvasFormat);
  const v2Surface = createSurface(device, canvasFormat);
  const v1Created = createV1Runtime({ device, presentationOnly: true, ownsDevice: false });
  const v2Created = createV2Runtime({ device, presentationOnly: true, ownsDevice: false });
  invariant(v1Created.status === "ready", `v1 runtime unavailable: ${v1Created.status}`);
  invariant(v2Created.status === "ready", `v2 runtime unavailable: ${v2Created.status}`);
  const v1 = v1Created.runtime;
  const v2 = v2Created.runtime;
  const sequences = { v1: 1, v2: 1 };

  const cases: VisualCaseResult[] = [];
  for (const definition of CASES) {
    const plan = buildPlan(definition);
    const centerline = definition.id === "dense-texture-field" ? [] : samplePath(definition);
    const v1Pixels = await renderHalfWords(device, v1, v1Surface, sequences.v1++, plan);
    const v2Pixels = await renderHalfWords(device, v2, v2Surface, sequences.v2++, plan);
    cases.push(Object.freeze({
      id: definition.id,
      label: definition.label,
      dabCount: plan.dabs.length,
      comparison: compareStudioWebGpuBrushRgba16F(v1Pixels, v2Pixels),
      v1Metrics: analyzeStudioWebGpuBrushRgba16F(v1Pixels, WIDTH, HEIGHT, centerline),
      v2Metrics: analyzeStudioWebGpuBrushRgba16F(v2Pixels, WIDTH, HEIGHT, centerline),
      thresholds: Object.freeze({
        minimumCenterlineCoverage: definition.minimumCenterlineCoverage,
        maximumCenterlineGap: definition.maximumCenterlineGap,
        minimumLargestComponentRatio: definition.minimumLargestComponentRatio,
      }),
      v1Png: toDataUrl(studioWebGpuRgba16FToRgba8(v1Pixels, WIDTH, HEIGHT)),
      v2Png: toDataUrl(studioWebGpuRgba16FToRgba8(v2Pixels, WIDTH, HEIGHT)),
      diffPng: toDataUrl(
        studioWebGpuRgba16FDiffToRgba8(v1Pixels, v2Pixels, WIDTH, HEIGHT),
      ),
    }));
  }

  const temporalDefinition = CASES.find((candidate) => candidate.id === "tight-s-curve")!;
  const temporal: TemporalCaseResult[] = [];
  let previousV1: Uint16Array | null = null;
  let previousV2: Uint16Array | null = null;
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const count = Math.max(1, Math.round(temporalDefinition.dabCount * fraction));
    const plan = buildPlan(temporalDefinition, count, 10 + temporal.length);
    const centerline = samplePath(temporalDefinition).slice(0, count);
    const v1Pixels = await renderHalfWords(device, v1, v1Surface, sequences.v1++, plan);
    const v2Pixels = await renderHalfWords(device, v2, v2Surface, sequences.v2++, plan);
    temporal.push(Object.freeze({
      fraction,
      dabCount: count,
      v1V2Comparison: compareStudioWebGpuBrushRgba16F(v1Pixels, v2Pixels),
      v1Growth: previousV1
        ? compareStudioWebGpuBrushAlphaMonotonicity(previousV1, v1Pixels)
        : null,
      v2Growth: previousV2
        ? compareStudioWebGpuBrushAlphaMonotonicity(previousV2, v2Pixels)
        : null,
      v1Metrics: analyzeStudioWebGpuBrushRgba16F(v1Pixels, WIDTH, HEIGHT, centerline),
      v2Metrics: analyzeStudioWebGpuBrushRgba16F(v2Pixels, WIDTH, HEIGHT, centerline),
    }));
    previousV1 = v1Pixels;
    previousV2 = v2Pixels;
  }

  const scalingDefinition = CASES.find(
    (candidate) => candidate.id === "dense-texture-field",
  )!;
  const cpuScaling = CPU_DAB_COUNTS.map((dabCount) => (
    benchmarkCpu(scalingDefinition, dabCount)
  ));
  const gpuColdScaling: ScalingResult[] = [];
  const gpuHotScaling: ScalingResult[] = [];
  for (const dabCount of GPU_DAB_COUNTS) {
    gpuColdScaling.push(await benchmarkGpu(
      "cold",
      scalingDefinition,
      dabCount,
      v1,
      v2,
      v1Surface,
      v2Surface,
      sequences,
    ));
    gpuHotScaling.push(await benchmarkGpu(
      "hot",
      scalingDefinition,
      dabCount,
      v1,
      v2,
      v1Surface,
      v2Surface,
      sequences,
    ));
  }

  await device.queue.onSubmittedWorkDone();
  const validationError = await device.popErrorScope();
  const outOfMemoryError = await device.popErrorScope();
  const scopedGpuErrors = [validationError, outOfMemoryError]
    .filter((error): error is GPUError => error !== null)
    .map((error) => error.message);
  const v2Stats = v2.stats();
  const representative = gpuColdScaling.find((candidate) => candidate.dabCount === 4_096)!;
  const baselineCase = cases.find((candidate) => candidate.id === "dense-texture-field")!;
  const electionReport = {
    kind: "studio-engine-webgpu-textured-brush-benchmark" as const,
    revision: 1 as const,
    dabCount: 4_096,
    warmupIterations: GPU_WARMUP,
    measuredIterations: GPU_COLD_ITERATIONS,
    v1: {
      id: "v1-general" as const,
      instanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
      verticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB,
      cpuPack: cpuScaling.find((candidate) => candidate.dabCount === 4_096)!.v1,
      execute: representative.v1,
      instanceUploads: null,
      instanceUploadBytes: null,
      reusedInstanceUploads: null,
    },
    v2: {
      id: "v2-compact" as const,
      instanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
      verticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
      cpuPack: cpuScaling.find((candidate) => candidate.dabCount === 4_096)!.v2,
      execute: representative.v2,
      instanceUploads: v2Stats.instanceUploads,
      instanceUploadBytes: v2Stats.instanceUploadBytes,
      reusedInstanceUploads: v2Stats.reusedInstanceUploads,
    },
    quality: {
      comparedHalfWords: baselineCase.comparison.comparedHalfWords,
      exactHalfWordMismatches: baselineCase.comparison.exactHalfWordMismatches,
      maximumAbsoluteHalfWordDelta: baselineCase.comparison.maximumAbsoluteHalfWordDelta,
      shaderCompilationAvailable: compilation !== null,
      shaderCompilationMessages: shaderCompilationMessages.length,
      scopedGpuErrors: scopedGpuErrors.length,
      uncapturedGpuErrors: uncapturedGpuErrors.length,
    },
  };
  const election = electStudioEngineWebGpuTexturedBrushRuntime(electionReport);
  const adapterInfo = adapter.info;
  const result: BrowserResult = Object.freeze({
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
    dimensions: Object.freeze({ width: WIDTH, height: HEIGHT }),
    constants: Object.freeze({
      v1InstanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
      v2InstanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
      v1VerticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB,
      v2VerticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
    }),
    cases: Object.freeze(cases),
    temporal: Object.freeze(temporal),
    cpuScaling: Object.freeze(cpuScaling),
    gpuColdScaling: Object.freeze(gpuColdScaling),
    gpuHotScaling: Object.freeze(gpuHotScaling),
    v2Stats,
    shaderCompilationAvailable: compilation !== null,
    shaderCompilationMessages: Object.freeze(shaderCompilationMessages),
    scopedGpuErrors: Object.freeze(scopedGpuErrors),
    uncapturedGpuErrors: Object.freeze(uncapturedGpuErrors),
    election,
  });
  v1Surface.dispose();
  v2Surface.dispose();
  v1.dispose();
  v2.dispose();
  device.destroy();
  return result;
}

void main().then(
  (result) => {
    window.__studioEngineWebGpuTexturedBrushV2QualityResult = result;
  },
  (error) => {
    window.__studioEngineWebGpuTexturedBrushV2QualityResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    };
  },
);
