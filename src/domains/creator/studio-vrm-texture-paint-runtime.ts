import * as THREE from "three";

import {
  getCachedStudioVrmTextureGeometryIndex,
  getStudioVrmTextureGeometryIndex,
  inspectStudioVrmTextureGeometryAdmission,
  precomputeStudioVrmTextureGeometryIndex,
  type StudioVrmTextureGeometryIndex,
  type StudioVrmTextureGeometryLike,
  type StudioVrmTextureGeometryPrecomputeOptions,
} from "./studio-vrm-texture-geometry-index";
import {
  STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY,
  canonicalizeStudioVrmTexturePaintMaterialLocator as canonicalMaterialLocator,
  createStudioVrmTexturePaintBindingDescriptor as createBindingDescriptor,
  isCanonicalStudioVrmTexturePaintBindingDescriptor as isCanonicalBindingDescriptor,
  type StudioVrmTexturePaintBindingDescriptor,
} from "./studio-vrm-texture-paint-binding";
import {
  applyStudioVrmTexturePaintOp,
  EMPTY_STUDIO_VRM_TEXTURE_RECT,
  parseStudioVrmTextureColor,
  studioVrmTexturePaintOpRects,
  unionStudioVrmTextureRect,
  type StudioVrmTexturePaintApplyOptions,
} from "./studio-vrm-texture-paint-ops";
import {
  type StudioVrmTextureStrokePlanOptions,
  type StudioVrmTextureStrokeSample,
  type StudioVrmTextureStrokeStyle,
} from "./studio-vrm-texture-stroke";
import {
  createStudioVrmTextureStrokeWalker,
  type StudioVrmTextureStrokeWalker,
} from "./studio-vrm-texture-stroke-walker";
import {
  applyStudioVrmTextureUndoEntry,
  createStudioVrmTextureUndoRecorder,
  studioVrmTextureUndoEntryBytes,
  type StudioVrmTextureUndoEntry,
  type StudioVrmTextureUndoRecorder,
} from "./studio-vrm-texture-undo";
import {
  isStudioVrmTextureSize,
  STUDIO_VRM_TEXTURE_MAX_DIMENSION,
  STUDIO_VRM_TEXTURE_MAX_TEXELS,
  type StudioVrmTextureSize,
  type StudioVrmTextureWrapMode,
} from "./studio-vrm-texture-uv";

const RGBA_CHANNELS = 4;
const DEFAULT_TARGET_RGBA_BYTES = STUDIO_VRM_TEXTURE_MAX_TEXELS * RGBA_CHANNELS;
export const STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES = 4;
export const STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES = 100_000;
export const STUDIO_VRM_TEXTURE_PAINT_POINTER_SYNC_GEOMETRY_MAX_TRIANGLES = 4_096;
const DEFAULT_HISTORY_BYTES = 32 * 1024 * 1024;
const DEFAULT_TARGET_RESIDENT_BYTES =
  DEFAULT_TARGET_RGBA_BYTES * STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES;
const SAMPLE_UV_EPSILON = 0.5 / STUDIO_VRM_TEXTURE_MAX_DIMENSION;
const SAMPLE_PRESSURE_EPSILON = 1 / 1024;

export const DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS = Object.freeze({
  maxTargetResidentBytes: DEFAULT_TARGET_RESIDENT_BYTES,
  maxAggregateResidentBytes: DEFAULT_TARGET_RESIDENT_BYTES * 2 + DEFAULT_HISTORY_BYTES,
  maxGeometryIndexTriangles: STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES,
  /** @deprecated Logical RGBA compatibility alias. Prefer maxTargetResidentBytes. */
  maxTargetRgbaBytes: DEFAULT_TARGET_RGBA_BYTES,
  /** @deprecated Logical RGBA compatibility alias. Prefer maxAggregateResidentBytes. */
  maxAggregateRgbaBytes: DEFAULT_TARGET_RGBA_BYTES * 2,
  maxConcurrentReads: 2,
  maxHistoryEntries: 32,
  maxHistoryBytes: DEFAULT_HISTORY_BYTES,
  maxStrokeSamples: 2048,
  undoTileSize: 64,
});

export type StudioVrmTexturePaintRuntimeStatus =
  | "idle"
  | "invalid"
  | "loading"
  | "ready"
  | "painting"
  | "disposed";

export type StudioVrmTexturePaintRuntimeErrorCode =
  | "aggregate-rgba-budget"
  | "binding-conflict"
  | "binding-missing"
  | "canvas-unavailable"
  | "disposed"
  | "history-budget"
  | "hit-outside-scene"
  | "invalid-dimensions"
  | "invalid-pointer"
  | "invalid-style"
  | "map-missing"
  | "material-missing"
  | "mesh-missing"
  | "pointer-active"
  | "pointer-mismatch"
  | "read-concurrency-budget"
  | "source-changed"
  | "source-compressed"
  | "source-read-aborted"
  | "source-read-active"
  | "source-unreadable"
  | "stale-completion"
  | "stroke-sample-budget"
  | "target-invalid"
  | "target-mismatch"
  | "target-rgba-budget"
  | "uv-missing";

export interface StudioVrmTexturePaintRuntimeError {
  readonly code: StudioVrmTexturePaintRuntimeErrorCode;
  readonly message: string;
}

export type StudioVrmTexturePaintRuntimeGuidanceCode = "geometry-triangle-budget";

export interface StudioVrmTexturePaintRuntimeGuidance {
  readonly code: StudioVrmTexturePaintRuntimeGuidanceCode;
  readonly message: string;
  readonly triangleCount: number;
  readonly maxTriangles: number;
}

export type StudioVrmTexturePaintRuntimeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: StudioVrmTexturePaintRuntimeError }>;

export interface StudioVrmTexturePaintRayHit {
  readonly object: THREE.Object3D;
  readonly uv?: THREE.Vector2 | Readonly<{ x: number; y: number }>;
  readonly uv1?: THREE.Vector2 | Readonly<{ x: number; y: number }>;
  readonly face?: Readonly<{ materialIndex: number }> | null;
  /** Raycaster가 제공하는 geometry triangle index. */
  readonly faceIndex?: number | null;
  readonly point?: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }>;
}

export interface StudioVrmTexturePaintStrokeBegin {
  readonly pointerId: number;
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly pressure?: number;
  readonly style: StudioVrmTextureStrokeStyle;
  readonly planOptions?: Omit<
    StudioVrmTextureStrokePlanOptions,
    "flipV" | "wrapU" | "wrapV"
  >;
}

export interface StudioVrmTexturePaintStrokeMove {
  readonly pointerId: number;
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly pressure?: number;
}

export interface StudioVrmTexturePaintReadableImage {
  readonly width: number;
  readonly height: number;
  /**
   * A tightly packed, straight-alpha RGBA8 buffer. Ownership is transferred to the runtime.
   */
  readonly data: Uint8ClampedArray;
}

export {
  STUDIO_VRM_TEXTURE_PAINT_BASE_COLOR_SLOT,
  STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY,
  stampStudioVrmTexturePaintMaterialLocator,
} from "./studio-vrm-texture-paint-binding";
export type { StudioVrmTexturePaintBindingDescriptor } from "./studio-vrm-texture-paint-binding";

export interface StudioVrmTexturePaintExportTarget {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /**
   * Caller-owned RGBA8 copy. The runtime never transfers or mutates this buffer after return.
   * Exporters should encode one target at a time and release the buffer promptly.
   */
  readonly pixels: Uint8ClampedArray;
  readonly bindings: readonly StudioVrmTexturePaintBindingDescriptor[];
}

export interface StudioVrmTexturePaintRehydrateTarget {
  readonly binding: StudioVrmTexturePaintBindingDescriptor;
  /** Ownership of the RGBA buffer is transferred for the duration of this call. */
  readonly image: StudioVrmTexturePaintReadableImage;
  readonly signal?: AbortSignal;
}

export type StudioVrmTexturePaintCanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement;

export type StudioVrmTexturePaintImageReader = (
  texture: THREE.Texture,
  signal: AbortSignal,
) => Promise<StudioVrmTexturePaintReadableImage> | StudioVrmTexturePaintReadableImage;

export type StudioVrmTexturePaintGeometryPrecomputer = (
  geometry: StudioVrmTextureGeometryLike,
  options: StudioVrmTextureGeometryPrecomputeOptions,
) => Promise<StudioVrmTextureGeometryIndex>;

export interface CreateStudioVrmTexturePaintRuntimeOptions {
  /**
   * Conservative resident footprint per target: original RGBA, editable ImageData,
   * Canvas backing store, and GPU texture backing.
   */
  readonly maxTargetResidentBytes?: number;
  /** Prepared target resident bytes plus the reserved undo-history budget. */
  readonly maxAggregateResidentBytes?: number;
  /**
   * Worker UV-island indexing hard cap. Pointer input synchronously indexes only meshes up to
   * `STUDIO_VRM_TEXTURE_PAINT_POINTER_SYNC_GEOMETRY_MAX_TRIANGLES`; larger admitted meshes require
   * a completed prewarm cache and otherwise use a face-local fallback.
   */
  readonly maxGeometryIndexTriangles?: number;
  /** @deprecated Logical RGBA compatibility alias. Prefer maxTargetResidentBytes. */
  readonly maxTargetRgbaBytes?: number;
  /** @deprecated Logical RGBA compatibility alias. Prefer maxAggregateResidentBytes. */
  readonly maxAggregateRgbaBytes?: number;
  /** Hard cap for concurrently unsettled source-image reads. One read per source is always enforced. */
  readonly maxConcurrentReads?: number;
  readonly maxHistoryEntries?: number;
  readonly maxHistoryBytes?: number;
  /** Hard cap for samples retained by one pointer stroke after duplicate coalescing. */
  readonly maxStrokeSamples?: number;
  readonly undoTileSize?: number;
  readonly createCanvas?: StudioVrmTexturePaintCanvasFactory;
  readonly readTextureImage?: StudioVrmTexturePaintImageReader;
  /** Test/host integration seam. The default uses the browser module Worker implementation. */
  readonly precomputeGeometryIndex?: StudioVrmTexturePaintGeometryPrecomputer;
}

