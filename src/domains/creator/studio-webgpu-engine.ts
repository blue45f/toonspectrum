import {
  advanceStudioResidualInk,
  planStudioCausalInkDabs,
  startStudioResidualInk,
} from "./studio-causal-ink";
import {
  isStudioInkPressureModel,
  resolveStudioInkPressure,
  studioInkUsesResidualDabSpacing,
} from "./studio-ink-pressure-model";
import { parseStudioGpuColor } from "./studio-webgpu-color";
import {
  copyStudioGpuReadbackRows,
  planStudioGpuReadbackLayout,
  STUDIO_GPU_MAX_READBACK_PIXELS,
  type StudioGpuReadbackArea,
  type StudioGpuReadbackFailureReason,
  type StudioGpuReadbackLayout,
  type StudioGpuReadbackPixelRect,
} from "./studio-webgpu-readback";
import {
  STUDIO_GPU_STROKE_FEED_REVISION,
  orderStudioGpuStrokes,
  snapshotStudioGpuStrokes,
  studioGpuPressureRadius,
  STUDIO_GPU_MAX_BRUSH_SIZE,
  type StudioGpuComposite,
  type StudioGpuStroke,
} from "./studio-webgpu-stroke";
import {
  advanceStudioGpuStrokeFeed,
  appendStudioGpuStrokeFeedOperations,
  createStudioGpuStrokeFeedBaseline,
  sameStudioGpuStrokeFeedStyle,
  studioGpuStrokeFeedRevisionAtPointCount,
  studioGpuStrokeFeedSuffixFromPointCount,
  type StudioGpuStrokeOperationsAppendPatch,
  type StudioGpuStrokeSuffixPatch,
} from "./studio-webgpu-stroke-feed";
import {
  packStudioGpuTileDabs,
  planStudioGpuTilePresentation,
  planStudioGpuVisibleTileFrame,
  resolveStudioGpuTileTasks,
  STUDIO_GPU_DAB_INSTANCE_FLOATS,
} from "./studio-webgpu-tile-compositor";
import {
  createStudioGpuTileTextureFactory,
  StudioGpuTileRuntime,
  type StudioGpuTileFrameToken,
} from "./studio-webgpu-tile-runtime";

import type { StudioGpuRect } from "./studio-webgpu-tile-plan";

export {
  orderStudioGpuStrokes,
  studioGpuPressureRadius,
  STUDIO_GPU_MAX_BRUSH_SIZE,
} from "./studio-webgpu-stroke";
export type { StudioGpuComposite, StudioGpuStroke } from "./studio-webgpu-stroke";
export {
  STUDIO_GPU_MAX_READBACK_PIXELS,
  STUDIO_GPU_READBACK_BYTES_PER_PIXEL,
  STUDIO_GPU_READBACK_ROW_ALIGNMENT,
  copyStudioGpuReadbackRows,
  planStudioGpuReadbackLayout,
} from "./studio-webgpu-readback";
export type {
  StudioGpuReadbackArea,
  StudioGpuReadbackFailureReason,
  StudioGpuReadbackLayout,
  StudioGpuReadbackLayoutResult,
  StudioGpuReadbackPixelRect,
} from "./studio-webgpu-readback";

export interface StudioGpuViewTransform {
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly flipX?: boolean;
}

export interface StudioGpuViewport extends StudioGpuViewTransform {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly dpr?: number;
}

export type StudioGpuBackend = "webgpu" | "canvas2d";

export interface StudioGpuFrameReceipt {
  /** Caller-owned identity; stale receipts can never authorize a newer React render. */
  readonly requestId: string;
  /** Deterministic identity of ordered operations, viewport transform, and physical surface size. */
  readonly fingerprint: string;
  readonly backend: StudioGpuBackend;
  readonly complete: true;
  readonly strokeCount: number;
  readonly dabCount: number;
  readonly physicalWidth: number;
  readonly physicalHeight: number;
}

export interface StudioGpuFrameReadbackRequest {
  /** Exact receipt previously emitted by this engine. Older or reconstructed frames fail closed. */
  readonly receipt: StudioGpuFrameReceipt;
  /** Captures either the whole current presentation viewport or one fully-visible document rect. */
  readonly area: StudioGpuReadbackArea;
}

export interface StudioGpuFrameReadback {
  readonly status: "captured";
  readonly receipt: StudioGpuFrameReceipt;
  readonly area: StudioGpuReadbackArea;
  readonly pixelRect: StudioGpuReadbackPixelRect;
  readonly width: number;
  readonly height: number;
  /** Canvas ImageData-compatible, unpremultiplied RGBA bytes. */
  readonly pixels: Uint8ClampedArray;
  readonly format: "rgba8unorm";
  readonly alphaMode: "unpremultiplied";
}

export interface StudioGpuFrameReadbackRejection {
  readonly status: "rejected";
  readonly reason: StudioGpuReadbackFailureReason;
}

export type StudioGpuFrameReadbackResult =
  | StudioGpuFrameReadback
  | StudioGpuFrameReadbackRejection;

export interface StudioWebGpuEngineOptions {
  /** WebGPU presentation surface. It remains hidden while the Canvas2D fallback is active. */
  readonly canvas: HTMLCanvasElement;
  /** Separate fallback surface avoids trying to request two incompatible contexts on one canvas. */
  readonly fallbackCanvas: HTMLCanvasElement;
  /** Test/embedding override. `null` explicitly disables WebGPU. */
  readonly gpu?: GPU | null;
  readonly autoRecover?: boolean;
  /**
   * Retains one immutable presentation texture so `captureFrame()` can read the exact receipt.
   * Defaults to true for backwards compatibility. Display-only/live-preview consumers should opt
   * out to avoid a full-surface texture allocation and texture-to-texture copy on every frame.
   */
  readonly retainReadbackSnapshot?: boolean;
  readonly onBackendChange?: (backend: StudioGpuBackend) => void;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
  /** Fired synchronously before pixels for an older request may no longer be trusted. */
  readonly onFrameInvalid?: () => void;
  /** Fired only after the latest request is fully covered and submitted by the active backend. */
  readonly onFrameReady?: (receipt: StudioGpuFrameReceipt) => void;
}

interface NormalizedStudioGpuViewport {
  logicalWidth: number;
  logicalHeight: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
}

export interface StudioGpuDab {
  x: number;
  y: number;
  radius: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  composite: StudioGpuComposite;
}

export interface StudioGpuBatch {
  composite: StudioGpuComposite;
  firstInstance: number;
  instanceCount: number;
}

export interface PlannedStudioGpuDabs {
  dabs: StudioGpuDab[];
  batches: StudioGpuBatch[];
  /** False means the safety cap stopped planning before every requested operation was covered. */
  complete: boolean;
}

export interface StudioGpuDabRenderUpdate extends PlannedStudioGpuDabs {
  /** `append` is safe to draw over the retained frame; `rebuild` must clear it first. */
  mode: "append" | "rebuild";
}

const INSTANCE_BYTES = STUDIO_GPU_DAB_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const STUDIO_GPU_MAX_DABS = 100_000;
export const STUDIO_GPU_MAX_TILE_RESOLUTION_SCALE = 4;
export const STUDIO_GPU_MAX_CONCURRENT_READBACKS = 2;
export const STUDIO_GPU_READBACK_SNAPSHOT_POOL_SIZE = 2;
/** Includes the current authority texture, retired reader-held textures, and the reuse pool. */
export const STUDIO_GPU_MAX_READBACK_SNAPSHOT_BYTES = 128 * 1024 * 1024;
export const STUDIO_GPU_MAX_READBACK_SNAPSHOT_PIXELS = 2 * STUDIO_GPU_MAX_READBACK_PIXELS;
/** Two immutable surfaces are sufficient for one authority frame plus copy-on-write. */
export const STUDIO_GPU_MAX_READBACK_SNAPSHOTS = 2;
const DEFAULT_MAX_TEXTURE_DIMENSION = 8_192;
const STUDIO_GPU_TILE_TEXTURE_FORMAT = "rgba8unorm" as const;
const PRESENTATION_VERTEX_FLOATS = 4;
const PRESENTATION_VERTEX_BYTES = PRESENTATION_VERTEX_FLOATS * Float32Array.BYTES_PER_ELEMENT;
let studioGpuEngineInstanceSequence = 0;

const STUDIO_GPU_BRUSH_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) nominal_radius_ratio: f32,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) center: vec2<f32>,
    @location(1) quad_radius: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) nominal_radius_ratio: f32,
  ) -> VertexOutput {
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
    );
    let corner = corners[vertex_index];
    var output: VertexOutput;
    output.position = vec4<f32>(center + corner * quad_radius, 0.0, 1.0);
    output.local = corner;
    output.color = color;
    output.nominal_radius_ratio = nominal_radius_ratio;
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // The quad is rasterized one physical texel larger than the analytic dab radius (see
    // writePackedTileDab), so the coverage transition below has real geometry to feather into on
    // every side instead of only toward the instanced quad's unclipped corners. local==1.0 is now
    // the expanded quad edge; nominal_radius_ratio locates the true circle boundary inside it.
    let distance_from_center = length(input.local);
    // Keep the edge close to one physical pixel instead of feathering 10% of large brush tips.
    let edge_width = max(fwidth(distance_from_center), 0.0005);
    let half_edge_width = edge_width * 0.5;
    let coverage = 1.0 - smoothstep(
      input.nominal_radius_ratio - half_edge_width,
      input.nominal_radius_ratio + half_edge_width,
      distance_from_center
    );
    return input.color * coverage;
  }
`;

const STUDIO_GPU_TILE_PRESENTATION_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
  }

  @group(0) @binding(0) var tile_sampler: sampler;
  @group(0) @binding(1) var tile_texture: texture_2d<f32>;

  @vertex
  fn vs_main(
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
  ) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(position, 0.0, 1.0);
    output.uv = uv;
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(tile_texture, tile_sampler, input.uv);
  }
`;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeViewport(input: StudioGpuViewport): NormalizedStudioGpuViewport {
  const logicalWidth = positiveOr(input.logicalWidth, 1);
  const logicalHeight = positiveOr(input.logicalHeight, 1);
  return {
    logicalWidth,
    logicalHeight,
    cssWidth: positiveOr(input.cssWidth, logicalWidth),
    cssHeight: positiveOr(input.cssHeight, logicalHeight),
    dpr: clamp(positiveOr(input.dpr, 1), 0.25, 4),
    scaleX: positiveOr(input.scaleX, 1),
    scaleY: positiveOr(input.scaleY, 1),
    offsetX: finiteOr(input.offsetX, 0),
    offsetY: finiteOr(input.offsetY, 0),
    flipX: input.flipX === true,
  };
}

function pointPressure(stroke: StudioGpuStroke, index: number): number {
  return resolveStudioInkPressure(stroke.pressures?.[index], stroke.pressureModel);
}

function stableFingerprintNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "+Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function updateFingerprint(hash: number, value: string | number | boolean | undefined): number {
  const token = typeof value === "number" ? stableFingerprintNumber(value) : String(value);
  let next = hash >>> 0;
  for (let index = 0; index < token.length; index += 1) {
    next ^= token.charCodeAt(index);
    next = Math.imul(next, 0x01000193) >>> 0;
  }
  next ^= 0;
  return Math.imul(next, 0x01000193) >>> 0;
}

