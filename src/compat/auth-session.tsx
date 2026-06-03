import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Session = {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
} | null;

type SessionContextValue =
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

const SESSION_KEY = "webdex-auth-session";

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "unauthenticated",
  update: async () => null,
});

let currentSession: Session = readStoredSession();
const listeners = new Set<(session: Session) => void>();

export function SessionProvider({ children, session = null }: { children: ReactNode; session?: Session }) {
  const [data, setData] = useState<Session>(() => session ?? currentSession);

  useEffect(() => {
    if (session?.user?.id) persistSession(session);
  }, [session]);

  useEffect(() => {
    const listener = (next: Session) => setData(next);
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) emitSession(readStoredSession());
    };
    listeners.add(listener);
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value: SessionContextValue = data?.user
    ? {
        data,
        status: "authenticated",
        update: async () => data,
      }
    : {
        data: null,
        status: "unauthenticated",
        update: async () => null,
      };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

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

  persistSession({ user: payload.user });
  return {
    ok: true,
    error: null,
    status: response.status,
    url: null,
  };
}

export async function signOut() {
  persistSession(null);
  return undefined;
}

// OAuth 콜백 페이지가 핸드오프/데모로 받은 사용자 객체로 세션을 확정할 때 사용.
export function completeOAuthLogin(user: NonNullable<Session>["user"] | null) {
  persistSession(user?.id ? { user } : null);
}

export function getAuthSession() {
  return currentSession;
}

export function getAuthUserId() {
  return currentSession?.user.id ?? null;
}

function readStoredSession(): Session {
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

function persistSession(session: Session) {
  currentSession = session?.user?.id ? session : null;
  if (typeof window !== "undefined") {
    if (currentSession) window.localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    else window.localStorage.removeItem(SESSION_KEY);
  }
  emitSession(currentSession);
}

function emitSession(session: Session) {
  currentSession = session;
  listeners.forEach((listener) => listener(session));
}
