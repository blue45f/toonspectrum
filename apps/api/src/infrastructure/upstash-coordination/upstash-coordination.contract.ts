import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UPSTASH_COORDINATION_CONTRACT_VERSION =
  "toonspectrum.upstash-coordination.v1" as const;

export const UpstashCoordinationScopeSchema = z.enum([
  "provider-dispatch",
  "async-job",
  "maintenance",
]);

const OpaqueIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, {
    message: "opaque identifiers cannot have surrounding whitespace",
  });

const OperationSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.:/_-][a-z0-9]+)*$/u);

const ProviderIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);

const SecretProofSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/u);

const TtlMsSchema = z.number().int().min(1_000).max(7 * 24 * 60 * 60 * 1_000);
const LeaseTtlMsSchema = TtlMsSchema.max(15 * 60 * 1_000);

export const Sha256FingerprintSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u);

export const AcquireCoordinationLeaseSchema = z
  .object({
    scope: UpstashCoordinationScopeSchema,
    resourceId: OpaqueIdentifierSchema,
    leaseToken: SecretProofSchema,
    ttlMs: LeaseTtlMsSchema,
  })
  .strict();

export class AcquireCoordinationLeaseDto extends createZodDto(
  AcquireCoordinationLeaseSchema
) {}

export type AcquireCoordinationLease = z.infer<
  typeof AcquireCoordinationLeaseSchema
>;

export const MutateCoordinationLeaseSchema = AcquireCoordinationLeaseSchema;

export class MutateCoordinationLeaseDto extends createZodDto(
  MutateCoordinationLeaseSchema
) {}

export type MutateCoordinationLease = z.infer<
  typeof MutateCoordinationLeaseSchema
>;

export const ReserveIdempotencyReceiptSchema = z
  .object({
    scope: UpstashCoordinationScopeSchema,
    operation: OperationSchema,
    idempotencyKey: OpaqueIdentifierSchema,
    /**
     * Immutable identity of the logical request. It is stored in the receipt value, not its key,
     * so reusing one idempotency key for different tenant/workload/command/payload input fails
     * closed instead of creating a second independently executable receipt.
     */
    requestFingerprint: Sha256FingerprintSchema,
    claimToken: SecretProofSchema,
    ttlMs: TtlMsSchema,
  })
  .strict();

export class ReserveIdempotencyReceiptDto extends createZodDto(
  ReserveIdempotencyReceiptSchema
) {}

export type ReserveIdempotencyReceipt = z.infer<
  typeof ReserveIdempotencyReceiptSchema
>;

export const CompleteIdempotencyReceiptSchema =
  ReserveIdempotencyReceiptSchema.extend({
    outcomeFingerprint: Sha256FingerprintSchema,
  }).strict();

export class CompleteIdempotencyReceiptDto extends createZodDto(
  CompleteIdempotencyReceiptSchema
) {}

export type CompleteIdempotencyReceipt = z.infer<
  typeof CompleteIdempotencyReceiptSchema
>;

export const ProviderCircuitFailureSchema = z
  .object({
    providerId: ProviderIdSchema,
    failureThreshold: z.number().int().min(1).max(100),
    cooldownMs: z.number().int().min(1_000).max(24 * 60 * 60 * 1_000),
    stateTtlMs: TtlMsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.stateTtlMs < value.cooldownMs) {
      context.addIssue({
        code: "custom",
        path: ["stateTtlMs"],
        message: "circuit state TTL must cover its cooldown",
      });
    }
  });

export class ProviderCircuitFailureDto extends createZodDto(
  ProviderCircuitFailureSchema
) {}

export type ProviderCircuitFailure = z.infer<
  typeof ProviderCircuitFailureSchema
>;

export const ProviderCircuitIdentitySchema = z
  .object({
    providerId: ProviderIdSchema,
  })
  .strict();

export class ProviderCircuitIdentityDto extends createZodDto(
  ProviderCircuitIdentitySchema
) {}

export type ProviderCircuitIdentity = z.infer<
  typeof ProviderCircuitIdentitySchema
>;

