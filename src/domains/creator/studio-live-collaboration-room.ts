import {
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,
  assertStudioLiveCursorPayload,
  createStudioLiveEnvelope,
  isStudioLiveCursorCleared,
  parseStudioLiveEnvelope,
  studioLocalLiveChannelName,
  type StudioLiveChatMessagePayload,
  type StudioLiveCursorPayload,
  type StudioLiveEnvelope,
  type StudioLiveLockAcquireResult,
  type StudioLiveLockClaimPayload,
  type StudioLiveLockLease,
  type StudioLiveLockReleaseRequest,
  type StudioLiveLockReleaseResult,
  type StudioLiveLockRequest,
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
  type StudioLiveVoiceDescriptionPayload,
  type StudioLiveVoiceIcePayload,
  type StudioLiveVoiceJoinPayload,
  type StudioLiveVoiceLeavePayload,
  type StudioLiveVoiceStatePayload,
} from "./studio-live-collaboration-protocol";
import {
  createStudioLocalLiveTransport,
  type StudioLiveTransport,
  type StudioLiveTransportControlEvent,
  type StudioLiveTransportFactory,
  type StudioLiveTransportMode,
  type StudioLiveTransportStatus,
} from "./studio-live-collaboration-transport";
import { isStudioLiveP2pMeshShareId } from "./studio-live-p2p-overlay-transport";
import {
  parseStudioTeamCommentLiveEvent,
  type StudioTeamCommentLiveEvent,
} from "./studio-team-comment-live-event";

