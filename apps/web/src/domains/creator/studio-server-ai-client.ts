import { HTTPError, api, getApiErrorMessage } from "@/infrastructure/api";
import { completeWithUserTextKey } from "@/shared/ai/unified-ai-settings";
import {
  getUserAiSnapshot,
  userAiAutomaticExternalConnectionsForCapability,
} from "@/shared/ai/user-ai-store";
import { userAiRoutingSettings } from "@/shared/ai/user-ai-types";

export type StudioServerAiTask = "assistant" | "composition" | "scenario" | "translation" | "dialogue" | "palette";
export type StudioFreePoolProvider = "gemini" | "qwen" | "groq" | "sambanova" | "zai" | "mistral" | "cloudflare" | "openrouter" | "siliconflow" | "deepseek";
export type StudioServerAiProvider = StudioFreePoolProvider | "user";
export type StudioServerAiProviderPreference = "auto" | StudioFreePoolProvider;
export type StudioServerAiFailoverReason = "free_quota_exhausted" | "billing_quota_exhausted";

const LABELS: Record<StudioServerAiProvider, string> = {
  gemini: "Gemini 무료",
  qwen: "Qwen 베이징 무료 할당량",
  groq: "Groq 무료",
  sambanova: "SambaNova 무료",
  zai: "Z.AI 무료 Flash",
  mistral: "Mistral 무료",
  cloudflare: "Cloudflare Workers AI 무료",
  openrouter: "OpenRouter 무료",
  siliconflow: "SiliconFlow 무료 텍스트",
  deepseek: "DeepSeek",
  user: "내 클라우드 AI",
};

export function studioServerAiProviderLabel(provider: StudioServerAiProvider): string {
  return LABELS[provider];
}


export interface StudioServerAiFailoverMetadata {
  attemptedProvider: StudioServerAiProvider;
  attemptedModel: string;
  actualProvider: StudioServerAiProvider;
  actualModel: string;
  reason: StudioServerAiFailoverReason;
}

export type StudioServerAiStatus = {
  configured: boolean;
  provider: StudioServerAiProvider | "none";
  model: string;
  providers: Array<{
    id: StudioServerAiProvider;
    label: string;
    configured: boolean;
    model: string;
  }>;
  selection: {
    default: "auto";
    order: StudioServerAiProvider[];
    fallback: boolean;
    fallbackPolicy?: StudioServerAiFailoverReason;
  };
  capabilities: string[];
  requiresAuth: boolean;
  operatorFunded?: boolean;
  freePool?: boolean;
  settingsHref?: string;
  quota?: {
    enforced: boolean;
    timezone: "UTC";
    failureMode: "closed";
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    globalDailyRequestLimit?: number;
    globalDailyTokenLimit?: number;
  };
};

export function resolveActiveServerAiProviderLabel(
  preference: StudioServerAiProviderPreference,
  status: Pick<StudioServerAiStatus, "configured" | "providers"> | null,
): string {
  if (preference === "auto") {
    return status?.configured ? "자동 무료 AI" : "자동 무료 AI → 내 무료 키";
  }
  return status?.providers.find((provider) => provider.id === preference)?.label ?? "선택한 무료 AI";
}

export type StudioServerAiCompletion = {
  content: string;
  provider: StudioServerAiProvider;
  model: string;
  requestId?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  failover?: StudioServerAiFailoverMetadata;
};

export type StudioServerAiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "invalid_input" | "network_error" | "http_error" | "parse_error" | "free_exhausted";
      error: string;
    };

