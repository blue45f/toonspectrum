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
import { z } from "zod";


import {
  verifySessionToken,
  type VerifiedSessionToken,
} from "../../../../../lib/server/session";
import { isSessionAllowed } from "../../../../../lib/server/user-lifecycle";
import { allowedCorsOrigins } from "../../config/cors";

import { CreatorService } from "./creator.service";

import type { CreatorCollaborationViewerRole } from "./creator-collaboration.policy";
import type { Namespace, Socket } from "socket.io";

const STUDIO_LIVE_NAMESPACE = "/studio-live";
const STUDIO_LIVE_ROOM_PREFIX = "studio-live:";
const STUDIO_LIVE_ACCESS_RECHECK_MS = 15_000;
const STUDIO_LIVE_ACCESS_CACHE_MS = 5_000;
const STUDIO_LIVE_LOCK_LIMIT_PER_WORK = 200;
const STUDIO_LIVE_SIGNAL_SDP_MAX_LENGTH = 262_144;
const STUDIO_LIVE_SIGNAL_CANDIDATE_MAX_LENGTH = 16_384;

const noControlCharacters = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return false;
  }
  return true;
};
const boundedIdentifier = (maximum: number) =>
  z.string().trim().min(1).max(maximum).refine(noControlCharacters, "control characters are not allowed");

const WorkIdSchema = boundedIdentifier(160);
const ClientInstanceIdSchema = boundedIdentifier(80);
const PageIdSchema = boundedIdentifier(160);
const ResourceIdSchema = boundedIdentifier(200);
const ConnectionIdSchema = boundedIdentifier(128);

export const StudioLiveJoinSchema = z
  .object({
    workId: WorkIdSchema,
    clientInstanceId: ClientInstanceIdSchema,
  })
  .strict();

export const StudioLivePresenceSchema = z
  .object({
    workId: WorkIdSchema,
    state: z.enum(["active", "idle", "away"]),
    pageId: PageIdSchema.nullable().optional(),
    tool: boundedIdentifier(48).nullable().optional(),
  })
  .strict();

export const StudioLiveCursorSchema = z
  .object({
    workId: WorkIdSchema,
    pageId: PageIdSchema.nullable(),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const StudioLiveLockRequestSchema = z
  .object({
    workId: WorkIdSchema,
    resourceId: ResourceIdSchema,
    leaseMs: z.number().int().min(5_000).max(30_000).default(15_000),
  })
  .strict();

export const StudioLiveLockReleaseSchema = z
  .object({
    workId: WorkIdSchema,
    resourceId: ResourceIdSchema,
    leaseId: boundedIdentifier(80),
  })
  .strict();

export const StudioLiveScreenStateSchema = z
  .object({
    workId: WorkIdSchema,
    sharing: z.boolean(),
  })
  .strict();

const StudioLiveSessionDescriptionSchema = z
  .object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string().min(1).max(STUDIO_LIVE_SIGNAL_SDP_MAX_LENGTH),
  })
  .strict();

const StudioLiveIceCandidateSchema = z
  .object({
    candidate: z.string().min(1).max(STUDIO_LIVE_SIGNAL_CANDIDATE_MAX_LENGTH),
    sdpMid: z.string().max(128).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(65_535).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  })
  .strict();

export const StudioLiveSignalSchema = z.discriminatedUnion("kind", [
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      kind: z.literal("description"),
      description: StudioLiveSessionDescriptionSchema,
    })
    .strict(),
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      kind: z.literal("candidate"),
      candidate: StudioLiveIceCandidateSchema,
    })
    .strict(),
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      kind: z.literal("bye"),
    })
    .strict(),
]);

type StudioLiveJoinInput = z.infer<typeof StudioLiveJoinSchema>;
type StudioLivePresenceInput = z.infer<typeof StudioLivePresenceSchema>;
type StudioLiveCursorInput = z.infer<typeof StudioLiveCursorSchema>;
type StudioLiveLockRequestInput = z.infer<typeof StudioLiveLockRequestSchema>;
type StudioLiveLockReleaseInput = z.infer<typeof StudioLiveLockReleaseSchema>;
type StudioLiveScreenStateInput = z.infer<typeof StudioLiveScreenStateSchema>;
type StudioLiveSignalInput = z.infer<typeof StudioLiveSignalSchema>;

