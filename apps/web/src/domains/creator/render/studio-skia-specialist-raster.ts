/**
 * Prepares one exact, immutable PNG surface for image semantics that the retained Skia document
 * renderer cannot reproduce from the source URL alone (filters, filter masks, layer masks, WebP,
 * GIF/current-frame capture, or cell-animation sources).
 *
 * The heavy filter implementation is not duplicated here. The final/settled Worker contract remains
 * authoritative, and the pure filter/layer mask math is shared with the existing editor. The output
 * is a ref-countable blob URL that can enter the ordinary Skia image texture cache.
 */

import {
  applyFilterMaskToPixels,
  computeFilterMaskCoverage,
  filterMaskRenderKey,
  shouldApplyFilterMask,
  type FilterMaskCoverage,
} from "../filter/studio-filter-mask";
import { studioLayerBorderEffectCachePad } from "../layer/studio-layer-border-effect";
import { shouldApplyLayerMask } from "../layer/studio-layer-mask";
import {
  listEnabledStudioAdjustmentOperations,
  normalizeStudioAdjustmentFilterOperations,
  studioAdjustmentOperationToFilterFields,
} from "../studio-adjustment-stack";
import { normalizeOutline, outlineCachePad } from "../studio-outline";
import {
  hasActiveImageFilters,
  imageFilterCacheKey,
  type ImageFilterFields,
} from "./studio-konva-filter-fields";
import {
  acquireStudioRasterSourceLease,
  type StudioRasterSourceAuthority,
  type StudioRasterSourceLease,
} from "./studio-raster-source-lease";

import type { StudioImageDataLike } from "../studio-filters";
import { studioSkiaBrowserImageSourcePool } from "./studio-skia-browser-image-source-pool";
import { applyStudioSkiaRoundedCornerAlphaToPixels } from "./studio-skia-rounded-corner-raster";
import type { StudioSkiaSpecialistRasterElement } from "./studio-skia-specialist-raster-contract";

export {
  requiresStudioSkiaSpecialistRaster,
  STUDIO_SKIA_SPECIALIST_RASTER_ANIMATION_INTERVAL_MS,
} from "./studio-skia-specialist-raster-contract";
export type { StudioSkiaSpecialistRasterElement } from "./studio-skia-specialist-raster-contract";

export const STUDIO_SKIA_SPECIALIST_RASTER_MAX_PIXELS = 64 * 1024 * 1024;
export const STUDIO_SKIA_SPECIALIST_RASTER_MAX_BYTES = 256 * 1024 * 1024;

export interface StudioSkiaSpecialistRasterPlan {
  readonly key: string;
  readonly source: string;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly density: number;
  readonly padding: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly contentOffsetX: number;
  readonly contentOffsetY: number;
  readonly contentPixelWidth: number;
  readonly contentPixelHeight: number;
  readonly filterMaskSource: string | null;
  readonly layerMaskSource: string | null;
  readonly hasFilters: boolean;
  readonly capturesLiveFrame: boolean;
  readonly frameIdentity: string | null;
  readonly cornerRadius: number;
  /** Monotonic revision used only to snapshot the next browser-owned animated frame. */
  readonly liveFrameRevision: number | null;
}

export interface StudioSkiaSpecialistRasterPlanOptions {
  /** Canonical final surfaces default to 1x so pixel-space filter semantics do not change. */
  readonly density?: number;
  /** Resolved by the filter runtime. Outline/fuchi filters require transparent local padding. */
  readonly padding?: number;
  readonly maxPixels?: number;
  readonly liveFrameRevision?: number;
}

export type StudioSkiaSpecialistRasterFailureCode =
  | "not-image"
  | "invalid-source"
  | "invalid-dimensions"
  | "pixel-budget"
  | "aborted"
  | "decode-failed"
  | "filter-failed"
  | "mask-failed"
  | "encode-failed";

export class StudioSkiaSpecialistRasterError extends Error {
  public constructor(
    public readonly code: StudioSkiaSpecialistRasterFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = code === "aborted" ? "AbortError" : "StudioSkiaSpecialistRasterError";
  }
}

export interface StudioSkiaSpecialistRasterLease {
  readonly key: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** Local document-space origin relative to the element transform origin. */
  readonly localX: number;
  readonly localY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly capturesLiveFrame: boolean;
  release(): void;
}

export interface StudioSkiaSpecialistDecodedPixels {
  readonly imageData: StudioImageDataLike;
  release(): void;
}

