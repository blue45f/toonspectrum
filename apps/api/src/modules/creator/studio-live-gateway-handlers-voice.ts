import { replyStudioLiveAck as reply, studioLiveFailure as failure } from "./studio-live-ack";
import { STUDIO_LIVE_VOICE_MAX_PARTICIPANTS, studioLiveRoom } from "./studio-live-gateway-constants";
import {
  StudioLiveChatSchema,
  StudioLiveSignalSchema,
  StudioLiveVoiceJoinSchema,
  StudioLiveVoiceLeaveSchema,
  StudioLiveVoiceSignalSchema,
  StudioLiveVoiceStateSchema,
} from "./studio-live.protocol";

import type { StudioLiveVoiceMemberInternal } from "./studio-live-gateway-constants";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type {
  StudioLiveAckCallback,
  StudioLiveChatInput,
  StudioLiveInterServerRelayEvent,
  StudioLiveSignalInput,
  StudioLiveSocket,
  StudioLiveVoiceJoinInput,
  StudioLiveVoiceLeaveInput,
  StudioLiveVoiceMember,
  StudioLiveVoiceSignalInput,
  StudioLiveVoiceStateInput,
} from "./studio-live.protocol";

export async function joinVoice(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveVoiceJoinInput,
  ack?: StudioLiveAckCallback<{ members: StudioLiveVoiceMember[] }>
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
  if (!this.consumeRateLimit(client, "voice-join", 20, 60_000)) {
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

export async function updateVoiceState(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveVoiceStateInput,
  ack?: StudioLiveAckCallback<{ member: StudioLiveVoiceMember }>
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
  if (!this.consumeRateLimit(client, "voice-state", 90, 60_000)) {
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

export async function leaveVoice(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveVoiceLeaveInput,
  ack?: StudioLiveAckCallback<{ left: true }>
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

export async function sendChatMessage(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveChatInput,
  ack?: StudioLiveAckCallback<{ delivered: true; sentAt: string }>
) {
  const parsed = StudioLiveChatSchema.safeParse(body);
  if (!parsed.success) {
    return reply(ack, failure("invalid_payload", "채팅 메시지가 올바르지 않습니다."));
  }
  if (!this.consumeRateLimit(client, "chat", 20, 10_000)) {
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

export async function relayVoiceSignal(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveVoiceSignalInput,
  ack?: StudioLiveAckCallback<{ delivered: true; signalId: string }>
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
  if (!this.consumeRateLimit(client, "voice-signal", 240, 60_000)) {
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

export async function relaySignal(
  this: StudioLiveGatewayHost, 
  client: StudioLiveSocket,
  body: StudioLiveSignalInput,
  ack?: StudioLiveAckCallback<{ delivered: true; signalId: string }>
) {
  if (!this.consumeRateLimit(client, "signal", 240, 60_000)) {
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
