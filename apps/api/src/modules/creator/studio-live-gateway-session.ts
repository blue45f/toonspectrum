import {
  STUDIO_LIVE_ACCESS_CACHE_MS,
  STUDIO_LIVE_MAX_CONNECTIONS_PER_USER,
  STUDIO_LIVE_RATE_LIMIT_IDENTITY_CAPACITY,
  STUDIO_LIVE_RATE_LIMIT_PRUNE_INTERVAL_MS,
  isStudioLiveAuthorizationLeaseCurrent,
  studioLiveAuthorizationExpiresAt,
  studioLiveCrdtBinaryRoom,
  studioLiveRoom,
  type RateLimitBucket,
  type StudioLiveCrdtBinarySelectionState,
  type StudioLiveParticipantAuthorizationRecheck,
  type StudioLiveParticipantInternal,
} from "./studio-live-gateway-constants";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveAuthPrincipal, StudioLiveSocket } from "./studio-live.protocol";

export function isSocketCurrent(
  this: StudioLiveGatewayHost, client: StudioLiveSocket): boolean {
  return this.server.sockets.get(client.id) === client;
}

export function isSocketPrincipalCurrent(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  principal: StudioLiveAuthPrincipal,
  userId: string
): boolean {
  return (
    this.isSocketCurrent(client) &&
    this.socketAuthentication.isPrincipalCurrent(client, principal, userId)
  );
}

