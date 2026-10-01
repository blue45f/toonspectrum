import { generateTip } from "./tip-generators";

import type { TipMask, TipParams } from "./tip-generators";
import type { TipKind } from "../core/types";

/** box 필터 2×2 다운샘플. 1×1까지. 2의 거듭제곱이 아닌 크기는 경계 텍셀을 반복한다. */
export function buildMipChain(mask: TipMask): TipMask[] {
  const chain: TipMask[] = [mask];
  let cur = mask;
  while (cur.size > 1) {
    const n = cur.size;
    const m = Math.max(1, Math.floor(n / 2));
    const data = new Float32Array(m * m);
    for (let y = 0; y < m; y += 1) {
      const y0 = Math.min(n - 1, y * 2);
      const y1 = Math.min(n - 1, y * 2 + 1);
      for (let x = 0; x < m; x += 1) {
        const x0 = Math.min(n - 1, x * 2);
        const x1 = Math.min(n - 1, x * 2 + 1);
        const sum =
          (cur.data[y0 * n + x0] ?? 0) +
          (cur.data[y0 * n + x1] ?? 0) +
          (cur.data[y1 * n + x0] ?? 0) +
          (cur.data[y1 * n + x1] ?? 0);
        data[y * m + x] = Math.fround(sum * 0.25);
      }
    }
    cur = { size: m, data };
    chain.push(cur);
  }
  return chain;
}

export const TIP_KINDS_ORDERED: readonly TipKind[] = [
  "round",
  "flat",
  "bristle-strands",
  "texture-stamp",
  "noise",
  "hatch",
  "stipple",
  "particle",
];

const ATLAS_DEFAULT_PARAMS: TipParams = { hardness: 0.8, aspect: 1 };

export interface TipAtlas {
  /** r8 레벨 0 데이터(row-major, width·height). */
  data: Uint8Array;
  width: number;
  height: number;
  /** GPU가 생성해야 할 mip 레벨 수(log2(size)+1). */
  levels: number;
  layout: Record<TipKind, { x: number; y: number }>;
}

/**
 * 8종 팁을 가로로 이어붙인 r8 아틀라스. GPU 레인은 이 레벨 0을 업로드하고 mip을 생성한다.
 * 같은 seed·size면 바이트 동일.
 */
export function buildTipAtlas(size: number, seed: number): TipAtlas {
  const kinds = TIP_KINDS_ORDERED;
  const width = size * kinds.length;
  const height = size;
  const data = new Uint8Array(width * height);
  const layout = {} as Record<TipKind, { x: number; y: number }>;
  kinds.forEach((kind, i) => {
    const mask = generateTip(kind, size, seed, ATLAS_DEFAULT_PARAMS);
    const ox = i * size;
    layout[kind] = { x: ox, y: 0 };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        data[y * width + ox + x] = Math.round((mask.data[y * size + x] ?? 0) * 255);
      }
    }
  });
  return { data, width, height, levels: Math.floor(Math.log2(size)) + 1, layout };
}
