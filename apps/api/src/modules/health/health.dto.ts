import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const HealthLiveResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .strict();

export const HealthReadyResponseSchema = z
  .object({
    status: z.literal("ready"),
  })
  .strict();

export const HealthNotReadyResponseSchema = z
  .object({
    statusCode: z.literal(503),
    code: z.literal("SERVICE_NOT_READY"),
    status: z.literal("not_ready"),
    error: z.literal("service_not_ready"),
    capability: z.literal("service.readiness"),
    retryable: z.literal(true),
    retryAfterSeconds: z.number().int().min(1).max(3_600),
    incidentId: z.string().regex(/^inc_[A-Za-z0-9._-]+$/u),
    message: z.literal("This feature is temporarily unavailable"),
  })
  .strict();

export const HealthCapabilityStateSchema = z.enum([
  "available",
  "degraded",
  "unavailable",
]);

export const HealthCapabilitiesResponseSchema = z
  .object({
    status: z.enum(["available", "degraded"]),
    incidentId: z.string().regex(/^inc_[A-Za-z0-9._-]+$/u).nullable(),
    retryAfterSeconds: z.number().int().min(1).max(3_600).nullable(),
    checkedAt: z.string().datetime(),
    capabilities: z.object({
      publicCatalog: HealthCapabilityStateSchema,
      authSession: HealthCapabilityStateSchema,
      communityRead: HealthCapabilityStateSchema,
      communityWrite: HealthCapabilityStateSchema,
      marketplaceRead: HealthCapabilityStateSchema,
      studioLocalEditing: HealthCapabilityStateSchema,
      studioProjectRead: HealthCapabilityStateSchema,
      studioCloudSave: HealthCapabilityStateSchema,
      realtimeCollaboration: HealthCapabilityStateSchema,
      publishing: HealthCapabilityStateSchema,
      serverAi: HealthCapabilityStateSchema,
    }).strict(),
  })
  .strict();

export class HealthLiveResponseDto extends createZodDto(
  HealthLiveResponseSchema,
) {}

export class HealthReadyResponseDto extends createZodDto(
  HealthReadyResponseSchema,
) {}

export class HealthCapabilitiesResponseDto extends createZodDto(
  HealthCapabilitiesResponseSchema,
) {}
