/**
 * TEED edge detection on the product ONNX provider
 * (`studio-onnx-inference-provider`) — photo → line extraction for
 * drawing reference (밑그림).
 *
 * Why this exists: artists regularly trace or study reference photos, and
 * the existing line tools only clean up art that is already line art.
 * TEED (Soria et al., MIT License) is a 58K-parameter edge detector small
 * enough (248KB) to treat as a casual download, and fast enough (~0.5s at
 * 512×512 on WASM) to feel instant. Source pixels never leave the device.
 *
 * Contract notes: preprocessing follows the upstream test path exactly —
 * BGR channel order (cv2.imread), raw 0..255 values minus the BIPED mean,
 * no /255 scaling. The model's fused output has a probability floor
 * around 0.44 even on flat areas (a property of the fusion layer bias,
 * measured on the converted asset), so the line conversion applies a
 * soft threshold curve instead of presenting raw probabilities.
 * See `assets/teed.LICENSE.md` for provenance.
 */
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
  type StudioOnnxInferenceProvider,
  type StudioOnnxInferenceResult,
  type StudioOnnxSessionReceipt,
  type StudioOnnxTensorValue,
} from "./studio-onnx-inference-provider";
import {
  createStudioOnnxModelRegistry,
  type StudioOnnxModelDescriptor,
  type StudioOnnxModelRegistry,
} from "./studio-onnx-model-registry";

export const STUDIO_TEED_MODEL_ID = "teed" as const;
export const STUDIO_TEED_MODEL_VERSION = "1" as const;
export const STUDIO_TEED_INPUT_SIZE = 512 as const;
export const STUDIO_TEED_INPUT_NAME = "image" as const;
export const STUDIO_TEED_OUTPUT_NAME = "edges" as const;
export const STUDIO_TEED_MODEL_BYTE_LENGTH = 248_429 as const;
export const STUDIO_TEED_MODEL_SHA256 =
  "sha256:607473d7f52dce0b5ff9a294e47950b6cd49ff679a82f71f4eac24cce0168383" as const;

/** BIPED channel means in BGR order (upstream test preprocessing). */
const BIPED_MEAN_BGR = Object.freeze([104.007, 116.669, 122.679] as const);

const INPUT_PIXELS = STUDIO_TEED_INPUT_SIZE * STUDIO_TEED_INPUT_SIZE;

export const STUDIO_TEED_MODEL_DESCRIPTOR: StudioOnnxModelDescriptor =
  Object.freeze({
    id: STUDIO_TEED_MODEL_ID,
    version: STUDIO_TEED_MODEL_VERSION,
    sha256: STUDIO_TEED_MODEL_SHA256,
    byteBudget: STUDIO_TEED_MODEL_BYTE_LENGTH,
    inputs: Object.freeze([
      Object.freeze({
        name: STUDIO_TEED_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 3, STUDIO_TEED_INPUT_SIZE, STUDIO_TEED_INPUT_SIZE,
        ]),
      }),
    ]),
    outputs: Object.freeze([
      Object.freeze({
        name: STUDIO_TEED_OUTPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 1, STUDIO_TEED_INPUT_SIZE, STUDIO_TEED_INPUT_SIZE,
        ]),
      }),
    ]),
  });

