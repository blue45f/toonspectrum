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
    status: z.literal("not_ready"),
    error: z.literal("service_not_ready"),
    message: z.literal("Service is not ready"),
  })
  .strict();

export class HealthLiveResponseDto extends createZodDto(
  HealthLiveResponseSchema,
) {}

export class HealthReadyResponseDto extends createZodDto(
  HealthReadyResponseSchema,
) {}
