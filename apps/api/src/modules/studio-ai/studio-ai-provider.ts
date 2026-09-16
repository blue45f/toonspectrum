import type { StudioAiProviderPreference } from "./studio-ai.dto";

export const STUDIO_AI_FREE_PROVIDER_IDS = [
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
] as const;
export const STUDIO_AI_MAX_PROVIDER_ATTEMPTS = STUDIO_AI_FREE_PROVIDER_IDS.length;
const STUDIO_AI_LEGACY_TEST_PROVIDER_IDS = ["deepseek"] as const;
export const STUDIO_AI_PROVIDER_IDS = [
  ...STUDIO_AI_FREE_PROVIDER_IDS,
  ...STUDIO_AI_LEGACY_TEST_PROVIDER_IDS,
] as const;

export type StudioAiProviderId = (typeof STUDIO_AI_PROVIDER_IDS)[number];
export type StudioAiFreeProviderId = (typeof STUDIO_AI_FREE_PROVIDER_IDS)[number];

export interface StudioAiProviderConfig {
  id: StudioAiProviderId;
  label: string;
  configured: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  freePool: boolean;
}

export const STUDIO_AI_FREE_QUOTA_FAILOVER_REASON = "free_quota_exhausted" as const;
/** Kept for historical receipts produced by the retired paid-provider test path. */
export const STUDIO_AI_BILLING_FAILOVER_REASON = "billing_quota_exhausted" as const;
export type StudioAiFailoverReason =
  | typeof STUDIO_AI_FREE_QUOTA_FAILOVER_REASON
  | typeof STUDIO_AI_BILLING_FAILOVER_REASON;

export type StudioAiProviderFailureKind =
  | StudioAiFailoverReason
  | "rate_limited"
  | "authentication"
  | "provider_unavailable"
  | "request_rejected";

export interface StudioAiProviderFailureClassification {
  kind: StudioAiProviderFailureKind;
  /** The provider rejected before inference, so the same prompt may safely use the next free route. */
  billingFailoverEligible: boolean;
  failoverReason?: StudioAiFailoverReason;
  businessCode?: string;
}

type EnvLike = Partial<Record<string, string | undefined>>;

const DEFAULT_FREE_PROVIDER_ORDER: readonly StudioAiFreeProviderId[] = [
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
];
const DEFAULT_LEGACY_PROVIDER_ORDER: readonly StudioAiProviderId[] = [
  "zai",
  "deepseek",
  "openrouter",
];
const DEFAULT_TIMEOUT_MS = 45_000;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function studioAiFreePoolEnabled(env: EnvLike = process.env): boolean {
  return enabled(env.STUDIO_AI_FREE_POOL_ENABLED);
}

function legacyTestMode(env: EnvLike): boolean {
  return !studioAiFreePoolEnabled(env)
    && (env.NODE_ENV ?? process.env.NODE_ENV) === "test";
}

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function isOpenRouterFreeModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

const CLOUDFLARE_WORKERS_AI_FREE_MODELS = new Set([
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
]);

export function isCloudflareWorkersAiFreeModel(model: string): boolean {
  return CLOUDFLARE_WORKERS_AI_FREE_MODELS.has(model.trim().toLowerCase());
}

const QWEN_BEIJING_FREE_QUOTA_MODELS = new Set([
  "qwen3.7-plus",
  "qwen3.7-plus-2026-05-26",
  "qwen3.8-27b",
  "qwen3.8-2.4t-a95b",
  "qwen3.6-flash-2026-04-16",
  "qwen-turbo",
]);

export function isQwenBeijingFreeQuotaModel(model: string): boolean {
  return QWEN_BEIJING_FREE_QUOTA_MODELS.has(model.trim().toLowerCase());
}

const ZAI_FREE_MODELS = new Set(["glm-4.7-flash", "glm-4.5-flash"]);

export function isZaiFreeModel(model: string): boolean {
  return ZAI_FREE_MODELS.has(model.trim().toLowerCase());
}

const SILICONFLOW_FREE_TEXT_MODELS = new Set(["thudm/glm-z1-9b-0414"]);

