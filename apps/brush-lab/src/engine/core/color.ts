import type { LabImage } from "./types";

/**
 * 색 공간 변환. 모든 수식은 WGSL `srgb_to_linear`/`linear_to_srgb`와 같은 식을 쓰고
 * `Math.fround`로 f32 경계에 맞춘다.
 */

const f = Math.fround;

/** sRGB 전달 함수 역변환(0..1 → 선형 0..1). */
export function srgbToLinear(c: number): number {
  const x = c < 0 ? 0 : c > 1 ? 1 : c;
  if (x <= 0.04045) return f(x / 12.92);
  return f(Math.pow(f((x + 0.055) / 1.055), 2.4));
}

/** 선형 → sRGB 전달 함수(0..1). */
export function linearToSrgb(c: number): number {
  const x = c < 0 ? 0 : c > 1 ? 1 : c;
  if (x <= 0.0031308) return f(x * 12.92);
  return f(1.055 * Math.pow(x, 1 / 2.4) - 0.055);
}

/** straight → premultiplied. */
export function premultiply(
  rgba: readonly [number, number, number, number],
): [number, number, number, number] {
  const a = rgba[3];
  return [f(rgba[0] * a), f(rgba[1] * a), f(rgba[2] * a), a];
}

/** premultiplied → straight. a = 0이면 색 채널 0. */
export function unpremultiply(
  rgba: readonly [number, number, number, number],
): [number, number, number, number] {
  const a = rgba[3];
  if (a <= 0) return [0, 0, 0, 0];
  return [f(rgba[0] / a), f(rgba[1] / a), f(rgba[2] / a), a];
}

/**
 * 선형 premultiplied f32 버퍼(width·height·4)를 sRGB straight RGBA8로 인코딩한다.
 * 알파는 선형 그대로 양자화하고 색은 unpremultiply 후 전달 함수를 적용한다.
 */
export function encodeLabImage(linearPremul: Float32Array, width: number, height: number): LabImage {
  const pixels = width * height;
  if (linearPremul.length < pixels * 4) {
    throw new RangeError(
      `encodeLabImage: buffer has ${linearPremul.length} floats, need ${pixels * 4}`,
    );
  }
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const a = linearPremul[o + 3] ?? 0;
    const alpha = a < 0 ? 0 : a > 1 ? 1 : a;
    if (alpha <= 0) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
      continue;
    }
    const inv = 1 / alpha;
    data[o] = Math.round(linearToSrgb((linearPremul[o] ?? 0) * inv) * 255);
    data[o + 1] = Math.round(linearToSrgb((linearPremul[o + 1] ?? 0) * inv) * 255);
    data[o + 2] = Math.round(linearToSrgb((linearPremul[o + 2] ?? 0) * inv) * 255);
    data[o + 3] = Math.round(alpha * 255);
  }
  return { width, height, data };
}

/** D65 기준 선형 sRGB → CIE XYZ. */
function linearToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

const LAB_EPS = 216 / 24389;
const LAB_K = 24389 / 27;

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
}

/** 선형 sRGB(0..1) → CIE L*a*b*(D65). */
export function linearToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = linearToXyz(r, g, b);
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.0);
  const fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 색차. */
export function deltaE76(
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number],
): number {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** sRGB straight RGBA → 선형 premultiplied RGBA(dab 색 규약). */
export function srgbStraightToLinearPremul(
  rgba: readonly [number, number, number, number],
): [number, number, number, number] {
  return premultiply([srgbToLinear(rgba[0]), srgbToLinear(rgba[1]), srgbToLinear(rgba[2]), rgba[3]]);
}
