import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreatorIntelligenceAdmissionGuard } from "./creator-intelligence-admission";

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
