import {
  STUDIO_VOICE_CALL_DEFAULT_ID,
  STUDIO_VOICE_CALL_MAX_PARTICIPANTS,
  STUDIO_VOICE_CALL_MAX_REMOTE_PEERS,
  studioVoiceCallErrorMessage,
  type StudioVoiceAudioSink,
  type StudioVoiceAutoplayStatus,
  type StudioVoiceCallDependencies,
  type StudioVoiceCallEvent,
  type StudioVoiceCallMember,
  type StudioVoiceCallRoom,
  type StudioVoiceCallState,
  type StudioVoiceConnectionStatus,
  type StudioVoiceDescriptionPayload,
  type StudioVoiceIcePayload,
  type StudioVoiceRoomEvent,
  type StudioVoiceSessionTerminalReason,
} from "./studio-voice-call-model";

import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";

export {
  STUDIO_VOICE_CALL_DEFAULT_ID,
  STUDIO_VOICE_CALL_MAX_PARTICIPANTS,
  STUDIO_VOICE_CALL_MAX_REMOTE_PEERS,
  createEmptyStudioVoiceCallState,
  isStudioVoiceCallSupported,
  studioVoiceCallErrorMessage,
} from "./studio-voice-call-model";
export type {
  StudioVoiceAudioSink,
  StudioVoiceAutoplayStatus,
  StudioVoiceCallDependencies,
  StudioVoiceCallEvent,
  StudioVoiceCallMember,
  StudioVoiceCallRoom,
  StudioVoiceCallState,
  StudioVoiceConnectionStatus,
  StudioVoiceDescriptionPayload,
  StudioVoiceIcePayload,
  StudioVoiceRemoteState,
  StudioVoiceRoomEvent,
  StudioVoiceSessionTerminalReason,
} from "./studio-voice-call-model";

const STUDIO_VOICE_CALL_MAX_PENDING_ICE = 64;

interface LocalMediaState {
  callId: string;
  stream: MediaStream;
  track: MediaStreamTrack;
  onEnded: () => void;
}

interface RemoteMemberState {
  participant: StudioLiveParticipant;
  callId: string;
  muted: boolean;
  connection: StudioVoiceConnectionStatus;
  autoplay: StudioVoiceAutoplayStatus;
  stream: MediaStream | null;
}

interface PeerState {
  participant: StudioLiveParticipant;
  callId: string;
  connection: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
  awaitingAnswer: boolean;
  stream: MediaStream | null;
  sink: StudioVoiceAudioSink | null;
  operation: Promise<void>;
  playbackGeneration: number;
  restartAttempts: number;
  restartScheduled: boolean;
}

function defaultGetUserMedia(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  const mediaDevices =
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    return Promise.reject(
      new Error("이 브라우저는 마이크 음성 통화를 지원하지 않습니다.")
    );
  }
  return mediaDevices.getUserMedia(constraints);
}

function defaultCreatePeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection !== "function") {
    throw new Error("이 브라우저는 WebRTC 음성 통화를 지원하지 않습니다.");
  }
  // Local collaboration never leaks signaling to third-party infrastructure. A deployment can
  // inject its own authenticated STUN/TURN policy through createPeerConnection.
  return new RTCPeerConnection({ iceServers: [] });
}

function defaultCreateMediaStream(tracks: MediaStreamTrack[]): MediaStream {
  return new MediaStream(tracks);
}

function defaultCreateAudioSink(): StudioVoiceAudioSink | null {
  if (typeof document === "undefined") return null;
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.controls = false;
  audio.setAttribute("playsinline", "");
  audio.hidden = true;
  audio.setAttribute("aria-hidden", "true");
  document.body?.append(audio);
  return {
    setStream(stream) {
      audio.srcObject = stream;
    },
    play() {
      return audio.play();
    },
    destroy() {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    },
  };
}

function defaultCallId(): string {
  // callId is an in-room routing key, not an authorization secret. The server scopes it to workId
  // and ACL membership; keeping the primary key stable closes the two-first-joiners race.
  return STUDIO_VOICE_CALL_DEFAULT_ID;
}

function copyParticipant(
  participant: StudioLiveParticipant
): StudioLiveParticipant {
  return { ...participant };
}

function copyMember(member: StudioVoiceCallMember): StudioVoiceCallMember {
  return {
    participant: copyParticipant(member.participant),
    callId: member.callId,
    muted: member.muted,
  };
}

function microphoneConstraints(): MediaStreamConstraints {
  return {
    video: false,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

function stopTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // Browser-owned tracks can already be ended during device or permission cleanup.
    }
  }
}

