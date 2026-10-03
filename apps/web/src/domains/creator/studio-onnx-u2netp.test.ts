import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxInferenceProvider,
  type StudioOnnxInferenceResult,
  type StudioOnnxRuntime,
  type StudioOnnxSessionReceipt,
} from "./studio-onnx-inference-provider";
import {
  findStudioOnnxModelDescriptor,
} from "./studio-onnx-model-registry";
import { sha256HexPortable } from "./studio-sha256";
import {
  STUDIO_U2NETP_INPUT_NAME,
  STUDIO_U2NETP_INPUT_SIZE,
  STUDIO_U2NETP_MODEL_BYTE_LENGTH,
  STUDIO_U2NETP_MODEL_DESCRIPTOR,
  STUDIO_U2NETP_MODEL_ID,
  STUDIO_U2NETP_MODEL_SHA256,
  STUDIO_U2NETP_MODEL_VERSION,
  STUDIO_U2NETP_OUTPUT_NAMES,
  STUDIO_U2NETP_PRIMARY_OUTPUT_NAME,
  createStudioU2netpForegroundSegmenter,
  createStudioU2netpModelRegistry,
  normalizeStudioU2netpSaliency,
  preprocessStudioU2netpInput,
  studioU2netpMaskFromOutputs,
} from "./studio-onnx-u2netp";

const PIXELS = STUDIO_U2NETP_INPUT_SIZE * STUDIO_U2NETP_INPUT_SIZE;
const MODEL_PATH = "apps/web/src/domains/creator/assets/u2netp.onnx";

