import {
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,
  assertStudioLiveCursorPayload,
  createStudioLiveEnvelope,
  parseStudioLiveEnvelope,
  studioLocalLiveChannelName,
  type StudioLiveCursorPayload,
  type StudioLiveEnvelope,
  type StudioLiveLockClaimPayload,
  type StudioLiveMessageKind,
  type StudioLiveParticipant,
  type StudioLivePayloadMap,
  type StudioLivePresencePayload,
  type StudioLiveScreenAnnouncePayload,
  type StudioLiveScreenAccessPayload,
  type StudioLiveScreenRequestPayload,
  type StudioLiveScreenStopPayload,
  type StudioLiveWebRtcDescriptionPayload,
  type StudioLiveWebRtcIcePayload,
} from "./studio-live-collaboration-protocol";
import {
  createStudioLocalLiveTransport,
  type StudioLiveTransport,
  type StudioLiveTransportControlEvent,
  type StudioLiveTransportFactory,
  type StudioLiveTransportMode,
  type StudioLiveTransportStatus,
} from "./studio-live-collaboration-transport";

const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_PRESENCE_TTL_MS = 30_000;
const DEFAULT_LOCK_LEASE_MS = 15_000;
const DEFAULT_CURSOR_INTERVAL_MS = 40;

type StudioLiveSignalKind =
  | "screen:announce"
  | "screen:request"
  | "screen:access"
  | "webrtc:description"
  | "webrtc:ice"
  | "screen:stop";

export type StudioLiveSignalEnvelope = {
  [K in StudioLiveSignalKind]: StudioLiveEnvelope<K>;
}[StudioLiveSignalKind];

export interface StudioLivePeer extends StudioLiveParticipant {
  visibility: StudioLivePresencePayload["visibility"];
  pageId: string | null;
  lastSeenAt: number;
}

export interface StudioLiveLock {
  resource: string;
  claimId: string;
  owner: StudioLiveParticipant;
  leaseUntil: number;
}

export type StudioLiveRoomEvent =
  | { type: "presence"; peers: StudioLivePeer[] }
  | {
      type: "cursor";
      participant: StudioLiveParticipant;
      cursor: StudioLiveCursorPayload;
    }
  | { type: "locks"; locks: StudioLiveLock[] }
  | { type: "signal"; envelope: StudioLiveSignalEnvelope }
  | { type: "transport-status"; status: StudioLiveTransportStatus }
  | { type: "transport-error"; message: string };

export interface StudioLiveRoomDependencies {
  transportFactory?: StudioLiveTransportFactory;
  now?: () => number;
  randomId?: () => string;
  setInterval?: (handler: () => void, delay: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  heartbeatMs?: number;
  presenceTtlMs?: number;
  lockLeaseMs?: number;
  cursorIntervalMs?: number;
}

export interface StudioLiveRoomOptions {
  workId: string;
  participant: StudioLiveParticipant;
  initialPageId?: string | null;
  dependencies?: StudioLiveRoomDependencies;
}

function defaultRandomId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 공동작업 세션 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

function defaultSetInterval(handler: () => void, delay: number): unknown {
  return globalThis.setInterval(handler, delay);
}

function defaultClearInterval(handle: unknown): void {
  globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
}

function boundedTiming(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value ?? fallback)));
}

function copyParticipant(participant: StudioLiveParticipant): StudioLiveParticipant {
  return { ...participant };
}

function lockPriority(lock: Pick<StudioLiveLock, "claimId" | "owner">): string {
  return `${lock.claimId}\u0000${lock.owner.sessionId}`;
}

/**
 * Transport-neutral presence/cursor/lease-lock room. BroadcastChannel is the local default; a
 * Socket.IO transport can be injected only after its server join acknowledgement has passed ACL.
 */
export class StudioLiveRoom {
  readonly workId: string;
  readonly participant: StudioLiveParticipant;

  private readonly transportFactory: StudioLiveTransportFactory;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly scheduleInterval: (handler: () => void, delay: number) => unknown;
  private readonly cancelInterval: (handle: unknown) => void;
  private readonly heartbeatMs: number;
  private readonly presenceTtlMs: number;
  private readonly lockLeaseMs: number;
  private readonly cursorIntervalMs: number;
  private readonly listeners = new Set<(event: StudioLiveRoomEvent) => void>();
  private readonly peers = new Map<string, StudioLivePeer>();
  private readonly locks = new Map<string, StudioLiveLock>();
  private readonly lastSequenceBySession = new Map<string, number>();
  private transport: StudioLiveTransport | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private unsubscribeTransportControl: (() => void) | null = null;
  private heartbeatHandle: unknown = null;
  private phase: "idle" | "starting" | "ready" | "closed" = "idle";
  private startPromise: Promise<void> | null = null;
  private connectionGeneration = 0;
  private sequence = 0;
  private lastCursorSentAt = Number.NEGATIVE_INFINITY;
  private presence: StudioLivePresencePayload;