export function fingerprintStudioGpuFrame(
  strokes: readonly StudioGpuStroke[],
  viewport: StudioGpuViewport,
  physicalWidth: number,
  physicalHeight: number
): string {
  const normalized = normalizeViewport(viewport);
  let hash = 0x811c9dc5;
  for (const value of [
    normalized.logicalWidth,
    normalized.logicalHeight,
    normalized.cssWidth,
    normalized.cssHeight,
    normalized.dpr,
    normalized.scaleX,
    normalized.scaleY,
    normalized.offsetX,
    normalized.offsetY,
    normalized.flipX,
    physicalWidth,
    physicalHeight,
  ]) {
    hash = updateFingerprint(hash, value);
  }
  const ordered = orderStudioGpuStrokes(strokes);
  hash = updateFingerprint(hash, ordered.length);
  for (const stroke of ordered) {
    const feed = stroke[STUDIO_GPU_STROKE_FEED_REVISION];
    if (feed) {
      hash = updateFingerprint(hash, `feed:${feed.token}`);
      continue;
    }
    for (const value of [
      stroke.id,
      stroke.color,
      stroke.size,
      stroke.opacity,
      stroke.composite,
      stroke.orderKey,
      stroke.points.length,
    ]) {
      hash = updateFingerprint(hash, value);
    }
    if (stroke.pressureModel !== undefined) {
      hash = updateFingerprint(hash, `pressure-model:${stroke.pressureModel}`);
    }
    for (const point of stroke.points) hash = updateFingerprint(hash, point);
    hash = updateFingerprint(hash, stroke.pressures?.length);
    for (const pressure of stroke.pressures ?? []) hash = updateFingerprint(hash, pressure);
  }
  return `${ordered.length}:${hash.toString(16).padStart(8, "0")}`;
}

interface StudioGpuDabPlanOptions {
  readonly clipRect: StudioGpuRect | null;
  readonly maximumDabs: number;
  readonly includeInitialDab: boolean;
}

function validClipRect(rect: StudioGpuRect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0
    && Number.isFinite(rect.x + rect.width)
    && Number.isFinite(rect.y + rect.height);
}

/** Shared fail-closed validation for both full-frame and tiled render paths. */
export function isValidStudioGpuStroke(stroke: StudioGpuStroke): boolean {
  const feed = stroke[STUDIO_GPU_STROKE_FEED_REVISION];
  if (feed) {
    return feed.trustedImmutable
      && feed.pointCount >= 1
      && stroke.points.length === feed.pointCount * 2
      && feed.styleSignature.length > 0
      && Number.isFinite(feed.minimumX)
      && Number.isFinite(feed.minimumY)
      && Number.isFinite(feed.maximumX)
      && Number.isFinite(feed.maximumY)
      && typeof stroke.color === "string"
      && parseStudioGpuColor(stroke.color) !== null
      && Number.isFinite(stroke.size)
      && stroke.size > 0
      && stroke.size <= STUDIO_GPU_MAX_BRUSH_SIZE
      && (stroke.pressureModel === undefined || isStudioInkPressureModel(stroke.pressureModel))
      && (stroke.opacity === undefined || (
        Number.isFinite(stroke.opacity) && stroke.opacity >= 0 && stroke.opacity <= 1
      ));
  }
  return Array.isArray(stroke.points)
    && stroke.points.length >= 2
    && stroke.points.length % 2 === 0
    && stroke.points.every(Number.isFinite)
    && (stroke.pressures === undefined || (
      Array.isArray(stroke.pressures) && stroke.pressures.every(Number.isFinite)
    ))
    && typeof stroke.color === "string"
    && parseStudioGpuColor(stroke.color) !== null
    && Number.isFinite(stroke.size)
    && stroke.size > 0
    && stroke.size <= STUDIO_GPU_MAX_BRUSH_SIZE
    && (stroke.pressureModel === undefined || isStudioInkPressureModel(stroke.pressureModel))
    && (stroke.opacity === undefined || (
      Number.isFinite(stroke.opacity) && stroke.opacity >= 0 && stroke.opacity <= 1
    ));
}

/** A display compositor stays cold until every operation in a non-empty frame is supported. */
export function isStudioWebGpuCanvasActive(strokes: readonly StudioGpuStroke[]): boolean {
  return strokes.length > 0 && strokes.every(isValidStudioGpuStroke);
}

interface StudioWebGpuCanvasRequestTarget {
  readonly suspend: (requestId?: string) => void;
  readonly render: (strokes: readonly StudioGpuStroke[], requestId?: string) => void;
}

/** Pure lifecycle boundary used by the React surface; inactive frames never warm the GPU. */
export function routeStudioWebGpuCanvasRequest(input: {
  readonly engine: StudioWebGpuCanvasRequestTarget;
  readonly strokes: readonly StudioGpuStroke[];
  readonly requestId: string;
  readonly syncViewport: () => void;
  readonly requestInitialization: () => void;
}): "active" | "suspended" {
  if (!isStudioWebGpuCanvasActive(input.strokes)) {
    input.engine.suspend(input.requestId);
    return "suspended";
  }
  input.syncViewport();
  input.engine.render(input.strokes, input.requestId);
  input.requestInitialization();
  return "active";
}

function dabIntersectsRect(
  x: number,
  y: number,
  radius: number,
  rect: StudioGpuRect
): boolean {
  const nearestX = clamp(x, rect.x, rect.x + rect.width);
  const nearestY = clamp(y, rect.y, rect.y + rect.height);
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

interface StudioGpuSegmentClip {
  readonly valid: boolean;
  readonly interval: readonly [number, number] | null;
}

/**
 * Returns the parameter interval whose dab centers can possibly touch the rectangle. The caller
 * performs an exact circle/rectangle check because pressure can make the radius vary per dab.
 */
function clipStudioGpuSegment(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  rect: StudioGpuRect
): StudioGpuSegmentClip {
  const minimumX = rect.x - radius;
  const minimumY = rect.y - radius;
  const maximumX = rect.x + rect.width + radius;
  const maximumY = rect.y + rect.height + radius;
  if (![minimumX, minimumY, maximumX, maximumY].every(Number.isFinite)) {
    return { valid: false, interval: null };
  }

  let minimumAmount = 0;
  let maximumAmount = 1;
  for (const [origin, delta, minimum, maximum] of [
    [x, dx, minimumX, maximumX],
    [y, dy, minimumY, maximumY],
  ] as const) {
    if (delta === 0) {
      if (origin < minimum || origin > maximum) {
        return { valid: true, interval: null };
      }
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return { valid: false, interval: null };
    }
    minimumAmount = Math.max(minimumAmount, Math.min(first, second));
    maximumAmount = Math.min(maximumAmount, Math.max(first, second));
    if (minimumAmount > maximumAmount) {
      return { valid: true, interval: null };
    }
  }
  return {
    valid: true,
    interval: [clamp(minimumAmount, 0, 1), clamp(maximumAmount, 0, 1)],
  };
}

function planStudioGpuDabsInternal(
  strokes: readonly StudioGpuStroke[],
  options: StudioGpuDabPlanOptions
): PlannedStudioGpuDabs {
  const dabs: StudioGpuDab[] = [];
  const batches: StudioGpuBatch[] = [];
  let complete = true;
  const { clipRect, maximumDabs, includeInitialDab } = options;

  if (
    !Number.isSafeInteger(maximumDabs)
    || maximumDabs < 0
    || (clipRect !== null && !validClipRect(clipRect))
  ) {
    return { dabs, batches, complete: false };
  }

  for (const stroke of orderStudioGpuStrokes(strokes)) {
    // The unclipped Canvas2D/full-frame planner retains its historical truncation behavior. A
    // clipped tile planner must continue validating off-tile operations after reaching the exact
    // emitted-dab limit, because those operations consume no frame budget.
    if (clipRect === null && dabs.length >= maximumDabs) {
      complete = false;
      break;
    }
    if (!isValidStudioGpuStroke(stroke)) {
      complete = false;
      break;
    }
    const pointCount = stroke.points.length / 2;
    const size = stroke.size;
    const opacity = stroke.opacity ?? 1;
    const composite: StudioGpuComposite = stroke.composite === "erase" ? "erase" : "normal";
    const parsedColor = parseStudioGpuColor(stroke.color);
    if (!parsedColor) {
      complete = false;
      break;
    }
    const [red, green, blue, colorAlpha] = parsedColor;
    // Erasing is coverage, not paint color. A transparent/alpha-zero color must therefore erase
    // with the requested opacity instead of silently becoming a no-op.
    const alpha = opacity * (composite === "erase" ? 1 : colorAlpha);
    if (alpha <= 0) continue;
    const batchStart = dabs.length;
    let capacityExceeded = false;
    let invalidStroke = false;
    const pushDab = (x: number, y: number, pressure: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(pressure)) {
        complete = false;
        invalidStroke = true;
        return;
      }
      const radius = studioGpuPressureRadius(size, pressure, stroke.pressureModel);
      if (clipRect !== null && !dabIntersectsRect(x, y, radius, clipRect)) return;
      if (dabs.length >= maximumDabs) {
        complete = false;
        capacityExceeded = true;
        return;
      }
      dabs.push({
        x,
        y,
        radius,
        red,
        green,
        blue,
        alpha,
        composite,
      });
    };

    if (studioInkUsesResidualDabSpacing(stroke.pressureModel) && stroke.pressureModel) {
      const residualPlan = planStudioCausalInkDabs({
        samples: Array.from({ length: pointCount }, (_, sourceIndex) => ({
          x: stroke.points[sourceIndex * 2]!,
          y: stroke.points[sourceIndex * 2 + 1]!,
          pressure: pointPressure(stroke, sourceIndex),
          sourceIndex,
        })),
        size,
        pressureModel: stroke.pressureModel,
        maximumDabs: STUDIO_GPU_MAX_DABS,
      });
      if (!residualPlan.complete) {
        complete = false;
        invalidStroke = true;
      } else {
        const initialPressure = pointPressure(stroke, 0);
        const startIndex = includeInitialDab || initialPressure <= 0 ? 0 : 1;
        for (
          let index = startIndex;
          index < residualPlan.dabs.length && !capacityExceeded && !invalidStroke;
          index += 1
        ) {
          const dab = residualPlan.dabs[index]!;
          pushDab(dab.x, dab.y, dab.pressure);
        }
      }
    } else {
      const firstX = stroke.points[0];
      const firstY = stroke.points[1];
      if (!Number.isFinite(firstX) || !Number.isFinite(firstY)) continue;
      if (includeInitialDab) pushDab(firstX!, firstY!, pointPressure(stroke, 0));

      for (
        let pointIndex = 1;
        pointIndex < pointCount && !capacityExceeded && !invalidStroke;
        pointIndex += 1
      ) {
        const x0 = stroke.points[(pointIndex - 1) * 2];
        const y0 = stroke.points[(pointIndex - 1) * 2 + 1];
        const x1 = stroke.points[pointIndex * 2];
        const y1 = stroke.points[pointIndex * 2 + 1];
        if (![x0, y0, x1, y1].every((coordinate) => Number.isFinite(coordinate))) continue;
        const dx = x1! - x0!;
        const dy = y1! - y0!;
        const distance = Math.hypot(dx, dy);
        if (![dx, dy, distance].every(Number.isFinite)) {
          complete = false;
          invalidStroke = true;
          break;
        }
        if (distance <= 1e-6) continue;
        const p0 = pointPressure(stroke, pointIndex - 1);
        const p1 = pointPressure(stroke, pointIndex);
        // Frozen V1/legacy spacing contract for already-persisted strokes.
        const spacing = Math.max(
          0.5,
          Math.min(
            studioGpuPressureRadius(size, p0, stroke.pressureModel),
            studioGpuPressureRadius(size, p1, stroke.pressureModel)
          ) * 0.45
        );
        const steps = Math.max(1, Math.ceil(distance / spacing));
        if (!Number.isFinite(spacing) || !Number.isFinite(steps)) {
          complete = false;
          invalidStroke = true;
          break;
        }
        let firstStep = 1;
        let lastStep = steps;
        if (clipRect !== null) {
          if (!Number.isSafeInteger(steps)) {
            complete = false;
            invalidStroke = true;
            break;
          }
          const maximumRadius = Math.max(
            studioGpuPressureRadius(size, p0, stroke.pressureModel),
            studioGpuPressureRadius(size, p1, stroke.pressureModel)
          );
          const clipped = clipStudioGpuSegment(
            x0!,
            y0!,
            dx,
            dy,
            maximumRadius,
            clipRect
          );
          if (!clipped.valid) {
            complete = false;
            invalidStroke = true;
            break;
          }
          if (!clipped.interval) continue;
          const [minimumAmount, maximumAmount] = clipped.interval;
          // Expand by one sample on both ends, then use the exact circle test in `pushDab`.
          firstStep = Math.max(1, Math.floor(minimumAmount * steps) - 1);
          lastStep = Math.min(steps, Math.ceil(maximumAmount * steps) + 1);
        }
        for (
          let step = firstStep;
          step <= lastStep && !capacityExceeded && !invalidStroke;
          step += 1
        ) {
          const amount = step / steps;
          pushDab(
            x0! + dx * amount,
            y0! + dy * amount,
            p0 + (p1 - p0) * amount
          );
        }
      }
    }

    if (invalidStroke) {
      dabs.length = batchStart;
      break;
    }

    const batchCount = dabs.length - batchStart;
    if (batchCount <= 0) continue;
    const previous = batches.at(-1);
    if (previous?.composite === composite && previous.firstInstance + previous.instanceCount === batchStart) {
      previous.instanceCount += batchCount;
    } else {
      batches.push({ composite, firstInstance: batchStart, instanceCount: batchCount });
    }
    if (capacityExceeded) break;
  }

  return { dabs, batches, complete };
}

