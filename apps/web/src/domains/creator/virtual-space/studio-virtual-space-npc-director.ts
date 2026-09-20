import { studioCharacterSkinByKey, studioCharacterActionClip, type StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
import { StudioNpcActivityReservations, type StudioNpcActivityStage, type StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import { studioNpcGuideStops, type StudioNpcGuideStop, type StudioVirtualNpcGuideTourRequest, type StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { advanceStudioWorldPath } from "./studio-virtual-space-path-steering";
import { studioStableFacing } from "./studio-virtual-space-presentation";
import {
  studioWorldInteractions,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldNpcDefinition,
} from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

export type StudioNpcAtmosphere = "focus" | "balanced" | "lively";
export type StudioNpcRole = "guide" | "writer" | "artist" | "librarian" | "resident";
export type StudioNpcPhase = "work" | "inspect" | "rest" | "walk" | "yield" | "greet" | "wait";

export interface StudioNpcPerson {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly velocity?: StudioVirtualSpacePoint;
  readonly focused?: boolean;
}

export interface StudioNpcEnvironment {
  readonly people: readonly StudioNpcPerson[];
  readonly atmosphere: StudioNpcAtmosphere;
  readonly reducedMotion?: boolean;
  readonly focused?: boolean;
  readonly mobile?: boolean;
  readonly viewport?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface StudioNpcView {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly phase: StudioNpcPhase;
  readonly animation: StudioCharacterMotionState;
  readonly distance: number;
  readonly moving: boolean;
  readonly greeting: boolean;
  readonly activityAnchorId?: string;
  readonly activityStage: StudioNpcActivityStage | null;
  readonly seatAttachmentPoint?: StudioVirtualSpacePoint;
}

interface NpcActor {
  readonly definition: StudioWorldNpcDefinition;
  readonly anchors: readonly StudioVirtualSpacePoint[];
  readonly greetings: Map<string, number>;
  point: StudioVirtualSpacePoint;
  previous: StudioVirtualSpacePoint;
  velocity: StudioVirtualSpacePoint;
  facing: StudioVirtualSpaceFacing;
  phase: StudioNpcPhase;
  resumePhase: StudioNpcPhase;
  targetIndex: number;
  target: StudioVirtualSpacePoint | null;
  path: readonly StudioVirtualSpacePoint[];
  deadline: number;
  nextDecisionAt: number;
  nextAwarenessAt: number;
  threat: StudioNpcPerson | null;
  blockedSince: number | null;
  retries: number;
  seed: number;
  distance: number;
  moving: boolean;
  activity: StudioWorldNpcActivityAnchor | null;
  activityStage: StudioNpcActivityStage | null;
}

const FIXED_STEP = 1 / 60;
const DECISION_MS = 250;
const AWARENESS_MS = 1000 / 12;
const PERSON_CLEARANCE = 32;
const NPC_CLEARANCE = 23;
const ZERO = Object.freeze({ x: 0, y: 0 });
const distance = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const roles = {
  guide: { ko: "가이드", en: "Guide", workKo: "안내 준비 중", workEn: "Ready to help", action: "community" },
  writer: { ko: "작가", en: "Writer", workKo: "대본 정리 중", workEn: "Writing", action: "story" },
  artist: { ko: "작화가", en: "Artist", workKo: "그림 작업 중", workEn: "Drawing", action: "canvas" },
  librarian: { ko: "에셋 담당", en: "Librarian", workKo: "자료 정리 중", workEn: "Sorting assets", action: "assets" },
  resident: { ko: "스튜디오 멤버", en: "Studio resident", workKo: "작업 중", workEn: "Working", action: undefined },
} as const;

export function studioNpcMotionBudget(environment: StudioNpcEnvironment): { movers: number; routines: number } {
  const quiet = environment.atmosphere === "focus" || Boolean(environment.reducedMotion) || Boolean(environment.focused);
  const movers = quiet ? 1 : environment.atmosphere === "lively" ? environment.mobile ? 2 : 3 : environment.mobile ? 1 : 2;
  return { movers, routines: quiet ? 0 : Math.max(0, movers - Math.floor(environment.people.length / 8)) };
}

function availableAnimation(actor: NpcActor, requested: StudioCharacterMotionState): StudioCharacterMotionState {
  const skin = studioCharacterSkinByKey(actor.definition.skinKey);
  if (requested === "sit" || requested === "wave") return skin.poses?.[requested] ? requested : "idle";
  if (requested === "talk" || requested === "draw" || requested === "review") return skin.state?.[requested] || studioCharacterActionClip(skin, actor.facing, requested) ? requested : "idle";
  return requested;
}

/** Roles derive from the authored room, so both manifest and existing Tiled exports retain them. */
export function studioNpcRole(definition: StudioWorldNpcDefinition): StudioNpcRole {
  if (definition.roomId === "lounge") return "guide";
  if (definition.roomId === "writers") return "writer";
  if (definition.roomId === "drawing") return "artist";
  if (definition.roomId === "assets") return "librarian";
  return "resident";
}

export function studioNpcLabel(definition: StudioWorldNpcDefinition): { ko: string; en: string } {
  const role = roles[studioNpcRole(definition)];
  return { ko: `NPC · ${role.ko}`, en: `NPC · ${role.en}` };
}

export function studioNpcActivityLabel(definition: StudioWorldNpcDefinition, phase: StudioNpcPhase): { ko: string; en: string } {
  if (phase === "greet") return { ko: "안녕하세요!", en: "Hello!" };
  if (phase === "yield") return { ko: "길을 비켜드릴게요", en: "After you" };
  if (phase === "rest") return { ko: "잠깐 쉬는 중", en: "Taking a break" };
  if (phase === "inspect") return { ko: "자료 살펴보는 중", en: "Checking references" };
  if (phase === "walk") return { ko: "이동 중", en: "On the way" };
  if (phase === "wait") return { ko: "기다리는 중", en: "Waiting" };
  const role = roles[studioNpcRole(definition)];
  return { ko: role.workKo, en: role.workEn };
}

/** Only an existing, allowlisted world tool can be opened, and only by explicit selection. */
export function studioNpcInteraction(
  manifest: StudioVirtualSpaceWorldManifest,
  definition: StudioWorldNpcDefinition,
): StudioWorldInteractionDefinition | null {
  const action = roles[studioNpcRole(definition)].action;
  if (!action) return null;
  return studioWorldInteractions(manifest).find((interaction) => interaction.zoneId === definition.roomId && interaction.action === action) ?? null;
}

function seedFor(id: string): number {
  let seed = 2166136261;
  for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function random(actor: NpcActor): number {
  actor.seed = (Math.imul(actor.seed, 1664525) + 1013904223) >>> 0;
  return actor.seed / 0x100000000;
}

/** Cosmetic local actors never enter presence, lease a shared seat, or call an AI service. */
export class StudioNpcDirector {
  private readonly actors: NpcActor[];
  private accumulator = 0;
  private time = 0;
  private lastGreetingAt = -Infinity;
  private pathsThisStep = 0;
  private readonly reservations = new StudioNpcActivityReservations();
  private disposed = false;
  private tour: { request: StudioVirtualNpcGuideTourRequest; actor: NpcActor; personId: string;
    stops: readonly StudioNpcGuideStop[]; index: number; status: StudioVirtualNpcGuideTourState["status"]; deadline: number; blockedAt: number | null } | null = null;
  private lastTourState: StudioVirtualNpcGuideTourState | null = null;

  constructor(private readonly manifest: StudioVirtualSpaceWorldManifest) {
    // Invalid spawns are omitted, never silently teleported to the player's spawn.
    this.actors = manifest.npcs.slice(0, 8).filter((npc) => studioWorldCanOccupy(manifest, npc.point)).map((definition) => {
      const anchors = [definition.point, ...(definition.patrol ?? [])]
        .filter((point, index, all) => studioWorldCanOccupy(manifest, point)
          && all.findIndex((other) => distance(other, point) < 1) === index);
      const seed = seedFor(definition.id);
      return {
        definition, anchors, greetings: new Map(), point: { ...definition.point }, previous: { ...definition.point },
        velocity: ZERO, facing: definition.facing ?? "down", phase: definition.activityAnchorIds?.length ? "wait" : "work", resumePhase: "work",
        targetIndex: definition.activityAnchorIds?.length ? -1 : 0, target: null, path: [], deadline: definition.activityAnchorIds?.length ? 400 + seed % 1800 : 6500 + seed % 13000,
        nextDecisionAt: seed % DECISION_MS, nextAwarenessAt: 0, threat: null,
        blockedSince: null, retries: 0, seed, distance: 0, moving: false, activity: null, activityStage: null,
      };
    });
  }

  get views(): readonly StudioNpcView[] {
    const alpha = Math.min(1, this.accumulator / FIXED_STEP);
    return this.actors.map((actor) => {
      const role = studioNpcRole(actor.definition);
      const animation: StudioCharacterMotionState = actor.moving ? "walk"
        : actor.phase === "greet" ? "wave"
          : actor.activityStage === "perform" && actor.activity ? actor.activity.animation
          : actor.phase === "inspect" ? "review"
            : actor.phase === "work" && (role === "artist" || role === "writer") ? "draw"
              : actor.phase === "work" && ["talk", "draw", "review"].includes(actor.definition.behavior ?? "")
                ? actor.definition.behavior as StudioCharacterMotionState : "idle";
      return {
        id: actor.definition.id,
        point: { x: actor.previous.x + (actor.point.x - actor.previous.x) * alpha, y: actor.previous.y + (actor.point.y - actor.previous.y) * alpha },
        facing: actor.facing, phase: actor.phase, animation: availableAnimation(actor, animation), distance: actor.distance,
        moving: actor.moving, greeting: actor.phase === "greet",
        activityAnchorId: actor.activity?.id, activityStage: actor.activityStage,
        ...(actor.activityStage === "perform" && actor.activity?.animation === "sit" && availableAnimation(actor, "sit") === "sit"
          ? { seatAttachmentPoint: actor.activity.seatAttachmentPoint } : {}),
      };
    });
  }

  advance(deltaSeconds: number, environment: StudioNpcEnvironment): readonly StudioNpcView[] {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.views;
    // A suspended tab resumes in place; it does not run minutes of queued decisions.
    this.accumulator += Math.min(0.05, deltaSeconds);
    while (this.accumulator + 1e-9 >= FIXED_STEP) {
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      this.time += FIXED_STEP * 1000;
      this.pathsThisStep = 0;
      this.tick(environment);
    }
    return this.views;
  }

  get guideTourState(): StudioVirtualNpcGuideTourState | null {
    const tour = this.tour;
    return tour ? { requestId: tour.request.id, guideId: tour.actor.definition.id, status: tour.status,
      stopIndex: tour.index, stopCount: tour.stops.length, stopAction: tour.stops[tour.index]?.action } : this.lastTourState;
  }

  startGuideTour(request: StudioVirtualNpcGuideTourRequest, personId: string): void {
    if (this.disposed || this.guideTourState?.requestId === request.id) return;
    this.cancelGuideTour();
    const actor = this.actors.find((candidate) => candidate.definition.id === request.guideId && studioNpcRole(candidate.definition) === "guide");
    const stops = actor ? studioNpcGuideStops(this.manifest, actor.point) : [];
    if (!actor || stops.length === 0 || !request.id || request.id.length > 128 || !personId) {
      this.lastTourState = { requestId: request.id, guideId: request.guideId, status: "cancelled", stopIndex: 0, stopCount: 0 }; return;
    }
    this.releaseActivity(actor); this.clearRoute(actor); actor.phase = "wait";
    this.tour = { request, actor, personId, stops, index: 0, status: "waiting-for-user", deadline: 0, blockedAt: null };
  }

  cancelGuideTour(): void {
    if (!this.tour) return;
    this.lastTourState = { ...this.guideTourState!, status: "cancelled" };
    this.clearRoute(this.tour.actor); this.releaseActivity(this.tour.actor);
    this.tour.actor.phase = "rest"; this.tour.actor.deadline = this.time + 5000; this.tour = null;
  }

  dispose(): void {
    this.cancelGuideTour(); this.disposed = true; this.reservations.clear();
    for (const actor of this.actors) { this.clearRoute(actor); actor.activity = null; actor.activityStage = null; }
  }

  private releaseActivity(actor: NpcActor): void {
    this.reservations.release(actor.definition.id); actor.activity = null; actor.activityStage = null;
  }

  private activityTick(actor: NpcActor, environment: StudioNpcEnvironment, canMove: boolean): boolean {
    const ids = actor.definition.activityAnchorIds;
    if (!ids?.length) return false;
    if (actor.activity) {
      if (!this.reservations.reserve(actor.activity, actor.definition.id, environment.people, this.time)) {
        this.releaseActivity(actor); this.clearRoute(actor); actor.phase = "wait"; actor.deadline = this.time + 2500; return true;
      }
      if (actor.activityStage === "align" && !actor.target && this.time >= actor.deadline) {
        if (distance(actor.point, actor.activity.anchorPoint) > 2.5) {
          if (canMove) this.route(actor, actor.activity.anchorPoint, "walk");
        } else {
          actor.activityStage = "perform"; actor.phase = actor.activity.activity;
          actor.facing = actor.activity.facing;
          actor.deadline = this.time + actor.activity.minDurationMs + random(actor) * (actor.activity.maxDurationMs - actor.activity.minDurationMs);
        }
      } else if (actor.activityStage === "perform" && this.time >= actor.deadline && canMove) {
        if (this.route(actor, actor.activity.exitPoint, "walk")) actor.activityStage = "exit";
      }
      return true;
    }
    if (!canMove || this.time < actor.deadline || actor.threat) return true;
    const choices = ids.map((id, index) => ({ index, anchor: this.manifest.npcActivityAnchors?.find((a) => a.id === id) }))
      .filter((choice): choice is { index: number; anchor: StudioWorldNpcActivityAnchor } => Boolean(choice.anchor) && choice.index !== actor.targetIndex);
    if (!choices.length && actor.targetIndex >= 0) { actor.targetIndex = -1; return true; }
    const choice = actor.targetIndex > 0 && random(actor) < .72 ? choices.find((value) => value.index === 0) ?? choices[0]
      : choices[actor.targetIndex === -1 ? 0 : Math.floor(random(actor) * choices.length)];
    if (!choice || !this.reservations.reserve(choice.anchor, actor.definition.id, environment.people, this.time)) { actor.deadline = this.time + 2500; return true; }
    if (this.route(actor, choice.anchor.approachPoint, "walk")) {
      actor.activity = choice.anchor; actor.activityStage = "approach"; actor.targetIndex = choice.index;
    } else { this.reservations.release(actor.definition.id); actor.deadline = this.time + 2500; }
    return true;
  }

  private tourTick(actor: NpcActor, environment: StudioNpcEnvironment, canMove: boolean): boolean {
    const tour = this.tour;
    if (!tour || tour.actor !== actor) return false;
    const person = environment.people.find((candidate) => candidate.id === tour.personId);
    if (!person || person.focused || environment.focused || environment.atmosphere === "focus" || environment.reducedMotion) { this.cancelGuideTour(); return true; }
    if (actor.phase === "yield") return false;
    const gap = distance(person.point, actor.point), stop = tour.stops[tour.index]!;
    if (gap > (tour.status === "waiting-for-user" ? 90 : 125)) {
      this.clearRoute(actor); actor.phase = "wait"; tour.status = "waiting-for-user"; tour.blockedAt = null; return true;
    }
    if (distance(actor.point, stop.point) < 4) {
      this.clearRoute(actor); actor.phase = "wait";
      actor.facing = studioStableFacing({ x: person.point.x - actor.point.x, y: person.point.y - actor.point.y }, actor.facing);
      if (tour.status !== "at-stop") { tour.status = "at-stop"; tour.deadline = this.time + 2500; }
      if (this.time >= tour.deadline && distance(person.point, stop.point) < 95) {
        if (tour.index + 1 === tour.stops.length) {
          this.lastTourState = { ...this.guideTourState!, status: "complete" }; this.tour = null;
          actor.phase = "rest"; actor.deadline = this.time + 5000;
        } else { tour.index++; tour.status = "waiting-for-user"; }
      }
      return true;
    }
    if (actor.target) {
      tour.status = "walking"; this.move(actor, environment);
      if (!actor.moving) tour.blockedAt ??= this.time; else tour.blockedAt = null;
      if (tour.blockedAt !== null && this.time - tour.blockedAt > 8000) this.cancelGuideTour();
      return true;
    }
    if (canMove && this.time >= actor.nextDecisionAt) {
      actor.nextDecisionAt = this.time + DECISION_MS;
      if (this.route(actor, stop.point, "walk")) tour.status = "walking";
      else { tour.blockedAt ??= this.time; if (this.time - tour.blockedAt > 8000) this.cancelGuideTour(); }
    }
    return true;
  }

  private clearRoute(actor: NpcActor): void {
    actor.path = []; actor.target = null; actor.velocity = ZERO; actor.moving = false;
    actor.blockedSince = null;
  }

  private route(actor: NpcActor, point: StudioVirtualSpacePoint, phase: "walk" | "yield"): boolean {
    if (this.pathsThisStep >= 1) return false;
    this.pathsThisStep += 1;
    const path = findStudioWorldPath(this.manifest, actor.point, point);
    if (!path.length || distance(path.at(-1)!, point) > 3) return false;
    actor.path = path; actor.target = point; actor.phase = phase;
    actor.blockedSince = null; actor.retries = 0;
    return true;
  }

  private segmentClear(from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 3));
    for (let i = 1; i <= steps; i++) {
      if (!studioWorldCanOccupy(this.manifest, { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps })) return false;
    }
    return true;
  }

  private closestThreat(actor: NpcActor, people: readonly StudioNpcPerson[]): StudioNpcPerson | null {
    let threat: StudioNpcPerson | null = null;
    let nearest = Infinity;
    for (const person of people) {
      const velocity = person.velocity ?? ZERO;
      const predicted = { x: person.point.x + velocity.x * 0.3, y: person.point.y + velocity.y * 0.3 };
      const gap = Math.min(distance(actor.point, person.point), distance(actor.point, predicted));
      if (gap < 46 && gap < nearest) { nearest = gap; threat = person; }
    }
    return threat;
  }

  private yieldPoint(actor: NpcActor, person: StudioNpcPerson, people: readonly StudioNpcPerson[]): StudioVirtualSpacePoint | null {
    const velocity = person.velocity ?? ZERO;
    const heading = Math.hypot(velocity.x, velocity.y) > 5
      ? Math.atan2(velocity.y, velocity.x) + Math.PI / 2
      : Math.atan2(actor.point.y - person.point.y, actor.point.x - person.point.x);
    for (const radius of [34, 52]) {
      for (const offset of [0, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
        const point = { x: actor.point.x + Math.cos(heading + offset) * radius, y: actor.point.y + Math.sin(heading + offset) * radius };
        if (distance(point, person.point) < 52 || !this.segmentClear(actor.point, point)) continue;
        if (people.some((other) => distance(point, other.point) < PERSON_CLEARANCE + 4)) continue;
        if (this.actors.some((other) => other !== actor && distance(point, other.point) < NPC_CLEARANCE + 4)) continue;
        return point;
      }
    }
    return null;
  }

  private tick(environment: StudioNpcEnvironment): void {
    const quiet = environment.atmosphere === "focus" || Boolean(environment.reducedMotion) || Boolean(environment.focused);
    const { movers: moverLimit, routines: routineLimit } = studioNpcMotionBudget(environment);
    if (quiet) this.cancelGuideTour();
    let activeMovers = this.actors.filter((actor) => actor.phase === "walk" || actor.phase === "yield").length;
    let activeRoutines = this.actors.filter((actor) => actor.phase === "walk" && this.tour?.actor !== actor).length;
    for (const actor of [...this.actors].reverse()) {
      if (activeMovers <= moverLimit && activeRoutines <= routineLimit) break;
      if (actor.phase !== "walk" || this.tour?.actor === actor) continue;
      this.clearRoute(actor); this.releaseActivity(actor); actor.phase = "rest"; actor.deadline = this.time + 5000; activeMovers--;
      activeRoutines--;
    }
    for (const actor of this.actors) {
      actor.previous = actor.point;
      const viewport = environment.viewport;
      const offscreen = viewport && (actor.point.x < viewport.x - 100 || actor.point.y < viewport.y - 100
        || actor.point.x > viewport.x + viewport.width + 100 || actor.point.y > viewport.y + viewport.height + 100);
      if (offscreen && this.tour?.actor !== actor && !environment.people.some((person) => distance(person.point, actor.point) < 100)) {
        if (actor.phase === "walk" || actor.phase === "yield") activeMovers--;
        this.clearRoute(actor); this.releaseActivity(actor); actor.phase = "rest"; actor.deadline = this.time + 1000; continue;
      }
      if (this.time >= actor.nextAwarenessAt) {
        actor.nextAwarenessAt = this.time + AWARENESS_MS;
        actor.threat = this.closestThreat(actor, environment.people);
      }
      if ((quiet || environment.focused) && actor.phase === "greet") { actor.phase = actor.resumePhase; actor.deadline = this.time + 8000; }
      if (quiet && actor.phase === "walk") { this.clearRoute(actor); this.releaseActivity(actor); actor.phase = "rest"; actor.deadline = this.time + 5000; activeMovers--; }
      if (actor.threat && actor.phase !== "walk" && actor.phase !== "yield" && activeMovers >= moverLimit) {
        const routine = this.actors.find((other) => other !== actor && other.phase === "walk" && this.tour?.actor !== other);
        if (routine) { this.clearRoute(routine); this.releaseActivity(routine); routine.phase = "wait"; routine.deadline = this.time + 2000; activeMovers--; }
      }
      if (actor.threat && actor.phase !== "yield" && (actor.phase === "walk" || activeMovers < moverLimit)) {
        const wasWalking = actor.phase === "walk";
        const point = this.yieldPoint(actor, actor.threat, environment.people);
        if (point && this.route(actor, point, "yield")) { this.releaseActivity(actor); if (!wasWalking) activeMovers++; }
      }
      const routedBeforeTour = actor.phase === "walk" || actor.phase === "yield";
      if (this.tourTick(actor, environment, activeMovers < moverLimit || routedBeforeTour)) {
        if (!routedBeforeTour && actor.target) activeMovers++;
        continue;
      }
      if (actor.activity) {
        const routed = actor.phase === "walk";
        this.activityTick(actor, environment, !quiet && (routed || activeMovers < routineLimit));
        if (!routed && actor.target) activeMovers++;
      }
      if (actor.phase === "walk" || actor.phase === "yield") {
        this.move(actor, environment);
        continue;
      }
      actor.velocity = ZERO; actor.moving = false;
      if (this.time < actor.nextDecisionAt) continue;
      actor.nextDecisionAt = this.time + DECISION_MS;
      if (actor.phase === "greet") {
        if (this.time >= actor.deadline) { actor.phase = actor.resumePhase; actor.deadline = this.time + 4000; }
        continue;
      }
      if (!quiet && !actor.activity && !actor.threat && this.time - this.lastGreetingAt >= 8000) {
        const person = environment.people.find((candidate) => !candidate.focused
          && distance(actor.point, candidate.point) < 90
          && Math.hypot(candidate.velocity?.x ?? 0, candidate.velocity?.y ?? 0) < 8
          && this.time >= (actor.greetings.get(candidate.id) ?? 3000));
        if (person) {
          actor.resumePhase = actor.phase; actor.phase = "greet"; actor.deadline = this.time + 1600;
          actor.facing = studioStableFacing({ x: person.point.x - actor.point.x, y: person.point.y - actor.point.y }, actor.facing);
          actor.greetings.set(person.id, this.time + 45000 + random(actor) * 15000);
          // Bound old identities in long local sessions.
          if (actor.greetings.size > 32) actor.greetings.delete(actor.greetings.keys().next().value!);
          this.lastGreetingAt = this.time;
          continue;
        }
      }
      if (this.activityTick(actor, environment, !quiet && activeMovers < routineLimit)) {
        if (actor.target) activeMovers++;
        continue;
      }
      if (quiet || this.time < actor.deadline || actor.anchors.length < 2 || activeMovers >= routineLimit) continue;
      const choices = actor.anchors.map((_, index) => index).filter((index) => index !== actor.targetIndex);
      // Work is the home anchor; observations and breaks interrupt it without an endless lap.
      const nextIndex = actor.targetIndex > 0 && random(actor) < 0.72 ? 0 : choices[Math.floor(random(actor) * choices.length)]!;
      const target = actor.anchors[nextIndex]!;
      if (environment.people.some((person) => distance(person.point, target) < 48)
        || this.actors.some((other) => other !== actor && (distance(other.point, target) < 28 || (other.target && distance(other.target, target) < 28)))) {
        actor.deadline = this.time + 2000 + random(actor) * 2000;
        continue;
      }
      if (this.route(actor, target, "walk")) { actor.targetIndex = nextIndex; activeMovers++; }
      else actor.deadline = this.time + 2000 + random(actor) * 3000;
    }
  }

  private move(actor: NpcActor, environment: StudioNpcEnvironment): void {
    if (!actor.target) { this.clearRoute(actor); actor.phase = "wait"; actor.deadline = this.time + 3000; return; }
    if (distance(actor.point, actor.target) <= 2.5) {
      const yielded = actor.phase === "yield";
      this.clearRoute(actor);
      if (actor.activity) {
        actor.phase = "wait";
        if (actor.activityStage === "approach") { actor.activityStage = "align"; actor.deadline = this.time + 350; }
        else if (actor.activityStage === "align") { actor.facing = actor.activity.facing; actor.deadline = this.time + 350; }
        else if (actor.activityStage === "exit") { this.releaseActivity(actor); actor.phase = "rest"; actor.deadline = this.time + 500; }
        return;
      }
      actor.phase = yielded ? "rest" : actor.targetIndex === 0 ? "work" : actor.targetIndex % 2 === 0 ? "rest" : "inspect";
      actor.facing = actor.definition.facing ?? actor.facing;
      actor.deadline = this.time + (yielded ? 2500 : actor.phase === "work" ? 20000 + random(actor) * 18000 : 7000 + random(actor) * 9000);
      return;
    }
    const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
    actor.path = advanceStudioWorldPath(this.manifest, actor.point, actor.path, speed);
    while (actor.path.length > 1 && distance(actor.point, actor.path[0]!) < 3) actor.path = actor.path.slice(1);
    const target = actor.path[0] ?? actor.target;
    const dx = target.x - actor.point.x, dy = target.y - actor.point.y;
    const gap = Math.hypot(dx, dy);
    const maxSpeed = Math.min(90, actor.definition.speed ?? 62);
    const config = { ...DEFAULT_STUDIO_MOTION_CONFIG, maxSpeed };
    const arrival = Math.min(1, distance(actor.point, actor.target) / 12);
    const motion = stepStudioVirtualSpaceMotion({ velocity: actor.velocity }, { x: dx / Math.max(1, gap) * arrival, y: dy / Math.max(1, gap) * arrival }, FIXED_STEP, config);
    let next = { x: actor.point.x + motion.velocity.x * FIXED_STEP, y: actor.point.y + motion.velocity.y * FIXED_STEP };
    // Grid smoothing can graze a rounded collider corner. Project the tiny fixed step
    // onto a clear axis, like the player's Arcade body, instead of retrying that same chord forever.
    if (!this.segmentClear(actor.point, next)) {
      const slide = [
        { x: next.x, y: actor.point.y },
        { x: actor.point.x, y: next.y },
        // Finish a subpixel alignment before sliding along an exactly tangent wall.
        // Otherwise normalized steering can approach that coordinate forever.
        ...(Math.abs(target.x - actor.point.x) <= 0.5 ? [{ x: target.x, y: actor.point.y }] : []),
        ...(Math.abs(target.y - actor.point.y) <= 0.5 ? [{ x: actor.point.x, y: target.y }] : []),
      ].filter((point) => distance(point, actor.point) > 0.001 && this.segmentClear(actor.point, point)
        && distance(point, target) < distance(actor.point, target))
        .sort((left, right) => distance(left, target) - distance(right, target))[0];
      if (slide) next = slide;
    }
    // Real people always win. NPCs have no solid body in the player's physics world.
    const personBlocked = environment.people.some((person) => distance(next, person.point) < PERSON_CLEARANCE
      && distance(next, person.point) <= distance(actor.point, person.point));
    const npcBlocked = this.actors.some((other) => other !== actor && distance(next, other.point) < NPC_CLEARANCE
      && distance(next, other.point) <= distance(actor.point, other.point));
    if (personBlocked || npcBlocked || !this.segmentClear(actor.point, next)) {
      actor.velocity = ZERO; actor.moving = false;
      actor.blockedSince ??= this.time;
      if (this.time - actor.blockedSince > 1000 && this.pathsThisStep === 0) {
        if (actor.retries >= 2 || personBlocked || npcBlocked) {
          this.clearRoute(actor); this.releaseActivity(actor); actor.phase = "wait"; actor.deadline = this.time + 2500 + random(actor) * 2500;
        } else {
          this.pathsThisStep++;
          actor.path = findStudioWorldPath(this.manifest, actor.point, actor.target);
          actor.blockedSince = this.time; actor.retries++;
        }
      }
      return;
    }
    actor.velocity = { x: (next.x - actor.point.x) / FIXED_STEP, y: (next.y - actor.point.y) / FIXED_STEP };
    const traveled = distance(actor.point, next);
    actor.distance += traveled; actor.moving = traveled > 0.005;
    actor.point = next; actor.blockedSince = null;
    if (actor.moving) actor.facing = studioStableFacing(actor.velocity, actor.facing);
  }
}
