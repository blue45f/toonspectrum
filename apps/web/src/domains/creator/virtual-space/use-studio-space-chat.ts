import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import {
  sanitizeStudioPresenceBubble,
  STUDIO_PRESENCE_BUBBLE_TTL_MS,
  type StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";
import {
  appendStudioChatMessage,
  maskStudioChatProfanity,
  studioChatBubbleDurationMs,
  type StudioVirtualSpaceChatBubble,
  type StudioVirtualSpaceChatMessage,
  type StudioVirtualSpaceChatScope,
} from "./studio-virtual-space-chat";

/**
 * 말풍선 채팅 상태. 컨트롤러가 있으면 presence로 보내고, 없으면(개인 공간·
 * 연결 대기) 로컬 폴백으로 내 말만 로그와 말풍선에 남긴다 — 리액션의 폴백 패턴과 같다.
 */
export function useStudioSpaceChat(input: {
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly setSnapshot: Dispatch<SetStateAction<StudioVirtualSpaceSnapshot>>;
  readonly controllerRef: RefObject<StudioVirtualSpacePresenceController | null>;
  readonly nickname: string;
}) {
  const { snapshot, setSnapshot, controllerRef, nickname } = input;
  const [chatOpen, setChatOpen] = useState(false);
  // 컨트롤러가 없는(개인 공간·연결 대기) 경우의 로컬 폴백: 내 말만 로그와 말풍선에 남긴다.
  const [localChatMessages, setLocalChatMessages] = useState<readonly StudioVirtualSpaceChatMessage[]>([]);
  const [localSelfChatBubble, setLocalSelfChatBubble] = useState<StudioVirtualSpaceChatBubble | null>(null);
  const localChatBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (localChatBubbleTimerRef.current !== null) globalThis.clearTimeout(localChatBubbleTimerRef.current);
  }, []);
  useEffect(() => () => {
    if (localBubbleTimerRef.current !== null) globalThis.clearTimeout(localBubbleTimerRef.current);
  }, []);
  const chatSnapshot: StudioVirtualSpaceSnapshot = snapshot.direct ? snapshot : {
    ...snapshot,
    chatMessages: localChatMessages,
    chatBubbles: [],
    selfChatBubble: localSelfChatBubble,
    peerTyping: [],
  };
  const chatTypingNames = snapshot.peerTyping
    .map((typing) => snapshot.peers.find((peer) => peer.participant.sessionId === typing.sessionId)?.participant.displayName)
    .filter((name): name is string => Boolean(name));
  const sendSpaceChat = useCallback((scope: StudioVirtualSpaceChatScope, text: string) => {
    const controller = controllerRef.current;
    if (controller) {
      controller.sendChat(scope, text);
      return;
    }
    const sanitized = sanitizeStudioPresenceBubble(text);
    if (!sanitized) return;
    const masked = maskStudioChatProfanity(sanitized);
    const now = Date.now();
    const duration = studioChatBubbleDurationMs(masked);
    setLocalChatMessages((current) => appendStudioChatMessage(current, {
      id: `local:${now}`, sessionId: "self", displayName: nickname, scope, text: masked, at: now, self: true,
    }));
    setLocalSelfChatBubble({ sessionId: "self", text: masked, expiresAt: now + duration });
    if (localChatBubbleTimerRef.current !== null) globalThis.clearTimeout(localChatBubbleTimerRef.current);
    localChatBubbleTimerRef.current = globalThis.setTimeout(() => setLocalSelfChatBubble(null), duration);
  }, [controllerRef, nickname]);
  const sendSpaceChatTyping = useCallback((scope: StudioVirtualSpaceChatScope, typing: boolean) => {
    controllerRef.current?.setChatTyping(scope, typing);
  }, [controllerRef]);
  // 말풍선 채팅: 컨트롤러가 있으면 presence로 보내고, 없으면(개인 공간)
  // 로컬 스냅샷에만 띄운 뒤 TTL이 지나면 지운다 — 리액션의 폴백 패턴과 같다.
  const sendChatMessage = useCallback((text: string) => {
    const controller = controllerRef.current;
    if (controller) {
      controller.setBubbleText(text);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, self: Object.freeze({ ...current.self, bubble: text }) }));
    if (localBubbleTimerRef.current !== null) globalThis.clearTimeout(localBubbleTimerRef.current);
    localBubbleTimerRef.current = globalThis.setTimeout(() => {
      localBubbleTimerRef.current = null;
      if (!controllerRef.current) {
        setSnapshot((current) => ({ ...current, self: Object.freeze({ ...current.self, bubble: undefined }) }));
      }
    }, STUDIO_PRESENCE_BUBBLE_TTL_MS);
  }, [controllerRef, setSnapshot]);
  const setChatTyping = useCallback((typing: boolean) => {
    // 말풍선 입력의 타이핑 신호는 W-1 채팅 패킷 설계(setChatTyping, 근처 범위)를 그대로 쓴다.
    controllerRef.current?.setChatTyping("nearby", typing);
  }, [controllerRef]);

  return {
    chatOpen,
    setChatOpen,
    chatSnapshot,
    chatTypingNames,
    sendSpaceChat,
    sendSpaceChatTyping,
    sendChatMessage,
    setChatTyping,
  };
}
