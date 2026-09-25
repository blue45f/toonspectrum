import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorIntelligenceAdmissionGuard } from "./creator-intelligence-admission";

const JOB_TOKEN_SECRET = "creator-intelligence-test-secret-at-least-32-bytes";

async function statusOf(run: () => unknown | Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  throw new Error("expected admission to reject");
}

describe("CreatorIntelligenceAdmissionGuard", () => {
  it("fails closed for paid routes in production without explicit enablement", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "production" }),
    });

    expect(guard.describe().paidRoutesEnabled).toBe(false);
    await expect(statusOf(() => guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    ))).resolves.toBe(503);
  });

  it("requires distributed coordination for production paid routes", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
    });

    expect(guard.describe()).toMatchObject({
      paidRoutesEnabled: false,
      enforcement: "unavailable",
    });
    await expect(statusOf(() => guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    ))).resolves.toBe(503);
  });

  it("uses distributed counters before production provider dispatch", async () => {
    const consumeRateLimit = vi.fn(async () => ({
      accepted: true,
      requestCount: 1,
      remainingTtlMs: 60_000,
    }));
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
      coordination: { consumeRateLimit },
    });

    await expect(guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    )).resolves.toBe("user-1");
    expect(guard.describe()).toMatchObject({
      paidRoutesEnabled: true,
      enforcement: "distributed-upstash",
    });
    expect(consumeRateLimit).toHaveBeenCalledTimes(3);
    expect(consumeRateLimit.mock.calls.every(
      ([input]) => input.scope === "auth"
        && input.subjectFingerprint.startsWith("sha256:"),
    )).toBe(true);
  });

  it("fails closed when distributed coordination cannot be confirmed", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
      coordination: {
        consumeRateLimit: vi.fn(async () => {
          throw new Error("redis unavailable");
        }),
      },
    });

    await expect(statusOf(() => guard.admit(
      "translate",
      "user-1",
      "translate:12345678",
    ))).resolves.toBe(503);
  });

  it("allows development use by default but still requires authentication", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });

    expect(guard.describe()).toMatchObject({
      paidRoutesEnabled: true,
      enforcement: "single-instance-local",
    });
    await expect(statusOf(() => guard.admit(
      "sound-generate",
      undefined,
      "sound:12345678",
    ))).resolves.toBe(401);
    await expect(guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    )).resolves.toBe("user-1");
  });

  it("requires a bounded idempotency key for billable mutations", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });

    await expect(statusOf(() => guard.admit(
      "safe-search",
      "user-1",
    ))).resolves.toBe(400);
    await expect(statusOf(() => guard.admit(
      "safe-search",
      "user-1",
      "short",
    ))).resolves.toBe(400);
  });

  it("rejects reuse of one operation id before another provider dispatch", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });

    await guard.admit("translate", "user-1", "translate:12345678");
    await expect(statusOf(() => guard.admit(
      "translate",
      "user-1",
      "translate:12345678",
    ))).resolves.toBe(409);
  });

  it("allows authenticated status polling without an idempotency key", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });

    await expect(guard.admit("mesh-status", "user-1")).resolves.toBe("user-1");
  });

  it("enforces the operation-specific burst budget", async () => {
    let now = 1_000;
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
      now: () => now,
    });

    for (let index = 0; index < 3; index += 1) {
      await guard.admit("mesh-create", "user-1", `mesh:${index}:12345678`);
    }
    await expect(statusOf(() => guard.admit(
      "mesh-create",
      "user-1",
      "mesh:4:12345678",
    ))).resolves.toBe(429);

    now += 30 * 60_000;
    await expect(guard.admit(
      "mesh-create",
      "user-1",
      "mesh:5:12345678",
    )).resolves.toBe("user-1");
  });

  it("wraps provider job ids in an authenticated user-bound token", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
        CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET: JOB_TOKEN_SECRET,
      }),
      now: () => 10_000,
    });

    const token = guard.wrapMeshJob("user-1", "provider_job_123");

    expect(token).not.toContain("provider_job_123");
    expect(guard.unwrapMeshJob("user-1", token)).toBe("provider_job_123");
    await expect(statusOf(() => guard.unwrapMeshJob("user-2", token))).resolves.toBe(403);
    await expect(statusOf(() => guard.unwrapMeshJob(
      "user-1",
      `${token.slice(0, -1)}x`,
    ))).resolves.toBe(400);
  });

  it("requires a stable signing secret for production Meshy ownership", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
    });

    await expect(statusOf(() => guard.wrapMeshJob(
      "user-1",
      "provider_job_123",
    ))).resolves.toBe(503);
  });

  it("expires old Meshy ownership tokens", async () => {
    let now = 1_000;
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
        CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET: JOB_TOKEN_SECRET,
      }),
      now: () => now,
    });
    const token = guard.wrapMeshJob("user-1", "provider_job_123");
    now += 8 * 24 * 60 * 60_000;

    await expect(statusOf(() => guard.unwrapMeshJob("user-1", token))).resolves.toBe(400);
  });

  it("honors an explicit operator disablement outside production", async () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "development",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "false",
      }),
    });

    expect(guard.describe().paidRoutesEnabled).toBe(false);
    await expect(statusOf(() => guard.admit(
      "voice-synthesize",
      "user-1",
      "voice:12345678",
    ))).resolves.toBe(503);
  });
});
