import { describe, expect, it } from "vitest";

import {
  computeDeltaPct,
  computeRetentionPoints,
  detectDropOffEpisodes,
  DROP_OFF_THRESHOLD_PCT,
  findWorstDropOff,
  normalizeShares,
  parseAnalyticsPeriod,
} from "./creator-analytics.math";

const EPISODES = [
  { episode: 1, title: "1화", views: 10000 },
  { episode: 2, title: "2화", views: 8200 },
  { episode: 3, title: "3화", views: 7800 },
  { episode: 4, title: "4화", views: 3900 },
  { episode: 5, title: "5화", views: 3600 },
];

describe("computeRetentionPoints", () => {
  it("1화를 100% 기준으로 잔존율을 계산한다", () => {
    const points = computeRetentionPoints(EPISODES);
    expect(points).toHaveLength(5);
    expect(points[0]).toMatchObject({
      episode: 1,
      retentionPct: 100,
      dropOffPct: 0,
      isDropOff: false,
    });
    expect(points[1].retentionPct).toBe(82);
    expect(points[3].retentionPct).toBe(39);
  });

  it("직전 회차 대비 이탈률을 계산한다", () => {
    const points = computeRetentionPoints(EPISODES);
    // 2화: (10000-8200)/10000 = 18%
    expect(points[1].dropOffPct).toBe(18);
    // 3화: (8200-7800)/8200 = 4.9%
    expect(points[2].dropOffPct).toBe(4.9);
    // 4화: (7800-3900)/7800 = 50%
    expect(points[3].dropOffPct).toBe(50);
  });

  it("임계값(15%)을 넘긴 회차를 이탈 지점으로 표시한다", () => {
    const points = computeRetentionPoints(EPISODES);
    expect(points[1].isDropOff).toBe(true);
    expect(points[2].isDropOff).toBe(false);
    expect(points[3].isDropOff).toBe(true);
    expect(DROP_OFF_THRESHOLD_PCT).toBe(15);
  });

  it("조회수가 0이어도 NaN 없이 0을 반환한다", () => {
    const points = computeRetentionPoints([
      { episode: 1, title: "1화", views: 0 },
      { episode: 2, title: "2화", views: 0 },
    ]);
    expect(points[0].retentionPct).toBe(0);
    expect(points[1].dropOffPct).toBe(0);
    expect(points[1].isDropOff).toBe(false);
  });

  it("빈 배열에 빈 결과를 반환한다", () => {
    expect(computeRetentionPoints([])).toEqual([]);
  });
});

describe("detectDropOffEpisodes", () => {
  it("이탈 지점 회차 번호만 오름차순으로 반환한다", () => {
    const points = computeRetentionPoints(EPISODES);
    expect(detectDropOffEpisodes(points)).toEqual([2, 4]);
  });
});

describe("findWorstDropOff", () => {
  it("가장 큰 이탈이 발생한 회차를 찾는다", () => {
    const points = computeRetentionPoints(EPISODES);
    expect(findWorstDropOff(points)).toMatchObject({ episode: 4, dropOffPct: 50 });
  });

  it("1화만 있거나 비어 있으면 null", () => {
    expect(findWorstDropOff(computeRetentionPoints(EPISODES.slice(0, 1)))).toBeNull();
    expect(findWorstDropOff([])).toBeNull();
  });
});

describe("computeDeltaPct", () => {
  it("증감률을 계산한다", () => {
    expect(computeDeltaPct(120, 100)).toBe(20);
    expect(computeDeltaPct(80, 100)).toBe(-20);
    expect(computeDeltaPct(100, 100)).toBe(0);
  });

  it("이전 값이 0이면 0 또는 100으로 정의한다", () => {
    expect(computeDeltaPct(0, 0)).toBe(0);
    expect(computeDeltaPct(50, 0)).toBe(100);
  });
});

describe("normalizeShares", () => {
  it("비중 합이 정확히 100이 되도록 보정한다", () => {
    const shares = normalizeShares([34, 22, 16, 14, 9, 5]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it("전체가 0이면 전부 0을 반환한다", () => {
    expect(normalizeShares([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("parseAnalyticsPeriod", () => {
  it("허용된 기간만 파싱한다", () => {
    expect(parseAnalyticsPeriod("7d")).toBe("7d");
    expect(parseAnalyticsPeriod("30d")).toBe("30d");
    expect(parseAnalyticsPeriod("90d")).toBe("90d");
    expect(parseAnalyticsPeriod(" 30D ")).toBe("30d");
  });

  it("허용되지 않은 값은 null", () => {
    expect(parseAnalyticsPeriod("1y")).toBeNull();
    expect(parseAnalyticsPeriod("")).toBeNull();
    expect(parseAnalyticsPeriod(undefined)).toBeNull();
    expect(parseAnalyticsPeriod(30)).toBeNull();
  });
});