/**
 * Plans a residual V2 suffix from its cached feed phase. Non-feed callers reconstruct the phase
 * once from the retained prefix; the live WebGPU path reads no historical point coordinates.
 */
function planStudioGpuResidualStrokeExtensionInternal(
  stroke: StudioGpuStroke,
  previousPointCount: number,
  clipRect: StudioGpuRect | null,
  maximumDabs: number
): PlannedStudioGpuDabs {
  const pointCount = stroke.points.length / 2;
  if (
    !studioInkUsesResidualDabSpacing(stroke.pressureModel)
    || !stroke.pressureModel
    || !isValidStudioGpuStroke(stroke)
    || !Number.isSafeInteger(previousPointCount)
    || previousPointCount < 1
    || previousPointCount >= pointCount
    || !Number.isSafeInteger(maximumDabs)
    || maximumDabs < 0
    || (clipRect !== null && !validClipRect(clipRect))
  ) {
    return { dabs: [], batches: [], complete: false };
  }
  const parsedColor = parseStudioGpuColor(stroke.color);
  if (!parsedColor) return { dabs: [], batches: [], complete: false };
  const [red, green, blue, colorAlpha] = parsedColor;
  const composite: StudioGpuComposite = stroke.composite === "erase" ? "erase" : "normal";
  const alpha = (stroke.opacity ?? 1) * (composite === "erase" ? 1 : colorAlpha);
  if (alpha <= 0) return { dabs: [], batches: [], complete: true };

  const cached = studioGpuStrokeFeedRevisionAtPointCount(stroke, previousPointCount);
  let state = cached?.residualInkState;
  let totalDabCount = cached?.residualDabCount;
  if (!state || totalDabCount === undefined) {
    const started = startStudioResidualInk(
      {
        x: stroke.points[0]!,
        y: stroke.points[1]!,
        pressure: pointPressure(stroke, 0),
        sourceIndex: 0,
      },
      stroke.size,
      stroke.pressureModel,
      STUDIO_GPU_MAX_DABS
    );
    if (!started.complete) return { dabs: [], batches: [], complete: false };
    state = started.state;
    totalDabCount = started.dabs.length;
    for (let sourceIndex = 1; sourceIndex < previousPointCount; sourceIndex += 1) {
      const advanced = advanceStudioResidualInk(
        state,
        {
          x: stroke.points[sourceIndex * 2]!,
          y: stroke.points[sourceIndex * 2 + 1]!,
          pressure: pointPressure(stroke, sourceIndex),
          sourceIndex,
        },
        stroke.size,
        stroke.pressureModel,
        STUDIO_GPU_MAX_DABS - totalDabCount
      );
      if (!advanced.complete) return { dabs: [], batches: [], complete: false };
      state = advanced.state;
      totalDabCount += advanced.dabs.length;
    }
  }

  // 예산 초과로 조기 반환할 때도 dabs/batches 쌍은 legacy 플래너(planStudioGpuDabsInternal)와
  // 동일 계약을 유지한다 — 이미 쌓인 dabs 만큼은 항상 유효한 batch 로 커밋해 반환한다. 현재
  // 두 호출부 모두 complete=false 면 결과 전체를 버리므로 지금 당장 관측되는 차이는 없지만,
  // 부분 결과를 살리려는 향후 호출부가 비어 있는 batches 를 만나 픽셀을 조용히 누락시키는
  // 함정을 없앤다.
  const batchesFor = (list: readonly StudioGpuDab[]) =>
    list.length === 0 ? [] : [{ composite, firstInstance: 0, instanceCount: list.length }];

  const dabs: StudioGpuDab[] = [];
  for (let sourceIndex = previousPointCount; sourceIndex < pointCount; sourceIndex += 1) {
    const advanced = advanceStudioResidualInk(
      state,
      {
        x: stroke.points[sourceIndex * 2]!,
        y: stroke.points[sourceIndex * 2 + 1]!,
        pressure: pointPressure(stroke, sourceIndex),
        sourceIndex,
      },
      stroke.size,
      stroke.pressureModel,
      STUDIO_GPU_MAX_DABS - totalDabCount
    );
    if (!advanced.complete) return { dabs, batches: batchesFor(dabs), complete: false };
    state = advanced.state;
    totalDabCount += advanced.dabs.length;
    for (const dab of advanced.dabs) {
      if (clipRect !== null && !dabIntersectsRect(dab.x, dab.y, dab.radius, clipRect)) continue;
      if (dabs.length >= maximumDabs) return { dabs, batches: batchesFor(dabs), complete: false };
      dabs.push({
        x: dab.x,
        y: dab.y,
        radius: dab.radius,
        red,
        green,
        blue,
        alpha,
        composite,
      });
    }
  }
  return { dabs, batches: batchesFor(dabs), complete: true };
}

/** CPU planning is shared by Canvas2D and non-tiled callers with identical geometry and ordering. */
export function planStudioGpuDabs(strokes: readonly StudioGpuStroke[]): PlannedStudioGpuDabs {
  return planStudioGpuDabsInternal(strokes, {
    clipRect: null,
    maximumDabs: STUDIO_GPU_MAX_DABS,
    includeInitialDab: true,
  });
}

/**
 * Plans only round dabs whose coverage intersects one tile render rectangle. Segment step counts,
 * pressure interpolation, and batch ordering remain byte-for-byte compatible with the full plan.
 */
export function planStudioGpuDabsInRect(
  strokes: readonly StudioGpuStroke[],
  clipRect: StudioGpuRect,
  maximumDabs = STUDIO_GPU_MAX_DABS
): PlannedStudioGpuDabs {
  return planStudioGpuDabsInternal(strokes, {
    clipRect,
    maximumDabs,
    includeInitialDab: true,
  });
}

/** Plans the bridge from the retained endpoint plus only the newly appended point suffix. */
export function planStudioGpuStrokeExtensionInRect(
  stroke: StudioGpuStroke,
  previousPointCount: number,
  clipRect: StudioGpuRect,
  maximumDabs = STUDIO_GPU_MAX_DABS
): PlannedStudioGpuDabs {
  const pointCount = stroke.points.length / 2;
  if (
    !Number.isSafeInteger(previousPointCount)
    || previousPointCount < 1
    || previousPointCount >= pointCount
  ) {
    return { dabs: [], batches: [], complete: false };
  }
  if (studioInkUsesResidualDabSpacing(stroke.pressureModel)) {
    return planStudioGpuResidualStrokeExtensionInternal(
      stroke,
      previousPointCount,
      clipRect,
      maximumDabs
    );
  }
  const feedSuffix = studioGpuStrokeFeedSuffixFromPointCount(stroke, previousPointCount);
  if (feedSuffix) {
    return planStudioGpuDabsInternal([feedSuffix], {
      clipRect,
      maximumDabs,
      includeInitialDab: false,
    });
  }
  const suffixStart = previousPointCount - 1;
  const suffixPointCount = pointCount - suffixStart;
  const suffix: StudioGpuStroke = {
    ...stroke,
    points: stroke.points.slice(suffixStart * 2),
    pressures: Array.from(
      { length: suffixPointCount },
      (_, index) => pointPressure(stroke, suffixStart + index)
    ),
  };
  return planStudioGpuDabsInternal([suffix], {
    clipRect,
    maximumDabs,
    includeInitialDab: false,
  });
}

function sameStrokeStyle(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  return sameStudioGpuStrokeFeedStyle(previous, next);
}

function isStrictPointPrefix(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  const previousFeed = previous[STUDIO_GPU_STROKE_FEED_REVISION];
  const nextFeed = next[STUDIO_GPU_STROKE_FEED_REVISION];
  if (previousFeed && nextFeed) {
    return previousFeed.lineage === nextFeed.lineage
      && previousFeed.pointCount < nextFeed.pointCount;
  }
  if (previous.points.length < 2 || previous.points.length % 2 !== 0) return false;
  if (next.points.length <= previous.points.length || next.points.length % 2 !== 0) return false;
  for (let index = 0; index < previous.points.length; index += 1) {
    if (!Number.isFinite(previous.points[index])) return false;
    if (!Object.is(previous.points[index], next.points[index])) return false;
  }
  const previousPointCount = previous.points.length / 2;
  for (let index = 0; index < previousPointCount; index += 1) {
    if (!Object.is(pointPressure(previous, index), pointPressure(next, index))) return false;
  }
  return true;
}

function isExactStrokeMatch(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  const previousFeed = previous[STUDIO_GPU_STROKE_FEED_REVISION];
  const nextFeed = next[STUDIO_GPU_STROKE_FEED_REVISION];
  if (previousFeed && nextFeed) {
    return previousFeed.token === nextFeed.token
      && previous.points === next.points
      && previous.pressures === next.pressures;
  }
  if (!sameStrokeStyle(previous, next) || previous.points.length !== next.points.length) {
    return false;
  }
  if (previous.points.length % 2 !== 0) return false;
  for (let index = 0; index < previous.points.length; index += 1) {
    if (!Number.isFinite(previous.points[index])) return false;
    if (!Object.is(previous.points[index], next.points[index])) return false;
  }
  const pointCount = previous.points.length / 2;
  for (let index = 0; index < pointCount; index += 1) {
    if (!Object.is(pointPressure(previous, index), pointPressure(next, index))) return false;
  }
  return true;
}

function concatenateStudioGpuDabPlans(
  plans: readonly PlannedStudioGpuDabs[]
): PlannedStudioGpuDabs {
  const dabs: StudioGpuDab[] = [];
  const batches: StudioGpuBatch[] = [];
  for (const plan of plans) {
    const instanceOffset = dabs.length;
    dabs.push(...plan.dabs);
    for (const batch of plan.batches) {
      const firstInstance = instanceOffset + batch.firstInstance;
      const previous = batches.at(-1);
      if (
        previous?.composite === batch.composite
        && previous.firstInstance + previous.instanceCount === firstInstance
      ) {
        previous.instanceCount += batch.instanceCount;
      } else {
        batches.push({ ...batch, firstInstance });
      }
    }
  }
  return { dabs, batches, complete: plans.every((plan) => plan.complete) };
}

function withoutInitialDab(plan: PlannedStudioGpuDabs): PlannedStudioGpuDabs {
  if (plan.dabs.length <= 1) return { dabs: [], batches: [], complete: plan.complete };
  const dabs = plan.dabs.slice(1);
  const batches = plan.batches.flatMap((batch) => {
    const batchEnd = batch.firstInstance + batch.instanceCount;
    const retainedStart = Math.max(1, batch.firstInstance);
    if (batchEnd <= retainedStart) return [];
    return [{
      composite: batch.composite,
      firstInstance: retainedStart - 1,
      instanceCount: batchEnd - retainedStart,
    }];
  });
  return { dabs, batches, complete: plan.complete };
}

/**
 * Plans only the newly appended segments of one immutable live stroke. Any changed historical
 * sample (for example a replaced pointer-prediction tail) deliberately requests a full rebuild.
 */
