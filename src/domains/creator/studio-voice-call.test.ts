import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  STUDIO_VOICE_CALL_DEFAULT_ID,
  STUDIO_VOICE_CALL_MAX_PARTICIPANTS,
  STUDIO_VOICE_CALL_MAX_REMOTE_PEERS,
  StudioVoiceCallController,
  studioVoiceCallErrorMessage,
  type StudioVoiceAudioSink,
  type StudioVoiceCallEvent,
  type StudioVoiceCallMember,
  type StudioVoiceCallRoom,
  type StudioVoiceDescriptionPayload,
  type StudioVoiceIcePayload,
  type StudioVoiceRoomEvent,
} from "./studio-voice-call";

import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import type { StudioLiveRoom } from "./studio-live-collaboration-room";

const local: StudioLiveParticipant = {
  sessionId: "session-b",
  displayName: "내 작업 탭",
  role: "owner",
};

const remoteA: StudioLiveParticipant = {
  sessionId: "session-a",
  displayName: "민호 작업 탭",
  role: "editor",
};

const remoteC: StudioLiveParticipant = {
  sessionId: "session-c",
  displayName: "서연 작업 탭",
  role: "editor",
};

class FakeTrack {
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  stopCalls = 0;
  readonly listeners = new Set<() => void>();

  constructor(readonly kind: "audio" | "video" = "audio") {}

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type !== "ended") return;
    this.listeners.add(
      typeof listener === "function"
        ? () => listener(new Event("ended"))
        : () => listener.handleEvent(new Event("ended"))
    );
  }

  removeEventListener(type: string): void {
    if (type === "ended") this.listeners.clear();
  }

  stop(): void {
    this.stopCalls += 1;
    this.readyState = "ended";
  }

  endFromBrowser(): void {
    this.readyState = "ended";
    for (const listener of Array.from(this.listeners)) listener();
  }
}

function fakeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
    getAudioTracks: () =>
      tracks.filter((track) => track.kind === "audio") as unknown as MediaStreamTrack[],
    getVideoTracks: () =>
      tracks.filter((track) => track.kind === "video") as unknown as MediaStreamTrack[],
  } as unknown as MediaStream;
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  readonly addedTracks: MediaStreamTrack[] = [];
  readonly addedIce: RTCIceCandidateInit[] = [];
  readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  createOfferCalls = 0;
  createAnswerCalls = 0;
  closeCalls = 0;

  createOffer(): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls += 1;
    return Promise.resolve({ type: "offer", sdp: "v=0\r\no=voice-offer" });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.createAnswerCalls += 1;
    return Promise.resolve({ type: "answer", sdp: "v=0\r\no=voice-answer" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    this.remoteDescriptions.push(description);
    return Promise.resolve();
  }

  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedIce.push(candidate);
    return Promise.resolve();
  }

  addTrack(track: MediaStreamTrack): RTCRtpSender {
    this.addedTracks.push(track);
    return {} as RTCRtpSender;
  }

  close(): void {
    this.closeCalls += 1;
    this.connectionState = "closed";
  }

  emitTrack(stream: MediaStream, track: FakeTrack): void {
    this.ontrack?.({
      streams: [stream],
      track: track as unknown as MediaStreamTrack,
    } as unknown as RTCTrackEvent);
  }

  emitIce(candidateValue = "candidate:voice 1 UDP 1 127.0.0.1 5000 typ host"): void {
    const candidate = {
      toJSON: () => ({
        candidate: candidateValue,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      }),
    } as RTCIceCandidate;
    this.onicecandidate?.({ candidate } as RTCPeerConnectionIceEvent);
  }

  setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

class FakeAudioSink implements StudioVoiceAudioSink {
  stream: MediaStream | null = null;
  playCalls = 0;
  destroyCalls = 0;
  rejectPlay = false;

  setStream(stream: MediaStream | null): void {
    this.stream = stream;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    return this.rejectPlay
      ? Promise.reject(new Error("NotAllowedError"))
      : Promise.resolve();
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.stream = null;
  }
}

