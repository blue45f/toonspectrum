/**
 * Real-ESRGAN anime ×4 upscaling on the product ONNX provider
 * (`studio-onnx-inference-provider`).
 *
 * Why this exists: exported cuts and reference stills often need a clean
 * ×4 for print-size delivery or marketplace covers, and the browser's own
 * resampling only blurs. RealESRGAN_x4plus_anime_6B (Tencent ARC,
 * BSD-3-Clause; code and weights) is the anime-tuned Real-ESRGAN variant.
 * Source pixels never leave the device; the model asset and runtime load
 * lazily on first use.
 *
 * The product registry only accepts fixed tensor shapes, so the model is
 * converted as a fixed 256×256 → 1024×1024 tile (see
 * `assets/realesrgan-anime-6b.LICENSE.md`). This module plans overlapping
 * tiles over an arbitrary raster and writes only each tile's core region
 * (overlap margins are dropped), which keeps seams invisible without a
 * blending pass. Alpha is never fed to the model: it is resampled
 * separately (`upscaleStudioAlphaPlane`) so transparent line art keeps
 * its edges.
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

export const STUDIO_REALESRGAN_MODEL_ID = "realesrgan-anime-6b" as const;
export const STUDIO_REALESRGAN_MODEL_VERSION = "1" as const;
export const STUDIO_REALESRGAN_TILE_SIZE = 256 as const;
export const STUDIO_REALESRGAN_SCALE = 4 as const;
export const STUDIO_REALESRGAN_TILE_OVERLAP = 32 as const;
export const STUDIO_REALESRGAN_INPUT_NAME = "input" as const;
export const STUDIO_REALESRGAN_OUTPUT_NAME = "output" as const;
export const STUDIO_REALESRGAN_MODEL_BYTE_LENGTH = 17_939_941 as const;
export const STUDIO_REALESRGAN_MODEL_SHA256 =
  "sha256:d5f322810c66580608f60c860c8a93982bea343bedc29d74749eebfeea5d3a80" as const;

const TILE = STUDIO_REALESRGAN_TILE_SIZE;
const SCALE = STUDIO_REALESRGAN_SCALE;
const TILE_PIXELS = TILE * TILE;
const OUTPUT_TILE = TILE * SCALE;
const OUTPUT_TILE_PIXELS = OUTPUT_TILE * OUTPUT_TILE;

export const STUDIO_REALESRGAN_MODEL_DESCRIPTOR: StudioOnnxModelDescriptor =
  Object.freeze({
    id: STUDIO_REALESRGAN_MODEL_ID,
    version: STUDIO_REALESRGAN_MODEL_VERSION,
    sha256: STUDIO_REALESRGAN_MODEL_SHA256,
    byteBudget: STUDIO_REALESRGAN_MODEL_BYTE_LENGTH,
    inputs: Object.freeze([
      Object.freeze({
        name: STUDIO_REALESRGAN_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([1, 3, TILE, TILE]),
      }),
    ]),
    outputs: Object.freeze([
      Object.freeze({
        name: STUDIO_REALESRGAN_OUTPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([1, 3, OUTPUT_TILE, OUTPUT_TILE]),
      }),
    ]),
  });

export function createStudioRealEsrganModelRegistry(): StudioOnnxModelRegistry {
  return createStudioOnnxModelRegistry([STUDIO_REALESRGAN_MODEL_DESCRIPTOR]);
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("업스케일을 취소했습니다.", "AbortError");
  }
  const error = new Error("업스케일을 취소했습니다.");
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

export interface StudioUpscaleTilePlacement {
  /** Tile origin in source pixels; the tile always spans TILE×TILE via edge replication. */
  readonly srcX: number;
  readonly srcY: number;
  /** Region of this tile (source pixels) whose ×4 output is kept. */
  readonly coreX: number;
  readonly coreY: number;
  readonly coreWidth: number;
  readonly coreHeight: number;
}

function axisStarts(extent: number): readonly number[] {
  if (extent <= TILE) return [0];
  const step = TILE - STUDIO_REALESRGAN_TILE_OVERLAP;
  const starts: number[] = [0];
  let start = 0;
  while (start + TILE < extent) {
    start = Math.min(start + step, extent - TILE);
    starts.push(start);
  }
  return starts;
}

