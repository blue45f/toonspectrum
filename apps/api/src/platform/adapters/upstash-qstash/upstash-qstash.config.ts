import { z } from "zod";

const QStashOriginSchema = z
  .url({ protocol: /^https$/u })
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      (url.hostname === "qstash.upstash.io" ||
        /^qstash-[a-z0-9]+(?:-[a-z0-9]+)*\.upstash\.io$/u.test(
          url.hostname
        )),
    {
      message:
        "QStash URL must be an official HTTPS Upstash QStash origin",
    }
  )
  .transform((url) => url.origin);

const QStashPublishTokenSchema = z
  .string()
  .min(16)
  .max(4_096)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/u);

const QStashUrlGroupSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);

const boundedInteger = (
  fallback: number,
  minimum: number,
  maximum: number
) =>
  z
    .string()
    .regex(/^(?:0|[1-9]\d*)$/u)
    .default(String(fallback))
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));

const EnabledEnvironmentSchema = z
  .object({
    apiBaseUrl: QStashOriginSchema,
    publishToken: QStashPublishTokenSchema,
    urlGroup: QStashUrlGroupSchema,
    timeoutMs: boundedInteger(2_500, 100, 30_000),
    deliveryTimeoutSeconds: boundedInteger(30, 1, 120),
    retries: boundedInteger(3, 0, 10),
    maximumRequestBytes: boundedInteger(
      256 * 1_024,
      1_024,
      1_024 * 1_024
    ),
    maximumResponseBytes: boundedInteger(
      32 * 1_024,
      1_024,
      256 * 1_024
    ),
  })
  .strict();

const ResolvedConfigSchema = z
  .object({
    apiBaseUrl: QStashOriginSchema,
    publishToken: QStashPublishTokenSchema,
    urlGroup: QStashUrlGroupSchema,
    timeoutMs: z.number().int().min(100).max(30_000),
    deliveryTimeoutSeconds: z.number().int().min(1).max(120),
    retries: z.number().int().min(0).max(10),
    maximumRequestBytes: z
      .number()
      .int()
      .min(1_024)
      .max(1_024 * 1_024),
    maximumResponseBytes: z
      .number()
      .int()
      .min(1_024)
      .max(256 * 1_024),
  })
  .strict();

export interface UpstashQStashConfig {
  readonly apiBaseUrl: string;
  readonly publishToken: string;
  readonly urlGroup: string;
  readonly timeoutMs: number;
  readonly deliveryTimeoutSeconds: number;
  readonly retries: number;
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
}

export class UpstashQStashConfigurationError extends Error {
  constructor() {
    super("Upstash QStash durable queue configuration is invalid.");
    this.name = "UpstashQStashConfigurationError";
  }
}

/**
 * Keep the public Nest registration seam fail-closed too. TypeScript interfaces disappear at
 * runtime, so callers must not be able to bypass the official-host and bounded-I/O contract by
 * passing a hand-built object directly to `register()` or the adapter constructor.
 */
export function validateUpstashQStashConfig(
  candidate: unknown
): UpstashQStashConfig {
  const parsed = ResolvedConfigSchema.safeParse(candidate);
  if (!parsed.success) throw new UpstashQStashConfigurationError();
  return Object.freeze(parsed.data);
}

type EnvLike =
  | NodeJS.ProcessEnv
  | Readonly<Record<string, string | undefined>>;

/**
 * QStash is installed only for an explicitly enabled distributed provider. The QStash REST API
 * origin and publish token are deliberately separate from BACKEND_UPSTASH_QSTASH_BASE_URL and
 * BACKEND_UPSTASH_QSTASH_AUTH_TOKEN: those identify/authenticate the ToonSpectrum provider facade,
 * while these credentials can publish paid QStash messages and must never reach a worker/browser.
 */
export function resolveUpstashQStashConfig(
  environment: EnvLike
): UpstashQStashConfig | null {
  const distributionEnabled = environment.BACKEND_DISTRIBUTION_ENABLED;
  const providerEnabled = environment.BACKEND_UPSTASH_QSTASH_ENABLED;

  if (distributionEnabled !== "true") return null;
  if (
    providerEnabled === undefined ||
    providerEnabled === "" ||
    providerEnabled === "false"
  ) {
    return null;
  }
  if (providerEnabled !== "true") {
    throw new UpstashQStashConfigurationError();
  }

  const parsed = EnabledEnvironmentSchema.safeParse({
    apiBaseUrl: environment.BACKEND_UPSTASH_QSTASH_API_BASE_URL,
    publishToken: environment.BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN,
    urlGroup: environment.BACKEND_UPSTASH_QSTASH_URL_GROUP,
    timeoutMs: environment.BACKEND_UPSTASH_QSTASH_TIMEOUT_MS,
    deliveryTimeoutSeconds:
      environment.BACKEND_UPSTASH_QSTASH_DELIVERY_TIMEOUT_SECONDS,
    retries: environment.BACKEND_UPSTASH_QSTASH_RETRIES,
    maximumRequestBytes:
      environment.BACKEND_UPSTASH_QSTASH_MAXIMUM_REQUEST_BYTES,
    maximumResponseBytes:
      environment.BACKEND_UPSTASH_QSTASH_MAXIMUM_RESPONSE_BYTES,
  });
  if (!parsed.success) {
    throw new UpstashQStashConfigurationError();
  }

  return validateUpstashQStashConfig(parsed.data);
}
