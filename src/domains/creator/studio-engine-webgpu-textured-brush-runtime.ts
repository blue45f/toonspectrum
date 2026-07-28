import {
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_DUAL_TIP_CAPABILITY,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PLAN_VERSION,
} from "./studio-engine-webgpu-textured-brush-plan";
import { sha256HexPortable } from "./studio-sha256";

import type {
  StudioEngineWebGpuTexturedBrushBatch,
  StudioEngineWebGpuTexturedBrushPlan,
  StudioEngineWebGpuTexturedBrushResolvedAsset,
} from "./studio-engine-webgpu-textured-brush-plan";

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_RUNTIME_REVISION = 1 as const;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT = "rgba16float" as const;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS = 28;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES =
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

const GPU_TEXTURE_COPY_DST = 0x02;
const GPU_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_COPY_SRC = 0x01;
const GPU_TEXTURE_RENDER_ATTACHMENT = 0x10;
const GPU_BUFFER_COPY_DST = 0x08;
const GPU_BUFFER_VERTEX = 0x20;
const GPU_BUFFER_UNIFORM = 0x40;
const ROW_ALIGNMENT = 256;

/**
 * R8 sampling semantics mirror the CPU oracle:
 * - tip assets are uploaded with a one-texel zero border and bilinear filtered;
 * - grain assets repeat bilinearly;
 * - procedural grain hashes signed integer cells with u32 arithmetic;
 * - straight scene-linear colour is premultiplied by the CPU packer exactly once.
 */
const TEXTURED_BRUSH_SHADER = /* wgsl */ `
struct Viewport {
  size: vec2f,
  inverse_size: vec2f,
};
@group(0) @binding(0) var tip_texture: texture_2d<f32>;
@group(0) @binding(1) var grain_texture: texture_2d<f32>;
@group(0) @binding(2) var tip_sampler: sampler;
@group(0) @binding(3) var grain_sampler: sampler;
@group(0) @binding(4) var<uniform> viewport: Viewport;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) document: vec2f,
  @location(2) color: vec4f,
  @location(3) dynamics: vec4f,
  @location(4) grain_origin: vec2f,
  @location(5) flags: vec4f,
  @location(6) texture_info: vec4f,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) center: vec2f,
  @location(1) basis_x: vec2f,
  @location(2) basis_y: vec2f,
  @location(3) color: vec4f,
  @location(4) dynamics: vec4f,
  @location(5) grain_origin: vec2f,
  @location(6) diagnostics: vec4f,
  @location(7) flags: vec4f,
  @location(8) texture_info: vec4f,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  let local = corners[vertex_index];
  let document = center + basis_x * local.x + basis_y * local.y;
  let clip = vec2f(
    document.x * viewport.inverse_size.x * 2.0 - 1.0,
    1.0 - document.y * viewport.inverse_size.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  output.local = local;
  output.document = document;
  output.color = color;
  output.dynamics = dynamics;
  output.grain_origin = grain_origin;
  output.flags = flags;
  output.texture_info = texture_info;
  return output;
}

fn hash_u32(input: u32) -> u32 {
  var value = input;
  value = value ^ (value >> 16u);
  value = value * 0x7feb352du;
  value = value ^ (value >> 15u);
  value = value * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn integer_noise(cell: vec2i, seed: u32) -> f32 {
  let mixed = seed
    ^ (bitcast<u32>(cell.x) * 0x9e3779b1u)
    ^ (bitcast<u32>(cell.y) * 0x85ebca77u);
  return f32(hash_u32(mixed)) / 4294967296.0;
}

fn shaped_grain(value: f32, contrast: f32, invert: bool) -> f32 {
  let contrasted = clamp(0.5 + (value - 0.5) * (1.0 + contrast * 3.0), 0.0, 1.0);
  return select(contrasted, 1.0 - contrasted, invert);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.local * 0.5 + 0.5;
  let tip_size = input.texture_info.xy;
  let padded_size = tip_size + vec2f(2.0);
  let padded_uv = (uv * tip_size + vec2f(1.0)) / padded_size;
  let tip_value = textureSample(tip_texture, tip_sampler, padded_uv).r;
  let hardness_edge = max(1.0 / 65535.0, 1.0 - input.dynamics.x);
  let tip_coverage = smoothstep(0.0, hardness_edge, tip_value);

  let grain_kind = u32(input.flags.x + 0.5);
  let packed_grain_flags = u32(input.flags.y + 0.5);
  let grain_space = packed_grain_flags & 1u;
  let seed = u32(input.flags.z + 0.5) | (u32(input.flags.w + 0.5) << 16u);
  let grain_position = select(
    input.document,
    input.document - input.grain_origin,
    grain_space == 1u,
  );
  let grain_invert = (packed_grain_flags & 2u) != 0u;
  let grain_cell = vec2i(floor(grain_position / input.dynamics.z));
  let procedural_grain = integer_noise(grain_cell, seed);
  let asset_grain = textureSample(
    grain_texture,
    grain_sampler,
    grain_position / input.dynamics.z,
  ).r;
  var grain_value = select(1.0, procedural_grain, grain_kind == 1u);
  grain_value = select(grain_value, asset_grain, grain_kind == 2u);
  let grain_shaped = shaped_grain(grain_value, input.dynamics.w, grain_invert);
  let grain_factor = mix(1.0, grain_shaped, input.dynamics.y);
  return input.color * (tip_coverage * grain_factor);
}
`;