export interface StudioVrmTexturePaintTargetSnapshot {
  readonly id: string;
  readonly sourceTextureUuid: string;
  readonly paintedTextureUuid: string;
  readonly sourceName: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: number;
  readonly residentBytes: number;
  readonly bindingCount: number;
  readonly valid: boolean;
  readonly invalidReason: "canvas-unavailable" | null;
}

export interface StudioVrmTexturePaintHistorySnapshot {
  readonly undoCount: number;
  readonly redoCount: number;
  readonly retainedBytes: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface StudioVrmTexturePaintRuntimeSnapshot {
  readonly status: StudioVrmTexturePaintRuntimeStatus;
  readonly activePointerId: number | null;
  readonly activeTargetId: string | null;
  readonly activeTarget: Readonly<Pick<
    StudioVrmTexturePaintTargetSnapshot,
    "bindingCount" | "height" | "id" | "invalidReason" | "sourceName" | "valid" | "width"
  >> | null;
  /** @deprecated Logical RGBA sum retained for telemetry compatibility. */
  readonly aggregateRgbaBytes: number;
  readonly aggregateTargetResidentBytes: number;
  /** Prepared target resident bytes plus currently retained history. */
  readonly residentBytes: number;
  readonly maxResidentBytes: number;
  readonly targets: readonly StudioVrmTexturePaintTargetSnapshot[];
  readonly history: StudioVrmTexturePaintHistorySnapshot;
  readonly error: StudioVrmTexturePaintRuntimeError | null;
  readonly guidance: StudioVrmTexturePaintRuntimeGuidance | null;
}

export type StudioVrmTexturePaintRuntimeListener = (
  snapshot: StudioVrmTexturePaintRuntimeSnapshot,
) => void;

interface BaseColorMaterial extends THREE.Material {
  map: THREE.Texture | null;
}

interface MaterialBinding {
  readonly material: BaseColorMaterial;
  readonly originalMap: THREE.Texture | null;
  readonly descriptor: StudioVrmTexturePaintBindingDescriptor;
}

interface PaintTarget {
  readonly id: string;
  readonly originalTexture: THREE.Texture;
  readonly paintedTexture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly imageData: ImageData;
  readonly originalPixels: Uint8ClampedArray;
  readonly size: StudioVrmTextureSize;
  readonly rgbaBytes: number;
  readonly residentBytes: number;
  readonly bindings: Map<BaseColorMaterial, MaterialBinding>;
  valid: boolean;
  invalidReason: "canvas-unavailable" | null;
}

interface ResolvedPaintHit {
  readonly material: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly target: PaintTarget | null;
  readonly sample: StudioVrmTextureStrokeSample;
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
}

interface PendingStroke {
  readonly pointerId: number;
  readonly originMaterial: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly style: StudioVrmTextureStrokeStyle;
  readonly planOptions: Omit<
    StudioVrmTextureStrokePlanOptions,
    "flipV" | "wrapU" | "wrapV"
  >;
  readonly samples: StudioVrmTextureStrokeSample[];
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
  readonly readController: AbortController | null;
  target: PaintTarget | null;
  terminal: "commit" | null;
}

interface ActiveStroke {
  readonly pointerId: number;
  readonly target: PaintTarget;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
  readonly recorder: StudioVrmTextureUndoRecorder;
  readonly walker: StudioVrmTextureStrokeWalker;
  lastSample: StudioVrmTextureStrokeSample | null;
  sampleCount: number;
  changedTexels: number;
}

interface HistoryRecord {
  readonly target: PaintTarget;
  readonly entry: StudioVrmTextureUndoEntry;
  readonly bytes: number;
}

interface NormalizedRuntimeOptions {
  readonly maxTargetResidentBytes: number;
  readonly maxAggregateResidentBytes: number;
  readonly maxGeometryIndexTriangles: number;
  readonly maxConcurrentReads: number;
  readonly maxHistoryEntries: number;
  readonly maxHistoryBytes: number;
  readonly maxStrokeSamples: number;
  readonly undoTileSize: number;
  readonly createCanvas: StudioVrmTexturePaintCanvasFactory;
  readonly readTextureImage: StudioVrmTexturePaintImageReader;
  readonly precomputeGeometryIndex: StudioVrmTexturePaintGeometryPrecomputer;
}

interface GeometryPrewarmJob {
  readonly geometry: StudioVrmTextureGeometryLike;
  readonly uvAttribute: "uv" | "uv1";
}

class StudioVrmTexturePaintFault extends Error {
  constructor(readonly code: StudioVrmTexturePaintRuntimeErrorCode) {
    super(code);
    this.name = "StudioVrmTexturePaintFault";
  }
}

const ERROR_MESSAGES: Readonly<Record<StudioVrmTexturePaintRuntimeErrorCode, string>> =
  Object.freeze({
    "aggregate-rgba-budget": "텍스처와 실행 취소 기록의 전체 상주 메모리 한도를 초과합니다.",
    "binding-conflict": "저장된 표면 텍스처와 현재 모델의 재질 결합이 서로 충돌합니다.",
    "binding-missing": "저장된 표면 텍스처가 가리키는 모델 재질을 찾지 못했습니다.",
    "canvas-unavailable": "페인팅 캔버스를 사용할 수 없습니다.",
    disposed: "텍스처 페인팅이 이미 종료되었습니다.",
    "history-budget": "이 획은 실행 취소 메모리 한도를 초과합니다.",
    "hit-outside-scene": "현재 캐릭터 밖의 지점입니다.",
    "invalid-dimensions": "텍스처 크기 또는 RGBA 데이터가 올바르지 않습니다.",
    "invalid-pointer": "포인터 정보가 올바르지 않습니다.",
    "invalid-style": "브러시 설정이 올바르지 않습니다.",
    "map-missing": "재질에 색상 텍스처가 없습니다.",
    "material-missing": "색상 재질을 찾을 수 없습니다.",
    "mesh-missing": "페인팅할 메시를 찾을 수 없습니다.",
    "pointer-active": "다른 페인팅 입력이 진행 중입니다.",
    "pointer-mismatch": "현재 획을 시작한 포인터가 아닙니다.",
    "read-concurrency-budget": "동시에 불러올 수 있는 텍스처 수를 초과했습니다.",
    "source-changed": "불러오는 동안 원본 텍스처가 변경되었습니다.",
    "source-compressed": "압축 GPU 텍스처에는 직접 칠할 수 없습니다.",
    "source-read-aborted": "텍스처 불러오기를 취소했습니다.",
    "source-read-active": "이 텍스처를 이미 불러오는 중입니다.",
    "source-unreadable": "텍스처를 읽을 수 없습니다. CORS 설정을 확인하세요.",
    "stale-completion": "이전 텍스처 준비 결과를 무시했습니다.",
    "stroke-sample-budget": "한 획의 입력 지점 한도를 초과했습니다.",
    "target-invalid": "페인팅 대상을 더 이상 사용할 수 없습니다.",
    "target-mismatch": "한 획으로 서로 다른 텍스처를 칠할 수 없습니다.",
    "target-rgba-budget": "이 텍스처는 안전한 페인팅 상주 메모리 한도를 초과합니다.",
    "uv-missing": "이 지점의 UV 좌표를 사용할 수 없습니다.",
  });

function frozenError(code: StudioVrmTexturePaintRuntimeErrorCode): StudioVrmTexturePaintRuntimeError {
  return Object.freeze({ code, message: ERROR_MESSAGES[code] });
}

function frozenGeometryBudgetGuidance(
  triangleCount: number,
  maxTriangles: number,
): StudioVrmTexturePaintRuntimeGuidance {
  return Object.freeze({
    code: "geometry-triangle-budget",
    message:
      `고밀도 메시(${triangleCount}면)는 안전 한도 ${maxTriangles}면을 넘어 `
      + "UV 분석을 생략하고 면 단위 안전 모드로 칠합니다.",
    triangleCount,
    maxTriangles,
  });
}

function success<T>(value: T): StudioVrmTexturePaintRuntimeResult<T> {
  return Object.freeze({ ok: true as const, value });
}

function failure<T>(
  code: StudioVrmTexturePaintRuntimeErrorCode,
): StudioVrmTexturePaintRuntimeResult<T> {
  return Object.freeze({ ok: false as const, error: frozenError(code) });
}

function boundedInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? Math.floor(value)
    : fallback;
}

function boundedByteBudget(value: unknown, fallback: number): number {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    boundedInteger(value, fallback, 1),
  );
}

