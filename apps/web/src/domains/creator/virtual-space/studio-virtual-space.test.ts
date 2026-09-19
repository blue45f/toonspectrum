import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  selectNearbyStudioVirtualPeers,
  studioVirtualAvatarProfile,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceScaleLegacyDistance,
  studioVirtualSpaceScaleLegacyPoint,
  studioVirtualSpaceScaleLegacyX,
  studioVirtualSpaceScaleLegacyY,
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

class DirectHub {
  readonly listeners = new Map<string, (sender: StudioLiveParticipant, payload: string) => void>();
  readonly participants = [A, B];

  port(self: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => this.participants.filter((participant) => participant.sessionId !== self.sessionId),
      send: (targetSessionId, payload) => {
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
});


describe("Studio virtual space RPG navigation", () => {
  it("normalizes diagonal input so movement speed stays consistent", () => {
    const vector = normalizeStudioVirtualSpaceVector(1, 1);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 6);
  });

  it("blocks room walls while allowing doorway traversal", () => {
    expect(studioVirtualSpaceCanOccupy(studioVirtualSpaceScaleLegacyPoint({ x: 50, y: 40 }))).toBe(false);
    expect(studioVirtualSpaceCanOccupy(studioVirtualSpaceScaleLegacyPoint({ x: 163, y: 232 }))).toBe(true);
  });

  it("keeps resolved movement on walkable floor", () => {
    const start = studioVirtualSpaceScaleLegacyPoint({ x: 80, y: 235 });
    const next = resolveStudioVirtualSpaceMovement(start, {
      x: studioVirtualSpaceScaleLegacyX(30),
      y: studioVirtualSpaceScaleLegacyY(-30),
    });
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeGreaterThan(0);
    expect(studioVirtualSpaceCanOccupy(next)).toBe(true);
  });

  it("walks toward click targets in bounded increments", () => {
    const start = studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 640 });
    const maxDistance = studioVirtualSpaceScaleLegacyDistance(20);
    const next = studioVirtualSpaceStepToward(
      start,
      studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 600 }),
      maxDistance,
    );
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeLessThanOrEqual(maxDistance + 1.1);
  });
});


describe("Studio virtual space pathfinding", () => {
  it("finds a browser-local route through room doors", () => {
    const path = findStudioWorldPath(
      DEFAULT_STUDIO_WORLD_MANIFEST,
      studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 640 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 555, y: 105 }),
    );
    expect(path.length).toBeGreaterThan(2);
    expect(path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point))).toBe(true);
    expect(path.at(-1)?.y).toBeLessThan(studioVirtualSpaceScaleLegacyY(150));
  });

  it("returns a nearby walkable endpoint when a click lands on furniture", () => {
    const path = findStudioWorldPath(
      DEFAULT_STUDIO_WORLD_MANIFEST,
      studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 640 }),
      studioVirtualSpaceScaleLegacyPoint({ x: 190, y: 150 }),
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => studioVirtualSpaceCanOccupy(point))).toBe(true);
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
      selectNearestStudioVirtualSpaceInteraction(studioVirtualSpaceScaleLegacyPoint({ x: 995, y: 305 }))?.id,
    ).toBe("drawing-desk");
    expect(
      selectNearestStudioVirtualSpaceInteraction(studioVirtualSpaceScaleLegacyPoint({ x: 925, y: 545 }))?.id,
    ).toBe("ai-producer-desk");
  });
});
