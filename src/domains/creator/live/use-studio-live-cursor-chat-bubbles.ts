import { useEffect, useState } from "react";

import type {
  StudioLiveCursorChatMessage,
  StudioLiveRoom,
} from "./studio-live-collaboration-room";

export function useStudioLiveCursorChatBubbles(
  room: StudioLiveRoom | null
): readonly StudioLiveCursorChatMessage[] {
  const [messages, setMessages] = useState<StudioLiveCursorChatMessage[]>([]);

  useEffect(() => {
    setMessages([]);
    if (!room) return;
    const timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

    const removeMessage = (messageId: string) => {
      const timer = timers.get(messageId);
      if (timer !== undefined) globalThis.clearTimeout(timer);
      timers.delete(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    };

    const unsubscribe = room.subscribe((event) => {
      if (event.type === "cursor-chat") {
        const message = event.message;
        const previousTimer = timers.get(message.id);
        if (previousTimer !== undefined) globalThis.clearTimeout(previousTimer);
        setMessages((current) => [
          ...current.filter(
            (candidate) =>
              candidate.id !== message.id &&
              candidate.participant.sessionId !== message.participant.sessionId
          ),
          message,
        ]);
        timers.set(
          message.id,
          globalThis.setTimeout(
            () => removeMessage(message.id),
            Math.max(0, message.expiresAt - Date.now())
          )
        );
        return;
      }
      if (event.type === "presence") {
        const activeSessions = new Set(event.peers.map((peer) => peer.sessionId));
        setMessages((current) => {
          const next = current.filter((message) => activeSessions.has(message.participant.sessionId));
          for (const message of current) {
            if (!activeSessions.has(message.participant.sessionId)) {
              const timer = timers.get(message.id);
              if (timer !== undefined) globalThis.clearTimeout(timer);
              timers.delete(message.id);
            }
          }
          return next.length === current.length ? current : next;
        });
        return;
      }
      if (
        event.type === "transport-status" &&
        event.status.state !== "ready" &&
        !(event.status.state === "error" && room.ready)
      ) {
        for (const timer of timers.values()) globalThis.clearTimeout(timer);
        timers.clear();
        setMessages([]);
      }
    });

    return () => {
      unsubscribe();
      for (const timer of timers.values()) globalThis.clearTimeout(timer);
      timers.clear();
    };
  }, [room]);

  return messages;
}