export interface StudioEngineWebGpuTexturedBrushRuntimeOptions {
  readonly device: GPUDevice;
  readonly width: number;
  readonly height: number;
  readonly initialDeviceEpoch?: number;
  readonly maximumDabs?: number;
  readonly maximumInFlightSubmissions?: number;
  readonly maximumResidentAssetBytes?: number;
  readonly ownsDevice?: boolean;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export interface StudioEngineWebGpuTexturedBrushFrame {
  readonly requestSequence: number;
  readonly deviceEpoch: number;
  readonly plan: StudioEngineWebGpuTexturedBrushPlan;
}

export interface StudioEngineWebGpuTexturedBrushReceipt {
  readonly kind: "studio-engine-webgpu-textured-brush-receipt";
  readonly revision: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_RUNTIME_REVISION;
  readonly backend: "webgpu";
  readonly textureFormat: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT;
  readonly colorModel: "scene-linear-premultiplied";
  readonly requestSequence: number;
  readonly deviceEpoch: number;
  readonly mode: "append" | "rebuild";
  readonly strokeId: string;
  readonly commandSequence: number;
  readonly dabCount: number;
  readonly batchCount: number;
  readonly assetCount: number;
  readonly assetBytes: number;
  readonly batchKeys: readonly string[];
  readonly queueState: "completed";
  readonly complete: true;
}

export type StudioEngineWebGpuTexturedBrushExecutionResult =
  | Readonly<{ status: "completed"; receipt: StudioEngineWebGpuTexturedBrushReceipt }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid-frame"
        | "request-sequence"
        | "device-epoch"
        | "request-limit"
        | "resident-asset-budget";
    }>
  | Readonly<{ status: "busy"; inFlight: number; maximum: number }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "device-lost"; deviceEpoch: number }>
  | Readonly<{ status: "disposed" }>
  | Readonly<{ status: "failed"; reason: "gpu-error" }>;

export type StudioEngineWebGpuTexturedBrushRuntimeCreationResult =
  | Readonly<{ status: "ready"; runtime: StudioEngineWebGpuTexturedBrushRuntime }>
  | Readonly<{ status: "rejected"; reason: "invalid-options" | "initialization-failed" }>;

