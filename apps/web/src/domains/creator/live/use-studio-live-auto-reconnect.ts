import { useEffect, useRef, useState } from "react";

export const STUDIO_LIVE_AUTO_RECONNECT_DELAYS = [2_000, 5_000, 10_000] as const;
export type StudioLiveConnectionRecovery = "idle" | "waiting" | "retrying" | "paused" | "exhausted";

interface ReconnectInput {
  readonly scopeKey: string | null;
  readonly enabled: boolean;
  readonly failed: boolean;
  readonly connected: boolean;
  readonly retry: () => void;
}

/** Retry closed room generations, never a live socket, a local-only room or a terminal boundary. */
export function useStudioLiveAutoReconnect({ scopeKey, enabled, failed, connected, retry }: ReconnectInput): StudioLiveConnectionRecovery {
  const attempts = useRef(0);
  const [phase, setPhase] = useState<StudioLiveConnectionRecovery>("idle");
  useEffect(() => { attempts.current = 0; }, [scopeKey]);
  useEffect(() => {
    if (!enabled || connected) {
      attempts.current = 0;
      setPhase("idle");
      return;
    }
    if (!failed) { setPhase("idle"); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      cancel();
      if (navigator.onLine === false || document.visibilityState === "hidden") {
        setPhase("paused");
        return;
      }
      const delay = STUDIO_LIVE_AUTO_RECONNECT_DELAYS[attempts.current];
      if (delay === undefined) { setPhase("exhausted"); return; }
      setPhase("waiting");
      timer = setTimeout(() => {
        timer = null;
        if (navigator.onLine === false || document.visibilityState === "hidden") {
          setPhase("paused");
          return;
        }
        attempts.current += 1;
        setPhase("retrying");
        retry();
      }, delay);
    };
    schedule();
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancel();
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [connected, enabled, failed, retry, scopeKey]);
  return phase;
}
