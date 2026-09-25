import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const HealthLiveResponseSchema = z
  .object({ status: z.literal("ok") })
  .strict();

export const HealthReadyResponseSchema = z
  .object({ status: z.literal("ready") })
  .strict();

export const HealthNotReadyResponseSchema = z
  .object({
    statusCode: z.literal(503),
    status: z.literal("not_ready"),
    error: z.literal("service_not_ready"),
    code: z.literal("SERVICE_NOT_READY"),
    capability: z.literal("service.readiness"),
    retryable: z.literal(true),
    retryAfterSeconds: z.number().int().min(1).max(3_600),
    incidentId: z.string().min(1).max(128),
    message: z.literal("Service is not ready"),
  })
  .strict();

const CapabilityStateSchema = z.enum(["available", "unavailable"]);

export const HealthCapabilitiesResponseSchema = z
  .object({
    status: z.enum(["available", "degraded"]),
    incidentId: z.string().min(1).max(128).nullable(),
    capabilities: z
      .object({
        publicCatalog: CapabilityStateSchema,
        authSession: CapabilityStateSchema,
        communityRead: CapabilityStateSchema,
        communityWrite: CapabilityStateSchema,
        marketplaceRead: CapabilityStateSchema,
        studioLocalEditing: CapabilityStateSchema,
        studioProjectRead: CapabilityStateSchema,
        studioCloudSave: CapabilityStateSchema,
        realtimeCollaboration: CapabilityStateSchema,
        publishing: CapabilityStateSchema,
        serverAi: CapabilityStateSchema,
      })
      .strict(),
    failedChecks: z.array(z.string().min(1).max(64)).max(16),
    checkedAt: z.string().datetime(),
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
