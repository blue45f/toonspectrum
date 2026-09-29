import { describe, expect, it } from "vitest";

import {
  CreatorAnalyticsBadRequestError,
  CreatorAnalyticsService,
} from "./creator-analytics.service";

describe("CreatorAnalyticsService", () => {
  const service = new CreatorAnalyticsService();

  it("허용된 기간에 목 애널리틱스를 반환한다", () => {
    for (const period of ["7d", "30d", "90d"] as const) {
      const response = service.getAnalytics(period);
      expect(response.period).toBe(period);
      expect(response.mock).toBe(true);
      expect(response.retention.length).toBeGreaterThan(0);
    }
  });

  it("seriesId를 지정하면 해당 시리즈를 반환한다", () => {
    const response = service.getAnalytics("30d", "series-starfall");
    expect(response.seriesId).toBe("series-starfall");
    expect(response.episodes).toHaveLength(8);
  });

  it("잘못된 period에는 400 에러를 던진다", () => {
    for (const bad of ["1y", "", undefined, 30]) {
      try {
        service.getAnalytics(bad);
        expect.unreachable("에러가 던져져야 합니다");
      } catch (error) {
        expect(error).toBeInstanceOf(CreatorAnalyticsBadRequestError);
        expect((error as CreatorAnalyticsBadRequestError).statusCode).toBe(400);
      }
    }
  });
});
