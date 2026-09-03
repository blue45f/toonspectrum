/**
 * Compact WebGPU specialist for the product-connected dry-media slice.
 *
 * The v1 general textured runtime transports 28 f32 values (112 bytes) and six vertices per dab.
 * The product compiler admits exactly one R8 tip, one batch and optional procedural grain. V2 moves
 * plan-constant tip/grain state into a 64-byte uniform, retains only 12 f32 values (48 bytes) per
 * dab, reuses its staging allocation, and rasterises the same quad with a four-vertex strip.
 *
 * This is intentionally a strict specialist rather than an approximation. Unsupported asset grain,
 * durable-R8, multi-batch, private-target, or dual-tip plans fail closed and remain available to the
 * existing general runtime outside this product route.
 */

import { sha256HexPortable } from "../studio-sha256";

import {
  acquireStudioEngineWebGpuPresentationProducerWrite,
  settleStudioEngineWebGpuPresentationProducerWrite,
  STUDIO_ENGINE_WEBGPU_PRESENTATION_COLOR_MODEL,
  STUDIO_ENGINE_WEBGPU_PRESENTATION_SURFACE_FORMAT,
  STUDIO_ENGINE_WEBGPU_PRESENTATION_SURFACE_REVISION,
  STUDIO_ENGINE_WEBGPU_PRESENTATION_WORK_SURFACE_USAGE,
  STUDIO_ENGINE_WEBGPU_PRESENTATION_WORKING_COLOR_SPACE,
  type StudioEngineWebGpuPresentationFrameLease,
  type StudioEngineWebGpuPresentationProducerWriteClaim,
} from "./studio-engine-webgpu-presentation-surface";
import {
  fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_DUAL_TIP_CAPABILITY,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_LOWERING_VERSION,
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PLAN_VERSION,
  type StudioEngineWebGpuTexturedBrushDab,
  type StudioEngineWebGpuTexturedBrushPlan,
  type StudioEngineWebGpuTexturedBrushResolvedAsset,
} from "./studio-engine-webgpu-textured-brush-plan";
import type {
  StudioEngineWebGpuTexturedBrushExecutionResult,
  StudioEngineWebGpuTexturedBrushFrame,
  StudioEngineWebGpuTexturedBrushReceipt,
  StudioEngineWebGpuTexturedBrushRuntimeOptions,
} from "./studio-engine-webgpu-textured-brush-runtime";

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_REVISION = 2 as const;
const TEXTURED_BRUSH_RECEIPT_REVISION = 1 as const;
const TEXTURED_BRUSH_TEXTURE_FORMAT = "rgba16float" as const;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS = 12;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES =
  STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB = 4;
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V1_VERTICES_PER_DAB = 6;

const GPU_TEXTURE_COPY_DST = 0x02;
const GPU_TEXTURE_BINDING = 0x04;
const GPU_BUFFER_COPY_DST = 0x08;
const GPU_BUFFER_VERTEX = 0x20;
const GPU_BUFFER_UNIFORM = 0x40;
const ROW_ALIGNMENT = 256;
const UNIFORM_BYTES = 64;
const UINT32_MAX = 0xffff_ffff;
const PAINT_CHANNEL_F32_EPSILON = 2e-6;

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_SHADER = /* wgsl */ `
struct BrushUniforms {
  surface_size: vec2f,
  inverse_surface_size: vec2f,
  document_scale: vec2f,
  document_offset: vec2f,
  tip_size: vec2f,
  grain_scale: f32,
  grain_contrast: f32,
  grain_origin: vec2f,
  grain_seed: u32,
  grain_flags: u32,
};

@group(0) @binding(0) var tip_texture: texture_2d<f32>;
@group(0) @binding(1) var tip_sampler: sampler;
@group(0) @binding(2) var<uniform> brush: BrushUniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) document: vec2f,
  @location(2) color: vec4f,
  @location(3) dynamics: vec2f,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) center: vec2f,
  @location(1) basis_x: vec2f,
  @location(2) basis_y: vec2f,
  @location(3) color: vec4f,
  @location(4) dynamics: vec2f,
) -> VertexOutput {
  let corners = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );
  let local = corners[vertex_index];
  let document_offset = basis_x * local.x + basis_y * local.y;
  let document = center + document_offset;
  let surface = document * brush.document_scale + brush.document_offset;
  let clip = vec2f(
    surface.x * brush.inverse_surface_size.x * 2.0 - 1.0,
    1.0 - surface.y * brush.inverse_surface_size.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  output.local = local;
  output.document = document;
  output.color = color;
  output.dynamics = dynamics;
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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.local * 0.5 + 0.5;
  let padded_size = brush.tip_size + vec2f(2.0);
  let padded_uv = (uv * brush.tip_size + vec2f(1.0)) / padded_size;
  let tip_value = textureSample(tip_texture, tip_sampler, padded_uv).r;
  let hardness_edge = max(1.0 / 65535.0, 1.0 - input.dynamics.x);
  let tip_coverage = smoothstep(0.0, hardness_edge, tip_value);

  let grain_enabled = (brush.grain_flags & 1u) != 0u;
  let grain_stroke_space = (brush.grain_flags & 2u) != 0u;
  let grain_position = select(
    input.document,
    input.document - brush.grain_origin,
    grain_stroke_space,
  );
  let grain_cell = vec2i(floor(grain_position / brush.grain_scale));
  let procedural_grain = integer_noise(grain_cell, brush.grain_seed);
  let contrasted = clamp(
    0.5 + (procedural_grain - 0.5) * (1.0 + brush.grain_contrast * 3.0),
    0.0,
    1.0,
  );
  let grain_factor = select(
    1.0,
    mix(1.0, contrasted, input.dynamics.y),
    grain_enabled,
  );
  return input.color * (tip_coverage * grain_factor);
}
`;

