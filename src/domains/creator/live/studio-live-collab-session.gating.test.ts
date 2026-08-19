import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildStudioLiveShareHref } from "../creator-studio-links";
import {
  presentStudioAutosaveDocumentLeadership,
  studioAutosaveLeadershipAllowsLocalEdit,
} from "../studio-autosave-document-leader";

import {
  StudioCrdtDocument,
  type StudioCrdtDrawStrokePayload,
  type StudioCrdtSceneElementInput,
} from "./studio-crdt-document";
import { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";
import { STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION } from "./studio-crdt-scene-schema";
import {
  type StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";
import { StudioLiveRoom } from "./studio-live-collaboration-room";
import {
  StudioMemoryBroadcastHub,
  createStudioMemoryLiveTransportFactory,
} from "./studio-live-collaboration-transport";

const ALICE: StudioLiveParticipant = {
  sessionId: "session-alice",
  displayName: "서윤",
  role: "owner",
};
const BOB: StudioLiveParticipant = {
  sessionId: "session-bob",
  displayName: "민호",
  role: "editor",
};

function strokePayload(x: number): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [x, x, x + 8, x + 4],
    pressures: [0.4, 0.8],
    stroke: "#123456",
    strokeWidth: 6,
  };
}

function textElement(id: string, text: string): StudioCrdtSceneElementInput {
  return {
    id,
    pageId: "page-a",
    layerId: "lettering",
    payload: {
      version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
      type: "text",
      props: {
        text,
        x: 10,
        y: 20,
        width: 240,
        fontSize: 28,
        fill: "#111111",
        rotation: 0,
      },
    },
  };
}

function projectReplica(document: StudioCrdtDocument) {
  return {
    strokes: document.getStrokes({ includeDeleted: true }).map((stroke) => ({
      id: stroke.id,
      pageId: stroke.pageId,
      layerId: stroke.layerId,
      status: stroke.status,
      deleted: stroke.deleted,
      payload: stroke.payload,
    })),
    sceneElements: document.getSceneElements({ includeDeleted: true }).map((element) => ({
      id: element.id,
      pageId: element.pageId,
      layerId: element.layerId,
      deleted: element.deleted,
      payload: element.payload,
    })),
  };
}

async function settle(iterations = 24): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await settle(4);
  }
  throw new Error(message);
}

function createLiveSession(options: {
  workId: string;
  participant: StudioLiveParticipant;
  hub: StudioMemoryBroadcastHub;
  now: () => number;
  intervalHandlers: Array<() => void>;
}): StudioLiveRoom {
  return new StudioLiveRoom({
    workId: options.workId,
    participant: options.participant,
    initialPageId: "page-a",
    dependencies: {
      transportFactory: createStudioMemoryLiveTransportFactory(options.hub, {
        syncTimeoutMs: 40,
      }),
      now: options.now,
      setInterval: (handler) => {
        options.intervalHandlers.push(handler);
        return handler;
      },
      clearInterval: (handle) => {
        const index = options.intervalHandlers.indexOf(handle as () => void);
        if (index >= 0) options.intervalHandlers.splice(index, 1);
      },
      heartbeatMs: 250,
      presenceTtlMs: 500,
      cursorIntervalMs: 16,
    },
  });
}

async function joinDisconnectedPeers(workId: string) {
  let now = 1_700_000;
  const hub = new StudioMemoryBroadcastHub();
  const intervalHandlers: Array<() => void> = [];
  const alice = createLiveSession({
    workId,
    participant: ALICE,
    hub,
    now: () => now,
    intervalHandlers,
  });
  const bob = createLiveSession({
    workId,
    participant: BOB,
    hub,
    now: () => now,
    intervalHandlers,
  });
  expect(alice.getPeers()).toEqual([]);
  expect(bob.getPeers()).toEqual([]);
  await alice.start();
  await bob.start();
  return {
    alice,
    bob,
    hub,
    intervalHandlers,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    close: () => {
      alice.close();
      bob.close();
    },
  };
}

async function bindDocuments(roomA: StudioLiveRoom, roomB: StudioLiveRoom) {
  const documentA = new StudioCrdtDocument();
  const documentB = new StudioCrdtDocument();
  const bindingA = new StudioCrdtRoomBinding({ document: documentA, room: roomA });
  const bindingB = new StudioCrdtRoomBinding({ document: documentB, room: roomB });
  await bindingA.start();
  await bindingB.start();
  await bindingA.syncNow();
  await settle();
  return {
    documentA,
    documentB,
    bindingA,
    bindingB,
    close: () => {
      bindingA.close();
      bindingB.close();
      documentA.destroy();
      documentB.destroy();
    },
  };
}

