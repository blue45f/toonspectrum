/**
 * readback 바이트를 캡처 규약(contracts/capture.ts: top-down, straight alpha, sRGB 8bit)으로 바꾼다.
 * flipY·premultiplied는 backend별 상수(render가 결정)이며 여기서는 옵션으로만 받는다.
 * 길이가 맞지 않으면 throw한다(무음 손상 금지).
 */
import { decodeIdPixel } from "../contracts";
import { flipRowsInPlace, premultiply, unpremultiply } from "../shared/typed-array";

import type { CapturedDepth, CapturedRaster } from "../contracts";

export { premultiply, unpremultiply };

export interface RasterConvertOptions {
  /** 입력이 bottom-up 행 순서이면 true */
  readonly flipY: boolean;
  /** 입력이 premultiplied alpha이면 true */
  readonly premultiplied: boolean;
}

function assertLength(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new Error(`${what}: 길이 ${actual}가 기대값 ${expected}와 다릅니다.`);
  }
}

/** 복사본을 만들어 top-down·straight로 바꾼다(입력은 변경하지 않는다). */
export function toTopDownStraight(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, options: RasterConvertOptions): Uint8ClampedArray {
  assertLength(rgba.length, width * height * 4, "toTopDownStraight");
  const out = new Uint8ClampedArray(rgba);
  if (options.flipY) flipRowsInPlace(out, width, height, 4);
  if (options.premultiplied) unpremultiply(out);
  return out;
}

export function toCapturedRaster(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, options: RasterConvertOptions): CapturedRaster {
  return { width, height, rgba: toTopDownStraight(rgba, width, height, options) };
}

/** 캡처 규약 래스터를 premultiplied(선택 bottom-up)로 되돌린다(업로드·비교용, 복사본). */
export function fromTopDownStraight(raster: CapturedRaster, options: RasterConvertOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(raster.rgba);
  if (options.premultiplied) premultiply(out);
  if (options.flipY) flipRowsInPlace(out, raster.width, raster.height, 4);
  return out;
}

/** ID 패스(R=partId&255, G=partId>>8) → 픽셀별 partId. alpha 0이면 0(배경). */
export function decodeIdPass(rgba: ArrayLike<number>, width?: number, height?: number): Uint16Array {
  if (rgba.length % 4 !== 0) throw new Error(`decodeIdPass: 길이 ${rgba.length}가 4의 배수가 아닙니다.`);
  if (width !== undefined && height !== undefined) assertLength(rgba.length, width * height * 4, "decodeIdPass");
  const out = new Uint16Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    if ((rgba[i + 3] ?? 0) === 0) continue;
    out[p] = decodeIdPixel(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0).partId;
  }
  return out;
}

/** ID 패스 → 픽셀별 materialId(B). alpha 0이면 0. */
export function decodeMaterialIdPass(rgba: ArrayLike<number>): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error(`decodeMaterialIdPass: 길이 ${rgba.length}가 4의 배수가 아닙니다.`);
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    if ((rgba[i + 3] ?? 0) === 0) continue;
    out[p] = rgba[i + 2] ?? 0;
  }
  return out;
}

export type DepthEncoding =
  /** Float32Array 그대로(0=near..1=far 선형) */
  | "f32"
  /** RGBA8의 R 채널 / 255 */
  | "r8"
  /** R + G/256 + B/65536 + A/16777216 (24~32bit 고정소수 패킹) */
  | "rgba-packed";

export interface DecodeDepthOptions {
  readonly near: number;
  readonly far: number;
  readonly flipY: boolean;
  readonly encoding?: DepthEncoding;
}

/**
 * depth readback → CapturedDepth(0..1 클램프). Float32Array는 복사 후 선택 flip, RGBA8은 encoding대로 디코드.
 */
export function decodeDepth(source: Float32Array | Uint8Array | Uint8ClampedArray, width: number, height: number, options: DecodeDepthOptions): CapturedDepth {
  const pixels = width * height;
  let depth: Float32Array;
  if (source instanceof Float32Array) {
    assertLength(source.length, pixels, "decodeDepth(f32)");
    depth = new Float32Array(source);
    for (let i = 0; i < depth.length; i += 1) {
      const value = depth[i] ?? 0;
      depth[i] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    }
  } else {
    const encoding = options.encoding ?? "r8";
    if (encoding === "f32") throw new Error("decodeDepth: RGBA8 입력에는 encoding 'f32'를 쓸 수 없습니다.");
    assertLength(source.length, pixels * 4, "decodeDepth(rgba)");
    depth = new Float32Array(pixels);
    for (let p = 0; p < pixels; p += 1) {
      const i = p * 4;
      depth[p] =
        encoding === "r8"
          ? (source[i] ?? 0) / 255
          : Math.min(1, (source[i] ?? 0) / 255 + (source[i + 1] ?? 0) / 65280 + (source[i + 2] ?? 0) / 16711680 + (source[i + 3] ?? 0) / 4278190080);
    }
  }
  if (options.flipY) flipRowsInPlace(depth, width, height, 1);
  return { width, height, depth, near: options.near, far: options.far };
}
