import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import {
  STUDIO_PEER_CAPABILITIES,
  STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES,
  STUDIO_PEER_FABRIC_MAX_TTL_MS,
  encodeStudioPeerFabricPacket,
  parseStudioPeerFabricPacket,
  studioPeerUtf8ByteLength,
  type StudioPeerCapability,
  type StudioPeerFabricPacket,
  type StudioPeerTrafficClass,
} from "./studio-peer-fabric-protocol";

export interface StudioPeerFabricPeer extends StudioLiveParticipant {
  readonly capabilities: readonly StudioPeerCapability[];
}

export interface StudioPeerFabricEvent {
  readonly sender: StudioPeerFabricPeer;
  readonly capability: StudioPeerCapability;
  readonly trafficClass: StudioPeerTrafficClass;
  readonly messageId: string;
  readonly sequence: number;
  readonly sentAt: number;
  readonly payload: string;
}

export interface StudioPeerFabricLinkPort {
  getPeers(): readonly StudioPeerFabricPeer[];
  send(targetSessionId: string, payload: string, trafficClass: StudioPeerTrafficClass): boolean;
  subscribe(listener: (sender: StudioPeerFabricPeer, payload: string) => void): () => void;
}

export interface StudioPeerFabricSendOptions {
  readonly trafficClass?: StudioPeerTrafficClass;
  readonly ttlMs?: number;
  readonly messageId?: string;
}

export interface StudioPeerFabricBroadcastResult {
  readonly targets: readonly string[];
  readonly sent: readonly string[];
  readonly failed: readonly string[];
}

export interface StudioPeerFabricPort {
  readonly localCapabilities: readonly StudioPeerCapability[];
  getPeers(capability?: StudioPeerCapability): readonly StudioPeerFabricPeer[];
  send(
    targetSessionId: string,
    capability: StudioPeerCapability,
    payload: string,
    options?: StudioPeerFabricSendOptions,
  ): boolean;
  broadcast(
    capability: StudioPeerCapability,
    payload: string,
    options?: StudioPeerFabricSendOptions,
  ): StudioPeerFabricBroadcastResult;
  subscribe(
    capability: StudioPeerCapability | null,
    listener: (event: StudioPeerFabricEvent) => void,
  ): () => void;
  close(): void;
}
interface InboundWindow {
  startedAt: number;
  messages: number;
  bytes: number;
}

const INBOUND_WINDOW_MS = 3_000;
const INBOUND_LIMITS = Object.freeze({
  control: { messages: 240, bytes: 1024 * 1024 },
  realtime: { messages: 720, bytes: 2 * 1024 * 1024 },
  bulk: { messages: 480, bytes: 8 * 1024 * 1024 },
} satisfies Readonly<
  Record<StudioPeerTrafficClass, { messages: number; bytes: number }>
>);
const MAX_SEEN_MESSAGES = 2_048;
const CAPABILITY_SET = new Set<string>(STUDIO_PEER_CAPABILITIES);

function defaultMessageId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  throw new Error("P2P 메시지 식별자를 안전하게 생성할 수 없습니다.");
}

function boundedTtl(
  trafficClass: StudioPeerTrafficClass,
  value: number | undefined,
): number {
  const maximum = STUDIO_PEER_FABRIC_MAX_TTL_MS[trafficClass];
  if (!Number.isFinite(value)) {
    return Math.min(maximum, trafficClass === "realtime" ? 1_500 : 30_000);
  }
  return Math.max(250, Math.min(maximum, Math.trunc(value as number)));
}

/**
 * Capability-aware logical lanes on the authenticated RTC-only data path.
 * Feature failures are explicit: this port never falls back to the primary server transport.
 */
export class StudioPeerFabric implements StudioPeerFabricPort {
  readonly localCapabilities: readonly StudioPeerCapability[];
  private readonly link: StudioPeerFabricLinkPort;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly listeners = new Map<
    StudioPeerCapability | null,
    Set<(event: StudioPeerFabricEvent) => void>
  >();
  private readonly inboundWindows = new Map<string, InboundWindow>();
  private readonly seen = new Set<string>();
  private unsubscribe: (() => void) | null;
  private sequence = 0;
  private closed = false;

  constructor(
    link: StudioPeerFabricLinkPort,
    options: {
      readonly capabilities?: readonly StudioPeerCapability[];
      readonly now?: () => number;
      readonly randomId?: () => string;
    } = {},
  ) {
    this.link = link;
    this.now = options.now ?? Date.now;
    this.makeId = options.randomId ?? defaultMessageId;
    this.localCapabilities = Object.freeze([
      ...new Set(
        (options.capabilities ?? STUDIO_PEER_CAPABILITIES).filter(
          (value): value is StudioPeerCapability => CAPABILITY_SET.has(value),
        ),
      ),
    ]);
    this.unsubscribe = link.subscribe((sender, raw) => this.receive(sender, raw));
  }

