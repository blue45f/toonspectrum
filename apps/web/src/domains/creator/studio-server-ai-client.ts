import {
  completeWithUserTextKey,
  loadOpenAiCompatibleSettings,
} from "@/shared/ai/unified-ai-settings";

export type StudioServerAiTask = "composition" | "scenario" | "translation" | "dialogue" | "palette";
export type StudioServerAiProvider = "zai" | "deepseek" | "openrouter" | "user";
export type StudioServerAiProviderPreference = "auto" | StudioServerAiProvider;
export type StudioServerAiFailoverReason = "billing_quota_exhausted";

const LABELS: Record<StudioServerAiProvider, string> = {
  zai: "Z.ai",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  user: "내 API",
};
export function studioServerAiProviderLabel(provider: StudioServerAiProvider): string { return LABELS[provider]; }

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
  providers: Array<{ id: StudioServerAiProvider; label: string; configured: boolean; model: string }>;
  selection: { default: "auto"; order: StudioServerAiProvider[]; fallback: boolean };
  capabilities: string[];
  requiresAuth: boolean;
  operatorFunded?: boolean;
  settingsHref?: string;
  quota?: { enforced: boolean; timezone: "UTC"; failureMode: "closed"; dailyRequestLimit: number; dailyTokenLimit: number; globalDailyRequestLimit?: number; globalDailyTokenLimit?: number };
};
export type StudioServerAiCompletion = {
  content: string;
  provider: StudioServerAiProvider;
  model: string;
  requestId?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  failover?: StudioServerAiFailoverMetadata;
};
export type StudioServerAiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "invalid_input" | "network_error" | "http_error" | "parse_error"; error: string };

export async function getStudioServerAiStatus(signal?: AbortSignal): Promise<StudioServerAiStatus> {
  signal?.throwIfAborted();
  return {
    configured: false,
    provider: "none",
    model: "",
    providers: [],
    selection: { default: "auto", order: [], fallback: false },
    capabilities: [],
    requiresAuth: false,
    operatorFunded: false,
    settingsHref: "/studio/ai-settings",
  };
}

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
export function canonicalStudioServerAiOperationId(value: unknown): string | null {
  return typeof value === "string" && OPERATION_ID.test(value) ? value : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function provider(value: unknown): StudioServerAiProvider | undefined {
  return value === "zai" || value === "deepseek" || value === "openrouter" || value === "user" ? value : undefined;
}
function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= limit ? normalized : undefined;
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : undefined;
}
export function parseStudioServerAiFailoverMetadata(value: unknown, actual: Pick<StudioServerAiCompletion, "provider" | "model">): StudioServerAiFailoverMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const attemptedProvider = provider(value.attemptedProvider);
  const actualProvider = provider(value.actualProvider);
  const attemptedModel = text(value.attemptedModel, 200);
  const actualModel = text(value.actualModel, 200);
  if (!attemptedProvider || !actualProvider || !attemptedModel || !actualModel
    || value.reason !== "billing_quota_exhausted" || attemptedProvider === actualProvider
    || actualProvider !== actual.provider || actualModel !== actual.model) return undefined;
  return { attemptedProvider, attemptedModel, actualProvider, actualModel, reason: "billing_quota_exhausted" };
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
  const usage = promptTokens === undefined && completionTokens === undefined && totalTokens === undefined
    ? undefined : { ...(promptTokens === undefined ? {} : { promptTokens }), ...(completionTokens === undefined ? {} : { completionTokens }), ...(totalTokens === undefined ? {} : { totalTokens }) };
  const failover = parseStudioServerAiFailoverMetadata(value.failover, { provider: actualProvider, model });
  const requestId = text(value.requestId, 240);
  return { content, provider: actualProvider, model, ...(requestId ? { requestId } : {}), ...(usage ? { usage } : {}), ...(failover ? { failover } : {}) };
}

export async function completeStudioServerText(
  input: { task: StudioServerAiTask; provider?: StudioServerAiProviderPreference; promptVersion: 1; system: string; user: string; operationId?: string },
  signal?: AbortSignal,
): Promise<StudioServerAiResult<StudioServerAiCompletion>> {
  const operationId = canonicalStudioServerAiOperationId(input.operationId);
  if (!operationId) return { ok: false, code: "invalid_input", error: "AI 요청 식별자가 올바르지 않아요." };
  const result = await completeWithUserTextKey(input.system, input.user, signal);
  if (!result.ok) return { ok: false, code: signal?.aborted ? "network_error" : "http_error", error: result.error };
  const settings = loadOpenAiCompatibleSettings();
  return {
    ok: true,
    data: {
      content: result.content,
      provider: "user",
      model: result.model || settings.textModel,
      requestId: `byok:${operationId}`.slice(0, 240),
    },
  };
}
