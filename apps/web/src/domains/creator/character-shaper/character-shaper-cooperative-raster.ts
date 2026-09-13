/** Bounded CPU work for PSD passes; pixel math stays in the synchronous reference functions. */
import {
  alphaOnly,
  deriveCharacterShadingLayers,
  sobelEdgeAlpha,
} from "./character-shaper-image-math";

import type { CharacterShadingLayers, CharacterSobelOptions } from "./character-shaper-image-math";

// Each task processes at most this many pixels (Sobel additionally reads two halo rows).
const CHUNK_PIXELS = 16_384;
const MAX_EDGE = 2048;

export interface CharacterRasterWorkOptions {
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void;
  readonly onProgress?: (completedPixels: number, totalPixels: number) => void;
}

function checkWork(options: CharacterRasterWorkOptions): void {
  if (options.signal?.aborted) {
    const error = new Error("캐릭터 레이어 계산을 취소했습니다.");
    error.name = "AbortError";
    throw error;
  }
  options.assertCurrent?.();
}

/** A real task boundary, not a resolved Promise/microtask that starves input and paint. */
export function yieldCharacterRasterWork(options: CharacterRasterWorkOptions = {}): Promise<void> {
  checkWork(options);
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      const error = new Error("캐릭터 레이어 계산을 취소했습니다.");
      error.name = "AbortError";
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      try {
        checkWork(options);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 0);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}

function assertRaster(rgba: Uint8ClampedArray): void {
  if (!(rgba instanceof Uint8ClampedArray) || !(rgba.buffer instanceof ArrayBuffer) ||
    rgba.length === 0 || rgba.length % 4 !== 0 || rgba.length > MAX_EDGE * MAX_EDGE * 4) {
    throw new TypeError("캐릭터 레이어 RGBA 저장소가 올바르지 않거나 2K 예산을 초과했습니다.");
  }
}

async function visitChunks(
  pixels: number,
  chunkPixels: number,
  visit: (start: number, end: number) => void,
  options: CharacterRasterWorkOptions,
): Promise<void> {
  for (let start = 0; start < pixels; start += chunkPixels) {
    checkWork(options);
    const end = Math.min(pixels, start + chunkPixels);
    visit(start, end);
    checkWork(options);
    options.onProgress?.(end, pixels);
    checkWork(options);
    if (end < pixels) await yieldCharacterRasterWork(options);
  }
}

export async function deriveCharacterShadingLayersCooperatively(
  flat: Uint8ClampedArray,
  beauty: Uint8ClampedArray,
  options: CharacterRasterWorkOptions = {},
): Promise<CharacterShadingLayers> {
  assertRaster(flat);
  assertRaster(beauty);
  if (flat.length !== beauty.length) throw new TypeError("음영을 분리할 두 패스의 크기가 다릅니다.");
  checkWork(options);
  const shadow = new Uint8ClampedArray(flat.length);
  const highlight = new Uint8ClampedArray(flat.length);
  await visitChunks(flat.length / 4, CHUNK_PIXELS, (start, end) => {
    const chunk = deriveCharacterShadingLayers(flat.subarray(start * 4, end * 4), beauty.subarray(start * 4, end * 4));
    shadow.set(chunk.shadow, start * 4);
    highlight.set(chunk.highlight, start * 4);
  }, options);
  return { shadow, highlight };
}

/** Full-width stripes with a one-row halo on both sides exactly preserve the reference Sobel. */
export async function sobelEdgeAlphaCooperatively(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sobelOptions: CharacterSobelOptions = {},
  options: CharacterRasterWorkOptions = {},
): Promise<Uint8ClampedArray> {
  assertRaster(rgba);
  if (!Number.isSafeInteger(width) || width < 1 || width > MAX_EDGE ||
    !Number.isSafeInteger(height) || height < 1 || height > MAX_EDGE || rgba.length !== width * height * 4) {
    throw new TypeError("에지 추출 버퍼 크기가 가로·세로와 맞지 않습니다.");
  }
  checkWork(options);
  const output = new Uint8ClampedArray(rgba.length);
  const rows = Math.max(1, Math.floor(CHUNK_PIXELS / width));
  await visitChunks(width * height, rows * width, (start, end) => {
    const firstRow = start / width;
    const lastRow = end / width;
    const haloStart = Math.max(0, firstRow - 1);
    const haloEnd = Math.min(height, lastRow + 1);
    const chunk = sobelEdgeAlpha(rgba.subarray(haloStart * width * 4, haloEnd * width * 4), width, haloEnd - haloStart, sobelOptions);
    const offset = (firstRow - haloStart) * width * 4;
    output.set(chunk.subarray(offset, offset + (end - start) * 4), start * 4);
  }, options);
  return output;
}

export async function alphaOnlyCooperatively(
  rgba: Uint8ClampedArray,
  options: CharacterRasterWorkOptions = {},
): Promise<Uint8ClampedArray> {
  assertRaster(rgba);
  checkWork(options);
  const output = new Uint8ClampedArray(rgba.length);
  await visitChunks(rgba.length / 4, CHUNK_PIXELS, (start, end) => {
    output.set(alphaOnly(rgba.subarray(start * 4, end * 4)), start * 4);
  }, options);
  return output;
}
