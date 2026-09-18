import { describe, expect, it } from "vitest";

import { resolveSupporterPaymentConfig } from "./supporter-payment.config";

const testPair = {
  TOSS_PAYMENTS_CLIENT_KEY: "test_ck_example",
  TOSS_PAYMENTS_SECRET_KEY: "test_sk_example",
};

describe("supporter payment configuration", () => {
  it("fails closed unless the supporter switch is explicit", () => {
    const config = resolveSupporterPaymentConfig(testPair);
    expect(config.checkoutEnabled).toBe(false);
    expect(config.serverReady).toBe(true);
    expect(config.mode).toBe("test");
    expect(config.disabledReason).toBe("disabled");
    expect(config.clientKey).toBeNull();
  });

  it("enables matching test keys without enabling production cost policy", () => {
    const config = resolveSupporterPaymentConfig({
      ...testPair,
      SUPPORTER_PAYMENTS_ENABLED: "true",
    });
    expect(config.checkoutEnabled).toBe(true);
    expect(config.mode).toBe("test");
    expect(config.clientKey).toBe(testPair.TOSS_PAYMENTS_CLIENT_KEY);
  });
  it("rejects mixed test and live credentials", () => {
    const config = resolveSupporterPaymentConfig({
      TOSS_PAYMENTS_CLIENT_KEY: "test_ck_example",
      TOSS_PAYMENTS_SECRET_KEY: "live_sk_example",
      SUPPORTER_PAYMENTS_ENABLED: "true",
    });
    expect(config.checkoutEnabled).toBe(false);
    expect(config.disabledReason).toBe("key-mode-mismatch");
  });

  it("keeps matching live keys disabled without both live gates", () => {
    const config = resolveSupporterPaymentConfig({
      TOSS_PAYMENTS_CLIENT_KEY: "live_ck_example",
      TOSS_PAYMENTS_SECRET_KEY: "live_sk_example",
      SUPPORTER_PAYMENTS_ENABLED: "true",
      PRODUCTION_INTEGRATION_COST_POLICY: "zero-cost-only",
      PRODUCTION_TOSS_ALLOW_LIVE: "true",
    });
    expect(config.checkoutEnabled).toBe(false);
    expect(config.disabledReason).toBe("live-disabled");
  });

  it("allows live only with explicit cost policy and live switch", () => {
    const config = resolveSupporterPaymentConfig({
      TOSS_PAYMENTS_CLIENT_KEY: "live_ck_example",
      TOSS_PAYMENTS_SECRET_KEY: "live_sk_example",
      SUPPORTER_PAYMENTS_ENABLED: "true",
      PRODUCTION_INTEGRATION_COST_POLICY: "explicit-cost-enabled",
      PRODUCTION_TOSS_ALLOW_LIVE: "true",
    });
    expect(config.checkoutEnabled).toBe(true);
    expect(config.serverReady).toBe(true);
    expect(config.mode).toBe("live");
    expect(config.clientKey).toBe("live_ck_example");
  });

  it("never exposes malformed key pairs", () => {
    const config = resolveSupporterPaymentConfig({
      TOSS_PAYMENTS_CLIENT_KEY: "client_key",
      TOSS_PAYMENTS_SECRET_KEY: "secret_key",
      SUPPORTER_PAYMENTS_ENABLED: "true",
    });
    expect(config.checkoutEnabled).toBe(false);
    expect(config.disabledReason).toBe("invalid-keys");
    expect(config.clientKey).toBeNull();
  });
});
