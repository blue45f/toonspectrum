import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";

export const STUDIO_P2P_SPACE_HEARTBEAT_MS = 4_000;
export const STUDIO_P2P_SPACE_STALE_MS = 12_000;
export const STUDIO_P2P_SPACE_MIN_MOVE_BROADCAST_MS = 90;
export const STUDIO_P2P_SPACE_PROXIMITY_RADIUS = 24;
const STUDIO_P2P_SPACE_MAX_FRAME_BYTES = 4 * 1024;

export const STUDIO_P2P_SPACE_ZONES = [
  { id: "lobby", label: "Project Lobby", x: 2, y: 3, width: 30, height: 28 },
  { id: "writers", label: "Writers Room", x: 35, y: 3, width: 28, height: 28 },
  { id: "storyboard", label: "Storyboard Wall", x: 66, y: 3, width: 32, height: 28 },
  { id: "drawing", label: "Drawing Studio", x: 2, y: 35, width: 45, height: 62 },
  { id: "review", label: "Review Room", x: 50, y: 35, width: 24, height: 62 },
  { id: "lounge", label: "Creator Lounge", x: 77, y: 35, width: 21, height: 62 },
] as const;

export type StudioP2pSpaceZoneId = (typeof STUDIO_P2P_SPACE_ZONES)[number]["id"];
export type StudioP2pSpaceActivity = "available" | "focused" | "reviewing" | "away";

export interface StudioP2pSpaceState {
  epoch: string;
  sequence: number;
  x: number;
  y: number;
  zone: StudioP2pSpaceZoneId;
  activity: StudioP2pSpaceActivity;
}

export interface StudioP2pSpacePeerView {
  participant: StudioLiveParticipant;
  state: StudioP2pSpaceState;
  distance: number;
  sameZone: boolean;
  nearby: boolean;
}

export interface StudioP2pSpaceSnapshot {
  self: StudioP2pSpaceState;
  peers: StudioP2pSpacePeerView[];
  nearbySessionIds: string[];
  closed: boolean;
}

type StudioP2pSpacePacket =
  | ({ kind: "space-state" } & StudioP2pSpaceState)
  | { kind: "space-left"; epoch: string };

interface RemoteSpaceState {
  participant: StudioLiveParticipant;
  state: StudioP2pSpaceState;
  receivedAt: number;
}

export interface StudioP2pSpaceDependencies {
  now?: () => number;
  id?: () => string;
  setInterval?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
}

function clamp(value: number): number {
  return Math.min(98, Math.max(2, Math.round(value * 10) / 10));
}

function isZone(value: unknown): value is StudioP2pSpaceZoneId {
  return STUDIO_P2P_SPACE_ZONES.some((zone) => zone.id === value);
}

function isActivity(value: unknown): value is StudioP2pSpaceActivity {
  return value === "available" || value === "focused" || value === "reviewing" || value === "away";
}

function inferZone(x: number, y: number): StudioP2pSpaceZoneId {
  return STUDIO_P2P_SPACE_ZONES.find((zone) =>
    x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height
  )?.id ?? "lobby";
}

function parsePacket(raw: string): StudioP2pSpacePacket | null {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > STUDIO_P2P_SPACE_MAX_FRAME_BYTES) return null;
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!value || typeof value !== "object" || typeof value.epoch !== "string"
    || !/^[A-Za-z0-9_-]{1,80}$/u.test(value.epoch)) return null;
  if (value.kind === "space-left") return { kind: "space-left", epoch: value.epoch };
  if (value.kind !== "space-state" || !Number.isInteger(value.sequence) || Number(value.sequence) < 1
    || Number(value.sequence) > 1_000_000_000 || typeof value.x !== "number" || typeof value.y !== "number"
    || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.x > 100
    || value.y < 0 || value.y > 100 || !isZone(value.zone) || !isActivity(value.activity)) return null;
  return {
    kind: "space-state",
    epoch: value.epoch,
    sequence: Number(value.sequence),
    x: clamp(value.x),
    y: clamp(value.y),
    zone: value.zone,
    activity: value.activity,
  };
}

