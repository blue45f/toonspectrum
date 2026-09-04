import { describe, expect, it } from "vitest";

import { selectStudioLivePresentedCursors } from "./studio-live-cursor-presentation";

import type { StudioLiveCollaborationPreferences } from "./studio-live-collaboration-preferences";
import type {
  StudioLivePeer,
  StudioLivePeerCursor,
} from "./studio-live-collaboration-room";

const BASE_PREFERENCES: StudioLiveCollaborationPreferences = {
  cursorVisibility: "all",
  cursorQuality: "smooth",
  showCursorLabels: true,
};

function peer(
  sessionId: string,
  visibility: StudioLivePeer["visibility"] = "active"
): StudioLivePeer {
  return {
    sessionId,
    displayName: sessionId,
    role: "editor",
    visibility,
    pageId: "page-1",
    lastSeenAt: 100,
  };
}

function cursor(
  sessionId: string,
  options: { drawing?: boolean; updatedAt?: number; pageId?: string } = {}
): StudioLivePeerCursor {
  return {
    participant: {
      sessionId,
      displayName: sessionId,
      role: "editor",
    },
    cursor: {
      x: 0.5,
      y: 0.5,
      pageId: options.pageId ?? "page-1",
      tool: "brush",
      drawing: options.drawing ?? false,
    },
    updatedAt: options.updatedAt ?? 100,
  };
}

describe("selectStudioLivePresentedCursors", () => {
  it("keeps the followed collaborator first, then drawing and active peers", () => {
    const selected = selectStudioLivePresentedCursors({
      cursors: [
        cursor("idle", { updatedAt: 400 }),
        cursor("active", { updatedAt: 300 }),
        cursor("drawing", { drawing: true, updatedAt: 200 }),
        cursor("followed", { updatedAt: 100 }),
        cursor("other-page", { pageId: "page-2" }),
      ],
      peers: [
        peer("idle", "idle"),
        peer("active"),
        peer("drawing", "idle"),
        peer("followed", "idle"),
        peer("other-page"),
      ],
      pageId: "page-1",
      followingSessionId: "followed",
      preferences: BASE_PREFERENCES,
      networkHints: {},
    });

    expect(selected.map((entry) => entry.participant.sessionId)).toEqual([
      "followed",
      "drawing",
      "active",
      "idle",
    ]);
  });

  it("honors local visibility modes without losing the followed peer", () => {
    const drawingOnly = selectStudioLivePresentedCursors({
      cursors: [cursor("followed"), cursor("drawing", { drawing: true }), cursor("idle")],
      peers: [peer("followed", "idle"), peer("drawing"), peer("idle", "idle")],
      pageId: "page-1",
      followingSessionId: "followed",
      preferences: { ...BASE_PREFERENCES, cursorVisibility: "drawing" },
      networkHints: {},
    });
    expect(drawingOnly.map((entry) => entry.participant.sessionId)).toEqual([
      "followed",
      "drawing",
    ]);

    expect(
      selectStudioLivePresentedCursors({
        cursors: [cursor("followed")],
        peers: [peer("followed")],
        pageId: "page-1",
        followingSessionId: "followed",
        preferences: { ...BASE_PREFERENCES, cursorVisibility: "hidden" },
        networkHints: {},
      })
    ).toEqual([]);
  });

  it("caps low-bandwidth rendering after applying activity priority", () => {
    const cursors = Array.from({ length: 24 }, (_, index) =>
      cursor(`peer-${index}`, { drawing: index === 23, updatedAt: index })
    );
    const peers = cursors.map((entry) => peer(entry.participant.sessionId));
    const selected = selectStudioLivePresentedCursors({
      cursors,
      peers,
      pageId: "page-1",
      preferences: { ...BASE_PREFERENCES, cursorQuality: "data-saver" },
      networkHints: { saveData: true },
    });

    expect(selected).toHaveLength(12);
    expect(selected[0]?.participant.sessionId).toBe("peer-23");
  });
});