export interface StudioLiveParticipant {
  connectionId: string;
  clientInstanceId: string;
  name: string;
  role: CreatorCollaborationViewerRole;
  capabilities: {
    view: true;
    comment: boolean;
    edit: boolean;
    manageMembers: boolean;
  };
  state: "active" | "idle" | "away";
  pageId: string | null;
  tool: string | null;
  sharingScreen: boolean;
  joinedAt: string;
  updatedAt: string;
}

interface StudioLiveParticipantInternal extends StudioLiveParticipant {
  userId: string;
  workId: string;
  authorizedAt: number;
  authorizationSequence: number;
}

export interface StudioLiveLock {
  resourceId: string;
  leaseId: string;
  ownerConnectionId: string;
  ownerName: string;
  expiresAt: string;
}

type StudioLiveSuccess<T> = { ok: true; data: T };
type StudioLiveFailureCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_payload"
  | "not_joined"
  | "rate_limited"
  | "lock_conflict"
  | "lock_limit"
  | "peer_unavailable"
  | "internal_error";
type StudioLiveFailure = { ok: false; code: StudioLiveFailureCode; message: string };
export type StudioLiveAck<T> = StudioLiveSuccess<T> | StudioLiveFailure;
type StudioLiveAckCallback<T> = (response: StudioLiveAck<T>) => void;
interface StudioLiveJoinResult {
  self: StudioLiveParticipant;
  participants: StudioLiveParticipant[];
  locks: StudioLiveLock[];
}

interface StudioLiveSocketData {
  authUserId?: string;
  authPrincipal?: StudioLiveAuthPrincipal;
}

interface StudioLiveClientToServerEvents {
  [event: string]: (...args: unknown[]) => void;
}

interface StudioLiveServerToClientEvents {
  [event: string]: (...args: unknown[]) => void;
}

interface StudioLiveInterServerEvents {
  [event: string]: (...args: unknown[]) => void;
}

type StudioLiveSocket = Socket<
  StudioLiveClientToServerEvents,
  StudioLiveServerToClientEvents,
  StudioLiveInterServerEvents,
  StudioLiveSocketData
>;

interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

export type StudioLiveAuthPrincipal = VerifiedSessionToken;
export type StudioLiveSessionAuthenticator = (
  token: string
) => Promise<StudioLiveAuthPrincipal | null>;
export type StudioLiveSessionRevalidator = (
  principal: StudioLiveAuthPrincipal
) => Promise<boolean>;
export const STUDIO_LIVE_SESSION_AUTHENTICATOR = Symbol("STUDIO_LIVE_SESSION_AUTHENTICATOR");
export const STUDIO_LIVE_SESSION_REVALIDATOR = Symbol("STUDIO_LIVE_SESSION_REVALIDATOR");

export const studioLiveSessionAuthenticatorProvider = {
  provide: STUDIO_LIVE_SESSION_AUTHENTICATOR,
  useValue: (async (token: string): Promise<StudioLiveAuthPrincipal | null> => {
    try {
      const session = verifySessionToken(token);
      if (!session) return null;
      return (await isSessionAllowed(session.userId, session.sessionVersion)) ? session : null;
    } catch {
      return null;
    }
  }) satisfies StudioLiveSessionAuthenticator,
};

export const studioLiveSessionRevalidatorProvider = {
  provide: STUDIO_LIVE_SESSION_REVALIDATOR,
  useValue: (async (principal: StudioLiveAuthPrincipal): Promise<boolean> => {
    if (principal.expiresAt <= Date.now()) return false;
    try {
      return await isSessionAllowed(principal.userId, principal.sessionVersion);
    } catch {
      return false;
    }
  }) satisfies StudioLiveSessionRevalidator,
};

