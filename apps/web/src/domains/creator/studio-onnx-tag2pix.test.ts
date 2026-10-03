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
  STUDIO_TAG2PIX_INPUT_SIZE,
  STUDIO_TAG2PIX_MODEL_BYTE_LENGTH,
  STUDIO_TAG2PIX_MODEL_DESCRIPTOR,
  STUDIO_TAG2PIX_MODEL_ID,
  STUDIO_TAG2PIX_MODEL_SHA256,
  STUDIO_TAG2PIX_MODEL_VERSION,
  STUDIO_TAG2PIX_OUTPUT_NAME,
  STUDIO_TAG2PIX_TAG_COUNT,
  STUDIO_TAG2PIX_TAG_NAMES,
  buildStudioTag2pixTagVector,
  compositeStudioTag2pixColor,
  createStudioTag2pixColorizer,
  createStudioTag2pixModelRegistry,
  preprocessStudioTag2pixLine,
} from "./studio-onnx-tag2pix";

const PIXELS = STUDIO_TAG2PIX_INPUT_SIZE * STUDIO_TAG2PIX_INPUT_SIZE;
const MODEL_PATH = "apps/web/src/domains/creator/assets/tag2pix.onnx";

function fakeReceipt(
  executionProvider: "webgpu" | "wasm",
): StudioOnnxSessionReceipt {
  return Object.freeze({
    providerId: "onnxruntime-web",
    runtimeVersion: "1.27.0",
    model: Object.freeze({
      id: STUDIO_TAG2PIX_MODEL_ID,
      version: STUDIO_TAG2PIX_MODEL_VERSION,
      sha256: STUDIO_TAG2PIX_MODEL_SHA256,
      byteLength: STUDIO_TAG2PIX_MODEL_BYTE_LENGTH,
    }),
    selectedExecutionProvider: executionProvider,
    attemptedExecutionProviders: Object.freeze([executionProvider]) as
      readonly ["webgpu" | "wasm"],
    activeExecutionProvider: executionProvider,
    attemptCount: 1,
    failureIsolation: "fail-closed",
  });
}

function fakeProvider(
  executionProvider: "webgpu" | "wasm",
  failure?: Error,
) {
  const provider = {
    setEpoch: vi.fn(),
    loadModel: vi.fn(),
    infer: vi.fn(async (request: {
      readonly epoch: StudioOnnxInferenceResult["epoch"];
    }): Promise<StudioOnnxInferenceResult> => {
      if (failure) throw failure;
      const color = new Float32Array(3 * PIXELS).fill(0.25);
      return Object.freeze({
        epoch: request.epoch,
        receipt: fakeReceipt(executionProvider),
        outputs: Object.freeze({
          [STUDIO_TAG2PIX_OUTPUT_NAME]: Object.freeze({
            name: STUDIO_TAG2PIX_OUTPUT_NAME,
            elementType: "float32" as const,
            dims: Object.freeze([1, 3, STUDIO_TAG2PIX_INPUT_SIZE, STUDIO_TAG2PIX_INPUT_SIZE]),
            data: color,
          }),
        }),
      });
    }),
    disposeModel: vi.fn(async () => false),
    dispose: vi.fn(async () => undefined),
  };
  return provider as unknown as StudioOnnxInferenceProvider & typeof provider;
}

describe("STUDIO_TAG2PIX_MODEL_DESCRIPTOR", () => {
  it("registers cleanly and pins the bundled asset digest", () => {
    const registry = createStudioTag2pixModelRegistry();
    const found = findStudioOnnxModelDescriptor(
      registry,
      STUDIO_TAG2PIX_MODEL_ID,
      STUDIO_TAG2PIX_MODEL_VERSION,
    );
    expect(found).toEqual(STUDIO_TAG2PIX_MODEL_DESCRIPTOR);
    const bytes = readFileSync(MODEL_PATH);
    expect(bytes.byteLength).toBe(STUDIO_TAG2PIX_MODEL_BYTE_LENGTH);
    expect(`sha256:${sha256HexPortable(new Uint8Array(bytes))}`).toBe(
      STUDIO_TAG2PIX_MODEL_SHA256,
    );
  });
});

describe("STUDIO_TAG2PIX_TAG_NAMES", () => {
  it("keeps the 115-tag upstream vocabulary order stable", () => {
    expect(STUDIO_TAG2PIX_TAG_COUNT).toBe(115);
    expect(STUDIO_TAG2PIX_TAG_NAMES[0]).toBe("black_legwear");
    expect(STUDIO_TAG2PIX_TAG_NAMES[78]).toBe("blonde_hair");
    expect(STUDIO_TAG2PIX_TAG_NAMES[102]).toBe("white_background");
    expect(STUDIO_TAG2PIX_TAG_NAMES[114]).toBe("beige_background");
    expect(new Set(STUDIO_TAG2PIX_TAG_NAMES).size).toBe(115);
  });
});

