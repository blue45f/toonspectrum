import { describe, expect, it } from "vitest";

import {
  StudioRealtimeRevocationConfigurationError,
  resolveStudioRealtimeRevocationConfiguration,
} from "./studio-realtime-revocation.configuration";

const TICKET_SECRET = "ticket-secret-0123456789abcdef0123456789"; // gitleaks:allow -- deterministic unit-test fixture
const CONTROL_SECRET = "control-secret-0123456789abcdef0123456789"; // gitleaks:allow -- deterministic unit-test fixture

function enabledEnvironment(): NodeJS.ProcessEnv {
  return {
    STUDIO_REALTIME_REVOCATION_ENABLED: "true",
    STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL:
      "https://realtime.example.com/v1/control/revocations",
    STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET: CONTROL_SECRET,
    STUDIO_REALTIME_CLOUDFLARE_CONTROL_TIMEOUT_MS: "3000",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: TICKET_SECRET,
  };
}

describe("Studio realtime revocation configuration", () => {
  it("stays disabled without activating a partial control plane", () => {
    expect(resolveStudioRealtimeRevocationConfiguration({})).toEqual({
      enabled: false,
    });
  });

  it("accepts only the exact HTTPS control endpoint and distinct secrets", () => {
    expect(
      resolveStudioRealtimeRevocationConfiguration(enabledEnvironment()),
    ).toEqual({
      enabled: true,
      controlUrl: "https://realtime.example.com/v1/control/revocations",
      controlSecret: CONTROL_SECRET,
      timeoutMs: 3000,
    });
  });

  it.each([
    { STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET: undefined },
    { STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET: TICKET_SECRET },
    {
      STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL:
        "https://realtime.example.com/v1/control/revocations?secret=bad",
    },
    { STUDIO_REALTIME_CLOUDFLARE_CONTROL_TIMEOUT_MS: "20000" },
  ])("fails closed for partial or unsafe activation", (override) => {
    expect(() =>
      resolveStudioRealtimeRevocationConfiguration({
        ...enabledEnvironment(),
        ...override,
      }),
    ).toThrow(StudioRealtimeRevocationConfigurationError);
  });
});
