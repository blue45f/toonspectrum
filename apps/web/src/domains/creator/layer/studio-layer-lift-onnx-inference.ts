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
 *
 * 번들 경계 주의: 이 모듈은 편집기 호스트가 정적으로 import하므로, ONNX
 * 모듈(foreground·u2netp·inference-provider)을 정적 import하면 그 코드가
 * 스튜디오 시작 그래프에 합류해 번들 베이스라인
 * (`scripts/check-studio-bundle.mjs`)을 초과한다. 그래서 세 모듈은 모두
 * 로더 첫 호출 시 동적 import로만 불러온다 — MediaPipe 로더
 * (`studio-layer-lift-mediapipe-inference`)가 확립한 방식과 같다. 정적
 * import로 되돌리지 말 것.
 */
import type { StudioU2netpSegmenter } from "../studio-onnx-u2netp";
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
  inputSize: number,
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
  modelCanvas.width = inputSize;
  modelCanvas.height = inputSize;
  const modelContext = modelCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!modelContext) throw new Error("캔버스를 만들 수 없습니다.");
  modelContext.drawImage(sourceCanvas, 0, 0, inputSize, inputSize);
  return modelContext.getImageData(0, 0, inputSize, inputSize).data;
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
 * Build the loader the general-subject provider consumes. The ONNX
 * modules load dynamically on the first loader invocation and the
 * segmenter is created lazily at that point, so importing this module
 * never pulls the ONNX code, runtime, or model asset into the startup
 * graph.
 */
export function createStudioLayerLiftOnnxInferenceLoader(
  options: CreateStudioLayerLiftOnnxInferenceLoaderOptions = {},
): StudioLayerLiftLocalForegroundInferenceLoader {
  let segmenter = options.segmenter ?? null;
  let segmenterPromise: Promise<StudioU2netpSegmenter> | null = null;
  const loadSegmenter = (): Promise<StudioU2netpSegmenter> => {
    if (segmenter) return Promise.resolve(segmenter);
    segmenterPromise ??= import("../studio-onnx-foreground").then((module) => {
      segmenter = module.createStudioOnnxForegroundSegmenter();
      return segmenter;
    });
    return segmenterPromise;
  };

  return async (
    signal: AbortSignal,
  ): Promise<StudioLayerLiftLocalForegroundInferenceEngine> => {
    if (signal.aborted) throw createAbortError();
    const [u2netp, provider] = await Promise.all([
      import("../studio-onnx-u2netp"),
      import("../studio-onnx-inference-provider"),
    ]);
    const activeSegmenter = await loadSegmenter();
    const rasterize =
      options.rasterizeToModelInput ??
      ((input: StudioLayerLiftLocalForegroundInferenceInput) =>
        rasterizeWithCanvas(input, u2netp.STUDIO_U2NETP_INPUT_SIZE));
    return Object.freeze({
      model: Object.freeze({
        providerId: "onnxruntime-web",
        providerVersion: provider.STUDIO_ONNX_RUNTIME_VERSION,
        modelId: u2netp.STUDIO_U2NETP_MODEL_ID,
        modelVersion: u2netp.STUDIO_U2NETP_MODEL_VERSION,
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
