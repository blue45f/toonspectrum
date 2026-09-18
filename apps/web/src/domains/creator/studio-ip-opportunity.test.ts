import { describe, expect, it } from "vitest";

import {
  createStudioIpOpportunityDocument,
  evaluateStudioIpReadiness,
} from "./studio-ip-opportunity";

describe("studio IP opportunity readiness", () => {
  it("blocks a pitch while the chain of title is unknown", () => {
    const report = evaluateStudioIpReadiness(createStudioIpOpportunityDocument("project-1"));
    expect(report.status).toBe("blocked");
    expect(report.issues).toContain("rights-status-unknown");
  });

  it("becomes ready when rights and pitch essentials are complete", () => {
    const report = evaluateStudioIpReadiness({
      ...createStudioIpOpportunityDocument("project-1"),
      rightsStatus: "owned",
      sourceRightsVerified: true,
      contributorAgreementsComplete: true,
      assetRightsVerified: true,
      logline: "A creator races to finish the impossible episode.",
      synopsis: "A complete synopsis.",
      audience: "Young adult fantasy readers",
      creatorBio: "Creator team bio",
      contact: "rights@example.test",
    });
    expect(report.status).toBe("ready");
    expect(report.score).toBe(100);
  });
});