function closePeer(peer: PeerState): void {
  peer.playbackGeneration += 1;
  peer.connection.onicecandidate = null;
  peer.connection.ontrack = null;
  peer.connection.onconnectionstatechange = null;
  try {
    peer.sink?.destroy();
  } catch {
    // A custom UI audio sink must not prevent peer and track cleanup.
  }
  peer.sink = null;
  stopTracks(peer.stream);
  peer.stream = null;
  peer.pendingIce.length = 0;
  try {
    peer.connection.close();
  } catch {
    // Closing an already-closed RTCPeerConnection is safe.
  }
}

function sessionDescription(
  description: RTCSessionDescription | RTCSessionDescriptionInit | null,
  expected: "offer" | "answer"
): StudioVoiceDescriptionPayload | null {
  if (!description || description.type !== expected || !description.sdp) return null;
  return {
    callId: "",
    type: expected,
    sdp: description.sdp,
  };
}

function candidatePayload(
  callId: string,
  candidate: RTCIceCandidate
): StudioVoiceIcePayload | null {
  const value = candidate.toJSON();
  if (!value.candidate) return null;
  return {
    callId,
    candidate: value.candidate,
    sdpMid: value.sdpMid ?? null,
    sdpMLineIndex: value.sdpMLineIndex ?? null,
    usernameFragment: value.usernameFragment ?? null,
  };
}

function candidateInit(payload: StudioVoiceIcePayload): RTCIceCandidateInit {
  return {
    candidate: payload.candidate,
    sdpMid: payload.sdpMid,
    sdpMLineIndex: payload.sdpMLineIndex,
    usernameFragment: payload.usernameFragment,
  };
}

function sameParticipantCall(
  member: RemoteMemberState | undefined,
  participant: StudioLiveParticipant,
  callId: string
): member is RemoteMemberState {
  return (
    member?.participant.sessionId === participant.sessionId &&
    member.callId === callId
  );
}

function compareSessionIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Ephemeral, explicit-consent audio-only WebRTC mesh controller.
 *
 * It never creates MediaRecorder instances, serializes streams, or writes voice state into the
 * artwork document. One deterministic offerer per pair prevents negotiation glare, while ICE is
 * bounded and buffered until the matching remote description exists.
 */
export class StudioVoiceCallController {
  private readonly room: StudioVoiceCallRoom;
  private readonly getUserMedia: (
    constraints: MediaStreamConstraints
  ) => Promise<MediaStream>;
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly createMediaStream: (tracks: MediaStreamTrack[]) => MediaStream;
  private readonly createAudioSink: (
    participant: StudioLiveParticipant
  ) => StudioVoiceAudioSink | null;
  private readonly createCallId: () => string;
  private readonly listeners = new Set<(event: StudioVoiceCallEvent) => void>();
  private readonly members = new Map<string, RemoteMemberState>();
  private readonly peers = new Map<string, PeerState>();
  private unsubscribeRoom: (() => void) | null;
  private localMedia: LocalMediaState | null = null;
  private joinPromise: Promise<void> | null = null;
  private joinGeneration = 0;
  private phase: StudioVoiceCallState["phase"] = "idle";
  private terminalReason: StudioVoiceSessionTerminalReason | null = null;
  private manualMuted = false;
  private pushToTalkEnabled = false;
  private pushToTalkPressed = false;
  private closed = false;

  constructor(
    room: StudioVoiceCallRoom,
    dependencies: StudioVoiceCallDependencies = {}
  ) {
    this.room = room;
    this.getUserMedia = dependencies.getUserMedia ?? defaultGetUserMedia;
    this.createPeerConnection =
      dependencies.createPeerConnection ?? defaultCreatePeerConnection;
    this.createMediaStream = dependencies.createMediaStream ?? defaultCreateMediaStream;
    this.createAudioSink = dependencies.createAudioSink ?? defaultCreateAudioSink;
    this.createCallId = dependencies.randomId ?? defaultCallId;
    this.replaceMembers(room.getVoiceMembers());
    this.unsubscribeRoom = room.subscribeVoice((event) => this.onRoomEvent(event));
  }

