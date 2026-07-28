import { studioHighBitSrgbToLinear } from "./studio-highbit-transfer";

import type {
  StudioGpuBatch,
  StudioGpuDab,
  StudioGpuDabRenderUpdate,
} from "./studio-webgpu-dab-plan-contract";

/**
 * Worker-owned brush execution kernel.
 *
 * This module deliberately has no Canvas2D, HTMLCanvasElement, Konva, document, or persistence
 * dependency. The caller owns canonical commands and may rebuild this disposable GPU state after
 * device loss from those commands.
 */

export const STUDIO_ENGINE_WEBGPU_BRUSH_RECEIPT_REVISION = 1;
export const STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT = "rgba16float" as const;
export const STUDIO_ENGINE_WEBGPU_BRUSH_COLOR_MODEL = "linear-premultiplied" as const;
export const STUDIO_ENGINE_WEBGPU_BRUSH_INPUT_COLOR_ENCODING = "scene-linear-straight" as const;
export const STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_FLOATS = 9;
export const STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_BYTES =
  STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const STUDIO_ENGINE_WEBGPU_BRUSH_DEFAULT_MAX_DABS = 65_536;
export const STUDIO_ENGINE_WEBGPU_BRUSH_DEFAULT_MAX_SURFACE_PIXELS = 16_777_216;

const GPU_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_RENDER_ATTACHMENT = 0x10;
const GPU_BUFFER_COPY_DST = 0x08;
const GPU_BUFFER_VERTEX = 0x20;
const DEFAULT_MAX_TEXTURE_DIMENSION = 8_192;

const BRUSH_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) nominal_radius_ratio: f32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) center: vec2f,
  @location(1) quad_radius: vec2f,
  @location(2) color: vec4f,
  @location(3) nominal_radius_ratio: f32,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  let corner = corners[vertex_index];
  var output: VertexOutput;
  output.position = vec4f(center + corner * quad_radius, 0.0, 1.0);
  output.local = corner;
  output.color = color;
  output.nominal_radius_ratio = nominal_radius_ratio;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let distance_from_center = length(input.local);
  let edge_width = max(fwidth(distance_from_center), 0.0005);
  let half_edge_width = edge_width * 0.5;
  let coverage = 1.0 - smoothstep(
    input.nominal_radius_ratio - half_edge_width,
    input.nominal_radius_ratio + half_edge_width,
    distance_from_center,
  );
  return input.color * coverage;
}
`;

const PRESENTATION_SHADER = /* wgsl */ `
@group(0) @binding(0) var linear_surface: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
};

