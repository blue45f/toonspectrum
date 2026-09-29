import { describe, expect, it } from "vitest";

import {
  CREATOR_ANALYTICS_ROUTE_PATH,
  handleCreatorAnalyticsRequest,
} from "./creator-analytics.routes";

describe("creator analytics routes", () => {
  it("엔드포인트 경로를 노출한다", () => {
    expect(CREATOR_ANALYTICS_ROUTE_PATH).toBe("/api/creator/analytics");
  });

  it("정상 요청에 200과 애널리틱스 본문을 반환한다", () => {
    const result = handleCreatorAnalyticsRequest({
      period: "30d",
      seriesId: "series-starfall",
    });
    expect(result.status).toBe(200);
    const body = result.body as { seriesId: string; period: string };
    expect(body.seriesId).toBe("series-starfall");
    expect(body.period).toBe("30d");
  });

  it("period가 없으면 기본이 아니라 400을 반환한다", () => {
    const result = handleCreatorAnalyticsRequest({});
    expect(result.status).toBe(400);
    expect((result.body as { message: string }).message).toContain("period");
  });

  it("seriesId가 비어 있으면 기본 시리즈로 처리한다", () => {
    const result = handleCreatorAnalyticsRequest({ period: "7d", seriesId: " " });
    expect(result.status).toBe(200);
    expect((result.body as { seriesId: string }).seriesId).toBe(
      "series-midnight-diner",
    );
  });
});
