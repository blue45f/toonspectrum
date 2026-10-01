/**
 * [0,1] 균등 LUT 곡선. `studio-project-model`의 `evaluateDynamicMapping`과 같은 규약
 * (입력 clamp, 구간 선형 보간)이며 import 없이 재구현한다.
 */
export type Curve = readonly number[];

/** t ∈ [0,1]에서 곡선 값. 빈 곡선은 0, 길이 1은 상수. */
export function evalCurve(curve: Curve, t: number): number {
  const n = curve.length;
  if (n === 0) return 0;
  if (n === 1) return curve[0] ?? 0;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (n - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(n - 1, lower + 1);
  const frac = scaled - lower;
  const lo = curve[lower] ?? 0;
  const hi = curve[upper] ?? lo;
  return lo + (hi - lo) * frac;
}

/** 비감소(단조) 여부. */
export function isMonotonic(curve: Curve): boolean {
  for (let i = 1; i < curve.length; i += 1) {
    if ((curve[i] ?? 0) < (curve[i - 1] ?? 0)) return false;
  }
  return true;
}

/** 항등 곡선(n개 점). */
export function linearCurve(points = 2): Curve {
  const n = Math.max(2, Math.floor(points));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(i / (n - 1));
  return out;
}

/** 감마 곡선 t^gamma. */
export function gammaCurve(gamma: number, points = 9): Curve {
  const n = Math.max(2, Math.floor(points));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(Math.pow(i / (n - 1), gamma));
  return out;
}

/** smoothstep 곡선(에지 전이용). */
export function smoothstepCurve(points = 9): Curve {
  const n = Math.max(2, Math.floor(points));
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    out.push(t * t * (3 - 2 * t));
  }
  return out;
}
