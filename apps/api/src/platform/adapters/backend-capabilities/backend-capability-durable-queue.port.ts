import { z } from "zod";

import {
  BackendCapabilityIdempotencyKeySchema,
  BackendCapabilityTenantIdSchema,
  CanonicalJsonValueSchema,
} from "./backend-capability-gateway-contract";

import type { CanonicalJsonValue } from "./backend-capability-gateway-contract";

export const BACKEND_CAPABILITY_DURABLE_QUEUE_PORT = Symbol(
  "BACKEND_CAPABILITY_DURABLE_QUEUE_PORT"
);

export const BACKEND_CAPABILITY_DURABLE_QUEUE_PROVIDERS = [
  "upstash-qstash",
  "cloudflare",
] as const;

export const BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS = [
  "cleanup",
  "notification",
] as const;

export const BackendCapabilityDurableQueueProviderSchema = z.enum(
  BACKEND_CAPABILITY_DURABLE_QUEUE_PROVIDERS
);
export const BackendCapabilityDurableQueueWorkloadSchema = z.enum(
  BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS
);

const BackendCapabilityDurableQueueTaskNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/u);

const BackendCapabilityDurableQueueTaskSchema = z
  .object({
    name: BackendCapabilityDurableQueueTaskNameSchema,
    body: CanonicalJsonValueSchema,
  })
  .strict();

const BackendCapabilityDurableQueuePayloadBaseSchema = z.object({
  requestKey: BackendCapabilityIdempotencyKeySchema,
  task: BackendCapabilityDurableQueueTaskSchema,
});

export const BackendCapabilityCleanupPayloadSchema =
  BackendCapabilityDurableQueuePayloadBaseSchema.extend({
    operation: z.literal("cleanup.dispatch"),
  }).strict();

export const BackendCapabilityNotificationPayloadSchema =
  BackendCapabilityDurableQueuePayloadBaseSchema.extend({
    operation: z.literal("notification.dispatch"),
  }).strict();

export const BackendCapabilityDurableQueuePayloadSchema = z.discriminatedUnion(
  "operation",
  [
    BackendCapabilityCleanupPayloadSchema,
    BackendCapabilityNotificationPayloadSchema,
  ]
);

export const BackendCapabilityDurableQueueCommandSchema = z
  .object({
    providerId: BackendCapabilityDurableQueueProviderSchema,
    tenantId: BackendCapabilityTenantIdSchema,
    workload: BackendCapabilityDurableQueueWorkloadSchema,
    idempotencyKey: BackendCapabilityIdempotencyKeySchema,
    createdAt: z.iso.datetime({ offset: true }),
    task: BackendCapabilityDurableQueueTaskSchema,
  })
  .strict();

export type BackendCapabilityDurableQueueCommand = z.infer<
  typeof BackendCapabilityDurableQueueCommandSchema
>;

const BackendCapabilityDurableQueueJobIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const BackendCapabilityDurableQueueErrorCodeSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[A-Z0-9][A-Z0-9_.:-]*$/u);

export const BackendCapabilityDurableQueueSubmissionSchema =
  z.discriminatedUnion("outcome", [
    z
      .object({
        outcome: z.literal("accepted"),
        jobId: BackendCapabilityDurableQueueJobIdSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("completed"),
        result: CanonicalJsonValueSchema.nullable(),
      })
      .strict(),
    z
      .object({
        outcome: z.literal("duplicate"),
        jobId: BackendCapabilityDurableQueueJobIdSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("rejected"),
        retryable: z.boolean(),
        errorCode: BackendCapabilityDurableQueueErrorCodeSchema,
      })
      .strict(),
  ]);

export type BackendCapabilityDurableQueueSubmission = z.infer<
  typeof BackendCapabilityDurableQueueSubmissionSchema
>;

export const BackendCapabilityDurableQueueReadinessSchema =
  z.discriminatedUnion("ready", [
    z
      .object({
        ready: z.literal(true),
        providerIds: z
          .array(BackendCapabilityDurableQueueProviderSchema)
          .min(1)
          .max(BACKEND_CAPABILITY_DURABLE_QUEUE_PROVIDERS.length),
        workloads: z
          .array(BackendCapabilityDurableQueueWorkloadSchema)
          .min(1)
          .max(BACKEND_CAPABILITY_DURABLE_QUEUE_WORKLOADS.length),
      })
      .strict(),
    z
      .object({
        ready: z.literal(false),
        reason: z.enum(["not-configured", "unreachable", "unsupported"]),
      })
      .strict(),
  ]);

export type BackendCapabilityDurableQueueReadiness = z.infer<
  typeof BackendCapabilityDurableQueueReadinessSchema
>;

export interface BackendCapabilityDurableQueueCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * Durable cleanup/notification dispatch only.
 *
 * The port deliberately receives no URL, headers, credentials, HTTP method, or provider base URL.
 * `task.name` selects a server-declared handler; `task.body` is opaque canonical JSON for that
 * handler. Implementations must durably deduplicate `idempotencyKey` before acknowledging a job.
 */
export interface BackendCapabilityDurableQueuePort {
  verifyReadiness(
    options?: BackendCapabilityDurableQueueCallOptions
  ): Promise<BackendCapabilityDurableQueueReadiness>;
  submit(
    command: BackendCapabilityDurableQueueCommand,
    options?: BackendCapabilityDurableQueueCallOptions
  ): Promise<BackendCapabilityDurableQueueSubmission>;
}

export interface BackendCapabilityDurableQueueAcceptedResult {
  readonly requestType: "cleanup" | "notification";
  readonly status: "accepted";
  readonly jobId: string;
}

export type BackendCapabilityDurableQueueCompletedResult =
  CanonicalJsonValue | null;
