import { useCallback, useEffect, useState, type RefObject } from "react";

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  DEFAULT_STUDIO_FOLLOW_CONFIG,
  type StudioFollowConfig,
} from "./studio-virtual-space-follow";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";

/** 따라가기 상태. 설정은 엔진 브리지에 동기화하고, 칩에서 토글한다. */
export function useStudioPeerFollow(input: {
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly peersRef: RefObject<readonly StudioVirtualSpacePeer[]>;
  readonly cancelSlotsRef: RefObject<() => Promise<void>>;
}) {
  const { engineBridge, peersRef, cancelSlotsRef } = input;
  const [followingPeerId, setFollowingPeerId] = useState<string | null>(null);
  // T8 따라가기 설정 (도슨트·벽 통과). 브리지가 소유하고 칩에서 토글한다.
  const [followConfig, setFollowConfig] = useState<StudioFollowConfig>(DEFAULT_STUDIO_FOLLOW_CONFIG);

  const setFollowingPeer = useCallback((sessionId: string | null) => {
    engineBridge.setFollowingPeer(sessionId);
    setFollowingPeerId(sessionId);
  }, [engineBridge]);

  const updateFollowConfig = useCallback((patch: Partial<StudioFollowConfig>) => {
    setFollowConfig((current) => ({ ...current, ...patch }));
  }, []);

  // 따라가기 설정을 엔진 브리지(외부 시스템)에 동기화한다.
  useEffect(() => {
    engineBridge.setFollowConfig(followConfig);
  }, [engineBridge, followConfig]);

  const startFollowingPeer = useCallback((sessionId: string) => {
    const peer = peersRef.current.find((candidate) => candidate.participant.sessionId === sessionId);
    if (!peer) return;
    void cancelSlotsRef.current();
    setFollowingPeer(sessionId);
  }, [peersRef, cancelSlotsRef, setFollowingPeer]);

  return { followingPeerId, setFollowingPeerId, followConfig, setFollowingPeer, updateFollowConfig, startFollowingPeer };
}
