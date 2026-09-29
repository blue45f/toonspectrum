import { describe, expect, it } from "vitest";

import { buildMockCreatorAnalytics } from "./creator-analytics.mock";

describe("buildMockCreatorAnalytics", () => {
  it("같은 입력에는 항상 같은 응답을 반환한다(결정적)", () => {
    const first = buildMockCreatorAnalytics("30d", "series-midnight-diner");
    const second = buildMockCreatorAnalytics("30d", "series-midnight-diner");
    expect(second).toEqual({ ...first, generatedAt: second.generatedAt });
    expect(first.episodes).toEqual(second.episodes);
    expect(first.retention).toEqual(second.retention);
    expect(first.kpis).toEqual(second.kpis);
  });

  it("리텐션 곡선의 1화는 항상 100%이고 이탈 지점을 포함한다", () => {
    const response = buildMockCreatorAnalytics("30d");
    expect(response.mock).toBe(true);
    expect(response.retention[0]).toMatchObject({ episode: 1, retentionPct: 100 });
    // 목 시나리오: 7화에서 급락하므로 이탈 지점에 7화가 포함된다
    expect(response.dropOffEpisodes).toContain(7);
    expect(
      response.retention.find((point) => point.episode === 7)?.isDropOff,
    ).toBe(true);
  });

  it("유입 경로 비중 합이 100이다", () => {
    const response = buildMockCreatorAnalytics("90d");
    const total = response.trafficSources.reduce(
      (sum, source) => sum + source.sharePct,
      0,
    );
    expect(total).toBeCloseTo(100, 5);
    expect(response.trafficSources.length).toBeGreaterThan(0);
  });

  it("KPI 4종(조회·좋아요·댓글·구독 전환)을 반환한다", () => {
    const response = buildMockCreatorAnalytics("7d");
    expect(response.kpis.map((kpi) => kpi.key)).toEqual([
      "views",
      "likes",
      "comments",
      "subscribeConversion",
    ]);
    for (const kpi of response.kpis) {
      expect(Number.isFinite(kpi.value)).toBe(true);
      expect(Number.isFinite(kpi.deltaPct)).toBe(true);
    }
  });

  it("알 수 없는 seriesId는 기본 시리즈로 폴백한다", () => {
    const response = buildMockCreatorAnalytics("7d", "no-such-series");
    expect(response.seriesId).toBe("series-midnight-diner");
    expect(response.series.map((series) => series.id)).toContain(
      "series-midnight-diner",
    );
  });

  it("기간별로 규모가 다르다(7d < 30d < 90d)", () => {
    const views = (period: "7d" | "30d" | "90d") =>
      buildMockCreatorAnalytics(period).kpis.find((kpi) => kpi.key === "views")
        ?.value ?? 0;
    expect(views("7d")).toBeLessThan(views("30d"));
    expect(views("30d")).toBeLessThan(views("90d"));
  });
});
