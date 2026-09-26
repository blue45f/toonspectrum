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
    { message: "Upstash REST URL must be an HTTPS origin without credentials" }
  )
  .transform((url) => url.origin);

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
    restUrl: HttpsOriginSchema,
    restToken: z.string().min(16).max(4_096),
    keyHashSecret: z.string().min(32).max(4_096),
    namespace: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
      .default("toonspectrum"),
    timeoutMs: IntegerEnvironmentValueSchema(2_500, 100, 30_000),
    maximumRequestBytes: IntegerEnvironmentValueSchema(
      16 * 1_024,
      1_024,
      128 * 1_024
    ),
    maximumResponseBytes: IntegerEnvironmentValueSchema(
      32 * 1_024,
      1_024,
      256 * 1_024
    ),
  })
  .strict();

export interface UpstashCoordinationConfig {
  readonly restUrl: string;
  readonly restToken: string;
  readonly keyHashSecret: string;
  readonly namespace: string;
  readonly timeoutMs: number;
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
}

export class UpstashCoordinationConfigurationError extends Error {
  constructor() {
    super("Upstash coordination configuration is invalid.");
    this.name = "UpstashCoordinationConfigurationError";
  }
}

function configuredEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>
) {
  return {
    enabled: environment.UPSTASH_COORDINATION_ENABLED,
    restUrl: environment.UPSTASH_COORDINATION_REST_URL,
    restToken: environment.UPSTASH_COORDINATION_REST_TOKEN,
    keyHashSecret: environment.UPSTASH_COORDINATION_KEY_HASH_SECRET,
    namespace: environment.UPSTASH_COORDINATION_NAMESPACE,
    timeoutMs: environment.UPSTASH_COORDINATION_TIMEOUT_MS,
    maximumRequestBytes:
      environment.UPSTASH_COORDINATION_MAX_REQUEST_BYTES,
    maximumResponseBytes:
      environment.UPSTASH_COORDINATION_MAX_RESPONSE_BYTES,
  };
}

/**
 * Disabled means absent from the Nest module graph, never an in-memory or permissive no-op.
 * Any explicit value other than `true` or `false` is a configuration failure.
 */
export function resolveUpstashCoordinationConfig(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>
): UpstashCoordinationConfig | null {
  const enabled = environment.UPSTASH_COORDINATION_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return null;
  }
  if (enabled !== "true") {
    throw new UpstashCoordinationConfigurationError();
  }

  const parsed = EnabledEnvironmentSchema.safeParse(
    configuredEnvironment(environment)
  );
  if (!parsed.success) {
    throw new UpstashCoordinationConfigurationError();
  }

  return {
    restUrl: parsed.data.restUrl,
    restToken: parsed.data.restToken,
    keyHashSecret: parsed.data.keyHashSecret,
    namespace: parsed.data.namespace,
    timeoutMs: parsed.data.timeoutMs,
    maximumRequestBytes: parsed.data.maximumRequestBytes,
    maximumResponseBytes: parsed.data.maximumResponseBytes,
  };
}
