/**
 * ONNX inference bridge for the Layer Lift local foreground provider.
 *
 * The provider (`studio-layer-lift-local-provider`) deliberately knows
 * nothing about runtimes: it consumes an injectable inference loader. The
 * person profile is backed by MediaPipe; this bridge backs the general
 * subject profile with U-2-Netp over the product ONNX provider — the same
 * segmenter the quick background-removal route uses
 * (`createStudioOnnxForegroundSegmenter`), so both surfaces share one
 * model asset, one runtime pin, and one WebGPU→WASM fallback policy.
 *
 * Identity note: the provider reads the model identity *before* running
 * inference (it is bound into the result receipt), while the segmenter
 * only reveals the winning execution route afterwards. The identity
 * therefore declares the route policy label `webgpu-wasm-auto` instead of
 * a single route; the per-call receipt of the underlying provider still
 * records which route actually ran.
 */
import {
  STUDIO_ONNX_RUNTIME_VERSION,
} from "../studio-onnx-inference-provider";
import {
  createStudioOnnxForegroundSegmenter,
} from "../studio-onnx-foreground";
import {
  STUDIO_U2NETP_INPUT_SIZE,
  STUDIO_U2NETP_MODEL_ID,
  STUDIO_U2NETP_MODEL_VERSION,
  type StudioU2netpSegmenter,
} from "../studio-onnx-u2netp";
import type {
  StudioLayerLiftLocalForegroundInferenceEngine,
  StudioLayerLiftLocalForegroundInferenceInput,
  StudioLayerLiftLocalForegroundInferenceLoader,
} from "./studio-layer-lift-local-provider";

export const STUDIO_LAYER_LIFT_ONNX_EXECUTION_ROUTE = "webgpu-wasm-auto" as const;

export interface CreateStudioLayerLiftOnnxInferenceLoaderOptions {
  /** Injectable for tests. Defaults to the shared production segmenter. */
  readonly segmenter?: StudioU2netpSegmenter;
  /** Injectable rasterizer for tests; defaults to DOM canvas scaling. */
  readonly rasterizeToModelInput?: (
    input: StudioLayerLiftLocalForegroundInferenceInput,
  ) => Uint8ClampedArray;
}

function rasterizeWithCanvas(
  input: StudioLayerLiftLocalForegroundInferenceInput,
): Uint8ClampedArray {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = input.width;
  sourceCanvas.height = input.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("캔버스를 만들 수 없습니다.");
  const imageData = new ImageData(
    new Uint8ClampedArray(input.rgba),
    input.width,
    input.height,
  );
  sourceContext.putImageData(imageData, 0, 0);

  const modelCanvas = document.createElement("canvas");
  modelCanvas.width = STUDIO_U2NETP_INPUT_SIZE;
  modelCanvas.height = STUDIO_U2NETP_INPUT_SIZE;
  const modelContext = modelCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!modelContext) throw new Error("캔버스를 만들 수 없습니다.");
  modelContext.drawImage(
    sourceCanvas,
    0,
    0,
    STUDIO_U2NETP_INPUT_SIZE,
    STUDIO_U2NETP_INPUT_SIZE,
  );
  return modelContext.getImageData(
    0,
    0,
    STUDIO_U2NETP_INPUT_SIZE,
    STUDIO_U2NETP_INPUT_SIZE,
  ).data;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("레이어 리프트를 취소했습니다.", "AbortError");
  }
  const error = new Error("레이어 리프트를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

/**
 * Build the loader the general-subject provider consumes. The segmenter
 * is created lazily on first load so importing this module never pulls
 * the ONNX runtime or the model asset into the startup graph.
 */
export function createStudioLayerLiftOnnxInferenceLoader(
  options: CreateStudioLayerLiftOnnxInferenceLoaderOptions = {},
): StudioLayerLiftLocalForegroundInferenceLoader {
  let segmenter = options.segmenter ?? null;
  const rasterize = options.rasterizeToModelInput ?? rasterizeWithCanvas;
  const getSegmenter = (): StudioU2netpSegmenter => {
    segmenter ??= createStudioOnnxForegroundSegmenter();
    return segmenter;
  };

  return async (
    signal: AbortSignal,
  ): Promise<StudioLayerLiftLocalForegroundInferenceEngine> => {
    if (signal.aborted) throw createAbortError();
    const activeSegmenter = getSegmenter();
    return Object.freeze({
      model: Object.freeze({
        providerId: "onnxruntime-web",
        providerVersion: STUDIO_ONNX_RUNTIME_VERSION,
        modelId: STUDIO_U2NETP_MODEL_ID,
        modelVersion: STUDIO_U2NETP_MODEL_VERSION,
        executionRoute: STUDIO_LAYER_LIFT_ONNX_EXECUTION_ROUTE,
      }),
      async infer(
        input: StudioLayerLiftLocalForegroundInferenceInput,
      ) {
        const rgba = rasterize(input);
        const segmentation = await activeSegmenter.segment(rgba, {
          signal: input.signal,
        });
        return Object.freeze({
          width: segmentation.width,
          height: segmentation.height,
          confidence: segmentation.confidence,
        });
      },
    });
  };
}
