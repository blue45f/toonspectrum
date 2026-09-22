import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioWorldPortalTarget,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

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
  if (![distance, maxSpeed, deceleration, stopDistance].every(Number.isFinite) || distance <= stopDistance || maxSpeed <= 0 || deceleration <= 0) return { x: 0, y: 0 };
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

export interface StudioWorldApproachTarget {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
}

export interface StudioWorldApproachPending {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly walkTarget: StudioVirtualSpacePoint;
}

export interface StudioWorldApproachState {
  readonly pending: StudioWorldApproachPending | null;
}

export const EMPTY_STUDIO_WORLD_APPROACH: StudioWorldApproachState = Object.freeze({ pending: null });

export interface StudioWorldApproachStep {
  readonly state: StudioWorldApproachState;
  readonly walkTarget: StudioVirtualSpacePoint | null;
  readonly activateId: string | null;
}

function insideRadius(current: StudioVirtualSpacePoint, target: StudioWorldApproachTarget): boolean {
  return Math.hypot(current.x - target.point.x, current.y - target.point.y) <= target.radius;
}

/** Occupiable stand point inside the activation disk, nearest to the actor. */
export function findStudioWorldApproachPoint(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  center: StudioVirtualSpacePoint,
  radius: number,
): StudioVirtualSpacePoint | null {
  if (![current.x, current.y, center.x, center.y, radius].every(Number.isFinite) || radius <= 0) return null;
  const toward = Math.atan2(current.y - center.y, current.x - center.x);
  const rings = [Math.max(0, radius - 1), Math.max(0, radius * 0.5), 0];
  let best: StudioVirtualSpacePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let step = 0; step < 24; step += 1) {
    const turn = step === 0 ? 0 : (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * (Math.PI / 12);
    const angle = toward + turn;
    for (const stand of rings) {
      const candidate = {
        x: center.x + Math.cos(angle) * stand,
        y: center.y + Math.sin(angle) * stand,
      };
      if (Math.hypot(candidate.x - center.x, candidate.y - center.y) > radius) continue;
      if (!studioWorldCanOccupy(manifest, candidate)) continue;
      const gap = Math.hypot(candidate.x - current.x, candidate.y - current.y);
      if (gap < bestDistance) {
        best = candidate;
        bestDistance = gap;
      }
    }
  }
  return best;
}

const idleApproach: StudioWorldApproachStep = {
  state: EMPTY_STUDIO_WORLD_APPROACH,
  walkTarget: null,
  activateId: null,
};

/**
 * Outside the radius, walk to one occupiable point inside it and activate on entry.
 * An in-range selection or interact key activates immediately and does not start a walk.
 * A disk with no occupiable point neither activates nor keeps a walk.
 */
export function stepStudioWorldInteractionApproach(
  manifest: StudioVirtualSpaceWorldManifest,
  state: StudioWorldApproachState,
  current: StudioVirtualSpacePoint,
  options: {
    readonly selection?: StudioWorldApproachTarget | null;
    readonly inRangeInteract?: boolean;
    readonly nearby?: StudioWorldApproachTarget | null;
  } = {},
): StudioWorldApproachStep {
  const selection = options.selection ?? null;
  if (selection) {
    if (insideRadius(current, selection)) {
      return { state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: selection.id };
    }
    const walkTarget = findStudioWorldApproachPoint(manifest, current, selection.point, selection.radius);
    if (!walkTarget) return idleApproach;
    const pending = { id: selection.id, point: selection.point, radius: selection.radius, walkTarget };
    return { state: { pending }, walkTarget, activateId: null };
  }

  const nearby = options.nearby ?? null;
  if (options.inRangeInteract && nearby && insideRadius(current, nearby)) {
    return { state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: nearby.id };
  }

  const pending = state.pending;
  if (!pending) return idleApproach;
  if (insideRadius(current, pending)) {
    return { state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: pending.id };
  }
  const stillInside = Math.hypot(pending.walkTarget.x - pending.point.x, pending.walkTarget.y - pending.point.y) <= pending.radius;
  if (!stillInside || !studioWorldCanOccupy(manifest, pending.walkTarget)) return idleApproach;
  return { state, walkTarget: pending.walkTarget, activateId: null };
}

export interface StudioWorldPortalArrival {
  readonly portal: StudioWorldPortalDefinition | null;
  readonly body: StudioVirtualSpacePoint;
  readonly cameraAnchor: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
}

/**
 * One portal entry moves the body onto the authored target and parks the camera there.
 * Reduced motion uses the same target. Staying inside does not enter again.
 */
export function resolveStudioWorldPortalArrival(
  tracker: StudioWorldPortalTracker,
  manifest: StudioVirtualSpaceWorldManifest,
  portals: readonly StudioWorldPortalDefinition[],
  point: StudioVirtualSpacePoint,
  velocity: StudioVirtualSpacePoint,
  _reducedMotion = false,
): StudioWorldPortalArrival {
  const portal = tracker.enter(portals, point);
  if (!portal) return { portal: null, body: point, cameraAnchor: point, velocity };
  const target = studioWorldPortalTarget(manifest, portal);
  if (!target || !studioWorldCanOccupy(manifest, target)) {
    return { portal, body: point, cameraAnchor: point, velocity };
  }
  tracker.seed(portals, target);
  return {
    portal,
    body: { x: target.x, y: target.y },
    cameraAnchor: { x: target.x, y: target.y },
    velocity: { x: 0, y: 0 },
  };
}

type StudioInputDocument = Pick<Document, "activeElement" | "hidden" | "hasFocus">
  & Partial<Pick<Document, "querySelectorAll">>;

/** This DOM scan belongs on mutations, not every Phaser render frame. */
export function studioWorldHasModalBlocker(
  document: Partial<Pick<Document, "querySelectorAll">>,
): boolean {
  const dialogs = document.querySelectorAll?.('dialog[open],[role="dialog"][aria-modal="true"],[data-studio-input-blocker="true"]');
  if (!dialogs) return false;
  for (const dialog of dialogs) {
    if (!dialog.closest('[hidden],[aria-hidden="true"],[data-state="closed"]')) return true;
  }
  return false;
}

export function studioWorldInputBlocked(
  document: StudioInputDocument,
  modalBlocked = studioWorldHasModalBlocker(document),
): boolean {
  if (document.hidden || !document.hasFocus()) return true;
  if (modalBlocked) return true;
  const active = document.activeElement;
  return Boolean(active?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'));
}
