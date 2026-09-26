import { describe, expect, it } from "vitest";

import {
  resolveBackendCapabilityPolicy,
  type BackendCapabilityRequest,
} from "./backend-capability-policy";
import {
  BackendCapabilityRouter,
  selectBackendCapabilityProvider,
} from "./backend-capability-router";

const baseEnv = {
  NODE_ENV: "test",
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_WEBHOOK_PROVIDER_ORDER: "cloudflare,supabase",
  BACKEND_CLOUDFLARE_ENABLED: "true",
  BACKEND_CLOUDFLARE_BASE_URL: "https://jobs.example.workers.dev",
  BACKEND_CLOUDFLARE_AUTH_TOKEN:
    "cloudflare-test-token-that-is-at-least-thirty-two-chars",
  BACKEND_CLOUDFLARE_DAILY_REQUEST_BUDGET: "2",
  BACKEND_CLOUDFLARE_DAILY_COST_BUDGET: "10",
  BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "30000",
  BACKEND_CLOUDFLARE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_CONCURRENCY: "1",
  BACKEND_SUPABASE_ENABLED: "true",
  BACKEND_SUPABASE_BASE_URL: "https://project.functions.supabase.co",
  BACKEND_SUPABASE_AUTH_TOKEN:
    "supabase-test-token-that-is-at-least-thirty-two-characters",
  BACKEND_SUPABASE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_SUPABASE_DAILY_COST_BUDGET: "100",
  BACKEND_SUPABASE_MAX_EXECUTION_MS: "150000",
  BACKEND_SUPABASE_MAX_PAYLOAD_BYTES: "2097152",
  BACKEND_SUPABASE_MAX_RESPONSE_BYTES: "2097152",
  BACKEND_SUPABASE_MAX_CONCURRENCY: "5",
  BACKEND_CIRCUIT_FAILURE_THRESHOLD: "2",
  BACKEND_CIRCUIT_COOLDOWN_MS: "10000",
} as const;

const webhookRequest: BackendCapabilityRequest = {
  capability: "async-job",
  workload: "webhook",
  estimatedCostUnits: 3,
  estimatedDurationMs: 10_000,
  payloadBytes: 50_000,
  coldStartTolerant: true,
  durability: "best-effort",
};

describe("backend capability deterministic selection", () => {
  it("selects the first eligible configured provider without exposing credentials", () => {
    const policy = resolveBackendCapabilityPolicy(baseEnv);
    const selection = selectBackendCapabilityProvider(
      policy,
      {},
      webhookRequest,
      Date.UTC(2026, 6, 31)
    );

    expect(selection).toMatchObject({
      available: true,
      providerId: "cloudflare",
      placementRole: "edge-short",
      selectionReason: "workload-affinity",
    });
    expect(JSON.stringify(selection)).not.toContain(
      baseEnv.BACKEND_CLOUDFLARE_AUTH_TOKEN
    );
  });

  it("falls through deterministic order for budgets, duration and open circuits", () => {
    const policy = resolveBackendCapabilityPolicy(baseEnv);
    const now = Date.UTC(2026, 6, 31);
    const selection = selectBackendCapabilityProvider(
      policy,
      {
        cloudflare: {
          day: "2026-07-31",
          requests: 2,
          costUnits: 6,
          inFlight: 0,
          consecutiveFailures: 0,
          circuitOpenUntil: 0,
        },
      },
      webhookRequest,
      now
    );

    expect(selection).toMatchObject({
      available: true,
      providerId: "supabase",
      evaluations: [
        {
          providerId: "cloudflare",
          accepted: false,
          reason: "request-budget",
        },
        { providerId: "supabase", accepted: true },
      ],
    });

    const tooLong = selectBackendCapabilityProvider(
      policy,
      {},
      { ...webhookRequest, estimatedDurationMs: 120_000 },
      now
    );
    expect(tooLong).toMatchObject({
      available: true,
      providerId: "supabase",
      evaluations: [
        { providerId: "cloudflare", reason: "duration" },
        { providerId: "supabase", accepted: true },
      ],
    });
  });

  it("allows development local fallback only for best-effort work", () => {
    const policy = resolveBackendCapabilityPolicy({
      NODE_ENV: "development",
      BACKEND_LOCAL_FALLBACK: "development",
    });
    expect(
      selectBackendCapabilityProvider(
        policy,
        {},
        webhookRequest,
        Date.UTC(2026, 6, 31)
      )
    ).toMatchObject({ available: true, providerId: "local" });

    expect(
      selectBackendCapabilityProvider(
        policy,
        {},
        {
          capability: "object-storage",
          workload: "studio-asset",
          estimatedCostUnits: 1,
          estimatedDurationMs: 1_000,
          payloadBytes: 1_024,
          coldStartTolerant: true,
          durability: "durable",
        },
        Date.UTC(2026, 6, 31)
      )
    ).toMatchObject({ available: false });
  });

  it("does not substitute an edge executor for a full thumbnail container contract", () => {
    const policy = resolveBackendCapabilityPolicy(baseEnv);
    const selection = selectBackendCapabilityProvider(
      policy,
      {},
      {
        capability: "async-job",
        workload: "thumbnail",
        estimatedCostUnits: 5,
        estimatedDurationMs: 120_000,
        payloadBytes: 2_048,
        coldStartTolerant: true,
        durability: "durable",
      },
      Date.UTC(2026, 6, 31)
    );

    expect(selection.available).toBe(false);
    expect(
      selection.evaluations.some(
        (evaluation) =>
          evaluation.providerId === "cloudflare" && evaluation.accepted
      )
    ).toBe(false);
  });
});

describe("backend capability runtime guard", () => {
  it("enforces concurrency and opens a bounded circuit after provider failures", () => {
    const policy = resolveBackendCapabilityPolicy(baseEnv);
    const router = new BackendCapabilityRouter(policy);
    const now = Date.UTC(2026, 6, 31);

    const first = router.acquire(webhookRequest, now);
    expect(first?.providerId).toBe("cloudflare");
    const concurrent = router.acquire(webhookRequest, now);
    expect(concurrent?.providerId).toBe("supabase");

    first?.release("provider-failure", now);
    concurrent?.release("success", now);
    const secondFailure = router.acquire(webhookRequest, now + 1);
    expect(secondFailure?.providerId).toBe("cloudflare");
    secondFailure?.release("provider-failure", now + 1);

    const afterCircuit = router.acquire(webhookRequest, now + 2);
    expect(afterCircuit?.providerId).toBe("supabase");
    expect(router.status(now + 2).providers).toContainEqual(
      expect.objectContaining({
        id: "cloudflare",
        circuit: "open",
      })
    );
  });

  it("makes lease release idempotent and never returns credentials in health status", () => {
    const policy = resolveBackendCapabilityPolicy(baseEnv);
    const router = new BackendCapabilityRouter(policy);
    const lease = router.acquire(
      webhookRequest,
      Date.UTC(2026, 6, 31)
    );

    lease?.release("success", Date.UTC(2026, 6, 31));
    lease?.release("provider-failure", Date.UTC(2026, 6, 31));

    const status = router.status(Date.UTC(2026, 6, 31));
    expect(status).toMatchObject({
      distributionEnabled: true,
      authoritativeCore: "nestjs-postgres",
    });
    expect(status.providers).toContainEqual(
      expect.objectContaining({
        id: "cloudflare",
        inFlight: 0,
        circuit: "closed",
      })
    );
    expect(JSON.stringify(status)).not.toContain(
      baseEnv.BACKEND_CLOUDFLARE_AUTH_TOKEN
    );
  });
});
