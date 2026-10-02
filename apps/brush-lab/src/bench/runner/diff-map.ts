import { deltaE76 } from "../../engine/core/color";
import { imageToLab } from "../metrics/lab-math";

import type { LabImage } from "../../engine/core/types";

/**
 * ΔE diff heatmap. 두 LabImage를 흰 배경 위에 합성한 CIE L*a*b* 차(CIE76)를 픽셀마다 구해
 * 색상 램프(검정→파랑→청록→노랑→빨강)로 표시한다. 크기가 다르면 RangeError.
 */

/** 램프 상한 ΔE(이 값 이상은 빨강). */
export const DIFF_RAMP_MAX_DELTA_E = 10;

export function deltaEMap(a: LabImage, b: LabImage): Float32Array {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(`deltaEMap: size mismatch ${a.width}×${a.height} vs ${b.width}×${b.height}`);
  }
  const n = a.width * a.height;
  const la = imageToLab(a);
  const lb = imageToLab(b);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 3;
    out[i] = deltaE76(
      [la[o] ?? 0, la[o + 1] ?? 0, la[o + 2] ?? 0],
      [lb[o] ?? 0, lb[o + 1] ?? 0, lb[o + 2] ?? 0],
    );
  }
  return out;
}

const RAMP: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [32, 64, 255],
  [0, 220, 220],
  [255, 230, 0],
  [255, 32, 0],
];

/** t ∈ [0, 1] → sRGB 램프 색(0..255). */
export function heatRamp(t: number): [number, number, number] {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const pos = u * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(pos));
  const f = pos - i;
  const c0 = RAMP[i] ?? [0, 0, 0];
  const c1 = RAMP[i + 1] ?? c0;
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
  ];
}

export interface DiffHeatmapOptions {
  /** 램프 상한 ΔE. 기본 10. */
  maxDeltaE?: number;
}

/** ΔE 히트맵 이미지(불투명). */
export function diffHeatmap(a: LabImage, b: LabImage, opts: DiffHeatmapOptions = {}): LabImage {
  const maxDe = opts.maxDeltaE ?? DIFF_RAMP_MAX_DELTA_E;
  if (!(maxDe > 0)) throw new RangeError(`diffHeatmap: maxDeltaE must be > 0, got ${maxDe}`);
  const map = deltaEMap(a, b);
  const data = new Uint8ClampedArray(map.length * 4);
  for (let i = 0; i < map.length; i += 1) {
    const [r, g, bl] = heatRamp((map[i] ?? 0) / maxDe);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = bl;
    data[o + 3] = 255;
  }
  return { width: a.width, height: a.height, data };
}
