import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { D1TrafficAnalyticsRepository } from "./traffic-analytics-d1.repository";
import type { TrafficD1Executor, TrafficD1Statement } from "./traffic-analytics-d1.client";
import type { TrafficPageViewRecord, TrafficSessionRecord } from "./traffic-analytics-store";

const databases: DatabaseSync[] = [];
const NOW = new Date("2026-09-26T12:34:56.789Z");
const schema = readFileSync(new URL("../../../../../deploy/federated-data-plane/d1/traffic-analytics.sql", import.meta.url), "utf8");

function fixture() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(schema);
  const executor: TrafficD1Executor = {
    async execute(statements: readonly TrafficD1Statement[]) {
      database.exec("BEGIN");
      try {
        const results = statements.map(({ sql, params }) => {
          const statement = database.prepare(sql);
          const rows = /\?\d/u.test(sql)
            ? statement.all(Object.fromEntries(params.map((value, index) => [String(index + 1), value])))
            : statement.all(...params);
          return { results: rows };
        });
        database.exec("COMMIT");
        return results;
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    },
  };
  return { database, repository: new D1TrafficAnalyticsRepository(executor) };
}

function input(overrides: Partial<TrafficPageViewRecord> = {}, sessionOverrides: Partial<TrafficSessionRecord> = {}) {
  const event: TrafficPageViewRecord = {
    id: "event-first-0000000001", occurredAt: NOW, visitorHash: "a".repeat(64), sessionHash: "b".repeat(64),
    path: "/studio", title: null, referrerHost: "example.com", source: "newsletter", medium: "email",
    campaign: "content_share", countryCode: "KR", deviceType: "desktop", browser: "Chrome", os: "macOS",
    screenClass: "large", loadTimeMs: 800, isBot: false, ...overrides,
  };
  const session: TrafficSessionRecord = {
    ...event, firstSeenAt: event.occurredAt, lastSeenAt: event.occurredAt,
    entryPath: event.path, lastPath: event.path, pageViews: 1, engagedSeconds: 0, ...sessionOverrides,
  };
  return { event, session };
}

afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("D1 트래픽 원자 저장 및 관리자 조회", () => {
  it("신규 이벤트만 세션 수에 더하고 다른 방문자의 세션 인수를 거부한다", async () => {
    const { database, repository } = fixture();
    const first = input();
    await repository.persistPageView(first);
    await repository.persistPageView(first);
    await repository.persistPageView(input({ id: "event-second-00000002" }));
    await repository.persistPageView(input({ id: "event-attacker-000003", visitorHash: "c".repeat(64), path: "/attacker" }));
    await repository.persistHeartbeat({ session: input({ visitorHash: "c".repeat(64) }).session });
    expect(database.prepare("SELECT page_views, visitor_hash, last_path FROM traffic_session").get()).toEqual({
      page_views: 2, visitor_hash: first.event.visitorHash, last_path: "/studio",
    });
    expect(database.prepare("SELECT count(*) AS count FROM traffic_page_view").get()?.count).toBe(2);
  });

  it("이벤트 제약 실패 시 앞선 세션 변경도 rollback한다", async () => {
    const { database, repository } = fixture();
    await expect(repository.persistPageView(input({ loadTimeMs: -1 }))).rejects.toThrow();
    expect(database.prepare("SELECT count(*) AS count FROM traffic_session").get()?.count).toBe(0);
    expect(database.prepare("SELECT count(*) AS count FROM traffic_page_view").get()?.count).toBe(0);
  });

  it("먼저 온 heartbeat의 유입 정보를 첫 페이지로 복구하고 역순 heartbeat가 최신 상태를 덮지 않는다", async () => {
    const { database, repository } = fixture();
    const early = new Date(NOW.getTime() - 5_000);
    await repository.persistHeartbeat({ session: input({ occurredAt: early }, {
      pageViews: 0, source: "direct", medium: "none", campaign: null, referrerHost: null,
      entryPath: "/heartbeat", lastPath: "/heartbeat", screenClass: "unknown", engagedSeconds: 15,
    }).session });
    await repository.persistPageView(input());
    await repository.persistHeartbeat({ session: input({ occurredAt: early }, {
      pageViews: 0, lastPath: "/old", browser: "Old", screenClass: "unknown", engagedSeconds: 4,
    }).session });
    expect(database.prepare("SELECT page_views, entry_path, source, campaign, last_path, browser, screen_class, engaged_seconds FROM traffic_session").get()).toEqual({
      page_views: 1, entry_path: "/studio", source: "newsletter", campaign: "content_share",
      last_path: "/studio", browser: "Chrome", screen_class: "large", engaged_seconds: 15,
    });
  });

  it("관리자 지표·공유·반송률·빈 시간대·실시간 30개 bucket을 모두 보존한다", async () => {
    const { repository } = fixture();
    await repository.persistPageView(input());
    await repository.persistPageView(input({ id: "event-second-00000002", sessionHash: "c".repeat(64), path: "/home", loadTimeMs: 400 }));
    await repository.persistHeartbeat({ session: input({}, { engagedSeconds: 15 }).session });
    const share = { ...input().event, id: "share-000000000000001", channel: "copy" as const, outcome: "completed" as const };
    await repository.persistShareEvent(share);
    await repository.persistShareEvent(share);
    const overview = await repository.overview({ now: NOW, start: new Date(NOW.getTime() - 86_400_000), days: 1, bucketSeconds: 3600, retentionDays: 90 });
    expect(overview).toMatchObject({
      status: "live", storageMode: "first-party-cloudflare-d1-v1",
      totals: { pageViews: 2, uniqueVisitors: 1, sessions: 2, returningVisitors: 1, averageLoadTimeMs: 600 },
      engagement: { engagedSessions: 1, bounceRate: 50, pageViewsPerSession: 1 },
      sharing: { attempts: 1, completed: 1, opened: 0, uniqueSharers: 1, attributedPageViews: 2 },
      privacy: { storesRawIp: false, storesQueryString: false, honorsBrowserPrivacySignals: true, adminPathsExcluded: true },
    });
    expect(overview.series).toHaveLength(25);
    expect(overview.realtimeSeries).toHaveLength(30);
    expect(overview.topPages).toEqual(expect.arrayContaining([expect.objectContaining({ path: "/studio", pageViews: 1 })]));
    const pulse = await repository.pulse({ now: NOW, fiveMinutesAgo: new Date(NOW.getTime() - 300_000), thirtyMinutesAgo: new Date(NOW.getTime() - 1_800_000) });
    expect(pulse).toMatchObject({ activeVisitors: 1, activeSessions: 2, pageViews5m: 2, pageViews30m: 2 });
    expect(pulse.series).toHaveLength(30);
  });

  it("retention은 세 저장소를 같은 cutoff로 정리하고 새 기록은 보존한다", async () => {
    const { database, repository } = fixture();
    const old = input({ occurredAt: new Date(NOW.getTime() - 91 * 86_400_000) });
    await repository.persistPageView(old);
    await repository.persistShareEvent({ ...old.event, id: "share-000000000000001", channel: "copy", outcome: "completed" });
    await repository.persistPageView(input({ id: "event-second-00000002", sessionHash: "c".repeat(64) }));
    await repository.cleanup(90, NOW);
    expect(database.prepare("SELECT count(*) AS count FROM traffic_page_view").get()?.count).toBe(1);
    expect(database.prepare("SELECT count(*) AS count FROM traffic_session").get()?.count).toBe(1);
    expect(database.prepare("SELECT count(*) AS count FROM traffic_share_event").get()?.count).toBe(0);
    const maintenance = database.prepare("SELECT lease_token FROM traffic_analytics_maintenance").get();
    await repository.cleanup(90, new Date(NOW.getTime() + 1000));
    expect(database.prepare("SELECT lease_token FROM traffic_analytics_maintenance").get()).toEqual(maintenance);
  });

  it("필수 trigger 누락을 운영 진단에서 감지한다", async () => {
    const { database, repository } = fixture();
    await expect(repository.checkHealth()).resolves.toBe(true);
    database.exec("DROP TRIGGER traffic_page_view_count");
    await expect(repository.checkHealth()).resolves.toBe(false);
  });
});
