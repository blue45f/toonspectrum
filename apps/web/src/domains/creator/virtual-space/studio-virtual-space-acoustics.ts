import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";

export interface StudioWorldAcousticZoneDefinition {
  readonly id: string;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: "public" | "private";
  /** A declared door requires an authoritative adapter; absence of a grant is never open. */
  readonly doorId?: string;
}
interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface AcousticWorldGeometry {
  readonly width: number;
  readonly height: number;
  readonly rooms: readonly (Rect & { readonly id: string })[];
}
export interface StudioAcousticWorld extends AcousticWorldGeometry {
  readonly worldId: string;
  readonly contentRevision: string;
  readonly acousticZones?: readonly StudioWorldAcousticZoneDefinition[];
}
export type StudioAcousticReason = "allowed" | "unavailable" | "invalid-world" | "unknown-zone" | "different-zone"
  | "authority-required" | "stale-peer" | "out-of-range" | "stabilizing";
export interface StudioAcousticDecision {
  readonly allowed: boolean;
  readonly zoneId: string | null;
  readonly reason: StudioAcousticReason;
}
export interface StudioAcousticPolicyPort {
  readonly world: Pick<StudioAcousticWorld, "worldId" | "contentRevision">;
  check(memberIds: readonly string[], phase: "enter" | "retain", expectedZoneId?: string): StudioAcousticDecision;
  subscribe(listener: () => void): () => void;
  /** Keep hysteresis state for an unfinished/active consent until its terminal transition. */
  acquireScope?(memberIds: readonly string[]): () => void;
}
export const STUDIO_ACOUSTIC_ENTER_RADIUS = 120;
export const STUDIO_ACOUSTIC_EXIT_RADIUS = 156;
export const STUDIO_ACOUSTIC_ENTER_MS = 300;
export const STUDIO_ACOUSTIC_EXIT_MS = 800;
const MAX_CANDIDATES = 128;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const KEYS = new Set(["id", "roomId", "x", "y", "width", "height", "policy", "doorId"]);
const validRect = (rect: Rect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const within = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const contains = (rect: Rect, point: { x: number; y: number }) => Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;

/** Optional for legacy import only. Missing zones grant no runtime acoustic membership. */
export function validateStudioWorldAcousticZones(zones: unknown, world: AcousticWorldGeometry): readonly string[] {
  if (zones === undefined) return [];
  if (!Array.isArray(zones) || zones.length > 64) return ["Acoustic zones must be an array of at most 64 definitions."];
  const errors: string[] = [], ids = new Set<string>(), accepted: StudioWorldAcousticZoneDefinition[] = [];
  const bounds = { x: 0, y: 0, width: world.width, height: world.height };
  for (const raw of zones) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push("Invalid acoustic zone."); continue; }
    const zone = raw as StudioWorldAcousticZoneDefinition;
    const room = world.rooms.find((item) => item.id === zone.roomId);
    if (Object.keys(raw).some((key) => !KEYS.has(key)) || typeof zone.id !== "string" || typeof zone.roomId !== "string" || !ID.test(zone.id) || !ID.test(zone.roomId)
      || ids.has(zone.id) || !validRect(zone) || !validRect(bounds) || !within(bounds, zone)
      || !room || !validRect(room) || !within(room, zone)
      || (zone.policy !== "public" && zone.policy !== "private")
      || (zone.doorId !== undefined && (typeof zone.doorId !== "string" || !ID.test(zone.doorId)))) {
      errors.push("Invalid, duplicate, or out-of-room acoustic zone."); continue;
    }
    if (accepted.some((other) => Math.max(zone.x, other.x) < Math.min(zone.x + zone.width, other.x + other.width)
      && Math.max(zone.y, other.y) < Math.min(zone.y + zone.height, other.y + other.height))) errors.push("Acoustic zones must not overlap.");
    ids.add(zone.id); accepted.push(zone);
  }
  return errors;
}

/** Strict half-open geometry. Never substitutes a first room, lounge, or untrusted presence zoneId. */
export function resolveStudioAcousticZone(zones: readonly StudioWorldAcousticZoneDefinition[], point: { x: number; y: number }): StudioWorldAcousticZoneDefinition | null {
  const matches = zones.filter((zone) => contains(zone, point));
  return matches.length === 1 ? matches[0]! : null;
}

interface Candidate { zoneId: string; enteredAt: number | null; outsideAt: number | null; references: number }
/**
 * Public spatial policy over authenticated presence and an immutable world hash. Private rooms
 * and declared doors deliberately require a future real authority adapter, never a P2P claim.
 * Consent remains in the social/conversation controllers. This module never captures media.
 */
