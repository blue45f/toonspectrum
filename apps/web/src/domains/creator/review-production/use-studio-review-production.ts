import { canonicalJson } from "@toonspectrum/studio-project-model";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners as authListeners } from "@/domains/auth/public/session/auth-session-state";

import { saveStudioServerProductionWorkspace } from "../studio-production/studio-production-server-client";
import { useStudioStableHandlers } from "../studio-stable-handlers";

import { readStudioReviewProductionAuthority } from "./studio-review-production-authority";
import { EMPTY_STUDIO_REVIEW_PRODUCTION, StudioReviewProductionController } from "./studio-review-production-controller";
import { parseStudioReviewProductionRequest, type StudioReviewProductionChoice, type StudioReviewProductionRequest } from "./studio-review-production-model";

export function useStudioReviewProduction(request: StudioReviewProductionRequest, actorId: string) {
  const requestKey = canonicalJson(request), key = canonicalJson({ request, actorId }), current = useRef<StudioReviewProductionController | null>(null);
  const [view, setView] = useState({ key, snapshot: EMPTY_STUDIO_REVIEW_PRODUCTION });
  const handlers = useStudioStableHandlers({
    getContext: () => ({ actorId: getAuthUserId(), workId: request.subject.workId,
      generation: getAuthSessionRevision(), available: getAuthUserId() === actorId && document.visibilityState !== "hidden" }),
    read: readStudioReviewProductionAuthority, save: saveStudioServerProductionWorkspace, now: Date.now,
  });
  useLayoutEffect(() => {
    const parsed = parseStudioReviewProductionRequest(JSON.parse(requestKey));
    if (!parsed) return;
    const controller = new StudioReviewProductionController(parsed, handlers); current.current = controller;
    const unsubscribe = controller.subscribe(() => {
      if (current.current === controller) setView({ key, snapshot: controller.getSnapshot() });
    });
    const session = () => {
      controller.invalidate();
      if (getAuthUserId() === actorId && document.visibilityState !== "hidden") void controller.refresh();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") controller.invalidate();
      else if (getAuthUserId() === actorId) void controller.refresh();
    };
    authListeners.add(session); document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      controller.checkLease();
      const snapshot = controller.getSnapshot();
      if (snapshot.phase === "ready" && snapshot.authority && snapshot.authority.expiresAt - Date.now() <= 5_000) void controller.refresh(true);
    }, 250);
    void controller.refresh();
    return () => {
      authListeners.delete(session); document.removeEventListener("visibilitychange", visibility); window.clearInterval(timer);
      if (current.current === controller) current.current = null;
      unsubscribe(); controller.dispose();
    };
  }, [actorId, handlers, key, requestKey]);
  const refresh = useCallback(() => { void current.current?.refresh(); }, []);
  const connect = useCallback((choice: StudioReviewProductionChoice) => { void current.current?.connect(choice); }, []);
  return { snapshot: view.key === key ? view.snapshot : EMPTY_STUDIO_REVIEW_PRODUCTION, refresh, connect };
}