export function isSiliconFlowFreeTextModel(model: string): boolean {
  return SILICONFLOW_FREE_TEXT_MODELS.has(model.trim().toLowerCase());
}

function validQwenWorkspaceId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{5,127}$/iu.test(value);
}

function validCloudflareAccountId(value: string): boolean {
  return /^[0-9a-f]{32}$/u.test(value);
}

function freeProviderConfig(
  id: StudioAiFreeProviderId,
  env: EnvLike,
): StudioAiProviderConfig {
  const poolEnabled = studioAiFreePoolEnabled(env);
  if (id === "gemini") {
    const apiKey = env.STUDIO_AI_FREE_GEMINI_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Gemini 무료",
      configured: poolEnabled && enabled(env.STUDIO_AI_FREE_GEMINI_CONFIRMED) && apiKey.length > 0,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_GEMINI_MODEL, "gemini-3.8-flash", 200),
      freePool: true,
    };
  }
  if (id === "qwen") {
    const workspaceId = env.STUDIO_AI_FREE_QWEN_WORKSPACE_ID?.trim() ?? "";
    const apiKey = env.STUDIO_AI_FREE_QWEN_API_KEY?.trim() ?? "";
    const model = boundedText(env.STUDIO_AI_FREE_QWEN_MODEL, "qwen3.7-plus", 200);
    return {
      id,
      label: "Qwen 베이징 무료 할당량",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_QWEN_CONFIRMED)
        && validQwenWorkspaceId(workspaceId)
        && apiKey.length > 0
        && isQwenBeijingFreeQuotaModel(model),
      endpoint: validQwenWorkspaceId(workspaceId)
        ? `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
        : "",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "groq") {
    const apiKey = env.STUDIO_AI_FREE_GROQ_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Groq 무료",
      configured: poolEnabled && enabled(env.STUDIO_AI_FREE_GROQ_CONFIRMED) && apiKey.length > 0,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_GROQ_MODEL, "openai/gpt-oss-120b", 200),
      freePool: true,
    };
  }
  if (id === "sambanova") {
    const apiKey = env.STUDIO_AI_FREE_SAMBANOVA_API_KEY?.trim() ?? "";
    return {
      id,
      label: "SambaNova 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_SAMBANOVA_CONFIRMED)
        && apiKey.length > 0,
      endpoint: "https://api.sambanova.ai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_SAMBANOVA_MODEL, "DeepSeek-V3.1", 200),
      freePool: true,
    };
  }
  if (id === "zai") {
    const apiKey = env.STUDIO_AI_FREE_ZAI_API_KEY?.trim() ?? "";
    const model = boundedText(env.STUDIO_AI_FREE_ZAI_MODEL, "glm-4.7-flash", 200);
    return {
      id,
      label: "Z.AI 무료 Flash",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_ZAI_CONFIRMED)
        && apiKey.length > 0
        && isZaiFreeModel(model),
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "mistral") {
    const apiKey = env.STUDIO_AI_FREE_MISTRAL_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Mistral 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_MISTRAL_CONFIRMED)
        && apiKey.length > 0,
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      apiKey,
      model: boundedText(env.STUDIO_AI_FREE_MISTRAL_MODEL, "mistral-small-latest", 200),
      freePool: true,
    };
  }
  if (id === "cloudflare") {
    const accountId = env.STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID?.trim().toLowerCase() ?? "";
    const apiKey = env.STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN?.trim() ?? "";
    const model = boundedText(
      env.STUDIO_AI_FREE_CLOUDFLARE_MODEL,
      "@cf/qwen/qwen3-30b-a3b-fp8",
      200,
    );
    return {
      id,
      label: "Cloudflare Workers AI 무료",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED)
        && validCloudflareAccountId(accountId)
        && apiKey.length > 0
        && isCloudflareWorkersAiFreeModel(model),
      endpoint: validCloudflareAccountId(accountId)
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`
        : "",
      apiKey,
      model,
      freePool: true,
    };
  }
  if (id === "siliconflow") {
    const apiKey = env.STUDIO_AI_FREE_SILICONFLOW_API_KEY?.trim() ?? "";
    const model = boundedText(
      env.STUDIO_AI_FREE_SILICONFLOW_MODEL,
      "THUDM/GLM-Z1-9B-0414",
      200,
    );
    return {
      id,
      label: "SiliconFlow 무료 텍스트",
      configured: poolEnabled
        && enabled(env.STUDIO_AI_FREE_SILICONFLOW_CONFIRMED)
        && apiKey.length > 0
        && isSiliconFlowFreeTextModel(model),
      endpoint: "https://api.siliconflow.cn/v1/chat/completions",
      apiKey,
      model,
      freePool: true,
    };
  }
  const apiKey = env.STUDIO_AI_FREE_OPENROUTER_API_KEY?.trim() ?? "";
  const model = boundedText(env.STUDIO_AI_FREE_OPENROUTER_MODEL, "openrouter/free", 200);
  return {
    id,
    label: "OpenRouter 무료",
    configured: poolEnabled
      && enabled(env.STUDIO_AI_FREE_OPENROUTER_CONFIRMED)
      && apiKey.length > 0
      && isOpenRouterFreeModel(model),
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    freePool: true,
  };
}

