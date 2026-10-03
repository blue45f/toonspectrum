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
import {
  STUDIO_REALESRGAN_MODEL_BYTE_LENGTH,
  STUDIO_REALESRGAN_MODEL_DESCRIPTOR,
  STUDIO_REALESRGAN_MODEL_ID,
  STUDIO_REALESRGAN_MODEL_SHA256,
  STUDIO_REALESRGAN_MODEL_VERSION,
  STUDIO_REALESRGAN_OUTPUT_NAME,
  createStudioRealEsrganModelRegistry,
  createStudioRealEsrganUpscaler,
  extractStudioUpscaleTilePlane,
  planStudioUpscaleTiles,
  upscaleStudioAlphaPlane,
  writeStudioUpscaleTileOutput,
} from "./studio-onnx-realesrgan";
import { sha256HexPortable } from "./studio-sha256";

const MODEL_PATH = "apps/web/src/domains/creator/assets/realesrgan-anime-6b.onnx";
const TILE_PIXELS = 256 * 256;
const OUT_PIXELS = 1024 * 1024;

describe("STUDIO_REALESRGAN_MODEL_DESCRIPTOR", () => {
  it("registers cleanly and pins the bundled asset digest", () => {
    const registry = createStudioRealEsrganModelRegistry();
    expect(findStudioOnnxModelDescriptor(
      registry,
      STUDIO_REALESRGAN_MODEL_ID,
      STUDIO_REALESRGAN_MODEL_VERSION,
    )).toEqual(STUDIO_REALESRGAN_MODEL_DESCRIPTOR);
    const bytes = readFileSync(MODEL_PATH);
    expect(bytes.byteLength).toBe(STUDIO_REALESRGAN_MODEL_BYTE_LENGTH);
    expect(`sha256:${sha256HexPortable(new Uint8Array(bytes))}`).toBe(
      STUDIO_REALESRGAN_MODEL_SHA256,
    );
  });
});

describe("planStudioUpscaleTiles", () => {
  it("uses one full-core tile for rasters up to the tile size", () => {
    expect(planStudioUpscaleTiles(100, 80)).toEqual([
      { srcX: 0, srcY: 0, coreX: 0, coreY: 0, coreWidth: 100, coreHeight: 80 },
    ]);
    expect(planStudioUpscaleTiles(256, 256)).toHaveLength(1);
  });

  it("partitions larger rasters with no core gaps or overlaps", () => {
    for (const [width, height] of [[512, 256], [800, 600], [300, 301]] as const) {
      const placements = planStudioUpscaleTiles(width, height);
      const covered = new Uint8Array(width * height);
      for (const p of placements) {
        // The tile's own span must cover its core.
        expect(p.coreX).toBeGreaterThanOrEqual(p.srcX);
        expect(p.coreX + p.coreWidth).toBeLessThanOrEqual(
          Math.min(p.srcX + 256, width),
        );
        for (let y = p.coreY; y < p.coreY + p.coreHeight; y += 1) {
          for (let x = p.coreX; x < p.coreX + p.coreWidth; x += 1) {
            covered[y * width + x] += 1;
          }
        }
      }
      expect(covered.every((v) => v === 1)).toBe(true);
    }
  });

  it("rejects empty rasters", () => {
    expect(() => planStudioUpscaleTiles(0, 10)).toThrow(RangeError);
  });
});

describe("tile plane extract / write round trip", () => {
  it("extracts with edge replication and writes the core at ×4", () => {
    // 2×1 source: red, blue. Single tile placement covers it fully.
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const [placement] = planStudioUpscaleTiles(2, 1);
    const plane = extractStudioUpscaleTilePlane(source, 2, 1, placement!);
    expect(plane[0]).toBe(1); // R of pixel (0,0)
    expect(plane[TILE_PIXELS + 0]).toBe(0); // G
    // Edge replication: x=200 still reads the last source pixel (blue).
    expect(plane[200]).toBe(0);
    expect(plane[2 * TILE_PIXELS + 200]).toBe(1);

    const target = new Uint8ClampedArray(8 * 4 * 4);
    const tileOut = new Float32Array(3 * OUT_PIXELS).fill(0.5);
    writeStudioUpscaleTileOutput(target, 8, 4, tileOut, placement!);
    // Core is the whole 2×1 → ×4 = 8×4 all written at 0.5 → 128 grey.
    expect(target[0]).toBe(128);
    expect(target[(3 * 8 + 7) * 4]).toBe(128);
  });

  it("upscales alpha bilinearly without touching RGB", () => {
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
    const target = new Uint8ClampedArray(8 * 4 * 4);
    upscaleStudioAlphaPlane(source, 2, 1, target, 8);
    expect(target[3]).toBe(0);
    expect(target[(0 * 8 + 7) * 4 + 3]).toBe(255);
    const mid = target[(0 * 8 + 3) * 4 + 3]!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
    expect(target[0]).toBe(0); // RGB untouched
  });
});

describe("createStudioRealEsrganUpscaler", () => {
  function fakeReceipt(
    executionProvider: "webgpu" | "wasm",
  ): StudioOnnxSessionReceipt {
    return Object.freeze({
      providerId: "onnxruntime-web",
      runtimeVersion: "1.27.0",
      model: Object.freeze({
        id: STUDIO_REALESRGAN_MODEL_ID,
        version: STUDIO_REALESRGAN_MODEL_VERSION,
        sha256: STUDIO_REALESRGAN_MODEL_SHA256,
        byteLength: STUDIO_REALESRGAN_MODEL_BYTE_LENGTH,
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
        return Object.freeze({
          epoch: request.epoch,
          receipt: fakeReceipt(executionProvider),
          outputs: Object.freeze({
            [STUDIO_REALESRGAN_OUTPUT_NAME]: Object.freeze({
              name: STUDIO_REALESRGAN_OUTPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([1, 3, 1024, 1024]),
              data: new Float32Array(3 * OUT_PIXELS).fill(0.25),
            }),
          }),
        });
      }),
      disposeModel: vi.fn(async () => false),
      dispose: vi.fn(async () => undefined),
    };
    return provider as unknown as StudioOnnxInferenceProvider & typeof provider;
  }

  it("falls back to WASM when the WebGPU route fails", async () => {
    const webgpu = fakeProvider("webgpu", new Error("no webgpu"));
    const wasm = fakeProvider("wasm");
    const upscaler = createStudioRealEsrganUpscaler({
      loadModelBytes: async () => new Uint8Array([1]),
      createProvider: (route) => (route === "webgpu" ? webgpu : wasm),
    });
    const result = await upscaler.upscaleTile(new Float32Array(3 * TILE_PIXELS));
    expect(result.executionProvider).toBe("wasm");
    expect(result.tile.length).toBe(3 * OUT_PIXELS);
  });
});
