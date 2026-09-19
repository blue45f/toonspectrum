import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWorldPortalDefinition } from "./studio-virtual-space-world-manifest";

/** Slow down before a destination so click-to-move does not overshoot and oscillate. */
export function studioWorldArrivalInput(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  maxSpeed: number,
  deceleration: number,
  stopDistance = 2,
): StudioVirtualSpacePoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= stopDistance || maxSpeed <= 0) return { x: 0, y: 0 };
  const speed = Math.min(maxSpeed, Math.sqrt(2 * deceleration * Math.max(0, distance - stopDistance)));
  const magnitude = speed / maxSpeed;
  return { x: dx / distance * magnitude, y: dy / distance * magnitude };
}

/** Enter-once semantics also seed destination portals, preventing ping-pong teleports. */
export class StudioWorldPortalTracker {
  private occupied = new Set<string>();

  seed(portals: readonly StudioWorldPortalDefinition[], point: StudioVirtualSpacePoint): void {
    this.occupied = this.at(portals, point);
  }

  enter(portals: readonly StudioWorldPortalDefinition[], point: StudioVirtualSpacePoint): StudioWorldPortalDefinition | null {
    const now = this.at(portals, point);
    const entry = portals.find((portal) => now.has(portal.id) && !this.occupied.has(portal.id)) ?? null;
    this.occupied = now;
    return entry;
  }

  private at(portals: readonly StudioWorldPortalDefinition[], point: StudioVirtualSpacePoint): Set<string> {
    return new Set(portals.filter((portal) => Math.hypot(portal.point.x - point.x, portal.point.y - point.y) <= portal.radius).map((portal) => portal.id));
  }
}

export function studioWorldInputBlocked(document: Pick<Document, "activeElement" | "hidden" | "hasFocus">): boolean {
  if (document.hidden || !document.hasFocus()) return true;
  const active = document.activeElement;
  return Boolean(active?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'));
}
