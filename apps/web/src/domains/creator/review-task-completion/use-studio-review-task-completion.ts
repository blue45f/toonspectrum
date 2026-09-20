import { canonicalJson } from "@toonspectrum/studio-project-model";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as authListeners } from "@/compat/auth-session-state";
import { useStudioStableHandlers } from "../studio-stable-handlers";
import { completeStudioReviewTask, readStudioReviewTaskCompletion, type StudioReviewTaskCompletionRequest } from "./studio-review-task-completion-client";
import { EMPTY_COMPLETION, StudioReviewTaskCompletionController } from "./studio-review-task-completion-controller";

export function useStudioReviewTaskCompletion(request: StudioReviewTaskCompletionRequest, actorId: string) {
  const key = canonicalJson({ request, actorId }), current = useRef<StudioReviewTaskCompletionController | null>(null);
  const [view, setView] = useState({ key, snapshot: EMPTY_COMPLETION });
  const handlers = useStudioStableHandlers({
    owner: () => ({ actorId: getAuthUserId(), generation: getAuthSessionRevision(),
      available: getAuthUserId() === actorId && document.visibilityState !== "hidden" }),
    read: readStudioReviewTaskCompletion, complete: completeStudioReviewTask, now: Date.now, createId: () => crypto.randomUUID(),
  });
  useLayoutEffect(() => {
    const parsed = JSON.parse(key) as { request: StudioReviewTaskCompletionRequest };
    const controller = new StudioReviewTaskCompletionController(parsed.request, handlers); current.current = controller;
    const unsubscribe = controller.subscribe(() => { if (current.current === controller) setView({ key, snapshot: controller.getSnapshot() }); });
    const changed = () => { controller.invalidate(); if (getAuthUserId() === actorId && document.visibilityState !== "hidden") void controller.refresh(); };
    authListeners.add(changed); document.addEventListener("visibilitychange", changed);
    const timer = window.setInterval(() => { controller.checkLease(); const state = controller.getSnapshot();
      if (state.context && state.phase === "ready" && state.expiresAt - Date.now() <= 5_000) void controller.refresh(true);
    }, 250);
    void controller.refresh();
    return () => { authListeners.delete(changed); document.removeEventListener("visibilitychange", changed); window.clearInterval(timer);
      if (current.current === controller) current.current = null; unsubscribe(); controller.dispose(); };
  }, [actorId, handlers, key]);
  const refresh = useCallback(() => { void current.current?.refresh(); }, []);
  const confirm = useCallback((digest: string, criteria: readonly string[]) => { void current.current?.confirm(digest, criteria); }, []);
  return { snapshot: view.key === key ? view.snapshot : EMPTY_COMPLETION, refresh, confirm };
}
