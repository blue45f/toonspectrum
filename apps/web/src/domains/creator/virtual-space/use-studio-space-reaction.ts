import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
  type StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";

/**
 * 이모트 리액션 송신. 컨트롤러가 있으면 presence로 보내고, 없으면 로컬
 * 스냅샷에만 띄운 뒤 TTL이 지나면 지운다.
 */
export function useStudioSpaceReaction(input: {
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly controllerRef: RefObject<StudioVirtualSpacePresenceController | null>;
  readonly setSnapshot: Dispatch<SetStateAction<StudioVirtualSpaceSnapshot>>;
  readonly markCoach: (key: "emoted") => void;
}) {
  const { engineBridge, controllerRef, setSnapshot, markCoach } = input;
  const localReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLocalReactionTimer = useCallback(() => {
    if (localReactionTimerRef.current === null) return;
    globalThis.clearTimeout(localReactionTimerRef.current);
    localReactionTimerRef.current = null;
  }, []);
  useEffect(() => () => clearLocalReactionTimer(), [clearLocalReactionTimer]);

  const sendReaction = useCallback((reaction: StudioSpaceEmoteId) => {
    engineBridge.requestEmote(reaction);
    markCoach("emoted");
    const controller = controllerRef.current;
    if (controller) {
      clearLocalReactionTimer();
      controller.sendReaction(reaction);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, selfReaction: reaction }));
    if (localReactionTimerRef.current !== null) globalThis.clearTimeout(localReactionTimerRef.current);
    localReactionTimerRef.current = globalThis.setTimeout(() => {
      localReactionTimerRef.current = null;
      if (!controllerRef.current) setSnapshot((current) => ({ ...current, selfReaction: null }));
    }, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
  }, [clearLocalReactionTimer, controllerRef, engineBridge, markCoach, setSnapshot]);
  const emote = useCallback((reaction: StudioSpaceEmoteId) => {
    sendReaction(reaction);
    engineBridge.focusWorld();
  }, [engineBridge, sendReaction]);

  return { clearLocalReactionTimer, sendReaction, emote };
}
