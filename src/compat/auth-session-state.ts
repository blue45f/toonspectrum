export type Session = {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
  token?: string | null;
} | null;

export const SESSION_KEY = "toonspectrum-auth-session";

let currentSession: Session = readStoredSession();
export const listeners = new Set<(session: Session) => void>();

export function getAuthSession() {
  return currentSession;
}

export function getAuthUserId() {
  return currentSession?.user.id ?? null;
}

// Shared API requests read only this React-free state module. Keeping the token owner below the
// HTTP client prevents api.ts <-> auth-session-store.ts from becoming a circular dependency.
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
  // listeners are registered by src/compat/auth-session.tsx subscribe logic.
  listeners.forEach((listener) => listener(session)); // NOSONAR S4158
}