export async function getStudioServerAiStatus(signal?: AbortSignal): Promise<StudioServerAiStatus> {
  return api.get<StudioServerAiStatus>("/studio-ai/status", { signal });
}

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
export function canonicalStudioServerAiOperationId(value: unknown): string | null {
  return typeof value === "string" && OPERATION_ID.test(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function provider(value: unknown): StudioServerAiProvider | undefined {
  return value === "gemini"
    || value === "qwen"
    || value === "groq"
    || value === "sambanova"
    || value === "zai"
    || value === "mistral"
    || value === "cloudflare"
    || value === "openrouter"
    || value === "siliconflow"
    || value === "deepseek"
    || value === "user"
    ? value
    : undefined;
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= limit ? normalized : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 2_147_483_647
    ? value
    : undefined;
}

function failoverReason(value: unknown): StudioServerAiFailoverReason | undefined {
  return value === "free_quota_exhausted" || value === "billing_quota_exhausted"
    ? value
    : undefined;
}

export function parseStudioServerAiFailoverMetadata(
  value: unknown,
  actual: Pick<StudioServerAiCompletion, "provider" | "model">,
): StudioServerAiFailoverMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const attemptedProvider = provider(value.attemptedProvider);
  const actualProvider = provider(value.actualProvider);
  const attemptedModel = text(value.attemptedModel, 200);
  const actualModel = text(value.actualModel, 200);
  const reason = failoverReason(value.reason);
  if (
    !attemptedProvider
    || !actualProvider
    || !attemptedModel
    || !actualModel
    || !reason
    || attemptedProvider === actualProvider
    || actualProvider !== actual.provider
    || actualModel !== actual.model
  ) {
    return undefined;
  }
  return { attemptedProvider, attemptedModel, actualProvider, actualModel, reason };
}

export function parseStudioServerAiCompletion(value: unknown): StudioServerAiCompletion | undefined {
  if (!isRecord(value)) return undefined;
  const content = text(value.content, 100_000);
  const actualProvider = provider(value.provider);
  const model = text(value.model, 200);
  if (!content || !actualProvider || !model) return undefined;
  const usageRecord = isRecord(value.usage) ? value.usage : {};
  const promptTokens = count(usageRecord.promptTokens);
  const completionTokens = count(usageRecord.completionTokens);
  const totalTokens = count(usageRecord.totalTokens);
  const usage = promptTokens === undefined
    && completionTokens === undefined
    && totalTokens === undefined
    ? undefined
    : {
        ...(promptTokens === undefined ? {} : { promptTokens }),
        ...(completionTokens === undefined ? {} : { completionTokens }),
        ...(totalTokens === undefined ? {} : { totalTokens }),
      };
  const failover = parseStudioServerAiFailoverMetadata(
    value.failover,
    { provider: actualProvider, model },
  );
  const requestId = text(value.requestId, 240);
  return {
    content,
    provider: actualProvider,
    model,
    ...(requestId ? { requestId } : {}),
    ...(usage ? { usage } : {}),
    ...(failover ? { failover } : {}),
  };
}

function httpErrorCode(error: unknown): string | undefined {
  if (!(error instanceof HTTPError) || !isRecord(error.data)) return undefined;
  return typeof error.data.code === "string" ? error.data.code : undefined;
}

const PERSONAL_FALLBACK_CODES = new Set([
  "FREE_AI_POOL_EXHAUSTED",
  "FREE_AI_POOL_UNAVAILABLE",
  "FREE_AI_LOGIN_REQUIRED",
  "USER_AI_CONNECTION_REQUIRED",
]);

function exhaustedMessage(): string {
  return "자동 무료 AI와 등록된 클라우드 BYOK 경로가 모두 무료 한도 또는 요청 제한 상태입니다. 통합 AI 설정에서 다른 클라우드 키·모델을 추가하거나 제한 해제 후 다시 시도하세요. 현재 이 AI 기능은 사용할 수 없습니다.";
}

async function completeWithPersonalFreeAi(
  input: { system: string; user: string },
  operationId: string,
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  const result = await completeWithUserTextKey(input.system, input.user, signal);
  if (!result.ok) {
    if (["not-configured", "quota-exhausted", "all-free-exhausted"].includes(result.code)) {
      return {
        ok: false,
        code: "free_exhausted",
        error: exhaustedMessage(),
      };
    }
    return {
      ok: false,
      code: "http_error",
      error: result.error,
    };
  }
  return {
    ok: true,
    data: {
      content: result.content,
      provider: "user",
      model: result.model,
      requestId: `byok:${operationId}`.slice(0, 240),
    },
  };
}

export async function completeStudioServerText(
  input: {
    task: StudioServerAiTask;
    provider?: StudioServerAiProviderPreference;
    promptVersion: 1;
    system: string;
    user: string;
    operationId?: string;
  },
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  const operationId = canonicalStudioServerAiOperationId(input.operationId);
  if (!operationId) {
    return { ok: false, code: "invalid_input", error: "AI 요청 식별자가 올바르지 않아요." };
  }
  const { operationId: _operationId, ...requestInput } = input;
  const configuration = getUserAiSnapshot().configuration;
  const routing = userAiRoutingSettings(configuration);
  const personalRoutes = userAiAutomaticExternalConnectionsForCapability("text");
  const explicitServerProvider = input.provider && input.provider !== "auto";
  const personalFirst = !explicitServerProvider && personalRoutes.length > 0 && (
    routing.mode === "manual"
    || (routing.mode === "priority"
      && (personalRoutes[0]?.priority ?? 100) < routing.managedPoolPriority)
  );
  let personalAttempted = false;
  if (personalFirst) {
    personalAttempted = true;
    const personalResult = await completeWithPersonalFreeAi(input, operationId, signal);
    if (routing.mode === "manual" || personalResult.ok || personalResult.code !== "free_exhausted") {
      return personalResult;
    }
  }
  const request = {
    ...requestInput,
    ...(!explicitServerProvider ? { providerOrder: routing.serverProviderOrder } : {}),
  };
  try {
    const raw = await api.post<unknown>("/studio-ai/chat", request, {
      signal,
      headers: { "Idempotency-Key": operationId },
    });
    const data = parseStudioServerAiCompletion(raw);
    return data
      ? { ok: true, data }
      : { ok: false, code: "parse_error", error: "자동 무료 AI 응답 형식을 확인하지 못했어요." };
  } catch (error) {
    const code = httpErrorCode(error);
    if (code && PERSONAL_FALLBACK_CODES.has(code)) {
      return personalAttempted
        ? { ok: false, code: "free_exhausted", error: exhaustedMessage() }
        : completeWithPersonalFreeAi(input, operationId, signal);
    }
    if (signal?.aborted) {
      return {
        ok: false,
        code: "network_error",
        error: "AI 요청이 취소되었습니다. 같은 요청을 다른 공급자로 자동 재전송하지 않았습니다.",
      };
    }
    return {
      ok: false,
      code: code === "FREE_AI_POOL_EXHAUSTED" ? "free_exhausted" : "http_error",
      error: await getApiErrorMessage(error, "자동 무료 AI 요청에 실패했어요."),
    };
  }
}

let automaticAssistantOperationSequence = 0;

function nextAutomaticAssistantOperationId(): string {
  automaticAssistantOperationSequence += 1;
  const entropy = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${automaticAssistantOperationSequence.toString(36)}`;
  return `assistant-${entropy}-${automaticAssistantOperationSequence.toString(36)}`.slice(0, 128);
}

/**
 * Site-wide text helper used outside the editor's tracked operation timeline.
 * It still follows the same shared-free -> personal-free -> unavailable chain.
 */
export function completeAutomaticFreeText(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  return completeStudioServerText({
    task: "assistant",
    promptVersion: 1,
    system,
    user,
    operationId: nextAutomaticAssistantOperationId(),
  }, signal);
}