function saturatedByteSum(...values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return Number.MAX_SAFE_INTEGER;
    if (total > Number.MAX_SAFE_INTEGER - value) return Number.MAX_SAFE_INTEGER;
    total += value;
  }
  return total;
}

function logicalRgbaToResidentBytes(rgbaBytes: number): number {
  if (!Number.isSafeInteger(rgbaBytes) || rgbaBytes < 0) return Number.MAX_SAFE_INTEGER;
  if (
    rgbaBytes
    > Math.floor(
      Number.MAX_SAFE_INTEGER / STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES,
    )
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  return rgbaBytes * STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES;
}

/**
 * 보수적으로 유지되는 네 개의 RGBA 사본(원본, ImageData, Canvas, GPU)을 계산한다.
 * 실제 버퍼를 만들지 않으므로 2K/4K 사전 입장 검사에도 안전하게 사용할 수 있다.
 */
export function estimateStudioVrmTexturePaintTargetResidentBytes(
  size: Readonly<{ width: number; height: number }>,
): number | null {
  if (!isStudioVrmTextureSize(size)) return null;
  return logicalRgbaToResidentBytes(size.width * size.height * RGBA_CHANNELS);
}

function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== "object" || typeof document.createElement !== "function") {
    throw new StudioVrmTexturePaintFault("canvas-unavailable");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function readableImageDimensions(image: unknown): StudioVrmTextureSize | null {
  if (typeof image !== "object" || image === null) return null;
  const source = image as Record<string, unknown>;
  const candidates = [
    [source.naturalWidth, source.naturalHeight],
    [source.videoWidth, source.videoHeight],
    [source.width, source.height],
  ] as const;
  for (const [width, height] of candidates) {
    const size = { width, height };
    if (isStudioVrmTextureSize(size)) return size;
  }
  return null;
}

function textureImageDimensions(texture: THREE.Texture): StudioVrmTextureSize | null {
  try {
    return readableImageDimensions(texture.image);
  } catch {
    return null;
  }
}

function isUsableFaceIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function readTypedRgbaImage(
  texture: THREE.Texture,
  image: unknown,
): StudioVrmTexturePaintReadableImage | null {
  if (typeof image !== "object" || image === null) return null;
  const source = image as Record<string, unknown>;
  const size = { width: source.width, height: source.height };
  if (!isStudioVrmTextureSize(size)) return null;
  const data = source.data;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  if (texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType) return null;
  if (data.byteLength !== size.width * size.height * RGBA_CHANNELS) return null;
  const rgba = new Uint8ClampedArray(data.byteLength);
  rgba.set(data);
  return { ...size, data: rgba };
}

function createDefaultImageReader(
  createCanvas: StudioVrmTexturePaintCanvasFactory,
): StudioVrmTexturePaintImageReader {
  return (texture, signal) => {
    if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");
    let image: unknown;
    try {
      image = texture.image;
    } catch {
      throw new StudioVrmTexturePaintFault("source-unreadable");
    }
    const typed = readTypedRgbaImage(texture, image);
    if (typed) return typed;
    const size = readableImageDimensions(image);
    if (!size) throw new StudioVrmTexturePaintFault("invalid-dimensions");
    if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");

    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = createCanvas(size.width, size.height);
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new StudioVrmTexturePaintFault("canvas-unavailable");
      context.drawImage(image as CanvasImageSource, 0, 0, size.width, size.height);
      const pixels = context.getImageData(0, 0, size.width, size.height);
      if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");
      const data = new Uint8ClampedArray(pixels.data.length);
      data.set(pixels.data);
      return { ...size, data };
    } catch (error) {
      if (error instanceof StudioVrmTexturePaintFault) throw error;
      throw new StudioVrmTexturePaintFault("source-unreadable");
    } finally {
      if (canvas) disposeCanvas(canvas);
    }
  };
}

function normalizeOptions(
  options: CreateStudioVrmTexturePaintRuntimeOptions,
): NormalizedRuntimeOptions {
  const createCanvas = options.createCanvas ?? defaultCanvasFactory;
  const maxHistoryBytes = boundedByteBudget(
    options.maxHistoryBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxHistoryBytes,
  );
  const legacyTargetRgbaBytes = boundedByteBudget(
    options.maxTargetRgbaBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxTargetRgbaBytes,
  );
  const maxTargetResidentBytes =
    options.maxTargetResidentBytes === undefined
      ? logicalRgbaToResidentBytes(legacyTargetRgbaBytes)
      : boundedByteBudget(
          options.maxTargetResidentBytes,
          DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxTargetResidentBytes,
        );
  const legacyAggregateRgbaBytes = boundedByteBudget(
    options.maxAggregateRgbaBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxAggregateRgbaBytes,
  );
  const aggregateResidentFallback = options.maxAggregateRgbaBytes === undefined
    ? saturatedByteSum(maxTargetResidentBytes, maxTargetResidentBytes, maxHistoryBytes)
    : saturatedByteSum(logicalRgbaToResidentBytes(legacyAggregateRgbaBytes), maxHistoryBytes);
  return Object.freeze({
    maxTargetResidentBytes,
    maxAggregateResidentBytes: boundedByteBudget(
      options.maxAggregateResidentBytes,
      aggregateResidentFallback,
    ),
    maxGeometryIndexTriangles: boundedInteger(
      options.maxGeometryIndexTriangles,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxGeometryIndexTriangles,
      0,
    ),
    maxConcurrentReads: boundedInteger(
      options.maxConcurrentReads,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxConcurrentReads,
      1,
    ),
    maxHistoryEntries: boundedInteger(
      options.maxHistoryEntries,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxHistoryEntries,
      1,
    ),
    maxHistoryBytes,
    maxStrokeSamples: boundedInteger(
      options.maxStrokeSamples,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxStrokeSamples,
      2,
    ),
    undoTileSize: boundedInteger(
      options.undoTileSize,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.undoTileSize,
      1,
    ),
    createCanvas,
    readTextureImage: options.readTextureImage ?? createDefaultImageReader(createCanvas),
    precomputeGeometryIndex:
      options.precomputeGeometryIndex ?? precomputeStudioVrmTextureGeometryIndex,
  });
}

function isCompressedTexture(texture: THREE.Texture): boolean {
  const candidate = texture as THREE.Texture & {
    readonly isCompressedTexture?: unknown;
    readonly isCompressedArrayTexture?: unknown;
    readonly isCompressedCubeTexture?: unknown;
  };
  return candidate.isCompressedTexture === true
    || candidate.isCompressedArrayTexture === true
    || candidate.isCompressedCubeTexture === true;
}

function isBaseColorMaterial(material: unknown): material is BaseColorMaterial {
  return typeof material === "object" && material !== null && "map" in material;
}

function stableScenePathHash(value: string): string {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x0100_0193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createScenePathMaterialLocator(
  objectPath: string,
  materialIndex: number,
): string {
  const candidate = `scene-path:${objectPath}/material-${materialIndex}`;
  return canonicalMaterialLocator(candidate)
    ? candidate
    : `scene-path:hashed-${stableScenePathHash(candidate)}`;
}

/**
 * Returns one deterministic locator per material. GLTFLoader integrations may stamp the stable
 * glTF material index in userData; hand-built/test scenes use a child-index path fallback.
 */
function collectSceneMaterialBindings(
  scene: THREE.Object3D,
): Map<BaseColorMaterial, StudioVrmTexturePaintBindingDescriptor> {
  const bindings = new Map<BaseColorMaterial, StudioVrmTexturePaintBindingDescriptor>();
  const stack: Array<Readonly<{ object: THREE.Object3D; path: string }>> = [
    { object: scene, path: "root" },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const mesh = current.object as THREE.Object3D & {
      readonly isMesh?: unknown;
      readonly material?: THREE.Material | THREE.Material[];
    };
    if (mesh.isMesh === true && mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((candidate, materialIndex) => {
        if (!isBaseColorMaterial(candidate)) return;
        const stamped = canonicalMaterialLocator(
          candidate.userData?.[STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY],
        );
        const descriptor = createBindingDescriptor(
          stamped ?? createScenePathMaterialLocator(current.path, materialIndex),
        );
        if (!descriptor) return;
        const previous = bindings.get(candidate);
        if (!previous || descriptor.bindingKey < previous.bindingKey) {
          bindings.set(candidate, descriptor);
        }
      });
    }
    for (let childIndex = current.object.children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = current.object.children[childIndex];
      if (!child) continue;
      stack.push({ object: child, path: `${current.path}/child-${childIndex}` });
    }
  }
  return bindings;
}

function collectGeometryPrewarmJobs(
  scene: THREE.Object3D,
  maxTriangles: number,
): readonly GeometryPrewarmJob[] {
  const jobs: GeometryPrewarmJob[] = [];
  const seen = new WeakMap<StudioVrmTextureGeometryLike, Set<string>>();
  scene.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      readonly isMesh?: unknown;
      readonly geometry?: StudioVrmTextureGeometryLike;
    };
    const geometry = candidate.isMesh === true ? candidate.geometry : undefined;
    if (!geometry || typeof geometry.getAttribute !== "function") return;
    for (const uvAttribute of ["uv", "uv1"] as const) {
      try {
        if (!geometry.getAttribute(uvAttribute)) continue;
      } catch {
        continue;
      }
      const admission = inspectStudioVrmTextureGeometryAdmission(geometry, {
        uvAttribute,
        maxTriangles,
      });
      if (!admission?.admitted) continue;
      let attributes = seen.get(geometry);
      if (!attributes) {
        attributes = new Set();
        seen.set(geometry, attributes);
      }
      if (attributes.has(uvAttribute)) continue;
      attributes.add(uvAttribute);
      jobs.push(Object.freeze({ geometry, uvAttribute }));
    }
  });
  return Object.freeze(jobs);
}

