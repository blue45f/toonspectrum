import { useEffect, useMemo, useSyncExternalStore } from "react";

import { createCreatorMeetingSession } from "./creator-meeting-session";

export function useCreatorMeetingRoom(id: string, actor: string) {
  const session = useMemo(() => createCreatorMeetingSession(id, actor), [id, actor]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    const availability = () => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) session.suspend();
      else session.resume();
    };
    session.start();
    document.addEventListener("visibilitychange", availability);
    window.addEventListener("offline", availability);
    window.addEventListener("online", availability);
    window.addEventListener("pagehide", session.suspend);
    window.addEventListener("pageshow", availability);
    return () => {
      document.removeEventListener("visibilitychange", availability);
      window.removeEventListener("offline", availability);
      window.removeEventListener("online", availability);
      window.removeEventListener("pagehide", session.suspend);
      window.removeEventListener("pageshow", availability);
      session.dispose();
    };
  }, [session]);
  return { ...state, refresh: session.refresh, send: session.send };
}
