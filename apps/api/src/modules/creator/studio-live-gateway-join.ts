import { studioLivePrincipalFingerprint } from "../../server/session";

import { replyStudioLiveAck as reply, studioLiveFailure as failure } from "./studio-live-ack";
import {
  STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS,
  STUDIO_LIVE_CONNECTION_LIMIT_MESSAGE,
  STUDIO_LIVE_ROOM_MAX_PARTICIPANTS,
  isStudioLiveAuthorizationLeaseCurrent,
  isStudioLiveIdentityClaim,
  normalizedMemberName,
  studioLiveAuthorizationExpiresAt,
  studioLiveIdentityRoom,
  studioLiveRoom,
  type StudioLiveIdentityAdmission,
  type StudioLiveParticipantInternal,
} from "./studio-live-gateway-constants";
import {
  STUDIO_CRDT_SUPPORTED_WIRE_FORMATS,
  STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
  STUDIO_LIVE_LOCK_REVISION_VERSION,
} from "./studio-live.protocol";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveRoomTransitionState } from "./studio-live-room-transition-coordinator";
import type {
  StudioLiveAck,
  StudioLiveAckCallback,
  StudioLiveAuthPrincipal,
  StudioLiveFailure,
  StudioLiveIdentityClaim,
  StudioLiveJoinInput,
  StudioLiveJoinResult,
  StudioLiveSocket,
  StudioLiveSocketData,
} from "./studio-live.protocol";

