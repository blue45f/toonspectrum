import { useEffect, useState, type ReactNode } from "react";

import {
  SessionContext,
  emitSession,
  getAuthSession,
  listeners,
  persistSession,
  readStoredSession,
  SESSION_KEY,
  type Session,
  type SessionContextValue,
} from "./auth-session-store";

export function SessionProvider({ children, session = null }: { children: ReactNode; session?: Session }) {
  const [data, setData] = useState<Session>(() => session ?? getAuthSession());

  useEffect(() => {
    if (session?.user?.id) persistSession(session);
  }, [session]);

  useEffect(() => {
    const listener = (next: Session) => setData(next);
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) emitSession(readStoredSession());
    };
    listeners.add(listener);
    globalThis.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      globalThis.removeEventListener("storage", onStorage);
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