function legacyTestProviderConfig(
  id: "zai" | "deepseek" | "openrouter",
  env: EnvLike,
): StudioAiProviderConfig {
  if (id === "zai") {
    const apiKey = env.ZAI_API_KEY?.trim() ?? "";
    return {
      id,
      label: "Z.ai",
      configured: legacyTestMode(env) && apiKey.length > 0,
      endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model: boundedText(env.ZAI_MODEL, "glm-5.1", 200),
      freePool: false,
    };
  }
  if (id === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? "";
    return {
      id,
      label: "DeepSeek",
      configured: legacyTestMode(env) && apiKey.length > 0,
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey,
      model: boundedText(env.DEEPSEEK_MODEL, "deepseek-v4-flash", 200),
      freePool: false,
    };
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  return {
    id,
    label: "OpenRouter",
    configured: legacyTestMode(env) && apiKey.length > 0,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model: boundedText(env.OPENROUTER_MODEL, "stealth/ox-alpha", 200),
    freePool: false,
  };
}

function providerConfig(id: StudioAiProviderId, env: EnvLike): StudioAiProviderConfig {
  if (id === "zai") {
    return studioAiFreePoolEnabled(env)
      ? freeProviderConfig(id, env)
      : legacyTestProviderConfig(id, env);
  }
  if (
    id === "gemini"
    || id === "qwen"
    || id === "groq"
    || id === "sambanova"
    || id === "mistral"
    || id === "cloudflare"
    || id === "siliconflow"
  ) {
    return freeProviderConfig(id, env);
  }
  if (id === "openrouter") {
    return studioAiFreePoolEnabled(env)
      ? freeProviderConfig(id, env)
      : legacyTestProviderConfig(id, env);
  }
  return legacyTestProviderConfig(id, env);
}

function providerUniverse(env: EnvLike): readonly StudioAiProviderId[] {
  return studioAiFreePoolEnabled(env)
    ? STUDIO_AI_FREE_PROVIDER_IDS
    : legacyTestMode(env)
      ? DEFAULT_LEGACY_PROVIDER_ORDER
      : STUDIO_AI_FREE_PROVIDER_IDS;
}

export function resolveStudioAiProviderOrder(env: EnvLike = process.env): StudioAiProviderId[] {
  const freeMode = studioAiFreePoolEnabled(env);
  const universe = providerUniverse(env);
  const requested = (freeMode
    ? env.STUDIO_AI_FREE_PROVIDER_ORDER
    : env.STUDIO_AI_PROVIDER_ORDER)?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is StudioAiProviderId =>
      universe.includes(value as StudioAiProviderId)
    );
  const defaults = freeMode ? DEFAULT_FREE_PROVIDER_ORDER : DEFAULT_LEGACY_PROVIDER_ORDER;
  const source = requested?.length ? [...requested, ...defaults] : defaults;
  return [...new Set(source)].filter((id) => universe.includes(id));
}

