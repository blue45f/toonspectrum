/**
 * 팁 마스크 샘플링 규약(GPU `textureSampleLevel`과 같은 의미).
 * - nearest: round(lod) 레벨, 최근접 텍셀
 * - bilinear: round(lod) 레벨, 쌍선형
 * - trilinear: floor/ceil(lod) 두 레벨 쌍선형 후 선형 보간
 * - anisotropic: lod는 단축(minor) 기준 lod, 장축 방향으로 ratio 텍셀을 4탭(각 탭 trilinear)으로 평균
 */
import type { TipMask } from "./tip-generators";

export type SamplingFilter = "nearest" | "bilinear" | "trilinear" | "anisotropic";

export const SAMPLING_FILTERS: readonly SamplingFilter[] = [
  "nearest",
  "bilinear",
  "trilinear",
  "anisotropic",
];

/** 텍셀당 화면 px → mip 레벨(축소 시 양수). */
export function lodFor(pxPerTexel: number): number {
  if (!(pxPerTexel > 0)) return 0;
  const lod = -Math.log2(pxPerTexel);
  // −0(1:1)도 +0으로 돌려 해시·직렬화가 흔들리지 않게 한다.
  return lod <= 0 ? 0 : lod;
}

function texelNearest(mask: TipMask, u: number, v: number): number {
  const n = mask.size;
  const x = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  return mask.data[y * n + x] ?? 0;
}

function texelBilinear(mask: TipMask, u: number, v: number): number {
  const n = mask.size;
  if (n === 1) return mask.data[0] ?? 0;
  const fx = u * n - 0.5;
  const fy = v * n - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const cx0 = Math.min(n - 1, Math.max(0, x0));
  const cx1 = Math.min(n - 1, Math.max(0, x0 + 1));
  const cy0 = Math.min(n - 1, Math.max(0, y0));
  const cy1 = Math.min(n - 1, Math.max(0, y0 + 1));
  const a = mask.data[cy0 * n + cx0] ?? 0;
  const b = mask.data[cy0 * n + cx1] ?? 0;
  const c = mask.data[cy1 * n + cx0] ?? 0;
  const d = mask.data[cy1 * n + cx1] ?? 0;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function levelAt(chain: readonly TipMask[], level: number): TipMask {
  const idx = Math.min(chain.length - 1, Math.max(0, level));
  const mask = chain[idx];
  if (!mask) throw new RangeError("sampleMask: empty mip chain");
  return mask;
}

function sampleTrilinear(chain: readonly TipMask[], u: number, v: number, lod: number): number {
  const maxLod = chain.length - 1;
  const l = lod < 0 ? 0 : lod > maxLod ? maxLod : lod;
  const l0 = Math.floor(l);
  const l1 = Math.min(maxLod, l0 + 1);
  const t = l - l0;
  const a = texelBilinear(levelAt(chain, l0), u, v);
  if (t <= 0 || l1 === l0) return a;
  const b = texelBilinear(levelAt(chain, l1), u, v);
  return a + (b - a) * t;
}

/**
 * 마스크 샘플. u,v ∈ [0,1], 범위 밖은 0(팁 밖).
 * anisotropic은 `aniso` 방향(dirU, dirV: uv 공간 단위 벡터)으로 ratio 폭만큼 4탭 평균한다.
 */
export function sampleMask(
  chain: readonly TipMask[],
  u: number,
  v: number,
  lod: number,
  filter: SamplingFilter,
  aniso?: { dirU: number; dirV: number; ratio: number },
): number {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
  switch (filter) {
    case "nearest":
      return texelNearest(levelAt(chain, Math.round(lod)), u, v);
    case "bilinear":
      return texelBilinear(levelAt(chain, Math.round(lod)), u, v);
    case "trilinear":
      return sampleTrilinear(chain, u, v, lod);
    case "anisotropic": {
      if (!aniso || aniso.ratio <= 1) return sampleTrilinear(chain, u, v, lod);
      const ratio = Math.min(16, aniso.ratio);
      // GPU 규약: lod는 단축(minor) 기준 lod이고, 장축 발자국(= ratio 텍셀, 그 레벨 기준)을
      // 4탭이 -3/8..+3/8 구간으로 덮는다. 각 탭은 같은 lod의 trilinear 샘플이라
      // 장축 방향 고주파 에너지는 trilinear 이하, 단축 방향 선명도는 유지된다.
      const level = Math.max(0, Math.min(chain.length - 1, Math.floor(lod)));
      const base = levelAt(chain, level).size;
      const span = ratio / base;
      let sum = 0;
      for (let i = 0; i < 4; i += 1) {
        const o = (-0.375 + 0.25 * i) * span;
        const su = u + aniso.dirU * o;
        const sv = v + aniso.dirV * o;
        if (su < 0 || su >= 1 || sv < 0 || sv >= 1) continue;
        sum += sampleTrilinear(chain, su, sv, lod);
      }
      return sum / 4;
    }
  }
}
