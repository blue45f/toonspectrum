import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { closeStudioP2pHuddle, STUDIO_P2P_HUDDLE_CLOSED_EVENT, type StudioP2pHuddleClosedDetail } from "../live/huddle/studio-p2p-huddle-events";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { StudioVirtualConversationController, type StudioConversationScope, type StudioConversationSnapshot } from "./studio-virtual-space-conversation";

const EMPTY: StudioConversationSnapshot = { available: false, readyPeers: [], records: [], active: null };
const NO_BLOCKED_PEERS: readonly string[] = [];
const foreground = () => typeof document !== "undefined" && document.visibilityState !== "hidden" && document.hasFocus();

export function useStudioVirtualSpaceConversation({ participant, port, manifest, enabled, blockedPeerIds = NO_BLOCKED_PEERS, onReady, onClosed }: {
  readonly participant: StudioLiveParticipant | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly enabled: boolean;
  readonly blockedPeerIds?: readonly string[];
  readonly onReady: (scope: StudioConversationScope) => void;
  readonly onClosed?: (scope: StudioConversationScope) => void;
}) {
  const controller = useRef<StudioVirtualConversationController | null>(null);
  const ready = useRef(onReady), closed = useRef(onClosed), blocked = useRef(blockedPeerIds);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [isForeground, setForeground] = useState(foreground);
  const foregroundRef = useRef(isForeground);
  useEffect(() => { ready.current = onReady; closed.current = onClosed; }, [onReady, onClosed]);
  useEffect(() => { blocked.current = blockedPeerIds; controller.current?.setBlockedPeers(blockedPeerIds); }, [blockedPeerIds]);
  useEffect(() => {
    const focus = () => { foregroundRef.current = foreground(); setForeground(foregroundRef.current); };
    const blur = () => {
      foregroundRef.current = false; setForeground(false);
      // Cancels only proposals. A browser permission bubble does not withdraw a completed call.
      for (const record of controller.current?.snapshot().records ?? []) {
        if (record.status === "offered" || record.status === "waiting") controller.current?.leave(record.id);
      }
    };
    const visibility = () => { if (!foreground()) blur(); else focus(); };
    const huddleClosed = (event: Event) => {
      const id = (event as CustomEvent<StudioP2pHuddleClosedDetail>).detail?.conversationId;
      if (typeof id === "string") controller.current?.leave(id);
    };
    window.addEventListener("focus", focus); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, huddleClosed);
    return () => {
      window.removeEventListener("focus", focus); window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, huddleClosed);
    };
  }, []);
  useEffect(() => {
    setSnapshot(EMPTY);
    if (!enabled || !participant || !port || typeof globalThis.crypto?.subtle?.digest !== "function") return;
    let disposed = false;
    let owner: StudioVirtualConversationController | undefined;
    let unsubscribe: (() => void) | undefined;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest))).then((digest) => {
      if (disposed) return;
      const contentRevision = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      owner = new StudioVirtualConversationController(participant, port, { worldId: manifest.id, contentRevision }, {
        onReady: (scope) => { if (!disposed && foregroundRef.current) ready.current(scope); },
        onClosed: (scope) => { closeStudioP2pHuddle({ conversationId: scope.id }); closed.current?.(scope); },
      });
      controller.current = owner; owner.setBlockedPeers(blocked.current);
      const refresh = () => { if (owner && !disposed) setSnapshot(owner.snapshot()); };
      unsubscribe = owner.subscribe(refresh); owner.start(); refresh();
    }).catch(() => { if (!disposed) setSnapshot(EMPTY); });
    return () => {
      disposed = true; unsubscribe?.(); owner?.close();
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, participant, port, manifest]);
  const propose = useCallback((memberIds: readonly string[]) => foregroundRef.current ? controller.current?.propose(memberIds) ?? null : null, []);
  const respond = useCallback((id: string, answer: "accept" | "decline") => answer === "decline" || foregroundRef.current ? controller.current?.respond(id, answer) ?? false : false, []);
  const leave = useCallback((id: string) => controller.current?.leave(id) ?? false, []);
  return { snapshot: { ...snapshot, available: snapshot.available && isForeground }, propose, respond, leave };
}