export const ConsumeProviderBudgetSchema = z
  .object({
    providerId: ProviderIdSchema,
    operationId: OpaqueIdentifierSchema,
    requestUnits: z.number().int().min(1).max(1_000_000),
    costUnits: z.number().int().min(0).max(1_000_000_000),
    maximumRequestUnits: z.number().int().min(1).max(1_000_000_000),
    maximumCostUnits: z.number().int().min(0).max(1_000_000_000),
    /**
     * Extra retention after the Redis-selected UTC midnight. The Lua script derives both the
     * current window and its base expiry from Redis TIME; callers cannot choose either boundary.
     */
    expiryGraceMs: z.number().int().min(60_000).max(24 * 60 * 60 * 1_000),
  })
  .strict();

export class ConsumeProviderBudgetDto extends createZodDto(
  ConsumeProviderBudgetSchema
) {}

export type ConsumeProviderBudget = z.infer<
  typeof ConsumeProviderBudgetSchema
>;

/**
 * A deliberately narrow, privacy-preserving cross-host limiter. `subjectFingerprint` is a
 * caller-created SHA-256 digest, never an IP address, email, token, or arbitrary user content.
 * The Redis client HMACs the complete key again before it leaves the API process.
 */
export const ConsumeRateLimitSchema = z
  .object({
    scope: z.enum(["auth"]),
    subjectFingerprint: Sha256FingerprintSchema,
    maximumRequests: z.number().int().min(1).max(100_000),
    windowMs: z.number().int().min(1_000).max(24 * 60 * 60 * 1_000),
  })
  .strict();

export type ConsumeRateLimit = z.infer<typeof ConsumeRateLimitSchema>;

export const AcquireCoordinationLeaseResultSchema = z
  .object({
    acquired: z.boolean(),
    remainingTtlMs: z.number().int().min(0),
  })
  .strict();

export type AcquireCoordinationLeaseResult = z.infer<
  typeof AcquireCoordinationLeaseResultSchema
>;

export const MutateCoordinationLeaseResultSchema = z
  .object({
    matched: z.boolean(),
    remainingTtlMs: z.number().int().min(0).nullable(),
  })
  .strict();

export type MutateCoordinationLeaseResult = z.infer<
  typeof MutateCoordinationLeaseResultSchema
>;

export const ReserveIdempotencyReceiptResultSchema = z
  .object({
    reserved: z.boolean(),
    state: z.enum(["pending", "completed", "request-conflict"]),
    remainingTtlMs: z.number().int().min(0),
  })
  .strict();

export type ReserveIdempotencyReceiptResult = z.infer<
  typeof ReserveIdempotencyReceiptResultSchema
>;

export const CompleteIdempotencyReceiptResultSchema = z
  .object({
    outcome: z.enum([
      "completed",
      "duplicate",
      "not-found",
      "conflict",
      "request-conflict",
    ]),
  })
  .strict();

export type CompleteIdempotencyReceiptResult = z.infer<
  typeof CompleteIdempotencyReceiptResultSchema
>;

export const ProviderCircuitStateSchema = z
  .object({
    state: z.enum(["closed", "open"]),
    consecutiveFailures: z.number().int().min(0),
    openedUntilEpochMs: z.number().int().min(0),
    observedAtEpochMs: z.number().int().min(0),
  })
  .strict();

export type ProviderCircuitState = z.infer<typeof ProviderCircuitStateSchema>;

export const ConsumeProviderBudgetResultSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    requestUnits: z.number().int().min(0),
    costUnits: z.number().int().min(0),
    windowId: z.string().regex(/^utc-day:[0-9]+$/u),
    remainingTtlMs: z.number().int().min(0),
  })
  .strict();

export type ConsumeProviderBudgetResult = z.infer<
  typeof ConsumeProviderBudgetResultSchema
>;

export const ConsumeRateLimitResultSchema = z
  .object({
    accepted: z.boolean(),
    requestCount: z.number().int().min(0),
    remainingTtlMs: z.number().int().min(0),
  })
  .strict();

export type ConsumeRateLimitResult = z.infer<
  typeof ConsumeRateLimitResultSchema
>;
