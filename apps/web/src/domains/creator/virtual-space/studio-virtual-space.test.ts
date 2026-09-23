import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  selectNearbyStudioVirtualPeers,
  studioVirtualAvatarProfile,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceScaleLegacyDistance,
  studioVirtualSpaceState,
} from "./studio-virtual-space-model";
import {
  StudioVirtualSpacePresenceController,
  parseStudioVirtualSpacePacket,
} from "./studio-virtual-space-presence";
import {
  STUDIO_VIRTUAL_SPACE_INTERACTIONS,
  selectNearestStudioVirtualSpaceInteraction,
} from "./studio-virtual-space-interactions";
import {
  normalizeStudioVirtualSpaceVector,
  resolveStudioVirtualSpaceMovement,
  studioVirtualSpaceCanOccupy,
  studioVirtualSpaceStepToward,
} from "./studio-virtual-space-navigation";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  studioWorldCanOccupy,
} from "./studio-virtual-space-world-pathfinding";

const A: StudioLiveParticipant = {
  sessionId: "creator-a",
  displayName: "Creator A",
  role: "editor",
};
const B: StudioLiveParticipant = {
  sessionId: "creator-b",
  displayName: "Creator B",
  role: "editor",
};

class SequenceStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class DirectHub {
  readonly listeners = new Map<string, (sender: StudioLiveParticipant, payload: string) => void>();
  readonly participants = [A, B];
  private droppedLeaveSessionId: string | null = null;

  dropNextLeave(sessionId: string): void {
    this.droppedLeaveSessionId = sessionId;
  }

  port(self: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => this.participants.filter((participant) => participant.sessionId !== self.sessionId),
      send: (targetSessionId, payload) => {
        const packet = parseStudioVirtualSpacePacket(payload);
        if (packet?.kind === "leave" && this.droppedLeaveSessionId === self.sessionId) {
          this.droppedLeaveSessionId = null;
          return true;
        }
        const target = this.listeners.get(targetSessionId);
        if (!target) return false;
        target(self, payload);
        return true;
      },
      subscribe: (listener) => {
        this.listeners.set(self.sessionId, listener);
        return () => {
          if (this.listeners.get(self.sessionId) === listener) this.listeners.delete(self.sessionId);
        };
      },
    };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Studio virtual space model", () => {
  it("keeps avatar generation deterministic and varied", () => {
    expect(studioVirtualAvatarProfile("same")).toEqual(studioVirtualAvatarProfile("same"));
    expect(studioVirtualAvatarProfile("same")).not.toEqual(studioVirtualAvatarProfile("different"));
  });

  it("builds canonical project destinations", () => {
    expect(studioVirtualSpaceDestination("work / 1", "canvas")).toBe("/studio/work/work%20%2F%201/canvas");
    expect(studioVirtualSpaceDestination("work-1", "story")).toBe("/studio/p/work-1/story?view=script");
    expect(studioVirtualSpaceDestination("work-1", "assistant")).toBeNull();
  });

  it("selects only the closest bounded proximity cohort", () => {
    const self = studioVirtualSpaceState({ x: 400, y: 400 });
    const peers = [
      { participant: A, state: studioVirtualSpaceState({ x: 410, y: 400 }), lastSeen: 1, sequence: 1 },
      { participant: B, state: studioVirtualSpaceState({ x: 420, y: 400 }), lastSeen: 1, sequence: 1 },
      {
        participant: { ...B, sessionId: "creator-c" },
        state: studioVirtualSpaceState({ x: 400 + STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS + 1, y: 400 }),
        lastSeen: 1,
        sequence: 1,
      },
    ];
    expect(selectNearbyStudioVirtualPeers(self, peers).map((peer) => peer.participant.sessionId)).toEqual([
      "creator-a",
      "creator-b",
    ]);
  });

  it("keeps generated starting points inside a walkable part of the stage", () => {
    const point = studioVirtualSpaceInitialPoint("creator-a");
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
    expect(studioVirtualSpaceCanOccupy(point)).toBe(true);
  });
});

