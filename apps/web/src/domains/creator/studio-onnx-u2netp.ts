/**
 * U-2-Netp general-subject foreground segmentation on the product ONNX
 * provider (`studio-onnx-inference-provider`).
 *
 * Why this exists: the MediaPipe selfie segmenter behind "빠른 배경 제거" and
 * Layer Lift only understands photographed people, so props, objects, pets,
 * and illustrated subjects come back with an empty or wrong foreground. This
 * module runs U-2-Netp (a general salient-object model) through the existing
 * ONNX provider framework so the quick background-removal action can offer a
 * general-subject route. Source pixels never leave the device; only the
 * versioned model asset and the ONNX Runtime WASM assets are downloaded.
 *
 * Model provenance: U-2-Net (Qin et al., Pattern Recognition 106, 2020),
 * code and weights Apache-2.0. The bundled `assets/u2netp.onnx` is the
 * standard community ONNX conversion byte-identical to the rembg release
 * asset; see `assets/u2netp.LICENSE.md`. The preprocessing contract is the
 * rembg U2Netp contract: resize straight to 320×320 (no letterbox), divide by
 * the per-image maximum channel value, then apply ImageNet mean/std.
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

export const STUDIO_U2NETP_MODEL_ID = "u2netp" as const;
export const STUDIO_U2NETP_MODEL_VERSION = "1" as const;
export const STUDIO_U2NETP_INPUT_SIZE = 320 as const;
export const STUDIO_U2NETP_INPUT_NAME = "input.1" as const;
/** U-2-Netp emits seven side outputs; the first is the fused saliency map. */
export const STUDIO_U2NETP_OUTPUT_NAMES = Object.freeze([
  "1959",
  "1960",
  "1961",
  "1962",
  "1963",
  "1964",
  "1965",
] as const);
export const STUDIO_U2NETP_PRIMARY_OUTPUT_NAME =
  STUDIO_U2NETP_OUTPUT_NAMES[0];
export const STUDIO_U2NETP_MODEL_BYTE_LENGTH = 4_574_861 as const;
export const STUDIO_U2NETP_MODEL_SHA256 =
  "sha256:309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8" as const;

const INPUT_PIXELS = STUDIO_U2NETP_INPUT_SIZE * STUDIO_U2NETP_INPUT_SIZE;
const IMAGENET_MEAN = Object.freeze([0.485, 0.456, 0.406] as const);
const IMAGENET_STD = Object.freeze([0.229, 0.224, 0.225] as const);

export const STUDIO_U2NETP_MODEL_DESCRIPTOR: StudioOnnxModelDescriptor =
  Object.freeze({
    id: STUDIO_U2NETP_MODEL_ID,
    version: STUDIO_U2NETP_MODEL_VERSION,
    sha256: STUDIO_U2NETP_MODEL_SHA256,
    byteBudget: STUDIO_U2NETP_MODEL_BYTE_LENGTH,
    inputs: Object.freeze([
      Object.freeze({
        name: STUDIO_U2NETP_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([1, 3, STUDIO_U2NETP_INPUT_SIZE, STUDIO_U2NETP_INPUT_SIZE]),
      }),
    ]),
    outputs: Object.freeze(
      STUDIO_U2NETP_OUTPUT_NAMES.map((name) => Object.freeze({
        name,
        elementType: "float32" as const,
        shape: Object.freeze([1, 1, STUDIO_U2NETP_INPUT_SIZE, STUDIO_U2NETP_INPUT_SIZE]),
      })),
    ),
  });

export function createStudioU2netpModelRegistry(): StudioOnnxModelRegistry {
  return createStudioOnnxModelRegistry([STUDIO_U2NETP_MODEL_DESCRIPTOR]);
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("전경 분리를 취소했습니다.", "AbortError");
  }
  const error = new Error("전경 분리를 취소했습니다.");
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
 * Preprocess a 320×320 RGBA raster into the U-2-Netp NCHW float tensor data.
 * The caller owns resizing; this function only accepts the exact model size
 * so a silent shape drift cannot reach the session.
 */
export function preprocessStudioU2netpInput(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  if (width !== STUDIO_U2NETP_INPUT_SIZE || height !== STUDIO_U2NETP_INPUT_SIZE) {
    throw new RangeError(
      `U-2-Netp 입력은 ${STUDIO_U2NETP_INPUT_SIZE}×${STUDIO_U2NETP_INPUT_SIZE} 래스터만 허용합니다.`,
    );
  }
  if (rgba.length !== INPUT_PIXELS * 4) {
    throw new RangeError("U-2-Netp 입력 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  let max = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgba[index + channel]!;
      if (value > max) max = value;
    }
  }
  const divisor = max === 0 ? 1 : max;
  const data = new Float32Array(3 * INPUT_PIXELS);
  for (let pixel = 0; pixel < INPUT_PIXELS; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = rgba[pixel * 4 + channel]! / divisor;
      data[channel * INPUT_PIXELS + pixel] =
        (normalized - IMAGENET_MEAN[channel]!) / IMAGENET_STD[channel]!;
    }
  }
  return data;
}

/**
 * Min/max-normalize one raw saliency plane into a 0..1 confidence plane.
 * A degenerate (flat or non-finite) plane is rejected instead of being
 * stretched into a fake mask — the caller falls back to the person route.
 */
