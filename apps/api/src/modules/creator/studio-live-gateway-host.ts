
import type { CreatorService } from "./creator.service";
import type { StudioCrdtService } from "./studio-crdt.service";
import type { StudioLiveAdapterCleanupService } from "./studio-live-adapter-cleanup.service";
import type {
  StudioLiveCleanupNotificationDispatcher,
  StudioLiveCleanupNotificationRetry,
} from "./studio-live-cleanup-notification-dispatcher";
import type { StudioLiveCrdtQuotaLimiter } from "./studio-live-crdt-quota";
import type { StudioLiveFeaturePolicy } from "./studio-live-feature-policy";
import type {
  RateLimitBucket,
  StudioLiveCandidateRelayAuthorization,
  StudioLiveCrdtBinarySelectionState,
  StudioLiveIdentityAdmission,
  StudioLiveParticipantAuthorizationRecheck,
  StudioLiveParticipantInternal,
  StudioLivePeerRelayAuthorization,
  StudioLiveRelaySenderAuthorization,
  StudioLiveVoiceLeaveReason,
  StudioLiveVoiceMemberInternal,
  StudioLiveVoiceRelayDiscovery,
} from "./studio-live-gateway-constants";
import type { StudioLiveInterServerRelayTransport } from "./studio-live-inter-server-relay-transport";
import type { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";
import type { StudioLiveLockRecord, StudioLiveLockRepository } from "./studio-live-lock.repository";
import type {
  StudioLiveRoomTransitionCoordinator,
  StudioLiveRoomTransitionState,
} from "./studio-live-room-transition-coordinator";
import type { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";
import type {
  StudioLiveAck,
  StudioLiveAckCallback,
  StudioLiveActiveScreenShare,
  StudioLiveAuthPrincipal,
  StudioLiveIdentityClaim,
  StudioLiveInterServerRelayEvent,
  StudioLiveJoinInput,
  StudioLiveJoinResult,
  StudioLiveLock,
  StudioLiveParticipant,
  StudioLiveSignalInput,
  StudioLiveSocket,
  StudioLiveVoiceMember,
  StudioLiveVoiceSignalInput,
} from "./studio-live.protocol";
import type { Logger } from "@nestjs/common";
import type { Namespace } from "socket.io";

/**
 * Narrow host surface for extracted gateway helpers. Private fields stay on StudioLiveGateway;
 * helpers receive the instance through this type so they can keep using `this.*` access.
 */
export interface StudioLiveGatewayFields {
  readonly logger: Logger;
  server: Namespace;
  readonly participantsBySocket: Map<string, StudioLiveParticipantInternal>;
  readonly socketIdsByWork: Map<string, Set<string>>;
  readonly lockCleanupByConnectionWork: Map<string, Promise<void>>;
  readonly lockOperationTailByResource: Map<string, Promise<void>>;
  readonly rateLimits: Map<string, Map<string, RateLimitBucket>>;
  lastRateLimitPruneAt: number | null;
  readonly connectionIdsByUser: Map<string, Set<string>>;
  readonly userIdByConnection: Map<string, string>;
  readonly crdtQuotaLimiter: StudioLiveCrdtQuotaLimiter;
  readonly crdtBinarySelectionBySocket: Map<string, StudioLiveCrdtBinarySelectionState>;
  readonly participantAuthorizationRechecks: Map<string, StudioLiveParticipantAuthorizationRecheck>;
  readonly candidateRelayAuthorizations: Map<string, StudioLiveCandidateRelayAuthorization>;
  readonly voiceMembershipBySocket: Map<string, StudioLiveVoiceMemberInternal>;
  readonly deliveredInterServerVoiceSignals: Map<string, number>;
  accessRecheckTimer: ReturnType<typeof setInterval> | null;
  readonly creatorService: CreatorService;
  readonly adapterCleanup: StudioLiveAdapterCleanupService;
  readonly cleanupNotifications: StudioLiveCleanupNotificationDispatcher;
  readonly interServerRelayTransport: StudioLiveInterServerRelayTransport;
  readonly socketAuthentication: StudioLiveSocketAuthService;
  readonly joinTransitions: StudioLiveJoinTransitionSequencer;
  readonly roomTransitions: StudioLiveRoomTransitionCoordinator;
  readonly liveFeatures: StudioLiveFeaturePolicy;
  readonly studioCrdtService: StudioCrdtService;
  readonly studioLiveLockRepository: StudioLiveLockRepository;
}

export interface StudioLiveGatewayHost extends StudioLiveGatewayFields {
  performJoin(
    client: StudioLiveSocket,
    input: StudioLiveJoinInput,
    transitionSequence: number,
    ack?: StudioLiveAckCallback<StudioLiveJoinResult>
  ): Promise<StudioLiveAck<StudioLiveJoinResult>>;
  disconnectInvalidJoinSession(client: StudioLiveSocket): void;
  isCurrentJoinTransition(client: StudioLiveSocket, transitionSequence: number): boolean;
  currentRoomTransitionState(
    client: StudioLiveSocket,
    transitionSequence: number
  ): StudioLiveRoomTransitionState;
  disconnectRoomIsolationFailure(client: StudioLiveSocket): void;
  removeSwitchedParticipantIfCurrent(
    socketId: string,
    expectedParticipant: StudioLiveParticipantInternal
  ): void;
  claimClientIdentity(
    client: StudioLiveSocket,
    input: StudioLiveJoinInput,
    principal: StudioLiveAuthPrincipal
  ): Promise<StudioLiveIdentityAdmission>;
  runIdentityAdapterOperation<T>(operation: Promise<T>, label: string): Promise<T>;
  rollbackPendingIdentityClaim(
    client: StudioLiveSocket,
    expected: StudioLiveIdentityClaim
  ): Promise<void>;
  commitClientIdentityClaim(client: StudioLiveSocket, claim: StudioLiveIdentityClaim): void;
  disconnectReplacedClientIdentities(workId: string, connectionIds: readonly string[]): void;
  clearSocketIdentityClaims(client: StudioLiveSocket): void;
  rateLimitIdentity(client: StudioLiveSocket): string | null;
  hasLocalRelayTarget(connectionId: string): boolean;
  authorizeRemoteRelaySender(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    selfTargetMessage: string
  ): Promise<StudioLiveRelaySenderAuthorization>;
  sendInterServerRelay(
    sender: StudioLiveParticipantInternal,
    workId: string,
    targetConnectionId: string,
    relay: StudioLiveInterServerRelayEvent
  ): Promise<boolean>;
  receiveInterServerRelay(request: unknown): Promise<boolean>;
  discoverVoiceRelayPeers(
    workId: string,
    expectedSender: StudioLiveParticipant,
    expectedTarget: StudioLiveParticipantInternal,
    callId: string,
    deadlineAt: number
  ): Promise<StudioLiveVoiceRelayDiscovery | null>;
  consumeInterServerVoiceSignal(
    workId: string,
    senderConnectionId: string,
    targetConnectionId: string,
    callId: string,
    signalId: string
  ): boolean;
  emitRelayToSocket(
    targetSocket: StudioLiveSocket,
    sender: StudioLiveParticipant,
    relay: StudioLiveInterServerRelayEvent
  ): void;
  emitAuthorizedLocalRelay(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>,
    relay: StudioLiveInterServerRelayEvent
  ): boolean;
  signalRelayEvent(signalId: string, signal: StudioLiveSignalInput): StudioLiveInterServerRelayEvent;
  voiceSignalRelayEvent(
    signalId: string,
    signal: StudioLiveVoiceSignalInput
  ): StudioLiveInterServerRelayEvent;
  voiceRelayPeersMatch(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>,
    callId: string
  ): boolean;
  candidateRelayAuthorizationKey(
    workId: string,
    shareId: string,
    firstConnectionId: string,
    secondConnectionId: string
  ): string;
  cachedCandidateRelayAuthorization(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    shareId: string
  ): Extract<StudioLivePeerRelayAuthorization, { ok: true }> | null;
  relayAuthorizationSnapshot(
    sender: StudioLiveParticipantInternal,
    target: StudioLiveParticipantInternal
  ): Extract<StudioLivePeerRelayAuthorization, { ok: true }> | null;
  isRelayAuthorizationCurrent(
    authorization: Extract<StudioLivePeerRelayAuthorization, { ok: true }>
  ): boolean;
  rememberCandidateRelayAuthorization(
    workId: string,
    shareId: string,
    first: StudioLiveParticipantInternal,
    second: StudioLiveParticipantInternal,
    refresh: boolean
  ): void;
  purgeExpiredCandidateRelayAuthorizations(now?: number): void;
  deleteCandidateRelayAuthorization(
    workId: string,
    shareId: string,
    firstConnectionId: string,
    secondConnectionId: string
  ): void;
  deleteCandidateRelayAuthorizationsForShare(
    workId: string,
    shareId: string,
    connectionId: string
  ): void;
  deleteCandidateRelayAuthorizationsForSocket(connectionId: string): void;
  authorizeRelayPeers(
    client: StudioLiveSocket,
    workId: string,
    targetConnectionId: string,
    selfTargetMessage: string,
    authorizationMode?: "candidate-coalesced" | "force" | "rebase"
  ): Promise<StudioLivePeerRelayAuthorization>;
  isSocketCurrent(client: StudioLiveSocket): boolean;
  isSocketPrincipalCurrent(
    client: StudioLiveSocket,
    principal: StudioLiveAuthPrincipal,
    userId: string
  ): boolean;
  currentJoinedCrdtParticipant(
    client: StudioLiveSocket,
    workId: string
  ): StudioLiveParticipantInternal | null;
  currentCrdtBinarySelection(
    client: StudioLiveSocket,
    workId: string,
    selectionEpoch: string | undefined,
    requireSelected: boolean
  ): StudioLiveCrdtBinarySelectionState | null;
  beginCrdtBinarySelectionCleanup(selection: StudioLiveCrdtBinarySelectionState): Promise<void>;
  finishCrdtBinarySelectionCleanup(selection: StudioLiveCrdtBinarySelectionState): Promise<void>;
  resetCrdtBinarySelectionForJoin(client: StudioLiveSocket): Promise<boolean>;
  clearCrdtBinarySelectionBestEffort(socketId: string, expectedSocket?: StudioLiveSocket): void;
  logCrdtBroadcastFailure(
    workId: string,
    updateId: string,
    error: unknown,
    wire: "legacy" | "binary"
  ): void;
  consumeRateLimit(
    client: StudioLiveSocket,
    action: string,
    maximum: number,
    windowMs: number
  ): boolean;
  pruneRateLimits(now: number): void;
  hasUserConnectionCapacity(userId: string, socketId: string): boolean;
  registerUserConnection(userId: string, socketId: string): void;
  releaseUserConnection(socketId: string): void;
  isParticipantAuthorizationCurrent(
    client: StudioLiveSocket,
    participant: StudioLiveParticipantInternal,
    requireEdit: boolean
  ): boolean;
  runWithAuthorizedParticipant<T>(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    forceRecheck: boolean,
    action: (participant: StudioLiveParticipantInternal) => T
  ): Promise<{ value: T } | null>;
  authorizedParticipant(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    forceRecheck?: boolean
  ): Promise<StudioLiveParticipantInternal | null>;
  authorizedParticipantWithMode(
    client: StudioLiveSocket,
    workId: string,
    requireEdit: boolean,
    initialMode: "cached" | "coalesced-force" | "force" | "sweep"
  ): Promise<StudioLiveParticipantInternal | null>;
  startParticipantAuthorizationRecheck(
    socketId: string,
    participant: StudioLiveParticipantInternal
  ): StudioLiveParticipantAuthorizationRecheck;
  revalidateParticipant(
    socketId: string,
    expectedParticipant?: StudioLiveParticipantInternal
  ): Promise<number | null>;
  revalidateAllParticipants(): Promise<void>;
  disconnectInvalidSession(
    socketId: string,
    expectedParticipant: StudioLiveParticipantInternal
  ): void;
  revokeParticipant(socketId: string): void;
  removeParticipant(socketId: string, reason: "disconnect" | "switch" | "revoked"): void;
  rollbackLockAcquireBestEffort(
    lock: StudioLiveLockRecord,
    rotatingProtocol: boolean,
    previousLeaseId?: string
  ): Promise<void>;
  releaseSocketLocks(
    participant: StudioLiveParticipantInternal,
    action?: "released" | "revoked"
  ): Promise<void>;
  socketLockCleanupKey(workId: string, connectionId: string): string;
  socketLockOperationKey(connectionId: string, workId: string, resourceId: string): string;
  withSocketLockOperation<T>(
    connectionId: string,
    workId: string,
    resourceId: string,
    operation: () => Promise<T>
  ): Promise<T>;
  awaitSocketLockCleanup(workId: string, connectionId: string): Promise<void>;
  purgeExpiredLocks(): Promise<void>;
  localParticipants(workId: string): StudioLiveParticipant[];
  publishParticipantToSocketData(
    socket: StudioLiveSocket,
    participant: StudioLiveParticipantInternal
  ): StudioLiveParticipant;
  publishScreenShareToSocketData(
    socket: StudioLiveSocket,
    participant: StudioLiveParticipantInternal,
    shareId: string,
    label: string
  ): StudioLiveActiveScreenShare;
  activeScreenShareForSocket(
    socket: StudioLiveSocket,
    workId: string
  ): StudioLiveActiveScreenShare | null;
  publicVoiceMember(member: StudioLiveVoiceMemberInternal): StudioLiveVoiceMember;
  emitVoiceLeave(
    member: StudioLiveVoiceMemberInternal,
    reason?: StudioLiveVoiceLeaveReason
  ): void;
  detachVoiceMembership(socketId: string): StudioLiveVoiceMemberInternal | undefined;
  removeVoiceMembership(socketId: string, reason?: StudioLiveVoiceLeaveReason): void;
  emitCleanupNotificationBestEffort(target: string, event: string, payload: unknown): void;
  emitCleanupNotificationBestEffort(
    target: string,
    event: string,
    payload: unknown,
    retry: "bounded",
    isStillRelevant: () => boolean
  ): void;
  emitCleanupNotificationBestEffort(
    target: string,
    event: string,
    payload: unknown,
    retry?: StudioLiveCleanupNotificationRetry,
    isStillRelevant?: () => boolean
  ): void;
  localVoiceMembers(workId: string, callId?: string): StudioLiveVoiceMember[];
  localScreenShares(workId: string): StudioLiveActiveScreenShare[];
  listScreenShares(workId: string): Promise<StudioLiveActiveScreenShare[]>;
  listVoiceMembers(
    workId: string,
    callId?: string,
    options?: { fallbackToLocal?: boolean }
  ): Promise<StudioLiveVoiceMember[]>;
  listParticipants(workId: string): Promise<StudioLiveParticipant[]>;
  lockSnapshot(workId: string): Promise<{ revision: string; locks: StudioLiveLock[] }>;
}

export function asStudioLiveGatewayHost(gateway: object): StudioLiveGatewayHost {
  return gateway as StudioLiveGatewayHost;
}
