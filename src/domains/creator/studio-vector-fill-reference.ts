/**
 * Browser-only vector reference rasterization for Advanced Fill.
 *
 * The fill target is a transparent, page-sized virtual raster layer. Its boundary reference is
 * produced from document DrawEl items only through the same deterministic SVG serializer used by
 * Studio SVG export, so pressure, brush dynamics, symmetry, smart-shape geometry and material
 * dabs do not acquire a second rendering implementation here.
 *
 * UI overlays, comments, drawing-assist guides and the page background are not part of `El[]` or
 * are non-draw elements, and are therefore excluded. Hidden elements and hidden layer groups are
 * excluded before serialization. The output is transient and guarded by source/SVG/PNG byte caps
 * plus the Advanced Fill canvas pixel cap.
 */
import {
  currentStudioAdvancedFillBrowserMaxPixels,
  formatStudioAdvancedFillRasterSizeError,
  STUDIO_ADVANCED_FILL_BROWSER_MAX_PIXELS,
  validateStudioAdvancedFillRasterDimensions,
} from "./studio-advanced-fill-raster-safety";
import { loadStudioSvgExportWorkerClientModule } from "./studio-document-export-loaders";
import { isEffectivelyHidden, type LayerGroup } from "./studio-layers";

import type { El } from "./studio-element-model";
import type { SelectionFrame } from "./studio-selection-tools";
import type {
  SvgExportEl,
  SvgExportPageInput,
  SvgExportResult,
  SvgExportTheme,
} from "./studio-svg-export";
import type { StudioSvgExportWorkerFactory } from "./studio-svg-export-worker-client";

export const STUDIO_VECTOR_REFERENCE_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const STUDIO_VECTOR_REFERENCE_MAX_SVG_BYTES = 16 * 1024 * 1024;
export const STUDIO_VECTOR_REFERENCE_MAX_PNG_BYTES = 32 * 1024 * 1024;

const UTF8_ENCODER = new TextEncoder();
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const SVG_EXPORT_MIME = "image/svg+xml";

export interface StudioVectorReferenceBudgets {
  readonly maxPixelCount?: number;
  readonly maxSourceBytes?: number;
  readonly maxSvgBytes?: number;
  readonly maxPngBytes?: number;
}

export interface StudioVectorReferenceInput {
  readonly width: number;
  readonly height: number;
  readonly elements: readonly SvgExportEl[];
  readonly groups?: readonly LayerGroup[];
  readonly theme?: SvgExportTheme;
  /** Generic merged-copy callers may include the authored page background. Fill leaves this true. */
  readonly transparentBg?: boolean;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
  readonly fingerprintNamespace?: string;
  readonly budgets?: StudioVectorReferenceBudgets;
}

export interface StudioVectorReferenceRasterRequest {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export interface StudioVectorReferenceRasterResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export type StudioVectorReferenceRasterizer = (
  request: StudioVectorReferenceRasterRequest,
) => Promise<StudioVectorReferenceRasterResult>;

export interface StudioVectorReferenceRenderOptions {
  readonly signal?: AbortSignal;
  /** `null` forces the serializer's exact synchronous fallback; omitted uses its module Worker. */
  readonly workerFactory?: StudioSvgExportWorkerFactory | null;
  /** Test/platform seam. Production defaults to SVG Blob -> transparent Canvas2D -> PNG Blob. */
  readonly rasterize?: StudioVectorReferenceRasterizer;
}

export interface StudioVectorReferenceResult {
  readonly dataUrl: string;
  readonly fingerprint: string;
  readonly elementCount: number;
  readonly width: number;
  readonly height: number;
  readonly svgByteLength: number;
  readonly pngByteLength: number;
  readonly execution: "worker" | "direct";
}

export type StudioAdvancedFillVectorPlanFailureCode =
  | "invalid-page-id"
  | "invalid-dimensions"
  | "no-visible-vector-draw"
  | "source-budget-exceeded"
  | "svg-budget-exceeded"
  | "unsupported-vector-fidelity";

export interface StudioAdvancedFillVirtualTarget {
  readonly id: string;
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly frame: SelectionFrame;
  readonly name: string;
  readonly blankSrc: string;
  readonly sourceFingerprint: string;
  readonly sourceElementCount: number;
  /** Insert before this z-index so every source line remains above the new color layer. */
  readonly insertionIndex: number;
}

export type StudioAdvancedFillVectorTargetPlan =
  | {
      readonly ok: true;
      readonly target: StudioAdvancedFillVirtualTarget;
    }
  | {
      readonly ok: false;
      readonly code: StudioAdvancedFillVectorPlanFailureCode;
      readonly reason: string;
      /** Deterministic fallback is useful to callers rendering a disabled insertion preview. */
      readonly insertionIndex: number;
    };

export interface StudioAdvancedFillVectorTargetInput {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly elements: readonly El[];
  readonly groups?: readonly LayerGroup[];
  readonly theme?: SvgExportTheme;
  readonly name?: string;
  readonly budgets?: StudioVectorReferenceBudgets;
}

export class StudioVectorReferenceError extends Error {
  readonly code:
    | StudioAdvancedFillVectorPlanFailureCode
    | "aborted"
    | "png-budget-exceeded"
    | "invalid-png-output"
    | "raster-unavailable";