export interface StudioSkiaSpecialistRasterDependencies {
  acquireSource(
    source: string,
    options: {
      readonly authority?: StudioRasterSourceAuthority;
      readonly signal?: AbortSignal;
      readonly consumer: string;
      readonly maxPixels: number;
    },
  ): Promise<StudioRasterSourceLease>;
  decodePixels(input: {
    readonly source: string;
    readonly width: number | null;
    readonly height: number | null;
    readonly offsetX?: number;
    readonly offsetY?: number;
    readonly canvasWidth?: number;
    readonly canvasHeight?: number;
    readonly signal?: AbortSignal;
  }): Promise<StudioSkiaSpecialistDecodedPixels>;
  runFilters(input: {
    readonly imageData: StudioImageDataLike;
    readonly element: ImageFilterFields;
    readonly signal?: AbortSignal;
  }): Promise<StudioImageDataLike>;
  encodePng(imageData: StudioImageDataLike, signal?: AbortSignal): Promise<Blob>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
}

export interface PrepareStudioSkiaSpecialistRasterOptions {
  readonly signal?: AbortSignal;
  readonly authority?: StudioRasterSourceAuthority;
  readonly dependencies?: StudioSkiaSpecialistRasterDependencies;
  readonly consumer?: string;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function abortError(): StudioSkiaSpecialistRasterError {
  return new StudioSkiaSpecialistRasterError("aborted", "Skia 전문 래스터 준비가 취소되었습니다.");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function frameIdentityOf(element: StudioSkiaSpecialistRasterElement): string | null {
  if (element.isAnimatedGif) return `gif:${element.src}`;
  if (!element.frames || element.frames.length <= 1) return null;
  const active = element.activeFrameId
    ? element.frames.find((frame) => frame.id === element.activeFrameId)
    : undefined;
  const frame = active ?? element.frames.find((candidate) => candidate.src === element.src) ?? element.frames[0];
  return frame ? `${frame.id}:${frame.src}` : null;
}

function boundedInteger(value: number, minimum = 1): number | null {
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) && rounded >= minimum ? rounded : null;
}

function filterFieldsPadding(fields: ImageFilterFields): number {
  let padding = 0;
  if (fields.outline) padding = Math.max(padding, outlineCachePad(normalizeOutline(fields.outline)));
  return Math.max(padding, studioLayerBorderEffectCachePad(fields.borderEffect));
}

/** Exact transparent padding required by outline/fuchi filters, including smart-filter entries. */
export function resolveStudioSkiaSpecialistRasterPadding(
  element: StudioSkiaSpecialistRasterElement,
): number {
  let padding = filterFieldsPadding(element);
  const operations = element.smartFilterOperations !== undefined
    ? normalizeStudioAdjustmentFilterOperations(element.smartFilterOperations)
    : listEnabledStudioAdjustmentOperations(element.smartFilters);
  for (const operation of operations) {
    padding = Math.max(
      padding,
      filterFieldsPadding(studioAdjustmentOperationToFilterFields(operation)),
    );
  }
  return padding;
}

export function planStudioSkiaSpecialistRaster(
  element: StudioSkiaSpecialistRasterElement,
  options: StudioSkiaSpecialistRasterPlanOptions = {},
): StudioSkiaSpecialistRasterPlan {
  if (element.type !== "image") {
    throw new StudioSkiaSpecialistRasterError("not-image", "전문 래스터 준비는 image 요소만 지원합니다.");
  }
  if (typeof element.src !== "string" || element.src.trim().length === 0) {
    throw new StudioSkiaSpecialistRasterError("invalid-source", "이미지 source가 비어 있습니다.");
  }
  if (!finitePositive(element.width) || !finitePositive(element.height)) {
    throw new StudioSkiaSpecialistRasterError("invalid-dimensions", "이미지 표시 크기가 올바르지 않습니다.");
  }
  const density = finitePositive(options.density) ? Math.min(2, Math.max(1, options.density)) : 1;
  const resolvedPadding = options.padding ?? resolveStudioSkiaSpecialistRasterPadding(element);
  const padding = finiteNonNegative(resolvedPadding) ? Math.min(16_384, resolvedPadding) : 0;
  const contentPixelWidth = boundedInteger(element.width * density);
  const contentPixelHeight = boundedInteger(element.height * density);
  const paddingPixels = boundedInteger(padding * density, 0);
  if (contentPixelWidth === null || contentPixelHeight === null || paddingPixels === null) {
    throw new StudioSkiaSpecialistRasterError(
      "invalid-dimensions",
      "이미지 전문 래스터 크기가 안전한 정수 범위를 벗어났습니다.",
    );
  }
  const pixelWidth = contentPixelWidth + paddingPixels * 2;
  const pixelHeight = contentPixelHeight + paddingPixels * 2;
  const pixelCount = pixelWidth * pixelHeight;
  const maxPixels = finitePositive(options.maxPixels)
    ? Math.min(STUDIO_SKIA_SPECIALIST_RASTER_MAX_PIXELS, Math.floor(options.maxPixels))
    : STUDIO_SKIA_SPECIALIST_RASTER_MAX_PIXELS;
  if (
    !Number.isSafeInteger(pixelWidth)
    || !Number.isSafeInteger(pixelHeight)
    || !Number.isSafeInteger(pixelCount)
    || pixelCount <= 0
    || pixelCount > maxPixels
  ) {
    throw new StudioSkiaSpecialistRasterError(
      "pixel-budget",
      `이미지 전문 래스터가 ${maxPixels.toLocaleString()}px 예산을 초과했습니다.`,
    );
  }
  const hasFilters = hasActiveImageFilters(element);
  const filterMaskRequested = hasFilters && shouldApplyFilterMask(element);
  const filterMaskSource = filterMaskRequested
    ? element.filterMaskSrc?.trim() || null
    : null;
  if (filterMaskRequested && !filterMaskSource) {
    throw new StudioSkiaSpecialistRasterError(
      "mask-failed",
      "공유 필터 마스크가 아직 렌더 가능한 source로 materialize되지 않았습니다.",
    );
  }
  const layerMaskSource = shouldApplyLayerMask(element)
    ? element.maskSrc?.trim() || null
    : null;
  const frameIdentity = frameIdentityOf(element);
  const cornerRadius = finiteNonNegative(element.cornerRadius)
    ? Math.min(element.cornerRadius, Math.min(element.width, element.height) / 2)
    : 0;
  const capturesLiveFrame = element.isAnimatedGif === true;
  const requestedLiveFrameRevision = options.liveFrameRevision ?? 0;
  if (
    capturesLiveFrame
    && (!Number.isSafeInteger(requestedLiveFrameRevision) || requestedLiveFrameRevision < 0)
  ) {
    throw new StudioSkiaSpecialistRasterError(
      "invalid-dimensions",
      "애니메이션 프레임 revision은 0 이상의 안전 정수여야 합니다.",
    );
  }
  const liveFrameRevision = capturesLiveFrame ? requestedLiveFrameRevision : null;
  const key = JSON.stringify([
    "studio-skia-specialist-raster/v1",
    element.src,
    element.width,
    element.height,
    density,
    padding,
    hasFilters ? imageFilterCacheKey(element) : "",
    filterMaskRenderKey(element),
    layerMaskSource ?? "",
    frameIdentity ?? "",
    cornerRadius,
    liveFrameRevision ?? "",
  ]);
  return Object.freeze({
    key,
    source: element.src,
    displayWidth: element.width,
    displayHeight: element.height,
    density,
    padding,
    pixelWidth,
    pixelHeight,
    contentOffsetX: paddingPixels,
    contentOffsetY: paddingPixels,
    contentPixelWidth,
    contentPixelHeight,
    filterMaskSource,
    layerMaskSource,
    hasFilters,
    capturesLiveFrame,
    frameIdentity,
    cornerRadius,
    liveFrameRevision,
  });
}

export function computeStudioLayerMaskCoverage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): FilterMaskCoverage | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (rgba.length !== width * height * 4) return null;
  const data = new Uint8ClampedArray(width * height);
  for (let index = 0, offset = 3; index < data.length; index += 1, offset += 4) {
    data[index] = rgba[offset]!;
  }
  return { width, height, data };
}

