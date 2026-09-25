import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTEGRATION_RUNTIME_DAILY_LIMIT,
  IntegrationRuntimeQuotaConfigurationError,
  integrationRuntimeUtcWindow,
  resolveIntegrationRuntimeDailyLimit,
} from "./integration-runtime.repository";

describe("integration runtime durable quota", () => {
  it("uses a bounded default and accepts an explicit safe override", () => {
    expect(resolveIntegrationRuntimeDailyLimit({})).toBe(
      DEFAULT_INTEGRATION_RUNTIME_DAILY_LIMIT,
    );
    expect(resolveIntegrationRuntimeDailyLimit({
      INTEGRATION_RUNTIME_DAILY_EXECUTIONS_PER_ACTOR: "25",
    })).toBe(25);
  });

  it.each(["0", "1001", "1.5", "invalid", "-1"])(
    "fails closed for an invalid daily limit: %s",
    (value) => {
      expect(() => resolveIntegrationRuntimeDailyLimit({
        INTEGRATION_RUNTIME_DAILY_EXECUTIONS_PER_ACTOR: value,
      })).toThrow(IntegrationRuntimeQuotaConfigurationError);
    },
  );

  it("uses UTC day boundaries independent of the local timezone", () => {
    const window = integrationRuntimeUtcWindow(
      new Date("2026-09-25T23:59:59.999Z"),
    );
    expect(window.start.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(window.resetAt.toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(window.key).toBe("2026-09-25");
  });
});
