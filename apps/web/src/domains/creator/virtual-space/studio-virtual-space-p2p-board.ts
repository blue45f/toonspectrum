import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";

export const STUDIO_P2P_BOARD_WIRE = "toonspectrum-space-board-v1";
export const STUDIO_P2P_BOARD_MAX_BYTES = 32 * 1024;
export const STUDIO_P2P_BOARD_MAX_OWN_ENTITIES = 20;
export const STUDIO_P2P_BOARD_MAX_ENTITIES = 512;
export const STUDIO_P2P_BOARD_MAX_POINTS = 48;
export const STUDIO_P2P_BOARD_COLORS = ["#ffd166", "#f78c6b", "#83d8c5", "#8fb3ff", "#d7a6ff", "#f3f4f6"] as const;

export type StudioP2pBoardColor = typeof STUDIO_P2P_BOARD_COLORS[number];
export interface StudioP2pBoardPoint { readonly x: number; readonly y: number }
interface StudioP2pBoardEntityBase {
  readonly id: string;
  readonly ownerSessionId: string;
  readonly ownerEpoch: string;
  readonly revision: number;
  readonly color: StudioP2pBoardColor;
}
export interface StudioP2pBoardStroke extends StudioP2pBoardEntityBase {
  readonly kind: "stroke";
  readonly width: number;
  readonly points: readonly StudioP2pBoardPoint[];
}
export interface StudioP2pBoardNote extends StudioP2pBoardEntityBase {
  readonly kind: "note";
  readonly x: number;
  readonly y: number;
  readonly text: string;
}
export type StudioP2pBoardEntity = StudioP2pBoardStroke | StudioP2pBoardNote;

export interface StudioP2pBoardScope {
  readonly boardId: string;
  readonly worldId: string;
  readonly contentRevision: string;
}
export interface StudioP2pBoardSnapshot {
  readonly entities: readonly StudioP2pBoardEntity[];
  readonly readyPeerIds: readonly string[];
  readonly available: boolean;
  readonly canEdit: boolean;
}

interface BoardPacketBase extends StudioP2pBoardScope {
  readonly wire: typeof STUDIO_P2P_BOARD_WIRE;
  readonly kind: "hello" | "state" | "upsert" | "remove" | "clear";
  readonly sessionEpoch: string;
  readonly targetEpoch: string | null;
  readonly senderSessionId: string;
  readonly targetSessionId: string;
  readonly sequence: number;
}
interface HelloPacket extends BoardPacketBase { readonly kind: "hello" }
interface StatePacket extends BoardPacketBase { readonly kind: "state"; readonly entities: readonly StudioP2pBoardEntity[] }
interface UpsertPacket extends BoardPacketBase { readonly kind: "upsert"; readonly entity: StudioP2pBoardEntity }
interface RemovePacket extends BoardPacketBase { readonly kind: "remove"; readonly entityId: string }
interface ClearPacket extends BoardPacketBase { readonly kind: "clear" }
export type StudioP2pBoardPacket = HelloPacket | StatePacket | UpsertPacket | RemovePacket | ClearPacket;

interface PeerState {
  epoch: string | null;
  sequence: number;
  helloSent: boolean;
  role: StudioLiveParticipant["role"];
  viewerSyncCountdown: number;
}
export interface StudioP2pBoardDependencies {
  readonly epoch?: string;
  readonly setInterval?: (handler: () => void, delay: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const PACKET_BASE_KEYS = ["wire", "kind", "boardId", "worldId", "contentRevision", "sessionEpoch", "targetEpoch", "senderSessionId", "targetSessionId", "sequence"] as const;
const KINDS = new Set(["hello", "state", "upsert", "remove", "clear"]);
const COLORS = new Set<string>(STUDIO_P2P_BOARD_COLORS);
const encoder = new TextEncoder();
const safeId = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0 && value.length <= max && SAFE_ID.test(value);
const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function hasUnsafeTextControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
  });
}

