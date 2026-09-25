import { HTTPError, TimeoutError } from "ky";

export const SERVICE_CAPABILITY_ERROR_EVENT =
  "toonspectrum:service-capability-error";

export type AppApiErrorKind =
  | "offline"
  | "timeout"
  | "unreachable"
  | "capability_unavailable"
  | "rate_limited"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "conflict"
  | "not_found"
  | "server"
  | "unknown";

export interface AppApiErrorInit {
  readonly kind: AppApiErrorKind;
  readonly status?: number | null;
  readonly code?: string | null;
  readonly capability?: string | null;
  readonly retryable?: boolean;
  readonly retryAfterSeconds?: number | null;
  readonly requestId?: string | null;
  readonly incidentId?: string | null;
  readonly cause?: unknown;
}

export class AppApiError extends Error {
  readonly kind: AppApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly capability: string | null;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  readonly incidentId: string | null;

  constructor(message: string, init: AppApiErrorInit) {
    super(message, { cause: init.cause });
    this.name = "AppApiError";
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.capability = init.capability ?? null;
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.requestId = init.requestId ?? null;
    this.incidentId = init.incidentId ?? null;
  }
}

interface PublicErrorEnvelope {
  readonly code?: unknown;
  readonly capability?: unknown;
  readonly retryable?: unknown;
  readonly retryAfterSeconds?: unknown;
  readonly requestId?: unknown;
  readonly incidentId?: unknown;
  readonly message?: unknown;
  readonly error?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function boundedSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(3_600, Math.max(1, Math.trunc(value)));
}

function retryAfterSeconds(
  response: Response,
  payload: PublicErrorEnvelope,
): number | null {
  const fromPayload = boundedSeconds(payload.retryAfterSeconds);
  if (fromPayload !== null) return fromPayload;
  const header = response.headers.get("Retry-After")?.trim();
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return boundedSeconds(seconds);
  const timestamp = Date.parse(header);
  if (!Number.isFinite(timestamp)) return null;
  return boundedSeconds(Math.ceil((timestamp - Date.now()) / 1_000));
}

function browserOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

function kindForStatus(
  status: number,
  code: string | null,
): AppApiErrorKind {
  if (
    code === "CAPABILITY_UNAVAILABLE"
    || code === "DATABASE_UNAVAILABLE"
    || code === "SCHEMA_NOT_READY"
    || code === "SERVICE_NOT_READY"
  ) return "capability_unavailable";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if ([502, 503, 504].includes(status)) return "capability_unavailable";
  if (status >= 500) return "server";
  return "unknown";
}

function messageFor(
  kind: AppApiErrorKind,
  fallback: string,
  retrySeconds: number | null,
  serverMessage: string | null,
): string {
  if (kind === "offline") {
    return "인터넷 연결이 끊겼습니다. 입력한 내용은 그대로 유지됩니다.";
  }
  if (kind === "timeout") {
    return "서버 응답이 지연되고 있습니다. 입력한 내용은 그대로 유지됩니다.";
  }
  if (kind === "unreachable") {
    return "서버에 연결할 수 없습니다. 같은 화면에서 다시 시도해 주세요.";
  }
  if (kind === "capability_unavailable") {
    return "일부 온라인 기능을 일시적으로 사용할 수 없습니다. 입력한 내용은 그대로 유지됩니다.";
  }
  if (kind === "rate_limited") {
    return retrySeconds
      ? `요청이 많아 잠시 제한되었습니다. 약 ${retrySeconds}초 후 다시 시도해 주세요.`
      : "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (kind === "unauthorized") {
    return "로그인이 만료되었습니다. 작성 중인 내용은 유지됩니다.";
  }
  if (kind === "forbidden") return "이 작업을 수행할 권한이 없습니다.";
  if (kind === "conflict") {
    return "다른 곳에서 내용이 변경되었습니다. 최신 상태를 확인해 주세요.";
  }
  if (kind === "not_found") {
    return serverMessage ?? "요청한 항목을 찾을 수 없습니다.";
  }
  if (kind === "validation") return serverMessage ?? fallback;
  return fallback;
}

