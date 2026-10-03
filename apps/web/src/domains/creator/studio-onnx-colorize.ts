/**
 * On-device line-art colorization service — the fallback behind the
 * "기기에서 채색" action in the image tools.
 *
 * Pipeline: decode the source raster, shrink it to the model's fixed
 * 512×512 line input, run Tag2Pix through the product ONNX provider, then
 * composite the model chroma back onto the source at native resolution
 * (`compositeStudioTag2pixColor`) so lines stay crisp. This module is only
 * loaded through a dynamic import from the colorize panel, keeping the
 * ONNX runtime and the 79MB model out of the Studio startup graph.
 * Failures propagate to the panel, which keeps the cloud route and the
 * original image untouched.
 */
import {
  STUDIO_BG_REMOVE_MAX_DECODED_AXIS,
  STUDIO_BG_REMOVE_MAX_DECODED_PIXELS,
} from "./studio-bg-remove";
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
} from "./studio-onnx-inference-provider";
import {
  loadStudioOnnxForegroundRuntime,
  loadStudioTag2pixModelBytes,
} from "./studio-onnx-runtime-assets";
import {
  STUDIO_TAG2PIX_INPUT_SIZE,
  buildStudioTag2pixTagVector,
  compositeStudioTag2pixColor,
  createStudioTag2pixColorizer,
  createStudioTag2pixModelRegistry,
  preprocessStudioTag2pixLine,
  type StudioTag2pixColorizer,
} from "./studio-onnx-tag2pix";

export interface StudioOnnxColorizeImage {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export type StudioOnnxColorizeImageLoader = (
  src: string,
  signal?: AbortSignal,
) => Promise<StudioOnnxColorizeImage>;

export interface CreateStudioOnnxColorizeServiceOptions {
  readonly loadImage?: StudioOnnxColorizeImageLoader;
  readonly colorizer?: StudioTag2pixColorizer;
}

export interface ColorizeLineArtOnDeviceOptions {
  /** Upstream tag names (see STUDIO_TAG2PIX_TAG_NAMES). Empty = untagged. */
  readonly tags: readonly string[];
  readonly signal?: AbortSignal;
}

export interface StudioOnnxColorizeResult {
  readonly dataUrl: string;
  readonly executionProvider: StudioOnnxExecutionProvider;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("채색을 취소했습니다.", "AbortError");
  }
  const error = new Error("채색을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
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
): Promise<StudioOnnxColorizeImage> {
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

function readRaster(
  image: HTMLImageElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("캔버스를 만들 수 없습니다.");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function createDefaultColorizer(): StudioTag2pixColorizer {
  return createStudioTag2pixColorizer({
    loadModelBytes: loadStudioTag2pixModelBytes,
    createProvider: (executionProvider) => (
      createStudioOnnxInferenceProvider({
        registry: createStudioTag2pixModelRegistry(),
        executionProvider,
        loadRuntime: loadStudioOnnxForegroundRuntime,
      })
    ),
  });
}

export interface StudioOnnxColorizeService {
  colorizeLineArtOnDevice(
    src: string,
    options: ColorizeLineArtOnDeviceOptions,
  ): Promise<StudioOnnxColorizeResult>;
}

export function createStudioOnnxColorizeService(
  options: CreateStudioOnnxColorizeServiceOptions = {},
): StudioOnnxColorizeService {
  const imageLoader = options.loadImage ?? loadImageElement;
  let colorizer = options.colorizer ?? null;
  const getColorizer = (): StudioTag2pixColorizer => {
    colorizer ??= createDefaultColorizer();
    return colorizer;
  };

  return Object.freeze({
    async colorizeLineArtOnDevice(
      src: string,
      colorizeOptions: ColorizeLineArtOnDeviceOptions,
    ): Promise<StudioOnnxColorizeResult> {
      if (typeof src !== "string" || src.length === 0) {
        throw new TypeError("이미지 주소가 비어 있습니다.");
      }
      const { signal } = colorizeOptions;
      throwIfAborted(signal);
      const tags = buildStudioTag2pixTagVector(colorizeOptions.tags);
      const loaded = await imageLoader(src, signal);
      throwIfAborted(signal);
      const modelRgba = readRaster(
        loaded.image,
        STUDIO_TAG2PIX_INPUT_SIZE,
        STUDIO_TAG2PIX_INPUT_SIZE,
      );
      const line = preprocessStudioTag2pixLine(
        modelRgba,
        STUDIO_TAG2PIX_INPUT_SIZE,
        STUDIO_TAG2PIX_INPUT_SIZE,
      );
      const colorization = await getColorizer().colorize(line, tags, { signal });
      throwIfAborted(signal);
      const sourceRgba = readRaster(loaded.image, loaded.width, loaded.height);
      const composited = compositeStudioTag2pixColor({
        colorPlane: colorization.color,
        sourceRgba,
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
      });
      throwIfAborted(signal);
      const canvas = document.createElement("canvas");
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("캔버스를 만들 수 없습니다.");
      const imageData = new ImageData(composited, loaded.width, loaded.height);
      context.putImageData(imageData, 0, 0);
      throwIfAborted(signal);
      return Object.freeze({
        dataUrl: canvas.toDataURL("image/png"),
        executionProvider: colorization.executionProvider,
      });
    },
  });
}

const defaultService = createStudioOnnxColorizeService();

export function colorizeLineArtOnDevice(
  src: string,
  options: ColorizeLineArtOnDeviceOptions,
): Promise<StudioOnnxColorizeResult> {
  return defaultService.colorizeLineArtOnDevice(src, options);
}
