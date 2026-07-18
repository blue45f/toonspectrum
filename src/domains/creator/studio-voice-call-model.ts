import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";

export const STUDIO_VOICE_CALL_MAX_PARTICIPANTS = 6;
export const STUDIO_VOICE_CALL_MAX_REMOTE_PEERS =
  STUDIO_VOICE_CALL_MAX_PARTICIPANTS - 1;
/** Work-scoped primary huddle id. A stable value prevents simultaneous empty-room joins splitting. */
export const STUDIO_VOICE_CALL_DEFAULT_ID = "studio-voice-main-v1";

export interface StudioVoiceCallMember {
  participant: StudioLiveParticipant;
  callId: string;
  muted: boolean;
}

export interface StudioVoiceDescriptionPayload {
  callId: string;
  type: "offer" | "answer";
  sdp: string;
}

export interface StudioVoiceIcePayload {
  callId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export type StudioVoiceSessionTerminalReason = "revoked" | "closed" | "error";

export type StudioVoiceRoomEvent =
  | { type: "presence"; members: StudioVoiceCallMember[] }
  | ({ type: "voice:joined" } & StudioVoiceCallMember)
  | ({ type: "voice:state" } & StudioVoiceCallMember)
  | {
      type: "voice:left";
      participant: StudioLiveParticipant;
      callId: string;
    }
  | {
      type: "voice:self-left";
      callId: string;
      reason: "rejected" | "revoked" | "removed";
      message: string;
    }
  | {
      type: "voice:description";
      participant: StudioLiveParticipant;
      payload: StudioVoiceDescriptionPayload;
    }
  | {
      type: "voice:ice";
      participant: StudioLiveParticipant;
      payload: StudioVoiceIcePayload;
    }
  | { type: "terminal"; reason: StudioVoiceSessionTerminalReason };

/**
 * Minimal, transport-neutral room contract for ephemeral voice signaling. SDP, ICE and audio
 * tracks are deliberately absent from every persistent document API.
 */
export interface StudioVoiceCallRoom {
  readonly participant: StudioLiveParticipant;
  subscribeVoice(listener: (event: StudioVoiceRoomEvent) => void): () => void;
  getVoiceMembers(): StudioVoiceCallMember[];
  joinVoice(payload: { callId: string; muted: boolean }): boolean;
  updateVoiceState(payload: { callId: string; muted: boolean }): boolean;
  leaveVoice(payload: { callId: string }): boolean;
  sendVoiceDescription(
    targetSessionId: string,
    payload: StudioVoiceDescriptionPayload
  ): boolean;
  sendVoiceIce(targetSessionId: string, payload: StudioVoiceIcePayload): boolean;
}

export interface StudioVoiceAudioSink {
  setStream(stream: MediaStream | null): void;
  play(): Promise<void>;
  destroy(): void;
}

export interface StudioVoiceCallDependencies {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection?: () => RTCPeerConnection;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  createAudioSink?: (
    participant: StudioLiveParticipant
  ) => StudioVoiceAudioSink | null;
  /** Test/deployment override. The default is the work-scoped primary huddle key. */
  randomId?: () => string;
}

export type StudioVoiceConnectionStatus =
  | "waiting"
  | "capacity"
  | "connecting"
  | "live"
  | "failed";

export type StudioVoiceAutoplayStatus = "idle" | "attempting" | "playing" | "blocked";

export interface StudioVoiceRemoteState extends StudioVoiceCallMember {
  connection: StudioVoiceConnectionStatus;
  autoplay: StudioVoiceAutoplayStatus;
  stream: MediaStream | null;
}

export interface StudioVoiceCallState {
  phase: "idle" | "joining" | "joined" | "ended";
  callId: string | null;
  localMuted: boolean;
  manualMuted: boolean;
  pushToTalkEnabled: boolean;
  pushToTalkPressed: boolean;
  participants: StudioVoiceRemoteState[];
  terminalReason: StudioVoiceSessionTerminalReason | null;
}

/** Creates an isolated React-context-safe state value without sharing a mutable participant list. */
export function createEmptyStudioVoiceCallState(): StudioVoiceCallState {
  return {
    phase: "idle",
    callId: null,
    localMuted: false,
    manualMuted: false,
    pushToTalkEnabled: false,
    pushToTalkPressed: false,
    participants: [],
    terminalReason: null,
  };
}

export type StudioVoiceCallEvent =
  | { type: "state"; state: StudioVoiceCallState }
  | {
      type: "error";
      code: "media" | "signaling" | "connection" | "capacity" | "autoplay";
      message: string;
      participant: StudioLiveParticipant | null;
      recoverable: boolean;
    };

export function isStudioVoiceCallSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof RTCPeerConnection === "function"
  );
}

export function studioVoiceCallErrorMessage(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "마이크 권한이 허용되지 않았습니다. 브라우저의 사이트 권한을 확인해 주세요.";
      case "AbortError":
        return "마이크 연결 요청이 취소되었습니다.";
      case "NotFoundError":
        return "사용할 수 있는 마이크를 찾지 못했습니다.";
      case "NotReadableError":
        return "다른 앱이 마이크를 사용 중이거나 운영체제 권한이 차단되어 있습니다.";
      case "OverconstrainedError":
        return "현재 마이크에서 필요한 음성 처리 옵션을 사용할 수 없습니다.";
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : "음성 통화를 시작하지 못했습니다.";
}
