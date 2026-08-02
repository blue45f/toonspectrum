import { z } from "zod";

import {
  BackendCapabilityIdempotencyKeySchema,
  BackendCapabilityTenantIdSchema,
} from "../backend-capabilities/backend-capability-gateway-contract";

export const UPSTASH_QSTASH_CONTRACT_VERSION =
  "toonspectrum.backend-durable-queue.v1" as const;

const OpaqueWorkIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value);

const CleanupTaskSchema = z
  .object({
    name: z.literal("assets.expire-orphans"),
    body: z
      .object({
        workId: OpaqueWorkIdSchema,
        revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const NotificationTaskSchema = z
  .object({
    name: z.literal("creator.publish-complete"),
    body: z
      .object({
        workId: OpaqueWorkIdSchema,
      })
      .strict(),
  })
  .strict();

const DeliveryBaseSchema = z.object({
  contractVersion: z.literal(UPSTASH_QSTASH_CONTRACT_VERSION),
  providerId: z.literal("upstash-qstash"),
  tenantId: BackendCapabilityTenantIdSchema,
  idempotencyKey: BackendCapabilityIdempotencyKeySchema,
  createdAt: z.iso.datetime({ offset: true }),
});

/** The only two queue messages the ToonSpectrum QStash worker is authorized to execute. */
export const UpstashQStashDeliverySchema = z.discriminatedUnion("workload", [
  DeliveryBaseSchema.extend({
    workload: z.literal("cleanup"),
    task: CleanupTaskSchema,
  }).strict(),
  DeliveryBaseSchema.extend({
    workload: z.literal("notification"),
    task: NotificationTaskSchema,
  }).strict(),
]);

export type UpstashQStashDelivery = z.infer<
  typeof UpstashQStashDeliverySchema
>;
