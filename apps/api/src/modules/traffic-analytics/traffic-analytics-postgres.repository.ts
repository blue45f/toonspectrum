import { dbPool } from "../../db";
import { ADMIN_TRAFFIC_OVERVIEW_QUERY, ADMIN_TRAFFIC_PULSE_QUERY } from "../admin/admin-traffic-query";
import {
  cleanupExpiredTrafficData,
  persistTrafficHeartbeat,
  persistTrafficPageView,
  persistTrafficShareEvent,
} from "./traffic-analytics-store";
import type { TrafficAnalyticsRepository, TrafficOverviewQuery, TrafficPulseQuery } from "./traffic-analytics.repository";

export class PostgresTrafficAnalyticsRepository implements TrafficAnalyticsRepository {
  persistPageView = persistTrafficPageView;
  persistHeartbeat = persistTrafficHeartbeat;
  persistShareEvent = persistTrafficShareEvent;
  cleanup = cleanupExpiredTrafficData;

  async overview(query: TrafficOverviewQuery): Promise<Record<string, unknown>> {
    const result = await dbPool.query<{ analytics: Record<string, unknown> | null }>(
      ADMIN_TRAFFIC_OVERVIEW_QUERY,
      [query.start, query.bucketSeconds, query.now, query.days, query.retentionDays],
    );
    return result.rows[0]?.analytics ?? {
      generatedAt: query.now.toISOString(), rangeDays: query.days, status: "empty",
    };
  }

  async pulse(query: TrafficPulseQuery): Promise<Record<string, unknown>> {
    const result = await dbPool.query<{ pulse: Record<string, unknown> | null }>(
      ADMIN_TRAFFIC_PULSE_QUERY,
      [query.fiveMinutesAgo, query.thirtyMinutesAgo, query.now],
    );
    return result.rows[0]?.pulse ?? {
      generatedAt: query.now.toISOString(), windowMinutes: 5, activeVisitors: 0,
      activeSessions: 0, pageViews5m: 0, pageViews30m: 0, latestAt: null, series: [],
    };
  }

  async checkHealth(): Promise<boolean> {
    const result = await dbPool.query<{ ready: boolean }>(`SELECT
      to_regclass('public.traffic_page_view') IS NOT NULL
      AND to_regclass('public.traffic_session') IS NOT NULL
      AND to_regclass('public.traffic_share_event') IS NOT NULL AS ready`);
    return result.rows[0]?.ready === true;
  }
}