export async function performJoin(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  input: StudioLiveJoinInput,
  transitionSequence: number,
  ack?: StudioLiveAckCallback<StudioLiveJoinResult>
): Promise<StudioLiveAck<StudioLiveJoinResult>> {
  if (!this.isCurrentJoinTransition(client, transitionSequence)) {
    return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
  }
  let pendingIdentityClaim: StudioLiveIdentityClaim | null = null;
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
  // Refuse an over-cap account before any ACL/session I/O, so extra sockets cost this node a
  // parse and a map lookup rather than a database round-trip each. Re-checked authoritatively at
  // the commit boundary below, where nothing async can widen the window.
  if (!this.hasUserConnectionCapacity(userId, client.id)) {
    return reply(ack, failure("rate_limited", STUDIO_LIVE_CONNECTION_LIMIT_MESSAGE));
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
    if (!(await this.resetCrdtBinarySelectionForJoin(client))) {
      if (joinedNewRoom) {
        this.roomTransitions.leaveJoinedRoomBestEffort(client, nextRoom);
      }
      this.disconnectRoomIsolationFailure(client);
      const currentParticipant = this.participantsBySocket.get(client.id);
      if (currentParticipant) this.removeParticipant(client.id, "revoked");
      return reply(
        ack,
        failure("not_joined", "바이너리 공동 편집 채널을 안전하게 전환하지 못했습니다.")
      );
    }
    if (
      !this.isCurrentJoinTransition(client, transitionSequence) ||
      !this.isSocketPrincipalCurrent(client, principal, userId)
    ) {
      if (joinedNewRoom) {
        await this.roomTransitions.rollbackEnteredRoom(
          client,
          nextRoom,
          () => this.disconnectRoomIsolationFailure(client)
        );
      }
      return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
    }

    const identityAdmission = await this.claimClientIdentity(
      client,
      input,
      principal
    );
    if (
      !this.isCurrentJoinTransition(client, transitionSequence) ||
      !this.isSocketPrincipalCurrent(client, principal, userId)
    ) {
      if (identityAdmission.status === "claimed") {
        await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
      }
      if (joinedNewRoom) {
        await this.roomTransitions.rollbackEnteredRoom(
          client,
          nextRoom,
          () => this.disconnectRoomIsolationFailure(client)
        );
      }
      return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
    }
    if (identityAdmission.status !== "claimed") {
      if (joinedNewRoom) {
        await this.roomTransitions.rollbackEnteredRoom(
          client,
          nextRoom,
          () => this.disconnectRoomIsolationFailure(client)
        );
      }
      return reply(
        ack,
        identityAdmission.status === "conflict"
          ? failure(
              "forbidden",
              "같은 브라우저 작업 식별자가 다른 계정에서 사용 중입니다. 작업실을 새로 열어 주세요."
            )
          : failure(
              "temporarily_unavailable",
              "실시간 작업 식별자를 안전하게 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
      );
    }
    pendingIdentityClaim = identityAdmission.claim;

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
        await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
        this.clearSocketIdentityClaims(client);
        this.removeSwitchedParticipantIfCurrent(client.id, existing);
        return reply(ack, failure("not_joined", "실시간 작업실 연결이 종료되었습니다."));
      }
      if (leftPreviousRoomState === "generation_stale") {
        await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
        this.removeSwitchedParticipantIfCurrent(client.id, existing);
        return reply(ack, failure("not_joined", "더 최신 작업실 참가 요청으로 대체되었습니다."));
      }
      if (!this.isSocketPrincipalCurrent(client, principal, userId)) {
        await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
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
      await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
      return rejectInvalidSession(joinedNewRoom ? nextRoom : undefined);
    }
    if (!isStudioLiveAuthorizationLeaseCurrent(participant.authorizationExpiresAt)) {
      await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
      if (joinedNewRoom) {
        this.roomTransitions.leaveJoinedRoomBestEffort(client, nextRoom);
      }
      return reply(
        ack,
        failure("forbidden", "임시 협업 작업실이 만료되었습니다. 새 작업실을 만들어 주세요.")
      );
    }
    // Authoritative connection cap. The pre-I/O check above can be raced by this account's own
    // parallel joins while each awaits ACL and adapter I/O; this one sits inside the synchronous
    // commit and is the boundary that actually holds.
    if (!this.hasUserConnectionCapacity(userId, client.id)) {
      await this.rollbackPendingIdentityClaim(client, identityAdmission.claim);
      if (joinedNewRoom) {
        this.roomTransitions.leaveJoinedRoomBestEffort(client, nextRoom);
      }
      return reply(ack, failure("rate_limited", STUDIO_LIVE_CONNECTION_LIMIT_MESSAGE));
    }
    if (existing?.workId === input.workId && existing.capabilities.edit && !participant.capabilities.edit) {
      void this.releaseSocketLocks(existing, "revoked");
    }
    this.participantAuthorizationRechecks.delete(client.id);
    this.deleteCandidateRelayAuthorizationsForSocket(client.id);
    this.registerUserConnection(userId, client.id);
    this.participantsBySocket.set(client.id, participant);
    if (participant.role === "viewer") this.removeVoiceMembership(client.id, "revoked");
    const roomSockets = this.socketIdsByWork.get(input.workId) ?? new Set<string>();
    roomSockets.add(client.id);
    this.socketIdsByWork.set(input.workId, roomSockets);
    const safeParticipant = this.publishParticipantToSocketData(client, participant);
    this.commitClientIdentityClaim(client, identityAdmission.claim);
    pendingIdentityClaim = null;
    this.disconnectReplacedClientIdentities(
      input.workId,
      identityAdmission.replacedConnectionIds
    );
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

    const crdtWireSelectionEpoch = crypto.randomUUID();
    this.crdtBinarySelectionBySocket.set(client.id, {
      socket: client,
      workId: input.workId,
      selectionEpoch: crdtWireSelectionEpoch,
      selected: false,
      pendingJoin: null,
      cleanup: null,
    });
    return reply(ack, {
      ok: true,
      data: {
        lockProtocolVersion: STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
        lockRevisionVersion: STUDIO_LIVE_LOCK_REVISION_VERSION,
        lockSnapshotRevision: lockSnapshot.revision,
        crdtWireFormats: STUDIO_CRDT_SUPPORTED_WIRE_FORMATS,
        crdtWireSelectionEpoch,
        self: safeParticipant,
        participants,
        locks: lockSnapshot.locks,
        voiceMembers,
        screenShares,
      },
    });
  } catch {
    if (pendingIdentityClaim) {
      await this.rollbackPendingIdentityClaim(client, pendingIdentityClaim);
    }
    this.logger.warn({ workId: input.workId, socketId: client.id }, "studio live join denied");
    return reply(ack, failure("forbidden", "이 작품의 실시간 작업실에 참여할 수 없습니다."));
  }
}

