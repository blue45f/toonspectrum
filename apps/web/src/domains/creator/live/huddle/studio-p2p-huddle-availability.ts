import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import type { StudioLiveCollaborationContextValue } from "../studio-live-collaboration-context";

export type StudioHuddleAvailability =
  | "ready" | "access-denied" | "recovery-required" | "session-unavailable"
  | "insecure-context" | "webrtc-unsupported" | "local-only"
  | "connecting" | "connection-error" | "server-unavailable" | "direct-unavailable";

type HuddleLiveState = Pick<StudioLiveCollaborationContextValue,
  "room" | "mode" | "availability" | "canChat" | "serverAvailable" | "usingLocalFallback" | "sync" | "recovery">;

/** No peer connection construction or device permission request during capability checks. */
export function resolveStudioHuddleAvailability(
  live: HuddleLiveState,
  direct: StudioLiveDirectPort | null = live.room?.direct ?? null,
): StudioHuddleAvailability {
  if (!live.canChat || live.sync.phase === "revoked" || live.sync.phase === "admission-denied") {
    return "access-denied";
  }
  if (live.recovery || live.sync.phase === "recovery-required") return "recovery-required";
  if (live.sync.phase === "unsupported-jam") return "session-unavailable";
  if (globalThis.isSecureContext !== true) return "insecure-context";
  if (typeof globalThis.RTCPeerConnection !== "function") return "webrtc-unsupported";
  const mode = live.room?.mode ?? live.mode;
  if (mode === "local" || live.usingLocalFallback) return "local-only";
  if (!live.room && !live.serverAvailable) return "server-unavailable";
  if (!live.room?.ready) return live.availability === "error" ? "connection-error" : "connecting";
  if (mode !== "server") return "server-unavailable";
  if (!direct) return "direct-unavailable";
  // Document durability warnings do not revoke an admitted RTC room.
  return "ready";
}

export function canRetryStudioHuddleConnection(
  availability: StudioHuddleAvailability,
  serverAvailable: boolean,
): boolean {
  // Service configuration cannot be repaired by asking users to reconnect.
  return serverAvailable && availability === "connection-error";
}

export const STUDIO_HUDDLE_AVAILABILITY_COPY: Record<Exclude<StudioHuddleAvailability, "ready">, readonly [string, string]> = {
  "access-denied": ["이 작업실의 대화 참여 권한이 없습니다. 작업실 소유자에게 초대를 요청해 주세요.", "You do not have access to this conversation. Ask the workspace owner for an invitation."],
  "recovery-required": ["원고 복구가 끝날 때까지 대화 참여를 일시 중지했습니다.", "Conversation participation is paused until manuscript recovery is complete."],
  "session-unavailable": ["이 작업실에서는 아직 채팅·통화를 사용할 수 없습니다.", "Chat and calls are not available in this workspace yet."],
  "insecure-context": ["현재 주소에서는 보안상 통화를 사용할 수 없습니다. 서비스의 HTTPS 주소로 접속해 주세요.", "Calls are unavailable at this address for security reasons. Open the service over HTTPS."],
  "webrtc-unsupported": ["현재 브라우저는 실시간 대화를 지원하지 않습니다. 지원되는 최신 브라우저로 접속해 주세요.", "This browser does not support live conversations. Open the service in a supported, up-to-date browser."],
  "local-only": ["이 작업실은 현재 기기 내 작업만 지원합니다. 채팅·통화를 제공하려면 서비스의 연결 준비가 필요합니다. 사용자 설정은 필요하지 않습니다.", "This workspace currently supports on-device work only. Chat and calls require service-side connection setup; no user configuration is needed."],
  "connecting": ["채팅·통화에 연결 중입니다. 연결되면 참여할 수 있습니다.", "Connecting chat and calls. You can join once connected."],
  "connection-error": ["채팅·통화에 일시적으로 연결하지 못했습니다. 연결이 복구되면 참여할 수 있습니다.", "Chat and calls are temporarily disconnected. You can join once the connection is restored."],
  "server-unavailable": ["채팅·통화 서비스를 아직 사용할 수 없습니다. 연결 준비는 서비스에서 처리합니다.", "Chat and calls are not available yet. Connection setup is handled by the service."],
  "direct-unavailable": ["이 작업실의 채팅·통화 연결을 아직 사용할 수 없습니다. 사용자 설정은 필요하지 않습니다.", "Chat and calls are not available in this workspace yet. No user configuration is needed."],
};
