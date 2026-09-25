import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { StudioWorkSessionController, type StudioSessionStorage } from "./studio-work-session-controller";
import { studioWorkSessionApi } from "./studio-work-session-client";

const subscribeAuth = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const serverRevision = () => 0;
const pendingStorage: StudioSessionStorage = {
  getItem: (key) => typeof window === "undefined" ? null : window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
};
/** Pending intents are isolated per browser tab; durable results remain on the authorized API. */
export function useStudioWorkSession(workId: string, actorId: string, initialSessionId: string | null = null) {
  const revision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, serverRevision);
  const controller = useMemo(() => new StudioWorkSessionController(workId, actorId, studioWorkSessionApi, pendingStorage,
    () => typeof document !== "undefined" && document.visibilityState !== "hidden"
      && getAuthUserId() === actorId && getAuthSessionRevision() === revision), [workId, actorId, revision]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (initialSessionId) controller.select(initialSessionId); else void controller.refresh();
    const visible = () => { if (document.visibilityState === "hidden") controller.suspend(); else void controller.refresh(); };
    const focus = () => { void controller.refresh(); };
    const timer = setInterval(focus, 10_000);
    document.addEventListener("visibilitychange", visible); window.addEventListener("focus", focus);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", focus); controller.suspend(); };
  }, [controller, initialSessionId]);
  return { controller, snapshot };
}