class FakeRoom implements StudioVoiceCallRoom {
  readonly listeners = new Set<(event: StudioVoiceRoomEvent) => void>();
  readonly joins: Array<{ callId: string; muted: boolean }> = [];
  readonly states: Array<{ callId: string; muted: boolean }> = [];
  readonly leaves: string[] = [];
  readonly descriptions: Array<{
    target: string;
    payload: StudioVoiceDescriptionPayload;
  }> = [];
  readonly candidates: Array<{
    target: string;
    payload: StudioVoiceIcePayload;
  }> = [];
  members: StudioVoiceCallMember[] = [];
  sendResult = true;
  unsubscribeCalls = 0;

  constructor(readonly participant: StudioLiveParticipant = local) {}

  subscribeVoice(listener: (event: StudioVoiceRoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      if (this.listeners.delete(listener)) this.unsubscribeCalls += 1;
    };
  }

  getVoiceMembers(): StudioVoiceCallMember[] {
    return this.members.map((member) => ({
      ...member,
      participant: { ...member.participant },
    }));
  }

  joinVoice(payload: { callId: string; muted: boolean }): boolean {
    this.joins.push({ ...payload });
    return this.sendResult;
  }

  updateVoiceState(payload: { callId: string; muted: boolean }): boolean {
    this.states.push({ ...payload });
    return this.sendResult;
  }

  leaveVoice(payload: { callId: string }): boolean {
    this.leaves.push(payload.callId);
    return this.sendResult;
  }

  sendVoiceDescription(
    targetSessionId: string,
    payload: StudioVoiceDescriptionPayload
  ): boolean {
    this.descriptions.push({ target: targetSessionId, payload: { ...payload } });
    return this.sendResult;
  }

  sendVoiceIce(
    targetSessionId: string,
    payload: StudioVoiceIcePayload
  ): boolean {
    this.candidates.push({ target: targetSessionId, payload: { ...payload } });
    return this.sendResult;
  }

