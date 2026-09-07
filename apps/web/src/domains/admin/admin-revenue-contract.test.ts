import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const webClient = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/components/admin-client.ts"),
  "utf8",
);
const webRevenue = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/components/AdminRevenue.tsx"),
  "utf8",
);
const apiRevenue = readFileSync(
  join(process.cwd(), "apps/api/src/modules/admin/admin-revenue.service.ts"),
  "utf8",
);

describe("admin revenue contract", () => {
  it("uses cents-suffixed amount names consistently across API and UI", () => {
    for (const field of [
      "pendingAmountCents",
      "approvedAmountCents",
      "paidAmountCents",
      "rejectedAmountCents",
      "revokedAmountCents",
    ]) {
      expect(webClient).toContain(`${field}: number`);
      expect(apiRevenue).toContain(`${field}: toNumber`);
      expect(webRevenue).toContain(`summary.${field}`);
    }
  });

  it("keeps period summaries independent from the selected row status", () => {
    expect(apiRevenue).toContain(".where(periodWhereClause)");
    expect(apiRevenue).toContain(".where(eventWhereClause)");
    expect(apiRevenue).toContain('parsedQuery.status === "all"');
  });

  it("moves approved events to paid before recording settlement", () => {
    expect(webRevenue).toMatch(
      /event\.status === "approved"[\s\S]*status: "paid"/,
    );
    expect(webRevenue).toMatch(
      /event\.status === "paid" && !event\.settledAt[\s\S]*kind: "settle"/,
    );
  });

  it("records individual status, settlement, and export audit actions", () => {
    expect(apiRevenue).toContain('"REVENUE_STATUS_CHANGE"');
    expect(apiRevenue).toContain('"REVENUE_SETTLEMENT_CHANGE"');
    expect(apiRevenue).toContain('"REVENUE_EXPORT_CSV"');
  });
});
