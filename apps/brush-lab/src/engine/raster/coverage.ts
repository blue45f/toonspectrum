import type { DabInstance } from "../core/types";

/**
 * 해석적 커버리지(WGSL `superellipse_coverage` 미러).
 *
 * rmin > 0.5 px:
 *   (u, v) = 회전 역변환(dx, dy); dn = (|u/rx|^n + |v/ry|^n)^(1/n); dpx = (dn − 1)·rmin
 *   feather = max(1, (1 − hardness)·rmin); cov = clamp((−dpx + 0.5)/feather, 0, 1)
 *   → hardness 1이면 가장자리 ±0.5 px에서 1 px 폭 선형 전이.
 * rmin ≤ 0.5 px(서브픽셀 dab):
 *   면적 A = min(1, π·rx·ry)를 쌍선형 커널 (1−|dx|)⁺(1−|dy|)⁺로 뿌린다. 격자 합이 위치와 무관하게 A라
 *   잉크량이 보존된다(반경 0.5 px 원의 합 = π/4).
 * airbrush 도포는 경도 대신 가우시안 밀도 exp(−2·dn²)를 쓴다.
 */

const f = Math.fround;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 서브픽셀 경계. */
export const SUBPIXEL_RADIUS = 0.5;

/**
 * 곡률 보정 κ/24. 반평면 램프는 가장자리 호가 현(弦)보다 안쪽으로 휘는 만큼(픽셀당 κ/24)
 * 면적을 과대 평가하므로, 거리를 1/(24·rmin)만큼 바깥으로 밀어 둘레 전체에서 π/12 px²를 뺀다.
 * r = 4에서 적분 오차 0.6% → 0.1%. WGSL `superellipse_coverage`도 같은 항을 가진다.
 */
export const CURVATURE_AA_CORRECTION = 1 / 24;

/** 회전 역변환 후 정규화 거리 dn. */
export function normalizedDistance(dx: number, dy: number, dab: DabInstance): number {
  const c = Math.cos(dab.angle);
  const s = Math.sin(dab.angle);
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  const n = dab.shapeExp;
  const au = Math.abs(u / dab.rx);
  const av = Math.abs(v / dab.ry);
  if (n === 2) return f(Math.sqrt(au * au + av * av));
  return f(Math.pow(Math.pow(au, n) + Math.pow(av, n), 1 / n));
}

export function superellipseCoverage(dx: number, dy: number, dab: DabInstance): number {
  const rmin = Math.min(dab.rx, dab.ry);
  if (rmin <= 0) return 0;
  if (rmin <= SUBPIXEL_RADIUS) {
    const area = Math.min(1, Math.PI * dab.rx * dab.ry);
    const kx = 1 - Math.abs(dx);
    const ky = 1 - Math.abs(dy);
    if (kx <= 0 || ky <= 0) return 0;
    return f(area * kx * ky);
  }
  const dn = normalizedDistance(dx, dy, dab);
  if (dab.deposition === "airbrush") {
    return f(Math.exp(-2 * dn * dn));
  }
  const dpx = f((dn - 1) * rmin + CURVATURE_AA_CORRECTION / rmin);
  const feather = Math.max(1, (1 - dab.hardness) * rmin);
  return f(clamp01((-dpx + 0.5) / feather));
}