describe("buildStudioTag2pixTagVector", () => {
  it("sets multi-hot entries by vocabulary index", () => {
    const vector = buildStudioTag2pixTagVector(["black_hair", "blue_eyes"]);
    expect(vector.length).toBe(115);
    expect(vector[STUDIO_TAG2PIX_TAG_NAMES.indexOf("black_hair")]).toBe(1);
    expect(vector[STUDIO_TAG2PIX_TAG_NAMES.indexOf("blue_eyes")]).toBe(1);
    expect(vector.reduce((acc, v) => acc + v, 0)).toBe(2);
  });

  it("rejects unknown tag names", () => {
    expect(() => buildStudioTag2pixTagVector(["not_a_tag"])).toThrow(
      RangeError,
    );
  });
});

describe("preprocessStudioTag2pixLine", () => {
  it("maps white to 1 and black to 0 without inversion on bright art", () => {
    const rgba = new Uint8ClampedArray(PIXELS * 4).fill(255);
    rgba[0] = 0;
    rgba[1] = 0;
    rgba[2] = 0;
    const line = preprocessStudioTag2pixLine(
      rgba,
      STUDIO_TAG2PIX_INPUT_SIZE,
      STUDIO_TAG2PIX_INPUT_SIZE,
    );
    expect(line[0]).toBeCloseTo(0, 5);
    expect(line[1]).toBeCloseTo(1, 5);
  });

  it("inverts a mostly dark raster (white lines on black canvas)", () => {
    const rgba = new Uint8ClampedArray(PIXELS * 4);
    for (let i = 0; i < PIXELS; i += 1) rgba[i * 4 + 3] = 255;
    rgba[0] = 255;
    rgba[1] = 255;
    rgba[2] = 255;
    const line = preprocessStudioTag2pixLine(
      rgba,
      STUDIO_TAG2PIX_INPUT_SIZE,
      STUDIO_TAG2PIX_INPUT_SIZE,
    );
    // The single white "line" pixel becomes a dark line on white.
    expect(line[0]).toBeCloseTo(0, 5);
    expect(line[1]).toBeCloseTo(1, 5);
  });

  it("rejects non-512 rasters", () => {
    expect(() => preprocessStudioTag2pixLine(new Uint8ClampedArray(4), 1, 1))
      .toThrow(RangeError);
  });
});

describe("compositeStudioTag2pixColor", () => {
  function redPlane(): Float32Array {
    const plane = new Float32Array(3 * PIXELS);
    // Pure red in tanh space: R=1, G=-1, B=-1 everywhere.
    plane.fill(-1);
    plane.fill(1, 0, PIXELS);
    return plane;
  }

  it("keeps black lines black and lets white fills take the model color", () => {
    const source = new Uint8ClampedArray([
      0, 0, 0, 255, // line pixel
      255, 255, 255, 255, // fill pixel
    ]);
    const out = compositeStudioTag2pixColor({
      colorPlane: redPlane(),
      sourceRgba: source,
      sourceWidth: 2,
      sourceHeight: 1,
    });
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    expect(out[4]).toBeGreaterThan(200);
    expect(out[5]).toBeLessThan(60);
    expect(out[6]).toBeLessThan(60);
    expect(out[7]).toBe(255);
  });

  it("preserves source alpha", () => {
    const source = new Uint8ClampedArray([255, 255, 255, 128]);
    const out = compositeStudioTag2pixColor({
      colorPlane: redPlane(),
      sourceRgba: source,
      sourceWidth: 1,
      sourceHeight: 1,
    });
    expect(out[3]).toBe(128);
  });
});

describe("createStudioTag2pixColorizer", () => {
  const line = new Float32Array(PIXELS);
  const tags = buildStudioTag2pixTagVector(["pink_hair"]);

  it("falls back to WASM when the WebGPU route fails", async () => {
    const webgpu = fakeProvider("webgpu", new Error("webgpu unavailable"));
    const wasm = fakeProvider("wasm");
    const colorizer = createStudioTag2pixColorizer({
      loadModelBytes: async () => new Uint8Array([1, 2, 3]),
      createProvider: (route) => (route === "webgpu" ? webgpu : wasm),
    });
    const result = await colorizer.colorize(line, tags);
    expect(result.executionProvider).toBe("wasm");
    expect(result.color.length).toBe(3 * PIXELS);
    expect(webgpu.dispose).toHaveBeenCalled();
  });

  it("rejects wrongly sized inputs before touching the provider", async () => {
    const wasm = fakeProvider("wasm");
    const colorizer = createStudioTag2pixColorizer({
      loadModelBytes: async () => new Uint8Array([1]),
      createProvider: () => wasm,
    });
    await expect(colorizer.colorize(new Float32Array(4), tags)).rejects
      .toThrow(RangeError);
    expect(wasm.infer).not.toHaveBeenCalled();
  });
});