function distance(a: Pick<StudioP2pSpaceState, "x" | "y">, b: Pick<StudioP2pSpaceState, "x" | "y">): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class StudioP2pSpaceController {
  private readonly listeners = new Set<() => void>();
  private readonly remote = new Map<string, RemoteSpaceState>();
  private readonly epoch: string;
  private selfState: StudioP2pSpaceState;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBroadcastAt = -Infinity;
  private closed = false;

  constructor(
    private readonly self: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    private readonly deps: StudioP2pSpaceDependencies = {},
  ) {
    this.epoch = deps.id?.() ?? crypto.randomUUID();
    this.selfState = { epoch: this.epoch, sequence: 0, x: 17, y: 17, zone: "lobby", activity: "available" };
  }

  private now(): number { return this.deps.now?.() ?? Date.now(); }

  snapshot(): StudioP2pSpaceSnapshot {
    const peers = [...this.remote.values()].map(({ participant, state }) => {
      const peerDistance = distance(this.selfState, state);
      const sameZone = state.zone === this.selfState.zone;
      return {
        participant: { ...participant },
        state: { ...state },
        distance: peerDistance,
        sameZone,
        nearby: sameZone && peerDistance <= STUDIO_P2P_SPACE_PROXIMITY_RADIUS,
      };
    }).sort((a, b) => a.distance - b.distance);
    return {
      self: { ...this.selfState },
      peers,
      nearbySessionIds: peers.filter((peer) => peer.nearby).map((peer) => peer.participant.sessionId),
      closed: this.closed,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.closed || this.unsubscribe || this.self.role === "viewer") return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.broadcast(true);
    const create = this.deps.setInterval ?? setInterval;
    this.timer = create(() => this.sync(), STUDIO_P2P_SPACE_HEARTBEAT_MS);
  }

  moveTo(x: number, y: number, force = false): void {
    if (this.closed) return;
    const nextX = clamp(x);
    const nextY = clamp(y);
    this.selfState = { ...this.selfState, x: nextX, y: nextY, zone: inferZone(nextX, nextY) };
    this.broadcast(force);
    this.emit();
  }

  flush(): void { this.broadcast(true); }

  enterZone(zoneId: StudioP2pSpaceZoneId): void {
    const zone = STUDIO_P2P_SPACE_ZONES.find((candidate) => candidate.id === zoneId);
    if (!zone || this.closed) return;
    this.selfState = {
      ...this.selfState,
      x: clamp(zone.x + zone.width / 2),
      y: clamp(zone.y + zone.height / 2),
      zone: zone.id,
    };
    this.broadcast(true);
    this.emit();
  }

  setActivity(activity: StudioP2pSpaceActivity): void {
    if (this.closed || this.selfState.activity === activity) return;
    this.selfState = { ...this.selfState, activity };
    this.broadcast(true);
    this.emit();
  }

  private broadcast(force: boolean): void {
    if (this.closed) return;
    const now = this.now();
    if (!force && now - this.lastBroadcastAt < STUDIO_P2P_SPACE_MIN_MOVE_BROADCAST_MS) return;
    this.lastBroadcastAt = now;
    const state = { ...this.selfState, sequence: this.selfState.sequence + 1 };
    this.selfState = state;
    const raw = JSON.stringify({ kind: "space-state", ...state } satisfies StudioP2pSpacePacket);
    for (const peer of this.port.getPeers()) {
      if (peer.role !== "viewer" && peer.sessionId !== this.self.sessionId) this.port.send(peer.sessionId, raw);
    }
  }

  private sync(): void {
    if (this.closed) return;
    const now = this.now();
    const available = new Set(this.port.getPeers().map((peer) => peer.sessionId));
    let changed = false;
    for (const [id, entry] of this.remote) {
      if (!available.has(id) || now - entry.receivedAt > STUDIO_P2P_SPACE_STALE_MS) {
        this.remote.delete(id);
        changed = true;
      }
    }
    this.broadcast(true);
    if (changed) this.emit();
  }

  private receive(sender: StudioLiveParticipant, raw: string): void {
    if (this.closed || sender.role === "viewer" || sender.sessionId === this.self.sessionId
      || !this.port.getPeers().some((peer) => peer.sessionId === sender.sessionId)) return;
    const packet = parsePacket(raw);
    if (!packet) return;
    const current = this.remote.get(sender.sessionId);
    if (packet.kind === "space-left") {
      if (current?.state.epoch === packet.epoch) {
        this.remote.delete(sender.sessionId);
        this.emit();
      }
      return;
    }
    if (current && current.state.epoch === packet.epoch && current.state.sequence >= packet.sequence) return;
    this.remote.set(sender.sessionId, {
      participant: { ...sender },
      state: {
        epoch: packet.epoch,
        sequence: packet.sequence,
        x: packet.x,
        y: packet.y,
        zone: packet.zone,
        activity: packet.activity,
      },
      receivedAt: this.now(),
    });
    this.emit();
  }

  close(): void {
    if (this.closed) return;
    const raw = JSON.stringify({ kind: "space-left", epoch: this.epoch } satisfies StudioP2pSpacePacket);
    for (const peer of this.port.getPeers()) {
      if (peer.role !== "viewer" && peer.sessionId !== this.self.sessionId) this.port.send(peer.sessionId, raw);
    }
    this.closed = true;
    if (this.timer !== null) (this.deps.clearInterval ?? clearInterval)(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.remote.clear();
    this.emit();
    this.listeners.clear();
  }
}
