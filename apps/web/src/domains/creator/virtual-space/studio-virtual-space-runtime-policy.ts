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
  /** Set only while the body is inside a disk that has an occupiable stand point. */
  readonly highlightId: string | null;
  readonly prompt: boolean;
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
  highlightId: null,
  prompt: false,
};

function approachPresence(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  target: StudioWorldApproachTarget | null,
): Pick<StudioWorldApproachStep, "highlightId" | "prompt"> {
  if (!target || !insideRadius(current, target)) return { highlightId: null, prompt: false };
  if (!findStudioWorldApproachPoint(manifest, current, target.point, target.radius)) {
    return { highlightId: null, prompt: false };
  }
  return { highlightId: target.id, prompt: true };
}

/**
 * A nearby NPC does not hide an interaction the body is already standing inside.
 * The interaction disk stays the highlight and prompt target.
 */
export function studioWorldFloorFocusTarget(input: {
  readonly npcNearby: boolean;
  readonly interaction: StudioWorldApproachTarget | null;
}): StudioWorldApproachTarget | null {
  if (input.interaction) return input.interaction;
  if (input.npcNearby) return null;
  return null;
}

/**
 * The on-screen interact prompt is a button, so it takes focus away from the canvas.
 * That click still counts. A request with neither the canvas nor the prompt focused does not.
 */
