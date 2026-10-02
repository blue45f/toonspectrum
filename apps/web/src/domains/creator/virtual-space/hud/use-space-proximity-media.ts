import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import { StudioP2pHuddleController, type HuddleSnapshot } from "../../live/huddle/studio-p2p-huddle-controller";
import { createSpaceChannelPort, sameSpaceProximityScope } from "./space-proximity-media";

export type SpaceProximityMediaPhase =
  /** 사용자가 아직 켜지 않음(동의 전). */
  | "off"
  /** 켰지만 지금은 연결할 수 없음(연결 확인 중·게스트·개인 공간 등). */
  | "waiting"
  /** 근처 팀원을 자동으로 연결하는 중. */
  | "live";

export interface SpaceProximityMediaInput {
  readonly participant: StudioLiveParticipant | null | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  /** 팀 공간·서버 연결·월드 준비 등 기능을 쓸 수 있는 조건. */
  readonly available: boolean;
  /** 지금 연결할 팀원(가까운 순). spaceProximityMediaScope 결과. */
  readonly scopeIds: readonly string[];
}

/**
 * 가까이 가면 영상: 사용자가 한 번 켜면(카메라·마이크 권한은 버튼을 누를 때만 요청)
 * 근처 팀원과 자동으로 연결하고 멀어지면 자동으로 끊는다.
 * Huddle 컨트롤러(무료 STUN·P2P)를 전용 채널로 감싸 대화방과 신호가 섞이지 않게 한다.
 */
export function useSpaceProximityMedia({ participant, port, available, scopeIds }: SpaceProximityMediaInput) {
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<HuddleSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<StudioP2pHuddleController | null>(null);
  const scopeRef = useRef<ReadonlySet<string>>(new Set(scopeIds));
  const appliedScope = useRef<readonly string[]>([]);
  /** 사용자가 켜 둔 장치. 장소를 옮겨 연결을 다시 만들 때 같은 장치를 다시 켠다(권한은 이미 허락한 상태). */
  const wanted = useRef<{ camera: boolean; mic: boolean }>({ camera: false, mic: false });
  const viewer = participant?.role === "viewer";
  const ready = enabled && available && Boolean(participant && port) && !viewer;

  useEffect(() => {
    if (!ready || !participant || !port) return undefined;
    const controller = new StudioP2pHuddleController(participant, createSpaceChannelPort(port), {
      // 근접 범위 밖 팀원은 상태 신호조차 주고받지 않는다.
      peerFilter: (peer) => scopeRef.current.has(peer.sessionId),
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.snapshot()));
    controller.start();
    controller.setMediaPeerScope([...scopeRef.current]);
    appliedScope.current = [...scopeRef.current];
    setSnapshot(controller.snapshot());
    const capture = wanted.current;
    if (capture.camera || capture.mic) {
      setBusy(true);
      void Promise.all([
        capture.camera ? controller.setVideo("camera") : Promise.resolve(),
        capture.mic ? controller.setMicrophone(true) : Promise.resolve(),
      ]).finally(() => { if (controllerRef.current === controller) setBusy(false); });
    }
    return () => {
      unsubscribe();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
      setSnapshot(null);
    };
  }, [participant, port, ready]);

  useEffect(() => {
    scopeRef.current = new Set(scopeIds);
    const controller = controllerRef.current;
    if (!controller || sameSpaceProximityScope(appliedScope.current, scopeIds)) return;
    appliedScope.current = [...scopeIds];
    controller.setMediaPeerScope(scopeIds);
    controller.refreshPeers();
  }, [scopeIds]);

  /** 동의 버튼: 근접 영상을 켜고 고른 장치를 그 자리에서 요청한다. */
  const start = useCallback((capture: { readonly camera: boolean; readonly mic: boolean }) => {
    wanted.current = { camera: capture.camera, mic: capture.mic };
    const controller = controllerRef.current;
    if (controller) {
      setBusy(true);
      void Promise.all([
        capture.camera ? controller.setVideo("camera") : Promise.resolve(),
        capture.mic ? controller.setMicrophone(true) : Promise.resolve(),
      ]).finally(() => { if (controllerRef.current === controller) setBusy(false); });
    }
    setEnabled(true);
  }, []);
  const stop = useCallback(() => { wanted.current = { camera: false, mic: false }; setEnabled(false); }, []);
  const run = useCallback((action: (controller: StudioP2pHuddleController) => Promise<void>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setBusy(true);
    void action(controller).finally(() => { if (controllerRef.current === controller) setBusy(false); });
  }, []);
  const toggleCamera = useCallback(() => run((controller) => {
    const next = !controller.snapshot().camera;
    wanted.current.camera = next;
    return controller.setVideo(next ? "camera" : null);
  }), [run]);
  const toggleMic = useCallback(() => run((controller) => {
    const next = controller.snapshot().muted;
    wanted.current.mic = next;
    return controller.setMicrophone(next);
  }), [run]);
  const toggleScreen = useCallback(() => run((controller) => controller.setVideo(controller.snapshot().sharing ? null : "screen")), [run]);
  const phase: SpaceProximityMediaPhase = !enabled ? "off" : ready && snapshot ? "live" : "waiting";
  return { phase, enabled, snapshot, busy, viewer, start, stop, toggleCamera, toggleMic, toggleScreen };
}