interface AssetTexture {
  readonly key: string;
  readonly role: "tip" | "grain" | "dummy-grain";
  readonly byteLength: number;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nextAligned(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function assetTextureIdentity(
  asset: StudioEngineWebGpuTexturedBrushResolvedAsset,
  role: "tip" | "grain",
): string {
  return [
    role,
    asset.contentHash,
    `${asset.width}x${asset.height}`,
    asset.channel,
    asset.format,
  ].join(":");
}

function paddedUpload(
  asset: StudioEngineWebGpuTexturedBrushResolvedAsset,
  zeroBorder: boolean,
): Readonly<{
  bytes: Uint8Array;
  bytesPerRow: number;
  width: number;
  height: number;
}> {
  const width = asset.width + (zeroBorder ? 2 : 0);
  const height = asset.height + (zeroBorder ? 2 : 0);
  const bytesPerRow = nextAligned(width, ROW_ALIGNMENT);
  const bytes = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < asset.height; y += 1) {
    const targetY = y + (zeroBorder ? 1 : 0);
    const targetX = zeroBorder ? 1 : 0;
    bytes.set(
      asset.bytes.subarray(y * asset.width, (y + 1) * asset.width),
      targetY * bytesPerRow + targetX,
    );
  }
  return { bytes, bytesPerRow, width, height };
}

function planIsValid(plan: StudioEngineWebGpuTexturedBrushPlan, maximumDabs: number): boolean {
  try {
    if (
      plan.kind !== "studio-engine-webgpu-textured-brush-plan"
      || plan.version !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PLAN_VERSION
      || (plan.mode !== "append" && plan.mode !== "rebuild")
      || plan.dualTip !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_DUAL_TIP_CAPABILITY
      || plan.textureFormat !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT
      || plan.colorModel !== "scene-linear-premultiplied"
      || !Array.isArray(plan.assets)
      || plan.assets.length < 1
      || plan.assets.length > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssets
      || !Array.isArray(plan.dabs)
      || plan.dabs.length > maximumDabs
      || !Array.isArray(plan.batches)
      || plan.tip.assetIndex !== 0
    ) return false;
    for (let index = 0; index < plan.assets.length; index += 1) {
      const asset = plan.assets[index]!;
      if (
        asset.assetIndex !== index
        || !positiveSafeInteger(asset.width)
        || !positiveSafeInteger(asset.height)
        || asset.byteLength !== asset.width * asset.height
        || asset.bytes.byteLength !== asset.byteLength
        || asset.format !== "r8-unorm"
        || asset.contentHash !== `sha256:${sha256HexPortable(asset.bytes)}`
      ) return false;
    }
    for (let index = 0; index < plan.dabs.length; index += 1) {
      const dab = plan.dabs[index]!;
      if (
        dab.index !== index
        || ![
          dab.stationX,
          dab.stationY,
          dab.x,
          dab.y,
          dab.pressure,
          dab.diameter,
          dab.opacity,
          dab.flow,
          dab.grainDepth,
          ...dab.color.components,
          dab.tip.hardness,
          dab.tip.roundness,
          dab.tip.angleRadians,
          ...dab.tip.localToDocument,
        ].every(finite)
        || dab.diameter <= 0
        || dab.color.space !== "linear-srgb"
        || dab.color.alphaMode !== "straight"
        || dab.composite.blendMode !== "normal"
      ) return false;
    }
    let nextInstance = 0;
    for (const batch of plan.batches) {
      if (
        typeof batch.key !== "string"
        || batch.key.length === 0
        || batch.firstInstance !== nextInstance
        || !positiveSafeInteger(batch.instanceCount)
        || batch.firstInstance + batch.instanceCount > plan.dabs.length
        || !plan.assets[batch.tipAssetIndex]
        || (
          batch.grainAssetIndex !== null
          && !plan.assets[batch.grainAssetIndex]
        )
      ) return false;
      nextInstance += batch.instanceCount;
    }
    return nextInstance === plan.dabs.length;
  } catch {
    return false;
  }
}

/**
 * Packs scene-linear premultiplied colour and all textured/grain parameters into the single
 * interleaved vertex stream consumed by the WGSL shader.
 */
export function packStudioEngineWebGpuTexturedBrushDabs(
  plan: StudioEngineWebGpuTexturedBrushPlan,
  scratch?: Float32Array,
): Float32Array {
  const required = plan.dabs.length * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS;
  const packed = scratch && scratch.length >= required
    ? scratch.subarray(0, required)
    : new Float32Array(required);
  const grain = plan.grain;
  const grainKind = grain === null
    ? 0
    : grain.kind === "procedural-integer-noise"
      ? 1
      : 2;
  const grainSpace = grain?.space === "stroke" ? 1 : 0;
  const grainScale = grain?.scale ?? 1;
  const grainContrast = grain?.contrast ?? 0;
  const grainOriginX = grain?.originX ?? 0;
  const grainOriginY = grain?.originY ?? 0;
  const grainSeed = grain?.seed ?? 0;
  const tipAsset = plan.assets[plan.tip.assetIndex]!;
  const grainAsset = grain?.kind === "asset-r8-repeat"
    ? plan.assets[grain.assetIndex]!
    : null;
  for (let index = 0; index < plan.dabs.length; index += 1) {
    const dab = plan.dabs[index]!;
    const offset = index * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS;
    packed[offset] = dab.x;
    packed[offset + 1] = dab.y;
    packed[offset + 2] = dab.tip.localToDocument[0];
    packed[offset + 3] = dab.tip.localToDocument[1];
    packed[offset + 4] = dab.tip.localToDocument[2];
    packed[offset + 5] = dab.tip.localToDocument[3];
    const alpha = dab.color.components[3];
    packed[offset + 6] = dab.color.components[0] * alpha;
    packed[offset + 7] = dab.color.components[1] * alpha;
    packed[offset + 8] = dab.color.components[2] * alpha;
    packed[offset + 9] = alpha;
    packed[offset + 10] = dab.tip.hardness;
    packed[offset + 11] = dab.grainDepth;
    packed[offset + 12] = grainScale;
    packed[offset + 13] = grainContrast;
    packed[offset + 14] = grainOriginX;
    packed[offset + 15] = grainOriginY;
    packed[offset + 16] = dab.pressure;
    packed[offset + 17] = dab.diameter;
    packed[offset + 18] = dab.tip.roundness;
    packed[offset + 19] = dab.tip.angleRadians;
    packed[offset + 20] = grainKind;
    packed[offset + 21] = grainSpace | (grain?.invert ? 2 : 0);
    packed[offset + 22] = grainSeed & 0xffff;
    packed[offset + 23] = grainSeed >>> 16;
    packed[offset + 24] = tipAsset.width;
    packed[offset + 25] = tipAsset.height;
    packed[offset + 26] = grainAsset?.width ?? 1;
    packed[offset + 27] = grainAsset?.height ?? 1;
  }
  return packed;
}

function vertexBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x2" },
      { shaderLocation: 1, offset: 8, format: "float32x2" },
      { shaderLocation: 2, offset: 16, format: "float32x2" },
      { shaderLocation: 3, offset: 24, format: "float32x4" },
      { shaderLocation: 4, offset: 40, format: "float32x4" },
      { shaderLocation: 5, offset: 56, format: "float32x2" },
      { shaderLocation: 6, offset: 64, format: "float32x4" },
      { shaderLocation: 7, offset: 80, format: "float32x4" },
      { shaderLocation: 8, offset: 96, format: "float32x4" },
    ],
  };
}