async function flushReplica(binding: StudioCrdtRoomBinding): Promise<void> {
  binding.flush();
  await settle();
}

describe("Studio Magma/Figma live collaboration session", () => {
  it("joins two disconnected peers into one roster and drops a leaving peer", async () => {
    const session = await joinDisconnectedPeers("work-magma-presence");
    expect(session.bob.getPeers()).toEqual([
      expect.objectContaining({
        sessionId: ALICE.sessionId,
        displayName: ALICE.displayName,
        role: ALICE.role,
      }),
    ]);
    expect(session.alice.getPeers()).toEqual([
      expect.objectContaining({
        sessionId: BOB.sessionId,
        displayName: BOB.displayName,
        role: BOB.role,
      }),
    ]);

    session.alice.close();
    expect(session.bob.getPeers().some((peer) => peer.sessionId === ALICE.sessionId)).toBe(
      false
    );
    session.bob.close();
  });

  it("publishes a live cursor with identity and clears it on leave or stale expiry", async () => {
    const session = await joinDisconnectedPeers("work-magma-cursor");
    expect(session.alice.publishCursor({
      x: 0.25,
      y: 0.75,
      pageId: "page-a",
      tool: "pen",
    })).toBe(true);

    expect(session.bob.getCursors()).toEqual([
      expect.objectContaining({
        participant: expect.objectContaining({
          sessionId: ALICE.sessionId,
          displayName: ALICE.displayName,
        }),
        cursor: expect.objectContaining({ x: 0.25, y: 0.75, pageId: "page-a", tool: "pen" }),
      }),
    ]);

    session.advance(16);
    expect(session.alice.clearCursor()).toBe(true);
    expect(session.bob.getCursors()).toEqual([]);

    session.advance(16);
    expect(session.alice.publishCursor({
      x: 0.4,
      y: 0.6,
      pageId: "page-a",
      tool: "pen",
    })).toBe(true);
    expect(session.bob.getCursors()).toHaveLength(1);

    session.alice.close();
    expect(session.bob.getCursors()).toEqual([]);
    expect(session.bob.getPeers()).toEqual([]);
    session.bob.close();

    const stale = await joinDisconnectedPeers("work-magma-cursor-stale");
    expect(stale.alice.publishCursor({
      x: 0.1,
      y: 0.2,
      pageId: "page-a",
      tool: "brush",
    })).toBe(true);
    expect(stale.bob.getCursors()).toHaveLength(1);
    stale.advance(501);
    stale.intervalHandlers.at(-1)?.();
    expect(stale.bob.getPeers()).toEqual([]);
    expect(stale.bob.getCursors()).toEqual([]);
    stale.close();
  });

  it("applies independent stroke and scene edits and converges regardless of delivery order", async () => {
    async function replicate(workId: string, order: "forward" | "reversed") {
      const session = await joinDisconnectedPeers(workId);
      const docs = await bindDocuments(session.alice, session.bob);
      session.hub.queued = true;
      docs.documentA.addStroke({
        id: "stroke-alice",
        pageId: "page-a",
        layerId: "page-root",
        payload: strokePayload(12),
      });
      docs.documentB.addSceneElement(textElement("scene-bob", "민호 대사"));
      await flushReplica(docs.bindingA);
      await flushReplica(docs.bindingB);
      if (order === "reversed") session.hub.flushReversed();
      else session.hub.flush();
      session.hub.queued = false;
      await waitUntil(
        () =>
          docs.documentA.getStroke("stroke-alice") !== null &&
          docs.documentB.getStroke("stroke-alice") !== null &&
          docs.documentA.getSceneElement("scene-bob") !== null &&
          docs.documentB.getSceneElement("scene-bob") !== null,
        `${order} delivery did not carry both independent edits`
      );
      const projectedA = projectReplica(docs.documentA);
      const projectedB = projectReplica(docs.documentB);
      expect(projectedA.strokes.map((stroke) => stroke.id).sort()).toEqual([
        "stroke-alice",
      ]);
      expect(projectedA.sceneElements.map((element) => element.id).sort()).toEqual([
        "scene-bob",
      ]);
      expect(projectedA).toEqual(projectedB);
      expect(projectedA.strokes).not.toEqual([]);
      expect(projectedA.sceneElements).not.toEqual([]);
      docs.close();
      session.close();
      return projectedA;
    }

    const forward = await replicate("work-magma-doc-forward", "forward");
    const reversed = await replicate("work-magma-doc-reversed", "reversed");
    expect(forward).toEqual(reversed);

    const duplicate = await joinDisconnectedPeers("work-magma-doc-duplicate");
    const docs = await bindDocuments(duplicate.alice, duplicate.bob);
    docs.documentA.addStroke({
      id: "stroke-alice",
      pageId: "page-a",
      layerId: "page-root",
      payload: strokePayload(20),
    });
    docs.documentB.addSceneElement(textElement("scene-bob", "중복 전달"));
    await flushReplica(docs.bindingA);
    await flushReplica(docs.bindingB);
    await waitUntil(
      () =>
        docs.documentB.getStroke("stroke-alice") !== null &&
        docs.documentA.getSceneElement("scene-bob") !== null,
      "first delivery missed an independent edit"
    );
    await flushReplica(docs.bindingA);
    await flushReplica(docs.bindingB);
    const afterDuplicate = projectReplica(docs.documentA);
    expect(afterDuplicate).toEqual(projectReplica(docs.documentB));
    expect(afterDuplicate.strokes).toHaveLength(1);
    expect(afterDuplicate.sceneElements).toHaveLength(1);
    docs.close();
    duplicate.close();
  });

  it("wires the Studio work page to the shipped live-collaboration host and share URL", () => {
    const pageSource = readFileSync(new URL("../StudioPage.tsx", import.meta.url), "utf8");
    const editorViewSource = readFileSync(
      new URL("../studio-cuttoon-editor/StudioCuttoonEditorView.tsx", import.meta.url),
      "utf8",
    );
    const panelSource = readFileSync(
      new URL("./StudioLiveCollaborationPanel.tsx", import.meta.url),
      "utf8"
    );
    expect(editorViewSource).toContain("StudioLiveCollaborationProvider");
    expect(editorViewSource).toContain("workId={effectiveWorkId}");
    expect(editorViewSource).toContain("participant={studioLiveParticipant}");
    expect(pageSource).toContain("shouldPublishStudioLiveJamRoom");
    expect(editorViewSource).toContain("serverRequired={Boolean(studioLiveParticipant && requiresStudioLiveServer)}");
    expect(pageSource).toMatch(/buildStudioLiveShareHref\(provisionalWorkId/u);
    expect(pageSource).toContain("buildStudioLiveShareHref");
    expect(panelSource).toContain("buildStudioLiveShareHref");
    expect(buildStudioLiveShareHref("work-jam-9", "https://studio.example")).toBe(
      "https://studio.example/studio?room=work-jam-9"
    );
    expect(pageSource).toContain("studioAutosaveLeadershipAllowsLocalEdit");
    expect(pageSource).toContain("!persistLeadershipAllowsDraw");
    expect(editorViewSource).toContain("autosaveLiveJam={studioLiveJam}");
    expect(editorViewSource).not.toContain("autosaveLiveJam={!requiresStudioLiveServer}");
  });

  it("lets a persist-follower apply a local stroke on the shipped document path", async () => {
    const follower = presentStudioAutosaveDocumentLeadership(
      { role: "follower", basis: "web-lock" },
      { liveJam: true },
    );
    expect(follower.canPersist).toBe(false);
    expect(follower.canDraw).toBe(true);
    expect(studioAutosaveLeadershipAllowsLocalEdit({
      role: "follower",
      basis: "web-lock",
    })).toBe(true);

    const session = await joinDisconnectedPeers("work-magma-follower-draw");
    const docs = await bindDocuments(session.alice, session.bob);
    expect(studioAutosaveLeadershipAllowsLocalEdit({
      role: "follower",
      basis: "web-lock",
    })).toBe(true);
    docs.documentB.addStroke({
      id: "stroke-follower",
      pageId: "page-a",
      layerId: "page-root",
      payload: strokePayload(44),
    });
    await flushReplica(docs.bindingB);
    await waitUntil(
      () => docs.documentA.getStroke("stroke-follower") !== null,
      "follower local stroke did not appear on the other replica"
    );
    expect(docs.documentB.getStroke("stroke-follower")).not.toBeNull();
    expect(docs.documentA.getStroke("stroke-follower")).not.toBeNull();
    docs.close();
    session.close();
  });
});