/**
 * Core ranges partition the axis with no gaps or overlaps: each boundary
 * is the midpoint of the overlap between neighbouring tiles, so every
 * source pixel is written by exactly one tile — including when the final
 * tile was clamped back to the edge and overlaps more than usual.
 */
function axisCores(
  starts: readonly number[],
  extent: number,
): readonly { readonly coreStart: number; readonly coreSize: number }[] {
  return starts.map((start, index) => {
    const coreStart = index === 0
      ? 0
      : Math.round((starts[index - 1]! + TILE + start) / 2);
    const coreEnd = index === starts.length - 1
      ? extent
      : Math.round((start + TILE + starts[index + 1]!) / 2);
    return { coreStart, coreSize: coreEnd - coreStart };
  });
}

/** Plan the overlapping tiles covering a width×height raster. */
export function planStudioUpscaleTiles(
  width: number,
  height: number,
): readonly StudioUpscaleTilePlacement[] {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
  ) {
    throw new RangeError("업스케일할 이미지 크기가 올바르지 않습니다.");
  }
  const xs = axisStarts(width);
  const ys = axisStarts(height);
  const xCores = axisCores(xs, width);
  const yCores = axisCores(ys, height);
  const placements: StudioUpscaleTilePlacement[] = [];
  for (let yi = 0; yi < ys.length; yi += 1) {
    for (let xi = 0; xi < xs.length; xi += 1) {
      placements.push(Object.freeze({
        srcX: xs[xi]!,
        srcY: ys[yi]!,
        coreX: xCores[xi]!.coreStart,
        coreY: yCores[yi]!.coreStart,
        coreWidth: xCores[xi]!.coreSize,
        coreHeight: yCores[yi]!.coreSize,
      }));
    }
  }
  return Object.freeze(placements);
}

/**
 * Extract one TILE×TILE CHW float plane ([0,1]) from a source RGBA raster.
 * Coordinates outside the source replicate the nearest edge pixel, so
 * small sources and clamped final tiles still feed the exact contract.
 */
