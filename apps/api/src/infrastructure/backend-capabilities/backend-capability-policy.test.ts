import { describe, expect, it, vi } from "vitest";

import {
  BACKEND_PRIMARY_WORKLOAD_OWNERS,
  resolveBackendCapabilityPolicy,
} from "./backend-capability-policy";

const configuredCloudflare = {
  BACKEND_CLOUDFLARE_ENABLED: "true",
  BACKEND_CLOUDFLARE_BASE_URL: "https://jobs.example.workers.dev",
  BACKEND_CLOUDFLARE_AUTH_TOKEN:
    "cloudflare-test-token-that-is-at-least-thirty-two-chars",
  BACKEND_CLOUDFLARE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_CLOUDFLARE_DAILY_COST_BUDGET: "1000",
  BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "30000",
  BACKEND_CLOUDFLARE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_CONCURRENCY: "4",
} as const;

const configuredCloudRun = {
  BACKEND_CLOUD_RUN_ENABLED: "true",
  BACKEND_CLOUD_RUN_BASE_URL: "https://thumbnail-worker.example.run.app",
  BACKEND_CLOUD_RUN_AUTH_TOKEN:
    "cloud-run-test-token-that-is-at-least-thirty-two-characters",
  BACKEND_CLOUD_RUN_DAILY_REQUEST_BUDGET: "20",
  BACKEND_CLOUD_RUN_DAILY_COST_BUDGET: "1000",
  BACKEND_CLOUD_RUN_MAX_EXECUTION_MS: "600000",
  BACKEND_CLOUD_RUN_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUD_RUN_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUD_RUN_MAX_CONCURRENCY: "2",
} as const;

describe("backend capability policy", () => {
  it("is entirely disabled without explicit global and provider opt-ins", () => {
    const logger = { warn: vi.fn() };
    const policy = resolveBackendCapabilityPolicy(
      { NODE_ENV: "production" },
      logger
    );

    expect(policy.enabled).toBe(false);
    expect(policy.localFallback).toBe("disabled");
    expect(Object.values(policy.providers).every((provider) => !provider.enabled))
      .toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("enables only a fully configured provider with explicit hard budgets", () => {
    const logger = { warn: vi.fn() };
    const policy = resolveBackendCapabilityPolicy(
      {
        NODE_ENV: "production",
        BACKEND_DISTRIBUTION_ENABLED: "true",
        ...configuredCloudflare,
      },
      logger
    );

    expect(policy.providers.cloudflare).toMatchObject({
      enabled: true,
      dailyRequestBudget: 100,
      dailyCostBudget: 1000,
      maxConcurrency: 4,
    });
    expect(policy.providers.supabase.enabled).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("fails a provider closed for missing budget, weak token or insecure production URL", () => {
    const logger = { warn: vi.fn() };
    const policy = resolveBackendCapabilityPolicy(
      {
        NODE_ENV: "production",
        BACKEND_DISTRIBUTION_ENABLED: "true",
        BACKEND_RENDER_ENABLED: "true",
        BACKEND_RENDER_BASE_URL: "http://render.example.test",
        BACKEND_RENDER_AUTH_TOKEN: "weak",
      },
      logger
    );

    expect(policy.providers.render.enabled).toBe(false);
    expect(policy.configurationIssues).toContain("render:invalid-config");
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("weak");

    const padded = resolveBackendCapabilityPolicy({
      NODE_ENV: "production",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      ...configuredCloudflare,
      BACKEND_CLOUDFLARE_AUTH_TOKEN:
        ` ${configuredCloudflare.BACKEND_CLOUDFLARE_AUTH_TOKEN}`,
    });
    expect(padded.providers.cloudflare.enabled).toBe(false);
    expect(padded.configurationIssues).toContain("cloudflare:invalid-config");
  });

  it("rejects provider origins containing credentials, paths, queries or fragments", () => {
    const policy = resolveBackendCapabilityPolicy({
      NODE_ENV: "production",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      ...configuredCloudflare,
      BACKEND_CLOUDFLARE_BASE_URL:
        "https://user:password@gateway.example/nested?target=other#token",
    });

    expect(policy.providers.cloudflare.enabled).toBe(false);
    expect(policy.configurationIssues).toContain(
      "cloudflare:incomplete-or-insecure-config"
    );
  });

  it("permits localhost only outside production and blocks local fallback in production", () => {
    const development = resolveBackendCapabilityPolicy({
      NODE_ENV: "development",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      BACKEND_LOCAL_FALLBACK: "development",
      ...configuredCloudflare,
      BACKEND_CLOUDFLARE_BASE_URL: "http://127.0.0.1:8787",
    });
    expect(development.providers.cloudflare.enabled).toBe(true);
    expect(development.localFallback).toBe("development");

    const production = resolveBackendCapabilityPolicy({
      NODE_ENV: "production",
      BACKEND_DISTRIBUTION_ENABLED: "false",
      BACKEND_LOCAL_FALLBACK: "development",
    });
    expect(production.localFallback).toBe("disabled");
    expect(production.configurationIssues).toContain(
      "local:production-fallback-blocked"
    );
  });

  it("rejects an order containing a provider that cannot serve the capability", () => {
    const policy = resolveBackendCapabilityPolicy({
      NODE_ENV: "test",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      BACKEND_STUDIO_ASSET_PROVIDER_ORDER: "vercel,cloudflare",
      ...configuredCloudflare,
    });

    expect(policy.workloadProviderOrder["studio-asset"]).toEqual([]);
    expect(policy.configurationIssues).toContain(
      "studio-asset:invalid-provider-order"
    );
  });

  it("uses workload-specialized placement and env-safe hyphenated provider IDs", () => {
    const policy = resolveBackendCapabilityPolicy({
      NODE_ENV: "production",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      ...configuredCloudRun,
    });

    expect(policy.providers["cloud-run"]).toMatchObject({
      enabled: true,
      placementRoles: new Set(["container-worker", "realtime-relay"]),
    });
    expect(policy.workloadProviderOrder.thumbnail[0]).toBe("cloud-run");
    expect(policy.workloadProviderOrder.webhook[0]).toBe("cloudflare");
    expect(policy.workloadProviderOrder.cleanup[0]).toBe("upstash-qstash");
    expect(policy.workloadProviderOrder["studio-asset"][0]).toBe("supabase");
    expect(policy.workloadProviderOrder.comments[0]).toBe("cloudflare");
    expect(policy.workloadProviderOrder.presence.slice(0, 3)).toEqual([
      "cloudflare",
      "supabase",
      "firebase",
    ]);
    expect(BACKEND_PRIMARY_WORKLOAD_OWNERS).toMatchObject({
      thumbnail: "cloud-run",
      webhook: "cloudflare",
      cleanup: "upstash-qstash",
      "studio-asset": "supabase",
      presence: "cloudflare",
      comments: "cloudflare",
      "screen-signaling": "cloudflare",
    });
  });

  it("fails a workload order closed when a provider has the capability but not the exact role", () => {
    const policy = resolveBackendCapabilityPolicy({
      NODE_ENV: "test",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      BACKEND_THUMBNAIL_PROVIDER_ORDER: "vercel",
    });

    expect(policy.workloadProviderOrder.thumbnail).toEqual([]);
    expect(policy.configurationIssues).toContain(
      "thumbnail:invalid-provider-order"
    );
  });
});
