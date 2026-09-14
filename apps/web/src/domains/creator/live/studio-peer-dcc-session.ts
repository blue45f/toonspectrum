import {
  collabAppendOp,
  type StudioDccCollabOp,
  type StudioDccCollabRoom,
} from "../hybrid-dcc/studio-dcc-collab-shell";
import type {
  StudioPeerFabricBroadcastResult,
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_DCC_WIRE = "studio-peer-dcc-session-v1" as const;

export type StudioPeerDccOp = Extract<
  StudioDccCollabOp,
  { kind: "select" | "geometry-hint" | "chat" }
>;

export interface StudioPeerDccPacket {
  readonly wire: typeof STUDIO_PEER_DCC_WIRE;
  readonly roomId: string;
  readonly sequence: number;
  readonly op: StudioPeerDccOp;
}

export interface StudioPeerDccEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly packet: StudioPeerDccPacket;
}

export interface StudioPeerDccSessionPort {
  publish(op: StudioPeerDccOp): StudioPeerFabricBroadcastResult;
  subscribe(listener: (event: StudioPeerDccEvent) => void): () => void;
  close(): void;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;
const HASH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+/~-]{0,255}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOp(value: unknown): StudioPeerDccOp | null {
  if (!isRecord(value) || typeof value.kind !== "string"
    || typeof value.peerId !== "string" || !ID_PATTERN.test(value.peerId)
    || typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
  if (value.kind === "select") {
    if (!Array.isArray(value.assetIds) || value.assetIds.length > 128
      || !value.assetIds.every((assetId) => typeof assetId === "string" && ID_PATTERN.test(assetId))) {
      return null;
    }
    return { kind: "select", peerId: value.peerId, assetIds: [...value.assetIds], at: value.at };
  }
  if (value.kind === "geometry-hint") {
    if (typeof value.assetId !== "string" || !ID_PATTERN.test(value.assetId)
      || typeof value.geometryHash !== "string" || !HASH_PATTERN.test(value.geometryHash)) return null;
    return {
      kind: "geometry-hint",
      peerId: value.peerId,
      assetId: value.assetId,
      geometryHash: value.geometryHash,
      at: value.at,
    };
  }
  if (value.kind === "chat") {
    if (typeof value.text !== "string" || value.text.length < 1 || value.text.length > 2_000) return null;
    return { kind: "chat", peerId: value.peerId, text: value.text, at: value.at };
  }
  return null;
}

export function parseStudioPeerDccPacket(value: unknown): StudioPeerDccPacket | null {
  if (!isRecord(value) || Object.keys(value).length !== 4
    || value.wire !== STUDIO_PEER_DCC_WIRE
    || typeof value.roomId !== "string" || !ID_PATTERN.test(value.roomId)
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) return null;
  const op = parseOp(value.op);
  return op ? {
    wire: STUDIO_PEER_DCC_WIRE,
    roomId: value.roomId,
    sequence: Number(value.sequence),
    op,
  } : null;
}

export function applyStudioPeerDccEvent(
  room: StudioDccCollabRoom,
  event: StudioPeerDccEvent,
): StudioDccCollabRoom {
  return event.packet.roomId === room.roomId
    ? collabAppendOp(room, event.packet.op)
    : room;
}

export class StudioPeerDccSession implements StudioPeerDccSessionPort {
  private readonly listeners = new Set<(event: StudioPeerDccEvent) => void>();
  private readonly frontier = new Map<string, number>();
  private readonly unsubscribe: () => void;
  private sequence = 0;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly roomId: string,
    private readonly localPeerId: string,
  ) {
    if (!ID_PATTERN.test(roomId) || !ID_PATTERN.test(localPeerId)) {
      throw new TypeError("DCC P2P room 또는 peer 식별자가 올바르지 않습니다.");
    }
    this.unsubscribe = fabric.subscribe("dcc-session-hint-v1", (event) => this.receive(event));
  }

  publish(op: StudioPeerDccOp): StudioPeerFabricBroadcastResult {
    if (this.closed || op.peerId !== this.localPeerId || !parseOp(op)) {
      return { targets: [], sent: [], failed: [] };
    }
    const packet: StudioPeerDccPacket = {
      wire: STUDIO_PEER_DCC_WIRE,
      roomId: this.roomId,
      sequence: ++this.sequence,
      op,
    };
    return this.fabric.broadcast(
      "dcc-session-hint-v1",
      JSON.stringify(packet),
      { trafficClass: op.kind === "chat" ? "control" : "realtime", ttlMs: 5_000 },
    );
  }

  subscribe(listener: (event: StudioPeerDccEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.frontier.clear();
  }

  private receive(event: StudioPeerFabricEvent): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const packet = parseStudioPeerDccPacket(candidate);
    if (!packet || packet.roomId !== this.roomId
      || packet.op.peerId !== event.sender.sessionId) return;
    const previous = this.frontier.get(event.sender.sessionId) ?? 0;
    if (packet.sequence <= previous) return;
    this.frontier.set(event.sender.sessionId, packet.sequence);
    const received: StudioPeerDccEvent = { sender: event.sender, packet };
    for (const listener of this.listeners) {
      try {
        listener(received);
      } catch {
        // Session observers never own the RTC transport.
      }
    }
  }
}

export function createStudioPeerDccSession(
  fabric: StudioPeerFabricPort,
  roomId: string,
  localPeerId: string,
): StudioPeerDccSessionPort {
  return new StudioPeerDccSession(fabric, roomId, localPeerId);
}
