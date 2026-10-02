import { describe, expect, it, vi } from "vitest";

import { sha256HexPortable } from "../studio-sha256";
import type { StudioU2netpSegmenter } from "../studio-onnx-u2netp";

import {
  STUDIO_SCENE_LAYER_LIFT_CONTRACT_VERSION,
  STUDIO_SCENE_LAYER_LIFT_REQUEST_KIND,
  isStudioSceneLayerLiftTrustedSuccess,
} from "./studio-layer-lift-contract";
import {
  createStudioLayerLiftLocalForegroundProvider,
} from "./studio-layer-lift-local-provider";
import {
  STUDIO_LAYER_LIFT_ONNX_EXECUTION_ROUTE,
  createStudioLayerLiftOnnxInferenceLoader,
} from "./studio-layer-lift-onnx-inference";

const MODEL_PIXELS = 320 * 320;

function fakeSegmenter(): StudioU2netpSegmenter {
  return {
    segment: vi.fn(async () => ({
      width: 320 as const,
      height: 320 as const,
      confidence: new Float32Array(MODEL_PIXELS).fill(0.9),
      executionProvider: "wasm" as const,
      receipt: Object.freeze({
        providerId: "onnxruntime-web",
        runtimeVersion: "1.27.0" as const,
        model: Object.freeze({
          id: "u2netp",
          version: "1",
          sha256: `sha256:${"0".repeat(64)}`,
          byteLength: 4_574_861,
        }),
        selectedExecutionProvider: "wasm" as const,
        attemptedExecutionProviders: Object.freeze(["wasm" as const]),
        activeExecutionProvider: "wasm" as const,
        attemptCount: 1,
        failureIsolation: "fail-closed" as const,
      }),
    })),
    dispose: vi.fn(async () => undefined),
  };
}

function request() {
  const bytes = new Uint8Array([
    10, 20, 30, 255,
    40, 50, 60, 128,
    70, 80, 90, 255,
    100, 110, 120, 0,
  ]);
  return {
    kind: STUDIO_SCENE_LAYER_LIFT_REQUEST_KIND,
    version: STUDIO_SCENE_LAYER_LIFT_CONTRACT_VERSION,
    requestId: "lift-onnx-001",
    source: {
      sourceId: "cut-onnx-001",
      sourceName: "cut-onnx-001.png",
      mimeType: "image/png",
      width: 2,
      height: 2,
      pixelCount: 4,
      pixelFormat: "rgba8-srgb-straight",
      channels: 4,
      byteLength: bytes.byteLength,
      sha256: `sha256:${sha256HexPortable(bytes)}` as const,
      bytes,
    },
    requestedRoles: ["background", "foreground"],
  };
}

describe("createStudioLayerLiftOnnxInferenceLoader", () => {
  it("declares the ONNX model identity with the route policy label", async () => {
    const loader = createStudioLayerLiftOnnxInferenceLoader({
      segmenter: fakeSegmenter(),
      rasterizeToModelInput: () => new Uint8ClampedArray(MODEL_PIXELS * 4),
    });
    const engine = await loader(new AbortController().signal);
    expect(engine.model).toEqual({
      providerId: "onnxruntime-web",
      providerVersion: "1.27.0",
      modelId: "u2netp",
      modelVersion: "1",
      executionRoute: STUDIO_LAYER_LIFT_ONNX_EXECUTION_ROUTE,
    });
  });

  it("drives the general provider to a trusted foreground success", async () => {
    const segmenter = fakeSegmenter();
    const provider = createStudioLayerLiftLocalForegroundProvider({
      subjectKind: "general-subject",
      loadInference: createStudioLayerLiftOnnxInferenceLoader({
        segmenter,
        rasterizeToModelInput: () => new Uint8ClampedArray(MODEL_PIXELS * 4),
      }),
    });
    const result = await provider.analyze(request(), {
      threshold: 0.5,
      feather: 0,
    });
    expect(isStudioSceneLayerLiftTrustedSuccess(result)).toBe(true);
    expect(result.layers[0]?.role).toBe("foreground");
    expect(result.receipt.providerId).toBe("onnxruntime-web.u2netp");
    expect(segmenter.segment).toHaveBeenCalledTimes(1);
  });
});
