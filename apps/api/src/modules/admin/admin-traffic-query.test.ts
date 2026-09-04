import { describe, expect, it } from "vitest";

import {
  ADMIN_TRAFFIC_OVERVIEW_QUERY,
  ADMIN_TRAFFIC_PULSE_QUERY,
} from "./admin-traffic-query";

describe("admin traffic query contracts", () => {
  it("uses typed time-indexed relations instead of the settings key-value store", () => {
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain(
      "FROM public.traffic_page_view",
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain(
      "FROM public.traffic_session",
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain(
      "occurred_at >= $1::timestamptz",
    );
    expect(ADMIN_TRAFFIC_PULSE_QUERY).toContain(
      "last_seen_at >= $1::timestamptz",
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toContain("app_setting");
    expect(ADMIN_TRAFFIC_PULSE_QUERY).not.toContain("app_setting");
    // `->>` is the tell for reading traffic out of a JSON blob, which is what this contract
    // forbids. Building jsonb *output* is not — the aggregates COALESCE to `'[]'::jsonb`, and the
    // key-value store itself is already ruled out by the `app_setting` assertions above.
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(/->>/u);
    expect(ADMIN_TRAFFIC_PULSE_QUERY).not.toMatch(/->>/u);
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

  it("publishes the dedicated storage version and avoids duplicate clauses", () => {
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).toContain(
      "'storageMode', 'first-party-postgres-v2'",
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(
      /FROM events\s+FROM events/iu,
    );
    expect(ADMIN_TRAFFIC_OVERVIEW_QUERY).not.toMatch(
      /'label',\s*label,\s*'label',\s*label/iu,
    );
  });
});
