import type {
  UserAiCapability,
  UserAiConnection,
} from "./user-ai-types";

export const FREE_AI_RUNTIME_BUDGET_STORAGE_KEY = "toonstudio:user-ai:runtime-budget:v1";

/**
 * These are ToonStudio's own conservative safety caps, not provider-advertised quotas.
 * The provider account must still have billing disabled; this guard deliberately fails closed.
 */
export const MANAGED_FREE_DAILY_REQUEST_LIMIT = 25;
export const MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT = 64_000;
export const MANAGED_FREE_MAX_OUTPUT_TOKENS = 1_024;
export const MANAGED_FREE_MAX_REQUEST_BYTES = 256 * 1024;
export const MANAGED_FREE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const FIRST_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1_000;
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60 * 1_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1_000;
const BUDGET_LOCK_NAME = "toonstudio:user-ai:runtime-budget";
const MAX_LEDGER_ENTRIES = 64;

type FreeAiBlockReason =
  | "daily-request-budget"
  | "daily-token-budget"
  | "rate-limit"
  | "payment-required"
  | "authentication";

export class FreeAiRuntimeBudgetError extends Error {
  readonly code = "free-quota-exhausted" as const;

  constructor(message: string) {
    super(message);
    this.name = "FreeAiRuntimeBudgetError";
  }
}

interface FreeAiBudgetEntry {
  day: string;
  requests: number;
  reservedTokens: number;
  quotaFailures: number;
  blockedReason: FreeAiBlockReason | null;
  /** null means either unblocked or manually blocked when blockedReason is payment-required. */
  blockedUntil: number | null;
  updatedAt: number;
}

interface FreeAiBudgetLedger {
  version: 1;
  entries: Record<string, FreeAiBudgetEntry>;
}

export interface FreeAiRuntimeBudgetSnapshot {
  guarded: boolean;
  requests: number;
  requestLimit: number | null;
  reservedTokens: number;
  reservedTokenLimit: number | null;
  remainingRequests: number | null;
  remainingReservedTokens: number | null;
  blockedReason: FreeAiBlockReason | null;
  blockedUntil: number | null;
  resetsAt: number | null;
}

export interface GuardedFreeAiRequest {
  body: unknown;
  guarded: boolean;
  reservedTokens: number;
  maxOutputTokens: number | null;
}

const EMPTY_LEDGER: FreeAiBudgetLedger = { version: 1, entries: {} };
let memoryLedger: FreeAiBudgetLedger = structuredClone(EMPTY_LEDGER);

function isManagedFreeConnection(connection: UserAiConnection): boolean {
  return connection.costPolicy === "provider-free-tier"
    || connection.costPolicy === "openrouter-free";
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function nextUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
}

function finiteNonNegative(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), maximum)
    : 0;
}

function cleanBlockReason(value: unknown): FreeAiBlockReason | null {
  return value === "daily-request-budget"
    || value === "daily-token-budget"
    || value === "rate-limit"
    || value === "payment-required"
    || value === "authentication"
    ? value
    : null;
}

function cleanEntry(value: unknown): FreeAiBudgetEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(source.day)) {
    return null;
  }
  const blockedReason = cleanBlockReason(source.blockedReason);
  const blockedUntil = source.blockedUntil === null
    ? null
    : finiteNonNegative(source.blockedUntil, 9_999_999_999_999);
  return {
    day: source.day,
    requests: finiteNonNegative(source.requests, MANAGED_FREE_DAILY_REQUEST_LIMIT),
    reservedTokens: finiteNonNegative(
      source.reservedTokens,
      MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT,
    ),
    quotaFailures: finiteNonNegative(source.quotaFailures, 10),
    blockedReason,
    blockedUntil: blockedReason ? blockedUntil : null,
    updatedAt: finiteNonNegative(source.updatedAt, 9_999_999_999_999),
  };
}

function cleanLedger(value: unknown): FreeAiBudgetLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return structuredClone(EMPTY_LEDGER);
  }
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || !source.entries || typeof source.entries !== "object") {
    return structuredClone(EMPTY_LEDGER);
  }
  const entries: Record<string, FreeAiBudgetEntry> = {};
  for (const [key, entry] of Object.entries(source.entries as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_.:-]{1,220}$/u.test(key)) continue;
    const cleaned = cleanEntry(entry);
    if (cleaned) entries[key] = cleaned;
    if (Object.keys(entries).length >= MAX_LEDGER_ENTRIES) break;
  }
  return { version: 1, entries };
}

function browserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function readLedger(): FreeAiBudgetLedger {
  const storage = browserStorage();
  if (!storage) return structuredClone(memoryLedger);
  try {
    const raw = storage.getItem(FREE_AI_RUNTIME_BUDGET_STORAGE_KEY);
    const ledger = raw ? cleanLedger(JSON.parse(raw) as unknown) : structuredClone(EMPTY_LEDGER);
    memoryLedger = structuredClone(ledger);
    return ledger;
  } catch {
    return structuredClone(memoryLedger);
  }
}

function writeLedger(ledger: FreeAiBudgetLedger): void {
  const cleaned = cleanLedger(ledger);
  memoryLedger = structuredClone(cleaned);
  try {
    browserStorage()?.setItem(
      FREE_AI_RUNTIME_BUDGET_STORAGE_KEY,
      JSON.stringify(cleaned),
    );
  } catch {
    // The in-memory guard remains active when persistent storage is unavailable.
  }
}

function scopeKey(connection: UserAiConnection): string {
  let host = "managed-provider";
  try {
    host = new URL(connection.baseUrl).hostname.toLowerCase();
  } catch {
    // The free-connection policy validates the URL before this guard runs.
  }
  const routeId = "routeId" in connection && typeof connection.routeId === "string"
    ? connection.routeId
    : connection.id;
  return `${host}:${routeId}`.slice(0, 220);
}

function freshEntry(now: number): FreeAiBudgetEntry {
  return {
    day: utcDay(now),
    requests: 0,
    reservedTokens: 0,
    quotaFailures: 0,
    blockedReason: null,
    blockedUntil: null,
    updatedAt: now,
  };
}

function currentEntry(
  ledger: FreeAiBudgetLedger,
  key: string,
  now: number,
): FreeAiBudgetEntry {
  const existing = ledger.entries[key];
  if (!existing) return freshEntry(now);
  if (existing.day === utcDay(now)) return { ...existing };

  // A provider asking for payment remains blocked until the user explicitly resets it.
  if (existing.blockedReason === "payment-required") {
    return {
      ...freshEntry(now),
      blockedReason: "payment-required",
      blockedUntil: null,
    };
  }
  return freshEntry(now);
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => T | Promise<T>,
  ): Promise<T>;
}

