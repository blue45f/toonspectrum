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

// GIS(Google Identity Services) ID 토큰 로그인 — GIS 버튼 콜백이 받은 credential(ID 토큰)을
// 서버에서 검증해 세션을 확정한다. 리다이렉트 없이 모달에서 바로 로그인 완료.
export async function signInWithGoogleIdToken(idToken: string) {
  const { api, apiPath } = await import("@/src/infrastructure/api");
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

/**
 * 토스 로그인 흐름: 미니앱 appLogin 으로 인가코드 → 서버 mTLS 교환(/auth/toss/exchange) → 세션 확정.
 * 토스 WebView 에서 깨지는 소셜 OAuth 리다이렉트 대신 쓰는 네이티브 경로.
 */
export async function tossLoginFlow(): Promise<{ ok: boolean; error: string | null }> {
  const requestCode = globalThis.__toonspectrumTossLogin;
  if (typeof requestCode !== "function") return { ok: false, error: "toss-unavailable" };
  const granted = await requestCode().catch(() => null);
  if (!granted?.authorizationCode) return { ok: false, error: "toss-cancelled" };
  const { api, apiPath } = await import("@/src/infrastructure/api");
  const response = await api.raw(apiPath("/auth/toss/exchange"), {
    method: "POST",
    throwHttpErrors: false,
    json: { authorizationCode: granted.authorizationCode, referrer: granted.referrer },
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: NonNullable<Session>["user"]; token?: string; error?: string }
    | null;
  if (!response.ok || !payload?.user) {
    return { ok: false, error: payload?.error ?? "toss-auth-failed" };
  }
  persistSession({ user: payload.user, token: payload.token ?? null });
  return { ok: true, error: null };
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
  const { api, apiPath } = await import("@/src/infrastructure/api");
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
  const token = currentSession?.token;
  if (token) {
    const { api, apiPath } = await import("@/src/infrastructure/api");
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
    const raw = globalThis.localStorage.getItem(SESSION_KEY);
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
    if (currentSession) globalThis.localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    else globalThis.localStorage.removeItem(SESSION_KEY);
  }
  emitSession(currentSession);
}

export function emitSession(session: Session) {
  currentSession = session;
  // listeners 는 src/compat/auth-session.tsx 의 subscribe 에서 add 된다(교차 모듈이라 정적분석이 빈 Set 으로 오판).
  listeners.forEach((listener) => listener(session)); // NOSONAR S4158
}