function parseEntity(value: unknown, expectedOwner?: string, expectedEpoch?: string): StudioP2pBoardEntity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!safeId(item.id) || !safeId(item.ownerSessionId) || !safeId(item.ownerEpoch, 80)
    || (expectedOwner && item.ownerSessionId !== expectedOwner)
    || (expectedEpoch && item.ownerEpoch !== expectedEpoch)
    || !Number.isSafeInteger(item.revision) || Number(item.revision) <= 0
    || typeof item.color !== "string" || !COLORS.has(item.color)) return null;
  const base = {
    id: item.id,
    ownerSessionId: item.ownerSessionId,
    ownerEpoch: item.ownerEpoch,
    revision: Number(item.revision),
    color: item.color as StudioP2pBoardColor,
  };
  if (item.kind === "stroke") {
    if (Object.keys(item).length !== 8 || typeof item.width !== "number" || !Number.isFinite(item.width)
      || item.width < 1 || item.width > 20 || !Array.isArray(item.points)
      || item.points.length < 2 || item.points.length > STUDIO_P2P_BOARD_MAX_POINTS) return null;
    const points: StudioP2pBoardPoint[] = [];
    for (const point of item.points) {
      if (!point || typeof point !== "object" || Array.isArray(point)) return null;
      const candidate = point as Record<string, unknown>;
      if (Object.keys(candidate).length !== 2 || !unit(candidate.x) || !unit(candidate.y)) return null;
      points.push(Object.freeze({ x: candidate.x, y: candidate.y }));
    }
    return Object.freeze({ ...base, kind: "stroke", width: item.width, points: Object.freeze(points) });
  }
  if (item.kind === "note") {
    if (Object.keys(item).length !== 9 || !unit(item.x) || !unit(item.y)
      || typeof item.text !== "string" || item.text.trim().length === 0 || item.text.length > 160
      || hasUnsafeTextControl(item.text)) return null;
    return Object.freeze({ ...base, kind: "note", x: item.x, y: item.y, text: item.text.trim() });
  }
  return null;
}

