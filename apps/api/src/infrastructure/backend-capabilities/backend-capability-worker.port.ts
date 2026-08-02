import { z } from "zod";

import { SupabaseObjectReferenceSchema } from "../supabase-object-storage/supabase-object-storage.contract";

import {
  BackendCapabilityIdempotencyKeySchema,
  BackendCapabilityTenantIdSchema,
  CanonicalJsonValueSchema,
} from "./backend-capability-gateway-contract";

export const BACKEND_CAPABILITY_WORKER_PORT = Symbol(
  "BACKEND_CAPABILITY_WORKER_PORT",
);

export const BACKEND_CAPABILITY_WORKER_OPERATIONS = [
  "thumbnail.render",
  "studio-ai-long",
] as const;

export const BackendCapabilityWorkerOperationSchema = z.enum(
  BACKEND_CAPABILITY_WORKER_OPERATIONS,
);

export const BackendCapabilityThumbnailCommandSchema = z
  .object({
    operation: z.literal("thumbnail.render"),
    tenantId: BackendCapabilityTenantIdSchema,
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    sourceAssetId: z.string().min(1).max(256),
    sourceObject: SupabaseObjectReferenceSchema.refine(
      (object) => object.purpose === "source",
      "thumbnail input must be an immutable source object",
    ),
    format: z.enum(["png", "jpeg"]),
    maxWidth: z.number().int().positive().max(8_192),
    maxHeight: z.number().int().positive().max(8_192),
  })
  .strict();

export const BackendCapabilityLongAiCommandSchema = z
  .object({
    operation: z.literal("studio-ai-long"),
    tenantId: BackendCapabilityTenantIdSchema,
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    jobType: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9._:-]*$/u),
    task: CanonicalJsonValueSchema,
  })
  .strict();

export const BackendCapabilityWorkerCommandSchema = z.discriminatedUnion(
  "operation",
  [
    BackendCapabilityThumbnailCommandSchema,
    BackendCapabilityLongAiCommandSchema,
  ],
);

export type BackendCapabilityWorkerCommand = z.infer<
  typeof BackendCapabilityWorkerCommandSchema
>;

const BackendCapabilityWorkerJobIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const BackendCapabilityWorkerErrorCodeSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[A-Z0-9][A-Z0-9_.:-]*$/u);

export const BackendCapabilityWorkerSubmissionSchema = z.discriminatedUnion(
  "outcome",
  [
    z
      .object({
        outcome: z.literal("accepted"),
        jobId: BackendCapabilityWorkerJobIdSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("completed"),
        result: CanonicalJsonValueSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("duplicate"),
        jobId: BackendCapabilityWorkerJobIdSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("rejected"),
        retryable: z.boolean(),
        errorCode: BackendCapabilityWorkerErrorCodeSchema,
      })
      .strict(),
  ],
);

export type BackendCapabilityWorkerSubmission = z.infer<
  typeof BackendCapabilityWorkerSubmissionSchema
>;

export const BackendCapabilityWorkerReadinessSchema = z.discriminatedUnion(
  "ready",
  [
    z
      .object({
        ready: z.literal(true),
        operations: z
          .array(BackendCapabilityWorkerOperationSchema)
          .min(1)
          .max(BACKEND_CAPABILITY_WORKER_OPERATIONS.length),
      })
      .strict(),
    z
      .object({
        ready: z.literal(false),
        reason: z.enum([
          "not-configured",
          "object-storage-unavailable",
          "executor-unavailable",
        ]),
      })
      .strict(),
  ],
);

export type BackendCapabilityWorkerReadiness = z.infer<
  typeof BackendCapabilityWorkerReadinessSchema
>;

export interface BackendCapabilityWorkerCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * Executes only server-declared capability commands. The port deliberately receives no provider
 * URL, HTTP method, credential or arbitrary object path, so an admitted command cannot become an
 * SSRF relay. Implementations must be idempotent for the supplied key before returning accepted or
 * completed. Large bytes remain in immutable object storage; only canonical control results cross
 * this boundary.
 */
export interface BackendCapabilityWorkerPort {
  verifyReadiness(
    options?: BackendCapabilityWorkerCallOptions,
  ): Promise<BackendCapabilityWorkerReadiness>;
  submit(
    command: BackendCapabilityWorkerCommand,
    options?: BackendCapabilityWorkerCallOptions,
  ): Promise<BackendCapabilityWorkerSubmission>;
}
