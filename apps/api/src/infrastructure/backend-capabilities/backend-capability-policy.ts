import { z } from "zod";

/**
 * Only non-authoritative workloads are routable through the distributed capability boundary.
 * Authentication, billing, work saves and CRDT metadata deliberately do not appear in this union.
 */
export const BACKEND_CAPABILITY_IDS = [
  "async-job",
  "object-storage",
  "realtime",
] as const;

export type BackendCapabilityId = (typeof BACKEND_CAPABILITY_IDS)[number];

export const BACKEND_CAPABILITY_WORKLOADS = [
  "thumbnail",
  "webhook",
  "cleanup",
  "notification",
  "studio-asset",
  "thumbnail-asset",
  "export-asset",
  "presence",
  "comments",
  "screen-signaling",
] as const;

export type BackendCapabilityWorkload =
  (typeof BACKEND_CAPABILITY_WORKLOADS)[number];

export const BACKEND_PLACEMENT_ROLES = [
  "edge-short",
  "durable-queue",
  "container-worker",
  "object-store",
  "realtime-relay",
] as const;

export type BackendPlacementRole = (typeof BACKEND_PLACEMENT_ROLES)[number];

export const BACKEND_GATEWAY_HARD_MAX_BODY_BYTES = 16 * 1024 * 1024;
export const BACKEND_GATEWAY_HARD_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export const BACKEND_REMOTE_PROVIDER_IDS = [
  "cloudflare",
  "supabase",
  "firebase",
  "vercel",
  "netlify",
  "render",
  "fly",
  "railway",
  "cloudtype",
  "cloud-run",
  "aws-lambda",
  "azure-functions",
  "deno-deploy",
  "koyeb",
  "upstash-qstash",
] as const;

export type BackendRemoteProviderId =
  (typeof BACKEND_REMOTE_PROVIDER_IDS)[number];
export type BackendCapabilityProviderId = BackendRemoteProviderId | "local";

export const BackendCapabilityRequestSchema = z
  .object({
    capability: z.enum(BACKEND_CAPABILITY_IDS),
    workload: z.enum(BACKEND_CAPABILITY_WORKLOADS),
    estimatedCostUnits: z.number().int().positive().max(1_000_000),
    estimatedDurationMs: z.number().int().positive().max(86_400_000),
    payloadBytes: z
      .number()
      .int()
      .nonnegative()
      .max(BACKEND_GATEWAY_HARD_MAX_BODY_BYTES),
    coldStartTolerant: z.boolean(),
    durability: z.enum(["best-effort", "durable"]),
  })
  .superRefine((request, context) => {
    const workloadCapability = BACKEND_WORKLOAD_CAPABILITY[request.workload];
    if (request.capability !== workloadCapability) {
      context.addIssue({
        code: "custom",
        path: ["workload"],
        message: `${request.workload} is not an ${request.capability} workload`,
      });
    }
    if (
      request.capability === "object-storage" &&
      request.durability !== "durable"
    ) {
      context.addIssue({
        code: "custom",
        path: ["durability"],
        message: "object storage must be durable",
      });
    }
  });

export type BackendCapabilityRequest = z.infer<
  typeof BackendCapabilityRequestSchema
>;

export interface BackendRemoteProviderPolicy {
  readonly id: BackendRemoteProviderId;
  readonly enabled: boolean;
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly supportedCapabilities: ReadonlySet<BackendCapabilityId>;
  readonly placementRoles: ReadonlySet<BackendPlacementRole>;
  readonly coldStartRisk: "low" | "medium" | "high";
  readonly dailyRequestBudget: number;
  readonly dailyCostBudget: number;
  readonly maxExecutionMs: number;
  readonly maxPayloadBytes: number;
  readonly maxResponseBytes: number;
  readonly maxConcurrency: number;
}

export interface BackendCapabilityPolicy {
  readonly enabled: boolean;
  readonly localFallback: "disabled" | "development";
  readonly workloadProviderOrder: Readonly<
    Record<BackendCapabilityWorkload, readonly BackendRemoteProviderId[]>
  >;
  readonly providers: Readonly<
    Record<BackendRemoteProviderId, BackendRemoteProviderPolicy>
  >;
  readonly circuitFailureThreshold: number;
  readonly circuitCooldownMs: number;
  readonly gatewayMaxAttempts: number;
  readonly configurationIssues: readonly string[];
}

