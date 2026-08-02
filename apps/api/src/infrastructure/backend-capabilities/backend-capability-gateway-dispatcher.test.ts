import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { BackendCapabilitiesModule } from "./backend-capabilities.module";
import {
  BackendCapabilityCoordinationGate,
} from "./backend-capability-coordination-gate";
import {
  BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
  BACKEND_CAPABILITY_GATEWAY_PATH,
  BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER,
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  canonicalJsonStringify,
} from "./backend-capability-gateway-contract";
import {
  BackendCapabilityGatewayDispatcher,
  type BackendCapabilityGatewayRuntime,
} from "./backend-capability-gateway-dispatcher";
import {
  BACKEND_GATEWAY_HARD_MAX_BODY_BYTES,
  resolveBackendCapabilityPolicy,
} from "./backend-capability-policy";
import { BackendCapabilityRouter } from "./backend-capability-router";

import type { UpstashCoordinationPort } from "../upstash-coordination/upstash-coordination.port";

const fixedNow = Date.UTC(2026, 6, 31, 12, 0, 0);
const fixedNonce = "00000000-0000-4000-8000-000000000001";

const gatewayEnv = {
  NODE_ENV: "test",
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_GATEWAY_MAX_ATTEMPTS: "3",
  BACKEND_CIRCUIT_FAILURE_THRESHOLD: "1",
  BACKEND_CIRCUIT_COOLDOWN_MS: "10000",
  BACKEND_CLOUDFLARE_ENABLED: "true",
  BACKEND_CLOUDFLARE_BASE_URL: "https://cloudflare-gateway.example",
  BACKEND_CLOUDFLARE_AUTH_TOKEN:
    "cloudflare-test-token-that-is-at-least-thirty-two-chars",
  BACKEND_CLOUDFLARE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_CLOUDFLARE_DAILY_COST_BUDGET: "1000",
  BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "30000",
  BACKEND_CLOUDFLARE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_CONCURRENCY: "4",
  BACKEND_SUPABASE_ENABLED: "true",
  BACKEND_SUPABASE_BASE_URL: "https://supabase-gateway.example",
  BACKEND_SUPABASE_AUTH_TOKEN:
    "supabase-test-token-that-is-at-least-thirty-two-characters",
  BACKEND_SUPABASE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_SUPABASE_DAILY_COST_BUDGET: "1000",
  BACKEND_SUPABASE_MAX_EXECUTION_MS: "30000",
  BACKEND_SUPABASE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_SUPABASE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_SUPABASE_MAX_CONCURRENCY: "4",
} as const;

const command = {
  tenantId: "tenant-1",
  capability: "async-job",
  workload: "webhook",
  estimatedCostUnits: 2,
  estimatedDurationMs: 10_000,
  durability: "durable",
  idempotencyKey: "webhook-job-001",
  idempotent: true,
  payload: {
    eventId: "event-1",
    event: { kind: "asset.published", resourceId: "asset-1" },
  },
} as const;

function gatewayResponse(
  provider: "cloudflare" | "supabase",
  overrides: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({
      version: BACKEND_CAPABILITY_GATEWAY_VERSION,
      provider,
      idempotencyKey: command.idempotencyKey,
      outcome: "completed",
      retryable: false,
      fidelity: "exact",
      result: { assetId: "thumbnail-1" },
      errorCode: null,
      ...overrides,
    }),
    {
      status: 200,
      headers: { "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE },
    }
  );
}

function createDispatcher(
  fetchImplementation: BackendCapabilityGatewayRuntime["fetch"],
  env: Record<string, string> = gatewayEnv,
  coordination: UpstashCoordinationPort | null = coordinationMock()
) {
  const policy = resolveBackendCapabilityPolicy(env);
  const router = new BackendCapabilityRouter(policy);
  const runtime: BackendCapabilityGatewayRuntime = {
    fetch: fetchImplementation,
    now: () => fixedNow,
    nonce: () => fixedNonce,
  };
  const coordinationGate = new BackendCapabilityCoordinationGate(
    policy,
    coordination,
    runtime
  );
  return {
    dispatcher: new BackendCapabilityGatewayDispatcher(
      policy,
      router,
      runtime,
      coordinationGate
    ),
    router,
  };
}