fn linear_to_srgb_channel(value: f32) -> f32 {
  let safe = clamp(value, 0.0, 1.0);
  return select(
    1.055 * pow(safe, 1.0 / 2.4) - 0.055,
    12.92 * safe,
    safe <= 0.0031308,
  );
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  var output: VertexOutput;
  output.position = vec4f(positions[vertex_index], 0.0, 1.0);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let pixel = textureLoad(linear_surface, vec2i(input.position.xy), 0);
  let alpha = clamp(pixel.a, 0.0, 1.0);
  let straight_linear = select(
    vec3f(0.0),
    pixel.rgb / max(alpha, 0.000001),
    alpha > 0.0,
  );
  let encoded = vec3f(
    linear_to_srgb_channel(straight_linear.r),
    linear_to_srgb_channel(straight_linear.g),
    linear_to_srgb_channel(straight_linear.b),
  );
  return vec4f(encoded * alpha, alpha);
}
`;

export interface StudioEngineWebGpuBrushSurface {
  width: number;
  height: number;
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}

/**
 * Direct injection is useful for a worker device arbiter and fake-GPU tests. All three values must
 * be supplied together. The provider/device/context never appear in a receipt or other durable DTO.
 */
export interface StudioEngineWebGpuBrushDeviceBoundary {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvasFormat: GPUTextureFormat;
  /** A shared device arbiter normally leaves this false. Dedicated worker acquisition uses true. */
  readonly ownsDevice?: boolean;
}

export interface StudioEngineWebGpuBrushRuntimeOptions {
  readonly surface: StudioEngineWebGpuBrushSurface;
  /** `null` explicitly disables ambient Worker WebGPU acquisition. */
  readonly gpu?: GPU | null;
  readonly boundary?: StudioEngineWebGpuBrushDeviceBoundary | null;
  readonly initialResizeEpoch?: number;
  readonly maxDabs?: number;
  readonly maxSurfacePixels?: number;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export interface StudioEngineWebGpuBrushRasterRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Canonical brush-kernel input. RGB is straight (not premultiplied) scene-linear light in [0, 1].
 * This is intentionally distinct from legacy `StudioGpuDab`, whose RGB channels are encoded sRGB.
 */
export interface StudioEngineWebGpuBrushDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  readonly composite: "normal" | "erase";
}

export interface StudioEngineWebGpuBrushPlan {
  readonly mode: "append" | "rebuild";
  readonly dabs: readonly StudioEngineWebGpuBrushDab[];
  readonly batches: readonly StudioGpuBatch[];
  readonly complete: boolean;
}

export interface StudioEngineWebGpuBrushFrame {
  readonly requestSequence: number;
  readonly resizeEpoch: number;
  /** Logical document/tile rectangle mapped onto the complete physical RGBA16F target. */
  readonly rasterRect: StudioEngineWebGpuBrushRasterRect;
  readonly update: StudioEngineWebGpuBrushPlan;
}

export interface StudioEngineWebGpuBrushReceipt {
  readonly kind: "studio-engine-webgpu-brush-receipt";
  readonly revision: typeof STUDIO_ENGINE_WEBGPU_BRUSH_RECEIPT_REVISION;
  readonly backend: "webgpu";
  readonly requestSequence: number;
  readonly resizeEpoch: number;
  readonly deviceEpoch: number;
  readonly width: number;
  readonly height: number;
  readonly textureFormat: typeof STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT;
  readonly colorModel: typeof STUDIO_ENGINE_WEBGPU_BRUSH_COLOR_MODEL;
  readonly inputColorEncoding: typeof STUDIO_ENGINE_WEBGPU_BRUSH_INPUT_COLOR_ENCODING;
  readonly mode: "append" | "rebuild";
  readonly dabCount: number;
  readonly batchCount: number;
  readonly batchOrder: readonly ("normal" | "erase")[];
  readonly planFingerprint: string;
  readonly complete: true;
}

export type StudioEngineWebGpuBrushUnsupportedReason =
  | "adapter-unavailable"
  | "context-unavailable"
  | "device-unavailable"
  | "invalid-boundary"
  | "webgpu-unavailable";

export type StudioEngineWebGpuBrushCreationResult =
  | {
      readonly status: "ready";
      readonly runtime: StudioEngineWebGpuBrushRuntime;
    }
  | {
      readonly status: "unsupported";
      readonly reason: StudioEngineWebGpuBrushUnsupportedReason;
    }
  | {
      readonly status: "failed";
      readonly reason: "initialization-failed" | "invalid-configuration" | "invalid-surface";
    };

export type StudioEngineWebGpuBrushResizeResult =
  | {
      readonly status: "ready";
      readonly resizeEpoch: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "device-lost"
        | "disposed"
        | "invalid-resize"
        | "runtime-failed"
        | "stale-resize-epoch";
    };

export type StudioEngineWebGpuBrushExecutionRejection =
  | "append-without-base"
  | "busy"
  | "device-lost"
  | "disposed"
  | "incomplete-plan"
  | "invalid-plan"
  | "invalid-raster-rect"
  | "invalid-request-sequence"
  | "request-limit"
  | "resize-epoch-mismatch"
  | "runtime-failed"
  | "stale-request-sequence"
  | "submission-failed";

export type StudioEngineWebGpuBrushExecutionResult =
  | {
      readonly status: "presented";
      readonly receipt: StudioEngineWebGpuBrushReceipt;
    }
  | {
      readonly status: "rejected";
      readonly reason: StudioEngineWebGpuBrushExecutionRejection;
    };

export interface StudioEngineWebGpuBrushStats {
  readonly status: "ready" | "device-lost" | "failed" | "disposed";
  readonly deviceEpoch: number;
  readonly resizeEpoch: number;
  readonly lastPresentedRequestSequence: number;
  readonly width: number;
  readonly height: number;
  readonly surfaceBytes: number;
  readonly instanceCapacity: number;
  readonly instanceBufferAllocations: number;
  readonly surfaceTextureAllocations: number;
  readonly submissions: number;
}

interface RuntimeResources {
  readonly normalPipeline: GPURenderPipeline;
  readonly erasePipeline: GPURenderPipeline;
  readonly presentationPipeline: GPURenderPipeline;
  readonly presentationBindGroupLayout: GPUBindGroupLayout;
}

interface ValidPlan {
  readonly dabs: readonly StudioEngineWebGpuBrushDab[];
  readonly batches: readonly StudioGpuBatch[];
}

type StudioEngineWebGpuBrushFrameSnapshotResult =
  | {
      readonly status: "ready";
      readonly frame: StudioEngineWebGpuBrushFrame;
      readonly plan: ValidPlan;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "incomplete-plan"
        | "invalid-plan"
        | "invalid-raster-rect"
        | "request-limit";
    };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validRasterRect(rect: StudioEngineWebGpuBrushRasterRect): boolean {
  return finite(rect.x)
    && finite(rect.y)
    && finite(rect.width)
    && finite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function sameRasterRect(
  left: StudioEngineWebGpuBrushRasterRect | null,
  right: StudioEngineWebGpuBrushRasterRect,
): boolean {
  return left !== null
    && Object.is(left.x, right.x)
    && Object.is(left.y, right.y)
    && Object.is(left.width, right.width)
    && Object.is(left.height, right.height);
}

function validDab(dab: StudioEngineWebGpuBrushDab): boolean {
  return finite(dab.x)
    && finite(dab.y)
    && finite(dab.radius)
    && dab.radius >= 0
    && finite(dab.red)
    && dab.red >= 0
    && dab.red <= 1
    && finite(dab.green)
    && dab.green >= 0
    && dab.green <= 1
    && finite(dab.blue)
    && dab.blue >= 0
    && dab.blue <= 1
    && finite(dab.alpha)
    && dab.alpha >= 0
    && dab.alpha <= 1
    && (dab.composite === "normal" || dab.composite === "erase");
}

/**
 * Exact contiguous coverage is required. Reordering, merging, gaps, overlaps, and a batch whose
 * composite disagrees with one of its dabs are all rejected before any queue write or submission.
 */
export function validateStudioEngineWebGpuBrushPlan(
  update: StudioEngineWebGpuBrushPlan,
  maxDabs: number,
): ValidPlan | null {
  try {
    if (
      !update
      || (update.mode !== "append" && update.mode !== "rebuild")
      || !Array.isArray(update.dabs)
      || !Array.isArray(update.batches)
      || update.dabs.length > maxDabs
      || !update.dabs.every(validDab)
    ) {
      return null;
    }

    let nextInstance = 0;
    for (const batch of update.batches) {
      if (
        (batch.composite !== "normal" && batch.composite !== "erase")
        || !Number.isSafeInteger(batch.firstInstance)
        || !positiveSafeInteger(batch.instanceCount)
        || batch.firstInstance !== nextInstance
        || batch.firstInstance + batch.instanceCount > update.dabs.length
      ) {
        return null;
      }
      const end = batch.firstInstance + batch.instanceCount;
      for (let index = batch.firstInstance; index < end; index += 1) {
        if (update.dabs[index]?.composite !== batch.composite) return null;
      }
      nextInstance = end;
    }
    if (nextInstance !== update.dabs.length) return null;
    return { dabs: update.dabs, batches: update.batches };
  } catch {
    // Public validation is also used at Worker message boundaries. Hostile getters/proxies are
    // malformed input, not an exception that may escape the command actor.
    return null;
  }
}

function snapshotStudioEngineWebGpuBrushFrame(
  input: StudioEngineWebGpuBrushFrame,
  maxDabs: number,
): StudioEngineWebGpuBrushFrameSnapshotResult {
  try {
    const update = input.update;
    if (!update || !Array.isArray(update.dabs) || !Array.isArray(update.batches)) {
      return { status: "rejected", reason: "invalid-plan" };
    }
    if (!update.complete) return { status: "rejected", reason: "incomplete-plan" };
    if (update.dabs.length > maxDabs) {
      return { status: "rejected", reason: "request-limit" };
    }
    const rasterRect = {
      x: input.rasterRect.x,
      y: input.rasterRect.y,
      width: input.rasterRect.width,
      height: input.rasterRect.height,
    };
    if (!validRasterRect(rasterRect)) {
      return { status: "rejected", reason: "invalid-raster-rect" };
    }
    const dabs: StudioEngineWebGpuBrushDab[] = update.dabs.map((dab) => ({
      x: dab.x,
      y: dab.y,
      radius: dab.radius,
      red: dab.red,
      green: dab.green,
      blue: dab.blue,
      alpha: dab.alpha,
      composite: dab.composite,
    }));
    const batches: StudioGpuBatch[] = update.batches.map((batch) => ({
      composite: batch.composite,
      firstInstance: batch.firstInstance,
      instanceCount: batch.instanceCount,
    }));
    const safeUpdate: StudioEngineWebGpuBrushPlan = {
      mode: update.mode,
      dabs,
      batches,
      complete: update.complete,
    };
    const plan = validateStudioEngineWebGpuBrushPlan(safeUpdate, maxDabs);
    if (!plan) return { status: "rejected", reason: "invalid-plan" };
    return {
      status: "ready",
      frame: {
        requestSequence: input.requestSequence,
        resizeEpoch: input.resizeEpoch,
        rasterRect,
        update: safeUpdate,
      },
      plan,
    };
  } catch {
    return { status: "rejected", reason: "invalid-plan" };
  }
}

function nextCapacity(required: number, maximum: number): number {
  if (required <= 0) return 0;
  let capacity = Math.min(256, maximum);
  while (capacity < required && capacity < maximum) {
    capacity = Math.min(maximum, capacity * 2);
  }
  return capacity;
}

function surfaceByteLength(width: number, height: number): number {
  return width * height * 8;
}

function hashNumber(hash: number, value: number, view: DataView): number {
  view.setFloat64(0, value, true);
  let next = hash;
  for (let index = 0; index < Float64Array.BYTES_PER_ELEMENT; index += 1) {
    next ^= view.getUint8(index);
    next = Math.imul(next, 0x01000193);
  }
  return next >>> 0;
}

function hashString(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, 0x01000193);
  }
  return next >>> 0;
}

/** Pure, provider-free fingerprint suitable for the real-browser parity harness. */
export function fingerprintStudioEngineWebGpuBrushPlan(
  frame: StudioEngineWebGpuBrushFrame,
): string {
  // One 8-byte workspace per fingerprint, regardless of dab count. This path is included in every
  // receipt and must not create seven tiny allocations per dab in long-stroke workloads.
  const numberView = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
  let hash = 0x811c9dc5;
  hash = hashNumber(hash, frame.requestSequence, numberView);
  hash = hashNumber(hash, frame.resizeEpoch, numberView);
  hash = hashString(hash, frame.update.mode);
  for (const value of [
    frame.rasterRect.x,
    frame.rasterRect.y,
    frame.rasterRect.width,
    frame.rasterRect.height,
  ]) {
    hash = hashNumber(hash, value, numberView);
  }
  for (const dab of frame.update.dabs) {
    for (const value of [
      dab.x,
      dab.y,
      dab.radius,
      dab.red,
      dab.green,
      dab.blue,
      dab.alpha,
    ]) {
      hash = hashNumber(hash, value, numberView);
    }
    hash = hashString(hash, dab.composite);
  }
  for (const batch of frame.update.batches) {
    hash = hashString(hash, batch.composite);
    hash = hashNumber(hash, batch.firstInstance, numberView);
    hash = hashNumber(hash, batch.instanceCount, numberView);
  }
  return `${frame.update.dabs.length}:${frame.update.batches.length}:${hash
    .toString(16)
    .padStart(8, "0")}`;
}

/**
 * Packs renderer-neutral sRGB dabs into premultiplied linear-light RGBA16F render instances.
 * The returned view is valid only until the caller reuses the same scratch array.
 */
export function packStudioEngineWebGpuBrushDabs(
  dabs: readonly StudioEngineWebGpuBrushDab[],
  rasterRect: StudioEngineWebGpuBrushRasterRect,
  physicalWidth: number,
  physicalHeight: number,
  scratch?: Float32Array,
): Float32Array {
  const required = dabs.length * STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_FLOATS;
  const packed = scratch && scratch.length >= required
    ? scratch.subarray(0, required)
    : new Float32Array(required);
  const logicalPixel = Math.max(
    rasterRect.width / physicalWidth,
    rasterRect.height / physicalHeight,
  );

  for (let index = 0; index < dabs.length; index += 1) {
    const dab = dabs[index]!;
    const offset = index * STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_FLOATS;
    const quadRadius = dab.radius > 0 ? dab.radius + logicalPixel : 0;
    packed[offset] = ((dab.x - rasterRect.x) / rasterRect.width) * 2 - 1;
    packed[offset + 1] = 1 - ((dab.y - rasterRect.y) / rasterRect.height) * 2;
    packed[offset + 2] = (quadRadius / rasterRect.width) * 2;
    packed[offset + 3] = (quadRadius / rasterRect.height) * 2;
    packed[offset + 4] = dab.red * dab.alpha;
    packed[offset + 5] = dab.green * dab.alpha;
    packed[offset + 6] = dab.blue * dab.alpha;
    packed[offset + 7] = dab.alpha;
    packed[offset + 8] = quadRadius > 0 ? dab.radius / quadRadius : 0;
  }
  return packed;
}

/**
 * Explicit migration adapter for the old renderer-neutral dab contract. Legacy RGB is encoded
 * sRGB, so it is decoded exactly once here. Canonical scene-linear plans must never pass through
 * this function.
 */
export function convertLegacyStudioGpuDabPlanToLinear(
  legacy: StudioGpuDabRenderUpdate,
): StudioEngineWebGpuBrushPlan {
  return {
    mode: legacy.mode,
    dabs: legacy.dabs.map((dab: StudioGpuDab): StudioEngineWebGpuBrushDab => ({
      x: dab.x,
      y: dab.y,
      radius: dab.radius,
      red: studioHighBitSrgbToLinear(dab.red),
      green: studioHighBitSrgbToLinear(dab.green),
      blue: studioHighBitSrgbToLinear(dab.blue),
      alpha: dab.alpha,
      composite: dab.composite,
    })),
    batches: legacy.batches.map((batch) => ({ ...batch })),
    complete: legacy.complete,
  };
}

function safeDestroyBuffer(buffer: GPUBuffer | null): void {
  if (!buffer) return;
  try {
    buffer.destroy();
  } catch {
    // A lost device has already retired the resource.
  }
}

function safeDestroyTexture(texture: GPUTexture | null): void {
  if (!texture) return;
  try {
    texture.destroy();
  } catch {
    // A lost device has already retired the resource.
  }
}

function safeDestroyDevice(device: GPUDevice, owned: boolean): void {
  if (!owned) return;
  try {
    device.destroy();
  } catch {
    // Best-effort release for a dedicated device.
  }
}

function safeUnconfigure(context: GPUCanvasContext): void {
  try {
    context.unconfigure();
  } catch {
    // Detached OffscreenCanvas and lost-device implementations may already be unconfigured.
  }
}

function createResources(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
): RuntimeResources {
  const brushModule = device.createShaderModule({
    label: "Studio Engine Worker analytic dab shader",
    code: BRUSH_SHADER,
  });
  const vertex: GPUVertexState = {
    module: brushModule,
    entryPoint: "vs_main",
    buffers: [{
      arrayStride: STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_BYTES,
      stepMode: "instance",
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x2" },
        { shaderLocation: 1, offset: 8, format: "float32x2" },
        { shaderLocation: 2, offset: 16, format: "float32x4" },
        { shaderLocation: 3, offset: 32, format: "float32" },
      ],
    }],
  };
  const normalPipeline = device.createRenderPipeline({
    label: "Studio Engine Worker normal analytic dab pipeline",
    layout: "auto",
    vertex,
    fragment: {
      module: brushModule,
      entryPoint: "fs_main",
      targets: [{
        format: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
        blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });
  const erasePipeline = device.createRenderPipeline({
    label: "Studio Engine Worker erase analytic dab pipeline",
    layout: "auto",
    vertex,
    fragment: {
      module: brushModule,
      entryPoint: "fs_main",
      targets: [{
        format: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
        blend: {
          color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-list" },
  });
  const presentationBindGroupLayout = device.createBindGroupLayout({
    label: "Studio Engine Worker brush presentation bindings",
    entries: [{
      binding: 0,
      visibility: 0x02,
      texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
    }],
  });
  const presentationModule = device.createShaderModule({
    label: "Studio Engine Worker linear presentation shader",
    code: PRESENTATION_SHADER,
  });
  const presentationPipeline = device.createRenderPipeline({
    label: "Studio Engine Worker brush presentation pipeline",
    layout: device.createPipelineLayout({
      label: "Studio Engine Worker brush presentation layout",
      bindGroupLayouts: [presentationBindGroupLayout],
    }),
    vertex: { module: presentationModule, entryPoint: "vs_main" },
    fragment: {
      module: presentationModule,
      entryPoint: "fs_main",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list" },
  });
  return {
    normalPipeline,
    erasePipeline,
    presentationPipeline,
    presentationBindGroupLayout,
  };
}

function ambientGpu(explicit: GPU | null | undefined, supplied: boolean): GPU | null {
  if (supplied) return explicit ?? null;
  if (typeof navigator === "undefined") return null;
  return navigator.gpu ?? null;
}

export async function createStudioEngineWebGpuBrushRuntime(
  options: StudioEngineWebGpuBrushRuntimeOptions,
): Promise<StudioEngineWebGpuBrushCreationResult> {
  const maxDabs = options.maxDabs ?? STUDIO_ENGINE_WEBGPU_BRUSH_DEFAULT_MAX_DABS;
  const maxSurfacePixels =
    options.maxSurfacePixels ?? STUDIO_ENGINE_WEBGPU_BRUSH_DEFAULT_MAX_SURFACE_PIXELS;
  if (!positiveSafeInteger(maxDabs) || !positiveSafeInteger(maxSurfacePixels)) {
    return { status: "failed", reason: "invalid-configuration" };
  }

  let device: GPUDevice;
  let context: GPUCanvasContext;
  let canvasFormat: GPUTextureFormat;
  let ownsDevice: boolean;
  if (options.boundary !== undefined) {
    if (!options.boundary) return { status: "unsupported", reason: "invalid-boundary" };
    device = options.boundary.device;
    context = options.boundary.context;
    canvasFormat = options.boundary.canvasFormat;
    ownsDevice = options.boundary.ownsDevice === true;
    if (!device || !context || !canvasFormat) {
      return { status: "unsupported", reason: "invalid-boundary" };
    }
  } else {
    const gpu = ambientGpu(
      options.gpu,
      Object.prototype.hasOwnProperty.call(options, "gpu"),
    );
    if (!gpu) return { status: "unsupported", reason: "webgpu-unavailable" };
    let adapter: GPUAdapter | null;
    try {
      adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    } catch {
      return { status: "unsupported", reason: "adapter-unavailable" };
    }
    if (!adapter) return { status: "unsupported", reason: "adapter-unavailable" };
    try {
      device = await adapter.requestDevice();
    } catch {
      return { status: "unsupported", reason: "device-unavailable" };
    }
    const acquiredContext = options.surface.getContext("webgpu");
    if (!acquiredContext) {
      safeDestroyDevice(device, true);
      return { status: "unsupported", reason: "context-unavailable" };
    }
    context = acquiredContext;
    canvasFormat = gpu.getPreferredCanvasFormat();
    ownsDevice = true;
  }

  try {
    const resources = createResources(device, canvasFormat);
    const runtime = new StudioEngineWebGpuBrushRuntime({
      surface: options.surface,
      device,
      context,
      canvasFormat,
      ownsDevice,
      resources,
      maxDabs,
      maxSurfacePixels,
      onDeviceLost: options.onDeviceLost,
    });
    const initialResize = runtime.resize({
      width: options.surface.width,
      height: options.surface.height,
      resizeEpoch: options.initialResizeEpoch ?? 1,
    });
    if (initialResize.status !== "ready") {
      runtime.dispose();
      return { status: "failed", reason: "invalid-surface" };
    }
    return { status: "ready", runtime };
  } catch {
    safeUnconfigure(context);
    safeDestroyDevice(device, ownsDevice);
    return { status: "failed", reason: "initialization-failed" };
  }
}

interface RuntimeConstructorOptions {
  readonly surface: StudioEngineWebGpuBrushSurface;
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvasFormat: GPUTextureFormat;
  readonly ownsDevice: boolean;
  readonly resources: RuntimeResources;
  readonly maxDabs: number;
  readonly maxSurfacePixels: number;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export class StudioEngineWebGpuBrushRuntime {
  private readonly surface: StudioEngineWebGpuBrushSurface;
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly canvasFormat: GPUTextureFormat;
  private readonly ownsDevice: boolean;
  private readonly resources: RuntimeResources;
  private readonly maxDabs: number;
  private readonly maxSurfacePixels: number;
  private readonly onDeviceLost: ((info: GPUDeviceLostInfo) => void) | undefined;

  private status: StudioEngineWebGpuBrushStats["status"] = "ready";
  private targetTexture: GPUTexture | null = null;
  private presentationBindGroup: GPUBindGroup | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private staging: Float32Array | null = null;
  private resizeEpoch = 0;
  private deviceEpoch = 1;
  private width = 0;
  private height = 0;
  private instanceCapacity = 0;
  private instanceBufferAllocations = 0;
  private surfaceTextureAllocations = 0;
  private submissions = 0;
  private lastPresentedRequestSequence = 0;
  private retainedRasterRect: StudioEngineWebGpuBrushRasterRect | null = null;
  private hasRetainedBase = false;
  private busy = false;

  public constructor(options: RuntimeConstructorOptions) {
    this.surface = options.surface;
    this.device = options.device;
    this.context = options.context;
    this.canvasFormat = options.canvasFormat;
    this.ownsDevice = options.ownsDevice;
    this.resources = options.resources;
    this.maxDabs = options.maxDabs;
    this.maxSurfacePixels = options.maxSurfacePixels;
    this.onDeviceLost = options.onDeviceLost;
    void this.device.lost.then((info) => this.handleDeviceLost(info));
  }

  public stats(): StudioEngineWebGpuBrushStats {
    return Object.freeze({
      status: this.status,
      deviceEpoch: this.deviceEpoch,
      resizeEpoch: this.resizeEpoch,
      lastPresentedRequestSequence: this.lastPresentedRequestSequence,
      width: this.width,
      height: this.height,
      surfaceBytes: surfaceByteLength(this.width, this.height),
      instanceCapacity: this.instanceCapacity,
      instanceBufferAllocations: this.instanceBufferAllocations,
      surfaceTextureAllocations: this.surfaceTextureAllocations,
      submissions: this.submissions,
    });
  }

  public resize(input: {
    readonly width: number;
    readonly height: number;
    readonly resizeEpoch: number;
  }): StudioEngineWebGpuBrushResizeResult {
    if (this.status === "disposed") return { status: "rejected", reason: "disposed" };
    if (this.status === "device-lost") return { status: "rejected", reason: "device-lost" };
    if (this.status !== "ready") return { status: "rejected", reason: "runtime-failed" };
    if (
      !positiveSafeInteger(input.width)
      || !positiveSafeInteger(input.height)
      || !positiveSafeInteger(input.resizeEpoch)
      || input.width * input.height > this.maxSurfacePixels
      || input.width > Number(
        this.device.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION,
      )
      || input.height > Number(
        this.device.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION,
      )
    ) {
      return { status: "rejected", reason: "invalid-resize" };
    }
    if (input.resizeEpoch <= this.resizeEpoch) {
      return { status: "rejected", reason: "stale-resize-epoch" };
    }

    let replacement: GPUTexture | null = null;
    try {
      replacement = this.device.createTexture({
        label: `Studio Engine Worker RGBA16F brush surface epoch ${input.resizeEpoch}`,
        size: {
          width: input.width,
          height: input.height,
          depthOrArrayLayers: 1,
        },
        format: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
        usage: GPU_TEXTURE_RENDER_ATTACHMENT | GPU_TEXTURE_BINDING,
      });
      const replacementBindGroup = this.device.createBindGroup({
        label: `Studio Engine Worker brush presentation bindings epoch ${input.resizeEpoch}`,
        layout: this.resources.presentationBindGroupLayout,
        entries: [{ binding: 0, resource: replacement.createView() }],
      });
      this.surface.width = input.width;
      this.surface.height = input.height;
      this.context.configure({
        device: this.device,
        format: this.canvasFormat,
        alphaMode: "premultiplied",
        colorSpace: "srgb",
        usage: GPU_TEXTURE_RENDER_ATTACHMENT,
      });
      safeDestroyTexture(this.targetTexture);
      this.targetTexture = replacement;
      replacement = null;
      this.presentationBindGroup = replacementBindGroup;
      this.width = input.width;
      this.height = input.height;
      this.resizeEpoch = input.resizeEpoch;
      this.surfaceTextureAllocations += 1;
      this.hasRetainedBase = false;
      this.retainedRasterRect = null;
      return {
        status: "ready",
        resizeEpoch: this.resizeEpoch,
        width: this.width,
        height: this.height,
      };
    } catch {
      safeDestroyTexture(replacement);
      this.failClosed();
      return { status: "rejected", reason: "runtime-failed" };
    }
  }

  public execute(
    input: StudioEngineWebGpuBrushFrame,
  ): Promise<StudioEngineWebGpuBrushExecutionResult> {
    if (this.status === "disposed") {
      return Promise.resolve({ status: "rejected", reason: "disposed" });
    }
    if (this.status === "device-lost") {
      return Promise.resolve({ status: "rejected", reason: "device-lost" });
    }
    if (this.status !== "ready") {
      return Promise.resolve({ status: "rejected", reason: "runtime-failed" });
    }
    if (this.busy) return Promise.resolve({ status: "rejected", reason: "busy" });
    const snapshot = snapshotStudioEngineWebGpuBrushFrame(input, this.maxDabs);
    if (snapshot.status === "rejected") return Promise.resolve(snapshot);
    return this.executeSnapshot(snapshot.frame, snapshot.plan);
  }

  private async executeSnapshot(
    frame: StudioEngineWebGpuBrushFrame,
    plan: ValidPlan,
  ): Promise<StudioEngineWebGpuBrushExecutionResult> {
    if (!positiveSafeInteger(frame.requestSequence)) {
      return { status: "rejected", reason: "invalid-request-sequence" };
    }
    if (frame.requestSequence <= this.lastPresentedRequestSequence) {
      return { status: "rejected", reason: "stale-request-sequence" };
    }
    if (frame.resizeEpoch !== this.resizeEpoch) {
      return { status: "rejected", reason: "resize-epoch-mismatch" };
    }
    if (
      frame.update.mode === "append"
      && (!this.hasRetainedBase || !sameRasterRect(this.retainedRasterRect, frame.rasterRect))
    ) {
      return { status: "rejected", reason: "append-without-base" };
    }
    if (!this.targetTexture || !this.presentationBindGroup) {
      this.failClosed();
      return { status: "rejected", reason: "runtime-failed" };
    }

    this.busy = true;
    try {
      const instanceBuffer = this.ensureInstanceBuffer(plan.dabs.length);
      if (plan.dabs.length > 0 && !instanceBuffer) {
        throw new Error("WebGPU brush instance allocation failed");
      }
      const packed = packStudioEngineWebGpuBrushDabs(
        plan.dabs,
        frame.rasterRect,
        this.width,
        this.height,
        this.staging ?? undefined,
      );
      if (!this.staging || packed.buffer !== this.staging.buffer) {
        this.staging = new Float32Array(packed.buffer);
      }
      if (instanceBuffer && packed.byteLength > 0) {
        this.device.queue.writeBuffer(
          instanceBuffer,
          0,
          packed.buffer,
          packed.byteOffset,
          packed.byteLength,
        );
      }

      const encoder = this.device.createCommandEncoder({
        label: `Studio Engine Worker brush request ${frame.requestSequence}`,
      });
      const brushPass = encoder.beginRenderPass({
        label: `Studio Engine Worker RGBA16F brush request ${frame.requestSequence}`,
        colorAttachments: [{
          view: this.targetTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: frame.update.mode === "rebuild" ? "clear" : "load",
          storeOp: "store",
        }],
      });
      if (instanceBuffer) {
        brushPass.setVertexBuffer(0, instanceBuffer);
        for (const batch of plan.batches) {
          brushPass.setPipeline(
            batch.composite === "erase"
              ? this.resources.erasePipeline
              : this.resources.normalPipeline,
          );
          brushPass.draw(6, batch.instanceCount, 0, batch.firstInstance);
        }
      }
      brushPass.end();

      const presentationPass = encoder.beginRenderPass({
        label: `Studio Engine Worker brush presentation ${frame.requestSequence}`,
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      presentationPass.setPipeline(this.resources.presentationPipeline);
      presentationPass.setBindGroup(0, this.presentationBindGroup);
      presentationPass.draw(3, 1, 0, 0);
      presentationPass.end();

      this.device.queue.submit([encoder.finish()]);
      this.submissions += 1;
      if (typeof this.device.queue.onSubmittedWorkDone === "function") {
        await this.device.queue.onSubmittedWorkDone();
      }
      // The loss/dispose callbacks may run while the fence is pending. Read through the public
      // snapshot so TypeScript does not preserve the pre-await property narrowing.
      const settledStatus = this.stats().status;
      if (settledStatus === "disposed") return { status: "rejected", reason: "disposed" };
      if (settledStatus === "device-lost") {
        return { status: "rejected", reason: "device-lost" };
      }
      if (settledStatus !== "ready") {
        return { status: "rejected", reason: "submission-failed" };
      }

      this.hasRetainedBase = true;
      this.retainedRasterRect = Object.freeze({ ...frame.rasterRect });
      this.lastPresentedRequestSequence = frame.requestSequence;
      const receipt: StudioEngineWebGpuBrushReceipt = Object.freeze({
        kind: "studio-engine-webgpu-brush-receipt",
        revision: STUDIO_ENGINE_WEBGPU_BRUSH_RECEIPT_REVISION,
        backend: "webgpu",
        requestSequence: frame.requestSequence,
        resizeEpoch: this.resizeEpoch,
        deviceEpoch: this.deviceEpoch,
        width: this.width,
        height: this.height,
        textureFormat: STUDIO_ENGINE_WEBGPU_BRUSH_TEXTURE_FORMAT,
        colorModel: STUDIO_ENGINE_WEBGPU_BRUSH_COLOR_MODEL,
        inputColorEncoding: STUDIO_ENGINE_WEBGPU_BRUSH_INPUT_COLOR_ENCODING,
        mode: frame.update.mode,
        dabCount: plan.dabs.length,
        batchCount: plan.batches.length,
        batchOrder: Object.freeze(plan.batches.map((batch) => batch.composite)),
        planFingerprint: fingerprintStudioEngineWebGpuBrushPlan(frame),
        complete: true,
      });
      return { status: "presented", receipt };
    } catch {
      this.failClosed();
      return { status: "rejected", reason: "submission-failed" };
    } finally {
      this.busy = false;
    }
  }

  public dispose(): void {
    if (this.status === "disposed") return;
    this.status = "disposed";
    this.releaseResources();
    safeUnconfigure(this.context);
    safeDestroyDevice(this.device, this.ownsDevice);
  }

  private ensureInstanceBuffer(required: number): GPUBuffer | null {
    if (required === 0) return null;
    if (this.instanceBuffer && this.instanceCapacity >= required) return this.instanceBuffer;
    const capacity = nextCapacity(required, this.maxDabs);
    const replacement = this.device.createBuffer({
      label: `Studio Engine Worker brush instances ${capacity}`,
      size: capacity * STUDIO_ENGINE_WEBGPU_BRUSH_INSTANCE_BYTES,
      usage: GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST,
    });
    safeDestroyBuffer(this.instanceBuffer);
    this.instanceBuffer = replacement;
    this.instanceCapacity = capacity;
    this.instanceBufferAllocations += 1;
    return replacement;
  }

  private handleDeviceLost(info: GPUDeviceLostInfo): void {
    if (this.status === "disposed" || this.status === "device-lost") return;
    this.status = "device-lost";
    if (this.deviceEpoch < Number.MAX_SAFE_INTEGER) this.deviceEpoch += 1;
    this.releaseResources();
    safeUnconfigure(this.context);
    this.onDeviceLost?.(info);
  }

  private failClosed(): void {
    if (this.status !== "ready") return;
    this.status = "failed";
    this.releaseResources();
    safeUnconfigure(this.context);
  }

  private releaseResources(): void {
    safeDestroyBuffer(this.instanceBuffer);
    safeDestroyTexture(this.targetTexture);
    this.instanceBuffer = null;
    this.targetTexture = null;
    this.presentationBindGroup = null;
    this.staging = null;
    this.instanceCapacity = 0;
    this.hasRetainedBase = false;
    this.retainedRasterRect = null;
  }
}
