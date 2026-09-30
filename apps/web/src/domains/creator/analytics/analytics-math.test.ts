import { describe, expect, it } from "vitest";

import {
  analyticsPeriodDays,
  analyticsPeriodRange,
  deltaDirection,
  donutGradientStops,
  formatDeltaPct,
  findWorstDropOffPoint,
  kpiByKey,
  retentionPointToXy,
} from "./analytics-math";
import { buildClientMockAnalytics } from "./mock-analytics";

const POINTS = buildClientMockAnalytics("30d").retention;

describe("formatDeltaPct", () => {
  it("부호 있는 퍼센트로 포맷한다", () => {
    expect(formatDeltaPct(12.34)).toBe("+12.3%");
    expect(formatDeltaPct(-4.16)).toBe("-4.2%");
    expect(formatDeltaPct(0)).toBe("±0%");
    expect(formatDeltaPct(-0.04)).toBe("±0%");
  });
});

describe("findWorstDropOffPoint", () => {
  it("가장 큰 이탈 회차를 찾는다", () => {
    const worst = findWorstDropOffPoint(POINTS);
    // 목 시나리오: 7화 급락이 최대 이탈
    expect(worst?.episode).toBe(7);
    expect(worst?.isDropOff).toBe(true);
  });

  it("1화만 있거나 비어 있으면 null", () => {
    expect(findWorstDropOffPoint(POINTS.slice(0, 1))).toBeNull();
    expect(findWorstDropOffPoint([])).toBeNull();
  });
});

describe("kpiByKey", () => {
  it("키로 KPI를 조회한다", () => {
    const response = buildClientMockAnalytics("7d");
    expect(kpiByKey(response.kpis, "views")?.value).toBeGreaterThan(0);
    expect(kpiByKey(response.kpis, "subscribeConversion")).toBeDefined();
  });
});

describe("retentionPointToXy", () => {
  it("1화(100%)는 상단, 0%는 하단에 배치한다", () => {
    const top = retentionPointToXy(
      { episode: 1, title: "1화", views: 100, retentionPct: 100, dropOffPct: 0, isDropOff: false },
      0,
      2,
    );
    const bottom = retentionPointToXy(
      { episode: 2, title: "2화", views: 0, retentionPct: 0, dropOffPct: 100, isDropOff: true },
      1,
      2,
    );
    expect(top.y).toBeLessThan(bottom.y);
    expect(top.x).toBeLessThan(bottom.x);
  });

  it("범위를 벗어난 잔존율은 0~100으로 클램프한다", () => {
    const point = retentionPointToXy(
      { episode: 1, title: "1화", views: 1, retentionPct: 140, dropOffPct: 0, isDropOff: false },
      0,
      1,
    );
    const top = retentionPointToXy(
      { episode: 1, title: "1화", views: 1, retentionPct: 100, dropOffPct: 0, isDropOff: false },
      0,
      1,
    );
    expect(point.y).toBe(top.y);
  });
});

describe("buildClientMockAnalytics", () => {
  it("결정적이다: 같은 입력에 같은 곡선", () => {
    const first = buildClientMockAnalytics("30d");
    const second = buildClientMockAnalytics("30d");
    expect(first.retention).toEqual(second.retention);
    expect(first.episodes).toEqual(second.episodes);
  });

  it("7화가 이탈 지점으로 표시된다", () => {
    const response = buildClientMockAnalytics("30d");
    expect(response.dropOffEpisodes).toContain(7);
  });
});

describe("analyticsPeriodRange", () => {
  it("집계 시각을 마지막 날로 하는 양 끝 포함 기간을 만든다", () => {
    const range = analyticsPeriodRange("30d", "2026-09-30T12:00:00.000Z");
    expect(range?.days).toBe(30);
    expect(range?.start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(range?.end.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(analyticsPeriodDays("7d")).toBe(7);
    expect(analyticsPeriodDays("90d")).toBe(90);
  });

  it("잘못된 집계 시각이면 null", () => {
    expect(analyticsPeriodRange("7d", "not-a-date")).toBeNull();
  });
});

describe("deltaDirection", () => {
  it("반올림한 증감으로 방향을 정한다", () => {
    expect(deltaDirection(3.2)).toBe("up");
    expect(deltaDirection(-0.2)).toBe("down");
    expect(deltaDirection(0.04)).toBe("flat");
    expect(deltaDirection(-0.04)).toBe("flat");
  });
});

describe("donutGradientStops", () => {
  it("조각 끝마다 표면색 틈을 넣고 360도를 채운다", () => {
    const stops = donutGradientStops(
      [{ value: 1, color: "red" }, { value: 3, color: "blue" }],
      "gap",
      2,
    );
    expect(stops).toBe("red 0.00deg 88.00deg, gap 88.00deg 90.00deg, blue 90.00deg 358.00deg, gap 358.00deg 360.00deg");
  });

  it("한 조각뿐이거나 틈보다 작은 조각에는 틈을 넣지 않고, 합이 0이면 표면색 링을 그린다", () => {
    expect(donutGradientStops([{ value: 5, color: "red" }], "gap")).toBe("red 0.00deg 360.00deg");
    expect(donutGradientStops([{ value: 1, color: "red" }, { value: 999, color: "blue" }], "gap", 2)).toContain("red 0.00deg 0.36deg, blue");
    expect(donutGradientStops([], "gap")).toBe("gap 0deg 360deg");
  });
});
