import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as authListeners } from "@/domains/auth/public/session/auth-session-state";
import { useStudioStableHandlers } from "../../studio-stable-handlers";
import { prepareStudioWorldAssets } from "./studio-world-publication-assets";
import { publishStudioWorld, readStudioWorldPublicationAuthority } from "./studio-world-publication-client";
import { EMPTY_WORLD_PUBLICATION, StudioWorldPublicationController } from "./studio-world-publication-controller";

export function useStudioWorldPublication(workId: string, actorId: string | null, enabled: boolean) {
  const key = JSON.stringify([workId, actorId, enabled]);
  const owner = useRef<StudioWorldPublicationController | null>(null);
  const [view, setView] = useState({ key, snapshot: EMPTY_WORLD_PUBLICATION });
  const deps = useStudioStableHandlers({ context: () => ({ actorId: getAuthUserId(), generation: getAuthSessionRevision(),
    available: enabled && getAuthUserId() === actorId && document.visibilityState !== "hidden" }),
  read: readStudioWorldPublicationAuthority, publish: publishStudioWorld, prepare: prepareStudioWorldAssets,
  now: Date.now, id: () => crypto.randomUUID() });
  useLayoutEffect(() => {
    if (!enabled || !actorId) return;
    const controller = new StudioWorldPublicationController(workId, deps); owner.current = controller;
    const unsubscribe = controller.subscribe(() => { if (owner.current === controller) setView({ key, snapshot: controller.getSnapshot() }); });
    const renew = () => { if (document.visibilityState !== "hidden") void controller.read(false); };
    const session = () => {
      if (getAuthUserId() !== actorId) controller.revoke();
      else { controller.invalidate(); renew(); }
    };
    const visibility = () => { if (document.visibilityState === "hidden") controller.invalidate(); else renew(); };
    authListeners.add(session); document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", renew);
    const timer = window.setInterval(() => { controller.checkLease(); const current = controller.getSnapshot();
      if (document.visibilityState !== "hidden" && current.authority && current.authority.expiresAt - Date.now() <= 5_000) renew(); }, 250);
    void controller.read();
    return () => { authListeners.delete(session); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", renew);
      window.clearInterval(timer); unsubscribe(); if (owner.current === controller) owner.current = null; controller.dispose(); };
  }, [actorId, deps, enabled, key, workId]);
  const refresh = useCallback(async () => { const current = owner.current; const completed = await current?.read();
    return Boolean(completed && owner.current === current && current?.getSnapshot().phase === "ready" && !current.getSnapshot().retryIntent); }, []);
  const publish = useCallback(async (manifest?: unknown, expectedRevision?: string | null) => { const current = owner.current; const completed = await current?.publish(manifest, expectedRevision);
    return Boolean(completed && owner.current === current && current?.getSnapshot().phase === "ready" && !current.getSnapshot().retryIntent); }, []);
  const reviewDraftBase = useCallback(async () => {
    const current = owner.current, observed = current?.getSnapshot().authority;
    if (!current || !observed) return null;
    if (!await current.read(false)) return null;
    const next = current.getSnapshot();
    if (owner.current !== current || next.phase !== "ready" || next.retryIntent || !next.authority?.canPublish
      || next.authority.expiresAt <= Date.now()
      || (next.authority.publication?.revisionId ?? null) !== (observed.publication?.revisionId ?? null)) return null;
    return { revisionId: next.authority.publication?.revisionId ?? null };
  }, []);
  return { snapshot: view.key === key ? view.snapshot : EMPTY_WORLD_PUBLICATION, refresh, publish, reviewDraftBase, enabled };
}