async function withBudgetLock<T>(callback: () => T | Promise<T>): Promise<T> {
  const locks = typeof globalThis.navigator === "undefined"
    ? undefined
    : (globalThis.navigator as unknown as { locks?: LockManagerLike }).locks;
  return locks
    ? locks.request(BUDGET_LOCK_NAME, { mode: "exclusive" }, async () => await callback())
    : callback();
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function prepareManagedBody(
  connection: UserAiConnection,
  body: unknown,
): { body: unknown; reservedTokens: number; maxOutputTokens: number } {
  if (
    typeof FormData !== "undefined"
    && body instanceof FormData
  ) {
    throw new Error("자동 무료 텍스트 경로에는 파일·이미지 폼 요청을 전송하지 않습니다. 이미지용 클라우드 BYOK 경로를 구성하세요.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("외부 무료 티어 텍스트 요청은 JSON 객체 형식이어야 합니다.");
  }

  const request = { ...(body as Record<string, unknown>) };
  if (request.stream === true) {
    throw new Error("무료량 보호를 위해 외부 무료 티어의 스트리밍 응답을 사용하지 않습니다.");
  }

  // Never trust a caller-provided model for a managed endpoint.
  request.model = connection.textModel;
  if ("n" in request) request.n = 1;
  if ("best_of" in request) request.best_of = 1;
  if ("logprobs" in request) request.logprobs = false;
  if ("top_logprobs" in request) delete request.top_logprobs;
  if ("store" in request) request.store = false;

  const completionField = "max_completion_tokens" in request
    ? "max_completion_tokens"
    : "max_tokens";
  const requestedOutput = positiveInteger(request[completionField])
    ?? positiveInteger(request.max_tokens)
    ?? MANAGED_FREE_MAX_OUTPUT_TOKENS;
  const maxOutputTokens = Math.min(
    requestedOutput,
    MANAGED_FREE_MAX_OUTPUT_TOKENS,
  );
  delete request.max_tokens;
  delete request.max_completion_tokens;
  request[completionField] = maxOutputTokens;

  let serialized: string;
  try {
    serialized = JSON.stringify(request);
  } catch (error) {
    throw new Error("무료 AI 요청 본문을 안전하게 직렬화할 수 없습니다.", { cause: error });
  }
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MANAGED_FREE_MAX_REQUEST_BYTES) {
    throw new Error("외부 무료 티어 요청이 256KiB 안전 한도를 초과했습니다. 작업을 나누거나 명시적 클라우드 BYOK 경로를 사용하세요.");
  }

  // UTF-8 bytes / 2 intentionally over-reserves for many Latin prompts and is
  // conservative for Korean text. The ledger stores counts only, never prompts.
  const estimatedInputTokens = Math.max(1, Math.ceil(bytes / 2));
  return {
    body: request,
    reservedTokens: estimatedInputTokens + maxOutputTokens,
    maxOutputTokens,
  };
}

function blockMessage(entry: FreeAiBudgetEntry, now: number): string | null {
  if (entry.blockedReason === "payment-required") {
    return "제공자가 결제를 요구해 이 연결을 잠갔습니다. 결제 없는 무료 계정인지 확인한 뒤 연결을 삭제하고 다시 등록하세요.";
  }
  if (!entry.blockedReason || entry.blockedUntil === null || entry.blockedUntil <= now) {
    return null;
  }
  const reset = new Date(entry.blockedUntil).toLocaleString("ko-KR");
  if (entry.blockedReason === "authentication") {
    return `인증 오류가 반복되지 않도록 ${reset}까지 무료 AI 연결을 일시 중지했습니다.`;
  }
  if (entry.blockedReason === "rate-limit") {
    return `공급자 무료 한도 또는 속도 제한으로 ${reset}까지 요청을 중지했습니다. 유료 모델로 전환하지 않습니다.`;
  }
  return `앱의 무료 사용 안전 한도에 도달해 ${reset}까지 요청을 중지했습니다. 유료 모델로 전환하지 않습니다.`;
}

function assertManagedEndpoint(
  path: string,
  method: string,
  body: unknown,
): void {
  if (method === "GET" && path === "/models" && body === undefined) return;
  if (method === "POST" && path === "/chat/completions" && body !== undefined) return;
  throw new Error("자동 무료 텍스트 경로는 GET /models와 POST /chat/completions만 허용합니다. 다른 작업은 기능별 클라우드 BYOK 경로를 사용하세요.");
}

export async function guardFreeAiRuntimeRequest(
  connection: UserAiConnection,
  capability: UserAiCapability,
  path: string,
  method: string,
  body: unknown,
  now = Date.now(),
): Promise<GuardedFreeAiRequest> {
  if (!isManagedFreeConnection(connection)) {
    return {
      body,
      guarded: false,
      reservedTokens: 0,
      maxOutputTokens: null,
    };
  }
  if (capability !== "text") {
    throw new Error("자동 무료 경로는 텍스트 요청만 허용합니다. 이미지·영상·3D는 기능별 클라우드 BYOK 경로를 사용하세요.");
  }

  const normalizedMethod = method.toUpperCase();
  assertManagedEndpoint(path, normalizedMethod, body);
  const prepared = body === undefined
    ? { body, reservedTokens: 0, maxOutputTokens: 0 }
    : prepareManagedBody(connection, body);

  return withBudgetLock(() => {
    const ledger = readLedger();
    const key = scopeKey(connection);
    const entry = currentEntry(ledger, key, now);
    const blocked = blockMessage(entry, now);
    if (blocked) {
      if (entry.blockedReason === "authentication") throw new Error(blocked);
      throw new FreeAiRuntimeBudgetError(blocked);
    }
    if (entry.blockedUntil !== null && entry.blockedUntil <= now) {
      entry.blockedReason = null;
      entry.blockedUntil = null;
    }

    if (entry.requests + 1 > MANAGED_FREE_DAILY_REQUEST_LIMIT) {
      entry.blockedReason = "daily-request-budget";
      entry.blockedUntil = nextUtcDay(now);
      entry.updatedAt = now;
      ledger.entries[key] = entry;
      writeLedger(ledger);
      throw new FreeAiRuntimeBudgetError("오늘의 앱 무료 요청 안전 한도에 도달했습니다. UTC 자정까지 차단하며 유료 모델로 전환하지 않습니다.");
    }
    if (
      entry.reservedTokens + prepared.reservedTokens
      > MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT
    ) {
      entry.blockedReason = "daily-token-budget";
      entry.blockedUntil = nextUtcDay(now);
      entry.updatedAt = now;
      ledger.entries[key] = entry;
      writeLedger(ledger);
      throw new FreeAiRuntimeBudgetError("오늘의 앱 무료 토큰 예약 한도에 도달했습니다. UTC 자정까지 차단하며 유료 모델로 전환하지 않습니다.");
    }

    entry.requests += 1;
    entry.reservedTokens += prepared.reservedTokens;
    entry.updatedAt = now;
    ledger.entries[key] = entry;
    writeLedger(ledger);
    return {
      body: prepared.body,
      guarded: true,
      reservedTokens: prepared.reservedTokens,
      maxOutputTokens: prepared.maxOutputTokens,
    };
  });
}

function retryAfterUntil(headers: Headers, now: number): number | null {
  const value = headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(Math.max(date, now), now + MAX_RETRY_AFTER_MS)
    : null;
}

export async function recordFreeAiRuntimeResponse(
  connection: UserAiConnection,
  status: number,
  headers: Headers,
  now = Date.now(),
): Promise<void> {
  if (!isManagedFreeConnection(connection)) return;
  try {
    await withBudgetLock(() => {
      const ledger = readLedger();
      const key = scopeKey(connection);
      const entry = currentEntry(ledger, key, now);

      if (status === 402) {
        entry.blockedReason = "payment-required";
        entry.blockedUntil = null;
      } else if (status === 429) {
        entry.quotaFailures += 1;
        entry.blockedReason = "rate-limit";
        entry.blockedUntil = entry.quotaFailures >= 2
          ? nextUtcDay(now)
          : Math.max(
            now + FIRST_RATE_LIMIT_COOLDOWN_MS,
            retryAfterUntil(headers, now) ?? 0,
          );
      } else if (status === 401 || status === 403) {
        entry.blockedReason = "authentication";
        entry.blockedUntil = now + AUTH_FAILURE_COOLDOWN_MS;
      } else if (status >= 200 && status < 400) {
        entry.quotaFailures = 0;
        if (
          entry.blockedReason === "rate-limit"
          || entry.blockedReason === "authentication"
        ) {
          entry.blockedReason = null;
          entry.blockedUntil = null;
        }
      }

      entry.updatedAt = now;
      ledger.entries[key] = entry;
      writeLedger(ledger);
    });
  } catch {
    // A response must never be replaced by bookkeeping failure. The reservation
    // was already made before network I/O and remains the conservative fallback.
  }
}

export function getFreeAiRuntimeBudgetSnapshot(
  connection: UserAiConnection,
  now = Date.now(),
): FreeAiRuntimeBudgetSnapshot {
  if (!isManagedFreeConnection(connection)) {
    return {
      guarded: false,
      requests: 0,
      requestLimit: null,
      reservedTokens: 0,
      reservedTokenLimit: null,
      remainingRequests: null,
      remainingReservedTokens: null,
      blockedReason: null,
      blockedUntil: null,
      resetsAt: null,
    };
  }
  const ledger = readLedger();
  const entry = currentEntry(ledger, scopeKey(connection), now);
  if (
    entry.blockedReason !== "payment-required"
    && entry.blockedUntil !== null
    && entry.blockedUntil <= now
  ) {
    entry.blockedReason = null;
    entry.blockedUntil = null;
  }
  return {
    guarded: true,
    requests: entry.requests,
    requestLimit: MANAGED_FREE_DAILY_REQUEST_LIMIT,
    reservedTokens: entry.reservedTokens,
    reservedTokenLimit: MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT,
    remainingRequests: Math.max(0, MANAGED_FREE_DAILY_REQUEST_LIMIT - entry.requests),
    remainingReservedTokens: Math.max(
      0,
      MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT - entry.reservedTokens,
    ),
    blockedReason: entry.blockedReason,
    blockedUntil: entry.blockedUntil,
    resetsAt: nextUtcDay(now),
  };
}

export function resetFreeAiRuntimeBudget(connection?: UserAiConnection): void {
  const ledger = readLedger();
  if (connection) {
    delete ledger.entries[scopeKey(connection)];
    writeLedger(ledger);
    return;
  }
  memoryLedger = structuredClone(EMPTY_LEDGER);
  try {
    browserStorage()?.removeItem(FREE_AI_RUNTIME_BUDGET_STORAGE_KEY);
  } catch {
    // The in-memory ledger was already cleared.
  }
}
