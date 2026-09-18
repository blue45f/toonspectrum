import { describe, expect, it } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  selectNearbyStudioVirtualPeers,
  studioVirtualAvatarProfile,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceState,
} from "./studio-virtual-space-model";
import {
  StudioVirtualSpacePresenceController,
  parseStudioVirtualSpacePacket,
} from "./studio-virtual-space-presence";

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

  it("keeps generated starting points inside the stage", () => {
    const point = studioVirtualSpaceInitialPoint("creator-a");
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
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
    expect(parseStudioVirtualSpacePacket(packet)?.kind).toBe("presence");
    expect(parseStudioVirtualSpacePacket('{"wire":"other"}')).toBeNull();
    expect(parseStudioVirtualSpacePacket("not-json")).toBeNull();
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
    a.refresh();
    expect(b.snapshot().peers[0]?.state.activity).toBe("focused");
    expect(b.snapshot().nearbyPeers).toHaveLength(0);

    a.close();
    expect(b.snapshot().peers).toHaveLength(0);
    b.close();
  });
});
