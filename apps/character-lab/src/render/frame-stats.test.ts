import { describe, expect, it } from "vitest";

import { createFrameStats, percentileNearestRank } from "./frame-stats";

describe("frame-stats", () => {
  it("p95는 nearest-rank로 계산한다", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileNearestRank(values, 95)).toBe(95);
    expect(percentileNearestRank([5], 95)).toBe(5);
    expect(percentileNearestRank([], 95)).toBe(0);
    expect(percentileNearestRank([3, 1, 2], 50)).toBe(2);
  });

  it("링버퍼는 용량을 넘기면 가장 오래된 값을 버린다", () => {
    const stats = createFrameStats(4);
    for (const value of [10, 20, 30, 40, 50]) stats.push(value);
    expect(stats.count()).toBe(4);
    expect(stats.last()).toBe(50);
    expect(stats.average()).toBe(35);
    expect(stats.p95()).toBe(50);
  });

  it("비정상 값은 무시하고 reset은 비운다", () => {
    const stats = createFrameStats(8);
    stats.push(Number.NaN);
    stats.push(-1);
    expect(stats.count()).toBe(0);
    stats.push(16.6);
    expect(stats.last()).toBeCloseTo(16.6);
    stats.reset();
    expect(stats.count()).toBe(0);
    expect(stats.p95()).toBe(0);
  });

  it("용량이 양의 정수가 아니면 throw", () => {
    expect(() => createFrameStats(0)).toThrow();
  });
});