type EnvLike = Partial<Record<string, string | undefined>>;
type Logger = Pick<Console, "warn">;

const BACKEND_WORKLOAD_CAPABILITY: Readonly<
  Record<BackendCapabilityWorkload, BackendCapabilityId>
> = Object.freeze({
  thumbnail: "async-job",
  webhook: "async-job",
  cleanup: "async-job",
  notification: "async-job",
  "studio-asset": "object-storage",
  "thumbnail-asset": "object-storage",
  "export-asset": "object-storage",
  presence: "realtime",
  comments: "realtime",
  "screen-signaling": "realtime",
});

const PROVIDER_CAPABILITIES: Readonly<
  Record<BackendRemoteProviderId, readonly BackendCapabilityId[]>
> = Object.freeze({
  cloudflare: ["async-job", "object-storage", "realtime"],
  supabase: ["async-job", "object-storage", "realtime"],
  firebase: ["async-job", "object-storage", "realtime"],
  vercel: ["async-job"],
  netlify: ["async-job"],
  render: ["async-job", "realtime"],
  fly: ["async-job", "realtime"],
  railway: ["async-job", "realtime"],
  cloudtype: ["async-job", "realtime"],
  "cloud-run": ["async-job", "realtime"],
  "aws-lambda": ["async-job"],
  "azure-functions": ["async-job"],
  "deno-deploy": ["async-job"],
  koyeb: ["async-job", "realtime"],
  "upstash-qstash": ["async-job"],
});

const PROVIDER_COLD_START_RISK: Readonly<
  Record<BackendRemoteProviderId, BackendRemoteProviderPolicy["coldStartRisk"]>
> = Object.freeze({
  cloudflare: "low",
  supabase: "low",
  firebase: "medium",
  vercel: "low",
  netlify: "low",
  render: "high",
  fly: "medium",
  railway: "medium",
  cloudtype: "medium",
  "cloud-run": "medium",
  "aws-lambda": "medium",
  "azure-functions": "medium",
  "deno-deploy": "low",
  koyeb: "high",
  "upstash-qstash": "low",
});

const PROVIDER_PLACEMENT_ROLES: Readonly<
  Record<BackendRemoteProviderId, readonly BackendPlacementRole[]>
> = Object.freeze({
  cloudflare: [
    "edge-short",
    "durable-queue",
    "object-store",
    "realtime-relay",
  ],
  supabase: ["edge-short", "object-store", "realtime-relay"],
  firebase: ["edge-short", "object-store", "realtime-relay"],
  vercel: ["edge-short"],
  netlify: ["edge-short"],
  render: ["container-worker", "realtime-relay"],
  fly: ["container-worker", "realtime-relay"],
  railway: ["container-worker", "realtime-relay"],
  cloudtype: ["container-worker", "realtime-relay"],
  "cloud-run": ["container-worker", "realtime-relay"],
  "aws-lambda": ["edge-short"],
  "azure-functions": ["edge-short"],
  "deno-deploy": ["edge-short"],
  koyeb: ["container-worker", "realtime-relay"],
  "upstash-qstash": ["durable-queue"],
});

const WORKLOAD_PLACEMENT_ROLE: Readonly<
  Record<BackendCapabilityWorkload, BackendPlacementRole>
> = Object.freeze({
  thumbnail: "container-worker",
  webhook: "edge-short",
  cleanup: "durable-queue",
  notification: "durable-queue",
  "studio-asset": "object-store",
  "thumbnail-asset": "object-store",
  "export-asset": "object-store",
  presence: "realtime-relay",
  comments: "realtime-relay",
  "screen-signaling": "realtime-relay",
});

/**
 * Normal-operation ownership is purpose-specific. These providers are not a generic pool:
 * each workload has one explicit primary owner, while the remaining same-role providers are
 * continuity targets used only when they can preserve the exact contract.
 */
export const BACKEND_PRIMARY_WORKLOAD_OWNERS: Readonly<
  Record<BackendCapabilityWorkload, BackendRemoteProviderId>
