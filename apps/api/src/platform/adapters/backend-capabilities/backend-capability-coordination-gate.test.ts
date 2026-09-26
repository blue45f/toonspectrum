import { describe, expect, it, vi } from "vitest";

import {
  BackendCapabilityCoordinationGate,
  type BackendCapabilityCoordinationRuntime,
} from "./backend-capability-coordination-gate";
import {
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  type BackendCapabilityGatewayResponse,
} from "./backend-capability-gateway-contract";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";

import type { UpstashCoordinationPort } from "../upstash-coordination/upstash-coordination.port";

const environment = {
  NODE_ENV: "test",
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_CIRCUIT_FAILURE_THRESHOLD: "2",
  BACKEND_CIRCUIT_COOLDOWN_MS: "60000",
  BACKEND_CLOUDFLARE_ENABLED: "true",
  BACKEND_CLOUDFLARE_BASE_URL: "https://cloudflare.example",
  BACKEND_CLOUDFLARE_AUTH_TOKEN:
    "cloudflare-test-token-with-at-least-thirty-two-characters",
  BACKEND_CLOUDFLARE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_CLOUDFLARE_DAILY_COST_BUDGET: "1000",
  BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "120000",
  BACKEND_CLOUDFLARE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_CONCURRENCY: "2",
  BACKEND_SUPABASE_ENABLED: "true",
  BACKEND_SUPABASE_BASE_URL: "https://supabase.example",
  BACKEND_SUPABASE_AUTH_TOKEN:
    "supabase-test-token-with-at-least-thirty-two-characters",
  BACKEND_SUPABASE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_SUPABASE_DAILY_COST_BUDGET: "1000",
  BACKEND_SUPABASE_MAX_EXECUTION_MS: "120000",
  BACKEND_SUPABASE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_SUPABASE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_SUPABASE_MAX_CONCURRENCY: "2",
} as const;

const command = {
  tenantId: "tenant-1",
  capability: "async-job",
  workload: "webhook",
  estimatedCostUnits: 5,
  estimatedDurationMs: 20_000,
  durability: "durable",
  idempotencyKey: "webhook-command-0001",
  idempotent: true,
  payload: {
    eventId: "event-1",
    event: { kind: "asset.published", resourceId: "asset-1" },
  },
} as const;

const now = Date.UTC(2026, 6, 31, 12, 0, 0);
const runtime: BackendCapabilityCoordinationRuntime = {
  now: () => now,
  nonce: () => "00000000-0000-4000-8000-000000000001",
};

function completedResponse(
  provider: "cloudflare" | "supabase" = "cloudflare"
): BackendCapabilityGatewayResponse {
  return {
    version: BACKEND_CAPABILITY_GATEWAY_VERSION,
    provider,
    idempotencyKey: command.idempotencyKey,
    outcome: "completed",
    retryable: false,
    fidelity: "exact",
    result: { receiptId: "provider-receipt-1" },
    errorCode: null,
  };
}

type CoordinationMock = UpstashCoordinationPort & {
  [Key in keyof UpstashCoordinationPort]: ReturnType<typeof vi.fn>;
};

