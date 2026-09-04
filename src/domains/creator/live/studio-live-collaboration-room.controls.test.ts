import { describe, expect, it } from "vitest";

import { StudioLiveRoom } from "./studio-live-collaboration-room";
import {
  StudioMemoryBroadcastHub,
  createStudioMemoryLiveTransportFactory,
} from "./studio-live-collaboration-transport";

import type {
  StudioLiveAttentionRequest,
  StudioLiveCursorChatMessage,
  StudioLiveRoomEvent,
} from "./studio-live-collaboration-room";
import type { StudioTeamRole } from "../studio-team-client";

function createRoom(
  hub: StudioMemoryBroadcastHub,
  name: string,
  role: StudioTeamRole,
  idSeed: { value: number }
): StudioLiveRoom {
  return new StudioLiveRoom({
    workId: "work-controls",
    participant: {
      sessionId: `session-${name}`,
      displayName: name,
      role,
    },
    initialPageId: "page-1",
    dependencies: {
      transportFactory: createStudioMemoryLiveTransportFactory(hub),
      randomId: () => `control-${name}-${++idSeed.value}`,
      cursorIntervalMs: 40,
    },
  });
}

describe("StudioLiveRoom collaboration controls", () => {
  it("delivers cursor chat and attention outside the persistent session chat list", async () => {
    const hub = new StudioMemoryBroadcastHub();
    const idSeed = { value: 0 };
    const author = createRoom(hub, "author", "owner", idSeed);
    const viewer = createRoom(hub, "reviewer", "commenter", idSeed);
    const events: StudioLiveRoomEvent[] = [];
    const unsubscribe = viewer.subscribe((event) => events.push(event));

    try {
      await author.start();
      await viewer.start();
      author.updatePresence({ pageId: "page-2", tool: "brush" });

      expect(author.sendCursorChat("눈 방향을 여기로 맞춰 주세요")).toBe(true);
      expect(author.requestAttention()).toBe(true);

      const cursorChat = events.find(
        (event): event is Extract<StudioLiveRoomEvent, { type: "cursor-chat" }> =>
          event.type === "cursor-chat"
      )?.message as StudioLiveCursorChatMessage | undefined;
      const attention = events.find(
        (event): event is Extract<StudioLiveRoomEvent, { type: "attention" }> =>
          event.type === "attention"
      )?.request as StudioLiveAttentionRequest | undefined;

      expect(cursorChat).toMatchObject({
        participant: { sessionId: "session-author", role: "owner" },
        text: "눈 방향을 여기로 맞춰 주세요",
      });
      expect(cursorChat?.expiresAt).toBeGreaterThan(cursorChat?.sentAt ?? 0);
      expect(attention).toMatchObject({
        participant: { sessionId: "session-author", role: "owner" },
        pageId: "page-2",
      });
      expect(attention?.expiresAt).toBeGreaterThan(attention?.sentAt ?? 0);
      expect(viewer.getChatMessages()).toEqual([]);
      expect(author.getChatMessages()).toEqual([]);
    } finally {
      unsubscribe();
      author.close();
      viewer.close();
    }
  });

  it("keeps control permissions fail-closed and accepts runtime cadence changes", async () => {
    const hub = new StudioMemoryBroadcastHub();
    const idSeed = { value: 0 };
    const viewer = createRoom(hub, "viewer", "viewer", idSeed);
    const commenter = createRoom(hub, "commenter", "commenter", idSeed);

    try {
      await viewer.start();
      await commenter.start();

      expect(viewer.sendCursorChat("보내면 안 됨")).toBe(false);
      expect(viewer.requestAttention()).toBe(false);
      expect(commenter.sendCursorChat("검토 의견")).toBe(true);
      expect(commenter.requestAttention()).toBe(false);
      expect(commenter.setCursorIntervalMs(1)).toBe(16);
      expect(commenter.getCursorIntervalMs()).toBe(16);
      expect(commenter.setCursorIntervalMs(10_000)).toBe(1_000);
    } finally {
      viewer.close();
      commenter.close();
    }
  });
});
