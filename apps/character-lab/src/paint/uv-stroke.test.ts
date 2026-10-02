import { describe, expect, it } from "vitest";

import { interpolateDabs, shortestUvDelta, spacingPx, uvDistancePx } from "./uv-stroke";

import type { BrushSettings } from "../contracts";

const BRUSH: BrushSettings = { radiusPx: 10, color: "#000000", opacity: 1, hardness: 1, spacing: 0.5 };
const SIZE = { width: 100, height: 100 };

describe("interpolateDabs", () => {
  it("spacing×반지름 픽셀 간격으로 dab을 놓고 from은 제외한다", () => {
    const result = interpolateDabs({ u: 0.1, v: 0.5, pressure: 0 }, { u: 0.5, v: 0.5, pressure: 1 }, BRUSH, SIZE, { wrap: false });
    expect(spacingPx(BRUSH)).toBe(5);
    expect(result.lengthPx).toBeCloseTo(40, 9);
    expect(result.dabs).toHaveLength(8);
    expect(result.dabs[0]?.u).toBeCloseTo(0.15, 9);
    expect(result.dabs[7]?.u).toBeCloseTo(0.5, 9);
    expect(result.carry).toBeCloseTo(0, 9);
    for (let i = 1; i < result.dabs.length; i += 1) {
      const a = result.dabs[i - 1];
      const b = result.dabs[i];
      if (!a || !b) throw new Error("dab 누락");
      expect(uvDistancePx(a, b, SIZE, false)).toBeCloseTo(5, 9);
    }
    // 압력은 선형 보간
    expect(result.dabs[3]?.pressure).toBeCloseTo(0.5, 9);
  });

  it("세그먼트 사이의 carry를 이어받아 전체 간격이 일정하다", () => {
    const first = interpolateDabs({ u: 0, v: 0, pressure: 1 }, { u: 0.07, v: 0, pressure: 1 }, BRUSH, SIZE, { wrap: false });
    expect(first.dabs).toHaveLength(1);
    expect(first.carry).toBeCloseTo(2, 9);
    const second = interpolateDabs({ u: 0.07, v: 0, pressure: 1 }, { u: 0.2, v: 0, pressure: 1 }, BRUSH, SIZE, { wrap: false, carry: first.carry });
    expect(second.dabs[0]?.u).toBeCloseTo(0.1, 9);
    expect(second.dabs).toHaveLength(3);
    expect(second.carry).toBeCloseTo(0, 9);
  });

  it("UV 랩: 경계를 넘는 최단 경로로 보간하고 결과를 [0,1)로 감는다", () => {
    expect(shortestUvDelta({ u: 0.98, v: 0, pressure: 1 }, { u: 0.02, v: 0, pressure: 1 }, true)[0]).toBeCloseTo(0.04, 9);
    expect(shortestUvDelta({ u: 0.98, v: 0, pressure: 1 }, { u: 0.02, v: 0, pressure: 1 }, false)[0]).toBeCloseTo(-0.96, 9);
    const wrapped = interpolateDabs({ u: 0.98, v: 0.5, pressure: 1 }, { u: 0.02, v: 0.5, pressure: 1 }, { ...BRUSH, spacing: 0.1 }, SIZE);
    expect(wrapped.lengthPx).toBeCloseTo(4, 9);
    expect(wrapped.dabs).toHaveLength(4);
    expect(wrapped.dabs.map((d) => Number(d.u.toFixed(4)))).toEqual([0.99, 0, 0.01, 0.02]);
    for (const dab of wrapped.dabs) {
      expect(dab.u).toBeGreaterThanOrEqual(0);
      expect(dab.u).toBeLessThan(1);
    }
  });

  it("길이 0이면 dab 없이 carry를 유지한다", () => {
    const result = interpolateDabs({ u: 0.3, v: 0.3, pressure: 1 }, { u: 0.3, v: 0.3, pressure: 1 }, BRUSH, SIZE, { carry: 1.5 });
    expect(result.dabs).toHaveLength(0);
    expect(result.carry).toBe(1.5);
  });
});
