import { describe, expect, it } from "vitest";
import { studioVirtualSpaceSeatedActors } from "./studio-virtual-space-seated-actors";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";
import { DEFAULT_STUDIO_WORLD_MANIFEST as manifest } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualSlotLeaseSnapshot } from "./studio-virtual-space-slot-lease";

const slot = manifest.interactionSlots![0]!;
const self = studioVirtualSpaceState(slot.approachPoint, "up", "reviewing", false, 0, "review");
const lease: StudioVirtualSlotLeaseSnapshot = { available: true, status: "held", slotId: slot.id, claimId: "grant-one", ownerSessionId: "alice-session", reason: null,
  occupied: [{ slotId: slot.id, claimId: "grant-one", owner: { sessionId: "alice-session", displayName: "Alice", role: "editor" } }] };
const input = { manifest, lease, selfSessionId: "alice-session", selfActorId: "alice-avatar", self, peers: [] };
describe("Seat render projection", () => {
  it("attaches a stationary granted actor to furniture without moving its physics state", () => {
    expect(studioVirtualSpaceSeatedActors(input)).toEqual([{ id: "alice-avatar", anchorPoint: slot.seatAttachmentPoint, facing: slot.facing }]);
    expect(self.x).toBe(slot.approachPoint.x); expect(self.y).toBe(slot.approachPoint.y);
  });
  it("never renders a pending, stale, disconnected or moving actor as seated", () => {
    for (const changed of [{ ...lease, available: false }, { ...lease, status: "requesting" as const }, { ...lease, claimId: "stale" }]) {
      expect(studioVirtualSpaceSeatedActors({ ...input, lease: changed })).toEqual([]);
    }
    expect(studioVirtualSpaceSeatedActors({ ...input, self: { ...self, moving: true } })).toEqual([]);
    expect(studioVirtualSpaceSeatedActors({ ...input, self: { ...self, x: 800 } })).toEqual([]);
    expect(studioVirtualSpaceSeatedActors({ ...input, selfSessionId: "another-session" })).toEqual([]);
  });
});