  constructor(code: StudioVectorReferenceError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StudioVectorReferenceError";
    this.code = code;
  }
}

interface NormalizedStudioVectorReferenceBudgets {
  readonly maxPixelCount: number;
  readonly maxSourceBytes: number;
  readonly maxSvgBytes: number;
  readonly maxPngBytes: number;
}

interface PreparedAdvancedFillVectorInput {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly elements: readonly Extract<El, { type: "draw" }>[];
  readonly groups: readonly LayerGroup[];
  readonly theme?: SvgExportTheme;
  readonly name: string;
  readonly insertionIndex: number;
  readonly budgets: NormalizedStudioVectorReferenceBudgets;
}

function boundedBudget(value: number | undefined, hardMaximum: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.min(value!, hardMaximum)
    : hardMaximum;
}

function normalizeBudgets(
  raw: StudioVectorReferenceBudgets | undefined,
): NormalizedStudioVectorReferenceBudgets {
  return {
    maxPixelCount: boundedBudget(raw?.maxPixelCount, STUDIO_ADVANCED_FILL_BROWSER_MAX_PIXELS),
    maxSourceBytes: boundedBudget(raw?.maxSourceBytes, STUDIO_VECTOR_REFERENCE_MAX_SOURCE_BYTES),
    maxSvgBytes: boundedBudget(raw?.maxSvgBytes, STUDIO_VECTOR_REFERENCE_MAX_SVG_BYTES),
    maxPngBytes: boundedBudget(raw?.maxPngBytes, STUDIO_VECTOR_REFERENCE_MAX_PNG_BYTES),
  };
}

function vectorReferenceAbortError(): StudioVectorReferenceError {
  const error = new StudioVectorReferenceError("aborted", "벡터 선화 참조 생성을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw vectorReferenceAbortError();
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

/** Non-cryptographic content fingerprint for cache/stale-result ownership, not trust decisions. */
export function fingerprintStudioVectorReference(svg: string, namespace = "vector-reference-v1"): string {
  const bytes = UTF8_ENCODER.encode(svg);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
    second = (second ^ (second >>> 13)) >>> 0;
  }
  return `${namespace}:${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function stableIdHash(value: string): string {
  return fingerprintStudioVectorReference(value, "id").slice(-16);
}

function transparentPageSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
}

function transparentPageDataUrl(width: number, height: number): string {
  return `data:${SVG_EXPORT_MIME},${encodeURIComponent(transparentPageSvg(width, height))}`;
}

function normalizedTargetName(value: string | undefined): string {
  let safeValue = "";
  for (const character of value ?? "") {
    const codePoint = character.codePointAt(0) ?? 0;
    safeValue += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  const normalized = safeValue.trim();
  if (!normalized) return "벡터 채색";
  return normalized.slice(0, 120);
}

function sourceSerializedByteLength(elements: readonly SvgExportEl[]): number {
  try {
    return utf8ByteLength(JSON.stringify(elements));
  } catch (error) {
    throw new StudioVectorReferenceError(
      "source-budget-exceeded",
      "벡터 선화 데이터를 안전하게 읽지 못했습니다. 문제가 있는 획을 삭제하거나 페이지를 복제해 다시 시도해 주세요.",
      { cause: error },
    );
  }
}

function validateVectorDimensions(
  width: number,
  height: number,
  budgets: NormalizedStudioVectorReferenceBudgets,
): { width: number; height: number } {
  try {
    return validateStudioAdvancedFillRasterDimensions(width, height, budgets.maxPixelCount);
  } catch (error) {
    throw new StudioVectorReferenceError(
      "invalid-dimensions",
      formatStudioAdvancedFillRasterSizeError(error),
      { cause: error },
    );
  }
}

function assertSourceBudget(
  elements: readonly SvgExportEl[],
  budgets: NormalizedStudioVectorReferenceBudgets,
): void {
  if (sourceSerializedByteLength(elements) > budgets.maxSourceBytes) {
    throw new StudioVectorReferenceError(
      "source-budget-exceeded",
      "벡터 선화 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 일부 획을 병합한 뒤 다시 시도해 주세요.",
    );
  }
}

function assertSvgResult(
  result: SvgExportResult,
  budgets: NormalizedStudioVectorReferenceBudgets,
): number {
  if (result.skipped.length > 0) {
    throw new StudioVectorReferenceError(
      "unsupported-vector-fidelity",
      "일부 벡터 획을 원본과 같게 참조 이미지로 만들 수 없습니다. 지우개 획이나 지원되지 않는 합성을 병합한 뒤 다시 시도해 주세요.",
    );
  }
  const svgByteLength = utf8ByteLength(result.svg);
  if (svgByteLength > budgets.maxSvgBytes) {
    throw new StudioVectorReferenceError(
      "svg-budget-exceeded",
      "벡터 선화의 렌더 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 일부 획을 병합한 뒤 다시 시도해 주세요.",
    );
  }
  return svgByteLength;
}

function pngDataUrlByteLength(dataUrl: string): number | null {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (!payload.startsWith("iVBORw0KGgo") || payload.length === 0 || payload.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(payload)) return null;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return payload.length / 4 * 3 - padding;
}

function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => {
      reader.abort();
      reject(vectorReferenceAbortError());
    });
    reader.onerror = () => finish(() => reject(
      reader.error ?? new StudioVectorReferenceError("raster-unavailable", "벡터 선화 PNG를 읽지 못했습니다."),
    ));
    reader.onload = () => finish(() => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new StudioVectorReferenceError("raster-unavailable", "벡터 선화 PNG를 data URL로 만들지 못했습니다."));
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    reader.readAsDataURL(blob);
  });
}

function loadSvgBlobImage(blob: Blob, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") {
      reject(new StudioVectorReferenceError("raster-unavailable", "이 브라우저에서는 벡터 선화를 이미지로 만들 수 없습니다."));
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => {
      image.src = "";
      reject(vectorReferenceAbortError());
    });
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(
      new StudioVectorReferenceError("raster-unavailable", "벡터 선화 SVG를 이미지로 읽지 못했습니다."),
    ));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    image.src = objectUrl;
  });
}

function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  maxOutputBytes: number,
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(vectorReferenceAbortError()));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    canvas.toBlob((blob) => finish(() => {
      if (!blob) {
        reject(new StudioVectorReferenceError("raster-unavailable", "벡터 선화 PNG를 인코딩하지 못했습니다."));
      } else if (blob.size > maxOutputBytes) {
        reject(new StudioVectorReferenceError(
          "png-budget-exceeded",
          "벡터 선화 PNG가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
        ));
      } else {
        resolve(blob);
      }
    }), "image/png");
  });
}

export const rasterizeStudioVectorReferenceInBrowser: StudioVectorReferenceRasterizer = async ({
  svg,
  width,
  height,
  maxOutputBytes,
  signal,
}) => {
  throwIfAborted(signal);
  if (typeof document === "undefined") {
    throw new StudioVectorReferenceError("raster-unavailable", "이 브라우저에서는 벡터 선화 캔버스를 만들 수 없습니다.");
  }
  const svgBlob = new Blob([svg], { type: SVG_EXPORT_MIME });
  const image = await loadSvgBlobImage(svgBlob, signal);
  throwIfAborted(signal);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new StudioVectorReferenceError("raster-unavailable", "벡터 선화 캔버스를 만들 수 없습니다.");
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    throwIfAborted(signal);
    if (typeof canvas.toBlob !== "function") {
      const dataUrl = canvas.toDataURL("image/png");
      const byteLength = pngDataUrlByteLength(dataUrl);
      if (byteLength === null) {
        throw new StudioVectorReferenceError("invalid-png-output", "벡터 선화 PNG 형식을 확인하지 못했습니다.");
      }
      if (byteLength > maxOutputBytes) {
        throw new StudioVectorReferenceError(
          "png-budget-exceeded",
          "벡터 선화 PNG가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
        );
      }
      return { dataUrl, width, height };
    }
    const png = await canvasToPngBlob(canvas, maxOutputBytes, signal);
    return { dataUrl: await blobToDataUrl(png, signal), width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

/**
 * Generic SVG-export -> transparent PNG seam. Advanced Fill filters to DrawEl before calling it;
 * future attachment-less vector filters can pass their own explicit document-vector selection.
 */
export async function renderStudioVectorReference(
  input: StudioVectorReferenceInput,
  options: StudioVectorReferenceRenderOptions = {},
): Promise<StudioVectorReferenceResult> {
  throwIfAborted(options.signal);
  const budgets = normalizeBudgets(input.budgets);
  const dimensions = validateVectorDimensions(input.width, input.height, budgets);
  assertSourceBudget(input.elements, budgets);
  const exportInput: SvgExportPageInput = {
    width: dimensions.width,
    height: dimensions.height,
    elements: input.elements,
    groups: input.groups,
    theme: input.theme,
    transparentBg: input.transparentBg ?? true,
    bg: input.bg,
    bgGrad: input.bgGrad,
  };
  const workerOptions = options.workerFactory === undefined
    ? { signal: options.signal }
    : { signal: options.signal, workerFactory: options.workerFactory };
  const { runStudioSvgExportWorker } = await loadStudioSvgExportWorkerClientModule();
  throwIfAborted(options.signal);
  const exported = await runStudioSvgExportWorker(exportInput, workerOptions);
  throwIfAborted(options.signal);
  const svgByteLength = assertSvgResult(exported.result, budgets);
  const fingerprint = fingerprintStudioVectorReference(
    exported.result.svg,
    input.fingerprintNamespace ?? "vector-reference-v1",
  );
  const rasterized = await (options.rasterize ?? rasterizeStudioVectorReferenceInBrowser)({
    svg: exported.result.svg,
    width: dimensions.width,
    height: dimensions.height,
    maxOutputBytes: budgets.maxPngBytes,
    signal: options.signal,
  });
  throwIfAborted(options.signal);
  if (rasterized.width !== dimensions.width || rasterized.height !== dimensions.height) {
    throw new StudioVectorReferenceError("invalid-png-output", "벡터 선화 PNG의 페이지 크기가 일치하지 않습니다.");
  }
  const pngByteLength = pngDataUrlByteLength(rasterized.dataUrl);
  if (pngByteLength === null) {
    throw new StudioVectorReferenceError("invalid-png-output", "벡터 선화 PNG 형식을 확인하지 못했습니다.");
  }
  if (pngByteLength > budgets.maxPngBytes) {
    throw new StudioVectorReferenceError(
      "png-budget-exceeded",
      "벡터 선화 PNG가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
    );
  }
  return {
    dataUrl: rasterized.dataUrl,
    fingerprint,
    elementCount: exported.result.elementCount,
    width: dimensions.width,
    height: dimensions.height,
    svgByteLength,
    pngByteLength,
    execution: exported.execution,
  };
}

function prepareAdvancedFillVectorInput(
  input: StudioAdvancedFillVectorTargetInput,
): PreparedAdvancedFillVectorInput | Extract<StudioAdvancedFillVectorTargetPlan, { ok: false }> {
  const groups = [...(input.groups ?? [])];
  const insertionIndex = input.elements.findIndex(
    (element) => element.type === "draw" && !isEffectivelyHidden(element, groups),
  );
  const safeInsertionIndex = insertionIndex >= 0 ? insertionIndex : input.elements.length;
  const pageId = input.pageId.trim();
  if (!pageId) {
    return {
      ok: false,
      code: "invalid-page-id",
      reason: "벡터 채색 레이어를 연결할 페이지를 찾지 못했습니다.",
      insertionIndex: safeInsertionIndex,
    };
  }
  const elements = input.elements.filter(
    (element): element is Extract<El, { type: "draw" }> =>
      element.type === "draw" && !isEffectivelyHidden(element, groups),
  );
  if (elements.length === 0) {
    return {
      ok: false,
      code: "no-visible-vector-draw",
      reason: "페이지에 표시 중인 벡터 선화가 없습니다. 펜이나 도형으로 선화를 추가한 뒤 다시 시도해 주세요.",
      insertionIndex: safeInsertionIndex,
    };
  }
  const budgets = normalizeBudgets(input.budgets);
  try {
    const dimensions = validateVectorDimensions(input.width, input.height, budgets);
    assertSourceBudget(elements, budgets);
    return {
      pageId,
      width: dimensions.width,
      height: dimensions.height,
      elements,
      groups,
      theme: input.theme,
      name: normalizedTargetName(input.name),
      insertionIndex: safeInsertionIndex,
      budgets,
    };
  } catch (error) {
    if (error instanceof StudioVectorReferenceError) {
      return {
        ok: false,
        code: error.code === "invalid-dimensions" ? "invalid-dimensions" : "source-budget-exceeded",
        reason: error.message,
        insertionIndex: safeInsertionIndex,
      };
    }
    throw error;
  }
}

export function planStudioAdvancedFillVectorTarget(
  input: StudioAdvancedFillVectorTargetInput,
): StudioAdvancedFillVectorTargetPlan {
  const prepared = prepareAdvancedFillVectorInput(input);
  if ("ok" in prepared) return prepared;
  if (prepared.elements.some((element) => element.mode === "eraser")) {
    return {
      ok: false,
      code: "unsupported-vector-fidelity",
      reason: "지우개 벡터 획은 선화 참조 이미지에서 원본 합성을 정확히 재현할 수 없습니다. 먼저 레이어를 병합해 주세요.",
      insertionIndex: prepared.insertionIndex,
    };
  }
  const sourcePayload = JSON.stringify({
    width: prepared.width,
    height: prepared.height,
    elements: prepared.elements,
    groups: prepared.groups,
    theme: prepared.theme,
  });
  const minimumSerializedBytes = utf8ByteLength(sourcePayload)
    + utf8ByteLength(transparentPageSvg(prepared.width, prepared.height));
  if (minimumSerializedBytes > prepared.budgets.maxSvgBytes) {
    return {
      ok: false,
      code: "svg-budget-exceeded",
      reason: "벡터 선화의 최소 직렬화 크기가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 일부 획을 병합해 주세요.",
      insertionIndex: prepared.insertionIndex,
    };
  }
  const sourceFingerprint = fingerprintStudioVectorReference(sourcePayload, "advanced-fill-vector-v2");
  return {
    ok: true,
    target: {
      id: `advanced-fill-vector-${stableIdHash(prepared.pageId)}-${sourceFingerprint.slice(-16)}`,
      pageId: prepared.pageId,
      width: prepared.width,
      height: prepared.height,
      frame: { x: 0, y: 0, width: prepared.width, height: prepared.height, rotation: 0 },
      name: prepared.name,
      blankSrc: transparentPageDataUrl(prepared.width, prepared.height),
      sourceFingerprint,
      sourceElementCount: prepared.elements.length,
      insertionIndex: prepared.insertionIndex,
    },
  };
}

export async function renderStudioAdvancedFillVectorReference(
  input: StudioAdvancedFillVectorTargetInput,
  options: StudioVectorReferenceRenderOptions = {},
): Promise<StudioVectorReferenceResult> {
  const prepared = prepareAdvancedFillVectorInput(input);
  if ("ok" in prepared) {
    throw new StudioVectorReferenceError(prepared.code, prepared.reason);
  }
  const rendered = await renderStudioVectorReference(
    {
      width: prepared.width,
      height: prepared.height,
      elements: prepared.elements,
      groups: prepared.groups,
      theme: prepared.theme,
      fingerprintNamespace: "advanced-fill-vector-v1",
      budgets: prepared.budgets,
    },
    options,
  );
  const sourcePayload = JSON.stringify({
    width: prepared.width,
    height: prepared.height,
    elements: prepared.elements,
    groups: prepared.groups,
    theme: prepared.theme,
  });
  return {
    ...rendered,
    fingerprint: fingerprintStudioVectorReference(sourcePayload, "advanced-fill-vector-v2"),
  };
}

export type StudioAdvancedFillMaterializedVectorTarget = Extract<El, { type: "image" }>;

export function materializeStudioAdvancedFillVectorTarget(
  target: StudioAdvancedFillVirtualTarget,
  resultSrc: string,
): StudioAdvancedFillMaterializedVectorTarget {
  if (pngDataUrlByteLength(resultSrc) === null) {
    throw new StudioVectorReferenceError("invalid-png-output", "벡터 채색 결과가 올바른 PNG 형식이 아닙니다.");
  }
  return {
    id: target.id,
    type: "image",
    name: target.name,
    src: resultSrc,
    x: target.frame.x,
    y: target.frame.y,
    width: target.frame.width,
    height: target.frame.height,
    rotation: target.frame.rotation ?? 0,
  };
}

/** Runtime helper for callers that choose a device-specific plan budget. */
export function currentStudioVectorReferenceBudgets(): StudioVectorReferenceBudgets {
  return { maxPixelCount: currentStudioAdvancedFillBrowserMaxPixels() };
}
