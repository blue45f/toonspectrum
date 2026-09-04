import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./traffic-analytics-store.ts", import.meta.url),
  "utf8",
);

describe("traffic analytics persistence contract", () => {
  it("commits an idempotent page view and matching session update atomically", () => {
    expect(source).toContain("WITH admitted AS");
    expect(source).toContain("visitor_hash <> $3");
    expect(source).toContain("INSERT INTO public.traffic_page_view");
    expect(source).toContain("ON CONFLICT (id) DO NOTHING");
    expect(source).toContain("FROM inserted_event");
    expect(source).toContain("INSERT INTO public.traffic_session");
    expect(source).toContain("ON CONFLICT (session_hash) DO UPDATE SET");
    expect(source).toContain(
      "public.traffic_session.visitor_hash = EXCLUDED.visitor_hash",
    );
    expect(source).not.toContain("app_setting");
  });

  it("keeps heartbeat engagement monotonic without incrementing page views", () => {
    const heartbeat = source.slice(source.indexOf("persistTrafficHeartbeat"));
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