  subscribe(listener: (event: StudioVoiceCallEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): StudioVoiceCallState {
    const visibleCallId = this.localMedia?.callId ?? this.selectExistingCallId();
    return {
      phase: this.phase,
      callId: this.localMedia?.callId ?? null,
      localMuted: this.effectiveMuted,
      manualMuted: this.manualMuted,
      pushToTalkEnabled: this.pushToTalkEnabled,
      pushToTalkPressed: this.pushToTalkPressed,
      participants: Array.from(this.members.values())
        .filter((member) => visibleCallId !== null && member.callId === visibleCallId)
        .map((member) => ({
          participant: copyParticipant(member.participant),
          callId: member.callId,
          muted: member.muted,
          connection: member.connection,
          autoplay: member.autoplay,
          stream: member.stream,
        }))
        .sort((left, right) =>
          compareSessionIds(
            left.participant.sessionId,
            right.participant.sessionId
          )
        ),
      terminalReason: this.terminalReason,
    };
  }

  join(options: { muted?: boolean; callId?: string } = {}): Promise<void> {
    if (this.closed || this.phase === "ended") {
      return Promise.reject(new Error("이미 종료된 음성 통화 세션입니다."));
    }
    if (this.phase === "joined") return Promise.resolve();
    if (this.joinPromise) return this.joinPromise;

    if (options.muted !== undefined) this.manualMuted = options.muted;
    let callId: string;
    try {
      callId = this.selectJoinCallId(options.callId);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.callParticipantCount(callId) >= STUDIO_VOICE_CALL_MAX_PARTICIPANTS) {
      const message =
        `음성 통화는 최대 ${STUDIO_VOICE_CALL_MAX_PARTICIPANTS}명까지 참여할 수 있습니다.`;
      this.emitError("capacity", message, null, true);
      return Promise.reject(new Error(message));
    }
    const generation = ++this.joinGeneration;
    this.phase = "joining";
    this.emitState();
    const run = this.captureAndJoin(generation, callId);
    this.joinPromise = run;
    const clearJoin = () => {
      if (this.joinPromise === run) this.joinPromise = null;
    };
    void run.then(clearJoin, clearJoin);
    return run;
  }

  private async captureAndJoin(
    generation: number,
    callId: string
  ): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await this.getUserMedia(microphoneConstraints());
    } catch (error) {
      if (generation === this.joinGeneration && this.phase === "joining") {
        this.phase = "idle";
        this.emitState();
      }
      const message = studioVoiceCallErrorMessage(error);
      this.emitError("media", message, null, true);
      throw new Error(message, { cause: error });
    }

    if (
      this.closed ||
      this.phase === "ended" ||
      generation !== this.joinGeneration ||
      this.phase !== "joining"
    ) {
      stopTracks(stream);
      throw new Error(
        this.closed || this.phase === "ended"
          ? "음성 통화 세션이 종료되었습니다."
          : "음성 통화 참여가 취소되었습니다."
      );
    }

    const audioTrack = stream
      .getAudioTracks()
      .find((track) => track.readyState === "live");
    if (!audioTrack) {
      stopTracks(stream);
      this.phase = "idle";
      this.emitState();
      throw new Error("사용할 수 있는 마이크 오디오 트랙을 받지 못했습니다.");
    }
    for (const track of stream.getTracks()) {
      if (track.kind !== "audio") track.stop();
    }
    const huddleSize = this.callParticipantCount(callId);
    if (huddleSize >= STUDIO_VOICE_CALL_MAX_PARTICIPANTS) {
      stopTracks(stream);
      this.phase = "idle";
      this.emitState();
      this.emitError(
        "capacity",
        `음성 통화는 최대 ${STUDIO_VOICE_CALL_MAX_PARTICIPANTS}명까지 참여할 수 있습니다.`,
        null,
        true
      );
      throw new Error(
        `음성 통화는 최대 ${STUDIO_VOICE_CALL_MAX_PARTICIPANTS}명까지 참여할 수 있습니다.`
      );
    }

