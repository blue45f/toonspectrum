import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_P2P_BOARD_MAX_BYTES,
  STUDIO_P2P_BOARD_WIRE,
  StudioP2pBoardController,
  parseStudioP2pBoardPacket,
} from "./studio-virtual-space-p2p-board";

class DirectNetwork {
  readonly listeners = new Map<string, (sender: StudioLiveParticipant, payload: string) => void>();
  readonly participants = new Map<string, StudioLiveParticipant>();
  readonly ticks: Array<() => void> = [];

  participant(id: string, role: StudioLiveParticipant["role"] = "editor"): StudioLiveParticipant {
    const value = { sessionId: id, displayName: id.toUpperCase(), role };
    this.participants.set(id, value);
    return value;
  }

  port(owner: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => [...this.participants.values()].filter((peer) => peer.sessionId !== owner.sessionId),
      subscribe: (listener) => {
        this.listeners.set(owner.sessionId, listener);
        return () => this.listeners.delete(owner.sessionId);
      },
      send: (target, payload) => {
        // Mirrors the production direct lane: viewers receive but cannot publish frames.
        if (owner.role === "viewer") return false;
        const listener = this.listeners.get(target);
        if (!listener) return false;
        listener(owner, payload);
        return true;
      },
    };
  }

  dependencies(epoch: string) {
    return {
      epoch,
      setInterval: (handler: () => void) => { this.ticks.push(handler); return handler; },
      clearInterval: () => undefined,
    };
  }

  settle(): void { for (let round = 0; round < 3; round += 1) for (const tick of [...this.ticks]) tick(); }
}

const scope = { boardId: "main-board", worldId: "studio-world", contentRevision: "revision-1" } as const;

describe("StudioP2pBoardController", () => {
  it("synchronizes bounded strokes and notes directly between peers", () => {
    const network = new DirectNetwork();
    const alice = network.participant("alice");
    const bob = network.participant("bob");
    const a = new StudioP2pBoardController(alice, network.port(alice), scope, network.dependencies("epoch-a"));
    const b = new StudioP2pBoardController(bob, network.port(bob), scope, network.dependencies("epoch-b"));
    a.start(); b.start(); network.settle();

    expect(a.snapshot().readyPeerIds).toContain("bob");
    expect(b.snapshot().readyPeerIds).toContain("alice");
    const strokeId = a.addStroke([{ x: .1, y: .2 }, { x: .3, y: .4 }], "#ffd166", 5);
    const noteId = b.addNote(.5, .6, "검수 포인트", "#83d8c5");
    expect(strokeId).toBeTruthy(); expect(noteId).toBeTruthy();
    expect(a.snapshot().entities).toHaveLength(2);
    expect(b.snapshot().entities).toHaveLength(2);
    expect(b.remove(strokeId!)).toBe(false);
    expect(a.snapshot().entities).toHaveLength(2);

    a.clearOwn();
    expect(b.snapshot().entities.map((entity) => entity.kind)).toEqual(["note"]);
    a.close(); b.close();
  });

  it("keeps viewers read-only while recovering and receiving through the one-way direct lane", () => {
    const network = new DirectNetwork();
    const alice = network.participant("alice");
    const viewer = network.participant("viewer", "viewer");
    const a = new StudioP2pBoardController(alice, network.port(alice), scope, network.dependencies("epoch-a"));
    const v = new StudioP2pBoardController(viewer, network.port(viewer), scope, network.dependencies("epoch-v"));
    a.start();
    a.addNote(.2, .2, "before viewer mounted", "#f3f4f6");
    v.start();
    network.settle();

    expect(v.snapshot().canEdit).toBe(false);
    expect(v.snapshot().readyPeerIds).toContain("alice");
    expect(v.snapshot().entities[0]).toMatchObject({
      kind: "note",
      text: "before viewer mounted",
    });
    expect(v.addNote(.2, .2, "blocked", "#f3f4f6")).toBeNull();
    a.addNote(.3, .3, "live update", "#ffd166");
    expect(v.snapshot().entities.map((entity) => entity.kind === "note" ? entity.text : "stroke"))
      .toEqual(["before viewer mounted", "live update"]);

    const forged = JSON.stringify({
      wire: STUDIO_P2P_BOARD_WIRE,
      kind: "upsert",
      ...scope,
      sessionEpoch: "epoch-v",
      targetEpoch: "epoch-a",
      senderSessionId: "viewer",
      targetSessionId: "alice",
      sequence: 1,
      entity: {
        kind: "note",
        id: "viewer.1",
        ownerSessionId: "viewer",
        ownerEpoch: "epoch-v",
        revision: 1,
        color: "#ffd166",
        x: .4,
        y: .4,
        text: "forged viewer edit",
      },
    });
    network.listeners.get("alice")?.(viewer, forged);
    expect(a.snapshot().entities.some((entity) => entity.ownerSessionId === "viewer")).toBe(false);
    a.close();
    v.close();
  });
});

describe("P2P board packet parser", () => {
  it("rejects oversized, cross-owner and unknown-command frames", () => {
    expect(parseStudioP2pBoardPacket("x".repeat(STUDIO_P2P_BOARD_MAX_BYTES + 1))).toBeNull();
    const base = {
      wire: STUDIO_P2P_BOARD_WIRE,
      kind: "upsert",
      ...scope,
      sessionEpoch: "epoch-a",
      targetEpoch: "epoch-b",
      senderSessionId: "alice",
      targetSessionId: "bob",
      sequence: 1,
    };
    expect(parseStudioP2pBoardPacket(JSON.stringify({ ...base, command: "open-camera" }))).toBeNull();
    expect(parseStudioP2pBoardPacket(JSON.stringify({ ...base, entity: {
      kind: "note", id: "n1", ownerSessionId: "mallory", ownerEpoch: "epoch-a", revision: 1,
      color: "#ffd166", x: .2, y: .2, text: "spoof",
    } }))).toBeNull();
  });
});
