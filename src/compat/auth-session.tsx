import { useEffect, useState, type ReactNode } from "react";

import {
  subscribeSessionSyncRequests,
  type SessionSyncReason,
} from "./auth-session-state";
import {
  SessionContext,
  getAuthSession,
  listeners,
  persistSession,
  synchronizeServerSession,
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
    const requestSync = (reason: SessionSyncReason) => {
      void synchronizeServerSession(reason);
    };
    const onFocus = () => requestSync("focus");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestSync("focus");
    };

    listeners.add(listener);
    const unsubscribeSyncRequests = subscribeSessionSyncRequests(requestSync);
    globalThis.addEventListener("focus", onFocus, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange, {
      passive: true,
    });
    requestSync("startup");
    return () => {
      listeners.delete(listener);
      unsubscribeSyncRequests();
      globalThis.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const value: SessionContextValue = data?.user
    ? {
        data,
        status: "authenticated",
        update: () => synchronizeServerSession("manual"),
      }
    : {
        data: null,
        status: "unauthenticated",
        update: () => synchronizeServerSession("manual"),
      };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
