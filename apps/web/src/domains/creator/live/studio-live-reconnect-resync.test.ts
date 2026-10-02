import { describe, expect, it, vi } from "vitest";

import {
  StudioCrdtDocument,
  type StudioCrdtDrawStrokePayload,
} from "./studio-crdt-document";
import { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";
import { StudioLiveRoom } from "./studio-live-collaboration-room";
import {
  createStudioMemoryLiveTransportFactory,
  StudioMemoryBroadcastHub,
} from "./studio-live-collaboration-transport";

import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";

/**
 * End-to-end two-client story over production pieces only: two real rooms, two real CRDT
 * documents, two real bindings, and the in-process BroadcastChannel transport stack.
 * Unit suites cover each layer in isolation; this file pins the composed behavior a user
 * actually experiences — join, draw together, drop, reconnect, converge again.
 */

const alice: StudioLiveParticipant = {
  sessionId: "session-alice",
  displayName: "앨리스",
  role: "owner",
};
const bob: StudioLiveParticipant = {
  sessionId: "session-bob",
  displayName: "밥",
  role: "editor",
};
const vera: StudioLiveParticipant = {
  sessionId: "session-vera",
  displayName: "베라",
  role: "viewer",
};

function payload(x: number): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [x, x, x + 1, x + 1],
    pressures: [0.4, 0.8],
    stroke: "#123456",
    strokeWidth: 6,
  };
}

function addStroke(document: StudioCrdtDocument, id: string, x: number): void {
  document.addStroke({
    id,
    pageId: "page-1",
    layerId: "page-root",
    payload: payload(x),
  });
}

function strokeIds(document: StudioCrdtDocument): string[] {
  return document.getStrokes().map((stroke) => stroke.id).sort();
}

interface LiveClient {
  room: StudioLiveRoom;
  binding: StudioCrdtRoomBinding;
}

function createClient(
  hub: StudioMemoryBroadcastHub,
  participant: StudioLiveParticipant,
  document: StudioCrdtDocument,
  options: { canEdit?: boolean } = {}
): LiveClient {
  const room = new StudioLiveRoom({
    workId: "work-reconnect-story",
    participant,
    dependencies: {
      transportFactory: createStudioMemoryLiveTransportFactory(hub, {
        syncTimeoutMs: 1_000,
      }),
      heartbeatMs: 50,
      presenceTtlMs: 400,
      cursorIntervalMs: 20,
    },
  });
  const binding = new StudioCrdtRoomBinding({
    document,
    room,
    canEdit: options.canEdit ?? true,
  });
  return { room, binding };
}

async function startClient(client: LiveClient): Promise<void> {
  await client.room.start();
  await client.binding.start();
}

function stopClient(client: LiveClient): void {
  client.binding.close();
  client.room.close();
}

describe("two-client live session story", () => {
  it("reconverges presence and documents after one client drops and reconnects", async () => {
    const hub = new StudioMemoryBroadcastHub();
    const documentA = new StudioCrdtDocument();
    const documentB = new StudioCrdtDocument();
    const a = createClient(hub, alice, documentA);
    let b = createClient(hub, bob, documentB);
    await startClient(a);
    await startClient(b);

    // Both sides see each other.
    await vi.waitFor(() => {
      expect(a.room.getPeers().some((peer) => peer.sessionId === bob.sessionId)).toBe(true);
      expect(b.room.getPeers().some((peer) => peer.sessionId === alice.sessionId)).toBe(true);
    }, { timeout: 5_000, interval: 50 });

    // A committed stroke reaches B while both are connected.
    addStroke(documentA, "stroke-live-1", 10);
    await vi.waitFor(() => {
      expect(strokeIds(documentB)).toContain("stroke-live-1");
    }, { timeout: 5_000, interval: 50 });

    // B drops (tab closed / network lost). Its room and binding go away entirely.
    stopClient(b);

    // While B is away A keeps drawing; B keeps editing its local document offline.
    addStroke(documentA, "stroke-while-b-away", 20);
    addStroke(documentB, "stroke-b-offline", 30);
    expect(strokeIds(documentB)).not.toContain("stroke-while-b-away");
    expect(strokeIds(documentA)).not.toContain("stroke-b-offline");

    // B reconnects with the same identity and the same local document.
    b = createClient(hub, bob, documentB);
    await startClient(b);

    // The missed frontier is repaired in both directions.
    const expected = ["stroke-b-offline", "stroke-live-1", "stroke-while-b-away"];
    await vi.waitFor(() => {
      expect(strokeIds(documentB)).toEqual(expected);
      expect(strokeIds(documentA)).toEqual(expected);
    }, { timeout: 8_000, interval: 50 });

    // Presence flows again after the reconnect: A observes B's new page.
    b.room.updatePresence({ pageId: "page-9" });
    await vi.waitFor(() => {
      expect(
        a.room.getPeers().some(
          (peer) => peer.sessionId === bob.sessionId && peer.pageId === "page-9"
        )
      ).toBe(true);
    }, { timeout: 5_000, interval: 50 });

    stopClient(a);
    stopClient(b);
    documentA.destroy();
    documentB.destroy();
  }, 30_000);

  it("keeps a viewer client read-only while it still receives everyone else's strokes", async () => {
    const hub = new StudioMemoryBroadcastHub();
    const documentA = new StudioCrdtDocument();
    const documentV = new StudioCrdtDocument();
    const a = createClient(hub, alice, documentA);
    const v = createClient(hub, vera, documentV, { canEdit: false });
    await startClient(a);
    await startClient(v);

    addStroke(documentA, "stroke-from-editor", 10);
    await vi.waitFor(() => {
      expect(strokeIds(documentV)).toContain("stroke-from-editor");
    }, { timeout: 5_000, interval: 50 });

    // A viewer's local marks must never leak into the shared document.
    addStroke(documentV, "stroke-from-viewer", 20);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(strokeIds(documentA)).not.toContain("stroke-from-viewer");

    stopClient(a);
    stopClient(v);
    documentA.destroy();
    documentV.destroy();
  }, 30_000);
});