describe("Studio virtual space P2P presence", () => {
  it("parses only bounded virtual-space packets", () => {
    const packet = JSON.stringify({
      wire: "toonspectrum-space-v1",
      kind: "presence",
      sequence: 1,
      at: 10,
      state: {
        x: 500,
        y: 350,
        zoneId: "drawing",
        facing: "down",
        activity: "available",
      },
    });
    const parsed = parseStudioVirtualSpacePacket(packet);
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind === "presence") expect(parsed.state.moving).toBe(false);
    expect(parseStudioVirtualSpacePacket('{"wire":"other"}')).toBeNull();
    expect(parseStudioVirtualSpacePacket("not-json")).toBeNull();
  });

  it("preserves coordinates and room ids from larger data-driven worlds", () => {
    const parsed = parseStudioVirtualSpacePacket(JSON.stringify({
      wire: "toonspectrum-space-v1",
      kind: "presence",
      sequence: 7,
      at: 10,
      state: {
        x: 1_240.5,
        y: 902.25,
        zoneId: "meeting-room-2",
        facing: "left",
        activity: "available",
        moving: true,
        avatarIndex: 9,
      },
    }));
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind !== "presence") return;
    expect(parsed.state).toMatchObject({
      x: 1_240.5,
      y: 902.25,
      zoneId: "meeting-room-2",
      facing: "left",
      moving: true,
      avatarIndex: 9,
    });
  });

  it("exchanges movement directly and clears leave state without persistence", () => {
    const hub = new DirectHub();
    const noTimer = () => 1;
    const dependencies = {
      now: () => 1_000,
      setInterval: noTimer,
      clearInterval: () => undefined,
    };
    const a = new StudioVirtualSpacePresenceController(A, hub.port(A), { x: 400, y: 400 }, dependencies);
    const b = new StudioVirtualSpacePresenceController(B, hub.port(B), { x: 430, y: 400 }, dependencies);
    a.start();
    b.start();
    a.refresh();

    expect(a.snapshot().peers.map((peer) => peer.participant.sessionId)).toEqual(["creator-b"]);
    expect(b.snapshot().peers.map((peer) => peer.participant.sessionId)).toEqual(["creator-a"]);
    expect(a.snapshot().nearbyPeers).toHaveLength(1);

    a.update({ x: 900, y: 600 }, "right", "focused");
    a.setMoving(true);
    a.refresh();
    expect(b.snapshot().peers[0]?.state.activity).toBe("focused");
    expect(b.snapshot().peers[0]?.state.moving).toBe(true);
    expect(b.snapshot().peers[0]?.state.x).toBe(900);
    expect(b.snapshot().nearbyPeers).toHaveLength(0);

    a.setMoving(false);
    a.setAvatarIndex(3);
    a.refresh();
    expect(b.snapshot().peers[0]?.state.moving).toBe(false);
    expect(b.snapshot().peers[0]?.state.avatarIndex).toBe(3);

    a.sendReaction("wave");
    expect(a.snapshot().selfReaction).toBe("wave");
    expect(b.snapshot().peerReactions).toEqual([
      expect.objectContaining({ sessionId: "creator-a", reaction: "wave" }),
    ]);

    a.close();
    expect(b.snapshot().peers).toHaveLength(0);
    b.close();
  });

  it("keeps outbound sequence monotonic when a lost leave is followed by reconnect", () => {
    const hub = new DirectHub();
    let now = 2_000;
    const dependencies = {
      now: () => now,
      setInterval: () => 1,
      clearInterval: () => undefined,
    };
    const receiver = new StudioVirtualSpacePresenceController(
      B,
      hub.port(B),
      { x: 400, y: 400 },
      dependencies,
    );
    const first = new StudioVirtualSpacePresenceController(
      A,
      hub.port(A),
      { x: 105, y: 200 },
      dependencies,
    );
    receiver.start();
    first.start();
    for (let index = 0; index < 7; index += 1) {
      now += 1;
      first.update({ x: 105 + index, y: 200 }, "right", "available", true);
      first.refresh();
    }
    const previous = receiver.snapshot().peers.find((peer) => peer.participant.sessionId === A.sessionId)!;

    hub.dropNextLeave(A.sessionId);
    first.close();
    now += 1;
    const reconnected = new StudioVirtualSpacePresenceController(
      A,
      hub.port(A),
      { x: 999, y: 200 },
      dependencies,
    );
    reconnected.start();

    const current = receiver.snapshot().peers.find((peer) => peer.participant.sessionId === A.sessionId)!;
    expect(current.state.x).toBe(999);
    expect(current.sequence).toBeGreaterThan(previous.sequence);

    reconnected.close();
    receiver.close();
  });

  it("persists the outbound high-water across a full module reload", async () => {
    vi.stubGlobal("sessionStorage", new SequenceStorage());
    vi.resetModules();
    const firstRealm = await import("./studio-virtual-space-presence");
    const hub = new DirectHub();
    const dependencies = {
      now: () => 3_000,
      setInterval: () => 1,
      clearInterval: () => undefined,
    };
    const receiver = new firstRealm.StudioVirtualSpacePresenceController(
      B,
      hub.port(B),
      { x: 400, y: 400 },
      dependencies,
    );
    const beforeReload = new firstRealm.StudioVirtualSpacePresenceController(
      A,
      hub.port(A),
      { x: 105, y: 200 },
      dependencies,
    );
    receiver.start();
    beforeReload.start();
    beforeReload.update({ x: 110, y: 200 }, "right", "available", true);
    beforeReload.refresh();
    const previous = receiver.snapshot().peers.find((peer) => peer.participant.sessionId === A.sessionId)!;
    hub.dropNextLeave(A.sessionId);
    beforeReload.close();

    vi.resetModules();
    const reloadedRealm = await import("./studio-virtual-space-presence");
    const afterReload = new reloadedRealm.StudioVirtualSpacePresenceController(
      A,
      hub.port(A),
      { x: 999, y: 200 },
      dependencies,
    );
    afterReload.start();

    const current = receiver.snapshot().peers.find((peer) => peer.participant.sessionId === A.sessionId)!;
    expect(current.state.x).toBe(999);
    expect(current.sequence).toBeGreaterThan(previous.sequence);

    afterReload.close();
    receiver.close();
  });

  it("keeps direct presence alive when session storage access is blocked", () => {
    const hub = new DirectHub();
    const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => { throw new DOMException("blocked", "SecurityError"); },
    });
    try {
      const controller = new StudioVirtualSpacePresenceController(
        A,
        hub.port(A),
        { x: 200, y: 200 },
        { setInterval: () => 1, clearInterval: () => undefined },
      );
      expect(() => {
        controller.start();
        controller.sendReaction("wave");
        controller.close();
      }).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, "sessionStorage", original);
      else Reflect.deleteProperty(globalThis, "sessionStorage");
    }

    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("blocked", "SecurityError"); },
    });
    const controller = new StudioVirtualSpacePresenceController(
      B,
      hub.port(B),
      { x: 210, y: 200 },
      { setInterval: () => 1, clearInterval: () => undefined },
    );
    expect(() => {
      controller.start();
      controller.sendReaction("heart");
      controller.close();
    }).not.toThrow();
  });
});


