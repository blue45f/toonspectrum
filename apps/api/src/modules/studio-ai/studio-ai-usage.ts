import type { StudioAiProviderId } from "./studio-ai-provider";
import type { StudioAiTask } from "./studio-ai.dto";

export const STUDIO_AI_USAGE_STATUSES = [
  "success",
  "client_aborted",
  "timeout",
  "provider_rate_limited",
  "provider_error",
  "network_error",
  "content_filtered",
] as const;

export type StudioAiUsageStatus = (typeof STUDIO_AI_USAGE_STATUSES)[number];

export interface StudioAiTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface StudioAiQuotaLimits {
  dailyRequests: number;
  dailyTokens: number;
  globalDailyRequests: number;
  globalDailyTokens: number;
}

export interface StudioAiDailyQuotaState {
  requestCount: number;
  tokenCount: number;
  reservedTokens: number;
}

export interface StudioAiQuotaReservationInput {
  userId: string;
  reservedTokens: number;
  limits: StudioAiQuotaLimits;
}

export type StudioAiQuotaReservationResult =
  | { allowed: true; usageDay: string }
  | { allowed: false };

export interface StudioAiUsageFinalizationInput {
  userId: string;
  usageDay: string;
  reservedTokens: number;
  task: StudioAiTask;
  provider: StudioAiProviderId;
  model: string;
  attemptCount: number;
  status: StudioAiUsageStatus;
  usage: StudioAiTokenUsage;
  startedAt: Date;
  finishedAt: Date;
}

export interface StudioAiUsageStore {
  reserve(input: StudioAiQuotaReservationInput): Promise<StudioAiQuotaReservationResult>;
  finalize(input: StudioAiUsageFinalizationInput): Promise<void>;
}

export const STUDIO_AI_USAGE_STORE = Symbol("STUDIO_AI_USAGE_STORE");

export const DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT = 200;
export const DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT = 1_000_000;
export const DEFAULT_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT = 500;
export const DEFAULT_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT = 2_000_000;
export const MAX_STUDIO_AI_DAILY_REQUEST_LIMIT = 10_000;
export const MAX_STUDIO_AI_DAILY_TOKEN_LIMIT = 100_000_000;
export const MAX_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT = 10_000_000;
export const MAX_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT = 1_000_000_000;
const PROVIDER_MESSAGE_OVERHEAD_TOKENS = 256;

type EnvLike = Partial<Record<string, string | undefined>>;

function boundedPositiveInteger(raw: unknown, fallback: number, maximum: number): number {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function resolveStudioAiQuotaLimits(env: EnvLike = process.env): StudioAiQuotaLimits {
  return {
    dailyRequests: boundedPositiveInteger(
      env.STUDIO_AI_DAILY_REQUEST_LIMIT,
      DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT,
      MAX_STUDIO_AI_DAILY_REQUEST_LIMIT
    ),
    dailyTokens: boundedPositiveInteger(
      env.STUDIO_AI_DAILY_TOKEN_LIMIT,
      DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT,
      MAX_STUDIO_AI_DAILY_TOKEN_LIMIT
    ),
    globalDailyRequests: boundedPositiveInteger(
      env.STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT,
      DEFAULT_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT,
      MAX_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT
    ),
    globalDailyTokens: boundedPositiveInteger(
      env.STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT,
      DEFAULT_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT,
      MAX_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT
    ),
  };
}

/**
 * Returns the UTC calendar day used by deterministic/in-memory implementations.
 * The production Postgres store derives this value from the database clock so
 * every API instance shares one authoritative midnight boundary.
 */
export function utcUsageDay(at: Date): string {
  if (!Number.isFinite(at.getTime())) throw new RangeError("A valid timestamp is required.");
  return at.toISOString().slice(0, 10);
}

/**
 * Conservatively reserves one token for every UTF-8 byte plus the provider's
 * maximum completion size and fixed chat-envelope overhead. Tokenizers based on
 * byte fallback cannot exceed the byte count for visible prompt content.
 */
export function estimateStudioAiTokenReservation(input: {
  systemScope: string;
  system: string;
  user: string;
  maxCompletionTokens: number;
}): number {
  const promptBytes = Buffer.byteLength(`${input.systemScope}\n${input.system}\n${input.user}`, "utf8");
  const completion = Math.max(0, Math.floor(input.maxCompletionTokens));
  return Math.min(
    MAX_STUDIO_AI_DAILY_TOKEN_LIMIT,
    Math.max(1, promptBytes + completion + PROVIDER_MESSAGE_OVERHEAD_TOKENS)
  );
}

/**
 * Missing/partial provider usage is charged at the full reservation. The ledger
 * still stores null token columns, preserving the distinction between provider
 * facts and conservative quota accounting.
 */
export function studioAiQuotaTokenCharge(usage: StudioAiTokenUsage, reservedTokens: number): number {
  if (usage.totalTokens !== undefined) return usage.totalTokens;
  if (usage.promptTokens !== undefined && usage.completionTokens !== undefined) {
    return usage.promptTokens + usage.completionTokens;
  }
  return reservedTokens;
}

export function attemptStudioAiQuotaReservation(
  state: StudioAiDailyQuotaState,
  reservedTokens: number,
  limits: Pick<StudioAiQuotaLimits, "dailyRequests" | "dailyTokens">
): { allowed: true; state: StudioAiDailyQuotaState } | { allowed: false; state: StudioAiDailyQuotaState } {
  const allowed =
    state.requestCount < limits.dailyRequests &&
    state.tokenCount + state.reservedTokens + reservedTokens <= limits.dailyTokens;
  if (!allowed) return { allowed: false, state: { ...state } };
  return {
    allowed: true,
    state: {
      requestCount: state.requestCount + 1,
      tokenCount: state.tokenCount,
      reservedTokens: state.reservedTokens + reservedTokens,
    },
  };
}

export function settleStudioAiQuotaReservation(
  state: StudioAiDailyQuotaState,
  reservedTokens: number,
  usage: StudioAiTokenUsage
): StudioAiDailyQuotaState {
  if (reservedTokens < 0 || state.reservedTokens < reservedTokens) {
    throw new RangeError("Studio AI quota reservation is missing or invalid.");
  }
  return {
    requestCount: state.requestCount,
    tokenCount: state.tokenCount + studioAiQuotaTokenCharge(usage, reservedTokens),
    reservedTokens: state.reservedTokens - reservedTokens,
  };
}