export function createStudioTeedModelRegistry(): StudioOnnxModelRegistry {
  return createStudioOnnxModelRegistry([STUDIO_TEED_MODEL_DESCRIPTOR]);
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

function isAbortFailure(cause: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return true;
    if (
      "code" in cause
      && (cause as { readonly code?: unknown }).code === "aborted"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Preprocess a 512×512 RGBA raster into the TEED tensor: composite over
 * white (photos are opaque anyway; line-art exports may not be), reorder
 * to BGR, and subtract the BIPED mean without scaling — exactly the
 * upstream test contract.
 */
export function preprocessStudioTeedInput(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  if (width !== STUDIO_TEED_INPUT_SIZE || height !== STUDIO_TEED_INPUT_SIZE) {
    throw new RangeError(
      `TEED 입력은 ${STUDIO_TEED_INPUT_SIZE}×${STUDIO_TEED_INPUT_SIZE} 래스터만 허용합니다.`,
    );
  }
  if (rgba.length !== INPUT_PIXELS * 4) {
    throw new RangeError("TEED 입력 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const data = new Float32Array(3 * INPUT_PIXELS);
  for (let pixel = 0; pixel < INPUT_PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3]! / 255;
    const r = rgba[offset]! * alpha + 255 * (1 - alpha);
    const g = rgba[offset + 1]! * alpha + 255 * (1 - alpha);
    const b = rgba[offset + 2]! * alpha + 255 * (1 - alpha);
    data[pixel] = b - BIPED_MEAN_BGR[0];
    data[INPUT_PIXELS + pixel] = g - BIPED_MEAN_BGR[1];
    data[2 * INPUT_PIXELS + pixel] = r - BIPED_MEAN_BGR[2];
  }
  return data;
}

/**
 * Map an edge probability to line intensity with a soft threshold.
 * `sensitivity` ∈ [0,1] slides the curve: higher keeps fainter lines.
 * The measured model floor (~0.44 on flat areas) sits below the curve's
 * foot at every sensitivity, so backgrounds come out clean white.
 */
export function studioTeedLineIntensity(
  probability: number,
  sensitivity: number,
): number {
  const t = Math.min(1, Math.max(0, sensitivity));
  const low = 0.66 - 0.2 * t;
  const high = low + 0.3;
  const v = (probability - low) / (high - low);
  return Math.min(1, Math.max(0, v));
}

function sampleBilinear(
  plane: Float32Array,
  x: number,
  y: number,
): number {
  const size = STUDIO_TEED_INPUT_SIZE;
  const clampedX = Math.min(Math.max(x, 0), size - 1);
  const clampedY = Math.min(Math.max(y, 0), size - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const top = plane[y0 * size + x0]! * (1 - fx) + plane[y0 * size + x1]! * fx;
  const bottom = plane[y1 * size + x0]! * (1 - fx)
    + plane[y1 * size + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Render the 512×512 edge probability plane as a black-on-white line
 * raster at the requested (native) size.
 */
export function renderStudioTeedLineArt(input: {
  readonly edgePlane: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly sensitivity: number;
}): Uint8ClampedArray<ArrayBuffer> {
  const { edgePlane, width, height, sensitivity } = input;
  if (edgePlane.length !== INPUT_PIXELS) {
    throw new RangeError("TEED 엣지 평면 길이가 모델 출력과 일치하지 않습니다.");
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const size = STUDIO_TEED_INPUT_SIZE;
  for (let y = 0; y < height; y += 1) {
    const modelY = (y + 0.5) * (size / height) - 0.5;
    for (let x = 0; x < width; x += 1) {
      const modelX = (x + 0.5) * (size / width) - 0.5;
      const probability = sampleBilinear(edgePlane, modelX, modelY);
      const intensity = studioTeedLineIntensity(probability, sensitivity);
      const gray = Math.round(255 * (1 - intensity));
      const offset = (y * width + x) * 4;
      out[offset] = gray;
      out[offset + 1] = gray;
      out[offset + 2] = gray;
      out[offset + 3] = 255;
    }
  }
  return out;
}

export interface StudioTeedExtraction {
  /** Edge probability plane, 512×512, in [0,1]. */
  readonly edges: Float32Array;
  readonly executionProvider: StudioOnnxExecutionProvider;
  readonly receipt: StudioOnnxSessionReceipt;
}

export interface StudioTeedEdgeExtractor {
  extract(
    image: Float32Array,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioTeedExtraction>;
  dispose(): Promise<void>;
}

export interface CreateStudioTeedEdgeExtractorOptions {
  readonly createProvider?: (
    executionProvider: StudioOnnxExecutionProvider,
  ) => StudioOnnxInferenceProvider;
  readonly loadModelBytes: () => Promise<Uint8Array>;
  readonly executionProviders?: readonly StudioOnnxExecutionProvider[];
}

const DEFAULT_EXECUTION_PROVIDERS = Object.freeze([
  "webgpu",
  "wasm",
] as const satisfies readonly StudioOnnxExecutionProvider[]);

interface ProviderSlot {
  readonly provider: StudioOnnxInferenceProvider;
}

/**
 * Create an extractor that owns one ONNX provider per execution route —
 * the same serialized, retire-on-failure lifecycle as the other model
 * modules on this provider framework.
 */
export function createStudioTeedEdgeExtractor(
  options: CreateStudioTeedEdgeExtractorOptions,
): StudioTeedEdgeExtractor {
  const routes = options.executionProviders ?? DEFAULT_EXECUTION_PROVIDERS;
  const createProvider = options.createProvider ?? ((executionProvider) => (
    createStudioOnnxInferenceProvider({
      registry: createStudioTeedModelRegistry(),
      executionProvider,
    })
  ));
  const slots = new Map<StudioOnnxExecutionProvider, ProviderSlot>();
  const retiredRoutes = new Set<StudioOnnxExecutionProvider>();
  let modelBytesPromise: Promise<Uint8Array> | null = null;
  let requestCounter = 0;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  const loadBytes = (): Promise<Uint8Array> => {
    modelBytesPromise ??= options.loadModelBytes().catch((cause: unknown) => {
      modelBytesPromise = null;
      throw cause;
    });
    return modelBytesPromise;
  };

  const runExtract = async (
    image: Float32Array,
    signal?: AbortSignal,
  ): Promise<StudioTeedExtraction> => {
    if (disposed) throw new Error("선 추출기가 이미 해제되었습니다.");
    throwIfAborted(signal);
    if (image.length !== 3 * INPUT_PIXELS) {
      throw new RangeError("TEED 입력 평면 길이가 모델 계약과 일치하지 않습니다.");
    }
    const bytes = await loadBytes();
    throwIfAborted(signal);
    let lastFailure: unknown = null;
    for (const route of routes) {
      if (retiredRoutes.has(route)) continue;
      let slot = slots.get(route);
      if (!slot) {
        slot = { provider: createProvider(route) };
        slots.set(route, slot);
      }
      requestCounter += 1;
      const epoch = Object.freeze({
        request: requestCounter,
        stroke: 0,
        document: 0,
      });
      slot.provider.setEpoch(epoch);
      let result: StudioOnnxInferenceResult;
      try {
        result = await slot.provider.infer({
          modelId: STUDIO_TEED_MODEL_ID,
          version: STUDIO_TEED_MODEL_VERSION,
          source: Object.freeze({ kind: "bytes" as const, bytes }),
          epoch,
          inputs: Object.freeze([
            Object.freeze({
              name: STUDIO_TEED_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([
                1, 3, STUDIO_TEED_INPUT_SIZE, STUDIO_TEED_INPUT_SIZE,
              ]),
              data: image,
            }),
          ]),
          signal,
        });
      } catch (cause) {
        if (isAbortFailure(cause, signal)) throw createAbortError();
        lastFailure = cause;
        retiredRoutes.add(route);
        slots.delete(route);
        await slot.provider.dispose().catch(() => undefined);
        continue;
      }
      throwIfAborted(signal);
      const output: StudioOnnxTensorValue | undefined =
        result.outputs[STUDIO_TEED_OUTPUT_NAME];
      if (
        !output
        || output.elementType !== "float32"
        || !(output.data instanceof Float32Array)
        || output.data.length !== INPUT_PIXELS
      ) {
        throw new RangeError("TEED 엣지 출력이 없거나 형식이 다릅니다.");
      }
      return Object.freeze({
        edges: output.data,
        executionProvider: route,
        receipt: result.receipt,
      });
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("선 추출 모델을 실행하지 못했습니다.");
  };

  return Object.freeze({
    extract(
      image: Float32Array,
      extractOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const run = chain.then(() => runExtract(image, extractOptions.signal));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    async dispose() {
      disposed = true;
      const live = [...slots.values()];
      slots.clear();
      await Promise.all(
        live.map((slot) => slot.provider.dispose().catch(() => undefined)),
      );
    },
  });
}