function studioLiveRoom(workId: string): string {
  return `${STUDIO_LIVE_ROOM_PREFIX}${workId}`;
}

function publicParticipant(participant: StudioLiveParticipantInternal): StudioLiveParticipant {
  const {
    userId: _userId,
    workId: _workId,
    authorizedAt: _authorizedAt,
    authorizationSequence: _authorizationSequence,
    ...safe
  } = participant;
  return safe;
}

function failure(code: StudioLiveFailureCode, message: string): StudioLiveFailure {
  return { ok: false, code, message };
}

function reply<T>(ack: StudioLiveAckCallback<T> | undefined, response: StudioLiveAck<T>): StudioLiveAck<T> {
  ack?.(response);
  return response;
}

function extractHandshakeToken(client: StudioLiveSocket): string | null {
  const auth = client.handshake?.auth;
  if (!auth || typeof auth !== "object") return null;
  const token = (auth as Record<string, unknown>).sessionToken;
  return typeof token === "string" && token.length > 0 && token.length <= 8_192 ? token : null;
}

function normalizedMemberName(value: unknown): string {
  if (typeof value !== "string") return "팀원";
  const name = value.trim();
  return name.length > 0 ? name.slice(0, 80) : "팀원";
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
  maxHttpBufferSize: 300_000,
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
  private readonly locksByWork = new Map<string, Map<string, StudioLiveLock>>();
  private readonly rateLimits = new Map<string, Map<string, RateLimitBucket>>();
  private readonly joinTransitionSequences = new Map<string, number>();
  private readonly joinTransitionTails = new Map<string, Promise<void>>();
  private accessRecheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(CreatorService)
    private readonly creatorService: CreatorService,
    @Inject(STUDIO_LIVE_SESSION_AUTHENTICATOR)
    private readonly authenticateSession: StudioLiveSessionAuthenticator,
    @Inject(STUDIO_LIVE_SESSION_REVALIDATOR)
    private readonly revalidateSession: StudioLiveSessionRevalidator
  ) {}

  afterInit(server: Namespace): void {
    // Namespace middleware completes authentication before Socket.IO emits `connection`, so a
    // valid client cannot race an async handleConnection hook with its first studio:join event.
    server.use((socket, next) => {
      void this.authenticateSocket(socket as StudioLiveSocket)
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
      this.purgeExpiredLocks();
    }, STUDIO_LIVE_ACCESS_RECHECK_MS);
    this.accessRecheckTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.accessRecheckTimer) clearInterval(this.accessRecheckTimer);
    this.accessRecheckTimer = null;
    this.participantsBySocket.clear();
    this.socketIdsByWork.clear();
    this.locksByWork.clear();
    this.rateLimits.clear();
    this.joinTransitionSequences.clear();
    this.joinTransitionTails.clear();
  }

  async handleConnection(client: StudioLiveSocket): Promise<void> {
    // Runtime connections have already passed the namespace middleware. The fallback keeps direct
    // gateway tests and non-standard adapters fail-closed without weakening the runtime ordering.
    if (client.data.authUserId && client.data.authPrincipal) return;
    if (!(await this.authenticateSocket(client))) {
      client.emit("studio:error", failure("unauthenticated", "로그인 세션을 확인할 수 없습니다."));
      client.disconnect(true);
    }
  }

  handleDisconnect(client: StudioLiveSocket): void {
    this.joinTransitionSequences.delete(client.id);
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
    const transitionSequence = this.nextJoinTransitionSequence(client.id);
    return this.enqueueJoinTransition(client.id, async () => {
      try {
        return await this.performJoin(client, parsed.data, transitionSequence, ack);
      } finally {
        if (this.joinTransitionSequences.get(client.id) === transitionSequence) {
          this.joinTransitionSequences.delete(client.id);
        }
      }
    });
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
    // Revalidate on every room join. A socket that outlives token expiry, logout, or a session
    // version bump must not use the previously cached user id to enter another work.
    const authenticated = await this.revalidateSocketSession(client);
    if (!this.isCurrentJoinTransition(client, transitionSequence)) {
      return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
    }
    const userId = authenticated ? client.data.authUserId : null;
    if (!userId) {
      const response = failure("unauthenticated", "로그인이 필요합니다.");
      reply(ack, response);
      client.emit("studio:error", response);
      client.disconnect(true);
      return response;
    }
    if (!this.consumeRateLimit(client.id, "join", 12, 60_000)) {
      return reply(ack, failure("rate_limited", "작업실 참가 요청이 너무 많습니다."));
    }

    try {
      const team = await this.creatorService.getWorkTeam(userId, input.workId);
      if (!this.isCurrentJoinTransition(client, transitionSequence)) {
        return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
      }
      if (
        team.workId !== input.workId ||
        team.viewer.userId !== userId ||
        team.viewer.status !== "active" ||
        !team.viewer.capabilities.view
      ) {
        return reply(ack, failure("forbidden", "이 작품의 실시간 작업실에 참여할 권한이 없습니다."));
      }
      const member = team.members.find((candidate) => candidate.userId === userId);
      const now = Date.now();
      const existingBeforeRoomJoin = this.participantsBySocket.get(client.id);
      const nextRoom = studioLiveRoom(input.workId);
      const joinedNewRoom = existingBeforeRoomJoin?.workId !== input.workId;

      // Join the adapter room before committing authoritative in-memory state. If an adapter
      // rejects, the socket keeps its previous valid participant instead of becoming a ghost that
      // can acquire locks without receiving room broadcasts.
      if (joinedNewRoom) await client.join(nextRoom);
      if (!this.isSocketCurrent(client)) {
        if (joinedNewRoom) await this.rollbackJoinedRoom(client, nextRoom);
        return reply(ack, failure("not_joined", "실시간 작업실 연결이 종료되었습니다."));
      }
      if (!this.isCurrentJoinTransition(client, transitionSequence)) {
        if (joinedNewRoom) await this.rollbackJoinedRoom(client, nextRoom);
        return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
      }

      // This is the serialized commit boundary. A newer request may enqueue while an adapter leave
      // is pending, but it cannot execute until this transition leaves exactly one authoritative
      // room and participant behind.
      const existing = this.participantsBySocket.get(client.id);
      if (existing && existing.workId !== input.workId) {
        try {
          await client.leave(studioLiveRoom(existing.workId));
        } catch (error) {
          if (joinedNewRoom) await this.rollbackJoinedRoom(client, nextRoom);
          throw error;
        }
        if (!this.isSocketCurrent(client)) {
          if (joinedNewRoom) await this.rollbackJoinedRoom(client, nextRoom);
          return reply(ack, failure("not_joined", "실시간 작업실 연결이 종료되었습니다."));
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
      };
      if (existing?.workId === input.workId && existing.capabilities.edit && !participant.capabilities.edit) {
        this.releaseSocketLocks(existing);
      }
      this.participantsBySocket.set(client.id, participant);
      const roomSockets = this.socketIdsByWork.get(input.workId) ?? new Set<string>();
      roomSockets.add(client.id);
      this.socketIdsByWork.set(input.workId, roomSockets);
      this.emitPresenceSnapshot(input.workId);

      return reply(ack, {
        ok: true,
        data: {
          self: publicParticipant(participant),
          participants: this.listParticipants(input.workId),
          locks: this.listLocks(input.workId),
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
    const participant = await this.authorizedParticipant(client, parsed.data.workId, false);
    if (!participant) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));

    participant.state = parsed.data.state;
    if (Object.hasOwn(parsed.data, "pageId")) participant.pageId = parsed.data.pageId ?? null;
    if (Object.hasOwn(parsed.data, "tool")) participant.tool = parsed.data.tool ?? null;
    participant.updatedAt = new Date().toISOString();
    const safe = publicParticipant(participant);
    this.server.to(studioLiveRoom(participant.workId)).emit("studio:presence:update", safe);
    return reply(ack, { ok: true, data: { participant: safe } });
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
    const participant = await this.authorizedParticipant(client, parsed.data.workId, false);
    if (!participant) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    client.to(studioLiveRoom(participant.workId)).emit("studio:cursor", {
      connectionId: participant.connectionId,
      pageId: parsed.data.pageId,
      x: parsed.data.x,
      y: parsed.data.y,
      sentAt: new Date().toISOString(),
    });
    return reply(ack, { ok: true, data: { accepted: true } });
  }

  @SubscribeMessage("studio:lock:request")
  async requestLock(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveLockRequestInput,
    @Ack() ack?: StudioLiveAckCallback<{ lock: StudioLiveLock }>
  ) {
    const parsed = StudioLiveLockRequestSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "편집 잠금 정보가 올바르지 않습니다."));
    if (!this.consumeRateLimit(client.id, "lock", 60, 60_000)) {
      return reply(ack, failure("rate_limited", "편집 잠금 요청이 너무 많습니다."));
    }
    const participant = await this.authorizedParticipant(client, parsed.data.workId, true, true);
    if (!participant) return reply(ack, failure("forbidden", "이 원고를 편집할 권한이 없습니다."));

    this.purgeExpiredLocks(parsed.data.workId);
    const roomLocks = this.locksByWork.get(parsed.data.workId) ?? new Map<string, StudioLiveLock>();
    const current = roomLocks.get(parsed.data.resourceId);
    if (current && current.ownerConnectionId !== client.id) {
      return reply(
        ack,
        failure("lock_conflict", `${current.ownerName}님이 이 항목을 편집하고 있습니다.`)
      );
    }
    if (!current && roomLocks.size >= STUDIO_LIVE_LOCK_LIMIT_PER_WORK) {
      return reply(ack, failure("lock_limit", "동시에 잠글 수 있는 편집 항목 수를 초과했습니다."));
    }
    const lock: StudioLiveLock = {
      resourceId: parsed.data.resourceId,
      leaseId: current?.leaseId ?? crypto.randomUUID(),
      ownerConnectionId: client.id,
      ownerName: participant.name,
      expiresAt: new Date(Date.now() + parsed.data.leaseMs).toISOString(),
    };
    roomLocks.set(lock.resourceId, lock);
    this.locksByWork.set(parsed.data.workId, roomLocks);
    this.server.to(studioLiveRoom(parsed.data.workId)).emit("studio:lock:update", {
      action: "acquired",
      lock,
    });
    return reply(ack, { ok: true, data: { lock } });
  }

  @SubscribeMessage("studio:lock:release")
  async releaseLock(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveLockReleaseInput,
    @Ack() ack?: StudioLiveAckCallback<{ released: boolean }>
  ) {
    const parsed = StudioLiveLockReleaseSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "편집 잠금 해제 정보가 올바르지 않습니다."));
    const participant = await this.authorizedParticipant(client, parsed.data.workId, true);
    if (!participant) return reply(ack, failure("forbidden", "이 원고를 편집할 권한이 없습니다."));
    const roomLocks = this.locksByWork.get(parsed.data.workId);
    const current = roomLocks?.get(parsed.data.resourceId);
    const released = Boolean(
      current && current.ownerConnectionId === client.id && current.leaseId === parsed.data.leaseId
    );
    if (released) {
      roomLocks?.delete(parsed.data.resourceId);
      if (roomLocks?.size === 0) this.locksByWork.delete(parsed.data.workId);
      this.server.to(studioLiveRoom(parsed.data.workId)).emit("studio:lock:update", {
        action: "released",
        resourceId: parsed.data.resourceId,
        leaseId: parsed.data.leaseId,
      });
    }
    return reply(ack, { ok: true, data: { released } });
  }

  @SubscribeMessage("studio:screen:set")
  async setScreenSharing(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveScreenStateInput,
    @Ack() ack?: StudioLiveAckCallback<{ participant: StudioLiveParticipant }>
  ) {
    const parsed = StudioLiveScreenStateSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "화면 공유 상태가 올바르지 않습니다."));
    const participant = await this.authorizedParticipant(client, parsed.data.workId, false, true);
    if (!participant) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    participant.sharingScreen = parsed.data.sharing;
    participant.updatedAt = new Date().toISOString();
    const safe = publicParticipant(participant);
    this.server.to(studioLiveRoom(participant.workId)).emit("studio:presence:update", safe);
    return reply(ack, { ok: true, data: { participant: safe } });
  }

  @SubscribeMessage("studio:signal")
  async relaySignal(
    @ConnectedSocket() client: StudioLiveSocket,
    @MessageBody() body: StudioLiveSignalInput,
    @Ack() ack?: StudioLiveAckCallback<{ delivered: true; signalId: string }>
  ) {
    const parsed = StudioLiveSignalSchema.safeParse(body);
    if (!parsed.success) return reply(ack, failure("invalid_payload", "WebRTC 연결 정보가 올바르지 않습니다."));
    if (!this.consumeRateLimit(client.id, "signal", 240, 60_000)) {
      return reply(ack, failure("rate_limited", "WebRTC 연결 요청이 너무 많습니다."));
    }
    const participant = await this.authorizedParticipant(client, parsed.data.workId, false);
    if (!participant) return reply(ack, failure("not_joined", "실시간 작업실에 다시 참여해 주세요."));
    const target = this.participantsBySocket.get(parsed.data.targetConnectionId);
    if (!target || target.workId !== participant.workId || target.connectionId === participant.connectionId) {
      return reply(ack, failure("peer_unavailable", "연결할 팀원이 작업실에 없습니다."));
    }
    const signalId = crypto.randomUUID();
    const { workId: _workId, targetConnectionId: _targetConnectionId, ...signal } = parsed.data;
    this.server.to(target.connectionId).emit("studio:signal", {
      signalId,
      fromConnectionId: participant.connectionId,
      fromName: participant.name,
      ...signal,
    });
    return reply(ack, { ok: true, data: { delivered: true, signalId } });
  }

  private nextJoinTransitionSequence(socketId: string): number {
    const sequence = (this.joinTransitionSequences.get(socketId) ?? 0) + 1;
    this.joinTransitionSequences.set(socketId, sequence);
    return sequence;
  }

  private enqueueJoinTransition<T>(socketId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.joinTransitionTails.get(socketId) ?? Promise.resolve();
    const run = previous.then(operation);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.joinTransitionTails.set(socketId, tail);
    void tail.then(() => {
      if (this.joinTransitionTails.get(socketId) === tail) {
        this.joinTransitionTails.delete(socketId);
      }
    });
    return run;
  }

  private isSocketCurrent(client: StudioLiveSocket): boolean {
    return this.server.sockets.get(client.id) === client;
  }

  private isCurrentJoinTransition(client: StudioLiveSocket, transitionSequence: number): boolean {
    return (
      this.isSocketCurrent(client) &&
      this.joinTransitionSequences.get(client.id) === transitionSequence
    );
  }

  private async rollbackJoinedRoom(client: StudioLiveSocket, room: string): Promise<void> {
    try {
      await client.leave(room);
    } catch {
      // An adapter that cannot undo a speculative join cannot guarantee room isolation. Closing
      // the socket lets Socket.IO discard every adapter room instead of keeping a ghost listener.
      client.disconnect(true);
    }
  }

  private async authenticateSocket(client: StudioLiveSocket): Promise<boolean> {
    const token = extractHandshakeToken(client);
    if (!token) {
      delete client.data.authUserId;
      delete client.data.authPrincipal;
      return false;
    }
    try {
      const principal = await this.authenticateSession(token);
      if (!principal || principal.expiresAt <= Date.now()) {
        delete client.data.authUserId;
        delete client.data.authPrincipal;
        return false;
      }
      client.data.authUserId = principal.userId;
      client.data.authPrincipal = { ...principal };
      const auth = client.handshake.auth;
      if (auth && typeof auth === "object") {
        delete (auth as Record<string, unknown>).sessionToken;
      }
      return true;
    } catch {
      delete client.data.authUserId;
      delete client.data.authPrincipal;
      return false;
    }
  }

  private async revalidateSocketSession(client: StudioLiveSocket): Promise<boolean> {
    const principal = client.data.authPrincipal;
    if (
      !principal ||
      principal.userId !== client.data.authUserId ||
      principal.expiresAt <= Date.now()
    ) {
      return false;
    }
    try {
      return await this.revalidateSession(principal);
    } catch {
      return false;
    }
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

  private async authorizedParticipant(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    forceRecheck = false
  ): Promise<StudioLiveParticipantInternal | null> {
    const participant = this.participantsBySocket.get(client.id);
    if (!participant || participant.workId !== workId || participant.userId !== client.data.authUserId) return null;
    const principal = client.data.authPrincipal;
    if (
      !principal ||
      principal.userId !== participant.userId ||
      principal.expiresAt <= Date.now()
    ) {
      this.disconnectInvalidSession(client.id, participant);
      return null;
    }
    if (!forceRecheck && Date.now() - participant.authorizedAt < STUDIO_LIVE_ACCESS_CACHE_MS) {
      return !requireEdit || participant.capabilities.edit ? participant : null;
    }
    const validatedSequence = await this.revalidateParticipant(client.id, participant);
    if (validatedSequence === null) return null;
    const refreshed = this.participantsBySocket.get(client.id);
    return refreshed === participant &&
      refreshed.workId === workId &&
      refreshed.userId === client.data.authUserId &&
      refreshed.authorizationSequence === validatedSequence &&
      (!requireEdit || refreshed.capabilities.edit)
      ? refreshed
      : null;
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
    const principal = socket?.data.authPrincipal;
    let sessionAllowed: boolean;
    try {
      sessionAllowed = principal ? await this.revalidateSession(principal) : false;
    } catch {
      sessionAllowed = false;
    }
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
      principal.userId !== participant.userId ||
      socket.data.authUserId !== participant.userId
    ) {
      this.disconnectInvalidSession(socketId, participant);
      return null;
    }
    try {
      const team = await this.creatorService.getWorkTeam(participant.userId, participant.workId);
      if (
        !isCurrentAuthorization() ||
        socket.data.authUserId !== participant.userId
      ) {
        return null;
      }
      if (
        team.workId !== participant.workId ||
        team.viewer.userId !== participant.userId ||
        team.viewer.status !== "active" ||
        !team.viewer.capabilities.view
      ) {
        this.revokeParticipant(socketId);
        return null;
      }
      const previousRole = participant.role;
      const previousComment = participant.capabilities.comment;
      const previousEdit = participant.capabilities.edit;
      const previousManageMembers = participant.capabilities.manageMembers;
      const previousName = participant.name;
      participant.role = team.viewer.role;
      participant.capabilities = {
        view: true,
        comment: team.viewer.capabilities.comment,
        edit: team.viewer.capabilities.edit,
        manageMembers: team.viewer.capabilities.manageMembers,
      };
      const member = team.members.find((candidate) => candidate.userId === participant.userId);
      participant.name = normalizedMemberName(member?.name);
      participant.authorizedAt = Date.now();
      participant.updatedAt = new Date().toISOString();
      if (!participant.capabilities.edit) this.releaseSocketLocks(participant);
      if (
        previousRole !== participant.role ||
        previousComment !== participant.capabilities.comment ||
        previousEdit !== participant.capabilities.edit ||
        previousManageMembers !== participant.capabilities.manageMembers ||
        previousName !== participant.name
      ) {
        this.server
          .to(studioLiveRoom(participant.workId))
          .emit("studio:presence:update", publicParticipant(participant));
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
      participants.map(([socketId, participant]) =>
        this.revalidateParticipant(socketId, participant)
      )
    );
  }

  private disconnectInvalidSession(
    socketId: string,
    expectedParticipant: StudioLiveParticipantInternal
  ): void {
    if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;
    this.server.to(socketId).emit("studio:access:revoked", {
      workId: expectedParticipant.workId,
      message: "로그인 세션이 만료되거나 해제되어 실시간 작업실 연결을 종료했습니다.",
    });
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    void socket?.leave(studioLiveRoom(expectedParticipant.workId));
    this.removeParticipant(socketId, "revoked");
    this.rateLimits.delete(socketId);
    if (socket) {
      delete socket.data.authUserId;
      delete socket.data.authPrincipal;
      socket.disconnect(true);
    }
  }

  private revokeParticipant(socketId: string): void {
    const participant = this.participantsBySocket.get(socketId);
    if (!participant) return;
    this.server.to(socketId).emit("studio:access:revoked", {
      workId: participant.workId,
      message: "팀 권한이 변경되어 실시간 작업실 연결을 종료했습니다.",
    });
    const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
    void socket?.leave(studioLiveRoom(participant.workId));
    this.removeParticipant(socketId, "revoked");
  }

  private removeParticipant(socketId: string, reason: "disconnect" | "switch" | "revoked"): void {
    const participant = this.participantsBySocket.get(socketId);
    if (!participant) return;
    this.participantsBySocket.delete(socketId);
    const roomSockets = this.socketIdsByWork.get(participant.workId);
    roomSockets?.delete(socketId);
    if (roomSockets?.size === 0) this.socketIdsByWork.delete(participant.workId);
    this.releaseSocketLocks(participant);
    this.server.to(studioLiveRoom(participant.workId)).emit("studio:presence:leave", {
      connectionId: participant.connectionId,
      reason,
    });
    this.emitPresenceSnapshot(participant.workId);
  }

  private releaseSocketLocks(participant: StudioLiveParticipantInternal): void {
    const roomLocks = this.locksByWork.get(participant.workId);
    if (!roomLocks) return;
    const released: StudioLiveLock[] = [];
    for (const [resourceId, lock] of roomLocks) {
      if (lock.ownerConnectionId === participant.connectionId) {
        released.push(lock);
        roomLocks.delete(resourceId);
      }
    }
    if (roomLocks.size === 0) this.locksByWork.delete(participant.workId);
    for (const lock of released) {
      this.server.to(studioLiveRoom(participant.workId)).emit("studio:lock:update", {
        action: "released",
        resourceId: lock.resourceId,
        leaseId: lock.leaseId,
      });
    }
  }

  private purgeExpiredLocks(workId?: string): void {
    const now = Date.now();
    const workIds = workId ? [workId] : [...this.locksByWork.keys()];
    for (const currentWorkId of workIds) {
      const roomLocks = this.locksByWork.get(currentWorkId);
      if (!roomLocks) continue;
      for (const [resourceId, lock] of roomLocks) {
        if (Date.parse(lock.expiresAt) <= now) {
          roomLocks.delete(resourceId);
          this.server.to(studioLiveRoom(currentWorkId)).emit("studio:lock:update", {
            action: "expired",
            resourceId,
            leaseId: lock.leaseId,
          });
        }
      }
      if (roomLocks.size === 0) this.locksByWork.delete(currentWorkId);
    }
  }

  private listParticipants(workId: string): StudioLiveParticipant[] {
    const socketIds = this.socketIdsByWork.get(workId);
    if (!socketIds) return [];
    return [...socketIds]
      .map((socketId) => this.participantsBySocket.get(socketId))
      .filter((participant): participant is StudioLiveParticipantInternal => participant !== undefined)
      .map(publicParticipant)
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt) || left.connectionId.localeCompare(right.connectionId));
  }

  private listLocks(workId: string): StudioLiveLock[] {
    this.purgeExpiredLocks(workId);
    return [...(this.locksByWork.get(workId)?.values() ?? [])].sort((left, right) =>
      left.resourceId.localeCompare(right.resourceId)
    );
  }

  private emitPresenceSnapshot(workId: string): void {
    this.server.to(studioLiveRoom(workId)).emit("studio:presence:snapshot", {
      workId,
      participants: this.listParticipants(workId),
    });
  }
}
