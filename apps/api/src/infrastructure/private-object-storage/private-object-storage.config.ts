import { createHash } from "node:crypto";

import { z } from "zod";

import {
  resolveSupabaseObjectStorageConfig,
  type SupabaseObjectStorageConfig,
} from "../supabase-object-storage/supabase-object-storage.config";
import { PrivateObjectPurposeSchema } from "./private-object-storage.contract";
import {
  PRIVATE_OBJECT_STORAGE_PROVIDER_IDS,
  type PrivateObjectStorageProviderId,
  type PrivateObjectStoragePurposeRouting,
} from "./purpose-routed-private-object-storage.port";

const ProviderIdSchema = z.enum(PRIVATE_OBJECT_STORAGE_PROVIDER_IDS);
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
    { message: "Object storage endpoint must be an exact HTTPS origin." },
  )
  .transform((url) => url.origin);

const BucketNameSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/u)
  .refine((value) => !value.includes(".."), {
    message: "Bucket name must not contain consecutive periods.",
  });

const IntegerEnvironmentValueSchema = (
  fallback: number,
  minimum: number,
  maximum: number,
) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/u)
    .default(String(fallback))
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));

const S3ProviderEnvironmentSchema = z
  .object({
    enabled: z.literal("true"),
    endpoint: HttpsOriginSchema,
    region: z.string().min(1).max(80).regex(/^[A-Za-z0-9-]+$/u),
    accessKeyId: z.string().min(8).max(512),
    secretAccessKey: z.string().min(16).max(2_048),
    sourceBucket: BucketNameSchema,
    derivedBucket: BucketNameSchema,
    exportBucket: BucketNameSchema,
    privateBucketsConfirmed: z.literal("true"),
    timeoutMs: IntegerEnvironmentValueSchema(15_000, 100, 120_000),
    maximumAssetBytes: IntegerEnvironmentValueSchema(
      64 * 1_024 * 1_024,
      1,
      5 * 1_024 * 1_024 * 1_024,
    ),
    maximumControlMetadataBytes: IntegerEnvironmentValueSchema(
      4 * 1_024,
      512,
      16 * 1_024,
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

const RoutingEnvironmentSchema = z
  .object({
    enabled: z.literal("true"),
    source: ProviderIdSchema,
    derived: ProviderIdSchema,
    export: ProviderIdSchema,
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export interface S3CompatibleObjectStorageConfig {
  readonly providerId: Exclude<
    PrivateObjectStorageProviderId,
    "supabase"
  >;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly buckets: Readonly<Record<
    z.infer<typeof PrivateObjectPurposeSchema>,
    string
  >>;
  readonly timeoutMs: number;
  readonly maximumAssetBytes: number;
  readonly maximumControlMetadataBytes: number;
}

export interface PrivateObjectStoragePlan {
  readonly routing: PrivateObjectStoragePurposeRouting;
  readonly supabase: SupabaseObjectStorageConfig | null;
  readonly s3: Readonly<
    Partial<Record<
      Exclude<PrivateObjectStorageProviderId, "supabase">,
      S3CompatibleObjectStorageConfig
    >>
  >;
  readonly compatibilityMode: "legacy-supabase" | "purpose-routed";
}

export class PrivateObjectStorageConfigurationError extends Error {
  constructor() {
    super("Private object storage configuration is invalid.");
    this.name = "PrivateObjectStorageConfigurationError";
  }
}

export function privateObjectStorageRoutingFingerprint(
  routing: PrivateObjectStoragePurposeRouting,
): string {
  const canonical = PrivateObjectPurposeSchema.options
    .map((purpose) => `${purpose}=${routing[purpose]}`)
    .join("\n");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function s3EnvironmentPrefix(
  providerId: Exclude<PrivateObjectStorageProviderId, "supabase">,
): "R2_OBJECT_STORAGE" | "B2_OBJECT_STORAGE" {
  return providerId === "cloudflare-r2"
    ? "R2_OBJECT_STORAGE"
    : "B2_OBJECT_STORAGE";
}

function configuredS3Environment(
  environment: Readonly<Record<string, string | undefined>>,
  prefix: string,
) {
  return {
    enabled: environment[`${prefix}_ENABLED`],
    endpoint: environment[`${prefix}_ENDPOINT`],
    region: environment[`${prefix}_REGION`],
    accessKeyId: environment[`${prefix}_ACCESS_KEY_ID`],
    secretAccessKey: environment[`${prefix}_SECRET_ACCESS_KEY`],
    sourceBucket: environment[`${prefix}_SOURCE_BUCKET`],
    derivedBucket: environment[`${prefix}_DERIVED_BUCKET`],
    exportBucket: environment[`${prefix}_EXPORT_BUCKET`],
    privateBucketsConfirmed:
      environment[`${prefix}_PRIVATE_BUCKETS_CONFIRMED`],
    timeoutMs: environment[`${prefix}_TIMEOUT_MS`],
    maximumAssetBytes: environment[`${prefix}_MAXIMUM_ASSET_BYTES`],
    maximumControlMetadataBytes:
      environment[`${prefix}_MAXIMUM_CONTROL_METADATA_BYTES`],
  };
}

function resolveS3ProviderConfig(
  environment: Readonly<Record<string, string | undefined>>,
  providerId: Exclude<PrivateObjectStorageProviderId, "supabase">,
): S3CompatibleObjectStorageConfig | null {
  const prefix = s3EnvironmentPrefix(providerId);
  const enabled = environment[`${prefix}_ENABLED`];
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return null;
  }
  if (enabled !== "true") {
    throw new PrivateObjectStorageConfigurationError();
  }
  const parsed = S3ProviderEnvironmentSchema.safeParse(
    configuredS3Environment(environment, prefix),
  );
  if (!parsed.success) {
    throw new PrivateObjectStorageConfigurationError();
  }
  return {
    providerId,
    endpoint: parsed.data.endpoint,
    region: parsed.data.region,
    accessKeyId: parsed.data.accessKeyId,
    secretAccessKey: parsed.data.secretAccessKey,
    buckets: {
      source: parsed.data.sourceBucket,
      derived: parsed.data.derivedBucket,
      export: parsed.data.exportBucket,
    },
    timeoutMs: parsed.data.timeoutMs,
    maximumAssetBytes: parsed.data.maximumAssetBytes,
    maximumControlMetadataBytes:
      parsed.data.maximumControlMetadataBytes,
  };
}

function routingEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return {
    enabled: environment.PRIVATE_OBJECT_STORAGE_ENABLED,
    source: environment.PRIVATE_OBJECT_STORAGE_SOURCE_PROVIDER,
    derived: environment.PRIVATE_OBJECT_STORAGE_DERIVED_PROVIDER,
    export: environment.PRIVATE_OBJECT_STORAGE_EXPORT_PROVIDER,
    fingerprint: environment.PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT,
  };
}

function legacySupabasePlan(
  environment: Readonly<Record<string, string | undefined>>,
): PrivateObjectStoragePlan | null {
  const supabase = resolveSupabaseObjectStorageConfig(environment);
  if (!supabase) return null;
  return {
    routing: {
      source: "supabase",
      derived: "supabase",
      export: "supabase",
    },
    supabase,
    s3: {},
    compatibilityMode: "legacy-supabase",
  };
}

export function resolvePrivateObjectStoragePlan(
  environment:
    | NodeJS.ProcessEnv
    | Readonly<Record<string, string | undefined>>,
): PrivateObjectStoragePlan | null {
  const enabled = environment.PRIVATE_OBJECT_STORAGE_ENABLED;
  if (enabled === undefined || enabled === "") {
    return legacySupabasePlan(environment);
  }
  if (enabled === "false") return null;
  if (enabled !== "true") {
    throw new PrivateObjectStorageConfigurationError();
  }

  const parsed = RoutingEnvironmentSchema.safeParse(
    routingEnvironment(environment),
  );
  if (!parsed.success) {
    throw new PrivateObjectStorageConfigurationError();
  }
  const routing: PrivateObjectStoragePurposeRouting = {
    source: parsed.data.source,
    derived: parsed.data.derived,
    export: parsed.data.export,
  };
  if (
    parsed.data.fingerprint
    !== privateObjectStorageRoutingFingerprint(routing)
  ) {
    throw new PrivateObjectStorageConfigurationError();
  }

  const selected = new Set(Object.values(routing));
  const supabase = selected.has("supabase")
    ? resolveSupabaseObjectStorageConfig(environment)
    : null;
  if (selected.has("supabase") && !supabase) {
    throw new PrivateObjectStorageConfigurationError();
  }

  const s3: Partial<Record<
    Exclude<PrivateObjectStorageProviderId, "supabase">,
    S3CompatibleObjectStorageConfig
  >> = {};
  for (const providerId of [
    "cloudflare-r2",
    "backblaze-b2",
  ] as const) {
    if (!selected.has(providerId)) continue;
    const config = resolveS3ProviderConfig(environment, providerId);
    if (!config) throw new PrivateObjectStorageConfigurationError();
    s3[providerId] = config;
  }

  return {
    routing,
    supabase,
    s3,
    compatibilityMode: "purpose-routed",
  };
}