function pixelsEqual(left: Uint8ClampedArray, right: Uint8ClampedArray): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function materialAtHit(
  mesh: THREE.Mesh,
  hit: StudioVrmTexturePaintRayHit,
): BaseColorMaterial | null {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const candidate = hit.face?.materialIndex;
  let materialIndex: number;
  if (candidate !== undefined) {
    if (!Number.isSafeInteger(candidate) || candidate < 0 || candidate >= materials.length) {
      return null;
    }
    materialIndex = candidate;
  } else {
    if (materials.length > 1) return null;
    materialIndex = 0;
  }
  const material = materials[materialIndex];
  return material && isBaseColorMaterial(material) ? material : null;
}

function objectBelongsToScene(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

function finiteUv(
  value: THREE.Vector2 | Readonly<{ x: number; y: number }> | undefined,
): THREE.Vector2 | null {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return new THREE.Vector2(value.x, value.y);
}

function finiteWorld(
  value: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }> | undefined,
): Readonly<{ x: number; y: number; z: number }> | undefined {
  if (
    !value
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
    || !Number.isFinite(value.z)
  ) {
    return undefined;
  }
  return { x: value.x, y: value.y, z: value.z };
}

function normalizedSamplePressure(sample: StudioVrmTextureStrokeSample): number {
  const pressure = sample.pressure;
  return typeof pressure === "number" && Number.isFinite(pressure)
    ? Math.min(1, Math.max(0, pressure))
    : 0.5;
}

function canCoalesceStrokeSample(
  previous: StudioVrmTextureStrokeSample | undefined,
  next: StudioVrmTextureStrokeSample,
): boolean {
  if (!previous || previous.islandId !== next.islandId) return false;
  if (Math.abs(previous.uv.u - next.uv.u) > SAMPLE_UV_EPSILON) return false;
  if (Math.abs(previous.uv.v - next.uv.v) > SAMPLE_UV_EPSILON) return false;
  return Math.abs(normalizedSamplePressure(previous) - normalizedSamplePressure(next))
    <= SAMPLE_PRESSURE_EPSILON;
}

function textureWrapMode(value: THREE.Wrapping): StudioVrmTextureWrapMode {
  if (value === THREE.RepeatWrapping) return "repeat";
  if (value === THREE.MirroredRepeatWrapping) return "mirror";
  return "clamp";
}

function paintWrapOptions(texture: THREE.Texture): StudioVrmTexturePaintApplyOptions {
  return Object.freeze({
    wrapU: textureWrapMode(texture.wrapS),
    wrapV: textureWrapMode(texture.wrapT),
  });
}

function copyStrokeStyle(style: StudioVrmTextureStrokeStyle): StudioVrmTextureStrokeStyle {
  return Object.freeze({
    ...style,
    ...(style.tuning ? { tuning: Object.freeze({ ...style.tuning }) } : {}),
  });
}

function isValidStrokeStyle(style: StudioVrmTextureStrokeStyle): boolean {
  const kinds = new Set(["airbrush", "ink", "pencil", "watercolor"]);
  const blends = new Set(["erase", "multiply", "normal", "overlay", "screen"]);
  if (!kinds.has(style.kind) || !blends.has(style.blend)) return false;
  if (!Number.isFinite(style.sizeTexels) || style.sizeTexels <= 0) return false;
  if (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1) return false;
  return style.blend === "erase" || parseStudioVrmTextureColor(style.color) !== null;
}

function markMaterialChanged(material: THREE.Material): void {
  try {
    material.needsUpdate = true;
  } catch {
    // A custom material may expose a throwing setter. The map ownership change still stands.
  }
}

function copyTextureSampling(source: THREE.Texture, target: THREE.CanvasTexture): void {
  if (source.matrixAutoUpdate) source.updateMatrix();
  target.mapping = source.mapping;
  target.channel = source.channel;
  target.wrapS = source.wrapS;
  target.wrapT = source.wrapT;
  target.magFilter = source.magFilter;
  target.minFilter = source.minFilter;
  target.anisotropy = source.anisotropy;
  target.colorSpace = source.colorSpace;
  target.offset.copy(source.offset);
  target.repeat.copy(source.repeat);
  target.center.copy(source.center);
  target.rotation = source.rotation;
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.matrix.copy(source.matrix);
  target.generateMipmaps = source.generateMipmaps;
  target.premultiplyAlpha = source.premultiplyAlpha;
  target.unpackAlignment = source.unpackAlignment;
  target.flipY = false;
  target.name = source.name ? `${source.name} · Studio paint` : "Studio VRM texture paint";
  target.needsUpdate = true;
}

function disposeCanvas(canvas: HTMLCanvasElement): void {
  const close = (canvas as HTMLCanvasElement & { close?: () => void }).close;
  try {
    close?.call(canvas);
  } catch {
    // Width/height reset below remains the portable release path.
  }
  canvas.width = 0;
  canvas.height = 0;
}

function sourceTargetId(texture: THREE.Texture): string {
  return `vrm-texture:${texture.uuid}`;
}

function flipRgbaRowsInPlace(
  data: Uint8ClampedArray,
  size: StudioVrmTextureSize,
): void {
  const rowBytes = size.width * RGBA_CHANNELS;
  const temporary = new Uint8ClampedArray(rowBytes);
  for (let top = 0; top < Math.floor(size.height / 2); top += 1) {
    const bottom = size.height - top - 1;
    const topOffset = top * rowBytes;
    const bottomOffset = bottom * rowBytes;
    temporary.set(data.subarray(topOffset, topOffset + rowBytes));
    data.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
    data.set(temporary, bottomOffset);
  }
}

export class StudioVrmTexturePaintRuntime {
  private readonly scene: THREE.Object3D;
  private readonly options: NormalizedRuntimeOptions;
  private readonly targetsByOriginal = new Map<THREE.Texture, PaintTarget>();
  private readonly targetsByPainted = new Map<THREE.Texture, PaintTarget>();
  private readonly targets: PaintTarget[] = [];
  private readonly listeners = new Set<StudioVrmTexturePaintRuntimeListener>();
  private readonly geometryPrewarmController = new AbortController();
  private readonly inFlightReadControllers = new Set<AbortController>();
  private readonly inFlightReadsBySource = new Map<THREE.Texture, number>();
  private inFlightReadCount = 0;
  private historyPast: HistoryRecord[] = [];
  private historyFuture: HistoryRecord[] = [];
  private historyBytes = 0;
  private aggregateRgbaBytes = 0;
  private aggregateTargetResidentBytes = 0;
  private selectedTarget: PaintTarget | null = null;
  private pending: PendingStroke | null = null;
  private active: ActiveStroke | null = null;
  private lastError: StudioVrmTexturePaintRuntimeError | null = null;
  private lastGuidance: StudioVrmTexturePaintRuntimeGuidance | null = null;
  private disposed = false;
  private contentRevision = 0;
  private snapshot: StudioVrmTexturePaintRuntimeSnapshot;

  constructor(
    scene: THREE.Object3D,
    options: CreateStudioVrmTexturePaintRuntimeOptions = {},
  ) {
    this.scene = scene;
    this.options = normalizeOptions(options);
    this.snapshot = this.createSnapshot();
    void this.prewarmSceneGeometry();
  }

  getSnapshot = (): StudioVrmTexturePaintRuntimeSnapshot => this.snapshot;

  /**
   * Monotonic revision of canvas-visible/export-observable RGBA content. Unlike React snapshots,
   * this advances for every successful incremental dirty-rect upload, including pointer moves that
   * intentionally avoid publishing UI state.
   */
  getContentRevision = (): number => this.contentRevision;

