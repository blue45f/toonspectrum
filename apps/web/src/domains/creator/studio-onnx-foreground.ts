/**
 * General-subject foreground service for the quick background-removal
 * action: decode on-device, segment with U-2-Netp over the product ONNX
 * provider, and compose the transparent PNG with the same pixel contract
 * as the MediaPipe person route (`composeForegroundPixelAlpha` — the source
 * alpha is multiplied by model confidence, never replaced).
 *
 * This module is only ever loaded through a dynamic import from
 * `StudioBgRemoveButton`, so the ONNX runtime, its WASM assets, and the
 * 4.5MB model stay out of the Studio startup graph. Failures propagate to
 * the caller, which falls back to the person route instead of leaving the
 * action dead.
 */
import {
  STUDIO_BG_REMOVE_MAX_DECODED_AXIS,
  STUDIO_BG_REMOVE_MAX_DECODED_PIXELS,
  composeForegroundPixelAlpha,
  type StudioForegroundConfidenceMask,
} from "./studio-bg-remove";
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
} from "./studio-onnx-inference-provider";
import {
  loadStudioOnnxForegroundRuntime,
  loadStudioU2netpModelBytes,
} from "./studio-onnx-runtime-assets";
import {
  STUDIO_U2NETP_INPUT_SIZE,
  createStudioU2netpForegroundSegmenter,
  createStudioU2netpModelRegistry,
  type StudioU2netpSegmenter,
} from "./studio-onnx-u2netp";

export interface StudioOnnxForegroundConfidenceMask
  extends StudioForegroundConfidenceMask {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly executionProvider: StudioOnnxExecutionProvider;
}

export interface RemoveBackgroundWithGeneralSubjectOptions {
  readonly threshold?: number;
  readonly signal?: AbortSignal;
}

export interface StudioOnnxForegroundImage {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export type StudioOnnxForegroundImageLoader = (
  src: string,
  signal?: AbortSignal,
) => Promise<StudioOnnxForegroundImage>;

export interface CreateStudioOnnxForegroundServiceOptions {
  readonly loadImage?: StudioOnnxForegroundImageLoader;
  readonly segmenter?: StudioU2netpSegmenter;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("배경 제거를 취소했습니다.", "AbortError");
  }
  const error = new Error("배경 제거를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function assertThreshold(value: number | undefined): number {
  const threshold = value === undefined ? 0.5 : value;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError("배경 분리 임계값은 0과 1 사이의 유한한 수여야 합니다.");
  }
  return threshold;
}

function assertDecodedDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > STUDIO_BG_REMOVE_MAX_DECODED_AXIS
    || height > STUDIO_BG_REMOVE_MAX_DECODED_AXIS
    || width * height > STUDIO_BG_REMOVE_MAX_DECODED_PIXELS
  ) {
    throw new RangeError("디코드된 이미지 크기가 안전 한도를 초과합니다.");
  }
}

function loadImageElement(
  src: string,
  signal?: AbortSignal,
): Promise<StudioOnnxForegroundImage> {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      image.src = "";
      reject(createAbortError());
    };
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      try {
        assertDecodedDimensions(width, height);
      } catch (cause) {
        reject(cause);
        return;
      }
      resolve(Object.freeze({ image, width, height }));
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("이미지를 불러오지 못했습니다."));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    image.src = src;
  });
}

function readModelInputRgba(
  loaded: StudioOnnxForegroundImage,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = STUDIO_U2NETP_INPUT_SIZE;
  canvas.height = STUDIO_U2NETP_INPUT_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("캔버스를 만들 수 없습니다.");
  context.drawImage(
    loaded.image,
    0,
    0,
    STUDIO_U2NETP_INPUT_SIZE,
    STUDIO_U2NETP_INPUT_SIZE,
  );
  return context.getImageData(
    0,
    0,
    STUDIO_U2NETP_INPUT_SIZE,
    STUDIO_U2NETP_INPUT_SIZE,
  ).data;
}

