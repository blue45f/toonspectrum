/** Browser orchestration for layer-opacity and local semantic pixel selection. */
import {
  alphaMaskFromRgba,
  applySelectionSourceMask,
  foregroundConfidenceToMask,
  multiplySelectionSourceMasks,
} from "./studio-selection-source";

import type { StudioLocalForegroundModelReceipt } from "./studio-bg-remove";
import type {
  PixelSelection,
  SelectionOperationMode,
} from "./studio-selection-tools";

export const STUDIO_SELECTION_SOURCE_TRACE_MAX_DIM = 640;

export interface StudioSelectionSourceRequest {
  readonly src: string;
  readonly selection: PixelSelection | null;
  readonly operation: SelectionOperationMode;
  readonly aspect?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly signal?: AbortSignal;
}

export interface StudioSubjectSelectionRequest extends StudioSelectionSourceRequest {
  readonly threshold?: number;
  readonly softness?: number;
}

export interface StudioSubjectSelectionResult {
  readonly selection: PixelSelection | null;
  readonly receipt: StudioLocalForegroundModelReceipt;
  readonly sourceTransparencyApplied: boolean;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("선택 소스 분석을 취소했습니다.", "AbortError");
  }
  const error = new Error("선택 소스 분석을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function assertSource(src: string): void {
  if (typeof src !== "string" || src.length === 0) {
    throw new TypeError("선택할 이미지 소스가 없습니다.");
  }
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  assertSource(src);
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => {
      image.src = "";
      reject(createAbortError());
    });
    image.crossOrigin = "anonymous";
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error("선택할 이미지를 불러오지 못했습니다.")));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    image.src = src;
  });
}

function fittedRasterSize(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth?: number,
  targetHeight?: number,
): { width: number; height: number } {
  if (
    Number.isFinite(targetWidth)
    && Number.isFinite(targetHeight)
    && targetWidth! >= 1
    && targetHeight! >= 1
  ) {
    return {
      width: Math.max(1, Math.round(targetWidth!)),
      height: Math.max(1, Math.round(targetHeight!)),
    };
  }
  const width = Math.max(1, Math.round(sourceWidth));
  const height = Math.max(1, Math.round(sourceHeight));
  const scale = Math.min(1, STUDIO_SELECTION_SOURCE_TRACE_MAX_DIM / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function readImageAlphaMask(
  src: string,
  options: {
    readonly signal?: AbortSignal;
    readonly targetWidth?: number;
    readonly targetHeight?: number;
  } = {},
) {
  throwIfAborted(options.signal);
  const image = await loadImage(src, options.signal);
  throwIfAborted(options.signal);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new RangeError("선택할 이미지 크기를 확인할 수 없습니다.");
  }
  const { width, height } = fittedRasterSize(
    sourceWidth,
    sourceHeight,
    options.targetWidth,
    options.targetHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("선택 분석 캔버스를 만들 수 없습니다.");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  throwIfAborted(options.signal);
  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch (error) {
    throw new Error(
      "이미지 보안 정책 때문에 투명도 픽셀을 읽을 수 없습니다.",
      { cause: error },
    );
  }
  throwIfAborted(options.signal);
  return alphaMaskFromRgba(data, width, height);
}

export async function selectOpaqueFromImageSource(
  request: StudioSelectionSourceRequest,
): Promise<PixelSelection | null> {
  const mask = await readImageAlphaMask(request.src, { signal: request.signal });
  return applySelectionSourceMask(request.selection, mask, request.operation, {
    aspect: request.aspect,
    flipX: request.flipX,
    flipY: request.flipY,
  });
}

/**
 * Select the primary foreground using the existing on-device MediaPipe provider. Model confidence
 * is multiplied by source alpha whenever browser readback is permitted, so transparent padding can
 * never become selected. If alpha readback is blocked, semantic selection still succeeds and the
 * caller receives an explicit `sourceTransparencyApplied: false` receipt.
 */
export async function selectSubjectFromImageSource(
  request: StudioSubjectSelectionRequest,
): Promise<StudioSubjectSelectionResult> {
  assertSource(request.src);
  throwIfAborted(request.signal);
  const { getLocalForegroundConfidenceMask } = await import("./studio-bg-remove");
  const foreground = await getLocalForegroundConfidenceMask(request.src, {
    signal: request.signal,
  });
  throwIfAborted(request.signal);
  let mask = foregroundConfidenceToMask(
    foreground.confidence,
    foreground.width,
    foreground.height,
    { threshold: request.threshold, softness: request.softness },
  );
  let sourceTransparencyApplied = false;
  try {
    const sourceAlpha = await readImageAlphaMask(request.src, {
      signal: request.signal,
      targetWidth: foreground.width,
      targetHeight: foreground.height,
    });
    mask = multiplySelectionSourceMasks(mask, sourceAlpha);
    sourceTransparencyApplied = true;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") throw error;
    // Semantic confidence remains a valid local result when cross-origin alpha readback is blocked.
  }
  const selection = applySelectionSourceMask(
    request.selection,
    mask,
    request.operation,
    {
      aspect: request.aspect,
      flipX: request.flipX,
      flipY: request.flipY,
    },
  );
  return {
    selection,
    receipt: foreground.receipt,
    sourceTransparencyApplied,
  };
}

export function studioSelectionSourceErrorMessage(error: unknown): string {
  if ((error as { name?: string } | null)?.name === "AbortError") return "선택 분석을 취소했습니다.";
  return error instanceof Error && error.message
    ? error.message
    : "선택 영역을 만들지 못했습니다.";
}
