import { z } from "zod";

const HttpsOriginSchema = z
  .url({ protocol: /^https$/u })
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "",
    {
      message:
        "Supabase object storage URL must be an HTTPS origin without credentials.",
    }
  )
  .transform((url) => url.origin);

const BucketNameSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9_-]{1,61}[a-z0-9])$/u);

const IntegerEnvironmentValueSchema = (
  fallback: number,
  minimum: number,
  maximum: number
) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/u)
    .default(String(fallback))
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));

const EnabledEnvironmentSchema = z
  .object({
    enabled: z.literal("true"),
    projectUrl: HttpsOriginSchema,
    serviceRoleKey: z.string().min(32).max(16_384),
    sourceBucket: BucketNameSchema,
    derivedBucket: BucketNameSchema,
    exportBucket: BucketNameSchema,
    timeoutMs: IntegerEnvironmentValueSchema(15_000, 100, 120_000),
    maximumAssetBytes: IntegerEnvironmentValueSchema(
      64 * 1_024 * 1_024,
      1,
      5 * 1_024 * 1_024 * 1_024
    ),
    maximumControlMetadataBytes: IntegerEnvironmentValueSchema(
      4 * 1_024,
      512,
      16 * 1_024
    ),
    maximumResponseBytes: IntegerEnvironmentValueSchema(
      64 * 1_024,
      1_024,
      256 * 1_024
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const buckets = [
      value.sourceBucket,
      value.derivedBucket,
      value.exportBucket,
    ];
    if (new Set(buckets).size !== buckets.length) {
      context.addIssue({
        code: "custom",
        message: "Purpose buckets must be distinct.",
      });
    }
  });

export interface SupabaseObjectStorageConfig {
  readonly projectUrl: string;
  readonly serviceRoleKey: string;
  readonly buckets: {
    readonly source: string;
    readonly derived: string;
    readonly export: string;
  };
  readonly timeoutMs: number;
  readonly maximumAssetBytes: number;
  readonly maximumControlMetadataBytes: number;
  readonly maximumResponseBytes: number;
}

export class SupabaseObjectStorageConfigurationError extends Error {
  constructor() {
    super("Supabase object storage configuration is invalid.");
    this.name = "SupabaseObjectStorageConfigurationError";
  }
}

function configuredEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>
) {
  return {
    enabled: environment.SUPABASE_OBJECT_STORAGE_ENABLED,
    projectUrl: environment.SUPABASE_OBJECT_STORAGE_URL,
    serviceRoleKey:
      environment.SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY,
    sourceBucket: environment.SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET,
    derivedBucket: environment.SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET,
    exportBucket: environment.SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET,
    timeoutMs: environment.SUPABASE_OBJECT_STORAGE_TIMEOUT_MS,
    maximumAssetBytes:
      environment.SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES,
    maximumControlMetadataBytes:
      environment.SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES,
    maximumResponseBytes:
      environment.SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES,
  };
}

/**
 * Disabled means absent from the Nest module graph. It never installs an
 * in-memory, local-filesystem, public-bucket, or best-effort substitute.
 */
export function resolveSupabaseObjectStorageConfig(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>
): SupabaseObjectStorageConfig | null {
  const enabled = environment.SUPABASE_OBJECT_STORAGE_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return null;
  }
  if (enabled !== "true") {
    throw new SupabaseObjectStorageConfigurationError();
  }

  const parsed = EnabledEnvironmentSchema.safeParse(
    configuredEnvironment(environment)
  );
  if (!parsed.success) {
    throw new SupabaseObjectStorageConfigurationError();
  }

  return {
    projectUrl: parsed.data.projectUrl,
    serviceRoleKey: parsed.data.serviceRoleKey,
    buckets: {
      source: parsed.data.sourceBucket,
      derived: parsed.data.derivedBucket,
      export: parsed.data.exportBucket,
    },
    timeoutMs: parsed.data.timeoutMs,
    maximumAssetBytes: parsed.data.maximumAssetBytes,
    maximumControlMetadataBytes:
      parsed.data.maximumControlMetadataBytes,
    maximumResponseBytes: parsed.data.maximumResponseBytes,
  };
}
