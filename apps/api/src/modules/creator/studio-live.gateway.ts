import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";


import { allowedCorsOrigins } from "../../config/cors";

import { CreatorService } from "./creator.service";
import { StudioCrdtService } from "./studio-crdt.service";
import {
  mapStudioLiveCrdtFailure,
  replyStudioLiveAck as reply,
  studioLiveFailure as failure,
} from "./studio-live-ack";
import { StudioLiveAdapterCleanupService } from "./studio-live-adapter-cleanup.service";
import {
  StudioLiveCleanupNotificationDispatcher,
  type StudioLiveCleanupNotificationRetry,
} from "./studio-live-cleanup-notification-dispatcher";
import { StudioLiveCrdtQuotaLimiter } from "./studio-live-crdt-quota";
import {
  STUDIO_LIVE_FEATURE_POLICY,
  type StudioLiveFeaturePolicy,
} from "./studio-live-feature-policy";
import {
  STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS,
  StudioLiveInterServerRelayTransport,
} from "./studio-live-inter-server-relay-transport";
import { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";
import {
  STUDIO_LIVE_LOCK_LIMIT_PER_WORK,
  STUDIO_LIVE_LOCK_REPOSITORY,
  createStudioLiveLockAcquisitionId,
  studioLiveLockRequestIdFromAcquisitionId,
  type StudioLiveLockRecord,
  type StudioLiveLockRepository,
} from "./studio-live-lock.repository";
import {
  StudioLiveRoomTransitionCoordinator,
  type StudioLiveRoomTransitionState,
} from "./studio-live-room-transition-coordinator";
import { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
  STUDIO_LIVE_LOCK_REVISION_VERSION,
  StudioLiveActiveScreenShareSchema,
  StudioLiveChatSchema,
  StudioLiveCrdtSyncSchema,
  StudioLiveCrdtUpdateSchema,
  StudioLiveCursorSchema,
  StudioLiveInterServerRelayRequestSchema,
  StudioLiveJoinSchema,
  StudioLiveLockReleaseSchema,
  StudioLiveLockRequestIdSchema,
  StudioLiveLockRequestSchema,
  StudioLivePresenceSchema,
  StudioLivePublicParticipantSchema,
  StudioLiveScreenAccessSchema,
  StudioLiveScreenAnnounceSchema,
  StudioLiveScreenRequestSchema,
  StudioLiveScreenStateSchema,
  StudioLiveScreenStopSchema,
  StudioLiveSignalSchema,
  StudioLiveVoiceJoinSchema,
  StudioLiveVoiceLeaveSchema,
  StudioLiveVoiceMemberSchema,
  StudioLiveVoiceSignalSchema,
  StudioLiveVoiceStateSchema,
} from "./studio-live.protocol";

import type {
  StudioLiveAck,
  StudioLiveAckCallback,
  StudioLiveActiveScreenShare,
  StudioLiveAuthPrincipal,
  StudioLiveChatInput,
  StudioLiveCrdtRemoteUpdate,
  StudioLiveCrdtSyncInput,
  StudioLiveCrdtSyncResult,
  StudioLiveCrdtUpdateAck,
  StudioLiveCrdtUpdateInput,
  StudioLiveCursorInput,
  StudioLiveFailure,
  StudioLiveInterServerRelayEvent,
  StudioLiveJoinInput,
  StudioLiveJoinResult,
  StudioLiveLock,
  StudioLiveLockAcquiredDecision,
  StudioLiveLockReleaseDecision,
  StudioLiveLockReleaseFailure,
  StudioLiveLockReleaseInput,
  StudioLiveLockRequestFailure,
  StudioLiveLockRequestInput,
  StudioLiveLockUpdate,
  StudioLiveNamespace,
  StudioLiveParticipant,
  StudioLivePresenceInput,
  StudioLiveScreenAccessInput,
  StudioLiveScreenAnnounceInput,
  StudioLiveScreenRequestInput,
  StudioLiveScreenStateInput,
  StudioLiveScreenStopInput,
  StudioLiveSignalInput,
  StudioLiveSocket,
  StudioLiveSocketData,
  StudioLiveVoiceJoinInput,
  StudioLiveVoiceLeaveInput,
  StudioLiveVoiceMember,
  StudioLiveVoiceSignalInput,
  StudioLiveVoiceStateInput,
  StudioLiveFailureCode,
} from "./studio-live.protocol";
import type { StudioTeamCommentLiveEvent } from "../../../../../lib/studio-team-comment-live-event";
import type { Namespace } from "socket.io";

export {
  STUDIO_LIVE_SESSION_AUTHENTICATOR,
  STUDIO_LIVE_SESSION_REVALIDATOR,
  StudioLiveChatSchema,
  StudioLiveCrdtSyncSchema,
  StudioLiveCrdtUpdateSchema,
  StudioLiveCursorSchema,
  StudioLiveJoinSchema,
  StudioLiveLockReleaseSchema,
  StudioLiveLockRequestIdSchema,
  StudioLiveLockRequestSchema,
  StudioLivePresenceSchema,
  StudioLiveScreenAccessSchema,
  StudioLiveScreenAnnounceSchema,
  StudioLiveScreenRequestSchema,
  StudioLiveScreenStateSchema,
  StudioLiveScreenStopSchema,
  StudioLiveSignalSchema,
  StudioLiveVoiceJoinSchema,
  StudioLiveVoiceLeaveSchema,
  StudioLiveVoiceSignalSchema,
  StudioLiveVoiceStateSchema,
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.protocol";

export type {
  StudioLiveAck,
  StudioLiveAuthPrincipal,
  StudioLiveCrdtRemoteUpdate,
  StudioLiveCrdtSyncResult,
  StudioLiveCrdtUpdateAck,
  StudioLiveLock,
  StudioLiveLockAcquiredDecision,
  StudioLiveLockRequestAck,
  StudioLiveLockUpdate,
  StudioLiveParticipant,
  StudioLiveSessionAuthenticator,
  StudioLiveSessionRevalidator,
  StudioLiveVoiceMember,
} from "./studio-live.protocol";

export { STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS } from "./studio-live-inter-server-relay-transport";

const STUDIO_LIVE_NAMESPACE = "/studio-live";
const STUDIO_LIVE_ROOM_PREFIX = "studio-live:";
const STUDIO_LIVE_ACCESS_RECHECK_MS = 15_000;
const STUDIO_LIVE_ACCESS_CACHE_MS = 5_000;
export const STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS = 2_000;
const STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_MS = 2_000;
const STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_LIMIT = 512;
const STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_TTL_MS = 10_000;
const STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_LIMIT = 4_096;
const STUDIO_LIVE_MAX_HTTP_BUFFER_SIZE = 384 * 1_024;
export const STUDIO_LIVE_VOICE_MAX_PARTICIPANTS = 6;
// Soft, approximate cap: read via the same cluster-wide fetchSockets() discovery as
// listParticipants, not a Postgres advisory lock like voice/lock admission. A join is low
// frequency (once per session) so this trades a small race window (two nodes briefly both
// admitting near the boundary) for avoiding a DB round-trip on every room join.
export const STUDIO_LIVE_ROOM_MAX_PARTICIPANTS = 30;

interface StudioLiveParticipantInternal extends StudioLiveParticipant {
  userId: string;
  workId: string;
  authorizedAt: number;
  authorizationSequence: number;
  /**
   * Finite only while this work is an active save-before-collaboration room. Promoted and ordinary
   * saved works use null so the established ACL remains authoritative without a synthetic lease.
   */
  authorizationExpiresAt: number | null;
}

interface StudioLiveVoiceMemberInternal extends StudioLiveVoiceMember {
  workId: string;
}

interface StudioLiveVoiceRelayDiscovery {
  sender: StudioLiveParticipant;
  target: StudioLiveParticipant;
}

type StudioLiveVoiceLeaveReason =
  | "left"
  | "capacity"
  | "revoked"
  | "switched"
  | "removed";

type StudioLivePeerRelayAuthorization =
  | {
      ok: true;
      sender: StudioLiveParticipantInternal;
      senderAuthorizationSequence: number;
      senderPrincipal: StudioLiveAuthPrincipal;
      target: StudioLiveParticipantInternal;
      targetAuthorizationSequence: number;
      targetPrincipal: StudioLiveAuthPrincipal;
    }
  | { ok: false; response: StudioLiveFailure };
type StudioLiveRelaySenderAuthorization =
  | { ok: true; sender: StudioLiveParticipantInternal }
  | { ok: false; response: StudioLiveFailure };

interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

interface StudioLiveParticipantAuthorizationRecheck {
  participant: StudioLiveParticipantInternal;
  promise: Promise<number | null>;
}

interface StudioLiveCandidateRelayAuthorization {
  workId: string;
  shareId: string;
  left: StudioLiveParticipantInternal;
  leftAuthorizationSequence: number;
  leftPrincipal: StudioLiveAuthPrincipal;
  right: StudioLiveParticipantInternal;
  rightAuthorizationSequence: number;
  rightPrincipal: StudioLiveAuthPrincipal;
  expiresAt: number;
}

function studioLiveRoom(workId: string): string {
  return `${STUDIO_LIVE_ROOM_PREFIX}${workId}`;
}

function publicParticipant(participant: StudioLiveParticipantInternal): StudioLiveParticipant {
  return {
    connectionId: participant.connectionId,
    clientInstanceId: participant.clientInstanceId,
    name: participant.name,
    role: participant.role,
    capabilities: {
      view: true,
      comment: participant.capabilities.comment,
      edit: participant.capabilities.edit,
      manageMembers: participant.capabilities.manageMembers,
    },
    state: participant.state,
    pageId: participant.pageId,
    tool: participant.tool,
    sharingScreen: participant.sharingScreen,
    joinedAt: participant.joinedAt,
    updatedAt: participant.updatedAt,
  };
}

function copyPublicParticipant(participant: StudioLiveParticipant): StudioLiveParticipant {
  return {
    connectionId: participant.connectionId,
    clientInstanceId: participant.clientInstanceId,
    name: participant.name,
    role: participant.role,
    capabilities: {
      view: true,
      comment: participant.capabilities.comment,
      edit: participant.capabilities.edit,
      manageMembers: participant.capabilities.manageMembers,
    },
    state: participant.state,
    pageId: participant.pageId,
    tool: participant.tool,
    sharingScreen: participant.sharingScreen,
    joinedAt: participant.joinedAt,
    updatedAt: participant.updatedAt,
  };
}

function publicLock(lock: StudioLiveLockRecord): StudioLiveLock {
  return {
    resourceId: lock.resourceId,
    leaseId: lock.leaseId,
    ownerConnectionId: lock.ownerConnectionId,
    ownerName: lock.ownerName,
    expiresAt: lock.expiresAt.toISOString(),
    revision: lock.revision.toString(),
  };
}

function lockRequestFailure(
  requestId: string,
  decision: StudioLiveLockRequestFailure["decision"],
  code: StudioLiveFailureCode,
  message: string,
  lock?: StudioLiveLock
): StudioLiveLockRequestFailure {
  return {
    ...failure(code, message),
    decision,
    requestId,
    ...(lock ? { lock } : {}),
  };
}

function lockReleaseFailure(
  requestId: string,
  code: StudioLiveFailureCode,
  message: string
): StudioLiveLockReleaseFailure {
  return {
    ...failure(code, message),
    requestId,
  };
}

function canonicalBase64DecodedLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function normalizedMemberName(value: unknown): string {
  if (typeof value !== "string") return "팀원";
  const name = value.trim();
  return name.length > 0 ? name.slice(0, 80) : "팀원";
}

function studioLiveAuthorizationExpiresAt(value: string | undefined): number | null {
  if (value === undefined) return null;
  return Date.parse(value);
}

function isStudioLiveAuthorizationLeaseCurrent(
  authorizationExpiresAt: number | null,
  now = Date.now()
): boolean {
  return (
    authorizationExpiresAt === null ||
    (Number.isFinite(authorizationExpiresAt) && authorizationExpiresAt > now)
  );
}

const studioLiveAllowedOrigins = new Set(allowedCorsOrigins());

export function isStudioLiveOriginAllowed(origin: string | undefined): boolean {
  return origin === undefined || studioLiveAllowedOrigins.has(origin);
}

export function studioLiveAllowRequest(
  request: { headers: { origin?: string } },
  callback: (error: string | null, allowed: boolean) => void
): void {
  callback(null, isStudioLiveOriginAllowed(request.headers.origin));
}

@Injectable()
@WebSocketGateway({
  namespace: STUDIO_LIVE_NAMESPACE,
  path: "/socket.io",
  transports: ["websocket"],
  maxHttpBufferSize: STUDIO_LIVE_MAX_HTTP_BUFFER_SIZE,
  perMessageDeflate: false,
  cors: {
    credentials: false,
    methods: ["GET", "POST"],
    origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
      callback(null, isStudioLiveOriginAllowed(origin));
    },
  },
  // Socket.IO CORS only controls browser HTTP responses. The WebSocket upgrade itself needs an
  // explicit admission check or a hostile Origin can still connect with websocket-only transport.
  allowRequest: studioLiveAllowRequest,
})
export class StudioLiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(StudioLiveGateway.name);
  private readonly participantsBySocket = new Map<string, StudioLiveParticipantInternal>();
  private readonly socketIdsByWork = new Map<string, Set<string>>();
  private readonly lockCleanupByConnectionWork = new Map<string, Promise<void>>();
  private readonly lockOperationTailByResource = new Map<string, Promise<void>>();
  private readonly rateLimits = new Map<string, Map<string, RateLimitBucket>>();
  private readonly crdtQuotaLimiter = new StudioLiveCrdtQuotaLimiter();
  private readonly participantAuthorizationRechecks = new Map<
    string,
    StudioLiveParticipantAuthorizationRecheck
  >();
  private readonly candidateRelayAuthorizations = new Map<
    string,
    StudioLiveCandidateRelayAuthorization
  >();
  private readonly voiceMembershipBySocket = new Map<string, StudioLiveVoiceMemberInternal>();
  private readonly deliveredInterServerVoiceSignals = new Map<string, number>();
  private accessRecheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(CreatorService)
    private readonly creatorService: CreatorService,
    @Inject(StudioLiveAdapterCleanupService)
    private readonly adapterCleanup: StudioLiveAdapterCleanupService,
    @Inject(StudioLiveCleanupNotificationDispatcher)
    private readonly cleanupNotifications: StudioLiveCleanupNotificationDispatcher,
    @Inject(StudioLiveInterServerRelayTransport)
    private readonly interServerRelayTransport: StudioLiveInterServerRelayTransport,
    @Inject(StudioLiveSocketAuthService)
    private readonly socketAuthentication: StudioLiveSocketAuthService,
    @Inject(StudioLiveJoinTransitionSequencer)
    private readonly joinTransitions: StudioLiveJoinTransitionSequencer,
    @Inject(StudioLiveRoomTransitionCoordinator)
    private readonly roomTransitions: StudioLiveRoomTransitionCoordinator,
    @Inject(STUDIO_LIVE_FEATURE_POLICY)
    private readonly liveFeatures: StudioLiveFeaturePolicy,
    @Inject(StudioCrdtService)
    private readonly studioCrdtService: StudioCrdtService,
    @Inject(STUDIO_LIVE_LOCK_REPOSITORY)
    private readonly studioLiveLockRepository: StudioLiveLockRepository
  ) {}

  afterInit(server: Namespace): void {
    this.interServerRelayTransport.bind(
      server as StudioLiveNamespace,
      (request) => this.receiveInterServerRelay(request)
    );
    // Namespace middleware completes authentication before Socket.IO emits `connection`, so a
    // valid client cannot race an async handleConnection hook with its first studio:join event.
    server.use((socket, next) => {
      void this.socketAuthentication.authenticate(socket as StudioLiveSocket)
        .then((authenticated) => {
          if (authenticated) {
            next();
            return;
          }
          const error = new Error("로그인 세션을 확인할 수 없습니다.") as Error & {
            data?: { code: string };
          };
          error.data = { code: "unauthenticated" };
          next(error);
        })
        .catch(() => {
          const error = new Error("로그인 세션을 확인할 수 없습니다.") as Error & {
            data?: { code: string };
          };
          error.data = { code: "unauthenticated" };
          next(error);
        });
    });
    if (this.accessRecheckTimer) clearInterval(this.accessRecheckTimer);
    this.accessRecheckTimer = setInterval(() => {
      void this.revalidateAllParticipants();
      void this.purgeExpiredLocks();
    }, STUDIO_LIVE_ACCESS_RECHECK_MS);
    this.accessRecheckTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.accessRecheckTimer) clearInterval(this.accessRecheckTimer);
    this.accessRecheckTimer = null;
    this.participantsBySocket.clear();
    this.socketIdsByWork.clear();
    this.lockCleanupByConnectionWork.clear();
    this.lockOperationTailByResource.clear();
    this.rateLimits.clear();
    this.crdtQuotaLimiter.clear();
    this.joinTransitions.clearAll();
    this.participantAuthorizationRechecks.clear();
    this.candidateRelayAuthorizations.clear();
    this.socketAuthentication.clearAll();
    this.voiceMembershipBySocket.clear();
    this.deliveredInterServerVoiceSignals.clear();
  }

  /** Emits one tiny invalidation through the configured Socket.IO adapter-backed work room. */
  publishTeamCommentChanged(change: StudioTeamCommentLiveEvent): boolean {
    if (!this.server) return false;
    this.server
      .to(studioLiveRoom(change.workId))
      .emit("studio:comment:changed", change);
    return true;
  }

  async handleConnection(client: StudioLiveSocket): Promise<void> {
    // Runtime connections have already passed the namespace middleware. The fallback keeps direct
    // gateway tests and non-standard adapters fail-closed without weakening the runtime ordering.
    const principal = this.socketAuthentication.principal(client);
    if (principal && principal.expiresAt > Date.now()) return;
    this.socketAuthentication.clear(client);
    if (!(await this.socketAuthentication.authenticate(client))) {
      client.emit("studio:error", failure("unauthenticated", "로그인 세션을 확인할 수 없습니다."));
      client.disconnect(true);
    }
  }

  handleDisconnect(client: StudioLiveSocket): void {
    this.socketAuthentication.clear(client);
    this.joinTransitions.invalidate(client.id);
    this.participantAuthorizationRechecks.delete(client.id);
    this.deleteCandidateRelayAuthorizationsForSocket(client.id);
    this.removeParticipant(client.id, "disconnect");
    this.rateLimits.delete(client.id);
  }

  @SubscribeMessage("studio:join")
  async join(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveJoinInput,
    @Ack() ack?: StudioLiveAckCallback<StudioLiveJoinResult>
  ) {
    const parsed = StudioLiveJoinSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "실시간 작업실 참가 정보가 올바르지 않습니다."));
    }
    // Charge the valid request before session/ACL I/O so a connected client cannot bypass the
    // admission limit while still forcing repeated database-backed session validation.
    if (!this.consumeRateLimit(client.id, "join", 12, 60_000)) {
      return reply(ack, failure("rate_limited", "작업실 참가 요청이 너무 많습니다."));
    }
    return this.joinTransitions.runLatest(client.id, (transitionSequence) =>
      this.performJoin(client, parsed.data, transitionSequence, ack)
    );
  }

  private async performJoin(
    client: StudioLiveSocket,
    input: StudioLiveJoinInput,
    transitionSequence: number,
    ack?: StudioLiveAckCallback<StudioLiveJoinResult>
  ): Promise<StudioLiveAck<StudioLiveJoinResult>> {
    if (!this.isCurrentJoinTransition(client, transitionSequence)) {
      return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
    }
    const rejectInvalidSession = (rollbackRoom?: string): StudioLiveFailure => {
      const response = failure("unauthenticated", "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      reply(ack, response);
      client.emit("studio:error", response);
      // Disconnect is the fail-closed boundary. Never wait for a distributed adapter leave: an
      // adapter can stall indefinitely while the expired socket remains a speculative listener.
      this.disconnectInvalidJoinSession(client);
      if (rollbackRoom) {
        this.roomTransitions.leaveJoinedRoomBestEffort(client, rollbackRoom);
      }
      return response;
    };
    // Revalidate on every room join. A socket that outlives token expiry, logout, or a session
    // version bump must not use the previously cached user id to enter another work.
    const authenticated = await this.socketAuthentication.revalidate(client);
    if (!this.isCurrentJoinTransition(client, transitionSequence)) {
      return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
    }
    const principal = authenticated ? this.socketAuthentication.principal(client) : undefined;
    const userId = principal?.userId ?? null;
    if (!userId || !principal || !this.isSocketPrincipalCurrent(client, principal, userId)) {
      return rejectInvalidSession();
    }
    try {
      const team = await this.creatorService.getWorkTeam(userId, input.workId);
      if (!this.isCurrentJoinTransition(client, transitionSequence)) {
        return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
      }
      if (!this.isSocketPrincipalCurrent(client, principal, userId)) {
        return rejectInvalidSession();
      }
      if (
        team.workId !== input.workId ||
        team.viewer.userId !== userId ||
        team.viewer.status !== "active" ||
        !team.viewer.capabilities.view
      ) {
        return reply(ack, failure("forbidden", "이 작품의 실시간 작업실에 참여할 권한이 없습니다."));
      }
      const authorizationExpiresAt = studioLiveAuthorizationExpiresAt(
        team.authorizationExpiresAt
      );
      const now = Date.now();
      if (!isStudioLiveAuthorizationLeaseCurrent(authorizationExpiresAt, now)) {
        return reply(
          ack,
          failure("forbidden", "임시 협업 작업실이 만료되었습니다. 새 작업실을 만들어 주세요.")
        );
      }
      const member = team.members.find((candidate) => candidate.userId === userId);
      const existingBeforeRoomJoin = this.participantsBySocket.get(client.id);
      const nextRoom = studioLiveRoom(input.workId);
      const joinedNewRoom = existingBeforeRoomJoin?.workId !== input.workId;

      // Soft occupancy cap — only for a genuinely new arrival, never for an existing participant
      // re-sending a join (they're already counted in listParticipants and must not be able to
      // lock themselves out). Checked before the adapter join so this socket isn't in the room
      // yet and can't double-count itself.
      if (joinedNewRoom) {
        const roomOccupancy = await this.listParticipants(input.workId);
        if (
          this.isCurrentJoinTransition(client, transitionSequence) &&
          roomOccupancy.length >= STUDIO_LIVE_ROOM_MAX_PARTICIPANTS
        ) {
          return reply(ack, failure("rate_limited", "작업실 정원은 최대 30명입니다."));
        }
      }

      // Join the adapter room before committing authoritative in-memory state. The coordinator
      // owns only adapter I/O and rollback ordering; socket/generation policy remains here.
      let enteredRoomState = await this.roomTransitions.enterNextRoom({
        socket: client,
        nextRoom,
        joinNextRoom: joinedNewRoom,
        currentState: () => this.currentRoomTransitionState(client, transitionSequence),
        onIsolationFailure: () => this.disconnectRoomIsolationFailure(client),
      });
      if (enteredRoomState === "current") {
        enteredRoomState = this.currentRoomTransitionState(client, transitionSequence);
        if (enteredRoomState !== "current" && joinedNewRoom) {
          await this.roomTransitions.rollbackEnteredRoom(
            client,
            nextRoom,
            () => this.disconnectRoomIsolationFailure(client)
          );
        }
      }
      if (enteredRoomState === "socket_stale") {
        return reply(ack, failure("not_joined", "실시간 작업실 연결이 종료되었습니다."));
      }
      if (enteredRoomState === "generation_stale") {
        return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
      }
      if (!this.isSocketPrincipalCurrent(client, principal, userId)) {
        return rejectInvalidSession(joinedNewRoom ? nextRoom : undefined);
      }

      // This is the serialized commit boundary. A newer request may enqueue while an adapter leave
      // is pending, but it cannot execute until this transition leaves exactly one authoritative
      // room and participant behind.
      const existing = this.participantsBySocket.get(client.id);
      if (existing && existing.workId !== input.workId) {
        let leftPreviousRoomState = await this.roomTransitions.leavePreviousRoom({
          socket: client,
          previousRoom: studioLiveRoom(existing.workId),
          speculativeNextRoom: joinedNewRoom ? nextRoom : null,
          currentState: () => this.currentRoomTransitionState(client, transitionSequence),
          onIsolationFailure: () => this.disconnectRoomIsolationFailure(client),
        });
        if (leftPreviousRoomState === "current") {
          leftPreviousRoomState = this.currentRoomTransitionState(
            client,
            transitionSequence
          );
          if (leftPreviousRoomState !== "current" && joinedNewRoom) {
            await this.roomTransitions.rollbackEnteredRoom(
              client,
              nextRoom,
              () => this.disconnectRoomIsolationFailure(client)
            );
          }
        }
        if (leftPreviousRoomState === "socket_stale") {
          this.removeSwitchedParticipantIfCurrent(client.id, existing);
          return reply(ack, failure("not_joined", "실시간 작업실 연결이 종료되었습니다."));
        }
        if (leftPreviousRoomState === "generation_stale") {
          this.removeSwitchedParticipantIfCurrent(client.id, existing);
          return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
        }
        if (!this.isSocketPrincipalCurrent(client, principal, userId)) {
          return rejectInvalidSession(joinedNewRoom ? nextRoom : undefined);
        }
        this.removeParticipant(client.id, "switch");
      }

      const participant: StudioLiveParticipantInternal = {
        connectionId: client.id,
        clientInstanceId: input.clientInstanceId,
        userId,
        workId: input.workId,
        name: normalizedMemberName(member?.name),
        role: team.viewer.role,
        capabilities: {
          view: true,
          comment: team.viewer.capabilities.comment,
          edit: team.viewer.capabilities.edit,
          manageMembers: team.viewer.capabilities.manageMembers,
        },
        state: "active",
        pageId: existing?.workId === input.workId ? existing.pageId : null,
        tool: existing?.workId === input.workId ? existing.tool : null,
        sharingScreen: existing?.workId === input.workId ? existing.sharingScreen : false,
        joinedAt: existing?.workId === input.workId ? existing.joinedAt : new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        authorizedAt: now,
        authorizationSequence: 0,
        authorizationExpiresAt,
      };
      // No asynchronous boundary may occur between this final identity check and the authoritative
      // participant/room-index commit below. This prevents a session that expired during adapter
      // I/O from becoming a valid in-memory participant even briefly.
      if (!this.isSocketPrincipalCurrent(client, principal, userId)) {
        return rejectInvalidSession(joinedNewRoom ? nextRoom : undefined);
      }
      if (!isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt)) {
        if (joinedNewRoom) {
          this.roomTransitions.leaveJoinedRoomBestEffort(client, nextRoom);
        }
        return reply(
          ack,
          failure("forbidden", "임시 협업 작업실이 만료되었습니다. 새 작업실을 만들어 주세요.")
        );
      }
      if (existing?.workId === input.workId && existing.capabilities.edit && !participant.capabilities.edit) {
        void this.releaseSocketLocks(existing, "revoked");
      }
      this.participantAuthorizationRechecks.delete(client.id);
      this.deleteCandidateRelayAuthorizationsForSocket(client.id);
      this.participantsBySocket.set(client.id, participant);
      if (participant.role === "viewer") this.removeVoiceMembership(client.id, "revoked");
      const roomSockets = this.socketIdsByWork.get(input.workId) ?? new Set<string>();
      roomSockets.add(client.id);
      this.socketIdsByWork.set(input.workId, roomSockets);
      const safeParticipant = this.publishParticipantToSocketData(client, participant);
      // Membership changes are emitted incrementally. Broadcasting a process-local full snapshot
      // can erase peers connected to another API instance, while per-peer updates converge even
      // when two nodes complete their adapter-wide discovery in different orders.
      this.server
        .to(studioLiveRoom(input.workId))
        .emit("studio:presence:update", safeParticipant);
      const [participants, lockSnapshot, voiceMembers, screenShares] = await Promise.all([
        this.listParticipants(input.workId),
        this.lockSnapshot(input.workId),
        this.liveFeatures.voiceEnabled
          ? this.listVoiceMembers(input.workId)
          : Promise.resolve([]),
        this.listScreenShares(input.workId),
      ]);
      if (
        !this.isCurrentJoinTransition(client, transitionSequence) ||
        !this.isSocketCurrent(client) ||
        this.participantsBySocket.get(client.id) !== participant ||
        !this.isSocketPrincipalCurrent(client, principal, userId) ||
        !isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt)
      ) {
        if (!isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt)) {
          this.revokeParticipant(client.id);
        }
        return reply(ack, failure("not_joined", "더 최신 작업실 상태로 대체되었습니다."));
      }

      return reply(ack, {
        ok: true,
        data: {
          lockProtocolVersion: STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
          lockRevisionVersion: STUDIO_LIVE_LOCK_REVISION_VERSION,
          lockSnapshotRevision: lockSnapshot.revision,
          self: safeParticipant,
          participants,
          locks: lockSnapshot.locks,
          voiceMembers,
          screenShares,
        },
      });
    } catch {
      this.logger.warn({ workId: input.workId, socketId: client.id }, "studio live join denied");
      return reply(ack, failure("forbidden", "이 작품의 실시간 작업실에 참여할 수 없습니다."));
    }
  }

  @SubscribeMessage("studio:presence")
  async updatePresence(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLivePresenceInput,
    @Ack() ack?: StudioLiveAckCallback<{ participant: StudioLiveParticipant }>
  ) {
    const parsed = StudioLivePresenceSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "작업 상태 정보가 올바르지 않습니다."));
    if (!this.consumeRateLimit(client.id, "presence", 30, 10_000)) {
      return reply(ack, failure("rate_limited", "작업 상태 갱신이 너무 빠릅니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      false,
      (participant) => {
        participant.state = parsed.data.state;
        if (Object.hasOwn(parsed.data, "pageId")) participant.pageId = parsed.data.pageId ?? null;
        if (Object.hasOwn(parsed.data, "tool")) participant.tool = parsed.data.tool ?? null;
        participant.updatedAt = new Date().toISOString();
        const safe = this.publishParticipantToSocketData(client, participant);
        this.server.to(studioLiveRoom(participant.workId)).emit("studio:presence:update", safe);
        return safe;
      }
    );
    if (!authorized) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    return reply(ack, { ok: true, data: { participant: authorized.value } });
  }

  @SubscribeMessage("studio:cursor")
  async updateCursor(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveCursorInput,
    @Ack() ack?: StudioLiveAckCallback<{ accepted: true }>
  ) {
    const parsed = StudioLiveCursorSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "커서 위치가 올바르지 않습니다."));
    if (!this.consumeRateLimit(client.id, "cursor", 90, 3_000)) {
      return reply(ack, failure("rate_limited", "커서 위치 전송이 너무 빠릅니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      false,
      (participant) => {
        client.to(studioLiveRoom(participant.workId)).emit("studio:cursor", {
          connectionId: participant.connectionId,
          pageId: parsed.data.pageId,
          x: parsed.data.x,
          y: parsed.data.y,
          tool: parsed.data.tool ?? null,
          drawing: parsed.data.drawing,
          strokeColor: parsed.data.strokeColor,
          strokeWidth: parsed.data.strokeWidth,
          strokeOpacity: parsed.data.strokeOpacity,
          points: parsed.data.points,
          sentAt: new Date().toISOString(),
        });
      }
    );
    if (!authorized) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    return reply(ack, { ok: true, data: { accepted: true } });
  }

  @SubscribeMessage("studio:crdt:sync")
  async syncCrdtDocument(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveCrdtSyncInput,
    @Ack() ack?: StudioLiveAckCallback<StudioLiveCrdtSyncResult>
  ) {
    const parsed = StudioLiveCrdtSyncSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "CRDT 동기화 요청이 올바르지 않습니다."));
    }
    const quotaParticipant = this.currentJoinedCrdtParticipant(
      client,
      parsed.data.workId
    );
    if (!quotaParticipant) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (
      !this.crdtQuotaLimiter.consumeSync({
        userId: quotaParticipant.userId,
        workId: parsed.data.workId,
      })
    ) {
      return reply(ack, failure("rate_limited", "CRDT 전체 동기화 요청이 너무 많습니다."));
    }
    const authorizedBefore = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => participant
    );
    if (!authorizedBefore || authorizedBefore.value !== quotaParticipant) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }

    let sync: Awaited<ReturnType<StudioCrdtService["sync"]>>;
    try {
      sync = await this.studioCrdtService.sync(
        parsed.data.workId,
        parsed.data.stateVector
      );
    } catch (error) {
      const mappedFailure = mapStudioLiveCrdtFailure(error, parsed.data.workId, "sync");
      if (mappedFailure.diagnostic) {
        this.logger.error(mappedFailure.diagnostic, "studio CRDT operation failed");
      }
      return reply(ack, mappedFailure.response);
    }
    const authorizedAfter = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => participant
    );
    if (!authorizedAfter || authorizedAfter.value !== authorizedBefore.value) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    return reply(ack, {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: parsed.data.workId,
        requestId: parsed.data.requestId,
        transferId: crypto.randomUUID(),
        chunks: sync.chunks,
        chunkCount: sync.chunkCount,
        totalBytes: sync.totalBytes,
        serverStateVector: sync.serverStateVector,
        serverSequence: sync.serverSequence,
      },
    });
  }

  @SubscribeMessage("studio:crdt:update")
  async applyCrdtUpdate(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveCrdtUpdateInput,
    @Ack() ack?: StudioLiveAckCallback<StudioLiveCrdtUpdateAck>
  ) {
    const parsed = StudioLiveCrdtUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "CRDT 편집 업데이트가 올바르지 않습니다."));
    }
    const decodedBytes = canonicalBase64DecodedLength(parsed.data.update);
    const quotaParticipant = this.currentJoinedCrdtParticipant(
      client,
      parsed.data.workId
    );
    if (!quotaParticipant) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (
      !this.crdtQuotaLimiter.consumeUpdate(
        { userId: quotaParticipant.userId, workId: parsed.data.workId },
        decodedBytes
      )
    ) {
      return reply(ack, failure("rate_limited", "CRDT 편집 업데이트 전송이 너무 빠릅니다."));
    }
    const authorizedBefore = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => participant
    );
    if (!authorizedBefore || authorizedBefore.value !== quotaParticipant) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (!authorizedBefore.value.capabilities.edit) {
      return reply(ack, failure("forbidden", "이 작품을 편집할 권한이 없습니다."));
    }

    let applied: Awaited<ReturnType<StudioCrdtService["applyUpdate"]>>;
    try {
      applied = await this.studioCrdtService.applyUpdate({
        workId: parsed.data.workId,
        updateId: parsed.data.updateId,
        actorUserId: authorizedBefore.value.userId,
        data: parsed.data.update,
      });
    } catch (error) {
      const mappedFailure = mapStudioLiveCrdtFailure(error, parsed.data.workId, "update");
      if (mappedFailure.diagnostic) {
        this.logger.error(mappedFailure.diagnostic, "studio CRDT operation failed");
      }
      return reply(ack, mappedFailure.response);
    }

    const data: StudioLiveCrdtUpdateAck = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: parsed.data.workId,
      updateId: applied.updateId,
      serverSequence: applied.serverSequence,
      serverStateVector: applied.serverStateVector,
      duplicate: applied.duplicate,
    };
    const response: StudioLiveAck<StudioLiveCrdtUpdateAck> = { ok: true, data };
    // The forced ACL check immediately before applyUpdate is the authorization linearization
    // point. Once persistence starts, its durable outcome must always be ACKed and fanned out: a
    // second ACL check here could turn a committed operation into an apparent failure, causing
    // retries while peers never observe the already-persisted update.
    // The sender learns that durable persistence succeeded before any peer can observe the op.
    reply(ack, response);
    if (!applied.duplicate) {
      const remote: StudioLiveCrdtRemoteUpdate = {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: parsed.data.workId,
        updateId: applied.updateId,
        serverSequence: applied.serverSequence,
        update: applied.update,
      };
      try {
        client.to(studioLiveRoom(parsed.data.workId)).emit("studio:crdt:update", remote);
      } catch (error) {
        this.logger.error(
          {
            workId: parsed.data.workId,
            updateId: applied.updateId,
            error: error instanceof Error ? error.message : "unknown",
          },
          "studio CRDT persisted but peer broadcast failed"
        );
      }
    }
    return response;
  }

  @SubscribeMessage("studio:lock:request")
  async requestLock(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveLockRequestInput,
    @Ack() ack?: StudioLiveAckCallback<StudioLiveLockAcquiredDecision>
  ) {
    const parsedRequestId = StudioLiveLockRequestIdSchema.safeParse(
      (body as { requestId?: unknown } | null)?.requestId
    );
    const requestId = parsedRequestId.success ? parsedRequestId.data : crypto.randomUUID();
    const parsed = StudioLiveLockRequestSchema.safeParse(body);
    if (!parsed.success) {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "invalid_payload",
          "편집 잠금 정보가 올바르지 않습니다."
        )
      );
    }
    if (!this.consumeRateLimit(client.id, "lock", 60, 60_000)) {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "rate_limited",
          "편집 잠금 요청이 너무 많습니다."
        )
      );
    }
    return this.withSocketLockOperation(
      client.id,
      parsed.data.workId,
      parsed.data.resourceId,
      async () => {
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      true,
      true,
      (participant) => participant
    );
    if (!authorized) {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "forbidden",
          "이 원고를 편집할 권한이 없습니다."
        )
      );
    }
    await this.awaitSocketLockCleanup(parsed.data.workId, client.id);
    if (!this.isParticipantAuthorizationCurrent(client, authorized.value, true)) {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "revoked",
          "forbidden",
          "이 원고를 편집할 권한이 없습니다."
        )
      );
    }
    let acquired: Awaited<ReturnType<StudioLiveLockRepository["acquire"]>>;
    try {
      acquired = await this.studioLiveLockRepository.acquire({
        workId: parsed.data.workId,
        resourceId: parsed.data.resourceId,
        requestedLeaseId: crypto.randomUUID(),
        rotateLease: parsed.data.protocolVersion === STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
        ...(parsed.data.protocolVersion === STUDIO_LIVE_LOCK_PROTOCOL_VERSION && parsed.data.renewLeaseId
          ? { renewLeaseId: parsed.data.renewLeaseId }
          : {}),
        acquisitionId: createStudioLiveLockAcquisitionId(requestId, crypto.randomUUID()),
        ownerConnectionId: client.id,
        ownerName: authorized.value.name,
        leaseMs: parsed.data.leaseMs,
      });
    } catch (error) {
      this.logger.error(
        {
          workId: parsed.data.workId,
          resourceId: parsed.data.resourceId,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio distributed lock acquire failed"
      );
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "internal_error",
          "편집 잠금을 확인하지 못했습니다."
        )
      );
    }
    // ACL/session checks may finish before a slow database round-trip. If a same-work participant
    // generation or a concurrent forced recheck superseded the original snapshot, join that latest
    // authorization before publishing the already-serialized result. This is essential for v2
    // renewals: PostgreSQL may have rotated L1 -> L2, so returning a revocation without either
    // publishing L2 or rolling it back would strand an unannounced fence until TTL expiry.
    let currentAuthorization = authorized.value;
    while (!this.isParticipantAuthorizationCurrent(client, currentAuthorization, true)) {
      const refreshed = await this.runWithAuthorizedParticipant(
        client,
        parsed.data.workId,
        true,
        false,
        (participant) => participant
      );
      if (!refreshed) {
        if (acquired.status === "acquired") {
          await this.rollbackLockAcquireBestEffort(
            acquired.lock,
            parsed.data.protocolVersion === STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
            parsed.data.renewLeaseId
          );
        }
        return reply(
          ack,
          lockRequestFailure(
            requestId,
            "revoked",
            "forbidden",
            "이 원고를 편집할 권한이 없습니다."
          )
        );
      }
      currentAuthorization = refreshed.value;
      if (acquired.status === "acquired") {
        let current: StudioLiveLockRecord | undefined;
        try {
          current = (await this.studioLiveLockRepository.list(acquired.lock.workId)).find(
            (lock) => lock.resourceId === acquired.lock.resourceId
          );
        } catch {
          await this.rollbackLockAcquireBestEffort(
            acquired.lock,
            parsed.data.protocolVersion === STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
            parsed.data.renewLeaseId
          );
          return reply(
            ack,
            lockRequestFailure(
              requestId,
              "denied",
              "internal_error",
              "편집 잠금의 최신 상태를 확인하지 못했습니다."
            )
          );
        }
        if (
          !current ||
          current.leaseId !== acquired.lock.leaseId ||
          current.acquisitionId !== acquired.lock.acquisitionId ||
          current.ownerConnectionId !== acquired.lock.ownerConnectionId
        ) {
          return reply(
            ack,
            lockRequestFailure(
              requestId,
              "revoked",
              "lock_stale",
              "편집 잠금이 더 최신 요청으로 교체되었습니다.",
              current ? publicLock(current) : undefined
            )
          );
        }
      }
      // Recheck after the awaited row verification. If a newer ACL generation started while list()
      // was pending, loop and join it before the synchronous ACK/broadcast section below.
    }
    if (acquired.status === "conflict") {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "lock_conflict",
          `${acquired.lock.ownerName}님이 이 항목을 편집하고 있습니다.`,
          publicLock(acquired.lock)
        )
      );
    }
    if (acquired.status === "stale") {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "lock_stale",
          "편집 잠금 임대가 이미 변경되었거나 해제되었습니다.",
          acquired.lock ? publicLock(acquired.lock) : undefined
        )
      );
    }
    if (acquired.status === "limit") {
      return reply(
        ack,
        lockRequestFailure(
          requestId,
          "denied",
          "lock_limit",
          "동시에 잠글 수 있는 편집 항목 수를 초과했습니다."
        )
      );
    }
    const lock = publicLock(acquired.lock);
    const update: StudioLiveLockUpdate = {
      action: "acquired",
      requestId,
      lock,
      revision: lock.revision,
    };
    this.server.to(studioLiveRoom(parsed.data.workId)).emit("studio:lock:update", update);
    return reply(ack, { ok: true, data: { decision: "acquired", requestId, lock } });
      }
    );
  }

  @SubscribeMessage("studio:lock:release")
  async releaseLock(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveLockReleaseInput,
    @Ack() ack?: StudioLiveAckCallback<StudioLiveLockReleaseDecision>
  ) {
    const parsedRequestId = StudioLiveLockRequestIdSchema.safeParse(
      (body as { requestId?: unknown } | null)?.requestId
    );
    const requestId = parsedRequestId.success ? parsedRequestId.data : crypto.randomUUID();
    const parsed = StudioLiveLockReleaseSchema.safeParse(body);
    if (!parsed.success) {
      return reply(
        ack,
        lockReleaseFailure(
          requestId,
          "invalid_payload",
          "편집 잠금 해제 정보가 올바르지 않습니다."
        )
      );
    }
    // A socket can legitimately own the complete per-work lock set. Keep releases in a separate
    // abuse bucket, but never strand valid leases merely because the user closes a large batch.
    if (!this.consumeRateLimit(
      client.id,
      "lock-release",
      STUDIO_LIVE_LOCK_LIMIT_PER_WORK,
      60_000
    )) {
      return reply(
        ack,
        lockReleaseFailure(requestId, "rate_limited", "편집 잠금 해제 요청이 너무 많습니다.")
      );
    }
    return this.withSocketLockOperation(
      client.id,
      parsed.data.workId,
      parsed.data.resourceId,
      async () => {
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      true,
      false,
      (participant) => participant
    );
    if (!authorized) {
      return reply(
        ack,
        lockReleaseFailure(requestId, "forbidden", "이 원고를 편집할 권한이 없습니다.")
      );
    }
    let released: StudioLiveLockRecord | null;
    try {
      released = await this.studioLiveLockRepository.release({
        workId: parsed.data.workId,
        resourceId: parsed.data.resourceId,
        leaseId: parsed.data.leaseId,
        ownerConnectionId: client.id,
      });
    } catch (error) {
      this.logger.error(
        {
          workId: parsed.data.workId,
          resourceId: parsed.data.resourceId,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio distributed lock release failed"
      );
      return reply(
        ack,
        lockReleaseFailure(requestId, "internal_error", "편집 잠금을 해제하지 못했습니다.")
      );
    }
    if (released) {
      const update: StudioLiveLockUpdate = {
        action: "released",
        requestId: studioLiveLockRequestIdFromAcquisitionId(released.acquisitionId),
        releaseRequestId: requestId,
        resourceId: released.resourceId,
        leaseId: released.leaseId,
        revision: released.revision.toString(),
      };
      this.server.to(studioLiveRoom(parsed.data.workId)).emit("studio:lock:update", update);
    }
    return reply(ack, {
      ok: true,
      data: {
        requestId,
        resourceId: parsed.data.resourceId,
        leaseId: parsed.data.leaseId,
        released: released !== null,
        ...(released ? { revision: released.revision.toString() } : {}),
      },
    });
      }
    );
  }

  @SubscribeMessage("studio:screen:set")
  async setScreenSharing(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenStateInput,
    @Ack() ack?: StudioLiveAckCallback<{ participant: StudioLiveParticipant }>
  ) {
    const parsed = StudioLiveScreenStateSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "화면 공유 상태가 올바르지 않습니다."));
    if (!this.consumeRateLimit(client.id, "screen-set", 30, 60_000)) {
      return reply(ack, failure("rate_limited", "화면 공유 상태 갱신이 너무 많습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => {
        const activeShare = this.activeScreenShareForSocket(client, participant.workId);
        participant.sharingScreen = parsed.data.sharing;
        participant.updatedAt = new Date().toISOString();
        if (!parsed.data.sharing) {
          delete client.data.studioScreenShare;
          if (activeShare) {
            this.deleteCandidateRelayAuthorizationsForShare(
              participant.workId,
              activeShare.shareId,
              participant.connectionId
            );
            this.server.to(studioLiveRoom(participant.workId)).emit("studio:screen:stop", {
              fromConnectionId: participant.connectionId,
              fromName: participant.name,
              shareId: activeShare.shareId,
            });
          }
        }
        const safe = this.publishParticipantToSocketData(client, participant);
        this.server.to(studioLiveRoom(participant.workId)).emit("studio:presence:update", safe);
        return safe;
      }
    );
    if (!authorized) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    return reply(ack, { ok: true, data: { participant: authorized.value } });
  }

  @SubscribeMessage("studio:screen:announce")
  async announceScreenShare(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenAnnounceInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true }>
  ) {
    const parsed = StudioLiveScreenAnnounceSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "화면 공유 안내 정보가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "screen-announce", 30, 60_000)) {
      return reply(ack, failure("rate_limited", "화면 공유 안내 전송이 너무 많습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => {
        const previousShare = this.activeScreenShareForSocket(client, participant.workId);
        participant.sharingScreen = true;
        participant.updatedAt = new Date().toISOString();
        this.publishScreenShareToSocketData(
          client,
          participant,
          parsed.data.shareId,
          parsed.data.label
        );
        const room = this.server.to(studioLiveRoom(participant.workId));
        room.emit(
          "studio:presence:update",
          this.publishParticipantToSocketData(client, participant)
        );
        if (previousShare && previousShare.shareId !== parsed.data.shareId) {
          this.deleteCandidateRelayAuthorizationsForShare(
            participant.workId,
            previousShare.shareId,
            participant.connectionId
          );
          room.emit("studio:screen:stop", {
            fromConnectionId: participant.connectionId,
            fromName: participant.name,
            shareId: previousShare.shareId,
          });
        }
        room.emit("studio:screen:announce", {
          fromConnectionId: participant.connectionId,
          fromName: participant.name,
          shareId: parsed.data.shareId,
          label: parsed.data.label,
        });
      }
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    return reply(ack, { ok: true, data: { delivered: true } });
  }

  @SubscribeMessage("studio:screen:request")
  async requestScreenAccess(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenRequestInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true }>
  ) {
    const parsed = StudioLiveScreenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "화면 공유 접근 요청이 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "screen-request", 60, 60_000)) {
      return reply(ack, failure("rate_limited", "화면 공유 접근 요청이 너무 많습니다."));
    }
    const relay: StudioLiveInterServerRelayEvent = {
      type: "screen-request",
      shareId: parsed.data.shareId,
    };
    if (!this.hasLocalRelayTarget(parsed.data.targetConnectionId)) {
      const sender = await this.authorizeRemoteRelaySender(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 화면 공유 접근을 요청할 수 없습니다."
      );
      if (!sender.ok) return reply(ack, sender.response);
      const delivered = await this.sendInterServerRelay(
        sender.sender,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        relay
      );
      if (!delivered) {
        return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
      }
      return reply(ack, { ok: true, data: { delivered: true } });
    }

    let authorization = await this.authorizeRelayPeers(
      client,
      parsed.data.workId,
      parsed.data.targetConnectionId,
      "본인에게 화면 공유 접근을 요청할 수 없습니다."
    );
    while (authorization.ok && !this.isRelayAuthorizationCurrent(authorization)) {
      authorization = await this.authorizeRelayPeers(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 화면 공유 접근을 요청할 수 없습니다.",
        "rebase"
      );
    }
    if (!authorization.ok) return reply(ack, authorization.response);
    if (!this.emitAuthorizedLocalRelay(authorization, relay)) {
      return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
    }
    return reply(ack, { ok: true, data: { delivered: true } });
  }

  @SubscribeMessage("studio:screen:access")
  async relayScreenAccess(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenAccessInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true }>
  ) {
    const parsed = StudioLiveScreenAccessSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "화면 공유 접근 결정이 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "screen-access", 60, 60_000)) {
      return reply(ack, failure("rate_limited", "화면 공유 접근 결정 전송이 너무 많습니다."));
    }

    const relay: StudioLiveInterServerRelayEvent = {
      type: "screen-access",
      shareId: parsed.data.shareId,
      decision: parsed.data.decision,
    };
    if (!this.hasLocalRelayTarget(parsed.data.targetConnectionId)) {
      const sender = await this.authorizeRemoteRelaySender(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 화면 공유 접근 결정을 보낼 수 없습니다."
      );
      if (!sender.ok) return reply(ack, sender.response);
      if (parsed.data.decision === "rejected" || parsed.data.decision === "ended") {
        this.deleteCandidateRelayAuthorization(
          parsed.data.workId,
          parsed.data.shareId,
          sender.sender.connectionId,
          parsed.data.targetConnectionId
        );
      }
      const delivered = await this.sendInterServerRelay(
        sender.sender,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        relay
      );
      if (!delivered) {
        return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
      }
      return reply(ack, { ok: true, data: { delivered: true } });
    }

    let authorization = await this.authorizeRelayPeers(
      client,
      parsed.data.workId,
      parsed.data.targetConnectionId,
      "본인에게 화면 공유 접근 결정을 보낼 수 없습니다."
    );
    while (authorization.ok && !this.isRelayAuthorizationCurrent(authorization)) {
      authorization = await this.authorizeRelayPeers(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 화면 공유 접근 결정을 보낼 수 없습니다.",
        "rebase"
      );
    }
    if (!authorization.ok) return reply(ack, authorization.response);

    if (parsed.data.decision === "rejected" || parsed.data.decision === "ended") {
      this.deleteCandidateRelayAuthorization(
        parsed.data.workId,
        parsed.data.shareId,
        authorization.sender.connectionId,
        authorization.target.connectionId
      );
    }

    if (!this.emitAuthorizedLocalRelay(authorization, relay)) {
      return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
    }
    return reply(ack, { ok: true, data: { delivered: true } });
  }

  @SubscribeMessage("studio:screen:stop")
  async stopScreenShare(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenStopInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true }>
  ) {
    const parsed = StudioLiveScreenStopSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "화면 공유 종료 정보가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "screen-stop", 30, 60_000)) {
      return reply(ack, failure("rate_limited", "화면 공유 종료 전송이 너무 많습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => {
        const activeShare = this.activeScreenShareForSocket(client, participant.workId);
        // A delayed stop from an older getDisplayMedia lifecycle must not terminate the newer
        // share that replaced it on the same socket.
        if (activeShare && activeShare.shareId !== parsed.data.shareId) return;
        const shouldNotify = activeShare !== null || participant.sharingScreen;
        participant.sharingScreen = false;
        participant.updatedAt = new Date().toISOString();
        delete client.data.studioScreenShare;
        this.deleteCandidateRelayAuthorizationsForShare(
          participant.workId,
          parsed.data.shareId,
          participant.connectionId
        );
        const room = this.server.to(studioLiveRoom(participant.workId));
        room.emit(
          "studio:presence:update",
          this.publishParticipantToSocketData(client, participant)
        );
        if (!shouldNotify) return;
        room.emit("studio:screen:stop", {
          fromConnectionId: participant.connectionId,
          fromName: participant.name,
          shareId: parsed.data.shareId,
        });
      }
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    return reply(ack, { ok: true, data: { delivered: true } });
  }

  @SubscribeMessage("studio:voice:join")
  async joinVoice(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveVoiceJoinInput,
    @Ack() ack?: StudioLiveAckCallback<{ members: StudioLiveVoiceMember[] }>
  ) {
    if (!this.liveFeatures.voiceEnabled) {
      return reply(
        ack,
        failure("forbidden", "서버 비용 절감 정책으로 음성 대화가 비활성화되어 있습니다.")
      );
    }
    const parsed = StudioLiveVoiceJoinSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "음성 대화 참가 정보가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "voice-join", 20, 60_000)) {
      return reply(ack, failure("rate_limited", "음성 대화 참가 요청이 너무 많습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      true,
      (participant) => participant.role === "viewer" ? null : participant
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (!authorized.value) {
      return reply(ack, failure("forbidden", "보기 전용 권한으로는 음성 대화에 참여할 수 없습니다."));
    }
    type VoiceAdmission =
      | { status: "admitted"; membership: StudioLiveVoiceMemberInternal; members: StudioLiveVoiceMember[] }
      | { status: "full" }
      | { status: "changed" };
    let admission: VoiceAdmission;
    try {
      admission = await this.studioLiveLockRepository.withWorkMutation(
        parsed.data.workId,
        async (): Promise<VoiceAdmission> => {
          const participant = authorized.value;
          if (
            this.participantsBySocket.get(client.id) !== participant ||
            !this.isParticipantAuthorizationCurrent(client, participant, false) ||
            participant.role === "viewer"
          ) {
            return { status: "changed" };
          }
          const current = this.voiceMembershipBySocket.get(client.id);
          const discovered = await this.listVoiceMembers(
            parsed.data.workId,
            parsed.data.callId,
            { fallbackToLocal: false }
          );
          const otherMembers = discovered.filter((member) => member.connectionId !== client.id);
          if (otherMembers.length >= STUDIO_LIVE_VOICE_MAX_PARTICIPANTS) {
            if (current?.callId === parsed.data.callId) {
              this.removeVoiceMembership(client.id, "capacity");
            }
            return { status: "full" };
          }
          const membership: StudioLiveVoiceMemberInternal = {
            workId: participant.workId,
            connectionId: participant.connectionId,
            callId: parsed.data.callId,
            muted: parsed.data.muted,
          };
          if (current && current.callId !== membership.callId) {
            this.emitVoiceLeave(current, "switched");
          }
          this.voiceMembershipBySocket.set(client.id, membership);
          client.data.studioVoiceMember = this.publicVoiceMember(membership);
          const members = [...otherMembers, this.publicVoiceMember(membership)]
            .sort((left, right) => left.connectionId.localeCompare(right.connectionId));
          return { status: "admitted", membership, members };
        }
      );
    } catch (error) {
      this.logger.warn(
        {
          workId: parsed.data.workId,
          callId: parsed.data.callId,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio voice admission failed closed"
      );
      return reply(
        ack,
        failure("temporarily_unavailable", "음성 작업실 정원을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    }
    if (admission.status === "changed") {
      return reply(ack, failure("not_joined", "음성 대화 참가 상태가 변경되었습니다."));
    }
    if (admission.status === "full") {
      return reply(ack, failure("rate_limited", "음성 대화 정원은 최대 6명입니다."));
    }
    client.to(studioLiveRoom(parsed.data.workId)).emit("studio:voice:join", {
      connectionId: admission.membership.connectionId,
      callId: admission.membership.callId,
      muted: admission.membership.muted,
    });
    client.emit("studio:voice:snapshot", {
      workId: parsed.data.workId,
      callId: parsed.data.callId,
      members: admission.members,
    });
    return reply(ack, { ok: true, data: { members: admission.members } });
  }

  @SubscribeMessage("studio:voice:state")
  async updateVoiceState(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveVoiceStateInput,
    @Ack() ack?: StudioLiveAckCallback<{ member: StudioLiveVoiceMember }>
  ) {
    if (!this.liveFeatures.voiceEnabled) {
      return reply(
        ack,
        failure("forbidden", "서버 비용 절감 정책으로 음성 대화가 비활성화되어 있습니다.")
      );
    }
    const parsed = StudioLiveVoiceStateSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "음성 대화 상태가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "voice-state", 90, 60_000)) {
      return reply(ack, failure("rate_limited", "음성 대화 상태 변경이 너무 빠릅니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      false,
      (participant) => {
        const current = this.voiceMembershipBySocket.get(client.id);
        if (
          participant.role === "viewer" ||
          !current ||
          current.workId !== participant.workId ||
          current.callId !== parsed.data.callId
        ) return null;
        current.muted = parsed.data.muted;
        const member = this.publicVoiceMember(current);
        client.data.studioVoiceMember = member;
        client.to(studioLiveRoom(participant.workId)).emit("studio:voice:state", member);
        return member;
      }
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (!authorized.value) {
      return reply(ack, failure("forbidden", "현재 음성 대화의 상태만 변경할 수 있습니다."));
    }
    return reply(ack, { ok: true, data: { member: authorized.value } });
  }

  @SubscribeMessage("studio:voice:leave")
  async leaveVoice(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveVoiceLeaveInput,
    @Ack() ack?: StudioLiveAckCallback<{ left: true }>
  ) {
    if (!this.liveFeatures.voiceEnabled) {
      return reply(
        ack,
        failure("forbidden", "서버 비용 절감 정책으로 음성 대화가 비활성화되어 있습니다.")
      );
    }
    const parsed = StudioLiveVoiceLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "음성 대화 종료 정보가 올바르지 않습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      false,
      (participant) => {
        const current = this.voiceMembershipBySocket.get(client.id);
        if (
          !current ||
          current.workId !== participant.workId ||
          current.callId !== parsed.data.callId
        ) return false;
        this.removeVoiceMembership(client.id, "left");
        return true;
      }
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (!authorized.value) {
      return reply(ack, failure("invalid_payload", "현재 참가 중인 음성 대화와 일치하지 않습니다."));
    }
    return reply(ack, { ok: true, data: { left: true } });
  }

  @SubscribeMessage("studio:chat:send")
  async sendChatMessage(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveChatInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true; sentAt: string }>
  ) {
    const parsed = StudioLiveChatSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "채팅 메시지가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "chat", 20, 10_000)) {
      return reply(ack, failure("rate_limited", "채팅 메시지를 너무 빨리 보내고 있습니다."));
    }
    const authorized = await this.runWithAuthorizedParticipant(
      client,
      parsed.data.workId,
      false,
      false,
      (participant) => {
        // Chat is a write action: a view-only role must not broadcast text into the room.
        if (!participant.capabilities.comment && !participant.capabilities.edit) return null;
        const sentAt = new Date().toISOString();
        client.to(studioLiveRoom(participant.workId)).emit("studio:chat:message", {
          fromConnectionId: participant.connectionId,
          fromName: participant.name,
          messageId: parsed.data.messageId,
          text: parsed.data.text,
          sentAt,
        });
        return sentAt;
      }
    );
    if (!authorized) {
      return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    }
    if (authorized.value === null) {
      return reply(ack, failure("forbidden", "이 작품에서 채팅을 보낼 권한이 없습니다."));
    }
    return reply(ack, { ok: true, data: { delivered: true, sentAt: authorized.value } });
  }

  @SubscribeMessage("studio:voice:signal")
  async relayVoiceSignal(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveVoiceSignalInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true; signalId: string }>
  ) {
    if (!this.liveFeatures.voiceEnabled) {
      return reply(
        ack,
        failure("forbidden", "서버 비용 절감 정책으로 음성 대화가 비활성화되어 있습니다.")
      );
    }
    const parsed = StudioLiveVoiceSignalSchema.safeParse(body);
    if (!parsed.success) {
      return reply(ack, failure("invalid_payload", "음성 WebRTC 연결 정보가 올바르지 않습니다."));
    }
    if (!this.consumeRateLimit(client.id, "voice-signal", 240, 60_000)) {
      return reply(ack, failure("rate_limited", "음성 WebRTC 연결 요청이 너무 많습니다."));
    }
    const signalId = crypto.randomUUID();
    const relay = this.voiceSignalRelayEvent(signalId, parsed.data);
    if (!this.hasLocalRelayTarget(parsed.data.targetConnectionId)) {
      const sender = await this.authorizeRemoteRelaySender(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 음성 WebRTC 연결 정보를 보낼 수 없습니다."
      );
      if (!sender.ok) return reply(ack, sender.response);
      const membership = this.voiceMembershipBySocket.get(sender.sender.connectionId);
      if (
        sender.sender.role === "viewer" ||
        !membership ||
        membership.workId !== parsed.data.workId ||
        membership.callId !== parsed.data.callId
      ) {
        return reply(ack, failure("forbidden", "같은 음성 대화에 참가한 팀원만 연결할 수 있습니다."));
      }
      const delivered = await this.sendInterServerRelay(
        sender.sender,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        relay
      );
      if (!delivered) {
        return reply(ack, failure("peer_unavailable", "같은 음성 대화에 참가한 팀원이 없습니다."));
      }
      return reply(ack, { ok: true, data: { delivered: true, signalId } });
    }

    let authorization = await this.authorizeRelayPeers(
      client,
      parsed.data.workId,
      parsed.data.targetConnectionId,
      "본인에게 음성 WebRTC 연결 정보를 보낼 수 없습니다."
    );
    while (authorization.ok && !this.isRelayAuthorizationCurrent(authorization)) {
      authorization = await this.authorizeRelayPeers(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 음성 WebRTC 연결 정보를 보낼 수 없습니다.",
        "rebase"
      );
    }
    if (!authorization.ok) return reply(ack, authorization.response);
    if (!this.voiceRelayPeersMatch(authorization, parsed.data.callId)) {
      return reply(ack, failure("forbidden", "같은 음성 대화에 참가한 팀원만 연결할 수 있습니다."));
    }
    if (!this.emitAuthorizedLocalRelay(authorization, relay)) {
      return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
    }
    return reply(ack, { ok: true, data: { delivered: true, signalId } });
  }

  @SubscribeMessage("studio:signal")
  async relaySignal(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveSignalInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true; signalId: string }>
  ) {
    if (!this.consumeRateLimit(client.id, "signal", 240, 60_000)) {
      return reply(ack, failure("rate_limited", "WebRTC 연결 요청이 너무 많습니다."));
    }
    const parsed = StudioLiveSignalSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "WebRTC 연결 정보가 올바르지 않습니다."));
    const signalId = crypto.randomUUID();
    const relay = this.signalRelayEvent(signalId, parsed.data);
    if (!this.hasLocalRelayTarget(parsed.data.targetConnectionId)) {
      const sender = await this.authorizeRemoteRelaySender(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 WebRTC 연결 정보를 보낼 수 없습니다."
      );
      if (!sender.ok) return reply(ack, sender.response);
      if (parsed.data.kind === "bye") {
        this.deleteCandidateRelayAuthorization(
          parsed.data.workId,
          parsed.data.shareId,
          sender.sender.connectionId,
          parsed.data.targetConnectionId
        );
      }
      const delivered = await this.sendInterServerRelay(
        sender.sender,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        relay
      );
      if (!delivered) {
        return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
      }
      return reply(ack, { ok: true, data: { delivered: true, signalId } });
    }
    const cachedCandidateAuthorization =
      parsed.data.kind === "candidate"
        ? this.cachedCandidateRelayAuthorization(
            client,
            parsed.data.workId,
            parsed.data.targetConnectionId,
            parsed.data.shareId
          )
        : null;
    let authorization =
      cachedCandidateAuthorization ??
      (await this.authorizeRelayPeers(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 WebRTC 연결 정보를 보낼 수 없습니다.",
        parsed.data.kind === "candidate" ? "candidate-coalesced" : "force"
      ));
    while (authorization.ok && !this.isRelayAuthorizationCurrent(authorization)) {
      authorization = await this.authorizeRelayPeers(
        client,
        parsed.data.workId,
        parsed.data.targetConnectionId,
        "본인에게 WebRTC 연결 정보를 보낼 수 없습니다.",
        "rebase"
      );
    }
    if (!authorization.ok) return reply(ack, authorization.response);
    if (!this.emitAuthorizedLocalRelay(authorization, relay)) {
      return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
    }
    if (parsed.data.kind === "description") {
      this.rememberCandidateRelayAuthorization(
        parsed.data.workId,
        parsed.data.shareId,
        authorization.sender,
        authorization.target,
        true
      );
    } else if (parsed.data.kind === "candidate" && !cachedCandidateAuthorization) {
      this.rememberCandidateRelayAuthorization(
        parsed.data.workId,
        parsed.data.shareId,
        authorization.sender,
        authorization.target,
        false
      );
    } else if (parsed.data.kind === "bye") {
      this.deleteCandidateRelayAuthorization(
        parsed.data.workId,
        parsed.data.shareId,
        authorization.sender.connectionId,
        authorization.target.connectionId
      );
    }
    return reply(ack, { ok: true, data: { delivered: true, signalId } });
  }

  private hasLocalRelayTarget(connectionId: string): boolean {
    return (
      this.participantsBySocket.has(connectionId) ||
      this.server.sockets.has(connectionId)
    );
  }

  private async authorizeRemoteRelaySender(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    selfTargetMessage: string
  ): Promise<StudioLiveRelaySenderAuthorization> {
    const sender = await this.authorizedParticipantWithMode(
      client,
      workId,
      false,
      "force"
    );
    if (!sender) {
      return {
        ok: false,
        response: failure("not_joined", "실시간 작업실에 다시 참여해 주세요."),
      };
    }
    if (sender.connectionId === targetConnectionId) {
      return {
        ok: false,
        response: failure("peer_unavailable", selfTargetMessage),
      };
    }

    // Match the local relay's sender-side rebase boundary. If a newer forced ACL/session check
    // starts while this one is awaiting I/O, join that generation before exposing the sender.
    while (true) {
      const current = await this.authorizedParticipant(client, workId, false);
      if (current !== sender) {
        return {
          ok: false,
          response: failure("not_joined", "실시간 작업실에 다시 참여해 주세요."),
        };
      }
      if (this.isParticipantAuthorizationCurrent(client, sender, false)) {
        return { ok: true, sender };
      }
    }
  }

  private async sendInterServerRelay(
    sender: StudioLiveParticipantInternal,
    workId: string,
    targetConnectionId: string,
    relay: StudioLiveInterServerRelayEvent
  ): Promise<boolean> {
    const request = StudioLiveInterServerRelayRequestSchema.parse({
      workId,
      targetConnectionId,
      deadlineAt: Date.now() + STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS,
      sender: publicParticipant(sender),
      relay,
    });
    return this.interServerRelayTransport.send(request);
  }

  private async receiveInterServerRelay(request: unknown): Promise<boolean> {
    const parsed = StudioLiveInterServerRelayRequestSchema.safeParse(request);
    if (!parsed.success) return false;
    if (parsed.data.relay.type === "voice-signal" && !this.liveFeatures.voiceEnabled) {
      return false;
    }
    const { workId, targetConnectionId, deadlineAt, sender, relay } = parsed.data;
    const now = Date.now();
    if (
      sender.connectionId === targetConnectionId ||
      deadlineAt <= now ||
      deadlineAt - now > STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS * 2
    ) {
      return false;
    }

    const targetSocket = this.server.sockets.get(targetConnectionId) as
      | StudioLiveSocket
      | undefined;
    const expectedTarget = this.participantsBySocket.get(targetConnectionId);
    if (!targetSocket || !expectedTarget || expectedTarget.workId !== workId) return false;

    const target = await this.authorizedParticipantWithMode(
      targetSocket,
      workId,
      false,
      "force"
    );
    if (Date.now() >= deadlineAt || target !== expectedTarget) return false;

    // This is the target-only counterpart of authorizeRelayPeers' strong rebase loop. Voice relays
    // perform distributed discovery next and then take one more no-await target snapshot before emit.
    while (true) {
      const current = await this.authorizedParticipant(targetSocket, workId, false);
      if (Date.now() >= deadlineAt || current !== target) return false;
      if (this.isParticipantAuthorizationCurrent(targetSocket, target, false)) break;
    }
    if (Date.now() >= deadlineAt) return false;

    let relaySender = sender;
    if (relay.type === "voice-signal") {
      const targetVoice = this.voiceMembershipBySocket.get(target.connectionId);
      if (
        sender.role === "viewer" ||
        target.role === "viewer" ||
        !targetVoice ||
        targetVoice.workId !== workId ||
        targetVoice.callId !== relay.callId
      ) return false;

      // The origin node authorized the sender before issuing this RPC, but authorization and voice
      // membership can be revoked while the relay crosses the adapter. Re-read the adapter-visible,
      // public discovery records on the target node and fail closed if either exact socket
      // generation is no longer in this work/call. There is intentionally no local fallback.
      const discovered = await this.discoverVoiceRelayPeers(
        workId,
        sender,
        target,
        relay.callId,
        deadlineAt
      );
      if (!discovered || Date.now() >= deadlineAt) return false;

      // No await is allowed from this final target authorization/membership snapshot through the
      // direct socket emit. It closes target-side ACL, room-switch, leave, and duplicate races.
      const finalTargetVoice = this.voiceMembershipBySocket.get(target.connectionId);
      if (
        this.participantsBySocket.get(target.connectionId) !== target ||
        !this.isParticipantAuthorizationCurrent(targetSocket, target, false) ||
        !finalTargetVoice ||
        finalTargetVoice.workId !== workId ||
        finalTargetVoice.callId !== relay.callId ||
        discovered.target.clientInstanceId !== target.clientInstanceId ||
        discovered.target.joinedAt !== target.joinedAt ||
        !this.consumeInterServerVoiceSignal(
          workId,
          discovered.sender.connectionId,
          target.connectionId,
          relay.callId,
          relay.signalId
        )
      ) return false;
      relaySender = discovered.sender;
    }

    if (
      relay.type === "screen-access" &&
      (relay.decision === "rejected" || relay.decision === "ended")
    ) {
      this.deleteCandidateRelayAuthorization(
        workId,
        relay.shareId,
        sender.connectionId,
        target.connectionId
      );
    } else if (relay.type === "signal" && relay.kind === "bye") {
      this.deleteCandidateRelayAuthorization(
        workId,
        relay.shareId,
        sender.connectionId,
        target.connectionId
      );
    }

    this.emitRelayToSocket(targetSocket, relaySender, relay);
    return true;
  }

  private async discoverVoiceRelayPeers(
    workId: string,
    expectedSender: StudioLiveParticipant,
    expectedTarget: StudioLiveParticipantInternal,
    callId: string,
    deadlineAt: number
  ): Promise<StudioLiveVoiceRelayDiscovery | null> {
    const timeoutMs = Math.min(
      STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS,
      deadlineAt - Date.now()
    );
    if (timeoutMs <= 0) return null;
    let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const sockets = await Promise.race([
        this.server.in(studioLiveRoom(workId)).fetchSockets(),
        new Promise<never>((_resolve, reject) => {
          discoveryTimeout = setTimeout(
            () => reject(new Error("studio voice relay discovery timed out")),
            timeoutMs
          );
          discoveryTimeout.unref?.();
        }),
      ]);
      let sender: StudioLiveParticipant | null = null;
      let target: StudioLiveParticipant | null = null;
      for (const socket of sockets) {
        if (
          socket.id !== expectedSender.connectionId &&
          socket.id !== expectedTarget.connectionId
        ) continue;
        const data = socket.data as StudioLiveSocketData;
        const participant = StudioLivePublicParticipantSchema.safeParse(data.studioParticipant);
        const voice = StudioLiveVoiceMemberSchema.safeParse(data.studioVoiceMember);
        if (
          data.studioWorkId !== workId ||
          !participant.success ||
          participant.data.connectionId !== socket.id ||
          participant.data.role === "viewer" ||
          !voice.success ||
          voice.data.connectionId !== socket.id ||
          voice.data.callId !== callId
        ) continue;
        if (socket.id === expectedSender.connectionId) {
          if (
            sender ||
            participant.data.clientInstanceId !== expectedSender.clientInstanceId ||
            participant.data.joinedAt !== expectedSender.joinedAt
          ) return null;
          sender = participant.data;
        } else {
          if (
            target ||
            participant.data.clientInstanceId !== expectedTarget.clientInstanceId ||
            participant.data.joinedAt !== expectedTarget.joinedAt
          ) return null;
          target = participant.data;
        }
      }
      return sender && target ? { sender, target } : null;
    } catch (error) {
      this.logger.warn(
        {
          workId,
          callId,
          senderConnectionId: expectedSender.connectionId,
          targetConnectionId: expectedTarget.connectionId,
          error: error instanceof Error ? error.message : "unknown",
        },
        "studio voice relay adapter discovery failed closed"
      );
      return null;
    } finally {
      if (discoveryTimeout) clearTimeout(discoveryTimeout);
    }
  }

  private consumeInterServerVoiceSignal(
    workId: string,
    senderConnectionId: string,
    targetConnectionId: string,
    callId: string,
    signalId: string
  ): boolean {
    const now = Date.now();
    for (const [key, expiresAt] of this.deliveredInterServerVoiceSignals) {
      if (expiresAt <= now) this.deliveredInterServerVoiceSignals.delete(key);
    }
    const key = JSON.stringify([
      workId,
      senderConnectionId,
      targetConnectionId,
      callId,
      signalId,
    ]);
    if (this.deliveredInterServerVoiceSignals.has(key)) return false;
    while (
      this.deliveredInterServerVoiceSignals.size >= STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_LIMIT
    ) {
      const oldestKey = this.deliveredInterServerVoiceSignals.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) break;
      this.deliveredInterServerVoiceSignals.delete(oldestKey);
    }
    this.deliveredInterServerVoiceSignals.set(
      key,
      now + STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_TTL_MS
    );
    return true;
  }

  private emitRelayToSocket(
    targetSocket: StudioLiveSocket,
    sender: StudioLiveParticipant,
    relay: StudioLiveInterServerRelayEvent
  ): void {
    if (relay.type === "screen-request") {
      targetSocket.emit("studio:screen:request", {
        fromConnectionId: sender.connectionId,
        fromName: sender.name,
        shareId: relay.shareId,
      });
      return;
    }
    if (relay.type === "screen-access") {
      targetSocket.emit("studio:screen:access", {
        fromConnectionId: sender.connectionId,
        fromName: sender.name,
        shareId: relay.shareId,
        decision: relay.decision,
      });
      return;
    }
    if (relay.type === "voice-signal") {
      const { type: _type, ...signal } = relay;
      targetSocket.emit("studio:voice:signal", {
        fromConnectionId: sender.connectionId,
        fromName: sender.name,
        ...signal,
      });
      return;
    }
    const { type: _type, ...signal } = relay;
    targetSocket.emit("studio:signal", {
      fromConnectionId: sender.connectionId,
      fromName: sender.name,
      ...signal,
    });
  }

  private emitAuthorizedLocalRelay(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>,
    relay: StudioLiveInterServerRelayEvent
  ): boolean {
    if (!this.isRelayAuthorizationCurrent(authorization)) return false;
    const targetSocket = this.server.sockets.get(authorization.target.connectionId) as
      | StudioLiveSocket
      | undefined;
    if (!targetSocket) return false;
    this.emitRelayToSocket(targetSocket, publicParticipant(authorization.sender), relay);
    return true;
  }

  private signalRelayEvent(
    signalId: string,
    signal: StudioLiveSignalInput
  ): StudioLiveInterServerRelayEvent {
    if (signal.kind === "description") {
      return {
        type: "signal",
        signalId,
        shareId: signal.shareId,
        kind: signal.kind,
        description: signal.description,
      };
    }
    if (signal.kind === "candidate") {
      return {
        type: "signal",
        signalId,
        shareId: signal.shareId,
        kind: signal.kind,
        candidate: signal.candidate,
      };
    }
    return {
      type: "signal",
      signalId,
      shareId: signal.shareId,
      kind: signal.kind,
    };
  }

  private voiceSignalRelayEvent(
    signalId: string,
    signal: StudioLiveVoiceSignalInput
  ): StudioLiveInterServerRelayEvent {
    if (signal.kind === "description") {
      return {
        type: "voice-signal",
        signalId,
        callId: signal.callId,
        kind: signal.kind,
        description: signal.description,
      };
    }
    return {
      type: "voice-signal",
      signalId,
      callId: signal.callId,
      kind: signal.kind,
      candidate: signal.candidate,
    };
  }

  private voiceRelayPeersMatch(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>,
    callId: string
  ): boolean {
    if (
      authorization.sender.role === "viewer" ||
      authorization.target.role === "viewer"
    ) return false;
    const sender = this.voiceMembershipBySocket.get(authorization.sender.connectionId);
    const target = this.voiceMembershipBySocket.get(authorization.target.connectionId);
    return Boolean(
      sender &&
      target &&
      sender.workId === authorization.sender.workId &&
      target.workId === authorization.target.workId &&
      sender.callId === callId &&
      target.callId === callId
    );
  }

  private candidateRelayAuthorizationKey(
    workId: string,
    shareId: string,
    firstConnectionId: string,
    secondConnectionId: string
  ): string {
    const [leftConnectionId, rightConnectionId] = [firstConnectionId, secondConnectionId].sort();
    return JSON.stringify([workId, shareId, leftConnectionId, rightConnectionId]);
  }

  private cachedCandidateRelayAuthorization(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    shareId: string
  ): Extract<StudioLivePeerRelayAuthorization, { ok: true }> | null {
    const sender = this.participantsBySocket.get(client.id);
    const target = this.participantsBySocket.get(targetConnectionId);
    const targetSocket = this.server.sockets.get(targetConnectionId) as
      | StudioLiveSocket
      | undefined;
    if (
      !sender ||
      !target ||
      !targetSocket ||
      sender.connectionId === target.connectionId ||
      sender.workId !== workId ||
      target.workId !== workId
    ) {
      return null;
    }
    const key = this.candidateRelayAuthorizationKey(
      workId,
      shareId,
      sender.connectionId,
      target.connectionId
    );
    const cached = this.candidateRelayAuthorizations.get(key);
    if (!cached) return null;
    const now = Date.now();
    const [left, right] =
      sender.connectionId < target.connectionId ? [sender, target] : [target, sender];
    const leftSocket = this.server.sockets.get(left.connectionId) as
      | StudioLiveSocket
      | undefined;
    const rightSocket = this.server.sockets.get(right.connectionId) as
      | StudioLiveSocket
      | undefined;
    const leftPrincipal = leftSocket
      ? this.socketAuthentication.principal(leftSocket)
      : undefined;
    const rightPrincipal = rightSocket
      ? this.socketAuthentication.principal(rightSocket)
      : undefined;
    const leftRecheck = this.participantAuthorizationRechecks.get(left.connectionId);
    const rightRecheck = this.participantAuthorizationRechecks.get(right.connectionId);
    const valid =
      cached.expiresAt > now &&
      cached.workId === workId &&
      cached.shareId === shareId &&
      cached.left === left &&
      cached.right === right &&
      cached.leftAuthorizationSequence === left.authorizationSequence &&
      cached.rightAuthorizationSequence === right.authorizationSequence &&
      cached.leftPrincipal === leftPrincipal &&
      cached.rightPrincipal === rightPrincipal &&
      Boolean(leftPrincipal && leftPrincipal.expiresAt > now) &&
      Boolean(rightPrincipal && rightPrincipal.expiresAt > now) &&
      leftPrincipal?.userId === left.userId &&
      rightPrincipal?.userId === right.userId &&
      this.isSocketCurrent(leftSocket as StudioLiveSocket) &&
      this.isSocketCurrent(rightSocket as StudioLiveSocket) &&
      leftRecheck?.participant !== left &&
      rightRecheck?.participant !== right;
    if (!valid) {
      this.candidateRelayAuthorizations.delete(key);
      return null;
    }
    return {
      ok: true,
      sender,
      senderAuthorizationSequence: sender.authorizationSequence,
      senderPrincipal:
        sender.connectionId === left.connectionId ? cached.leftPrincipal : cached.rightPrincipal,
      target,
      targetAuthorizationSequence: target.authorizationSequence,
      targetPrincipal:
        target.connectionId === left.connectionId ? cached.leftPrincipal : cached.rightPrincipal,
    };
  }

  private relayAuthorizationSnapshot(
    sender: StudioLiveParticipantInternal,
    target: StudioLiveParticipantInternal
  ): Extract<StudioLivePeerRelayAuthorization, { ok: true }> | null {
    const senderSocket = this.server.sockets.get(sender.connectionId) as
      | StudioLiveSocket
      | undefined;
    const targetSocket = this.server.sockets.get(target.connectionId) as
      | StudioLiveSocket
      | undefined;
    const senderPrincipal = senderSocket
      ? this.socketAuthentication.principal(senderSocket)
      : undefined;
    const targetPrincipal = targetSocket
      ? this.socketAuthentication.principal(targetSocket)
      : undefined;
    const now = Date.now();
    if (
      !senderSocket ||
      !targetSocket ||
      !senderPrincipal ||
      !targetPrincipal ||
      senderPrincipal.expiresAt <= now ||
      targetPrincipal.expiresAt <= now ||
      senderPrincipal.userId !== sender.userId ||
      targetPrincipal.userId !== target.userId ||
      sender.workId !== target.workId ||
      this.participantsBySocket.get(sender.connectionId) !== sender ||
      this.participantsBySocket.get(target.connectionId) !== target ||
      !this.isSocketCurrent(senderSocket) ||
      !this.isSocketCurrent(targetSocket) ||
      this.participantAuthorizationRechecks.get(sender.connectionId)?.participant === sender ||
      this.participantAuthorizationRechecks.get(target.connectionId)?.participant === target
    ) {
      return null;
    }
    return {
      ok: true,
      sender,
      senderAuthorizationSequence: sender.authorizationSequence,
      senderPrincipal,
      target,
      targetAuthorizationSequence: target.authorizationSequence,
      targetPrincipal,
    };
  }

  private isRelayAuthorizationCurrent(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>
  ): boolean {
    const snapshot = this.relayAuthorizationSnapshot(
      authorization.sender,
      authorization.target
    );
    return Boolean(
      snapshot &&
      snapshot.senderAuthorizationSequence === authorization.senderAuthorizationSequence &&
      snapshot.targetAuthorizationSequence === authorization.targetAuthorizationSequence &&
      snapshot.senderPrincipal === authorization.senderPrincipal &&
      snapshot.targetPrincipal === authorization.targetPrincipal
    );
  }

  private rememberCandidateRelayAuthorization(
    workId: string,
    shareId: string,
    first: StudioLiveParticipantInternal,
    second: StudioLiveParticipantInternal,
    refresh: boolean
  ): void {
    const [left, right] =
      first.connectionId < second.connectionId ? [first, second] : [second, first];
    const leftSocket = this.server.sockets.get(left.connectionId) as
      | StudioLiveSocket
      | undefined;
    const rightSocket = this.server.sockets.get(right.connectionId) as
      | StudioLiveSocket
      | undefined;
    const leftPrincipal = leftSocket
      ? this.socketAuthentication.principal(leftSocket)
      : undefined;
    const rightPrincipal = rightSocket
      ? this.socketAuthentication.principal(rightSocket)
      : undefined;
    const now = Date.now();
    if (
      !leftSocket ||
      !rightSocket ||
      !leftPrincipal ||
      !rightPrincipal ||
      leftPrincipal.expiresAt <= now ||
      rightPrincipal.expiresAt <= now ||
      this.participantsBySocket.get(left.connectionId) !== left ||
      this.participantsBySocket.get(right.connectionId) !== right ||
      !this.isSocketCurrent(leftSocket) ||
      !this.isSocketCurrent(rightSocket)
    ) {
      return;
    }
    this.purgeExpiredCandidateRelayAuthorizations(now);
    const key = this.candidateRelayAuthorizationKey(
      workId,
      shareId,
      left.connectionId,
      right.connectionId
    );
    if (!refresh && this.candidateRelayAuthorizations.has(key)) return;
    if (!this.candidateRelayAuthorizations.has(key)) {
      while (
        this.candidateRelayAuthorizations.size >=
        STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_LIMIT
      ) {
        const oldestKey = this.candidateRelayAuthorizations.keys().next().value as
          | string
          | undefined;
        if (!oldestKey) break;
        this.candidateRelayAuthorizations.delete(oldestKey);
      }
    } else {
      this.candidateRelayAuthorizations.delete(key);
    }
    this.candidateRelayAuthorizations.set(key, {
      workId,
      shareId,
      left,
      leftAuthorizationSequence: left.authorizationSequence,
      leftPrincipal,
      right,
      rightAuthorizationSequence: right.authorizationSequence,
      rightPrincipal,
      expiresAt: now + STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_MS,
    });
  }

  private purgeExpiredCandidateRelayAuthorizations(now = Date.now()): void {
    for (const [key, authorization] of this.candidateRelayAuthorizations) {
      if (authorization.expiresAt <= now) this.candidateRelayAuthorizations.delete(key);
    }
  }

  private deleteCandidateRelayAuthorization(
    workId: string,
    shareId: string,
    firstConnectionId: string,
    secondConnectionId: string
  ): void {
    this.candidateRelayAuthorizations.delete(
      this.candidateRelayAuthorizationKey(
        workId,
        shareId,
        firstConnectionId,
        secondConnectionId
      )
    );
  }

  private deleteCandidateRelayAuthorizationsForShare(
    workId: string,
    shareId: string,
    connectionId: string
  ): void {
    for (const [key, authorization] of this.candidateRelayAuthorizations) {
      if (
        authorization.workId === workId &&
        authorization.shareId === shareId &&
        (authorization.left.connectionId === connectionId ||
          authorization.right.connectionId === connectionId)
      ) {
        this.candidateRelayAuthorizations.delete(key);
      }
    }
  }

  private deleteCandidateRelayAuthorizationsForSocket(connectionId: string): void {
    for (const [key, authorization] of this.candidateRelayAuthorizations) {
      if (
        authorization.left.connectionId === connectionId ||
        authorization.right.connectionId === connectionId
      ) {
        this.candidateRelayAuthorizations.delete(key);
      }
    }
  }

  private async authorizeRelayPeers(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    selfTargetMessage: string,
    authorizationMode: "candidate-coalesced" | "force" | "rebase" = "force"
  ): Promise<StudioLivePeerRelayAuthorization> {
    const authorizeParticipant = (socket: StudioLiveSocket) =>
      authorizationMode === "candidate-coalesced"
        ? this.authorizedParticipantWithMode(
            socket,
            workId,
            false,
            "coalesced-force"
          )
        : this.authorizedParticipantWithMode(
            socket,
            workId,
            false,
            authorizationMode === "force" ? "force" : "cached"
          );
    const sender = await authorizeParticipant(client);
    if (!sender) {
      return {
        ok: false,
        response: failure("not_joined", "실시간 작업실에 다시 참여해 주세요."),
      };
    }
    if (targetConnectionId === sender.connectionId) {
      return {
        ok: false,
        response: failure("peer_unavailable", selfTargetMessage),
      };
    }

    const targetSocket = this.server.sockets.get(targetConnectionId) as
      | StudioLiveSocket
      | undefined;
    const target = this.participantsBySocket.get(targetConnectionId);
    if (!targetSocket || !target || target.workId !== sender.workId) {
      return {
        ok: false,
        response: failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."),
      };
    }
    const authorizedTarget = await authorizeParticipant(targetSocket);
    if (!authorizedTarget || authorizedTarget !== target) {
      return {
        ok: false,
        response: failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."),
      };
    }

    // Either peer can start a newer global authorization while the other peer is being checked.
    // Rebase both sides until one no-await snapshot observes the same participant generations,
    // principals, sockets, and no in-flight check for either connection.
    while (true) {
      const currentSender = await this.authorizedParticipant(client, workId, false);
      if (currentSender !== sender) {
        return {
          ok: false,
          response: failure("not_joined", "실시간 작업실에 다시 참여해 주세요."),
        };
      }
      const currentTarget = await this.authorizedParticipant(targetSocket, workId, false);
      if (currentTarget !== authorizedTarget) {
        return {
          ok: false,
          response: failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."),
        };
      }
      const snapshot = this.relayAuthorizationSnapshot(sender, authorizedTarget);
      if (snapshot) return snapshot;
    }
  }

  private isSocketCurrent(client: StudioLiveSocket): boolean {
    return this.server.sockets.get(client.id) === client;
  }

  private isSocketPrincipalCurrent(
    client: StudioLiveSocket,
    principal: StudioLiveAuthPrincipal,
    userId: string
  ): boolean {
    return (
      this.isSocketCurrent(client) &&
      this.socketAuthentication.isPrincipalCurrent(client, principal, userId)
    );
  }

  private currentJoinedCrdtParticipant(
    client: StudioLiveSocket,
    workId: string
  ): StudioLiveParticipantInternal | null {
    const participant = this.participantsBySocket.get(client.id);
    const principal = this.socketAuthentication.principal(client);
    if (
      !participant ||
      participant.workId !== workId ||
      !principal ||
      !this.isSocketPrincipalCurrent(client, principal, participant.userId)
    ) {
      return null;
    }
    return participant;
  }

  private disconnectInvalidJoinSession(client: StudioLiveSocket): void {
    // A reconnect may reuse the Socket.IO id while speculative adapter cleanup is pending. Never
    // tear down that replacement socket or its participant when this join belongs to the old one.
    if (!this.isSocketCurrent(client)) {
      this.socketAuthentication.clear(client);
      client.disconnect(true);
      return;
    }
    const participant = this.participantsBySocket.get(client.id);
    if (participant) {
      this.disconnectInvalidSession(client.id, participant);
      return;
    }
    this.participantAuthorizationRechecks.delete(client.id);
    this.deleteCandidateRelayAuthorizationsForSocket(client.id);
    this.rateLimits.delete(client.id);
    this.socketAuthentication.clear(client);
    client.disconnect(true);
  }

  private isCurrentJoinTransition(client: StudioLiveSocket, transitionSequence: number): boolean {
    return this.currentRoomTransitionState(client, transitionSequence) === "current";
  }

  private currentRoomTransitionState(
    client: StudioLiveSocket,
    transitionSequence: number
  ): StudioLiveRoomTransitionState {
    if (!this.isSocketCurrent(client)) return "socket_stale";
    return this.joinTransitions.isCurrent(client.id, transitionSequence)
      ? "current"
      : "generation_stale";
  }

  private disconnectRoomIsolationFailure(client: StudioLiveSocket): void {
    this.socketAuthentication.clear(client);
    client.disconnect(true);
  }

  private removeSwitchedParticipantIfCurrent(
    socketId: string,
    expectedParticipant: StudioLiveParticipantInternal
  ): void {
    if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;
    this.removeParticipant(socketId, "switch");
  }

  private consumeRateLimit(
    socketId: string,
    action: string,
    maximum: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const socketBuckets = this.rateLimits.get(socketId) ?? new Map<string, RateLimitBucket>();
    const bucket = socketBuckets.get(action);
    if (!bucket || bucket.resetsAt <= now) {
      socketBuckets.set(action, { count: 1, resetsAt: now + windowMs });
      this.rateLimits.set(socketId, socketBuckets);
      return true;
    }
    if (bucket.count >= maximum) return false;
    bucket.count += 1;
    return true;
  }

  private isParticipantAuthorizationCurrent(
    client: StudioLiveSocket,
    participant: StudioLiveParticipantInternal,
    requireEdit: boolean
  ): boolean {
    const principal = this.socketAuthentication.principal(client);
    const recheck = this.participantAuthorizationRechecks.get(client.id);
    return Boolean(
      principal &&
      principal.expiresAt > Date.now() &&
      isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt) &&
      principal.userId === participant.userId &&
      this.participantsBySocket.get(client.id) === participant &&
      this.isSocketCurrent(client) &&
      recheck?.participant !== participant &&
      (!requireEdit || participant.capabilities.edit)
    );
  }

  private async runWithAuthorizedParticipant<T>(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    forceRecheck: boolean,
    action: (participant: StudioLiveParticipantInternal) => T
  ): Promise<{ value: T } | null> {
    let force = forceRecheck;
    while (true) {
      const participant = await this.authorizedParticipant(
        client,
        workId,
        requireEdit,
        force
      );
      force = false;
      if (!participant) return null;
      if (!this.isParticipantAuthorizationCurrent(client, participant, requireEdit)) continue;
      return { value: action(participant) };
    }
  }

  private async authorizedParticipant(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    forceRecheck = false
  ): Promise<StudioLiveParticipantInternal | null> {
    return this.authorizedParticipantWithMode(
      client,
      workId,
      requireEdit,
      forceRecheck ? "force" : "cached"
    );
  }

  private async authorizedParticipantWithMode(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    initialMode: "cached" | "coalesced-force" | "force" | "sweep"
  ): Promise<StudioLiveParticipantInternal | null> {
    let mode = initialMode;
    while (true) {
      const participant = this.participantsBySocket.get(client.id);
      if (
        !participant ||
        participant.workId !== workId ||
        !this.isSocketCurrent(client)
      ) {
        return null;
      }
      const principal = this.socketAuthentication.principal(client);
      if (
        !principal ||
        principal.userId !== participant.userId ||
        principal.expiresAt <= Date.now()
      ) {
        this.disconnectInvalidSession(client.id, participant);
        return null;
      }

      let recheck = this.participantAuthorizationRechecks.get(client.id);
      if (recheck?.participant !== participant) recheck = undefined;
      if (mode === "force") {
        recheck = this.startParticipantAuthorizationRecheck(client.id, participant);
      } else if (
        !recheck &&
        mode === "cached" &&
        Date.now() - participant.authorizedAt < STUDIO_LIVE_ACCESS_CACHE_MS &&
        isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt)
      ) {
        return !requireEdit || participant.capabilities.edit ? participant : null;
      } else if (!recheck) {
        recheck = this.startParticipantAuthorizationRecheck(client.id, participant);
      }
      mode = "cached";

      let validatedSequence: number | null;
      try {
        validatedSequence = await recheck.promise;
      } catch {
        return null;
      }
      const refreshed = this.participantsBySocket.get(client.id);
      if (
        refreshed !== participant ||
        refreshed.workId !== workId ||
        !this.isSocketCurrent(client)
      ) {
        return null;
      }
      if (
        this.socketAuthentication.principal(client) !== principal ||
        principal.expiresAt <= Date.now() ||
        principal.userId !== participant.userId
      ) {
        this.disconnectInvalidSession(client.id, participant);
        return null;
      }
      if (
        validatedSequence !== null &&
        refreshed.authorizationSequence === validatedSequence
      ) {
        return !requireEdit || refreshed.capabilities.edit ? refreshed : null;
      }
      // A newer forced check superseded this one. Join that generation before consulting the
      // refreshed cache so a pending downgrade can never authorize with the older role snapshot.
    }
  }

  private startParticipantAuthorizationRecheck(
    socketId: string,
    participant: StudioLiveParticipantInternal
  ): StudioLiveParticipantAuthorizationRecheck {
    const promise = this.revalidateParticipant(socketId, participant);
    const created: StudioLiveParticipantAuthorizationRecheck = { participant, promise };
    this.participantAuthorizationRechecks.set(socketId, created);
    const clear = () => {
      if (this.participantAuthorizationRechecks.get(socketId) === created) {
        this.participantAuthorizationRechecks.delete(socketId);
      }
    };
    void promise.then(clear, clear);
    return created;
  }

  private async revalidateParticipant(
    socketId: string,
    expectedParticipant = this.participantsBySocket.get(socketId)
  ): Promise<number | null> {
    const participant = expectedParticipant;
    if (!participant || this.participantsBySocket.get(socketId) !== participant) return null;
    const authorizationSequence = participant.authorizationSequence + 1;
    participant.authorizationSequence = authorizationSequence;
    const isCurrentAuthorization = () =>
      this.participantsBySocket.get(socketId) === participant &&
      participant.authorizationSequence === authorizationSequence;
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    const principal = socket
      ? this.socketAuthentication.principal(socket)
      : undefined;
    const sessionAllowed = socket && principal
      ? await this.socketAuthentication.revalidate(socket)
      : false;
    // A room switch can replace the participant while session or ACL I/O is pending. Never apply
    // a result to, or authorize an action with, a different participant generation. A newer ACL
    // check on the same participant also supersedes this result so an old editor snapshot cannot
    // restore permissions after a newer downgrade has already landed.
    if (!isCurrentAuthorization()) return null;
    if (
      !socket ||
      !principal ||
      !sessionAllowed ||
      principal.expiresAt <= Date.now() ||
      principal.userId !== participant.userId
    ) {
      this.disconnectInvalidSession(socketId, participant);
      return null;
    }
    try {
      const authorization = await this.creatorService.getWorkAuthorization(
        participant.userId,
        participant.workId
      );
      if (!isCurrentAuthorization() || !this.isSocketCurrent(socket)) {
        return null;
      }
      if (
        this.socketAuthentication.principal(socket) !== principal ||
        principal.expiresAt <= Date.now() ||
        principal.userId !== participant.userId
      ) {
        this.disconnectInvalidSession(socketId, participant);
        return null;
      }
      if (
        authorization.workId !== participant.workId ||
        authorization.viewer.userId !== participant.userId ||
        authorization.viewer.status !== "active" ||
        !authorization.viewer.capabilities.view
      ) {
        this.revokeParticipant(socketId);
        return null;
      }
      const authorizationExpiresAt = studioLiveAuthorizationExpiresAt(
        authorization.authorizationExpiresAt
      );
      if (!isStudioLiveAuthorizationLeaseCurrent(authorizationExpiresAt)) {
        this.revokeParticipant(socketId);
        return null;
      }
      const previousRole = participant.role;
      const previousComment = participant.capabilities.comment;
      const previousEdit = participant.capabilities.edit;
      const previousManageMembers = participant.capabilities.manageMembers;
      participant.role = authorization.viewer.role;
      participant.capabilities = {
        view: true,
        comment: authorization.viewer.capabilities.comment,
        edit: authorization.viewer.capabilities.edit,
        manageMembers: authorization.viewer.capabilities.manageMembers,
      };
      participant.authorizedAt = Date.now();
      participant.authorizationExpiresAt = authorizationExpiresAt;
      participant.updatedAt = new Date().toISOString();
      const safeParticipant = this.publishParticipantToSocketData(socket, participant);
      if (!participant.capabilities.edit) void this.releaseSocketLocks(participant, "revoked");
      if (participant.role === "viewer") this.removeVoiceMembership(socketId, "revoked");
      if (
        previousRole !== participant.role ||
        previousComment !== participant.capabilities.comment ||
        previousEdit !== participant.capabilities.edit ||
        previousManageMembers !== participant.capabilities.manageMembers
      ) {
        this.server
          .to(studioLiveRoom(participant.workId))
          .emit("studio:presence:update", safeParticipant);
      }
      return authorizationSequence;
    } catch {
      if (isCurrentAuthorization()) {
        this.revokeParticipant(socketId);
      }
      return null;
    }
  }

  private async revalidateAllParticipants(): Promise<void> {
    const participants = [...this.participantsBySocket.entries()];
    await Promise.allSettled(
      participants.map(([socketId, participant]) => {
        const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
        if (!socket) {
          this.disconnectInvalidSession(socketId, participant);
          return Promise.resolve(null);
        }
        return this.authorizedParticipantWithMode(
          socket,
          participant.workId,
          false,
          "sweep"
        );
      })
    );
  }

  private disconnectInvalidSession(
    socketId: string,
    expectedParticipant: StudioLiveParticipantInternal
  ): void {
    if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;
    this.emitCleanupNotificationBestEffort(socketId, "studio:access:revoked", {
      workId: expectedParticipant.workId,
      message: "로그인 세션이 만료되거나 해제되어 실시간 작업실 연결을 종료했습니다.",
    });
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    this.adapterCleanup.closeRoomTransport({
      socket,
      room: studioLiveRoom(expectedParticipant.workId),
      finalizeLocalState: () => {
        this.removeParticipant(socketId, "revoked");
        this.rateLimits.delete(socketId);
        this.socketAuthentication.clearBySocketId(socketId, socket);
      },
    });
  }

  private revokeParticipant(socketId: string): void {
    const participant = this.participantsBySocket.get(socketId);
    if (!participant) return;
    this.emitCleanupNotificationBestEffort(socketId, "studio:access:revoked", {
      workId: participant.workId,
      message: "팀 권한이 변경되어 실시간 작업실 연결을 종료했습니다.",
    });
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    this.adapterCleanup.closeRoomTransport({
      socket,
      room: studioLiveRoom(participant.workId),
      finalizeLocalState: () => {
        this.removeParticipant(socketId, "revoked");
        this.rateLimits.delete(socketId);
        this.joinTransitions.invalidate(socketId);
        this.socketAuthentication.clearBySocketId(socketId, socket);
      },
    });
  }

  private removeParticipant(socketId: string, reason: "disconnect" | "switch" | "revoked"): void {
    const participant = this.participantsBySocket.get(socketId);
    if (!participant) return;
    const voiceMember = this.detachVoiceMembership(socketId);
    this.participantsBySocket.delete(socketId);
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    const activeShare = socket
      ? this.activeScreenShareForSocket(socket, participant.workId)
      : null;
    if (socket) {
      delete socket.data.studioParticipant;
      delete socket.data.studioWorkId;
      delete socket.data.studioScreenShare;
    }
    this.participantAuthorizationRechecks.delete(socketId);
    this.deleteCandidateRelayAuthorizationsForSocket(socketId);
    const roomSockets = this.socketIdsByWork.get(participant.workId);
    roomSockets?.delete(socketId);
    if (roomSockets?.size === 0) this.socketIdsByWork.delete(participant.workId);
    void this.releaseSocketLocks(
      participant,
      reason === "revoked" ? "revoked" : "released"
    );
    if (voiceMember) {
      this.emitVoiceLeave(
        voiceMember,
        reason === "revoked" ? "revoked" : "removed"
      );
    }
    if (activeShare) {
      this.emitCleanupNotificationBestEffort(
        studioLiveRoom(participant.workId),
        "studio:screen:stop",
        {
          fromConnectionId: participant.connectionId,
          fromName: participant.name,
          shareId: activeShare.shareId,
        }
      );
    }
    this.emitCleanupNotificationBestEffort(
      studioLiveRoom(participant.workId),
      "studio:presence:leave",
      {
        connectionId: participant.connectionId,
        reason,
      },
      "bounded",
      () => {
        const current = this.participantsBySocket.get(socketId);
        return !current || current.workId !== participant.workId;
      }
    );
  }

  private async rollbackLockAcquireBestEffort(
    lock: StudioLiveLockRecord,
    rotatingProtocol: boolean,
    previousLeaseId?: string
  ): Promise<void> {
    let rolledBack: StudioLiveLockRecord | null = null;
    try {
      rolledBack = await this.studioLiveLockRepository.rollbackAcquire({
        workId: lock.workId,
        resourceId: lock.resourceId,
        leaseId: lock.leaseId,
        acquisitionId: lock.acquisitionId,
        ownerConnectionId: lock.ownerConnectionId,
      });
    } catch {
      // The bounded database lease remains the final fail-safe when rollback is unavailable.
    }
    let source = rolledBack;
    if (!source) {
      if (!rotatingProtocol) return;
      try {
        const snapshot = await this.studioLiveLockRepository.snapshot(lock.workId);
        const current = snapshot.locks.find(
          (candidate) => candidate.resourceId === lock.resourceId
        );
        // Another exact mutation already removed this rotation while the authorization recheck
        // was in flight. Only an empty authoritative snapshot with a strictly newer clock may
        // stand in for that deletion; reusing the acquire revision could erase a real newer lock.
        if (current || snapshot.revision <= lock.revision) return;
        source = { ...lock, revision: snapshot.revision };
      } catch {
        return;
      }
    }
    const requestId = studioLiveLockRequestIdFromAcquisitionId(source.acquisitionId);
    const fences = new Set([
      ...(rolledBack || rotatingProtocol ? [source.leaseId] : []),
      ...(rotatingProtocol ? [previousLeaseId] : []),
    ].filter(
      (leaseId): leaseId is string => Boolean(leaseId)
    ));
    for (const leaseId of fences) {
      const update: StudioLiveLockUpdate = {
        action: "revoked",
        requestId,
        resourceId: source.resourceId,
        leaseId,
        revision: source.revision.toString(),
      };
      this.server.to(studioLiveRoom(source.workId)).emit("studio:lock:update", update);
    }
  }

  private releaseSocketLocks(
    participant: StudioLiveParticipantInternal,
    action: "released" | "revoked" = "released"
  ): Promise<void> {
    const cleanupKey = this.socketLockCleanupKey(
      participant.workId,
      participant.connectionId
    );
    const previousCleanup = this.lockCleanupByConnectionWork.get(cleanupKey);
    const runCleanup = async (): Promise<void> => {
      try {
        const released = await this.studioLiveLockRepository.releaseConnection(
          participant.workId,
          participant.connectionId
        );
        for (const lock of released) {
          const update: StudioLiveLockUpdate = {
            action,
            requestId: studioLiveLockRequestIdFromAcquisitionId(lock.acquisitionId),
            resourceId: lock.resourceId,
            leaseId: lock.leaseId,
            revision: lock.revision.toString(),
          };
          this.server.to(studioLiveRoom(lock.workId)).emit("studio:lock:update", update);
        }
      } catch (error: unknown) {
        this.logger.error(
          {
            workId: participant.workId,
            connectionId: participant.connectionId,
            error: error instanceof Error ? error.message : "unknown",
          },
          "studio distributed locks could not be released for connection"
        );
      }
    };
    const cleanup = previousCleanup
      ? previousCleanup.then(runCleanup)
      : runCleanup();
    this.lockCleanupByConnectionWork.set(cleanupKey, cleanup);
    void cleanup.then(() => {
      if (this.lockCleanupByConnectionWork.get(cleanupKey) === cleanup) {
        this.lockCleanupByConnectionWork.delete(cleanupKey);
      }
    });
    return cleanup;
  }

  private socketLockCleanupKey(workId: string, connectionId: string): string {
    return JSON.stringify([workId, connectionId]);
  }

  private socketLockOperationKey(
    connectionId: string,
    workId: string,
    resourceId: string
  ): string {
    return JSON.stringify([connectionId, workId, resourceId]);
  }

  /**
   * Socket.IO preserves packet order, but Nest message handlers do not await the previous async
   * handler before starting the next one. Serialize one socket's lifecycle for one exact resource
   * from the first authorization await through the repository mutation. This keeps legacy stable
   * renewals safe during the v2 rolling window: a later release cannot overtake an earlier delayed
   * heartbeat and leave the heartbeat to recreate the lease afterwards. Different resources and
   * different collaborators still run independently.
   */
  private async withSocketLockOperation<T>(
    connectionId: string,
    workId: string,
    resourceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = this.socketLockOperationKey(connectionId, workId, resourceId);
    const previous = this.lockOperationTailByResource.get(key) ?? Promise.resolve();
    let releaseTurn!: () => void;
    const turn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const tail = previous.then(() => turn);
    this.lockOperationTailByResource.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      releaseTurn();
      if (this.lockOperationTailByResource.get(key) === tail) {
        this.lockOperationTailByResource.delete(key);
      }
    }
  }

  private async awaitSocketLockCleanup(workId: string, connectionId: string): Promise<void> {
    const cleanupKey = this.socketLockCleanupKey(workId, connectionId);
    while (true) {
      const pending = this.lockCleanupByConnectionWork.get(cleanupKey);
      if (!pending) return;
      await pending;
      if (this.lockCleanupByConnectionWork.get(cleanupKey) === pending) return;
    }
  }

  private async purgeExpiredLocks(): Promise<void> {
    try {
      const expired = await this.studioLiveLockRepository.purgeExpired();
      for (const lock of expired) {
        const update: StudioLiveLockUpdate = {
          action: "expired",
          requestId: studioLiveLockRequestIdFromAcquisitionId(lock.acquisitionId),
          resourceId: lock.resourceId,
          leaseId: lock.leaseId,
          revision: lock.revision.toString(),
        };
        this.server.to(studioLiveRoom(lock.workId)).emit("studio:lock:update", update);
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : "unknown" },
        "studio distributed lock expiry sweep failed"
      );
    }
  }

  private localParticipants(workId: string): StudioLiveParticipant[] {
    const socketIds = this.socketIdsByWork.get(workId);
    if (!socketIds) return [];
    return [...socketIds]
      .map((socketId) => this.participantsBySocket.get(socketId))
      .filter((participant): participant is StudioLiveParticipantInternal => participant !== undefined)
      .map(publicParticipant)
      .sort((left, right) =>
        left.joinedAt.localeCompare(right.joinedAt) ||
        left.connectionId.localeCompare(right.connectionId)
      );
  }

  private publishParticipantToSocketData(
    socket: StudioLiveSocket,
    participant: StudioLiveParticipantInternal
  ): StudioLiveParticipant {
    const safe = publicParticipant(participant);
    socket.data.studioWorkId = participant.workId;
    socket.data.studioParticipant = safe;
    if (!participant.sharingScreen) delete socket.data.studioScreenShare;
    return safe;
  }

  private publishScreenShareToSocketData(
    socket: StudioLiveSocket,
    participant: StudioLiveParticipantInternal,
    shareId: string,
    label: string
  ): StudioLiveActiveScreenShare {
    const share: StudioLiveActiveScreenShare = {
      connectionId: participant.connectionId,
      shareId,
      label,
    };
    socket.data.studioScreenShare = share;
    return share;
  }

  private activeScreenShareForSocket(
    socket: StudioLiveSocket,
    workId: string
  ): StudioLiveActiveScreenShare | null {
    if (socket.data.studioWorkId !== workId) return null;
    const parsed = StudioLiveActiveScreenShareSchema.safeParse(
      socket.data.studioScreenShare
    );
    if (!parsed.success || parsed.data.connectionId !== socket.id) return null;
    return parsed.data;
  }

  private publicVoiceMember(member: StudioLiveVoiceMemberInternal): StudioLiveVoiceMember {
    return {
      connectionId: member.connectionId,
      callId: member.callId,
      muted: member.muted,
    };
  }

  private emitVoiceLeave(
    member: StudioLiveVoiceMemberInternal,
    reason: StudioLiveVoiceLeaveReason = "removed"
  ): void {
    this.emitCleanupNotificationBestEffort(
      studioLiveRoom(member.workId),
      "studio:voice:leave",
      {
        connectionId: member.connectionId,
        callId: member.callId,
        reason,
      },
      "bounded",
      () => {
        const current = this.voiceMembershipBySocket.get(member.connectionId);
        return !current || current.workId !== member.workId || current.callId !== member.callId;
      }
    );
  }

  private detachVoiceMembership(socketId: string): StudioLiveVoiceMemberInternal | undefined {
    const member = this.voiceMembershipBySocket.get(socketId);
    if (!member) return undefined;
    this.voiceMembershipBySocket.delete(socketId);
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    if (socket) delete socket.data.studioVoiceMember;
    return member;
  }

  private removeVoiceMembership(
    socketId: string,
    reason: StudioLiveVoiceLeaveReason = "removed"
  ): void {
    const member = this.detachVoiceMembership(socketId);
    if (!member) return;
    this.emitVoiceLeave(member, reason);
  }

  private emitCleanupNotificationBestEffort(
    target: string,
    event: string,
    payload: unknown
  ): void;
  private emitCleanupNotificationBestEffort(
    target: string,
    event: string,
    payload: unknown,
    retry: "bounded",
    isStillRelevant: () => boolean
  ): void;
  private emitCleanupNotificationBestEffort(
    target: string,
    event: string,
    payload: unknown,
    retry: StudioLiveCleanupNotificationRetry = "none",
    isStillRelevant?: () => boolean
  ): void {
    if (retry === "bounded") {
      this.cleanupNotifications.dispatch({
        target,
        event,
        retry,
        isStillRelevant: isStillRelevant ?? (() => false),
        deliver: () => this.server.to(target).emit(event, payload),
      });
      return;
    }
    this.cleanupNotifications.dispatch({
      target,
      event,
      retry,
      deliver: () => this.server.to(target).emit(event, payload),
    });
  }

  private localVoiceMembers(workId: string, callId?: string): StudioLiveVoiceMember[] {
    return [...this.voiceMembershipBySocket.values()]
      .filter((member) =>
        member.workId === workId && (callId === undefined || member.callId === callId)
      )
      .filter((member) => this.participantsBySocket.get(member.connectionId)?.role !== "viewer")
      .sort((left, right) => {
        const leftJoined = this.participantsBySocket.get(left.connectionId)?.joinedAt ?? "";
        const rightJoined = this.participantsBySocket.get(right.connectionId)?.joinedAt ?? "";
        return leftJoined.localeCompare(rightJoined) ||
          left.connectionId.localeCompare(right.connectionId);
      })
      .map((member) => this.publicVoiceMember(member));
  }

  private localScreenShares(workId: string): StudioLiveActiveScreenShare[] {
    const socketIds = this.socketIdsByWork.get(workId);
    if (!socketIds) return [];
    const shares: StudioLiveActiveScreenShare[] = [];
    for (const socketId of socketIds) {
      const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
      if (!socket) continue;
      const participant = socket.data.studioParticipant;
      const share = this.activeScreenShareForSocket(socket, workId);
      if (
        !participant ||
        participant.connectionId !== socketId ||
        !participant.sharingScreen ||
        !share
      ) {
        continue;
      }
      shares.push(share);
    }
    return shares.sort((left, right) =>
      left.connectionId.localeCompare(right.connectionId) ||
      left.shareId.localeCompare(right.shareId)
    );
  }

  private async listScreenShares(workId: string): Promise<StudioLiveActiveScreenShare[]> {
    let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const sockets = await Promise.race([
        this.server.in(studioLiveRoom(workId)).fetchSockets(),
        new Promise<never>((_resolve, reject) => {
          discoveryTimeout = setTimeout(
            () => reject(new Error("studio screen-share adapter discovery timed out")),
            STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS
          );
          discoveryTimeout.unref?.();
        }),
      ]);
      const byConnectionId = new Map<string, StudioLiveActiveScreenShare>();
      for (const socket of sockets) {
        const data = socket.data as StudioLiveSocketData;
        const participant = StudioLivePublicParticipantSchema.safeParse(
          data.studioParticipant
        );
        const share = StudioLiveActiveScreenShareSchema.safeParse(
          data.studioScreenShare
        );
        if (
          data.studioWorkId !== workId ||
          !participant.success ||
          participant.data.connectionId !== socket.id ||
          !participant.data.sharingScreen ||
          !share.success ||
          share.data.connectionId !== socket.id
        ) {
          continue;
        }
        byConnectionId.set(socket.id, share.data);
      }
      return [...byConnectionId.values()].sort((left, right) =>
        left.connectionId.localeCompare(right.connectionId) ||
        left.shareId.localeCompare(right.shareId)
      );
    } catch (error) {
      this.logger.warn(
        { workId, error: error instanceof Error ? error.message : "unknown" },
        "studio screen-share adapter discovery failed"
      );
      return this.localScreenShares(workId);
    } finally {
      if (discoveryTimeout) clearTimeout(discoveryTimeout);
    }
  }

  private async listVoiceMembers(
    workId: string,
    callId?: string,
    options: { fallbackToLocal?: boolean } = {}
  ): Promise<StudioLiveVoiceMember[]> {
    let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const sockets = await Promise.race([
        this.server.in(studioLiveRoom(workId)).fetchSockets(),
        new Promise<never>((_resolve, reject) => {
          discoveryTimeout = setTimeout(
            () => reject(new Error("studio voice adapter discovery timed out")),
            STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS
          );
          discoveryTimeout.unref?.();
        }),
      ]);
      const candidates: Array<{ member: StudioLiveVoiceMember; joinedAt: string }> = [];
      for (const socket of sockets) {
        const data = socket.data as StudioLiveSocketData;
        const parsed = StudioLiveVoiceMemberSchema.safeParse(data.studioVoiceMember);
        const participant = data.studioParticipant;
        if (
          data.studioWorkId !== workId ||
          !parsed.success ||
          parsed.data.connectionId !== socket.id ||
          (callId !== undefined && parsed.data.callId !== callId) ||
          !participant ||
          participant.connectionId !== socket.id ||
          participant.role === "viewer"
        ) continue;
        candidates.push({
          member: parsed.data,
          joinedAt: participant.joinedAt,
        });
      }
      return candidates
        .sort((left, right) =>
          left.joinedAt.localeCompare(right.joinedAt) ||
          left.member.connectionId.localeCompare(right.member.connectionId)
        )
        .map(({ member }) => member);
    } catch (error) {
      this.logger.warn(
        { workId, callId, error: error instanceof Error ? error.message : "unknown" },
        "studio voice adapter discovery failed"
      );
      if (options.fallbackToLocal === false) throw error;
      return this.localVoiceMembers(workId, callId);
    } finally {
      if (discoveryTimeout) clearTimeout(discoveryTimeout);
    }
  }

  /**
   * Reads adapter-visible socket metadata so a join ACK can contain peers connected to every API
   * instance. On adapter failure, return the local view only to the joining client; importantly we
   * never broadcast that partial fallback as a full-room snapshot.
   */
  private async listParticipants(workId: string): Promise<StudioLiveParticipant[]> {
    let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const sockets = await Promise.race([
        this.server.in(studioLiveRoom(workId)).fetchSockets(),
        new Promise<never>((_resolve, reject) => {
          discoveryTimeout = setTimeout(
            () => reject(new Error("studio presence adapter discovery timed out")),
            STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS
          );
          discoveryTimeout.unref?.();
        }),
      ]);
      const byConnectionId = new Map<string, StudioLiveParticipant>();
      for (const socket of sockets) {
        const data = socket.data as StudioLiveSocketData;
        const participant = data.studioParticipant;
        if (
          data.studioWorkId !== workId ||
          !participant ||
          participant.connectionId !== socket.id
        ) {
          continue;
        }
        byConnectionId.set(participant.connectionId, copyPublicParticipant(participant));
      }
      return [...byConnectionId.values()].sort((left, right) =>
        left.joinedAt.localeCompare(right.joinedAt) ||
        left.connectionId.localeCompare(right.connectionId)
      );
    } catch (error) {
      this.logger.warn(
        { workId, error: error instanceof Error ? error.message : "unknown" },
        "studio presence adapter discovery failed"
      );
      return this.localParticipants(workId);
    } finally {
      if (discoveryTimeout) clearTimeout(discoveryTimeout);
    }
  }

  private async lockSnapshot(
    workId: string
  ): Promise<{ revision: string; locks: StudioLiveLock[] }> {
    const snapshot = await this.studioLiveLockRepository.snapshot(workId);
    return {
      revision: snapshot.revision.toString(),
      locks: snapshot.locks.map(publicLock),
    };
  }

}
