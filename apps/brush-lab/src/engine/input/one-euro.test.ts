import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";

import { OneEuroFilter } from "./one-euro";

const DT = 1000 / 240;

function rms(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v * v;
  return Math.sqrt(s / Math.max(1, values.length));
}

describe("1€ 필터", () => {
  it("정지 입력은 그대로 통과하고 수렴한다", () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    for (let i = 0; i < 100; i += 1) expect(f.filter(42, i * DT)).toBe(42);
    expect(f.current()).toBe(42);
  });

  it("계단 입력에서 오버슈트가 없고 단조로 수렴한다", () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    f.filter(0, 0);
    let prev = 0;
    let last = 0;
    for (let i = 1; i <= 480; i += 1) {
      last = f.filter(100, i * DT);
      expect(last).toBeGreaterThanOrEqual(prev);
      expect(last).toBeLessThanOrEqual(100);
      prev = last;
    }
    expect(last).toBeGreaterThan(99);
  });

  it("느린 사인파 + 떨림에서 떨림 성분의 RMS가 절반 이하로 줄어든다", () => {
    // 같은 파라미터의 필터 두 개를 깨끗한 신호·잡음 섞인 신호에 나란히 돌려
    // 추종 지연(둘 다 같음)을 빼고 잡음 감쇠만 측정한다.
    const noisy = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    const ref = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    const rng = new Pcg32(5, 1);
    const rawResidual: number[] = [];
    const outResidual: number[] = [];
    for (let i = 0; i < 2400; i += 1) {
      const t = i * DT;
      const clean = 50 * Math.sin((2 * Math.PI * t) / 4000);
      const noise = (rng.nextF32() - 0.5) * 4;
      const out = noisy.filter(clean + noise, t);
      const base = ref.filter(clean, t);
      if (i > 240) {
        rawResidual.push(noise);
        outResidual.push(out - base);
      }
    }
    expect(rms(outResidual)).toBeLessThan(rms(rawResidual) * 0.5);
    // 느린 사인(0.25 Hz)은 1 Hz 차단에서 진폭 손실 없이 지나간다(지연만 생긴다).
    let peak = 0;
    const probe = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    for (let i = 0; i < 2400; i += 1) {
      const t = i * DT;
      const v = probe.filter(50 * Math.sin((2 * Math.PI * t) / 4000), t);
      if (i > 240) peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(48);
  });

  it("빠른 추종에서 지연 ≤ 2샘플", () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.015, dCutoff: 1 });
    const slope = 10; // px/샘플 = 2400 px/s
    let worst = 0;
    for (let i = 0; i < 240; i += 1) {
      const x = i * slope;
      const y = f.filter(x, i * DT);
      if (i > 60) worst = Math.max(worst, (x - y) / slope);
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("같은 입력을 반복하면 bit-exact로 같다", () => {
    const run = (): number[] => {
      const f = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02, dCutoff: 1 });
      const rng = new Pcg32(11, 2);
      const out: number[] = [];
      for (let i = 0; i < 300; i += 1) out.push(f.filter(rng.nextF32() * 100, i * DT));
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("reset·setParams", () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    f.filter(10, 0);
    f.filter(20, DT);
    expect(f.current()).not.toBe(20);
    f.reset();
    expect(f.current()).toBeNull();
    f.setParams({ minCutoff: 1e6, beta: 0, dCutoff: 1 });
    f.filter(0, 0);
    expect(f.filter(5, DT)).toBeCloseTo(5, 3);
  });
});
