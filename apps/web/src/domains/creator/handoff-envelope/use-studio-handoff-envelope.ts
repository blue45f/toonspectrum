import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as authListeners } from "@/compat/auth-session-state";
import { useStudioStableHandlers } from "../studio-stable-handlers";
import { studioHandoffClient } from "./studio-handoff-envelope-client";
import { EMPTY_HANDOFF, StudioHandoffEnvelopeController } from "./studio-handoff-envelope-controller";

export function useStudioHandoffEnvelope(workId: string, taskId: string | null, actorId: string) {
  const key = JSON.stringify([workId, taskId, actorId]), current = useRef<StudioHandoffEnvelopeController | null>(null);
  const [state, setState] = useState({ key, snapshot: EMPTY_HANDOFF });
  const deps = useStudioStableHandlers({ owner: () => ({ actorId: getAuthUserId(), generation: getAuthSessionRevision(),
    available: getAuthUserId() === actorId && document.visibilityState !== "hidden" }), now: Date.now, createId: () => crypto.randomUUID() });
  useLayoutEffect(() => {
    const controller = new StudioHandoffEnvelopeController(workId, taskId, { ...deps, client: studioHandoffClient }); current.current = controller;
    const unsubscribe = controller.subscribe(() => { if (current.current === controller) setState({ key, snapshot: controller.getSnapshot() }); });
    const changed = () => { controller.invalidate(); if (getAuthUserId() === actorId && document.visibilityState !== "hidden") void controller.refresh(); };
    authListeners.add(changed); document.addEventListener("visibilitychange", changed);
    const timer = window.setInterval(() => { controller.checkLease(); const value = controller.getSnapshot();
      if (value.phase === "ready" && value.expiresAt - Date.now() <= 5_000) void controller.refresh(true);
    }, 250);
    void controller.refresh();
    return () => { authListeners.delete(changed); document.removeEventListener("visibilitychange", changed); window.clearInterval(timer);
      if (current.current === controller) current.current = null; unsubscribe(); controller.dispose(); };
  }, [workId, taskId, actorId, key, deps]);
  const refresh = useCallback(() => { void current.current?.refresh(); }, []);
  const select = useCallback((id: string | null, cursor: string | null = null) => { void current.current?.select(id, cursor); }, []);
  const send = useCallback((input: { roleId: string; usageConditions: string; remainingNotes: string }) => { void current.current?.send(input); }, []);
  const act = useCallback((phase: "open" | "accept" | "cancel") => { void current.current?.act(phase); }, []);
  const retry = useCallback(() => { void current.current?.retry(); }, []);
  return { snapshot: state.key === key ? state.snapshot : EMPTY_HANDOFF, refresh, select, send, act, retry };
}
