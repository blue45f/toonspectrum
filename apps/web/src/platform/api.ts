// 공유 HTTP 클라이언트 — ky 인스턴스 1개로 통일한다(이전엔 각 모듈이 fetch를 직접 호출).
// 인증 진실원천은 same-origin HttpOnly 쿠키다. 브라우저 저장소의 bearer를 읽거나
// x-user-id로 자동 전송하지 않는다.
import ky, { HTTPError, type KyResponse, type Options } from "ky";

import { handleUnauthorizedSession } from "@/domains/auth/public/session/auth-session-state";
import {
  AppApiError,
  apiErrorMessage,
  isAbortError,
  isAppApiError,
  observeApiResponse,
  toAppApiError,
} from "@/platform/api-error";
import { getRuntimeApiBase } from "@/platform/runtime-api-base";
import {
  TOONSPECTRUM_CSRF_HEADER,
  TOONSPECTRUM_CSRF_HEADER_VALUE,
  isCsrfProtectedMethod,
} from "@/shared/lib/csrf";

function apiBase() {
  const env = import.meta.env.VITE_API_BASE?.trim().replace(/\/+$/, "");
  return env || getRuntimeApiBase();
}

// `/foo` → `/api/foo`, 이미 `/api/...` 이면 그대로. VITE_API_BASE 가 있으면 앞에 붙인다.
export function apiPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const rooted = clean.startsWith("/api/") || clean === "/api" ? clean : `/api${clean}`;
  return `${apiBase()}${rooted}`;
}

// ky 는 요청 전 input 으로 Request 를 만든다 — 상대경로(/api/...)는 base 가 있어야 절대 URL 로 풀린다.
// 브라우저는 location.origin 으로, (테스트 등) 비브라우저 환경은 localhost 폴백으로 해석한다.
// apiPath() 가 이미 절대 URL(VITE_API_BASE 가 절대값일 때)을 만들면 그 값이 baseUrl 보다 우선한다.
function resolveBaseUrl(): string {
  if (typeof window !== "undefined" && globalThis.location?.origin) return globalThis.location.origin;
  return "http://localhost";
}

function isCredentialAttemptPath(pathname: string): boolean {
  return (
    pathname.endsWith("/api/auth/login")
    || pathname.endsWith("/api/auth/oauth/google/id-token")
    || pathname.endsWith("/api/auth/oauth/exchange")
    || /\/api\/auth\/oauth\/[^/]+\/demo$/u.test(pathname)
  );
}

// 공유 ky 클라이언트. URL 은 호출부에서 apiPath() 로 만들고, 인증 헤더만 beforeRequest 훅에서 일괄 주입한다.
const client = ky.create({
  baseUrl: resolveBaseUrl(),
  // 기존 fetch 호출은 모두 cache:"no-store" 였다 — 동작 보존을 위해 기본값으로 둔다(호출부에서 덮어쓰기 가능).
  cache: "no-store",
  // HttpOnly auth cookie is the browser session credential. The API base is
  // fixed by deployment configuration, and credentialed cross-origin access
  // is still constrained by the server's exact CORS/CSRF Origin allowlist.
  credentials: "include",
  // 기본 인스턴스는 재생을 금지한다. GET만 아래 readOptions에서 제한된 타임아웃·재시도를 적용한다.
  timeout: false,
  // 쓰기 요청의 중복 실행을 막기 위해 인스턴스 기본 재시도는 항상 끈다.
  retry: 0,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        if (isCsrfProtectedMethod(request.method)) {
          request.headers.set(
            TOONSPECTRUM_CSRF_HEADER,
            TOONSPECTRUM_CSRF_HEADER_VALUE,
          );
        }
      },
    ],
    afterResponse: [
      ({ request, response }) => {
        if (
          response.status === 401
          && !isCredentialAttemptPath(new URL(request.url).pathname)
        ) {
          handleUnauthorizedSession();
        }
      },
    ],
  },
});

const READ_TIMEOUT_MS = 12_000;
const READ_TOTAL_TIMEOUT_MS = 30_000;
const READ_RETRY: NonNullable<Options["retry"]> = {
  limit: 2,
  methods: ["get"],
  statusCodes: [408, 425, 429, 502, 503, 504],
  afterStatusCodes: [429, 503],
  maxRetryAfter: 30_000,
  backoffLimit: 2_000,
  jitter: true,
  retryOnTimeout: true,
};

export type ApiOptions = Omit<Options, "method" | "json" | "body"> & {
  params?: Record<string, string | number | boolean | null | undefined>;
  errorMessage?: string;
};