type CoordinationMock = UpstashCoordinationPort & {
  [Key in keyof UpstashCoordinationPort]: ReturnType<typeof vi.fn>;
};

function coordinationMock(): CoordinationMock {
  return {
    acquireLease: vi.fn(async () => ({
      acquired: true,
      remainingTtlMs: 60_000,
    })),
    renewLease: vi.fn(async () => ({
      matched: true,
      remainingTtlMs: 60_000,
    })),
    releaseLease: vi.fn(async () => ({
      matched: true,
      remainingTtlMs: null,
    })),
    reserveIdempotencyReceipt: vi.fn(async () => ({
      reserved: true,
      state: "pending",
      remainingTtlMs: 86_400_000,
    })),
    completeIdempotencyReceipt: vi.fn(async () => ({
      outcome: "completed",
    })),
    recordProviderFailure: vi.fn(async () => ({
      state: "open",
      consecutiveFailures: 1,
      openedUntilEpochMs: fixedNow + 10_000,
      observedAtEpochMs: fixedNow,
    })),
    closeProviderCircuit: vi.fn(async () => ({
      state: "closed",
      consecutiveFailures: 0,
      openedUntilEpochMs: 0,
      observedAtEpochMs: fixedNow,
    })),
    readProviderCircuit: vi.fn(async () => ({
      state: "closed",
      consecutiveFailures: 0,
      openedUntilEpochMs: 0,
      observedAtEpochMs: fixedNow,
    })),
    consumeProviderBudget: vi.fn(async () => ({
      accepted: true,
      duplicate: false,
      requestUnits: 1,
      costUnits: command.estimatedCostUnits,
      windowId: "utc-day:20665",
      remainingTtlMs: 46_800_000,
    })),
  } as CoordinationMock;
}

