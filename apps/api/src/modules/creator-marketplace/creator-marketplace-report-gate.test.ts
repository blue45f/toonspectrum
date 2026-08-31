import { describe, expect, it } from "vitest";

import {
  CREATOR_MARKETPLACE_REPORT_GATE_RETENTION_MS,
  CREATOR_MARKETPLACE_REPORT_LIMIT,
  CREATOR_MARKETPLACE_REPORT_WINDOW_MS,
  creatorMarketplaceReporterKey,
  isCreatorMarketplaceReporterKey,
} from "./creator-marketplace-report-gate";

describe("Creator Marketplace report admission key", () => {
  it("derives a stable domain-separated digest without retaining the user id", () => {
    const reporterId = "private-reporting-user";
    const digest = creatorMarketplaceReporterKey(reporterId);

    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest).toHaveLength(32);
    expect(Buffer.from(digest).toString("utf8")).not.toContain(reporterId);
    expect(creatorMarketplaceReporterKey(reporterId)).toEqual(digest);
    expect(creatorMarketplaceReporterKey(`other-${reporterId}`)).not.toEqual(digest);
    expect(isCreatorMarketplaceReporterKey(digest)).toBe(true);
    expect(isCreatorMarketplaceReporterKey(new Uint8Array(31))).toBe(false);
  });

  it("rejects malformed actor identities and pins bounded daily retention", () => {
    expect(() => creatorMarketplaceReporterKey("")).toThrow(/identity/iu);
    expect(() => creatorMarketplaceReporterKey("x".repeat(161))).toThrow(/identity/iu);
    expect(CREATOR_MARKETPLACE_REPORT_LIMIT).toBe(20);
    expect(CREATOR_MARKETPLACE_REPORT_WINDOW_MS).toBe(24 * 60 * 60_000);
    expect(CREATOR_MARKETPLACE_REPORT_GATE_RETENTION_MS).toBe(
      2 * CREATOR_MARKETPLACE_REPORT_WINDOW_MS
    );
  });
});