  subscribe = (listener: StudioVrmTexturePaintRuntimeListener): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  };

  clearError(): StudioVrmTexturePaintRuntimeSnapshot {
    if (this.lastError || this.lastGuidance) {
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
    }
    return this.snapshot;
  }

  exportPaintedTargets():
    StudioVrmTexturePaintRuntimeResult<readonly StudioVrmTexturePaintExportTarget[]> {
    if (this.disposed) return this.fail("disposed");
    if (this.pending || this.active) return this.fail("pointer-active");
    const exported: StudioVrmTexturePaintExportTarget[] = [];
    const bindingOwners = new Map<string, string>();
    for (const target of this.targets) {
      if (!target.valid) return this.fail("target-invalid");
      if (pixelsEqual(target.imageData.data, target.originalPixels)) continue;
      const bindingsByIdentity = new Map<string, StudioVrmTexturePaintBindingDescriptor>();
      for (const { descriptor } of target.bindings.values()) {
        const identity = `${descriptor.materialLocator}\u0000${descriptor.textureSlot}`;
        const owner = bindingOwners.get(identity);
        if (owner !== undefined && owner !== target.id) return this.fail("binding-conflict");
        bindingOwners.set(identity, target.id);
        bindingsByIdentity.set(identity, descriptor);
      }
      const bindings = [...bindingsByIdentity.values()]
        .sort((left, right) => left.bindingKey.localeCompare(right.bindingKey));
      if (bindings.length === 0) return this.fail("binding-missing");
      exported.push(Object.freeze({
        id: target.id,
        width: target.size.width,
        height: target.size.height,
        pixels: target.imageData.data.slice(),
        bindings: Object.freeze(bindings),
      }));
    }
    exported.sort((left, right) =>
      (left.bindings[0]?.bindingKey ?? "").localeCompare(
        right.bindings[0]?.bindingKey ?? "",
      ));
    return success(Object.freeze(exported));
  }

  async rehydrateTarget(
    input: StudioVrmTexturePaintRehydrateTarget,
  ): Promise<
    StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>
  > {
    if (this.disposed) return this.fail("disposed");
    if (this.pending || this.active) return this.fail("pointer-active");
    if (!isCanonicalBindingDescriptor(input.binding)) return this.fail("binding-missing");
    if (input.signal?.aborted) return this.fail("source-read-aborted");
    const size = {
      width: input.image?.width,
      height: input.image?.height,
    };
    if (
      !isStudioVrmTextureSize(size)
      || !(input.image?.data instanceof Uint8ClampedArray)
      || input.image.data.byteLength !== size.width * size.height * RGBA_CHANNELS
    ) {
      return this.fail("invalid-dimensions");
    }

    const materialEntries = [...collectSceneMaterialBindings(this.scene)]
      .filter(([, descriptor]) =>
        descriptor.materialLocator === input.binding.materialLocator
        && descriptor.textureSlot === input.binding.textureSlot
      );
    if (materialEntries.length > 1) return this.fail("binding-conflict");
    const materialEntry = materialEntries[0];
    const material = materialEntry?.[0];
    if (!material) return this.fail("binding-missing");
    let currentMap: THREE.Texture | null;
    try {
      currentMap = material.map;
    } catch {
      return this.fail("binding-missing");
    }
    if (!currentMap?.isTexture) return this.fail("map-missing");

    const existing =
      this.targetsByPainted.get(currentMap)
      ?? this.targetsByOriginal.get(currentMap)
      ?? null;
    if (existing) {
      const boundDescriptor = existing.bindings.get(material)?.descriptor;
      const ownsBinding =
        boundDescriptor?.materialLocator === input.binding.materialLocator
        && boundDescriptor.textureSlot === input.binding.textureSlot;
      if (
        !ownsBinding
        || existing.size.width !== size.width
        || existing.size.height !== size.height
        || !pixelsEqual(existing.imageData.data, input.image.data)
      ) {
        return this.fail("binding-conflict");
      }
      this.selectedTarget = existing;
      this.lastError = null;
      this.publish();
      return success(this.snapshot);
    }

    const controller = new AbortController();
    const handleAbort = () => controller.abort();
    input.signal?.addEventListener("abort", handleAbort, { once: true });
    try {
      const original = await this.readSourceTexture(currentMap, controller);
      if (!original.ok) return this.fail(original.error.code);
      if (input.signal?.aborted || this.disposed) {
        return this.fail(this.disposed ? "disposed" : "source-read-aborted");
      }
      if (
        original.value.width !== size.width
        || original.value.height !== size.height
      ) {
        return this.fail("binding-conflict");
      }
      const targetResult = this.createTarget(currentMap, original.value);
      if (!targetResult.ok) return this.fail(targetResult.error.code);
      const created = targetResult.value;
      const createdDescriptor = created.bindings.get(material)?.descriptor;
      if (
        createdDescriptor?.materialLocator !== input.binding.materialLocator
        || createdDescriptor.textureSlot !== input.binding.textureSlot
      ) {
        this.invalidateTarget(created);
        return this.fail("binding-missing");
      }
      if (input.signal?.aborted || this.disposed) {
        this.invalidateTarget(created);
        return this.fail(this.disposed ? "disposed" : "source-read-aborted");
      }
      created.imageData.data.set(input.image.data);
      if (!this.syncTarget(created)) {
        this.invalidateTarget(created);
        return this.fail("canvas-unavailable");
      }
      this.selectedTarget = created;
      this.lastError = null;
      this.publish();
      return success(this.snapshot);
    } finally {
      input.signal?.removeEventListener("abort", handleAbort);
    }
  }

  async beginStroke(
    input: StudioVrmTexturePaintStrokeBegin,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(input.pointerId)) return this.fail("invalid-pointer");
    if (!isValidStrokeStyle(input.style)) return this.fail("invalid-style");
    if (this.pending || this.active) return this.fail("pointer-active");

    this.lastGuidance = null;
    const hitResult = this.resolveHit(input.hit, input.pressure);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    const resolved = hitResult.value;
    const request: PendingStroke = {
      pointerId: input.pointerId,
      originMaterial: resolved.material,
      sourceTexture: resolved.sourceTexture,
      style: copyStrokeStyle(input.style),
      planOptions: Object.freeze({ ...input.planOptions }),
      samples: [{ ...resolved.sample }],
      wrapU: resolved.wrapU,
      wrapV: resolved.wrapV,
      paintWrap: resolved.paintWrap,
      readController: resolved.target ? null : new AbortController(),
      target: resolved.target,
      terminal: null,
    };
    this.pending = request;
    this.publish();

    if (!request.target) {
      const readController = request.readController;
      if (!readController) {
        this.pending = null;
        return this.fail("source-unreadable");
      }
      const readableResult = await this.readSourceTexture(
        request.sourceTexture,
        readController,
      );
      if (this.pending !== request || this.disposed) return failure("stale-completion");
      if (!readableResult.ok) {
        this.pending = null;
        return this.fail(readableResult.error.code);
      }
      try {
        if (request.originMaterial.map !== request.sourceTexture) {
          this.pending = null;
          return this.fail("source-changed");
        }
      } catch {
        this.pending = null;
        return this.fail("source-changed");
      }
      const targetResult = this.createTarget(request.sourceTexture, readableResult.value);
      if (!targetResult.ok) {
        this.pending = null;
        return this.fail(targetResult.error.code);
      }
      request.target = targetResult.value;
    } else {
      const rebound = this.bindUnownedSourceMaterials(request.target);
      if (!rebound.ok) {
        this.pending = null;
        return this.fail(rebound.error.code);
      }
    }

    if (this.pending !== request || this.disposed || !request.target) {
      return failure("stale-completion");
    }
    const recorder = createStudioVrmTextureUndoRecorder(
      request.target.imageData.data,
      request.target.size,
      this.options.undoTileSize,
      this.options.maxHistoryBytes,
      (requiredPeakBytes) => this.admitHistoryPeak(requiredPeakBytes),
    );
    if (!recorder) {
      this.pending = null;
      return this.fail("invalid-dimensions");
    }

    const stroke: ActiveStroke = {
      pointerId: request.pointerId,
      target: request.target,
      paintWrap: request.paintWrap,
      recorder,
      walker: createStudioVrmTextureStrokeWalker(
        request.style,
        request.target.size,
        {
          ...request.planOptions,
          wrapU: request.wrapU,
          wrapV: request.wrapV,
          flipV: false,
        },
      ),
      lastSample: null,
      sampleCount: 0,
      changedTexels: 0,
    };
    const terminal = request.terminal;
    this.pending = null;
    this.active = stroke;
    this.selectedTarget = stroke.target;
    for (const sample of request.samples) {
      stroke.lastSample = { ...sample };
      stroke.sampleCount += 1;
      const applyResult = this.applyIncrementalSample(stroke, sample);
      if (!applyResult.ok) return applyResult;
    }
    if (terminal === "commit") {
      const commitResult = this.finishActiveStroke(stroke);
      if (!commitResult.ok) return failure(commitResult.error.code);
    } else {
      this.publish();
    }
    return success(this.snapshot);
  }

  moveStroke(
    input: StudioVrmTexturePaintStrokeMove,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(input.pointerId)) return this.fail("invalid-pointer");

    if (this.pending) {
      if (this.pending.pointerId !== input.pointerId) return this.fail("pointer-mismatch");
      if (this.pending.terminal) return success(false);
      const hitResult = this.resolveHit(input.hit, input.pressure);
      if (!hitResult.ok) return this.fail(hitResult.error.code);
      if (hitResult.value.sourceTexture !== this.pending.sourceTexture) {
        return this.fail("target-mismatch");
      }
      const appended = this.appendStrokeSample(this.pending.samples, hitResult.value.sample);
      if (appended === "coalesced") return success(false);
      if (appended === "budget") return this.fail("stroke-sample-budget");
      return success(true);
    }

    if (!this.active) return success(false);
    if (this.active.pointerId !== input.pointerId) return this.fail("pointer-mismatch");
    const hitResult = this.resolveHit(input.hit, input.pressure);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    if (hitResult.value.sourceTexture !== this.active.target.originalTexture) {
      return this.fail("target-mismatch");
    }
    const appended = this.appendActiveStrokeSample(this.active, hitResult.value.sample);
    if (appended === "coalesced") return success(false);
    if (appended === "budget") return this.fail("stroke-sample-budget");
    const result = this.applyIncrementalSample(this.active, hitResult.value.sample);
    return result.ok ? success(true) : failure(result.error.code);
  }

  commitStroke(pointerId: number): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(pointerId)) return this.fail("invalid-pointer");
    if (this.pending) {
      if (this.pending.pointerId !== pointerId) return this.fail("pointer-mismatch");
      if (this.pending.terminal) return success(false);
      this.pending.terminal = "commit";
      return success(true);
    }
    if (!this.active) return success(false);
    if (this.active.pointerId !== pointerId) return this.fail("pointer-mismatch");
    return this.finishActiveStroke(this.active);
  }

  cancelStroke(pointerId: number): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(pointerId)) return this.fail("invalid-pointer");
    if (this.pending) {
      if (this.pending.pointerId !== pointerId) return this.fail("pointer-mismatch");
      this.pending.readController?.abort();
      this.pending = null;
      this.publish();
      return success(true);
    }
    if (!this.active) return success(false);
    if (this.active.pointerId !== pointerId) return this.fail("pointer-mismatch");
    const stroke = this.active;
    this.active = null;
    const restored = stroke.recorder.cancel();
    if (restored > 0 && !this.syncTarget(stroke.target)) {
      this.invalidateTarget(stroke.target);
      return this.fail("target-invalid");
    }
    this.publish();
    return success(true);
  }

  undo(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.pending || this.active) return this.fail("pointer-active");
    const record = this.historyPast.at(-1);
    if (!record) return success(false);
    if (!record.target.valid) return this.fail("target-invalid");
    if (!applyStudioVrmTextureUndoEntry(
      record.target.imageData.data,
      record.target.size,
      record.entry,
      "undo",
    )) {
      return this.fail("invalid-dimensions");
    }
    if (!this.syncTarget(record.target)) {
      const rolledBack = applyStudioVrmTextureUndoEntry(
        record.target.imageData.data,
        record.target.size,
        record.entry,
        "redo",
      ) && this.syncTarget(record.target);
      if (!rolledBack) {
        this.invalidateTarget(record.target);
        return this.fail("target-invalid");
      }
      return this.fail("canvas-unavailable");
    }
    this.historyPast.pop();
    this.historyFuture.push(record);
    this.selectedTarget = record.target;
    this.publish();
    return success(true);
  }

  redo(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.pending || this.active) return this.fail("pointer-active");
    const record = this.historyFuture.at(-1);
    if (!record) return success(false);
    if (!record.target.valid) return this.fail("target-invalid");
    if (!applyStudioVrmTextureUndoEntry(
      record.target.imageData.data,
      record.target.size,
      record.entry,
      "redo",
    )) {
      return this.fail("invalid-dimensions");
    }
    if (!this.syncTarget(record.target)) {
      const rolledBack = applyStudioVrmTextureUndoEntry(
        record.target.imageData.data,
        record.target.size,
        record.entry,
        "undo",
      ) && this.syncTarget(record.target);
      if (!rolledBack) {
        this.invalidateTarget(record.target);
        return this.fail("target-invalid");
      }
      return this.fail("canvas-unavailable");
    }
    this.historyFuture.pop();
    this.historyPast.push(record);
    this.selectedTarget = record.target;
    this.publish();
    return success(true);
  }

  resetActiveTarget(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.pending || this.active) return this.fail("pointer-active");
    const target = this.selectedTarget;
    if (!target) return success(false);
    if (!target.valid) return this.fail("target-invalid");
    target.imageData.data.set(target.originalPixels);
    if (!this.syncTarget(target)) {
      this.invalidateTarget(target);
      return this.fail("target-invalid");
    }
    this.removeTargetHistory(target);
    this.publish();
    return success(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometryPrewarmController.abort();
    for (const controller of this.inFlightReadControllers) controller.abort();
    this.pending = null;
    if (this.active) {
      this.active.recorder.cancel();
      this.active = null;
    }

    for (const target of this.targets) {
      for (const binding of target.bindings.values()) {
        try {
          if (binding.material.map === target.paintedTexture) {
            binding.material.map = binding.originalMap;
            markMaterialChanged(binding.material);
          }
        } catch {
          // Do not let one custom material prevent the remaining owned bindings from restoring.
        }
      }
      try {
        target.paintedTexture.dispose();
      } catch {
        // Continue releasing the canvas and the remaining targets.
      }
      disposeCanvas(target.canvas);
      target.bindings.clear();
    }

    this.targetsByOriginal.clear();
    this.targetsByPainted.clear();
    this.targets.length = 0;
    this.historyPast = [];
    this.historyFuture = [];
    this.historyBytes = 0;
    this.aggregateRgbaBytes = 0;
    this.aggregateTargetResidentBytes = 0;
    this.selectedTarget = null;
    this.lastError = null;
    this.lastGuidance = null;
    this.publish();
    this.listeners.clear();
  }

  private isPointerId(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
  }

  private async prewarmSceneGeometry(): Promise<void> {
    // Construction stays deterministic and cheap; geometry snapshotting starts after the runtime
    // is returned. Jobs are deliberately sequential to cap transferable copies and Worker memory.
    await Promise.resolve();
    const signal = this.geometryPrewarmController.signal;
    if (this.disposed || signal.aborted) return;
    let jobs: readonly GeometryPrewarmJob[];
    try {
      jobs = collectGeometryPrewarmJobs(
        this.scene,
        this.options.maxGeometryIndexTriangles,
      );
    } catch {
      return;
    }
    for (const job of jobs) {
      if (this.disposed || signal.aborted) return;
      try {
        await this.options.precomputeGeometryIndex(job.geometry, {
          uvAttribute: job.uvAttribute,
          maxTriangles: this.options.maxGeometryIndexTriangles,
          signal,
          allowSynchronousFallback: false,
        });
      } catch {
        // Worker availability, abort, timeout, stale geometry, and malformed custom geometry all
        // fail closed. Pointer input remains usable through the small-sync/face-local paths.
      }
    }
  }

  private appendStrokeSample(
    samples: StudioVrmTextureStrokeSample[],
    sample: StudioVrmTextureStrokeSample,
  ): "appended" | "budget" | "coalesced" {
    if (canCoalesceStrokeSample(samples.at(-1), sample)) return "coalesced";
    if (samples.length >= this.options.maxStrokeSamples) return "budget";
    samples.push({ ...sample });
    return "appended";
  }

  private appendActiveStrokeSample(
    stroke: ActiveStroke,
    sample: StudioVrmTextureStrokeSample,
  ): "appended" | "budget" | "coalesced" {
    if (canCoalesceStrokeSample(stroke.lastSample ?? undefined, sample)) return "coalesced";
    if (stroke.sampleCount >= this.options.maxStrokeSamples) return "budget";
    stroke.lastSample = { ...sample };
    stroke.sampleCount += 1;
    return "appended";
  }

  private resolveHit(
    hit: StudioVrmTexturePaintRayHit,
    pressure: number | undefined,
  ): StudioVrmTexturePaintRuntimeResult<ResolvedPaintHit> {
    const object = hit.object as THREE.Object3D & { readonly isMesh?: unknown };
    if (object?.isMesh !== true) return failure("mesh-missing");
    if (!objectBelongsToScene(object, this.scene)) return failure("hit-outside-scene");
    const material = materialAtHit(object as THREE.Mesh, hit);
    if (!material) return failure("material-missing");

    let map: THREE.Texture | null;
    try {
      map = material.map;
    } catch {
      return failure("material-missing");
    }
    if (!map?.isTexture) return failure("map-missing");
    const target = this.targetsByPainted.get(map) ?? this.targetsByOriginal.get(map) ?? null;
    if (target && !target.valid) return failure("target-invalid");
    const sourceTexture = target?.originalTexture ?? map;
    const effectiveTexture = target?.paintedTexture ?? map;
    const textureChannel = effectiveTexture.channel;
    if (textureChannel !== 0 && textureChannel !== 1) {
      return failure("uv-missing");
    }
    const uvAttribute = textureChannel === 1 ? "uv1" : "uv";
    const uv = finiteUv(textureChannel === 1 ? hit.uv1 : hit.uv);
    if (!uv) return failure("uv-missing");
    try {
      if (effectiveTexture.matrixAutoUpdate) effectiveTexture.updateMatrix();
      uv.applyMatrix3(effectiveTexture.matrix);
    } catch {
      return failure("uv-missing");
    }
    if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return failure("uv-missing");

    const world = finiteWorld(hit.point);
    const faceIndexProvided = hit.faceIndex !== undefined && hit.faceIndex !== null;
    if (faceIndexProvided && !isUsableFaceIndex(hit.faceIndex)) {
      return failure("uv-missing");
    }
    let islandId = `${object.uuid}:${material.uuid}`;
    let texelsPerWorldUnit: number | undefined;
    if (isUsableFaceIndex(hit.faceIndex)) {
      const faceIndex = hit.faceIndex;
      let geometryIndex: StudioVrmTextureGeometryIndex | null = null;
      try {
        const geometry = (object as THREE.Mesh).geometry;
        const indexOptions = {
          uvAttribute,
          maxTriangles: this.options.maxGeometryIndexTriangles,
        } as const;
        const admission = inspectStudioVrmTextureGeometryAdmission(
          geometry,
          indexOptions,
        );
        if (admission && !admission.admitted) {
          this.lastGuidance = frozenGeometryBudgetGuidance(
            admission.triangleCount,
            admission.maxTriangles,
          );
        } else if (admission?.admitted) {
          geometryIndex = getCachedStudioVrmTextureGeometryIndex(
            geometry,
            indexOptions,
          );
          if (
            !geometryIndex
            && admission.triangleCount
              <= STUDIO_VRM_TEXTURE_PAINT_POINTER_SYNC_GEOMETRY_MAX_TRIANGLES
          ) {
            geometryIndex = getStudioVrmTextureGeometryIndex(geometry, indexOptions);
          }
        }
      } catch {
        // 손상된 custom geometry는 아래 face-specific fallback으로 격리한다.
      }
      const island = geometryIndex?.getIsland(faceIndex) ?? null;
      islandId = island
        ? `${object.uuid}:${material.uuid}:${island.key}`
        : `${object.uuid}:${material.uuid}:${uvAttribute}:face:${faceIndex}`;

      // 첫 beginStroke는 비동기 read보다 먼저 오므로 island는 크기와 무관하게 위에서 고정한다.
      // 밀도만 이미 준비된 target 또는 안전하게 읽힌 원본 이미지 크기가 있을 때 보강한다.
      const textureSize = target?.size ?? textureImageDimensions(sourceTexture);
      if (geometryIndex && textureSize) {
        try {
          object.updateWorldMatrix(true, false);
          const classification = geometryIndex.resolvePaintClassification(
            faceIndex,
            textureSize,
            {
              matrixWorld: object.matrixWorld,
              uvAreaScale: Math.abs(effectiveTexture.matrix.determinant()),
            },
          );
          if (classification) {
            islandId = `${object.uuid}:${material.uuid}:${classification.island.key}`;
            if (classification.texelsPerWorldUnit !== null) {
              texelsPerWorldUnit = classification.texelsPerWorldUnit;
            }
          }
        } catch {
          // island/fallback ID는 유지하고 밀도 보강만 생략한다.
        }
      }
    }
    return success({
      material,
      sourceTexture,
      target,
      sample: {
        uv: { u: uv.x, v: uv.y },
        ...(pressure === undefined ? {} : { pressure }),
        islandId,
        ...(world ? { world } : {}),
        ...(texelsPerWorldUnit === undefined ? {} : { texelsPerWorldUnit }),
      },
      wrapU: textureWrapMode(effectiveTexture.wrapS),
      wrapV: textureWrapMode(effectiveTexture.wrapT),
      paintWrap: paintWrapOptions(effectiveTexture),
    });
  }

  private async readSourceTexture(
    texture: THREE.Texture,
    controller: AbortController,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintReadableImage>> {
    if (isCompressedTexture(texture)) return failure("source-compressed");
    if (controller.signal.aborted) return failure("source-read-aborted");
    const knownSize = textureImageDimensions(texture);
    if (knownSize) {
      const admissionError = this.targetAdmissionError(knownSize);
      if (admissionError) return failure(admissionError);
    }
    if ((this.inFlightReadsBySource.get(texture) ?? 0) >= 1) {
      return failure("source-read-active");
    }
    if (this.inFlightReadCount >= this.options.maxConcurrentReads) {
      return failure("read-concurrency-budget");
    }
    this.inFlightReadCount += 1;
    this.inFlightReadsBySource.set(texture, 1);
    this.inFlightReadControllers.add(controller);
    try {
      const readable = await this.options.readTextureImage(texture, controller.signal);
      if (controller.signal.aborted) return failure("source-read-aborted");
      const size = { width: readable?.width, height: readable?.height };
      if (!isStudioVrmTextureSize(size)) return failure("invalid-dimensions");
      if (!(readable.data instanceof Uint8ClampedArray)) return failure("invalid-dimensions");
      const rgbaBytes = size.width * size.height * RGBA_CHANNELS;
      if (readable.data.byteLength !== rgbaBytes) return failure("invalid-dimensions");
      const admissionError = this.targetAdmissionError(size);
      if (admissionError) return failure(admissionError);
      if (controller.signal.aborted) return failure("source-read-aborted");
      if (texture.flipY) flipRgbaRowsInPlace(readable.data, size);
      return success({ ...size, data: readable.data });
    } catch (error) {
      if (controller.signal.aborted) return failure("source-read-aborted");
      if (error instanceof StudioVrmTexturePaintFault) return failure(error.code);
      return failure("source-unreadable");
    } finally {
      this.inFlightReadControllers.delete(controller);
      this.inFlightReadCount = Math.max(0, this.inFlightReadCount - 1);
      this.inFlightReadsBySource.delete(texture);
    }
  }

  private targetAdmissionError(
    size: StudioVrmTextureSize,
  ): "aggregate-rgba-budget" | "target-rgba-budget" | null {
    const residentBytes = estimateStudioVrmTexturePaintTargetResidentBytes(size);
    if (residentBytes === null || residentBytes > this.options.maxTargetResidentBytes) {
      return "target-rgba-budget";
    }
    const admittedTotal = saturatedByteSum(
      this.aggregateTargetResidentBytes,
      residentBytes,
      this.options.maxHistoryBytes,
    );
    return admittedTotal > this.options.maxAggregateResidentBytes
      ? "aggregate-rgba-budget"
      : null;
  }

  private createTarget(
    source: THREE.Texture,
    readable: StudioVrmTexturePaintReadableImage,
  ): StudioVrmTexturePaintRuntimeResult<PaintTarget> {
    const existing = this.targetsByOriginal.get(source);
    if (existing) return success(existing);
    const rgbaBytes = readable.width * readable.height * RGBA_CHANNELS;
    const size = { width: readable.width, height: readable.height };
    if (!isStudioVrmTextureSize(size)) return failure("invalid-dimensions");
    const residentBytes = estimateStudioVrmTexturePaintTargetResidentBytes(size);
    if (residentBytes === null) return failure("invalid-dimensions");
    const admissionError = this.targetAdmissionError(size);
    if (admissionError) return failure(admissionError);

    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D;
    let imageData: ImageData;
    try {
      canvas = this.options.createCanvas(readable.width, readable.height);
      canvas.width = readable.width;
      canvas.height = readable.height;
      const candidate = canvas.getContext("2d", { willReadFrequently: true });
      if (!candidate) {
        disposeCanvas(canvas);
        return failure("canvas-unavailable");
      }
      context = candidate;
      imageData = context.createImageData(readable.width, readable.height);
      if (imageData.data.byteLength !== rgbaBytes) {
        disposeCanvas(canvas);
        return failure("invalid-dimensions");
      }
      imageData.data.set(readable.data);
      context.putImageData(imageData, 0, 0);
    } catch {
      if (canvas) disposeCanvas(canvas);
      return failure("canvas-unavailable");
    }
    if (!canvas) return failure("canvas-unavailable");

    const paintedTexture = new THREE.CanvasTexture(canvas);
    try {
      copyTextureSampling(source, paintedTexture);
    } catch {
      paintedTexture.dispose();
      disposeCanvas(canvas);
      return failure("source-unreadable");
    }
    const target: PaintTarget = {
      id: sourceTargetId(source),
      originalTexture: source,
      paintedTexture,
      canvas,
      context,
      imageData,
      originalPixels: readable.data,
      size: Object.freeze(size),
      rgbaBytes,
      residentBytes,
      bindings: new Map(),
      valid: true,
      invalidReason: null,
    };
    const bindingResult = this.bindUnownedSourceMaterials(target);
    if (!bindingResult.ok || target.bindings.size === 0) {
      paintedTexture.dispose();
      disposeCanvas(canvas);
      return failure(bindingResult.ok ? "source-changed" : bindingResult.error.code);
    }

    this.targetsByOriginal.set(source, target);
    this.targetsByPainted.set(paintedTexture, target);
    this.targets.push(target);
    this.aggregateRgbaBytes += rgbaBytes;
    this.aggregateTargetResidentBytes += residentBytes;
    return success(target);
  }

  private bindUnownedSourceMaterials(
    target: PaintTarget,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (!target.valid) return failure("target-invalid");
    const candidates = new Map<
      BaseColorMaterial,
      StudioVrmTexturePaintBindingDescriptor
    >();
    for (const [material, descriptor] of collectSceneMaterialBindings(this.scene)) {
      if (target.bindings.has(material)) continue;
      try {
        if (material.map === target.originalTexture) candidates.set(material, descriptor);
      } catch {
        // A throwing custom material is not a safe binding candidate.
      }
    }

    const changed: MaterialBinding[] = [];
    try {
      for (const [material, descriptor] of candidates) {
        const binding = {
          material,
          originalMap: material.map,
          descriptor,
        } satisfies MaterialBinding;
        material.map = target.paintedTexture;
        markMaterialChanged(material);
        target.bindings.set(material, binding);
        changed.push(binding);
      }
      return success(changed.length > 0);
    } catch {
      for (const binding of changed) {
        try {
          if (binding.material.map === target.paintedTexture) {
            binding.material.map = binding.originalMap;
            markMaterialChanged(binding.material);
          }
        } catch {
          // Preserve the original binding failure.
        }
        target.bindings.delete(binding.material);
      }
      return failure("source-changed");
    }
  }

  private applyIncrementalSample(
    stroke: ActiveStroke,
    sample: StudioVrmTextureStrokeSample,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    const append = stroke.walker.append(sample);
    let changed = 0;
    let dirtyRect = EMPTY_STUDIO_VRM_TEXTURE_RECT;
    for (const op of append.ops) {
      const opRects = studioVrmTexturePaintOpRects(
        op,
        stroke.target.size,
        stroke.paintWrap,
      );
      if (!stroke.recorder.recordAll(opRects)) {
        const rolledBack = this.rollbackActiveStroke(stroke);
        return this.fail(rolledBack ? "history-budget" : "target-invalid");
      }
      for (const rect of opRects) {
        dirtyRect = unionStudioVrmTextureRect(dirtyRect, rect);
      }
      changed += applyStudioVrmTexturePaintOp(
        stroke.target.imageData.data,
        stroke.target.size,
        op,
        {
          ...stroke.paintWrap,
          originalPixels: stroke.target.originalPixels,
        },
      );
    }
    stroke.changedTexels += changed;
    if (changed > 0 && !this.syncTarget(stroke.target, dirtyRect)) {
      const rolledBack = this.rollbackActiveStroke(stroke);
      return this.fail(rolledBack ? "canvas-unavailable" : "target-invalid");
    }
    return success(changed > 0);
  }

  private rollbackActiveStroke(stroke: ActiveStroke): boolean {
    if (this.active === stroke) this.active = null;
    const restored = stroke.recorder.cancel();
    if (restored > 0 && !this.syncTarget(stroke.target)) {
      this.invalidateTarget(stroke.target);
      return false;
    }
    return true;
  }

  private finishActiveStroke(
    stroke: ActiveStroke,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.active !== stroke) return success(false);
    const entry = stroke.recorder.finish();
    if (stroke.recorder.budgetExceeded) {
      const rolledBack = this.rollbackActiveStroke(stroke);
      return this.fail(rolledBack ? "history-budget" : "target-invalid");
    }
    this.active = null;
    if (!entry || stroke.changedTexels === 0) {
      this.publish();
      return success(true);
    }
    const bytes = studioVrmTextureUndoEntryBytes(entry);
    if (!this.admitHistoryPeak(bytes)) {
      const restored = applyStudioVrmTextureUndoEntry(
        stroke.target.imageData.data,
        stroke.target.size,
        entry,
        "undo",
      );
      if (!restored || !this.syncTarget(stroke.target)) {
        this.invalidateTarget(stroke.target);
        return this.fail("target-invalid");
      }
      return this.fail("history-budget");
    }

    this.clearFutureHistory();
    const record = { target: stroke.target, entry, bytes };
    this.historyPast.push(record);
    this.historyBytes += bytes;
    this.evictHistory();
    this.publish();
    return success(true);
  }

  private clearFutureHistory(): void {
    for (const record of this.historyFuture) this.historyBytes -= record.bytes;
    this.historyFuture = [];
  }

  private admitHistoryPeak(requiredPeakBytes: number): boolean {
    if (
      !Number.isSafeInteger(requiredPeakBytes)
      || requiredPeakBytes < 0
      || requiredPeakBytes > this.options.maxHistoryBytes
    ) {
      return false;
    }
    const retainedHistoryLimit = this.options.maxHistoryBytes - requiredPeakBytes;
    let evicted = false;
    while (this.historyBytes > retainedHistoryLimit) {
      // 새 획이 완료되면 redo branch는 어차피 무효화된다. 가장 가까운 redo를 최대한
      // 보존하도록 먼 redo부터, 그 다음 가장 오래된 undo부터 필요한 만큼만 제거한다.
      const record = this.historyFuture.shift() ?? this.historyPast.shift();
      if (!record) break;
      this.historyBytes -= record.bytes;
      evicted = true;
    }
    this.historyBytes = Math.max(0, this.historyBytes);
    if (evicted) this.publish();
    return this.historyBytes <= retainedHistoryLimit;
  }

  private evictHistory(): void {
    while (this.historyPast.length + this.historyFuture.length > this.options.maxHistoryEntries) {
      const evicted = this.historyPast.shift() ?? this.historyFuture.shift();
      if (!evicted) break;
      this.historyBytes -= evicted.bytes;
    }
    while (this.historyBytes > this.options.maxHistoryBytes) {
      const evicted = this.historyPast.shift() ?? this.historyFuture.shift();
      if (!evicted) break;
      this.historyBytes -= evicted.bytes;
    }
    this.historyBytes = Math.max(0, this.historyBytes);
  }

  private removeTargetHistory(target: PaintTarget): void {
    this.historyPast = this.historyPast.filter((record) => record.target !== target);
    this.historyFuture = this.historyFuture.filter((record) => record.target !== target);
    this.historyBytes = 0;
    for (const record of this.historyPast) this.historyBytes += record.bytes;
    for (const record of this.historyFuture) this.historyBytes += record.bytes;
  }

  private invalidateTarget(target: PaintTarget): void {
    if (!target.valid) return;
    target.valid = false;
    target.invalidReason = "canvas-unavailable";
    if (this.active?.target === target) this.active = null;
    if (this.pending?.target === target) {
      this.pending.readController?.abort();
      this.pending = null;
    }
    this.removeTargetHistory(target);
    for (const binding of target.bindings.values()) {
      try {
        if (binding.material.map === target.paintedTexture) {
          binding.material.map = binding.originalMap;
          markMaterialChanged(binding.material);
        }
      } catch {
        // Continue releasing the remaining runtime-owned bindings and raster resources.
      }
    }
    target.bindings.clear();
    if (this.targetsByOriginal.get(target.originalTexture) === target) {
      this.targetsByOriginal.delete(target.originalTexture);
    }
    if (this.targetsByPainted.get(target.paintedTexture) === target) {
      this.targetsByPainted.delete(target.paintedTexture);
    }
    const targetIndex = this.targets.indexOf(target);
    if (targetIndex >= 0) this.targets.splice(targetIndex, 1);
    this.aggregateRgbaBytes = Math.max(0, this.aggregateRgbaBytes - target.rgbaBytes);
    this.aggregateTargetResidentBytes = Math.max(
      0,
      this.aggregateTargetResidentBytes - target.residentBytes,
    );
    if (this.selectedTarget === target) this.selectedTarget = null;
    try {
      target.paintedTexture.dispose();
    } catch {
      // Canvas release below is still required when a custom renderer wrapper throws.
    }
    disposeCanvas(target.canvas);
  }

  private syncTarget(
    target: PaintTarget,
    dirtyRect = EMPTY_STUDIO_VRM_TEXTURE_RECT,
  ): boolean {
    if (!target.valid) return false;
    try {
      if (dirtyRect.width > 0 && dirtyRect.height > 0) {
        target.context.putImageData(
          target.imageData,
          0,
          0,
          dirtyRect.x,
          dirtyRect.y,
          dirtyRect.width,
          dirtyRect.height,
        );
      } else {
        target.context.putImageData(target.imageData, 0, 0);
      }
      target.paintedTexture.needsUpdate = true;
      this.contentRevision = Math.min(
        Number.MAX_SAFE_INTEGER,
        this.contentRevision + 1,
      );
      return true;
    } catch {
      return false;
    }
  }

  private fail<T>(
    code: StudioVrmTexturePaintRuntimeErrorCode,
  ): StudioVrmTexturePaintRuntimeResult<T> {
    this.lastError = frozenError(code);
    this.publish();
    return Object.freeze({ ok: false as const, error: this.lastError });
  }

  private publish(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch {
        // State transitions must not be interrupted by a consumer listener.
      }
    }
  }

  private createSnapshot(): StudioVrmTexturePaintRuntimeSnapshot {
    const targetSnapshots = this.targets.map((target) => Object.freeze({
      id: target.id,
      sourceTextureUuid: target.originalTexture.uuid,
      paintedTextureUuid: target.paintedTexture.uuid,
      sourceName: target.originalTexture.name,
      width: target.size.width,
      height: target.size.height,
      rgbaBytes: target.rgbaBytes,
      residentBytes: target.residentBytes,
      bindingCount: target.bindings.size,
      valid: target.valid,
      invalidReason: target.invalidReason,
    }));
    const status: StudioVrmTexturePaintRuntimeStatus = this.disposed
      ? "disposed"
      : this.pending
        ? "loading"
        : this.active
          ? "painting"
          : this.selectedTarget && !this.selectedTarget.valid
            ? "invalid"
            : this.selectedTarget
              ? "ready"
              : "idle";
    const activeTarget = this.selectedTarget
      ? Object.freeze({
          id: this.selectedTarget.id,
          sourceName: this.selectedTarget.originalTexture.name,
          width: this.selectedTarget.size.width,
          height: this.selectedTarget.size.height,
          bindingCount: this.selectedTarget.bindings.size,
          valid: this.selectedTarget.valid,
          invalidReason: this.selectedTarget.invalidReason,
        })
      : null;
    return Object.freeze({
      status,
      activePointerId: this.pending?.pointerId ?? this.active?.pointerId ?? null,
      activeTargetId: this.selectedTarget?.id ?? null,
      activeTarget,
      aggregateRgbaBytes: this.aggregateRgbaBytes,
      aggregateTargetResidentBytes: this.aggregateTargetResidentBytes,
      residentBytes: saturatedByteSum(this.aggregateTargetResidentBytes, this.historyBytes),
      maxResidentBytes: this.options.maxAggregateResidentBytes,
      targets: Object.freeze(targetSnapshots),
      history: Object.freeze({
        undoCount: this.historyPast.length,
        redoCount: this.historyFuture.length,
        retainedBytes: this.historyBytes,
        maxEntries: this.options.maxHistoryEntries,
        maxBytes: this.options.maxHistoryBytes,
      }),
      error: this.lastError,
      guidance: this.lastGuidance,
    });
  }
}

export function createStudioVrmTexturePaintRuntime(
  scene: THREE.Object3D,
  options: CreateStudioVrmTexturePaintRuntimeOptions = {},
): StudioVrmTexturePaintRuntime {
  return new StudioVrmTexturePaintRuntime(scene, options);
}
