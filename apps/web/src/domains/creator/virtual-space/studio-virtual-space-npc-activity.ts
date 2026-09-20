import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** Local scenery reservations only: these anchors never grant a human shared-seat lease. */
export interface StudioWorldNpcActivityAnchor {
  readonly id: string;
  readonly roomId: string;
  readonly approachPoint: StudioVirtualSpacePoint;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly exitPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly activity: "work" | "inspect" | "rest";
  readonly animation: "idle" | "talk" | "draw" | "review" | "sit";
  readonly minDurationMs: number;
  readonly maxDurationMs: number;
  /** A visual hip attachment; the actor's collision point always remains on the floor. */
  readonly seatAttachmentPoint?: StudioVirtualSpacePoint;
}

export type StudioNpcActivityStage = "approach" | "align" | "perform" | "exit";
const distance = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function studioNpcActivityTiledProperties(a: StudioWorldNpcActivityAnchor): Record<string, unknown> {
  return { roomId: a.roomId, facing: a.facing, activity: a.activity, animation: a.animation,
    minDurationMs: a.minDurationMs, maxDurationMs: a.maxDurationMs,
    anchorOffsetX: a.anchorPoint.x - a.approachPoint.x, anchorOffsetY: a.anchorPoint.y - a.approachPoint.y,
    exitOffsetX: a.exitPoint.x - a.approachPoint.x, exitOffsetY: a.exitPoint.y - a.approachPoint.y,
    ...(a.seatAttachmentPoint ? { seatOffsetX: a.seatAttachmentPoint.x - a.approachPoint.x, seatOffsetY: a.seatAttachmentPoint.y - a.approachPoint.y } : {}) };
}

export function validateStudioNpcActivityAnchors(anchors: unknown, world: {
  width: number; height: number; rooms: readonly { id: string }[];
  interactionSlots?: readonly { anchorPoint: StudioVirtualSpacePoint; seatAttachmentPoint?: StudioVirtualSpacePoint }[];
}, geometry: { canOccupy: (p: StudioVirtualSpacePoint) => boolean; connected: (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint) => boolean }): readonly string[] {
  if (anchors === undefined) return [];
  if (!Array.isArray(anchors)) return ["NPC activity anchors must be an array"];
  if (anchors.length > 64) return ["NPC activity anchor budget exceeded"];
  const errors: string[] = [], ids = new Set<string>();
  const pointValid = (p: unknown): p is StudioVirtualSpacePoint => Boolean(p && typeof p === "object"
    && typeof (p as StudioVirtualSpacePoint).x === "number" && typeof (p as StudioVirtualSpacePoint).y === "number"
    && Number.isFinite((p as StudioVirtualSpacePoint).x) && Number.isFinite((p as StudioVirtualSpacePoint).y)
    && (p as StudioVirtualSpacePoint).x >= 0 && (p as StudioVirtualSpacePoint).y >= 0
    && (p as StudioVirtualSpacePoint).x <= world.width && (p as StudioVirtualSpacePoint).y <= world.height);
  const keys = new Set(["id", "roomId", "approachPoint", "anchorPoint", "exitPoint", "facing", "activity", "animation", "minDurationMs", "maxDurationMs", "seatAttachmentPoint"]);
  for (const value of anchors) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push("NPC activity anchor is invalid"); continue; }
    const a = value as StudioWorldNpcActivityAnchor;
    if (Object.keys(a).some((key) => !keys.has(key))) errors.push(`NPC activity anchor has unknown fields: ${a.id}`);
    if (typeof a.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u.test(a.id) || ids.has(a.id)) errors.push(`NPC activity anchor id is invalid or duplicate: ${a.id}`);
    ids.add(a.id);
    if (!world.rooms.some((room) => room.id === a.roomId)) errors.push(`NPC activity anchor references missing room: ${a.id}`);
    if (!["down", "up", "left", "right"].includes(a.facing) || !["work", "inspect", "rest"].includes(a.activity)
      || !["idle", "talk", "draw", "review", "sit"].includes(a.animation)) errors.push(`NPC activity anchor action is invalid: ${a.id}`);
    if (!Number.isSafeInteger(a.minDurationMs) || !Number.isSafeInteger(a.maxDurationMs)
      || a.minDurationMs < 2500 || a.maxDurationMs < a.minDurationMs || a.maxDurationMs > 120000) errors.push(`NPC activity duration is invalid: ${a.id}`);
    const points = [a.approachPoint, a.anchorPoint, a.exitPoint];
    if (points.some((p) => !pointValid(p) || !geometry.canOccupy(p))) { errors.push(`NPC activity floor position is blocked: ${a.id}`); continue; }
    if (distance(a.approachPoint, a.anchorPoint) > 128 || distance(a.exitPoint, a.anchorPoint) > 128
      || !geometry.connected(a.approachPoint, a.anchorPoint) || !geometry.connected(a.anchorPoint, a.exitPoint)) errors.push(`NPC activity approach or exit is unreachable: ${a.id}`);
    if (a.seatAttachmentPoint !== undefined && (!pointValid(a.seatAttachmentPoint)
      || distance(a.seatAttachmentPoint, a.anchorPoint) > 128 || a.animation !== "sit")) errors.push(`NPC activity seat attachment is invalid: ${a.id}`);
    if (a.animation === "sit" && a.seatAttachmentPoint === undefined) errors.push(`NPC sitting requires an authored furniture attachment: ${a.id}`);
    if ((world.interactionSlots ?? []).some((slot) => slot && ((pointValid(slot.anchorPoint) && distance(slot.anchorPoint, a.anchorPoint) < 32)
      || (a.seatAttachmentPoint && pointValid(slot.seatAttachmentPoint) && distance(a.seatAttachmentPoint, slot.seatAttachmentPoint) < 40)))) {
      errors.push(`NPC activity overlaps a human shared seat: ${a.id}`);
    }
  }
  return errors;
}

/** Instance-scoped, expiring and bounded by authored anchors; never sent to collaboration. */
export class StudioNpcActivityReservations {
  private readonly held = new Map<string, { owner: string; expiresAt: number; point: StudioVirtualSpacePoint }>();
  reserve(anchor: StudioWorldNpcActivityAnchor, owner: string, people: readonly { point: StudioVirtualSpacePoint }[], now: number): boolean {
    for (const [id, value] of this.held) if (value.expiresAt <= now) this.held.delete(id);
    if (people.some((person) => distance(person.point, anchor.anchorPoint) < 48 || distance(person.point, anchor.approachPoint) < 36)) return false;
    if ([...this.held].some(([id, value]) => value.owner !== owner && (id === anchor.id || distance(value.point, anchor.anchorPoint) < 28))) return false;
    this.held.set(anchor.id, { owner, expiresAt: now + 30000, point: anchor.anchorPoint });
    return true;
  }
  release(owner: string): void { for (const [id, value] of this.held) if (value.owner === owner) this.held.delete(id); }
  clear(): void { this.held.clear(); }
  get size(): number { return this.held.size; }
}