describe("backend capability HTTPS gateway dispatcher", () => {
  it("accepts the versioned gateway media type when the HTTP server adds charset", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(async () => {
      const response = gatewayResponse("cloudflare");
      response.headers.set(
        "content-type",
        "application/vnd.toonspectrum.backend-capability+json; charset=utf-8; version=1",
      );
      return response;
    });
    const { dispatcher } = createDispatcher(fetchMock);

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      providerId: "cloudflare",
      outcome: "completed",
    });
  });
  it("boots with explicit DI tokens under the metadata-light tsx runtime", async () => {
    const application = await NestFactory.createApplicationContext(
      BackendCapabilitiesModule,
      { logger: false }
    );

    await application.close();
  });

  it("uses a fixed path, canonical exact envelope, header-only token and no redirects", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async () => gatewayResponse("cloudflare")
    );
    const { dispatcher } = createDispatcher(fetchMock);

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      coordinationMode: "distributed",
      providerId: "cloudflare",
      placementRole: "edge-short",
      selectionReason: "workload-affinity",
      outcome: "completed",
      result: { assetId: "thumbnail-1" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://cloudflare-gateway.example${BACKEND_CAPABILITY_GATEWAY_PATH}`
    );
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers[BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]).toBe(
      gatewayEnv.BACKEND_CLOUDFLARE_AUTH_TOKEN
    );
    const body = String(init?.body);
    expect(body).not.toContain(gatewayEnv.BACKEND_CLOUDFLARE_AUTH_TOKEN);
    expect(body).toBe(canonicalJsonStringify(JSON.parse(body)));
    expect(JSON.parse(body)).toMatchObject({
      version: BACKEND_CAPABILITY_GATEWAY_VERSION,
      provider: "cloudflare",
      tenantId: command.tenantId,
      capability: "async-job",
      workload: "webhook",
      idempotencyKey: command.idempotencyKey,
      requirements: {
        fidelity: "exact",
        allowDegraded: false,
        latency: "tolerant",
      },
    });
  });

  it("fails closed before provider selection when distribution has no Upstash port", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>();
    const { dispatcher } = createDispatcher(fetchMock, gatewayEnv, null);

    await expect(dispatcher.dispatch(command)).resolves.toEqual({
      ok: false,
      coordinationMode: "distributed",
      reason: "coordination-deferred",
      coordinationReason: "coordination-unavailable",
      attempts: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails over an idempotent command once to the next exact-contract provider", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async (input) => {
        if (String(input).includes("cloudflare")) {
          throw new TypeError("network unavailable");
        }
        return gatewayResponse("supabase");
      }
    );
    const { dispatcher, router } = createDispatcher(fetchMock);

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      providerId: "supabase",
      attempts: [
        {
          providerId: "cloudflare",
          placementRole: "edge-short",
          selectionReason: "workload-affinity",
          outcome: "provider-failure",
        },
        {
          providerId: "supabase",
          placementRole: "edge-short",
          selectionReason: "workload-affinity",
          outcome: "completed",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.status(fixedNow).providers).toContainEqual(
      expect.objectContaining({ id: "cloudflare", circuit: "open" })
    );
  });

  it("never re-executes a non-idempotent command after delivery becomes unknown", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async () => {
        throw new TypeError("connection reset after write");
      }
    );
    const coordination = coordinationMock();
    const { dispatcher } = createDispatcher(
      fetchMock,
      gatewayEnv,
      coordination
    );

    await expect(
      dispatcher.dispatch({ ...command, idempotent: false })
    ).resolves.toMatchObject({
      ok: false,
      coordinationMode: "distributed",
      reason: "delivery-unknown",
      attempts: [{ providerId: "cloudflare" }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(coordination.recordProviderFailure).toHaveBeenCalledOnce();
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(coordination.releaseLease).toHaveBeenCalledOnce();
  });

  it("rejects degraded or oversized responses and tries another exact provider", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async (input) =>
        String(input).includes("cloudflare")
          ? gatewayResponse("cloudflare", { fidelity: "degraded" })
          : gatewayResponse("supabase")
    );
    const { dispatcher } = createDispatcher(fetchMock);

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      providerId: "supabase",
      attempts: [
        {
          providerId: "cloudflare",
          placementRole: "edge-short",
          selectionReason: "workload-affinity",
          outcome: "provider-failure",
        },
        {
          providerId: "supabase",
          placementRole: "edge-short",
          selectionReason: "workload-affinity",
          outcome: "completed",
        },
      ],
    });
  });

  it("bounds a streamed response before exact parsing and fails over without using partial data", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async (input) =>
        String(input).includes("cloudflare")
          ? new Response("x".repeat(2_048), {
              status: 200,
              headers: {
                "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
              },
            })
          : gatewayResponse("supabase")
    );
    const { dispatcher } = createDispatcher(fetchMock, {
      ...gatewayEnv,
      BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1024",
    });

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      providerId: "supabase",
      attempts: [
        { providerId: "cloudflare", outcome: "provider-failure" },
        { providerId: "supabase", outcome: "completed" },
      ],
    });
  });

  it("keeps the timeout active through response completion and then uses a same-role fallback", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
        async (input, init) => {
          if (!String(input).includes("cloudflare")) {
            return gatewayResponse("supabase");
          }
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted by timeout")),
              { once: true }
            );
          });
        }
      );
      const { dispatcher } = createDispatcher(fetchMock, {
        ...gatewayEnv,
        BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "100",
      });

      const result = dispatcher.dispatch({
        ...command,
        estimatedDurationMs: 100,
      });
      await vi.advanceTimersByTimeAsync(100);

      await expect(result).resolves.toMatchObject({
        ok: true,
        providerId: "supabase",
        attempts: [
          { providerId: "cloudflare", outcome: "provider-failure" },
          { providerId: "supabase", outcome: "completed" },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs distributed circuit, budget, lease and receipt cleanup around the provider fetch", async () => {
    const coordination = coordinationMock();
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async () => gatewayResponse("cloudflare")
    );
    const { dispatcher } = createDispatcher(
      fetchMock,
      gatewayEnv,
      coordination
    );

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: true,
      coordinationMode: "distributed",
      providerId: "cloudflare",
      outcome: "completed",
    });
    expect(coordination.readProviderCircuit).toHaveBeenCalledOnce();
    expect(coordination.acquireLease).toHaveBeenCalledOnce();
    expect(coordination.consumeProviderBudget).toHaveBeenCalledOnce();
    expect(coordination.reserveIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(coordination.closeProviderCircuit).toHaveBeenCalledOnce();
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(coordination.releaseLease).toHaveBeenCalledOnce();
  });

  it("fails closed before fetch for coordination, budget, slot and idempotency deferrals", async () => {
    const scenarios: ReadonlyArray<{
      readonly expectedReason: string;
      readonly mutate: (coordination: CoordinationMock) => void;
    }> = [
      {
        expectedReason: "coordination-unavailable",
        mutate: (coordination) => {
          coordination.readProviderCircuit.mockRejectedValueOnce(
            new Error("private Upstash transport detail")
          );
        },
      },
      {
        expectedReason: "provider-budget-exhausted",
        mutate: (coordination) => {
          coordination.consumeProviderBudget.mockResolvedValueOnce({
            accepted: false,
            duplicate: false,
            requestUnits: 100,
            costUnits: 1_000,
            windowId: "utc-day:20665",
            remainingTtlMs: 46_800_000,
          });
        },
      },
      {
        expectedReason: "provider-slots-exhausted",
        mutate: (coordination) => {
          coordination.acquireLease.mockResolvedValue({
            acquired: false,
            remainingTtlMs: 10_000,
          });
        },
      },
      {
        expectedReason: "idempotency-pending",
        mutate: (coordination) => {
          coordination.reserveIdempotencyReceipt.mockResolvedValueOnce({
            reserved: false,
            state: "pending",
            remainingTtlMs: 60_000,
          });
        },
      },
      {
        expectedReason: "receipt-conflict",
        mutate: (coordination) => {
          coordination.reserveIdempotencyReceipt.mockResolvedValueOnce({
            reserved: false,
            state: "request-conflict",
            remainingTtlMs: 60_000,
          });
        },
      },
    ];

    for (const scenario of scenarios) {
      const coordination = coordinationMock();
      scenario.mutate(coordination);
      const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>();
      const { dispatcher, router } = createDispatcher(
        fetchMock,
        gatewayEnv,
        coordination
      );

      await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
        ok: false,
        coordinationMode: "distributed",
        reason: "coordination-deferred",
        coordinationReason: scenario.expectedReason,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(router.status(fixedNow).providers).toContainEqual(
        expect.objectContaining({
          id: "cloudflare",
          remainingDailyRequests: 100,
          remainingDailyCostUnits: 1_000,
        })
      );
    }
  });

  it("renews a distributed provider slot while a long request is running", async () => {
    vi.useFakeTimers();
    try {
      const coordination = coordinationMock();
      const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
        async () =>
          await new Promise<Response>((resolve) => {
            setTimeout(() => resolve(gatewayResponse("cloudflare")), 50_000);
          })
      );
      const { dispatcher } = createDispatcher(
        fetchMock,
        {
          ...gatewayEnv,
          BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "60000",
        },
        coordination
      );

      const result = dispatcher.dispatch({
        ...command,
        estimatedDurationMs: 60_000,
      });
      await vi.advanceTimersByTimeAsync(45_000);
      expect(coordination.renewLease).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(result).resolves.toMatchObject({
        ok: true,
        coordinationMode: "distributed",
        providerId: "cloudflare",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks provider delivery unknown and reconciliation-required when a distributed lease is lost", async () => {
    vi.useFakeTimers();
    try {
      const coordination = coordinationMock();
      coordination.renewLease.mockResolvedValueOnce({
        matched: false,
        remainingTtlMs: null,
      });
      const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("provider transport aborted")),
              { once: true }
            );
          })
      );
      const { dispatcher } = createDispatcher(
        fetchMock,
        {
          ...gatewayEnv,
          BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "60000",
        },
        coordination
      );

      const result = dispatcher.dispatch({
        ...command,
        estimatedDurationMs: 60_000,
      });
      await vi.advanceTimersByTimeAsync(45_000);
      await expect(result).resolves.toMatchObject({
        ok: false,
        coordinationMode: "distributed",
        reason: "delivery-unknown",
        coordinationReason: "reconciliation-required",
        reconciliation: {
          state: "required",
          cause: "lease-lost",
          providerResponse: null,
        },
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          requestFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u
          ),
          outcomeFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u
          ),
        }),
        {}
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves an exact provider result when renewal fails after the response arrives", async () => {
    vi.useFakeTimers();
    try {
      const coordination = coordinationMock();
      coordination.renewLease.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  matched: false,
                  remainingTtlMs: null,
                }),
              1
            );
          })
      );
      const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
        async () =>
          await new Promise<Response>((resolve) => {
            setTimeout(() => resolve(gatewayResponse("cloudflare")), 45_000);
          })
      );
      const { dispatcher } = createDispatcher(
        fetchMock,
        {
          ...gatewayEnv,
          BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "60000",
        },
        coordination
      );

      const result = dispatcher.dispatch({
        ...command,
        estimatedDurationMs: 60_000,
      });
      await vi.advanceTimersByTimeAsync(45_001);

      await expect(result).resolves.toMatchObject({
        ok: false,
        coordinationMode: "distributed",
        reason: "delivery-unknown",
        coordinationReason: "reconciliation-required",
        reconciliation: {
          state: "required",
          cause: "lease-lost",
          providerResponse: {
            provider: "cloudflare",
            idempotencyKey: command.idempotencyKey,
            outcome: "completed",
            fidelity: "exact",
            result: { assetId: "thumbnail-1" },
          },
        },
        attempts: [
          {
            providerId: "cloudflare",
            outcome: "completed",
          },
        ],
      });
      expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
      expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          requestFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u
          ),
          outcomeFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u
          ),
        }),
        {}
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps distributed cleanup alive after the caller aborts", async () => {
    const coordination = coordinationMock();
    const controller = new AbortController();
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("caller aborted provider transport")),
            { once: true }
          );
        })
    );
    const { dispatcher } = createDispatcher(
      fetchMock,
      gatewayEnv,
      coordination
    );

    const result = dispatcher.dispatch(command, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();

    await expect(result).resolves.toMatchObject({
      ok: false,
      coordinationMode: "distributed",
      reason: "aborted",
    });
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(coordination.releaseLease).toHaveBeenCalledWith(
      expect.any(Object),
      {}
    );
  });

  it("does not report provider success when distributed receipt cleanup conflicts", async () => {
    const coordination = coordinationMock();
    coordination.completeIdempotencyReceipt.mockResolvedValueOnce({
      outcome: "conflict",
    });
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>(
      async () => gatewayResponse("cloudflare")
    );
    const { dispatcher } = createDispatcher(
      fetchMock,
      gatewayEnv,
      coordination
    );

    await expect(dispatcher.dispatch(command)).resolves.toMatchObject({
      ok: false,
      coordinationMode: "distributed",
      reason: "coordination-deferred",
      coordinationReason: "receipt-conflict",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never truncates a body above the gateway ceiling and performs no request", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>();
    const { dispatcher } = createDispatcher(fetchMock);

    await expect(
      dispatcher.dispatch({
        ...command,
        payload: { exactSource: "x".repeat(BACKEND_GATEWAY_HARD_MAX_BODY_BYTES) },
      })
    ).resolves.toEqual({
      ok: false,
      coordinationMode: "unresolved",
      reason: "payload-too-large",
      attempts: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors an already-aborted caller signal without reserving budget or calling fetch", async () => {
    const fetchMock = vi.fn<BackendCapabilityGatewayRuntime["fetch"]>();
    const { dispatcher, router } = createDispatcher(fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      dispatcher.dispatch(command, { signal: controller.signal })
    ).resolves.toEqual({
      ok: false,
      coordinationMode: "unresolved",
      reason: "aborted",
      attempts: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.status(fixedNow).providers).toContainEqual(
      expect.objectContaining({
        id: "cloudflare",
        remainingDailyRequests: 100,
      })
    );
  });
});
