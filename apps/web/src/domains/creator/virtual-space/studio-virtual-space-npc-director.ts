import type { StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
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

  constructor(private readonly manifest: StudioVirtualSpaceWorldManifest) {
    // Invalid spawns are omitted, never silently teleported to the player's spawn.
    this.actors = manifest.npcs.slice(0, 8).filter((npc) => studioWorldCanOccupy(manifest, npc.point)).map((definition) => {
      const anchors = [definition.point, ...(definition.patrol ?? [])]
        .filter((point, index, all) => studioWorldCanOccupy(manifest, point)
          && all.findIndex((other) => distance(other, point) < 1) === index);
      const seed = seedFor(definition.id);
      return {
        definition, anchors, greetings: new Map(), point: { ...definition.point }, previous: { ...definition.point },
        velocity: ZERO, facing: definition.facing ?? "down", phase: "work", resumePhase: "work",
        targetIndex: 0, target: null, path: [], deadline: 6500 + seed % 13000,
        nextDecisionAt: seed % DECISION_MS, nextAwarenessAt: 0, threat: null,
        blockedSince: null, retries: 0, seed, distance: 0, moving: false,
      };
    });
  }

  get views(): readonly StudioNpcView[] {
    const alpha = Math.min(1, this.accumulator / FIXED_STEP);
    return this.actors.map((actor) => {
      const role = studioNpcRole(actor.definition);
      const animation: StudioCharacterMotionState = actor.moving ? "walk"
        : actor.phase === "greet" ? "talk"
          : actor.phase === "inspect" ? "review"
            : actor.phase === "work" && (role === "artist" || role === "writer") ? "draw"
              : actor.phase === "work" && ["talk", "draw", "review"].includes(actor.definition.behavior ?? "")
                ? actor.definition.behavior as StudioCharacterMotionState : "idle";
      return {
        id: actor.definition.id,
        point: { x: actor.previous.x + (actor.point.x - actor.previous.x) * alpha, y: actor.previous.y + (actor.point.y - actor.previous.y) * alpha },
        facing: actor.facing, phase: actor.phase, animation, distance: actor.distance,
        moving: actor.moving, greeting: actor.phase === "greet",
      };
    });
  }

  advance(deltaSeconds: number, environment: StudioNpcEnvironment): readonly StudioNpcView[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.views;
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
    const quiet = environment.atmosphere === "focus" || Boolean(environment.reducedMotion);
    const moverLimit = quiet ? 1 : environment.atmosphere === "lively" ? 3 : 2;
    // A crowded room spends its motion budget on people. Yielding remains possible.
    const routineLimit = quiet ? 0 : Math.max(1, moverLimit - Math.floor(environment.people.length / 8));
    let activeMovers = this.actors.filter((actor) => actor.phase === "walk" || actor.phase === "yield").length;
    for (const actor of [...this.actors].reverse()) {
      if (activeMovers <= moverLimit) break;
      if (actor.phase !== "walk") continue;
      this.clearRoute(actor); actor.phase = "rest"; actor.deadline = this.time + 5000; activeMovers--;
    }
    for (const actor of this.actors) {
      actor.previous = actor.point;
      if (this.time >= actor.nextAwarenessAt) {
        actor.nextAwarenessAt = this.time + AWARENESS_MS;
        actor.threat = this.closestThreat(actor, environment.people);
      }
      if ((quiet || environment.focused) && actor.phase === "greet") { actor.phase = actor.resumePhase; actor.deadline = this.time + 8000; }
      if (quiet && actor.phase === "walk") { this.clearRoute(actor); actor.phase = "rest"; actor.deadline = this.time + 5000; activeMovers--; }
      if (actor.threat && actor.phase !== "yield" && (actor.phase === "walk" || activeMovers < moverLimit)) {
        const wasWalking = actor.phase === "walk";
        const point = this.yieldPoint(actor, actor.threat, environment.people);
        if (point && this.route(actor, point, "yield") && !wasWalking) activeMovers++;
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
      if (!quiet && !environment.focused && !actor.threat && this.time - this.lastGreetingAt >= 8000) {
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
          this.clearRoute(actor); actor.phase = "wait"; actor.deadline = this.time + 2500 + random(actor) * 2500;
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