function blendState(
  porterDuff: "source-over" | "destination-out",
): GPUBlendState {
  if (porterDuff === "destination-out") {
    return {
      color: { operation: "add", srcFactor: "zero", dstFactor: "one-minus-src-alpha" },
      alpha: { operation: "add", srcFactor: "zero", dstFactor: "one-minus-src-alpha" },
    };
  }
  return {
    color: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" },
    alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" },
  };
}

export function createStudioEngineWebGpuTexturedBrushRuntime(
  options: StudioEngineWebGpuTexturedBrushRuntimeOptions,
): StudioEngineWebGpuTexturedBrushRuntimeCreationResult {
  try {
    if (
      typeof options !== "object"
      || options === null
      || !options.device
      || !positiveSafeInteger(options.width)
      || !positiveSafeInteger(options.height)
      || options.width > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssetDimension
      || options.height > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssetDimension
    ) return Object.freeze({ status: "rejected", reason: "invalid-options" });
    return Object.freeze({
      status: "ready",
      runtime: new StudioEngineWebGpuTexturedBrushRuntime(options),
    });
  } catch {
    return Object.freeze({ status: "rejected", reason: "initialization-failed" });
  }
}

export class StudioEngineWebGpuTexturedBrushRuntime {
  readonly #device: GPUDevice;
  readonly #width: number;
  readonly #height: number;
  #deviceEpoch: number;
  readonly #maximumDabs: number;
  readonly #maximumInFlight: number;
  readonly #maximumResidentAssetBytes: number;
  readonly #ownsDevice: boolean;
  readonly #surfaceTexture: GPUTexture;
  readonly #surfaceView: GPUTextureView;
  readonly #uniformBuffer: GPUBuffer;
  readonly #tipSampler: GPUSampler;
  readonly #grainSampler: GPUSampler;
  readonly #pipelines: Readonly<Record<"source-over" | "destination-out", GPURenderPipeline>>;
  readonly #bindGroupLayout: GPUBindGroupLayout;
  readonly #assetTextures = new Map<string, AssetTexture>();
  readonly #bindGroups = new Map<string, GPUBindGroup>();
  #instanceBuffer: GPUBuffer | null = null;
  #instanceCapacity = 0;
  #residentAssetBytes = 0;
  #inFlight = 0;
  #lastRequestSequence = 0;
  #disposed = false;
  #lost = false;

