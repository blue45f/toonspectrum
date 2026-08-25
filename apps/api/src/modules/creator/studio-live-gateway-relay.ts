import { studioLiveFailure as failure } from "./studio-live-ack";
import {
  STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS,
  STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_LIMIT,
  STUDIO_LIVE_CANDIDATE_AUTHORIZATION_CACHE_MS,
  STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_LIMIT,
  STUDIO_LIVE_VOICE_SIGNAL_DEDUPE_TTL_MS,
  publicParticipant,
  studioLiveRoom,
} from "./studio-live-gateway-constants";
import { STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS } from "./studio-live-inter-server-relay-transport";
import {
  StudioLiveInterServerRelayRequestSchema,
  StudioLivePublicParticipantSchema,
  StudioLiveVoiceMemberSchema,
} from "./studio-live.protocol";

import type {
  StudioLiveParticipantInternal,
  StudioLivePeerRelayAuthorization,
  StudioLiveRelaySenderAuthorization,
  StudioLiveVoiceRelayDiscovery,
} from "./studio-live-gateway-constants";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type {
  StudioLiveInterServerRelayEvent,
  StudioLiveParticipant,
  StudioLiveSignalInput,
  StudioLiveSocket,
  StudioLiveSocketData,
  StudioLiveVoiceSignalInput,
} from "./studio-live.protocol";

export function hasLocalRelayTarget(
  this: StudioLiveGatewayHost, connectionId: string): boolean {
  return (
    this.participantsBySocket.has(connectionId) ||
    this.server.sockets.has(connectionId)
  );
}

export async function authorizeRemoteRelaySender(
  this: StudioLiveGatewayHost, 
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

export async function sendInterServerRelay(
  this: StudioLiveGatewayHost, 
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

export async function receiveInterServerRelay(
  this: StudioLiveGatewayHost, request: unknown): Promise<boolean> {
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

export async function discoverVoiceRelayPeers(
  this: StudioLiveGatewayHost, 
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

export function consumeInterServerVoiceSignal(
  this: StudioLiveGatewayHost, 
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

export function emitRelayToSocket(
  this: StudioLiveGatewayHost, 
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

export function emitAuthorizedLocalRelay(
  this: StudioLiveGatewayHost, 
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

export function signalRelayEvent(
  this: StudioLiveGatewayHost, 
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

export function voiceSignalRelayEvent(
  this: StudioLiveGatewayHost, 
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

export function voiceRelayPeersMatch(
  this: StudioLiveGatewayHost, 
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

export function candidateRelayAuthorizationKey(
  this: StudioLiveGatewayHost, 
  workId: string,
  shareId: string,
  firstConnectionId: string,
  secondConnectionId: string
): string {
  const [leftConnectionId, rightConnectionId] = [firstConnectionId, secondConnectionId].sort();
  return JSON.stringify([workId, shareId, leftConnectionId, rightConnectionId]);
}

export function cachedCandidateRelayAuthorization(
  this: StudioLiveGatewayHost, 
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

export function relayAuthorizationSnapshot(
  this: StudioLiveGatewayHost, 
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

export function isRelayAuthorizationCurrent(
  this: StudioLiveGatewayHost, 
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

export function rememberCandidateRelayAuthorization(
  this: StudioLiveGatewayHost, 
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

export function purgeExpiredCandidateRelayAuthorizations(
  this: StudioLiveGatewayHost, now = Date.now()): void {
  for (const [key, authorization] of this.candidateRelayAuthorizations) {
    if (authorization.expiresAt <= now) this.candidateRelayAuthorizations.delete(key);
  }
}

export function deleteCandidateRelayAuthorization(
  this: StudioLiveGatewayHost, 
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

export function deleteCandidateRelayAuthorizationsForShare(
  this: StudioLiveGatewayHost, 
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

export function deleteCandidateRelayAuthorizationsForSocket(
  this: StudioLiveGatewayHost, connectionId: string): void {
  for (const [key, authorization] of this.candidateRelayAuthorizations) {
    if (
      authorization.left.connectionId === connectionId ||
      authorization.right.connectionId === connectionId
    ) {
      this.candidateRelayAuthorizations.delete(key);
    }
  }
}

export async function authorizeRelayPeers(
  this: StudioLiveGatewayHost, 
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
