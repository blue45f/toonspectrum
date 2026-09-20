import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  parseStudioVirtualSpaceReviewSubject, sameStudioVirtualSpaceReviewSubject,
  type StudioVirtualSpaceReviewSubject,
} from "./studio-virtual-space-review-subject";

export const STUDIO_VIRTUAL_SPACE_SOCIAL_WIRE = "toonspectrum-space-social-v1";
export const STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE = "toonspectrum-space-social-v2";
export const STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE = "toonspectrum-space-social-v3";
export const STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS = 20_000;
export const STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_PENDING = 4;
export const STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_BYTES = 4_096;
const MAX_RECORDS = 64;
const MAX_PEERS = 23;
const MAX_RETIRED_EPOCHS = 8;
const TICK_MS = 250;

export type StudioVirtualSpaceSocialAction = "talk" | "follow" | "review" | "high-five";
export type StudioVirtualSpaceSocialStatus =
  | "offered" | "accepting" | "accepted" | "declined" | "cancelled"
  | "expired" | "disconnected" | "failed";

export interface StudioVirtualSpaceSocialWorld {
  readonly worldId: string;
  readonly contentRevision: string;
}

export interface StudioVirtualSpaceSocialRequest {
  readonly id: string;
  readonly action: StudioVirtualSpaceSocialAction;
  readonly peer: StudioLiveParticipant;
  readonly direction: "incoming" | "outgoing";
  readonly status: StudioVirtualSpaceSocialStatus;
  readonly createdAt: number;
  /** Local receive/request time, never an untrusted remote wall clock. */
  readonly expiresAt: number;
  readonly reviewSubject?: StudioVirtualSpaceReviewSubject;
}

export interface StudioVirtualSpaceSocialSnapshot {
  readonly requests: readonly StudioVirtualSpaceSocialRequest[];
  readonly readyPeerIds: readonly string[];
  /** Peers that completed the addressed v2 handshake. Legacy peers cannot review by implication. */
  readonly reviewReadyPeerIds: readonly string[];
  readonly blockedPeerIds: readonly string[];
  readonly greetingReadyPeerIds: readonly string[];
  readonly greetings: readonly StudioVirtualSpaceGreeting[];
  readonly available: boolean;
}

export interface StudioVirtualSpaceGreeting {
  readonly id: string;
  readonly peer: StudioLiveParticipant;
  readonly direction: "incoming" | "outgoing";
  readonly status: "sending" | "delivered" | "received" | "failed";
  readonly createdAt: number;
}

export interface StudioVirtualSpaceSocialDependencies {
  readonly now?: () => number;
  readonly epoch?: string;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
  /** Consent notification only. The caller owns local movement, UI and permissions. */
  readonly onAccepted?: (request: StudioVirtualSpaceSocialRequest) => void;
  /** Fresh server reads for the local actor, not permissions claimed by the remote participant. */
  readonly authorizeReview?: (subject: StudioVirtualSpaceReviewSubject, intent: "propose" | "receive") => Promise<boolean>;
}

type PacketKind = "hello" | "request" | "accept" | "commit" | "decline" | "cancel" | "expire" | "greet" | "greet-ack";
export interface StudioVirtualSpaceSocialPacket extends StudioVirtualSpaceSocialWorld {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_SOCIAL_WIRE | typeof STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE | typeof STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE;
  readonly kind: PacketKind;
  readonly sessionEpoch: string;
  readonly targetEpoch: string | null;
  readonly senderSessionId: string;
  readonly targetSessionId: string;
  readonly sequence: number;
  readonly requestId: string | null;
  readonly action: StudioVirtualSpaceSocialAction | null;
  readonly expiresAfterMs: number;
  readonly reviewSubject?: StudioVirtualSpaceReviewSubject | null;
}

const ACTIONS = new Set<string>(["talk", "follow", "review", "high-five"]);
const KINDS = new Set<string>(["hello", "request", "accept", "commit", "decline", "cancel", "expire", "greet", "greet-ack"]);
const PACKET_KEYS = new Set([
  "wire", "kind", "worldId", "contentRevision", "sessionEpoch", "targetEpoch",
  "senderSessionId", "targetSessionId", "sequence", "requestId", "action", "expiresAfterMs",
]);

