import { describe, expect, it, vi } from "vitest";

import { createTrafficAnalyticsRepository } from "./traffic-analytics-repository.provider";
import { D1TrafficAnalyticsRepository } from "./traffic-analytics-d1.repository";
import { PostgresTrafficAnalyticsRepository } from "./traffic-analytics-postgres.repository";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../db", () => ({ dbPool: { query } }));

describe("트래픽 저장소 선택", () => {
  it("기본 PostgreSQL을 유지하며 D1 선택은 같은 repository의 쓰기·조회·정리에 적용된다", () => {
    expect(createTrafficAnalyticsRepository({})).toBeInstanceOf(PostgresTrafficAnalyticsRepository);
    expect(createTrafficAnalyticsRepository({
      TRAFFIC_ANALYTICS_STORE: "d1", TRAFFIC_ANALYTICS_D1_RPC_URL: "https://analytics.example.com/query",
      TRAFFIC_ANALYTICS_D1_RPC_TOKEN: "local-rpc-token-000000000000000000000",
    })).toBeInstanceOf(D1TrafficAnalyticsRepository);
    expect(query).not.toHaveBeenCalled();
  });

  it("알 수 없는 설정이나 잘못된 D1 설정을 PostgreSQL로 우회하지 않는다", () => {
    expect(() => createTrafficAnalyticsRepository({ TRAFFIC_ANALYTICS_STORE: "typo" })).toThrow();
    expect(() => createTrafficAnalyticsRepository({ TRAFFIC_ANALYTICS_STORE: "d1" })).toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
