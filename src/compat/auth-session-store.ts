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
