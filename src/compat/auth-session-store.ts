import { createContext, useContext } from "react";

import { getAuthToken, persistSession, type Session } from "./auth-session-state";

import { api, apiPath } from "@/src/infrastructure/api";

export {
  SESSION_KEY,
  emitSession,
  getAuthSession,
  getAuthToken,
  getAuthUserId,
  listeners,
  persistSession,
  readStoredSession,
} from "./auth-session-state";
export type { Session } from "./auth-session-state";

export type SessionContextValue =
  | {
      data: NonNullable<Session>;
      status: "authenticated";
      update: () => Promise<NonNullable<Session>>;
    }
  | {
      data: null;
      status: "unauthenticated";
      update: () => Promise<null>;
    };

export const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "unauthenticated",
  update: async () => null,
});

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

// GIS(Google Identity Services) ID 토큰 로그인 — GIS 버튼 콜백이 받은 credential(ID 토큰)을
// 서버에서 검증해 세션을 확정한다. 리다이렉트 없이 모달에서 바로 로그인 완료.
export async function signInWithGoogleIdToken(idToken: string) {
  const response = await api.raw(apiPath("/auth/oauth/google/id-token"), {
    method: "POST",
    throwHttpErrors: false,
    json: { idToken },
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: NonNullable<Session>["user"]; token?: string; error?: string }
    | null;
  if (!response.ok || !payload?.user) {
    return { ok: false, error: payload?.error ?? "auth-failed", status: response.status };
  }
  persistSession({ user: payload.user, token: payload.token ?? null });
  return { ok: true, error: null, status: response.status };
}

// ── 토스 로그인(앱인토스 네이티브) ──
// 토스 미니앱이 startup 에 주입하는 인가코드 발급 함수. 웹(토스 밖)에선 undefined.
declare global {
  var __toonspectrumTossLogin:
    | undefined
    | (() => Promise<{ authorizationCode: string; referrer: string } | null>);
}

/** 토스 네이티브 로그인이 가능한 환경인지(미니앱이 인가코드 발급 함수를 주입했는지). */
export function isTossLoginAvailable(): boolean {
  return typeof globalThis.__toonspectrumTossLogin === "function";
}

export type TossLoginErrorCode =
  | "toss-unavailable"
  | "toss-cancelled"
  | "toss-sdk-failed"
  | "toss-network-failed"
  | "toss-not-configured"
  | "toss-authorization-failed"
  | "toss-upstream-failed"
  | "toss-access-blocked"
  | "toss-server-failed";

export type TossLoginResult =
  | { ok: true; error: null; message: null }
  | { ok: false; error: TossLoginErrorCode; message: string | null };

function tossLoginFailure(error: TossLoginErrorCode, message: string | null): TossLoginResult {
  return { ok: false, error, message };
}

function responseErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

/**
 * 토스 로그인 흐름: 미니앱 appLogin 으로 인가코드 → 서버 mTLS 교환(/auth/toss/exchange) → 세션 확정.
 * 토스 WebView 에서 깨지는 소셜 OAuth 리다이렉트 대신 쓰는 네이티브 경로.
 */
export async function tossLoginFlow(): Promise<TossLoginResult> {
  const requestCode = globalThis.__toonspectrumTossLogin;
  if (typeof requestCode !== "function") {
    return tossLoginFailure("toss-unavailable", "토스 앱에서 다시 시도해 주세요.");
  }

  let granted: Awaited<ReturnType<typeof requestCode>>;
  try {
    granted = await requestCode();
  } catch {
    return tossLoginFailure(
      "toss-sdk-failed",
      "토스 로그인 창을 열지 못했어요. 토스 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.",
    );
  }
  if (!granted?.authorizationCode) return tossLoginFailure("toss-cancelled", null);

  let response: Response;
  try {
    response = await api.raw(apiPath("/auth/toss/exchange"), {
      method: "POST",
      throwHttpErrors: false,
      json: { authorizationCode: granted.authorizationCode, referrer: granted.referrer },
    });
  } catch {
    return tossLoginFailure(
      "toss-network-failed",
      "로그인 서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.",
    );
  }
  const payload = (await response.json().catch(() => null)) as
    | { user?: NonNullable<Session>["user"]; token?: string; error?: string }
    | null;

  if (!response.ok) {
    if (response.status === 503) {
      return tossLoginFailure(
        "toss-not-configured",
        responseErrorMessage(payload, "토스 로그인이 아직 설정되지 않았어요."),
      );
    }
    if (response.status === 502) {
      return tossLoginFailure(
        "toss-upstream-failed",
        responseErrorMessage(payload, "토스 로그인 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요."),
      );
    }
    if (response.status === 401) {
      return tossLoginFailure(
        "toss-authorization-failed",
        responseErrorMessage(payload, "토스 인증이 만료되었어요. 다시 로그인해 주세요."),
      );
    }
    if (response.status === 403) {
      return tossLoginFailure(
        "toss-access-blocked",
        responseErrorMessage(payload, "이 계정은 현재 로그인할 수 없어요."),
      );
    }
    return tossLoginFailure(
      "toss-server-failed",
      responseErrorMessage(payload, "로그인 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요."),
    );
  }

  if (!payload?.user?.id || !payload.token) {
    return tossLoginFailure("toss-server-failed", "로그인 서버 응답이 올바르지 않아요. 다시 시도해 주세요.");
  }
  persistSession({ user: payload.user, token: payload.token });
  return { ok: true, error: null, message: null };
}

export async function signIn(provider?: string, options?: Record<string, unknown>) {
  // 소셜 로그인(Google·Kakao): OAuth 시작 엔드포인트로 전체 페이지 리다이렉트.
  // 백엔드가 설정 여부에 따라 실제 제공자 또는 데모 폴백(/auth/callback#demo=)으로 분기한다.
  // (Google 실연동은 GIS 버튼 → signInWithGoogleIdToken 경로를 사용; 이 리다이렉트는 데모/code-flow 폴백.)
  if (provider === "google" || provider === "kakao" || provider === "naver") {
    const url = `/api/auth/oauth/${provider}/start`;
    if (typeof window !== "undefined") globalThis.location.assign(url);
    return { ok: true, error: null, status: 0, url };
  }

  if (provider !== "credentials") {
    return {
      ok: false,
      error: "provider-unavailable-in-vite-spa",
      status: 501,
      url: null,
    };
  }

  // 로그인 실패(비-2xx)도 정상 흐름으로 { ok:false, error } 를 돌려주므로 ky 예외를 끄고 Response 를 직접 다룬다.
  const response = await api.raw(apiPath("/auth/login"), {
    method: "POST",
    throwHttpErrors: false,
    json: { email: options?.email, password: options?.password },
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: NonNullable<Session>["user"]; token?: string; error?: string }
    | null;

  if (!response.ok || !payload?.user) {
    return {
      ok: false,
      error: payload?.error ?? "auth-failed",
      status: response.status,
      url: null,
    };
  }

  persistSession({ user: payload.user, token: payload.token ?? null });
  return {
    ok: true,
    error: null,
    status: response.status,
    url: null,
  };
}

export async function signOut() {
  const token = getAuthToken();
  if (token) {
    await api
      .raw(apiPath("/auth/logout"), {
        method: "POST",
        cache: "no-store",
        throwHttpErrors: false,
        headers: { "x-user-id": token },
      })
      .catch(() => {});
  }
  persistSession(null);
  return undefined;
}

// OAuth 콜백 페이지가 핸드오프/데모로 받은 사용자 객체로 세션을 확정할 때 사용.
export function completeOAuthLogin(user: NonNullable<Session>["user"] | null, token?: string | null) {
  persistSession(user?.id ? { user, token: token ?? null } : null);
}