function safeId(value: unknown, maxLength = 160): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value);
}

/** Unknown fields are rejected so this channel cannot become an arbitrary remote command. */
export function parseStudioVirtualSpaceSocialPacket(raw: string): StudioVirtualSpaceSocialPacket | null {
  if (typeof raw !== "string" || raw.length > STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_BYTES
    || new TextEncoder().encode(raw).byteLength > STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const packet = value as Record<string, unknown>;
  const reviewProtocol = packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE;
  const greetingProtocol = packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE;
  if (Object.keys(packet).length !== PACKET_KEYS.size + (reviewProtocol ? 1 : 0)
    || Object.keys(packet).some((key) => !PACKET_KEYS.has(key) && !(reviewProtocol && key === "reviewSubject"))
    || (!reviewProtocol && !greetingProtocol && packet.wire !== STUDIO_VIRTUAL_SPACE_SOCIAL_WIRE)
    || (!reviewProtocol && new TextEncoder().encode(raw).byteLength > 2_048)
    || typeof packet.kind !== "string" || !KINDS.has(packet.kind)
    || !safeId(packet.worldId) || !safeId(packet.contentRevision)
    || !safeId(packet.sessionEpoch, 80)
    || !safeId(packet.senderSessionId) || !safeId(packet.targetSessionId)
    || packet.senderSessionId === packet.targetSessionId
    || !Number.isSafeInteger(packet.sequence) || Number(packet.sequence) <= 0
    || !Number.isSafeInteger(packet.expiresAfterMs)) return null;
  if (packet.kind === "greet" || packet.kind === "greet-ack") {
    if (!greetingProtocol || !safeId(packet.targetEpoch, 80) || !safeId(packet.requestId, 120)
      || packet.action !== null || packet.expiresAfterMs !== 3_000
      || (packet.kind === "greet" && packet.requestId !== `${packet.sessionEpoch}.${packet.sequence}`)) return null;
    return packet as unknown as StudioVirtualSpaceSocialPacket;
  }
  if (greetingProtocol && packet.kind !== "hello") return null;
  if (packet.kind === "hello") {
    if ((packet.targetEpoch !== null && !safeId(packet.targetEpoch, 80))
      || packet.requestId !== null || packet.action !== null || packet.expiresAfterMs !== 0) return null;
  } else if (!safeId(packet.targetEpoch, 80) || !safeId(packet.requestId, 120)
    || typeof packet.action !== "string" || !ACTIONS.has(packet.action)
    || Number(packet.expiresAfterMs) < 0
    || Number(packet.expiresAfterMs) > STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS
    || (packet.kind === "request" && (packet.expiresAfterMs === 0
      || packet.requestId !== `${packet.sessionEpoch}.${packet.sequence}`))) return null;
  if (reviewProtocol) {
    if (packet.kind === "hello") {
      if (packet.reviewSubject !== null) return null;
    } else {
      if (packet.action !== "review") return null;
      const subject = parseStudioVirtualSpaceReviewSubject(packet.reviewSubject);
      if (!subject) return null;
      return { ...packet, reviewSubject: subject } as unknown as StudioVirtualSpaceSocialPacket;
    }
  }
  return packet as unknown as StudioVirtualSpaceSocialPacket;
}

interface PeerEpoch {
  readonly localEpoch: string;
  epoch: string | null;
  sequence: number;
  retired: Set<string>;
  helloSent: boolean;
  reviewHelloSent: boolean;
  reviewReady: boolean;
  greetingHelloSent: boolean;
  greetingReady: boolean;
  windowAt: number;
  windowCount: number;
}

function pending(request: StudioVirtualSpaceSocialRequest): boolean {
  return request.status === "offered" || request.status === "accepting";
}

function immutableRequest(request: StudioVirtualSpaceSocialRequest): StudioVirtualSpaceSocialRequest {
  return Object.freeze({ ...request, peer: Object.freeze({ ...request.peer }),
    ...(request.reviewSubject ? { reviewSubject: Object.freeze({ ...request.reviewSubject }) } : {}) });
}

/**
 * Bounded consent control over the authorized, ordered and fully reliable RTC direct port.
 * directPeerReady() rejects unordered/retransmission-limited channels. send(false) is surfaced,
 * never retried as an action or relayed through the server. An epoch exchange fences controller
 * restarts; sequence watermarks and terminal records prevent delayed packets reviving consent.
 * This class does not open documents, capture devices, navigate or control a remote avatar.
 */
export class StudioVirtualSpaceSocialController {
  private readonly epoch: string;
  private readonly records = new Map<string, StudioVirtualSpaceSocialRequest>();
  private readonly peers = new Map<string, PeerEpoch>();
  private readonly blockedPeers = new Set<string>();
  private readonly greetings = new Map<string, StudioVirtualSpaceGreeting>();
  private readonly lastGreetingAt = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly reviewProposals = new Set<string>();
  private readonly reviewValidations = new Set<string>();
  private sequence = 0;
  private linkGeneration = 0;
  private proposalGeneration = 0;
  private closed = false;
  private unsubscribe: (() => void) | null = null;
  private timer: unknown | null = null;

  constructor(
    private readonly participant: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    private readonly world: StudioVirtualSpaceSocialWorld,
    private readonly dependencies: StudioVirtualSpaceSocialDependencies = {},
  ) {
    this.epoch = dependencies.epoch ?? globalThis.crypto.randomUUID();
    if (!safeId(this.epoch, 64) || !safeId(participant.sessionId)
      || !safeId(world.worldId) || !safeId(world.contentRevision)) {
      throw new Error("Invalid virtual studio social identity");
    }
    this.world = Object.freeze({ ...world });
    this.participant = Object.freeze({ ...participant });
  }

  private newPeer(): PeerEpoch {
    return { localEpoch: `${this.epoch}:${++this.linkGeneration}`, epoch: null, sequence: 0,
      retired: new Set(), helloSent: false, reviewHelloSent: false, reviewReady: false,
      greetingHelloSent: false, greetingReady: false,
      windowAt: this.now(), windowCount: 0 };
  }

  private now(): number { return this.dependencies.now?.() ?? Date.now(); }

  snapshot(): StudioVirtualSpaceSocialSnapshot {
    return Object.freeze({
      requests: Object.freeze([...this.records.values()].map(immutableRequest).reverse()),
      readyPeerIds: Object.freeze([...this.peers].filter(([, peer]) => peer.epoch !== null).map(([id]) => id)),
      reviewReadyPeerIds: Object.freeze([...this.peers].filter(([, peer]) => peer.epoch !== null && peer.reviewReady).map(([id]) => id)),
      blockedPeerIds: Object.freeze([...this.blockedPeers]),
      greetingReadyPeerIds: Object.freeze([...this.peers].filter(([, peer]) => peer.epoch !== null && peer.greetingReady).map(([id]) => id)),
      greetings: Object.freeze([...this.greetings.values()].reverse()),
      available: !this.closed && this.unsubscribe !== null && this.participant.role !== "viewer",
    });
  }

  subscribe(listener: () => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  start(): void {
    if (this.closed || this.unsubscribe || this.participant.role === "viewer") return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.syncPeers();
    this.timer = this.dependencies.setInterval
      ? this.dependencies.setInterval(() => this.syncPeers(), TICK_MS)
      : globalThis.setInterval(() => this.syncPeers(), TICK_MS);
    this.emit();
  }

  /** Also called by the bounded timer so expiry and RTC disconnect do not require UI activity. */
  syncPeers(): void {
    if (this.closed || !this.unsubscribe) return;
    const available = new Set(this.availablePeers().map((peer) => peer.sessionId));
    let changed = false;
    for (const id of this.peers.keys()) {
      if (!available.has(id)) {
        this.endPeerRequests(id, "disconnected");
        this.peers.delete(id);
        this.lastRequestAt.delete(id);
        this.lastGreetingAt.delete(`in:${id}`); this.lastGreetingAt.delete(`out:${id}`);
        changed = true;
      }
    }
    for (const id of available) {
      let peer = this.peers.get(id);
      if (!peer) {
        peer = this.newPeer();
        this.peers.set(id, peer);
      }
      if (!peer.helloSent) peer.helloSent = this.send(id, "hello", null);
      if (!peer.greetingHelloSent) peer.greetingHelloSent = this.send(id, "hello", null, undefined, STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE);
      if (this.dependencies.authorizeReview && !peer.reviewHelloSent) {
        peer.reviewHelloSent = this.send(id, "hello", null, undefined, STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE);
      }
    }
    for (const request of this.records.values()) {
      if (pending(request) && request.expiresAt <= this.now()) {
        this.setStatus(request.id, "expired");
        this.send(request.peer.sessionId, "expire", this.peers.get(request.peer.sessionId)?.epoch ?? null, request);
        changed = true;
      }
    }
    for (const [id, greeting] of this.greetings) {
      if (this.now() - greeting.createdAt > 30_000) { this.greetings.delete(id); changed = true; }
      else if (greeting.status === "sending" && this.now() - greeting.createdAt >= 3_000) {
        this.greetings.set(id, Object.freeze({ ...greeting, status: "failed" })); changed = true;
      }
    }
    if (changed) this.emit();
  }

  request(targetSessionId: string, action: StudioVirtualSpaceSocialAction): string | null {
    if (action === "review") return null;
    return this.createRequest(targetSessionId, action);
  }

  async requestReview(targetSessionId: string, rawSubject: StudioVirtualSpaceReviewSubject, signal?: AbortSignal): Promise<string | null> {
    const subject = parseStudioVirtualSpaceReviewSubject(rawSubject);
    const peer = this.peers.get(targetSessionId);
    if (signal?.aborted || !subject || !this.snapshot().available || !peer?.reviewReady
      || this.reviewProposals.has(targetSessionId) || this.reviewProposals.size >= STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_PENDING) return null;
    this.reviewProposals.add(targetSessionId);
    const startedAt = this.now();
    const remoteEpoch = peer.epoch, proposalGeneration = this.proposalGeneration;
    try {
      const allowed = await this.authorizeReview(subject, "propose");
      if (proposalGeneration !== this.proposalGeneration || signal?.aborted || !allowed || this.closed || this.peers.get(targetSessionId) !== peer || peer.epoch !== remoteEpoch
        || this.now() < startedAt || this.now() - startedAt >= STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS) return null;
      return this.createRequest(targetSessionId, "review", subject);
    } finally { this.reviewProposals.delete(targetSessionId); }
  }

  private createRequest(targetSessionId: string, action: StudioVirtualSpaceSocialAction,
    reviewSubject?: StudioVirtualSpaceReviewSubject): string | null {
    if (!this.snapshot().available || !ACTIONS.has(action)) return null;
    this.syncPeers();
    const peer = this.availablePeers().find((candidate) => candidate.sessionId === targetSessionId);
    const epoch = this.peers.get(targetSessionId)?.epoch;
    const outstanding = [...this.records.values()].filter(pending);
    if (!peer || !epoch || outstanding.length >= STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_PENDING
      || outstanding.some((request) => request.peer.sessionId === targetSessionId)
      || this.now() - (this.lastRequestAt.get(targetSessionId) ?? -Infinity) < 1_000) return null;
    const id = `${this.peers.get(targetSessionId)?.localEpoch}.${this.sequence + 1}`;
    const request: StudioVirtualSpaceSocialRequest = immutableRequest({
      id, action, peer, direction: "outgoing", status: "offered",
      createdAt: this.now(), expiresAt: this.now() + STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS,
      ...(reviewSubject ? { reviewSubject } : {}),
    });
    if (!this.store(request)) return null;
    this.lastRequestAt.set(targetSessionId, this.now());
    const sent = this.send(targetSessionId, "request", epoch, request);
    if (!sent) this.setStatus(id, "failed");
    this.emit();
    return sent ? id : null;
  }

  respond(id: string, response: "accept" | "decline"): boolean {
    if (response === "accept" && this.records.get(id)?.action === "review") return false;
    return this.respondAuthorized(id, response);
  }

  async respondReview(id: string, response: "accept" | "decline"): Promise<boolean> {
    const request = this.records.get(id);
    if (!request?.reviewSubject || request.action !== "review" || request.direction !== "incoming"
      || request.status !== "offered") return false;
    if (response === "decline") return this.respond(id, response);
    if (response !== "accept" || this.reviewValidations.has(id)) return false;
    this.reviewValidations.add(id);
    try {
      const allowed = await this.authorizeReview(request.reviewSubject, "receive");
      this.syncPeers();
      if (this.closed || this.records.get(id)?.status !== "offered") return false;
      if (!allowed) { this.respond(id, "decline"); return false; }
      return this.respondAuthorized(id, "accept");
    } finally { this.reviewValidations.delete(id); }
  }

  private respondAuthorized(id: string, response: "accept" | "decline"): boolean {
    if (this.closed || (response !== "accept" && response !== "decline")) return false;
    this.syncPeers();
    const request = this.records.get(id);
    if (!request || request.direction !== "incoming" || request.status !== "offered") return false;
    this.setStatus(id, response === "accept" ? "accepting" : "declined");
    const sent = this.send(request.peer.sessionId, response,
      this.peers.get(request.peer.sessionId)?.epoch ?? null, request);
    if (!sent) this.setStatus(id, "failed");
    this.emit();
    return sent;
  }

  /** Cancel unfinished consent without interrupting an already accepted private conversation. */
  cancelPending(): void {
    ++this.proposalGeneration;
    for (const request of this.records.values()) if (pending(request)) this.cancel(request.id);
  }

  cancel(id: string): boolean {
    if (this.closed) return false;
    const request = this.records.get(id);
    if (!request || (!pending(request) && request.status !== "accepted")) return false;
    this.setStatus(id, "cancelled");
    const sent = this.send(request.peer.sessionId, "cancel",
      this.peers.get(request.peer.sessionId)?.epoch ?? null, request);
    this.emit();
    return sent;
  }

  /** Session-scoped social block. Cancel existing consent before dropping the peer's controls. */
  setPeerBlocked(id: string, blocked: boolean): void {
    if (this.closed || !safeId(id) || id === this.participant.sessionId) return;
    if (blocked) {
      if (this.blockedPeers.size >= 128 && !this.blockedPeers.has(id)) return;
      for (const request of this.records.values()) {
        if (request.peer.sessionId === id && (pending(request) || request.status === "accepted")) this.cancel(request.id);
      }
      this.blockedPeers.add(id);
      for (const [key, greeting] of this.greetings) if (greeting.peer.sessionId === id) this.greetings.delete(key);
    } else this.blockedPeers.delete(id);
    this.syncPeers();
    this.emit();
  }

  wave(id: string): boolean {
    const epoch = this.peers.get(id);
    const peer = this.availablePeers().find((item) => item.sessionId === id);
    if (!this.snapshot().available || !peer || !epoch?.greetingReady || !epoch.epoch
      || this.now() - (this.lastGreetingAt.get(`out:${id}`) ?? -Infinity) < 2_000) return false;
    const requestId = `${epoch.localEpoch}.${this.sequence + 1}`;
    this.lastGreetingAt.set(`out:${id}`, this.now());
    this.storeGreeting({ id: requestId, peer, direction: "outgoing", status: "sending", createdAt: this.now() });
    const sent = this.sendGreeting(id, "greet", requestId);
    if (!sent) this.storeGreeting({ id: requestId, peer, direction: "outgoing", status: "failed", createdAt: this.now() });
    this.emit(); return sent;
  }

  private storeGreeting(greeting: StudioVirtualSpaceGreeting): void {
    if (!this.greetings.has(greeting.id) && this.greetings.size >= 32) this.greetings.delete(this.greetings.keys().next().value!);
    this.greetings.set(greeting.id, Object.freeze({ ...greeting, peer: Object.freeze({ ...greeting.peer }) }));
  }

  private sendGreeting(id: string, kind: "greet" | "greet-ack", requestId: string): boolean {
    const peer = this.peers.get(id);
    if (this.closed || !peer?.epoch || !peer.greetingReady || this.blockedPeers.has(id)) return false;
    const packet: StudioVirtualSpaceSocialPacket = { wire: STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE, kind, ...this.world,
      sessionEpoch: peer.localEpoch, targetEpoch: peer.epoch, senderSessionId: this.participant.sessionId,
      targetSessionId: id, sequence: ++this.sequence, requestId, action: null, expiresAfterMs: 3_000 };
    try { return this.port.send(id, JSON.stringify(packet)); } catch { return false; }
  }

  private availablePeers(): StudioLiveParticipant[] {
    return this.port.getPeers().filter((peer) => peer.sessionId !== this.participant.sessionId
      && peer.role !== "viewer" && safeId(peer.sessionId) && !this.blockedPeers.has(peer.sessionId)).slice(0, MAX_PEERS);
  }

  private send(targetSessionId: string, kind: PacketKind, targetEpoch: string | null,
    request?: StudioVirtualSpaceSocialRequest,
    wire: StudioVirtualSpaceSocialPacket["wire"] = request?.reviewSubject ? STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE : STUDIO_VIRTUAL_SPACE_SOCIAL_WIRE): boolean {
    const localEpoch = this.peers.get(targetSessionId)?.localEpoch;
    if (this.closed || !localEpoch || (kind !== "hello" && !targetEpoch)) return false;
    const packet: StudioVirtualSpaceSocialPacket = {
      wire, kind, ...this.world,
      sessionEpoch: localEpoch, targetEpoch, senderSessionId: this.participant.sessionId,
      targetSessionId, sequence: ++this.sequence, requestId: request?.id ?? null,
      action: request?.action ?? null,
      expiresAfterMs: request ? Math.max(0, Math.floor(Math.min(STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS, request.expiresAt - this.now()))) : 0,
      ...(wire === STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE ? { reviewSubject: request?.reviewSubject ?? null } : {}),
    };
    try { return this.port.send(targetSessionId, JSON.stringify(packet)); } catch { return false; }
  }

  private receive(sender: StudioLiveParticipant, raw: string): void {
    if (this.closed || !this.unsubscribe || sender.role === "viewer") return;
    const actualPeer = this.availablePeers().find((peer) => peer.sessionId === sender.sessionId);
    if (!actualPeer) return;
    const packet = parseStudioVirtualSpaceSocialPacket(raw);
    if (!packet || packet.senderSessionId !== actualPeer.sessionId
      || packet.targetSessionId !== this.participant.sessionId
      || packet.worldId !== this.world.worldId || packet.contentRevision !== this.world.contentRevision) return;
    let peer = this.peers.get(actualPeer.sessionId);
    if (!peer) {
      if (this.peers.size >= MAX_PEERS) return;
      peer = this.newPeer();
      this.peers.set(actualPeer.sessionId, peer);
    }
    if (packet.targetEpoch !== null && packet.targetEpoch !== peer.localEpoch) return;
    if (this.now() - peer.windowAt >= 3_000) { peer.windowAt = this.now(); peer.windowCount = 0; }
    if (++peer.windowCount > 32 || peer.retired.has(packet.sessionEpoch)) return;
    if (packet.kind === "hello") {
      if (packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE && !this.dependencies.authorizeReview) return;
      if (packet.targetEpoch === null) {
        this.send(actualPeer.sessionId, "hello", packet.sessionEpoch, undefined, packet.wire);
      } else if (peer.epoch !== packet.sessionEpoch) {
        if (peer.retired.size >= MAX_RETIRED_EPOCHS) {
          // Rotate our challenge before clearing retired epochs: old packets then target the
          // wrong nonce, while repeated focus changes/restarts remain usable in long sessions.
          this.endPeerRequests(actualPeer.sessionId, "disconnected");
          peer = this.newPeer();
          this.peers.set(actualPeer.sessionId, peer);
          peer.helloSent = this.send(actualPeer.sessionId, "hello", null);
          this.emit();
          return;
        }
        if (peer.epoch) {
          peer.retired.add(peer.epoch);
          this.endPeerRequests(actualPeer.sessionId, "disconnected");
        }
        peer.epoch = packet.sessionEpoch;
        peer.reviewReady = packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE;
        peer.greetingReady = packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE;
        peer.sequence = packet.sequence;
        peer.helloSent = true;
        this.send(actualPeer.sessionId, "hello", packet.sessionEpoch, undefined, packet.wire);
        this.emit();
      } else if (packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_REVIEW_WIRE && !peer.reviewReady) {
        peer.reviewReady = true;
        this.send(actualPeer.sessionId, "hello", packet.sessionEpoch, undefined, packet.wire);
        this.emit();
      } else if (packet.wire === STUDIO_VIRTUAL_SPACE_SOCIAL_GREETING_WIRE && !peer.greetingReady) {
        peer.greetingReady = true;
        this.send(actualPeer.sessionId, "hello", packet.sessionEpoch, undefined, packet.wire);
        this.emit();
      }
      return;
    }
    if (peer.epoch !== packet.sessionEpoch || packet.sequence <= peer.sequence) return;
    peer.sequence = packet.sequence;
    if (packet.kind === "greet" || packet.kind === "greet-ack") {
      if (!peer.greetingReady || !packet.requestId) return;
      if (packet.kind === "greet") {
        if (this.now() - (this.lastGreetingAt.get(`in:${actualPeer.sessionId}`) ?? -Infinity) < 2_000) return;
        this.lastGreetingAt.set(`in:${actualPeer.sessionId}`, this.now());
        this.storeGreeting({ id: packet.requestId, peer: actualPeer, direction: "incoming", status: "received", createdAt: this.now() });
        this.sendGreeting(actualPeer.sessionId, "greet-ack", packet.requestId);
      } else {
        const greeting = this.greetings.get(packet.requestId);
        if (!greeting || greeting.peer.sessionId !== actualPeer.sessionId || greeting.direction !== "outgoing"
          || greeting.status !== "sending" || this.now() - greeting.createdAt >= 3_000) return;
        this.storeGreeting({ ...greeting, status: "delivered" });
      }
      this.emit(); return;
    }
    if (!packet.requestId || !packet.action) return;
    // A v1 review offers no immutable subject; do not let legacy clients downgrade consent.
    if (packet.action === "review" && (!packet.reviewSubject || !peer.reviewReady || !this.dependencies.authorizeReview)) return;
    let request = this.records.get(packet.requestId);
    if (packet.kind === "request") {
      if (request) return;
      request = immutableRequest({
        id: packet.requestId, action: packet.action, peer: actualPeer,
        direction: "incoming", status: "offered", createdAt: this.now(),
        expiresAt: this.now() + packet.expiresAfterMs,
        ...(packet.reviewSubject ? { reviewSubject: packet.reviewSubject } : {}),
      });
      const outstanding = [...this.records.values()].filter(pending);
      const competing = outstanding.find((candidate) => candidate.peer.sessionId === actualPeer.sessionId);
      if (!this.store(request)) {
        this.send(actualPeer.sessionId, "decline", peer.epoch, request);
        return;
      }
      if ((competing && (competing.direction === "incoming" || competing.id < request.id))
        || outstanding.length >= STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_PENDING) {
        this.respond(request.id, "decline");
      } else if (competing) {
        this.cancel(competing.id);
      }
      this.emit();
      return;
    }
    if (!request || request.peer.sessionId !== actualPeer.sessionId || request.action !== packet.action
      || !sameStudioVirtualSpaceReviewSubject(request.reviewSubject, packet.reviewSubject)) return;
    // A peer may expire while our commit is delayed. Its authenticated terminal response
    // revokes the local accepted activity too; accepting must not create one-sided consent.
    if (!pending(request) && !(request.status === "accepted"
      && (packet.kind === "cancel" || packet.kind === "expire"))) return;
    if (pending(request) && request.expiresAt <= this.now()) {
      this.setStatus(request.id, "expired");
      this.emit();
      return;
    }
    if (packet.kind === "cancel" || packet.kind === "expire" || packet.kind === "decline") {
      this.setStatus(request.id, packet.kind === "cancel" ? "cancelled" : packet.kind === "expire" ? "expired" : "declined");
    } else if (packet.kind === "accept" && request.direction === "outgoing" && request.status === "offered") {
      if (request.reviewSubject) { void this.completeReviewConsent(request, "propose"); return; }
      // Establish local state before send; fake ports and embedded transports may deliver synchronously.
      this.setStatus(request.id, "accepting");
      if (this.send(actualPeer.sessionId, "commit", peer.epoch, request)) this.accept(request.id);
      else this.setStatus(request.id, "failed");
    } else if (packet.kind === "commit" && request.direction === "incoming" && request.status === "accepting") {
      if (request.reviewSubject) { void this.completeReviewConsent(request, "receive"); return; }
      this.accept(request.id);
    }
    this.emit();
  }

  private async authorizeReview(subject: StudioVirtualSpaceReviewSubject, intent: "propose" | "receive"): Promise<boolean> {
    try { return (await this.dependencies.authorizeReview?.(subject, intent)) === true; } catch { return false; }
  }

  private async completeReviewConsent(request: StudioVirtualSpaceSocialRequest, intent: "propose" | "receive"): Promise<void> {
    if (!request.reviewSubject || this.reviewValidations.has(request.id)) return;
    this.reviewValidations.add(request.id);
    try {
      const allowed = await this.authorizeReview(request.reviewSubject, intent);
      this.syncPeers();
      const current = this.records.get(request.id);
      if (this.closed || !current || !pending(current)) return;
      if (!allowed) { this.cancel(request.id); return; }
      if (intent === "propose") {
        if (current.status !== "offered") return;
        this.setStatus(request.id, "accepting");
        if (this.send(request.peer.sessionId, "commit", this.peers.get(request.peer.sessionId)?.epoch ?? null, request)) this.accept(request.id);
        else this.setStatus(request.id, "failed");
      } else if (current.status === "accepting") this.accept(request.id);
      this.emit();
    } finally { this.reviewValidations.delete(request.id); }
  }

  private accept(id: string): void {
    const request = this.records.get(id);
    if (!request || request.status !== "accepting") return;
    this.setStatus(id, "accepted");
    const accepted = this.records.get(id);
    if (accepted) this.dependencies.onAccepted?.(immutableRequest(accepted));
  }

  private store(request: StudioVirtualSpaceSocialRequest): boolean {
    if (!this.records.has(request.id) && this.records.size >= MAX_RECORDS) {
      // Accepted records still own active conversations/following. Only finished history can
      // be evicted; rejecting a new offer must never terminate an unrelated shared activity.
      const oldestTerminal = [...this.records.values()].find((candidate) =>
        !pending(candidate) && candidate.status !== "accepted",
      );
      if (!oldestTerminal) return false;
      this.records.delete(oldestTerminal.id);
    }
    this.records.set(request.id, request);
    return true;
  }

  private setStatus(id: string, status: StudioVirtualSpaceSocialStatus): void {
    const request = this.records.get(id);
    if (request) this.records.set(id, immutableRequest({ ...request, status }));
  }

  private endPeerRequests(peerId: string, status: "disconnected" | "cancelled"): void {
    for (const request of this.records.values()) {
      if (request.peer.sessionId === peerId && (pending(request) || request.status === "accepted")) {
        this.setStatus(request.id, status);
      }
    }
  }

  private emit(): void { for (const listener of this.listeners) listener(); }

  close(): void {
    if (this.closed) return;
    for (const request of this.records.values()) {
      if (pending(request) || request.status === "accepted") this.cancel(request.id);
    }
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) {
      if (this.dependencies.clearInterval) this.dependencies.clearInterval(this.timer);
      else globalThis.clearInterval(this.timer as ReturnType<typeof setInterval>);
    }
    this.timer = null;
    this.peers.clear();
    this.emit();
    this.listeners.clear();
  }
}