export function resolveStudioAiProviders(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env,
): StudioAiProviderConfig[] {
  const ids = preference === "auto" ? resolveStudioAiProviderOrder(env) : [preference];
  return ids.map((id) => providerConfig(id, env)).filter((provider) => provider.configured);
}

/** Explicit preference remains first; only a definitive pre-inference quota rejection advances. */
export function resolveStudioAiProviderCandidates(
  preference: StudioAiProviderPreference = "auto",
  env: EnvLike = process.env,
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
  return providerUniverse(env).map((id) => {
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
  env: EnvLike = process.env,
): number {
  const freeTimeouts: Partial<Record<StudioAiFreeProviderId, string | undefined>> = {
    gemini: env.STUDIO_AI_FREE_GEMINI_TIMEOUT_MS,
    qwen: env.STUDIO_AI_FREE_QWEN_TIMEOUT_MS,
    groq: env.STUDIO_AI_FREE_GROQ_TIMEOUT_MS,
    sambanova: env.STUDIO_AI_FREE_SAMBANOVA_TIMEOUT_MS,
    zai: env.STUDIO_AI_FREE_ZAI_TIMEOUT_MS,
    mistral: env.STUDIO_AI_FREE_MISTRAL_TIMEOUT_MS,
    cloudflare: env.STUDIO_AI_FREE_CLOUDFLARE_TIMEOUT_MS,
    openrouter: env.STUDIO_AI_FREE_OPENROUTER_TIMEOUT_MS,
    siliconflow: env.STUDIO_AI_FREE_SILICONFLOW_TIMEOUT_MS,
  };
  const providerTimeout = studioAiFreePoolEnabled(env) && firstProvider
    ? freeTimeouts[firstProvider as StudioAiFreeProviderId]
    : firstProvider === "zai"
      ? env.ZAI_TIMEOUT_MS
      : firstProvider === "openrouter"
        ? env.OPENROUTER_TIMEOUT_MS
        : env.DEEPSEEK_TIMEOUT_MS;
  const parsed = Number(env.STUDIO_AI_TIMEOUT_MS ?? providerTimeout);
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
  "1113", "1304", "1308", "1309", "1310",
]);

function boundedBusinessCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const code = String(value).trim();
  return /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+){0,7}$/u.test(code) ? code : undefined;
}

export function studioAiProviderBusinessCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const directCode = boundedBusinessCode(record.code ?? record.error_code);
  if (directCode) return directCode;
  if (Array.isArray(record.errors)) {
    for (const candidate of record.errors) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const error = candidate as Record<string, unknown>;
      const arrayCode = boundedBusinessCode(error.code ?? error.error_code);
      if (arrayCode) return arrayCode;
    }
  }
  if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) {
    return undefined;
  }
  const error = record.error as Record<string, unknown>;
  return boundedBusinessCode(error.code ?? error.error_code);
}

export function classifyStudioAiProviderFailure(
  provider: StudioAiProviderId,
  responseStatus: number,
  payload?: unknown,
  freePool = STUDIO_AI_FREE_PROVIDER_IDS.includes(provider as StudioAiFreeProviderId),
): StudioAiProviderFailureClassification {
  const businessCode = studioAiProviderBusinessCode(payload);
  const freeProvider = freePool;
  const cloudflarePaidPlanRequired = provider === "cloudflare"
    && responseStatus === 403
    && businessCode === "5035";
  const qwenFreeQuotaOnlyExhausted = provider === "qwen"
    && responseStatus === 403
    && businessCode === "AllocationQuota.FreeTierOnly";
  if (
    freeProvider
    && (
      responseStatus === 402
      || responseStatus === 429
      || cloudflarePaidPlanRequired
      || qwenFreeQuotaOnlyExhausted
    )
  ) {
    return {
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      ...(businessCode ? { businessCode } : {}),
    };
  }

  const legacyBillingRejection =
    ((provider === "deepseek" || provider === "openrouter") && responseStatus === 402)
    || (provider === "zai"
      && responseStatus === 429
      && businessCode !== undefined
      && ZAI_BILLING_OR_PACKAGE_EXHAUSTED_CODES.has(businessCode));
  if (legacyBillingRejection) {
    return {
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_BILLING_FAILOVER_REASON,
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