import type {
  StudioCrdtSyncRequest,
  StudioCrdtSyncResponse,
  StudioCrdtTransportMessage,
  StudioCrdtUpdateAck,
  StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import {
  parseStudioLiveLockResourceScope,
  studioLiveLockResourcesConflict,
} from "@/lib/studio-live-lock-resource";

const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_PRESENCE_TTL_MS = 30_000;
const DEFAULT_LOCK_LEASE_MS = 15_000;
const DEFAULT_LOCK_ACK_TIMEOUT_MS = 10_000;
const DEFAULT_CURSOR_INTERVAL_MS = 40;
export const STUDIO_LIVE_CHAT_HISTORY_LIMIT = 200;
export const STUDIO_LIVE_VOICE_MAX_PARTICIPANTS = 6;

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

/** Last live canvas pointer published by a remote peer. Cleared on leave, stale expiry, or sentinel. */
export interface StudioLivePeerCursor {
  participant: StudioLiveParticipant;
  cursor: StudioLiveCursorPayload;
  updatedAt: number;
}

export type StudioLiveLock = StudioLiveLockLease;

export interface StudioLiveVoiceMember {
  participant: StudioLiveParticipant;
  callId: string;
  muted: boolean;
}

export interface StudioLiveRoomScreenShare {
  host: StudioLiveParticipant;
  shareId: string;
  label: string;
}

export type StudioLiveVoiceEvent =
  | { type: "presence"; members: StudioLiveVoiceMember[] }
  | {
      type: "voice:joined";
      participant: StudioLiveParticipant;
      callId: string;
      muted: boolean;
    }
  | {
      type: "voice:state";
      participant: StudioLiveParticipant;
      callId: string;
      muted: boolean;
    }
  | {
      type: "voice:left";
      participant: StudioLiveParticipant;
      callId: string;
    }
  | {
      type: "voice:self-left";
      callId: string;
      reason: "rejected" | "revoked" | "removed";
      message: string;
    }
  | {
      type: "voice:description";
      participant: StudioLiveParticipant;
      payload: StudioLiveVoiceDescriptionPayload;
    }
  | {
      type: "voice:ice";
      participant: StudioLiveParticipant;
      payload: StudioLiveVoiceIcePayload;
    }
  | { type: "terminal"; reason: "revoked" | "closed" | "error"; message?: string };

/** One ephemeral session chat line. History lives only in room memory and dies with the room. */
export interface StudioLiveChatMessage {
  id: string;
  participant: StudioLiveParticipant;
  text: string;
  sentAt: number;
  self: boolean;
}

export type StudioLiveRoomEvent =
  | { type: "presence"; peers: StudioLivePeer[] }
  | {
      type: "cursor";
      participant: StudioLiveParticipant;
      cursor: StudioLiveCursorPayload;
    }
  | { type: "locks"; locks: StudioLiveLock[] }
  | { type: "chat"; message: StudioLiveChatMessage }
  | { type: "signal"; envelope: StudioLiveSignalEnvelope }
  | { type: "comment-changed"; change: StudioTeamCommentLiveEvent }
  | { type: "transport-status"; status: StudioLiveTransportStatus }
  | { type: "transport-error"; message: string };

/** Durable document events are intentionally separate from cursor/screen/presence signaling. */
export type StudioLiveCrdtRoomEvent =
  | StudioCrdtTransportMessage
  | { type: "error"; operation: "sync" | "publish"; message: string };

export interface StudioLiveRoomDependencies {
  transportFactory?: StudioLiveTransportFactory;
  now?: () => number;
  randomId?: () => string;
  setInterval?: (handler: () => void, delay: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  setTimeout?: (handler: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  heartbeatMs?: number;
  presenceTtlMs?: number;
  lockLeaseMs?: number;
  lockAckTimeoutMs?: number;
  cursorIntervalMs?: number;
}

interface PendingStudioLiveLockClaim {
  resource: string;
  requestId: string;
  promise: Promise<StudioLiveLockAcquireResult>;
  resolve: (result: StudioLiveLockAcquireResult) => void;
  timeout: unknown;
}

interface PendingStudioLiveLockRelease {
  request: StudioLiveLockReleaseRequest;
  promise: Promise<StudioLiveLockReleaseResult>;
  resolve: (result: StudioLiveLockReleaseResult) => void;
  timeout: unknown;
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

function copyCursor(cursor: StudioLiveCursorPayload): StudioLiveCursorPayload {
  return {
    ...cursor,
    ...(cursor.points ? { points: [...cursor.points] } : {}),
  };
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
  private readonly scheduleTimeout: (handler: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly heartbeatMs: number;
  private readonly presenceTtlMs: number;
  private readonly lockLeaseMs: number;
  private readonly lockAckTimeoutMs: number;
  private readonly cursorIntervalMs: number;
  private readonly listeners = new Set<(event: StudioLiveRoomEvent) => void>();
  private readonly crdtListeners = new Set<(event: StudioLiveCrdtRoomEvent) => void>();
  private readonly voiceListeners = new Set<(event: StudioLiveVoiceEvent) => void>();
  private readonly peers = new Map<string, StudioLivePeer>();
  private readonly cursors = new Map<string, StudioLivePeerCursor>();
  private readonly screenShares = new Map<string, StudioLiveRoomScreenShare>();
  private readonly voiceMembers = new Map<string, StudioLiveVoiceMember>();
  private readonly locks = new Map<string, StudioLiveLock>();
  private readonly pendingLockClaims = new Map<string, PendingStudioLiveLockClaim>();
  private readonly pendingLockReleases = new Map<string, PendingStudioLiveLockRelease>();
  private readonly chatMessages: StudioLiveChatMessage[] = [];
  private readonly lastSequenceBySession = new Map<string, number>();
  private transport: StudioLiveTransport | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private unsubscribeTransportControl: (() => void) | null = null;
  private unsubscribeTransportCrdt: (() => void) | null = null;
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
    this.scheduleTimeout = deps.setTimeout ?? ((handler, delay) => globalThis.setTimeout(handler, delay));
    this.cancelTimeout =
      deps.clearTimeout ??
      ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
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
    this.lockAckTimeoutMs = boundedTiming(
      deps.lockAckTimeoutMs,
      DEFAULT_LOCK_ACK_TIMEOUT_MS,
      100,
      30_000
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

  subscribeCrdt(listener: (event: StudioLiveCrdtRoomEvent) => void): () => void {
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  subscribeVoice(listener: (event: StudioLiveVoiceEvent) => void): () => void {
    this.voiceListeners.add(listener);
    return () => this.voiceListeners.delete(listener);
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
      this.unsubscribeTransportCrdt =
        transport.subscribeCrdt?.((message) => this.emitCrdt(message)) ?? null;
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
          this.unsubscribeTransportCrdt?.();
          this.unsubscribeTransportCrdt = null;
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

  getCursors(): StudioLivePeerCursor[] {
    return Array.from(this.cursors.values(), (entry) => ({
      participant: copyParticipant(entry.participant),
      cursor: copyCursor(entry.cursor),
      updatedAt: entry.updatedAt,
    })).sort((left, right) =>
      left.participant.displayName.localeCompare(right.participant.displayName, "ko-KR") ||
      left.participant.sessionId.localeCompare(right.participant.sessionId)
    );
  }

  getLocks(): StudioLiveLock[] {
    this.pruneExpired(this.now());
    return Array.from(this.locks.values(), (lock) => ({
      ...lock,
      owner: copyParticipant(lock.owner),
    })).sort((a, b) => a.resource.localeCompare(b.resource));
  }

  getChatMessages(): StudioLiveChatMessage[] {
    return this.chatMessages.map((message) => ({
      ...message,
      participant: copyParticipant(message.participant),
    }));
  }

  getVoiceMembers(): StudioLiveVoiceMember[] {
    return Array.from(this.voiceMembers.values(), (member) => ({
      ...member,
      participant: copyParticipant(member.participant),
    })).sort((left, right) =>
      left.participant.displayName.localeCompare(right.participant.displayName, "ko-KR") ||
      left.participant.sessionId.localeCompare(right.participant.sessionId)
    );
  }

  getScreenShares(): StudioLiveRoomScreenShare[] {
    return Array.from(this.screenShares.values(), (share) => ({
      ...share,
      host: copyParticipant(share.host),
    })).sort((left, right) =>
      left.host.displayName.localeCompare(right.host.displayName, "ko-KR") ||
      left.host.sessionId.localeCompare(right.host.sessionId) ||
      left.shareId.localeCompare(right.shareId)
    );
  }

  /**
   * Sends one ephemeral chat line and echoes it locally. Neither BroadcastChannel nor the server
   * room broadcast loops a message back to its sender, so the local echo is the sender's record.
   */
  sendChatMessage(text: string): StudioLiveChatMessage | null {
    if (!this.ready) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const now = this.now();
    const payload: StudioLiveChatMessagePayload = {
      messageId: this.randomId(),
      text: trimmed,
    };
    // Envelope creation also runs the protocol validator (length/control-character contract).
    const envelope = this.buildEnvelope("chat:message", payload, null, now);
    if (!this.sendEnvelope(envelope)) return null;
    const message: StudioLiveChatMessage = {
      id: payload.messageId,
      participant: copyParticipant(this.participant),
      text: trimmed,
      sentAt: now,
      self: true,
    };
    this.appendChatMessage(message);
    this.emit({
      type: "chat",
      message: { ...message, participant: copyParticipant(message.participant) },
    });
    return { ...message, participant: copyParticipant(message.participant) };
  }

  updatePresence(patch: Partial<StudioLivePresencePayload>): void {
    const tool = patch.tool === undefined ? this.presence.tool : patch.tool;
    const next: StudioLivePresencePayload = {
      visibility: patch.visibility ?? this.presence.visibility,
      pageId: patch.pageId === undefined ? this.presence.pageId : patch.pageId,
      ...(tool === undefined ? {} : { tool }),
    };
    if (
      next.visibility === this.presence.visibility &&
      next.pageId === this.presence.pageId &&
      next.tool === this.presence.tool
    ) {
      return;
    }
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

  /**
   * Builds a high-frequency cursor payload only when the room can actually send it.
   *
   * Drawing callers otherwise pay for Stage coordinate lookup and a copied stroke-tail array on
   * every 120–240 Hz pointer delivery even though the wire contract intentionally publishes at
   * most once per cursor interval. Keep `publishCursor` eager so its validation semantics remain
   * unchanged; this opt-in path is for latency-sensitive producers that can safely return no
   * payload when their transient Stage state is unavailable.
   */
  publishCursorWhenDue(
    createCursor: () => StudioLiveCursorPayload | null
  ): boolean {
    if (!this.ready) return false;
    const now = this.now();
    if (now - this.lastCursorSentAt < this.cursorIntervalMs) return false;
    const cursor = createCursor();
    if (!cursor) return false;
    assertStudioLiveCursorPayload(cursor);
    const sent = this.post("cursor:update", cursor, null, now);
    if (sent) this.lastCursorSentAt = now;
    return sent;
  }

  /** Clears a remote pointer immediately; leave/page/visibility boundaries must not wait for TTL. */
  clearCursor(): boolean {
    if (!this.ready) return false;
    return this.post("cursor:update", { x: 0, y: 0, pageId: null, tool: null });
  }

  /**
   * Legacy fire-and-observe compatibility shim. Server callers that must gate a mutation on the
   * authoritative lease should await `claimLockAsync` instead of interpreting this boolean as ACK.
   */
  claimLock(resource: string): boolean {
    if (!this.ready) return false;
    if (this.transport?.mode !== "server") return this.claimLocalLock(resource);
    if (this.pendingLockReleases.has(resource)) {
      void this.claimLockAsync(resource);
      return true;
    }
    if (this.pendingLockClaims.has(resource)) return true;
    if (this.findLockConflict(resource, this.now())) return false;
    void this.claimLockAsync(resource);
    return true;
  }

  /** Waits for the server-authoritative lock decision and always correlates it by request UUID. */
  claimLockAsync(resource: string): Promise<StudioLiveLockAcquireResult> {
    const pendingRelease = this.pendingLockReleases.get(resource);
    if (pendingRelease) {
      // A new gesture is serialized behind the previous lifecycle's ACK/timeout. Recursion occurs
      // only after completePendingLockRelease removes the map entry.
      return pendingRelease.promise.then(() => this.claimLockAsync(resource));
    }
    const existingPending = this.pendingLockClaims.get(resource);
    if (existingPending) return existingPending.promise;

    let requestId = "unavailable";
    const now = this.now();
    try {
      requestId = this.randomId();
      createStudioLiveEnvelope({
        workId: this.workId,
        sender: this.participant,
        sentAt: now,
        sequence: 1,
        kind: "lock:claim",
        payload: { resource, claimId: requestId, leaseUntil: now + this.lockLeaseMs },
      });
    } catch (error) {
      return Promise.resolve({
        status: "denied",
        resource,
        requestId,
        code: "invalid_request",
        message: error instanceof Error ? error.message : "편집 잠금 요청이 올바르지 않습니다.",
      });
    }
    if (!this.ready) {
      return Promise.resolve({
        status: "revoked",
        resource,
        requestId,
        code: "not_ready",
        message: "공동작업 연결이 준비되지 않았습니다.",
      });
    }

    this.pruneExpired(now);
    const conflict = this.findLockConflict(resource, now);
    if (conflict) {
      return Promise.resolve({
        status: "denied",
        resource,
        requestId,
        code: "lock_conflict",
        message: `${conflict.owner.displayName || "다른 편집자"}가 이 영역을 편집 중입니다.`,
        lock: { ...conflict, owner: copyParticipant(conflict.owner) },
      });
    }

    const current = this.locks.get(resource);
    if (current?.owner.sessionId === this.participant.sessionId && current.leaseUntil > now) {
      return Promise.resolve({
        status: "acquired",
        resource,
        requestId,
        lock: { ...current, owner: copyParticipant(current.owner) },
      });
    }
    if (this.transport?.mode !== "server") {
      if (!this.claimLocalLock(resource, requestId, now)) {
        return Promise.resolve({
          status: "denied",
          resource,
          requestId,
          code: "transport_error",
          message: "로컬 편집 잠금 요청을 보내지 못했습니다.",
        });
      }
      const lock = this.locks.get(resource);
      if (!lock || lock.owner.sessionId !== this.participant.sessionId) {
        return Promise.resolve({
          status: "denied",
          resource,
          requestId,
          code: "lock_conflict",
          message: "다른 편집 세션이 이 영역의 잠금을 먼저 획득했습니다.",
        });
      }
      return Promise.resolve({
        status: "acquired",
        resource,
        requestId,
        lock: { ...lock, owner: copyParticipant(lock.owner) },
      });
    }

    const acquireLock = this.transport.acquireLock;
    if (!acquireLock) {
      return Promise.resolve({
        status: "denied",
        resource,
        requestId,
        code: "unsupported_transport",
        message: "현재 팀 연결은 서버 확인형 편집 잠금을 지원하지 않습니다.",
      });
    }
    let resolveResult!: (result: StudioLiveLockAcquireResult) => void;
    const promise = new Promise<StudioLiveLockAcquireResult>((resolve) => {
      resolveResult = resolve;
    });
    const pending: PendingStudioLiveLockClaim = {
      resource,
      requestId,
      promise,
      resolve: resolveResult,
      timeout: null,
    };
    this.pendingLockClaims.set(resource, pending);
    pending.timeout = this.scheduleTimeout(() => {
      this.completePendingLockClaim(pending, {
        status: "timeout",
        resource,
        requestId,
        message: "팀 서버의 편집 잠금 응답 시간이 초과되었습니다.",
      });
    }, this.lockAckTimeoutMs);

    const request: StudioLiveLockRequest = {
      resource,
      requestId,
      leaseMs: this.lockLeaseMs,
    };
    let operation: Promise<StudioLiveLockAcquireResult>;
    try {
      operation = acquireLock.call(this.transport, request);
    } catch (error) {
      this.completePendingLockClaim(pending, {
        status: "denied",
        resource,
        requestId,
        code: "transport_error",
        message: error instanceof Error ? error.message : "편집 잠금 요청을 보내지 못했습니다.",
      });
      return promise;
    }
    void operation.then(
      (result) => this.acceptTransportLockResult(pending, result),
      (error: unknown) => {
        this.completePendingLockClaim(pending, {
          status: "denied",
          resource,
          requestId,
          code: "transport_error",
          message: error instanceof Error ? error.message : "편집 잠금 요청을 확인하지 못했습니다.",
        });
      }
    );
    return promise;
  }

  releaseLock(resource: string): boolean {
    if (this.pendingLockReleases.has(resource)) return true;
    const current = this.locks.get(resource);
    if (!current || current.owner.sessionId !== this.participant.sessionId) return false;
    if (this.transport?.mode === "server") {
      void this.releaseLockAsync(resource);
      return true;
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

  releaseLockAsync(resource: string): Promise<StudioLiveLockReleaseResult> {
    const existingPending = this.pendingLockReleases.get(resource);
    if (existingPending) return existingPending.promise;

    let requestId = "unavailable";
    try {
      requestId = this.randomId();
    } catch (error) {
      return Promise.resolve({
        status: "denied",
        resource,
        requestId,
        claimId: "unavailable",
        code: "invalid_request",
        message: error instanceof Error ? error.message : "편집 잠금 해제 요청이 올바르지 않습니다.",
      });
    }
    const current = this.locks.get(resource);
    if (!current || current.owner.sessionId !== this.participant.sessionId) {
      return Promise.resolve({
        status: "denied",
        resource,
        requestId,
        claimId: current?.claimId ?? "unavailable",
        code: "not_owned",
        message: "현재 세션이 소유한 편집 잠금이 없습니다.",
      });
    }
    if (!this.ready) {
      return Promise.resolve({
        status: "revoked",
        resource,
        requestId,
        claimId: current.claimId,
        code: "not_ready",
        message: "공동작업 연결이 준비되지 않았습니다.",
      });
    }

    const request: StudioLiveLockReleaseRequest = {
      resource,
      requestId,
      claimId: current.claimId,
    };
    if (this.transport?.mode !== "server") {
      this.locks.delete(resource);
      this.emitLocks();
      const sent = this.post("lock:release", { resource, claimId: current.claimId });
      return Promise.resolve({
        status: "released",
        resource,
        requestId,
        claimId: current.claimId,
        released: sent,
      });
    }

    const releaseLock = this.transport.releaseLock;
    if (!releaseLock) {
      // Compatibility seam for custom/legacy server transports. Production Socket.IO implements
      // correlated release; this branch preserves older embedders without reintroducing heartbeat.
      const sent = this.post("lock:release", { resource, claimId: current.claimId });
      if (sent) {
        this.locks.delete(resource);
        this.emitLocks();
      }
      return Promise.resolve(
        sent
          ? {
              status: "released",
              resource,
              requestId,
              claimId: current.claimId,
              released: true,
            }
          : {
              status: "denied",
              resource,
              requestId,
              claimId: current.claimId,
              code: "unsupported_transport",
              message: "현재 팀 연결은 서버 확인형 잠금 해제를 지원하지 않습니다.",
            }
      );
    }

    let resolveResult!: (result: StudioLiveLockReleaseResult) => void;
    const promise = new Promise<StudioLiveLockReleaseResult>((resolve) => {
      resolveResult = resolve;
    });
    const pending: PendingStudioLiveLockRelease = {
      request,
      promise,
      resolve: resolveResult,
      timeout: null,
    };
    this.pendingLockReleases.set(resource, pending);
    pending.timeout = this.scheduleTimeout(() => {
      this.completePendingLockRelease(pending, {
        status: "timeout",
        resource,
        requestId,
        claimId: current.claimId,
        message: "팀 서버의 편집 잠금 해제 응답 시간이 초과되었습니다.",
      });
    }, Math.max(this.lockAckTimeoutMs, STUDIO_LIVE_LOCK_MAX_LEASE_MS + 500));

    let operation: Promise<StudioLiveLockReleaseResult>;
    try {
      operation = releaseLock.call(this.transport, request);
    } catch (error) {
      this.completePendingLockRelease(pending, {
        status: "denied",
        resource,
        requestId,
        claimId: current.claimId,
        code: "transport_error",
        message: error instanceof Error ? error.message : "편집 잠금 해제 요청을 보내지 못했습니다.",
      });
      return promise;
    }
    void operation.then(
      (result) => this.acceptTransportLockReleaseResult(pending, result),
      (error: unknown) => {
        this.completePendingLockRelease(pending, {
          status: "denied",
          resource,
          requestId,
          claimId: current.claimId,
          code: "transport_error",
          message: error instanceof Error ? error.message : "편집 잠금 해제를 확인하지 못했습니다.",
        });
      }
    );
    return promise;
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

  joinVoice(payload: StudioLiveVoiceJoinPayload): boolean {
    if (this.participant.role === "viewer") return false;
    const current = this.voiceMembers.get(this.participant.sessionId);
    const alreadyJoined = current?.callId === payload.callId;
    const callSize = [...this.voiceMembers.values()].filter(
      (member) => member.callId === payload.callId
    ).length;
    if (!alreadyJoined && callSize >= STUDIO_LIVE_VOICE_MAX_PARTICIPANTS) return false;
    this.voiceMembers.set(this.participant.sessionId, {
      participant: copyParticipant(this.participant),
      callId: payload.callId,
      muted: payload.muted,
    });
    this.emitVoicePresence();
    // Install the optimistic local record before sending. A test transport or an in-process socket
    // adapter may invoke a rejection ACK synchronously; the control-plane rollback must be able to
    // find and remove this exact attempt. Server media signaling still remains gated by its ACK.
    if (!this.post("voice:join", payload)) {
      const optimistic = this.voiceMembers.get(this.participant.sessionId);
      if (optimistic?.callId === payload.callId) {
        if (current) this.voiceMembers.set(this.participant.sessionId, current);
        else this.voiceMembers.delete(this.participant.sessionId);
        this.emitVoicePresence();
      }
      return false;
    }
    return this.voiceMembers.get(this.participant.sessionId)?.callId === payload.callId;
  }

  updateVoiceState(payload: StudioLiveVoiceStatePayload): boolean {
    if (this.participant.role === "viewer") return false;
    const current = this.voiceMembers.get(this.participant.sessionId);
    if (!current || current.callId !== payload.callId) return false;
    if (!this.post("voice:state", payload)) return false;
    this.voiceMembers.set(this.participant.sessionId, { ...current, muted: payload.muted });
    this.emitVoicePresence();
    return true;
  }

  leaveVoice(payload: StudioLiveVoiceLeavePayload): boolean {
    const current = this.voiceMembers.get(this.participant.sessionId);
    if (!current || current.callId !== payload.callId) return false;
    if (!this.post("voice:leave", payload)) return false;
    this.voiceMembers.delete(this.participant.sessionId);
    this.emitVoicePresence();
    return true;
  }

  sendVoiceDescription(
    targetSessionId: string,
    payload: StudioLiveVoiceDescriptionPayload
  ): boolean {
    if (this.participant.role === "viewer") return false;
    if (targetSessionId === this.participant.sessionId) return false;
    const self = this.voiceMembers.get(this.participant.sessionId);
    const target = this.voiceMembers.get(targetSessionId);
    if (!self || !target || self.callId !== payload.callId || target.callId !== payload.callId) {
      return false;
    }
    return this.post("voice:description", payload, targetSessionId);
  }

  sendVoiceIce(targetSessionId: string, payload: StudioLiveVoiceIcePayload): boolean {
    if (this.participant.role === "viewer") return false;
    if (targetSessionId === this.participant.sessionId) return false;
    const self = this.voiceMembers.get(this.participant.sessionId);
    const target = this.voiceMembers.get(targetSessionId);
    if (!self || !target || self.callId !== payload.callId || target.callId !== payload.callId) {
      return false;
    }
    return this.post("voice:ice", payload, targetSessionId);
  }

  async requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {
    if (!this.ready || !this.transport?.requestCrdtSync) {
      throw new Error("CRDT 동기화 전송 계층이 준비되지 않았습니다.");
    }
    try {
      const response = await this.transport.requestCrdtSync(request);
      if (response) this.emitCrdt({ type: "sync-response", response, senderSessionId: null });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "CRDT 문서를 동기화하지 못했습니다.";
      this.emitCrdt({ type: "error", operation: "sync", message });
      throw error;
    }
  }

  respondCrdtSync(response: StudioCrdtSyncResponse, targetSessionId: string): boolean {
    if (!this.ready || !this.transport?.respondCrdtSync) return false;
    return this.transport.respondCrdtSync(response, targetSessionId);
  }

  async publishCrdtUpdate(request: StudioCrdtUpdateRequest): Promise<StudioCrdtUpdateAck> {
    if (!this.ready || !this.transport?.publishCrdtUpdate) {
      throw new Error("CRDT 업데이트 전송 계층이 준비되지 않았습니다.");
    }
    try {
      return await this.transport.publishCrdtUpdate(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CRDT 변경을 게시하지 못했습니다.";
      this.emitCrdt({ type: "error", operation: "publish", message });
      throw error;
    }
  }

  stopScreen(payload: StudioLiveScreenStopPayload): boolean {
    return this.post("screen:stop", payload);
  }

  close(): void {
    if (this.phase === "closed") return;
    ++this.connectionGeneration;
    if (this.ready) {
      const voice = this.voiceMembers.get(this.participant.sessionId);
      if (voice) this.post("voice:leave", { callId: voice.callId });
      for (const lock of this.locks.values()) {
        if (lock.owner.sessionId !== this.participant.sessionId) continue;
        this.post("lock:release", { resource: lock.resource, claimId: lock.claimId });
      }
      this.post("presence:leave", {});
    }
    this.revokePendingLockClaims(
      "connection_closed",
      "공동작업 연결이 종료되어 편집 잠금 요청이 취소되었습니다."
    );
    this.revokePendingLockReleases(
      "connection_closed",
      "공동작업 연결이 종료되어 편집 잠금 해제 확인이 취소되었습니다."
    );
    this.phase = "closed";
    if (this.heartbeatHandle !== null) this.cancelInterval(this.heartbeatHandle);
    this.heartbeatHandle = null;
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.unsubscribeTransportControl?.();
    this.unsubscribeTransportControl = null;
    this.unsubscribeTransportCrdt?.();
    this.unsubscribeTransportCrdt = null;
    this.transport?.close();
    this.transport = null;
    this.emitVoice({ type: "terminal", reason: "closed" });
    this.peers.clear();
    this.cursors.clear();
    this.screenShares.clear();
    this.voiceMembers.clear();
    this.locks.clear();
    this.chatMessages.length = 0;
    this.lastSequenceBySession.clear();
    this.listeners.clear();
    this.crdtListeners.clear();
    this.voiceListeners.clear();
  }

  private appendChatMessage(message: StudioLiveChatMessage): void {
    this.chatMessages.push(message);
    if (this.chatMessages.length > STUDIO_LIVE_CHAT_HISTORY_LIMIT) {
      this.chatMessages.splice(0, this.chatMessages.length - STUDIO_LIVE_CHAT_HISTORY_LIMIT);
    }
  }

  private claimLocalLock(resource: string, requestId?: string, requestedAt = this.now()): boolean {
    if (!this.ready) return false;
    this.pruneExpired(requestedAt);
    const conflict = this.findLockConflict(resource, requestedAt);
    if (conflict) return false;
    const previous = this.locks.get(resource);
    const claimId = previous?.claimId ?? requestId ?? this.randomId();
    const payload: StudioLiveLockClaimPayload = {
      resource,
      claimId,
      leaseUntil: requestedAt + this.lockLeaseMs,
    };
    const envelope = this.buildEnvelope("lock:claim", payload, null, requestedAt);
    this.applyLockClaim(envelope);
    if (this.sendEnvelope(envelope)) return true;

    if (previous) this.locks.set(resource, previous);
    else this.locks.delete(resource);
    this.emitLocks();
    return false;
  }

  private findLockConflict(resource: string, now: number): StudioLiveLock | null {
    for (const lock of this.locks.values()) {
      if (lock.owner.sessionId === this.participant.sessionId || lock.leaseUntil <= now) continue;
      if (studioLiveLockResourcesConflict(resource, lock.resource)) return lock;
    }
    return null;
  }

  private acceptTransportLockResult(
    pending: PendingStudioLiveLockClaim,
    result: StudioLiveLockAcquireResult
  ): void {
    if (this.pendingLockClaims.get(pending.resource) !== pending) return;
    if (result.resource !== pending.resource || result.requestId !== pending.requestId) {
      this.completePendingLockClaim(pending, {
        status: "denied",
        resource: pending.resource,
        requestId: pending.requestId,
        code: "response_mismatch",
        message: "팀 서버의 편집 잠금 응답 식별자가 요청과 일치하지 않습니다.",
      });
      return;
    }
    if (result.status === "acquired") {
      const lock = result.lock;
      if (
        lock.resource !== pending.resource ||
        lock.owner.sessionId !== this.participant.sessionId ||
        !Number.isFinite(lock.leaseUntil) ||
        lock.leaseUntil <= this.now()
      ) {
        this.completePendingLockClaim(pending, {
          status: "denied",
          resource: pending.resource,
          requestId: pending.requestId,
          code: "invalid_response",
          message: "팀 서버가 유효하지 않은 편집 잠금 정보를 반환했습니다.",
        });
        return;
      }
      const previous = this.locks.get(lock.resource);
      this.locks.set(lock.resource, { ...lock, owner: copyParticipant(lock.owner) });
      if (
        previous?.claimId !== lock.claimId ||
        previous.owner.sessionId !== lock.owner.sessionId ||
        previous.leaseUntil !== lock.leaseUntil
      ) {
        this.emitLocks();
      }
    }
    this.completePendingLockClaim(pending, result);
  }

  private completePendingLockClaim(
    pending: PendingStudioLiveLockClaim,
    result: StudioLiveLockAcquireResult
  ): void {
    if (this.pendingLockClaims.get(pending.resource) !== pending) return;
    this.pendingLockClaims.delete(pending.resource);
    if (pending.timeout !== null) this.cancelTimeout(pending.timeout);
    pending.timeout = null;
    pending.resolve(result);
  }

  private acceptTransportLockReleaseResult(
    pending: PendingStudioLiveLockRelease,
    result: StudioLiveLockReleaseResult
  ): void {
    if (this.pendingLockReleases.get(pending.request.resource) !== pending) return;
    if (
      result.resource !== pending.request.resource ||
      result.requestId !== pending.request.requestId ||
      result.claimId !== pending.request.claimId
    ) {
      this.completePendingLockRelease(pending, {
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code: "response_mismatch",
        message: "팀 서버의 편집 잠금 해제 응답 식별자가 요청과 일치하지 않습니다.",
      });
      return;
    }
    this.completePendingLockRelease(pending, result);
  }

  private completePendingLockRelease(
    pending: PendingStudioLiveLockRelease,
    result: StudioLiveLockReleaseResult
  ): void {
    if (this.pendingLockReleases.get(pending.request.resource) !== pending) return;
    this.pendingLockReleases.delete(pending.request.resource);
    if (pending.timeout !== null) this.cancelTimeout(pending.timeout);
    pending.timeout = null;
    const current = this.locks.get(pending.request.resource);
    if (current?.owner.sessionId === this.participant.sessionId) {
      // Release intent wins locally even on timeout/denial. The transport fences the old lease and
      // the server TTL remains the final fail-safe, so this Room must never heartbeat it again.
      this.locks.delete(pending.request.resource);
      this.emitLocks();
    }
    pending.resolve(result);
  }

  private revokePendingLockReleases(code: string, message: string): void {
    for (const pending of Array.from(this.pendingLockReleases.values())) {
      this.completePendingLockRelease(pending, {
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code,
        message,
      });
    }
  }

  private revokePendingLockClaims(code: string, message: string): void {
    for (const pending of Array.from(this.pendingLockClaims.values())) {
      this.completePendingLockClaim(pending, {
        status: "revoked",
        resource: pending.resource,
        requestId: pending.requestId,
        code,
        message,
      });
    }
  }

  private onHeartbeat(): void {
    if (!this.ready) return;
    const now = this.now();
    // BroadcastChannel has no authoritative disconnect signal, so local peers still need TTL
    // heartbeats. Socket.IO join/leave/reconnect events own server presence; an unchanged network
    // heartbeat only created authorization I/O and an O(room-size) broadcast every ten seconds.
    if (this.transport?.mode === "local") this.sendPresence("presence:heartbeat");
    for (const lock of Array.from(this.locks.values())) {
      if (lock.owner.sessionId !== this.participant.sessionId) continue;
      if (this.pendingLockReleases.has(lock.resource)) continue;
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
      this.cursors.delete(envelope.sender.sessionId);
      this.screenShares.delete(envelope.sender.sessionId);
      this.lastSequenceBySession.delete(envelope.sender.sessionId);
      const voiceMember = this.voiceMembers.get(envelope.sender.sessionId);
      if (voiceMember) {
        this.voiceMembers.delete(envelope.sender.sessionId);
        this.emitVoice({
          type: "voice:left",
          participant: copyParticipant(voiceMember.participant),
          callId: voiceMember.callId,
        });
        this.emitVoicePresence();
      }
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
        if (this.transport?.mode === "local") {
          this.sendPresence("presence:heartbeat");
          const voice = this.voiceMembers.get(this.participant.sessionId);
          if (voice) this.post("voice:join", { callId: voice.callId, muted: voice.muted });
        }
        if (!presenceChanged) this.emitPresence();
        return;
      case "presence:heartbeat":
        if (!presenceChanged) this.emitPresence();
        return;
      case "cursor:update": {
        const cursor = envelope.payload as StudioLiveCursorPayload;
        if (isStudioLiveCursorCleared(cursor)) {
          this.cursors.delete(envelope.sender.sessionId);
        } else {
          this.cursors.set(envelope.sender.sessionId, {
            participant: copyParticipant(envelope.sender),
            cursor: copyCursor(cursor),
            updatedAt: receivedAt,
          });
        }
        this.emit({
          type: "cursor",
          participant: copyParticipant(envelope.sender),
          cursor: copyCursor(cursor),
        });
        return;
      }
      case "lock:claim":
        this.applyLockClaim(envelope as StudioLiveEnvelope<"lock:claim">);
        return;
      case "lock:release":
        this.applyLockRelease(envelope as StudioLiveEnvelope<"lock:release">);
        return;
      case "chat:message": {
        const payload = envelope.payload as StudioLiveChatMessagePayload;
        const message: StudioLiveChatMessage = {
          id: payload.messageId,
          participant: copyParticipant(envelope.sender),
          text: payload.text,
          sentAt: envelope.sentAt,
          self: false,
        };
        this.appendChatMessage(message);
        this.emit({
          type: "chat",
          message: { ...message, participant: copyParticipant(message.participant) },
        });
        return;
      }
      case "screen:announce": {
        const payload = envelope.payload as StudioLiveScreenAnnouncePayload;
        this.screenShares.set(envelope.sender.sessionId, {
          host: copyParticipant(envelope.sender),
          shareId: payload.shareId,
          label: payload.label,
        });
        this.emit({ type: "signal", envelope: envelope as StudioLiveSignalEnvelope });
        return;
      }
      case "screen:request":
      case "screen:access":
      case "webrtc:description":
      case "webrtc:ice":
        if (
          (envelope.kind === "webrtc:description" || envelope.kind === "webrtc:ice") &&
          isStudioLiveP2pMeshShareId(
            (envelope.payload as StudioLiveWebRtcDescriptionPayload | StudioLiveWebRtcIcePayload)
              .shareId,
          )
        ) {
          return;
        }
        this.emit({ type: "signal", envelope: envelope as StudioLiveSignalEnvelope });
        return;
      case "screen:stop": {
        const payload = envelope.payload as StudioLiveScreenStopPayload;
        const current = this.screenShares.get(envelope.sender.sessionId);
        if (current?.shareId === payload.shareId) {
          this.screenShares.delete(envelope.sender.sessionId);
        }
        this.emit({ type: "signal", envelope: envelope as StudioLiveSignalEnvelope });
        return;
      }
      case "voice:join": {
        if (envelope.sender.role === "viewer") return;
        const payload = envelope.payload as StudioLiveVoiceJoinPayload;
        const current = this.voiceMembers.get(envelope.sender.sessionId);
        const callSize = [...this.voiceMembers.values()].filter(
          (member) => member.callId === payload.callId
        ).length;
        if (current?.callId !== payload.callId && callSize >= STUDIO_LIVE_VOICE_MAX_PARTICIPANTS) {
          return;
        }
        this.voiceMembers.set(envelope.sender.sessionId, {
          participant: copyParticipant(envelope.sender),
          callId: payload.callId,
          muted: payload.muted,
        });
        this.emitVoice({
          type: "voice:joined",
          participant: copyParticipant(envelope.sender),
          callId: payload.callId,
          muted: payload.muted,
        });
        this.emitVoicePresence();
        return;
      }
      case "voice:state": {
        if (envelope.sender.role === "viewer") return;
        const payload = envelope.payload as StudioLiveVoiceStatePayload;
        const current = this.voiceMembers.get(envelope.sender.sessionId);
        if (!current || current.callId !== payload.callId) return;
        this.voiceMembers.set(envelope.sender.sessionId, { ...current, muted: payload.muted });
        this.emitVoice({
          type: "voice:state",
          participant: copyParticipant(envelope.sender),
          callId: payload.callId,
          muted: payload.muted,
        });
        this.emitVoicePresence();
        return;
      }
      case "voice:leave": {
        const payload = envelope.payload as StudioLiveVoiceLeavePayload;
        const current = this.voiceMembers.get(envelope.sender.sessionId);
        if (!current || current.callId !== payload.callId) return;
        this.voiceMembers.delete(envelope.sender.sessionId);
        this.emitVoice({
          type: "voice:left",
          participant: copyParticipant(envelope.sender),
          callId: payload.callId,
        });
        this.emitVoicePresence();
        return;
      }
      case "voice:description": {
        if (envelope.sender.role === "viewer") return;
        const payload = envelope.payload as StudioLiveVoiceDescriptionPayload;
        const self = this.voiceMembers.get(this.participant.sessionId);
        const remote = this.voiceMembers.get(envelope.sender.sessionId);
        if (!self || !remote || self.callId !== payload.callId || remote.callId !== payload.callId) {
          return;
        }
        this.emitVoice({
          type: "voice:description",
          participant: copyParticipant(envelope.sender),
          payload: { ...payload },
        });
        return;
      }
      case "voice:ice": {
        if (envelope.sender.role === "viewer") return;
        const payload = envelope.payload as StudioLiveVoiceIcePayload;
        const self = this.voiceMembers.get(this.participant.sessionId);
        const remote = this.voiceMembers.get(envelope.sender.sessionId);
        if (!self || !remote || self.callId !== payload.callId || remote.callId !== payload.callId) {
          return;
        }
        this.emitVoice({
          type: "voice:ice",
          participant: copyParticipant(envelope.sender),
          payload: { ...payload },
        });
        return;
      }
    }
  }

  private onTransportControl(event: StudioLiveTransportControlEvent): void {
    if (this.phase === "closed") return;
    if (event.type === "status") {
      if (event.status.state === "revoked") {
        this.revokePendingLockClaims("access_revoked", event.status.message);
        this.revokePendingLockReleases("access_revoked", event.status.message);
        const hadPeers = this.peers.size > 0;
        const hadLocks = this.locks.size > 0;
        this.peers.clear();
        this.cursors.clear();
        this.screenShares.clear();
        this.locks.clear();
        this.chatMessages.length = 0;
        this.lastSequenceBySession.clear();
        if (hadPeers) this.emitPresence();
        if (hadLocks) this.emitLocks();
        this.voiceMembers.clear();
        this.emitVoicePresence();
        this.emitVoice({
          type: "terminal",
          reason: "revoked",
          message: event.status.message,
        });
      } else if (event.status.state === "disconnected") {
        this.revokePendingLockClaims("disconnected", event.status.message);
        this.revokePendingLockReleases("disconnected", event.status.message);
        const hadPeers = this.peers.size > 0;
        this.peers.clear();
        this.cursors.clear();
        this.screenShares.clear();
        this.lastSequenceBySession.clear();
        if (hadPeers) this.emitPresence();
        let changed = false;
        for (const [sessionId, member] of this.voiceMembers) {
          if (sessionId === this.participant.sessionId) continue;
          this.voiceMembers.delete(sessionId);
          this.emitVoice({
            type: "voice:left",
            participant: copyParticipant(member.participant),
            callId: member.callId,
          });
          changed = true;
        }
        if (changed) this.emitVoicePresence();
      } else if (
        event.status.state === "ready" &&
        this.phase === "ready" &&
        this.transport?.ready
      ) {
        // Reconnect joins start with a fresh server participant. Restore the current page and
        // visibility immediately instead of waiting up to one heartbeat interval.
        this.sendPresence("presence:heartbeat");
        const voice = this.voiceMembers.get(this.participant.sessionId);
        if (voice) this.post("voice:join", { callId: voice.callId, muted: voice.muted });
      }
      this.emit({ type: "transport-status", status: event.status });
      return;
    }
    if (event.type === "voice-removed") {
      const current = this.voiceMembers.get(this.participant.sessionId);
      if (!current || current.callId !== event.callId) return;
      this.voiceMembers.delete(this.participant.sessionId);
      this.emitVoicePresence();
      this.emitVoice({
        type: "voice:self-left",
        callId: event.callId,
        reason: event.reason,
        message: event.message,
      });
      return;
    }
    if (event.type === "comment-changed") {
      if (!this.ready) return;
      const change = parseStudioTeamCommentLiveEvent(event.change, this.workId);
      if (!change) return;
      this.emit({ type: "comment-changed", change });
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
      if (
        next.owner.sessionId === this.participant.sessionId &&
        this.pendingLockReleases.has(next.resource)
      ) {
        return;
      }
      this.locks.set(next.resource, next);
      this.emitLocks();
      const pending = this.pendingLockClaims.get(next.resource);
      if (
        pending &&
        event.lock.requestId === pending.requestId &&
        next.owner.sessionId === this.participant.sessionId
      ) {
        this.completePendingLockClaim(pending, {
          status: "acquired",
          resource: next.resource,
          requestId: pending.requestId,
          lock: { ...next, owner: copyParticipant(next.owner) },
        });
      }
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
    const conflicting = Array.from(this.locks.values()).filter(
      (lock) =>
        lock.owner.sessionId !== candidate.owner.sessionId &&
        lock.leaseUntil > now &&
        studioLiveLockResourcesConflict(lock.resource, candidate.resource)
    );
    const candidateScope = parseStudioLiveLockResourceScope(candidate.resource);
    const losesConflict = conflicting.some((lock) => {
      if (lock.resource === candidate.resource) {
        return lockPriority(candidate) >= lockPriority(lock);
      }
      const lockScope = parseStudioLiveLockResourceScope(lock.resource);
      if (candidateScope?.kind === "page" && lockScope?.kind === "element") return false;
      if (candidateScope?.kind === "element" && lockScope?.kind === "page") return true;
      return lockPriority(candidate) >= lockPriority(lock);
    });
    if (losesConflict) return;
    for (const lock of conflicting) this.locks.delete(lock.resource);
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
    // The server is authoritative for socket presence and can keep an idle participant alive
    // indefinitely. Only local BroadcastChannel peers need client-side silence expiry.
    if (this.transport?.mode !== "server") {
      for (const [sessionId, peer] of this.peers) {
        if (now - peer.lastSeenAt <= this.presenceTtlMs) continue;
        this.peers.delete(sessionId);
        this.cursors.delete(sessionId);
        this.screenShares.delete(sessionId);
        this.lastSequenceBySession.delete(sessionId);
        const voiceMember = this.voiceMembers.get(sessionId);
        if (voiceMember) {
          this.voiceMembers.delete(sessionId);
          this.emitVoice({
            type: "voice:left",
            participant: copyParticipant(voiceMember.participant),
            callId: voiceMember.callId,
          });
        }
        presenceChanged = true;
      }
    }
    let locksChanged = false;
    for (const [resource, lock] of this.locks) {
      if (lock.leaseUntil > now && this.peers.has(lock.owner.sessionId)) continue;
      if (lock.owner.sessionId === this.participant.sessionId && lock.leaseUntil > now) continue;
      this.locks.delete(resource);
      locksChanged = true;
    }
    if (presenceChanged) this.emitPresence();
    if (presenceChanged) this.emitVoicePresence();
    if (locksChanged) this.emitLocks();
  }

  private emitPresence(): void {
    this.emit({ type: "presence", peers: this.getPeers() });
  }

  private emitLocks(): void {
    this.emit({ type: "locks", locks: this.getLocks() });
  }

  private emitVoicePresence(): void {
    this.emitVoice({ type: "presence", members: this.getVoiceMembers() });
  }

  private emitVoice(event: StudioLiveVoiceEvent): void {
    for (const listener of this.voiceListeners) {
      try {
        listener(event);
      } catch {
        // One voice controller cannot interrupt room cleanup or other subscribers.
      }
    }
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

  private emitCrdt(event: StudioLiveCrdtRoomEvent): void {
    for (const listener of this.crdtListeners) {
      try {
        listener(event);
      } catch {
        // One CRDT binding cannot interrupt room cleanup or other document subscribers.
      }
    }
  }
}
