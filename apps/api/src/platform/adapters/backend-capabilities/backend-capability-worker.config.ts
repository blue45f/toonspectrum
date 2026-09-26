import { z } from "zod";

const positiveInteger = (minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/u)
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));

const BackendCapabilityWorkerEnvironmentSchema = z.object({
  BACKEND_CAPABILITY_WORKER_ENABLED: z.enum(["true", "false"]).optional(),
  BACKEND_THUMBNAIL_WORKER_MAXIMUM_SOURCE_BYTES: positiveInteger(
    1_024,
    67_108_864,
  ).optional(),
  BACKEND_THUMBNAIL_WORKER_MAXIMUM_SOURCE_PIXELS: positiveInteger(
    1,
    268_435_456,
  ).optional(),
  BACKEND_THUMBNAIL_WORKER_MAXIMUM_OUTPUT_PIXELS: positiveInteger(
    1,
    67_108_864,
  ).optional(),
  BACKEND_THUMBNAIL_WORKER_MAXIMUM_OUTPUT_BYTES: positiveInteger(
    1_024,
    67_108_864,
  ).optional(),
  BACKEND_THUMBNAIL_WORKER_SIGNED_URL_TTL_SECONDS: positiveInteger(
    30,
    300,
  ).optional(),
});

export interface BackendCapabilityWorkerConfig {
  readonly maximumSourceBytes: number;
  readonly maximumSourcePixels: number;
  readonly maximumOutputPixels: number;
  readonly maximumOutputBytes: number;
  readonly signedUrlTtlSeconds: number;
}

export class BackendCapabilityWorkerConfigurationError extends Error {
  constructor() {
    super("Backend capability worker configuration is invalid.");
    this.name = "BackendCapabilityWorkerConfigurationError";
  }
}

export function resolveBackendCapabilityWorkerConfig(
  environment:
    | NodeJS.ProcessEnv
    | Readonly<Record<string, string | undefined>>,
): BackendCapabilityWorkerConfig | null {
  const parsed = BackendCapabilityWorkerEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new BackendCapabilityWorkerConfigurationError();
  }
  if (parsed.data.BACKEND_CAPABILITY_WORKER_ENABLED !== "true") {
    return null;
  }
  return {
    maximumSourceBytes:
      parsed.data.BACKEND_THUMBNAIL_WORKER_MAXIMUM_SOURCE_BYTES ?? 16_777_216,
    maximumSourcePixels:
      parsed.data.BACKEND_THUMBNAIL_WORKER_MAXIMUM_SOURCE_PIXELS ?? 16_777_216,
    maximumOutputPixels:
      parsed.data.BACKEND_THUMBNAIL_WORKER_MAXIMUM_OUTPUT_PIXELS ?? 4_194_304,
    maximumOutputBytes:
      parsed.data.BACKEND_THUMBNAIL_WORKER_MAXIMUM_OUTPUT_BYTES ?? 16_777_216,
    signedUrlTtlSeconds:
      parsed.data.BACKEND_THUMBNAIL_WORKER_SIGNED_URL_TTL_SECONDS ?? 60,
  };
}
