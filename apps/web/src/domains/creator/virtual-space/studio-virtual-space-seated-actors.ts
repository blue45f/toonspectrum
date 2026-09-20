import type { StudioVirtualSpaceFacing, StudioVirtualSpacePeer, StudioVirtualSpacePoint, StudioVirtualSpacePresenceState } from "./studio-virtual-space-model";
import type { StudioVirtualSlotLeaseSnapshot } from "./studio-virtual-space-slot-lease";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export interface StudioSeatedActor {
  readonly id: string;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
}
/** Project authenticated, current-world occupancy into decoration; never turn a pose into a grant. */
export function studioVirtualSpaceSeatedActors({ manifest, lease, selfSessionId, selfActorId, self, peers }: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly lease: StudioVirtualSlotLeaseSnapshot;
  readonly selfSessionId: string | undefined;
  readonly selfActorId: string;
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
}): readonly StudioSeatedActor[] {
  if (!lease.available) return [];
  const assigned = new Set<string>();
  return lease.occupied.flatMap((occupancy) => {
    const id = occupancy.owner.sessionId;
    const local = id === selfSessionId;
    if (assigned.has(id) || (local && (lease.status !== "held" || lease.slotId !== occupancy.slotId || lease.claimId !== occupancy.claimId))) return [];
    const slot = manifest.interactionSlots?.find((item) => item.id === occupancy.slotId);
    const state = local ? self : peers.find((peer) => peer.participant.sessionId === id)?.state;
    if (!slot?.seatAttachmentPoint || !state || state.moving || state.activity === "away" || state.activity === "focused"
      || Math.hypot(state.x - slot.approachPoint.x, state.y - slot.approachPoint.y) > slot.radius + 4) return [];
    assigned.add(id);
    return [{ id: local ? selfActorId : id, anchorPoint: slot.seatAttachmentPoint, facing: slot.facing }];
  });
}
