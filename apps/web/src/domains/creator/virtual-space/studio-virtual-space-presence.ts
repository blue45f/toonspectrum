import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  STUDIO_VIRTUAL_SPACE_AVATAR_COUNT,
  STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS,
  STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  clampStudioVirtualSpacePoint,
  selectNearbyStudioVirtualPeers,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePeer,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpacePresenceState,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";

export const STUDIO_VIRTUAL_SPACE_WIRE = "toonspectrum-space-v1";
export const STUDIO_VIRTUAL_SPACE_PRESENCE_INTERVAL_MS = 150;
export const STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS = 2_500;
export const STUDIO_VIRTUAL_SPACE_STALE_MS = 10_000;
export const STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES = 1_024;
export const STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS = 2_400;

export type StudioVirtualSpaceReaction = "wave" | "heart" | "sparkles" | "thumbs-up";

export interface StudioVirtualSpaceReactionSnapshot {
  readonly sessionId: string;
  readonly reaction: StudioVirtualSpaceReaction;
  readonly expiresAt: number;
}

interface StudioVirtualSpacePresencePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly kind: "presence";
  readonly sequence: number;
  readonly at: number;
  readonly state: StudioVirtualSpacePresenceState;
}

interface StudioVirtualSpaceLeavePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly kind: "leave";
  readonly sequence: number;
  readonly at: number;
}

interface StudioVirtualSpaceReactionPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly kind: "reaction";
  readonly sequence: number;
  readonly at: number;
  readonly reaction: StudioVirtualSpaceReaction;
}

export type StudioVirtualSpacePacket =
  | StudioVirtualSpacePresencePacket
  | StudioVirtualSpaceLeavePacket
  | StudioVirtualSpaceReactionPacket;

export interface StudioVirtualSpaceSnapshot {
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly nearbyPeers: readonly StudioVirtualSpacePeer[];
  readonly selfReaction: StudioVirtualSpaceReaction | null;
  readonly peerReactions: readonly StudioVirtualSpaceReactionSnapshot[];
  readonly direct: boolean;
}

export interface StudioVirtualSpacePresenceDependencies {
  readonly now?: () => number;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

function isSafeZoneId(value: unknown): value is StudioVirtualSpaceZoneId {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && /^[a-z0-9][a-z0-9_-]*$/iu.test(value);
}
const FACINGS = new Set<StudioVirtualSpaceFacing>(["down", "left", "right", "up"]);
const ACTIVITIES = new Set<StudioVirtualSpaceActivity>(["available", "focused", "reviewing", "away"]);
const REACTIONS = new Set<StudioVirtualSpaceReaction>(["wave", "heart", "sparkles", "thumbs-up"]);

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000;
}

function packetBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseStudioVirtualSpacePacket(raw: string): StudioVirtualSpacePacket | null {
  if (typeof raw !== "string" || raw.length === 0 || packetBytes(raw) > STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES) {
    return null;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const packet = candidate as Record<string, unknown>;
  if (
    packet.wire !== STUDIO_VIRTUAL_SPACE_WIRE
    || (packet.kind !== "presence" && packet.kind !== "leave" && packet.kind !== "reaction")
    || !Number.isSafeInteger(packet.sequence)
    || Number(packet.sequence) < 0
    || !Number.isFinite(packet.at)
  ) {
    return null;
  }
  if (packet.kind === "leave") {
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "leave",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
    };
  }
  if (packet.kind === "reaction") {
    if (typeof packet.reaction !== "string" || !REACTIONS.has(packet.reaction as StudioVirtualSpaceReaction)) {
      return null;
    }
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "reaction",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      reaction: packet.reaction as StudioVirtualSpaceReaction,
    };
  }
  if (!packet.state || typeof packet.state !== "object" || Array.isArray(packet.state)) return null;
  const state = packet.state as Record<string, unknown>;
  if (
    !isFiniteCoordinate(state.x)
    || !isFiniteCoordinate(state.y)
    || !isSafeZoneId(state.zoneId)
    || typeof state.facing !== "string"
    || !FACINGS.has(state.facing as StudioVirtualSpaceFacing)
    || typeof state.activity !== "string"
    || !ACTIVITIES.has(state.activity as StudioVirtualSpaceActivity)
  ) {
    return null;
  }
  const point = clampStudioVirtualSpacePoint({ x: state.x, y: state.y });
  return {
    wire: STUDIO_VIRTUAL_SPACE_WIRE,
    kind: "presence",
    sequence: Number(packet.sequence),
    at: Number(packet.at),
    state: studioVirtualSpaceState(
      point,
      state.facing as StudioVirtualSpaceFacing,
      state.activity as StudioVirtualSpaceActivity,
      typeof state.moving === "boolean" ? state.moving : false,
      Number.isInteger(state.avatarIndex)
        && Number(state.avatarIndex) >= 0
        && Number(state.avatarIndex) < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
        ? Number(state.avatarIndex)
        : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
      state.zoneId as StudioVirtualSpaceZoneId,
    ),
  };
}