> = Object.freeze({
  thumbnail: "cloud-run",
  webhook: "cloudflare",
  cleanup: "upstash-qstash",
  notification: "upstash-qstash",
  "studio-asset": "supabase",
  "thumbnail-asset": "supabase",
  "export-asset": "supabase",
  presence: "cloudflare",
  comments: "cloudflare",
  "screen-signaling": "cloudflare",
});

const DEFAULT_WORKLOAD_PROVIDER_ORDER: Readonly<
  Record<BackendCapabilityWorkload, readonly BackendRemoteProviderId[]>
> = Object.freeze({
  thumbnail: [
    "cloud-run",
    "fly",
    "railway",
    "cloudtype",
    "render",
    "koyeb",
  ],
  webhook: [
    "cloudflare",
    "aws-lambda",
    "azure-functions",
    "vercel",
    "netlify",
    "deno-deploy",
    "supabase",
    "firebase",
  ],
  cleanup: ["upstash-qstash", "cloudflare"],
  notification: ["upstash-qstash", "cloudflare"],
  "studio-asset": ["supabase", "cloudflare", "firebase"],
  "thumbnail-asset": ["supabase", "cloudflare", "firebase"],
  "export-asset": ["supabase", "cloudflare", "firebase"],
  presence: [
    "cloudflare",
    "supabase",
    "firebase",
    "cloud-run",
    "fly",
    "koyeb",
    "railway",
    "cloudtype",
    "render",
  ],
  comments: [
    "cloudflare",
    "supabase",
    "firebase",
    "cloud-run",
    "fly",
    "koyeb",
    "railway",
    "cloudtype",
    "render",
  ],
  "screen-signaling": [
    "cloudflare",
    "supabase",
    "firebase",
    "cloud-run",
    "fly",
    "koyeb",
    "railway",
    "cloudtype",
    "render",
  ],
});

const GlobalEnvSchema = z.object({
  BACKEND_DISTRIBUTION_ENABLED: z.enum(["true", "false"]).optional(),
  BACKEND_LOCAL_FALLBACK: z.enum(["disabled", "development"]).optional(),
  BACKEND_CIRCUIT_FAILURE_THRESHOLD: positiveIntegerString(1, 20).optional(),
  BACKEND_CIRCUIT_COOLDOWN_MS: positiveIntegerString(1_000, 3_600_000).optional(),
  BACKEND_GATEWAY_MAX_ATTEMPTS: positiveIntegerString(1, 5).optional(),
});

const ProviderEnvSchema = z.object({
  enabled: z.enum(["true", "false"]).optional(),
  baseUrl: z.url().optional(),
  authToken: z.string().min(32).max(4_096).optional(),
  dailyRequestBudget: positiveIntegerString(1, 100_000_000).optional(),
  dailyCostBudget: positiveIntegerString(1, 1_000_000_000).optional(),
  maxExecutionMs: positiveIntegerString(100, 86_400_000).optional(),
  maxPayloadBytes: positiveIntegerString(
    1_024,
    BACKEND_GATEWAY_HARD_MAX_BODY_BYTES
  ).optional(),
  maxResponseBytes: positiveIntegerString(
    1_024,
    BACKEND_GATEWAY_HARD_MAX_RESPONSE_BYTES
  ).optional(),
  maxConcurrency: positiveIntegerString(1, 10_000).optional(),
});

