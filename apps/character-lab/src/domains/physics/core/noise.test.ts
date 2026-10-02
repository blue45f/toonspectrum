import { describe, expect, it } from "vitest";

import { latticeHash, valueNoise1D, windGustFactor } from "./noise";

describe("physics/core/noise", () => {
  it("value noise는 [0,1) 범위이고 같은 입력에 같은 값을 낸다", () => {
    for (let i = 0; i < 200; i += 1) {
      const t = i * 0.37;
      const a = valueNoise1D(7, t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
      expect(valueNoise1D(7, t)).toBe(a);
    }
    expect(latticeHash(1, 2)).not.toBe(latticeHash(1, 3));
    expect(valueNoise1D(1, 0.5)).not.toBe(valueNoise1D(2, 0.5));
  });

  it("격자 사이는 연속이고 격자점에서 해시값과 같다", () => {
    expect(valueNoise1D(11, 3)).toBeCloseTo(latticeHash(11, 3), 6);
    const a = valueNoise1D(11, 3.5);
    const b = valueNoise1D(11, 3.5001);
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
  });

  it("바람 돌풍 계수는 0.6..1.0", () => {
    for (let i = 0; i < 100; i += 1) {
      const g = windGustFactor(3, i / 30);
      expect(g).toBeGreaterThanOrEqual(0.6);
      expect(g).toBeLessThanOrEqual(1.0);
    }
  });
});