export function planStudioGpuDabUpdate(
  previousStrokes: readonly StudioGpuStroke[],
  nextStrokes: readonly StudioGpuStroke[]
): StudioGpuDabRenderUpdate {
  const previousOrdered = orderStudioGpuStrokes(previousStrokes);
  const nextOrdered = orderStudioGpuStrokes(nextStrokes);
  const sharedCount = Math.min(previousOrdered.length, nextOrdered.length);
  let exactPrefixCount = 0;
  while (
    exactPrefixCount < sharedCount
    && isExactStrokeMatch(previousOrdered[exactPrefixCount]!, nextOrdered[exactPrefixCount]!)
  ) {
    exactPrefixCount += 1;
  }

  // An immutable operation-log suffix is safe to composite over the retained texture. This is the
  // important layer-level case: a new destination-out stroke can erase earlier normal strokes
  // without replaying them, while a new normal stroke can paint over an earlier eraser.
  if (exactPrefixCount === previousOrdered.length && nextOrdered.length >= previousOrdered.length) {
    return {
      mode: "append",
      ...planStudioGpuDabs(nextOrdered.slice(previousOrdered.length)),
    };
  }

  // The common live-input case keeps immutable completed strokes and extends only the final one.
  // New strokes that already follow it in deterministic order can be appended in the same pass.
  const terminalIndex = previousOrdered.length - 1;
  const previousTerminal = previousOrdered[terminalIndex];
  const nextTerminal = nextOrdered[terminalIndex];
  if (
    terminalIndex >= 0
    && exactPrefixCount === terminalIndex
    && nextOrdered.length >= previousOrdered.length
    && previousTerminal
    && nextTerminal
    && sameStrokeStyle(previousTerminal, nextTerminal)
    && isStrictPointPrefix(previousTerminal, nextTerminal)
  ) {
    if (studioInkUsesResidualDabSpacing(nextTerminal.pressureModel)) {
      const residualSuffix = planStudioGpuResidualStrokeExtensionInternal(
        nextTerminal,
        previousTerminal.points.length / 2,
        null,
        STUDIO_GPU_MAX_DABS
      );
      if (!residualSuffix.complete) {
        return { mode: "rebuild", ...planStudioGpuDabs(nextOrdered) };
      }
      return {
        mode: "append",
        ...concatenateStudioGpuDabPlans([
          residualSuffix,
          planStudioGpuDabs(nextOrdered.slice(previousOrdered.length)),
        ]),
      };
    }
    const previousPointCount = previousTerminal.points.length / 2;
    const feedSuffix = studioGpuStrokeFeedSuffixFromPointCount(
      nextTerminal,
      previousPointCount
    );
    const suffixStart = previousPointCount - 1;
    const suffixPointCount = nextTerminal.points.length / 2 - suffixStart;
    const suffix: StudioGpuStroke = feedSuffix ?? {
      ...nextTerminal,
      points: nextTerminal.points.slice(suffixStart * 2),
      pressures: Array.from(
        { length: suffixPointCount },
        (_, index) => pointPressure(nextTerminal, suffixStart + index)
      ),
    };
    return {
      mode: "append",
      ...concatenateStudioGpuDabPlans([
        withoutInitialDab(planStudioGpuDabs([suffix])),
        planStudioGpuDabs(nextOrdered.slice(previousOrdered.length)),
      ]),
    };
  }

  // Deletion, insertion before retained content, prediction-tail replacement and any historical
  // style/sample change can alter pixels already in the texture and therefore requires replay.
  return { mode: "rebuild", ...planStudioGpuDabs(nextOrdered) };
}

function limitStudioGpuDabPlan(
  update: StudioGpuDabRenderUpdate,
  maximumDabs: number
): StudioGpuDabRenderUpdate {
  if (update.dabs.length <= maximumDabs) return update;
  const dabs = update.dabs.slice(0, Math.max(0, maximumDabs));
  const batches = update.batches.flatMap((batch) => {
    if (batch.firstInstance >= dabs.length) return [];
    return [{
      ...batch,
      instanceCount: Math.min(batch.instanceCount, dabs.length - batch.firstInstance),
    }];
  });
  return { mode: update.mode, dabs, batches, complete: false };
}

function bufferUsage(): number {
  // Stable WebGPU flags: VERTEX (0x20) | COPY_DST (0x08). Numeric flags also keep node-side
  // fake-device tests independent of whether TypeScript's DOM lib exposes GPUBufferUsage itself.
  return 0x20 | 0x08;
}

function presentationTextureUsage(retainReadbackSnapshot: boolean): number {
  // RENDER_ATTACHMENT (0x10) | COPY_DST (0x02). COPY_SRC (0x01) is requested only when the
  // consumer opted into immutable receipt readback; live draft presentation never needs it.
  return 0x10 | 0x02 | (retainReadbackSnapshot ? 0x01 : 0);
}

function readbackTextureUsage(): number {
  // COPY_SRC (0x01) | COPY_DST (0x02).
  return 0x01 | 0x02;
}

function readbackBufferUsage(): number {
  // MAP_READ (0x01) | COPY_DST (0x08).
  return 0x01 | 0x08;
}

function safeDestroyDevice(device: GPUDevice | null): void {
  if (!device) return;
  try {
    device.destroy();
  } catch {
    // A lost/already-destroyed device is already released.
  }
}

function safeUnconfigure(context: GPUCanvasContext | null): void {
  if (!context) return;
  try {
    context.unconfigure();
  } catch {
    // Some implementations throw after device loss; fallback does not depend on unconfigure.
  }
}

function safeDestroyTexture(texture: GPUTexture | null): void {
  if (!texture) return;
  try {
    texture.destroy();
  } catch {
    // Lost-device and already-retired snapshots are both fully released states.
  }
}

function sameStudioGpuFrameReceipt(
  left: StudioGpuFrameReceipt,
  right: StudioGpuFrameReceipt
): boolean {
  return left.requestId === right.requestId
    && left.fingerprint === right.fingerprint
    && left.backend === right.backend
    && left.complete === right.complete
    && left.strokeCount === right.strokeCount
    && left.dabCount === right.dabCount
    && left.physicalWidth === right.physicalWidth
    && left.physicalHeight === right.physicalHeight;
}

function snapshotStudioGpuReadbackArea(area: StudioGpuReadbackArea): StudioGpuReadbackArea | null {
  if (!area || typeof area !== "object") return null;
  if (area.kind === "viewport") return { kind: "viewport" };
  if (area.kind !== "document" || !area.rect || typeof area.rect !== "object") return null;
  return { kind: "document", rect: { ...area.rect } };
}

type StudioGpuReadbackTextureFormat =
  | "bgra8unorm"
  | "rgba8unorm";

function readbackTextureFormat(
  format: GPUTextureFormat | null | undefined
): StudioGpuReadbackTextureFormat | null {
  return format === "bgra8unorm"
    || format === "rgba8unorm"
    ? format
    : null;
}

function readbackSnapshotByteLength(width: number, height: number): number | null {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  const pixelCount = width * height;
  if (
    !Number.isSafeInteger(pixelCount)
    || pixelCount > STUDIO_GPU_MAX_READBACK_PIXELS
  ) {
    return null;
  }
  const byteLength = pixelCount * 4;
  return Number.isSafeInteger(byteLength) && byteLength <= STUDIO_GPU_MAX_READBACK_SNAPSHOT_BYTES
    ? byteLength
    : null;
}

interface StudioGpuFrameSnapshot {
  readonly texture: GPUTexture;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly byteLength: number;
  readonly alphaMode: "premultiplied";
  readers: number;
  retired: boolean;
}

interface StudioGpuAuthorityFrame {
  readonly receipt: StudioGpuFrameReceipt;
  readonly generation: number;
  readonly snapshot: StudioGpuFrameSnapshot | null;
}