export function currentJoinedCrdtParticipant(
  this: StudioLiveGatewayHost, 
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

export function currentCrdtBinarySelection(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  workId: string,
  selectionEpoch: string | undefined,
  requireSelected: boolean
): StudioLiveCrdtBinarySelectionState | null {
  const selection = this.crdtBinarySelectionBySocket.get(client.id);
  if (
    !selection ||
    selection.socket !== client ||
    selection.workId !== workId ||
    selection.cleanup ||
    (selectionEpoch !== undefined && selection.selectionEpoch !== selectionEpoch) ||
    (requireSelected && !selection.selected)
  ) {
    return null;
  }
  return selection;
}

/**
 * Invalidates the capability synchronously, then waits for a racing adapter join before leaving
 * the binary-only room. The ordering prevents a stale select from re-entering the room after a
 * reconnect or work switch has already issued a fresh selection epoch.
 */
export function beginCrdtBinarySelectionCleanup(
  this: StudioLiveGatewayHost, 
  selection: StudioLiveCrdtBinarySelectionState
): Promise<void> {
  if (this.crdtBinarySelectionBySocket.get(selection.socket.id) === selection) {
    this.crdtBinarySelectionBySocket.delete(selection.socket.id);
  }
  if (selection.cleanup) return selection.cleanup;

  const cleanup = (async () => {
    if (selection.pendingJoin) {
      try {
        await selection.pendingJoin;
      } catch {
        // A rejected join cannot establish membership, but still attempt a defensive leave.
      }
    }
    await selection.socket.leave(studioLiveCrdtBinaryRoom(selection.workId));
  })();
  selection.cleanup = cleanup;
  return cleanup;
}

export async function finishCrdtBinarySelectionCleanup(
  this: StudioLiveGatewayHost, 
  selection: StudioLiveCrdtBinarySelectionState
): Promise<void> {
  try {
    await this.beginCrdtBinarySelectionCleanup(selection);
  } catch (error) {
    this.logger.warn(
      {
        socketId: selection.socket.id,
        workId: selection.workId,
        error: error instanceof Error ? error.message : "unknown",
      },
      "studio CRDT binary room cleanup failed"
    );
  }
}

export async function resetCrdtBinarySelectionForJoin(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket
): Promise<boolean> {
  const selection = this.crdtBinarySelectionBySocket.get(client.id);
  if (!selection) return true;
  try {
    // Await even when Socket.IO reused the id: adapter membership is keyed by id, so the stale
    // socket's pending join must settle and leave before this replacement receives a new epoch.
    await this.beginCrdtBinarySelectionCleanup(selection);
    return true;
  } catch (error) {
    this.logger.error(
      {
        socketId: client.id,
        workId: selection.workId,
        error: error instanceof Error ? error.message : "unknown",
      },
      "studio CRDT binary room transition failed"
    );
    return false;
  }
}

export function clearCrdtBinarySelectionBestEffort(
  this: StudioLiveGatewayHost, 
  socketId: string,
  expectedSocket?: StudioLiveSocket
): void {
  const selection = this.crdtBinarySelectionBySocket.get(socketId);
  if (!selection || (expectedSocket && selection.socket !== expectedSocket)) return;
  void this.beginCrdtBinarySelectionCleanup(selection).catch((error) => {
    this.logger.warn(
      {
        socketId,
        workId: selection.workId,
        error: error instanceof Error ? error.message : "unknown",
      },
      "studio CRDT binary room cleanup failed"
    );
  });
}

export function logCrdtBroadcastFailure(
  this: StudioLiveGatewayHost, 
  workId: string,
  updateId: string,
  error: unknown,
  wire: "legacy" | "binary"
): void {
  this.logger.error(
    {
      workId,
      updateId,
      wire,
      error: error instanceof Error ? error.message : "unknown",
    },
    "studio CRDT update persisted but peer broadcast failed"
  );
}

export function consumeRateLimit(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  action: string,
  maximum: number,
  windowMs: number
): boolean {
  const identity = this.rateLimitIdentity(client);
  // A socket with no server-verified principal has no budget to charge, and must never fall back
  // to its connection id — that per-socket key is the multiplier this replaced. It is also not
  // rejected here: every caller's authorization boundary already refuses an unauthenticated
  // socket synchronously, without session or ACL I/O (revalidate() and authorizedParticipant()
  // both short-circuit on a missing principal), so there is no work left for a budget to protect
  // and letting the caller answer keeps its authoritative typed error instead of masking it.
  if (identity === null) return true;
  const now = Date.now();
  this.pruneRateLimits(now);
  const existing = this.rateLimits.get(identity);
  if (!existing && this.rateLimits.size >= STUDIO_LIVE_RATE_LIMIT_IDENTITY_CAPACITY) {
    return false;
  }
  const identityBuckets = existing ?? new Map<string, RateLimitBucket>();
  const bucket = identityBuckets.get(action);
  if (!bucket || bucket.resetsAt <= now) {
    identityBuckets.set(action, { count: 1, resetsAt: now + windowMs });
    this.rateLimits.set(identity, identityBuckets);
    return true;
  }
  if (bucket.count >= maximum) return false;
  bucket.count += 1;
  return true;
}

/**
 * Amortized sweep of elapsed windows. Buckets deliberately outlive the socket that opened them —
 * dropping them on disconnect would let a client reset every budget by reconnecting.
 */
export function pruneRateLimits(
  this: StudioLiveGatewayHost, now: number): void {
  if (
    this.lastRateLimitPruneAt !== null &&
    now >= this.lastRateLimitPruneAt &&
    now - this.lastRateLimitPruneAt < STUDIO_LIVE_RATE_LIMIT_PRUNE_INTERVAL_MS
  ) {
    return;
  }
  this.lastRateLimitPruneAt = now;
  for (const [identity, buckets] of this.rateLimits) {
    for (const [action, bucket] of buckets) {
      if (bucket.resetsAt <= now) buckets.delete(action);
    }
    if (buckets.size === 0) this.rateLimits.delete(identity);
  }
}

export function hasUserConnectionCapacity(
  this: StudioLiveGatewayHost, userId: string, socketId: string): boolean {
  const connections = this.connectionIdsByUser.get(userId);
  if (!connections || connections.has(socketId)) return true;
  return connections.size < STUDIO_LIVE_MAX_CONNECTIONS_PER_USER;
}

export function registerUserConnection(
  this: StudioLiveGatewayHost, userId: string, socketId: string): void {
  const previousUserId = this.userIdByConnection.get(socketId);
  if (previousUserId !== undefined && previousUserId !== userId) {
    this.releaseUserConnection(socketId);
  }
  const connections = this.connectionIdsByUser.get(userId) ?? new Set<string>();
  connections.add(socketId);
  this.connectionIdsByUser.set(userId, connections);
  this.userIdByConnection.set(socketId, userId);
}

export function releaseUserConnection(
  this: StudioLiveGatewayHost, socketId: string): void {
  const userId = this.userIdByConnection.get(socketId);
  if (userId === undefined) return;
  this.userIdByConnection.delete(socketId);
  const connections = this.connectionIdsByUser.get(userId);
  connections?.delete(socketId);
  if (connections?.size === 0) this.connectionIdsByUser.delete(userId);
}

export function isParticipantAuthorizationCurrent(
  this: StudioLiveGatewayHost, 
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

export async function runWithAuthorizedParticipant<T>(
  this: StudioLiveGatewayHost, 
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

export async function authorizedParticipant(
  this: StudioLiveGatewayHost, 
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

export async function authorizedParticipantWithMode(
  this: StudioLiveGatewayHost, 
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

export function startParticipantAuthorizationRecheck(
  this: StudioLiveGatewayHost, 
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

export async function revalidateParticipant(
  this: StudioLiveGatewayHost, 
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

export async function revalidateAllParticipants(
  this: StudioLiveGatewayHost, ): Promise<void> {
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
