import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { D1TrafficAnalyticsRepository } from "./traffic-analytics-d1.repository";
import { PostgresTrafficAnalyticsRepository } from "./traffic-analytics-postgres.repository";
import type { TrafficD1Executor } from "./traffic-analytics-d1.client";
import type { TrafficPageViewRecord, TrafficSessionRecord } from "./traffic-analytics-store";

// 명시적으로 만든 로컬 disposable DB에서만 실행한다. 운영·공유 DB에는 DDL을 실행하지 않는다.
describe.runIf(process.env.TRAFFIC_ANALYTICS_COMPARE_POSTGRES === "true")("PostgreSQL/D1 트래픽 지표 실DB 동등성", () => {
  let postgres: Pool;
  let sqlite: DatabaseSync;
  let d1: D1TrafficAnalyticsRepository;
  const pg = new PostgresTrafficAnalyticsRepository();
  const now = new Date("2026-09-26T12:34:56.789Z");

  beforeAll(async () => {
    const target = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
      || target.pathname !== "/traffic_analytics_d1_compare") throw new Error("전용 로컬 분석 비교 DB가 필요합니다.");
    postgres = new Pool({ connectionString: target.href });
    for (const name of ["0036_traffic_analytics_relations.sql", "0066_share_analytics_events.sql"]) {
      await postgres.query(readFileSync(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8"));
    }
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(readFileSync(new URL("../../../../../deploy/federated-data-plane/d1/traffic-analytics.sql", import.meta.url), "utf8"));
    const executor: TrafficD1Executor = {
      async execute(statements) {
        sqlite.exec("BEGIN");
        try {
          const results = statements.map(({ sql, params }) => ({ results: /\?\d/u.test(sql)
            ? sqlite.prepare(sql).all(Object.fromEntries(params.map((value, index) => [String(index + 1), value])))
            : sqlite.prepare(sql).all(...params) }));
          sqlite.exec("COMMIT");
          return results;
        } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      },
    };
    d1 = new D1TrafficAnalyticsRepository(executor);
  });

  afterAll(async () => { sqlite?.close(); await postgres?.end(); });
  beforeEach(async () => {
    await postgres.query("TRUNCATE traffic_page_view, traffic_session, traffic_share_event");
    sqlite.exec("DELETE FROM traffic_page_view; DELETE FROM traffic_session; DELETE FROM traffic_share_event; DELETE FROM traffic_analytics_maintenance");
  });

  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "storageMode").map(([key, item]) => [key, canonical(item)]));
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)) return new Date(value).toISOString();
    return value;
  }

  it("실제 같은 이벤트를 저장한 뒤 모든 관리자 집계·권한 없는 세션 충돌·retention 결과가 일치한다", async () => {
    for (let index = 0; index < 5; index += 1) {
      const occurredAt = new Date(now.getTime() - index * 60_000);
      const event: TrafficPageViewRecord = {
        id: `event-parity-0000000${index}`, occurredAt, visitorHash: (index % 2 ? "a" : "b").repeat(64),
        sessionHash: (index % 3 ? "c" : "d").repeat(64), path: index % 2 ? "/home" : "/studio", title: null,
        referrerHost: null, source: "direct", medium: "none", campaign: index % 2 ? "content_share" : null,
        countryCode: index % 2 ? "KR" : null, deviceType: "desktop", browser: "Chrome", os: "macOS",
        screenClass: "large", loadTimeMs: 250 + index * 100, isBot: false,
      };
      const session: TrafficSessionRecord = { ...event, firstSeenAt: occurredAt, lastSeenAt: occurredAt,
        entryPath: event.path, lastPath: event.path, pageViews: 1, engagedSeconds: index * 5 };
      for (const repository of [pg, d1]) {
        await repository.persistPageView({ event, session });
        await repository.persistPageView({ event, session });
        await repository.persistHeartbeat({ session: { ...session, pageViews: 0, engagedSeconds: 15 } });
        await repository.persistShareEvent({ ...event, id: `share-parity-0000000${index}`, channel: "copy", outcome: index % 2 ? "opened" : "completed" });
      }
    }
    for (const days of [1, 7, 30, 90]) {
      const query = { start: new Date(now.getTime() - days * 86_400_000), now, days,
        bucketSeconds: days === 1 ? 3600 : days === 7 ? 21600 : 86400, retentionDays: 90 };
      expect(canonical(await d1.overview(query))).toEqual(canonical(await pg.overview(query)));
    }
    const pulse = { now, fiveMinutesAgo: new Date(now.getTime() - 300_000), thirtyMinutesAgo: new Date(now.getTime() - 1_800_000) };
    expect(canonical(await d1.pulse(pulse))).toEqual(canonical(await pg.pulse(pulse)));
    const future = new Date(now.getTime() + 91 * 86_400_000);
    await pg.cleanup(90, future);
    await d1.cleanup(90, future);
    const query = { start: now, now: future, days: 90, bucketSeconds: 86400, retentionDays: 90 };
    expect(canonical(await d1.overview(query))).toEqual(canonical(await pg.overview(query)));
  });

  it("동시 재전송은 한 번만 세고 실패한 페이지 이벤트는 앞선 세션 변경도 rollback한다", async () => {
    const event: TrafficPageViewRecord = {
      id: "event-parity-concurrent", occurredAt: now, visitorHash: "a".repeat(64), sessionHash: "b".repeat(64),
      path: "/home", title: null, referrerHost: null, source: "direct", medium: "none", campaign: null,
      countryCode: "KR", deviceType: "desktop", browser: "Chrome", os: "macOS", screenClass: "large",
      loadTimeMs: 200, isBot: false,
    };
    const session: TrafficSessionRecord = { ...event, firstSeenAt: now, lastSeenAt: now,
      entryPath: event.path, lastPath: event.path, pageViews: 1, engagedSeconds: 0 };
    for (const repository of [pg, d1]) {
      await Promise.all(Array.from({ length: 6 }, (_, index) => repository.persistPageView({
        event: { ...event, id: `${event.id}-${index % 2}` }, session,
      })));
      await expect(repository.persistPageView({
        event: { ...event, id: `${event.id}-invalid`, loadTimeMs: -1 },
        session: { ...session, lastPath: "/should-rollback", engagedSeconds: 42 },
      })).rejects.toThrow();
    }
    const expected = [{ page_views: 2, last_path: "/home", engaged_seconds: 0 }];
    expect((await postgres.query("SELECT page_views, last_path, engaged_seconds FROM traffic_session")).rows).toEqual(expected);
    expect(sqlite.prepare("SELECT page_views, last_path, engaged_seconds FROM traffic_session").all()).toEqual(expected);
    expect((await postgres.query("SELECT count(*)::integer AS count FROM traffic_page_view")).rows).toEqual([{ count: 2 }]);
    expect(sqlite.prepare("SELECT count(*) AS count FROM traffic_page_view").all()).toEqual([{ count: 2 }]);
  });
});