export class StudioVirtualSpaceAcousticPolicy implements StudioAcousticPolicyPort {
  readonly world: StudioAcousticWorld;
  private readonly valid: boolean;
  private presence: StudioVirtualSpaceSnapshot | undefined;
  private bindingAvailable = false;
  private readonly candidates = new Map<string, Candidate>();
  private readonly listeners = new Set<() => void>();
  constructor(world: StudioAcousticWorld, private readonly selfId: string,
    private readonly dependencies: { now?: () => number; wallNow?: () => number } = {}) {
    this.world = Object.freeze({ ...world, rooms: Object.freeze(world.rooms.map((room) => Object.freeze({ ...room }))),
      acousticZones: Array.isArray(world.acousticZones) ? Object.freeze(world.acousticZones.map((zone) => Object.freeze({ ...zone }))) : undefined });
    this.valid = Boolean(world.worldId && /^[a-f0-9]{64}$/u.test(world.contentRevision)
      && world.acousticZones?.length && validateStudioWorldAcousticZones(world.acousticZones, world).length === 0);
  }
  update(presence: StudioVirtualSpaceSnapshot | undefined, bindingAvailable: boolean): void {
    this.presence = presence; this.bindingAvailable = bindingAvailable;
    if (!bindingAvailable || !presence?.direct) this.candidates.clear();
    // Seed only local peer candidates from actual observations, not from a user's first click.
    // Each group member independently stabilizes its own edges before voting.
    if (presence?.direct && bindingAvailable) for (const peer of presence.peers.slice(0, 23)) this.check([this.selfId, peer.participant.sessionId], "retain");
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  acquireScope(memberIds: readonly string[]): () => void {
    const candidate = this.candidates.get(JSON.stringify([...memberIds].sort()));
    if (!candidate) return () => undefined;
    candidate.references++;
    let released = false;
    return () => { if (!released) { released = true; candidate.references--; } };
  }
  check(memberIds: readonly string[], phase: "enter" | "retain", expectedZoneId?: string): StudioAcousticDecision {
    const ids = [...memberIds].sort(), key = JSON.stringify(ids);
    const deny = (reason: StudioAcousticReason, clear = true): StudioAcousticDecision => {
      if (clear) this.candidates.delete(key);
      return { allowed: false, zoneId: null, reason };
    };
    if (!this.valid) return deny("invalid-world");
    if (!this.presence?.direct || !this.bindingAvailable || !ids.includes(this.selfId) || ids.length < 2 || ids.length > 4
      || new Set(ids).size !== ids.length) return deny("unavailable");
    const wallNow = this.dependencies.wallNow?.() ?? Date.now();
    const points = [];
    for (const id of ids) {
      const peer = id === this.selfId ? null : this.presence.peers.find((item) => item.participant.sessionId === id);
      if (id !== this.selfId && (!peer || !Number.isFinite(wallNow) || !Number.isFinite(peer.lastSeen) || wallNow < peer.lastSeen || wallNow - peer.lastSeen >= 10_000)) return deny("stale-peer");
      const state = id === this.selfId ? this.presence.self : peer!.state;
      if (state.activity === "away" || state.activity === "focused") return deny("unavailable");
      points.push(state);
    }
    const zones = points.map((point) => resolveStudioAcousticZone(this.world.acousticZones!, point));
    if (zones.some((zone) => !zone)) return deny("unknown-zone");
    const zone = zones[0]!;
    if (zones.some((item) => item!.id !== zone.id) || (expectedZoneId !== undefined && expectedZoneId !== zone.id)) return deny("different-zone");
    if (zone.policy !== "public" || zone.doorId !== undefined) return deny("authority-required");
    if (ids.length > 2 && phase === "enter") {
      for (const id of ids) {
        if (id === this.selfId) continue;
        const edge = this.check([this.selfId, id], "enter", expectedZoneId);
        if (!edge.allowed) return deny(edge.reason);
      }
    }
    let distance = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) distance = Math.max(distance, Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y));
    const now = this.dependencies.now?.() ?? performance.now();
    let candidate = this.candidates.get(key);
    if (!candidate || candidate.zoneId !== zone.id) {
      if (this.candidates.size >= MAX_CANDIDATES) {
        const disposable = [...this.candidates].find(([, item]) => item.references === 0);
        if (!disposable) return deny("unavailable", false);
        this.candidates.delete(disposable[0]);
      }
      candidate = { zoneId: zone.id, enteredAt: null, outsideAt: null, references: 0 }; this.candidates.set(key, candidate);
    }
    if (distance <= STUDIO_ACOUSTIC_ENTER_RADIUS) candidate.enteredAt ??= now;
    else candidate.enteredAt = null;
    if (distance <= STUDIO_ACOUSTIC_EXIT_RADIUS) candidate.outsideAt = null;
    else candidate.outsideAt ??= now;
    if (phase === "enter") {
      if (candidate.enteredAt === null) return deny("out-of-range", false);
      if (now < candidate.enteredAt || (ids.length === 2 && now - candidate.enteredAt < STUDIO_ACOUSTIC_ENTER_MS)) return deny("stabilizing", false);
    } else if (candidate.outsideAt !== null && (now < candidate.outsideAt || now - candidate.outsideAt >= STUDIO_ACOUSTIC_EXIT_MS)) return deny("out-of-range", false);
    return { allowed: true, zoneId: zone.id, reason: "allowed" };
  }
}

export function studioAcousticScope(guard: StudioAcousticPolicyPort | undefined,
  world: Pick<StudioAcousticWorld, "worldId" | "contentRevision">, memberIds: readonly string[], phase: "enter" | "retain", expectedZoneId?: string): string | null {
  // Legacy controller consumers have no spatial mode. Production hooks always supply a guard.
  if (!guard) return "legacy-public";
  if (guard.world.worldId !== world.worldId || guard.world.contentRevision !== world.contentRevision) return null;
  const decision = guard.check(memberIds, phase, expectedZoneId);
  return decision.allowed ? decision.zoneId : null;
}