export function studioWorldPromptInteractGate(input: {
  readonly requested: boolean;
  readonly canvasFocused: boolean;
  readonly promptFocused: boolean;
  readonly blocked: boolean;
}): boolean {
  if (!input.requested || input.blocked) return false;
  return input.canvasFocused || input.promptFocused;
}

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
    /** Disk to highlight while the body is inside it, even after the walk has finished. */
    readonly focus?: StudioWorldApproachTarget | null;
  } = {},
): StudioWorldApproachStep {
  const selection = options.selection ?? null;
  const focusOf = (partial: Omit<StudioWorldApproachStep, "highlightId" | "prompt">): StudioWorldApproachStep => {
    const focus = options.focus ?? options.nearby ?? selection ?? (partial.state.pending
      ? { id: partial.state.pending.id, point: partial.state.pending.point, radius: partial.state.pending.radius }
      : null);
    return { ...partial, ...approachPresence(manifest, current, focus) };
  };
  if (selection) {
    if (insideRadius(current, selection)) {
      return focusOf({ state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: selection.id });
    }
    const walkTarget = findStudioWorldApproachPoint(manifest, current, selection.point, selection.radius);
    if (!walkTarget) return focusOf(idleApproach);
    const pending = { id: selection.id, point: selection.point, radius: selection.radius, walkTarget };
    return focusOf({ state: { pending }, walkTarget, activateId: null });
  }

  const nearby = options.nearby ?? null;
  if (options.inRangeInteract && nearby && insideRadius(current, nearby) && approachPresence(manifest, current, nearby).prompt) {
    return focusOf({ state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: nearby.id });
  }

  const pending = state.pending;
  if (!pending) return focusOf(idleApproach);
  if (insideRadius(current, pending) && approachPresence(manifest, current, pending).prompt) {
    return focusOf({ state: EMPTY_STUDIO_WORLD_APPROACH, walkTarget: null, activateId: pending.id });
  }
  const stillInside = Math.hypot(pending.walkTarget.x - pending.point.x, pending.walkTarget.y - pending.point.y) <= pending.radius;
  if (!stillInside || !studioWorldCanOccupy(manifest, pending.walkTarget)) return focusOf(idleApproach);
  return focusOf({ state, walkTarget: pending.walkTarget, activateId: null });
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

/** Stand off the other person so the route stops beside them, not inside them. */
export const STUDIO_WORLD_BESIDE_DISTANCE = 32;

export interface StudioWorldWalkOverSubject {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
}

export interface StudioWorldWalkOverState {
  readonly follow: boolean;
  readonly targetId: string | null;
  readonly routeTarget: StudioVirtualSpacePoint | null;
}

export const EMPTY_STUDIO_WORLD_WALK_OVER: StudioWorldWalkOverState = Object.freeze({
  follow: false,
  targetId: null,
  routeTarget: null,
});

export function findStudioWorldBesidePoint(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  person: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint | null {
  let best: StudioVirtualSpacePoint | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let step = 0; step < 16; step += 1) {
    const angle = (Math.PI * 2 * step) / 16;
    const candidate = {
      x: person.x + Math.cos(angle) * STUDIO_WORLD_BESIDE_DISTANCE,
      y: person.y + Math.sin(angle) * STUDIO_WORLD_BESIDE_DISTANCE,
    };
    if (!studioWorldCanOccupy(manifest, candidate)) continue;
    const gap = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

function alreadyBeside(current: StudioVirtualSpacePoint, person: StudioVirtualSpacePoint): boolean {
  return Math.hypot(current.x - person.x, current.y - person.y) <= STUDIO_WORLD_BESIDE_DISTANCE + 8;
}

/**
 * Walk to an occupiable point beside a person. Follow keeps that point with them.
 * Direct steering or an explicit stop drops the route and the follow.
 */
export function stepStudioWorldWalkOver(
  manifest: StudioVirtualSpaceWorldManifest,
  state: StudioWorldWalkOverState,
  current: StudioVirtualSpacePoint,
  options: {
    readonly choice?: StudioWorldWalkOverSubject | null;
    readonly followTarget?: StudioWorldWalkOverSubject | null;
    readonly direct?: boolean;
    readonly stop?: boolean;
  } = {},
): { readonly state: StudioWorldWalkOverState; readonly routeTarget: StudioVirtualSpacePoint | null; readonly follow: boolean } {
  if (options.direct || options.stop) {
    return { state: EMPTY_STUDIO_WORLD_WALK_OVER, routeTarget: null, follow: false };
  }
  const followed = state.follow && options.followTarget && options.followTarget.id === state.targetId
    ? options.followTarget
    : null;
  const subject = options.choice ?? followed;
  if (!subject) return { state, routeTarget: state.routeTarget, follow: state.follow };
  if (alreadyBeside(current, subject.point)) {
    const next = { follow: true, targetId: subject.id, routeTarget: null };
    return { state: next, routeTarget: null, follow: true };
  }
  const beside = findStudioWorldBesidePoint(manifest, current, subject.point);
  if (!beside) return { state: EMPTY_STUDIO_WORLD_WALK_OVER, routeTarget: null, follow: false };
  const next = { follow: true, targetId: subject.id, routeTarget: beside };
  return { state: next, routeTarget: beside, follow: true };
}

interface ZoneRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function containsZone(rect: ZoneRect, point: StudioVirtualSpacePoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Private acoustic zones win over the room under the same floor point. Outside every rect is nowhere. */
export function studioWorldPresenceZone(
  manifest: StudioVirtualSpaceWorldManifest,
  point: StudioVirtualSpacePoint,
): { readonly id: string; readonly rect: ZoneRect } | null {
  const privateZone = (manifest.acousticZones ?? []).find((zone) => zone.policy === "private" && containsZone(zone, point));
  if (privateZone) return { id: privateZone.id, rect: privateZone };
  const room = manifest.rooms.find((candidate) => containsZone(candidate, point));
  return room ? { id: room.id, rect: room } : null;
}

export class StudioWorldZoneTracker {
  private occupied: string | null = null;

  seed(zoneId: string | null): void {
    this.occupied = zoneId;
  }

  /** True only on the frame the body crosses into a zone. */
  enter(zoneId: string | null): boolean {
    if (zoneId === this.occupied) return false;
    this.occupied = zoneId;
    return zoneId != null;
  }
}

export interface StudioWorldZonePresence {
  readonly zoneId: string | null;
  readonly announce: boolean;
  readonly separated: boolean;
  readonly rect: ZoneRect | null;
}

export function resolveStudioWorldZonePresence(
  tracker: StudioWorldZoneTracker,
  manifest: StudioVirtualSpaceWorldManifest,
  point: StudioVirtualSpacePoint,
  _reducedMotion = false,
): StudioWorldZonePresence {
  void _reducedMotion;
  const zone = studioWorldPresenceZone(manifest, point);
  const zoneId = zone?.id ?? null;
  return {
    zoneId,
    announce: tracker.enter(zoneId),
    separated: zoneId != null,
    rect: zone?.rect ?? null,
  };
}

export interface StudioWorldUnstuck {
  readonly spawn: StudioVirtualSpacePoint | null;
  readonly velocity: StudioVirtualSpacePoint;
  readonly route: readonly StudioVirtualSpacePoint[];
  readonly cameraAnchor: StudioVirtualSpacePoint;
  readonly portal: null;
}

/** Nearest authored spawn that can be occupied. No path is built through furniture. */
export function resolveStudioWorldUnstuck(
  manifest: StudioVirtualSpaceWorldManifest,
  stuck: StudioVirtualSpacePoint,
): StudioWorldUnstuck {
  const stopped = { x: 0, y: 0 };
  const spawns = manifest.spawns.filter((spawn) => studioWorldCanOccupy(manifest, spawn.point));
  if (spawns.length === 0) {
    return { spawn: null, velocity: stopped, route: [], cameraAnchor: stuck, portal: null };
  }
  const nearest = spawns.reduce((best, spawn) => (
    Math.hypot(spawn.point.x - stuck.x, spawn.point.y - stuck.y)
      < Math.hypot(best.point.x - stuck.x, best.point.y - stuck.y)
      ? spawn
      : best
  ));
  return {
    spawn: { x: nearest.point.x, y: nearest.point.y },
    velocity: stopped,
    route: [],
    cameraAnchor: { x: nearest.point.x, y: nearest.point.y },
    portal: null,
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