function coordinationMock(): CoordinationMock {
  return {
    acquireLease: vi.fn(async () => ({
      acquired: true,
      remainingTtlMs: 150_000,
    })),
    renewLease: vi.fn(async () => ({
      matched: true,
      remainingTtlMs: 150_000,
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
      state: "closed",
      consecutiveFailures: 1,
      openedUntilEpochMs: 0,
      observedAtEpochMs: now,
    })),
    closeProviderCircuit: vi.fn(async () => ({
      state: "closed",
      consecutiveFailures: 0,
      openedUntilEpochMs: 0,
      observedAtEpochMs: now,
    })),
    readProviderCircuit: vi.fn(async () => ({
      state: "closed",
      consecutiveFailures: 0,
      openedUntilEpochMs: 0,
      observedAtEpochMs: now,
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

function createGate(
  coordination: UpstashCoordinationPort | null,
  coordinationRuntime: BackendCapabilityCoordinationRuntime = runtime
) {
  return new BackendCapabilityCoordinationGate(
    resolveBackendCapabilityPolicy(environment, { warn: vi.fn() }),
    coordination,
    coordinationRuntime
  );
}

function distributedSession(
  gate: BackendCapabilityCoordinationGate,
  commandInput: unknown = command
) {
  const begun = gate.begin(commandInput);
  if (begun.mode !== "distributed") {
    throw new Error(`Expected distributed mode, received ${begun.mode}.`);
  }
  return begun.session;
}

describe("backend capability coordination gate", () => {
  it("fails closed without Upstash when distribution is enabled and permits local mode only when disabled", () => {
    const gate = createGate(null);
    expect(gate.begin(command)).toEqual({
      mode: "deferred",
      reason: "coordination-unavailable",
    });

    const disabledGate = new BackendCapabilityCoordinationGate(
      resolveBackendCapabilityPolicy(
        {
          ...environment,
          BACKEND_DISTRIBUTION_ENABLED: "false",
        },
        { warn: vi.fn() }
      ),
      null,
      runtime
    );
    expect(disabledGate.begin(command)).toEqual({
      mode: "local-process",
      reason: "distribution-disabled",
    });
    expect(gate.begin({ ...command, workload: "comments" })).toEqual({
      mode: "deferred",
      reason: "invalid-command",
    });
  });

  it("checks circuit, acquires a slot, reserves budget and receipt in that order", async () => {
    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));

    await expect(session.admitProvider("cloudflare")).resolves.toEqual({
      admitted: true,
      admission: {
        mode: "distributed",
        providerId: "cloudflare",
        slot: expect.any(Number),
        leaseTtlMs: 150_000,
        budgetDuplicate: false,
      },
    });

    expect(coordination.readProviderCircuit).toHaveBeenCalledWith(
      { providerId: "cloudflare" },
      {}
    );
    expect(coordination.acquireLease).toHaveBeenCalledOnce();
    expect(coordination.consumeProviderBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "cloudflare",
        operationId: expect.stringContaining(command.idempotencyKey),
        requestUnits: 1,
        costUnits: command.estimatedCostUnits,
        maximumRequestUnits: 100,
        maximumCostUnits: 1_000,
        expiryGraceMs: 3_600_000,
      }),
      {}
    );
    expect(coordination.reserveIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "backend-capability.dispatch",
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: expect.stringMatching(
          /^sha256:[0-9a-f]{64}$/u
        ),
      }),
      {}
    );

    const circuitOrder =
      coordination.readProviderCircuit.mock.invocationCallOrder[0] ?? 0;
    const leaseOrder =
      coordination.acquireLease.mock.invocationCallOrder[0] ?? 0;
    const budgetOrder =
      coordination.consumeProviderBudget.mock.invocationCallOrder[0] ?? 0;
    const receiptOrder =
      coordination.reserveIdempotencyReceipt.mock.invocationCallOrder[0] ?? 0;
    expect(circuitOrder).toBeLessThan(leaseOrder);
    expect(leaseOrder).toBeLessThan(budgetOrder);
    expect(budgetOrder).toBeLessThan(receiptOrder);
  });

  it("never derives a distributed budget window from a skewed application clock", async () => {
    const beforeMidnight = coordinationMock();
    const afterMidnight = coordinationMock();
    const beforeSession = distributedSession(
      createGate(beforeMidnight, {
        now: () => Date.UTC(2026, 6, 31, 23, 59, 59, 999),
        nonce: runtime.nonce,
      })
    );
    const afterSession = distributedSession(
      createGate(afterMidnight, {
        now: () => Date.UTC(2026, 7, 1, 0, 0, 0, 1),
        nonce: runtime.nonce,
      })
    );

    await beforeSession.admitProvider("cloudflare");
    await afterSession.admitProvider("cloudflare");

    const beforeBudget =
      beforeMidnight.consumeProviderBudget.mock.calls[0]?.[0];
    const afterBudget =
      afterMidnight.consumeProviderBudget.mock.calls[0]?.[0];
    expect(beforeBudget).toEqual(afterBudget);
    expect(beforeBudget).toEqual({
      providerId: "cloudflare",
      operationId: `${command.workload}:cloudflare:${command.idempotencyKey}`,
      requestUnits: 1,
      costUnits: command.estimatedCostUnits,
      maximumRequestUnits: 100,
      maximumCostUnits: 1_000,
      expiryGraceMs: 3_600_000,
    });
    expect(beforeBudget).not.toHaveProperty("windowId");
    expect(beforeBudget).not.toHaveProperty("ttlMs");
  });

  it("binds the receipt value to tenant, workload, command metadata and payload", async () => {
    const coordination = coordinationMock();
    const gate = createGate(coordination);
    const variants = [
      command,
      { ...command, tenantId: "tenant-2" },
      {
        ...command,
        payload: {
          ...command.payload,
          eventId: "event-2",
        },
      },
      {
        ...command,
        estimatedCostUnits: command.estimatedCostUnits + 1,
      },
    ] as const;

    for (const variant of variants) {
      const session = distributedSession(gate, variant);
      await expect(
        session.admitProvider("cloudflare")
      ).resolves.toMatchObject({ admitted: true });
    }

    const fingerprints = coordination.reserveIdempotencyReceipt.mock.calls.map(
      (call) => call[0].requestFingerprint
    );
    expect(fingerprints).toHaveLength(variants.length);
    expect(new Set(fingerprints).size).toBe(variants.length);
    expect(fingerprints).toEqual(
      variants.map(() => expect.stringMatching(/^sha256:[0-9a-f]{64}$/u))
    );
  });

  it("settles an exact completed response across circuit, receipt and lease", async () => {
    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");

    await expect(
      session.settleProviderAttempt({
        kind: "completed",
        response: completedResponse(),
      })
    ).resolves.toEqual({
      settled: true,
      terminal: true,
      receipt: "completed",
    });

    expect(coordination.closeProviderCircuit).toHaveBeenCalledWith(
      { providerId: "cloudflare" },
      {}
    );
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: command.idempotencyKey,
        outcomeFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      }),
      {}
    );
    expect(coordination.releaseLease).toHaveBeenCalledOnce();
    expect(await session.admitProvider("supabase")).toEqual({
      admitted: false,
      mode: "distributed",
      reason: "session-closed",
    });
  });

  it("defers an open circuit without spending budget or taking a slot", async () => {
    const coordination = coordinationMock();
    coordination.readProviderCircuit.mockResolvedValueOnce({
      state: "open",
      consecutiveFailures: 2,
      openedUntilEpochMs: now + 60_000,
      observedAtEpochMs: now,
    });
    const session = distributedSession(createGate(coordination));

    await expect(session.admitProvider("cloudflare")).resolves.toEqual({
      admitted: false,
      mode: "distributed",
      reason: "circuit-open",
    });
    expect(coordination.acquireLease).not.toHaveBeenCalled();
    expect(coordination.consumeProviderBudget).not.toHaveBeenCalled();
    expect(coordination.reserveIdempotencyReceipt).not.toHaveBeenCalled();
  });

  it("tries every configured provider slot without reducing concurrency", async () => {
    const coordination = coordinationMock();
    coordination.acquireLease
      .mockResolvedValueOnce({ acquired: false, remainingTtlMs: 10_000 })
      .mockResolvedValueOnce({ acquired: true, remainingTtlMs: 150_000 });
    const session = distributedSession(createGate(coordination));

    await expect(
      session.admitProvider("cloudflare")
    ).resolves.toMatchObject({ admitted: true });
    expect(coordination.acquireLease).toHaveBeenCalledTimes(2);
    const resources = coordination.acquireLease.mock.calls.map(
      (call) => call[0].resourceId
    );
    expect(new Set(resources).size).toBe(2);
  });

  it("releases a slot when budget or receipt admission defers", async () => {
    const budgetCoordination = coordinationMock();
    budgetCoordination.consumeProviderBudget.mockResolvedValueOnce({
      accepted: false,
      duplicate: false,
      requestUnits: 100,
      costUnits: 1_000,
      windowId: "utc-day:20665",
      remainingTtlMs: 46_800_000,
    });
    const budgetSession = distributedSession(createGate(budgetCoordination));
    await expect(
      budgetSession.admitProvider("cloudflare")
    ).resolves.toEqual({
      admitted: false,
      mode: "distributed",
      reason: "provider-budget-exhausted",
    });
    expect(budgetCoordination.releaseLease).toHaveBeenCalledOnce();
    expect(
      budgetCoordination.reserveIdempotencyReceipt
    ).not.toHaveBeenCalled();

    const receiptCoordination = coordinationMock();
    receiptCoordination.reserveIdempotencyReceipt.mockResolvedValueOnce({
      reserved: false,
      state: "pending",
      remainingTtlMs: 50_000,
    });
    const receiptSession = distributedSession(createGate(receiptCoordination));
    await expect(
      receiptSession.admitProvider("cloudflare")
    ).resolves.toEqual({
      admitted: false,
      mode: "distributed",
      reason: "idempotency-pending",
    });
    expect(receiptCoordination.releaseLease).toHaveBeenCalledOnce();

    const conflictCoordination = coordinationMock();
    conflictCoordination.reserveIdempotencyReceipt.mockResolvedValueOnce({
      reserved: false,
      state: "request-conflict",
      remainingTtlMs: 50_000,
    });
    const conflictSession = distributedSession(
      createGate(conflictCoordination)
    );
    await expect(
      conflictSession.admitProvider("cloudflare")
    ).resolves.toEqual({
      admitted: false,
      mode: "distributed",
      reason: "receipt-conflict",
    });
    expect(conflictCoordination.releaseLease).toHaveBeenCalledOnce();
  });

  it("retains one receipt across same-session exact provider failover", async () => {
    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");

    await expect(
      session.settleProviderAttempt({
        kind: "provider-failure",
        terminal: false,
      })
    ).resolves.toEqual({
      settled: true,
      terminal: false,
      receipt: "retained",
    });
    expect(coordination.recordProviderFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "cloudflare",
        failureThreshold: 2,
        cooldownMs: 60_000,
      }),
      {}
    );
    expect(coordination.completeIdempotencyReceipt).not.toHaveBeenCalled();
    expect(coordination.releaseLease).toHaveBeenCalledOnce();

    await expect(
      session.admitProvider("supabase")
    ).resolves.toMatchObject({ admitted: true });
    expect(coordination.reserveIdempotencyReceipt).toHaveBeenCalledOnce();
  });

  it("can close a retained receipt when no further exact provider is available", async () => {
    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");
    await session.settleProviderAttempt({
      kind: "provider-failure",
      terminal: false,
    });

    await expect(
      session.finalizeWithoutActiveProvider("providers-exhausted")
    ).resolves.toEqual({
      settled: true,
      terminal: true,
      receipt: "completed",
    });
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcomeFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      })
    );
  });

  it("finishes receipt and lease cleanup even when the caller signal is aborted", async () => {
    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      session.settleProviderAttempt(
        { kind: "cancelled" },
        { signal: aborted.signal }
      )
    ).resolves.toEqual({
      settled: true,
      terminal: true,
      receipt: "completed",
    });
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(coordination.releaseLease).toHaveBeenCalledWith(
      expect.any(Object),
      {}
    );
  });

  it("retains exact provider evidence for reconciliation after lease ownership is lost", async () => {
    const baselineCoordination = coordinationMock();
    const baselineSession = distributedSession(
      createGate(baselineCoordination)
    );
    await baselineSession.admitProvider("cloudflare");
    await baselineSession.settleProviderAttempt({
      kind: "completed",
      response: completedResponse(),
    });
    expect(
      baselineCoordination.completeIdempotencyReceipt
    ).toHaveBeenCalledOnce();
    const baselineFingerprint =
      baselineCoordination.completeIdempotencyReceipt.mock.calls[0]?.[0]
        .outcomeFingerprint;
    expect(baselineFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const coordination = coordinationMock();
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");
    await expect(session.renewProviderLease()).resolves.toEqual({
      renewed: true,
      remainingTtlMs: 150_000,
    });

    coordination.renewLease.mockResolvedValueOnce({
      matched: false,
      remainingTtlMs: null,
    });
    await expect(session.renewProviderLease()).resolves.toEqual({
      renewed: false,
      reason: "lease-lost",
    });
    await expect(
      session.settleProviderAttempt({
        kind: "delivery-unknown",
        response: completedResponse(),
      })
    ).resolves.toEqual({
      settled: true,
      terminal: true,
      receipt: "completed",
    });
    const reconciliationCompletion =
      coordination.completeIdempotencyReceipt.mock.calls[0]?.[0];
    expect(reconciliationCompletion?.outcomeFingerprint).toBe(
      baselineFingerprint
    );
    expect(reconciliationCompletion?.requestFingerprint).toMatch(
      /^sha256:[0-9a-f]{64}$/u
    );
  });

  it("treats Upstash failures and invalid provider responses as deferred", async () => {
    const unavailable = coordinationMock();
    unavailable.readProviderCircuit.mockRejectedValueOnce(
      new Error("private transport detail")
    );
    const unavailableSession = distributedSession(createGate(unavailable));
    await expect(
      unavailableSession.admitProvider("cloudflare")
    ).resolves.toEqual({
      admitted: false,
      mode: "distributed",
      reason: "coordination-unavailable",
    });

    const invalid = coordinationMock();
    const invalidSession = distributedSession(createGate(invalid));
    await invalidSession.admitProvider("cloudflare");
    await expect(
      invalidSession.settleProviderAttempt({
        kind: "completed",
        response: completedResponse("supabase"),
      })
    ).resolves.toEqual({
      settled: false,
      terminal: true,
      reason: "invalid-provider-response",
    });
    expect(invalid.recordProviderFailure).toHaveBeenCalledOnce();
    expect(invalid.completeIdempotencyReceipt).not.toHaveBeenCalled();
    expect(invalid.releaseLease).toHaveBeenCalledOnce();
  });

  it("does not report provider completion when cleanup loses exact receipt ownership", async () => {
    const coordination = coordinationMock();
    coordination.completeIdempotencyReceipt.mockResolvedValueOnce({
      outcome: "conflict",
    });
    const session = distributedSession(createGate(coordination));
    await session.admitProvider("cloudflare");

    await expect(
      session.settleProviderAttempt({
        kind: "completed",
        response: completedResponse(),
      })
    ).resolves.toEqual({
      settled: false,
      terminal: true,
      reason: "receipt-conflict",
    });
    expect(coordination.releaseLease).toHaveBeenCalledOnce();
  });
});
