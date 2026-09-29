import { describe, it, expect } from "vitest";

import {
  clamp,
  clamp01,
  formatCoord,
  mulberry32,
  dist2d,
} from "./studio-bubble-math";

describe("clamp", () => {
  it("구간 안의 값은 그대로 반환한다", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("하한보다 작으면 하한을 반환한다", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("상한보다 크면 상한을 반환한다", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("clamp01", () => {
  it("0..1 구간으로 클램프한다", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe("formatCoord", () => {
  it("소수점 2자리로 포맷한다", () => {
    expect(formatCoord(1.23456)).toBe("1.23");
    expect(formatCoord(1.235)).toBe("1.24");
  });

  it("정수는 그대로 문자열이 된다", () => {
    expect(formatCoord(42)).toBe("42");
  });
});

describe("mulberry32", () => {
  it("같은 시드는 같은 수열을 낸다", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("다른 시드는 다른 수열을 낸다", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("0..1 범위의 값을 낸다", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("dist2d", () => {
  it("두 점 사이 거리를 구한다", () => {
    expect(dist2d(0, 0, 3, 4)).toBe(5);
  });

  it("같은 점이면 0이다", () => {
    expect(dist2d(1, 2, 1, 2)).toBe(0);
  });
});
