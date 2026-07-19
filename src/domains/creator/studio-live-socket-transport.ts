import { io } from "socket.io-client";

import {
  createStudioCrdtPermanentError,
  createStudioCrdtRetryableError,
  createStudioCrdtServerAckError,
  type StudioCrdtOperationError,
} from "./studio-crdt-operation-error";
import {
  parseStudioCrdtRemoteUpdate,
  parseStudioCrdtSyncRequest,
  parseStudioCrdtSyncResponse,
  parseStudioCrdtUpdateAck,
  parseStudioCrdtUpdateRequest,
  type StudioCrdtSyncRequest,
  type StudioCrdtSyncResponse,
  type StudioCrdtTransportMessage,
  type StudioCrdtUpdateAck,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import {
  STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH,
  STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH,
  STUDIO_LIVE_SDP_MID_MAX_LENGTH,
  STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
  createStudioLiveEnvelope,
  studioLiveStringFitsByteContract,
  type StudioLiveEnvelope,
  type StudioLiveMessageKind,
  type StudioLivePayloadMap,
  type StudioLiveScreenAccessPayload,
  type StudioLiveVoiceIcePayload,
  type StudioLiveWebRtcIcePayload,
} from "./studio-live-collaboration-protocol";
import { resolveStudioLiveSocketEndpoint } from "./studio-live-socket-endpoint";
import {
  isRecord,
  nullableString,
  parseFailure,
  parseJoinAck,
  parseLock,
  parseParticipant,
  parseVoiceMember,
  publicParticipant,
  safeIdentifier,
  safeSdpString,
  safeString,
  type ServerFailure,
  type ServerJoinSnapshot,
  type ServerLock,
  type ServerParticipant,
  type ServerVoiceMember,
} from "./studio-live-socket-wire";

import type {
  StudioLiveAuthoritativeLockEvent,
  StudioLiveTransport,
  StudioLiveTransportContext,
  StudioLiveTransportControlEvent,
  StudioLiveTransportFactory,
  StudioLiveTransportStatus,
} from "./studio-live-collaboration-transport";

import { getRuntimeApiBase } from "@/src/infrastructure/runtime-api-base";

const SOCKET_PATH = "/socket.io";
const CONNECT_TIMEOUT_MS = 10_000;
const CRDT_ACK_TIMEOUT_MS = 10_000;
const VOICE_JOIN_ACK_TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_SEEN_CRDT_UPDATE_IDS = 4_096;
const MAX_PENDING_PRESENCE_CONNECTIONS = 2_048;
const MAX_PENDING_VOICE_CONNECTIONS = 256;
const MAX_PENDING_VOICE_SIGNALS = 256;

type PendingPresenceDelta =
  | { kind: "update"; participant: ServerParticipant }
  | { kind: "leave"; connectionId: string };

type PendingVoiceDelta =
  | { kind: "update"; member: ServerVoiceMember }
  | { kind: "leave"; connectionId: string; callId: string };

interface PendingVoiceSignal {
  targetConnectionId: string;
  callId: string;
  payload: Record<string, unknown>;
}

interface PendingVoiceAdmission {
  callId: string;
  initialMuted: boolean;
  muted: boolean;
  intentGeneration: number;
  joinGeneration: number;
  selfConnectionId: string;
  signals: PendingVoiceSignal[];
  timeout: unknown;
}

export interface StudioLiveSocketLike {
  connected: boolean;
  auth: Record<string, unknown>;
  connect(): StudioLiveSocketLike;
  disconnect(): StudioLiveSocketLike;
  emit(event: string, ...args: unknown[]): StudioLiveSocketLike;
  on(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike;
  off(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike;
}

export interface StudioLiveSocketTransportDependencies {
  createSocket?: (auth: { sessionToken: string }) => StudioLiveSocketLike;
  now?: () => number;
  setTimeout?: (handler: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  voiceJoinAckTimeoutMs?: number;
}

function defaultCreateSocket(auth: { sessionToken: string }): StudioLiveSocketLike {
  return io(
    resolveStudioLiveSocketEndpoint({
      explicitOrigin: import.meta.env.VITE_STUDIO_LIVE_ORIGIN,
      viteApiBase: import.meta.env.VITE_API_BASE,
      runtimeApiBase: getRuntimeApiBase(),
      locationOrigin: globalThis.location?.origin,
      allowInsecureLoopback: import.meta.env.DEV,
    }),
    {
      path: SOCKET_PATH,
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      auth,
    }
  ) as unknown as StudioLiveSocketLike;
}

function defaultSetTimeout(handler: () => void, delay: number): unknown {
  return globalThis.setTimeout(handler, delay);
}

function defaultClearTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function eventMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 500);
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return fallback;
}

function connectErrorCode(error: unknown): string | null {
  if (!isRecord(error) || !isRecord(error.data) || !safeString(error.data.code, 80)) return null;
  return error.data.code;
}

function isTerminalConnectErrorCode(code: string | null): boolean {
  return code === "unauthenticated" || code === "forbidden" || code === "access_revoked";
}

function isNonRecoverable(code: string): boolean {
  return code === "unauthenticated" || code === "forbidden";
}

/**
 * Authenticated Socket.IO adapter. The session token exists only in the in-memory Socket.IO auth
 * handshake object and is never copied into protocol envelopes, payload logs or browser storage.
 */
export class StudioLiveSocketTransport implements StudioLiveTransport {
  readonly mode = "server" as const;

  private readonly context: StudioLiveTransportContext;
  private readonly socket: StudioLiveSocketLike;
  private readonly now: () => number;
  private readonly scheduleTimeout: (handler: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly voiceJoinAckTimeoutMs: number;
  private readonly listeners = new Set<(value: unknown) => void>();
  private readonly controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  private readonly crdtListeners = new Set<(message: StudioCrdtTransportMessage) => void>();
  private readonly seenCrdtUpdateIds = new Set<string>();
  private readonly pendingCrdtPublishes = new Map<string, Promise<StudioCrdtUpdateAck>>();
  private readonly pendingCrdtOperations = new Set<{
    reject: (error: Error) => void;
    timeout: unknown;
  }>();
  private readonly participants = new Map<string, ServerParticipant>();
  private readonly sequenceByConnection = new Map<string, number>();
  private readonly shareIdByConnection = new Map<string, string>();
  private readonly voiceMemberByConnection = new Map<string, ServerVoiceMember>();
  private readonly locksByResource = new Map<string, ServerLock>();
  private readonly pendingPresenceByConnection = new Map<string, PendingPresenceDelta>();
  private readonly pendingVoiceByConnection = new Map<string, PendingVoiceDelta>();
  private sessionToken: string | null;
  private selfConnectionId: string | null = null;
  private pendingInitialSnapshot: ServerJoinSnapshot | null = null;
  private joined = false;
  private closed = false;
  private accessRevoked = false;
  private everJoined = false;
  private joinGeneration = 0;
  private voiceIntentGeneration = 0;
  private desiredVoiceCallId: string | null = null;
  private pendingVoiceAdmission: PendingVoiceAdmission | null = null;
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private connectTimeout: unknown = null;

  constructor(
    context: StudioLiveTransportContext,
    sessionToken: string,
    dependencies: StudioLiveSocketTransportDependencies = {}
  ) {
    if (!safeString(sessionToken, MAX_TOKEN_LENGTH)) {
      throw new Error("실시간 팀 연결에 사용할 로그인 세션이 없습니다.");
    }
    this.context = context;
    this.sessionToken = sessionToken;
    this.now = dependencies.now ?? Date.now;
    this.scheduleTimeout = dependencies.setTimeout ?? defaultSetTimeout;
    this.cancelTimeout = dependencies.clearTimeout ?? defaultClearTimeout;
    this.voiceJoinAckTimeoutMs = Math.min(
      30_000,
      Math.max(
        100,
        Math.trunc(dependencies.voiceJoinAckTimeoutMs ?? VOICE_JOIN_ACK_TIMEOUT_MS)
      )
    );
    this.socket = (dependencies.createSocket ?? defaultCreateSocket)({ sessionToken });
    this.socket.on("connect", this.onConnect);
    this.socket.on("connect_error", this.onConnectError);
    this.socket.on("disconnect", this.onDisconnect);
    this.socket.on("studio:error", this.onServerError);
    this.socket.on("studio:access:revoked", this.onAccessRevoked);
    this.socket.on("studio:presence:snapshot", this.onPresenceSnapshot);
    this.socket.on("studio:presence:update", this.onPresenceUpdate);
    this.socket.on("studio:presence:leave", this.onPresenceLeave);
    this.socket.on("studio:cursor", this.onCursor);
    this.socket.on("studio:lock:update", this.onLockUpdate);
    this.socket.on("studio:signal", this.onSignal);
    this.socket.on("studio:screen:announce", this.onScreenAnnounce);
    this.socket.on("studio:screen:request", this.onScreenRequest);
    this.socket.on("studio:screen:access", this.onScreenAccess);
    this.socket.on("studio:screen:stop", this.onScreenStop);
    this.socket.on("studio:voice:snapshot", this.onVoiceSnapshot);
    this.socket.on("studio:voice:join", this.onVoiceJoin);
    this.socket.on("studio:voice:state", this.onVoiceState);
    this.socket.on("studio:voice:leave", this.onVoiceLeave);
    this.socket.on("studio:voice:signal", this.onVoiceSignal);
    this.socket.on("studio:chat:message", this.onChatMessage);
    this.socket.on("studio:crdt:sync", this.onCrdtSync);
    this.socket.on("studio:crdt:update", this.onCrdtUpdate);
  }

  get ready(): boolean {
    return !this.closed && this.joined && this.socket.connected;
  }

  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("이미 닫힌 팀 공동작업 연결입니다."));
    if (this.accessRevoked) {
      return Promise.reject(new Error("팀 권한이 해제되었습니다. 권한을 확인한 뒤 다시 연결해 주세요."));
    }
    if (this.ready) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.emitStatus({
      state: "connecting",
      message: "팀 서버에 연결하고 작품 권한을 확인하는 중입니다.",
      recoverable: true,
    });
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    this.connectPromise = promise;
    this.connectTimeout = this.scheduleTimeout(() => {
      this.failInitialConnect("팀 서버 연결 시간이 초과되었습니다. 다시 연결하거나 로컬 모드를 사용해 주세요.");
    }, CONNECT_TIMEOUT_MS);
    if (this.socket.connected) this.beginJoin();
    else this.socket.connect();
    return promise;
  }

  subscribe(listener: (value: unknown) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  subscribeCrdt(listener: (message: StudioCrdtTransportMessage) => void): () => void {
    if (this.closed) return () => undefined;
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {
    const parsed = parseStudioCrdtSyncRequest(request, { expectedWorkId: this.context.workId });
    if (!parsed) {
      return Promise.reject(createStudioCrdtPermanentError(
        "invalid_payload",
        "CRDT 동기화 요청이 올바르지 않습니다.",
        "client-validation"
      ));
    }
    return this.emitCrdtWithAck(
      "studio:crdt:sync",
      parsed,
      parseStudioCrdtSyncResponse
    );
  }

  publishCrdtUpdate(request: StudioCrdtUpdateRequest): Promise<StudioCrdtUpdateAck> {
    const parsed = parseStudioCrdtUpdateRequest(request, { expectedWorkId: this.context.workId });
    if (!parsed) {
      return Promise.reject(createStudioCrdtPermanentError(
        "invalid_payload",
        "CRDT 업데이트가 올바르지 않습니다.",
        "client-validation"
      ));
    }
    const pending = this.pendingCrdtPublishes.get(parsed.updateId);
    if (pending) return pending;
    const operation = this.emitCrdtWithAck(
      "studio:crdt:update",
      parsed,
      parseStudioCrdtUpdateAck
    );
    this.pendingCrdtPublishes.set(parsed.updateId, operation);
    operation.then(
      (ack) => {
        this.pendingCrdtPublishes.delete(parsed.updateId);
        this.rememberCrdtUpdateId(ack.updateId);
      },
      () => this.pendingCrdtPublishes.delete(parsed.updateId)
    );
    return operation;
  }

  send(envelope: StudioLiveEnvelope): boolean {
    if (!this.ready || envelope.workId !== this.context.workId) return false;
    try {
      switch (envelope.kind) {
        case "presence:hello":
        case "presence:heartbeat": {
          const payload = envelope.payload as StudioLivePayloadMap["presence:heartbeat"];
          this.emitWithAck("studio:presence", {
            workId: this.context.workId,
            state: payload.visibility,
            pageId: payload.pageId,
            tool: payload.tool ?? null,
          });
          this.flushInitialSnapshot();
          return true;
        }
        case "presence:leave":
          return true;
        case "cursor:update": {
          const payload = envelope.payload as StudioLivePayloadMap["cursor:update"];
          this.emitWithAck("studio:cursor", {
            workId: this.context.workId,
            pageId: payload.pageId,
            x: payload.x,
            y: payload.y,
          });
          return true;
        }
        case "lock:claim": {
          const payload = envelope.payload as StudioLivePayloadMap["lock:claim"];
          const leaseMs = Math.max(5_000, Math.min(30_000, payload.leaseUntil - envelope.sentAt));
          this.emitWithAck(
            "studio:lock:request",
            { workId: this.context.workId, resourceId: payload.resource, leaseMs },
            (data) => {
              if (!isRecord(data)) return;
              const lock = parseLock(data.lock);
              if (lock) this.applyAuthoritativeLock(lock);
            }
          );
          return true;
        }
        case "lock:release": {
          const payload = envelope.payload as StudioLivePayloadMap["lock:release"];
          const leaseId = this.locksByResource.get(payload.resource)?.leaseId;
          if (!leaseId) return false;
          this.emitWithAck(
            "studio:lock:release",
            { workId: this.context.workId, resourceId: payload.resource, leaseId },
            () => this.applyAuthoritativeRelease(payload.resource, leaseId)
          );
          return true;
        }
        case "screen:announce": {
          const payload = envelope.payload as StudioLivePayloadMap["screen:announce"];
          this.emitWithAck("studio:screen:announce", { workId: this.context.workId, ...payload });
          return true;
        }
        case "screen:request": {
          const payload = envelope.payload as StudioLivePayloadMap["screen:request"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          this.shareIdByConnection.set(target, payload.shareId);
          this.emitWithAck("studio:screen:request", {
            workId: this.context.workId,
            targetConnectionId: target,
            shareId: payload.shareId,
          });
          return true;
        }
        case "screen:access": {
          const payload = envelope.payload as StudioLivePayloadMap["screen:access"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          this.shareIdByConnection.set(target, payload.shareId);
          this.emitWithAck("studio:screen:access", {
            workId: this.context.workId,
            targetConnectionId: target,
            shareId: payload.shareId,
            decision: payload.decision,
          });
          return true;
        }
        case "webrtc:description": {
          const payload = envelope.payload as StudioLivePayloadMap["webrtc:description"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          this.emitWithAck("studio:signal", {
            workId: this.context.workId,
            targetConnectionId: target,
            shareId: payload.shareId,
            kind: "description",
            description: { type: payload.type, sdp: payload.sdp },
          });
          return true;
        }
        case "webrtc:ice": {
          const payload = envelope.payload as StudioLivePayloadMap["webrtc:ice"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          this.emitWithAck("studio:signal", {
            workId: this.context.workId,
            targetConnectionId: target,
            shareId: payload.shareId,
            kind: "candidate",
            candidate: {
              candidate: payload.candidate,
              sdpMid: payload.sdpMid,
              sdpMLineIndex: payload.sdpMLineIndex,
              usernameFragment: payload.usernameFragment,
            },
          });
          return true;
        }
        case "voice:join": {
          const payload = envelope.payload as StudioLivePayloadMap["voice:join"];
          this.cancelPendingVoiceAdmission({
            emitRemoval: false,
            preserveIntent: false,
            sendLeave: true,
          });
          const intentGeneration = ++this.voiceIntentGeneration;
          this.desiredVoiceCallId = payload.callId;
          const selfConnectionId = this.selfConnectionId;
          if (!selfConnectionId) return false;
          const pending: PendingVoiceAdmission = {
            callId: payload.callId,
            initialMuted: payload.muted,
            muted: payload.muted,
            intentGeneration,
            joinGeneration: this.joinGeneration,
            selfConnectionId,
            signals: [],
            timeout: null,
          };
          this.pendingVoiceAdmission = pending;
          pending.timeout = this.scheduleTimeout(() => {
            this.rejectPendingVoiceAdmission(
              pending,
              "음성 작업실 참가 응답 시간이 초과되었습니다. 다시 참가해 주세요."
            );
          }, this.voiceJoinAckTimeoutMs);
          this.socket.emit(
            "studio:voice:join",
            {
              workId: this.context.workId,
              callId: payload.callId,
              muted: payload.muted,
            },
            (value: unknown) => this.completePendingVoiceAdmission(pending, value)
          );
          return true;
        }
        case "voice:state": {
          const payload = envelope.payload as StudioLivePayloadMap["voice:state"];
          const pending = this.pendingVoiceAdmission;
          if (
            pending &&
            this.isCurrentVoiceAdmission(pending) &&
            pending.callId === payload.callId
          ) {
            pending.muted = payload.muted;
            return true;
          }
          const current = this.selfConnectionId
            ? this.voiceMemberByConnection.get(this.selfConnectionId)
            : null;
          if (!current || current.callId !== payload.callId) return false;
          this.voiceMemberByConnection.set(current.connectionId, { ...current, muted: payload.muted });
          this.emitWithAck(
            "studio:voice:state",
            {
              workId: this.context.workId,
              callId: payload.callId,
              muted: payload.muted,
            },
            undefined,
            (message) => this.rejectSelfVoice(payload.callId, message)
          );
          return true;
        }
        case "voice:leave": {
          const payload = envelope.payload as StudioLivePayloadMap["voice:leave"];
          const pending = this.pendingVoiceAdmission;
          if (pending && pending.callId === payload.callId) {
            this.cancelPendingVoiceAdmission({
              emitRemoval: false,
              preserveIntent: false,
              sendLeave: true,
            });
            return true;
          }
          const current = this.selfConnectionId
            ? this.voiceMemberByConnection.get(this.selfConnectionId)
            : null;
          if (!current || current.callId !== payload.callId) return false;
          ++this.voiceIntentGeneration;
          if (this.desiredVoiceCallId === payload.callId) this.desiredVoiceCallId = null;
          this.voiceMemberByConnection.delete(current.connectionId);
          this.emitWithAck("studio:voice:leave", {
            workId: this.context.workId,
            callId: payload.callId,
          });
          return true;
        }
        case "voice:description": {
          const payload = envelope.payload as StudioLivePayloadMap["voice:description"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          const targetVoice = this.voiceMemberByConnection.get(target);
          const pending = this.pendingVoiceAdmission;
          if (
            pending &&
            this.isCurrentVoiceAdmission(pending) &&
            pending.callId === payload.callId &&
            targetVoice?.callId === payload.callId
          ) {
            return this.queuePendingVoiceSignal(pending, {
              targetConnectionId: target,
              callId: payload.callId,
              payload: {
                workId: this.context.workId,
                targetConnectionId: target,
                callId: payload.callId,
                kind: "description",
                description: { type: payload.type, sdp: payload.sdp },
              },
            });
          }
          const selfVoice = this.selfConnectionId
            ? this.voiceMemberByConnection.get(this.selfConnectionId)
            : null;
          if (
            !selfVoice ||
            !targetVoice ||
            selfVoice.callId !== payload.callId ||
            targetVoice.callId !== payload.callId
          ) return false;
          this.emitWithAck("studio:voice:signal", {
            workId: this.context.workId,
            targetConnectionId: target,
            callId: payload.callId,
            kind: "description",
            description: { type: payload.type, sdp: payload.sdp },
          });
          return true;
        }
        case "voice:ice": {
          const payload = envelope.payload as StudioLivePayloadMap["voice:ice"];
          const target = this.validTarget(envelope.targetSessionId);
          if (!target) return false;
          const targetVoice = this.voiceMemberByConnection.get(target);
          const pending = this.pendingVoiceAdmission;
          if (
            pending &&
            this.isCurrentVoiceAdmission(pending) &&
            pending.callId === payload.callId &&
            targetVoice?.callId === payload.callId
          ) {
            return this.queuePendingVoiceSignal(pending, {
              targetConnectionId: target,
              callId: payload.callId,
              payload: {
                workId: this.context.workId,
                targetConnectionId: target,
                callId: payload.callId,
                kind: "candidate",
                candidate: {
                  candidate: payload.candidate,
                  sdpMid: payload.sdpMid,
                  sdpMLineIndex: payload.sdpMLineIndex,
                  usernameFragment: payload.usernameFragment,
                },
              },
            });
          }
          const selfVoice = this.selfConnectionId
            ? this.voiceMemberByConnection.get(this.selfConnectionId)
            : null;
          if (
            !selfVoice ||
            !targetVoice ||
            selfVoice.callId !== payload.callId ||
            targetVoice.callId !== payload.callId
          ) return false;
          this.emitWithAck("studio:voice:signal", {
            workId: this.context.workId,
            targetConnectionId: target,
            callId: payload.callId,
            kind: "candidate",
            candidate: {
              candidate: payload.candidate,
              sdpMid: payload.sdpMid,
              sdpMLineIndex: payload.sdpMLineIndex,
              usernameFragment: payload.usernameFragment,
            },
          });
          return true;
        }
        case "chat:message": {
          const payload = envelope.payload as StudioLivePayloadMap["chat:message"];
          this.emitWithAck("studio:chat:send", {
            workId: this.context.workId,
            messageId: payload.messageId,
            text: payload.text,
          });
          return true;
        }
        case "screen:stop": {
          const payload = envelope.payload as StudioLivePayloadMap["screen:stop"];
          this.emitWithAck("studio:screen:stop", {
            workId: this.context.workId,
            shareId: payload.shareId,
          });
          for (const [connectionId, shareId] of this.shareIdByConnection) {
            if (shareId === payload.shareId) this.shareIdByConnection.delete(connectionId);
          }
          return true;
        }
      }
    } catch {
      this.emitStatus({
        state: "error",
        message: "팀 서버에 공동작업 메시지를 보내지 못했습니다.",
        recoverable: true,
      });
      return false;
    }
  }

  close(): void {
    if (this.closed) return;
    this.terminateVoiceIntent(
      "removed",
      "팀 공동작업 연결이 종료되어 음성 작업실에서 나갔습니다."
    );
    this.closed = true;
    ++this.joinGeneration;
    this.joined = false;
    this.clearConnectTimeout();
    this.rejectConnect?.(new Error("팀 공동작업 연결이 종료되었습니다."));
    this.clearConnectDeferred();
    this.socket.off("connect", this.onConnect);
    this.socket.off("connect_error", this.onConnectError);
    this.socket.off("disconnect", this.onDisconnect);
    this.socket.off("studio:error", this.onServerError);
    this.socket.off("studio:access:revoked", this.onAccessRevoked);
    this.socket.off("studio:presence:snapshot", this.onPresenceSnapshot);
    this.socket.off("studio:presence:update", this.onPresenceUpdate);
    this.socket.off("studio:presence:leave", this.onPresenceLeave);
    this.socket.off("studio:cursor", this.onCursor);
    this.socket.off("studio:lock:update", this.onLockUpdate);
    this.socket.off("studio:signal", this.onSignal);
    this.socket.off("studio:screen:announce", this.onScreenAnnounce);
    this.socket.off("studio:screen:request", this.onScreenRequest);
    this.socket.off("studio:screen:access", this.onScreenAccess);
    this.socket.off("studio:screen:stop", this.onScreenStop);
    this.socket.off("studio:voice:snapshot", this.onVoiceSnapshot);
    this.socket.off("studio:voice:join", this.onVoiceJoin);
    this.socket.off("studio:voice:state", this.onVoiceState);
    this.socket.off("studio:voice:leave", this.onVoiceLeave);
    this.socket.off("studio:voice:signal", this.onVoiceSignal);
    this.socket.off("studio:chat:message", this.onChatMessage);
    this.socket.off("studio:crdt:sync", this.onCrdtSync);
    this.socket.off("studio:crdt:update", this.onCrdtUpdate);
    this.rejectPendingCrdtOperations(createStudioCrdtRetryableError(
      "connection_closed",
      "팀 공동작업 연결이 종료되었습니다.",
      "connection"
    ));
    this.scrubCredentials();
    this.socket.disconnect();
    this.listeners.clear();
    this.controlListeners.clear();
    this.crdtListeners.clear();
    this.pendingCrdtPublishes.clear();
    this.seenCrdtUpdateIds.clear();
    this.participants.clear();
    this.sequenceByConnection.clear();
    this.shareIdByConnection.clear();
    this.voiceMemberByConnection.clear();
    this.locksByResource.clear();
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.selfConnectionId = null;
  }

  private readonly onConnect = () => {
    if (!this.closed && !this.accessRevoked) this.beginJoin();
  };

  private readonly onConnectError = (error: unknown) => {
    const message = eventMessage(error, "팀 서버에 연결하지 못했습니다.");
    if (isTerminalConnectErrorCode(connectErrorCode(error))) {
      this.revokeFromConnectError(message);
      return;
    }
    if (!this.everJoined) {
      this.failInitialConnect(message);
      return;
    }
    this.joined = false;
    this.emitStatus({ state: "error", message, recoverable: true });
  };

  private revokeFromConnectError(message: string): void {
    this.terminateVoiceIntent("revoked", message);
    ++this.joinGeneration;
    this.accessRevoked = true;
    this.joined = false;
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.clearConnectTimeout();
    this.rejectConnect?.(new Error(message));
    this.clearConnectDeferred();
    this.rejectPendingCrdtOperations(createStudioCrdtPermanentError(
      "access_revoked",
      message,
      "connection"
    ));
    this.emitStatus({ state: "revoked", message, recoverable: false });
    this.scrubCredentials();
    this.socket.disconnect();
  }

  private readonly onDisconnect = (reason: unknown) => {
    if (this.closed) return;
    // The room retains the user's desired call across a recoverable reconnect and republishes the
    // join after the next work-room ACK. Signals from the abandoned socket generation must not.
    this.cancelPendingVoiceAdmission({
      emitRemoval: false,
      preserveIntent: true,
      sendLeave: false,
    });
    this.joined = false;
    this.selfConnectionId = null;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.voiceMemberByConnection.clear();
    this.rejectPendingCrdtOperations(createStudioCrdtRetryableError(
      "disconnected",
      "연결이 끊겨 CRDT 작업을 다시 시도해야 합니다.",
      "connection"
    ));
    this.pendingCrdtPublishes.clear();
    if (this.accessRevoked) return;
    this.emitStatus({
      state: "disconnected",
      message: `팀 서버 연결이 끊겼습니다${typeof reason === "string" ? ` (${reason})` : ""}. 자동으로 다시 연결합니다.`,
      recoverable: true,
    });
  };

  private readonly onServerError = (value: unknown) => {
    const failure = parseFailure(value);
    if (!failure) return;
    this.handleFailure(failure);
  };

  private readonly onAccessRevoked = (value: unknown) => {
    const message =
      isRecord(value) && typeof value.message === "string" && value.message.trim()
        ? value.message.slice(0, 500)
        : "팀 권한이 변경되어 실시간 작업실 연결이 종료되었습니다.";
    this.terminateVoiceIntent("revoked", message);
    ++this.joinGeneration;
    this.accessRevoked = true;
    this.joined = false;
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.clearConnectTimeout();
    this.rejectConnect?.(new Error(message));
    this.clearConnectDeferred();
    this.rejectPendingCrdtOperations(createStudioCrdtPermanentError(
      "access_revoked",
      message,
      "connection"
    ));
    this.emitStatus({ state: "revoked", message, recoverable: false });
    this.scrubCredentials();
    this.socket.disconnect();
  };

  private readonly onPresenceSnapshot = (value: unknown) => {
    if (!isRecord(value) || value.workId !== this.context.workId || !Array.isArray(value.participants)) {
      return;
    }
    const participants = value.participants.map(parseParticipant);
    if (participants.some((participant) => participant === null)) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      for (const participant of participants as ServerParticipant[]) {
        const delta = { kind: "update" as const, participant };
        this.bufferPresenceDelta(delta);
        if (this.ready) this.stagePresenceDelta(delta);
      }
      return;
    }
    // Older gateway versions broadcast process-local snapshots. Treat them as additive heartbeats
    // so a rolling deployment cannot erase peers discovered through another adapter node.
    for (const participant of participants as ServerParticipant[]) {
      this.applyPresenceUpdate(participant);
    }
  };

  private readonly onPresenceUpdate = (value: unknown) => {
    const participant = parseParticipant(value);
    if (!participant) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      const delta = { kind: "update" as const, participant };
      this.bufferPresenceDelta(delta);
      if (this.ready) this.stagePresenceDelta(delta);
      return;
    }
    this.applyPresenceUpdate(participant);
  };

  private readonly onPresenceLeave = (value: unknown) => {
    if (!isRecord(value) || !safeString(value.connectionId, 128)) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      const delta = { kind: "leave" as const, connectionId: value.connectionId };
      this.bufferPresenceDelta(delta);
      if (this.ready) this.stagePresenceDelta(delta);
      return;
    }
    this.applyPresenceLeave(value.connectionId);
  };

  private applyPresenceLeave(connectionId: string): void {
    const participant = this.participants.get(connectionId);
    const voice = this.voiceMemberByConnection.get(connectionId);
    const pendingVoice = this.pendingVoiceByConnection.get(connectionId);
    this.participants.delete(connectionId);
    this.shareIdByConnection.delete(connectionId);
    this.voiceMemberByConnection.delete(connectionId);
    this.pendingVoiceByConnection.delete(connectionId);
    if (!participant || participant.connectionId === this.selfConnectionId) return;
    if (
      voice &&
      !(pendingVoice?.kind === "update" && pendingVoice.member.callId === voice.callId)
    ) {
      this.deliver(participant, "voice:leave", { callId: voice.callId });
    }
    this.deliver(participant, "presence:leave", {});
  }

  private applyPresenceUpdate(participant: ServerParticipant): void {
    const previous = this.participants.get(participant.connectionId);
    if (previous && Date.parse(previous.updatedAt) > Date.parse(participant.updatedAt)) return;
    this.participants.set(participant.connectionId, participant);
    if (participant.connectionId === this.selfConnectionId) return;
    this.deliver(participant, "presence:heartbeat", {
      visibility: participant.state === "active" ? "active" : "idle",
      pageId: participant.pageId,
    });
    this.replayPendingVoiceForParticipant(participant);
  }

  private bufferPresenceDelta(delta: PendingPresenceDelta): void {
    if (this.closed || this.accessRevoked || !this.socket.connected || this.joinGeneration <= 0) {
      return;
    }
    const connectionId = delta.kind === "update"
      ? delta.participant.connectionId
      : delta.connectionId;
    const previous = this.pendingPresenceByConnection.get(connectionId);
    if (
      previous?.kind === "update" && delta.kind === "update" &&
      Date.parse(previous.participant.updatedAt) > Date.parse(delta.participant.updatedAt)
    ) {
      return;
    }
    this.pendingPresenceByConnection.delete(connectionId);
    this.pendingPresenceByConnection.set(connectionId, delta);
    if (this.pendingPresenceByConnection.size <= MAX_PENDING_PRESENCE_CONNECTIONS) return;
    const oldest = this.pendingPresenceByConnection.keys().next().value;
    if (typeof oldest === "string") this.pendingPresenceByConnection.delete(oldest);
  }

  private bufferVoiceDelta(delta: PendingVoiceDelta): void {
    if (this.closed || this.accessRevoked || !this.socket.connected || this.joinGeneration <= 0) {
      return;
    }
    const connectionId = delta.kind === "update" ? delta.member.connectionId : delta.connectionId;
    this.pendingVoiceByConnection.delete(connectionId);
    this.pendingVoiceByConnection.set(connectionId, delta);
    if (this.pendingVoiceByConnection.size <= MAX_PENDING_VOICE_CONNECTIONS) return;
    const oldestEntry = this.pendingVoiceByConnection.entries().next().value;
    if (!oldestEntry) return;
    const [oldestConnectionId, oldestDelta] = oldestEntry;
    this.pendingVoiceByConnection.delete(oldestConnectionId);
    const current = this.voiceMemberByConnection.get(oldestConnectionId);
    if (
      oldestDelta.kind === "update" &&
      !this.participants.has(oldestConnectionId) &&
      current?.callId === oldestDelta.member.callId
    ) {
      this.voiceMemberByConnection.delete(oldestConnectionId);
    }
  }

  private replayPendingVoiceForParticipant(participant: ServerParticipant): void {
    const pending = this.pendingVoiceByConnection.get(participant.connectionId);
    if (!pending) return;
    if (pending.kind === "leave") {
      const current = this.voiceMemberByConnection.get(participant.connectionId);
      if (current?.callId === pending.callId) {
        this.voiceMemberByConnection.delete(participant.connectionId);
      }
      return;
    }
    this.pendingVoiceByConnection.delete(participant.connectionId);
    const current = this.voiceMemberByConnection.get(participant.connectionId);
    if (!current || current.callId !== pending.member.callId) return;
    if (participant.role === "viewer") {
      this.voiceMemberByConnection.delete(participant.connectionId);
      return;
    }
    this.deliver(participant, "voice:join", {
      callId: current.callId,
      muted: current.muted,
    });
  }

  private stagePresenceDelta(delta: PendingPresenceDelta): void {
    if (delta.kind === "leave") {
      this.participants.delete(delta.connectionId);
      this.shareIdByConnection.delete(delta.connectionId);
      return;
    }
    const previous = this.participants.get(delta.participant.connectionId);
    if (!previous || Date.parse(previous.updatedAt) <= Date.parse(delta.participant.updatedAt)) {
      this.participants.set(delta.participant.connectionId, delta.participant);
    }
  }

  private readonly onCursor = (value: unknown) => {
    if (!this.ready) return;
    if (
      !isRecord(value) ||
      !safeString(value.connectionId, 128) ||
      !nullableString(value.pageId, 160) ||
      typeof value.x !== "number" ||
      !Number.isFinite(value.x) ||
      value.x < 0 ||
      value.x > 1 ||
      typeof value.y !== "number" ||
      !Number.isFinite(value.y) ||
      value.y < 0 ||
      value.y > 1 ||
      (value.tool !== undefined && !nullableString(value.tool, 48))
    ) {
      return;
    }
    const participant = this.remoteParticipant(value.connectionId);
    if (!participant) return;
    this.deliver(participant, "cursor:update", {
      x: value.x,
      y: value.y,
      pageId: value.pageId,
      tool: value.tool === undefined ? participant.tool : value.tool,
    });
  };

  private readonly onLockUpdate = (value: unknown) => {
    if (!this.ready) return;
    if (!isRecord(value)) return;
    if (value.action === "acquired") {
      const lock = parseLock(value.lock);
      if (lock) this.applyAuthoritativeLock(lock);
      return;
    }
    if (
      (value.action === "released" || value.action === "expired") &&
      safeString(value.resourceId, 200) &&
      safeString(value.leaseId, 80)
    ) {
      this.applyAuthoritativeRelease(value.resourceId, value.leaseId);
    }
  };

  private readonly onSignal = (value: unknown) => {
    if (!this.ready) return;
    if (
      !isRecord(value) ||
      !safeString(value.fromConnectionId, 128) ||
      !safeString(value.shareId, 160)
    ) {
      return;
    }
    const participant = this.remoteParticipant(value.fromConnectionId);
    const shareId = value.shareId;
    if (!participant) return;
    if (value.kind === "description" && isRecord(value.description)) {
      const type = value.description.type;
      const sdp = value.description.sdp;
      if ((type !== "offer" && type !== "answer") || !safeSdpString(sdp)) return;
      this.deliver(
        participant,
        "webrtc:description",
        { shareId, type, sdp },
        this.context.participant.sessionId
      );
      return;
    }
    if (value.kind === "candidate" && isRecord(value.candidate)) {
      const candidate = value.candidate;
      if (
        !safeString(candidate.candidate, STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH) ||
        !studioLiveStringFitsByteContract(
          candidate.candidate,
          STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH
        ) ||
        !nullableString(candidate.sdpMid ?? null, STUDIO_LIVE_SDP_MID_MAX_LENGTH, true) ||
        !(
          candidate.sdpMLineIndex == null ||
          (typeof candidate.sdpMLineIndex === "number" &&
            Number.isInteger(candidate.sdpMLineIndex) &&
            candidate.sdpMLineIndex >= 0 &&
            candidate.sdpMLineIndex <= 65_535)
        ) ||
        !nullableString(
          candidate.usernameFragment ?? null,
          STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
          true
        )
      ) {
        return;
      }
      const payload: StudioLiveWebRtcIcePayload = {
        shareId,
        candidate: candidate.candidate,
        sdpMid: typeof candidate.sdpMid === "string" ? candidate.sdpMid : null,
        sdpMLineIndex:
          typeof candidate.sdpMLineIndex === "number" ? candidate.sdpMLineIndex : null,
        usernameFragment:
          typeof candidate.usernameFragment === "string" ? candidate.usernameFragment : null,
      };
      this.deliver(participant, "webrtc:ice", payload, this.context.participant.sessionId);
      return;
    }
    if (value.kind === "bye") {
      this.deliver(
        participant,
        "screen:access",
        { shareId, decision: "ended" },
        this.context.participant.sessionId
      );
    }
  };

  private readonly onScreenAnnounce = (value: unknown) => {
    if (!this.ready) return;
    const relay = this.screenRelay(value, true);
    if (!relay) return;
    this.shareIdByConnection.set(relay.participant.connectionId, relay.shareId);
    this.deliver(relay.participant, "screen:announce", {
      shareId: relay.shareId,
      label: relay.label,
    });
  };

  private readonly onScreenRequest = (value: unknown) => {
    if (!this.ready) return;
    const relay = this.screenRelay(value, false);
    if (!relay) return;
    this.shareIdByConnection.set(relay.participant.connectionId, relay.shareId);
    this.deliver(
      relay.participant,
      "screen:request",
      { shareId: relay.shareId },
      this.context.participant.sessionId
    );
  };

  private readonly onScreenAccess = (value: unknown) => {
    if (!this.ready) return;
    const relay = this.screenRelay(value, false);
    if (!relay || !isRecord(value)) return;
    const decision = value.decision;
    if (decision !== "approved" && decision !== "rejected" && decision !== "ended") return;
    this.shareIdByConnection.set(relay.participant.connectionId, relay.shareId);
    const payload: StudioLiveScreenAccessPayload = { shareId: relay.shareId, decision };
    this.deliver(
      relay.participant,
      "screen:access",
      payload,
      this.context.participant.sessionId
    );
  };

  private readonly onScreenStop = (value: unknown) => {
    if (!this.ready) return;
    const relay = this.screenRelay(value, false);
    if (!relay) return;
    this.deliver(relay.participant, "screen:stop", { shareId: relay.shareId });
    if (this.shareIdByConnection.get(relay.participant.connectionId) === relay.shareId) {
      this.shareIdByConnection.delete(relay.participant.connectionId);
    }
  };

  private readonly onVoiceSnapshot = (value: unknown) => {
    if (!isRecord(value) || value.workId !== this.context.workId) return;
    if (!Array.isArray(value.members)) return;
    if (value.callId !== undefined && !safeIdentifier(value.callId, 160)) return;
    const parsed = value.members.map(parseVoiceMember);
    if (parsed.some((member) => member === null)) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      for (const member of parsed as ServerVoiceMember[]) {
        this.bufferVoiceDelta({ kind: "update", member });
      }
      return;
    }
    this.applyVoiceSnapshot(
      parsed as ServerVoiceMember[],
      typeof value.callId === "string" ? value.callId : undefined
    );
  };

  private applyVoiceSnapshot(members: ServerVoiceMember[], scopeCallId?: string): void {
    const next = new Map(members.map((member) => [member.connectionId, member]));
    for (const [connectionId, pending] of this.pendingVoiceByConnection) {
      if (pending.kind === "leave" && next.get(connectionId)?.callId === pending.callId) {
        next.delete(connectionId);
      }
    }
    const previousByConnection = new Map(this.voiceMemberByConnection);
    for (const previous of previousByConnection.values()) {
      const replacement = next.get(previous.connectionId);
      if (
        replacement?.callId === previous.callId ||
        (scopeCallId !== undefined && previous.callId !== scopeCallId)
      ) {
        continue;
      }
      if (previous.connectionId === this.selfConnectionId) {
        if (scopeCallId === undefined) this.voiceMemberByConnection.delete(previous.connectionId);
        continue;
      }
      const pending = this.pendingVoiceByConnection.get(previous.connectionId);
      const wasPending =
        pending?.kind === "update" && pending.member.callId === previous.callId;
      const participant = this.remoteParticipant(previous.connectionId);
      this.voiceMemberByConnection.delete(previous.connectionId);
      if (pending?.kind === "update" && pending.member.callId === previous.callId) {
        this.pendingVoiceByConnection.delete(previous.connectionId);
      }
      if (!replacement && !participant) {
        this.bufferVoiceDelta({
          kind: "leave",
          connectionId: previous.connectionId,
          callId: previous.callId,
        });
      } else if (participant && participant.role !== "viewer" && !wasPending) {
        this.deliver(participant, "voice:leave", { callId: previous.callId });
      }
    }
    for (const member of next.values()) {
      const previous = previousByConnection.get(member.connectionId);
      const pending = this.pendingVoiceByConnection.get(member.connectionId);
      const wasPending =
        pending?.kind === "update" && pending.member.callId === member.callId;
      if (member.connectionId === this.selfConnectionId) {
        if (this.pendingVoiceAdmission?.callId === member.callId) {
          // Gateways publish a self snapshot immediately before invoking the join ACK. The snapshot
          // is useful for peer discovery, but only the correlated ACK authorizes local signaling.
          continue;
        }
        const authorizedSelf = previousByConnection.get(member.connectionId);
        if (authorizedSelf?.callId !== member.callId) {
          if (this.desiredVoiceCallId !== member.callId) {
            this.bestEffortVoiceLeave(member.callId);
          }
          continue;
        }
        if (this.desiredVoiceCallId !== member.callId) {
          this.voiceMemberByConnection.delete(member.connectionId);
          this.socket.emit("studio:voice:leave", {
            workId: this.context.workId,
            callId: member.callId,
          });
          continue;
        }
        this.voiceMemberByConnection.set(member.connectionId, member);
        this.pendingVoiceByConnection.delete(member.connectionId);
        continue;
      }
      this.voiceMemberByConnection.set(member.connectionId, member);
      const participant = this.remoteParticipant(member.connectionId);
      if (!participant) {
        this.bufferVoiceDelta({ kind: "update", member });
        continue;
      }
      this.pendingVoiceByConnection.delete(member.connectionId);
      if (participant.role === "viewer") {
        this.voiceMemberByConnection.delete(member.connectionId);
        continue;
      }
      if (previous?.callId === member.callId && !wasPending) {
        if (previous.muted !== member.muted) {
          this.deliver(participant, "voice:state", {
            callId: member.callId,
            muted: member.muted,
          });
        }
        continue;
      }
      this.deliver(participant, "voice:join", { callId: member.callId, muted: member.muted });
    }
  }

  private readonly onVoiceJoin = (value: unknown) => {
    const member = parseVoiceMember(value);
    if (!member) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferVoiceDelta({ kind: "update", member });
      return;
    }
    if (member.connectionId === this.selfConnectionId) {
      if (this.pendingVoiceAdmission?.callId === member.callId) return;
      const authorizedSelf = this.voiceMemberByConnection.get(member.connectionId);
      if (authorizedSelf?.callId !== member.callId) {
        if (this.desiredVoiceCallId !== member.callId) this.bestEffortVoiceLeave(member.callId);
        return;
      }
      if (this.desiredVoiceCallId !== member.callId) {
        this.voiceMemberByConnection.delete(member.connectionId);
        this.socket.emit("studio:voice:leave", {
          workId: this.context.workId,
          callId: member.callId,
        });
        return;
      }
      this.voiceMemberByConnection.set(member.connectionId, member);
      this.pendingVoiceByConnection.delete(member.connectionId);
      return;
    }
    const previous = this.voiceMemberByConnection.get(member.connectionId);
    const pending = this.pendingVoiceByConnection.get(member.connectionId);
    const participant = this.remoteParticipant(member.connectionId);
    this.voiceMemberByConnection.set(member.connectionId, member);
    if (!participant) {
      this.bufferVoiceDelta({ kind: "update", member });
      return;
    }
    this.pendingVoiceByConnection.delete(member.connectionId);
    if (participant.role === "viewer") {
      this.voiceMemberByConnection.delete(member.connectionId);
      return;
    }
    const wasPending =
      pending?.kind === "update" && pending.member.callId === member.callId;
    if (previous?.callId === member.callId && !wasPending) {
      if (previous.muted !== member.muted) {
        this.deliver(participant, "voice:state", {
          callId: member.callId,
          muted: member.muted,
        });
      }
      return;
    }
    if (previous && previous.callId !== member.callId) {
      const previousWasPending =
        pending?.kind === "update" && pending.member.callId === previous.callId;
      if (!previousWasPending) {
        this.deliver(participant, "voice:leave", { callId: previous.callId });
      }
    }
    this.deliver(participant, "voice:join", { callId: member.callId, muted: member.muted });
  };

  private readonly onVoiceState = (value: unknown) => {
    const member = parseVoiceMember(value);
    if (!member) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferVoiceDelta({ kind: "update", member });
      return;
    }
    const current = this.voiceMemberByConnection.get(member.connectionId);
    const participant = this.remoteParticipant(member.connectionId);
    if (!current || current.callId !== member.callId) {
      if (member.connectionId === this.selfConnectionId) {
        if (this.pendingVoiceAdmission?.callId === member.callId) return;
        return;
      }
      this.voiceMemberByConnection.set(member.connectionId, member);
      if (!participant) {
        this.bufferVoiceDelta({ kind: "update", member });
        return;
      }
      if (participant.role === "viewer") {
        this.voiceMemberByConnection.delete(member.connectionId);
        return;
      }
      this.pendingVoiceByConnection.delete(member.connectionId);
      this.deliver(participant, "voice:join", {
        callId: member.callId,
        muted: member.muted,
      });
      return;
    }
    this.voiceMemberByConnection.set(member.connectionId, member);
    if (member.connectionId === this.selfConnectionId) return;
    if (!participant) {
      this.bufferVoiceDelta({ kind: "update", member });
      return;
    }
    const pending = this.pendingVoiceByConnection.get(member.connectionId);
    this.pendingVoiceByConnection.delete(member.connectionId);
    if (participant.role === "viewer") {
      this.voiceMemberByConnection.delete(member.connectionId);
      return;
    }
    if (pending?.kind === "update" && pending.member.callId === member.callId) {
      this.deliver(participant, "voice:join", { callId: member.callId, muted: member.muted });
      return;
    }
    if (current.muted !== member.muted) {
      this.deliver(participant, "voice:state", { callId: member.callId, muted: member.muted });
    }
  };

  private readonly onVoiceLeave = (value: unknown) => {
    if (
      !isRecord(value) ||
      !safeIdentifier(value.connectionId, 128) ||
      !safeIdentifier(value.callId, 160)
    ) return;
    const pendingSelf = this.pendingVoiceAdmission;
    if (
      value.connectionId === this.selfConnectionId &&
      pendingSelf?.callId === value.callId
    ) {
      const serverReason = value.reason;
      const message = serverReason === "revoked"
        ? "작품 권한이 변경되어 음성 작업실에서 나갔습니다."
        : serverReason === "capacity"
          ? "음성 작업실 정원은 최대 6명입니다."
          : "서버에서 음성 작업실 참가 상태를 종료했습니다.";
      this.rejectPendingVoiceAdmission(
        pendingSelf,
        message,
        serverReason === "revoked" ? "revoked" : "rejected"
      );
      return;
    }
    const current = this.voiceMemberByConnection.get(value.connectionId);
    if (
      value.connectionId === this.selfConnectionId &&
      current?.callId === value.callId
    ) {
      this.voiceMemberByConnection.delete(value.connectionId);
      this.pendingVoiceByConnection.delete(value.connectionId);
      ++this.voiceIntentGeneration;
      if (this.desiredVoiceCallId === value.callId) this.desiredVoiceCallId = null;
      const serverReason = value.reason;
      const reason = serverReason === "revoked"
        ? "revoked"
        : serverReason === "capacity"
          ? "rejected"
          : "removed";
      const message = reason === "revoked"
        ? "작품 권한이 변경되어 음성 작업실에서 나갔습니다."
        : reason === "rejected"
          ? "음성 작업실 정원은 최대 6명입니다."
          : "서버에서 음성 작업실 참가 상태를 종료했습니다.";
      this.emitControl({ type: "voice-removed", callId: value.callId, reason, message });
      return;
    }
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferVoiceDelta({
        kind: "leave",
        connectionId: value.connectionId,
        callId: value.callId,
      });
      return;
    }
    const participant = this.remoteParticipant(value.connectionId);
    if (current && current.callId !== value.callId) return;
    const pending = this.pendingVoiceByConnection.get(value.connectionId);
    const wasPending =
      pending?.kind === "update" && pending.member.callId === value.callId;
    if (current) this.voiceMemberByConnection.delete(value.connectionId);
    if (!participant) {
      this.bufferVoiceDelta({
        kind: "leave",
        connectionId: value.connectionId,
        callId: value.callId,
      });
      return;
    }
    if (
      (pending?.kind === "update" && pending.member.callId === value.callId) ||
      (pending?.kind === "leave" && pending.callId === value.callId)
    ) {
      this.pendingVoiceByConnection.delete(value.connectionId);
    }
    if (current && participant.role !== "viewer" && !wasPending) {
      this.deliver(participant, "voice:leave", { callId: value.callId });
    }
  };

  private readonly onVoiceSignal = (value: unknown) => {
    if (
      !this.ready ||
      !isRecord(value) ||
      !safeIdentifier(value.fromConnectionId, 128) ||
      !safeIdentifier(value.callId, 160)
    ) return;
    const participant = this.remoteParticipant(value.fromConnectionId);
    const remoteVoice = this.voiceMemberByConnection.get(value.fromConnectionId);
    const selfVoice = this.selfConnectionId
      ? this.voiceMemberByConnection.get(this.selfConnectionId)
      : null;
    if (
      !participant ||
      participant.role === "viewer" ||
      !remoteVoice ||
      !selfVoice ||
      remoteVoice.callId !== value.callId ||
      selfVoice.callId !== value.callId
    ) return;
    if (value.kind === "description" && isRecord(value.description)) {
      const type = value.description.type;
      const sdp = value.description.sdp;
      if ((type !== "offer" && type !== "answer") || !safeSdpString(sdp)) return;
      this.deliver(
        participant,
        "voice:description",
        { callId: value.callId, type, sdp },
        this.context.participant.sessionId
      );
      return;
    }
    if (value.kind !== "candidate" || !isRecord(value.candidate)) return;
    const candidate = value.candidate;
    if (
      !safeString(candidate.candidate, STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH) ||
      !studioLiveStringFitsByteContract(
        candidate.candidate,
        STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH
      ) ||
      !nullableString(candidate.sdpMid ?? null, STUDIO_LIVE_SDP_MID_MAX_LENGTH, true) ||
      !(
        candidate.sdpMLineIndex == null ||
        (typeof candidate.sdpMLineIndex === "number" &&
          Number.isInteger(candidate.sdpMLineIndex) &&
          candidate.sdpMLineIndex >= 0 &&
          candidate.sdpMLineIndex <= 65_535)
      ) ||
      !nullableString(
        candidate.usernameFragment ?? null,
        STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
        true
      )
    ) return;
    const payload: StudioLiveVoiceIcePayload = {
      callId: value.callId,
      candidate: candidate.candidate,
      sdpMid: typeof candidate.sdpMid === "string" ? candidate.sdpMid : null,
      sdpMLineIndex:
        typeof candidate.sdpMLineIndex === "number" ? candidate.sdpMLineIndex : null,
      usernameFragment:
        typeof candidate.usernameFragment === "string" ? candidate.usernameFragment : null,
    };
    this.deliver(participant, "voice:ice", payload, this.context.participant.sessionId);
  };

  private readonly onChatMessage = (value: unknown) => {
    if (!this.ready) return;
    if (
      !isRecord(value) ||
      !safeString(value.fromConnectionId, 128) ||
      !safeString(value.messageId, 160) ||
      !safeString(value.text, STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH)
    ) {
      return;
    }
    const participant = this.remoteParticipant(value.fromConnectionId);
    if (!participant) return;
    this.deliver(participant, "chat:message", {
      messageId: value.messageId,
      text: value.text,
    });
  };

  private readonly onCrdtSync = (value: unknown) => {
    if (!this.ready) return;
    const response = parseStudioCrdtSyncResponse(value, {
      expectedWorkId: this.context.workId,
    });
    if (!response) return;
    this.emitCrdt({ type: "sync-response", response, senderSessionId: null });
  };

  private readonly onCrdtUpdate = (value: unknown) => {
    if (!this.ready) return;
    const update = parseStudioCrdtRemoteUpdate(value, {
      expectedWorkId: this.context.workId,
    });
    if (!update || this.seenCrdtUpdateIds.has(update.updateId)) return;
    this.rememberCrdtUpdateId(update.updateId);
    this.emitCrdt({ type: "update", update, senderSessionId: null });
  };

  private beginJoin(): void {
    if (this.closed || !this.socket.connected || !this.sessionToken) return;
    const generation = ++this.joinGeneration;
    this.joined = false;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.emitStatus({
      state: "connecting",
      message: "작품 팀 권한을 확인하고 있습니다.",
      recoverable: true,
    });
    this.socket.emit(
      "studio:join",
      { workId: this.context.workId, clientInstanceId: this.context.participant.sessionId },
      (value: unknown) => {
        if (this.closed || generation !== this.joinGeneration || !this.socket.connected) return;
        const response = parseJoinAck(value);
        if (!response) {
          this.failJoin("팀 서버의 참가 응답이 올바르지 않습니다.", true);
          return;
        }
        if ("ok" in response) {
          this.failJoin(response.message, !isNonRecoverable(response.code), response.code);
          return;
        }
        this.acceptJoin(response);
      }
    );
  }

  private acceptJoin(snapshot: ServerJoinSnapshot): void {
    const reconciledSnapshot = this.reconcilePendingPresence(snapshot);
    const wasJoined = this.everJoined;
    this.selfConnectionId = reconciledSnapshot.self.connectionId;
    this.joined = true;
    this.everJoined = true;
    this.pendingInitialSnapshot = reconciledSnapshot;
    // Stage the authoritative identity map immediately so an update arriving between join ACK and
    // the room's first heartbeat can still resolve lock owners and targeted connection ids.
    for (const participant of reconciledSnapshot.participants) {
      this.participants.set(participant.connectionId, participant);
    }
    this.clearConnectTimeout();
    this.resolveConnect?.();
    this.clearConnectDeferred();
    this.emitStatus({
      state: "ready",
      message: wasJoined ? "팀 서버에 다시 연결되었습니다." : "팀 서버 연결이 준비되었습니다.",
      recoverable: true,
    });
    if (wasJoined) this.flushInitialSnapshot();
  }

  private reconcilePendingPresence(snapshot: ServerJoinSnapshot): ServerJoinSnapshot {
    const participantsByConnection = new Map(
      snapshot.participants.map((participant) => [participant.connectionId, participant])
    );
    const departedConnectionIds = new Set<string>();
    for (const delta of this.pendingPresenceByConnection.values()) {
      if (delta.kind === "leave") {
        participantsByConnection.delete(delta.connectionId);
        departedConnectionIds.add(delta.connectionId);
        continue;
      }
      const previous = participantsByConnection.get(delta.participant.connectionId);
      if (!previous || Date.parse(previous.updatedAt) <= Date.parse(delta.participant.updatedAt)) {
        participantsByConnection.set(delta.participant.connectionId, delta.participant);
      }
    }
    const voiceMembersByConnection = new Map(
      snapshot.voiceMembers.map((member) => [member.connectionId, member])
    );
    for (const delta of this.pendingVoiceByConnection.values()) {
      if (delta.kind === "leave") {
        const current = voiceMembersByConnection.get(delta.connectionId);
        if (current?.callId === delta.callId) voiceMembersByConnection.delete(delta.connectionId);
        continue;
      }
      voiceMembersByConnection.set(delta.member.connectionId, delta.member);
    }
    for (const connectionId of departedConnectionIds) {
      voiceMembersByConnection.delete(connectionId);
    }
    participantsByConnection.set(snapshot.self.connectionId, snapshot.self);
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    return {
      ...snapshot,
      participants: [...participantsByConnection.values()],
      voiceMembers: [...voiceMembersByConnection.values()],
    };
  }

  private failJoin(message: string, recoverable: boolean, code?: string): void {
    this.joined = false;
    this.pendingPresenceByConnection.clear();
    this.pendingVoiceByConnection.clear();
    const state: StudioLiveTransportStatus["state"] = recoverable ? "error" : "revoked";
    this.emitStatus({ state, message, recoverable } as StudioLiveTransportStatus);
    if (!this.everJoined) {
      this.failInitialConnect(message);
    }
    if (!recoverable || (code && isNonRecoverable(code))) {
      this.accessRevoked = true;
      this.scrubCredentials();
      this.socket.disconnect();
    }
  }

  private failInitialConnect(message: string): void {
    if (!this.connectPromise) return;
    this.clearConnectTimeout();
    this.rejectConnect?.(new Error(message));
    this.clearConnectDeferred();
  }

  private handleFailure(failure: ServerFailure, source: "socket" | "operation" = "socket"): void {
    // A work-level operation can be forbidden after a role downgrade without revoking view access
    // to the joined room. Only join/socket authentication and explicit access:revoked are terminal.
    const recoverable =
      failure.code !== "unauthenticated" &&
      !(source === "socket" && failure.code === "forbidden");
    this.emitStatus({
      state: recoverable ? "error" : "revoked",
      message: failure.message,
      recoverable,
    } as StudioLiveTransportStatus);
    if (!recoverable) {
      this.terminateVoiceIntent("revoked", failure.message);
      ++this.joinGeneration;
      this.accessRevoked = true;
      this.joined = false;
      this.pendingInitialSnapshot = null;
      this.pendingPresenceByConnection.clear();
      this.pendingVoiceByConnection.clear();
      this.scrubCredentials();
      this.socket.disconnect();
    }
  }

  private scrubCredentials(): void {
    this.cancelPendingVoiceAdmission({
      emitRemoval: false,
      preserveIntent: false,
      sendLeave: false,
    });
    ++this.voiceIntentGeneration;
    this.desiredVoiceCallId = null;
    this.socket.auth = {};
    this.sessionToken = null;
  }

  private flushInitialSnapshot(): void {
    const snapshot = this.pendingInitialSnapshot;
    if (!snapshot || !this.ready) return;
    this.pendingInitialSnapshot = null;
    const reconciled = this.reconcilePendingPresence(snapshot);
    this.applyParticipants(reconciled.participants);
    this.applyLockSnapshot(reconciled.locks);
    this.applyVoiceSnapshot(reconciled.voiceMembers);
  }

  private applyParticipants(nextParticipants: ServerParticipant[]): void {
    const next = new Map(nextParticipants.map((participant) => [participant.connectionId, participant]));
    for (const previous of this.participants.values()) {
      if (previous.connectionId === this.selfConnectionId || next.has(previous.connectionId)) continue;
      const voice = this.voiceMemberByConnection.get(previous.connectionId);
      if (voice) this.deliver(previous, "voice:leave", { callId: voice.callId });
      this.deliver(previous, "presence:leave", {});
      this.shareIdByConnection.delete(previous.connectionId);
      this.voiceMemberByConnection.delete(previous.connectionId);
      this.pendingVoiceByConnection.delete(previous.connectionId);
    }
    this.participants.clear();
    for (const participant of next.values()) this.participants.set(participant.connectionId, participant);
    for (const participant of next.values()) {
      if (participant.connectionId === this.selfConnectionId) continue;
      this.deliver(participant, "presence:heartbeat", {
        visibility: participant.state === "active" ? "active" : "idle",
        pageId: participant.pageId,
      });
      this.replayPendingVoiceForParticipant(participant);
    }
  }

  private applyLockSnapshot(locks: ServerLock[]): void {
    const nextKeys = new Set(locks.map((lock) => JSON.stringify([lock.resourceId, lock.leaseId])));
    for (const current of this.locksByResource.values()) {
      if (!nextKeys.has(JSON.stringify([current.resourceId, current.leaseId]))) {
        this.applyAuthoritativeRelease(current.resourceId, current.leaseId);
      }
    }
    for (const lock of locks) this.applyAuthoritativeLock(lock);
  }

  private applyAuthoritativeLock(lock: ServerLock): void {
    const owner = this.participants.get(lock.ownerConnectionId);
    if (!owner) return;
    const leaseUntil = Date.parse(lock.expiresAt);
    if (!Number.isFinite(leaseUntil) || leaseUntil <= this.now()) return;
    const previous = this.locksByResource.get(lock.resourceId);
    this.locksByResource.set(lock.resourceId, lock);
    if (
      previous?.leaseId === lock.leaseId &&
      previous.ownerConnectionId === lock.ownerConnectionId &&
      previous.expiresAt === lock.expiresAt
    ) {
      return;
    }
    const participant =
      owner.connectionId === this.selfConnectionId
        ? this.context.participant
        : publicParticipant(owner);
    const authoritative: StudioLiveAuthoritativeLockEvent = {
      action: "acquired",
      resource: lock.resourceId,
      claimId: lock.leaseId,
      owner: participant,
      leaseUntil,
    };
    this.emitControl({ type: "lock", lock: authoritative });
  }

  private applyAuthoritativeRelease(resource: string, claimId: string): void {
    const current = this.locksByResource.get(resource);
    if (!current || current.leaseId !== claimId) return;
    this.locksByResource.delete(resource);
    this.emitControl({
      type: "lock",
      lock: { action: "released", resource, claimId },
    });
  }

  private validTarget(targetSessionId: string | null): string | null {
    if (
      !targetSessionId ||
      targetSessionId === this.selfConnectionId ||
      !this.participants.has(targetSessionId)
    ) {
      return null;
    }
    return targetSessionId;
  }

  private remoteParticipant(connectionId: string): ServerParticipant | null {
    if (connectionId === this.selfConnectionId) return null;
    return this.participants.get(connectionId) ?? null;
  }

  private screenRelay(
    value: unknown,
    requireLabel: boolean
  ): { participant: ServerParticipant; shareId: string; label: string } | null {
    if (
      !isRecord(value) ||
      !safeString(value.fromConnectionId, 128) ||
      !safeString(value.shareId, 160) ||
      (requireLabel && !safeString(value.label, 80))
    ) {
      return null;
    }
    const participant = this.remoteParticipant(value.fromConnectionId);
    if (!participant) return null;
    return {
      participant,
      shareId: value.shareId,
      label: requireLabel && typeof value.label === "string" ? value.label : "작업 화면",
    };
  }

  private deliver<K extends StudioLiveMessageKind>(
    sender: ServerParticipant,
    kind: K,
    payload: StudioLivePayloadMap[K],
    targetSessionId: string | null = null
  ): void {
    if (!this.ready || sender.connectionId === this.selfConnectionId) return;
    const previous = this.sequenceByConnection.get(sender.connectionId) ?? 0;
    if (previous >= Number.MAX_SAFE_INTEGER) return;
    const sequence = previous + 1;
    this.sequenceByConnection.set(sender.connectionId, sequence);
    try {
      const envelope = createStudioLiveEnvelope({
        workId: this.context.workId,
        sender: publicParticipant(sender),
        sentAt: this.now(),
        sequence,
        kind,
        targetSessionId,
        payload,
      });
      for (const listener of this.listeners) listener(envelope);
    } catch {
      this.emitStatus({
        state: "error",
        message: "팀 서버에서 받은 공동작업 신호를 안전하게 처리하지 못했습니다.",
        recoverable: true,
      });
    }
  }

  private isCurrentVoiceAdmission(pending: PendingVoiceAdmission): boolean {
    return (
      this.pendingVoiceAdmission === pending &&
      !this.closed &&
      this.ready &&
      pending.joinGeneration === this.joinGeneration &&
      pending.selfConnectionId === this.selfConnectionId &&
      pending.intentGeneration === this.voiceIntentGeneration &&
      pending.callId === this.desiredVoiceCallId
    );
  }

  private isAuthorizedVoiceAttempt(pending: PendingVoiceAdmission): boolean {
    const selfVoice = this.voiceMemberByConnection.get(pending.selfConnectionId);
    return (
      !this.closed &&
      this.ready &&
      pending.joinGeneration === this.joinGeneration &&
      pending.selfConnectionId === this.selfConnectionId &&
      pending.intentGeneration === this.voiceIntentGeneration &&
      pending.callId === this.desiredVoiceCallId &&
      selfVoice?.callId === pending.callId
    );
  }

  private queuePendingVoiceSignal(
    pending: PendingVoiceAdmission,
    signal: PendingVoiceSignal
  ): boolean {
    if (!this.isCurrentVoiceAdmission(pending)) return false;
    if (pending.signals.length >= MAX_PENDING_VOICE_SIGNALS) {
      this.rejectPendingVoiceAdmission(
        pending,
        "음성 연결 신호가 너무 많이 대기해 참가를 안전하게 취소했습니다. 다시 참가해 주세요."
      );
      return false;
    }
    pending.signals.push(signal);
    return true;
  }

  private completePendingVoiceAdmission(
    pending: PendingVoiceAdmission,
    value: unknown
  ): void {
    if (!this.isCurrentVoiceAdmission(pending)) {
      this.cancelTimeout(pending.timeout);
      if (
        this.desiredVoiceCallId !== pending.callId &&
        this.voiceMemberByConnection.get(pending.selfConnectionId)?.callId !== pending.callId
      ) {
        this.bestEffortVoiceLeave(pending.callId);
      }
      return;
    }

    const failure = parseFailure(value);
    if (failure) {
      this.rejectPendingVoiceAdmission(pending, failure.message);
      this.handleFailure(failure, "operation");
      return;
    }
    if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
      const message = "팀 서버의 음성 참가 응답을 확인하지 못했습니다.";
      this.rejectPendingVoiceAdmission(pending, message);
      this.emitStatus({ state: "error", message, recoverable: true });
      return;
    }
    let ackMembers: ServerVoiceMember[] | null = [];
    if (value.data.members !== undefined) {
      if (!Array.isArray(value.data.members)) {
        ackMembers = null;
      } else {
        const parsed = value.data.members.map(parseVoiceMember);
        ackMembers = parsed.some((member) => member === null)
          ? null
          : parsed as ServerVoiceMember[];
      }
    }
    if (!ackMembers) {
      const message = "팀 서버의 음성 참가자 목록이 올바르지 않습니다.";
      this.rejectPendingVoiceAdmission(pending, message);
      this.emitStatus({ state: "error", message, recoverable: true });
      return;
    }

    this.cancelTimeout(pending.timeout);
    this.pendingVoiceAdmission = null;
    this.voiceMemberByConnection.set(pending.selfConnectionId, {
      connectionId: pending.selfConnectionId,
      callId: pending.callId,
      muted: pending.muted,
    });
    if (ackMembers.length > 0) this.applyVoiceSnapshot(ackMembers, pending.callId);
    // The admission ACK can describe the mute bit supplied with the original join request while a
    // newer local toggle was queued. Keep the latest local intent, then publish it authoritatively.
    this.voiceMemberByConnection.set(pending.selfConnectionId, {
      connectionId: pending.selfConnectionId,
      callId: pending.callId,
      muted: pending.muted,
    });

    if (pending.muted !== pending.initialMuted) {
      this.emitWithAck(
        "studio:voice:state",
        {
          workId: this.context.workId,
          callId: pending.callId,
          muted: pending.muted,
        },
        undefined,
        (message) => this.rejectSelfVoice(pending.callId, message)
      );
    }
    if (!this.isAuthorizedVoiceAttempt(pending)) {
      pending.signals.length = 0;
      return;
    }
    const signals = pending.signals.splice(0);
    for (const signal of signals) {
      if (!this.isAuthorizedVoiceAttempt(pending)) break;
      const targetVoice = this.voiceMemberByConnection.get(signal.targetConnectionId);
      if (signal.callId !== pending.callId || targetVoice?.callId !== pending.callId) continue;
      this.emitWithAck("studio:voice:signal", signal.payload);
    }
  }

  private rejectPendingVoiceAdmission(
    pending: PendingVoiceAdmission,
    message: string,
    reason: "rejected" | "revoked" | "removed" = "rejected"
  ): void {
    if (this.pendingVoiceAdmission !== pending) return;
    this.cancelTimeout(pending.timeout);
    this.pendingVoiceAdmission = null;
    pending.signals.length = 0;
    ++this.voiceIntentGeneration;
    if (this.desiredVoiceCallId === pending.callId) this.desiredVoiceCallId = null;
    if (this.voiceMemberByConnection.get(pending.selfConnectionId)?.callId === pending.callId) {
      this.voiceMemberByConnection.delete(pending.selfConnectionId);
    }
    this.emitControl({
      type: "voice-removed",
      callId: pending.callId,
      reason,
      message,
    });
    this.bestEffortVoiceLeave(pending.callId);
  }

  private cancelPendingVoiceAdmission(options: {
    emitRemoval: boolean;
    preserveIntent: boolean;
    sendLeave: boolean;
    reason?: "rejected" | "revoked" | "removed";
    message?: string;
  }): void {
    const pending = this.pendingVoiceAdmission;
    if (!pending) return;
    this.cancelTimeout(pending.timeout);
    this.pendingVoiceAdmission = null;
    pending.signals.length = 0;
    ++this.voiceIntentGeneration;
    if (!options.preserveIntent && this.desiredVoiceCallId === pending.callId) {
      this.desiredVoiceCallId = null;
    }
    if (this.voiceMemberByConnection.get(pending.selfConnectionId)?.callId === pending.callId) {
      this.voiceMemberByConnection.delete(pending.selfConnectionId);
    }
    if (options.emitRemoval) {
      this.emitControl({
        type: "voice-removed",
        callId: pending.callId,
        reason: options.reason ?? "removed",
        message: options.message ?? "음성 작업실 참가가 취소되었습니다.",
      });
    }
    if (options.sendLeave) this.bestEffortVoiceLeave(pending.callId);
  }

  private terminateVoiceIntent(
    reason: "rejected" | "revoked" | "removed",
    message: string
  ): void {
    const pending = this.pendingVoiceAdmission;
    const selfConnectionId = this.selfConnectionId;
    const current = selfConnectionId
      ? this.voiceMemberByConnection.get(selfConnectionId)
      : null;
    const callId = pending?.callId ?? current?.callId ?? this.desiredVoiceCallId;
    if (pending) {
      this.cancelPendingVoiceAdmission({
        emitRemoval: false,
        preserveIntent: false,
        sendLeave: false,
      });
    } else {
      ++this.voiceIntentGeneration;
      this.desiredVoiceCallId = null;
    }
    if (selfConnectionId && current) this.voiceMemberByConnection.delete(selfConnectionId);
    if (!callId) return;
    this.emitControl({ type: "voice-removed", callId, reason, message });
    this.bestEffortVoiceLeave(callId);
  }

  private bestEffortVoiceLeave(callId: string): void {
    if (!this.socket.connected) return;
    this.socket.emit("studio:voice:leave", { workId: this.context.workId, callId });
  }

  private emitWithAck(
    event: string,
    payload: Record<string, unknown>,
    onSuccess?: (data: unknown) => void,
    onFailure?: (message: string) => void
  ): void {
    const generation = this.joinGeneration;
    const selfConnectionId = this.selfConnectionId;
    this.socket.emit(event, payload, (value: unknown) => {
      if (
        this.closed ||
        !this.ready ||
        generation !== this.joinGeneration ||
        selfConnectionId !== this.selfConnectionId
      ) {
        return;
      }
      const failure = parseFailure(value);
      if (failure) {
        onFailure?.(failure.message);
        this.handleFailure(failure, "operation");
        return;
      }
      if (!isRecord(value) || value.ok !== true) {
        const message = "팀 서버 응답을 확인하지 못했습니다.";
        onFailure?.(message);
        this.emitStatus({
          state: "error",
          message,
          recoverable: true,
        });
        return;
      }
      onSuccess?.(value.data);
    });
  }

  private rejectSelfVoice(callId: string, message: string): void {
    const connectionId = this.selfConnectionId;
    if (!connectionId) return;
    const current = this.voiceMemberByConnection.get(connectionId);
    if (!current || current.callId !== callId) return;
    ++this.voiceIntentGeneration;
    if (this.desiredVoiceCallId === callId) this.desiredVoiceCallId = null;
    this.voiceMemberByConnection.delete(connectionId);
    this.emitControl({
      type: "voice-removed",
      callId,
      reason: "rejected",
      message,
    });
    // The server may have accepted a membership before a later ACK path failed. Best-effort leave
    // prevents an adapter-visible ghost while the local fail-safe immediately stops microphone use.
    this.socket.emit("studio:voice:leave", { workId: this.context.workId, callId });
  }

  private emitCrdtWithAck<T>(
    event: "studio:crdt:sync" | "studio:crdt:update",
    payload: StudioCrdtSyncRequest | StudioCrdtUpdateRequest,
    parse: (value: unknown, options: { expectedWorkId: string }) => T | null
  ): Promise<T> {
    if (!this.ready) {
      return Promise.reject(createStudioCrdtRetryableError(
        "disconnected",
        "팀 CRDT 연결이 준비되지 않았습니다.",
        "connection"
      ));
    }
    const generation = this.joinGeneration;
    const selfConnectionId = this.selfConnectionId;
    return new Promise<T>((resolve, reject) => {
      const operation = {
        reject,
        timeout: null as unknown,
      };
      this.pendingCrdtOperations.add(operation);
      operation.timeout = this.scheduleTimeout(() => {
        if (!this.pendingCrdtOperations.delete(operation)) return;
        const error = createStudioCrdtRetryableError(
          "timeout",
          "팀 서버의 CRDT 응답 시간이 초과되었습니다.",
          "timeout"
        );
        this.emitStatus({ state: "error", message: error.message, recoverable: true });
        reject(error);
      }, CRDT_ACK_TIMEOUT_MS);
      this.socket.emit(event, payload, (value: unknown) => {
        if (!this.pendingCrdtOperations.delete(operation)) return;
        this.cancelTimeout(operation.timeout);
        if (
          this.closed ||
          !this.ready ||
          generation !== this.joinGeneration ||
          selfConnectionId !== this.selfConnectionId
        ) {
          reject(createStudioCrdtRetryableError(
            "connection_changed",
            "연결이 변경되어 CRDT 작업을 다시 시도해야 합니다.",
            "connection"
          ));
          return;
        }
        const failure = parseFailure(value);
        if (failure) {
          this.handleFailure(failure, "operation");
          reject(createStudioCrdtServerAckError(failure.code, failure.message));
          return;
        }
        if (!isRecord(value) || value.ok !== true) {
          const error = createStudioCrdtPermanentError(
            "invalid_response",
            "팀 서버의 CRDT 응답을 확인하지 못했습니다.",
            "server-response"
          );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          reject(error);
          return;
        }
        const parsed = parse(value.data, { expectedWorkId: this.context.workId });
        if (!parsed) {
          const error = createStudioCrdtPermanentError(
            "invalid_response",
            "팀 서버의 CRDT 응답 형식이 올바르지 않습니다.",
            "server-response"
          );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          reject(error);
          return;
        }
        const responseMatchesRequest = event === "studio:crdt:sync"
          ? (parsed as unknown as StudioCrdtSyncResponse).requestId
            === (payload as StudioCrdtSyncRequest).requestId
          : (parsed as unknown as StudioCrdtUpdateAck).updateId
            === (payload as StudioCrdtUpdateRequest).updateId;
        if (!responseMatchesRequest) {
          const error = createStudioCrdtPermanentError(
            "response_mismatch",
            "팀 서버의 CRDT 응답 식별자가 요청과 일치하지 않습니다.",
            "server-response"
          );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
  }

  private emitCrdt(message: StudioCrdtTransportMessage): void {
    for (const listener of this.crdtListeners) {
      try {
        listener(message);
      } catch {
        // One document binding cannot interrupt socket cleanup or other CRDT subscribers.
      }
    }
  }

  private rememberCrdtUpdateId(updateId: string): void {
    if (this.seenCrdtUpdateIds.has(updateId)) return;
    this.seenCrdtUpdateIds.add(updateId);
    if (this.seenCrdtUpdateIds.size <= MAX_SEEN_CRDT_UPDATE_IDS) return;
    const oldest = this.seenCrdtUpdateIds.values().next().value;
    if (typeof oldest === "string") this.seenCrdtUpdateIds.delete(oldest);
  }

  private rejectPendingCrdtOperations(error: StudioCrdtOperationError): void {
    for (const operation of this.pendingCrdtOperations) {
      this.cancelTimeout(operation.timeout);
      operation.reject(error);
    }
    this.pendingCrdtOperations.clear();
  }

  private emitStatus(status: StudioLiveTransportStatus): void {
    this.emitControl({ type: "status", status });
  }

  private emitControl(event: StudioLiveTransportControlEvent): void {
    for (const listener of this.controlListeners) {
      try {
        listener(event);
      } catch {
        // A broken UI subscriber cannot retain a socket or interrupt access-revocation cleanup.
      }
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeout !== null) this.cancelTimeout(this.connectTimeout);
    this.connectTimeout = null;
  }

  private clearConnectDeferred(): void {
    this.connectPromise = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }
}

export function createStudioServerLiveTransportFactory(
  sessionToken: string,
  dependencies: StudioLiveSocketTransportDependencies = {}
): StudioLiveTransportFactory {
  return (context) => new StudioLiveSocketTransport(context, sessionToken, dependencies);
}