  getPeers(capability?: StudioPeerCapability): readonly StudioPeerFabricPeer[] {
    if (this.closed) return [];
    return this.link.getPeers().filter(
      (peer) => !capability || peer.capabilities.includes(capability),
    );
  }

  send(
    targetSessionId: string,
    capability: StudioPeerCapability,
    payload: string,
    options: StudioPeerFabricSendOptions = {},
  ): boolean {
    if (
      this.closed
      || !this.localCapabilities.includes(capability)
      || !CAPABILITY_SET.has(capability)
    ) return false;
    const trafficClass = options.trafficClass ?? "control";
    if (
      typeof payload !== "string"
      || studioPeerUtf8ByteLength(payload)
        > STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES[trafficClass]
    ) return false;
    const peer = this.getPeers(capability).find(
      (candidate) => candidate.sessionId === targetSessionId,
    );
    if (!peer) return false;
    const sentAt = this.now();
    let messageId: string;
    try {
      messageId = options.messageId ?? this.makeId();
    } catch {
      return false;
    }
    const encoded = encodeStudioPeerFabricPacket({
      capability,
      trafficClass,
      messageId,
      sequence: ++this.sequence,
      sentAt,
      expiresAt: sentAt + boundedTtl(trafficClass, options.ttlMs),
      payload,
    });
    return encoded !== null
      && this.link.send(targetSessionId, encoded, trafficClass);
  }

  broadcast(
    capability: StudioPeerCapability,
    payload: string,
    options: StudioPeerFabricSendOptions = {},
  ): StudioPeerFabricBroadcastResult {
    const targets = this.getPeers(capability).map((peer) => peer.sessionId);
    const sent: string[] = [];
    const failed: string[] = [];
    for (const target of targets) {
      if (this.send(target, capability, payload, options)) sent.push(target);
      else failed.push(target);
    }
    return { targets, sent, failed };
  }

  subscribe(
    capability: StudioPeerCapability | null,
    listener: (event: StudioPeerFabricEvent) => void,
  ): () => void {
    if (this.closed) return () => undefined;
    const listeners = this.listeners.get(capability) ?? new Set();
    listeners.add(listener);
    this.listeners.set(capability, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(capability);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
    this.inboundWindows.clear();
    this.seen.clear();
  }

  private receive(sender: StudioPeerFabricPeer, raw: string): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const packet = parseStudioPeerFabricPacket(candidate, { now: this.now() });
    if (
      !packet
      || !this.localCapabilities.includes(packet.capability)
      || !sender.capabilities.includes(packet.capability)
      || !this.acceptInbound(sender.sessionId, packet, studioPeerUtf8ByteLength(raw))
    ) return;
    const key = `${sender.sessionId}:${packet.messageId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    while (this.seen.size > MAX_SEEN_MESSAGES) {
      const oldest = this.seen.values().next().value;
      if (typeof oldest !== "string") break;
      this.seen.delete(oldest);
    }
    const event: StudioPeerFabricEvent = {
      sender: { ...sender, capabilities: Object.freeze([...sender.capabilities]) },
      capability: packet.capability,
      trafficClass: packet.trafficClass,
      messageId: packet.messageId,
      sequence: packet.sequence,
      sentAt: packet.sentAt,
      payload: packet.payload,
    };
    const featureListeners = this.listeners.get(packet.capability) ?? [];
    const allListeners = this.listeners.get(null) ?? [];
    for (const listener of [...featureListeners, ...allListeners]) {
      try {
        listener(event);
      } catch {
        // Feature observers never own the shared peer connection.
      }
    }
  }

  private acceptInbound(
    senderSessionId: string,
    packet: StudioPeerFabricPacket,
    byteLength: number,
  ): boolean {
    const key = `${senderSessionId}:${packet.trafficClass}`;
    const now = this.now();
    const previous = this.inboundWindows.get(key);
    const window = !previous
      || now < previous.startedAt
      || now - previous.startedAt >= INBOUND_WINDOW_MS
      ? { startedAt: now, messages: 0, bytes: 0 }
      : previous;
    const limits = INBOUND_LIMITS[packet.trafficClass];
    if (
      window.messages + 1 > limits.messages
      || window.bytes + byteLength > limits.bytes
    ) return false;
    window.messages += 1;
    window.bytes += byteLength;
    this.inboundWindows.set(key, window);
    return true;
  }
}

export function createStudioPeerFabric(
  link: StudioPeerFabricLinkPort,
  options: ConstructorParameters<typeof StudioPeerFabric>[1] = {},
): StudioPeerFabricPort {
  return new StudioPeerFabric(link, options);
}
