import { describe, expect, it } from "vitest";

import { createPrng, mulberry32, seedFromString } from "./prng";

describe("shared/prng", () => {
  it("같은 시드는 같은 수열을 낸다", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("다른 시드는 다른 수열, 알려진 첫 값 고정(회귀 방지)", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    // mulberry32(42)의 첫 값 — 알고리즘 변경 시 깨져야 한다.
    expect(mulberry32(42)()).toBeCloseTo(0.6011037519, 7);
  });

  it("createPrng 유틸", () => {
    const prng = createPrng(seedFromString("character-lab"));
    const ints = Array.from({ length: 100 }, () => prng.nextInt(5));
    expect(ints.every((v) => Number.isInteger(v) && v >= 0 && v < 5)).toBe(true);
    const ranged = prng.nextRange(-1, 1);
    expect(ranged).toBeGreaterThanOrEqual(-1);
    expect(ranged).toBeLessThan(1);
    expect(Number.isFinite(prng.nextGaussian())).toBe(true);
    const shuffled = createPrng(7).shuffle([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(createPrng(7).shuffle([1, 2, 3, 4, 5])).toEqual(shuffled);
    expect(prng.nextInt(0)).toBe(0);
  });
});