function encodePacket(packet: StudioVirtualSpacePacket): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES ? raw : null;
}

/**
 * Ephemeral spatial presence over the already-authorized RTC direct port.
 *
 * Nothing here is persisted or relayed through the application server. The server only remains
 * responsible for room admission/peer discovery; movement packets go browser-to-browser and are
 * discarded when the session ends.
 */
export class StudioVirtualSpacePresenceController {
  private self: StudioVirtualSpacePresenceState;
  private readonly peers = new Map<string, StudioVirtualSpacePeer>();
  private readonly peerReactions = new Map<string, StudioVirtualSpaceReactionSnapshot>();
  private readonly reactionSequences = new Map<string, number>();
  private selfReaction: StudioVirtualSpaceReactionSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private sequence = 0;
  private dirty = true;
  private lastSentAt = 0;
  private closed = false;
  private unsubscribe: (() => void) | null = null;
  private timer: unknown | null = null;

  constructor(
    private readonly participant: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    initialPoint: StudioVirtualSpacePoint,
    private readonly dependencies: StudioVirtualSpacePresenceDependencies = {},
  ) {
    this.self = studioVirtualSpaceState(initialPoint);
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private scheduleInterval(handler: () => void, delayMs: number): unknown {
    return this.dependencies.setInterval?.(handler, delayMs)
      ?? globalThis.setInterval(handler, delayMs);
  }

  private cancelInterval(handle: unknown): void {
    if (this.dependencies.clearInterval) {
      this.dependencies.clearInterval(handle);
      return;
    }
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
  }

  snapshot(): StudioVirtualSpaceSnapshot {
    const peers = [...this.peers.values()]
      .sort((left, right) =>
        left.participant.displayName.localeCompare(right.participant.displayName)
        || left.participant.sessionId.localeCompare(right.participant.sessionId)
      )
      .slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)
      .map((peer) => Object.freeze({ ...peer, state: Object.freeze({ ...peer.state }) }));
    const now = this.now();
    const peerReactions = [...this.peerReactions.values()]
      .filter((reaction) => reaction.expiresAt > now)
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      .map((reaction) => Object.freeze({ ...reaction }));
    return Object.freeze({
      self: Object.freeze({ ...this.self }),
      peers: Object.freeze(peers),
      nearbyPeers: Object.freeze(
        [...selectNearbyStudioVirtualPeers(this.self, peers, STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS)],
      ),
      selfReaction: this.selfReaction && this.selfReaction.expiresAt > now
        ? this.selfReaction.reaction
        : null,
      peerReactions: Object.freeze(peerReactions),
      direct: true,
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.closed || this.unsubscribe) return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.broadcast(true);
    this.timer = this.scheduleInterval(() => this.tick(), STUDIO_VIRTUAL_SPACE_PRESENCE_INTERVAL_MS);
    this.emit();
  }

  update(
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing = this.self.facing,
    activity: StudioVirtualSpaceActivity = this.self.activity,
    moving: boolean = this.self.moving,
    avatarIndex: number = this.self.avatarIndex,
    zoneId?: StudioVirtualSpaceZoneId,
  ): void {
    if (this.closed) return;
    const next = studioVirtualSpaceState(point, facing, activity, moving, avatarIndex, zoneId);
    if (
      next.x === this.self.x
      && next.y === this.self.y
      && next.zoneId === this.self.zoneId
      && next.facing === this.self.facing
      && next.activity === this.self.activity
      && next.moving === this.self.moving
      && next.avatarIndex === this.self.avatarIndex
    ) {
      return;
    }
    this.self = next;
    this.dirty = true;
    this.emit();
  }

  setActivity(activity: StudioVirtualSpaceActivity): void {
    this.update(this.self, this.self.facing, activity, this.self.moving, this.self.avatarIndex, this.self.zoneId);
  }

  setMoving(moving: boolean): void {
    this.update(this.self, this.self.facing, this.self.activity, moving, this.self.avatarIndex, this.self.zoneId);
  }

  setAvatarIndex(avatarIndex: number): void {
    this.update(this.self, this.self.facing, this.self.activity, this.self.moving, avatarIndex, this.self.zoneId);
  }

  sendReaction(reaction: StudioVirtualSpaceReaction): void {
    if (this.closed || !REACTIONS.has(reaction)) return;
    const now = this.now();
    this.selfReaction = Object.freeze({
      sessionId: this.participant.sessionId,
      reaction,
      expiresAt: now + STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
    });
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "reaction",
      sequence: ++this.sequence,
      at: now,
      reaction,
    });
    if (packet) {
      for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
        if (peer.sessionId !== this.participant.sessionId) {
          this.port.send(peer.sessionId, packet);
        }
      }
    }
    this.emit();
  }

  refresh(): void {
    if (this.closed) return;
    this.prune();
    this.broadcast(true);
    this.emit();
  }

  private tick(): void {
    if (this.closed) return;
    const changed = this.prune();
    const reactionsChanged = this.pruneReactions();
    const dueHeartbeat = this.now() - this.lastSentAt >= STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS;
    if (this.dirty || dueHeartbeat) this.broadcast(dueHeartbeat);
    if (changed || reactionsChanged) this.emit();
  }

  private availablePeerIds(): Set<string> {
    return new Set(
      this.port.getPeers()
        .filter((peer) => peer.sessionId !== this.participant.sessionId)
        .slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)
        .map((peer) => peer.sessionId),
    );
  }

  private prune(): boolean {
    const now = this.now();
    const available = this.availablePeerIds();
    let changed = false;
    for (const [sessionId, peer] of this.peers) {
      if (!available.has(sessionId) || now - peer.lastSeen > STUDIO_VIRTUAL_SPACE_STALE_MS) {
        this.peers.delete(sessionId);
        this.peerReactions.delete(sessionId);
        this.reactionSequences.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  private pruneReactions(): boolean {
    const now = this.now();
    let changed = false;
    if (this.selfReaction && this.selfReaction.expiresAt <= now) {
      this.selfReaction = null;
      changed = true;
    }
    for (const [sessionId, reaction] of this.peerReactions) {
      if (reaction.expiresAt <= now) {
        this.peerReactions.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  private broadcast(force = false): void {
    if (this.closed || (!this.dirty && !force)) return;
    const now = this.now();
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "presence",
      sequence: ++this.sequence,
      at: now,
      state: this.self,
    });
    if (!packet) return;
    for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
      if (peer.sessionId !== this.participant.sessionId) {
        this.port.send(peer.sessionId, packet);
      }
    }
    this.lastSentAt = now;
    this.dirty = false;
  }

  private receive(sender: StudioLiveParticipant, raw: string): void {
    if (this.closed || sender.sessionId === this.participant.sessionId) return;
    if (!this.availablePeerIds().has(sender.sessionId)) return;
    const packet = parseStudioVirtualSpacePacket(raw);
    if (!packet) return;

    if (packet.kind === "reaction") {
      const previousReactionSequence = this.reactionSequences.get(sender.sessionId) ?? -1;
      if (packet.sequence <= previousReactionSequence) return;
      this.reactionSequences.set(sender.sessionId, packet.sequence);
      this.peerReactions.set(sender.sessionId, Object.freeze({
        sessionId: sender.sessionId,
        reaction: packet.reaction,
        expiresAt: this.now() + STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
      }));
      this.emit();
      return;
    }

    const previous = this.peers.get(sender.sessionId);
    if (previous && packet.sequence <= previous.sequence) return;
    if (packet.kind === "leave") {
      if (previous || this.peerReactions.has(sender.sessionId)) {
        this.peers.delete(sender.sessionId);
        this.peerReactions.delete(sender.sessionId);
        this.reactionSequences.delete(sender.sessionId);
        this.emit();
      }
      return;
    }
    this.peers.set(sender.sessionId, {
      participant: sender,
      state: packet.state,
      lastSeen: this.now(),
      sequence: packet.sequence,
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  close(): void {
    if (this.closed) return;
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      kind: "leave",
      sequence: ++this.sequence,
      at: this.now(),
    });
    if (packet) {
      for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
        if (peer.sessionId !== this.participant.sessionId) {
          this.port.send(peer.sessionId, packet);
        }
      }
    }
    this.closed = true;
    if (this.timer !== null) this.cancelInterval(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.peers.clear();
    this.peerReactions.clear();
    this.reactionSequences.clear();
    this.selfReaction = null;
    this.listeners.clear();
  }
}
