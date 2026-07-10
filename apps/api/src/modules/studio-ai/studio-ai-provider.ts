import type { StudioAiProviderPreference } from "./studio-ai.dto";

export const STUDIO_AI_PROVIDER_IDS = ["zai", "deepseek"] as const;

export type StudioAiProviderId = (typeof STUDIO_AI_PROVIDER_IDS)[number];

export interface StudioAiProviderConfig {
  id: StudioAiProviderId;
  label: string;
  configured: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
}

export const STUDIO_AI_BILLING_FAILOVER_REASON = "billing_quota_exhausted" as const;

export type StudioAiProviderFailureKind =
  | typeof STUDIO_AI_BILLING_FAILOVER_REASON
  | "rate_limited"
  | "authentication"
  | "provider_unavailable"
  | "request_rejected";

export interface StudioAiProviderFailureClassification {
  kind: StudioAiProviderFailureKind;
  /**
   * `true` means the provider explicitly rejected the request before inference
   * because the server account has no payable balance/package quota. It is the
   * only condition under which the same prompt may safely be sent elsewhere.
   */
  billingFailoverEligible: boolean;
  businessCode?: string;
}

type EnvLike = Partial<Record<string, string | undefined>>;

const DEFAULT_PROVIDER_ORDER: readonly StudioAiProviderId[] = ["zai", "deepseek"];
const DEFAULT_TIMEOUT_MS = 45_000;

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function providerConfig(id: StudioAiProviderId, env: EnvLike): StudioAiProviderConfig {
  if (id === "zai") {
    const apiKey = env.ZAI_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Z.ai",
      configured: apiKey.length > 0,
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model: boundedText(env.ZAI_MODEL, "glm-5.1", 200),
    };
  }
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? "";
  return {
    id,
    label: "DeepSeek",
    configured: apiKey.length > 0,
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKey,
    model: boundedText(env.DEEPSEEK_MODEL, "deepseek-v4-flash", 200),
  };
}

export function resolveStudioAiProviderOrder(env: EnvLike = process.env): StudioAiProviderId[] {
  const requested = env.STUDIO_AI_PROVIDER_ORDER?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is StudioAiProviderId =>
      STUDIO_AI_PROVIDER_IDS.includes(value as StudioAiProviderId)
    );
  // The variable controls priority, not enablement. A configured key enables a
  // provider, so append omitted provider IDs to preserve a complete failover
  // chain even when an operator specifies only the preferred first provider.
  const source = requested?.length
    ? [...requested, ...DEFAULT_PROVIDER_ORDER]
    : DEFAULT_PROVIDER_ORDER;
  return [...new Set(source)];
}

export function resolveStudioAiProviders(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env
): StudioAiProviderConfig[] {
  const ids = preference === "auto" ? resolveStudioAiProviderOrder(env) : [preference];
  return ids.map((id) => providerConfig(id, env)).filter((provider) => provider.configured);
}

/**
 * Builds the request candidate chain without silently replacing an
 * unconfigured explicit choice. Explicit choices remain first, while a second
 * configured provider is available solely for a verified billing/quota
 * rejection handled by the service.
 */
export function resolveStudioAiProviderCandidates(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env
): StudioAiProviderConfig[] {
  if (preference === "auto") return resolveStudioAiProviders("auto", env);

  const preferred = providerConfig(preference, env);
  if (!preferred.configured) return [];

  const remaining = resolveStudioAiProviderOrder(env)
    .filter((id) => id !== preference)
    .map((id) => providerConfig(id, env))
    .filter((provider) => provider.configured);
  return [preferred, ...remaining];
}

export function studioAiProviderStatuses(env: EnvLike = process.env) {
  return STUDIO_AI_PROVIDER_IDS.map((id) => {
    const provider = providerConfig(id, env);
    return {
      id: provider.id,
      label: provider.label,
      configured: provider.configured,
      model: provider.model,
    };
  });
}

export function resolveStudioAiTimeoutMs(
  firstProvider: StudioAiProviderId | undefined,
  env: EnvLike = process.env
): number {
  const raw = env.STUDIO_AI_TIMEOUT_MS ??
    (firstProvider === "zai" ? env.ZAI_TIMEOUT_MS : env.DEEPSEEK_TIMEOUT_MS);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 120_000
    ? Math.round(parsed)
    : DEFAULT_TIMEOUT_MS;
}

export function studioAiProviderRequestId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const value = record.request_id ?? record.id;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 240)
    : undefined;
}

const ZAI_BILLING_OR_PACKAGE_EXHAUSTED_CODES = new Set([
  "1113", // Account in arrears / insufficient balance.
  "1304", // Daily purchased API call limit reached.
  "1308", // Subscription usage limit reached until reset.
  "1309", // Resource package expired.
  "1310", // Weekly/monthly package limit exhausted.
]);

function boundedBusinessCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const code = String(value).trim();
  return /^\d{3,8}$/.test(code) ? code : undefined;
}

/** Extracts only the allowlistable business code; messages are never retained. */
export function studioAiProviderBusinessCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const directCode = boundedBusinessCode(record.code ?? record.error_code);
  if (directCode) return directCode;
  if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) {
    return undefined;
  }
  const error = record.error as Record<string, unknown>;
  return boundedBusinessCode(error.code ?? error.error_code);
}

/**
 * Classifies only documented, machine-verifiable provider signals. DeepSeek
 * HTTP 402 is insufficient balance; its HTTP 429 is a concurrency/rate limit.
 * Z.ai overloads HTTP 429, so only documented account/package business codes
 * are eligible for billing failover. Authentication, generic 429, 5xx and
 * ambiguous failures intentionally remain ineligible.
 */
export function classifyStudioAiProviderFailure(
  provider: StudioAiProviderId,
  responseStatus: number,
  payload?: unknown
): StudioAiProviderFailureClassification {
  const businessCode = studioAiProviderBusinessCode(payload);
  const billingFailoverEligible =
    (provider === "deepseek" && responseStatus === 402) ||
    (provider === "zai" &&
      responseStatus === 429 &&
      businessCode !== undefined &&
      ZAI_BILLING_OR_PACKAGE_EXHAUSTED_CODES.has(businessCode));

  if (billingFailoverEligible) {
    return {
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      billingFailoverEligible: true,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus === 429) {
    return {
      kind: "rate_limited",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus === 401 || responseStatus === 403) {
    return {
      kind: "authentication",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  if (responseStatus >= 500) {
    return {
      kind: "provider_unavailable",
      billingFailoverEligible: false,
      ...(businessCode ? { businessCode } : {}),
    };
  }
  return {
    kind: "request_rejected",
    billingFailoverEligible: false,
    ...(businessCode ? { businessCode } : {}),
  };
}