/**
 * The production U-2-Netp segmenter wired to the bundled model asset and
 * the pinned ONNX runtime. Exported so the Layer Lift ONNX bridge
 * (`studio-layer-lift-onnx-inference`) shares this exact segmenter instead
 * of duplicating the provider factory.
 */
export function createStudioOnnxForegroundSegmenter(): StudioU2netpSegmenter {
  return createStudioU2netpForegroundSegmenter({
    loadModelBytes: loadStudioU2netpModelBytes,
    createProvider: (executionProvider) => (
      createStudioOnnxInferenceProvider({
        registry: createStudioU2netpModelRegistry(),
        executionProvider,
        loadRuntime: loadStudioOnnxForegroundRuntime,
      })
    ),
  });
}

export interface StudioOnnxForegroundService {
  getGeneralForegroundConfidenceMask(
    src: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioOnnxForegroundConfidenceMask>;
  removeBackgroundWithGeneralSubject(
    src: string,
    options?: RemoveBackgroundWithGeneralSubjectOptions,
  ): Promise<string>;
}

export function createStudioOnnxForegroundService(
  options: CreateStudioOnnxForegroundServiceOptions = {},
): StudioOnnxForegroundService {
  const imageLoader = options.loadImage ?? loadImageElement;
  let segmenter = options.segmenter ?? null;
  const getSegmenter = (): StudioU2netpSegmenter => {
    segmenter ??= createStudioOnnxForegroundSegmenter();
    return segmenter;
  };

  const segmentSource = async (
    src: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly loaded: StudioOnnxForegroundImage;
    readonly mask: StudioOnnxForegroundConfidenceMask;
  }> => {
    if (typeof src !== "string" || src.length === 0) {
      throw new TypeError("이미지 주소가 비어 있습니다.");
    }
    throwIfAborted(signal);
    const loaded = await imageLoader(src, signal);
    throwIfAborted(signal);
    const rgba = readModelInputRgba(loaded);
    const segmentation = await getSegmenter().segment(rgba, { signal });
    throwIfAborted(signal);
    return Object.freeze({
      loaded,
      mask: Object.freeze({
        width: segmentation.width,
        height: segmentation.height,
        confidence: segmentation.confidence,
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
        executionProvider: segmentation.executionProvider,
      }),
    });
  };

  return Object.freeze({
    async getGeneralForegroundConfidenceMask(
      src: string,
      maskOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const { mask } = await segmentSource(src, maskOptions.signal);
      return mask;
    },

    async removeBackgroundWithGeneralSubject(
      src: string,
      removeOptions: RemoveBackgroundWithGeneralSubjectOptions = {},
    ) {
      const threshold = assertThreshold(removeOptions.threshold);
      const { loaded, mask } = await segmentSource(src, removeOptions.signal);
      throwIfAborted(removeOptions.signal);
      const canvas = document.createElement("canvas");
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("캔버스를 만들 수 없습니다.");
      context.drawImage(loaded.image, 0, 0, loaded.width, loaded.height);
      const imageData = context.getImageData(0, 0, loaded.width, loaded.height);
      const foreground = composeForegroundPixelAlpha({
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
        sourceRgba: imageData.data,
        confidenceMask: mask,
        threshold,
      });
      for (let index = 0; index < foreground.alpha.length; index += 1) {
        imageData.data[index * 4 + 3] = foreground.alpha[index]!;
      }
      throwIfAborted(removeOptions.signal);
      context.putImageData(imageData, 0, 0);
      throwIfAborted(removeOptions.signal);
      return canvas.toDataURL("image/png");
    },
  });
}

const defaultService = createStudioOnnxForegroundService();

export function getGeneralForegroundConfidenceMask(
  src: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<StudioOnnxForegroundConfidenceMask> {
  return defaultService.getGeneralForegroundConfidenceMask(src, options);
}

export function removeBackgroundWithGeneralSubject(
  src: string,
  options: RemoveBackgroundWithGeneralSubjectOptions = {},
): Promise<string> {
  return defaultService.removeBackgroundWithGeneralSubject(src, options);
}
