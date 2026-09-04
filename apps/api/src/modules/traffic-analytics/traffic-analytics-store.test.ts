import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./traffic-analytics-store.ts", import.meta.url),
  "utf8",
);

describe("traffic analytics persistence contract", () => {
  it("commits each page view and its session update atomically", () => {
    expect(source).toContain("WITH inserted_event AS");
    expect(source).toContain("INSERT INTO app_setting");
    expect(source).toContain("SELECT $4, $5::jsonb, $3");
    expect(source).toContain("FROM inserted_event");
    expect(source).toContain("ON CONFLICT (key) DO UPDATE SET");
    expect(source).toContain("'pageViews'");
    expect(source).toContain("'engagedSeconds'");
  });

  it("coordinates retention cleanup through a database lease", () => {
    expect(source).toContain('"traffic:maintenance:retention"');
    expect(source).toContain("WITH cleanup_lease AS");
    expect(source).toContain("WHERE app_setting.\"updatedAt\" < $3");
    expect(source).toContain("DELETE FROM app_setting");
    expect(source).toContain(
      "WHERE EXISTS (SELECT 1 FROM cleanup_lease)",
    );
    expect(source).toContain("TRAFFIC_PAGE_VIEW_PREFIX");
    expect(source).toContain("TRAFFIC_SESSION_UPPER_BOUND");
  });
});
