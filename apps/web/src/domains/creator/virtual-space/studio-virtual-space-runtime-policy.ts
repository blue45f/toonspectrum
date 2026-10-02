import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_FOLLOW_ARRIVE_SLACK_PX,
  findStudioFollowPoint,
} from "./studio-virtual-space-follow";
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
  return findStudioFollowPoint(manifest, current, person, STUDIO_WORLD_BESIDE_DISTANCE, false);
}

function besideDistance(current: StudioVirtualSpacePoint, person: StudioVirtualSpacePoint): number {
  return Math.hypot(current.x - person.x, current.y - person.y);
}

/**
 * Walk to an occupiable point beside a person. Follow keeps that point with them.
 * Direct steering or an explicit stop drops the route and the follow.
 *
 * T8 확장 옵션 (미지정 시 기존 동작 그대로):
 * - standOffPx: 대상과 유지할 거리(px). 기본은 바로 옆 32px.
 * - ignoreCollisions: 점유 판정을 건너뛰고 스탠드오프 링 지점을 그대로 쓴다.
 * - holdSlackPx: 도착으로 간주하는 추가 여유. 도슨트 대기에서 떨림을 막는다.
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
    readonly standOffPx?: number;
    readonly ignoreCollisions?: boolean;
    readonly holdSlackPx?: number;
  } = {},
): { readonly state: StudioWorldWalkOverState; readonly routeTarget: StudioVirtualSpacePoint | null; readonly follow: boolean } {
  if (options.direct || options.stop) {
    return { state: EMPTY_STUDIO_WORLD_WALK_OVER, routeTarget: null, follow: false };
  }
  // followTarget은 브리지가 들고 있는 현재 따라가기 대상이라 항상 권위 있다.
  // 지정돼 있으면 바로 물리고, 대상이 바뀌면 새 대상으로 전환한다. 예전에는
  // choice(아바타 클릭)로 먼저 물린 상태여야만 followTarget이 먹어서,
  // 버튼으로 시작한 따라가기는 상태 칩만 뜨고 아바타가 움직이지 않았다.
  const followed = options.followTarget ?? null;
  const subject = options.choice ?? followed;
  if (!subject) return { state, routeTarget: state.routeTarget, follow: state.follow };
  const standOffPx = options.standOffPx !== undefined && Number.isFinite(options.standOffPx) && options.standOffPx > 0
    ? options.standOffPx
    : STUDIO_WORLD_BESIDE_DISTANCE;
  const holdSlackPx = options.holdSlackPx !== undefined && Number.isFinite(options.holdSlackPx) && options.holdSlackPx > 0
    ? options.holdSlackPx
    : 0;
  if (besideDistance(current, subject.point) <= standOffPx + STUDIO_FOLLOW_ARRIVE_SLACK_PX + holdSlackPx) {
    const next = { follow: true, targetId: subject.id, routeTarget: null };
    return { state: next, routeTarget: null, follow: true };
  }
  const beside = options.ignoreCollisions || standOffPx !== STUDIO_WORLD_BESIDE_DISTANCE
    ? findStudioFollowPoint(manifest, current, subject.point, standOffPx, options.ignoreCollisions ?? false)
    : findStudioWorldBesidePoint(manifest, current, subject.point);
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
): { readonly id: string; readonly rect: ZoneRect; readonly privateZone: boolean } | null {
  const privateZone = (manifest.acousticZones ?? []).find((zone) => zone.policy === "private" && containsZone(zone, point));
  if (privateZone) return { id: privateZone.id, rect: privateZone, privateZone: true };
  const room = manifest.rooms.find((candidate) => containsZone(candidate, point));
  return room ? { id: room.id, rect: room, privateZone: false } : null;
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
    // 바깥을 어둡게 가리는 veil은 대화가 밖으로 새지 않는 프라이빗 구역에서만 쓴다.
    // 공개 구역(캠퍼스 방·산책로)에서는 주변이 계속 보여야 게더타운처럼 자연스럽게 오간다.
    separated: zone?.privateZone ?? false,
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

/**
 * 월드 입력을 막는 모달 선택자. HUD의 비모달 패널(`aria-modal="false"`,
 * `data-presentation="nonmodal"`)은 열려 있어도 걷기를 막지 않는다.
 * jsdom 호환을 위해 :modal 가상 클래스는 쓰지 않는다.
 */
export const STUDIO_WORLD_MODAL_BLOCKER_SELECTOR = 'dialog[open]:not([aria-modal="false"]):not([data-presentation="nonmodal"]),'
  + '[role="dialog"][aria-modal="true"],[data-studio-input-blocker="true"]';

/** This DOM scan belongs on mutations, not every Phaser render frame. */
export function studioWorldHasModalBlocker(
  document: Partial<Pick<Document, "querySelectorAll">>,
): boolean {
  const dialogs = document.querySelectorAll?.(STUDIO_WORLD_MODAL_BLOCKER_SELECTOR);
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