function emitCapabilityFailure(error: AppApiError): void {
  if (error.kind !== "capability_unavailable") return;
  if (
    typeof globalThis.dispatchEvent !== "function"
    || typeof CustomEvent === "undefined"
  ) return;
  globalThis.dispatchEvent(new CustomEvent(SERVICE_CAPABILITY_ERROR_EVENT, {
    detail: {
      capability: error.capability,
      retryAfterSeconds: error.retryAfterSeconds,
      requestId: error.requestId,
      incidentId: error.incidentId,
      detectedAt: new Date().toISOString(),
    },
  }));
}

function payloadOf(error: HTTPError): PublicErrorEnvelope {
  return error.data && typeof error.data === "object"
    ? error.data as PublicErrorEnvelope
    : {};
}

async function payloadFromResponse(
  response: Response,
): Promise<PublicErrorEnvelope> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object"
      ? value as PublicErrorEnvelope
      : {};
  } catch {
    return {};
  }
}

export async function observeApiResponse(
  response: Response,
  fallback = "요청을 처리하지 못했습니다.",
): Promise<AppApiError | null> {
  if (response.ok) return null;
  const payload = await payloadFromResponse(response);
  const code = text(payload.code);
  const kind = kindForStatus(response.status, code);
  const retrySeconds = retryAfterSeconds(response, payload);
  const error = new AppApiError(
    messageFor(
      kind,
      fallback,
      retrySeconds,
      text(payload.error) ?? text(payload.message),
    ),
    {
      kind,
      status: response.status,
      code,
      capability: text(payload.capability),
      retryable: typeof payload.retryable === "boolean"
        ? payload.retryable
        : kind === "capability_unavailable" || kind === "rate_limited",
      retryAfterSeconds: retrySeconds,
      requestId: text(payload.requestId)
        ?? response.headers.get("X-Request-Id"),
      incidentId: text(payload.incidentId)
        ?? response.headers.get("X-Incident-Id"),
    },
  );
  emitCapabilityFailure(error);
  return error;
}

export function isAppApiError(error: unknown): error is AppApiError {
  return error instanceof AppApiError;
}

export function toAppApiError(
  error: unknown,
  fallback: string,
): AppApiError {
  if (error instanceof AppApiError) return error;
  if (error instanceof HTTPError) {
    const payload = payloadOf(error);
    const code = text(payload.code);
    const kind = kindForStatus(error.response.status, code);
    const retrySeconds = retryAfterSeconds(error.response, payload);
    const appError = new AppApiError(
      messageFor(
        kind,
        fallback,
        retrySeconds,
        text(payload.error) ?? text(payload.message),
      ),
      {
        kind,
        status: error.response.status,
        code,
        capability: text(payload.capability),
        retryable: typeof payload.retryable === "boolean"
          ? payload.retryable
          : kind === "capability_unavailable" || kind === "rate_limited",
        retryAfterSeconds: retrySeconds,
        requestId: text(payload.requestId)
          ?? error.response.headers.get("X-Request-Id"),
        incidentId: text(payload.incidentId)
          ?? error.response.headers.get("X-Incident-Id"),
        cause: error,
      },
    );
    emitCapabilityFailure(appError);
    return appError;
  }
  if (
    error instanceof TimeoutError
    || (error instanceof Error && error.name === "TimeoutError")
  ) {
    return new AppApiError(messageFor("timeout", fallback, null, null), {
      kind: "timeout",
      retryable: true,
      cause: error,
    });
  }
  if (browserOffline()) {
    return new AppApiError(messageFor("offline", fallback, null, null), {
      kind: "offline",
      retryable: true,
      cause: error,
    });
  }
  if (
    error instanceof TypeError
    || (
      error instanceof Error
      && /failed to fetch|network\s+error|networkerror|load failed|fetch failed/iu
        .test(error.message)
    )
  ) {
    return new AppApiError(messageFor("unreachable", fallback, null, null), {
      kind: "unreachable",
      retryable: true,
      cause: error,
    });
  }
  return new AppApiError(
    error instanceof Error && error.message ? error.message : fallback,
    { kind: "unknown", cause: error },
  );
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  return toAppApiError(error, fallback).message;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
