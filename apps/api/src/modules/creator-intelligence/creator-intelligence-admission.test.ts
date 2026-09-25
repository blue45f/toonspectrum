import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreatorIntelligenceAdmissionGuard } from "./creator-intelligence-admission";

const JOB_TOKEN_SECRET = "creator-intelligence-test-secret-at-least-32-bytes";

function statusOf(run: () => unknown): number {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  throw new Error("expected admission to reject");
}

describe("CreatorIntelligenceAdmissionGuard", () => {
  it("fails closed for paid routes in production without explicit enablement", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "production" }),
    });

    expect(guard.describe().paidRoutesEnabled).toBe(false);
    expect(statusOf(() => guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    ))).toBe(503);
  });

  it("allows development use by default but still requires authentication", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({ NODE_ENV: "development" }),
    });

    expect(guard.describe().paidRoutesEnabled).toBe(true);
    expect(statusOf(() => guard.admit(
      "sound-generate",
      undefined,
      "sound:12345678",
    ))).toBe(401);
    expect(guard.admit(
      "sound-generate",
      "user-1",
      "sound:12345678",
    )).toBe("user-1");
  });

  it("requires a bounded idempotency key for billable mutations", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
    });

    expect(statusOf(() => guard.admit("safe-search", "user-1"))).toBe(400);
    expect(statusOf(() => guard.admit(
      "safe-search",
      "user-1",
      "short",
    ))).toBe(400);
  });

  it("rejects reuse of one operation id before another provider dispatch", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "1",
      }),
    });

    guard.admit("translate", "user-1", "translate:12345678");
    expect(statusOf(() => guard.admit(
      "translate",
      "user-1",
      "translate:12345678",
    ))).toBe(409);
  });

  it("allows authenticated status polling without an idempotency key", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "yes",
      }),
    });

    expect(guard.admit("mesh-status", "user-1")).toBe("user-1");
  });

  it("enforces the operation-specific burst budget", () => {
    let now = 1_000;
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "on",
      }),
      now: () => now,
    });

    for (let index = 0; index < 3; index += 1) {
      guard.admit("mesh-create", "user-1", `mesh:${index}:12345678`);
    }
    expect(statusOf(() => guard.admit(
      "mesh-create",
      "user-1",
      "mesh:4:12345678",
    ))).toBe(429);

    now += 30 * 60_000;
    expect(guard.admit(
      "mesh-create",
      "user-1",
      "mesh:5:12345678",
    )).toBe("user-1");
  });

  it("wraps provider job ids in an authenticated user-bound token", () => {
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
    expect(statusOf(() => guard.unwrapMeshJob("user-2", token))).toBe(403);
    expect(statusOf(() => guard.unwrapMeshJob(
      "user-1",
      `${token.slice(0, -1)}x`,
    ))).toBe(400);
  });

  it("requires a stable signing secret for production Meshy ownership", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "production",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "true",
      }),
    });

    expect(statusOf(() => guard.wrapMeshJob(
      "user-1",
      "provider_job_123",
    ))).toBe(503);
  });

  it("expires old Meshy ownership tokens", () => {
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

    expect(statusOf(() => guard.unwrapMeshJob("user-1", token))).toBe(400);
  });

  it("honors an explicit operator disablement outside production", () => {
    const guard = new CreatorIntelligenceAdmissionGuard({
      env: () => ({
        NODE_ENV: "development",
        CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED: "false",
      }),
    });

    expect(guard.describe().paidRoutesEnabled).toBe(false);
    expect(statusOf(() => guard.admit(
      "voice-synthesize",
      "user-1",
      "voice:12345678",
    ))).toBe(503);
  });
});