    try {
      const onEnded = () => {
        if (this.localMedia?.track !== audioTrack || this.phase !== "joined") return;
        this.leaveInternal(true, "idle");
        this.emitError(
          "media",
          "마이크 연결이 끊겼습니다. 장치를 확인한 뒤 음성 작업실에 다시 참가해 주세요.",
          null,
          true
        );
      };
      audioTrack.enabled = !this.effectiveMuted;
      audioTrack.addEventListener("ended", onEnded, { once: true });
      this.localMedia = { callId, stream, track: audioTrack, onEnded };
      if (!this.room.joinVoice({ callId, muted: this.effectiveMuted })) {
        throw new Error("공동작업 채널에 음성 통화 참여를 알리지 못했습니다.");
      }
      this.phase = "joined";
      this.reconcilePeerCapacity();
      this.emitState();
    } catch (error) {
      if (this.localMedia?.stream === stream) this.releaseLocalMedia();
      else stopTracks(stream);
      this.phase = "idle";
      this.emitState();
      throw error;
    }
  }

  leave(): void {
    if (this.closed || this.phase === "ended") return;
    this.leaveInternal(true, "idle");
  }

  setMuted(muted: boolean): boolean {
    return this.updateLocalControls(() => {
      this.manualMuted = muted;
      // A pointer/key release can be lost while a permission sheet, app switch, or mobile
      // interruption owns focus. Manual mute is therefore also a hard PTT release boundary:
      // unmuting later must return to the PTT-safe muted state until the user presses again.
      if (muted) this.pushToTalkPressed = false;
    });
  }

  setPushToTalk(enabled: boolean): boolean {
    return this.updateLocalControls(() => {
      this.pushToTalkEnabled = enabled;
      this.pushToTalkPressed = false;
    });
  }

  setPushToTalkPressed(pressed: boolean): boolean {
    if (!this.pushToTalkEnabled) return false;
    return this.updateLocalControls(() => {
      this.pushToTalkPressed = pressed;
    });
  }

  retryRemoteAudio(sessionId: string): Promise<boolean> {
    const peer = this.peers.get(sessionId);
    if (!peer || !peer.stream) return Promise.resolve(false);
    return this.attemptPlayback(peer);
  }

  /**
   * Re-negotiate active peers after the deployment rotates short-lived ICE credentials.
   * Session-id ordering keeps exactly one offerer per pair, so both browsers may receive the
   * refreshed policy without creating glare.
   */
  refreshNetworkPolicy(): boolean {
    if (this.closed || this.phase !== "joined") return false;
    let scheduled = false;
    for (const peer of this.peers.values()) {
      if (!this.isLocalOfferer(peer.participant.sessionId)) continue;
      scheduled = this.schedulePeerIceRestart(peer, false) || scheduled;
    }
    return scheduled;
  }

  endSession(reason: StudioVoiceSessionTerminalReason): void {
    if (this.closed || this.phase === "ended") return;
    this.leaveInternal(false, "ended");
    this.terminalReason = reason;
    this.members.clear();
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.emitState();
  }

  close(): void {
    if (this.closed) return;
    this.leaveInternal(this.phase === "joined", "ended");
    this.closed = true;
    this.terminalReason ??= "closed";
    this.members.clear();
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.listeners.clear();
  }

  private get effectiveMuted(): boolean {
    return (
      this.manualMuted ||
      (this.pushToTalkEnabled && !this.pushToTalkPressed)
    );
  }

  private selectJoinCallId(requestedCallId: string | undefined): string {
    if (requestedCallId) return requestedCallId;
    return this.selectExistingCallId() ?? this.createCallId();
  }

  private selectExistingCallId(): string | null {
    const counts = new Map<string, number>();
    for (const member of this.members.values()) {
      counts.set(member.callId, (counts.get(member.callId) ?? 0) + 1);
    }
    const existing = Array.from(counts, ([callId, count]) => ({ callId, count })).sort(
      (left, right) =>
        right.count - left.count || compareSessionIds(left.callId, right.callId)
    )[0];
    return existing?.callId ?? null;
  }

  private callParticipantCount(callId: string): number {
    let count = 0;
    for (const member of this.members.values()) {
      if (member.callId === callId) count += 1;
    }
    return count;
  }

  private updateLocalControls(change: () => void): boolean {
    if (this.closed || this.phase === "ended") return false;
    const before = {
      manualMuted: this.manualMuted,
      pushToTalkEnabled: this.pushToTalkEnabled,
      pushToTalkPressed: this.pushToTalkPressed,
      effectiveMuted: this.effectiveMuted,
    };
    change();
    const afterMuted = this.effectiveMuted;
    if (before.effectiveMuted === afterMuted) {
      this.emitState();
      return true;
    }

    if (this.localMedia) this.localMedia.track.enabled = !afterMuted;
    let statePublished = true;
    if (this.phase === "joined" && this.localMedia) {
      try {
        statePublished = this.room.updateVoiceState({
          callId: this.localMedia.callId,
          muted: afterMuted,
        });
      } catch {
        statePublished = false;
      }
    }
    if (!statePublished) {
      this.manualMuted = before.manualMuted;
      this.pushToTalkEnabled = before.pushToTalkEnabled;
      this.pushToTalkPressed = before.pushToTalkPressed;
      const local = this.localMedia;
      if (local) local.track.enabled = !before.effectiveMuted;
      this.emitError(
        "signaling",
        "음소거 상태를 공동작업 채널에 전달하지 못했습니다.",
        null,
        true
      );
      this.emitState();
      return false;
    }
    this.emitState();
    return true;
  }

  private leaveInternal(
    notifyRoom: boolean,
    nextPhase: "idle" | "ended"
  ): void {
    ++this.joinGeneration;
    const local = this.localMedia;
    if (notifyRoom && local) {
      try {
        this.room.leaveVoice({ callId: local.callId });
      } catch {
        this.emitError(
          "signaling",
          "음성 통화 나가기 상태를 전달하지 못했지만 로컬 마이크는 안전하게 종료했습니다.",
          null,
          true
        );
      }
    }
    for (const peer of this.peers.values()) closePeer(peer);
    this.peers.clear();
    this.releaseLocalMedia();
    this.phase = nextPhase;
    this.pushToTalkPressed = false;
    for (const member of this.members.values()) {
      member.connection = "waiting";
      member.autoplay = "idle";
      member.stream = null;
    }
    this.emitState();
  }

  private releaseLocalMedia(): void {
    const local = this.localMedia;
    if (!local) return;
    this.localMedia = null;
    local.track.removeEventListener("ended", local.onEnded);
    stopTracks(local.stream);
  }

  private onRoomEvent(event: StudioVoiceRoomEvent): void {
    if (this.closed || this.phase === "ended") return;
    switch (event.type) {
      case "presence":
        this.replaceMembers(event.members);
        return;
      case "voice:joined":
        this.upsertMember(event);
        return;
      case "voice:state":
        this.updateRemoteMute(event);
        return;
      case "voice:left":
        this.removeMember(event.participant, event.callId);
        return;
      case "voice:self-left":
        if (this.localMedia?.callId !== event.callId) return;
        if (event.reason === "revoked") {
          this.endSession("revoked");
          return;
        }
        this.leaveInternal(false, "idle");
        this.emitError("signaling", event.message, null, true);
        return;
      case "voice:description":
        this.handleDescription(event.participant, event.payload);
        return;
      case "voice:ice":
        this.handleIce(event.participant, event.payload);
        return;
      case "terminal":
        this.endSession(event.reason);
    }
  }

  private replaceMembers(nextMembers: StudioVoiceCallMember[]): void {
    const nextSessions = new Set<string>();
    for (const rawMember of nextMembers) {
      if (rawMember.participant.sessionId === this.room.participant.sessionId) continue;
      const member = copyMember(rawMember);
      nextSessions.add(member.participant.sessionId);
      this.installMember(member);
    }
    for (const [sessionId] of this.members) {
      if (nextSessions.has(sessionId)) continue;
      this.removeMemberBySession(sessionId);
    }
    this.reconcilePeerCapacity();
    this.emitState();
  }

  private upsertMember(member: StudioVoiceCallMember): void {
    if (member.participant.sessionId === this.room.participant.sessionId) return;
    this.installMember(copyMember(member));
    this.reconcilePeerCapacity();
    this.emitState();
  }

  private installMember(member: StudioVoiceCallMember): void {
    const sessionId = member.participant.sessionId;
    const current = this.members.get(sessionId);
    if (current?.callId === member.callId) {
      current.participant = copyParticipant(member.participant);
      current.muted = member.muted;
      return;
    }
    if (current) this.removePeer(sessionId);
    this.members.set(sessionId, {
      participant: copyParticipant(member.participant),
      callId: member.callId,
      muted: member.muted,
      connection: "waiting",
      autoplay: "idle",
      stream: null,
    });
  }

  private updateRemoteMute(member: StudioVoiceCallMember): void {
    const current = this.members.get(member.participant.sessionId);
    if (!sameParticipantCall(current, member.participant, member.callId)) return;
    current.muted = member.muted;
    current.participant = copyParticipant(member.participant);
    this.emitState();
  }

  private removeMember(
    participant: StudioLiveParticipant,
    callId: string
  ): void {
    const member = this.members.get(participant.sessionId);
    if (!sameParticipantCall(member, participant, callId)) return;
    this.removeMemberBySession(participant.sessionId);
    this.reconcilePeerCapacity();
    this.emitState();
  }

  private removeMemberBySession(sessionId: string): void {
    this.removePeer(sessionId);
    this.members.delete(sessionId);
  }

  private reconcilePeerCapacity(): void {
    const activeCallId = this.phase === "joined" ? this.localMedia?.callId : null;
    const selectedSessions = new Set(
      Array.from(this.members.entries())
        .filter(([, member]) => member.callId === activeCallId)
        .map(([sessionId]) => sessionId)
        .sort(compareSessionIds)
        .slice(0, STUDIO_VOICE_CALL_MAX_REMOTE_PEERS)
    );
    for (const [sessionId] of this.peers) {
      if (selectedSessions.has(sessionId) && this.phase === "joined") continue;
      this.removePeer(sessionId);
    }
    for (const [sessionId, member] of this.members) {
      if (!activeCallId || member.callId !== activeCallId) {
        member.connection = "waiting";
        member.autoplay = "idle";
        member.stream = null;
        continue;
      }
      if (!selectedSessions.has(sessionId)) {
        member.connection = "capacity";
        member.autoplay = "idle";
        member.stream = null;
        continue;
      }
      if (this.phase !== "joined") {
        member.connection = "waiting";
        continue;
      }
      if (this.peers.has(sessionId)) continue;
      try {
        const peer = this.createPeer(member);
        if (this.isLocalOfferer(sessionId)) {
          this.queuePeerOperation(peer, () => this.createAndSendOffer(peer));
        }
      } catch (error) {
        member.connection = "failed";
        this.emitError(
          "connection",
          studioVoiceCallErrorMessage(error),
          member.participant,
          true
        );
      }
    }
  }

  private createPeer(member: RemoteMemberState): PeerState {
    const connection = this.createPeerConnection();
    const peer: PeerState = {
      participant: copyParticipant(member.participant),
      callId: member.callId,
      connection,
      pendingIce: [],
      remoteDescriptionSet: false,
      awaitingAnswer: false,
      stream: null,
      sink: null,
      operation: Promise.resolve(),
      playbackGeneration: 0,
      restartAttempts: 0,
      restartScheduled: false,
    };
    this.peers.set(member.participant.sessionId, peer);
    member.connection = "connecting";
    member.autoplay = "idle";
    member.stream = null;

    connection.onicecandidate = (event) => {
      if (!event.candidate || !this.isActivePeer(peer)) return;
      const local = this.localMedia;
      if (!local) return;
      const payload = candidatePayload(local.callId, event.candidate);
      if (!payload) return;
      let sent: boolean;
      try {
        sent = this.room.sendVoiceIce(peer.participant.sessionId, payload);
      } catch {
        sent = false;
      }
      if (!sent) {
        this.emitError(
          "signaling",
          "음성 통화 연결 후보를 전달하지 못했습니다.",
          peer.participant,
          true
        );
      }
    };
    connection.ontrack = (event) => this.onRemoteTrack(peer, event);
    connection.onconnectionstatechange = () => {
      if (!this.isActivePeer(peer)) return;
      if (connection.connectionState === "connected") {
        peer.restartAttempts = 0;
        peer.restartScheduled = false;
        const current = this.members.get(peer.participant.sessionId);
        if (current?.callId === peer.callId && current.stream) {
          current.connection = "live";
          this.emitState();
        }
        return;
      }
      if (
        connection.connectionState !== "failed" &&
        connection.connectionState !== "closed"
      ) {
        return;
      }
      const current = this.members.get(peer.participant.sessionId);
      if (
        connection.connectionState === "failed" &&
        current?.callId === peer.callId &&
        this.isLocalOfferer(peer.participant.sessionId) &&
        this.schedulePeerIceRestart(peer, true)
      ) {
        current.connection = "connecting";
        this.emitState();
        return;
      }
      if (current?.callId === peer.callId) {
        current.connection = "failed";
        current.autoplay = "idle";
        current.stream = null;
      }
      // Keep a failed peer alive long enough to accept an ICE-restart offer from the elected
      // remote offerer. Closed peers cannot recover and are removed immediately.
      if (connection.connectionState === "closed") {
        this.removePeer(peer.participant.sessionId, false);
      }
      this.emitError(
        "connection",
        "음성 통화 연결이 끊어졌습니다. 통화에서 나갔다가 다시 참여해 주세요.",
        peer.participant,
        true
      );
      this.emitState();
    };

    const local = this.localMedia;
    if (!local) {
      closePeer(peer);
      this.peers.delete(member.participant.sessionId);
      throw new Error("마이크 연결이 종료되었습니다.");
    }
    try {
      connection.addTrack(local.track, local.stream);
    } catch (error) {
      this.peers.delete(member.participant.sessionId);
      closePeer(peer);
      throw error;
    }
    return peer;
  }

  private isLocalOfferer(remoteSessionId: string): boolean {
    return compareSessionIds(
      this.room.participant.sessionId,
      remoteSessionId
    ) < 0;
  }

  private isActivePeer(peer: PeerState): boolean {
    return (
      this.phase === "joined" &&
      this.peers.get(peer.participant.sessionId) === peer &&
      this.members.get(peer.participant.sessionId)?.callId === peer.callId
    );
  }

  private queuePeerOperation(
    peer: PeerState,
    operation: () => Promise<void>
  ): void {
    peer.operation = peer.operation.then(async () => {
      if (!this.isActivePeer(peer)) return;
      try {
        await operation();
      } catch (error) {
        if (!this.isActivePeer(peer)) return;
        const member = this.members.get(peer.participant.sessionId);
        if (member?.callId === peer.callId) member.connection = "failed";
        this.emitError(
          "connection",
          studioVoiceCallErrorMessage(error),
          peer.participant,
          true
        );
        this.emitState();
      }
    });
  }

  private schedulePeerIceRestart(
    peer: PeerState,
    countAttempt: boolean
  ): boolean {
    if (!this.isActivePeer(peer) || peer.restartScheduled || peer.awaitingAnswer) return false;
    if (countAttempt && peer.restartAttempts >= 2) return false;
    if (countAttempt) peer.restartAttempts += 1;
    peer.restartScheduled = true;
    this.queuePeerOperation(peer, async () => {
      try {
        if (typeof peer.connection.restartIce === "function") {
          peer.connection.restartIce();
        }
        await this.createAndSendOffer(peer, true);
      } finally {
        peer.restartScheduled = false;
      }
    });
    return true;
  }

  private async createAndSendOffer(
    peer: PeerState,
    iceRestart = false
  ): Promise<void> {
    if (!this.isLocalOfferer(peer.participant.sessionId)) return;
    const offer = iceRestart
      ? await peer.connection.createOffer({ iceRestart: true })
      : await peer.connection.createOffer();
    if (!this.isActivePeer(peer)) return;
    await peer.connection.setLocalDescription(offer);
    if (!this.isActivePeer(peer)) return;
    const description = sessionDescription(
      peer.connection.localDescription ?? offer,
      "offer"
    );
    const local = this.localMedia;
    if (!description || !local) {
      throw new Error("음성 통화 연결 제안을 만들지 못했습니다.");
    }
    peer.awaitingAnswer = true;
    if (
      !this.room.sendVoiceDescription(peer.participant.sessionId, {
        ...description,
        callId: local.callId,
      })
    ) {
      throw new Error("음성 통화 연결 제안을 전달하지 못했습니다.");
    }
  }

  private handleDescription(
    participant: StudioLiveParticipant,
    payload: StudioVoiceDescriptionPayload
  ): void {
    const member = this.members.get(participant.sessionId);
    if (!sameParticipantCall(member, participant, payload.callId)) return;
    if (this.phase !== "joined") return;
    this.reconcilePeerCapacity();
    const peer = this.peers.get(participant.sessionId);
    if (!peer || peer.callId !== payload.callId) return;

    if (payload.type === "offer") {
      // Session-id ordering elects exactly one offerer, even when both users join simultaneously.
      if (this.isLocalOfferer(participant.sessionId)) return;
      this.queuePeerOperation(peer, () =>
        this.acceptOfferAndAnswer(peer, payload.sdp)
      );
      return;
    }
    if (!this.isLocalOfferer(participant.sessionId) || !peer.awaitingAnswer) return;
    this.queuePeerOperation(peer, () => this.acceptAnswer(peer, payload.sdp));
  }

  private async acceptOfferAndAnswer(
    peer: PeerState,
    sdp: string
  ): Promise<void> {
    await peer.connection.setRemoteDescription({ type: "offer", sdp });
    peer.remoteDescriptionSet = true;
    await this.flushPendingIce(peer);
    const answer = await peer.connection.createAnswer();
    if (!this.isActivePeer(peer)) return;
    await peer.connection.setLocalDescription(answer);
    if (!this.isActivePeer(peer)) return;
    const description = sessionDescription(
      peer.connection.localDescription ?? answer,
      "answer"
    );
    const local = this.localMedia;
    if (!description || !local) {
      throw new Error("음성 통화 연결 응답을 만들지 못했습니다.");
    }
    if (
      !this.room.sendVoiceDescription(peer.participant.sessionId, {
        ...description,
        callId: local.callId,
      })
    ) {
      throw new Error("음성 통화 연결 응답을 전달하지 못했습니다.");
    }
  }

  private async acceptAnswer(peer: PeerState, sdp: string): Promise<void> {
    await peer.connection.setRemoteDescription({ type: "answer", sdp });
    peer.remoteDescriptionSet = true;
    peer.awaitingAnswer = false;
    await this.flushPendingIce(peer);
  }

  private handleIce(
    participant: StudioLiveParticipant,
    payload: StudioVoiceIcePayload
  ): void {
    const member = this.members.get(participant.sessionId);
    if (!sameParticipantCall(member, participant, payload.callId)) return;
    if (this.phase !== "joined") return;
    this.reconcilePeerCapacity();
    const peer = this.peers.get(participant.sessionId);
    if (!peer || peer.callId !== payload.callId) return;
    if (!peer.remoteDescriptionSet) {
      if (peer.pendingIce.length >= STUDIO_VOICE_CALL_MAX_PENDING_ICE) {
        peer.pendingIce.shift();
      }
      peer.pendingIce.push(candidateInit(payload));
      return;
    }
    this.queuePeerOperation(peer, async () => {
      await peer.connection.addIceCandidate(candidateInit(payload));
    });
  }

  private async flushPendingIce(peer: PeerState): Promise<void> {
    const candidates = peer.pendingIce.splice(0);
    for (const candidate of candidates) {
      if (!this.isActivePeer(peer)) return;
      await peer.connection.addIceCandidate(candidate);
    }
  }

  private onRemoteTrack(peer: PeerState, event: RTCTrackEvent): void {
    if (!this.isActivePeer(peer)) {
      event.track.stop();
      return;
    }
    if (event.track.kind !== "audio") {
      event.track.stop();
      return;
    }
    const stream = event.streams[0] ?? this.createMediaStream([event.track]);
    if (peer.stream && peer.stream !== stream) stopTracks(peer.stream);
    peer.stream = stream;
    try {
      peer.sink?.destroy();
    } catch {
      // Replacing a broken sink still continues with a fresh one below.
    }
    peer.sink = null;
    try {
      peer.sink = this.createAudioSink(peer.participant);
      peer.sink?.setStream(stream);
    } catch {
      try {
        peer.sink?.destroy();
      } catch {
        // The peer and stream remain recoverable through an explicit playback retry.
      }
      peer.sink = null;
    }

    const member = this.members.get(peer.participant.sessionId);
    if (!member || member.callId !== peer.callId) {
      stopTracks(stream);
      return;
    }
    member.stream = stream;
    member.connection = "live";
    member.autoplay = peer.sink ? "attempting" : "blocked";
    this.emitState();
    if (peer.sink) void this.attemptPlayback(peer);
  }

  private async attemptPlayback(peer: PeerState): Promise<boolean> {
    if (!this.isActivePeer(peer) || !peer.stream) return false;
    if (!peer.sink) {
      try {
        peer.sink = this.createAudioSink(peer.participant);
        peer.sink?.setStream(peer.stream);
      } catch {
        try {
          peer.sink?.destroy();
        } catch {
          // Playback remains blocked and can be attempted again after another user gesture.
        }
        peer.sink = null;
      }
    }
    const member = this.members.get(peer.participant.sessionId);
    if (!member || member.callId !== peer.callId || !peer.sink) {
      if (member?.callId === peer.callId) {
        member.autoplay = "blocked";
        this.emitState();
      }
      return false;
    }
    const generation = ++peer.playbackGeneration;
    member.autoplay = "attempting";
    this.emitState();
    try {
      await peer.sink.play();
      if (!this.isActivePeer(peer) || generation !== peer.playbackGeneration) {
        return false;
      }
      member.autoplay = "playing";
      this.emitState();
      return true;
    } catch {
      if (!this.isActivePeer(peer) || generation !== peer.playbackGeneration) {
        return false;
      }
      member.autoplay = "blocked";
      this.emitError(
        "autoplay",
        "브라우저가 상대방 음성 자동 재생을 차단했습니다. 듣기 버튼을 눌러 재생해 주세요.",
        peer.participant,
        true
      );
      this.emitState();
      return false;
    }
  }

  private removePeer(sessionId: string, resetMember = true): void {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    this.peers.delete(sessionId);
    closePeer(peer);
    if (!resetMember) return;
    const member = this.members.get(sessionId);
    if (member?.callId === peer.callId) {
      member.connection = "waiting";
      member.autoplay = "idle";
      member.stream = null;
    }
  }

  private emitState(): void {
    this.emit({ type: "state", state: this.getState() });
  }

  private emitError(
    code: Extract<StudioVoiceCallEvent, { type: "error" }>["code"],
    message: string,
    participant: StudioLiveParticipant | null,
    recoverable: boolean
  ): void {
    this.emit({
      type: "error",
      code,
      message,
      participant: participant ? copyParticipant(participant) : null,
      recoverable,
    });
  }

  private emit(event: StudioVoiceCallEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
