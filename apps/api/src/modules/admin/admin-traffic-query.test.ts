import { describe, expect, it } from "vitest";

import {
  ADMIN_TRAFFIC_OVERVIEW_QUERY,
  ADMIN_TRAFFIC_PULSE_QUERY,
} from "./admin-traffic-query";

describe("admin traffic query contracts", () => {
  it("uses indexable key ranges instead of wildcard scans", () => {
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("WHERE key >= $2");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("AND key < $3");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("WHERE key >= $7");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("AND key < $10");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(/key\s+LIKE/iu);
    expect(ADMIN_TRAFFIC_PULSE_QUERY).not.toMatch(/key\s+LIKE/iu);
  });

  it("zero-fills historical and realtime chart buckets", () => {
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("series_buckets AS");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("realtime_buckets AS");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain("generate_series");
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain(
      "LEFT JOIN series_aggregates AS aggregate USING (bucket)",
    );
    expect(ADMIN_TRAFFIC_PULSE_QUERY).toContain(
      "LEFT JOIN realtime_aggregates AS aggregate USING (bucket)",
    );
  });

  it("does not regress duplicate clauses or duplicate JSON keys", () => {
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(
      /FROM events\s+FROM events/iu,
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(
      /'label',\s*label,\s*'label',\s*label/iu,
    );
  });
});
