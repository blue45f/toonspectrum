/**
 * 래스터 fixture와 비교 유틸. 규약: straight alpha, top-down, RGBA8.
 */
import { CAPTURE_PROFILE_ID, encodeIdPixel } from "../contracts";
import { meanAbsoluteError } from "../shared/typed-array";

import type { CaptureResult, CapturedDepth, CapturedRaster, PartIdPalette, RasterPassId } from "../contracts";

export type Rgba = readonly [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];
export const OPAQUE_WHITE: Rgba = [255, 255, 255, 255];
export const OPAQUE_BLACK: Rgba = [0, 0, 0, 255];

export function fillRaster(width: number, height: number, fill: (x: number, y: number) => Rgba): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = fill(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
  return { width, height, rgba };
}

export function solidRaster(width: number, height: number, color: Rgba): CapturedRaster {
  return fillRaster(width, height, () => color);
}

export function checkerRaster(width: number, height: number, cell: number, a: Rgba, b: Rgba): CapturedRaster {
  return fillRaster(width, height, (x, y) => ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? a : b));
}

/** 원(중심 cx,cy 반지름 r) 안은 color, 밖은 background */
export function circleRaster(width: number, height: number, cx: number, cy: number, r: number, color: Rgba, background: Rgba = TRANSPARENT): CapturedRaster {
  return fillRaster(width, height, (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= r * r ? color : background;
  });
}

export function rectRaster(width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: Rgba, background: Rgba = TRANSPARENT): CapturedRaster {
  return fillRaster(width, height, (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? color : background));
}

/** 왼쪽 0 → 오른쪽 255 수평 그라디언트(불투명) */
export function gradientRaster(width: number, height: number): CapturedRaster {
  return fillRaster(width, height, (x) => {
    const v = width <= 1 ? 0 : Math.round((x / (width - 1)) * 255);
    return [v, v, v, 255];
  });
}

/** y가 커질수록 깊어지는 램프(0..1) */
export function depthRampFixture(width: number, height: number, near = 0.1, far = 10): CapturedDepth {
  const depth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) depth[y * width + x] = height <= 1 ? 0 : y / (height - 1);
  }
  return { width, height, depth, near, far };
}

/** 깊이 계단: 왼쪽 반 0.2, 오른쪽 반 0.8 */
export function depthStepFixture(width: number, height: number): CapturedDepth {
  const depth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) depth[y * width + x] = x < width / 2 ? 0.2 : 0.8;
  }
  return { width, height, depth, near: 0.1, far: 10 };
}

/** ID 패스 래스터(R=partId&255, G=partId>>8, B=materialId, A=255; partId 0은 투명) */
export function idPassRaster(width: number, height: number, partIdAt: (x: number, y: number) => number, materialId = 0): CapturedRaster {
  return fillRaster(width, height, (x, y) => {
    const partId = partIdAt(x, y);
    return partId === 0 ? TRANSPARENT : encodeIdPixel(partId, materialId);
  });
}

export function pixelAt(raster: CapturedRaster, x: number, y: number): Rgba {
  const i = (y * raster.width + x) * 4;
  return [raster.rgba[i] ?? 0, raster.rgba[i + 1] ?? 0, raster.rgba[i + 2] ?? 0, raster.rgba[i + 3] ?? 0];
}

export function rasterEquals(a: CapturedRaster, b: CapturedRaster): boolean {
  if (a.width !== b.width || a.height !== b.height || a.rgba.length !== b.rgba.length) return false;
  for (let i = 0; i < a.rgba.length; i += 1) if (a.rgba[i] !== b.rgba[i]) return false;
  return true;
}

/** 평균 절대 오차(0..255). 크기가 다르면 Infinity */
export function rasterMae(a: CapturedRaster, b: CapturedRaster): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  return meanAbsoluteError(a.rgba, b.rgba);
}

export function cloneRaster(raster: CapturedRaster): CapturedRaster {
  return { width: raster.width, height: raster.height, rgba: new Uint8ClampedArray(raster.rgba) };
}

export interface CaptureResultFixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly passes?: Partial<Record<RasterPassId, CapturedRaster>>;
  readonly depth?: CapturedDepth;
  readonly partIdPalette?: PartIdPalette;
  readonly recipeDigest?: string;
}

/** 원 하나가 있는 기본 캡처 결과(flat·lit·part-id + depth) */
export function captureResultFixture(options: CaptureResultFixtureOptions = {}): CaptureResult {
  const width = options.width ?? 16;
  const height = options.height ?? 16;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 3;
  const passes: Partial<Record<RasterPassId, CapturedRaster>> = options.passes ?? {
    flat: circleRaster(width, height, cx, cy, r, [200, 150, 120, 255]),
    lit: circleRaster(width, height, cx, cy, r, [160, 120, 96, 255]),
    "part-id": idPassRaster(width, height, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      return dx * dx + dy * dy <= r * r ? 1 : 0;
    }),
  };
  return {
    profile: CAPTURE_PROFILE_ID,
    width,
    height,
    passes,
    depth: options.depth ?? depthRampFixture(width, height),
    partIdPalette: options.partIdPalette ?? { 1: { role: "skin", labelKo: "피부" } },
    provenance: {
      backend: "null",
      synthetic: true,
      physicsProvider: "builtin-pbd",
      settleSteps: 0,
      recipeDigest: options.recipeDigest ?? "fixture",
    },
  };
}
