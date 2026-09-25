import { randomUUID } from "node:crypto";

import { D1_TRAFFIC_OVERVIEW_QUERY, D1_TRAFFIC_PULSE_QUERY } from "../admin/admin-traffic-d1-query";
import { trafficD1Unavailable, type TrafficD1Executor, type TrafficD1Statement } from "./traffic-analytics-d1.client";
import type { TrafficAnalyticsRepository, TrafficOverviewQuery, TrafficPulseQuery } from "./traffic-analytics.repository";
import type { TrafficPageViewRecord, TrafficSessionRecord, TrafficShareEventRecord } from "./traffic-analytics-store";

const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1_000;

function sessionStatement(session: TrafficSessionRecord, pageView: boolean): TrafficD1Statement {
  const acquisition = pageView ? ["entry_path", "referrer_host", "source", "medium", "campaign"]
    .map((column) => `${column} = CASE WHEN traffic_session.page_views = 0 THEN excluded.${column} ELSE traffic_session.${column} END,`).join("\n") : "";
  return {
    sql: `INSERT INTO traffic_session (
      session_hash, visitor_hash, first_seen_at, last_seen_at, entry_path, last_path,
      referrer_host, source, medium, campaign, country_code, device_type, browser, os,
      screen_class, page_views, engaged_seconds, is_bot, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (session_hash) DO UPDATE SET
      ${acquisition}
      last_seen_at = MAX(traffic_session.last_seen_at, excluded.last_seen_at),
      last_path = CASE WHEN excluded.last_seen_at >= traffic_session.last_seen_at THEN excluded.last_path ELSE traffic_session.last_path END,
      country_code = COALESCE(traffic_session.country_code, excluded.country_code),
      device_type = CASE WHEN excluded.last_seen_at >= traffic_session.last_seen_at THEN excluded.device_type ELSE traffic_session.device_type END,
      browser = CASE WHEN excluded.last_seen_at >= traffic_session.last_seen_at THEN excluded.browser ELSE traffic_session.browser END,
      os = CASE WHEN excluded.last_seen_at >= traffic_session.last_seen_at THEN excluded.os ELSE traffic_session.os END,
      screen_class = CASE WHEN excluded.last_seen_at >= traffic_session.last_seen_at
        THEN COALESCE(NULLIF(excluded.screen_class, 'unknown'), traffic_session.screen_class) ELSE traffic_session.screen_class END,
      engaged_seconds = MAX(traffic_session.engaged_seconds, excluded.engaged_seconds),
      updated_at = MAX(traffic_session.updated_at, excluded.updated_at)
    WHERE traffic_session.visitor_hash = excluded.visitor_hash`,
    params: [session.sessionHash, session.visitorHash, session.firstSeenAt.toISOString(), session.lastSeenAt.toISOString(),
      session.entryPath, session.lastPath, session.referrerHost, session.source, session.medium, session.campaign,
      session.countryCode, session.deviceType, session.browser, session.os, session.screenClass,
      pageView ? 0 : session.pageViews, session.engagedSeconds, Number(session.isBot), session.lastSeenAt.toISOString()],
  };
}

/** DB.batch 원자성이 있는 실행 포트만 사용한다. 순차 HTTP 요청이나 PG fallback은 금지한다. */
export class D1TrafficAnalyticsRepository implements TrafficAnalyticsRepository {
  constructor(private readonly executor: TrafficD1Executor) {}

  async persistPageView({ event, session }: { event: TrafficPageViewRecord; session: TrafficSessionRecord }): Promise<void> {
    if (event.sessionHash !== session.sessionHash || event.visitorHash !== session.visitorHash) throw trafficD1Unavailable();
    await this.executor.execute([
      sessionStatement(session, true),
      {
        sql: `INSERT INTO traffic_page_view (
          id, occurred_at, visitor_hash, session_hash, path, title, referrer_host,
          source, medium, campaign, country_code, device_type, browser, os, screen_class, load_time_ms, is_bot
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM traffic_session WHERE session_hash = ? AND visitor_hash = ?
        ON CONFLICT (id) DO NOTHING`,
        params: [event.id, event.occurredAt.toISOString(), event.visitorHash, event.sessionHash, event.path, event.title,
          event.referrerHost, event.source, event.medium, event.campaign, event.countryCode, event.deviceType, event.browser,
          event.os, event.screenClass, event.loadTimeMs, Number(event.isBot), event.sessionHash, event.visitorHash],
      },
    ]);
  }