export function disconnectInvalidJoinSession(
  this: StudioLiveGatewayHost, client: StudioLiveSocket): void {
  // A reconnect may reuse the Socket.IO id while speculative adapter cleanup is pending. Never
  // tear down that replacement socket or its participant when this join belongs to the old one.
  if (!this.isSocketCurrent(client)) {
    this.clearCrdtBinarySelectionBestEffort(client.id, client);
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
  this.releaseUserConnection(client.id);
  this.clearCrdtBinarySelectionBestEffort(client.id, client);
  this.socketAuthentication.clear(client);
  client.disconnect(true);
}

export function isCurrentJoinTransition(
  this: StudioLiveGatewayHost, client: StudioLiveSocket, transitionSequence: number): boolean {
  return this.currentRoomTransitionState(client, transitionSequence) === "current";
}

export function currentRoomTransitionState(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  transitionSequence: number
): StudioLiveRoomTransitionState {
  if (!this.isSocketCurrent(client)) return "socket_stale";
  return this.joinTransitions.isCurrent(client.id, transitionSequence)
    ? "current"
    : "generation_stale";
}

export function disconnectRoomIsolationFailure(
  this: StudioLiveGatewayHost, client: StudioLiveSocket): void {
  this.clearCrdtBinarySelectionBestEffort(client.id, client);
  this.socketAuthentication.clear(client);
  client.disconnect(true);
}

export function removeSwitchedParticipantIfCurrent(
  this: StudioLiveGatewayHost, 
  socketId: string,
  expectedParticipant: StudioLiveParticipantInternal
): void {
  if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;
  this.removeParticipant(socketId, "switch");
}

export async function claimClientIdentity(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  input: StudioLiveJoinInput,
  principal: StudioLiveAuthPrincipal
): Promise<StudioLiveIdentityAdmission> {
  const claim: StudioLiveIdentityClaim = {
    connectionId: client.id,
    workId: input.workId,
    clientInstanceId: input.clientInstanceId,
    principalFingerprint: studioLivePrincipalFingerprint(principal.userId),
  };
  const previousPending = client.data.studioPendingIdentityClaim;
  if (previousPending) {
    await this.rollbackPendingIdentityClaim(client, previousPending);
  }

  try {
    return await this.studioLiveLockRepository.withWorkMutation(
      input.workId,
      async (): Promise<StudioLiveIdentityAdmission> => {
        await this.runIdentityAdapterOperation(
          Promise.resolve().then(() =>
            client.join(studioLiveIdentityRoom(input.workId))
          ),
          "join"
        );
        client.data.studioPendingIdentityClaim = claim;

        let sockets;
        try {
          sockets = await this.runIdentityAdapterOperation(
            this.server.in(studioLiveIdentityRoom(input.workId)).fetchSockets(),
            "discovery"
          );
        } catch (error) {
          await this.rollbackPendingIdentityClaim(client, claim);
          throw error;
        }

        const replacedConnectionIds = new Set<string>();
        for (const socket of sockets) {
          if (socket.id === client.id) continue;
          const data = socket.data as StudioLiveSocketData;
          for (const candidate of [
            data.studioIdentityClaim,
            data.studioPendingIdentityClaim,
          ]) {
            if (
              !isStudioLiveIdentityClaim(candidate, socket.id, input.workId) ||
              candidate.clientInstanceId !== input.clientInstanceId
            ) {
              continue;
            }
            if (
              candidate.principalFingerprint !== claim.principalFingerprint
            ) {
              await this.rollbackPendingIdentityClaim(client, claim);
              return { status: "conflict" };
            }
            replacedConnectionIds.add(socket.id);
          }
        }
        return {
          status: "claimed",
          claim,
          replacedConnectionIds: [...replacedConnectionIds].sort(),
        };
      }
    );
  } catch (error) {
    await this.rollbackPendingIdentityClaim(client, claim);
    this.logger.warn(
      {
        workId: input.workId,
        socketId: client.id,
        error: error instanceof Error ? error.message : "unknown",
      },
      "studio client identity admission failed closed"
    );
    return { status: "unavailable" };
  }
}

export async function runIdentityAdapterOperation<T>(
  this: StudioLiveGatewayHost, 
  operation: Promise<T>,
  label: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`studio identity adapter ${label} timed out`)),
          STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function rollbackPendingIdentityClaim(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  expected: StudioLiveIdentityClaim
): Promise<void> {
  const pending = client.data.studioPendingIdentityClaim;
  if (
    !pending ||
    pending.connectionId !== expected.connectionId ||
    pending.workId !== expected.workId ||
    pending.clientInstanceId !== expected.clientInstanceId ||
    pending.principalFingerprint !== expected.principalFingerprint
  ) {
    return;
  }
  delete client.data.studioPendingIdentityClaim;
  if (client.data.studioIdentityClaim?.workId === expected.workId) return;
  try {
    await this.runIdentityAdapterOperation(
      Promise.resolve().then(() =>
        client.leave(studioLiveIdentityRoom(expected.workId))
      ),
      "rollback"
    );
  } catch {
    // The comparison claim is already removed. A stale empty room membership carries no
    // authority and disappears when this socket disconnects.
  }
}

