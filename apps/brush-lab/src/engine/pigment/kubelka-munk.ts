/**
 * Kubelka-Munk 2-flux 자체 구현(베타). Haase & Meyer 1992의 공개 수식만 쓰며
 * mixbox(CC BY-NC) 코드·계수·LUT를 포함하지 않는다. 3채널(선형 RGB 반사율) 근사.
 */

const f = Math.fround;
const R_MIN = 1e-4;

export interface KS {
  k: [number, number, number];
  s: [number, number, number];
}

function clampR(R: number): number {
  return R < R_MIN ? R_MIN : R > 1 ? 1 : R;
}

/** F(R) = (1 − R)² / (2R), R ∈ [1e-4, 1]. */
export function reflectanceToKsRatio(R: number): number {
  const r = clampR(R);
  return f(((1 - r) * (1 - r)) / (2 * r));
}

/** R∞ = 1 + q − √(q(q + 2)). */
export function ksRatioToReflectance(q: number): number {
  const qq = q < 0 ? 0 : q;
  return f(clampR(1 + qq - Math.sqrt(qq * (qq + 2))));
}

/** 질량 가중 K, S 선형 혼합. */
export function mixKs(a: KS, b: KS, wa: number, wb: number): KS {
  const total = wa + wb;
  const na = total > 0 ? wa / total : 0.5;
  const nb = total > 0 ? wb / total : 0.5;
  return {
    k: [f(a.k[0] * na + b.k[0] * nb), f(a.k[1] * na + b.k[1] * nb), f(a.k[2] * na + b.k[2] * nb)],
    s: [f(a.s[0] * na + b.s[0] * nb), f(a.s[1] * na + b.s[1] * nb), f(a.s[2] * na + b.s[2] * nb)],
  };
}

/** K/S → 무한 두께 반사율(채널별). */
export function ksToReflectance(ks: KS): [number, number, number] {
  const q = (i: 0 | 1 | 2): number => (ks.s[i] > 0 ? ks.k[i] / ks.s[i] : 1e6);
  return [ksRatioToReflectance(q(0)), ksRatioToReflectance(q(1)), ksRatioToReflectance(q(2))];
}

/**
 * 유한 두께 층의 반사율 R과 투과율 T.
 * a = 1 + k/s, b = √(a² − 1): R = sinh(bsx)/(a·sinh(bsx) + b·cosh(bsx)), T = b/(…).
 * 극한: s → 0(순수 흡수체) R = 0, T = e^(−kx); k → 0(순수 산란체) R = sx/(1 + sx), T = 1/(1 + sx).
 */
export function finiteLayer(k: number, s: number, thickness: number): { R: number; T: number } {
  const x = thickness < 0 ? 0 : thickness;
  if (x === 0) return { R: 0, T: 1 };
  if (!Number.isFinite(x)) {
    if (s <= 0) return { R: 0, T: 0 };
    const q = k / s;
    return { R: ksRatioToReflectance(q), T: 0 };
  }
  if (s <= 1e-9) {
    return { R: 0, T: f(Math.exp(-k * x)) };
  }
  if (k <= 1e-9) {
    const sx = s * x;
    return { R: f(sx / (1 + sx)), T: f(1 / (1 + sx)) };
  }
  const a = 1 + k / s;
  const b = Math.sqrt(a * a - 1);
  const arg = b * s * x;
  if (arg > 40) {
    return { R: ksRatioToReflectance(k / s), T: 0 };
  }
  const sh = Math.sinh(arg);
  const ch = Math.cosh(arg);
  const denom = a * sh + b * ch;
  return { R: f(sh / denom), T: f(b / denom) };
}

/** 배경 반사율 B 위의 층: R + T²B/(1 − RB). */
export function overSubstrate(R: number, T: number, B: number): number {
  const denom = 1 - R * B;
  return f(R + (T * T * B) / (denom > 1e-6 ? denom : 1e-6));
}

/**
 * 채널별 F(R) 공간 선형 혼합 후 역변환 — WGSL `km_mix` 미러.
 * a, b는 선형 반사율, t는 b의 비율.
 */
export function kmMixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const mix = (ra: number, rb: number): number =>
    ksRatioToReflectance(f(reflectanceToKsRatio(ra) * (1 - tt) + reflectanceToKsRatio(rb) * tt));
  return [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])];
}
