import { describe, expect, it, vi } from "vitest";

import type { UpstashCoordinationPort } from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import {
  CreatorIntelligenceAdmissionError,
  CreatorIntelligencePaidAdmission,
} from "./creator-intelligence-paid-admission";

function distributed(overrides: Partial<UpstashCoordinationPort> = {}): UpstashCoordinationPort {
  return {
    ping: vi.fn(async () => true),
    acquireLease: vi.fn(),
    renewLease: vi.fn(),
    releaseLease: vi.fn(),
    reserveIdempotencyReceipt: vi.fn(async () => ({
      reserved: true,
      state: "pending",
      remainingTtlMs: 900_000,
    })),
    completeIdempotencyReceipt: vi.fn(async () => ({ outcome: "completed" })),
    recordProviderFailure: vi.fn(),
    closeProviderCircuit: vi.fn(),
    readProviderCircuit: vi.fn(),
    consumeProviderBudget: vi.fn(async () => ({
      accepted: true,
      duplicate: false,
      requestUnits: 1,
      costUnits: 1,
      windowId: "utc-day:1",
      remainingTtlMs: 86_400_000,
    })),
    consumeRateLimit: vi.fn(async () => ({
      accepted: true,
      requestCount: 1,
      remainingTtlMs: 86_400_000,
    })),
    ...overrides,
  } as UpstashCoordinationPort;
}

function input(overrides: Partial<Parameters<CreatorIntelligencePaidAdmission["execute"]>[0]> = {}) {
  return {
    operation: "sound-effect" as const,
    userId: "creator-1",
    idempotencyKey: `request-${crypto.randomUUID()}`,
    request: { prompt: "rain" },
    environment: {
      NODE_ENV: "test",
      CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED: "true",
    } as NodeJS.ProcessEnv,
    run: vi.fn(async () => ({ status: "ready" as const })),
    ...overrides,
  };
}

describe("CreatorIntelligencePaidAdmission", () => {
  it("keeps operator-funded execution disabled by default in production", () => {
    const admission = new CreatorIntelligencePaidAdmission(null);
    expect(admission.status({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toMatchObject({
      enabled: false,
      distributed: false,
      failClosedInProduction: true,
      reason: "disabled",
    });
  });

  it("reports coordination as required before enabling production dispatch", () => {
    const admission = new CreatorIntelligencePaidAdmission(null);
    expect(admission.status({
      NODE_ENV: "production",
      CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED: "true",
    } as NodeJS.ProcessEnv)).toMatchObject({
      enabled: false,
      distributed: false,
      reason: "coordination-required",
    });
  });

  it("fails closed in production when distributed coordination is unavailable", async () => {
    const admission = new CreatorIntelligencePaidAdmission(null);
    const execution = admission.execute(input({
      environment: {
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED: "true",
      } as NodeJS.ProcessEnv,
    }));
    await expect(execution).rejects.toMatchObject({
      code: "creator_intelligence_coordination_unavailable",
      status: 503,
    });
  });

  it("deduplicates an identical local request and rejects changed input", async () => {
    const admission = new CreatorIntelligencePaidAdmission(null);
    const key = `request-${crypto.randomUUID()}`;
    await expect(admission.execute(input({ idempotencyKey: key }))).resolves.toEqual({
      status: "ready",
    });
    await expect(admission.execute(input({ idempotencyKey: key }))).rejects.toMatchObject({
      code: "creator_intelligence_duplicate_request",
      status: 409,
    });
    await expect(admission.execute(input({
      idempotencyKey: key,
      request: { prompt: "changed" },
    }))).rejects.toMatchObject({
      code: "creator_intelligence_idempotency_conflict",
      status: 409,
    });
  });

  it("coordinates idempotency, per-user limits, and global budget before dispatch", async () => {
    const coordination = distributed();
    const admission = new CreatorIntelligencePaidAdmission(coordination);
    const run = vi.fn(async () => ({ status: "ready" as const, value: "ok" }));
    await expect(admission.execute(input({ run }))).resolves.toEqual({
      status: "ready",
      value: "ok",
    });
    expect(coordination.reserveIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(coordination.consumeRateLimit).toHaveBeenCalledOnce();
    expect(coordination.consumeProviderBudget).toHaveBeenCalledOnce();
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not call a paid provider after the global budget is exhausted", async () => {
    const run = vi.fn(async () => ({ status: "ready" as const }));
    const coordination = distributed({
      consumeProviderBudget: vi.fn(async () => ({
        accepted: false,
        duplicate: false,
        requestUnits: 2_000,
        costUnits: 16_000,
        windowId: "utc-day:1",
        remainingTtlMs: 12_345,
      })),
    });
    const admission = new CreatorIntelligencePaidAdmission(coordination);
    await expect(admission.execute(input({ run }))).rejects.toBeInstanceOf(
      CreatorIntelligenceAdmissionError,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
