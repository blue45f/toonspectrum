import { describe, expect, it } from "vitest";

import { resolvePaymentRuntimeSummary } from "./payment-runtime-observability";

describe("payment runtime observability", () => {
  it("reports test readiness without exposing payment credentials", () => {
    const clientKey = "test_ck_observability";
    const secretKey = "test_sk_observability";
    const summary = resolvePaymentRuntimeSummary({
      NODE_ENV: "production",
      SUPPORTER_PAYMENTS_ENABLED: "true",
      COMMERCE_PAYMENTS_ENABLED: "true",
      TOSS_PAYMENTS_CLIENT_KEY: clientKey,
      TOSS_PAYMENTS_SECRET_KEY: secretKey,
    });

    expect(summary).toEqual({
      supporter: {
        checkoutEnabled: true,
        serverReady: true,
        mode: "test",
        liveAllowed: false,
        disabledReason: null,
      },
      commerce: {
        checkoutEnabled: true,
        providerMode: "test",
        disabledReason: null,
      },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(clientKey);
    expect(serialized).not.toContain(secretKey);
  });

  it("reports live payment gates as fail closed", () => {
    const summary = resolvePaymentRuntimeSummary({
      NODE_ENV: "production",
      SUPPORTER_PAYMENTS_ENABLED: "true",
      COMMERCE_PAYMENTS_ENABLED: "true",
      TOSS_PAYMENTS_CLIENT_KEY: "live_ck_observability",
      TOSS_PAYMENTS_SECRET_KEY: "live_sk_observability",
      PRODUCTION_INTEGRATION_COST_POLICY: "zero-cost-only",
      PRODUCTION_TOSS_ALLOW_LIVE: "true",
    });

    expect(summary.supporter.checkoutEnabled).toBe(false);
    expect(summary.supporter.disabledReason).toBe("live-disabled");
    expect(summary.commerce.checkoutEnabled).toBe(false);
    expect(summary.commerce.disabledReason).toBe("live-disabled");
  });
});
