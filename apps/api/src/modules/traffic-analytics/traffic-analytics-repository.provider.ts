import { D1TrafficAnalyticsRepository } from "./traffic-analytics-d1.repository";
import { resolveTrafficD1Config, TrafficD1HttpExecutor } from "./traffic-analytics-d1.client";
import { PostgresTrafficAnalyticsRepository } from "./traffic-analytics-postgres.repository";
import { TRAFFIC_ANALYTICS_REPOSITORY, type TrafficAnalyticsRepository } from "./traffic-analytics.repository";

export function createTrafficAnalyticsRepository(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TrafficAnalyticsRepository {
  const store = environment.TRAFFIC_ANALYTICS_STORE?.trim() || "postgres";
  if (store === "postgres") return new PostgresTrafficAnalyticsRepository();
  if (store === "d1") return new D1TrafficAnalyticsRepository(new TrafficD1HttpExecutor(resolveTrafficD1Config(environment)));
  throw new Error("트래픽 분석 저장소 선택이 올바르지 않습니다.");
}

export const trafficAnalyticsRepositoryProvider = {
  provide: TRAFFIC_ANALYTICS_REPOSITORY,
  useFactory: () => createTrafficAnalyticsRepository(),
};
