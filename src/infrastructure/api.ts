// 공유 HTTP 클라이언트 — ky 인스턴스 1개로 통일한다(이전엔 각 모듈이 fetch를 직접 호출).
// 인증은 기존 세션 스킴을 그대로 재사용한다: 서명 세션 토큰(getAuthToken)을 x-user-id 헤더로 전송.
// (offhours 의 Bearer 토큰 beforeRequest 훅과 같은 형태를, 이 레포의 x-user-id 스킴에 맞춰 옮긴 것)
import ky, { HTTPError, type KyResponse, type Options } from "ky";

import { resolveApiError, safeParseJson } from "@/lib/http-safe";
import { getAuthToken } from "@/src/compat/auth-session-store";

function apiBase() {
  const env = import.meta.env.VITE_API_BASE?.replace(/\/$/, "");
  return env ?? "";
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

// 공유 ky 클라이언트. URL 은 호출부에서 apiPath() 로 만들고, 인증 헤더만 beforeRequest 훅에서 일괄 주입한다.
const client = ky.create({
  baseUrl: resolveBaseUrl(),
  // 기존 fetch 호출은 모두 cache:"no-store" 였다 — 동작 보존을 위해 기본값으로 둔다(호출부에서 덮어쓰기 가능).
  cache: "no-store",
  // 동일 출처 API 프록시라 쿠키는 불필요하지만 일관성/하위호환을 위해 명시한다.
  credentials: "same-origin",
  // 타임아웃은 끈다 — 기존 fetch 는 무제한이었고, 수동 크롤(/catalog/ingest/run)은 수 분 걸릴 수 있어 동작을 보존한다.
  timeout: false,
  // 자동 재시도는 끈다 — 기존 fetch 호출은 재시도가 없었고, 크롤/수집 같은 멱등성 비보장 요청이 있어 동작을 보존한다.
  retry: 0,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        // 서명 세션 토큰이 있으면 x-user-id 로 전송(서버 검증). 호출부가 직접 지정했으면 덮어쓰지 않는다.
        if (!request.headers.has("x-user-id")) {
          const token = getAuthToken();
          if (token) request.headers.set("x-user-id", token);
        }
      },
    ],
  },
});

// axios/fetch 시절 호출부 호환 — { params } 를 ky searchParams 로 바꾼다(빈 값은 제외).
// searchParams(ky 원형, 문자열/객체)도 그대로 받는다.
export type ApiOptions = Omit<Options, "method" | "json" | "body"> & {
  params?: Record<string, string | number | boolean | null | undefined>;
};

function toOptions(opts?: ApiOptions): Options {
  if (!opts) return {};
  const { params, ...rest } = opts;
  if (!params) return rest;
  const searchParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  );
  return { ...rest, searchParams };
}

// 응답 본문을 타입 T 로 파싱한다. 204/빈 본문은 undefined.
async function toJson<T>(response: KyResponse): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * 공유 ky 래퍼. path 는 `/api` 이후 경로(예: "/creator/works") 또는 전체 `/api/...` 둘 다 받는다.
 * apiPath() 로 정규화하므로 호출부는 fetch 시절 URL 을 그대로 넘기면 된다.
 * 4xx/5xx 는 ky HTTPError 로 throw → getApiErrorMessage() 로 메시지를 뽑는다.
 */
export const api = {
  raw: client,
  get: <T>(path: string, options?: ApiOptions): Promise<T> =>
    client.get(apiPath(path), toOptions(options)).then(toJson<T>),
  post: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    client.post(apiPath(path), { json: body, ...toOptions(options) }).then(toJson<T>),
  patch: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    client.patch(apiPath(path), { json: body, ...toOptions(options) }).then(toJson<T>),
  put: <T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> =>
    client.put(apiPath(path), { json: body, ...toOptions(options) }).then(toJson<T>),
  delete: <T = void>(path: string, options?: ApiOptions): Promise<T> =>
    client.delete(apiPath(path), toOptions(options)).then(toJson<T>),
};

/** 404 등 특정 상태를 흐름 제어로 다루고 싶을 때 — 응답 객체째 돌려준다(throwHttpErrors:false 권장). */
export { HTTPError };

export function isHttpError(err: unknown): err is HTTPError {
  return err instanceof HTTPError;
}

/** HTTPError 의 상태 코드(아니면 null). */
export function httpStatus(err: unknown): number | null {
  return err instanceof HTTPError ? err.response.status : null;
}

/**
 * ky HTTPError(또는 일반 Error)에서 UI 표시용 메시지를 뽑는다.
 * ky 는 응답 본문을 미리 파싱해 error.data 에 담는다({ error } / { message } 형태).
 * 기존 resolveApiError 규칙을 그대로 재사용해 메시지 텍스트가 fetch 시절과 동일하게 나오게 한다.
 */
export async function getApiErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof HTTPError) {
    // ky 2.x 는 본문을 error.data 로 미리 파싱한다(응답 body 는 이미 소비됨).
    const parsed = err.data ?? (await safeParseJson<unknown>(err.response.clone()));
    return resolveApiError(parsed, `${fallback} (${err.response.status})`);
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/** getApiErrorMessage 메시지를 담되 원본 에러를 cause 로 보존한 Error 를 만든다(rethrow 용). */
export async function toApiError(err: unknown, fallback: string): Promise<Error> {
  return new Error(await getApiErrorMessage(err, fallback), { cause: err });
}
