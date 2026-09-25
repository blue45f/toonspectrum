import { canonicalJson } from "@toonspectrum/studio-project-model";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as authListeners } from "@/domains/auth/public/session/auth-session-state";

import { resolveStudioReviewComment } from "../project-graph/studio-project-graph-client";
import { useStudioStableHandlers } from "../studio-stable-handlers";
import { readStudioReviewResolutionAuthority } from "./studio-review-resolution-authority";
import { EMPTY_STUDIO_REVIEW_RESOLUTION, StudioReviewResolutionController } from "./studio-review-resolution-controller";
import { parseStudioReviewResolutionRequest, type StudioReviewResolutionRequest } from "./studio-review-resolution-route";

export function useStudioReviewResolution(request: StudioReviewResolutionRequest, actorId: string) {
  const requestKey = canonicalJson(request), key = canonicalJson({ request, actorId });
  const owner = useRef<StudioReviewResolutionController | null>(null);
  const [view, setView] = useState({ key, snapshot: EMPTY_STUDIO_REVIEW_RESOLUTION });
  const handlers = useStudioStableHandlers({ getContext: () => ({ actorId: getAuthUserId(), generation: getAuthSessionRevision(),
    available: getAuthUserId() === actorId && document.visibilityState !== "hidden" }),
  read: readStudioReviewResolutionAuthority, resolve: resolveStudioReviewComment, now: Date.now });
  useLayoutEffect(() => {
    const parsed = parseStudioReviewResolutionRequest(JSON.parse(requestKey)); if (!parsed) return;
    const controller = new StudioReviewResolutionController(parsed, handlers); owner.current = controller;
    const unsubscribe = controller.subscribe(() => { if (owner.current === controller) setView({ key, snapshot: controller.getSnapshot() }); });
    const invalidate = () => controller.invalidate(), visibility = () => { if (document.visibilityState === "hidden") invalidate(); };
    authListeners.add(invalidate); document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      controller.checkLease(); const current = controller.getSnapshot();
      if (["ready", "resolved"].includes(current.phase) && current.authority && current.authority.expiresAt - Date.now() <= 5_000) void controller.check(true);
    }, 250);
    return () => { authListeners.delete(invalidate); document.removeEventListener("visibilitychange", visibility); window.clearInterval(timer);
      if (owner.current === controller) owner.current = null; unsubscribe(); controller.dispose(); };
  }, [handlers, key, requestKey]);
  const check = useCallback(() => { void owner.current?.check(); }, []);
  const resolve = useCallback((confirmed: boolean) => { void owner.current?.resolve(confirmed); }, []);
  const invalidate = useCallback(() => owner.current?.invalidate(), []);
  return { snapshot: view.key === key ? view.snapshot : EMPTY_STUDIO_REVIEW_RESOLUTION, check, resolve, invalidate };
}
