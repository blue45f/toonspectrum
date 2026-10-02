/**
 * On-device photo → line extraction service behind the "사진에서 선
 * 추출" tool: decode, shrink to the TEED model's fixed 512×512, run the
 * edge detector through the product ONNX provider, and render the line
 * raster back at native resolution. Only loaded through a dynamic import
 * from the panel; failures propagate and the original stays untouched.
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
  loadStudioTeedModelBytes,
} from "./studio-onnx-runtime-assets";
import {
  STUDIO_TEED_INPUT_SIZE,
  createStudioTeedEdgeExtractor,
  createStudioTeedModelRegistry,
  preprocessStudioTeedInput,
  renderStudioTeedLineArt,
  type StudioTeedEdgeExtractor,
} from "./studio-onnx-teed";

export interface StudioOnnxLineExtractImage {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export type StudioOnnxLineExtractImageLoader = (
  src: string,
  signal?: AbortSignal,
) => Promise<StudioOnnxLineExtractImage>;

export interface CreateStudioOnnxLineExtractServiceOptions {
  readonly loadImage?: StudioOnnxLineExtractImageLoader;
  readonly extractor?: StudioTeedEdgeExtractor;
}

export interface ExtractLineArtOnDeviceOptions {
  /** 0..1 — higher keeps fainter lines. */
  readonly sensitivity?: number;
  readonly signal?: AbortSignal;
}

export interface StudioOnnxLineExtractResult {
  readonly dataUrl: string;
  readonly executionProvider: StudioOnnxExecutionProvider;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("선 추출을 취소했습니다.", "AbortError");
  }
  const error = new Error("선 추출을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function assertSensitivity(value: number | undefined): number {
  const sensitivity = value === undefined ? 0.5 : value;
  if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 1) {
    throw new RangeError("선 민감도는 0과 1 사이의 유한한 수여야 합니다.");
  }
  return sensitivity;
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
): Promise<StudioOnnxLineExtractImage> {
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
  image: HTMLImageElement,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = STUDIO_TEED_INPUT_SIZE;
  canvas.height = STUDIO_TEED_INPUT_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("캔버스를 만들 수 없습니다.");
  context.drawImage(image, 0, 0, STUDIO_TEED_INPUT_SIZE, STUDIO_TEED_INPUT_SIZE);
  return context.getImageData(
    0,
    0,
    STUDIO_TEED_INPUT_SIZE,
    STUDIO_TEED_INPUT_SIZE,
  ).data;
}

function createDefaultExtractor(): StudioTeedEdgeExtractor {
  return createStudioTeedEdgeExtractor({
    loadModelBytes: loadStudioTeedModelBytes,
    createProvider: (executionProvider) => (
      createStudioOnnxInferenceProvider({
        registry: createStudioTeedModelRegistry(),
        executionProvider,
        loadRuntime: loadStudioOnnxForegroundRuntime,
      })
    ),
  });
}

export interface StudioOnnxLineExtractService {
  extractLineArtOnDevice(
    src: string,
    options?: ExtractLineArtOnDeviceOptions,
  ): Promise<StudioOnnxLineExtractResult>;
}

export function createStudioOnnxLineExtractService(
  options: CreateStudioOnnxLineExtractServiceOptions = {},
): StudioOnnxLineExtractService {
  const imageLoader = options.loadImage ?? loadImageElement;
  let extractor = options.extractor ?? null;
  const getExtractor = (): StudioTeedEdgeExtractor => {
    extractor ??= createDefaultExtractor();
    return extractor;
  };

  return Object.freeze({
    async extractLineArtOnDevice(
      src: string,
      extractOptions: ExtractLineArtOnDeviceOptions = {},
    ): Promise<StudioOnnxLineExtractResult> {
      if (typeof src !== "string" || src.length === 0) {
        throw new TypeError("이미지 주소가 비어 있습니다.");
      }
      const { signal } = extractOptions;
      const sensitivity = assertSensitivity(extractOptions.sensitivity);
      throwIfAborted(signal);
      const loaded = await imageLoader(src, signal);
      throwIfAborted(signal);
      const modelRgba = readModelInputRgba(loaded.image);
      const plane = preprocessStudioTeedInput(
        modelRgba,
        STUDIO_TEED_INPUT_SIZE,
        STUDIO_TEED_INPUT_SIZE,
      );
      const extraction = await getExtractor().extract(plane, { signal });
      throwIfAborted(signal);
      const lineRgba = renderStudioTeedLineArt({
        edgePlane: extraction.edges,
        width: loaded.width,
        height: loaded.height,
        sensitivity,
      });
      throwIfAborted(signal);
      const canvas = document.createElement("canvas");
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("캔버스를 만들 수 없습니다.");
      context.putImageData(
        new ImageData(lineRgba, loaded.width, loaded.height),
        0,
        0,
      );
      throwIfAborted(signal);
      return Object.freeze({
        dataUrl: canvas.toDataURL("image/png"),
        executionProvider: extraction.executionProvider,
      });
    },
  });
}

const defaultService = createStudioOnnxLineExtractService();

export function extractLineArtOnDevice(
  src: string,
  options: ExtractLineArtOnDeviceOptions = {},
): Promise<StudioOnnxLineExtractResult> {
  return defaultService.extractLineArtOnDevice(src, options);
}