  emit(event: StudioVoiceRoomEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function member(
  participant: StudioLiveParticipant,
  callId = "call-huddle",
  muted = false
): StudioVoiceCallMember {
  return { participant, callId, muted };
}

function offerEvent(
  participant: StudioLiveParticipant,
  callId = "call-huddle"
): StudioVoiceRoomEvent {
  return {
    type: "voice:description",
    participant,
    payload: { callId, type: "offer", sdp: "v=0\r\no=remote-offer" },
  };
}

function answerEvent(
  participant: StudioLiveParticipant,
  callId = "call-huddle"
): StudioVoiceRoomEvent {
  return {
    type: "voice:description",
    participant,
    payload: { callId, type: "answer", sdp: "v=0\r\no=remote-answer" },
  };
}

function iceEvent(
  participant: StudioLiveParticipant,
  callId = "call-huddle",
  candidate = "candidate:remote 1 UDP 1 127.0.0.1 6000 typ host"
): StudioVoiceRoomEvent {
  return {
    type: "voice:ice",
    participant,
    payload: {
      callId,
      candidate,
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: null,
    },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("StudioVoiceCallController", () => {
  it("stays structurally compatible with the collaboration room voice surface", () => {
    expectTypeOf<StudioLiveRoom>().toExtend<StudioVoiceCallRoom>();
  });

  it("never requests microphone access or joins before an explicit action", () => {
    const room = new FakeRoom();
    room.members = [member(remoteA)];
    const getUserMedia = vi.fn();
    const createPeerConnection = vi.fn();

    const controller = new StudioVoiceCallController(room, {
      getUserMedia,
      createPeerConnection,
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(room.joins).toEqual([]);
    expect(controller.getState()).toMatchObject({
      phase: "idle",
      participants: [{ connection: "waiting", stream: null }],
    });
    controller.close();
  });

  it("captures audio-only media with voice processing and publishes no device metadata", async () => {
    const room = new FakeRoom();
    const audioTrack = new FakeTrack("audio");
    const unexpectedVideoTrack = new FakeTrack("video");
    const stream = fakeStream([audioTrack, unexpectedVideoTrack]);
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const controller = new StudioVoiceCallController(room, {
      getUserMedia,
      randomId: () => "private-call-id",
    });

    await controller.join();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(unexpectedVideoTrack.stopCalls).toBe(1);
    expect(room.joins).toEqual([{ callId: "private-call-id", muted: false }]);
    expect(JSON.stringify(room.joins)).not.toContain("microphone");
    expect(controller.getState().phase).toBe("joined");
    expect(audioTrack.enabled).toBe(true);
    controller.close();
  });

  it("reuses the largest shared huddle and hides parallel huddles from its participant state", async () => {
    const room = new FakeRoom();
    room.members = [
      member(remoteA, "shared-huddle"),
      member(remoteC, "shared-huddle"),
      member({
        sessionId: "session-d",
        displayName: "다른 허들 팀원",
        role: "editor",
      }, "other-huddle"),
    ];
    const randomId = vi.fn(() => "must-not-be-used");
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () =>
        new FakePeerConnection() as unknown as RTCPeerConnection,
      randomId,
    });

    await controller.join();
    expect(randomId).not.toHaveBeenCalled();
    expect(room.joins).toEqual([{ callId: "shared-huddle", muted: false }]);
    expect(controller.getState().callId).toBe("shared-huddle");
    expect(controller.getState().participants).toHaveLength(2);
    expect(controller.getState().participants.every(
      (participant) => participant.callId === "shared-huddle"
    )).toBe(true);
    controller.close();
  });

  it("uses one stable primary huddle id when first participants join an empty room concurrently", async () => {
    const firstRoom = new FakeRoom(local);
    const secondRoom = new FakeRoom({
      sessionId: "session-z",
      displayName: "두 번째 작업 탭",
      role: "editor",
    });
    const first = new StudioVoiceCallController(firstRoom, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
    });
    const second = new StudioVoiceCallController(secondRoom, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
    });

    await Promise.all([first.join(), second.join()]);

    expect(firstRoom.joins[0]?.callId).toBe(STUDIO_VOICE_CALL_DEFAULT_ID);
    expect(secondRoom.joins[0]?.callId).toBe(STUDIO_VOICE_CALL_DEFAULT_ID);
    first.close();
    second.close();
  });

  it("fails huddle id selection before requesting microphone media", async () => {
    const room = new FakeRoom();
    const track = new FakeTrack();
    const getUserMedia = vi.fn(() => Promise.resolve(fakeStream([track])));
    const controller = new StudioVoiceCallController(room, {
      getUserMedia,
      randomId: () => {
        throw new Error("secure id unavailable");
      },
    });

    await expect(controller.join()).rejects.toThrow("secure id unavailable");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(track.stopCalls).toBe(0);
    expect(room.joins).toEqual([]);
    expect(controller.getState().phase).toBe("idle");
    controller.close();
  });

  it("deduplicates concurrent joins and stops media that resolves after leave", async () => {
    const room = new FakeRoom();
    const track = new FakeTrack();
    let resolveMedia!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveMedia = resolve;
        })
    );
    const controller = new StudioVoiceCallController(room, { getUserMedia });

    const first = controller.join();
    const second = controller.join();
    expect(first).toBe(second);
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    controller.leave();
    resolveMedia(fakeStream([track]));
    await expect(first).rejects.toThrow("취소");
    await expect(second).rejects.toThrow("취소");
    expect(track.stopCalls).toBe(1);
    expect(room.joins).toEqual([]);
    expect(controller.getState().phase).toBe("idle");
    controller.close();
  });

  it("rejects missing audio and capacity overflow while releasing every track", async () => {
    const noAudioRoom = new FakeRoom();
    const video = new FakeTrack("video");
    const noAudio = new StudioVoiceCallController(noAudioRoom, {
      getUserMedia: () => Promise.resolve(fakeStream([video])),
    });
    await expect(noAudio.join()).rejects.toThrow("오디오 트랙");
    expect(video.stopCalls).toBeGreaterThanOrEqual(1);
    noAudio.close();

    const fullRoom = new FakeRoom();
    fullRoom.members = Array.from(
      { length: STUDIO_VOICE_CALL_MAX_PARTICIPANTS },
      (_, index) =>
        member({
          sessionId: `remote-${index}`,
          displayName: `참여자 ${index}`,
          role: "editor",
        })
    );
    const audio = new FakeTrack();
    const getUserMedia = vi.fn(() => Promise.resolve(fakeStream([audio])));
    const full = new StudioVoiceCallController(fullRoom, {
      getUserMedia,
    });
    await expect(full.join()).rejects.toThrow("최대 6명");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(audio.stopCalls).toBe(0);
    expect(fullRoom.joins).toEqual([]);
    full.close();
  });

