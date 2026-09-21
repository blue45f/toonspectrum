import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import type { StudioLiveCollaborationContextValue } from "../studio-live-collaboration-context";

export type StudioHuddleAvailability =
  | "ready" | "access-denied" | "recovery-required" | "session-unavailable"
  | "insecure-context" | "webrtc-unsupported" | "local-only"
  | "connecting" | "connection-error" | "server-unavailable" | "direct-unavailable";

type HuddleLiveState = Pick<StudioLiveCollaborationContextValue,
  "room" | "mode" | "availability" | "canChat" | "usingLocalFallback" | "sync" | "recovery">;

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
  return serverAvailable && (availability === "local-only" || availability === "connection-error"
    || availability === "server-unavailable" || availability === "direct-unavailable");
}

export const STUDIO_HUDDLE_AVAILABILITY_COPY: Record<Exclude<StudioHuddleAvailability, "ready">, readonly [string, string]> = {
  "access-denied": ["공동작업 참여 권한이 없거나 해제되었습니다. 작업실 접근 권한을 확인해 주세요.", "Collaboration access is missing or revoked. Check your workspace permissions."],
  "recovery-required": ["원고 복구가 필요해 참여를 중지했습니다. 복구를 완료한 뒤 다시 참여해 주세요.", "Participation is paused while manuscript recovery is required. Complete recovery before rejoining."],
  "session-unavailable": ["이 공동작업 세션은 원격 연결을 지원하지 않습니다. 서버에 연결된 공동작업 원고를 열어 주세요.", "This session does not support remote connections. Open a server-connected collaborative manuscript."],
  "insecure-context": ["보안 연결이 필요합니다. HTTPS 주소 또는 localhost에서 작업실을 열어 주세요.", "A secure connection is required. Open the workspace over HTTPS or on localhost."],
  "webrtc-unsupported": ["현재 브라우저에서 WebRTC를 사용할 수 없습니다. WebRTC가 활성화된 브라우저에서 같은 작업실을 열어 주세요.", "WebRTC is unavailable in this browser. Open the same workspace in a browser with WebRTC enabled."],
  "local-only": ["현재는 이 브라우저의 로컬 탭만 연결되어 있습니다. WebRTC는 지원하지만 원격 대화를 위한 공동작업 서버 연결이 필요합니다.", "Only local browser tabs are connected. WebRTC is supported, but remote conversations require a collaboration server connection."],
  "connecting": ["공동작업 서버 연결과 참여 승인을 확인하고 있습니다. 연결되면 참여 버튼이 활성화됩니다.", "Checking the collaboration connection and admission. Participation becomes available once connected."],
  "connection-error": ["공동작업 서버에 연결하지 못했습니다. 네트워크와 로그인 상태를 확인한 뒤 연결을 다시 확인해 주세요.", "The collaboration server is disconnected. Check your network and sign-in, then check the connection again."],
  "server-unavailable": ["원격 공동작업 연결이 준비되지 않았습니다. 서버에 연결된 작업실에서 참여해 주세요.", "Remote collaboration is not ready. Join from a server-connected workspace."],
  "direct-unavailable": ["WebRTC는 지원하지만 이 작업실의 P2P 연결 기능이 준비되지 않았습니다. 연결을 다시 확인하고, 계속되면 P2P 운영 설정을 확인해 주세요.", "WebRTC is supported, but this workspace's P2P connection is unavailable. Recheck the connection and, if it persists, the P2P deployment configuration."],
};
