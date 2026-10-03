import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type {
  StudioOnnxInferenceProvider,
  StudioOnnxInferenceResult,
  StudioOnnxSessionReceipt,
} from "./studio-onnx-inference-provider";
import {
  findStudioOnnxModelDescriptor,
} from "./studio-onnx-model-registry";
import { sha256HexPortable } from "./studio-sha256";
import {
  STUDIO_TEED_INPUT_SIZE,
  STUDIO_TEED_MODEL_BYTE_LENGTH,
  STUDIO_TEED_MODEL_DESCRIPTOR,
  STUDIO_TEED_MODEL_ID,
  STUDIO_TEED_MODEL_SHA256,
  STUDIO_TEED_MODEL_VERSION,
  STUDIO_TEED_OUTPUT_NAME,
  createStudioTeedEdgeExtractor,
  createStudioTeedModelRegistry,
  preprocessStudioTeedInput,
  renderStudioTeedLineArt,
  studioTeedLineIntensity,
} from "./studio-onnx-teed";

const PIXELS = STUDIO_TEED_INPUT_SIZE * STUDIO_TEED_INPUT_SIZE;
const MODEL_PATH = "apps/web/src/domains/creator/assets/teed.onnx";

describe("STUDIO_TEED_MODEL_DESCRIPTOR", () => {
  it("registers cleanly and pins the bundled asset digest", () => {
    const registry = createStudioTeedModelRegistry();
    expect(findStudioOnnxModelDescriptor(
      registry,
      STUDIO_TEED_MODEL_ID,
      STUDIO_TEED_MODEL_VERSION,
    )).toEqual(STUDIO_TEED_MODEL_DESCRIPTOR);
    const bytes = readFileSync(MODEL_PATH);
    expect(bytes.byteLength).toBe(STUDIO_TEED_MODEL_BYTE_LENGTH);
    expect(`sha256:${sha256HexPortable(new Uint8Array(bytes))}`).toBe(
      STUDIO_TEED_MODEL_SHA256,
    );
  });
});

describe("preprocessStudioTeedInput", () => {
  it("emits BGR planes with the BIPED mean subtracted and no scaling", () => {
    const rgba = new Uint8ClampedArray(PIXELS * 4);
    // First pixel: pure red, opaque. Rest: black.
    rgba[0] = 255;
    rgba[3] = 255;
    const data = preprocessStudioTeedInput(
      rgba,
      STUDIO_TEED_INPUT_SIZE,
      STUDIO_TEED_INPUT_SIZE,
    );
    expect(data[0]).toBeCloseTo(0 - 104.007, 3); // B plane
    expect(data[PIXELS]).toBeCloseTo(0 - 116.669, 3); // G plane
    expect(data[2 * PIXELS]).toBeCloseTo(255 - 122.679, 3); // R plane
  });

  it("rejects non-512 rasters", () => {
    expect(() => preprocessStudioTeedInput(new Uint8ClampedArray(4), 1, 1))
      .toThrow(RangeError);
  });
});

describe("studioTeedLineIntensity", () => {
  it("keeps the measured flat-area floor at zero for every sensitivity", () => {
    for (const sensitivity of [0, 0.5, 1]) {
      expect(studioTeedLineIntensity(0.44, sensitivity)).toBe(0);
    }
  });

  it("maps strong edges to full intensity and grows with sensitivity", () => {
    expect(studioTeedLineIntensity(0.99, 0)).toBe(1);
    expect(studioTeedLineIntensity(0.6, 1)).toBeGreaterThan(
      studioTeedLineIntensity(0.6, 0),
    );
  });
});

describe("renderStudioTeedLineArt", () => {
  it("renders white paper with black lines from a probability plane", () => {
    const plane = new Float32Array(PIXELS).fill(0.44);
    plane.fill(0.99, 0, PIXELS / 2);
    const out = renderStudioTeedLineArt({
      edgePlane: plane,
      width: STUDIO_TEED_INPUT_SIZE,
      height: 2,
      sensitivity: 0.5,
    });
    // Top row samples the strong half -> black; bottom row -> white.
    expect(out[0]).toBe(0);
    expect(out[(STUDIO_TEED_INPUT_SIZE) * 4]).toBe(255);
    expect(out[3]).toBe(255);
  });
});

describe("createStudioTeedEdgeExtractor", () => {
  function fakeReceipt(
    executionProvider: "webgpu" | "wasm",
  ): StudioOnnxSessionReceipt {
    return Object.freeze({
      providerId: "onnxruntime-web",
      runtimeVersion: "1.27.0",
      model: Object.freeze({
        id: STUDIO_TEED_MODEL_ID,
        version: STUDIO_TEED_MODEL_VERSION,
        sha256: STUDIO_TEED_MODEL_SHA256,
        byteLength: STUDIO_TEED_MODEL_BYTE_LENGTH,
      }),
      selectedExecutionProvider: executionProvider,
      attemptedExecutionProviders: Object.freeze([executionProvider]) as
        readonly ["webgpu" | "wasm"],
      activeExecutionProvider: executionProvider,
      attemptCount: 1,
      failureIsolation: "fail-closed",
    });
  }

  it("returns the edge plane from the first working route", async () => {
    const provider = {
      setEpoch: vi.fn(),
      loadModel: vi.fn(),
      infer: vi.fn(async (request: {
        readonly epoch: StudioOnnxInferenceResult["epoch"];
      }): Promise<StudioOnnxInferenceResult> => Object.freeze({
        epoch: request.epoch,
        receipt: fakeReceipt("webgpu"),
        outputs: Object.freeze({
          [STUDIO_TEED_OUTPUT_NAME]: Object.freeze({
            name: STUDIO_TEED_OUTPUT_NAME,
            elementType: "float32" as const,
            dims: Object.freeze([1, 1, STUDIO_TEED_INPUT_SIZE, STUDIO_TEED_INPUT_SIZE]),
            data: new Float32Array(PIXELS).fill(0.5),
          }),
        }),
      })),
      disposeModel: vi.fn(async () => false),
      dispose: vi.fn(async () => undefined),
    } as unknown as StudioOnnxInferenceProvider;
    const extractor = createStudioTeedEdgeExtractor({
      loadModelBytes: async () => new Uint8Array([1]),
      createProvider: () => provider,
    });
    const result = await extractor.extract(new Float32Array(3 * PIXELS));
    expect(result.executionProvider).toBe("webgpu");
    expect(result.edges.length).toBe(PIXELS);
  });
});
