import { createContext, useContext } from "react";

import {
  getAuthSession,
  getAuthSessionRevision,
  persistSession,
  type Session,
  type SessionSyncReason,
} from "./auth-session-state";
import { normalizeClientSession } from "./auth-session-storage";

import { api, apiPath } from "@/src/infrastructure/api";

export {
  SESSION_KEY,
  emitSession,
  getAuthSession,
  getAuthToken,
  getAuthUserId,
  listeners,
  mergeCurrentSessionProfile,
  persistSession,
  readStoredSession,
} from "./auth-session-state";
export type { Session } from "./auth-session-state";

export type SessionContextValue =
  | {
      data: NonNullable<Session>;
      status: "authenticated";
      update: () => Promise<Session>;
    }
  | {
      data: null;
      status: "unauthenticated";
      update: () => Promise<Session>;
    };

export const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "unauthenticated",
  update: async () => null,
});

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

type ServerSessionPayload =
  | {
      authenticated: true;
      user: NonNullable<Session>["user"];
    }
  | {
      authenticated: false;
      user: null;
    };

let serverSessionRequest: Promise<Session> | null = null;
const SERVER_SESSION_ROLES = new Set(["admin", "creator", "operator", "user"]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseServerSessionPayload(value: unknown): ServerSessionPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const payload = value as { authenticated?: unknown; user?: unknown };
  if (payload.authenticated === false && payload.user === null) {
    return { authenticated: false, user: null };
  }
  if (payload.authenticated !== true) return null;
  if (typeof payload.user !== "object" || payload.user === null || Array.isArray(payload.user)) {
    return null;
  }
  const user = payload.user as Record<string, unknown>;
  if (
    !isNullableString(user.name)
    || !isNullableString(user.email)
    || !isNullableString(user.image)
    || typeof user.role !== "string"
    || !SERVER_SESSION_ROLES.has(user.role)
  ) {
    return null;
  }
  const session = normalizeClientSession({ user: payload.user, token: null });
  return session
    ? { authenticated: true, user: session.user }
    : null;
}

/**
 * Reconciles the browser cache with the HttpOnly-cookie session. Transport or
 * malformed-response failures retain the last known state; only an explicit
 * logged-out response (or 401) clears it.
 */
export function synchronizeServerSession(
  _reason: SessionSyncReason = "manual",
): Promise<Session> {
  if (serverSessionRequest) return serverSessionRequest;
  const requestRevision = getAuthSessionRevision();
  const requestIsCurrent = () => getAuthSessionRevision() === requestRevision;
  serverSessionRequest = (async () => {
    let response: Response;
    try {
      response = await api.raw(apiPath("/auth/session"), {
        method: "GET",
        cache: "no-store",
        throwHttpErrors: false,
      });
    } catch {
      return getAuthSession();
    }

    if (!requestIsCurrent()) return getAuthSession();
    if (!response.ok) {
      if (response.status === 401) persistSession(null);
      return getAuthSession();
    }

    const payload = parseServerSessionPayload(
      await response.json().catch(() => null),
    );
    if (!requestIsCurrent()) return getAuthSession();
    if (!payload) return getAuthSession();
    if (!payload.authenticated) {
      persistSession(null);
      return null;
    }

    const next = { user: payload.user, token: null };
    persistSession(next);
    return getAuthSession();
  })().finally(() => {
    serverSessionRequest = null;
  });
  return serverSessionRequest;
}

// GIS(Google Identity Services) ID 토큰 로그인 — GIS 버튼 콜백이 받은 credential(ID 토큰)을
// 서버에서 검증해 세션을 확정한다. 리다이렉트 없이 모달에서 바로 로그인 완료.
export type GoogleIdTokenSignInResult =
  | { ok: true; error: null; status: number }
  | { ok: false; error: string; status: number };

const GOOGLE_ID_TOKEN_MAX_LENGTH = 16_384;

export async function signInWithGoogleIdToken(
  idToken: string,
  options?: { signal?: AbortSignal },
): Promise<GoogleIdTokenSignInResult> {
  const token = typeof idToken === "string" ? idToken.trim() : "";
  if (
    !token
    || token.length > GOOGLE_ID_TOKEN_MAX_LENGTH
    || token.split(".").length !== 3
  ) {
    return { ok: false, error: "Google 로그인 응답 형식이 올바르지 않아요.", status: 400 };
  }

  try {
    const response = await api.raw(apiPath("/auth/oauth/google/id-token"), {
      method: "POST",
      throwHttpErrors: false,
      json: { idToken: token },
      signal: options?.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | { user?: NonNullable<Session>["user"]; error?: string }
      | null;
    if (!response.ok || !payload?.user) {
      return {
        ok: false,
        error: payload?.error ?? "Google 로그인에 실패했어요. 다시 시도해 주세요.",
        status: response.status,
      };
    }
    persistSession({ user: payload.user, token: null });
    return { ok: true, error: null, status: response.status };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "Google 로그인 요청이 취소되었어요.", status: 0 };
    }
    return {
      ok: false,
      error: "로그인 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.",
      status: 0,
    };
  }
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
    | { user?: NonNullable<Session>["user"]; error?: string }
    | null;

  if (!response.ok || !payload?.user) {
    return {
      ok: false,
      error: payload?.error ?? "auth-failed",
      status: response.status,
      url: null,
    };
  }

  persistSession({ user: payload.user, token: null });
  return {
    ok: true,
    error: null,
    status: response.status,
    url: null,
  };
}

export async function signOut() {
  await api
    .raw(apiPath("/auth/logout"), {
      method: "POST",
      cache: "no-store",
      throwHttpErrors: false,
    })
    .catch(() => {});
  persistSession(null);
  return undefined;
}

// OAuth 콜백 페이지가 핸드오프/데모로 받은 사용자 객체로 세션을 확정할 때 사용.
export function completeOAuthLogin(
  user: NonNullable<Session>["user"] | null,
) {
  persistSession(user?.id ? { user, token: null } : null);
}