function sampleCoverage(
  coverage: FilterMaskCoverage,
  u: number,
  v: number,
): number {
  const cu = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  const cv = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  const x = cu * coverage.width - 0.5;
  const y = cv * coverage.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const cx0 = Math.min(coverage.width - 1, Math.max(0, x0));
  const cx1 = Math.min(coverage.width - 1, Math.max(0, x0 + 1));
  const cy0 = Math.min(coverage.height - 1, Math.max(0, y0));
  const cy1 = Math.min(coverage.height - 1, Math.max(0, y0 + 1));
  const top = coverage.data[cy0 * coverage.width + cx0]! * (1 - tx)
    + coverage.data[cy0 * coverage.width + cx1]! * tx;
  const bottom = coverage.data[cy1 * coverage.width + cx0]! * (1 - tx)
    + coverage.data[cy1 * coverage.width + cx1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Applies an element-local layer mask to straight RGBA without changing hidden RGB. */
export function applyStudioLayerMaskCoverageToPixels(input: {
  readonly target: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly coverage: FilterMaskCoverage;
  readonly contentOffsetX?: number;
  readonly contentOffsetY?: number;
  readonly contentWidth?: number;
  readonly contentHeight?: number;
}): boolean {
  const { target, width, height, coverage } = input;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || target.length !== width * height * 4
  ) return false;
  const offsetX = finiteNonNegative(input.contentOffsetX) ? input.contentOffsetX : 0;
  const offsetY = finiteNonNegative(input.contentOffsetY) ? input.contentOffsetY : 0;
  const contentWidth = finitePositive(input.contentWidth) ? input.contentWidth : width;
  const contentHeight = finitePositive(input.contentHeight) ? input.contentHeight : height;
  let pixelOffset = 3;
  for (let y = 0; y < height; y += 1) {
    const v = ((y + 0.5) - offsetY) / contentHeight;
    for (let x = 0; x < width; x += 1, pixelOffset += 4) {
      const u = ((x + 0.5) - offsetX) / contentWidth;
      const mask = sampleCoverage(coverage, u, v);
      if (mask >= 255) continue;
      if (mask <= 0) target[pixelOffset] = 0;
      else target[pixelOffset] = target[pixelOffset]! * (mask / 255);
    }
  }
  return true;
}

function assertImageData(imageData: StudioImageDataLike, label: string): void {
  const expected = imageData.width * imageData.height * 4;
  if (
    !Number.isSafeInteger(imageData.width)
    || !Number.isSafeInteger(imageData.height)
    || imageData.width <= 0
    || imageData.height <= 0
    || !Number.isSafeInteger(expected)
    || imageData.data.length !== expected
  ) {
    throw new StudioSkiaSpecialistRasterError("decode-failed", `${label} 픽셀 형식이 올바르지 않습니다.`);
  }
}

async function decodeMaskCoverage(
  source: string,
  signal: AbortSignal | undefined,
  dependencies: StudioSkiaSpecialistRasterDependencies,
  mode: "filter" | "layer",
): Promise<FilterMaskCoverage> {
  const decoded = await dependencies.decodePixels({ source, width: null, height: null, signal });
  try {
    throwIfAborted(signal);
    assertImageData(decoded.imageData, mode === "filter" ? "필터 마스크" : "레이어 마스크");
    const coverage = mode === "filter"
      ? computeFilterMaskCoverage(
          decoded.imageData.data,
          decoded.imageData.width,
          decoded.imageData.height,
        )
      : computeStudioLayerMaskCoverage(
          decoded.imageData.data,
          decoded.imageData.width,
          decoded.imageData.height,
        );
    if (!coverage) {
      throw new StudioSkiaSpecialistRasterError(
        "mask-failed",
        mode === "filter" ? "필터 마스크를 해석하지 못했습니다." : "레이어 마스크를 해석하지 못했습니다.",
      );
    }
    return coverage;
  } finally {
    decoded.release();
  }
}

export async function prepareStudioSkiaSpecialistRaster(
  element: StudioSkiaSpecialistRasterElement,
  plan: StudioSkiaSpecialistRasterPlan,
  options: PrepareStudioSkiaSpecialistRasterOptions = {},
): Promise<StudioSkiaSpecialistRasterLease> {
  const signal = options.signal;
  throwIfAborted(signal);
  const dependencies = options.dependencies ?? studioSkiaSpecialistRasterBrowserDependencies;
  const consumer = options.consumer ?? `studio-skia-specialist:${element.id}`;
  const sourceLease = await dependencies.acquireSource(plan.source, {
    authority: options.authority,
    signal,
    consumer,
    maxPixels: STUDIO_SKIA_SPECIALIST_RASTER_MAX_PIXELS,
  });
  let decoded: StudioSkiaSpecialistDecodedPixels | null = null;
  let objectUrl: string | null = null;
  try {
    throwIfAborted(signal);
    decoded = await dependencies.decodePixels({
      source: sourceLease.src,
      width: plan.contentPixelWidth,
      height: plan.contentPixelHeight,
      offsetX: plan.contentOffsetX,
      offsetY: plan.contentOffsetY,
      canvasWidth: plan.pixelWidth,
      canvasHeight: plan.pixelHeight,
      signal,
    });
    assertImageData(decoded.imageData, "이미지 source");
    if (
      decoded.imageData.width !== plan.pixelWidth
      || decoded.imageData.height !== plan.pixelHeight
    ) {
      throw new StudioSkiaSpecialistRasterError(
        "decode-failed",
        "이미지 source가 계획한 전문 래스터 크기와 일치하지 않습니다.",
      );
    }
    if (plan.cornerRadius > 0 && !applyStudioSkiaRoundedCornerAlphaToPixels({
      target: decoded.imageData.data,
      width: plan.pixelWidth,
      height: plan.pixelHeight,
      contentOffsetX: plan.contentOffsetX,
      contentOffsetY: plan.contentOffsetY,
      contentWidth: plan.contentPixelWidth,
      contentHeight: plan.contentPixelHeight,
      radius: plan.cornerRadius * plan.density,
    })) {
      throw new StudioSkiaSpecialistRasterError(
        "filter-failed",
        "이미지 둥근 모서리를 전문 래스터에 적용하지 못했습니다.",
      );
    }
    const original = new Uint8ClampedArray(decoded.imageData.data);
    let target: StudioImageDataLike = {
      data: new Uint8ClampedArray(original),
      width: plan.pixelWidth,
      height: plan.pixelHeight,
    };
    if (plan.hasFilters) {
      try {
        target = await dependencies.runFilters({ imageData: target, element, signal });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        throw new StudioSkiaSpecialistRasterError(
          "filter-failed",
          "이미지 필터의 최종 픽셀을 준비하지 못했습니다.",
          { cause: error },
        );
      }
      assertImageData(target, "이미지 필터 결과");
      if (target.width !== plan.pixelWidth || target.height !== plan.pixelHeight) {
        throw new StudioSkiaSpecialistRasterError(
          "filter-failed",
          "이미지 필터 결과 크기가 계획한 전문 래스터와 일치하지 않습니다.",
        );
      }
    }
    if (plan.filterMaskSource) {
      const coverage = await decodeMaskCoverage(
        plan.filterMaskSource,
        signal,
        dependencies,
        "filter",
      );
      const applied = applyFilterMaskToPixels({
        target: target.data,
        original,
        width: plan.pixelWidth,
        height: plan.pixelHeight,
        coverage,
        transform: {
          padRatioX: plan.contentOffsetX / plan.pixelWidth,
          padRatioY: plan.contentOffsetY / plan.pixelHeight,
        },
      });
      if (!applied) {
        throw new StudioSkiaSpecialistRasterError(
          "mask-failed",
          "필터 마스크를 전문 래스터에 적용하지 못했습니다.",
        );
      }
    }
    if (plan.layerMaskSource) {
      const coverage = await decodeMaskCoverage(
        plan.layerMaskSource,
        signal,
        dependencies,
        "layer",
      );
      const applied = applyStudioLayerMaskCoverageToPixels({
        target: target.data,
        width: plan.pixelWidth,
        height: plan.pixelHeight,
        coverage,
        contentOffsetX: plan.contentOffsetX,
        contentOffsetY: plan.contentOffsetY,
        contentWidth: plan.contentPixelWidth,
        contentHeight: plan.contentPixelHeight,
      });
      if (!applied) {
        throw new StudioSkiaSpecialistRasterError(
          "mask-failed",
          "레이어 마스크를 전문 래스터에 적용하지 못했습니다.",
        );
      }
    }
    throwIfAborted(signal);
    let blob: Blob;
    try {
      blob = await dependencies.encodePng(target, signal);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      throw new StudioSkiaSpecialistRasterError(
        "encode-failed",
        "Skia 전문 래스터 PNG를 인코딩하지 못했습니다.",
        { cause: error },
      );
    }
    if (blob.size <= 0 || blob.size > STUDIO_SKIA_SPECIALIST_RASTER_MAX_BYTES) {
      throw new StudioSkiaSpecialistRasterError(
        "encode-failed",
        "Skia 전문 래스터 PNG 크기가 안전 예산을 벗어났습니다.",
      );
    }
    throwIfAborted(signal);
    objectUrl = dependencies.createObjectUrl(blob);
    let released = false;
    const ownedUrl = objectUrl;
    objectUrl = null;
    sourceLease.release();
    decoded.release();
    decoded = null;
    return Object.freeze({
      key: plan.key,
      src: ownedUrl,
      width: plan.pixelWidth,
      height: plan.pixelHeight,
      bytes: blob.size,
      localX: plan.padding > 0 ? -plan.padding : 0,
      localY: plan.padding > 0 ? -plan.padding : 0,
      displayWidth: plan.displayWidth + plan.padding * 2,
      displayHeight: plan.displayHeight + plan.padding * 2,
      capturesLiveFrame: plan.capturesLiveFrame,
      release(): void {
        if (released) return;
        released = true;
        dependencies.revokeObjectUrl(ownedUrl);
      },
    });
  } catch (error) {
    if (objectUrl) dependencies.revokeObjectUrl(objectUrl);
    decoded?.release();
    sourceLease.release();
    if (signal?.aborted && !(error instanceof StudioSkiaSpecialistRasterError)) throw abortError();
    throw error;
  }
}

function createCanvas(width: number, height: number): {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) return { canvas, context };
  }
  if (typeof document === "undefined") {
    throw new StudioSkiaSpecialistRasterError("decode-failed", "브라우저 canvas를 사용할 수 없습니다.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new StudioSkiaSpecialistRasterError("decode-failed", "2D 픽셀 컨텍스트를 만들지 못했습니다.");
  }
  return { canvas, context };
}

