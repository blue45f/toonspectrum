import { describe, expect, it } from "vitest";

import { NOT_FOUND_QUIP_KEYS, nextQuipIndex } from "./not-found-quips";

describe("nextQuipIndex", () => {
  it("대사가 하나 이하이면 0을 반환한다", () => {
    expect(nextQuipIndex(0, 1)).toBe(0);
    expect(nextQuipIndex(-1, 0)).toBe(0);
  });

  it("현재 인덱스와 같은 값이 뽑히면 다음 인덱스로 넘긴다", () => {
    // rand가 항상 현재 인덱스를 가리켜도 바뀌어야 한다
    expect(nextQuipIndex(2, 4, () => 0.6)).toBe(3);
    expect(nextQuipIndex(3, 4, () => 0.99)).toBe(0);
  });

  it("항상 범위 안의 인덱스를 반환한다", () => {
    for (let i = 0; i < 50; i += 1) {
      const next = nextQuipIndex(1, NOT_FOUND_QUIP_KEYS.length);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(NOT_FOUND_QUIP_KEYS.length);
    }
  });

  it("대사 키가 4개다", () => {
    expect(NOT_FOUND_QUIP_KEYS).toHaveLength(4);
  });
});