interface ValidatedCompactPlan {
  readonly fingerprint: `sha256:${string}`;
  readonly tip: StudioEngineWebGpuTexturedBrushResolvedAsset;
  readonly grain: StudioEngineWebGpuTexturedBrushPlan["grain"];
}

interface TipTexture {
  readonly key: string;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
}

export interface StudioEngineWebGpuTexturedBrushV2Stats {
  readonly revision: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_REVISION;
  readonly status: "ready" | "device-lost" | "failed" | "disposed";
  readonly deviceEpoch: number;
  readonly inFlight: number;
  readonly executions: number;
  readonly instanceCapacity: number;
  readonly instanceBufferAllocations: number;
  readonly stagingAllocations: number;
  readonly residentAssetBytes: number;
  readonly residentAssetCount: number;
  readonly validatedPlanCount: number;
  readonly instanceUploads: number;
  readonly instanceUploadBytes: number;
  readonly reusedInstanceUploads: number;
  readonly instanceBytesPerDab: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES;
  readonly verticesPerDab: typeof STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB;
}

export type StudioEngineWebGpuTexturedBrushV2CreationResult =
  | Readonly<{
      status: "ready";
      runtime: StudioEngineWebGpuTexturedBrushRuntime;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid-options" | "initialization-failed";
    }>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function unit(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function validPresentationLease(
  lease: StudioEngineWebGpuPresentationFrameLease,
  frame: StudioEngineWebGpuTexturedBrushFrame,
  expectedFingerprint: string,
): boolean {
  try {
    const surface = lease?.workSurface;
    const configuration = lease?.configuration;
    const transform = configuration?.documentToSurface;
    return Boolean(
      lease
      && lease.kind === "studio-engine-webgpu-presentation-frame-lease"
      && lease.revision === STUDIO_ENGINE_WEBGPU_PRESENTATION_SURFACE_REVISION
      && lease.requestSequence === frame.requestSequence
      && lease.deviceEpoch === frame.deviceEpoch
      && lease.sourceFrameFingerprint === expectedFingerprint
      && positiveSafeInteger(lease.presentationEpoch)
      && positiveSafeInteger(lease.resizeEpoch)
      && positiveSafeInteger(lease.viewportEpoch)
      && positiveSafeInteger(lease.flipEpoch)
      && surface
      && surface.kind === "studio-engine-webgpu-shared-linear-work-surface"
      && surface.revision === STUDIO_ENGINE_WEBGPU_PRESENTATION_SURFACE_REVISION
      && surface.format === STUDIO_ENGINE_WEBGPU_PRESENTATION_SURFACE_FORMAT
      && surface.usage === STUDIO_ENGINE_WEBGPU_PRESENTATION_WORK_SURFACE_USAGE
      && surface.colorModel === STUDIO_ENGINE_WEBGPU_PRESENTATION_COLOR_MODEL
      && surface.workingColorSpace === STUDIO_ENGINE_WEBGPU_PRESENTATION_WORKING_COLOR_SPACE
      && positiveSafeInteger(surface.width)
      && positiveSafeInteger(surface.height)
      && positiveSafeInteger(surface.workSurfaceEpoch)
      && surface.byteLength === surface.width * surface.height * 8
      && surface.texture
      && surface.view
      && configuration
      && configuration.presentationEpoch === lease.presentationEpoch
      && configuration.resizeEpoch === lease.resizeEpoch
      && configuration.viewportEpoch === lease.viewportEpoch
      && configuration.flipEpoch === lease.flipEpoch
      && configuration.physicalWidth === surface.width
      && configuration.physicalHeight === surface.height
      && configuration.surfacePixels === surface.width * surface.height
      && configuration.surfaceBytes === surface.byteLength
      && transform
      && transform.m12 === 0
      && transform.m21 === 0
      && [transform.m11, transform.m22, transform.dx, transform.dy].every(finite)
      && transform.m11 !== 0
      && transform.m22 !== 0
    );
  } catch {
    return false;
  }
}

function nextAligned(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function tipIdentity(asset: StudioEngineWebGpuTexturedBrushResolvedAsset): string {
  return [asset.contentHash, `${asset.width}x${asset.height}`, asset.channel, asset.format].join(":");
}

function validPaintAlpha(dab: StudioEngineWebGpuTexturedBrushDab): boolean {
  const alpha = dab.color.components[3];
  if (!unit(alpha) || !unit(dab.opacity) || !unit(dab.flow)) return false;
  const ceiling = dab.opacity * dab.flow;
  return ceiling <= PAINT_CHANNEL_F32_EPSILON
    ? alpha <= PAINT_CHANNEL_F32_EPSILON
    : alpha <= ceiling + PAINT_CHANNEL_F32_EPSILON;
}

function compactPlanIsCacheSafe(plan: StudioEngineWebGpuTexturedBrushPlan): boolean {
  try {
    return Object.isFrozen(plan)
      && Object.isFrozen(plan.assets)
      && Object.isFrozen(plan.dabs)
      && Object.isFrozen(plan.batches)
      && Object.isFrozen(plan.tip)
      && (plan.grain === null || Object.isFrozen(plan.grain))
      && plan.assets.every((asset) => Object.isFrozen(asset))
      && plan.batches.every((batch) => Object.isFrozen(batch))
      && plan.dabs.every((dab) =>
        Object.isFrozen(dab)
        && Object.isFrozen(dab.color)
        && Object.isFrozen(dab.color.components)
        && Object.isFrozen(dab.composite)
        && Object.isFrozen(dab.tip)
        && Object.isFrozen(dab.tip.localToDocument)
      );
  } catch {
    return false;
  }
}

function validateCompactPlan(
  plan: StudioEngineWebGpuTexturedBrushPlan,
  maximumDabs: number,
): ValidatedCompactPlan | null {
  try {
    if (
      plan.kind !== "studio-engine-webgpu-textured-brush-plan"
      || plan.version !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PLAN_VERSION
      || plan.loweringVersion !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_LOWERING_VERSION
      || plan.dualTip !== STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_DUAL_TIP_CAPABILITY
      || plan.textureFormat !== TEXTURED_BRUSH_TEXTURE_FORMAT
      || plan.colorModel !== "scene-linear-premultiplied"
      || plan.mode !== "rebuild"
      || typeof plan.strokeId !== "string"
      || plan.strokeId.length === 0
      || !positiveSafeInteger(plan.commandSequence)
      || plan.durableR8GrainSource !== undefined
      || plan.grainPhaseStrokeSeed !== undefined
      || (
        plan.grainSamplingSemantics !== undefined
        && plan.grainSamplingSemantics !== "specialist-texture-v1"
      )
      || !Array.isArray(plan.assets)
      || plan.assets.length !== 1
      || !Array.isArray(plan.dabs)
      || plan.dabs.length < 1
      || plan.dabs.length > maximumDabs
      || !Array.isArray(plan.batches)
      || plan.batches.length !== 1
      || plan.tip.assetIndex !== 0
      || plan.tip.filtering !== "bilinear"
      || plan.tip.edgeMode !== "transparent-zero-border"
      || plan.tip.hardnessTransfer !== "zero-to-one-smoothstep"
      || (plan.grain !== null && plan.grain.kind !== "procedural-integer-noise")
    ) return null;

    const tip = plan.assets[0]!;
    const batch = plan.batches[0]!;
    if (
      tip.assetIndex !== 0
      || tip.role !== "tip"
      || (tip.channel !== "alpha" && tip.channel !== "luminance")
      || plan.tip.channel !== tip.channel
      || tip.format !== "r8-unorm"
      || !positiveSafeInteger(tip.width)
      || !positiveSafeInteger(tip.height)
      || tip.width > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssetDimension
      || tip.height > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssetDimension
      || tip.byteLength !== tip.width * tip.height
      || tip.byteLength > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxAssetBytes
      || tip.bytes.byteLength !== tip.byteLength
      || tip.contentHash !== `sha256:${sha256HexPortable(tip.bytes)}`
      || typeof batch.key !== "string"
      || batch.key.length === 0
      || batch.tipAssetIndex !== 0
      || batch.grainAssetIndex !== null
      || batch.firstInstance !== 0
      || batch.instanceCount !== plan.dabs.length
      || batch.porterDuff !== "source-over"
    ) return null;

    const grain = plan.grain;
    if (
      grain !== null
      && (
        grain.assetIndex !== null
        || grain.filtering !== "integer-cell"
        || grain.edgeMode !== "infinite"
        || grain.invert !== false
        || !finite(grain.scale)
        || grain.scale <= 0
        || !unit(grain.depth)
        || !unit(grain.contrast)
        || !Number.isSafeInteger(grain.seed)
        || grain.seed < 0
        || grain.seed > UINT32_MAX
        || !finite(grain.originX)
        || !finite(grain.originY)
      )
    ) return null;

    for (let index = 0; index < plan.dabs.length; index += 1) {
      const dab = plan.dabs[index]!;
      const basis = dab.tip.localToDocument;
      const determinant = basis[0] * basis[3] - basis[1] * basis[2];
      if (
        dab.index !== index
        || ![
          dab.stationX,
          dab.stationY,
          dab.x,
          dab.y,
          dab.diameter,
          dab.tip.angleRadians,
          ...basis,
          ...dab.color.components,
        ].every(finite)
        || dab.diameter <= 0
        || Math.fround(determinant) === 0
        || !unit(dab.pressure)
        || !unit(dab.opacity)
        || !unit(dab.flow)
        || !unit(dab.grainDepth)
        || (grain === null && dab.grainDepth !== 0)
        || !unit(dab.tip.hardness)
        || !unit(dab.tip.roundness)
        || dab.tip.roundness <= 0
        || !validPaintAlpha(dab)
        || dab.color.space !== "linear-srgb"
        || dab.color.alphaMode !== "straight"
        || dab.composite.blendMode !== "normal"
        || dab.composite.porterDuff !== batch.porterDuff
      ) return null;
    }

    const fingerprint = fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(plan);
    if (!fingerprint || (plan.semanticFingerprint && plan.semanticFingerprint !== fingerprint)) {
      return null;
    }
    return Object.freeze({ fingerprint, tip, grain });
  } catch {
    return null;
  }
}

/** Pure product-lane admission predicate used by selection tests and the benchmark harness. */
export function studioEngineWebGpuTexturedBrushV2SupportsPlan(
  plan: StudioEngineWebGpuTexturedBrushPlan,
  maximumDabs = STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs,
): boolean {
  return positiveSafeInteger(maximumDabs) && validateCompactPlan(plan, maximumDabs) !== null;
}

/**
 * Compact 48-byte instance pack. Plan-constant tip and procedural-grain fields are intentionally
 * absent and live in the execution uniform instead.
 */
export function packStudioEngineWebGpuTexturedBrushDabsV2(
  plan: Pick<StudioEngineWebGpuTexturedBrushPlan, "dabs">,
  scratch?: Float32Array,
): Float32Array {
  const required = plan.dabs.length * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS;
  const packed = scratch && scratch.length >= required
    ? scratch.subarray(0, required)
    : new Float32Array(required);
  for (let index = 0; index < plan.dabs.length; index += 1) {
    const dab = plan.dabs[index]!;
    const offset = index * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS;
    const [xx, xy, yx, yy] = dab.tip.localToDocument;
    const [red, green, blue, alpha] = dab.color.components;
    packed[offset] = dab.x;
    packed[offset + 1] = dab.y;
    packed[offset + 2] = xx;
    packed[offset + 3] = xy;
    packed[offset + 4] = yx;
    packed[offset + 5] = yy;
    packed[offset + 6] = red * alpha;
    packed[offset + 7] = green * alpha;
    packed[offset + 8] = blue * alpha;
    packed[offset + 9] = alpha;
    packed[offset + 10] = dab.tip.hardness;
    packed[offset + 11] = dab.grainDepth;
  }
  return packed;
}

function packUniforms(
  target: ArrayBuffer,
  width: number,
  height: number,
  transform: Readonly<{
    m11: number;
    m22: number;
    dx: number;
    dy: number;
  }>,
  validated: ValidatedCompactPlan,
): ArrayBuffer {
  const floats = new Float32Array(target);
  const uints = new Uint32Array(target);
  const grain = validated.grain;
  floats[0] = width;
  floats[1] = height;
  floats[2] = 1 / width;
  floats[3] = 1 / height;
  floats[4] = transform.m11;
  floats[5] = transform.m22;
  floats[6] = transform.dx;
  floats[7] = transform.dy;
  floats[8] = validated.tip.width;
  floats[9] = validated.tip.height;
  floats[10] = grain?.scale ?? 1;
  floats[11] = grain?.contrast ?? 0;
  floats[12] = grain?.originX ?? 0;
  floats[13] = grain?.originY ?? 0;
  uints[14] = grain?.seed ?? 0;
  uints[15] = grain === null ? 0 : 1 | (grain.space === "stroke" ? 2 : 0);
  return target;
}

function vertexBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x2" },
      { shaderLocation: 1, offset: 8, format: "float32x2" },
      { shaderLocation: 2, offset: 16, format: "float32x2" },
      { shaderLocation: 3, offset: 24, format: "float32x4" },
      { shaderLocation: 4, offset: 40, format: "float32x2" },
    ],
  };
}

