/**
 * On-device ×4 upscale service behind the "AI 업스케일" image tool.
 *
 * Decodes the source, runs Real-ESRGAN anime tiles through the product
 * ONNX provider with a progress callback per tile, and composes the ×4
 * PNG. Only loaded through a dynamic import from the upscale panel, so
 * the runtime and the 18MB model stay out of the Studio startup graph.
 * Failures propagate to the panel; the original image is never touched.
 */
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
} from "./studio-onnx-inference-provider";
import {
  STUDIO_REALESRGAN_SCALE,
  createStudioRealEsrganModelRegistry,
  createStudioRealEsrganUpscaler,
  extractStudioUpscaleTilePlane,
  planStudioUpscaleTiles,
  upscaleStudioAlphaPlane,
  writeStudioUpscaleTileOutput,
  type StudioRealEsrganUpscaler,
} from "./studio-onnx-realesrgan";
import {
  loadStudioOnnxForegroundRuntime,
  loadStudioRealEsrganModelBytes,
} from "./studio-onnx-runtime-assets";

/**
 * Input caps: ×4 output must stay creatable as a canvas — at most
 * 8192px per axis and ~67MP total (desktop-class browsers). Webtoon cuts
 * (typically ≤ 2048px wide) fit comfortably.
 */
export const STUDIO_ONNX_UPSCALE_MAX_INPUT_AXIS = 2_048;
export const STUDIO_ONNX_UPSCALE_MAX_INPUT_PIXELS = 4_194_304;

export interface StudioOnnxUpscaleImage {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export type StudioOnnxUpscaleImageLoader = (
  src: string,
  signal?: AbortSignal,
) => Promise<StudioOnnxUpscaleImage>;

export interface CreateStudioOnnxUpscaleServiceOptions {
  readonly loadImage?: StudioOnnxUpscaleImageLoader;
  readonly upscaler?: StudioRealEsrganUpscaler;
}

export interface UpscaleImageOnDeviceOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (doneTiles: number, totalTiles: number) => void;
}

export interface StudioOnnxUpscaleResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly executionProvider: StudioOnnxExecutionProvider;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("업스케일을 취소했습니다.", "AbortError");
  }
  const error = new Error("업스케일을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function assertUpscaleDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > STUDIO_ONNX_UPSCALE_MAX_INPUT_AXIS
    || height > STUDIO_ONNX_UPSCALE_MAX_INPUT_AXIS
    || width * height > STUDIO_ONNX_UPSCALE_MAX_INPUT_PIXELS
  ) {
    throw new RangeError(
      "업스케일은 한 변 2048px, 전체 약 420만 화소까지의 이미지만 지원합니다. 이미지를 줄인 뒤 다시 시도해 주세요.",
    );
  }
}

function loadImageElement(
  src: string,
  signal?: AbortSignal,
): Promise<StudioOnnxUpscaleImage> {
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
        assertUpscaleDimensions(width, height);
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

function readSourceRgba(loaded: StudioOnnxUpscaleImage): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = loaded.width;
  canvas.height = loaded.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("캔버스를 만들 수 없습니다.");
  context.drawImage(loaded.image, 0, 0, loaded.width, loaded.height);
  return context.getImageData(0, 0, loaded.width, loaded.height).data;
}

function createDefaultUpscaler(): StudioRealEsrganUpscaler {
  return createStudioRealEsrganUpscaler({
    loadModelBytes: loadStudioRealEsrganModelBytes,
    createProvider: (executionProvider) => (
      createStudioOnnxInferenceProvider({
        registry: createStudioRealEsrganModelRegistry(),
        executionProvider,
        loadRuntime: loadStudioOnnxForegroundRuntime,
      })
    ),
  });
}

export interface StudioOnnxUpscaleService {
  upscaleImageOnDevice(
    src: string,
    options?: UpscaleImageOnDeviceOptions,
  ): Promise<StudioOnnxUpscaleResult>;
}

export function createStudioOnnxUpscaleService(
  options: CreateStudioOnnxUpscaleServiceOptions = {},
): StudioOnnxUpscaleService {
  const imageLoader = options.loadImage ?? loadImageElement;
  let upscaler = options.upscaler ?? null;
  const getUpscaler = (): StudioRealEsrganUpscaler => {
    upscaler ??= createDefaultUpscaler();
    return upscaler;
  };

  return Object.freeze({
    async upscaleImageOnDevice(
      src: string,
      upscaleOptions: UpscaleImageOnDeviceOptions = {},
    ): Promise<StudioOnnxUpscaleResult> {
      if (typeof src !== "string" || src.length === 0) {
        throw new TypeError("이미지 주소가 비어 있습니다.");
      }
      const { signal, onProgress } = upscaleOptions;
      throwIfAborted(signal);
      const loaded = await imageLoader(src, signal);
      throwIfAborted(signal);
      const sourceRgba = readSourceRgba(loaded);
      const placements = planStudioUpscaleTiles(loaded.width, loaded.height);
      const outWidth = loaded.width * STUDIO_REALESRGAN_SCALE;
      const outHeight = loaded.height * STUDIO_REALESRGAN_SCALE;
      const outRgba = new Uint8ClampedArray(outWidth * outHeight * 4);
      upscaleStudioAlphaPlane(
        sourceRgba,
        loaded.width,
        loaded.height,
        outRgba,
        outWidth,
      );
      let executionProvider: StudioOnnxExecutionProvider = "wasm";
      for (let index = 0; index < placements.length; index += 1) {
        throwIfAborted(signal);
        const placement = placements[index]!;
        const plane = extractStudioUpscaleTilePlane(
          sourceRgba,
          loaded.width,
          loaded.height,
          placement,
        );
        const result = await getUpscaler().upscaleTile(plane, { signal });
        executionProvider = result.executionProvider;
        writeStudioUpscaleTileOutput(
          outRgba,
          outWidth,
          outHeight,
          result.tile,
          placement,
        );
        onProgress?.(index + 1, placements.length);
      }
      throwIfAborted(signal);
      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("캔버스를 만들 수 없습니다.");
      context.putImageData(new ImageData(outRgba, outWidth, outHeight), 0, 0);
      throwIfAborted(signal);
      return Object.freeze({
        dataUrl: canvas.toDataURL("image/png"),
        width: outWidth,
        height: outHeight,
        executionProvider,
      });
    },
  });
}

const defaultService = createStudioOnnxUpscaleService();

export function upscaleImageOnDevice(
  src: string,
  options: UpscaleImageOnDeviceOptions = {},
): Promise<StudioOnnxUpscaleResult> {
  return defaultService.upscaleImageOnDevice(src, options);
}