export function parseStudioP2pBoardPacket(raw: string): StudioP2pBoardPacket | null {
  if (typeof raw !== "string" || raw.length > STUDIO_P2P_BOARD_MAX_BYTES || encoder.encode(raw).byteLength > STUDIO_P2P_BOARD_MAX_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const packet = value as Record<string, unknown>;
  if (packet.wire !== STUDIO_P2P_BOARD_WIRE || typeof packet.kind !== "string" || !KINDS.has(packet.kind)
    || !safeId(packet.boardId) || !safeId(packet.worldId) || !safeId(packet.contentRevision)
    || !safeId(packet.sessionEpoch, 80) || !safeId(packet.senderSessionId) || !safeId(packet.targetSessionId)
    || packet.senderSessionId === packet.targetSessionId || !Number.isSafeInteger(packet.sequence) || Number(packet.sequence) <= 0
    || (packet.targetEpoch !== null && !safeId(packet.targetEpoch, 80))) return null;
  const extra = packet.kind === "state" ? ["entities"] : packet.kind === "upsert" ? ["entity"] : packet.kind === "remove" ? ["entityId"] : [];
  const keys = new Set([...PACKET_BASE_KEYS, ...extra]);
  if (Object.keys(packet).length !== keys.size || Object.keys(packet).some((key) => !keys.has(key as never))) return null;
  if (packet.kind === "hello") {
    if (packet.targetEpoch !== null) return null;
    return packet as unknown as HelloPacket;
  }
  // A null target epoch is reserved for one-way delivery to an authenticated read-only peer.
  if (packet.kind === "state") {
    if (!Array.isArray(packet.entities) || packet.entities.length > STUDIO_P2P_BOARD_MAX_OWN_ENTITIES) return null;
    const entities = packet.entities.map((entity) => parseEntity(entity, String(packet.senderSessionId), String(packet.sessionEpoch)));
    if (entities.some((entity) => entity === null) || new Set(entities.map((entity) => entity!.id)).size !== entities.length) return null;
    return { ...packet, entities: entities as StudioP2pBoardEntity[] } as unknown as StatePacket;
  }
  if (packet.kind === "upsert") {
    const entity = parseEntity(packet.entity, String(packet.senderSessionId), String(packet.sessionEpoch));
    if (!entity || entity.revision !== packet.sequence) return null;
    return { ...packet, entity } as unknown as UpsertPacket;
  }
  if (packet.kind === "remove" && !safeId(packet.entityId)) return null;
  return packet as unknown as StudioP2pBoardPacket;
}

function immutableEntity(entity: StudioP2pBoardEntity): StudioP2pBoardEntity {
  return entity.kind === "stroke"
    ? Object.freeze({ ...entity, points: Object.freeze(entity.points.map((point) => Object.freeze({ ...point }))) })
    : Object.freeze({ ...entity });
}

export class StudioP2pBoardController {
  private readonly epoch: string;
  private readonly entities = new Map<string, StudioP2pBoardEntity>();
  private readonly peers = new Map<string, PeerState>();
  private readonly listeners = new Set<() => void>();
  private sequence = 0;
  private unsubscribe: (() => void) | null = null;
  private timer: unknown | null = null;
  private closed = false;

  constructor(
    private readonly participant: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    private readonly scope: StudioP2pBoardScope,
    private readonly dependencies: StudioP2pBoardDependencies = {},
  ) {
    this.epoch = dependencies.epoch ?? globalThis.crypto.randomUUID();
    if (!safeId(participant.sessionId) || !safeId(this.epoch, 80)
      || !safeId(scope.boardId) || !safeId(scope.worldId) || !safeId(scope.contentRevision)) throw new Error("Invalid P2P board identity");
    this.participant = Object.freeze({ ...participant });
    this.scope = Object.freeze({ ...scope });
  }

  snapshot(): StudioP2pBoardSnapshot {
    return Object.freeze({
      entities: Object.freeze([...this.entities.values()].map(immutableEntity)),
      readyPeerIds: Object.freeze([...this.peers]
        .filter(([, peer]) => peer.epoch !== null || (peer.role === "viewer" && peer.helloSent))
        .map(([id]) => id)),
      available: !this.closed && this.unsubscribe !== null,
      canEdit: this.participant.role !== "viewer",
    });
  }

  subscribe(listener: () => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.closed || this.unsubscribe) return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.syncPeers();
    const set = this.dependencies.setInterval ?? globalThis.setInterval;
    this.timer = set(() => this.syncPeers(), 1_000);
    this.emit();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.timer !== null) (this.dependencies.clearInterval ?? globalThis.clearInterval)(this.timer as never);
    this.timer = null; this.peers.clear(); this.listeners.clear();
  }

  addStroke(points: readonly StudioP2pBoardPoint[], color: StudioP2pBoardColor, width = 5): string | null {
    if (!this.canMutate() || !COLORS.has(color) || !Number.isFinite(width) || width < 1 || width > 20) return null;
    const normalized = points
      .slice(0, STUDIO_P2P_BOARD_MAX_POINTS)
      .filter((point) => unit(point.x) && unit(point.y))
      .map((point) => ({
        x: Math.round(point.x * 1_000) / 1_000,
        y: Math.round(point.y * 1_000) / 1_000,
      }));
    if (normalized.length < 2) return null;
    this.makeRoom();
    const sequence = ++this.sequence;
    const id = `${this.epoch}.${sequence}`;
    const entity = immutableEntity({ id, ownerSessionId: this.participant.sessionId, ownerEpoch: this.epoch,
      revision: sequence, kind: "stroke", color, width, points: normalized });
    this.entities.set(this.key(entity.ownerSessionId, entity.id), entity);
    this.broadcast("upsert", { entity }, sequence); this.emit(); return id;
  }

  addNote(x: number, y: number, text: string, color: StudioP2pBoardColor): string | null {
    const trimmed = text.trim();
    if (!this.canMutate() || !unit(x) || !unit(y) || !COLORS.has(color) || !trimmed || trimmed.length > 160) return null;
    this.makeRoom();
    const sequence = ++this.sequence;
    const id = `${this.epoch}.${sequence}`;
    const entity = immutableEntity({ id, ownerSessionId: this.participant.sessionId, ownerEpoch: this.epoch,
      revision: sequence, kind: "note", color, x, y, text: trimmed });
    this.entities.set(this.key(entity.ownerSessionId, entity.id), entity);
    this.broadcast("upsert", { entity }, sequence); this.emit(); return id;
  }

  remove(entityId: string): boolean {
    if (!this.canMutate() || !safeId(entityId)) return false;
    const key = this.key(this.participant.sessionId, entityId);
    if (!this.entities.delete(key)) return false;
    this.broadcast("remove", { entityId }); this.emit(); return true;
  }

  clearOwn(): void {
    if (!this.canMutate()) return;
    for (const [key, entity] of this.entities) if (entity.ownerSessionId === this.participant.sessionId) this.entities.delete(key);
    this.broadcast("clear", {}); this.emit();
  }

  private canMutate(): boolean { return !this.closed && this.unsubscribe !== null && this.participant.role !== "viewer"; }
  private key(owner: string, id: string): string { return `${owner}\u0000${id}`; }
  private ownEntities(): StudioP2pBoardEntity[] { return [...this.entities.values()].filter((entity) => entity.ownerSessionId === this.participant.sessionId); }
  private makeRoom(): void {
    const own = this.ownEntities();
    if (own.length < STUDIO_P2P_BOARD_MAX_OWN_ENTITIES) return;
    const oldest = own.sort((a, b) => a.revision - b.revision)[0];
    if (oldest) this.remove(oldest.id);
  }
  private emit(): void { for (const listener of this.listeners) listener(); }

  private syncPeers(): void {
    if (this.closed) return;
    const connected = new Map(this.port.getPeers().filter((peer) => peer.sessionId !== this.participant.sessionId).map((peer) => [peer.sessionId, peer]));
    for (const id of this.peers.keys()) if (!connected.has(id)) {
      this.peers.delete(id);
      for (const [key, entity] of this.entities) if (entity.ownerSessionId === id) this.entities.delete(key);
    }
    for (const [id, participant] of connected) {
      let peer = this.peers.get(id);
      if (!peer) {
        peer = {
          epoch: null,
          sequence: 0,
          helloSent: false,
          role: participant.role,
          viewerSyncCountdown: 0,
        };
        this.peers.set(id, peer);
      } else {
        peer.role = participant.role;
      }
      if (peer.role === "viewer") {
        if (peer.viewerSyncCountdown <= 0) {
          this.sendReadOnlySnapshot(id, peer);
        } else {
          peer.viewerSyncCountdown -= 1;
        }
      } else {
        this.sendHello(id, peer);
      }
    }
    this.emit();
  }

  private sendHello(targetSessionId: string, peer: PeerState): void {
    if (peer.helloSent) return;
    // Mark before sending because loopback/test ports may synchronously deliver and answer.
    peer.helloSent = true;
    if (!this.send(targetSessionId, "hello", {}, null)) peer.helloSent = false;
  }

  private sendReadOnlySnapshot(targetSessionId: string, peer: PeerState): void {
    peer.helloSent = true;
    const helloSent = this.send(targetSessionId, "hello", {}, null);
    const stateSent = helloSent && this.send(
      targetSessionId,
      "state",
      { entities: this.ownEntities() },
      null,
    );
    peer.helloSent = stateSent;
    peer.viewerSyncCountdown = stateSent ? 4 : 0;
  }

  private base(kind: StudioP2pBoardPacket["kind"], targetSessionId: string, targetEpoch: string | null, sequence = ++this.sequence): BoardPacketBase {
    return { wire: STUDIO_P2P_BOARD_WIRE, kind, ...this.scope, sessionEpoch: this.epoch, targetEpoch,
      senderSessionId: this.participant.sessionId, targetSessionId, sequence };
  }
  private send(targetSessionId: string, kind: StudioP2pBoardPacket["kind"], body: Record<string, unknown>, targetEpoch: string | null, sequence?: number): boolean {
    const payload = JSON.stringify({ ...this.base(kind, targetSessionId, targetEpoch, sequence), ...body });
    return encoder.encode(payload).byteLength <= STUDIO_P2P_BOARD_MAX_BYTES && this.port.send(targetSessionId, payload);
  }
  private broadcast(kind: StudioP2pBoardPacket["kind"], body: Record<string, unknown>, sequence?: number): void {
    for (const [id, peer] of this.peers) {
      if (peer.epoch) {
        this.send(id, kind, body, peer.epoch, sequence);
      } else if (peer.role === "viewer" && peer.helloSent) {
        this.send(id, kind, body, null, sequence);
      }
    }
  }

  private receive(sender: StudioLiveParticipant, raw: string): void {
    const packet = parseStudioP2pBoardPacket(raw);
    if (!packet || sender.sessionId !== packet.senderSessionId || packet.targetSessionId !== this.participant.sessionId
      || packet.boardId !== this.scope.boardId || packet.worldId !== this.scope.worldId || packet.contentRevision !== this.scope.contentRevision) return;
    const connectedPeer = this.port.getPeers().find((candidate) => candidate.sessionId === sender.sessionId);
    if (!connectedPeer) return;
    let peer = this.peers.get(sender.sessionId);
    if (!peer) {
      peer = {
        epoch: null,
        sequence: 0,
        helloSent: false,
        role: connectedPeer.role,
        viewerSyncCountdown: 0,
      };
      this.peers.set(sender.sessionId, peer);
    } else if (peer.role !== connectedPeer.role) {
      peer.role = connectedPeer.role;
      peer.epoch = null;
      peer.sequence = 0;
      peer.helloSent = false;
      peer.viewerSyncCountdown = 0;
      for (const [key, entity] of this.entities) {
        if (entity.ownerSessionId === sender.sessionId) this.entities.delete(key);
      }
    }
    // The authenticated direct-roster role is authoritative. Viewers never publish board frames.
    if (connectedPeer.role === "viewer") return;
    if (packet.kind === "hello") {
      if (peer.epoch !== packet.sessionEpoch) {
        peer.epoch = packet.sessionEpoch;
        peer.sequence = 0;
        for (const [key, entity] of this.entities) {
          if (entity.ownerSessionId === sender.sessionId) this.entities.delete(key);
        }
      }
      if (this.participant.role !== "viewer") {
        this.sendHello(sender.sessionId, peer);
        this.send(sender.sessionId, "state", { entities: this.ownEntities() }, packet.sessionEpoch);
      }
      this.emit();
      return;
    }
    const oneWayReadOnlyDelivery = this.participant.role === "viewer"
      && packet.targetEpoch === null;
    if (!oneWayReadOnlyDelivery && packet.targetEpoch !== this.epoch) return;
    if (peer.epoch !== packet.sessionEpoch) {
      if (!oneWayReadOnlyDelivery || packet.kind !== "state") return;
      peer.epoch = packet.sessionEpoch;
      peer.sequence = 0;
      for (const [key, entity] of this.entities) {
        if (entity.ownerSessionId === sender.sessionId) this.entities.delete(key);
      }
    }
    if (packet.sequence <= peer.sequence) return;
    peer.sequence = packet.sequence;
    if (packet.kind === "state") {
      for (const [key, entity] of this.entities) {
        if (entity.ownerSessionId === sender.sessionId) this.entities.delete(key);
      }
      for (const entity of packet.entities) this.acceptEntity(entity);
    } else if (packet.kind === "upsert") {
      this.acceptEntity(packet.entity);
    } else if (packet.kind === "remove") {
      this.entities.delete(this.key(sender.sessionId, packet.entityId));
    } else if (packet.kind === "clear") {
      for (const [key, entity] of this.entities) {
        if (entity.ownerSessionId === sender.sessionId) this.entities.delete(key);
      }
    }
    this.emit();
  }

  private acceptEntity(entity: StudioP2pBoardEntity): void {
    const key = this.key(entity.ownerSessionId, entity.id);
    const current = this.entities.get(key);
    if (current && current.revision >= entity.revision) return;
    if (!current && this.entities.size >= STUDIO_P2P_BOARD_MAX_ENTITIES) return;
    this.entities.set(key, immutableEntity(entity));
  }
}
