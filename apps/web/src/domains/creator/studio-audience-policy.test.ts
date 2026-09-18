import { describe, expect, it } from "vitest";

import {
  createStudioAudiencePolicy,
  evaluateStudioAudiencePolicy,
} from "./studio-audience-policy";

describe("studio audience policy", () => {
  it("keeps general-audience projects ready by default", () => {
    expect(evaluateStudioAudiencePolicy(createStudioAudiencePolicy()).status).toBe("ready");
  });

  it("blocks officially restricted media until rating and verification gates are configured", () => {
    const report = evaluateStudioAudiencePolicy({
      ...createStudioAudiencePolicy(),
      restrictedMediaClassification: "officially-restricted",
      rating: "15",
    });
    expect(report.status).toBe("blocked");
    expect(report.issues).toContain("official-restriction-rating-must-be-19");
    expect(report.issues).toContain("age-and-identity-verification-required");
  });

  it("accepts an adult gate plus identity verification for restricted media", () => {
    const report = evaluateStudioAudiencePolicy({
      ...createStudioAudiencePolicy(),
      restrictedMediaClassification: "officially-restricted",
      rating: "19",
      advisories: ["violence"],
      adultAccessGateEnabled: true,
      identityVerificationRequired: true,
    });
    expect(report.status).toBe("ready");
  });
});