function positiveIntegerString(min: number, max: number) {
  return z
    .string()
    .regex(/^[1-9]\d*$/u)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

function providerEnvPrefix(providerId: BackendRemoteProviderId): string {
  return `BACKEND_${providerId.toUpperCase().replaceAll("-", "_")}`;
}

function providerEnv(source: EnvLike, providerId: BackendRemoteProviderId) {
  const prefix = providerEnvPrefix(providerId);
  return {
    enabled: source[`${prefix}_ENABLED`],
    baseUrl: source[`${prefix}_BASE_URL`],
    authToken: source[`${prefix}_AUTH_TOKEN`],
    dailyRequestBudget: source[`${prefix}_DAILY_REQUEST_BUDGET`],
    dailyCostBudget: source[`${prefix}_DAILY_COST_BUDGET`],
    maxExecutionMs: source[`${prefix}_MAX_EXECUTION_MS`],
    maxPayloadBytes: source[`${prefix}_MAX_PAYLOAD_BYTES`],
    maxResponseBytes: source[`${prefix}_MAX_RESPONSE_BYTES`],
    maxConcurrency: source[`${prefix}_MAX_CONCURRENCY`],
  };
}

function isSecureProviderUrl(value: string, nodeEnv: string | undefined): boolean {
  try {
    const url = new URL(value);
    const safeAuthority =
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "");
    if (!safeAuthority) return false;
    if (url.protocol === "https:") return true;
    return (
      nodeEnv !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function parseProviderOrder(
  raw: string | undefined,
  capability: BackendCapabilityId,
  issues: string[],
  defaults: readonly BackendRemoteProviderId[],
  requiredRole?: BackendPlacementRole,
  issueScope: string = capability
): readonly BackendRemoteProviderId[] {
  if (!raw?.trim()) return defaults;

  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const invalid = requested.filter(
    (value) =>
      !BACKEND_REMOTE_PROVIDER_IDS.includes(
        value as BackendRemoteProviderId
      ) ||
      !PROVIDER_CAPABILITIES[value as BackendRemoteProviderId]?.includes(
        capability
      ) ||
      (requiredRole !== undefined &&
        !PROVIDER_PLACEMENT_ROLES[
          value as BackendRemoteProviderId
        ]?.includes(requiredRole))
  );
  if (invalid.length > 0) {
    issues.push(`${issueScope}:invalid-provider-order`);
    return [];
  }

  return [
    ...new Set([
      ...(requested as BackendRemoteProviderId[]),
      ...defaults,
    ]),
  ];
}

function disabledProviderPolicy(
  providerId: BackendRemoteProviderId
): BackendRemoteProviderPolicy {
  return Object.freeze({
    id: providerId,
    enabled: false,
    supportedCapabilities: new Set(PROVIDER_CAPABILITIES[providerId]),
    placementRoles: new Set(PROVIDER_PLACEMENT_ROLES[providerId]),
    coldStartRisk: PROVIDER_COLD_START_RISK[providerId],
    dailyRequestBudget: 0,
    dailyCostBudget: 0,
    maxExecutionMs: 0,
    maxPayloadBytes: 0,
    maxResponseBytes: 0,
    maxConcurrency: 0,
  });
}

function resolveProviderPolicy(
  source: EnvLike,
  nodeEnv: string | undefined,
  providerId: BackendRemoteProviderId,
  distributionEnabled: boolean,
  issues: string[]
): BackendRemoteProviderPolicy {
  if (!distributionEnabled) return disabledProviderPolicy(providerId);

  const parsed = ProviderEnvSchema.safeParse(providerEnv(source, providerId));
  if (!parsed.success) {
    issues.push(`${providerId}:invalid-config`);
    return disabledProviderPolicy(providerId);
  }

  const provider = parsed.data;
  if (provider.enabled !== "true") return disabledProviderPolicy(providerId);

  if (
    provider.baseUrl === undefined ||
    !isSecureProviderUrl(provider.baseUrl, nodeEnv) ||
    provider.authToken === undefined ||
    provider.dailyRequestBudget === undefined ||
    provider.dailyCostBudget === undefined ||
    provider.maxExecutionMs === undefined ||
    provider.maxPayloadBytes === undefined ||
    provider.maxResponseBytes === undefined ||
    provider.maxConcurrency === undefined
  ) {
    issues.push(`${providerId}:incomplete-or-insecure-config`);
    return disabledProviderPolicy(providerId);
  }

  return Object.freeze({
    id: providerId,
    enabled: true,
    baseUrl: provider.baseUrl,
    authToken: provider.authToken,
    supportedCapabilities: new Set(PROVIDER_CAPABILITIES[providerId]),
    placementRoles: new Set(PROVIDER_PLACEMENT_ROLES[providerId]),
    coldStartRisk: PROVIDER_COLD_START_RISK[providerId],
    dailyRequestBudget: provider.dailyRequestBudget,
    dailyCostBudget: provider.dailyCostBudget,
    maxExecutionMs: provider.maxExecutionMs,
    maxPayloadBytes: provider.maxPayloadBytes,
    maxResponseBytes: provider.maxResponseBytes,
    maxConcurrency: provider.maxConcurrency,
  });
}

function disabledPolicy(
  issues: readonly string[] = []
): BackendCapabilityPolicy {
  return Object.freeze({
    enabled: false,
    localFallback: "disabled",
    workloadProviderOrder: DEFAULT_WORKLOAD_PROVIDER_ORDER,
    providers: Object.freeze(
      Object.fromEntries(
        BACKEND_REMOTE_PROVIDER_IDS.map((providerId) => [
          providerId,
          disabledProviderPolicy(providerId),
        ])
      ) as Record<BackendRemoteProviderId, BackendRemoteProviderPolicy>
    ),
    circuitFailureThreshold: 3,
    circuitCooldownMs: 60_000,
    gatewayMaxAttempts: 3,
    configurationIssues: Object.freeze([...issues]),
  });
}

/**
 * Resolves a fail-closed routing policy. Remote providers require an explicit global switch,
 * an explicit per-provider switch, a secure endpoint, a 32+ character credential and explicit
 * hard budgets. A typo disables the affected boundary instead of silently spending elsewhere.
 */
export function resolveBackendCapabilityPolicy(
  source: EnvLike = process.env,
  logger: Logger = console
): BackendCapabilityPolicy {
  const global = GlobalEnvSchema.safeParse(source);
  if (!global.success) {
    logger.warn("[backend-capabilities] invalid global configuration; distribution disabled");
    return disabledPolicy(["global:invalid-config"]);
  }

  const enabled = global.data.BACKEND_DISTRIBUTION_ENABLED === "true";
  const issues: string[] = [];
  const providers = Object.fromEntries(
    BACKEND_REMOTE_PROVIDER_IDS.map((providerId) => [
      providerId,
      resolveProviderPolicy(
        source,
        source.NODE_ENV,
        providerId,
        enabled,
        issues
      ),
    ])
  ) as Record<BackendRemoteProviderId, BackendRemoteProviderPolicy>;

  const localFallback =
    global.data.BACKEND_LOCAL_FALLBACK === "development" &&
    source.NODE_ENV !== "production"
      ? "development"
      : "disabled";
  if (
    global.data.BACKEND_LOCAL_FALLBACK === "development" &&
    source.NODE_ENV === "production"
  ) {
    issues.push("local:production-fallback-blocked");
  }

  const workloadProviderOrder = Object.fromEntries(
    BACKEND_CAPABILITY_WORKLOADS.map((workload) => {
      const capability = BACKEND_WORKLOAD_CAPABILITY[workload];
      const envKey = `BACKEND_${workload
        .toUpperCase()
        .replaceAll("-", "_")}_PROVIDER_ORDER`;
      return [
        workload,
        parseProviderOrder(
          source[envKey],
          capability,
          issues,
          DEFAULT_WORKLOAD_PROVIDER_ORDER[workload],
          WORKLOAD_PLACEMENT_ROLE[workload],
          workload
        ),
      ];
    })
  ) as Record<BackendCapabilityWorkload, readonly BackendRemoteProviderId[]>;

  const policy = Object.freeze({
    enabled,
    localFallback,
    workloadProviderOrder: Object.freeze(workloadProviderOrder),
    providers: Object.freeze(providers),
    circuitFailureThreshold:
      global.data.BACKEND_CIRCUIT_FAILURE_THRESHOLD ?? 3,
    circuitCooldownMs: global.data.BACKEND_CIRCUIT_COOLDOWN_MS ?? 60_000,
    gatewayMaxAttempts: global.data.BACKEND_GATEWAY_MAX_ATTEMPTS ?? 3,
    configurationIssues: Object.freeze(issues),
  }) satisfies BackendCapabilityPolicy;

  if (issues.length > 0) {
    logger.warn(
      `[backend-capabilities] ${issues.length} provider configuration issue(s); affected routes disabled`
    );
  }
  return policy;
}

export function backendCapabilityWorkloadCapability(
  workload: BackendCapabilityWorkload
): BackendCapabilityId {
  return BACKEND_WORKLOAD_CAPABILITY[workload];
}

export function backendCapabilityWorkloadPlacementRole(
  workload: BackendCapabilityWorkload
): BackendPlacementRole {
  return WORKLOAD_PLACEMENT_ROLE[workload];
}