export function extractStudioUpscaleTilePlane(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  placement: StudioUpscaleTilePlacement,
): Float32Array {
  if (sourceRgba.length !== sourceWidth * sourceHeight * 4) {
    throw new RangeError("원본 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const plane = new Float32Array(3 * TILE_PIXELS);
  for (let ty = 0; ty < TILE; ty += 1) {
    const sy = Math.min(Math.max(placement.srcY + ty, 0), sourceHeight - 1);
    for (let tx = 0; tx < TILE; tx += 1) {
      const sx = Math.min(Math.max(placement.srcX + tx, 0), sourceWidth - 1);
      const srcOffset = (sy * sourceWidth + sx) * 4;
      const tileIndex = ty * TILE + tx;
      plane[tileIndex] = sourceRgba[srcOffset]! / 255;
      plane[TILE_PIXELS + tileIndex] = sourceRgba[srcOffset + 1]! / 255;
      plane[2 * TILE_PIXELS + tileIndex] = sourceRgba[srcOffset + 2]! / 255;
    }
  }
  return plane;
}

/**
 * Write one tile's ×4 output into the full output raster, keeping only
 * the placement's core region so overlapped margins never double-draw.
 */
export function writeStudioUpscaleTileOutput(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  tileOutput: Float32Array,
  placement: StudioUpscaleTilePlacement,
): void {
  if (tileOutput.length !== 3 * OUTPUT_TILE_PIXELS) {
    throw new RangeError("업스케일 타일 출력 길이가 모델 계약과 일치하지 않습니다.");
  }
  if (target.length !== targetWidth * targetHeight * 4) {
    throw new RangeError("출력 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  for (let ly = 0; ly < placement.coreHeight * SCALE; ly += 1) {
    const tileY = (placement.coreY - placement.srcY) * SCALE + ly;
    const targetY = placement.coreY * SCALE + ly;
    for (let lx = 0; lx < placement.coreWidth * SCALE; lx += 1) {
      const tileX = (placement.coreX - placement.srcX) * SCALE + lx;
      const targetX = placement.coreX * SCALE + lx;
      const tileIndex = tileY * OUTPUT_TILE + tileX;
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = tileOutput[channel * OUTPUT_TILE_PIXELS + tileIndex]!;
        target[targetOffset + channel] = Math.round(
          Math.min(1, Math.max(0, value)) * 255,
        );
      }
    }
  }
}

/** Bilinear ×4 resample of a single alpha plane (never model-processed). */
export function upscaleStudioAlphaPlane(
  sourceRgba: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint8ClampedArray,
  targetWidth: number,
): void {
  for (let y = 0; y < sourceHeight * SCALE; y += 1) {
    const srcY = (y + 0.5) / SCALE - 0.5;
    const y0 = Math.floor(srcY);
    const fy = srcY - y0;
    const ya = Math.min(Math.max(y0, 0), sourceHeight - 1);
    const yb = Math.min(Math.max(y0 + 1, 0), sourceHeight - 1);
    for (let x = 0; x < sourceWidth * SCALE; x += 1) {
      const srcX = (x + 0.5) / SCALE - 0.5;
      const x0 = Math.floor(srcX);
      const fx = srcX - x0;
      const xa = Math.min(Math.max(x0, 0), sourceWidth - 1);
      const xb = Math.min(Math.max(x0 + 1, 0), sourceWidth - 1);
      const top = sourceRgba[(ya * sourceWidth + xa) * 4 + 3]! * (1 - fx)
        + sourceRgba[(ya * sourceWidth + xb) * 4 + 3]! * fx;
      const bottom = sourceRgba[(yb * sourceWidth + xa) * 4 + 3]! * (1 - fx)
        + sourceRgba[(yb * sourceWidth + xb) * 4 + 3]! * fx;
      target[(y * targetWidth + x) * 4 + 3] = Math.round(
        top * (1 - fy) + bottom * fy,
      );
    }
  }
}

export interface StudioRealEsrganUpscaleResult {
  /** CHW float plane, 3×1024×1024, roughly [0,1] (clamp when writing). */
  readonly tile: Float32Array;
  readonly executionProvider: StudioOnnxExecutionProvider;
  readonly receipt: StudioOnnxSessionReceipt;
}

export interface StudioRealEsrganUpscaler {
  upscaleTile(
    plane: Float32Array,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioRealEsrganUpscaleResult>;
  dispose(): Promise<void>;
}

export interface CreateStudioRealEsrganUpscalerOptions {
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
 * Create an upscaler that owns one ONNX provider per execution route.
 * Same lifecycle contract as the U-2-Netp segmenter: serialized calls,
 * routes retired after one failure, WebGPU first with WASM fallback.
 */
export function createStudioRealEsrganUpscaler(
  options: CreateStudioRealEsrganUpscalerOptions,
): StudioRealEsrganUpscaler {
  const routes = options.executionProviders ?? DEFAULT_EXECUTION_PROVIDERS;
  const createProvider = options.createProvider ?? ((executionProvider) => (
    createStudioOnnxInferenceProvider({
      registry: createStudioRealEsrganModelRegistry(),
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

  const runUpscale = async (
    plane: Float32Array,
    signal?: AbortSignal,
  ): Promise<StudioRealEsrganUpscaleResult> => {
    if (disposed) throw new Error("업스케일러가 이미 해제되었습니다.");
    throwIfAborted(signal);
    if (plane.length !== 3 * TILE_PIXELS) {
      throw new RangeError("업스케일 타일 평면 길이가 모델 입력과 일치하지 않습니다.");
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
          modelId: STUDIO_REALESRGAN_MODEL_ID,
          version: STUDIO_REALESRGAN_MODEL_VERSION,
          source: Object.freeze({ kind: "bytes" as const, bytes }),
          epoch,
          inputs: Object.freeze([
            Object.freeze({
              name: STUDIO_REALESRGAN_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([1, 3, TILE, TILE]),
              data: plane,
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
        result.outputs[STUDIO_REALESRGAN_OUTPUT_NAME];
      if (
        !output
        || output.elementType !== "float32"
        || !(output.data instanceof Float32Array)
        || output.data.length !== 3 * OUTPUT_TILE_PIXELS
      ) {
        throw new RangeError("업스케일 출력이 없거나 형식이 다릅니다.");
      }
      return Object.freeze({
        tile: output.data,
        executionProvider: route,
        receipt: result.receipt,
      });
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("업스케일 모델을 실행하지 못했습니다.");
  };

  return Object.freeze({
    upscaleTile(
      plane: Float32Array,
      upscaleOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const run = chain.then(() => runUpscale(plane, upscaleOptions.signal));
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
