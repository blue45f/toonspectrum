/**
 * RTT readback 규약 상수·깊이 패킹 참조 구현·NullEngine용 합성 래스터.
 *
 * 실제 바이트 변환은 export/raster-convert.ts의 `toTopDownStraight`/`decodeDepth`를 쓴다(export-paint 계약).
 * backend별 행 순서/premultiply 상수는 브라우저 검증 항목이다(docs/parity/render.md).
 * apps/web Babylon 출력 경로 실측(2026-09-12 보고서): RTT readback은 WebGL2·WebGPU 모두 bottom-up.
 */
import { CAPTURE_PROFILE_ID, encodeIdPixel } from "../contracts";

import type { CapturedDepth, CapturedRaster, EngineBackend, RasterPassId } from "../contracts";

export type ReadbackLane = EngineBackend | "null";

/** RTT 색 readback 행 순서(true = bottom-up이라 뒤집어야 top-down) — 브라우저 미검증 상수 */
export const RTT_READBACK_FLIP_Y: Readonly<Record<ReadbackLane, boolean>> = Object.freeze({ webgl2: true, webgpu: true, null: false });

/** RTT 색 readback이 premultiplied인지(투명 clear + 알파 블렌딩 결과) — 브라우저 미검증 상수 */
export const RTT_READBACK_PREMULTIPLIED: Readonly<Record<ReadbackLane, boolean>> = Object.freeze({ webgl2: true, webgpu: true, null: false });

/**
 * 깊이 패스 인코딩: 선형 깊이 d∈[0,1]을 RGBA8 4채널 고정소수로 패킹한다(셰이더와 같은 식, 24+8bit).
 * `d·255 = R + G/256 + B/65536 + A/16777216` 이므로 export/raster-convert `decodeDepth(..., { encoding: "rgba-packed" })`와
 * 정확히 역함수다. 배경(clear)은 `packDepthRgba8(1)` = [255,0,0,0].
 */
export function packDepthRgba8(depth01: number): readonly [number, number, number, number] {
  const d = Number.isFinite(depth01) ? Math.min(1, Math.max(0, depth01)) : 1;
  const x = d * 255;
  const r = Math.floor(x);
  const f1 = x - r;
  const g = Math.floor(f1 * 256);
  const f2 = f1 * 256 - g;
  const b = Math.floor(f2 * 256);
  const f3 = f2 * 256 - b;
  const a = Math.min(255, Math.floor(f3 * 256));
  return [r, Math.min(255, g), Math.min(255, b), a];
}

/** 깊이 RTT clear 색(선형 0..1): 배경 = far(1) */
export const DEPTH_CLEAR_RGBA01: readonly [number, number, number, number] = Object.freeze([1, 0, 0, 0] as const);

// ---------------------------------------------------------------- 합성 래스터(NullEngine 등 readback 불가 레인)

export interface SyntheticBox {
  readonly partId: number;
  readonly materialId: number;
  /** 픽셀 사각형(top-down, x1/y1 exclusive) */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** 0=near..1=far */
  readonly depth01: number;
  /** sRGB 0..255 */
  readonly color: readonly [number, number, number];
  /** 월드 법선(단위) */
  readonly normal: readonly [number, number, number];
}

function clampBox(box: SyntheticBox, width: number, height: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  const y1 = Math.min(height, Math.ceil(box.y1));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

function syntheticPixel(pass: RasterPassId, box: SyntheticBox): readonly [number, number, number, number] {
  switch (pass) {
    case "flat":
      return [box.color[0], box.color[1], box.color[2], 255];
    case "lit": {
      const shade = 0.55 + 0.45 * Math.max(0, box.normal[1]);
      return [Math.round(box.color[0] * shade), Math.round(box.color[1] * shade), Math.round(box.color[2] * shade), 255];
    }
    case "normal":
      return [Math.round((box.normal[0] * 0.5 + 0.5) * 255), Math.round((box.normal[1] * 0.5 + 0.5) * 255), Math.round((box.normal[2] * 0.5 + 0.5) * 255), 255];
    case "part-id":
      return encodeIdPixel(box.partId, box.materialId);
    case "material-id":
      return encodeIdPixel(box.partId, box.materialId);
    default:
      return [0, 0, 0, 0];
  }
}

/** 상자를 먼 것부터 칠하는 painter 합성(결정적). readback 불가 레인의 provenance.synthetic=true 결과. */
export function rasterizeSyntheticPass(pass: RasterPassId, width: number, height: number, boxes: readonly SyntheticBox[]): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const ordered = [...boxes].sort((a, b) => b.depth01 - a.depth01);
  for (const box of ordered) {
    const rect = clampBox(box, width, height);
    if (!rect) continue;
    const pixel = syntheticPixel(pass, box);
    for (let y = rect.y0; y < rect.y1; y += 1) {
      for (let x = rect.x0; x < rect.x1; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = pixel[0];
        rgba[i + 1] = pixel[1];
        rgba[i + 2] = pixel[2];
        rgba[i + 3] = pixel[3];
      }
    }
  }
  return { width, height, rgba };
}

export function rasterizeSyntheticDepth(width: number, height: number, boxes: readonly SyntheticBox[], near: number, far: number): CapturedDepth {
  const depth = new Float32Array(width * height).fill(1);
  const ordered = [...boxes].sort((a, b) => b.depth01 - a.depth01);
  for (const box of ordered) {
    const rect = clampBox(box, width, height);
    if (!rect) continue;
    const value = Math.min(1, Math.max(0, box.depth01));
    for (let y = rect.y0; y < rect.y1; y += 1) {
      for (let x = rect.x0; x < rect.x1; x += 1) depth[y * width + x] = value;
    }
  }
  return { width, height, depth, near, far };
}

export { CAPTURE_PROFILE_ID };