export class StudioWebGpuEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly fallbackCanvas: HTMLCanvasElement;
  private readonly options: StudioWebGpuEngineOptions;
  private readonly hasGpuOverride: boolean;
  private readonly retainReadbackSnapshot: boolean;
  private readonly strokeFeedEngineId = ++studioGpuEngineInstanceSequence;

  private backend: StudioGpuBackend = "canvas2d";
  private fallbackContext: CanvasRenderingContext2D | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;
  private normalPipeline: GPURenderPipeline | null = null;
  private erasePipeline: GPURenderPipeline | null = null;
  private presentationPipeline: GPURenderPipeline | null = null;
  private presentationSampler: GPUSampler | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private instanceCapacity = 0;
  private presentationBuffer: GPUBuffer | null = null;
  private presentationCapacity = 0;
  private tileRuntime: StudioGpuTileRuntime<GPUTexture> | null = null;
  private tileRuntimeDevice: GPUDevice | null = null;
  private tileRuntimeResolutionScale = 0;
  private activeTileFrame: {
    readonly runtime: StudioGpuTileRuntime<GPUTexture>;
    readonly token: StudioGpuTileFrameToken;
    readonly device: GPUDevice;
  } | null = null;
  private webGpuRenderInFlight = false;
  private webGpuRenderFlightId = 0;
  private pendingWebGpuRender: {
    readonly strokes: readonly StudioGpuStroke[];
    readonly requestId: string;
    readonly frameGeneration: number;
  } | null = null;
  private initializationPromise: Promise<StudioGpuBackend> | null = null;
  private lifecycleGeneration = 0;
  private disposed = false;
  private suspended = false;
  private viewport = normalizeViewport({ logicalWidth: 1, logicalHeight: 1 });
  private lastStrokes: readonly StudioGpuStroke[] = [];
  private renderedStrokes: readonly StudioGpuStroke[] | null = null;
  private renderedBackend: StudioGpuBackend | null = null;
  private renderedDabCount = 0;
  private renderedFrameComplete = false;
  private renderedFrameInvalid = true;
  private frameGeneration = 0;
  private lastRequestId = "initial";
  private strokeFeedSequence = 0;
  private authorityFrame: StudioGpuAuthorityFrame | null = null;
  private readonly readbackSnapshotPool: StudioGpuFrameSnapshot[] = [];
  private readonly readbackSnapshots = new Set<StudioGpuFrameSnapshot>();
  private activeWebGpuReadbacks = 0;

  constructor(options: StudioWebGpuEngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.fallbackCanvas = options.fallbackCanvas;
    this.hasGpuOverride = Object.prototype.hasOwnProperty.call(options, "gpu");
    this.retainReadbackSnapshot = options.retainReadbackSnapshot !== false;
    this.setSurfaceVisibility("canvas2d");
  }

  public getBackend(): StudioGpuBackend {
    return this.backend;
  }

  public initialize(): Promise<StudioGpuBackend> {
    if (this.disposed) return Promise.resolve(this.backend);
    if (this.backend === "webgpu" && this.device) return Promise.resolve(this.backend);
    // React remounts, eager feature warm-up and an explicit retry may all reach this boundary in
    // the same task. Adapter/device acquisition is not cancellable, so superseding an in-flight
    // request would allocate a second device only to destroy the first one when it resolves.
    if (this.initializationPromise) return this.initializationPromise;
    if (this.device) {
      const previousDevice = this.device;
      this.invalidateAuthorityFrame();
      this.destroyReadbackSnapshotPool();
      this.device = null;
      this.normalPipeline = null;
      this.erasePipeline = null;
      this.presentationPipeline = null;
      this.presentationSampler = null;
      this.format = null;
      this.instanceBuffer?.destroy();
      this.instanceBuffer = null;
      this.instanceCapacity = 0;
      this.presentationBuffer?.destroy();
      this.presentationBuffer = null;
      this.presentationCapacity = 0;
      this.destroyTileRuntime();
      safeUnconfigure(this.context);
      this.context = null;
      safeDestroyDevice(previousDevice);
    }
    const generation = ++this.lifecycleGeneration;
    this.activateCanvas2d();
    const initialization = this.initializeWebGpu(generation)
      .then((ready) => {
        if (
          ready
          && !this.disposed
          && !this.suspended
          && generation === this.lifecycleGeneration
        ) {
          this.render(this.lastStrokes);
        }
        return this.backend;
      })
      .finally(() => {
        this.initializationPromise = null;
      });
    this.initializationPromise = initialization;
    return initialization;
  }

  public resize(input: StudioGpuViewport): void {
    if (this.disposed) return;
    const nextViewport = normalizeViewport(input);
    const textureLimit = Math.max(
      1,
      Number(this.device?.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION)
    );
    const requestedWidth = Math.max(1, Math.round(nextViewport.cssWidth * nextViewport.dpr));
    const requestedHeight = Math.max(1, Math.round(nextViewport.cssHeight * nextViewport.dpr));
    const fit = Math.min(1, textureLimit / requestedWidth, textureLimit / requestedHeight);
    const physicalWidth = Math.max(1, Math.floor(requestedWidth * fit));
    const physicalHeight = Math.max(1, Math.floor(requestedHeight * fit));
    const viewportChanged = Object.keys(nextViewport).some((key) => {
      const viewportKey = key as keyof NormalizedStudioGpuViewport;
      return !Object.is(nextViewport[viewportKey], this.viewport[viewportKey]);
    });
    const physicalSizeChanged = this.canvas.width !== physicalWidth ||
      this.canvas.height !== physicalHeight ||
      this.fallbackCanvas.width !== physicalWidth ||
      this.fallbackCanvas.height !== physicalHeight;
    this.viewport = nextViewport;
    if (!viewportChanged && !physicalSizeChanged) return;

    for (const surface of new Set([this.canvas, this.fallbackCanvas])) {
      if (surface.width !== physicalWidth) surface.width = physicalWidth;
      if (surface.height !== physicalHeight) surface.height = physicalHeight;
    }
    this.evictIncompatibleReadbackSnapshots(
      this.device,
      this.format,
      physicalWidth,
      physicalHeight
    );
    // Resizing discards presentation pixels; transforms also change visible-tile selection/quads.
    this.invalidateRenderedFrame();
    this.configureContext();
    if (!this.suspended) this.render(this.lastStrokes);
  }

  public render(strokes: readonly StudioGpuStroke[], requestId = this.lastRequestId): void {
    if (this.disposed) return;
    this.renderPreparedStrokes(snapshotStudioGpuStrokes(strokes), requestId);
  }

  /**
   * Starts/replaces an imperative feed. This is the sole full-array baseline cost; subsequent
   * accepted suffixes use `appendStrokeFeedSuffix` and retain this immutable revision lineage.
   */
  public replaceStrokeFeed(
    strokes: readonly StudioGpuStroke[],
    requestId = this.lastRequestId
  ): void {
    if (this.disposed) return;
    this.strokeFeedSequence += 1;
    if (!strokes.every(isValidStudioGpuStroke)) {
      this.render(strokes, requestId);
      return;
    }
    const baseline = createStudioGpuStrokeFeedBaseline(
      strokes,
      `engine:${this.strokeFeedEngineId}:feed:${this.strokeFeedSequence}`
    );
    if (!baseline) {
      this.render(strokes, requestId);
      return;
    }
    this.renderPreparedStrokes(baseline, requestId);
  }

  /**
   * Appends only new point pairs. A stale index/count, style change, malformed suffix, or missing
   * lineage automatically falls back to the authoritative full replacement carried by the patch.
   */
  public appendStrokeFeedSuffix(
    patch: StudioGpuStrokeSuffixPatch,
    requestId = this.lastRequestId
  ): "appended" | "rebuilt" {
    if (this.disposed) return "rebuilt";
    const advanced = advanceStudioGpuStrokeFeed(this.lastStrokes, patch);
    if (advanced.status === "rejected") {
      this.replaceStrokeFeed(patch.fallbackStrokes, requestId);
      return "rebuilt";
    }
    this.renderPreparedStrokes(advanced.strokes, requestId);
    return "appended";
  }

  /** Adds newly-started normal/erase operations without replaying retained operation history. */
  public appendStrokeFeedOperations(
    patch: StudioGpuStrokeOperationsAppendPatch,
    requestId = this.lastRequestId
  ): "appended" | "rebuilt" {
    if (this.disposed) return "rebuilt";
    if (!patch.suffixStrokes.every(isValidStudioGpuStroke)) {
      this.replaceStrokeFeed(patch.fallbackStrokes, requestId);
      return "rebuilt";
    }
    this.strokeFeedSequence += 1;
    const advanced = appendStudioGpuStrokeFeedOperations(
      this.lastStrokes,
      patch,
      `engine:${this.strokeFeedEngineId}:feed:${this.strokeFeedSequence}`
    );
    if (!advanced) {
      this.replaceStrokeFeed(patch.fallbackStrokes, requestId);
      return "rebuilt";
    }
    this.renderPreparedStrokes(advanced, requestId);
    return "appended";
  }

  /** Issues a new request/receipt for unchanged pinned pixels without inspecting point history. */
  public retainStrokeFeed(requestId = this.lastRequestId): void {
    if (this.disposed) return;
    this.renderPreparedStrokes(this.lastStrokes, requestId);
  }

  /** Clears pinned feed authority without allocating or submitting an empty replacement frame. */
  public resetStrokeFeed(requestId = this.lastRequestId): void {
    this.suspend(requestId);
  }

  private renderPreparedStrokes(
    strokeSnapshot: readonly StudioGpuStroke[],
    requestId: string
  ): void {
    if (this.suspended) {
      this.suspended = false;
      this.setSurfaceVisibility(this.backend);
    }
    this.lastStrokes = strokeSnapshot;
    this.lastRequestId = requestId;
    const frameGeneration = this.invalidateFrameReceipt();
    if (
      this.backend === "webgpu" &&
      this.device &&
      this.context &&
      this.normalPipeline &&
      this.erasePipeline &&
      this.presentationPipeline &&
      this.presentationSampler
    ) {
      const request = { strokes: strokeSnapshot, requestId, frameGeneration };
      if (this.webGpuRenderInFlight) {
        // Pointer input can outrun GPU completion. Keep only the newest request while allowing the
        // submitted prefix frame to finish into its retained textures; cancelling here would
        // destroy those textures and restart allocation on every pointermove.
        this.pendingWebGpuRender = request;
      } else {
        this.startWebGpuRender(request);
      }
      return;
    }
    this.pendingWebGpuRender = null;
    this.cancelActiveTileFrame();
    this.renderCanvas2d(strokeSnapshot, requestId, frameGeneration);
  }

  public clear(): void {
    this.render([]);
  }

  /**
   * Revokes the current presentation without rendering an empty replacement frame. Retained tile
   * and readback resources are released, while a successfully-created GPU device stays warm for
   * the next supported stroke. A later `render()` resumes the engine automatically.
   */
  public suspend(requestId = this.lastRequestId): void {
    if (this.disposed) return;
    const requestChanged = requestId !== this.lastRequestId;
    const hadPresentation = this.lastStrokes.length > 0
      || this.renderedStrokes !== null
      || this.authorityFrame !== null;
    this.lastStrokes = [];
    this.lastRequestId = requestId;
    if (this.suspended && !requestChanged) return;

    this.suspended = true;
    this.supersedeWebGpuRenderFlight();
    this.destroyTileRuntime();
    this.invalidateRenderedFrame();
    this.invalidateFrameReceipt();
    // `invalidateFrameReceipt` retires the authority snapshot into this pool when there are no
    // readers. Destroy it immediately so an inactive live canvas retains no full-surface copy.
    this.destroyReadbackSnapshotPool();
    if (hadPresentation && this.backend === "canvas2d") this.clearCanvas2d();
    this.setSurfaceVisibility(this.backend);
  }

  /**
   * Reads only a receipt-authorized immutable frame. Any render, resize, backend switch, device
   * loss, or disposal that happens before completion turns the result into a stale rejection.
   */
  public async captureFrame(
    request: StudioGpuFrameReadbackRequest
  ): Promise<StudioGpuFrameReadbackResult> {
    if (this.disposed) return { status: "rejected", reason: "disposed" };
    if (!request || typeof request !== "object") {
      return { status: "rejected", reason: "invalid-area" };
    }
    const area = snapshotStudioGpuReadbackArea(request.area);
    if (!area) return { status: "rejected", reason: "invalid-area" };
    if (!request.receipt || typeof request.receipt !== "object") {
      return { status: "rejected", reason: "invalid-area" };
    }
    const frame = this.authorityFrame;
    if (
      !frame
      || frame.receipt !== request.receipt
      || !sameStudioGpuFrameReceipt(frame.receipt, request.receipt)
    ) {
      return { status: "rejected", reason: "stale-frame" };
    }
    const planned = planStudioGpuReadbackLayout(
      area,
      this.viewport,
      frame.receipt.physicalWidth,
      frame.receipt.physicalHeight
    );
    if (planned.status === "rejected") return planned;
    if (!this.isAuthorityFrameCurrent(frame)) {
      return { status: "rejected", reason: "stale-frame" };
    }
    return frame.receipt.backend === "webgpu"
      ? this.captureWebGpuFrame(frame, area, planned.layout)
      : this.captureCanvas2dFrame(frame, area, planned.layout);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.pendingWebGpuRender = null;
    this.invalidateFrameReceipt();
    const device = this.device;
    this.device = null;
    this.normalPipeline = null;
    this.erasePipeline = null;
    this.presentationPipeline = null;
    this.presentationSampler = null;
    this.format = null;
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.presentationBuffer?.destroy();
    this.presentationBuffer = null;
    this.presentationCapacity = 0;
    this.destroyTileRuntime();
    this.invalidateRenderedFrame();
    this.invalidateAuthorityFrame();
    if (device) this.destroyReadbackSnapshotsForDevice(device);
    else this.destroyReadbackSnapshotPool();
    safeUnconfigure(this.context);
    this.context = null;
    safeDestroyDevice(device);
    this.clearCanvas2d();
  }

  private isAuthorityFrameCurrent(frame: StudioGpuAuthorityFrame): boolean {
    return this.authorityFrame === frame
      && frame.generation === this.frameGeneration
      && frame.receipt.backend === this.backend
      && frame.receipt.physicalWidth === this.canvas.width
      && frame.receipt.physicalHeight === this.canvas.height;
  }

  private retireFrameSnapshot(snapshot: StudioGpuFrameSnapshot | null): void {
    if (!snapshot || snapshot.retired) return;
    snapshot.retired = true;
    if (snapshot.readers === 0) this.poolFrameSnapshot(snapshot);
  }

  private releaseFrameSnapshotReader(snapshot: StudioGpuFrameSnapshot): void {
    snapshot.readers = Math.max(0, snapshot.readers - 1);
    if (snapshot.retired && snapshot.readers === 0) this.poolFrameSnapshot(snapshot);
  }

  private destroyFrameSnapshot(snapshot: StudioGpuFrameSnapshot): void {
    const pooledIndex = this.readbackSnapshotPool.indexOf(snapshot);
    if (pooledIndex >= 0) this.readbackSnapshotPool.splice(pooledIndex, 1);
    if (!this.readbackSnapshots.delete(snapshot)) return;
    safeDestroyTexture(snapshot.texture);
  }

  private allocatedReadbackSnapshotBytes(): number {
    let total = 0;
    for (const snapshot of this.readbackSnapshots) total += snapshot.byteLength;
    return total;
  }

  private allocatedReadbackSnapshotPixels(): number {
    let total = 0;
    for (const snapshot of this.readbackSnapshots) total += snapshot.pixelCount;
    return total;
  }

  private isSnapshotCompatible(
    snapshot: StudioGpuFrameSnapshot,
    device: GPUDevice | null,
    format: GPUTextureFormat | null,
    width: number,
    height: number
  ): boolean {
    const expectedByteLength = readbackSnapshotByteLength(width, height);
    return expectedByteLength !== null
      && readbackTextureFormat(format) !== null
      && snapshot.device === device
      && snapshot.format === format
      && snapshot.width === width
      && snapshot.height === height
      && snapshot.pixelCount === width * height
      && snapshot.byteLength === expectedByteLength
      && snapshot.readers === 0;
  }

  private evictIncompatibleReadbackSnapshots(
    device: GPUDevice | null,
    format: GPUTextureFormat | null,
    width: number,
    height: number
  ): void {
    for (const snapshot of [...this.readbackSnapshotPool]) {
      if (!this.isSnapshotCompatible(snapshot, device, format, width, height)) {
        this.destroyFrameSnapshot(snapshot);
      }
    }
  }

  private poolFrameSnapshot(snapshot: StudioGpuFrameSnapshot): void {
    if (this.readbackSnapshotPool.includes(snapshot)) return;
    if (
      this.disposed
      || this.suspended
      || !this.isSnapshotCompatible(
        snapshot,
        this.device,
        this.format,
        this.canvas.width,
        this.canvas.height
      )
    ) {
      this.destroyFrameSnapshot(snapshot);
      return;
    }
    if (this.readbackSnapshotPool.length >= STUDIO_GPU_READBACK_SNAPSHOT_POOL_SIZE) {
      const evicted = this.readbackSnapshotPool.shift();
      if (evicted) this.destroyFrameSnapshot(evicted);
    }
    this.readbackSnapshotPool.push(snapshot);
  }

  private acquireFrameSnapshot(
    device: GPUDevice,
    format: GPUTextureFormat,
    width: number,
    height: number
  ): StudioGpuFrameSnapshot | null {
    const byteLength = readbackSnapshotByteLength(width, height);
    if (byteLength === null || readbackTextureFormat(format) === null) return null;
    const pixelCount = width * height;
    this.evictIncompatibleReadbackSnapshots(device, format, width, height);
    const reusableIndex = this.readbackSnapshotPool.findIndex((snapshot) => (
      this.isSnapshotCompatible(snapshot, device, format, width, height)
    ));
    if (reusableIndex >= 0) {
      const snapshot = this.readbackSnapshotPool.splice(reusableIndex, 1)[0]!;
      snapshot.retired = false;
      return snapshot;
    }
    if (
      this.readbackSnapshots.size >= STUDIO_GPU_MAX_READBACK_SNAPSHOTS
      || this.allocatedReadbackSnapshotPixels() + pixelCount
        > STUDIO_GPU_MAX_READBACK_SNAPSHOT_PIXELS
      || this.allocatedReadbackSnapshotBytes() + byteLength
        > STUDIO_GPU_MAX_READBACK_SNAPSHOT_BYTES
    ) {
      return null;
    }
    const snapshot: StudioGpuFrameSnapshot = {
      texture: device.createTexture({
        label: "Studio authoritative frame readback snapshot",
        size: { width, height, depthOrArrayLayers: 1 },
        format,
        usage: readbackTextureUsage(),
      }),
      device,
      format,
      width,
      height,
      pixelCount,
      byteLength,
      alphaMode: "premultiplied",
      readers: 0,
      retired: false,
    };
    this.readbackSnapshots.add(snapshot);
    return snapshot;
  }

  private destroyReadbackSnapshotPool(): void {
    for (const snapshot of this.readbackSnapshotPool.splice(0)) {
      this.destroyFrameSnapshot(snapshot);
    }
  }

  private destroyReadbackSnapshotsForDevice(device: GPUDevice): void {
    // An unpublished presentation snapshot lives only in renderWebGpu's async flight, so it is
    // neither the authority frame nor reusable pool state while submitted work is pending. Device
    // loss can leave that promise unresolved indefinitely; release every texture owned by the
    // lost device now so the recovered device receives the full copy-on-write snapshot budget.
    for (const snapshot of [...this.readbackSnapshots]) {
      if (snapshot.device === device) this.destroyFrameSnapshot(snapshot);
    }
  }

  private invalidateAuthorityFrame(): void {
    const previous = this.authorityFrame;
    this.authorityFrame = null;
    this.retireFrameSnapshot(previous?.snapshot ?? null);
  }

  private publishAuthorityFrame(
    receipt: StudioGpuFrameReceipt,
    snapshot: StudioGpuFrameSnapshot | null
  ): StudioGpuAuthorityFrame | null {
    if (
      this.disposed
      || receipt.requestId !== this.lastRequestId
      || receipt.backend !== this.backend
      || receipt.physicalWidth !== this.canvas.width
      || receipt.physicalHeight !== this.canvas.height
    ) {
      this.retireFrameSnapshot(snapshot);
      return null;
    }
    this.invalidateAuthorityFrame();
    const frame: StudioGpuAuthorityFrame = {
      receipt,
      generation: this.frameGeneration,
      snapshot,
    };
    this.authorityFrame = frame;
    return frame;
  }

  private capturedReadback(
    frame: StudioGpuAuthorityFrame,
    area: StudioGpuReadbackArea,
    layout: StudioGpuReadbackLayout,
    pixels: Uint8ClampedArray
  ): StudioGpuFrameReadbackResult {
    if (!this.isAuthorityFrameCurrent(frame)) {
      return { status: "rejected", reason: "stale-frame" };
    }
    return {
      status: "captured",
      receipt: frame.receipt,
      area,
      pixelRect: {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      },
      width: layout.width,
      height: layout.height,
      pixels,
      format: "rgba8unorm",
      alphaMode: "unpremultiplied",
    };
  }

  private async captureCanvas2dFrame(
    frame: StudioGpuAuthorityFrame,
    area: StudioGpuReadbackArea,
    layout: StudioGpuReadbackLayout
  ): Promise<StudioGpuFrameReadbackResult> {
    const context = this.fallbackContext;
    if (
      !context
      || frame.snapshot !== null
      || this.fallbackCanvas.width !== frame.receipt.physicalWidth
      || this.fallbackCanvas.height !== frame.receipt.physicalHeight
    ) {
      return { status: "rejected", reason: "frame-unavailable" };
    }
    try {
      // getImageData snapshots synchronously. JavaScript cannot interleave a render between this
      // call and the generation check below, so no partially-mutated Canvas2D frame can escape.
      const image = context.getImageData(layout.x, layout.y, layout.width, layout.height);
      const expectedBytes = layout.width * layout.height * 4;
      if (image.data.byteLength !== expectedBytes) {
        return { status: "rejected", reason: "readback-failed" };
      }
      return this.capturedReadback(
        frame,
        area,
        layout,
        new Uint8ClampedArray(image.data)
      );
    } catch (error) {
      const name = typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : "";
      return {
        status: "rejected",
        reason: name === "SecurityError" ? "tainted" : "readback-failed",
      };
    }
  }

  private readbackRaceReason(
    frame: StudioGpuAuthorityFrame,
    snapshot: StudioGpuFrameSnapshot
  ): StudioGpuReadbackFailureReason {
    if (this.disposed) return "disposed";
    if (this.device !== snapshot.device) return "device-lost";
    return this.isAuthorityFrameCurrent(frame) ? "readback-failed" : "stale-frame";
  }

  private async captureWebGpuFrame(
    frame: StudioGpuAuthorityFrame,
    area: StudioGpuReadbackArea,
    layout: StudioGpuReadbackLayout
  ): Promise<StudioGpuFrameReadbackResult> {
    const snapshot = frame.snapshot;
    if (!snapshot) {
      if (readbackSnapshotByteLength(
        frame.receipt.physicalWidth,
        frame.receipt.physicalHeight
      ) === null) {
        return { status: "rejected", reason: "oversize" };
      }
      if (readbackTextureFormat(this.format) === null) {
        return { status: "rejected", reason: "unsupported-format" };
      }
      return { status: "rejected", reason: "frame-unavailable" };
    }
    const device = snapshot.device;
    if (snapshot.retired || this.device !== device) {
      return { status: "rejected", reason: "frame-unavailable" };
    }
    const format = readbackTextureFormat(snapshot.format);
    if (!format) return { status: "rejected", reason: "unsupported-format" };
    if (
      snapshot.width !== frame.receipt.physicalWidth
      || snapshot.height !== frame.receipt.physicalHeight
    ) {
      return { status: "rejected", reason: "frame-unavailable" };
    }
    if (this.activeWebGpuReadbacks >= STUDIO_GPU_MAX_CONCURRENT_READBACKS) {
      return { status: "rejected", reason: "busy" };
    }
    const maximumBufferSize = Number(
      device.limits.maxBufferSize ?? 256 * 1024 * 1024
    );
    if (
      !Number.isSafeInteger(layout.byteLength)
      || !Number.isFinite(maximumBufferSize)
      || maximumBufferSize <= 0
      || layout.byteLength > maximumBufferSize
    ) {
      return { status: "rejected", reason: "oversize" };
    }

    snapshot.readers += 1;
    this.activeWebGpuReadbacks += 1;
    let buffer: GPUBuffer | null = null;
    let mapped = false;
    try {
      if (!this.isAuthorityFrameCurrent(frame)) {
        return { status: "rejected", reason: "stale-frame" };
      }
      buffer = device.createBuffer({
        label: `Studio frame readback ${frame.receipt.requestId}`,
        size: layout.byteLength,
        usage: readbackBufferUsage(),
      });
      const encoder = device.createCommandEncoder({ label: "Studio frame readback" });
      encoder.copyTextureToBuffer(
        {
          texture: snapshot.texture,
          origin: { x: layout.x, y: layout.y, z: 0 },
        },
        {
          buffer,
          offset: 0,
          bytesPerRow: layout.bytesPerRow,
          rowsPerImage: layout.height,
        },
        { width: layout.width, height: layout.height, depthOrArrayLayers: 1 }
      );
      device.queue.submit([encoder.finish()]);
      await this.submittedWork(device);
      if (!this.isAuthorityFrameCurrent(frame)) {
        return { status: "rejected", reason: this.readbackRaceReason(frame, snapshot) };
      }
      await buffer.mapAsync(0x01, 0, layout.byteLength);
      mapped = true;
      if (!this.isAuthorityFrameCurrent(frame)) {
        return { status: "rejected", reason: this.readbackRaceReason(frame, snapshot) };
      }
      const pixels = copyStudioGpuReadbackRows(
        buffer.getMappedRange(0, layout.byteLength),
        layout,
        format,
        snapshot.alphaMode === "premultiplied"
      );
      if (!pixels) return { status: "rejected", reason: "readback-failed" };
      return this.capturedReadback(frame, area, layout, pixels);
    } catch {
      return {
        status: "rejected",
        reason: this.readbackRaceReason(frame, snapshot),
      };
    } finally {
      if (mapped && buffer) {
        try {
          buffer.unmap();
        } catch {
          // A lost device may already have invalidated the mapping.
        }
      }
      try {
        buffer?.destroy();
      } catch {
        // A failed/lost staging buffer has no remaining ownership.
      }
      this.releaseFrameSnapshotReader(snapshot);
      this.activeWebGpuReadbacks = Math.max(0, this.activeWebGpuReadbacks - 1);
    }
  }

  private gpu(): GPU | null {
    if (this.hasGpuOverride) return this.options.gpu ?? null;
    if (typeof navigator === "undefined") return null;
    return navigator.gpu ?? null;
  }

  private async initializeWebGpu(generation: number): Promise<boolean> {
    const gpu = this.gpu();
    if (!gpu || this.disposed || generation !== this.lifecycleGeneration) return false;

    let device: GPUDevice | null = null;
    let context: GPUCanvasContext | null = null;
    try {
      // Let the browser choose its default adapter. The compositor is already viewport-bounded,
      // while forcing a discrete GPU can cost battery/thermals and make device loss more likely on
      // portable systems. Browsers may still select the high-performance adapter when appropriate.
      const adapter = await gpu.requestAdapter();
      if (!adapter || this.disposed || generation !== this.lifecycleGeneration) return false;
      device = await adapter.requestDevice();
      if (this.disposed || generation !== this.lifecycleGeneration) {
        safeDestroyDevice(device);
        return false;
      }

      const candidate = this.context ?? this.canvas.getContext("webgpu");
      context = candidate && "configure" in candidate
        ? candidate as GPUCanvasContext
        : null;
      if (!context) {
        safeDestroyDevice(device);
        return false;
      }
      const format = gpu.getPreferredCanvasFormat();
      const shaderModule = device.createShaderModule({
        label: "Studio round-dab brush shader",
        code: STUDIO_GPU_BRUSH_SHADER,
      });
      const vertex: GPUVertexState = {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: INSTANCE_BYTES,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ],
          },
        ],
      };
      const basePipeline: Omit<GPURenderPipelineDescriptor, "fragment"> = {
        label: "Studio round-dab brush pipeline",
        layout: "auto",
        vertex,
        primitive: { topology: "triangle-list" },
      };
      const normalPipeline = device.createRenderPipeline({
        ...basePipeline,
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format: STUDIO_GPU_TILE_TEXTURE_FORMAT,
              blend: {
                color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
              },
            },
          ],
        },
      });
      const erasePipeline = device.createRenderPipeline({
        ...basePipeline,
        label: "Studio destination-out round-dab pipeline",
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format: STUDIO_GPU_TILE_TEXTURE_FORMAT,
              blend: {
                color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
              },
            },
          ],
        },
      });
      const presentationModule = device.createShaderModule({
        label: "Studio retained tile presentation shader",
        code: STUDIO_GPU_TILE_PRESENTATION_SHADER,
      });
      const presentationPipeline = device.createRenderPipeline({
        label: "Studio retained tile presentation pipeline",
        layout: "auto",
        vertex: {
          module: presentationModule,
          entryPoint: "vs_main",
          buffers: [{
            arrayStride: PRESENTATION_VERTEX_BYTES,
            stepMode: "vertex",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
            ],
          }],
        },
        fragment: {
          module: presentationModule,
          entryPoint: "fs_main",
          targets: [{ format }],
        },
        primitive: { topology: "triangle-list" },
      });
      const presentationSampler = device.createSampler({
        label: "Studio retained tile linear sampler",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
      });
      context.configure({
        device,
        format,
        alphaMode: "premultiplied",
        usage: presentationTextureUsage(this.retainReadbackSnapshot),
      });
      if (this.disposed || generation !== this.lifecycleGeneration) {
        safeUnconfigure(context);
        safeDestroyDevice(device);
        return false;
      }

      this.device = device;
      this.context = context;
      this.format = format;
      this.normalPipeline = normalPipeline;
      this.erasePipeline = erasePipeline;
      this.presentationPipeline = presentationPipeline;
      this.presentationSampler = presentationSampler;
      this.instanceBuffer?.destroy();
      this.instanceBuffer = null;
      this.instanceCapacity = 0;
      this.presentationBuffer?.destroy();
      this.presentationBuffer = null;
      this.presentationCapacity = 0;
      this.destroyTileRuntime();
      this.setBackend("webgpu");
      this.configureContext();
      void device.lost.then((info) => this.handleDeviceLost(device!, info));
      return true;
    } catch {
      safeUnconfigure(context);
      safeDestroyDevice(device);
      this.activateCanvas2d();
      return false;
    }
  }

  private handleDeviceLost(lostDevice: GPUDevice, info: GPUDeviceLostInfo): void {
    if (this.disposed || this.device !== lostDevice) return;
    const recoveryGeneration = ++this.lifecycleGeneration;
    // `GPUQueue.onSubmittedWorkDone()` is allowed to stay pending while a device transitions to
    // lost. Detach that obsolete async flight now so a successfully recovered device can submit
    // immediately; its eventual completion is fenced by `webGpuRenderFlightId` below.
    this.supersedeWebGpuRenderFlight();
    this.invalidateAuthorityFrame();
    this.destroyReadbackSnapshotsForDevice(lostDevice);
    this.device = null;
    this.normalPipeline = null;
    this.erasePipeline = null;
    this.presentationPipeline = null;
    this.presentationSampler = null;
    this.format = null;
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.presentationBuffer?.destroy();
    this.presentationBuffer = null;
    this.presentationCapacity = 0;
    this.destroyTileRuntime();
    safeUnconfigure(this.context);
    this.activateCanvas2d();
    if (!this.suspended) this.render(this.lastStrokes, this.lastRequestId);
    this.options.onDeviceLost?.(info);

    if (this.options.autoRecover === false) return;
    void this.initializeWebGpu(recoveryGeneration).then((ready) => {
      if (
        ready
        && !this.disposed
        && !this.suspended
        && recoveryGeneration === this.lifecycleGeneration
      ) {
        this.render(this.lastStrokes);
      }
    });
  }

  private activateCanvas2d(): void {
    if (!this.fallbackContext) {
      this.fallbackContext = this.fallbackCanvas.getContext("2d");
    }
    this.setBackend("canvas2d");
  }

  private setBackend(backend: StudioGpuBackend): void {
    const changed = this.backend !== backend;
    if (changed) {
      this.cancelActiveTileFrame();
      if (backend === "canvas2d") this.destroyTileRuntime();
      this.invalidateRenderedFrame();
      this.invalidateFrameReceipt();
    }
    this.backend = backend;
    this.setSurfaceVisibility(backend);
    if (changed) this.options.onBackendChange?.(backend);
  }

  private setSurfaceVisibility(backend: StudioGpuBackend): void {
    if (this.canvas === this.fallbackCanvas) {
      this.canvas.style.visibility = this.suspended ? "hidden" : "visible";
      return;
    }
    if (this.suspended) {
      this.canvas.style.visibility = "hidden";
      this.fallbackCanvas.style.visibility = "hidden";
      return;
    }
    this.canvas.style.visibility = backend === "webgpu" ? "visible" : "hidden";
    this.fallbackCanvas.style.visibility = backend === "canvas2d" ? "visible" : "hidden";
  }

  private configureContext(): void {
    if (!this.context || !this.device || !this.format) return;
    try {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "premultiplied",
        usage: presentationTextureUsage(this.retainReadbackSnapshot),
      });
    } catch {
      // Device loss handler will switch to the already-renderable Canvas2D surface.
    }
  }

  private ensureInstanceBuffer(instanceCount: number): GPUBuffer | null {
    if (!this.device || instanceCount <= 0) return null;
    if (this.instanceBuffer && this.instanceCapacity >= instanceCount) return this.instanceBuffer;
    let capacity = 256;
    while (capacity < instanceCount) capacity *= 2;
    const replacement = this.device.createBuffer({
      label: "Studio brush dab instances",
      size: capacity * INSTANCE_BYTES,
      usage: bufferUsage(),
    });
    this.instanceBuffer?.destroy();
    this.instanceBuffer = replacement;
    this.instanceCapacity = capacity;
    return replacement;
  }

  private ensurePresentationBuffer(vertexCount: number): GPUBuffer | null {
    if (!this.device || vertexCount <= 0) return null;
    if (this.presentationBuffer && this.presentationCapacity >= vertexCount) {
      return this.presentationBuffer;
    }
    let capacity = 256;
    while (capacity < vertexCount) capacity *= 2;
    const replacement = this.device.createBuffer({
      label: "Studio retained tile presentation vertices",
      size: capacity * PRESENTATION_VERTEX_BYTES,
      usage: bufferUsage(),
    });
    this.presentationBuffer?.destroy();
    this.presentationBuffer = replacement;
    this.presentationCapacity = capacity;
    return replacement;
  }

  private requiredTileResolutionScale(): number {
    const horizontal = this.viewport.cssWidth * this.viewport.dpr
      / this.viewport.logicalWidth * this.viewport.scaleX;
    const vertical = this.viewport.cssHeight * this.viewport.dpr
      / this.viewport.logicalHeight * this.viewport.scaleY;
    return Math.max(horizontal, vertical);
  }

  private tileResolutionScale(): number {
    const horizontal = this.canvas.width / this.viewport.logicalWidth * this.viewport.scaleX;
    const vertical = this.canvas.height / this.viewport.logicalHeight * this.viewport.scaleY;
    return clamp(
      Math.max(horizontal, vertical),
      0.25,
      STUDIO_GPU_MAX_TILE_RESOLUTION_SCALE
    );
  }

  private ensureTileRuntime(device: GPUDevice): StudioGpuTileRuntime<GPUTexture> {
    const resolutionScale = this.tileResolutionScale();
    if (
      this.tileRuntime
      && this.tileRuntimeDevice === device
      && Object.is(this.tileRuntimeResolutionScale, resolutionScale)
    ) {
      return this.tileRuntime;
    }
    this.destroyTileRuntime();
    this.tileRuntime = new StudioGpuTileRuntime({
      resourceFactory: createStudioGpuTileTextureFactory(device, {
        format: STUDIO_GPU_TILE_TEXTURE_FORMAT,
      }),
      resolutionScale,
      maxTextureDimension2D: Math.max(
        1,
        Number(device.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION)
      ),
    });
    this.tileRuntimeDevice = device;
    this.tileRuntimeResolutionScale = resolutionScale;
    return this.tileRuntime;
  }

  private cancelActiveTileFrame(): void {
    const active = this.activeTileFrame;
    this.activeTileFrame = null;
    if (active) active.runtime.abortFrame(active.token);
  }

  private destroyTileRuntime(): void {
    this.cancelActiveTileFrame();
    this.tileRuntime?.dispose();
    this.tileRuntime = null;
    this.tileRuntimeDevice = null;
    this.tileRuntimeResolutionScale = 0;
  }

  private invalidateRenderedFrame(): void {
    this.renderedStrokes = null;
    this.renderedBackend = null;
    this.renderedDabCount = 0;
    this.renderedFrameComplete = false;
    this.renderedFrameInvalid = true;
  }

  private invalidateFrameReceipt(): number {
    this.invalidateAuthorityFrame();
    this.frameGeneration += 1;
    this.options.onFrameInvalid?.();
    return this.frameGeneration;
  }

  private planRenderUpdate(strokes: readonly StudioGpuStroke[]): StudioGpuDabRenderUpdate {
    if (
      this.renderedFrameInvalid ||
      this.renderedBackend !== this.backend ||
      !this.renderedStrokes ||
      !this.renderedFrameComplete
    ) {
      return { mode: "rebuild", ...planStudioGpuDabs(strokes) };
    }
    const update = planStudioGpuDabUpdate(this.renderedStrokes, strokes);
    if (update.mode === "rebuild") return update;
    return limitStudioGpuDabPlan(
      update,
      Math.max(0, STUDIO_GPU_MAX_DABS - this.renderedDabCount)
    );
  }

  private recordRenderedFrame(
    strokes: readonly StudioGpuStroke[],
    update: StudioGpuDabRenderUpdate
  ): boolean {
    const previousComplete = this.renderedFrameComplete;
    // Callers usually provide immutable React data, but pointer hot paths may reuse an object.
    // Retained-frame diffing must compare against pixels that were actually submitted, not an
    // array that can later mutate in place and make an undrawn tail appear equal.
    this.renderedStrokes = snapshotStudioGpuStrokes(strokes);
    this.renderedBackend = this.backend;
    this.renderedDabCount = update.mode === "append"
      ? this.renderedDabCount + update.dabs.length
      : update.dabs.length;
    this.renderedFrameComplete = update.mode === "rebuild"
      ? update.complete
      : previousComplete && update.complete;
    this.renderedFrameInvalid = false;
    return this.renderedFrameComplete;
  }

  private recordRenderedTileFrame(
    strokes: readonly StudioGpuStroke[],
    submittedDabCount: number
  ): void {
    // A tiled WebGPU frame is complete once every dirty visible-tile task and the presentation
    // pass have finished. Re-planning the whole (potentially very tall) document here would make
    // offscreen ink consume the visible frame's safety budget and defeat viewport-bounded work.
    this.renderedStrokes = snapshotStudioGpuStrokes(strokes);
    this.renderedBackend = this.backend;
    this.renderedDabCount = submittedDabCount;
    this.renderedFrameComplete = true;
    this.renderedFrameInvalid = false;
  }

  private startWebGpuRender(request: {
    readonly strokes: readonly StudioGpuStroke[];
    readonly requestId: string;
    readonly frameGeneration: number;
  }): void {
    const flightId = ++this.webGpuRenderFlightId;
    this.webGpuRenderInFlight = true;
    const finish = () => {
      // A lost device may complete or reject its submitted-work promise after a recovered device
      // has already started rendering. Only the current flight owns the shared pending slot/lock.
      if (flightId !== this.webGpuRenderFlightId) return;
      this.webGpuRenderInFlight = false;
      const pending = this.pendingWebGpuRender;
      this.pendingWebGpuRender = null;
      if (!pending || this.disposed) return;
      if (
        pending.frameGeneration !== this.frameGeneration
        || pending.requestId !== this.lastRequestId
      ) {
        return;
      }
      if (
        this.backend === "webgpu"
        && this.device
        && this.context
        && this.normalPipeline
        && this.erasePipeline
        && this.presentationPipeline
        && this.presentationSampler
      ) {
        this.startWebGpuRender(pending);
        return;
      }
      this.cancelActiveTileFrame();
      this.renderCanvas2d(pending.strokes, pending.requestId, pending.frameGeneration);
    };
    void this.renderWebGpu(
      request.strokes,
      request.requestId,
      request.frameGeneration
    ).then(finish, finish);
  }

  private supersedeWebGpuRenderFlight(): void {
    this.webGpuRenderFlightId += 1;
    this.webGpuRenderInFlight = false;
    this.pendingWebGpuRender = null;
  }

  private async renderWebGpu(
    strokes: readonly StudioGpuStroke[],
    requestId: string,
    frameGeneration: number
  ): Promise<void> {
    const {
      device,
      context,
      normalPipeline,
      erasePipeline,
      presentationPipeline,
      presentationSampler,
      format,
    } = this;
    if (
      !device
      || !context
      || !normalPipeline
      || !erasePipeline
      || !presentationPipeline
      || !presentationSampler
      || !format
    ) {
      return;
    }
    let runtime: StudioGpuTileRuntime<GPUTexture> | null = null;
    let token: StudioGpuTileFrameToken | null = null;
    let presentationSnapshot: StudioGpuFrameSnapshot | null = null;
    let snapshotPublished = false;
    try {
      // A capped tile enlarged beyond its native physical density is visibly softer than Konva.
      // Do not bless that degraded surface: the invalidation already makes the authoritative
      // preview visible, and a later resize below the cap can request a fresh GPU handoff.
      if (this.requiredTileResolutionScale() > STUDIO_GPU_MAX_TILE_RESOLUTION_SCALE) return;
      // Tile bounds intentionally omit non-painting entries. Validate the source operations first
      // so a malformed/empty stroke cannot disappear from every tile and receive a complete blank
      // frame receipt that would hide the authoritative Konva preview.
      if (!strokes.every(isValidStudioGpuStroke)) {
        throw new Error("Studio WebGPU frame contains an invalid stroke");
      }
      const tileFrame = planStudioGpuVisibleTileFrame(strokes, this.viewport);
      runtime = this.ensureTileRuntime(device);
      const preparation = runtime.prepareFrame(tileFrame);
      if (preparation.status !== "prepared") {
        throw new Error(`Studio WebGPU tile frame rejected: ${preparation.reason}`);
      }
      token = preparation.token;
      this.activeTileFrame = { runtime, token, device };

      const resolved = resolveStudioGpuTileTasks(
        preparation.tasks,
        strokes,
        planStudioGpuDabsInRect,
        STUDIO_GPU_MAX_DABS,
        planStudioGpuStrokeExtensionInRect
      );
      if (!resolved) throw new Error("Studio WebGPU tile operation resolution failed");
      const packed = packStudioGpuTileDabs(resolved);
      const instanceBuffer = this.ensureInstanceBuffer(resolved.dabCount);
      if (instanceBuffer && packed.byteLength > 0) {
        device.queue.writeBuffer(
          instanceBuffer,
          0,
          packed.buffer,
          packed.byteOffset,
          packed.byteLength
        );
      }

      if (preparation.tasks.length > 0) {
        const encoder = device.createCommandEncoder({ label: "Studio retained tile render frame" });
        for (const resolvedTask of resolved.tasks) {
          const pass = encoder.beginRenderPass({
            label: `Studio retained tile ${resolvedTask.task.tile.id}`,
            colorAttachments: [{
              view: resolvedTask.task.resource.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: resolvedTask.task.mode === "append" ? "load" : "clear",
              storeOp: "store",
            }],
          });
          if (instanceBuffer) {
            pass.setVertexBuffer(0, instanceBuffer);
            for (const batch of resolvedTask.plan.batches) {
              pass.setPipeline(batch.composite === "erase" ? erasePipeline : normalPipeline);
              pass.draw(
                6,
                batch.instanceCount,
                0,
                resolvedTask.firstInstance + batch.firstInstance
              );
            }
          }
          pass.end();
        }
        device.queue.submit([encoder.finish()]);
        await this.submittedWork(device);
      }

      if (!this.isUsableWebGpuFrame(device, runtime, token)) {
        runtime.abortFrame(token);
        return;
      }
      const compositeFrame = runtime.completeFrame(token);
      if (!compositeFrame) throw new Error("Studio WebGPU tile frame completion failed");
      if (!this.isCurrentWebGpuFrame(device, runtime, token, requestId, frameGeneration)) {
        // A newer pointer request arrived while this submitted prefix was running. The texture is
        // fully written and therefore a safe retained base, but its pixels must never be presented
        // or authorized. Commit/release it, then the one-slot pending queue renders only the latest
        // suffix over that exact state.
        runtime.releaseFrame(token);
        if (this.activeTileFrame?.token === token) this.activeTileFrame = null;
        return;
      }
      const presentation = planStudioGpuTilePresentation(compositeFrame, this.viewport);
      const presentationBuffer = this.ensurePresentationBuffer(presentation.vertices.length / 4);
      if (presentationBuffer && presentation.vertices.byteLength > 0) {
        device.queue.writeBuffer(
          presentationBuffer,
          0,
          presentation.vertices.buffer,
          presentation.vertices.byteOffset,
          presentation.vertices.byteLength
        );
      }

      const encoder = device.createCommandEncoder({ label: "Studio retained tile presentation" });
      const presentationTexture = context.getCurrentTexture();
      presentationSnapshot = this.retainReadbackSnapshot
        ? this.acquireFrameSnapshot(
            device,
            format,
            this.canvas.width,
            this.canvas.height
          )
        : null;
      const pass = encoder.beginRenderPass({
        label: "Studio retained tile presentation",
        colorAttachments: [{
          view: presentationTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      if (presentationBuffer && presentation.draws.length > 0) {
        pass.setPipeline(presentationPipeline);
        pass.setVertexBuffer(0, presentationBuffer);
        const bindGroupLayout = presentationPipeline.getBindGroupLayout(0);
        for (const draw of presentation.draws) {
          pass.setBindGroup(0, device.createBindGroup({
            label: `Studio retained tile ${draw.tileId} presentation bindings`,
            layout: bindGroupLayout,
            entries: [
              { binding: 0, resource: presentationSampler },
              { binding: 1, resource: draw.resource.createView() },
            ],
          }));
          pass.draw(draw.vertexCount, 1, draw.firstVertex, 0);
        }
      }
      pass.end();
      if (presentationSnapshot) {
        encoder.copyTextureToTexture(
          { texture: presentationTexture },
          { texture: presentationSnapshot.texture },
          {
            width: presentationSnapshot.width,
            height: presentationSnapshot.height,
            depthOrArrayLayers: 1,
          }
        );
      }
      device.queue.submit([encoder.finish()]);
      await this.submittedWork(device);

      const released = runtime.releaseFrame(token);
      if (this.activeTileFrame?.token === token) this.activeTileFrame = null;
      if (
        !released
        || !this.isCurrentWebGpuFrame(device, runtime, token, requestId, frameGeneration, false)
      ) {
        return;
      }
      this.recordRenderedTileFrame(strokes, resolved.dabCount);
      const receipt = this.createFrameReceipt(strokes, requestId);
      if (this.publishAuthorityFrame(receipt, presentationSnapshot)) {
        snapshotPublished = true;
        this.options.onFrameReady?.(receipt);
      }
    } catch {
      if (runtime && token) runtime.abortFrame(token);
      if (this.activeTileFrame?.token === token) this.activeTileFrame = null;
      // Validation/context errors do not always resolve `device.lost`. Fail visibly-safe for this
      // session instead of leaving a selected but blank GPU surface above the authoritative scene.
      if (
        !this.disposed
        && frameGeneration === this.frameGeneration
        && requestId === this.lastRequestId
        && this.device === device
        && this.backend === "webgpu"
      ) {
        this.activateCanvas2d();
        this.render(strokes, requestId);
      }
    } finally {
      if (presentationSnapshot && !snapshotPublished) {
        this.retireFrameSnapshot(presentationSnapshot);
      }
    }
  }

  private submittedWork(device: GPUDevice): Promise<void> {
    return typeof device.queue.onSubmittedWorkDone === "function"
      ? device.queue.onSubmittedWorkDone()
      : Promise.resolve();
  }

  private isCurrentWebGpuFrame(
    device: GPUDevice,
    runtime: StudioGpuTileRuntime<GPUTexture>,
    token: StudioGpuTileFrameToken,
    requestId: string,
    frameGeneration: number,
    requireActiveToken = true
  ): boolean {
    return this.isUsableWebGpuFrame(device, runtime, token, requireActiveToken)
      && frameGeneration === this.frameGeneration
      && requestId === this.lastRequestId;
  }

  private isUsableWebGpuFrame(
    device: GPUDevice,
    runtime: StudioGpuTileRuntime<GPUTexture>,
    token: StudioGpuTileFrameToken,
    requireActiveToken = true
  ): boolean {
    return !this.disposed
      && this.device === device
      && this.tileRuntime === runtime
      && (!requireActiveToken || this.activeTileFrame?.token === token)
      && this.backend === "webgpu";
  }

  private clearCanvas2d(): void {
    const context = this.fallbackContext;
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.fallbackCanvas.width, this.fallbackCanvas.height);
    context.restore();
  }

  private renderCanvas2d(
    strokes: readonly StudioGpuStroke[],
    requestId: string,
    frameGeneration: number
  ): void {
    this.activateCanvas2d();
    const context = this.fallbackContext;
    if (!context) return;
    const update = this.planRenderUpdate(strokes);
    if (update.mode === "rebuild") this.clearCanvas2d();
    const viewport = this.viewport;
    const pixelScaleX = this.fallbackCanvas.width / viewport.logicalWidth;
    const pixelScaleY = this.fallbackCanvas.height / viewport.logicalHeight;
    const transformA = pixelScaleX * viewport.scaleX * (viewport.flipX ? -1 : 1);
    const transformD = pixelScaleY * viewport.scaleY;
    const transformE = pixelScaleX * (
      viewport.offsetX + (viewport.flipX ? viewport.logicalWidth * viewport.scaleX : 0)
    );
    const transformF = pixelScaleY * viewport.offsetY;

    context.save();
    context.setTransform(transformA, 0, 0, transformD, transformE, transformF);
    for (const dab of update.dabs) {
      context.globalCompositeOperation = dab.composite === "erase" ? "destination-out" : "source-over";
      context.fillStyle = `rgba(${Math.round(dab.red * 255)}, ${Math.round(dab.green * 255)}, ${Math.round(dab.blue * 255)}, ${dab.alpha})`;
      context.beginPath();
      context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    const complete = this.recordRenderedFrame(strokes, update);
    if (
      complete
      && !this.disposed
      && frameGeneration === this.frameGeneration
      && requestId === this.lastRequestId
      && this.backend === "canvas2d"
    ) {
      const receipt = this.createFrameReceipt(strokes, requestId);
      if (this.publishAuthorityFrame(receipt, null)) {
        this.options.onFrameReady?.(receipt);
      }
    }
  }

  private createFrameReceipt(
    strokes: readonly StudioGpuStroke[],
    requestId: string
  ): StudioGpuFrameReceipt {
    return Object.freeze({
      requestId,
      fingerprint: fingerprintStudioGpuFrame(
        strokes,
        this.viewport,
        this.canvas.width,
        this.canvas.height
      ),
      backend: this.backend,
      complete: true,
      strokeCount: strokes.length,
      dabCount: this.renderedDabCount,
      physicalWidth: this.canvas.width,
      physicalHeight: this.canvas.height,
    });
  }
}
