import { describe, expect, it } from "vitest";

import { resolveCreatorSupportPayoutConfig } from "./creator-support.config";

describe("creator support payout configuration", () => {
  it("is disabled by default", () => {
    expect(resolveCreatorSupportPayoutConfig({})).toMatchObject({
      ready: false,
      requested: false,
      disabledReason: "disabled",
    });
  });

  it("requires a payment secret", () => {
    expect(resolveCreatorSupportPayoutConfig({
      CREATOR_SUPPORT_PAYOUTS_ENABLED: "true",
    }).disabledReason).toBe("missing-payment-secret");
  });

  it("requires a 64-hex payout security key", () => {
    expect(resolveCreatorSupportPayoutConfig({
      CREATOR_SUPPORT_PAYOUTS_ENABLED: "true",
      TOSS_PAYMENTS_SECRET_KEY: "test_secret",
      TOSS_PAYOUTS_SECURITY_KEY: "not-a-security-key",
    }).disabledReason).toBe("missing-security-key");
  });

  it("keeps payouts closed when explicit-cost policy is not enabled", () => {
    expect(resolveCreatorSupportPayoutConfig({
      CREATOR_SUPPORT_PAYOUTS_ENABLED: "true",
      TOSS_PAYMENTS_SECRET_KEY: "test_secret",
      TOSS_PAYOUTS_SECURITY_KEY: "a".repeat(64),
      PRODUCTION_INTEGRATION_COST_POLICY: "zero-cost-only",
    }).disabledReason).toBe("cost-policy-disabled");
  });

  it("reports prerequisites ready only after every explicit guard is present", () => {
    expect(resolveCreatorSupportPayoutConfig({
      CREATOR_SUPPORT_PAYOUTS_ENABLED: "true",
      TOSS_PAYMENTS_SECRET_KEY: "test_secret",
      TOSS_PAYOUTS_SECURITY_KEY: "a".repeat(64),
      PRODUCTION_INTEGRATION_COST_POLICY: "explicit-cost-enabled",
    })).toMatchObject({
      ready: true,
      requested: true,
      disabledReason: null,
    });
  });
});
