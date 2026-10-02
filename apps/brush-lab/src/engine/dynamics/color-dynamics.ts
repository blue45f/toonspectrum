import { premultiply, srgbToLinear } from "../core/color";

import type { Pcg32 } from "../core/rng";
import type { Rgba } from "../core/types";

export interface ColorDynamicsSpec {
  /** 색상 지터(0..1, 1 = ±180°). */
  hueJitter: number;
  satJitter: number;
  valJitter: number;
  /** true면 dab마다, false면 획당 1회. */
  perDab: boolean;
  /** 합성 시 KM 혼색 사용(베타). */
  kmMixing: boolean;
}

export const NO_COLOR_DYNAMICS: ColorDynamicsSpec = {
  hueJitter: 0,
  satJitter: 0,
  valJitter: 0,
  perDab: false,
  kmMixing: false,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** sRGB → HSV(h 0..1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max > 1e-9 ? d / max : 0;
  return [h, s, max];
}

/** HSV(h 0..1) → sRGB. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 1) + 1) % 1;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/**
 * dab 색. 입력은 sRGB straight, 출력은 선형 premultiplied.
 * 지터 값과 무관하게 항상 난수 3개를 소비한다(수열 위치 고정).
 */
export function dabColor(
  base: Rgba,
  spec: ColorDynamicsSpec,
  rng: Pcg32,
): [number, number, number, number] {
  const u1 = rng.nextF32();
  const u2 = rng.nextF32();
  const u3 = rng.nextF32();
  let [r, g, b] = [base[0], base[1], base[2]];
  if (spec.hueJitter > 0 || spec.satJitter > 0 || spec.valJitter > 0) {
    const [h, s, v] = rgbToHsv(r, g, b);
    const h2 = h + (u1 * 2 - 1) * spec.hueJitter * 0.5;
    const s2 = clamp01(s + (u2 * 2 - 1) * spec.satJitter);
    const v2 = clamp01(v + (u3 * 2 - 1) * spec.valJitter);
    [r, g, b] = hsvToRgb(h2, s2, v2);
  }
  return premultiply([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), clamp01(base[3])]);
}
