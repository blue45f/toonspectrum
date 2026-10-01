import { describe, expect, it } from "vitest";

import { CURVATURE_AA_CORRECTION, normalizedDistance, SUBPIXEL_RADIUS, superellipseCoverage } from "./coverage";

import type { DabInstance } from "../core/types";

function dab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: 0,
    y: 0,
    rx: 4,
    ry: 4,
    angle: 0,
    hardness: 1,
    flow: 1,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
    ...partial,
  };
}

/** 픽셀 중심 격자에서 커버리지 합(= 면적 추정). */
function integrate(d: DabInstance, size: number): number {
  let sum = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      sum += superellipseCoverage(x + 0.5 - d.x, y + 0.5 - d.y, d);
    }
  }
  return sum;
}

describe("해석적 커버리지", () => {
  it("적분 vs π·rx·ry 오차 < 0.5%(r ≥ 4, 회전·타원 포함)", () => {
    const cases: [number, number, number][] = [
      [4, 4, 0],
      [8, 8, 0],
      [16, 16, 0],
      [8, 4, 0],
      [8, 4, 0.3],
      [6, 3, Math.PI / 4],
      [4, 4, 1.1],
      [12, 5, 2.2],
    ];
    for (const [rx, ry, angle] of cases) {
      const d = dab({ x: 32.3, y: 32.7, rx, ry, angle });
      const sum = integrate(d, 64);
      const ideal = Math.PI * rx * ry;
      expect(Math.abs(sum / ideal - 1), `rx=${rx} ry=${ry} angle=${angle}`).toBeLessThan(0.005);
    }
  });

  it("곡률 보정은 양수이며 r = 4에서 적분 오차가 0.1% 안쪽이다", () => {
    expect(CURVATURE_AA_CORRECTION).toBeGreaterThan(0);
    const d = dab({ x: 20.3, y: 20.7, rx: 4, ry: 4 });
    expect(Math.abs(integrate(d, 48) / (Math.PI * 16) - 1)).toBeLessThan(0.001);
  });

  it("반경 0.5 px 원의 합 ≈ π/4, 위치와 무관(서브픽셀 잉크량 보존)", () => {
    for (const [ox, oy] of [
      [0.5, 0.5],
      [0, 0],
      [0.25, 0.75],
      [0.9, 0.1],
    ]) {
      const d = dab({ x: 10 + (ox ?? 0), y: 10 + (oy ?? 0), rx: SUBPIXEL_RADIUS, ry: SUBPIXEL_RADIUS });
      expect(integrate(d, 20)).toBeCloseTo(Math.PI / 4, 6);
      const tiny = dab({ x: 10 + (ox ?? 0), y: 10 + (oy ?? 0), rx: 0.3, ry: 0.3 });
      expect(integrate(tiny, 20)).toBeCloseTo(Math.PI * 0.09, 6);
    }
  });

  it("중심 1·반경 방향 단조 감소·외부 0", () => {
    for (const hardness of [1, 0.5, 0]) {
      const d = dab({ rx: 8, ry: 8, hardness });
      expect(superellipseCoverage(0, 0, d)).toBe(1);
      let prev = 1;
      for (let r = 0; r <= 12; r += 0.25) {
        const c = superellipseCoverage(r, 0, d);
        expect(c, `hardness=${hardness} r=${r}`).toBeLessThanOrEqual(prev + 1e-7);
        expect(c).toBeGreaterThanOrEqual(0);
        prev = c;
      }
      expect(superellipseCoverage(9.5, 0, d)).toBe(0);
      expect(superellipseCoverage(0, 20, d)).toBe(0);
    }
    expect(superellipseCoverage(0, 0, dab({ rx: 0, ry: 4 }))).toBe(0);
  });

  it("hardness 1 전이폭 ≈ 1 px(0.95 → 0.05 구간 ≤ 1.2 px)이고 가장자리에서 ≈ 0.5", () => {
    const d = dab({ rx: 8, ry: 8, hardness: 1 });
    let x95: number | null = null;
    let x05: number | null = null;
    for (let x = 6; x <= 10; x += 0.01) {
      const c = superellipseCoverage(x, 0, d);
      if (x95 === null && c < 0.95) x95 = x;
      if (x05 === null && c < 0.05) x05 = x;
    }
    expect(x95).not.toBeNull();
    expect(x05).not.toBeNull();
    expect((x05 ?? 0) - (x95 ?? 0)).toBeLessThanOrEqual(1.2);
    expect((x05 ?? 0) - (x95 ?? 0)).toBeGreaterThan(0.8);
    expect(superellipseCoverage(8, 0, d)).toBeCloseTo(0.5, 1);
    // 부드러운 가장자리는 전이폭이 (1 − hardness)·rmin 로 넓어진다
    const soft = dab({ rx: 8, ry: 8, hardness: 0.5 });
    let s95: number | null = null;
    let s05: number | null = null;
    for (let x = 0; x <= 10; x += 0.01) {
      const c = superellipseCoverage(x, 0, soft);
      if (s95 === null && c < 0.95) s95 = x;
      if (s05 === null && c < 0.05) s05 = x;
    }
    expect((s05 ?? 0) - (s95 ?? 0)).toBeGreaterThan(3);
  });

  it("에어브러시 도포는 가우시안 밀도 exp(−2·dn²)", () => {
    const d = dab({ rx: 10, ry: 10, hardness: 0, deposition: "airbrush" });
    expect(superellipseCoverage(0, 0, d)).toBeCloseTo(1, 6);
    expect(superellipseCoverage(10, 0, d)).toBeCloseTo(Math.exp(-2), 6);
    expect(superellipseCoverage(0, 5, d)).toBeCloseTo(Math.exp(-0.5), 6);
  });

  it("초타원 지수 4는 타원보다 넓고(사각에 수렴) 지수 2는 타원", () => {
    const ellipse = integrate(dab({ x: 32.3, y: 32.7, rx: 8, ry: 8, shapeExp: 2 }), 64);
    const squarish = integrate(dab({ x: 32.3, y: 32.7, rx: 8, ry: 8, shapeExp: 4 }), 64);
    const ratio = squarish / ellipse;
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.25);
  });

  it("normalizedDistance는 회전 역변환 후 축 방향 반경에서 1", () => {
    const d = dab({ rx: 8, ry: 4, angle: 0.3 });
    const c = Math.cos(0.3);
    const s = Math.sin(0.3);
    expect(normalizedDistance(8 * c, 8 * s, d)).toBeCloseTo(1, 5);
    expect(normalizedDistance(-4 * s, 4 * c, d)).toBeCloseTo(1, 5);
    expect(normalizedDistance(0, 0, d)).toBe(0);
  });

  it("결과는 f32 값이다", () => {
    const d = dab({ x: 0.3, y: 0.1, rx: 5, ry: 3, angle: 0.7, hardness: 0.6 });
    for (let i = 0; i < 50; i += 1) {
      const c = superellipseCoverage(i * 0.2 - 5, 0.4, d);
      expect(c).toBe(Math.fround(c));
    }
  });
});
