import {
  STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS,
  copyPublicParticipant,
  publicLock,
  publicParticipant,
  studioLiveIdentityRoom,
  studioLiveRoom,
  type StudioLiveParticipantInternal,
  type StudioLiveVoiceLeaveReason,
  type StudioLiveVoiceMemberInternal,
} from "./studio-live-gateway-constants";
import { studioLiveLockRequestIdFromAcquisitionId } from "./studio-live-lock.repository";
import {
  StudioLiveActiveScreenShareSchema,
  StudioLivePublicParticipantSchema,
  StudioLiveVoiceMemberSchema,
} from "./studio-live.protocol";

import type { StudioLiveCleanupNotificationRetry } from "./studio-live-cleanup-notification-dispatcher";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveLockRecord } from "./studio-live-lock.repository";
import type {
  StudioLiveActiveScreenShare,
  StudioLiveLock,
  StudioLiveLockUpdate,
  StudioLiveParticipant,
  StudioLiveSocket,
  StudioLiveSocketData,
  StudioLiveVoiceMember,
} from "./studio-live.protocol";

export function disconnectInvalidSession(
  this: StudioLiveGatewayHost, 
  socketId: string,
  expectedParticipant: StudioLiveParticipantInternal
): void {
  if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;
  this.clearCrdtBinarySelectionBestEffort(socketId);
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
      this.releaseUserConnection(socketId);
      this.socketAuthentication.clearBySocketId(socketId, socket);
    },
  });
}

export function revokeParticipant(
  this: StudioLiveGatewayHost, socketId: string): void {
  const participant = this.participantsBySocket.get(socketId);
  if (!participant) return;
  this.clearCrdtBinarySelectionBestEffort(socketId);
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
      this.releaseUserConnection(socketId);
      this.joinTransitions.invalidate(socketId);
      this.socketAuthentication.clearBySocketId(socketId, socket);
    },
  });
}

export function removeParticipant(
  this: StudioLiveGatewayHost, socketId: string, reason: "disconnect" | "switch" | "revoked"): void {
  const participant = this.participantsBySocket.get(socketId);
  if (!participant) return;
  const voiceMember = this.detachVoiceMembership(socketId);
  this.participantsBySocket.delete(socketId);
  const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
  const activeShare = socket
    ? this.activeScreenShareForSocket(socket, participant.workId)
    : null;
  if (socket) {
    const identityClaim = socket.data.studioIdentityClaim;
    if (
      identityClaim?.connectionId === socketId &&
      identityClaim.workId === participant.workId
    ) {
      delete socket.data.studioIdentityClaim;
      void Promise.resolve()
        .then(() =>
          socket.leave(studioLiveIdentityRoom(participant.workId))
        )
        .catch(() => undefined);
    }
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

export async function rollbackLockAcquireBestEffort(
  this: StudioLiveGatewayHost, 
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

export function releaseSocketLocks(
  this: StudioLiveGatewayHost, 
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

export function socketLockCleanupKey(
  this: StudioLiveGatewayHost, workId: string, connectionId: string): string {
  return JSON.stringify([workId, connectionId]);
}

export function socketLockOperationKey(
  this: StudioLiveGatewayHost, 
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
export async function withSocketLockOperation<T>(
  this: StudioLiveGatewayHost, 
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

export async function awaitSocketLockCleanup(
  this: StudioLiveGatewayHost, workId: string, connectionId: string): Promise<void> {
  const cleanupKey = this.socketLockCleanupKey(workId, connectionId);
  while (true) {
    const pending = this.lockCleanupByConnectionWork.get(cleanupKey);
    if (!pending) return;
    await pending;
    if (this.lockCleanupByConnectionWork.get(cleanupKey) === pending) return;
  }
}

export async function purgeExpiredLocks(
  this: StudioLiveGatewayHost, ): Promise<void> {
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

export function localParticipants(
  this: StudioLiveGatewayHost, workId: string): StudioLiveParticipant[] {
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

export function publishParticipantToSocketData(
  this: StudioLiveGatewayHost, 
  socket: StudioLiveSocket,
  participant: StudioLiveParticipantInternal
): StudioLiveParticipant {
  const safe = publicParticipant(participant);
  socket.data.studioWorkId = participant.workId;
  socket.data.studioParticipant = safe;
  if (!participant.sharingScreen) delete socket.data.studioScreenShare;
  return safe;
}

export function publishScreenShareToSocketData(
  this: StudioLiveGatewayHost, 
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

export function activeScreenShareForSocket(
  this: StudioLiveGatewayHost, 
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

export function publicVoiceMember(
  this: StudioLiveGatewayHost, member: StudioLiveVoiceMemberInternal): StudioLiveVoiceMember {
  return {
    connectionId: member.connectionId,
    callId: member.callId,
    muted: member.muted,
  };
}

export function emitVoiceLeave(
  this: StudioLiveGatewayHost, 
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

export function detachVoiceMembership(
  this: StudioLiveGatewayHost, socketId: string): StudioLiveVoiceMemberInternal | undefined {
  const member = this.voiceMembershipBySocket.get(socketId);
  if (!member) return undefined;
  this.voiceMembershipBySocket.delete(socketId);
  const socket = this.server.sockets.get(socketId) as StudioLiveSocket | undefined;
  if (socket) delete socket.data.studioVoiceMember;
  return member;
}

export function removeVoiceMembership(
  this: StudioLiveGatewayHost, 
  socketId: string,
  reason: StudioLiveVoiceLeaveReason = "removed"
): void {
  const member = this.detachVoiceMembership(socketId);
  if (!member) return;
  this.emitVoiceLeave(member, reason);
}

export function emitCleanupNotificationBestEffort(
  this: StudioLiveGatewayHost, 
  target: string,
  event: string,
  payload: unknown
): void;
export function emitCleanupNotificationBestEffort(
  this: StudioLiveGatewayHost, 
  target: string,
  event: string,
  payload: unknown,
  retry: "bounded",
  isStillRelevant: () => boolean
): void;
export function emitCleanupNotificationBestEffort(
  this: StudioLiveGatewayHost, 
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

export function localVoiceMembers(
  this: StudioLiveGatewayHost, workId: string, callId?: string): StudioLiveVoiceMember[] {
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

export function localScreenShares(
  this: StudioLiveGatewayHost, workId: string): StudioLiveActiveScreenShare[] {
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

export async function listScreenShares(
  this: StudioLiveGatewayHost, workId: string): Promise<StudioLiveActiveScreenShare[]> {
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

export async function listVoiceMembers(
  this: StudioLiveGatewayHost, 
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
export async function listParticipants(
  this: StudioLiveGatewayHost, workId: string): Promise<StudioLiveParticipant[]> {
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

export async function lockSnapshot(
  this: StudioLiveGatewayHost, 
  workId: string
): Promise<{ revision: string; locks: StudioLiveLock[] }> {
  const snapshot = await this.studioLiveLockRepository.snapshot(workId);
  return {
    revision: snapshot.revision.toString(),
    locks: snapshot.locks.map(publicLock),
  };
}
