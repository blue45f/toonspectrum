import { allowedCorsOrigins } from "../../config/cors";

import { studioLiveFailure as failure } from "./studio-live-ack";

import type { StudioLiveLockRecord } from "./studio-live-lock.repository";
import type {
  StudioLiveAuthPrincipal,
  StudioLiveCrdtBinarySyncResult,
  StudioLiveFailure,
  StudioLiveFailureCode,
  StudioLiveIdentityClaim,
  StudioLiveLock,
  StudioLiveLockReleaseFailure,
  StudioLiveLockRequestFailure,
  StudioLiveParticipant,
  StudioLiveSocket,
  StudioLiveVoiceMember,
} from "./studio-live.protocol";

export const STUDIO_LIVE_NAMESPACE = "/studio-live";
export const STUDIO_LIVE_ROOM_PREFIX = "studio-live:";
export const STUDIO_LIVE_IDENTITY_ROOM_PREFIX = "studio-live-identity:";
export const STUDIO_LIVE_CRDT_BINARY_ROOM_PREFIX = "studio-live-crdt-binary-v1:";
export const STUDIO_LIVE_ACCESS_RECHECK_MS = 15_000;
export const STUDIO_LIVE_ACCESS_CACHE_MS = 5_000;
export const STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS = 2_000;
export const STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_MS = 2_000;
export const STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_LIMIT = 512;
export const STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_TTL_MS = 10_000;
export const STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_LIMIT = 4_096;
export const STUDIO_LIVE_MAX_HTTP_BUFFER_SIZE = 384 * 1_024;
export const STUDIO_LIVE_VOICE_MAX_PARTICIPANTS = 6;
export const STUDIO_LIVE_ROOM_MAX_PARTICIPANTS = 30;
export const STUDIO_LIVE_MAX_CONNECTIONS_PER_USER = 8;
export const STUDIO_LIVE_CONNECTION_LIMIT_MESSAGE =
  `한 계정이 동시에 열 수 있는 실시간 작업실 연결은 최대 ${STUDIO_LIVE_MAX_CONNECTIONS_PER_USER}개입니다. 다른 탭이나 기기의 작업실을 닫아 주세요.`;
export const STUDIO_LIVE_RATE_LIMIT_IDENTITY_CAPACITY = 4_096;
export const STUDIO_LIVE_RATE_LIMIT_PRUNE_INTERVAL_MS = 30_000;

export interface StudioLiveParticipantInternal extends StudioLiveParticipant {
  userId: string;
  workId: string;
  authorizedAt: number;
  authorizationSequence: number;
  authorizationExpiresAt: number | null;
}

export interface StudioLiveVoiceMemberInternal extends StudioLiveVoiceMember {
  workId: string;
}

export interface StudioLiveCrdtBinarySelectionState {
  socket: StudioLiveSocket;
  workId: string;
  selectionEpoch: string;
  selected: boolean;
  pendingJoin: Promise<void> | null;
  cleanup: Promise<void> | null;
}

export type StudioLiveCrdtBinarySyncWireResult = Omit<
  StudioLiveCrdtBinarySyncResult,
  "diff"
>;

export interface StudioLiveVoiceRelayDiscovery {
  sender: StudioLiveParticipant;
  target: StudioLiveParticipant;
}

export type StudioLiveVoiceLeaveReason =
  | "left"
  | "capacity"
  | "revoked"
  | "switched"
  | "removed";

export type StudioLivePeerRelayAuthorization =
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

export type StudioLiveRelaySenderAuthorization =
  | { ok: true; sender: StudioLiveParticipantInternal }
  | { ok: false; response: StudioLiveFailure };

export interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

export interface StudioLiveParticipantAuthorizationRecheck {
  participant: StudioLiveParticipantInternal;
  promise: Promise<number | null>;
}

export interface StudioLiveCandidateRelayAuthorization {
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

export type StudioLiveIdentityAdmission =
  | {
      status: "claimed";
      claim: StudioLiveIdentityClaim;
      replacedConnectionIds: string[];
    }
  | { status: "conflict" }
  | { status: "unavailable" };

export function studioLiveRoom(workId: string): string {
  return `${STUDIO_LIVE_ROOM_PREFIX}${workId}`;
}

export function studioLiveIdentityRoom(workId: string): string {
  return `${STUDIO_LIVE_IDENTITY_ROOM_PREFIX}${workId}`;
}

export function studioLiveCrdtBinaryRoom(workId: string): string {
  return `${STUDIO_LIVE_CRDT_BINARY_ROOM_PREFIX}${workId}`;
}

export function publicParticipant(participant: StudioLiveParticipantInternal): StudioLiveParticipant {
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

export function copyPublicParticipant(participant: StudioLiveParticipant): StudioLiveParticipant {
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

export function publicLock(lock: StudioLiveLockRecord): StudioLiveLock {
  return {
    resourceId: lock.resourceId,
    leaseId: lock.leaseId,
    ownerConnectionId: lock.ownerConnectionId,
    ownerName: lock.ownerName,
    expiresAt: lock.expiresAt.toISOString(),
    revision: lock.revision.toString(),
  };
}

export function lockRequestFailure(
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

export function lockReleaseFailure(
  requestId: string,
  code: StudioLiveFailureCode,
  message: string
): StudioLiveLockReleaseFailure {
  return {
    ...failure(code, message),
    requestId,
  };
}

export function canonicalBase64DecodedLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function normalizedMemberName(value: unknown): string {
  if (typeof value !== "string") return "팀원";
  const name = value.trim();
  return name.length > 0 ? name.slice(0, 80) : "팀원";
}

export function studioLiveAuthorizationExpiresAt(value: string | undefined): number | null {
  if (value === undefined) return null;
  return Date.parse(value);
}

export function isStudioLiveAuthorizationLeaseCurrent(
  authorizationExpiresAt: number | null,
  now = Date.now()
): boolean {
  return (
    authorizationExpiresAt === null ||
    (Number.isFinite(authorizationExpiresAt) && authorizationExpiresAt > now)
  );
}

export function isStudioLiveIdentityClaim(
  value: unknown,
  socketId: string,
  workId: string
): value is StudioLiveIdentityClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<StudioLiveIdentityClaim>;
  return (
    claim.connectionId === socketId &&
    claim.workId === workId &&
    typeof claim.clientInstanceId === "string" &&
    claim.clientInstanceId.length >= 1 &&
    claim.clientInstanceId.length <= 80 &&
    typeof claim.principalFingerprint === "string" &&
    /^[A-Za-z0-9_-]{43}$/u.test(claim.principalFingerprint)
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