  constructor(options: StudioLiveRoomOptions) {
    this.workId = options.workId;
    this.participant = copyParticipant(options.participant);
    this.presence = {
      visibility: "active",
      pageId: options.initialPageId ?? null,
    };
    const deps = options.dependencies ?? {};
    this.transportFactory = deps.transportFactory ?? createStudioLocalLiveTransport;
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? defaultRandomId;
    this.scheduleInterval = deps.setInterval ?? defaultSetInterval;
    this.cancelInterval = deps.clearInterval ?? defaultClearInterval;
    this.heartbeatMs = boundedTiming(deps.heartbeatMs, DEFAULT_HEARTBEAT_MS, 250, 30_000);
    this.presenceTtlMs = boundedTiming(
      deps.presenceTtlMs,
      DEFAULT_PRESENCE_TTL_MS,
      this.heartbeatMs * 2,
      120_000
    );
    this.lockLeaseMs = boundedTiming(
      deps.lockLeaseMs,
      DEFAULT_LOCK_LEASE_MS,
      this.heartbeatMs + 250,
      STUDIO_LIVE_LOCK_MAX_LEASE_MS
    );
    this.cursorIntervalMs = boundedTiming(
      deps.cursorIntervalMs,
      DEFAULT_CURSOR_INTERVAL_MS,
      16,
      1_000
    );

    // Validate work and participant synchronously before any transport is opened.
    createStudioLiveEnvelope({
      workId: this.workId,
      sender: this.participant,
      sentAt: this.now(),
      sequence: 1,
      kind: "presence:hello",
      payload: this.presence,
    });
  }

  get ready(): boolean {
    return this.phase === "ready" && this.transport?.ready === true;
  }

  get mode(): StudioLiveTransportMode | null {
    return this.transport?.mode ?? null;
  }

  subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.phase === "ready") return;
    if (this.phase === "closed") throw new Error("이미 닫힌 공동작업 세션입니다.");
    if (this.startPromise) return this.startPromise;

    const generation = ++this.connectionGeneration;
    this.phase = "starting";
    const run = async () => {
      const transport = this.transportFactory({
        workId: this.workId,
        roomName: studioLocalLiveChannelName(this.workId),
        participant: copyParticipant(this.participant),
      });
      this.transport = transport;
      this.unsubscribeTransport = transport.subscribe((value) => this.onTransportMessage(value));
      this.unsubscribeTransportControl =
        transport.subscribeControl?.((event) => this.onTransportControl(event)) ?? null;
      try {
        await transport.connect();
        if (this.phase === "closed" || generation !== this.connectionGeneration) {
          transport.close();
          return;
        }
        this.phase = "ready";
        this.sendPresence("presence:hello");
        this.heartbeatHandle = this.scheduleInterval(() => this.onHeartbeat(), this.heartbeatMs);
      } catch (error) {
        if (generation === this.connectionGeneration && this.phase !== "closed") {
          this.phase = "idle";
          this.transport = null;
          this.unsubscribeTransport?.();
          this.unsubscribeTransport = null;
          this.unsubscribeTransportControl?.();
          this.unsubscribeTransportControl = null;
        }
        transport.close();
        throw error;
      } finally {
        this.startPromise = null;
      }
    };
    const runPromise = run();
    this.startPromise = runPromise;
    return runPromise;
  }

  getPeers(): StudioLivePeer[] {
    return Array.from(this.peers.values(), (peer) => ({ ...peer })).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "ko-KR") ||
      a.sessionId.localeCompare(b.sessionId)
    );
  }

  getLocks(): StudioLiveLock[] {
    this.pruneExpired(this.now());
    return Array.from(this.locks.values(), (lock) => ({
      ...lock,
      owner: copyParticipant(lock.owner),
    })).sort((a, b) => a.resource.localeCompare(b.resource));
  }

  updatePresence(patch: Partial<StudioLivePresencePayload>): void {
    const tool = patch.tool === undefined ? this.presence.tool : patch.tool;
    const next: StudioLivePresencePayload = {
      visibility: patch.visibility ?? this.presence.visibility,
      pageId: patch.pageId === undefined ? this.presence.pageId : patch.pageId,
      ...(tool === undefined ? {} : { tool }),
    };
    // Envelope creation is also the runtime validator for UI-derived page ids.
    createStudioLiveEnvelope({
      workId: this.workId,
      sender: this.participant,
      sentAt: this.now(),
      sequence: Math.max(1, this.sequence + 1),
      kind: "presence:heartbeat",
      payload: next,
    });
    this.presence = next;
    if (this.ready) this.sendPresence("presence:heartbeat");
  }

  publishCursor(cursor: StudioLiveCursorPayload): boolean {
    if (!this.ready) return false;
    const now = this.now();
    assertStudioLiveCursorPayload(cursor);
    if (now - this.lastCursorSentAt < this.cursorIntervalMs) return false;
    const sent = this.post("cursor:update", cursor, null, now);
    if (sent) this.lastCursorSentAt = now;
    return sent;
  }

  /** Clears a remote pointer immediately; leave/page/visibility boundaries must not wait for TTL. */
  clearCursor(): boolean {
    if (!this.ready) return false;
    return this.post("cursor:update", { x: 0, y: 0, pageId: null, tool: null });
  }

  claimLock(resource: string): boolean {
    if (!this.ready) return false;
    const now = this.now();
    this.pruneExpired(now);
    const previous = this.locks.get(resource);
    if (previous && previous.owner.sessionId !== this.participant.sessionId) return false;

    const claimId = previous?.claimId ?? this.randomId();
    const payload: StudioLiveLockClaimPayload = {
      resource,
      claimId,
      leaseUntil: now + this.lockLeaseMs,
    };
    const envelope = this.buildEnvelope("lock:claim", payload, null, now);
    if (this.transport?.mode === "server") {
      // The server owns lease ids and conflict decisions. Commit only after its authoritative ACK
      // arrives through the transport control plane; otherwise an optimistic local lock diverges.
      return this.sendEnvelope(envelope);
    }
    this.applyLockClaim(envelope);
    if (this.sendEnvelope(envelope)) return true;

    if (previous) this.locks.set(resource, previous);
    else this.locks.delete(resource);
    this.emitLocks();
    return false;
  }

  releaseLock(resource: string): boolean {
    const current = this.locks.get(resource);
    if (!current || current.owner.sessionId !== this.participant.sessionId) return false;
    if (this.transport?.mode === "server") {
      return this.post(
        "lock:release",
        { resource, claimId: current.claimId },
        null,
        this.now()
      );
    }
    this.locks.delete(resource);
    this.emitLocks();
    return this.post(
      "lock:release",
      { resource, claimId: current.claimId },
      null,
      this.now()
    );
  }

  announceScreen(payload: StudioLiveScreenAnnouncePayload): boolean {
    return this.post("screen:announce", payload);
  }

  requestScreen(targetSessionId: string, payload: StudioLiveScreenRequestPayload): boolean {
    return this.post("screen:request", payload, targetSessionId);
  }

  respondScreen(targetSessionId: string, payload: StudioLiveScreenAccessPayload): boolean {
    return this.post("screen:access", payload, targetSessionId);
  }

  sendWebRtcDescription(
    targetSessionId: string,
    payload: StudioLiveWebRtcDescriptionPayload
  ): boolean {
    return this.post("webrtc:description", payload, targetSessionId);
  }

  sendWebRtcIce(targetSessionId: string, payload: StudioLiveWebRtcIcePayload): boolean {
    return this.post("webrtc:ice", payload, targetSessionId);
  }

  stopScreen(payload: StudioLiveScreenStopPayload): boolean {
    return this.post("screen:stop", payload);
  }

  close(): void {
    if (this.phase === "closed") return;
    ++this.connectionGeneration;
    if (this.ready) {
      for (const lock of this.locks.values()) {
        if (lock.owner.sessionId !== this.participant.sessionId) continue;
        this.post("lock:release", { resource: lock.resource, claimId: lock.claimId });
      }
      this.post("presence:leave", {});
    }
    this.phase = "closed";
    if (this.heartbeatHandle !== null) this.cancelInterval(this.heartbeatHandle);
    this.heartbeatHandle = null;
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.unsubscribeTransportControl?.();
    this.unsubscribeTransportControl = null;
    this.transport?.close();
    this.transport = null;
    this.peers.clear();
    this.locks.clear();
    this.lastSequenceBySession.clear();
    this.listeners.clear();
  }

  private onHeartbeat(): void {
    if (!this.ready) return;
    const now = this.now();
    this.sendPresence("presence:heartbeat");
    for (const lock of Array.from(this.locks.values())) {
      if (lock.owner.sessionId !== this.participant.sessionId) continue;
      const payload: StudioLiveLockClaimPayload = {
        resource: lock.resource,
        claimId: lock.claimId,
        leaseUntil: now + this.lockLeaseMs,
      };
      const envelope = this.buildEnvelope("lock:claim", payload, null, now);
      if (this.transport?.mode !== "server") this.applyLockClaim(envelope);
      this.sendEnvelope(envelope);
    }
    this.pruneExpired(now);
  }

  private sendPresence(kind: "presence:hello" | "presence:heartbeat"): void {
    // v1 BroadcastChannel clients validate presence with an exact two-key payload. Keep the
    // same-origin wire shape rolling-deploy compatible while allowing the authenticated socket
    // adapter to publish the active tool through the server's existing presence contract.
    const payload: StudioLivePresencePayload =
      this.transport?.mode === "server"
        ? this.presence
        : {
            visibility: this.presence.visibility,
            pageId: this.presence.pageId,
          };
    this.post(kind, payload);
  }

  private buildEnvelope<K extends StudioLiveMessageKind>(
    kind: K,
    payload: StudioLivePayloadMap[K],
    targetSessionId: string | null = null,
    sentAt = this.now()
  ): StudioLiveEnvelope<K> {
    if (this.sequence >= Number.MAX_SAFE_INTEGER) {
      throw new Error("공동작업 메시지 순번 한도에 도달했습니다. 세션을 다시 열어 주세요.");
    }
    return createStudioLiveEnvelope({
      workId: this.workId,
      sender: this.participant,
      sentAt,
      sequence: ++this.sequence,
      kind,
      targetSessionId,
      payload,
    });
  }

  private post<K extends StudioLiveMessageKind>(
    kind: K,
    payload: StudioLivePayloadMap[K],
    targetSessionId: string | null = null,
    sentAt = this.now()
  ): boolean {
    if (!this.ready) return false;
    return this.sendEnvelope(this.buildEnvelope(kind, payload, targetSessionId, sentAt));
  }

  private sendEnvelope(envelope: StudioLiveEnvelope): boolean {
    if (!this.transport?.send(envelope)) {
      this.emit({ type: "transport-error", message: "공동작업 메시지를 보내지 못했습니다." });
      return false;
    }
    return true;
  }

  private onTransportMessage(value: unknown): void {
    if (!this.ready) return;
    const receivedAt = this.now();
    const envelope = parseStudioLiveEnvelope(value, {
      expectedWorkId: this.workId,
      selfSessionId: this.participant.sessionId,
      now: receivedAt,
    });
    if (!envelope) return;
    const previousSequence = this.lastSequenceBySession.get(envelope.sender.sessionId) ?? 0;
    if (envelope.sequence <= previousSequence) return;
    this.lastSequenceBySession.set(envelope.sender.sessionId, envelope.sequence);

    if (envelope.kind === "presence:leave") {
      const presenceChanged = this.peers.delete(envelope.sender.sessionId);
      this.lastSequenceBySession.delete(envelope.sender.sessionId);
      let locksChanged = false;
      for (const [resource, lock] of this.locks) {
        if (lock.owner.sessionId !== envelope.sender.sessionId) continue;
        this.locks.delete(resource);
        locksChanged = true;
      }
      if (presenceChanged) this.emitPresence();
      if (locksChanged) this.emitLocks();
      return;
    }

    const presenceChanged = this.upsertPeer(envelope, receivedAt);
    if (presenceChanged) this.emitPresence();

    switch (envelope.kind) {
      case "presence:hello":
        // BroadcastChannel does not replay an older tab's hello. Reply immediately so a late joiner
        // discovers every already-open participant without waiting for the next heartbeat tick.
        this.sendPresence("presence:heartbeat");
        if (!presenceChanged) this.emitPresence();
        return;
      case "presence:heartbeat":
        if (!presenceChanged) this.emitPresence();
        return;
      case "cursor:update":
        this.emit({
          type: "cursor",
          participant: copyParticipant(envelope.sender),
          cursor: { ...(envelope.payload as StudioLiveCursorPayload) },
        });
        return;
      case "lock:claim":
        this.applyLockClaim(envelope as StudioLiveEnvelope<"lock:claim">);
        return;
      case "lock:release":
        this.applyLockRelease(envelope as StudioLiveEnvelope<"lock:release">);
        return;
      case "screen:announce":
      case "screen:request":
      case "screen:access":
      case "webrtc:description":
      case "webrtc:ice":
      case "screen:stop":
        this.emit({ type: "signal", envelope: envelope as StudioLiveSignalEnvelope });
        return;
    }
  }

  private onTransportControl(event: StudioLiveTransportControlEvent): void {
    if (this.phase === "closed") return;
    if (event.type === "status") {
      if (event.status.state === "revoked") {
        const hadPeers = this.peers.size > 0;
        const hadLocks = this.locks.size > 0;
        this.peers.clear();
        this.locks.clear();
        this.lastSequenceBySession.clear();
        if (hadPeers) this.emitPresence();
        if (hadLocks) this.emitLocks();
      } else if (
        event.status.state === "ready" &&
        this.phase === "ready" &&
        this.transport?.ready
      ) {
        // Reconnect joins start with a fresh server participant. Restore the current page and
        // visibility immediately instead of waiting up to one heartbeat interval.
        this.sendPresence("presence:heartbeat");
      }
      this.emit({ type: "transport-status", status: event.status });
      return;
    }
    // Socket ACKs and broadcasts can already be queued when access is revoked or the connection
    // drops. A late authoritative lease must never repopulate Room state while transport is down.
    if (!this.ready) return;
    if (event.lock.action === "acquired") {
      const next: StudioLiveLock = {
        resource: event.lock.resource,
        claimId: event.lock.claimId,
        owner: copyParticipant(event.lock.owner),
        leaseUntil: event.lock.leaseUntil,
      };
      this.locks.set(next.resource, next);
      this.emitLocks();
      return;
    }
    const current = this.locks.get(event.lock.resource);
    if (!current || current.claimId !== event.lock.claimId) return;
    this.locks.delete(event.lock.resource);
    this.emitLocks();
  }

  private upsertPeer(envelope: StudioLiveEnvelope, receivedAt: number): boolean {
    const previous = this.peers.get(envelope.sender.sessionId);
    const presencePayload =
      envelope.kind === "presence:hello" || envelope.kind === "presence:heartbeat"
        ? (envelope.payload as StudioLivePresencePayload)
        : null;
    const next: StudioLivePeer = {
      ...copyParticipant(envelope.sender),
      visibility: presencePayload?.visibility ?? previous?.visibility ?? "active",
      pageId: presencePayload?.pageId ?? previous?.pageId ?? null,
      lastSeenAt: receivedAt,
    };
    this.peers.set(next.sessionId, next);
    return (
      !previous ||
      previous.displayName !== next.displayName ||
      previous.role !== next.role ||
      previous.visibility !== next.visibility ||
      previous.pageId !== next.pageId
    );
  }

  private applyLockClaim(envelope: StudioLiveEnvelope<"lock:claim">): void {
    const candidate: StudioLiveLock = {
      resource: envelope.payload.resource,
      claimId: envelope.payload.claimId,
      owner: copyParticipant(envelope.sender),
      leaseUntil: envelope.payload.leaseUntil,
    };
    const now = this.now();
    const current = this.locks.get(candidate.resource);
    let shouldReplace = !current || current.leaseUntil <= now;
    if (current) {
      const sameClaim =
        current.claimId === candidate.claimId &&
        current.owner.sessionId === candidate.owner.sessionId;
      shouldReplace =
        shouldReplace || sameClaim || lockPriority(candidate) < lockPriority(current);
    }
    if (!shouldReplace) return;
    this.locks.set(candidate.resource, candidate);
    this.emitLocks();
  }

  private applyLockRelease(envelope: StudioLiveEnvelope<"lock:release">): void {
    const current = this.locks.get(envelope.payload.resource);
    if (
      !current ||
      current.owner.sessionId !== envelope.sender.sessionId ||
      current.claimId !== envelope.payload.claimId
    ) {
      return;
    }
    this.locks.delete(envelope.payload.resource);
    this.emitLocks();
  }

  private pruneExpired(now: number): void {
    let presenceChanged = false;
    for (const [sessionId, peer] of this.peers) {
      if (now - peer.lastSeenAt <= this.presenceTtlMs) continue;
      this.peers.delete(sessionId);
      this.lastSequenceBySession.delete(sessionId);
      presenceChanged = true;
    }
    let locksChanged = false;
    for (const [resource, lock] of this.locks) {
      if (lock.leaseUntil > now && this.peers.has(lock.owner.sessionId)) continue;
      if (lock.owner.sessionId === this.participant.sessionId && lock.leaseUntil > now) continue;
      this.locks.delete(resource);
      locksChanged = true;
    }
    if (presenceChanged) this.emitPresence();
    if (locksChanged) this.emitLocks();
  }

  private emitPresence(): void {
    this.emit({ type: "presence", peers: this.getPeers() });
  }

  private emitLocks(): void {
    this.emit({ type: "locks", locks: this.getLocks() });
  }

  private emit(event: StudioLiveRoomEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // One UI subscriber must not break transport cleanup or other subscribers.
      }
    }
  }
}
