/**
 * tone-split: lit(조명) 패스를 flat(밑색) 기준으로 multiply 음영층과 screen 하이라이트층으로 분해한다.
 *   lit ≈ screen(multiply(flat, shade), highlight)   (채널별, 8bit sRGB — Photoshop/CSP 8bit 블렌드와 동일 공간)
 * 채널별 규칙(f=flat, l=lit, 0..1):
 *   l ≤ f → shade = l/f (f=0이면 0), highlight = 0
 *   l >  f → shade = 1,             highlight = (l−f)/(1−f) (f=1이면 0)
 * alpha: flat alpha>0인 픽셀은 두 층 모두 255(불투명 내부에서 정확히 재합성), 아니면 0.
 * 반투명 가장자리(0<α<255)는 레이어 알파 합성 때문에 근사이며 테스트는 불투명 픽셀 MAE ≤ 2/255를 검사한다.
 */
import type { CapturedRaster } from "../contracts";

export interface ToneSplit {
  readonly shade: CapturedRaster;
  readonly highlight: CapturedRaster;
}

function assertSameSize(a: CapturedRaster, b: CapturedRaster, what: string): void {
  if (a.width !== b.width || a.height !== b.height || a.rgba.length !== b.rgba.length) {
    throw new Error(`${what}: 래스터 크기가 다릅니다(${a.width}×${a.height} vs ${b.width}×${b.height}).`);
  }
}

/** 8bit multiply: round(b·s/255) */
export function multiplyByte(base: number, blend: number): number {
  return Math.round((base * blend) / 255);
}

/** 8bit screen: 255 − round((255−b)(255−s)/255) */
export function screenByte(base: number, blend: number): number {
  return 255 - Math.round(((255 - base) * (255 - blend)) / 255);
}

export function splitTones(flat: CapturedRaster, lit: CapturedRaster): ToneSplit {
  assertSameSize(flat, lit, "splitTones");
  const length = flat.rgba.length;
  const shade = new Uint8ClampedArray(length);
  const highlight = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i += 4) {
    const alpha = flat.rgba[i + 3] ?? 0;
    if (alpha === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const f = flat.rgba[i + c] ?? 0;
      const l = lit.rgba[i + c] ?? 0;
      if (l <= f) {
        shade[i + c] = f === 0 ? 0 : Math.round((l * 255) / f);
        highlight[i + c] = 0;
      } else {
        shade[i + c] = 255;
        highlight[i + c] = f >= 255 ? 0 : Math.round(((l - f) * 255) / (255 - f));
      }
    }
    shade[i + 3] = 255;
    highlight[i + 3] = 255;
  }
  return {
    shade: { width: flat.width, height: flat.height, rgba: shade },
    highlight: { width: flat.width, height: flat.height, rgba: highlight },
  };
}

/** 검증용 재합성: screen(multiply(flat, shade), highlight). alpha는 flat을 따른다. */
export function recompose(flat: CapturedRaster, shade: CapturedRaster, highlight: CapturedRaster): CapturedRaster {
  assertSameSize(flat, shade, "recompose(shade)");
  assertSameSize(flat, highlight, "recompose(highlight)");
  const out = new Uint8ClampedArray(flat.rgba.length);
  for (let i = 0; i < out.length; i += 4) {
    const alpha = flat.rgba[i + 3] ?? 0;
    if (alpha === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const shaded = (shade.rgba[i + 3] ?? 0) > 0 ? multiplyByte(flat.rgba[i + c] ?? 0, shade.rgba[i + c] ?? 0) : (flat.rgba[i + c] ?? 0);
      out[i + c] = (highlight.rgba[i + 3] ?? 0) > 0 ? screenByte(shaded, highlight.rgba[i + c] ?? 0) : shaded;
    }
    out[i + 3] = alpha;
  }
  return { width: flat.width, height: flat.height, rgba: out };
}

/** 불투명(α=255) 픽셀만의 RGB 평균 절대 오차(0..255). 해당 픽셀이 없으면 0. */
export function opaqueMae(a: CapturedRaster, b: CapturedRaster): number {
  assertSameSize(a, b, "opaqueMae");
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    if ((a.rgba[i + 3] ?? 0) !== 255 || (b.rgba[i + 3] ?? 0) !== 255) continue;
    for (let c = 0; c < 3; c += 1) sum += Math.abs((a.rgba[i + c] ?? 0) - (b.rgba[i + c] ?? 0));
    count += 3;
  }
  return count === 0 ? 0 : sum / count;
}
