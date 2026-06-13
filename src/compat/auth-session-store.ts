import { createContext, useContext } from "react";

export type Session = {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
  token?: string | null; // 서명 세션 토큰 — 인증 요청의 x-user-id 헤더로 전송한다.
} | null;

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

export const SESSION_KEY = "toonspectrum-auth-session";

export const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "unauthenticated",
  update: async () => null,
});

let currentSession: Session = readStoredSession();
export const listeners = new Set<(session: Session) => void>();

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export async function signIn(provider?: string, options?: Record<string, unknown>) {
  // 소셜 로그인(Google·Kakao): OAuth 시작 엔드포인트로 전체 페이지 리다이렉트.
  // 백엔드가 설정 여부에 따라 실제 제공자 또는 데모 폴백(/auth/callback#demo=)으로 분기한다.
  if (provider === "google" || provider === "kakao" || provider === "naver") {
    const url = `/api/auth/oauth/${provider}/start`;
    if (typeof window !== "undefined") window.location.assign(url);
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

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: options?.email,
      password: options?.password,
    }),
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
  const token = currentSession?.token;
  if (token) {
    await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      headers: { "x-user-id": token },
    }).catch(() => {});
  }
  persistSession(null);
  return undefined;
}

// OAuth 콜백 페이지가 핸드오프/데모로 받은 사용자 객체로 세션을 확정할 때 사용.
export function completeOAuthLogin(user: NonNullable<Session>["user"] | null, token?: string | null) {
  persistSession(user?.id ? { user, token: token ?? null } : null);
}

export function getAuthSession() {
  return currentSession;
}

export function getAuthUserId() {
  return currentSession?.user.id ?? null;
}

// 인증 요청의 x-user-id 헤더 값(서명 세션 토큰). 없으면 null → 미인증.
export function getAuthToken() {
  return currentSession?.token ?? null;
}

export function readStoredSession(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function persistSession(session: Session) {
  currentSession = session?.user?.id ? session : null;
  if (typeof window !== "undefined") {
    if (currentSession) window.localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    else window.localStorage.removeItem(SESSION_KEY);
  }
  emitSession(currentSession);
}

export function emitSession(session: Session) {
  currentSession = session;
  listeners.forEach((listener) => listener(session));
}