async function encodeCanvasPng(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    throwIfAborted(signal);
    return blob;
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      if (!blob) {
        reject(new StudioSkiaSpecialistRasterError("encode-failed", "PNG blob을 만들지 못했습니다."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export const studioSkiaSpecialistRasterBrowserDependencies: StudioSkiaSpecialistRasterDependencies = {
  acquireSource: (source, options) => acquireStudioRasterSourceLease(source, {
    ...(options.authority ? { authority: options.authority } : {}),
    signal: options.signal,
    consumer: options.consumer,
    maxPixels: options.maxPixels,
  }),
  async decodePixels(input) {
    const sourceLease = await studioSkiaBrowserImageSourcePool.acquire(input.source, input.signal);
    const image = sourceLease.image;
    throwIfAborted(input.signal);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const width = input.width ?? naturalWidth;
    const height = input.height ?? naturalHeight;
    const canvasWidth = input.canvasWidth ?? width;
    const canvasHeight = input.canvasHeight ?? height;
    if (![naturalWidth, naturalHeight, width, height, canvasWidth, canvasHeight].every(finitePositive)) {
      throw new StudioSkiaSpecialistRasterError("decode-failed", "디코드된 이미지 크기가 올바르지 않습니다.");
    }
    const out = createCanvas(Math.round(canvasWidth), Math.round(canvasHeight));
    out.context.clearRect(0, 0, Math.round(canvasWidth), Math.round(canvasHeight));
    out.context.drawImage(
      image,
      Math.round(input.offsetX ?? 0),
      Math.round(input.offsetY ?? 0),
      Math.round(width),
      Math.round(height),
    );
    const captured = out.context.getImageData(0, 0, Math.round(canvasWidth), Math.round(canvasHeight));
    return {
      imageData: {
        data: captured.data,
        width: captured.width,
        height: captured.height,
      },
      release() {
        sourceLease.release();
        out.canvas.width = 1;
        out.canvas.height = 1;
      },
    };
  },
  async runFilters(input) {
    const module = await import("../studio-image-filter-worker-client");
    const result = await module.runStudioImageFilterWorker({
      imageData: input.imageData,
      el: input.element,
    }, {
      signal: input.signal,
      executionMode: "worker",
    });
    return result.imageData;
  },
  async encodePng(imageData, signal) {
    assertImageData(imageData, "PNG 인코딩 입력");
    const out = createCanvas(imageData.width, imageData.height);
    const clamped = imageData.data instanceof Uint8ClampedArray
      ? imageData.data
      : new Uint8ClampedArray(imageData.data);
    out.context.putImageData(new ImageData(
      clamped as unknown as Uint8ClampedArray<ArrayBuffer>,
      imageData.width,
      imageData.height,
    ), 0, 0);
    return encodeCanvasPng(out.canvas, signal).finally(() => {
      out.canvas.width = 1;
      out.canvas.height = 1;
    });
  },
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};
