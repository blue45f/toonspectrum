import { replyStudioLiveAck as reply, studioLiveFailure as failure } from "./studio-live-ack";
import {
  lockReleaseFailure,
  lockRequestFailure,
  publicLock,
  studioLiveRoom,
} from "./studio-live-gateway-constants";
import {
  STUDIO_LIVE_LOCK_LIMIT_PER_WORK,
  createStudioLiveLockAcquisitionId,
  studioLiveLockRequestIdFromAcquisitionId,
} from "./studio-live-lock.repository";
import {
  STUDIO_LIVE_LOCK_PROTOCOL_VERSION,
  StudioLiveLockReleaseSchema,
  StudioLiveLockRequestIdSchema,
  StudioLiveLockRequestSchema,
  StudioLiveScreenAccessSchema,
  StudioLiveScreenAnnounceSchema,
  StudioLiveScreenRequestSchema,
  StudioLiveScreenStateSchema,
  StudioLiveScreenStopSchema,
} from "./studio-live.protocol";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveLockRecord, StudioLiveLockRepository } from "./studio-live-lock.repository";
import type {
  StudioLiveAckCallback,
  StudioLiveLockAcquiredDecision,
  StudioLiveLockReleaseDecision,
  StudioLiveLockReleaseInput,
  StudioLiveLockRequestInput,
  StudioLiveLockUpdate,
  StudioLiveScreenAccessInput,
  StudioLiveScreenAnnounceInput,
  StudioLiveScreenRequestInput,
  StudioLiveScreenStateInput,
  StudioLiveScreenStopInput,
  StudioLiveSocket,
  StudioLiveParticipant,
  StudioLiveInterServerRelayEvent,
} from "./studio-live.protocol";

export async function requestLock(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveLockRequestInput,
  ack?: StudioLiveAckCallback<StudioLiveLockAcquiredDecision>
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
  if (!this.consumeRateLimit(client, "lock", 60, 60_000)) {
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

export async function releaseLock(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveLockReleaseInput,
  ack?: StudioLiveAckCallback<StudioLiveLockReleaseDecision>
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
    client,
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

export async function setScreenSharing(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveScreenStateInput,
  ack?: StudioLiveAckCallback<{ participant: StudioLiveParticipant }>
) {
  const parsed = StudioLiveScreenStateSchema.safeParse(body);
  if (!parsed.success) return reply(ack, failure("invalid_payload", "화면 공유 상태가 올바르지 않습니다."));
  if (!this.consumeRateLimit(client, "screen-set", 30, 60_000)) {
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

export async function announceScreenShare(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveScreenAnnounceInput,
  ack?: StudioLiveAckCallback<{ delivered: true }>
) {
  const parsed = StudioLiveScreenAnnounceSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "화면 공유 안내 정보가 올바르지 않습니다."));
  }
  if (!this.consumeRateLimit(client, "screen-announce", 30, 60_000)) {
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

export async function requestScreenAccess(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveScreenRequestInput,
  ack?: StudioLiveAckCallback<{ delivered: true }>
) {
  const parsed = StudioLiveScreenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "화면 공유 접근 요청이 올바르지 않습니다."));
  }
  if (!this.consumeRateLimit(client, "screen-request", 60, 60_000)) {
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

export async function relayScreenAccess(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveScreenAccessInput,
  ack?: StudioLiveAckCallback<{ delivered: true }>
) {
  const parsed = StudioLiveScreenAccessSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "화면 공유 접근 결정이 올바르지 않습니다."));
  }
  if (!this.consumeRateLimit(client, "screen-access", 60, 60_000)) {
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

export async function stopScreenShare(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveScreenStopInput,
  ack?: StudioLiveAckCallback<{ delivered: true }>
) {
  const parsed = StudioLiveScreenStopSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "화면 공유 종료 정보가 올바르지 않습니다."));
  }
  if (!this.consumeRateLimit(client, "screen-stop", 30, 60_000)) {
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
