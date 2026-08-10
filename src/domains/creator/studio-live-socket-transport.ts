import { io } from "socket.io-client";

import {
  createStudioCrdtBinarySelectionRequest,
  createStudioCrdtBinarySyncRequest,
  createStudioCrdtBinaryUpdateRequest,
  parseStudioCrdtBinaryRemoteUpdate,
  parseStudioCrdtBinarySelection,
  parseStudioCrdtBinarySyncResponse,
  parseStudioCrdtBinaryUpdateAck,
  STUDIO_CRDT_BINARY_WIRE_FORMAT,
  STUDIO_CRDT_LEGACY_WIRE_FORMAT,
  STUDIO_LIVE_CRDT_BINARY_REMOTE_EVENT,
  STUDIO_LIVE_CRDT_BINARY_SYNC_EVENT,
  STUDIO_LIVE_CRDT_BINARY_UPDATE_EVENT,
  STUDIO_LIVE_CRDT_WIRE_SELECT_EVENT,
  type StudioCrdtWireFormat,
} from "./studio-crdt-binary-wire";
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
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,
  STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
  STUDIO_LIVE_LOCK_REVISION_VERSION,
  STUDIO_LIVE_RESOURCE_MAX_LENGTH,
  STUDIO_LIVE_SDP_MID_MAX_LENGTH,
  STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
  createStudioLiveEnvelope,
  studioLiveStringFitsByteContract,
  type StudioLiveEnvelope,
  type StudioLiveLockAcquireResult,
  type StudioLiveLockReleaseRequest,
  type StudioLiveLockReleaseResult,
  type StudioLiveLockRequest,
  type StudioLiveMessageKind,
  type StudioLivePayloadMap,
  type StudioLiveScreenAccessPayload,
  type StudioLiveVoiceIcePayload,
  type StudioLiveWebRtcIcePayload,
} from "./studio-live-collaboration-protocol";
import {
  createStudioLocalLiveTransport,
  type StudioLiveAuthoritativeLockEvent,
  type StudioLiveTransport,
  type StudioLiveTransportContext,
  type StudioLiveTransportControlEvent,
  type StudioLiveTransportFactory,
  type StudioLiveTransportStatus,
} from "./studio-live-collaboration-transport";
import {
  createStudioCloudflarePurposeRoutedLiveTransportFactory,
} from "./studio-live-purpose-routed-transport";
import { resolveStudioLiveSocketEndpoint } from "./studio-live-socket-endpoint";
import {
  isRecord,
  nullableString,
  parseActiveScreenShare,
  parseFailure,
  parseJoinAck,
  parseLock,
  parseLockRevision,
  parseParticipant,
  parseVoiceMember,
  publicParticipant,
  safeIdentifier,
  safeSdpString,
  safeString,
  type ServerFailure,
  type ServerActiveScreenShare,
  type ServerJoinSnapshot,
  type ServerLock,
  type StudioLiveLockRevision,
  type ServerParticipant,
  type ServerVoiceMember,
} from "./studio-live-socket-wire";
import {
  resolveStudioCloudflareRealtimeOrigin,
} from "./studio-realtime-provider-cloudflare-adapter";
import { parseStudioTeamCommentLiveEvent } from "./studio-team-comment-live-event";

import { studioLiveLockResourcesConflict } from "@/lib/studio-live-lock-resource";

const SOCKET_PATH = "/socket.io";
const CONNECT_TIMEOUT_MS = 15_000;
const CRDT_ACK_TIMEOUT_MS = 10_000;
const CRDT_WIRE_SELECT_ACK_TIMEOUT_MS = 8_000;
const LOCK_ACK_TIMEOUT_MS = 10_000;
const VOICE_JOIN_ACK_TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_SEEN_CRDT_UPDATE_IDS = 4_096;
const MAX_PENDING_PRESENCE_CONNECTIONS = 2_048;
const MAX_PENDING_SCREEN_CONNECTIONS = 256;
const MAX_PENDING_VOICE_CONNECTIONS = 256;
const MAX_PENDING_LOCK_DELTAS = 512;
const MAX_PENDING_VOICE_SIGNALS = 256;
const MAX_ABANDONED_LOCK_ACQUISITIONS = 512;
const MAX_LOCK_REVISION_WATERMARKS = 1_024;
const MAX_CANONICAL_SESSION_TOMBSTONES = 2_048;
const ABANDONED_LOCK_ACQUISITION_TTL_MS = 90_000;
const JOIN_RESYNC_RETRY_BASE_MS = 500;
const JOIN_RESYNC_RETRY_MAX_MS = 10_000;
const JOIN_RATE_LIMIT_RETRY_MS = 60_000;
const DEFAULT_STUDIO_REALTIME_PROVIDER_ID = "cloudflare-realtime-v1";
const STUDIO_REALTIME_PROVIDER_ID =
  /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

/**
 * Bounded retries still cover a free container's cold start. Production never constructs this
 * socket without an explicit long-running origin, so the larger window cannot revive the old
 * Vercel-serverless reconnect loop.
 */
export const STUDIO_LIVE_SOCKET_RETRY_POLICY = Object.freeze({
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 8_000,
  randomizationFactor: 0.25,
  timeout: CONNECT_TIMEOUT_MS,
});

type PendingPresenceDelta =
  | { kind: "update"; participant: ServerParticipant }
  | { kind: "leave"; connectionId: string };

type PendingVoiceDelta =
  | { kind: "update"; member: ServerVoiceMember }
  | { kind: "leave"; connectionId: string; callId: string };

type PendingScreenDelta =
  | { kind: "update"; share: ServerActiveScreenShare }
  | { kind: "stop"; connectionId: string; shareId: string };

type PendingLockDelta =
  | {
      kind: "acquired";
      lock: ServerLock;
      requestId?: string;
      revision?: StudioLiveLockRevision;
    }
  | {
      kind: "release";
      action: "released" | "expired" | "revoked";
      resourceId: string;
      leaseId: string;
      releaseRequestId: string | null;
      revision?: StudioLiveLockRevision;
    };

type LockRevisionFamily = "acquired" | "destructive";

interface LockRevisionWatermark {
  revision: StudioLiveLockRevision;
  family: LockRevisionFamily;
  acquiredFingerprint?: string;
  /** Latest acquire proof retained even after this exact resource is later released. */
  conflictAcquiredRevision?: StudioLiveLockRevision;
  conflictOwnerConnectionId?: string;
}

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

interface PendingLockAcquisition {
  request: StudioLiveLockRequest;
  joinGeneration: number;
  selfConnectionId: string;
  promise: Promise<StudioLiveLockAcquireResult>;
  resolve: (result: StudioLiveLockAcquireResult) => void;
  timeout: unknown;
}

interface AbandonedLockAcquisition {
  requestId: string;
  resource: string;
  joinGeneration: number;
  selfConnectionId: string;
  discardAt: number;
}

interface DeferredSelfLock {
  lock: ServerLock;
  /** Exact abandoned lifecycle when the authoritative update carried request correlation. */
  abandonedRequestId: string | null;
}

interface PendingLockRelease {
  request: StudioLiveLockReleaseRequest;
  joinGeneration: number;
  selfConnectionId: string;
  promise: Promise<StudioLiveLockReleaseResult>;
  resolve: (result: StudioLiveLockReleaseResult) => void;
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
  /**
   * Refreshes the short-lived Socket.IO admission credential in memory after an
   * unauthenticated handshake. It must never return the browser's web-session
   * cookie or persist the returned credential.
   */
  refreshSocketCredential?: () => Promise<string>;
  /**
   * Test/deployment seam. `null` explicitly keeps collaboration local without
   * constructing Socket.IO; omitted uses the environment/location policy.
   */
  socketEndpoint?: string | null;
  createLocalTransport?: StudioLiveTransportFactory;
  now?: () => number;
  randomId?: () => string;
  setTimeout?: (handler: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  voiceJoinAckTimeoutMs?: number;
  lockAckTimeoutMs?: number;
}

export interface StudioLiveSocketRuntimeEnvironment {
  readonly explicitOrigin?: string | null;
  readonly locationOrigin?: string | null;
  readonly development?: boolean;
  /**
   * Vite's same-origin Socket.IO proxy is intentionally opt-in. A development build alone is not
   * proof that the proxy exists (production-preview harnesses also execute Vite output locally).
   */
  readonly devProxyEnabled?: boolean;
}

function nonBlank(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/**
 * Runtime admission policy for Socket.IO. Missing configuration is a deliberate local-only mode,
 * never an instruction to probe the current static/Vercel origin and start a reconnect loop.
 */
export function resolveStudioLiveSocketRuntimeEndpoint(
  environment: StudioLiveSocketRuntimeEnvironment,
): string | null {
  const explicitOrigin = nonBlank(environment.explicitOrigin);
  if (explicitOrigin) {
    try {
      const url = new URL(explicitOrigin);
      if (url.pathname !== "/" || url.search || url.hash) return null;
    } catch {
      // Relative Vite/API paths are not proof of a long-running realtime origin.
      return null;
    }
    return resolveStudioLiveSocketEndpoint({
      explicitOrigin,
      locationOrigin: environment.locationOrigin,
      allowInsecureLoopback: environment.development === true,
      localDevelopment: environment.development === true,
    });
  }

  if (environment.development === true && environment.devProxyEnabled === true) {
    return "/studio-live";
  }
  return null;
}

function runtimeSocketEndpoint(): string | null {
  return resolveStudioLiveSocketRuntimeEndpoint({
    explicitOrigin:
      import.meta.env.VITE_STUDIO_LIVE_ORIGIN ||
      import.meta.env.VITE_STUDIO_REALTIME_ORIGIN,
    locationOrigin: globalThis.location?.origin,
    development: import.meta.env.DEV,
    devProxyEnabled:
      import.meta.env.VITE_STUDIO_LIVE_DEV_PROXY_ENABLED === "true",
  });
}

export interface StudioRealtimePurposeRoutingEnvironment {
  readonly realtimeOrigin?: string;
  readonly providerId?: string;
}

function resolveStudioRealtimeProviderId(
  value: string | null | undefined,
): string | null {
  const providerId = value?.trim() || DEFAULT_STUDIO_REALTIME_PROVIDER_ID;
  return STUDIO_REALTIME_PROVIDER_ID.test(providerId) ? providerId : null;
}

/**
 * Activates the purpose-specific Cloudflare data plane only for an exact HTTPS origin. Missing or
 * malformed browser configuration leaves the proven primary transport untouched. The ticket
 * endpoint intentionally remains the same trusted API base so its HttpOnly cookie and CSRF
 * boundary cannot be redirected to a runtime-configured third-party origin.
 */
export function applyStudioRealtimePurposeRouting(
  primaryFactory: StudioLiveTransportFactory,
  environment: StudioRealtimePurposeRoutingEnvironment,
): StudioLiveTransportFactory {
  const realtimeOrigin = resolveStudioCloudflareRealtimeOrigin(
    environment.realtimeOrigin,
  );
  const providerId = resolveStudioRealtimeProviderId(environment.providerId);
  if (!realtimeOrigin || !providerId) return primaryFactory;
  return (context) => {
    const primary = primaryFactory(context);
    // A browser-local BroadcastChannel cannot provide remote CRDT/locks/chat authority. Wrapping
    // it with remote presence would advertise collaborators the document path can never reach.
    if (primary.mode !== "server") return primary;
    return createStudioCloudflarePurposeRoutedLiveTransportFactory({
      primaryFactory: () => primary,
      realtimeOrigin,
      providerId,
    })(context);
  };
}

function createSocketAtEndpoint(
  endpoint: string,
  auth: { sessionToken: string },
): StudioLiveSocketLike {
  return io(
    endpoint,
    {
      path: SOCKET_PATH,
      transports: ["websocket"],
      autoConnect: false,
      ...STUDIO_LIVE_SOCKET_RETRY_POLICY,
      auth,
    }
  ) as unknown as StudioLiveSocketLike;
}

function defaultCreateSocket(auth: { sessionToken: string }): StudioLiveSocketLike {
  const endpoint = runtimeSocketEndpoint();
  if (!endpoint) {
    throw new Error(
      "실시간 서버가 구성되지 않아 네트워크 연결 대신 로컬 공동작업을 사용해야 합니다.",
    );
  }
  return createSocketAtEndpoint(endpoint, auth);
}

function defaultSetTimeout(handler: () => void, delay: number): unknown {
  return globalThis.setTimeout(handler, delay);
}

function defaultClearTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function defaultRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("보안 잠금 요청 식별자를 생성할 수 없습니다.");
  }
  return globalThis.crypto.randomUUID();
}