function toOptions(opts?: ApiOptions): Options {
  if (!opts) return {};
  const { params, errorMessage: _errorMessage, ...rest } = opts;
  if (!params) return rest;
  const searchParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return { ...rest, searchParams };
}

function errorFallback(options: ApiOptions | undefined, fallback: string): string {
  return options?.errorMessage?.trim() || fallback;
}

// 응답 본문을 타입 T 로 파싱한다. 204/빈 본문은 undefined.
// 비 JSON 본문(예: 미배포 엔드포인트의 HTML 404 페이지)은 JSON.parse 의 원시 SyntaxError
// ("Unexpected token '<'") 가 그대로 UI 로 새지 않도록 깔끔한 한국어 메시지로 감싼다.
async function toJson<T>(response: KyResponse): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("서버 응답을 해석하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

async function requestJson<T>(
  request: PromiseLike<KyResponse>,
  fallback: string,
): Promise<T> {
  try {
    return await toJson<T>(await request);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw toAppApiError(error, fallback);
  }
}

function readOptions(options?: ApiOptions): Options {
  return {
    timeout: READ_TIMEOUT_MS,
    totalTimeout: READ_TOTAL_TIMEOUT_MS,
    retry: READ_RETRY,
    ...toOptions(options),
  };
}


/**
 * Fetch-compatible internal API request for response-oriented legacy callers.
 *
 * This deliberately preserves the native `fetch(url, init)` contract (including AbortSignal and
 * caller-owned response parsing). Typed `api.get/post/...` calls use the bounded read-retry policy;
 * this compatibility path does not silently replay requests. It still centralizes credentials,
 * CSRF proof, auth-session invalidation, and public capability-outage observation.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (isCsrfProtectedMethod(method)) {
    headers.set(TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE);
  }
  const url = /^https?:\/\//iu.test(path) ? path : apiPath(path);
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers,
  });
  if (
    response.status === 401
    && !isCredentialAttemptPath(new URL(url, resolveBaseUrl()).pathname)
  ) {
    handleUnauthorizedSession();
  }
  // Browser responses always support clone(). Minimal fetch doubles used by tests or embedded
  // hosts may not; preserving the response contract is more important than optional observation.
  if (typeof response.clone === "function") {
    await observeApiResponse(response.clone());
  }
  return response;
}

/**
 * 공유 ky 래퍼. path 는 `/api` 이후 경로(예: "/creator/works") 또는 전체 `/api/...` 둘 다 받는다.
 * apiPath() 로 정규화하므로 호출부는 fetch 시절 URL 을 그대로 넘기면 된다.
 * 4xx/5xx 는 ky HTTPError 로 throw → getApiErrorMessage() 로 메시지를 뽑는다.
 */
export const api = {
  raw: client,
  get: <T>(path: string, options?: ApiOptions): Promise<T> =>
    requestJson<T>(
      client.get(apiPath(path), readOptions(options)),
      errorFallback(options, "데이터를 불러오지 못했습니다."),
    ),
  post: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    requestJson<T>(
      client.post(apiPath(path), { ...toOptions(options), json: body, retry: 0 }),
      errorFallback(options, "요청을 처리하지 못했습니다."),
    ),
  patch: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    requestJson<T>(
      client.patch(apiPath(path), { ...toOptions(options), json: body, retry: 0 }),
      errorFallback(options, "변경 내용을 저장하지 못했습니다."),
    ),
  put: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    requestJson<T>(
      client.put(apiPath(path), { ...toOptions(options), json: body, retry: 0 }),
      errorFallback(options, "변경 내용을 저장하지 못했습니다."),
    ),
  delete: <T = void>(path: string, options?: ApiOptions): Promise<T> =>
    requestJson<T>(
      client.delete(apiPath(path), { ...toOptions(options), retry: 0 }),
      errorFallback(options, "삭제 요청을 처리하지 못했습니다."),
    ),
};

export { AppApiError, HTTPError, isAppApiError, toAppApiError };

export function isHttpError(error: unknown): error is HTTPError {
  return error instanceof HTTPError;
}

export function httpStatus(error: unknown): number | null {
  if (error instanceof HTTPError) return error.response.status;
  if (isAppApiError(error)) return error.status;
  return null;
}

export async function getApiErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  return apiErrorMessage(error, fallback);
}

export async function toApiError(error: unknown, fallback: string): Promise<Error> {
  return toAppApiError(error, fallback);
}