export function commitClientIdentityClaim(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  claim: StudioLiveIdentityClaim
): void {
  const previous = client.data.studioIdentityClaim;
  client.data.studioIdentityClaim = claim;
  delete client.data.studioPendingIdentityClaim;
  if (previous && previous.workId !== claim.workId) {
    void Promise.resolve()
      .then(() => client.leave(studioLiveIdentityRoom(previous.workId)))
      .catch(() => undefined);
  }
}

export function disconnectReplacedClientIdentities(
  this: StudioLiveGatewayHost, 
  workId: string,
  connectionIds: readonly string[]
): void {
  for (const connectionId of connectionIds) {
    this.server.to(connectionId).emit("studio:access:revoked", {
      workId,
      message: "같은 브라우저 작업 세션이 새 연결로 교체되었습니다.",
    });
    try {
      this.server.in(connectionId).disconnectSockets(true);
    } catch {
      // The replaced socket may already have disconnected. Its adapter-visible claim disappears
      // with the transport, while the new serialized claim remains authoritative.
    }
  }
}

export function clearSocketIdentityClaims(
  this: StudioLiveGatewayHost, client: StudioLiveSocket): void {
  const workIds = new Set(
    [
      client.data.studioIdentityClaim?.workId,
      client.data.studioPendingIdentityClaim?.workId,
    ].filter((workId): workId is string => typeof workId === "string")
  );
  delete client.data.studioIdentityClaim;
  delete client.data.studioPendingIdentityClaim;
  for (const workId of workIds) {
    void Promise.resolve()
      .then(() => client.leave(studioLiveIdentityRoom(workId)))
      .catch(() => undefined);
  }
}

/**
 * Resolves the budget key from socket-private authentication state. This is a cached, synchronous
 * read — no session or ACL I/O — so callers that deliberately charge before revalidating (join)
 * keep that ordering.
 *
 * An expired principal still names a server-verified account, so it is charged rather than
 * rejected here. Rejecting it would short-circuit the caller before its own authorization
 * boundary runs, and that boundary is what disconnects the socket, emits studio:access:revoked,
 * and clears the principal — turning a fail-closed teardown into a socket that merely gets a
 * rate-limit reply and stays connected.
 */
export function rateLimitIdentity(
  this: StudioLiveGatewayHost, client: StudioLiveSocket): string | null {
  return this.socketAuthentication.principal(client)?.userId ?? null;
}
