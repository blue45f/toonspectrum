import { useCallback, useEffect, useRef, useState } from "react";

import { resolveStudioOfficePeerApproach } from "./studio-virtual-space-office-navigation";
import { STUDIO_WORLD_PLAYER_RADIUS, studioWorldCanOccupy, studioWorldCanTraverse } from "./studio-virtual-space-world-pathfinding";

import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export type StudioOfficePeerApproachStatus = "idle" | "walking" | "arrived" | "unreachable" | "cancelled";

export interface StudioOfficePeerApproachInput {
  /** Canvas와 같은 사용자 가구 충돌 정보가 포함된 manifest를 사용한다. */
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly scope: string;
  readonly self: StudioVirtualSpacePoint;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly enabled: boolean;
  readonly blockedPeerIds: readonly string[];
  readonly moving?: boolean;
  readonly onMove: (point: StudioVirtualSpacePoint) => void;
  readonly onStop: () => void;
  /** 도착 UI만 연다. 대화 초대와 미디어 권한은 별도 명시 동의를 거친다. */
  readonly onArrive: (sessionId: string) => void;
}

interface ApproachIntent {
  readonly sessionId: string;
  readonly scope: string;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly peerPoint: StudioVirtualSpacePoint;
  readonly destination: StudioVirtualSpacePoint;
}

const foreground = () => typeof document !== "undefined"
  && document.visibilityState !== "hidden" && document.hasFocus();
const online = () => typeof navigator === "undefined" || navigator.onLine !== false;
const distance = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** 동료의 현재 위치까지 걷는 일회성 의도다. 동의 요청이나 자동 음성 연결을 소유하지 않는다. */
export function useStudioOfficePeerApproach(input: StudioOfficePeerApproachInput) {
  const latest = useRef(input);
  latest.current = input;
  const intent = useRef<ApproachIntent | null>(null);
  const timeout = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const foregroundAllowed = useRef(foreground());
  const [snapshot, setSnapshot] = useState<{
    approachingPeerId: string | null;
    peerName: string | null;
    status: StudioOfficePeerApproachStatus;
  }>({ approachingPeerId: null, peerName: null, status: "idle" });

  const finish = useCallback((status: StudioOfficePeerApproachStatus) => {
    if (!intent.current) return;
    intent.current = null;
    if (timeout.current !== null) globalThis.clearTimeout(timeout.current);
    timeout.current = null;
    latest.current.onStop();
    setSnapshot((previous) => ({ ...previous, approachingPeerId: null, status }));
  }, []);
  const cancel = useCallback(() => {
    if (intent.current) finish("cancelled");
    else setSnapshot((previous) => previous.status === "unreachable"
      ? { approachingPeerId: null, peerName: null, status: "idle" } : previous);
  }, [finish]);

  const start = useCallback((sessionId: string): boolean => {
    const current = latest.current;
    const peer = current.peers.find((candidate) => candidate.participant.sessionId === sessionId);
    if (!current.enabled || !foregroundAllowed.current || !foreground() || !online()
      || !peer || peer.state.activity === "focused" || peer.state.activity === "away"
      || current.blockedPeerIds.includes(sessionId)) {
      cancel();
      return false;
    }
    const destination = resolveStudioOfficePeerApproach(current.manifest, current.self, peer.state);
    if (!destination) {
      finish("unreachable");
      setSnapshot({ approachingPeerId: null, peerName: peer.participant.displayName, status: "unreachable" });
      return false;
    }
    // 새 의도가 이전 이동 경로를 대체하기 전에 이전 소유권을 먼저 해제한다.
    if (intent.current) finish("cancelled");
    intent.current = { sessionId, scope: current.scope, manifest: current.manifest,
      peerPoint: { x: peer.state.x, y: peer.state.y }, destination };
    // 같은 동료를 다시 선택해도 새 의도마다 기한을 새로 계산한다.
    timeout.current = globalThis.setTimeout(() => { finish("unreachable"); }, 30_000);
    setSnapshot({ approachingPeerId: sessionId, peerName: peer.participant.displayName, status: "walking" });
    current.onMove(destination);
    return true;
  }, [cancel, finish]);

  useEffect(() => {
    const blur = () => { foregroundAllowed.current = false; cancel(); };
    const focus = () => { foregroundAllowed.current = foreground(); };
    const visibility = () => { if (foreground()) focus(); else blur(); };
    const offline = () => { cancel(); };
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
      if (timeout.current !== null) globalThis.clearTimeout(timeout.current);
      timeout.current = null;
      if (intent.current) { intent.current = null; latest.current.onStop(); }
    };
  }, [cancel]);

  useEffect(() => {
    const pending = intent.current;
    if (!pending) return;
    const peer = input.peers.find((candidate) => candidate.participant.sessionId === pending.sessionId);
    if (!input.enabled || input.scope !== pending.scope || !foregroundAllowed.current || !foreground() || !online()
      || !peer || peer.state.activity === "focused" || peer.state.activity === "away"
      || input.blockedPeerIds.includes(pending.sessionId)) { cancel(); return; }
    if (![input.self.x, input.self.y, peer.state.x, peer.state.y].every(Number.isFinite)) {
      finish("unreachable"); return;
    }
    const gap = distance(input.self, peer.state);
    if (gap >= STUDIO_WORLD_PLAYER_RADIUS * 2 + 8 && gap <= 120
      && studioWorldCanOccupy(input.manifest, input.self)
      && studioWorldCanOccupy(input.manifest, peer.state)
      && studioWorldCanTraverse(input.manifest, input.self, peer.state)) {
      finish("arrived");
      input.onArrive(pending.sessionId);
      return;
    }
    const peerMoved = distance(peer.state, pending.peerPoint) >= 32;
    const stoppedAtDestination = input.moving === false && distance(input.self, pending.destination) <= 12;
    if (input.manifest !== pending.manifest || peerMoved || stoppedAtDestination) {
      const destination = resolveStudioOfficePeerApproach(input.manifest, input.self, peer.state);
      if (!destination) { finish("unreachable"); return; }
      intent.current = { ...pending, manifest: input.manifest,
        peerPoint: { x: peer.state.x, y: peer.state.y }, destination };
      input.onMove(destination);
    }
  }, [input, snapshot.approachingPeerId, cancel, finish]);

  return { ...snapshot, start, cancel };
}