  async persistHeartbeat({ session }: { session: TrafficSessionRecord }): Promise<void> {
    await this.executor.execute([sessionStatement(session, false)]);
  }

  async persistShareEvent(event: TrafficShareEventRecord): Promise<void> {
    await this.executor.execute([{
      sql: `INSERT INTO traffic_share_event (
        id, occurred_at, visitor_hash, session_hash, path, channel, outcome, country_code, device_type, browser, os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      params: [event.id, event.occurredAt.toISOString(), event.visitorHash, event.sessionHash, event.path,
        event.channel, event.outcome, event.countryCode, event.deviceType, event.browser, event.os],
    }]);
  }

  async cleanup(retentionDays: number, now = new Date()): Promise<void> {
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 365) throw trafficD1Unavailable();
    const leaseToken = randomUUID();
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
    await this.executor.execute([
      {
        sql: `INSERT INTO traffic_analytics_maintenance (name, last_run_ms, lease_token) VALUES ('retention', ?, ?)
          ON CONFLICT (name) DO UPDATE SET last_run_ms = excluded.last_run_ms, lease_token = excluded.lease_token
          WHERE traffic_analytics_maintenance.last_run_ms <= excluded.last_run_ms - ?`,
        params: [now.getTime(), leaseToken, RETENTION_INTERVAL_MS],
      },
      ...[["traffic_page_view", "occurred_at"], ["traffic_share_event", "occurred_at"], ["traffic_session", "last_seen_at"]].map(([table, time]) => ({
        sql: `DELETE FROM ${table} WHERE ${time} < ? AND EXISTS (
          SELECT 1 FROM traffic_analytics_maintenance WHERE name = 'retention' AND lease_token = ?
        )`, params: [cutoff, leaseToken],
      })),
    ]);
  }

  async overview(query: TrafficOverviewQuery): Promise<Record<string, unknown>> {
    return this.report(D1_TRAFFIC_OVERVIEW_QUERY,
      [query.start.toISOString(), query.bucketSeconds, query.now.toISOString(), query.days, query.retentionDays], "analytics");
  }

  async pulse(query: TrafficPulseQuery): Promise<Record<string, unknown>> {
    return this.report(D1_TRAFFIC_PULSE_QUERY,
      [query.fiveMinutesAgo.toISOString(), query.thirtyMinutesAgo.toISOString(), query.now.toISOString()], "pulse");
  }

  private async report(sql: string, params: TrafficD1Statement["params"], column: string): Promise<Record<string, unknown>> {
    const results = await this.executor.execute([{ sql, params }]);
    const value = results[0]?.results[0]?.[column];
    try {
      const report: unknown = typeof value === "string" ? JSON.parse(value) : value;
      if (report && typeof report === "object" && !Array.isArray(report)) return report as Record<string, unknown>;
    } catch { throw trafficD1Unavailable(); }
    throw trafficD1Unavailable();
  }

  async checkHealth(): Promise<boolean> {
    // 운영 진단에서 명시적으로 호출한다. 백그라운드 polling이나 부팅 DDL은 없다.
    const results = await this.executor.execute([{
      sql: `SELECT count(*) AS ready FROM sqlite_schema WHERE
        (type = 'table' AND name IN ('traffic_session','traffic_page_view','traffic_share_event','traffic_analytics_maintenance'))
        OR (type = 'trigger' AND name IN ('traffic_page_view_owner_guard','traffic_page_view_count'))`, params: [],
    }, {
      sql: "SELECT session_hash, visitor_hash, first_seen_at, last_seen_at, page_views, engaged_seconds FROM traffic_session LIMIT 0", params: [],
    }, {
      sql: "SELECT id, occurred_at, visitor_hash, session_hash, path, load_time_ms FROM traffic_page_view LIMIT 0", params: [],
    }, {
      sql: "SELECT id, occurred_at, visitor_hash, session_hash, path, channel, outcome FROM traffic_share_event LIMIT 0", params: [],
    }]);
    return results[0]?.results[0]?.ready === 6;
  }
}
