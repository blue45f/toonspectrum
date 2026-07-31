import {
  clientTokenExpiresAt,
  clearClientSessionStorage,
  normalizeClientSession,
  persistClientSession,
  readClientSession,
  type Session,
} from "./auth-session-storage";

export { SESSION_KEY } from "./auth-session-storage";
export type { Session } from "./auth-session-storage";

let currentSession: Session = readClientSession();
export const listeners = new Set<(session: Session) => void>();
let sessionExpiryTimer: ReturnType<typeof setTimeout> | undefined;

function clearSessionExpiryTimer(): void {
  if (sessionExpiryTimer !== undefined) {
    globalThis.clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = undefined;
  }
}

function expireSessionIfNeeded(now: number = Date.now()): boolean {
  const expiresAt = clientTokenExpiresAt(currentSession?.token);
  if (expiresAt === null || expiresAt > now) return false;
  currentSession = null;
  clearClientSessionStorage();
  listeners.forEach((listener) => listener(null)); // NOSONAR S4158
  return true;
}

function scheduleSessionExpiry(): void {
  clearSessionExpiryTimer();
  if (typeof window === "undefined") return;
  const expiresAt = clientTokenExpiresAt(currentSession?.token);
  if (expiresAt === null) return;
  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    expireSessionIfNeeded();
    return;
  }
  // Browsers clamp long timers. Recheck after each bounded interval so a
  // 30-day server JWT cannot silently outlive its local expiry timer.
  sessionExpiryTimer = globalThis.setTimeout(
    () => {
      if (!expireSessionIfNeeded()) scheduleSessionExpiry();
    },
    Math.min(delay, 2_147_000_000),
  );
}

function applySession(session: Session, persist: boolean): Session {
  const normalized = persist ? persistClientSession(session) : normalizeClientSession(session);
  currentSession = normalized;
  scheduleSessionExpiry();
  listeners.forEach((listener) => listener(currentSession)); // NOSONAR S4158
  return currentSession;
}

if (typeof window !== "undefined") {
  const reconcileSessionExpiry = () => {
    if (!expireSessionIfNeeded()) scheduleSessionExpiry();
  };
  globalThis.addEventListener("focus", reconcileSessionExpiry, { passive: true });
  globalThis.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconcileSessionExpiry();
  });
  scheduleSessionExpiry();
}

export function getAuthSession() {
  expireSessionIfNeeded();
  return currentSession;
}

export function getAuthUserId() {
  expireSessionIfNeeded();
  return currentSession?.user.id ?? null;
}

// Shared API requests read only this React-free state module. Keeping the token owner below the
// HTTP client prevents api.ts <-> auth-session-store.ts from becoming a circular dependency.
export function getAuthToken() {
  expireSessionIfNeeded();
  return currentSession?.token ?? null;
}

export function readStoredSession(): Session {
  return readClientSession();
}

export function persistSession(session: Session): void {
  applySession(session, true);
}

export function emitSession(session: Session) {
  applySession(session, false);
  // listeners are registered by src/compat/auth-session.tsx subscribe logic.
}
