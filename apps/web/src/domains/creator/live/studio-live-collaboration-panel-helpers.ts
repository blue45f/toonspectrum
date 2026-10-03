/**
 * StudioLiveCollaborationPanel 표시 헬퍼 — 역할 라벨, 피어 가시성, 상태 문구처럼
 * 패널 본문과 분리 가능한 순수 표시 로직만 모은다.
 * (2026-10-03 파일 크기 래칫 해소로 StudioLiveCollaborationPanel에서 추출 — 동작 변경 없음.)
 */

import type { StudioScreenShareState } from "../studio-screen-share";
import type { StudioScreenIcePolicyMode } from "../studio-screen-ice-policy";
import type { StudioTeamRole } from "../studio-team-client";
import type { StudioLiveAvailability } from "./studio-live-collaboration-context";
import type { StudioLivePeer } from "./studio-live-collaboration-room";
import type { StudioLiveTransportMode } from "./studio-live-collaboration-transport";
import type { StudioLiveSyncPresentation } from "./studio-live-sync-safety";

export const ROLE_LABEL: Record<StudioTeamRole, string> = {
  owner: "소유자",
  admin: "관리자",
  editor: "편집자",
  commenter: "검토자",
  viewer: "열람자",
};

export const EMPTY_SCREEN_STATE: StudioScreenShareState = {
  localSharing: false,
  shares: [],
  watching: null,
  pendingRequests: [],
  viewers: [],
};

export const MAX_VISIBLE_LIVE_PEERS = 8;

export function visibleLivePeers(
  peers: readonly StudioLivePeer[],
  followingSessionId: string | null
): StudioLivePeer[] {
  const visible = peers.slice(0, MAX_VISIBLE_LIVE_PEERS);
  if (
    !followingSessionId ||
    visible.some((peer) => peer.sessionId === followingSessionId)
  ) {
    return visible;
  }

  const followedPeer = peers.find(
    (peer) => peer.sessionId === followingSessionId
  );
  if (!followedPeer) return visible;

  return [...visible.slice(0, MAX_VISIBLE_LIVE_PEERS - 1), followedPeer];
}

export function tabInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

export function statusCopy(availability: StudioLiveAvailability, mode: StudioLiveTransportMode | null) {
  if (availability === "idle") return "연결 대기";
  if (availability === "connecting") return "연결 준비 중";
  if (availability === "unsupported") return "브라우저 미지원";
  if (availability === "error") return "연결 오류";
  return mode === "server" ? "팀 서버 연결" : "이 기기 테스트 연결";
}

export function syncStatusToneClass(
  tone: StudioLiveSyncPresentation["tone"] | null,
  ready: boolean,
  availability: StudioLiveAvailability
): string {
  if (tone === "good") return "border-good/35 bg-good/10 text-good";
  if (tone === "bad") return "border-bad/40 bg-bad/10 text-bad";
  if (tone === "warn") return "border-warn/40 bg-warn/10 text-warn";
  if (tone === "cool") return "border-cool/35 bg-cool/10 text-cool";
  if (ready) return "border-good/35 bg-good/10 text-good";
  if (availability === "error") return "border-bad/35 bg-bad/10 text-bad";
  return "border-line bg-card text-fg-3";
}

export function screenItemKey(kind: "approve" | "watch" | "item", sessionId: string, shareId: string) {
  return JSON.stringify([kind, sessionId, shareId]);
}

export function chatTimeLabel(sentAt: number): string {
  const time = new Date(sentAt);
  if (!Number.isFinite(time.getTime())) return "";
  return time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function screenNetworkSummary(
  supported: boolean,
  ready: boolean,
  mode: StudioScreenIcePolicyMode | null,
  loading: boolean
): string {
  if (!supported) return "이 브라우저는 화면 공유를 지원하지 않음";
  if (!ready) return "화면 공유 도구 준비 중";
  if (loading) return "보안 화면 연결 확인 중";
  if (mode === null) return "사용할 때 보안 연결 준비 · 영상만";
  if (mode === "turn") return "TURN 중계 · 원격 지원 · 영상만 · 오디오는 캡처하지 않음";
  if (mode === "stun") return "STUN 연결 · 영상만 · 오디오는 캡처하지 않음";
  return "직접 연결 · 영상만 · 오디오는 캡처하지 않음";
}