export function normalizeStudioU2netpSaliency(
  data: Float32Array,
): Float32Array {
  if (data.length !== INPUT_PIXELS) {
    throw new RangeError("U-2-Netp 출력 평면 길이가 모델 크기와 일치하지 않습니다.");
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of data) {
    if (!Number.isFinite(value)) {
      throw new RangeError("U-2-Netp 출력에 유한하지 않은 값이 포함되어 있습니다.");
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  if (!(range > 0)) {
    throw new RangeError("U-2-Netp 출력이 평탄해 전경을 판정할 수 없습니다.");
  }
  const confidence = new Float32Array(INPUT_PIXELS);
  for (let index = 0; index < INPUT_PIXELS; index += 1) {
    confidence[index] = (data[index]! - min) / range;
  }
  return confidence;
}

export interface StudioU2netpConfidenceMask {
  readonly width: typeof STUDIO_U2NETP_INPUT_SIZE;
  readonly height: typeof STUDIO_U2NETP_INPUT_SIZE;
  readonly confidence: Float32Array;
}

export function studioU2netpMaskFromOutputs(
  outputs: Readonly<Record<string, StudioOnnxTensorValue>>,
): StudioU2netpConfidenceMask {
  const primary = outputs[STUDIO_U2NETP_PRIMARY_OUTPUT_NAME];
  if (!primary || primary.elementType !== "float32") {
    throw new RangeError("U-2-Netp 융합 출력이 없거나 형식이 다릅니다.");
  }
  if (!(primary.data instanceof Float32Array)) {
    throw new RangeError("U-2-Netp 융합 출력 데이터 형식이 다릅니다.");
  }
  return Object.freeze({
    width: STUDIO_U2NETP_INPUT_SIZE,
    height: STUDIO_U2NETP_INPUT_SIZE,
    confidence: normalizeStudioU2netpSaliency(primary.data),
  });
}

export interface StudioU2netpSegmentation extends StudioU2netpConfidenceMask {
  readonly executionProvider: StudioOnnxExecutionProvider;
  readonly receipt: StudioOnnxSessionReceipt;
}

export interface StudioU2netpSegmenter {
  segment(
    rgba: Uint8Array | Uint8ClampedArray,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioU2netpSegmentation>;
  dispose(): Promise<void>;
}

export interface CreateStudioU2netpForegroundSegmenterOptions {
  /** Injectable for tests. Defaults to the product provider factory below. */
  readonly createProvider?: (
    executionProvider: StudioOnnxExecutionProvider,
  ) => StudioOnnxInferenceProvider;
  /** Injectable for tests and for the asset module that owns the model URL. */
  readonly loadModelBytes: () => Promise<Uint8Array>;
  /** Execution routes in preference order. WebGPU first, WASM as fallback. */
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
 * Create a segmenter that owns one ONNX provider per execution route.
 * Inference calls are serialized: the provider epoch contract rejects stale
 * results, so overlapping calls would fail each other instead of queueing.
 * A route that fails once (unavailable WebGPU, session creation failure) is
 * retired for the lifetime of this segmenter and the next route is tried —
 * the graceful-degradation seam the quick action relies on.
 */
export function createStudioU2netpForegroundSegmenter(
  options: CreateStudioU2netpForegroundSegmenterOptions,
): StudioU2netpSegmenter {
  const routes = options.executionProviders ?? DEFAULT_EXECUTION_PROVIDERS;
  const createProvider = options.createProvider ?? ((executionProvider) => (
    createStudioOnnxInferenceProvider({
      registry: createStudioU2netpModelRegistry(),
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

  const runSegment = async (
    rgba: Uint8Array | Uint8ClampedArray,
    signal?: AbortSignal,
  ): Promise<StudioU2netpSegmentation> => {
    if (disposed) throw new Error("U-2-Netp 분리기가 이미 해제되었습니다.");
    throwIfAborted(signal);
    const data = preprocessStudioU2netpInput(
      rgba,
      STUDIO_U2NETP_INPUT_SIZE,
      STUDIO_U2NETP_INPUT_SIZE,
    );
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
          modelId: STUDIO_U2NETP_MODEL_ID,
          version: STUDIO_U2NETP_MODEL_VERSION,
          source: Object.freeze({ kind: "bytes" as const, bytes }),
          epoch,
          inputs: Object.freeze([
            Object.freeze({
              name: STUDIO_U2NETP_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([
                1,
                3,
                STUDIO_U2NETP_INPUT_SIZE,
                STUDIO_U2NETP_INPUT_SIZE,
              ]),
              data,
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
      const mask = studioU2netpMaskFromOutputs(result.outputs);
      return Object.freeze({
        ...mask,
        executionProvider: route,
        receipt: result.receipt,
      });
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("일반 피사체 분리 모델을 실행하지 못했습니다.");
  };

  return Object.freeze({
    segment(
      rgba: Uint8Array | Uint8ClampedArray,
      segmentOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const run = chain.then(() => runSegment(rgba, segmentOptions.signal));
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

/**
 * Production provider factory seam: the foreground service builds providers
 * through `createStudioU2netpForegroundSegmenter` with a `createProvider`
 * that injects the asset-aware runtime loader from
 * `studio-onnx-runtime-assets`, keeping Vite `?url` asset plumbing out of
 * this pure module (and out of unit tests).
 */
