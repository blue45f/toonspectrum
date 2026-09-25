import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { D1_TRAFFIC_PULSE_QUERY } from "./admin-traffic-d1-query";

const NOW = new Date("2026-09-26T12:34:56.789Z");
const parameters = {
  "1": new Date(NOW.getTime() - 300_000).toISOString(),
  "2": new Date(NOW.getTime() - 1_800_000).toISOString(),
  "3": NOW.toISOString(),
};
const databases: DatabaseSync[] = [];

function fixture() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(readFileSync(new URL("../../../../../deploy/federated-data-plane/d1/traffic-analytics.sql", import.meta.url), "utf8"));
  return database;
}

function session(database: DatabaseSync, key: string, visitor: string, lastSeen: Date, bot = false) {
  database.prepare(`INSERT INTO traffic_session (
    session_hash, visitor_hash, first_seen_at, last_seen_at, entry_path, last_path,
    source, medium, device_type, browser, os, screen_class, is_bot, updated_at
  ) VALUES (?, ?, ?, ?, '/home', '/home', 'direct', 'none', 'desktop', 'Chrome', 'macOS', 'large', ?, ?)`)
    .run(key.repeat(64), visitor.repeat(64), new Date(NOW.getTime() - 3_600_000).toISOString(),
      lastSeen.toISOString(), Number(bot), lastSeen.toISOString());
}

function pulse(database: DatabaseSync): Record<string, unknown> {
  return JSON.parse(database.prepare(D1_TRAFFIC_PULSE_QUERY).get(parameters)?.pulse as string) as Record<string, unknown>;
}

afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("D1 실시간 집계의 시간·방문자 계약", () => {
  it("빈 저장소에서도 집계 0과 빈 30개 분 bucket을 반환한다", () => {
    const report = pulse(fixture());
    expect(report).toMatchObject({ generatedAt: NOW.toISOString(), windowMinutes: 5,
      activeVisitors: 0, activeSessions: 0, pageViews5m: 0, pageViews30m: 0, latestAt: null });
    expect(report.series).toHaveLength(30);
    expect((report.series as { pageViews: number; visitors: number }[])
      .every((row) => row.pageViews === 0 && row.visitors === 0)).toBe(true);
  });

  it("밀리초 경계·첫 부분 분·중복 방문자·봇·미래 이벤트를 각각 보존한다", () => {
    const database = fixture();
    session(database, "a", "a", NOW);
    session(database, "b", "a", NOW);
    session(database, "c", "c", new Date(NOW.getTime() - 360_000));
    session(database, "d", "d", NOW, true);
    const insert = database.prepare(`INSERT INTO traffic_page_view (
      id, occurred_at, session_hash, visitor_hash, path, source, medium, device_type, browser, os, screen_class, is_bot
    ) VALUES (?, ?, ?, ?, '/home', 'direct', 'none', 'desktop', 'Chrome', 'macOS', 'large', ?)`);
    [-1_800_001, -1_800_000, -1_799_999, -300_001, -300_000, 0, 1].forEach((offset, index) => {
      insert.run(`boundary-${index}`, new Date(NOW.getTime() + offset).toISOString(),
        (index % 2 ? "b" : "a").repeat(64), "a".repeat(64), 0);
    });
    insert.run("bot-event", NOW.toISOString(), "d".repeat(64), "d".repeat(64), 1);
    const report = pulse(database);
    expect(report).toMatchObject({ activeVisitors: 1, activeSessions: 2,
      pageViews5m: 2, pageViews30m: 5, latestAt: NOW.toISOString() });
    const series = report.series as { bucket: string; pageViews: number; visitors: number }[];
    expect(series).toHaveLength(30);
    expect(series[0].bucket).toBe("2026-09-26T12:05:00.000Z");
    expect(series.at(-1)).toEqual({ bucket: "2026-09-26T12:34:00.000Z", pageViews: 1, visitors: 1 });
    // 30분 범위의 첫 부분 분은 totals에 포함하지만 기존 30개 분 차트에는 포함하지 않는다.
    expect(series.reduce((sum, row) => sum + row.pageViews, 0)).toBe(3);
    expect(series.find((row) => row.bucket === "2026-09-26T12:29:00.000Z"))
      .toEqual({ bucket: "2026-09-26T12:29:00.000Z", pageViews: 2, visitors: 1 });
  });
});
