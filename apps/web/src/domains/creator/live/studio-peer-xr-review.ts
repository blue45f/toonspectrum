import type {
  StudioPeerFabricBroadcastResult,
  StudioPeerFabricEvent,
  StudioPeerFabricPeer,
  StudioPeerFabricPort,
} from "./studio-peer-fabric";

export const STUDIO_PEER_XR_WIRE = "studio-peer-xr-review-v1" as const;
export const STUDIO_PEER_XR_KINDS = ["pose", "pointer", "anchor", "recenter"] as const;
export type StudioPeerXrKind = (typeof STUDIO_PEER_XR_KINDS)[number];

export interface StudioPeerXrPacket {
  readonly wire: typeof STUDIO_PEER_XR_WIRE;
  readonly epoch: string;
  readonly sequence: number;
  readonly kind: StudioPeerXrKind;
  readonly objectId: string | null;
  readonly values: readonly number[];
  readonly sentAt: number;
}

export interface StudioPeerXrEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly packet: StudioPeerXrPacket;
}

export interface StudioPeerXrReviewPort {
  publish(
    kind: StudioPeerXrKind,
    values: readonly number[],
    objectId?: string | null,
  ): StudioPeerFabricBroadcastResult;
  subscribe(listener: (event: StudioPeerXrEvent) => void): () => void;
  close(): void;
}

const KIND_SET = new Set<string>(STUDIO_PEER_XR_KINDS);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesValid(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 32
    && value.every((entry) => typeof entry === "number"
      && Number.isFinite(entry) && Math.abs(entry) <= 100_000);
}

export function parseStudioPeerXrPacket(value: unknown): StudioPeerXrPacket | null {
  if (!isRecord(value) || Object.keys(value).length !== 7
    || value.wire !== STUDIO_PEER_XR_WIRE
    || typeof value.epoch !== "string" || !ID_PATTERN.test(value.epoch)
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || typeof value.kind !== "string" || !KIND_SET.has(value.kind)
    || !(value.objectId === null
      || (typeof value.objectId === "string" && ID_PATTERN.test(value.objectId)))
    || !valuesValid(value.values)
    || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
  return {
    wire: STUDIO_PEER_XR_WIRE,
    epoch: value.epoch,
    sequence: Number(value.sequence),
    kind: value.kind as StudioPeerXrKind,
    objectId: value.objectId,
    values: Object.freeze([...value.values]),
    sentAt: value.sentAt,
  };
}

function createEpoch(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value || !ID_PATTERN.test(value)) {
    throw new Error("XR P2P 세션 식별자를 생성할 수 없습니다.");
  }
  return value;
}

export class StudioPeerXrReview implements StudioPeerXrReviewPort {
  private readonly listeners = new Set<(event: StudioPeerXrEvent) => void>();
  private readonly frontier = new Map<string, { epoch: string; sequence: number }>();
  private readonly unsubscribe: () => void;
  private readonly epoch: string;
  private sequence = 0;
  private closed = false;

  constructor(
    private readonly fabric: StudioPeerFabricPort,
    private readonly now: () => number = Date.now,
    epochFactory: () => string = createEpoch,
  ) {
    this.epoch = epochFactory();
    if (!ID_PATTERN.test(this.epoch)) throw new TypeError("XR P2P epoch가 올바르지 않습니다.");
    this.unsubscribe = fabric.subscribe("xr-review-v1", (event) => this.receive(event));
  }

  publish(
    kind: StudioPeerXrKind,
    values: readonly number[],
    objectId: string | null = null,
  ): StudioPeerFabricBroadcastResult {
    if (this.closed) return { targets: [], sent: [], failed: [] };
    const packet = parseStudioPeerXrPacket({
      wire: STUDIO_PEER_XR_WIRE,
      epoch: this.epoch,
      sequence: ++this.sequence,
      kind,
      objectId,
      values,
      sentAt: this.now(),
    });
    if (!packet) return { targets: [], sent: [], failed: [] };
    return this.fabric.broadcast(
      "xr-review-v1",
      JSON.stringify(packet),
      { trafficClass: "realtime", ttlMs: 1_500 },
    );
  }

  subscribe(listener: (event: StudioPeerXrEvent) => void): () => void {
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
    const packet = parseStudioPeerXrPacket(candidate);
    if (!packet || packet.sentAt > this.now() + 5_000) return;
    const previous = this.frontier.get(event.sender.sessionId);
    if (previous?.epoch === packet.epoch && packet.sequence <= previous.sequence) return;
    this.frontier.set(event.sender.sessionId, { epoch: packet.epoch, sequence: packet.sequence });
    const received: StudioPeerXrEvent = { sender: event.sender, packet };
    for (const listener of this.listeners) {
      try {
        listener(received);
      } catch {
        // XR observers never own browser device or peer transport lifecycles.
      }
    }
  }
}

export function createStudioPeerXrReview(
  fabric: StudioPeerFabricPort,
  options: { readonly now?: () => number; readonly createEpoch?: () => string } = {},
): StudioPeerXrReviewPort {
  return new StudioPeerXrReview(
    fabric,
    options.now ?? Date.now,
    options.createEpoch ?? createEpoch,
  );
}
