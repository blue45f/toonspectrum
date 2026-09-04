import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./traffic-analytics-store.ts", import.meta.url),
  "utf8",
);

describe("traffic analytics persistence contract", () => {
  it("claims session ownership before inserting an idempotent page view", () => {
    const sessionUpsert = source.indexOf("WITH admitted_session AS");
    const eventInsert = source.indexOf(
      "INSERT INTO public.traffic_page_view",
      sessionUpsert,
    );
    const viewIncrement = source.indexOf(
      "SET page_views = target.page_views + 1",
      eventInsert,
    );

    expect(sessionUpsert).toBeGreaterThan(-1);
    expect(eventInsert).toBeGreaterThan(sessionUpsert);
    expect(viewIncrement).toBeGreaterThan(eventInsert);
    expect(source).toContain("FROM admitted_session");
    expect(source).toContain("ON CONFLICT (id) DO NOTHING");
    expect(source).toContain("RETURNING session_hash, visitor_hash");
    expect(source).toContain(
      "public.traffic_session.visitor_hash = EXCLUDED.visitor_hash",
    );
    expect(source).toContain(
      "target.visitor_hash = inserted_event.visitor_hash",
    );
    expect(source).not.toContain("WITH admitted AS");
    expect(source).not.toContain("app_setting");
  });

  it("increments page views only for a newly inserted event", () => {
    const pageViewPersistence = source.slice(
      source.indexOf("persistTrafficPageView"),
      source.indexOf("persistTrafficHeartbeat"),
    );
    expect(pageViewPersistence).toContain(
      "UPDATE public.traffic_session AS target",
    );
    expect(pageViewPersistence).toContain("FROM inserted_event");
    expect(pageViewPersistence).toContain(
      "SET page_views = target.page_views + 1",
    );
    expect(pageViewPersistence).not.toContain(
      "public.traffic_session.page_views + 1",
    );
  });

  it("recovers acquisition metadata when a heartbeat arrives before the first page view", () => {
    const pageViewPersistence = source.slice(
      source.indexOf("persistTrafficPageView"),
      source.indexOf("persistTrafficHeartbeat"),
    );
    expect(pageViewPersistence).toContain(
      "WHEN public.traffic_session.page_views = 0",
    );
    expect(pageViewPersistence).toContain("THEN EXCLUDED.entry_path");
    expect(pageViewPersistence).toContain("THEN EXCLUDED.referrer_host");
    expect(pageViewPersistence).toContain("THEN EXCLUDED.source");
    expect(pageViewPersistence).toContain("THEN EXCLUDED.medium");
    expect(pageViewPersistence).toContain("THEN EXCLUDED.campaign");
  });

  it("keeps latest-path metadata and heartbeat engagement monotonic", () => {
    const heartbeat = source.slice(source.indexOf("persistTrafficHeartbeat"));
    expect(source).toContain(
      "WHEN EXCLUDED.last_seen_at >= public.traffic_session.last_seen_at",
    );
    expect(
      source.match(/NULLIF\(EXCLUDED\.screen_class, 'unknown'\)/gu),
    ).toHaveLength(2);
    expect(heartbeat).toContain("engaged_seconds = GREATEST(");
    expect(heartbeat).not.toContain(
      "page_views = public.traffic_session.page_views + 1",
    );
    expect(heartbeat).toContain(
      "public.traffic_session.visitor_hash = EXCLUDED.visitor_hash",
    );
  });

  it("coordinates retention cleanup with a PostgreSQL advisory lock", () => {
    expect(source).toContain(
      '"toonspectrum:traffic-analytics:retention:v2"',
    );
    expect(source).toContain("pg_try_advisory_xact_lock(hashtext($1))");
    expect(source).toContain("DELETE FROM public.traffic_page_view");
    expect(source).toContain("DELETE FROM public.traffic_session");
    expect(source).toContain("occurred_at < $2");
    expect(source).toContain("last_seen_at < $2");
  });
});
