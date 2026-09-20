import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
import type { StudioSpaceSocialAction, StudioSpaceSocialRequest, StudioSpaceSocialSnapshot } from "./StudioVirtualSpaceSocialPanel";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-invitation";
import { StudioVirtualSpaceAcousticPolicy } from "./studio-virtual-space-acoustics";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import { closeStudioP2pHuddle } from "../live/huddle/studio-p2p-huddle-events";

const EMPTY: StudioSpaceSocialSnapshot = { requests: [], readyPeerIds: [], reviewReadyPeerIds: [], blockedPeerIds: [], greetingReadyPeerIds: [], greetings: [], available: false };

export function useStudioVirtualSpaceSocial({ participant, port, manifest, enabled, onAccepted, workId, presence, acousticBindingAvailable = true, publishedScope }: {
  readonly workId?: string;
  readonly participant: StudioLiveParticipant | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly enabled: boolean;
  readonly onAccepted: (request: StudioSpaceSocialRequest) => void;
  readonly presence?: StudioVirtualSpaceSnapshot;
  readonly acousticBindingAvailable?: boolean;
  /** Server publication revision+hash digest, not a peer-issued grant. */
  readonly publishedScope?: string;
}) {
  const controller = useRef<StudioVirtualSpaceSocialController | null>(null);
  const acoustics = useRef<StudioVirtualSpaceAcousticPolicy | null>(null);
  const spatial = useRef({ presence, acousticBindingAvailable });
  useLayoutEffect(() => {
    spatial.current = { presence, acousticBindingAvailable };
    acoustics.current?.update(presence, acousticBindingAvailable);
  }, [presence, acousticBindingAvailable]);
  const blockedPeers = useRef(new Set<string>());
  const accepted = useRef(onAccepted);
  const [snapshot, setSnapshot] = useState<StudioSpaceSocialSnapshot>(EMPTY);
  const [foreground, setForeground] = useState(() => document.visibilityState !== "hidden");
  const foregroundRef = useRef(foreground);
  useEffect(() => { accepted.current = onAccepted; }, [onAccepted]);
  useEffect(() => {
    const update = (active: boolean) => {
      foregroundRef.current = active;
      if (!active) {
        // Browser permission UI or another window must not hang up a consented call.
        // Unfinished consent is cancelled before delayed authority promises can settle.
        controller.current?.cancelPending();
      }
      setForeground(active);
    };
    const blur = () => update(false);
    const focus = () => update(document.visibilityState !== "hidden");
    const visibility = () => update(document.visibilityState !== "hidden" && document.hasFocus());
    globalThis.addEventListener("blur", blur); globalThis.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      globalThis.removeEventListener("blur", blur); globalThis.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    setSnapshot({ ...EMPTY, blockedPeerIds: [...blockedPeers.current] });
    if (!enabled || !participant || !port || !globalThis.crypto?.subtle) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let owner: StudioVirtualSpaceSocialController | undefined;
    let policy: StudioVirtualSpaceAcousticPolicy | undefined;
    // Bind consent to the complete immutable map, including colliders, art and usage points.
    // An authoring preview never participates; stale clients cannot accept a different layout.
    void (publishedScope ? Promise.resolve(publishedScope) : crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest)))
      .then((digest) => [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""))).then((contentRevision) => {
      if (disposed) return;
      policy = new StudioVirtualSpaceAcousticPolicy({ ...manifest, worldId: manifest.id, contentRevision }, participant.sessionId);
      policy.update(spatial.current.presence, spatial.current.acousticBindingAvailable);
      acoustics.current = policy;
      owner = new StudioVirtualSpaceSocialController(participant, port, { worldId: manifest.id, contentRevision }, {
        acoustics: policy,
        onAccepted: (request) => { if (foregroundRef.current) accepted.current(request); },
        onEnded: (request) => { closeStudioP2pHuddle({ conversationId: request.id }); },
        authorizeReview: async (subject, intent) => subject.workId === workId && (await verifyStudioVirtualSpaceReviewSubject(subject, intent)).ok,
      });
      controller.current = owner;
      for (const id of blockedPeers.current) owner.setPeerBlocked(id, true);
      const refresh = () => { if (owner && !disposed) setSnapshot(owner.snapshot()); };
      unsubscribe = owner.subscribe(refresh);
      owner.start();
      refresh();
    }).catch(() => { if (!disposed) setSnapshot({ ...EMPTY, blockedPeerIds: [...blockedPeers.current] }); });
    return () => {
      disposed = true;
      unsubscribe?.();
      owner?.close();
      if (controller.current === owner) controller.current = null;
      if (acoustics.current === policy) acoustics.current = null;
    };
  }, [enabled, manifest, participant, port, workId, publishedScope]);
  const request = useCallback((id: string, action: StudioSpaceSocialAction) => foregroundRef.current ? controller.current?.request(id, action) ?? null : null, []);
  const respond = useCallback((id: string, response: "accept" | "decline") => response === "decline" || foregroundRef.current ? controller.current?.respond(id, response) ?? false : false, []);
  const cancel = useCallback((id: string) => controller.current?.cancel(id) ?? false, []);
  const requestReview = useCallback((id: string, subject: StudioVirtualSpaceReviewSubject, signal?: AbortSignal) => foregroundRef.current ? controller.current?.requestReview(id, subject, signal) ?? Promise.resolve(null) : Promise.resolve(null), []);
  const respondReview = useCallback((id: string, response: "accept" | "decline") => response === "decline" || foregroundRef.current ? controller.current?.respondReview(id, response) ?? Promise.resolve(false) : Promise.resolve(false), []);
  const setPeerBlocked = useCallback((id: string, blocked: boolean) => {
    if (!id || id.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id)
      || (blocked && blockedPeers.current.size >= 128 && !blockedPeers.current.has(id))) return;
    if (blocked) blockedPeers.current.add(id); else blockedPeers.current.delete(id);
    controller.current?.setPeerBlocked(id, blocked);
    if (!controller.current) setSnapshot((current) => ({ ...current, blockedPeerIds: [...blockedPeers.current] }));
  }, []);
  const wave = useCallback((id: string) => foregroundRef.current ? controller.current?.wave(id) ?? false : false, []);
  return { snapshot, interactive: foreground && snapshot.available, request, respond, cancel, requestReview, respondReview, setPeerBlocked, wave };
}