describe("Studio virtual space RPG navigation", () => {
  it("normalizes diagonal input so movement speed stays consistent", () => {
    const vector = normalizeStudioVirtualSpaceVector(1, 1);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 6);
  });

  it("blocks room walls while allowing doorway traversal", () => {
    expect(studioVirtualSpaceCanOccupy({ x: 50, y: 40 })).toBe(false);
    expect(studioVirtualSpaceCanOccupy({ x: 195, y: 210 })).toBe(true);
  });

  it("keeps resolved movement on walkable floor", () => {
    const start = { x: 640, y: 280 };
    const next = resolveStudioVirtualSpaceMovement(start, { x: 0, y: 30 });
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeGreaterThan(0);
    expect(studioVirtualSpaceCanOccupy(next)).toBe(true);
  });

  it("walks toward click targets in bounded increments", () => {
    const start = { x: 780, y: 900 };
    const maxDistance = studioVirtualSpaceScaleLegacyDistance(20);
    const next = studioVirtualSpaceStepToward(start, { x: 780, y: 870 }, maxDistance);
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeLessThanOrEqual(maxDistance + 1.1);
  });
});


describe("Studio virtual space pathfinding", () => {
  it("finds a browser-local route through room doors", () => {
    const path = findStudioWorldPath(
      DEFAULT_STUDIO_WORLD_MANIFEST,
      DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((spawn) => spawn.id === "main")!.point,
      { x: 175, y: 455 },
    );
    expect(path.length).toBeGreaterThan(2);
    expect(path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point))).toBe(true);
    expect(path.at(-1)?.y).toBeLessThan(520);
  });

  it("returns a nearby walkable endpoint when a click lands on furniture", () => {
    const prop = DEFAULT_STUDIO_WORLD_MANIFEST.props.find((item) => item.id === "writers-script-desk")!;
    const path = findStudioWorldPath(
      DEFAULT_STUDIO_WORLD_MANIFEST,
      DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((spawn) => spawn.id === "main")!.point,
      {
        x: prop.collider!.x + prop.collider!.width / 2,
        y: prop.collider!.y + prop.collider!.height / 2,
      },
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point))).toBe(true);
  });
});


