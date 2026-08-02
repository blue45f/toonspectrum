import { describe, expect, it } from "vitest";

import {
  resolveUpstashQStashConfig,
  UpstashQStashConfigurationError,
  validateUpstashQStashConfig,
} from "./upstash-qstash.config";

const enabledEnvironment = {
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_UPSTASH_QSTASH_ENABLED: "true",
  BACKEND_UPSTASH_QSTASH_BASE_URL: "https://qstash-facade.example",
  BACKEND_UPSTASH_QSTASH_API_BASE_URL: "https://qstash.upstash.io",
  BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN:
    "qstash-publish-token-that-is-server-only",
  BACKEND_UPSTASH_QSTASH_URL_GROUP: "toonspectrum-durable-v1",
};

describe("Upstash QStash durable queue configuration", () => {
  it("is absent while distribution or the provider is disabled", () => {
    expect(resolveUpstashQStashConfig({})).toBeNull();
    expect(
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_DISTRIBUTION_ENABLED: "false",
      })
    ).toBeNull();
    expect(
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_ENABLED: "false",
      })
    ).toBeNull();
  });

  it("resolves bounded defaults for an explicit provider", () => {
    expect(resolveUpstashQStashConfig(enabledEnvironment)).toEqual({
      apiBaseUrl: "https://qstash.upstash.io",
      publishToken: "qstash-publish-token-that-is-server-only",
      urlGroup: "toonspectrum-durable-v1",
      timeoutMs: 2_500,
      deliveryTimeoutSeconds: 30,
      retries: 3,
      maximumRequestBytes: 256 * 1_024,
      maximumResponseBytes: 32 * 1_024,
    });
  });

  it("fails boot for missing publish credentials or URL group", () => {
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN: undefined,
      })
    ).toThrow(UpstashQStashConfigurationError);
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_URL_GROUP: "",
      })
    ).toThrow(UpstashQStashConfigurationError);
  });

  it("rejects an arbitrary HTTPS origin and credential-bearing URL", () => {
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_API_BASE_URL: "https://attacker.example",
      })
    ).toThrow(UpstashQStashConfigurationError);
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_API_BASE_URL:
          "https://user:secret@qstash.upstash.io",
      })
    ).toThrow(UpstashQStashConfigurationError);
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_API_BASE_URL:
          "https://qstash.upstash.io:8443",
      })
    ).toThrow(UpstashQStashConfigurationError);
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_API_BASE_URL:
          "https://qstash-us-east-1-.upstash.io",
      })
    ).toThrow(UpstashQStashConfigurationError);
  });

  it("does not accept the gateway admission secret as the publish token", () => {
    expect(() =>
      resolveUpstashQStashConfig({
        ...enabledEnvironment,
        BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN: undefined,
        BACKEND_UPSTASH_QSTASH_AUTH_TOKEN:
          "gateway-admission-token-must-stay-separate",
      })
    ).toThrow(UpstashQStashConfigurationError);
  });

  it("rejects whitespace/control characters in the bearer credential", () => {
    for (const publishToken of [
      " qstash-publish-token-that-is-server-only",
      "qstash-publish-token-that-is-server-only\n",
      "qstash publish token that is server only",
    ]) {
      expect(() =>
        resolveUpstashQStashConfig({
          ...enabledEnvironment,
          BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN: publishToken,
        })
      ).toThrow(UpstashQStashConfigurationError);
    }
  });

  it("validates hand-built registration config with the same fail-closed contract", () => {
    expect(() =>
      validateUpstashQStashConfig({
        apiBaseUrl: "https://attacker.example",
        publishToken: "qstash-publish-token-that-is-server-only",
        urlGroup: "toonspectrum-durable-v1",
        timeoutMs: 2_500,
        deliveryTimeoutSeconds: 30,
        retries: 3,
        maximumRequestBytes: 256 * 1_024,
        maximumResponseBytes: 32 * 1_024,
      })
    ).toThrow(UpstashQStashConfigurationError);
  });
});