function eventMessage(error: unknown, fallback: string): string {
  let rawMsg = "";
  if (error instanceof Error && error.message.trim()) rawMsg = error.message;
  else if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    rawMsg = error.message;
  }
  if (rawMsg.includes("503") || rawMsg.toLowerCase().includes("service unavailable")) {
    return "실시간 서버를 준비 중이거나 점검 상태입니다. 캔버스 편집은 지속되며 잠시 후 자동 연결됩니다.";
  }
  if (rawMsg.toLowerCase().includes("xhr poll error") || rawMsg.toLowerCase().includes("websocket error")) {
    return "팀 네트워크 연결이 원활하지 않습니다. 작업 내용은 지속적으로 보존되며 자동 재연결을 시도합니다.";
  }
  return rawMsg ? rawMsg.slice(0, 500) : fallback;
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

function parseScreenAnnouncement(value: unknown): ServerActiveScreenShare | null {
  if (!isRecord(value)) return null;
  return parseActiveScreenShare({
    connectionId: value.fromConnectionId,
    shareId: value.shareId,
    label: value.label,
  });
}

function parseScreenStop(
  value: unknown
): { connectionId: string; shareId: string } | null {
  if (
    !isRecord(value) ||
    !safeIdentifier(value.fromConnectionId, 128) ||
    !safeIdentifier(value.shareId, 160)
  ) {
    return null;
  }
  return { connectionId: value.fromConnectionId, shareId: value.shareId };
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
  private readonly randomId: () => string;
  private readonly scheduleTimeout: (handler: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly voiceJoinAckTimeoutMs: number;
  private readonly lockAckTimeoutMs: number;
  private readonly refreshSocketCredential?: () => Promise<string>;
  private readonly listeners = new Set<(value: unknown) => void>();
  private readonly controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  private readonly crdtListeners = new Set<(message: StudioCrdtTransportMessage) => void>();
  private readonly seenCrdtUpdateIds = new Set<string>();
  private readonly pendingCrdtPublishes = new Map<string, Promise<StudioCrdtUpdateAck>>();
  private readonly pendingCrdtOperations = new Set<{
    reject: (error: Error) => void;
    timeout: unknown;
  }>();
  private readonly pendingLockAcquisitions = new Map<string, PendingLockAcquisition>();
  private readonly pendingLockRequestByResource = new Map<string, string>();
  private readonly pendingLockReleases = new Map<string, PendingLockRelease>();
  private readonly pendingLockReleaseByRequestId = new Map<string, PendingLockRelease>();
  private readonly deferredSelfLocks = new Map<string, DeferredSelfLock>();
  private readonly abandonedLockAcquisitions = new Map<string, AbandonedLockAcquisition>();
  private readonly abandonedLockRequestIdsByResource = new Map<string, Set<string>>();
  private readonly participants = new Map<string, ServerParticipant>();
  /**
   * Socket connection ids are intentionally short-lived, while Studio room identity is the
   * authenticated client-instance id. Keep a bounded bridge (including recent leave tombstones)
   * so a hybrid provider can merge Socket.IO and purpose-provider events without rendering one
   * person twice or losing a final leave event after the participant map is pruned.
   */
  private readonly canonicalSessionByConnection = new Map<string, string>();
  private readonly activeConnectionsByCanonicalSession = new Map<
    string,
    Set<string>
  >();
  private readonly sequenceByConnection = new Map<string, number>();
  private readonly activeScreenShareByConnection = new Map<
    string,
    ServerActiveScreenShare
  >();
  private readonly shareIdByConnection = new Map<string, string>();
  private readonly voiceMemberByConnection = new Map<string, ServerVoiceMember>();
  private readonly locksByResource = new Map<string, ServerLock>();
  private readonly lockRevisionByResource = new Map<string, LockRevisionWatermark>();
  private readonly pendingPresenceByConnection = new Map<string, PendingPresenceDelta>();
  private readonly pendingScreenByConnection = new Map<string, PendingScreenDelta>();
  private readonly pendingVoiceByConnection = new Map<string, PendingVoiceDelta>();
  private readonly pendingLockDeltas: PendingLockDelta[] = [];
  private pendingLockDeltaOverflowed = false;
  private sessionToken: string | null;
  private selfConnectionId: string | null = null;
  private pendingInitialSnapshot: ServerJoinSnapshot | null = null;
  private joined = false;
  private closed = false;
  private accessRevoked = false;
  private everJoined = false;
  private lockProtocolVersion = 1;
  private lockRevisionVersion: 0 | typeof STUDIO_LIVE_LOCK_REVISION_VERSION = 0;
  private lockSnapshotFloor: StudioLiveLockRevision | null = null;
  private maxCommittedLockRevision: StudioLiveLockRevision | null = null;
  private joinGeneration = 0;
  private voiceIntentGeneration = 0;
  private desiredVoiceCallId: string | null = null;
  private pendingVoiceAdmission: PendingVoiceAdmission | null = null;
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private connectTimeout: unknown = null;
  private joinRetryTimeout: unknown = null;
  private joinRetryAttempt = 0;
  private selectedCrdtWireFormat: StudioCrdtWireFormat | null = null;
  private crdtWireSelectionTimeout: unknown = null;
  private crdtReconnectTimeout: unknown = null;
  private credentialRefreshAttempted = false;
  private credentialRefreshPromise: Promise<void> | null = null;

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
    this.randomId = dependencies.randomId ?? defaultRandomId;
    this.scheduleTimeout = dependencies.setTimeout ?? defaultSetTimeout;
    this.cancelTimeout = dependencies.clearTimeout ?? defaultClearTimeout;
    this.refreshSocketCredential = dependencies.refreshSocketCredential;
    this.voiceJoinAckTimeoutMs = Math.min(
      30_000,
      Math.max(
        100,
        Math.trunc(dependencies.voiceJoinAckTimeoutMs ?? VOICE_JOIN_ACK_TIMEOUT_MS)
      )
    );
    this.lockAckTimeoutMs = Math.min(
      30_000,
      Math.max(100, Math.trunc(dependencies.lockAckTimeoutMs ?? LOCK_ACK_TIMEOUT_MS))
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
    this.socket.on("studio:comment:changed", this.onTeamCommentChanged);
    this.socket.on("studio:crdt:sync", this.onCrdtSync);
    this.socket.on("studio:crdt:update", this.onCrdtUpdate);
    this.socket.on(STUDIO_LIVE_CRDT_BINARY_REMOTE_EVENT, this.onCrdtBinaryUpdate);
  }

  get ready(): boolean {
    return (
      !this.closed &&
      this.joined &&
      this.selectedCrdtWireFormat !== null &&
      this.socket.connected
    );
  }

  canonicalSessionId(transportSessionId: string): string {
    if (transportSessionId === this.context.participant.sessionId) {
      return transportSessionId;
    }
    if (transportSessionId === this.selfConnectionId) {
      return this.context.participant.sessionId;
    }
    const participant = this.participants.get(transportSessionId);
    if (participant) {
      this.rememberCanonicalSession(
        participant.connectionId,
        participant.clientInstanceId,
      );
      const active = this.activeConnectionsByCanonicalSession.get(
        participant.clientInstanceId,
      );
      return active?.size === 1 && active.has(participant.connectionId)
        ? participant.clientInstanceId
        : transportSessionId;
    }
    const canonical =
      this.canonicalSessionByConnection.get(transportSessionId);
    if (!canonical) return transportSessionId;
    const active = this.activeConnectionsByCanonicalSession.get(canonical);
    // A tombstoned connection may be canonicalized only after the last active connection for
    // that identity has left. Otherwise an older tab's leave could remove a newer active tab.
    return active && active.size > 0 ? transportSessionId : canonical;
  }

  transportSessionId(canonicalSessionId: string): string | null {
    if (canonicalSessionId === this.context.participant.sessionId) {
      return this.selfConnectionId;
    }
    if (this.participants.has(canonicalSessionId)) return canonicalSessionId;
    const active =
      this.activeConnectionsByCanonicalSession.get(canonicalSessionId);
    if (!active || active.size !== 1) return null;
    return active.values().next().value ?? null;
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
    if (this.selectedCrdtWireFormat === STUDIO_CRDT_BINARY_WIRE_FORMAT) {
      try {
        return this.emitCrdtWithAck(
          STUDIO_LIVE_CRDT_BINARY_SYNC_EVENT,
          createStudioCrdtBinarySyncRequest(parsed),
          parseStudioCrdtBinarySyncResponse,
          "requestId",
          true
        );
      } catch {
        return Promise.reject(createStudioCrdtPermanentError(
          "invalid_payload",
          "CRDT 상태 벡터를 바이너리 전송 형식으로 구성하지 못했습니다.",
          "client-validation"
        ));
      }
    }
    return this.emitCrdtWithAck(
      "studio:crdt:sync",
      parsed,
      parseStudioCrdtSyncResponse,
      "requestId"
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
    let operation: Promise<StudioCrdtUpdateAck>;
    if (this.selectedCrdtWireFormat === STUDIO_CRDT_BINARY_WIRE_FORMAT) {
      try {
        operation = this.emitCrdtWithAck(
          STUDIO_LIVE_CRDT_BINARY_UPDATE_EVENT,
          createStudioCrdtBinaryUpdateRequest(parsed),
          parseStudioCrdtBinaryUpdateAck,
          "updateId",
          true
        );
      } catch {
        return Promise.reject(createStudioCrdtPermanentError(
          "invalid_payload",
          "CRDT 업데이트를 바이너리 전송 형식으로 구성하지 못했습니다.",
          "client-validation"
        ));
      }
    } else {
      operation = this.emitCrdtWithAck(
        "studio:crdt:update",
        parsed,
        parseStudioCrdtUpdateAck,
        "updateId"
      );
    }
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

  acquireLock(request: StudioLiveLockRequest): Promise<StudioLiveLockAcquireResult> {
    if (
      !safeIdentifier(request.resource, STUDIO_LIVE_RESOURCE_MAX_LENGTH) ||
      !safeIdentifier(request.requestId, 160) ||
      (request.renewLeaseId !== undefined && !safeIdentifier(request.renewLeaseId, 80)) ||
      !Number.isInteger(request.leaseMs) ||
      request.leaseMs < 5_000 ||
      request.leaseMs > 30_000
    ) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        code: "invalid_request",
        message: "편집 잠금 요청이 올바르지 않습니다.",
      });
    }
    if (!this.ready || this.pendingInitialSnapshot || !this.selfConnectionId) {
      return Promise.resolve({
        status: "revoked",
        resource: request.resource,
        requestId: request.requestId,
        code: this.accessRevoked ? "access_revoked" : "not_ready",
        message: this.accessRevoked
          ? "팀 권한이 해제되어 편집 잠금을 요청할 수 없습니다."
          : "팀 공동작업 연결이 준비되지 않았습니다.",
      });
    }
    if (this.pendingLockReleases.has(request.resource)) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        code: "release_pending",
        message: "이 편집 영역의 이전 잠금을 해제하는 중입니다.",
      });
    }
    if (this.pendingLockReleaseByRequestId.has(request.requestId)) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        code: "duplicate_request_id",
        message: "같은 요청 식별자로 편집 잠금 해제가 이미 진행 중입니다.",
      });
    }
    this.pruneAbandonedLockAcquisitions();
    if (this.abandonedLockAcquisitions.has(request.requestId)) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        code: "duplicate_request_id",
        message: "응답이 지연된 이전 편집 잠금 요청 식별자는 다시 사용할 수 없습니다.",
      });
    }
    const duplicate = this.pendingLockAcquisitions.get(request.requestId);
    if (duplicate) {
      if (duplicate.request.resource === request.resource) return duplicate.promise;
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        code: "duplicate_request_id",
        message: "같은 편집 잠금 요청 식별자가 이미 사용 중입니다.",
      });
    }
    const pendingRequestId = this.pendingLockRequestByResource.get(request.resource);
    if (pendingRequestId) {
      const pending = this.pendingLockAcquisitions.get(pendingRequestId);
      if (pending) {
        return Promise.resolve({
          status: "denied",
          resource: request.resource,
          requestId: request.requestId,
          code: "duplicate_resource_request",
          message: "같은 편집 영역의 잠금 요청이 이미 진행 중입니다.",
        });
      }
      this.pendingLockRequestByResource.delete(request.resource);
    }

    let resolveResult!: (result: StudioLiveLockAcquireResult) => void;
    const promise = new Promise<StudioLiveLockAcquireResult>((resolve) => {
      resolveResult = resolve;
    });
    const pending: PendingLockAcquisition = {
      request: { ...request },
      joinGeneration: this.joinGeneration,
      selfConnectionId: this.selfConnectionId,
      promise,
      resolve: resolveResult,
      timeout: null,
    };
    this.pendingLockAcquisitions.set(request.requestId, pending);
    this.pendingLockRequestByResource.set(request.resource, request.requestId);
    pending.timeout = this.scheduleTimeout(() => {
      if (!this.removePendingLockAcquisition(pending)) return;
      const abandoned = this.rememberAbandonedLockAcquisition(pending);
      const deferred = this.deferredSelfLocks.get(request.resource);
      if (deferred) this.rollbackDeferredSelfLock(deferred, abandoned);
      pending.resolve({
        status: "timeout",
        resource: request.resource,
        requestId: request.requestId,
        message: "팀 서버의 편집 잠금 응답 시간이 초과되었습니다.",
      });
    }, this.lockAckTimeoutMs);

    try {
      this.socket.emit(
        "studio:lock:request",
        {
          workId: this.context.workId,
          resourceId: request.resource,
          requestId: request.requestId,
          ...(this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION
            ? {
                protocolVersion: STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
                ...(request.renewLeaseId ? { renewLeaseId: request.renewLeaseId } : {}),
              }
            : {}),
          leaseMs: request.leaseMs,
        },
        (value: unknown) => this.completePendingLockAcquisition(pending, value)
      );
    } catch (error) {
      if (this.removePendingLockAcquisition(pending)) {
        pending.resolve({
          status: "denied",
          resource: request.resource,
          requestId: request.requestId,
          code: "transport_error",
          message: eventMessage(error, "편집 잠금 요청을 보내지 못했습니다."),
        });
      }
    }
    return promise;
  }

  releaseLock(request: StudioLiveLockReleaseRequest): Promise<StudioLiveLockReleaseResult> {
    if (
      !safeIdentifier(request.resource, STUDIO_LIVE_RESOURCE_MAX_LENGTH) ||
      !safeIdentifier(request.requestId, 160) ||
      !safeIdentifier(request.claimId, 80)
    ) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "invalid_request",
        message: "편집 잠금 해제 요청이 올바르지 않습니다.",
      });
    }
    if (!this.ready || this.pendingInitialSnapshot || !this.selfConnectionId) {
      return Promise.resolve({
        status: "revoked",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: this.accessRevoked ? "access_revoked" : "not_ready",
        message: this.accessRevoked
          ? "팀 권한이 해제되어 편집 잠금을 해제할 수 없습니다."
          : "팀 공동작업 연결이 준비되지 않았습니다.",
      });
    }
    const duplicateRequest = this.pendingLockReleaseByRequestId.get(request.requestId);
    if (duplicateRequest) {
      if (
        duplicateRequest.request.resource === request.resource &&
        duplicateRequest.request.claimId === request.claimId
      ) return duplicateRequest.promise;
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "duplicate_request_id",
        message: "같은 편집 잠금 해제 요청 식별자가 이미 사용 중입니다.",
      });
    }
    const duplicate = this.pendingLockReleases.get(request.resource);
    if (duplicate) {
      if (
        duplicate.request.requestId === request.requestId &&
        duplicate.request.claimId === request.claimId
      ) return duplicate.promise;
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "release_pending",
        message: "이 편집 영역의 다른 잠금 해제가 이미 진행 중입니다.",
      });
    }
    if (this.pendingLockAcquisitions.has(request.requestId)) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "duplicate_request_id",
        message: "같은 요청 식별자로 편집 잠금 획득이 이미 진행 중입니다.",
      });
    }
    const current = this.locksByResource.get(request.resource);
    if (
      current &&
      (current.ownerConnectionId !== this.selfConnectionId || current.leaseId !== request.claimId)
    ) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "stale_claim",
        message: "이미 변경된 편집 잠금은 이전 임대로 해제할 수 없습니다.",
      });
    }

    let resolveResult!: (result: StudioLiveLockReleaseResult) => void;
    const promise = new Promise<StudioLiveLockReleaseResult>((resolve) => {
      resolveResult = resolve;
    });
    const pending: PendingLockRelease = {
      request: { ...request },
      joinGeneration: this.joinGeneration,
      selfConnectionId: this.selfConnectionId,
      promise,
      resolve: resolveResult,
      timeout: null,
    };
    this.pendingLockReleases.set(request.resource, pending);
    this.pendingLockReleaseByRequestId.set(request.requestId, pending);
    this.abandonPendingLockAcquisitionForRelease(request.resource);
    const releaseTimeoutMs = this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION
      ? this.lockAckTimeoutMs
      : Math.max(this.lockAckTimeoutMs, STUDIO_LIVE_LOCK_MAX_LEASE_MS + 250);
    pending.timeout = this.scheduleTimeout(() => {
      if (!this.removePendingLockRelease(pending)) return;
      this.applyAuthoritativeRelease(request.resource, request.claimId);
      pending.resolve({
        status: "timeout",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        message: "팀 서버의 편집 잠금 해제 응답 시간이 초과되었습니다.",
      });
    }, releaseTimeoutMs);

    try {
      this.socket.emit(
        "studio:lock:release",
        {
          workId: this.context.workId,
          resourceId: request.resource,
          leaseId: request.claimId,
          ...(this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION
            ? { requestId: request.requestId }
            : {}),
        },
        (value: unknown) => this.completePendingLockRelease(pending, value)
      );
    } catch (error) {
      if (this.removePendingLockRelease(pending)) {
        this.applyAuthoritativeRelease(request.resource, request.claimId);
        pending.resolve({
          status: "denied",
          resource: request.resource,
          requestId: request.requestId,
          claimId: request.claimId,
          code: "transport_error",
          message: eventMessage(error, "편집 잠금 해제 요청을 보내지 못했습니다."),
        });
      }
    }
    return promise;
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
          const cursorData: Record<string, unknown> = {
            workId: this.context.workId,
            pageId: payload.pageId,
            x: payload.x,
            y: payload.y,
          };
          if (payload.drawing !== undefined) {
            cursorData.drawing = payload.drawing;
            if (payload.tool !== undefined) cursorData.tool = payload.tool;
          }
          if (payload.strokeColor !== undefined) cursorData.strokeColor = payload.strokeColor;
          if (payload.strokeWidth !== undefined) cursorData.strokeWidth = payload.strokeWidth;
          if (payload.strokeOpacity !== undefined) cursorData.strokeOpacity = payload.strokeOpacity;
          if (payload.points !== undefined) cursorData.points = [...payload.points];
          this.emitWithAck("studio:cursor", cursorData);
          return true;
        }
        case "lock:claim": {
          const payload = envelope.payload as StudioLivePayloadMap["lock:claim"];
          const leaseMs = Math.max(5_000, Math.min(30_000, payload.leaseUntil - envelope.sentAt));
          const requestId = this.randomId();
          void this.acquireLock({
            resource: payload.resource,
            requestId,
            renewLeaseId: payload.claimId,
            leaseMs,
          });
          return true;
        }
        case "lock:release": {
          const payload = envelope.payload as StudioLivePayloadMap["lock:release"];
          const current = this.locksByResource.get(payload.resource);
          if (!current || current.leaseId !== payload.claimId) return false;
          void this.releaseLock({
            resource: payload.resource,
            requestId: payload.claimId,
            claimId: payload.claimId,
          });
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
    this.revokePendingLockReleases(
      "connection_closed",
      "팀 공동작업 연결이 종료되어 편집 잠금 해제 확인이 취소되었습니다."
    );
    this.revokePendingLockAcquisitions(
      "connection_closed",
      "팀 공동작업 연결이 종료되어 편집 잠금 요청이 취소되었습니다."
    );
    this.terminateVoiceIntent(
      "removed",
      "팀 공동작업 연결이 종료되어 음성 작업실에서 나갔습니다."
    );
    this.closed = true;
    ++this.joinGeneration;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.clearCrdtReconnectTimeout();
    this.clearJoinRetry(true);
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
    this.socket.off("studio:comment:changed", this.onTeamCommentChanged);
    this.socket.off("studio:crdt:sync", this.onCrdtSync);
    this.socket.off("studio:crdt:update", this.onCrdtUpdate);
    this.socket.off(STUDIO_LIVE_CRDT_BINARY_REMOTE_EVENT, this.onCrdtBinaryUpdate);
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
    this.canonicalSessionByConnection.clear();
    this.activeConnectionsByCanonicalSession.clear();
    this.sequenceByConnection.clear();
    this.activeScreenShareByConnection.clear();
    this.shareIdByConnection.clear();
    this.voiceMemberByConnection.clear();
    this.locksByResource.clear();
    this.clearLockRevisionState();
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    this.selfConnectionId = null;
  }

  private readonly onConnect = () => {
    if (!this.closed && !this.accessRevoked) {
      this.credentialRefreshAttempted = false;
      this.clearCrdtReconnectTimeout();
      this.clearJoinRetry(true);
      this.beginJoin();
    }
  };

  private readonly onConnectError = (error: unknown) => {
    const message = eventMessage(error, "팀 서버에 연결하지 못했습니다.");
    const code = connectErrorCode(error);
    if (
      code === "unauthenticated"
      && this.refreshSocketCredential
      && !this.credentialRefreshAttempted
    ) {
      this.credentialRefreshAttempted = true;
      this.refreshCredentialAfterAuthenticationError(message);
      return;
    }
    if (isTerminalConnectErrorCode(code)) {
      this.revokeFromConnectError(message);
      return;
    }
    if (!this.everJoined) {
      this.failInitialConnect(message);
      return;
    }
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.emitStatus({ state: "error", message, recoverable: true });
  };

  private refreshCredentialAfterAuthenticationError(fallbackMessage: string): void {
    if (
      this.credentialRefreshPromise
      || !this.refreshSocketCredential
      || this.closed
      || this.accessRevoked
    ) return;
    this.emitStatus({
      state: "connecting",
      message: "로그인 상태를 다시 확인하고 팀 서버에 재연결하는 중입니다.",
      recoverable: true,
    });
    this.credentialRefreshPromise = Promise.resolve()
      .then(() => this.refreshSocketCredential?.())
      .then((credential) => {
        if (this.closed || this.accessRevoked) return;
        if (!safeString(credential, MAX_TOKEN_LENGTH)) {
          throw new Error("실시간 팀 연결 정보가 올바르지 않습니다.");
        }
        this.sessionToken = credential;
        this.socket.auth = { sessionToken: credential };
        this.socket.connect();
      })
      .catch(() => {
        if (!this.closed && !this.accessRevoked) {
          this.revokeFromConnectError(fallbackMessage);
        }
      })
      .finally(() => {
        this.credentialRefreshPromise = null;
      });
  }

  private revokeFromConnectError(message: string): void {
    this.revokePendingLockReleases("access_revoked", message);
    this.revokePendingLockAcquisitions("access_revoked", message);
    this.terminateVoiceIntent("revoked", message);
    ++this.joinGeneration;
    this.accessRevoked = true;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.clearCrdtReconnectTimeout();
    this.clearJoinRetry(true);
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    this.clearLockRevisionState();
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
    this.revokePendingLockReleases(
      "disconnected",
      "팀 서버 연결이 끊겨 편집 잠금 해제 확인이 취소되었습니다."
    );
    this.revokePendingLockAcquisitions(
      "disconnected",
      "팀 서버 연결이 끊겨 편집 잠금 요청이 취소되었습니다."
    );
    // The room retains the user's desired call across a recoverable reconnect and republishes the
    // join after the next work-room ACK. Signals from the abandoned socket generation must not.
    this.cancelPendingVoiceAdmission({
      emitRemoval: false,
      preserveIntent: true,
      sendLeave: false,
    });
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.clearJoinRetry(true);
    this.selfConnectionId = null;
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
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
    this.revokePendingLockReleases("access_revoked", message);
    this.revokePendingLockAcquisitions("access_revoked", message);
    this.terminateVoiceIntent("revoked", message);
    ++this.joinGeneration;
    this.accessRevoked = true;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.clearCrdtReconnectTimeout();
    this.clearJoinRetry(true);
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    this.clearLockRevisionState();
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
    if (participant) {
      this.rememberCanonicalSession(
        participant.connectionId,
        participant.clientInstanceId,
      );
    }
    this.unindexActiveParticipant(participant);
    this.participants.delete(connectionId);
    this.activeScreenShareByConnection.delete(connectionId);
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
    this.setActiveParticipant(participant);
    if (participant.connectionId === this.selfConnectionId) return;
    this.deliver(participant, "presence:heartbeat", {
      visibility: participant.state === "active" ? "active" : "idle",
      pageId: participant.pageId,
      tool: participant.tool,
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

  private bufferScreenDelta(delta: PendingScreenDelta): void {
    if (this.closed || this.accessRevoked || !this.socket.connected || this.joinGeneration <= 0) {
      return;
    }
    const connectionId = delta.kind === "update"
      ? delta.share.connectionId
      : delta.connectionId;
    const previous = this.pendingScreenByConnection.get(connectionId);
    // A delayed stop for an older lifecycle cannot tombstone a newer announcement from the same
    // host while the join ACK is in flight.
    if (
      delta.kind === "stop" &&
      previous?.kind === "update" &&
      previous.share.shareId !== delta.shareId
    ) {
      return;
    }
    this.pendingScreenByConnection.delete(connectionId);
    this.pendingScreenByConnection.set(connectionId, delta);
    if (this.pendingScreenByConnection.size <= MAX_PENDING_SCREEN_CONNECTIONS) return;
    const oldest = this.pendingScreenByConnection.keys().next().value;
    if (typeof oldest === "string") this.pendingScreenByConnection.delete(oldest);
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

  private bufferLockDelta(delta: PendingLockDelta): void {
    if (this.closed || this.accessRevoked || !this.socket.connected || this.joinGeneration <= 0) {
      return;
    }
    if (this.pendingLockDeltas.length >= MAX_PENDING_LOCK_DELTAS) {
      // Dropping an earlier fence transition would make the older join snapshot unsafe. Keep the
      // buffer bounded and request a fresh authoritative snapshot when this generation flushes.
      this.pendingLockDeltaOverflowed = true;
      return;
    }
    this.pendingLockDeltas.push(delta);
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
      this.unindexActiveParticipant(
        this.participants.get(delta.connectionId),
      );
      this.participants.delete(delta.connectionId);
      this.activeScreenShareByConnection.delete(delta.connectionId);
      this.shareIdByConnection.delete(delta.connectionId);
      return;
    }
    const previous = this.participants.get(delta.participant.connectionId);
    if (!previous || Date.parse(previous.updatedAt) <= Date.parse(delta.participant.updatedAt)) {
      this.setActiveParticipant(delta.participant);
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
      drawing: typeof value.drawing === "boolean" ? value.drawing : undefined,
      strokeColor: typeof value.strokeColor === "string" ? value.strokeColor : undefined,
      strokeWidth: typeof value.strokeWidth === "number" ? value.strokeWidth : undefined,
      strokeOpacity: typeof value.strokeOpacity === "number" ? value.strokeOpacity : undefined,
      points: Array.isArray(value.points) ? (value.points as number[]) : undefined,
    });
  };

  private readonly onLockUpdate = (value: unknown) => {
    if (!isRecord(value)) return;
    const revisionAware =
      this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION;
    let delta: PendingLockDelta | null = null;
    if (value.action === "acquired") {
      const lock = parseLock(value.lock, { requireRevision: revisionAware });
      const requestId = safeIdentifier(value.requestId, 160) ? value.requestId : undefined;
      const revision = value.revision === undefined
        ? null
        : parseLockRevision(value.revision);
      if (
        lock &&
        (value.revision === undefined || revision !== null) &&
        (!revisionAware || revision !== null) &&
        (revision === null || lock.revision === revision)
      ) {
        delta = {
          kind: "acquired",
          lock,
          ...(requestId ? { requestId } : {}),
          ...(revision !== null ? { revision } : {}),
        };
      }
    } else if (
      (value.action === "released" || value.action === "expired" || value.action === "revoked") &&
      safeString(value.resourceId, 200) &&
      safeString(value.leaseId, 80)
    ) {
      const releaseRequestId = safeIdentifier(value.releaseRequestId, 160)
        ? value.releaseRequestId
        : null;
      const revision = value.revision === undefined
        ? null
        : parseLockRevision(value.revision);
      if (
        (value.revision === undefined || revision !== null) &&
        (!revisionAware || revision !== null)
      ) {
        delta = {
          kind: "release",
          action: value.action,
          resourceId: value.resourceId,
          leaseId: value.leaseId,
          releaseRequestId,
          ...(revision !== null ? { revision } : {}),
        };
      }
    }
    if (!delta) {
      if (revisionAware) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferLockDelta(delta);
      return;
    }
    if (!this.applyLockDelta(delta)) this.restartJoinAfterUnsafeSnapshot();
  };

  private lockAcquiredFingerprint(lock: ServerLock): string {
    return JSON.stringify([
      lock.leaseId,
      lock.ownerConnectionId,
      lock.expiresAt,
      lock.revision?.toString() ?? null,
    ]);
  }

  private acceptLockRevision(
    resourceId: string,
    revision: StudioLiveLockRevision | undefined,
    family: LockRevisionFamily,
    acquiredFingerprint?: string,
    acquiredOwnerConnectionId?: string
  ): "apply" | "ignore" | "unsafe" {
    if (this.lockRevisionVersion !== STUDIO_LIVE_LOCK_REVISION_VERSION) return "apply";
    if (revision === undefined || this.lockSnapshotFloor === null) return "unsafe";
    if (revision <= this.lockSnapshotFloor) return "ignore";

    const current = this.lockRevisionByResource.get(resourceId);
    if (current) {
      if (revision < current.revision) return "ignore";
      if (revision === current.revision) {
        if (family === "destructive" && current.family === "destructive") return "apply";
        if (
          family === "acquired" &&
          current.family === "acquired" &&
          current.acquiredFingerprint === acquiredFingerprint
        ) {
          return "ignore";
        }
        return "unsafe";
      }
    }

    if (family === "acquired") {
      if (!acquiredOwnerConnectionId || !acquiredFingerprint) return "unsafe";
      for (const [otherResourceId, watermark] of this.lockRevisionByResource) {
        if (
          otherResourceId === resourceId ||
          !studioLiveLockResourcesConflict(resourceId, otherResourceId)
        ) {
          continue;
        }
        if (
          watermark.conflictAcquiredRevision !== undefined &&
          watermark.conflictOwnerConnectionId &&
          watermark.conflictOwnerConnectionId !== acquiredOwnerConnectionId
        ) {
          if (watermark.conflictAcquiredRevision > revision) return "ignore";
          if (watermark.conflictAcquiredRevision === revision) return "unsafe";
        }
        // A newer acquire by a different owner proves this older hierarchy member was absent. A
        // standalone destructive event does not: it may be an unseen lifecycle release or one of
        // the synthetic rotation-fence revocations. Rejoin instead of guessing whether the older
        // page/element acquire was still valid at that point.
        if (watermark.family === "destructive" && watermark.revision >= revision) {
          return "unsafe";
        }
      }
    }

    if (!current && this.lockRevisionByResource.size >= MAX_LOCK_REVISION_WATERMARKS) {
      // A fresh snapshot compresses every accumulated tombstone into one global floor. Arbitrary
      // eviction would allow an older acquired event for the forgotten resource to resurrect.
      return "unsafe";
    }

    this.lockRevisionByResource.set(resourceId, {
      revision,
      family,
      ...(current?.conflictAcquiredRevision !== undefined &&
      current.conflictOwnerConnectionId
        ? {
            conflictAcquiredRevision: current.conflictAcquiredRevision,
            conflictOwnerConnectionId: current.conflictOwnerConnectionId,
          }
        : {}),
      ...(family === "acquired" && acquiredFingerprint
        ? { acquiredFingerprint }
        : {}),
      ...(family === "acquired" && acquiredOwnerConnectionId
        ? {
            conflictAcquiredRevision: revision,
            conflictOwnerConnectionId: acquiredOwnerConnectionId,
          }
        : {}),
    });
    if (this.maxCommittedLockRevision === null || revision > this.maxCommittedLockRevision) {
      this.maxCommittedLockRevision = revision;
    }
    return "apply";
  }

  private applyLockDelta(delta: PendingLockDelta): boolean {
    if (delta.kind === "acquired") {
      const pending = delta.requestId
        ? this.pendingLockAcquisitions.get(delta.requestId)
        : null;
      if (pending && pending.request.resource === delta.lock.resourceId) {
        this.completePendingLockAcquisition(pending, {
          ok: true,
          data: {
            decision: "acquired",
            requestId: delta.requestId,
            lock: {
              resourceId: delta.lock.resourceId,
              leaseId: delta.lock.leaseId,
              ownerConnectionId: delta.lock.ownerConnectionId,
              ownerName: delta.lock.ownerName,
              expiresAt: delta.lock.expiresAt,
              ...(delta.lock.revision !== null
                ? { revision: delta.lock.revision.toString() }
                : {}),
            },
          },
        });
      } else {
        if (!this.participants.has(delta.lock.ownerConnectionId)) return false;
        const ordering = this.acceptLockRevision(
          delta.lock.resourceId,
          delta.revision,
          "acquired",
          this.lockAcquiredFingerprint(delta.lock),
          delta.lock.ownerConnectionId
        );
        if (ordering === "unsafe") return false;
        if (ordering === "ignore") return true;
        this.applyAuthoritativeLock(delta.lock, delta.requestId);
      }
      return true;
    }
    const ordering = this.acceptLockRevision(
      delta.resourceId,
      delta.revision,
      "destructive"
    );
    if (ordering === "unsafe") return false;
    if (ordering === "ignore") return true;
    this.applyAuthoritativeRelease(delta.resourceId, delta.leaseId);
    const pending = this.pendingLockReleases.get(delta.resourceId);
    if (
      delta.action === "released" &&
      delta.releaseRequestId &&
      pending?.request.requestId === delta.releaseRequestId &&
      pending.request.claimId === delta.leaseId &&
      this.removePendingLockRelease(pending)
    ) {
      pending.resolve({
        status: "released",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        released: true,
      });
    }
    return true;
  }

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
    const share = parseScreenAnnouncement(value);
    if (!share) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferScreenDelta({ kind: "update", share });
      return;
    }
    const participant = this.remoteParticipant(share.connectionId);
    if (!participant) return;
    this.activeScreenShareByConnection.set(share.connectionId, share);
    this.shareIdByConnection.set(share.connectionId, share.shareId);
    this.deliver(participant, "screen:announce", {
      shareId: share.shareId,
      label: share.label,
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
    const stopped = parseScreenStop(value);
    if (!stopped) return;
    if (!this.ready || this.pendingInitialSnapshot) {
      this.bufferScreenDelta({ kind: "stop", ...stopped });
      return;
    }
    const participant = this.remoteParticipant(stopped.connectionId);
    if (!participant) return;
    const active = this.activeScreenShareByConnection.get(stopped.connectionId);
    if (active && active.shareId !== stopped.shareId) return;
    this.deliver(participant, "screen:stop", { shareId: stopped.shareId });
    if (active?.shareId === stopped.shareId) {
      this.activeScreenShareByConnection.delete(stopped.connectionId);
    }
    if (this.shareIdByConnection.get(stopped.connectionId) === stopped.shareId) {
      this.shareIdByConnection.delete(stopped.connectionId);
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

  private readonly onTeamCommentChanged = (value: unknown) => {
    if (!this.ready || this.accessRevoked) return;
    const change = parseStudioTeamCommentLiveEvent(value, this.context.workId);
    if (!change) return;
    this.emitControl({ type: "comment-changed", change });
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
    this.emitCrdt({ type: "update", update, senderSessionId: null });
    this.rememberCrdtUpdateId(update.updateId);
  };

  private readonly onCrdtBinaryUpdate = (value: unknown) => {
    if (
      !this.ready ||
      this.selectedCrdtWireFormat !== STUDIO_CRDT_BINARY_WIRE_FORMAT
    ) {
      return;
    }
    const update = parseStudioCrdtBinaryRemoteUpdate(value, {
      expectedWorkId: this.context.workId,
    });
    if (!update) {
      this.restartAfterCrdtWireFailure(
        "손상된 바이너리 공동 편집 업데이트를 감지해 안전하게 다시 연결합니다."
      );
      return;
    }
    if (this.seenCrdtUpdateIds.has(update.updateId)) return;
    this.emitCrdt({ type: "update", update, senderSessionId: null });
    this.rememberCrdtUpdateId(update.updateId);
  };

  private beginJoin(): void {
    if (this.closed || !this.socket.connected || !this.sessionToken) return;
    this.clearJoinRetry(false);
    const generation = ++this.joinGeneration;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
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
        this.acceptJoin(response, generation);
      }
    );
  }

  private acceptJoin(snapshot: ServerJoinSnapshot, generation: number): void {
    const reconciledSnapshot = this.reconcilePendingPresence(snapshot);
    const wasJoined = this.everJoined;
    if (
      this.maxCommittedLockRevision !== null &&
      (reconciledSnapshot.lockRevisionVersion !== STUDIO_LIVE_LOCK_REVISION_VERSION ||
        reconciledSnapshot.lockSnapshotRevision === null ||
        reconciledSnapshot.lockSnapshotRevision < this.maxCommittedLockRevision)
    ) {
      this.joined = true;
      this.everJoined = true;
      this.restartJoinAfterUnsafeSnapshot();
      return;
    }
    if (
      reconciledSnapshot.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION &&
      reconciledSnapshot.lockSnapshotRevision !== null &&
      (this.maxCommittedLockRevision === null ||
        reconciledSnapshot.lockSnapshotRevision > this.maxCommittedLockRevision)
    ) {
      // Persist capability observation at JOIN acceptance, not at the later first-heartbeat flush.
      // A disconnect in that staging window must never let the same client downgrade to a legacy
      // gateway that cannot preserve the already-observed monotonic revision contract.
      this.maxCommittedLockRevision = reconciledSnapshot.lockSnapshotRevision;
    }
    this.lockProtocolVersion = reconciledSnapshot.lockProtocolVersion;
    this.lockRevisionVersion = reconciledSnapshot.lockRevisionVersion;
    this.selfConnectionId = reconciledSnapshot.self.connectionId;
    this.rememberCanonicalSession(
      reconciledSnapshot.self.connectionId,
      this.context.participant.sessionId,
    );
    this.joined = true;
    this.pendingInitialSnapshot = reconciledSnapshot;
    // Stage the authoritative identity map immediately so an update arriving between join ACK and
    // the room's first heartbeat can still resolve lock owners and targeted connection ids.
    for (const participant of reconciledSnapshot.participants) {
      this.setActiveParticipant(participant);
    }
    if (reconciledSnapshot.crdtWireAdvertisement) {
      this.selectCrdtBinaryWire(
        reconciledSnapshot.crdtWireAdvertisement.selectionEpoch,
        generation,
        wasJoined
      );
      return;
    }
    this.selectedCrdtWireFormat = STUDIO_CRDT_LEGACY_WIRE_FORMAT;
    this.finishAcceptedJoin(wasJoined);
  }

  private finishAcceptedJoin(wasJoined: boolean): void {
    this.everJoined = true;
    // A reconnect snapshot must be committed before ready is observable. If its bounded delta
    // history is unsafe, flushInitialSnapshot starts a new generation and no stale ready event is
    // allowed to escape after that nested connecting transition.
    if (wasJoined && !this.flushInitialSnapshot()) return;
    this.clearConnectTimeout();
    this.resolveConnect?.();
    this.clearConnectDeferred();
    this.emitStatus({
      state: "ready",
      message: wasJoined ? "팀 서버에 다시 연결되었습니다." : "팀 서버 연결이 준비되었습니다.",
      recoverable: true,
    });
  }

  private selectCrdtBinaryWire(
    selectionEpoch: string,
    generation: number,
    wasJoined: boolean
  ): void {
    this.clearCrdtWireSelectionTimeout();
    const payload = createStudioCrdtBinarySelectionRequest(
      this.context.workId,
      selectionEpoch
    );
    this.crdtWireSelectionTimeout = this.scheduleTimeout(() => {
      this.crdtWireSelectionTimeout = null;
      if (
        this.closed ||
        generation !== this.joinGeneration ||
        !this.socket.connected
      ) {
        return;
      }
      this.restartAfterCrdtWireFailure(
        "바이너리 공동 편집 채널 선택 응답이 없어 안전하게 다시 연결합니다."
      );
    }, CRDT_WIRE_SELECT_ACK_TIMEOUT_MS);
    this.socket.emit(STUDIO_LIVE_CRDT_WIRE_SELECT_EVENT, payload, (value: unknown) => {
      if (
        this.closed ||
        generation !== this.joinGeneration ||
        !this.socket.connected
      ) {
        return;
      }
      this.clearCrdtWireSelectionTimeout();
      const failure = parseFailure(value);
      if (failure) {
        this.restartAfterCrdtWireFailure(failure.message);
        return;
      }
      const selected =
        isRecord(value) && value.ok === true
          ? parseStudioCrdtBinarySelection(value.data, {
              workId: this.context.workId,
              selectionEpoch,
            })
          : null;
      if (!selected) {
        this.restartAfterCrdtWireFailure(
          "바이너리 공동 편집 채널 선택 정보가 현재 연결과 일치하지 않아 다시 연결합니다."
        );
        return;
      }
      this.selectedCrdtWireFormat = STUDIO_CRDT_BINARY_WIRE_FORMAT;
      this.finishAcceptedJoin(wasJoined);
    });
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
    const screenSharesByConnection = new Map(
      snapshot.screenShares.map((share) => [share.connectionId, share])
    );
    for (const delta of this.pendingScreenByConnection.values()) {
      if (delta.kind === "stop") {
        const current = screenSharesByConnection.get(delta.connectionId);
        if (current?.shareId === delta.shareId) {
          screenSharesByConnection.delete(delta.connectionId);
        }
        continue;
      }
      screenSharesByConnection.set(delta.share.connectionId, delta.share);
    }
    for (const connectionId of departedConnectionIds) {
      voiceMembersByConnection.delete(connectionId);
      screenSharesByConnection.delete(connectionId);
    }
    participantsByConnection.set(snapshot.self.connectionId, snapshot.self);
    for (const [connectionId] of screenSharesByConnection) {
      const participant = participantsByConnection.get(connectionId);
      if (!participant?.sharingScreen) screenSharesByConnection.delete(connectionId);
    }
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    return {
      ...snapshot,
      participants: [...participantsByConnection.values()],
      voiceMembers: [...voiceMembersByConnection.values()],
      screenShares: [...screenSharesByConnection.values()],
    };
  }

  private failJoin(message: string, recoverable: boolean, code?: string): void {
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    const state: StudioLiveTransportStatus["state"] = recoverable ? "error" : "revoked";
    this.emitStatus({ state, message, recoverable } as StudioLiveTransportStatus);
    if (!this.everJoined) {
      this.failInitialConnect(message);
    }
    if (recoverable && this.everJoined) {
      this.scheduleJoinRetry(code === "rate_limited" ? JOIN_RATE_LIMIT_RETRY_MS : 0);
    }
    if (!recoverable || (code && isNonRecoverable(code))) {
      this.accessRevoked = true;
      this.clearCrdtReconnectTimeout();
      this.clearLockRevisionState();
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
      this.revokePendingLockReleases(failure.code, failure.message);
      this.revokePendingLockAcquisitions(failure.code, failure.message);
      this.terminateVoiceIntent("revoked", failure.message);
      ++this.joinGeneration;
      this.accessRevoked = true;
      this.joined = false;
      this.selectedCrdtWireFormat = null;
      this.clearCrdtWireSelectionTimeout();
      this.clearCrdtReconnectTimeout();
      this.clearJoinRetry(true);
      this.pendingInitialSnapshot = null;
      this.pendingPresenceByConnection.clear();
      this.pendingScreenByConnection.clear();
      this.pendingVoiceByConnection.clear();
      this.pendingLockDeltas.length = 0;
      this.pendingLockDeltaOverflowed = false;
      this.clearLockRevisionState();
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

  private flushInitialSnapshot(): boolean {
    const snapshot = this.pendingInitialSnapshot;
    if (!snapshot || !this.ready) return false;
    this.pendingInitialSnapshot = null;
    if (this.pendingLockDeltaOverflowed) {
      this.restartJoinAfterUnsafeSnapshot();
      return false;
    }
    const pendingLockDeltas = this.pendingLockDeltas.splice(0);
    const reconciled = this.reconcilePendingPresence(snapshot);
    const revisioned =
      reconciled.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION;
    if (
      (revisioned && pendingLockDeltas.some((delta) => delta.revision === undefined)) ||
      (!revisioned && this.lockDeltasRequireResync(reconciled.locks, pendingLockDeltas))
    ) {
      this.restartJoinAfterUnsafeSnapshot();
      return false;
    }
    this.applyParticipants(reconciled.participants);
    this.applyScreenShareSnapshot(reconciled.screenShares);
    this.applyLockSnapshot(reconciled.locks, reconciled.lockSnapshotRevision);
    for (const delta of pendingLockDeltas) {
      if (!this.applyLockDelta(delta)) {
        this.restartJoinAfterUnsafeSnapshot();
        return false;
      }
    }
    this.applyVoiceSnapshot(reconciled.voiceMembers);
    this.clearJoinRetry(true);
    return true;
  }

  private restartJoinAfterUnsafeSnapshot(): void {
    this.revokePendingLockReleases(
      "lock_resync",
      "최신 팀 상태를 다시 확인해야 해 진행 중인 편집 잠금 해제를 종료했습니다."
    );
    this.abandonPendingLockAcquisitionsForResync();
    ++this.joinGeneration;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.clearCrdtWireSelectionTimeout();
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    this.emitStatus({
      state: "connecting",
      message: "편집 잠금 변경이 많아 최신 팀 상태를 다시 확인하고 있습니다.",
      recoverable: true,
    });
    this.scheduleJoinRetry();
  }

  private lockDeltasRequireResync(
    snapshotLocks: ServerLock[],
    deltas: PendingLockDelta[]
  ): boolean {
    const locks = new Map(snapshotLocks.map((lock) => [lock.resourceId, lock]));
    for (const delta of deltas) {
      if (delta.kind === "acquired") {
        const current = locks.get(delta.lock.resourceId);
        // Without a server monotonic event revision, a novel acquire can be either side of the
        // snapshot barrier on a multi-node adapter. Never guess which fence is authoritative.
        if (
          !current ||
          current.leaseId !== delta.lock.leaseId ||
          current.ownerConnectionId !== delta.lock.ownerConnectionId
        ) {
          return true;
        }
        continue;
      }
      const current = locks.get(delta.resourceId);
      if (current?.leaseId === delta.leaseId) locks.delete(delta.resourceId);
    }
    return false;
  }

  private scheduleJoinRetry(minimumDelayMs = 0): void {
    if (
      this.joinRetryTimeout !== null ||
      this.closed ||
      this.accessRevoked ||
      !this.everJoined ||
      !this.socket.connected ||
      !this.sessionToken
    ) {
      return;
    }
    const delay = Math.max(
      minimumDelayMs,
      Math.min(
        JOIN_RESYNC_RETRY_MAX_MS,
        JOIN_RESYNC_RETRY_BASE_MS * 2 ** Math.min(this.joinRetryAttempt, 8)
      )
    );
    this.joinRetryAttempt += 1;
    const generation = this.joinGeneration;
    this.joinRetryTimeout = this.scheduleTimeout(() => {
      this.joinRetryTimeout = null;
      if (generation !== this.joinGeneration) return;
      this.beginJoin();
    }, delay);
  }

  private clearJoinRetry(resetAttempt: boolean): void {
    if (this.joinRetryTimeout !== null) this.cancelTimeout(this.joinRetryTimeout);
    this.joinRetryTimeout = null;
    if (resetAttempt) this.joinRetryAttempt = 0;
  }

  private applyParticipants(nextParticipants: ServerParticipant[]): void {
    const next = new Map(nextParticipants.map((participant) => [participant.connectionId, participant]));
    for (const previous of this.participants.values()) {
      if (previous.connectionId === this.selfConnectionId || next.has(previous.connectionId)) continue;
      this.unindexActiveParticipant(previous);
      const voice = this.voiceMemberByConnection.get(previous.connectionId);
      if (voice) this.deliver(previous, "voice:leave", { callId: voice.callId });
      this.deliver(previous, "presence:leave", {});
      this.activeScreenShareByConnection.delete(previous.connectionId);
      this.shareIdByConnection.delete(previous.connectionId);
      this.voiceMemberByConnection.delete(previous.connectionId);
      this.pendingVoiceByConnection.delete(previous.connectionId);
    }
    this.participants.clear();
    this.activeConnectionsByCanonicalSession.clear();
    for (const participant of next.values()) this.setActiveParticipant(participant);
    for (const participant of next.values()) {
      if (participant.connectionId === this.selfConnectionId) continue;
      this.deliver(participant, "presence:heartbeat", {
        visibility: participant.state === "active" ? "active" : "idle",
        pageId: participant.pageId,
        tool: participant.tool,
      });
      this.replayPendingVoiceForParticipant(participant);
    }
  }

  private applyScreenShareSnapshot(screenShares: ServerActiveScreenShare[]): void {
    const next = new Map<string, ServerActiveScreenShare>();
    for (const share of screenShares) {
      if (share.connectionId === this.selfConnectionId) continue;
      const participant = this.participants.get(share.connectionId);
      if (!participant?.sharingScreen) continue;
      next.set(share.connectionId, share);
    }

    for (const [connectionId, current] of this.activeScreenShareByConnection) {
      const incoming = next.get(connectionId);
      if (
        incoming?.shareId === current.shareId &&
        incoming.label === current.label
      ) {
        this.shareIdByConnection.set(connectionId, current.shareId);
        next.delete(connectionId);
        continue;
      }
      const participant = this.remoteParticipant(connectionId);
      if (participant) {
        this.deliver(participant, "screen:stop", { shareId: current.shareId });
      }
      this.activeScreenShareByConnection.delete(connectionId);
      if (this.shareIdByConnection.get(connectionId) === current.shareId) {
        this.shareIdByConnection.delete(connectionId);
      }
    }

    for (const share of next.values()) {
      const participant = this.remoteParticipant(share.connectionId);
      if (!participant) continue;
      this.activeScreenShareByConnection.set(share.connectionId, share);
      this.shareIdByConnection.set(share.connectionId, share.shareId);
      this.deliver(participant, "screen:announce", {
        shareId: share.shareId,
        label: share.label,
      });
    }
  }

  private applyLockSnapshot(
    locks: ServerLock[],
    snapshotRevision: StudioLiveLockRevision | null
  ): void {
    if (this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION) {
      if (snapshotRevision === null) return;
      this.lockSnapshotFloor = snapshotRevision;
      this.lockRevisionByResource.clear();
      if (
        this.maxCommittedLockRevision === null ||
        snapshotRevision > this.maxCommittedLockRevision
      ) {
        this.maxCommittedLockRevision = snapshotRevision;
      }
    } else {
      this.lockSnapshotFloor = null;
      this.lockRevisionByResource.clear();
      this.maxCommittedLockRevision = null;
    }
    const nextKeys = new Set(locks.map((lock) => JSON.stringify([lock.resourceId, lock.leaseId])));
    for (const current of this.locksByResource.values()) {
      if (!nextKeys.has(JSON.stringify([current.resourceId, current.leaseId]))) {
        this.applyAuthoritativeRelease(current.resourceId, current.leaseId);
      }
    }
    // The join snapshot is an authenticated, server-authoritative baseline. In particular, it may
    // restore a self-owned fence after reconnect without carrying per-request broadcast metadata.
    for (const lock of locks) this.applyAuthoritativeLock(lock, undefined, true);
  }

  private clearLockRevisionState(): void {
    this.lockRevisionVersion = 0;
    this.lockSnapshotFloor = null;
    this.lockRevisionByResource.clear();
    this.maxCommittedLockRevision = null;
  }

  private applyAuthoritativeLock(
    lock: ServerLock,
    requestId?: string,
    allowNewSelfFence = false
  ): void {
    const owner = this.participants.get(lock.ownerConnectionId);
    if (!owner) return;
    const leaseUntil = Date.parse(lock.expiresAt);
    if (!Number.isFinite(leaseUntil) || leaseUntil <= this.now()) return;
    const previous = this.locksByResource.get(lock.resourceId);
    if (owner.connectionId === this.selfConnectionId) {
      const pendingRequestId = this.pendingLockRequestByResource.get(lock.resourceId);
      const pendingRelease = this.pendingLockReleases.get(lock.resourceId);
      const matchesAcceptedFence =
        previous?.leaseId === lock.leaseId &&
        previous.ownerConnectionId === lock.ownerConnectionId;
      // A v1 gateway deliberately renews a lease without rotating its fence. A correlated reply
      // can therefore arrive after the local heartbeat timeout while the exact same accepted lock
      // is still active. That late reply refreshes the lease; it is not an abandoned fresh grant.
      // An explicit release remains stronger and must continue to chase-release the fence.
      const acceptedLegacyRenewal =
        this.lockProtocolVersion < STUDIO_LIVE_LOCK_PROTOCOL_VERSION &&
        !pendingRelease &&
        matchesAcceptedFence;
      if (acceptedLegacyRenewal && requestId) {
        const exact = this.abandonedLockAcquisitions.get(requestId);
        if (exact?.resource === lock.resourceId) {
          this.forgetAbandonedLockAcquisition(exact.requestId);
        }
      }
      const abandoned = acceptedLegacyRenewal
        ? null
        : this.findAbandonedLockAcquisition(
            lock.resourceId,
            requestId,
            matchesAcceptedFence
          );
      if (abandoned) {
        this.rollbackAbandonedLock(abandoned, lock);
        return;
      }
      if (
        !allowNewSelfFence &&
        !requestId &&
        !pendingRequestId &&
        !matchesAcceptedFence
      ) {
        // A broadcast in any rolling protocol cannot mint a new self-owned capability without
        // request correlation. Join snapshots and correlated ACKs opt in explicitly; exact
        // repeats (including legacy stable-lease renewal) remain harmless.
        return;
      }
      if (
        !allowNewSelfFence &&
        requestId &&
        requestId !== pendingRequestId &&
        (previous?.leaseId !== lock.leaseId ||
          previous.ownerConnectionId !== lock.ownerConnectionId)
      ) {
        // A listener survives Socket.IO reconnects, so an acquired update from an older join can
        // arrive while the replacement generation is ready. Only a current request, an abandoned
        // lifecycle handled above, or an already accepted identical fence may authorize it.
        return;
      }
      if (pendingRelease) {
        // A renewal may have committed just before release fenced its older lease. Suppress the
        // transient self lock and chase the exact newer fence without letting Room heartbeat it.
        this.releaseLockFenceBestEffort(lock, pendingRelease.request.requestId);
        return;
      }
      if (
        !acceptedLegacyRenewal &&
        pendingRequestId &&
        (!requestId || requestId !== pendingRequestId)
      ) {
        this.deferredSelfLocks.set(lock.resourceId, {
          lock,
          abandonedRequestId: null,
        });
        return;
      }
    }
    for (const conflicting of Array.from(this.locksByResource.values())) {
      if (
        conflicting.ownerConnectionId === lock.ownerConnectionId ||
        !studioLiveLockResourcesConflict(conflicting.resourceId, lock.resourceId)
      ) {
        continue;
      }
      // A newer accepted acquire can only commit after every overlapping lease owned by another
      // connection has disappeared. Run this after self-correlation/abandonment guards so a
      // rejected legacy or stale self event cannot erase a valid remote hierarchy lock.
      this.applyAuthoritativeRelease(conflicting.resourceId, conflicting.leaseId);
    }
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
      ...(requestId ? { requestId } : {}),
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
    this.rememberCanonicalSession(sender.connectionId, sender.clientInstanceId);
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

  private rememberCanonicalSession(
    connectionId: string,
    canonicalSessionId: string,
  ): void {
    this.canonicalSessionByConnection.delete(connectionId);
    this.canonicalSessionByConnection.set(connectionId, canonicalSessionId);
    if (
      this.canonicalSessionByConnection.size <=
      MAX_CANONICAL_SESSION_TOMBSTONES
    ) {
      return;
    }
    const oldest = this.canonicalSessionByConnection.keys().next().value;
    if (typeof oldest === "string") {
      this.canonicalSessionByConnection.delete(oldest);
    }
  }

  private setActiveParticipant(participant: ServerParticipant): void {
    const previous = this.participants.get(participant.connectionId);
    if (
      previous &&
      previous.clientInstanceId !== participant.clientInstanceId
    ) {
      this.unindexActiveParticipant(previous);
    }
    this.participants.set(participant.connectionId, participant);
    this.rememberCanonicalSession(
      participant.connectionId,
      participant.clientInstanceId,
    );
    const active =
      this.activeConnectionsByCanonicalSession.get(
        participant.clientInstanceId,
      ) ?? new Set<string>();
    active.add(participant.connectionId);
    this.activeConnectionsByCanonicalSession.set(
      participant.clientInstanceId,
      active,
    );
  }

  private unindexActiveParticipant(
    participant: ServerParticipant | undefined,
  ): void {
    if (!participant) return;
    const active = this.activeConnectionsByCanonicalSession.get(
      participant.clientInstanceId,
    );
    if (!active) return;
    active.delete(participant.connectionId);
    if (active.size === 0) {
      this.activeConnectionsByCanonicalSession.delete(
        participant.clientInstanceId,
      );
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

  private completePendingLockAcquisition(
    pending: PendingLockAcquisition,
    value: unknown
  ): void {
    if (this.pendingLockAcquisitions.get(pending.request.requestId) !== pending) {
      const lateLock = this.parseLockAcquisitionSuccess(pending, value);
      if (lateLock) {
        const abandoned = this.abandonedLockAcquisitions.get(pending.request.requestId);
        if (abandoned?.resource === pending.request.resource) {
          const ordering = this.acceptLockRevision(
            lateLock.resourceId,
            lateLock.revision ?? undefined,
            "acquired",
            this.lockAcquiredFingerprint(lateLock),
            lateLock.ownerConnectionId
          );
          if (ordering === "unsafe") {
            this.rollbackAbandonedLock(abandoned, lateLock);
            this.restartJoinAfterUnsafeSnapshot();
            return;
          }
          if (ordering === "ignore") {
            this.rollbackAbandonedLock(abandoned, lateLock);
            return;
          }
          // Route the late ACK through the same authoritative path as a broadcast. Legacy stable
          // renewals can refresh an already accepted fence, while v2 or released lifecycles are
          // still rolled back by the abandonment checks in applyAuthoritativeLock().
          this.applyAuthoritativeLock(lateLock, pending.request.requestId);
        }
      } else if (
        this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION &&
        isRecord(value) &&
        value.ok === true
      ) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }
    this.removePendingLockAcquisition(pending);

    if (
      this.closed ||
      !this.ready ||
      pending.joinGeneration !== this.joinGeneration ||
      pending.selfConnectionId !== this.selfConnectionId
    ) {
      pending.resolve({
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code: "connection_changed",
        message: "팀 연결이 변경되어 편집 잠금 요청이 취소되었습니다.",
      });
      return;
    }

    const echoedRequestId = this.lockAckRequestId(value);
    if (
      (this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION &&
        echoedRequestId !== pending.request.requestId) ||
      (echoedRequestId !== null && echoedRequestId !== pending.request.requestId)
    ) {
      const abandoned = this.rememberAbandonedLockAcquisition(pending);
      const uncorrelatedLock = this.parseLockAcquisitionSuccess(pending, value, true);
      if (uncorrelatedLock) {
        const ordering = this.acceptLockRevision(
          uncorrelatedLock.resourceId,
          uncorrelatedLock.revision ?? undefined,
          "acquired",
          this.lockAcquiredFingerprint(uncorrelatedLock),
          uncorrelatedLock.ownerConnectionId
        );
        this.rollbackAbandonedLock(abandoned, uncorrelatedLock);
        if (ordering === "unsafe") this.restartJoinAfterUnsafeSnapshot();
      } else {
        const deferred = this.deferredSelfLocks.get(pending.request.resource);
        if (deferred) this.rollbackDeferredSelfLock(deferred, abandoned);
        if (
          this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION &&
          isRecord(value) &&
          value.ok === true
        ) {
          this.restartJoinAfterUnsafeSnapshot();
        }
      }
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code: "response_mismatch",
        message: "팀 서버의 편집 잠금 응답 식별자가 요청과 일치하지 않습니다.",
      });
      return;
    }
    const failure = parseFailure(value);
    if (failure) {
      const revoked =
        (isRecord(value) && value.decision === "revoked") ||
        failure.code === "unauthenticated" ||
        failure.code === "access_revoked";
      const hasConflictLock = isRecord(value) && value.lock !== undefined;
      const conflictLock = isRecord(value)
        ? parseLock(value.lock, {
            requireRevision:
              this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION,
          })
        : null;
      const conflictOwner = conflictLock
        ? this.participants.get(conflictLock.ownerConnectionId)
        : null;
      let conflictOrdering: "apply" | "ignore" | "unsafe" = "ignore";
      if (conflictLock && conflictOwner) {
        conflictOrdering = this.acceptLockRevision(
          conflictLock.resourceId,
          conflictLock.revision ?? undefined,
          "acquired",
          this.lockAcquiredFingerprint(conflictLock),
          conflictLock.ownerConnectionId
        );
        if (conflictOrdering === "apply") {
          this.applyAuthoritativeLock(conflictLock);
        }
      } else if (
        this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION &&
        hasConflictLock
      ) {
        conflictOrdering = "unsafe";
      }
      const publicConflict = conflictLock && conflictOwner
        ? {
            resource: conflictLock.resourceId,
            claimId: conflictLock.leaseId,
            owner: publicParticipant(conflictOwner),
            leaseUntil: Date.parse(conflictLock.expiresAt),
          }
        : undefined;
      pending.resolve(
        revoked
          ? {
              status: "revoked",
              resource: pending.request.resource,
              requestId: pending.request.requestId,
              code: failure.code,
              message: failure.message,
            }
          : {
              status: "denied",
              resource: pending.request.resource,
              requestId: pending.request.requestId,
              code: failure.code,
              message: failure.message,
              ...(publicConflict ? { lock: publicConflict } : {}),
            }
      );
      this.settleDeferredSelfLock(pending.request.resource);
      this.handleFailure(failure, "operation");
      if (conflictOrdering === "unsafe" && !this.accessRevoked) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }

    const lock = this.parseLockAcquisitionSuccess(pending, value);
    if (!lock) {
      const abandoned = this.rememberAbandonedLockAcquisition(pending);
      const revisionlessLock =
        this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION
          ? this.parseLockAcquisitionSuccess(pending, value, false, false)
          : null;
      if (revisionlessLock) {
        this.rollbackAbandonedLock(abandoned, revisionlessLock);
      } else {
        const deferred = this.deferredSelfLocks.get(pending.request.resource);
        if (deferred) this.rollbackDeferredSelfLock(deferred, abandoned);
      }
      const message = "팀 서버의 편집 잠금 응답 형식이 올바르지 않습니다.";
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code: "invalid_response",
        message,
      });
      this.emitStatus({ state: "error", message, recoverable: true });
      if (this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }
    const ordering = this.acceptLockRevision(
      lock.resourceId,
      lock.revision ?? undefined,
      "acquired",
      this.lockAcquiredFingerprint(lock),
      lock.ownerConnectionId
    );
    if (ordering === "unsafe") {
      const abandoned = this.rememberAbandonedLockAcquisition(pending);
      this.rollbackAbandonedLock(abandoned, lock);
      const message = "편집 잠금 순서를 확인할 수 없어 최신 팀 상태를 다시 불러옵니다.";
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code: "invalid_response",
        message,
      });
      this.restartJoinAfterUnsafeSnapshot();
      return;
    }
    if (ordering === "ignore") {
      const current = this.locksByResource.get(lock.resourceId);
      const duplicateAcceptedFence =
        current?.leaseId === lock.leaseId &&
        current.ownerConnectionId === lock.ownerConnectionId &&
        current.expiresAt === lock.expiresAt &&
        current.revision === lock.revision;
      if (!duplicateAcceptedFence) {
        this.settleDeferredSelfLock(pending.request.resource);
        pending.resolve({
          status: "revoked",
          resource: pending.request.resource,
          requestId: pending.request.requestId,
          code: "lock_stale",
          message: "더 최신 편집 잠금 상태가 확인되어 이전 응답을 적용하지 않았습니다.",
        });
        return;
      }
    }
    this.forgetAbandonedLockAcquisition(pending.request.requestId);
    this.settleDeferredSelfLock(pending.request.resource, lock);
    const leaseUntil = Date.parse(lock.expiresAt);
    if (ordering === "apply") {
      this.applyAuthoritativeLock(lock, pending.request.requestId, true);
    }
    pending.resolve({
      status: "acquired",
      resource: pending.request.resource,
      requestId: pending.request.requestId,
      lock: {
        resource: lock.resourceId,
        claimId: lock.leaseId,
        owner: this.context.participant,
        leaseUntil,
      },
    });
  }

  private parseLockAcquisitionSuccess(
    pending: PendingLockAcquisition,
    value: unknown,
    ignoreRequestId = false,
    requireRevision =
      this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION
  ): ServerLock | null {
    if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
    if (value.data.decision !== undefined && value.data.decision !== "acquired") return null;
    if (
      !ignoreRequestId &&
      value.data.requestId !== undefined &&
      value.data.requestId !== pending.request.requestId
    ) return null;
    const lock = parseLock(value.data.lock, { requireRevision });
    if (
      !lock ||
      lock.resourceId !== pending.request.resource ||
      lock.ownerConnectionId !== pending.selfConnectionId ||
      Date.parse(lock.expiresAt) <= this.now()
    ) return null;
    return lock;
  }

  private lockAckRequestId(value: unknown): string | null {
    if (!isRecord(value)) return null;
    if (safeIdentifier(value.requestId, 160)) return value.requestId;
    if (isRecord(value.data) && safeIdentifier(value.data.requestId, 160)) {
      return value.data.requestId;
    }
    return null;
  }

  private removePendingLockAcquisition(pending: PendingLockAcquisition): boolean {
    if (this.pendingLockAcquisitions.get(pending.request.requestId) !== pending) return false;
    this.pendingLockAcquisitions.delete(pending.request.requestId);
    if (this.pendingLockRequestByResource.get(pending.request.resource) === pending.request.requestId) {
      this.pendingLockRequestByResource.delete(pending.request.resource);
    }
    if (pending.timeout !== null) this.cancelTimeout(pending.timeout);
    pending.timeout = null;
    return true;
  }

  private rememberAbandonedLockAcquisition(
    pending: PendingLockAcquisition
  ): AbandonedLockAcquisition {
    this.pruneAbandonedLockAcquisitions();
    const abandoned: AbandonedLockAcquisition = {
      requestId: pending.request.requestId,
      resource: pending.request.resource,
      joinGeneration: pending.joinGeneration,
      selfConnectionId: pending.selfConnectionId,
      discardAt: this.now() + ABANDONED_LOCK_ACQUISITION_TTL_MS,
    };
    this.abandonedLockAcquisitions.set(abandoned.requestId, abandoned);
    const requestIds = this.abandonedLockRequestIdsByResource.get(abandoned.resource) ?? new Set();
    requestIds.add(abandoned.requestId);
    this.abandonedLockRequestIdsByResource.set(abandoned.resource, requestIds);
    while (this.abandonedLockAcquisitions.size > MAX_ABANDONED_LOCK_ACQUISITIONS) {
      const oldestRequestId = this.abandonedLockAcquisitions.keys().next().value as
        | string
        | undefined;
      if (!oldestRequestId) break;
      this.forgetAbandonedLockAcquisition(oldestRequestId);
    }
    return abandoned;
  }

  private forgetAbandonedLockAcquisition(requestId: string): void {
    const abandoned = this.abandonedLockAcquisitions.get(requestId);
    if (!abandoned) return;
    this.abandonedLockAcquisitions.delete(requestId);
    const requestIds = this.abandonedLockRequestIdsByResource.get(abandoned.resource);
    requestIds?.delete(requestId);
    if (requestIds?.size === 0) {
      this.abandonedLockRequestIdsByResource.delete(abandoned.resource);
    }
  }

  private pruneAbandonedLockAcquisitions(): void {
    const now = this.now();
    for (const abandoned of Array.from(this.abandonedLockAcquisitions.values())) {
      if (abandoned.discardAt > now) continue;
      this.forgetAbandonedLockAcquisition(abandoned.requestId);
    }
  }

  private findAbandonedLockAcquisition(
    resource: string,
    requestId: string | undefined,
    matchesKnownLease: boolean
  ): AbandonedLockAcquisition | null {
    this.pruneAbandonedLockAcquisitions();
    if (requestId) {
      const exact = this.abandonedLockAcquisitions.get(requestId);
      return exact?.resource === resource ? exact : null;
    }
    // An uncorrelated snapshot that repeats the already accepted lease is legitimate. An unknown
    // self lease while an abandoned lifecycle remains is fail-closed and must be rolled back.
    if (matchesKnownLease) return null;
    const requestIds = this.abandonedLockRequestIdsByResource.get(resource);
    if (!requestIds) return null;
    const newest = Array.from(requestIds).at(-1);
    return newest ? this.abandonedLockAcquisitions.get(newest) ?? null : null;
  }

  private abandonPendingLockAcquisitionForRelease(resource: string): void {
    const requestId = this.pendingLockRequestByResource.get(resource);
    if (!requestId) return;
    const pending = this.pendingLockAcquisitions.get(requestId);
    if (!pending || !this.removePendingLockAcquisition(pending)) return;
    const abandoned = this.rememberAbandonedLockAcquisition(pending);
    const deferred = this.deferredSelfLocks.get(resource);
    if (deferred) this.rollbackDeferredSelfLock(deferred, abandoned);
    pending.resolve({
      status: "revoked",
      resource,
      requestId: pending.request.requestId,
      code: "release_pending",
      message: "사용자가 편집 잠금 해제를 요청해 진행 중인 갱신을 취소했습니다.",
    });
  }

  private completePendingLockRelease(pending: PendingLockRelease, value: unknown): void {
    if (this.pendingLockReleases.get(pending.request.resource) !== pending) return;
    this.removePendingLockRelease(pending);
    const settleLocalFence = () => {
      this.applyAuthoritativeRelease(pending.request.resource, pending.request.claimId);
    };

    if (
      this.closed ||
      !this.ready ||
      pending.joinGeneration !== this.joinGeneration ||
      pending.selfConnectionId !== this.selfConnectionId
    ) {
      settleLocalFence();
      pending.resolve({
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code: "connection_changed",
        message: "팀 연결이 변경되어 편집 잠금 해제 확인을 중단했습니다.",
      });
      return;
    }

    const echoedRequestId = this.lockAckRequestId(value);
    if (
      this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION &&
      echoedRequestId !== pending.request.requestId
    ) {
      settleLocalFence();
      const message = "팀 서버의 편집 잠금 해제 응답 식별자가 요청과 일치하지 않습니다.";
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code: "response_mismatch",
        message,
      });
      this.emitStatus({ state: "error", message, recoverable: true });
      if (this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }

    const failure = parseFailure(value);
    if (failure) {
      settleLocalFence();
      const revoked = failure.code === "unauthenticated" || failure.code === "access_revoked";
      pending.resolve(
        revoked
          ? {
              status: "revoked",
              resource: pending.request.resource,
              requestId: pending.request.requestId,
              claimId: pending.request.claimId,
              code: failure.code,
              message: failure.message,
            }
          : {
              status: "denied",
              resource: pending.request.resource,
              requestId: pending.request.requestId,
              claimId: pending.request.claimId,
              code: failure.code,
              message: failure.message,
            }
      );
      this.handleFailure(failure, "operation");
      return;
    }

    if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
      settleLocalFence();
      const message = "팀 서버의 편집 잠금 해제 응답 형식이 올바르지 않습니다.";
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code: "invalid_response",
        message,
      });
      this.emitStatus({ state: "error", message, recoverable: true });
      if (this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }
    const data = value.data;
    const v2ResponseMatches =
      data.requestId === pending.request.requestId &&
      data.resourceId === pending.request.resource &&
      data.leaseId === pending.request.claimId;
    const releaseRevision = data.revision === undefined
      ? null
      : parseLockRevision(data.revision);
    const revisionResponseValid =
      (data.revision === undefined || releaseRevision !== null) &&
      (this.lockRevisionVersion !== STUDIO_LIVE_LOCK_REVISION_VERSION ||
        data.released !== true ||
        releaseRevision !== null);
    if (
      typeof data.released !== "boolean" ||
      (this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION && !v2ResponseMatches) ||
      !revisionResponseValid
    ) {
      settleLocalFence();
      const message = "팀 서버의 편집 잠금 해제 응답 범위가 요청과 일치하지 않습니다.";
      pending.resolve({
        status: "denied",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code: "invalid_response",
        message,
      });
      this.emitStatus({ state: "error", message, recoverable: true });
      if (this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION) {
        this.restartJoinAfterUnsafeSnapshot();
      }
      return;
    }
    if (
      data.released &&
      this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION
    ) {
      const ordering = this.acceptLockRevision(
        pending.request.resource,
        releaseRevision ?? undefined,
        "destructive"
      );
      if (ordering === "unsafe") {
        settleLocalFence();
        const message = "편집 잠금 해제 순서를 확인할 수 없어 최신 팀 상태를 다시 불러옵니다.";
        pending.resolve({
          status: "denied",
          resource: pending.request.resource,
          requestId: pending.request.requestId,
          claimId: pending.request.claimId,
          code: "invalid_response",
          message,
        });
        this.restartJoinAfterUnsafeSnapshot();
        return;
      }
    }
    settleLocalFence();
    pending.resolve({
      status: "released",
      resource: pending.request.resource,
      requestId: pending.request.requestId,
      claimId: pending.request.claimId,
      released: data.released,
    });
  }

  private removePendingLockRelease(pending: PendingLockRelease): boolean {
    if (this.pendingLockReleases.get(pending.request.resource) !== pending) return false;
    this.pendingLockReleases.delete(pending.request.resource);
    if (this.pendingLockReleaseByRequestId.get(pending.request.requestId) === pending) {
      this.pendingLockReleaseByRequestId.delete(pending.request.requestId);
    }
    if (pending.timeout !== null) this.cancelTimeout(pending.timeout);
    pending.timeout = null;
    return true;
  }

  private revokePendingLockReleases(code: string, message: string): void {
    for (const pending of Array.from(this.pendingLockReleases.values())) {
      if (!this.removePendingLockRelease(pending)) continue;
      this.applyAuthoritativeRelease(pending.request.resource, pending.request.claimId);
      pending.resolve({
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        claimId: pending.request.claimId,
        code,
        message,
      });
    }
  }

  private revokePendingLockAcquisitions(code: string, message: string): void {
    for (const pending of Array.from(this.pendingLockAcquisitions.values())) {
      if (!this.removePendingLockAcquisition(pending)) continue;
      pending.resolve({
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code,
        message,
      });
    }
    this.deferredSelfLocks.clear();
    this.abandonedLockAcquisitions.clear();
    this.abandonedLockRequestIdsByResource.clear();
  }

  private abandonPendingLockAcquisitionsForResync(): void {
    for (const pending of Array.from(this.pendingLockAcquisitions.values())) {
      if (!this.removePendingLockAcquisition(pending)) continue;
      const abandoned = this.rememberAbandonedLockAcquisition(pending);
      const deferred = this.deferredSelfLocks.get(pending.request.resource);
      if (deferred) this.rollbackDeferredSelfLock(deferred, abandoned);
      pending.resolve({
        status: "revoked",
        resource: pending.request.resource,
        requestId: pending.request.requestId,
        code: "lock_resync",
        message: "편집 잠금 순서를 다시 확인해야 해 진행 중인 요청을 취소했습니다.",
      });
    }
  }

  private rollbackAbandonedLock(
    abandoned: AbandonedLockAcquisition,
    lock: ServerLock
  ): void {
    const canChaseAcrossRevisionResync =
      this.lockRevisionVersion === STUDIO_LIVE_LOCK_REVISION_VERSION &&
      this.socket.connected &&
      abandoned.selfConnectionId === this.selfConnectionId;
    if (
      this.pendingLockRequestByResource.has(lock.resourceId) ||
      abandoned.selfConnectionId !== this.selfConnectionId ||
      (!canChaseAcrossRevisionResync &&
        (abandoned.joinGeneration !== this.joinGeneration || !this.ready))
    ) {
      this.deferredSelfLocks.set(lock.resourceId, {
        lock,
        abandonedRequestId: abandoned.requestId,
      });
      return;
    }
    this.forgetAbandonedLockAcquisition(abandoned.requestId);
    this.deferredSelfLocks.delete(lock.resourceId);
    this.releaseLockFenceBestEffort(lock, abandoned.requestId);
  }

  private rollbackDeferredSelfLock(
    deferred: DeferredSelfLock,
    fallback: AbandonedLockAcquisition | null = null
  ): void {
    const exact = deferred.abandonedRequestId
      ? this.abandonedLockAcquisitions.get(deferred.abandonedRequestId) ?? null
      : null;
    const abandoned = exact ?? fallback;
    if (abandoned?.resource === deferred.lock.resourceId) {
      this.rollbackAbandonedLock(abandoned, deferred.lock);
      return;
    }
    this.deferredSelfLocks.delete(deferred.lock.resourceId);
  }

  private settleDeferredSelfLock(resource: string, acceptedLock: ServerLock | null = null): void {
    const deferred = this.deferredSelfLocks.get(resource);
    if (!deferred) return;
    if (
      acceptedLock &&
      deferred.lock.leaseId === acceptedLock.leaseId &&
      deferred.lock.ownerConnectionId === acceptedLock.ownerConnectionId
    ) {
      if (deferred.abandonedRequestId) {
        this.forgetAbandonedLockAcquisition(deferred.abandonedRequestId);
      }
      this.deferredSelfLocks.delete(resource);
      return;
    }
    this.rollbackDeferredSelfLock(deferred);
  }

  private releaseLockFenceBestEffort(lock: ServerLock, requestId: string): void {
    this.emitWithAck(
      "studio:lock:release",
      {
        workId: this.context.workId,
        resourceId: lock.resourceId,
        leaseId: lock.leaseId,
        ...(this.lockProtocolVersion >= STUDIO_LIVE_LOCK_PROTOCOL_VERSION ? { requestId } : {}),
      },
      () => this.applyAuthoritativeRelease(lock.resourceId, lock.leaseId)
    );
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
    event:
      | "studio:crdt:sync"
      | "studio:crdt:update"
      | typeof STUDIO_LIVE_CRDT_BINARY_SYNC_EVENT
      | typeof STUDIO_LIVE_CRDT_BINARY_UPDATE_EVENT,
    payload: unknown,
    parse: (value: unknown, options: { expectedWorkId: string }) => T | null,
    correlation: "requestId" | "updateId",
    failClosed = false
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
          if (failClosed && failure.code === "not_joined") {
            this.restartAfterCrdtWireFailure(failure.message);
            reject(createStudioCrdtRetryableError(
              "connection_changed",
              failure.message,
              "connection"
            ));
            return;
          }
          reject(createStudioCrdtServerAckError(failure.code, failure.message));
          return;
        }
        if (!isRecord(value) || value.ok !== true) {
          const error = failClosed
            ? createStudioCrdtRetryableError(
                "connection_changed",
                "바이너리 CRDT 응답을 확인하지 못해 안전하게 다시 연결합니다.",
                "connection"
              )
            : createStudioCrdtPermanentError(
                "invalid_response",
                "팀 서버의 CRDT 응답을 확인하지 못했습니다.",
                "server-response"
              );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          if (failClosed) this.restartAfterCrdtWireFailure(error.message);
          reject(error);
          return;
        }
        const parsed = parse(value.data, { expectedWorkId: this.context.workId });
        if (!parsed) {
          const error = failClosed
            ? createStudioCrdtRetryableError(
                "connection_changed",
                "바이너리 CRDT 응답이 손상되어 안전하게 다시 연결합니다.",
                "connection"
              )
            : createStudioCrdtPermanentError(
                "invalid_response",
                "팀 서버의 CRDT 응답 형식이 올바르지 않습니다.",
                "server-response"
              );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          if (failClosed) this.restartAfterCrdtWireFailure(error.message);
          reject(error);
          return;
        }
        const responseMatchesRequest =
          isRecord(parsed) &&
          isRecord(payload) &&
          (parsed as Record<string, unknown>)[correlation] === payload[correlation];
        if (!responseMatchesRequest) {
          const error = failClosed
            ? createStudioCrdtRetryableError(
                "connection_changed",
                "바이너리 CRDT 응답 식별자가 일치하지 않아 안전하게 다시 연결합니다.",
                "connection"
              )
            : createStudioCrdtPermanentError(
                "response_mismatch",
                "팀 서버의 CRDT 응답 식별자가 요청과 일치하지 않습니다.",
                "server-response"
              );
          this.emitStatus({ state: "error", message: error.message, recoverable: true });
          if (failClosed) this.restartAfterCrdtWireFailure(error.message);
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

  private restartAfterCrdtWireFailure(message: string): void {
    if (this.closed || this.accessRevoked) return;
    this.clearCrdtWireSelectionTimeout();
    this.clearCrdtReconnectTimeout();
    ++this.joinGeneration;
    this.joined = false;
    this.selectedCrdtWireFormat = null;
    this.selfConnectionId = null;
    this.pendingInitialSnapshot = null;
    this.pendingPresenceByConnection.clear();
    this.pendingScreenByConnection.clear();
    this.pendingVoiceByConnection.clear();
    this.pendingLockDeltas.length = 0;
    this.pendingLockDeltaOverflowed = false;
    this.rejectPendingCrdtOperations(createStudioCrdtRetryableError(
      "connection_changed",
      message,
      "connection"
    ));
    this.pendingCrdtPublishes.clear();
    this.emitStatus({ state: "error", message, recoverable: true });
    if (this.socket.connected) this.socket.disconnect();
    this.crdtReconnectTimeout = this.scheduleTimeout(() => {
      this.crdtReconnectTimeout = null;
      if (this.closed || this.accessRevoked) return;
      if (this.socket.connected) this.beginJoin();
      else this.socket.connect();
    }, 0);
  }

  private rejectPendingCrdtOperations(error: StudioCrdtOperationError): void {
    for (const operation of this.pendingCrdtOperations) {
      this.cancelTimeout(operation.timeout);
      operation.reject(error);
    }
    this.pendingCrdtOperations.clear();
  }

  private clearCrdtWireSelectionTimeout(): void {
    if (this.crdtWireSelectionTimeout !== null) {
      this.cancelTimeout(this.crdtWireSelectionTimeout);
    }
    this.crdtWireSelectionTimeout = null;
  }

  private clearCrdtReconnectTimeout(): void {
    if (this.crdtReconnectTimeout !== null) {
      this.cancelTimeout(this.crdtReconnectTimeout);
    }
    this.crdtReconnectTimeout = null;
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
  const hasEndpointOverride = Object.prototype.hasOwnProperty.call(
    dependencies,
    "socketEndpoint",
  );
  const endpoint =
    hasEndpointOverride
      ? dependencies.socketEndpoint ?? null
      : dependencies.createSocket
        ? "/studio-live"
        : runtimeSocketEndpoint();
  const localTransportFactory =
    dependencies.createLocalTransport ?? createStudioLocalLiveTransport;
  const {
    socketEndpoint: _socketEndpoint,
    createLocalTransport: _createLocalTransport,
    ...transportDependencies
  } = dependencies;

  const primaryFactory: StudioLiveTransportFactory = endpoint
    ? (() => {
        const serverDependencies: StudioLiveSocketTransportDependencies = {
          ...transportDependencies,
          createSocket:
            dependencies.createSocket
            ?? ((auth) => createSocketAtEndpoint(endpoint, auth)),
        };
        return (context) =>
          new StudioLiveSocketTransport(
            context,
            sessionToken,
            serverDependencies,
          );
      })()
    : localTransportFactory;

  return applyStudioRealtimePurposeRouting(primaryFactory, {
    realtimeOrigin: import.meta.env.VITE_STUDIO_REALTIME_ORIGIN,
    providerId: import.meta.env.VITE_STUDIO_REALTIME_PROVIDER_ID,
  });
}