describe("Studio virtual space object interactions", () => {
  it("keeps every interaction approach point on walkable floor", () => {
    for (const interaction of STUDIO_VIRTUAL_SPACE_INTERACTIONS) {
      expect(
        studioVirtualSpaceCanOccupy({ x: interaction.x, y: interaction.y }),
        interaction.id,
      ).toBe(true);
    }
  });

  it("selects the nearest nearby production object", () => {
    expect(
      selectNearestStudioVirtualSpaceInteraction({ x: 485, y: 455 })?.id,
    ).toBe("drawing-atelier-desk");
    expect(
      selectNearestStudioVirtualSpaceInteraction({ x: 490, y: 885 })?.id,
    ).toBe("producer-assistant-desk");
  });
});


describe("published world presence isolation", () => {
  it("rejects legacy and another publication's position/reaction/leave while preserving bundled compatibility", () => {
    const hub = new DirectHub(), scope = "a".repeat(64);
    const scoped = new StudioVirtualSpacePresenceController(A, hub.port(A), { x: 40, y: 40 }, { worldScope: scope });
    let peer = new StudioVirtualSpacePresenceController(B, hub.port(B), { x: 50, y: 50 });
    scoped.start(); peer.start(); peer.sendReaction("wave");
    expect(scoped.snapshot().peers).toHaveLength(0); expect(scoped.snapshot().peerReactions).toHaveLength(0); peer.close();
    peer = new StudioVirtualSpacePresenceController(B, hub.port(B), { x: 50, y: 50 }, { worldScope: "b".repeat(64) });
    peer.start(); expect(scoped.snapshot().peers).toHaveLength(0); peer.close();
    peer = new StudioVirtualSpacePresenceController(B, hub.port(B), { x: 50, y: 50 }, { worldScope: scope });
    peer.start(); peer.sendReaction("wave"); expect(scoped.snapshot().peers).toHaveLength(1); expect(scoped.snapshot().peerReactions).toHaveLength(1);
    hub.port(B).send(A.sessionId, JSON.stringify({ wire: "toonspectrum-space-v1", kind: "leave", sequence: Number.MAX_SAFE_INTEGER, at: 1, worldScope: "b".repeat(64) }));
    expect(scoped.snapshot().peers).toHaveLength(1); peer.close(); expect(scoped.snapshot().peers).toHaveLength(0); scoped.close();
  });
});