function sourceOverBlendState(): GPUBlendState {
  return {
    color: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" },
    alpha: { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" },
  };
}

export function createStudioEngineWebGpuTexturedBrushRuntime(
  options: StudioEngineWebGpuTexturedBrushRuntimeOptions,
): StudioEngineWebGpuTexturedBrushV2CreationResult {
  try {
    if (
      typeof options !== "object"
      || options === null
      || !options.device
      || typeof options.device.pushErrorScope !== "function"
      || typeof options.device.popErrorScope !== "function"
      || options.presentationOnly !== true
      || options.width !== undefined
      || options.height !== undefined
      || options.nativeR8GrainTextureCache !== undefined
      || !positiveSafeInteger(options.initialDeviceEpoch ?? 1)
      || !positiveSafeInteger(
        options.maximumDabs ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs,
      )
      || (
        options.maximumDabs !== undefined
        && options.maximumDabs > STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs
      )
      || !positiveSafeInteger(options.maximumInFlightSubmissions ?? 2)
      || !positiveSafeInteger(
        options.maximumResidentAssetBytes
          ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxTotalAssetBytes,
      )
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
  readonly #maximumDabs: number;
  readonly #maximumInFlight: number;
  readonly #maximumResidentAssetBytes: number;
  readonly #ownsDevice: boolean;
  readonly #uniformBuffer: GPUBuffer;
  readonly #uniformScratch = new ArrayBuffer(UNIFORM_BYTES);
  readonly #tipSampler: GPUSampler;
  readonly #bindGroupLayout: GPUBindGroupLayout;
  readonly #pipeline: GPURenderPipeline;
  readonly #validatedPlans = new WeakMap<object, ValidatedCompactPlan>();
  readonly #tipTextures = new Map<string, TipTexture>();
  readonly #bindGroups = new Map<string, GPUBindGroup>();
  #deviceEpoch: number;
  #instanceBuffer: GPUBuffer | null = null;
  #instanceCapacity = 0;
  #staging: Float32Array | null = null;
  #residentAssetBytes = 0;
  #inFlight = 0;
  #lastRequestSequence = 0;
  #executions = 0;
  #instanceBufferAllocations = 0;
  #stagingAllocations = 0;
  #validatedPlanCount = 0;
  #uploadedPlan: StudioEngineWebGpuTexturedBrushPlan | null = null;
  #uploadedDabCount = 0;
  #instanceUploads = 0;
  #instanceUploadBytes = 0;
  #reusedInstanceUploads = 0;
  #disposed = false;
  #lost = false;
  #failed = false;
  #submissionTail: Promise<void> = Promise.resolve();

  public constructor(options: StudioEngineWebGpuTexturedBrushRuntimeOptions) {
    if (options.presentationOnly !== true) throw new Error("v2 requires presentationOnly");
    this.#device = options.device;
    this.#deviceEpoch = options.initialDeviceEpoch ?? 1;
    this.#maximumDabs = options.maximumDabs
      ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxDabs;
    this.#maximumInFlight = options.maximumInFlightSubmissions ?? 2;
    this.#maximumResidentAssetBytes = options.maximumResidentAssetBytes
      ?? STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_BUDGETS.maxTotalAssetBytes;
    this.#ownsDevice = options.ownsDevice ?? false;

    this.#uniformBuffer = this.#device.createBuffer({
      label: "Studio compact textured brush v2 uniform",
      size: UNIFORM_BYTES,
      usage: GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST,
    });
    this.#tipSampler = this.#device.createSampler({
      label: "Studio compact textured brush v2 zero-border sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const module = this.#device.createShaderModule({
      label: "Studio compact textured brush v2 shader",
      code: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_SHADER,
    });
    this.#bindGroupLayout = this.#device.createBindGroupLayout({
      label: "Studio compact textured brush v2 bind layout",
      entries: [
        { binding: 0, visibility: 2, texture: { sampleType: "float" } },
        { binding: 1, visibility: 2, sampler: { type: "filtering" } },
        { binding: 2, visibility: 1 | 2, buffer: { type: "uniform" } },
      ],
    });
    const layout = this.#device.createPipelineLayout({
      label: "Studio compact textured brush v2 pipeline layout",
      bindGroupLayouts: [this.#bindGroupLayout],
    });
    this.#pipeline = this.#device.createRenderPipeline({
      label: "Studio compact textured brush v2 source-over",
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
          format: TEXTURED_BRUSH_TEXTURE_FORMAT,
          blend: sourceOverBlendState(),
          writeMask: 0xf,
        }],
      },
      primitive: { topology: "triangle-strip" },
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

  public stats(): StudioEngineWebGpuTexturedBrushV2Stats {
    return Object.freeze({
      revision: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_REVISION,
      status: this.#disposed
        ? "disposed"
        : this.#lost
          ? "device-lost"
          : this.#failed
            ? "failed"
            : "ready",
      deviceEpoch: this.#deviceEpoch,
      inFlight: this.#inFlight,
      executions: this.#executions,
      instanceCapacity: this.#instanceCapacity,
      instanceBufferAllocations: this.#instanceBufferAllocations,
      stagingAllocations: this.#stagingAllocations,
      residentAssetBytes: this.#residentAssetBytes,
      residentAssetCount: this.#tipTextures.size,
      validatedPlanCount: this.#validatedPlanCount,
      instanceUploads: this.#instanceUploads,
      instanceUploadBytes: this.#instanceUploadBytes,
      reusedInstanceUploads: this.#reusedInstanceUploads,
      instanceBytesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
      verticesPerDab: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
    });
  }

  async #acquireSubmissionSlot(): Promise<() => void> {
    const previous = this.#submissionTail;
    let release!: () => void;
    this.#submissionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  #validated(plan: StudioEngineWebGpuTexturedBrushPlan): ValidatedCompactPlan | null {
    const cacheSafe = compactPlanIsCacheSafe(plan);
    if (cacheSafe) {
      const cached = this.#validatedPlans.get(plan);
      if (cached) return cached;
    }
    const validated = validateCompactPlan(plan, this.#maximumDabs);
    if (validated) {
      if (cacheSafe) this.#validatedPlans.set(plan, validated);
      this.#validatedPlanCount += 1;
    }
    return validated;
  }

  #ensureInstanceStorage(dabCount: number): Readonly<{
    buffer: GPUBuffer;
    staging: Float32Array;
  }> {
    if (!this.#instanceBuffer || this.#instanceCapacity < dabCount) {
      this.#instanceBuffer?.destroy();
      let capacity = Math.min(256, this.#maximumDabs);
      while (capacity < dabCount) capacity = Math.min(this.#maximumDabs, capacity * 2);
      this.#instanceBuffer = this.#device.createBuffer({
        label: "Studio compact textured brush v2 instances",
        size: Math.max(
          STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
          capacity * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_BYTES,
        ),
        usage: GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST,
      });
      this.#instanceCapacity = capacity;
      this.#instanceBufferAllocations += 1;
      this.#uploadedPlan = null;
      this.#uploadedDabCount = 0;
    }
    const requiredFloats = this.#instanceCapacity * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_INSTANCE_FLOATS;
    if (!this.#staging || this.#staging.length < requiredFloats) {
      this.#staging = new Float32Array(requiredFloats);
      this.#stagingAllocations += 1;
    }
    return { buffer: this.#instanceBuffer, staging: this.#staging };
  }

  #tipTexture(asset: StudioEngineWebGpuTexturedBrushResolvedAsset): TipTexture {
    const key = tipIdentity(asset);
    const cached = this.#tipTextures.get(key);
    if (cached) return cached;
    if (this.#residentAssetBytes + asset.byteLength > this.#maximumResidentAssetBytes) {
      throw new RangeError("resident-asset-budget");
    }
    const width = asset.width + 2;
    const height = asset.height + 2;
    const bytesPerRow = nextAligned(width, ROW_ALIGNMENT);
    const upload = new Uint8Array(bytesPerRow * height);
    for (let y = 0; y < asset.height; y += 1) {
      upload.set(
        asset.bytes.subarray(y * asset.width, (y + 1) * asset.width),
        (y + 1) * bytesPerRow + 1,
      );
    }
    const texture = this.#device.createTexture({
      label: `Studio compact textured brush v2 tip ${asset.contentHash}`,
      size: { width, height, depthOrArrayLayers: 1 },
      format: "r8unorm",
      usage: GPU_TEXTURE_BINDING | GPU_TEXTURE_COPY_DST,
    });
    this.#device.queue.writeTexture(
      { texture },
      upload,
      { bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 },
    );
    const resource: TipTexture = {
      key,
      texture,
      view: texture.createView(),
    };
    this.#tipTextures.set(key, resource);
    this.#residentAssetBytes += asset.byteLength;
    return resource;
  }

  #bindGroup(tip: TipTexture): GPUBindGroup {
    const cached = this.#bindGroups.get(tip.key);
    if (cached) return cached;
    const bindGroup = this.#device.createBindGroup({
      label: `Studio compact textured brush v2 bindings ${tip.key}`,
      layout: this.#bindGroupLayout,
      entries: [
        { binding: 0, resource: tip.view },
        { binding: 1, resource: this.#tipSampler },
        { binding: 2, resource: { buffer: this.#uniformBuffer } },
      ],
    });
    this.#bindGroups.set(tip.key, bindGroup);
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
    if (this.#failed) return Object.freeze({ status: "failed", reason: "gpu-error" });
    if (signal?.aborted) return Object.freeze({ status: "cancelled" });
    if (
      !frame
      || !positiveSafeInteger(frame.requestSequence)
      || !positiveSafeInteger(frame.deviceEpoch)
      || !frame.presentationLease
    ) return Object.freeze({ status: "rejected", reason: "invalid-frame" });
    const validated = this.#validated(frame.plan);
    if (!validated) return Object.freeze({ status: "rejected", reason: "invalid-frame" });
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
    const lease = frame.presentationLease;
    if (!validPresentationLease(lease, frame, validated.fingerprint)) {
      return Object.freeze({ status: "rejected", reason: "presentation-lease-invalid" });
    }

    this.#inFlight += 1;
    this.#lastRequestSequence = frame.requestSequence;
    let releaseSubmissionSlot: (() => void) | null = null;
    let producerClaim: StudioEngineWebGpuPresentationProducerWriteClaim | null = null;
    let producerClaimSettled = false;
    let errorScopeDepth = 0;
    const pendingScopes: Array<Promise<GPUError | null>> = [];
    try {
      releaseSubmissionSlot = await this.#acquireSubmissionSlot();
      if (signal?.aborted) return Object.freeze({ status: "cancelled" });
      if (this.#disposed) return Object.freeze({ status: "disposed" });
      if (this.#lost) {
        return Object.freeze({ status: "device-lost", deviceEpoch: this.#deviceEpoch });
      }

      const acquired = acquireStudioEngineWebGpuPresentationProducerWrite(lease, {
        mode: frame.plan.mode,
        sourceFrameFingerprint: validated.fingerprint,
      });
      if (acquired.status === "rejected") {
        return Object.freeze({
          status: "rejected",
          reason: acquired.reason === "content-uninitialized"
            ? "content-uninitialized"
            : acquired.reason === "content-generation-exhausted"
              ? "content-generation-exhausted"
              : "presentation-lease-invalid",
        });
      }
      producerClaim = acquired.claim;

      for (const filter of [
        "internal",
        "out-of-memory",
        "validation",
      ] as const satisfies readonly GPUErrorFilter[]) {
        this.#device.pushErrorScope(filter);
        errorScopeDepth += 1;
      }

      const transform = lease.configuration.documentToSurface;
      this.#device.queue.writeBuffer(
        this.#uniformBuffer,
        0,
        packUniforms(
          this.#uniformScratch,
          lease.workSurface.width,
          lease.workSurface.height,
          transform,
          validated,
        ),
      );
      const storage = this.#ensureInstanceStorage(frame.plan.dabs.length);
      const canReuseUpload = compactPlanIsCacheSafe(frame.plan);
      if (
        !canReuseUpload
        || this.#uploadedPlan !== frame.plan
        || this.#uploadedDabCount !== frame.plan.dabs.length
      ) {
        const packed = packStudioEngineWebGpuTexturedBrushDabsV2(
          frame.plan,
          storage.staging,
        );
        this.#device.queue.writeBuffer(storage.buffer, 0, packed);
        this.#uploadedPlan = canReuseUpload ? frame.plan : null;
        this.#uploadedDabCount = canReuseUpload ? frame.plan.dabs.length : 0;
        this.#instanceUploads += 1;
        this.#instanceUploadBytes += packed.byteLength;
      } else {
        this.#reusedInstanceUploads += 1;
      }

      const tip = this.#tipTexture(validated.tip);
      const batch = frame.plan.batches[0]!;
      const encoder = this.#device.createCommandEncoder({
        label: `Studio compact textured brush v2 request ${frame.requestSequence}`,
      });
      const pass = encoder.beginRenderPass({
        label: `Studio compact textured brush v2 ${frame.plan.mode}`,
        colorAttachments: [{
          view: lease.workSurface.view,
          loadOp: frame.plan.mode === "rebuild" ? "clear" : "load",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });
      pass.setPipeline(this.#pipeline);
      pass.setBindGroup(0, this.#bindGroup(tip));
      pass.setVertexBuffer(0, storage.buffer);
      pass.draw(
        STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_V2_VERTICES_PER_DAB,
        batch.instanceCount,
        0,
        batch.firstInstance,
      );
      pass.end();
      this.#device.queue.submit([encoder.finish()]);
      const queueCompletion = this.#device.queue.onSubmittedWorkDone();
      while (errorScopeDepth > 0) {
        pendingScopes.push(this.#device.popErrorScope());
        errorScopeDepth -= 1;
      }
      const [, scopedErrors] = await Promise.all([
        queueCompletion,
        Promise.all(pendingScopes),
      ]);
      if (this.#disposed) return Object.freeze({ status: "disposed" });
      if (this.#lost) {
        return Object.freeze({ status: "device-lost", deviceEpoch: this.#deviceEpoch });
      }
      if (scopedErrors.some((error) => error !== null)) {
        this.#failed = true;
        return Object.freeze({ status: "failed", reason: "gpu-error" });
      }

      const settled = settleStudioEngineWebGpuPresentationProducerWrite(
        producerClaim,
        "completed",
      );
      producerClaimSettled = true;
      if (settled.status !== "completed") {
        return Object.freeze({ status: "rejected", reason: "presentation-lease-invalid" });
      }
      this.#executions += 1;
      const receipt: StudioEngineWebGpuTexturedBrushReceipt = {
        kind: "studio-engine-webgpu-textured-brush-receipt",
        revision: TEXTURED_BRUSH_RECEIPT_REVISION,
        backend: "webgpu",
        textureFormat: TEXTURED_BRUSH_TEXTURE_FORMAT,
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
        batchKeys: frame.plan.batches.map((candidate) => candidate.key),
        planSemanticFingerprint: frame.plan.semanticFingerprint ?? null,
        grainSamplingSemantics: frame.plan.grainSamplingSemantics
          ?? "specialist-texture-v1",
        nativeR8GrainSourceKey: null,
        nativeR8GrainTextureBytes: 0,
        renderTarget: "presentation",
        sourceFrameFingerprint: validated.fingerprint,
        workSurfaceEpoch: lease.workSurface.workSurfaceEpoch,
        baseContentGeneration: producerClaim.baseContentGeneration,
        baseContentFingerprint: producerClaim.baseContentFingerprint,
        contentGeneration: settled.content.generation,
        contentFingerprint: settled.content.fingerprint,
        queueState: "completed",
        complete: true,
      };
      return Object.freeze({ status: "completed", receipt: Object.freeze(receipt) });
    } catch (error) {
      while (errorScopeDepth > 0) {
        try {
          pendingScopes.push(this.#device.popErrorScope());
        } catch {
          // The execution fails closed below.
        }
        errorScopeDepth -= 1;
      }
      if (pendingScopes.length > 0) await Promise.allSettled(pendingScopes);
      if (error instanceof RangeError && error.message === "resident-asset-budget") {
        return Object.freeze({ status: "rejected", reason: "resident-asset-budget" });
      }
      this.#failed = true;
      return Object.freeze({ status: "failed", reason: "gpu-error" });
    } finally {
      if (producerClaim && !producerClaimSettled) {
        settleStudioEngineWebGpuPresentationProducerWrite(producerClaim, "failed");
      }
      releaseSubmissionSlot?.();
      this.#inFlight -= 1;
    }
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#instanceBuffer?.destroy();
    this.#uniformBuffer.destroy();
    for (const resource of this.#tipTextures.values()) resource.texture.destroy();
    this.#tipTextures.clear();
    this.#bindGroups.clear();
    this.#uploadedPlan = null;
    this.#uploadedDabCount = 0;
    if (this.#ownsDevice) this.#device.destroy();
  }
}
