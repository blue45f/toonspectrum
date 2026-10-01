import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";

import {
  finiteLayer,
  kmMixRgb,
  ksRatioToReflectance,
  ksToReflectance,
  mixKs,
  overSubstrate,
  reflectanceToKsRatio,
} from "./kubelka-munk";
import { PIGMENT_IDS, PIGMENTS } from "./pigment-table";

describe("Kubelka-Munk 자체 구현", () => {
  it("F(R) ↔ R∞ 왕복(1e-4..1)과 단조성", () => {
    let prevQ = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= 100; i += 1) {
      const R = i / 100;
      const q = reflectanceToKsRatio(R);
      expect(q).toBeLessThanOrEqual(prevQ);
      prevQ = q;
      expect(ksRatioToReflectance(q)).toBeCloseTo(R, 5);
    }
    expect(reflectanceToKsRatio(1)).toBe(0);
    expect(ksRatioToReflectance(0)).toBe(1);
    expect(reflectanceToKsRatio(0)).toBe(reflectanceToKsRatio(1e-4));
    // 하한 R_MIN = 1e-4의 f32 표현
    expect(ksRatioToReflectance(1e9)).toBeGreaterThanOrEqual(Math.fround(1e-4));
  });

  it("순수 흡수체(s → 0): R = 0, T = e^(−kx); 순수 산란체(k → 0): R = sx/(1 + sx), R + T = 1", () => {
    const abs = finiteLayer(2, 0, 0.5);
    expect(abs.R).toBe(0);
    expect(abs.T).toBeCloseTo(Math.exp(-1), 6);
    const sc = finiteLayer(0, 2, 0.5);
    expect(sc.R).toBeCloseTo(1 / 2, 6);
    expect(sc.T).toBeCloseTo(1 / 2, 6);
    expect(sc.R + sc.T).toBeCloseTo(1, 6);
  });

  it("두께 0: R = 0, T = 1; 두께 ∞: R = R∞(k/s), T = 0; 큰 두께는 R∞로 수렴", () => {
    expect(finiteLayer(1, 1, 0)).toEqual({ R: 0, T: 1 });
    const inf = finiteLayer(1, 2, Number.POSITIVE_INFINITY);
    expect(inf.R).toBeCloseTo(ksRatioToReflectance(0.5), 6);
    expect(inf.T).toBe(0);
    const thick = finiteLayer(1, 2, 200);
    expect(thick.R).toBeCloseTo(ksRatioToReflectance(0.5), 4);
    expect(thick.T).toBeLessThan(1e-6);
    // 두께가 늘수록 R은 단조 증가·T는 단조 감소
    let prevR = -1;
    let prevT = 2;
    for (let x = 0; x <= 5; x += 0.25) {
      const { R, T } = finiteLayer(0.8, 1.5, x);
      expect(R).toBeGreaterThanOrEqual(prevR - 1e-7);
      expect(T).toBeLessThanOrEqual(prevT + 1e-7);
      expect(R + T).toBeLessThanOrEqual(1 + 1e-6);
      prevR = R;
      prevT = T;
    }
  });

  it("적층 등가: 두께 x 층을 두 번 겹친 것 = 두께 2x 층(배경 위 반사율)", () => {
    for (const [k, s, x, B] of [
      [0.5, 1.2, 0.4, 0.8],
      [2, 0.3, 0.7, 0.2],
      [0.1, 3, 0.2, 0.5],
    ] as const) {
      const one = finiteLayer(k, s, x);
      const two = finiteLayer(k, s, 2 * x);
      const stacked = overSubstrate(one.R, one.T, overSubstrate(one.R, one.T, B));
      const direct = overSubstrate(two.R, two.T, B);
      expect(stacked).toBeCloseTo(direct, 5);
    }
    // 배경이 완전 흡수(B = 0)면 층 자체 반사율, 투명층(R=0,T=1)은 배경 그대로
    expect(overSubstrate(0.3, 0.5, 0)).toBeCloseTo(0.3, 6);
    expect(overSubstrate(0, 1, 0.42)).toBeCloseTo(0.42, 6);
  });

  it("무작위 1,024 케이스에서 0 ≤ R, T ≤ 1·유한값", () => {
    const rng = new Pcg32(21, 4);
    for (let i = 0; i < 1024; i += 1) {
      const k = rng.nextF32() * 5;
      const s = rng.nextF32() * 5;
      const x = rng.nextF32() * 10;
      const { R, T } = finiteLayer(k, s, x);
      expect(Number.isFinite(R)).toBe(true);
      expect(Number.isFinite(T)).toBe(true);
      expect(R).toBeGreaterThanOrEqual(0);
      expect(R).toBeLessThanOrEqual(1);
      expect(T).toBeGreaterThanOrEqual(0);
      expect(T).toBeLessThanOrEqual(1);
      const over = overSubstrate(R, T, rng.nextF32());
      expect(over).toBeGreaterThanOrEqual(0);
      expect(over).toBeLessThanOrEqual(1 + 1e-6);
      const q = rng.nextF32() * 100;
      const r = ksRatioToReflectance(q);
      expect(r).toBeGreaterThanOrEqual(Math.fround(1e-4));
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("kmMixRgb: 대칭(mix(a,b,t) = mix(b,a,1−t)), 끝점 복원, 파랑 + 노랑 → 녹색 채널 우세", () => {
    const blue = PIGMENTS.ultramarine.reflectance;
    const yellow = PIGMENTS["cadmium-yellow"].reflectance;
    const ab = kmMixRgb(blue, yellow, 0.3);
    const ba = kmMixRgb(yellow, blue, 0.7);
    for (let c = 0; c < 3; c += 1) expect(ab[c]).toBeCloseTo(ba[c] ?? 0, 6);
    const end0 = kmMixRgb(blue, yellow, 0);
    const end1 = kmMixRgb(blue, yellow, 1);
    for (let c = 0; c < 3; c += 1) {
      expect(end0[c]).toBeCloseTo(blue[c] ?? 0, 4);
      expect(end1[c]).toBeCloseTo(yellow[c] ?? 0, 4);
    }
    const green = kmMixRgb(blue, yellow, 0.5);
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
    // 흰색과 섞으면 밝기가 단조 증가(t ↑)
    const white = PIGMENTS["titanium-white"].reflectance;
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const m = kmMixRgb(blue, white, t);
      const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
      expect(lum).toBeGreaterThanOrEqual(prev - 1e-7);
      prev = lum;
    }
  });

  it("mixKs는 질량 가중 선형 혼합이고 ksToReflectance는 PIGMENTS 반사율을 복원한다", () => {
    const a = PIGMENTS["cadmium-red"].ks;
    const b = PIGMENTS["phthalo-green"].ks;
    const m = mixKs(a, b, 1, 3);
    for (let c = 0; c < 3; c += 1) {
      expect(m.k[c]).toBeCloseTo(0.25 * (a.k[c] ?? 0) + 0.75 * (b.k[c] ?? 0), 6);
      expect(m.s[c]).toBeCloseTo(0.25 * (a.s[c] ?? 0) + 0.75 * (b.s[c] ?? 0), 6);
    }
    expect(mixKs(a, b, 0, 0)).toEqual(mixKs(a, b, 1, 1));
    for (const id of PIGMENT_IDS) {
      const entry = PIGMENTS[id];
      expect(entry.synthetic).toBe(true);
      const back = ksToReflectance(entry.ks);
      for (let c = 0; c < 3; c += 1) expect(back[c]).toBeCloseTo(entry.reflectance[c] ?? 0, 4);
    }
    expect(PIGMENT_IDS.length).toBe(8);
  });

  it("구현 소스에 금지 라이브러리(CC BY-NC 혼색 LUT) 계수·식별자가 없다(clean-room)", () => {
    const banned = ["mix", "box"].join("");
    const sources = [kmMixRgb, finiteLayer, overSubstrate, reflectanceToKsRatio, ksRatioToReflectance, mixKs].map((fn) =>
      fn.toString().toLowerCase(),
    );
    for (const src of sources) {
      expect(src.includes(banned)).toBe(false);
      expect(src.includes("lut")).toBe(false);
    }
  });
});