function solidRgba(red: number, green: number, blue: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(PIXELS * 4);
  for (let index = 0; index < PIXELS; index += 1) {
    rgba[index * 4] = red;
    rgba[index * 4 + 1] = green;
    rgba[index * 4 + 2] = blue;
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}

function rampData(): Float32Array {
  const data = new Float32Array(PIXELS);
  for (let index = 0; index < PIXELS; index += 1) {
    data[index] = index / (PIXELS - 1);
  }
  return data;
}

function fakeOutputs() {
  return Object.freeze({
    [STUDIO_U2NETP_PRIMARY_OUTPUT_NAME]: Object.freeze({
      name: STUDIO_U2NETP_PRIMARY_OUTPUT_NAME,
      elementType: "float32" as const,
      dims: Object.freeze([1, 1, STUDIO_U2NETP_INPUT_SIZE, STUDIO_U2NETP_INPUT_SIZE]),
      data: rampData(),
    }),
  });
}

function fakeReceipt(
  executionProvider: "webgpu" | "wasm",
): StudioOnnxSessionReceipt {
  return Object.freeze({
    providerId: "onnxruntime-web",
    runtimeVersion: "1.27.0",
    model: Object.freeze({
      id: STUDIO_U2NETP_MODEL_ID,
      version: STUDIO_U2NETP_MODEL_VERSION,
      sha256: STUDIO_U2NETP_MODEL_SHA256,
      byteLength: STUDIO_U2NETP_MODEL_BYTE_LENGTH,
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
  const requests: unknown[] = [];
  const provider = {
    destroyed: false,
    epoch: Object.freeze({ request: 0, stroke: 0, document: 0 }),
    requests,
    setEpoch: vi.fn(),
    loadModel: vi.fn(),
    infer: vi.fn(async (request: {
      readonly epoch: StudioOnnxInferenceResult["epoch"];
    }): Promise<StudioOnnxInferenceResult> => {
      requests.push(request);
      if (failure) throw failure;
      return Object.freeze({
        epoch: request.epoch,
        receipt: fakeReceipt(executionProvider),
        outputs: fakeOutputs(),
      });
    }),
    disposeModel: vi.fn(async () => false),
    dispose: vi.fn(async () => undefined),
  };
  return provider as unknown as StudioOnnxInferenceProvider & typeof provider;
}

describe("STUDIO_U2NETP_MODEL_DESCRIPTOR", () => {
  it("registers cleanly and pins the bundled asset digest", () => {
    const registry = createStudioU2netpModelRegistry();
    const found = findStudioOnnxModelDescriptor(
      registry,
      STUDIO_U2NETP_MODEL_ID,
      STUDIO_U2NETP_MODEL_VERSION,
    );
    expect(found).toEqual(STUDIO_U2NETP_MODEL_DESCRIPTOR);

    const assetBytes = readFileSync(MODEL_PATH);
    expect(assetBytes.byteLength).toBe(STUDIO_U2NETP_MODEL_BYTE_LENGTH);
    expect(`sha256:${sha256HexPortable(assetBytes)}`).toBe(
      STUDIO_U2NETP_MODEL_SHA256,
    );
    expect(STUDIO_U2NETP_MODEL_DESCRIPTOR.byteBudget).toBe(assetBytes.byteLength);
    expect(STUDIO_U2NETP_MODEL_DESCRIPTOR.inputs[0]?.name).toBe(
      STUDIO_U2NETP_INPUT_NAME,
    );
    expect(STUDIO_U2NETP_MODEL_DESCRIPTOR.outputs.map((output) => output.name))
      .toEqual([...STUDIO_U2NETP_OUTPUT_NAMES]);
  });
});

describe("preprocessStudioU2netpInput", () => {
  it("normalizes by the image maximum and applies ImageNet statistics in NCHW order", () => {
    const data = preprocessStudioU2netpInput(solidRgba(128, 64, 32), 320, 320);
    expect(data).toHaveLength(3 * PIXELS);
    // max = 128 → R normalizes to 1.0, G to 0.5, B to 0.25 before mean/std.
    expect(data[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(data[PIXELS]).toBeCloseTo((0.5 - 0.456) / 0.224, 5);
    expect(data[2 * PIXELS]).toBeCloseTo((0.25 - 0.406) / 0.225, 5);
  });

  it("treats an all-black image with a divisor of 1", () => {
    const data = preprocessStudioU2netpInput(solidRgba(0, 0, 0), 320, 320);
    expect(data[0]).toBeCloseTo((0 - 0.485) / 0.229, 5);
  });

  it("rejects non-model sizes and mismatched buffers", () => {
    expect(() => preprocessStudioU2netpInput(new Uint8Array(4), 1, 1))
      .toThrow(RangeError);
    expect(() => preprocessStudioU2netpInput(new Uint8Array(8), 320, 320))
      .toThrow(RangeError);
  });
});

describe("normalizeStudioU2netpSaliency", () => {
  it("min/max-normalizes a plane into 0..1 confidence", () => {
    const confidence = normalizeStudioU2netpSaliency(rampData());
    expect(confidence[0]).toBe(0);
    expect(confidence[PIXELS - 1]).toBe(1);
    expect(confidence[Math.floor(PIXELS / 2)]).toBeCloseTo(0.5, 3);
  });

  it("rejects flat, non-finite, and wrongly sized planes", () => {
    expect(() => normalizeStudioU2netpSaliency(new Float32Array(PIXELS)))
      .toThrow(RangeError);
    const withNaN = rampData();
    withNaN[10] = Number.NaN;
    expect(() => normalizeStudioU2netpSaliency(withNaN)).toThrow(RangeError);
    expect(() => normalizeStudioU2netpSaliency(new Float32Array(4)))
      .toThrow(RangeError);
  });
});

describe("studioU2netpMaskFromOutputs", () => {
  it("reads the fused output and rejects missing or mistyped outputs", () => {
    const mask = studioU2netpMaskFromOutputs(fakeOutputs());
    expect(mask.width).toBe(320);
    expect(mask.confidence[PIXELS - 1]).toBe(1);
    expect(() => studioU2netpMaskFromOutputs({})).toThrow(RangeError);
    expect(() => studioU2netpMaskFromOutputs({
      [STUDIO_U2NETP_PRIMARY_OUTPUT_NAME]: {
        name: STUDIO_U2NETP_PRIMARY_OUTPUT_NAME,
        elementType: "uint8",
        dims: [1, 1, 320, 320],
        data: new Uint8Array(PIXELS),
      },
    })).toThrow(RangeError);
  });
});

describe("createStudioU2netpForegroundSegmenter", () => {
  const loadModelBytes = async () => new Uint8Array([1, 2, 3]);

  it("runs the preferred WebGPU route and returns a normalized mask", async () => {
    const webgpu = fakeProvider("webgpu");
    const segmenter = createStudioU2netpForegroundSegmenter({
      loadModelBytes,
      createProvider: () => webgpu,
    });
    const result = await segmenter.segment(solidRgba(200, 100, 50));
    expect(result.executionProvider).toBe("webgpu");
    expect(result.confidence[PIXELS - 1]).toBe(1);
    expect(webgpu.setEpoch).toHaveBeenCalledWith({
      request: 1,
      stroke: 0,
      document: 0,
    });
    const request = webgpu.requests[0] as {
      readonly modelId: string;
      readonly inputs: readonly { readonly name: string; readonly dims: readonly number[]; readonly data: Float32Array }[];
      readonly source: { readonly kind: string };
    };
    expect(request.modelId).toBe(STUDIO_U2NETP_MODEL_ID);
    expect(request.source.kind).toBe("bytes");
    expect(request.inputs[0]?.name).toBe(STUDIO_U2NETP_INPUT_NAME);
    expect(request.inputs[0]?.dims).toEqual([1, 3, 320, 320]);
    expect(request.inputs[0]?.data).toHaveLength(3 * PIXELS);
  });

  it("retires a failed route and falls back to WASM without retrying it", async () => {
    const webgpu = fakeProvider("webgpu", new Error("webgpu unavailable"));
    const wasm = fakeProvider("wasm");
    const created: string[] = [];
    const segmenter = createStudioU2netpForegroundSegmenter({
      loadModelBytes,
      createProvider: (route) => {
        created.push(route);
        return route === "webgpu" ? webgpu : wasm;
      },
    });
    const first = await segmenter.segment(solidRgba(10, 20, 30));
    expect(first.executionProvider).toBe("wasm");
    expect(webgpu.dispose).toHaveBeenCalledOnce();
    const second = await segmenter.segment(solidRgba(10, 20, 30));
    expect(second.executionProvider).toBe("wasm");
    expect(webgpu.infer).toHaveBeenCalledOnce();
    expect(created).toEqual(["webgpu", "wasm"]);
  });

  it("propagates the failure when every route fails", async () => {
    const failure = new Error("wasm unavailable");
    const segmenter = createStudioU2netpForegroundSegmenter({
      loadModelBytes,
      createProvider: (route) => fakeProvider(route, failure),
    });
    await expect(segmenter.segment(solidRgba(0, 0, 0))).rejects.toBe(failure);
  });

  it("rejects an already-aborted signal without touching a provider", async () => {
    const createProvider = vi.fn(() => fakeProvider("wasm"));
    const segmenter = createStudioU2netpForegroundSegmenter({
      loadModelBytes,
      createProvider,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      segmenter.segment(solidRgba(0, 0, 0), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createProvider).not.toHaveBeenCalled();
  });
});

describe("real provider wiring (fake ORT runtime, real model bytes)", () => {
  class FakeTensor {
    readonly location = "cpu";
    readonly dispose = vi.fn();
    readonly getData = vi.fn(async () => this.data);

    constructor(
      readonly type: string,
      readonly data: Float32Array,
      readonly dims: readonly number[],
    ) {}
  }

  it("creates a schema-valid session and segments through the provider", async () => {
    const modelBytes = new Uint8Array(readFileSync(MODEL_PATH));
    const feedsSeen: Record<string, FakeTensor>[] = [];
    const session = {
      inputNames: [STUDIO_U2NETP_INPUT_NAME],
      outputNames: [...STUDIO_U2NETP_OUTPUT_NAMES],
      release: vi.fn(async () => undefined),
      run: vi.fn(async (feeds: Record<string, FakeTensor>) => {
        feedsSeen.push(feeds);
        const outputs: Record<string, FakeTensor> = {};
        for (const name of STUDIO_U2NETP_OUTPUT_NAMES) {
          outputs[name] = new FakeTensor(
            "float32",
            name === STUDIO_U2NETP_PRIMARY_OUTPUT_NAME
              ? rampData()
              : new Float32Array(PIXELS),
            [1, 1, 320, 320],
          );
        }
        return outputs;
      }),
    };
    const runtime = {
      InferenceSession: { create: vi.fn(async () => session) },
      Tensor: FakeTensor,
    } as unknown as StudioOnnxRuntime;

    const segmenter = createStudioU2netpForegroundSegmenter({
      loadModelBytes: async () => modelBytes,
      executionProviders: ["wasm"],
      createProvider: (executionProvider) => (
        createStudioOnnxInferenceProvider({
          registry: createStudioU2netpModelRegistry(),
          executionProvider,
          loadRuntime: async () => runtime,
        })
      ),
    });

    const result = await segmenter.segment(solidRgba(90, 120, 30));
    expect(result.executionProvider).toBe("wasm");
    expect(result.receipt.model.id).toBe(STUDIO_U2NETP_MODEL_ID);
    expect(result.receipt.model.sha256).toBe(STUDIO_U2NETP_MODEL_SHA256);
    expect(result.receipt.activeExecutionProvider).toBe("wasm");
    expect(result.confidence[0]).toBe(0);
    expect(result.confidence[PIXELS - 1]).toBe(1);
    const feeds = feedsSeen[0];
    expect(feeds?.[STUDIO_U2NETP_INPUT_NAME]?.dims).toEqual([1, 3, 320, 320]);
    await segmenter.dispose();
  });
});
