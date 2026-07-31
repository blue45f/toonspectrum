import { describe, expect, it } from "vitest";

import {
  resolveUpstashCoordinationConfig,
  UpstashCoordinationConfigurationError,
} from "./upstash-coordination.config";
import {
  AcquireCoordinationLeaseSchema,
  CompleteIdempotencyReceiptSchema,
  ConsumeRateLimitSchema,
  ConsumeProviderBudgetSchema,
  ProviderCircuitFailureSchema,
  ReserveIdempotencyReceiptSchema,
} from "./upstash-coordination.contract";
import {
  createUpstashCoordinationPortFromEnvironment,
} from "./upstash-coordination.factory";
import { UpstashCoordinationModule } from "./upstash-coordination.module";

const enabledEnvironment = {
  UPSTASH_COORDINATION_ENABLED: "true",
  UPSTASH_COORDINATION_REST_URL: "https://coordination.example",
  UPSTASH_COORDINATION_REST_TOKEN:
    "test-rest-token-with-sufficient-length",
  UPSTASH_COORDINATION_KEY_HASH_SECRET:
    "test-key-hash-secret-with-at-least-thirty-two-characters",
  UPSTASH_COORDINATION_NAMESPACE: "toonspectrum-test",
} as const;

describe("Upstash coordination contracts", () => {
  it("accepts only bounded coordination metadata", () => {
    expect(
      AcquireCoordinationLeaseSchema.safeParse({
        scope: "provider-dispatch",
        resourceId: "provider:cloudflare:slot:4",
        leaseToken: "lease_token_abcdefghijklmnopqrstuvwxyz012345",
        ttlMs: 30_000,
      }).success
    ).toBe(true);

    const forbiddenFields = [
      "payload",
      "assetBytes",
      "crdtState",
      "document",
      "prompt",
    ] as const;
    for (const field of forbiddenFields) {
      expect(
        AcquireCoordinationLeaseSchema.safeParse({
          scope: "provider-dispatch",
          resourceId: "provider:cloudflare:slot:4",
          leaseToken: "lease_token_abcdefghijklmnopqrstuvwxyz012345",
          ttlMs: 30_000,
          [field]: "creator-owned-content",
        }).success
      ).toBe(false);
    }
  });

  it("strictly validates receipt, circuit and budget DTOs", () => {
    const receipt = {
      scope: "async-job",
      operation: "thumbnail.render",
      idempotencyKey: "job-operation-0001",
      requestFingerprint: `sha256:${"b".repeat(64)}`,
      claimToken: "claim_token_abcdefghijklmnopqrstuvwxyz012345",
      ttlMs: 60_000,
    } as const;
    expect(ReserveIdempotencyReceiptSchema.safeParse(receipt).success).toBe(
      true
    );
    expect(
      ReserveIdempotencyReceiptSchema.safeParse({
        ...receipt,
        requestFingerprint: undefined,
      }).success
    ).toBe(false);
    expect(
      CompleteIdempotencyReceiptSchema.safeParse({
        ...receipt,
        outcomeFingerprint: `sha256:${"a".repeat(64)}`,
      }).success
    ).toBe(true);
    expect(
      CompleteIdempotencyReceiptSchema.safeParse({
        ...receipt,
        outcomeFingerprint: "raw-provider-response",
      }).success
    ).toBe(false);

    expect(
      ProviderCircuitFailureSchema.safeParse({
        providerId: "cloudflare",
        failureThreshold: 3,
        cooldownMs: 60_000,
        stateTtlMs: 30_000,
      }).success
    ).toBe(false);

    const budget = {
      providerId: "cloudflare",
      operationId: "dispatch-operation-1",
      requestUnits: 1,
      costUnits: 12,
      maximumRequestUnits: 1_000,
      maximumCostUnits: 10_000,
      expiryGraceMs: 3_600_000,
    } as const;
    expect(ConsumeProviderBudgetSchema.safeParse(budget).success).toBe(true);
    expect(
      ConsumeProviderBudgetSchema.safeParse({
        ...budget,
        windowId: "2026-07-31",
      }).success
    ).toBe(false);
    expect(
      ConsumeProviderBudgetSchema.safeParse({
        ...budget,
        ttlMs: 86_400_000,
      }).success
    ).toBe(false);
    expect(
      ConsumeProviderBudgetSchema.safeParse({
        ...budget,
        userContent: "not allowed",
      }).success
    ).toBe(false);

    const rateLimit = {
      scope: "auth",
      subjectFingerprint: `sha256:${"c".repeat(64)}`,
      maximumRequests: 10,
      windowMs: 10 * 60_000,
    } as const;
    expect(ConsumeRateLimitSchema.safeParse(rateLimit).success).toBe(true);
    expect(
      ConsumeRateLimitSchema.safeParse({
        ...rateLimit,
        subjectFingerprint: "198.51.100.7",
      }).success,
    ).toBe(false);
    expect(
      ConsumeRateLimitSchema.safeParse({
        ...rateLimit,
        userContent: "forbidden",
      }).success,
    ).toBe(false);
  });
});

describe("Upstash coordination configuration seam", () => {
  it("omits the module and port when the feature is not configured", () => {
    expect(resolveUpstashCoordinationConfig({})).toBeNull();
    expect(
      resolveUpstashCoordinationConfig({
        UPSTASH_COORDINATION_ENABLED: "false",
      })
    ).toBeNull();
    expect(
      createUpstashCoordinationPortFromEnvironment({}, { fetch })
    ).toBeNull();
    expect(UpstashCoordinationModule.fromEnvironment({})).toBeNull();
  });

  it("fails closed when explicitly enabled without an exact configuration", () => {
    expect(() =>
      resolveUpstashCoordinationConfig({
        UPSTASH_COORDINATION_ENABLED: "true",
      })
    ).toThrow(UpstashCoordinationConfigurationError);
    expect(() =>
      resolveUpstashCoordinationConfig({
        ...enabledEnvironment,
        UPSTASH_COORDINATION_REST_URL:
          "https://coordination.example/path?token=forbidden",
      })
    ).toThrow(UpstashCoordinationConfigurationError);
    expect(() =>
      resolveUpstashCoordinationConfig({
        UPSTASH_COORDINATION_ENABLED: "yes",
      })
    ).toThrow(UpstashCoordinationConfigurationError);
  });

  it("normalizes a valid HTTPS origin and exposes an injectable dynamic module", () => {
    expect(resolveUpstashCoordinationConfig(enabledEnvironment)).toEqual(
      expect.objectContaining({
        restUrl: "https://coordination.example",
        namespace: "toonspectrum-test",
        timeoutMs: 2_500,
      })
    );
    const module = UpstashCoordinationModule.fromEnvironment(
      enabledEnvironment
    );
    expect(module?.module).toBe(UpstashCoordinationModule);
    expect(module?.exports).toHaveLength(1);
  });
});