  it("publishes mute and push-to-talk transitions while changing the live track", async () => {
    const room = new FakeRoom();
    const track = new FakeTrack();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([track])),
      randomId: () => "call-local",
    });
    await controller.join();

    expect(controller.setMuted(true)).toBe(true);
    expect(track.enabled).toBe(false);
    expect(controller.setMuted(false)).toBe(true);
    expect(track.enabled).toBe(true);
    expect(controller.setPushToTalk(true)).toBe(true);
    expect(track.enabled).toBe(false);
    expect(controller.setPushToTalkPressed(true)).toBe(true);
    expect(track.enabled).toBe(true);
    expect(controller.setPushToTalkPressed(false)).toBe(true);
    expect(track.enabled).toBe(false);
    expect(controller.setPushToTalk(false)).toBe(true);
    expect(track.enabled).toBe(true);
    expect(room.states.map(({ muted }) => muted)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(controller.getState()).toMatchObject({
      localMuted: false,
      manualMuted: false,
      pushToTalkEnabled: false,
      pushToTalkPressed: false,
    });
    controller.close();
  });

  it("keeps push-to-talk closed after mute when the release event is lost", async () => {
    const room = new FakeRoom();
    const track = new FakeTrack();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([track])),
      randomId: () => "call-local",
    });
    await controller.join();

    expect(controller.setPushToTalk(true)).toBe(true);
    expect(controller.setPushToTalkPressed(true)).toBe(true);
    expect(track.enabled).toBe(true);

    // Simulate a permission sheet/app switch swallowing pointerup after the user mutes.
    expect(controller.setMuted(true)).toBe(true);
    expect(controller.getState()).toMatchObject({
      localMuted: true,
      manualMuted: true,
      pushToTalkEnabled: true,
      pushToTalkPressed: false,
    });
    expect(track.enabled).toBe(false);

    expect(controller.setMuted(false)).toBe(true);
    expect(controller.getState()).toMatchObject({
      localMuted: true,
      manualMuted: false,
      pushToTalkEnabled: true,
      pushToTalkPressed: false,
    });
    expect(track.enabled).toBe(false);

    expect(controller.setPushToTalkPressed(true)).toBe(true);
    expect(track.enabled).toBe(true);
    controller.close();
  });

  it("rolls back local mute state when signaling fails", async () => {
    const room = new FakeRoom();
    const track = new FakeTrack();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([track])),
      randomId: () => "call-local",
    });
    await controller.join();
    room.sendResult = false;

    expect(controller.setMuted(true)).toBe(false);
    expect(track.enabled).toBe(true);
    expect(controller.getState().localMuted).toBe(false);
    controller.close();
  });

  it("elects exactly one offerer from stable session-id ordering", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA), member(remoteC)];
    const peers: FakePeerConnection[] = [];
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      randomId: () => "call-local",
    });

    await controller.join();
    await settle();

    expect(peers).toHaveLength(2);
    expect(peers[0].createOfferCalls).toBe(0);
    expect(peers[1].createOfferCalls).toBe(1);
    expect(room.descriptions).toEqual([
      {
        target: remoteC.sessionId,
        payload: {
          callId: "call-huddle",
          type: "offer",
          sdp: "v=0\r\no=voice-offer",
        },
      },
    ]);

    room.emit(offerEvent(remoteA));
    await settle();
    expect(peers[0].createAnswerCalls).toBe(1);
    expect(room.descriptions.at(-1)).toEqual({
      target: remoteA.sessionId,
      payload: {
        callId: "call-huddle",
        type: "answer",
        sdp: "v=0\r\no=voice-answer",
      },
    });
    controller.close();
  });

  it("ignores glare offers, unsolicited answers, and stale call generations", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteC)];
    const peer = new FakePeerConnection();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      randomId: () => "call-local",
    });
    await controller.join();
    await settle();

    room.emit(offerEvent(remoteC));
    room.emit(answerEvent(remoteC, "stale-call"));
    await settle();
    expect(peer.createAnswerCalls).toBe(0);
    expect(peer.remoteDescriptions).toEqual([]);

    room.emit(answerEvent(remoteC));
    await settle();
    expect(peer.remoteDescriptions).toEqual([
      { type: "answer", sdp: "v=0\r\no=remote-answer" },
    ]);
    controller.close();
  });

  it("buffers ICE until the matching remote offer is installed, then accepts late ICE", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const peer = new FakePeerConnection();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      randomId: () => "call-local",
    });
    await controller.join();

    room.emit(iceEvent(remoteA, undefined, "candidate:early"));
    await settle();
    expect(peer.addedIce).toEqual([]);

    room.emit(offerEvent(remoteA));
    await settle();
    expect(peer.addedIce).toEqual([
      expect.objectContaining({ candidate: "candidate:early" }),
    ]);

    room.emit(iceEvent(remoteA, undefined, "candidate:late"));
    await settle();
    expect(peer.addedIce.at(-1)).toEqual(
      expect.objectContaining({ candidate: "candidate:late" })
    );
    controller.close();
  });

  it("publishes local ICE only for the active call generation", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteC)];
    const peer = new FakePeerConnection();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      randomId: () => "call-local",
    });
    await controller.join();
    peer.emitIce("candidate:local");
    expect(room.candidates).toEqual([
      {
        target: remoteC.sessionId,
        payload: {
          callId: "call-huddle",
          candidate: "candidate:local",
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: null,
        },
      },
    ]);

    controller.leave();
    peer.emitIce("candidate:after-leave");
    expect(room.candidates).toHaveLength(1);
    controller.close();
  });

  it("surfaces autoplay blocking and recovers through an explicit retry", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const peer = new FakePeerConnection();
    const sink = new FakeAudioSink();
    sink.rejectPlay = true;
    const events: StudioVoiceCallEvent[] = [];
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createAudioSink: () => sink,
      randomId: () => "call-local",
    });
    controller.subscribe((event) => events.push(event));
    await controller.join();

    const remoteTrack = new FakeTrack();
    const remoteStream = fakeStream([remoteTrack]);
    peer.emitTrack(remoteStream, remoteTrack);
    await settle();
    expect(controller.getState().participants[0]).toMatchObject({
      connection: "live",
      autoplay: "blocked",
      stream: remoteStream,
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "autoplay" })
    );

    sink.rejectPlay = false;
    await expect(controller.retryRemoteAudio(remoteA.sessionId)).resolves.toBe(true);
    expect(controller.getState().participants[0].autoplay).toBe("playing");
    expect(sink.playCalls).toBe(2);
    controller.close();
    expect(sink.destroyCalls).toBe(1);
    expect(remoteTrack.stopCalls).toBe(1);
  });

  it("stops unexpected remote video and never exposes it as a voice stream", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const peer = new FakePeerConnection();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      randomId: () => "call-local",
    });
    await controller.join();

    const video = new FakeTrack("video");
    peer.emitTrack(fakeStream([video]), video);
    expect(video.stopCalls).toBe(1);
    expect(controller.getState().participants[0].stream).toBeNull();
    controller.close();
  });

  it("caps the mesh at five remote peers and promotes a waiting member after leave", async () => {
    const room = new FakeRoom(local);
    const remoteMembers = Array.from(
      { length: STUDIO_VOICE_CALL_MAX_REMOTE_PEERS + 1 },
      (_, index) =>
        member({
          sessionId: `session-${String(index + 10).padStart(2, "0")}`,
          displayName: `참여자 ${index + 1}`,
          role: "editor",
        })
    );
    room.members = remoteMembers.slice(0, STUDIO_VOICE_CALL_MAX_REMOTE_PEERS);
    const peers: FakePeerConnection[] = [];
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      randomId: () => "call-local",
    });
    await controller.join();
    expect(peers).toHaveLength(STUDIO_VOICE_CALL_MAX_REMOTE_PEERS);
    room.emit({ type: "voice:joined", ...remoteMembers.at(-1)! });
    expect(controller.getState().participants.at(-1)?.connection).toBe("capacity");

    const leaving = remoteMembers[0];
    room.emit({
      type: "voice:left",
      participant: leaving.participant,
      callId: leaving.callId,
    });
    expect(peers).toHaveLength(STUDIO_VOICE_CALL_MAX_REMOTE_PEERS + 1);
    expect(controller.getState().participants.every((value) => value.connection !== "capacity")).toBe(
      true
    );
    controller.close();
  });

  it("reconciles presence and remote mute without accepting stale generations", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const peer = new FakePeerConnection();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([new FakeTrack()])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      randomId: () => "call-local",
    });
    await controller.join();

    room.emit({ type: "voice:state", ...member(remoteA, undefined, true) });
    expect(controller.getState().participants[0].muted).toBe(true);
    room.emit({ type: "voice:state", ...member(remoteA, "stale", false) });
    expect(controller.getState().participants[0].muted).toBe(true);

    room.emit({ type: "presence", members: [] });
    expect(controller.getState().participants).toEqual([]);
    expect(peer.closeCalls).toBe(1);
    controller.close();
  });

  it("releases all media and signaling exactly when the microphone ends or user leaves", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const localTrack = new FakeTrack();
    const remoteTrack = new FakeTrack();
    const peer = new FakePeerConnection();
    const sink = new FakeAudioSink();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([localTrack])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createAudioSink: () => sink,
      randomId: () => "call-local",
    });
    await controller.join();
    peer.emitTrack(fakeStream([remoteTrack]), remoteTrack);
    await settle();

    localTrack.endFromBrowser();
    expect(room.leaves).toEqual(["call-huddle"]);
    expect(localTrack.stopCalls).toBe(1);
    expect(remoteTrack.stopCalls).toBe(1);
    expect(peer.closeCalls).toBe(1);
    expect(sink.destroyCalls).toBe(1);
    expect(controller.getState()).toMatchObject({ phase: "idle" });
    controller.close();
  });

  it("still closes every local resource when leave signaling throws", async () => {
    const room = new FakeRoom(local);
    const track = new FakeTrack();
    const events: StudioVoiceCallEvent[] = [];
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([track])),
      randomId: () => "call-local",
    });
    controller.subscribe((event) => events.push(event));
    await controller.join();
    vi.spyOn(room, "leaveVoice").mockImplementation(() => {
      throw new Error("transport already closed");
    });

    controller.leave();
    expect(track.stopCalls).toBe(1);
    expect(controller.getState().phase).toBe("idle");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "signaling" })
    );
    controller.close();
  });

  it("treats ACL or session terminal events as permanent, silent cleanup", async () => {
    const room = new FakeRoom(local);
    room.members = [member(remoteA)];
    const localTrack = new FakeTrack();
    const remoteTrack = new FakeTrack();
    const peer = new FakePeerConnection();
    const sink = new FakeAudioSink();
    const controller = new StudioVoiceCallController(room, {
      getUserMedia: () => Promise.resolve(fakeStream([localTrack])),
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createAudioSink: () => sink,
      randomId: () => "call-local",
    });
    await controller.join();
    peer.emitTrack(fakeStream([remoteTrack]), remoteTrack);
    await settle();

    room.emit({ type: "terminal", reason: "revoked" });
    expect(room.leaves).toEqual([]);
    expect(room.unsubscribeCalls).toBe(1);
    expect(localTrack.stopCalls).toBe(1);
    expect(remoteTrack.stopCalls).toBe(1);
    expect(peer.closeCalls).toBe(1);
    expect(sink.destroyCalls).toBe(1);
    expect(controller.getState()).toEqual(
      expect.objectContaining({
        phase: "ended",
        terminalReason: "revoked",
        participants: [],
      })
    );
    await expect(controller.join()).rejects.toThrow("종료");
    controller.close();
  });

  it("maps browser microphone failures to actionable Korean messages", () => {
    expect(
      studioVoiceCallErrorMessage(
        new DOMException("permission denied", "NotAllowedError")
      )
    ).toContain("마이크 권한");
    expect(
      studioVoiceCallErrorMessage(new DOMException("missing", "NotFoundError"))
    ).toContain("찾지 못했습니다");
    expect(studioVoiceCallErrorMessage(new Error("custom failure"))).toBe(
      "custom failure"
    );
  });
});
