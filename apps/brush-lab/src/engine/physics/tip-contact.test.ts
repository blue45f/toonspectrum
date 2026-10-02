import { describe, expect, it } from "vitest";

import {
  applyHysteresis,
  createTipContactState,
  feltRadius,
  hertzRadius,
  stepTipContact,
} from "./tip-contact";

/** 단순 선형 회귀 R². */
function r2(xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  return { slope, r2: (sxy * sxy) / (sxx * syy) };
}

describe("탄성 팁 접촉", () => {
  it("Hertz: log r vs log p 회귀 R² > 0.999, 기울기 1/n, p = 0.125 → r0/2", () => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i <= 100; i += 1) {
      const p = i / 100;
      xs.push(Math.log(p));
      ys.push(Math.log(hertzRadius(p, 10, 1, 3)));
    }
    const fit = r2(xs, ys);
    expect(fit.r2).toBeGreaterThan(0.999);
    expect(fit.slope).toBeCloseTo(1 / 3, 3);
    expect(hertzRadius(0.125, 10, 1, 3)).toBeCloseTo(5, 4);
    expect(hertzRadius(0.0625, 10, 1, 4)).toBeCloseTo(5, 4);
    // 압력 0도 최소 접촉(1e-3)으로 반경 > 0
    expect(hertzRadius(0, 10, 1, 3)).toBeGreaterThan(0);
    expect(hertzRadius(0.5, 10)).toBeCloseTo(10, 4);
  });

  it("felt: p = 1에서 포화(r0), 그 이상은 clamp, p = 0에서 r0/(1 + k), 단조", () => {
    expect(feltRadius(1, 8, 1.5)).toBeCloseTo(8, 5);
    expect(feltRadius(1.5, 8, 1.5)).toBe(feltRadius(1, 8, 1.5));
    expect(feltRadius(0, 8, 1.5)).toBeCloseTo(8 / 2.5, 5);
    let prev = 0;
    for (let i = 0; i <= 50; i += 1) {
      const r = feltRadius(i / 50, 8);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("히스테리시스: 상승 τ=12 ms, 하강 τ=40 ms에서 1−e⁻¹ 응답", () => {
    const state = createTipContactState();
    expect(applyHysteresis(state, 0, 1, 12, 40)).toBe(0); // 초기화
    const up = applyHysteresis(state, 10, 12, 12, 40);
    expect(up).toBeCloseTo(10 * (1 - Math.exp(-1)), 4);
    // 정상 상태로 끌어올린 뒤 하강
    for (let i = 0; i < 100; i += 1) applyHysteresis(state, 10, 12, 12, 40);
    const down = applyHysteresis(state, 0, 40, 12, 40);
    expect(down).toBeCloseTo(10 * Math.exp(-1), 3);
    // 하강이 상승보다 느리다(같은 dt에서 남은 거리 비율이 더 크다)
    const s1 = createTipContactState();
    applyHysteresis(s1, 0, 1, 12, 40);
    const riseFrac = applyHysteresis(s1, 10, 10, 12, 40) / 10;
    const s2 = createTipContactState();
    applyHysteresis(s2, 10, 1, 12, 40);
    const fallFrac = 1 - applyHysteresis(s2, 0, 10, 12, 40) / 10;
    expect(riseFrac).toBeGreaterThan(fallFrac);
  });

  it("삼각파 압력에서 하강 폭 > 상승 폭(이력 루프)이고 상태는 f32", () => {
    const state = createTipContactState();
    const spec = { baseRadius: 10, exponent: 3, p0: 0.5, feltK: 1.5, hysteresisUpMs: 12, hysteresisDownMs: 40, model: "hertz" as const };
    const dt = 1000 / 240;
    const rise: number[] = [];
    const fall: number[] = [];
    const n = 120;
    for (let i = 0; i <= n; i += 1) rise.push(stepTipContact(state, { pressure: i / n }, dt, spec).rx);
    for (let i = n; i >= 0; i -= 1) fall.push(stepTipContact(state, { pressure: i / n }, dt, spec).rx);
    fall.reverse();
    let loop = 0;
    for (let i = 0; i <= n; i += 1) loop += (fall[i] ?? 0) - (rise[i] ?? 0);
    expect(loop).toBeGreaterThan(0);
    expect(state.data[0]).toBe(Math.fround(state.data[0] ?? 0));
  });
});