  public constructor(options: StudioEngineWebGpuTexturedBrushRuntimeOptions) {
    this.#device = options.device;
    this.#width = options.width;
    this.#height = options.height;
    this.#deviceEpoch = options.initialDeviceEpoch ?? 1;
    this.#maximumDabs = options.maximumDabs
      ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs;
    this.#maximumInFlight = options.maximumInFlightSubmissions ?? 2;
    this.#maximumResidentAssetBytes = options.maximumResidentAssetBytes
      ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxTotalAssetBytes;
    this.#ownsDevice = options.ownsDevice ?? false;
    if (
      !positiveSafeInteger(this.#deviceEpoch)
      || this.#deviceEpoch === Number.MAX_SAFE_INTEGER
      || !positiveSafeInteger(this.#maximumDabs)
      || this.#maximumDabs > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs
      || !positiveSafeInteger(this.#maximumInFlight)
      || !positiveSafeInteger(this.#maximumResidentAssetBytes)
    ) throw new Error("invalid textured brush runtime options");

    this.#surfaceTexture = this.#device.createTexture({
      label: "Studio textured brush rgba16float authority",
      size: { width: this.#width, height: this.#height, depthOrArrayLayers: 1 },
      format: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT,
      usage: GPU_TEXTURE_RENDER_ATTACHMENT | GPU_TEXTURE_COPY_SRC | GPU_TEXTURE_BINDING,
    });
    this.#surfaceView = this.#surfaceTexture.createView();
    this.#uniformBuffer = this.#device.createBuffer({
      label: "Studio textured brush viewport uniform",
      size: 16,
      usage: GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST,
    });
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      new Float32Array([
        this.#width,
        this.#height,
        1 / this.#width,
        1 / this.#height,
      ]),
    );
    this.#tipSampler = this.#device.createSampler({
      label: "Studio textured brush zero-border bilinear tip sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    this.#grainSampler = this.#device.createSampler({
      label: "Studio textured brush repeat bilinear grain sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "nearest",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });
    const module = this.#device.createShaderModule({
      label: "Studio textured brush clean-room shader",
      code: TEXTURED_BRUSH_SHADER,
    });
    this.#bindGroupLayout = this.#device.createBindGroupLayout({
      label: "Studio textured brush asset bind layout",
      entries: [
        { binding: 0, visibility: 2, texture: { sampleType: "float" } },
        { binding: 1, visibility: 2, texture: { sampleType: "float" } },
        { binding: 2, visibility: 2, sampler: { type: "filtering" } },
        { binding: 3, visibility: 2, sampler: { type: "filtering" } },
        { binding: 4, visibility: 1, buffer: { type: "uniform" } },
      ],
    });
    const layout = this.#device.createPipelineLayout({
      label: "Studio textured brush pipeline layout",
      bindGroupLayouts: [this.#bindGroupLayout],
    });
    const makePipeline = (
      porterDuff: "source-over" | "destination-out",
    ): GPURenderPipeline => this.#device.createRenderPipeline({
      label: `Studio textured brush ${porterDuff} pipeline`,
      layout,
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [vertexBufferLayout()],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{
          format: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT,
          blend: blendState(porterDuff),
          writeMask: 0xf,
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.#pipelines = Object.freeze({
      "source-over": makePipeline("source-over"),
      "destination-out": makePipeline("destination-out"),
    });
    void this.#device.lost.then((info) => {
      if (this.#disposed) return;
      this.#deviceEpoch += 1;
      this.#lost = true;
      options.onDeviceLost?.(info);
    });
  }

  public get deviceEpoch(): number {
    return this.#deviceEpoch;
  }

  public get inFlight(): number {
    return this.#inFlight;
  }

  #ensureInstanceBuffer(dabCount: number): GPUBuffer {
    if (this.#instanceBuffer && this.#instanceCapacity >= dabCount) return this.#instanceBuffer;
    this.#instanceBuffer?.destroy();
    let capacity = Math.min(256, this.#maximumDabs);
    while (capacity < dabCount) capacity = Math.min(this.#maximumDabs, capacity * 2);
    this.#instanceBuffer = this.#device.createBuffer({
      label: "Studio textured brush instance buffer",
      size: Math.max(
        STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
        capacity * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_BYTES,
      ),
      usage: GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST,
    });
    this.#instanceCapacity = capacity;
    return this.#instanceBuffer;
  }

  #uploadAsset(
    asset: StudioEngineWebGpuTexturedBrushResolvedAsset,
    role: "tip" | "grain",
  ): AssetTexture {
    const key = assetTextureIdentity(asset, role);
    const cached = this.#assetTextures.get(key);
    if (cached) return cached;
    if (this.#residentAssetBytes + asset.byteLength > this.#maximumResidentAssetBytes) {
      throw new RangeError("resident-asset-budget");
    }
    const upload = paddedUpload(asset, role === "tip");
    const texture = this.#device.createTexture({
      label: `Studio textured brush ${role} ${asset.contentHash}`,
      size: { width: upload.width, height: upload.height, depthOrArrayLayers: 1 },
      format: "r8unorm",
      usage: GPU_TEXTURE_BINDING | GPU_TEXTURE_COPY_DST,
    });
    this.#device.queue.writeTexture(
      { texture },
      upload.bytes,
      {
        offset: 0,
        bytesPerRow: upload.bytesPerRow,
        rowsPerImage: upload.height,
      },
      { width: upload.width, height: upload.height, depthOrArrayLayers: 1 },
    );
    const resource: AssetTexture = {
      key,
      role,
      byteLength: asset.byteLength,
      texture,
      view: texture.createView(),
      width: upload.width,
      height: upload.height,
    };
    this.#assetTextures.set(key, resource);
    this.#residentAssetBytes += asset.byteLength;
    return resource;
  }

  #dummyGrainTexture(): AssetTexture {
    const cached = this.#assetTextures.get("dummy-grain");
    if (cached) return cached;
    const texture = this.#device.createTexture({
      label: "Studio textured brush dummy white grain",
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "r8unorm",
      usage: GPU_TEXTURE_BINDING | GPU_TEXTURE_COPY_DST,
    });
    const bytes = new Uint8Array(ROW_ALIGNMENT);
    bytes[0] = 255;
    this.#device.queue.writeTexture(
      { texture },
      bytes,
      { bytesPerRow: ROW_ALIGNMENT, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    const resource: AssetTexture = {
      key: "dummy-grain",
      role: "dummy-grain",
      byteLength: 0,
      texture,
      view: texture.createView(),
      width: 1,
      height: 1,
    };
    this.#assetTextures.set(resource.key, resource);
    return resource;
  }

  #bindGroup(
    plan: StudioEngineWebGpuTexturedBrushPlan,
    batch: StudioEngineWebGpuTexturedBrushBatch,
  ): GPUBindGroup {
    const tip = this.#uploadAsset(plan.assets[batch.tipAssetIndex]!, "tip");
    const grain = batch.grainAssetIndex === null
      ? this.#dummyGrainTexture()
      : this.#uploadAsset(plan.assets[batch.grainAssetIndex]!, "grain");
    const key = `${batch.key}|${tip.key}|${grain.key}`;
    const cached = this.#bindGroups.get(key);
    if (cached) return cached;
    const bindGroup = this.#device.createBindGroup({
      label: `Studio textured brush batch ${batch.key}`,
      layout: this.#bindGroupLayout,
      entries: [
        { binding: 0, resource: tip.view },
        { binding: 1, resource: grain.view },
        { binding: 2, resource: this.#tipSampler },
        { binding: 3, resource: this.#grainSampler },
        { binding: 4, resource: { buffer: this.#uniformBuffer } },
      ],
    });
    this.#bindGroups.set(key, bindGroup);
    return bindGroup;
  }

  public async execute(
    frame: StudioEngineWebGpuTexturedBrushFrame,
    signal?: AbortSignal,
  ): Promise<StudioEngineWebGpuTexturedBrushExecutionResult> {
    if (this.#disposed) return Object.freeze({ status: "disposed" });
    if (this.#lost) {
      return Object.freeze({ status: "device-lost", deviceEpoch: this.#deviceEpoch });
    }
    if (signal?.aborted) return Object.freeze({ status: "cancelled" });
    if (
      !frame
      || !positiveSafeInteger(frame.requestSequence)
      || !positiveSafeInteger(frame.deviceEpoch)
      || !planIsValid(frame.plan, this.#maximumDabs)
    ) return Object.freeze({ status: "rejected", reason: "invalid-frame" });
    if (frame.deviceEpoch !== this.#deviceEpoch) {
      return Object.freeze({ status: "rejected", reason: "device-epoch" });
    }
    if (frame.requestSequence <= this.#lastRequestSequence) {
      return Object.freeze({ status: "rejected", reason: "request-sequence" });
    }
    if (this.#inFlight >= this.#maximumInFlight) {
      return Object.freeze({
        status: "busy",
        inFlight: this.#inFlight,
        maximum: this.#maximumInFlight,
      });
    }
    if (frame.plan.dabs.length > this.#maximumDabs) {
      return Object.freeze({ status: "rejected", reason: "request-limit" });
    }
    const uncachedBytes = frame.plan.assets.reduce((total, asset) => {
      const role = asset.role;
      return total + (
        this.#assetTextures.has(assetTextureIdentity(asset, role))
          ? 0
          : asset.byteLength
      );
    }, 0);
    if (this.#residentAssetBytes + uncachedBytes > this.#maximumResidentAssetBytes) {
      return Object.freeze({ status: "rejected", reason: "resident-asset-budget" });
    }

    this.#inFlight += 1;
    this.#lastRequestSequence = frame.requestSequence;
    try {
      const instanceBuffer = this.#ensureInstanceBuffer(frame.plan.dabs.length);
      const packed = packStudioEngineWebGpuTexturedBrushDabs(frame.plan);
      this.#device.queue.writeBuffer(instanceBuffer, 0, packed);
      const encoder = this.#device.createCommandEncoder({
        label: `Studio textured brush request ${frame.requestSequence}`,
      });
      const pass = encoder.beginRenderPass({
        label: `Studio textured brush ${frame.plan.mode}`,
        colorAttachments: [{
          view: this.#surfaceView,
          loadOp: frame.plan.mode === "rebuild" ? "clear" : "load",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });
      pass.setVertexBuffer(0, instanceBuffer);
      for (const batch of frame.plan.batches) {
        pass.setPipeline(this.#pipelines[batch.porterDuff]);
        pass.setBindGroup(0, this.#bindGroup(frame.plan, batch));
        pass.draw(6, batch.instanceCount, 0, batch.firstInstance);
      }
      pass.end();
      this.#device.queue.submit([encoder.finish()]);
      await this.#device.queue.onSubmittedWorkDone();
      if (this.#disposed) return Object.freeze({ status: "disposed" });
      if (this.#lost) {
        return Object.freeze({ status: "device-lost", deviceEpoch: this.#deviceEpoch });
      }
      const receipt: StudioEngineWebGpuTexturedBrushReceipt = {
        kind: "studio-engine-webgpu-textured-brush-receipt",
        revision: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_RUNTIME_REVISION,
        backend: "webgpu",
        textureFormat: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_TEXTURE_FORMAT,
        colorModel: "scene-linear-premultiplied",
        requestSequence: frame.requestSequence,
        deviceEpoch: this.#deviceEpoch,
        mode: frame.plan.mode,
        strokeId: frame.plan.strokeId,
        commandSequence: frame.plan.commandSequence,
        dabCount: frame.plan.dabs.length,
        batchCount: frame.plan.batches.length,
        assetCount: frame.plan.assets.length,
        assetBytes: frame.plan.assets.reduce((total, asset) => total + asset.byteLength, 0),
        batchKeys: frame.plan.batches.map((batch) => batch.key),
        queueState: "completed",
        complete: true,
      };
      return Object.freeze({ status: "completed", receipt: Object.freeze(receipt) });
    } catch (error) {
      if (error instanceof RangeError && error.message === "resident-asset-budget") {
        return Object.freeze({ status: "rejected", reason: "resident-asset-budget" });
      }
      return Object.freeze({ status: "failed", reason: "gpu-error" });
    } finally {
      this.#inFlight -= 1;
    }
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#instanceBuffer?.destroy();
    this.#uniformBuffer.destroy();
    this.#surfaceTexture.destroy();
    for (const resource of this.#assetTextures.values()) resource.texture.destroy();
    this.#assetTextures.clear();
    this.#bindGroups.clear();
    if (this.#ownsDevice) this.#device.destroy();
  }
}
