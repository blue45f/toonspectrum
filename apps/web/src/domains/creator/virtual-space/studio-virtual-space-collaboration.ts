import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
import { studioSpaceEmoteById } from "./studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceReaction } from "./studio-virtual-space-presence";

/**
 * 가상 사무실 협업 활동
 *
 * 실제 협업이 잘 되도록 돕는 기능들:
 * - 발화자 링: 누가 말하는지 캐릭터 주변 링으로 표시
 * - 화면 공유 버튼: 회의실에서 화면 공유 시작/중지
 * - 이모지 리액션 플로팅: 캐릭터 위로 떠오르는 이모지 애니메이션
 * - 따라가기 모드: 리더를 따라다니기 (오피스 투어용)
 *
 * 순수 로직 모듈. 실제 오디오 레벨 측정·화면 캡처는 호출 측에서 담당한다.
 */

// ---------------------------------------------------------------------------
// 발화자 링
// ---------------------------------------------------------------------------

/** 발화자 오디오 레벨 스냅샷. */
export interface StudioSpeakerLevel {
  readonly sessionId: string;
  /** 0 ~ 1 정규화된 오디오 레벨. */
  readonly level: number;
  readonly at: number;
}

/** 발화 임계값. */
export const STUDIO_SPEAKER_THRESHOLD = 0.15;

/** 발화자 링 표시 상태. */
export interface StudioSpeakerRingState {
  readonly sessionId: string;
  /** 링 강도 (0 ~ 1). 오디오 레벨에 비례한다. */
  readonly intensity: number;
  /** 링 애니메이션 위상 (0 ~ 1). */
  readonly phase: number;
}

/**
 * 오디오 레벨에서 발화자 링 상태를 구한다.
 * 임계값 이상인 참가자만 링을 표시한다.
 */
export function speakerRingStates(
  levels: readonly StudioSpeakerLevel[],
  now: number,
): readonly StudioSpeakerRingState[] {
  const states: StudioSpeakerRingState[] = [];
  for (const { sessionId, level, at } of levels) {
    // 1초 이상 오래된 레벨은 무시
    if (now - at > 1_000) continue;
    const safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    if (safeLevel < STUDIO_SPEAKER_THRESHOLD) continue;
    const intensity = (safeLevel - STUDIO_SPEAKER_THRESHOLD) / (1 - STUDIO_SPEAKER_THRESHOLD);
    const phase = (now % 1_200) / 1_200; // 1.2초 주기 맥동
    states.push(Object.freeze({ sessionId, intensity, phase }));
  }
  return Object.freeze(states);
}

// ---------------------------------------------------------------------------
// 화면 공유 버튼
// ---------------------------------------------------------------------------

/** 화면 공유 버튼 상태. */
export type StudioShareButtonState =
  | "hidden"    // 회의실 밖: 숨김
  | "start"     // 회의실 안, 아무도 공유 중이 아님: 시작 가능
  | "sharing"   // 내가 공유 중: 중지 가능
  | "viewing";  // 다른 사람이 공유 중: 보기 중

/**
 * 화면 공유 버튼 상태를 결정한다.
 */
export function shareButtonState(input: {
  readonly inMeetingRoom: boolean;
  readonly amSharing: boolean;
  readonly peerSharingSessionId: string | null;
}): StudioShareButtonState {
  if (!input.inMeetingRoom) return "hidden";
  if (input.amSharing) return "sharing";
  if (input.peerSharingSessionId !== null) return "viewing";
  return "start";
}

/** 화면 공유 버튼 문구. */
export function shareButtonText(
  state: StudioShareButtonState,
): { readonly ko: string; readonly en: string } {
  switch (state) {
    case "start":
      return { ko: "화면 공유 시작", en: "Start screen share" };
    case "sharing":
      return { ko: "공유 중지", en: "Stop sharing" };
    case "viewing":
      return { ko: "화면 보는 중", en: "Viewing screen" };
    default:
      return { ko: "", en: "" };
  }
}

// ---------------------------------------------------------------------------
// 이모지 리액션 플로팅
// ---------------------------------------------------------------------------

/** 플로팅 이모지. */
export interface StudioFloatingEmoji {
  readonly id: string;
  readonly sessionId: string;
  readonly emoji: string;
  /** 생성 시각 (ms). */
  readonly createdAt: number;
  /** 수명 (ms). */
  readonly ttlMs: number;
}

/** 추가 협업 이모지. */
export const STUDIO_COLLAB_EMOJIS = Object.freeze([
  "👏", // 박수
  "🎉", // 축하
  "💡", // 아이디어
  "❓", // 질문
  "☕", // 휴식
] as const);

export type StudioCollabEmoji = typeof STUDIO_COLLAB_EMOJIS[number];

/** 플로팅 이모지 수명. */
export const STUDIO_FLOATING_EMOJI_TTL_MS = 2_400;

/**
 * 리액션을 플로팅 이모지로 변환한다.
 */
export function reactionToFloatingEmoji(
  id: string,
  sessionId: string,
  reaction: StudioVirtualSpaceReaction,
  createdAt: number,
): StudioFloatingEmoji {
  return Object.freeze({
    id,
    sessionId,
    // 리액션 이모지는 이모트 카탈로그 한 곳에서 관리한다(16종으로 확장돼도 매핑이 갈라지지 않게).
    emoji: studioSpaceEmoteById(reaction)?.glyph ?? "✨",
    createdAt,
    ttlMs: STUDIO_FLOATING_EMOJI_TTL_MS,
  });
}

/**
 * 커스텀 협업 이모지를 플로팅 이모지로 만든다.
 */
export function collabEmojiToFloating(
  id: string,
  sessionId: string,
  emoji: StudioCollabEmoji,
  createdAt: number,
): StudioFloatingEmoji {
  return Object.freeze({ id, sessionId, emoji, createdAt, ttlMs: STUDIO_FLOATING_EMOJI_TTL_MS });
}

/** 플로팅 오프셋 (캐릭터 머리 위로 떠오른다). */
export function floatingEmojiOffset(
  emoji: StudioFloatingEmoji,
  now: number,
  reducedMotion: boolean = false,
): { readonly dx: number; readonly dy: number; readonly opacity: number } {
  const age = Math.max(0, now - emoji.createdAt);
  const progress = Math.min(1, age / emoji.ttlMs);
  if (reducedMotion) {
    return Object.freeze({ dx: 0, dy: -40, opacity: progress > 0.8 ? 0 : 1 });
  }
  // 위로 떠오르면서 페이드아웃. ease-out 곡선.
  const dy = -24 - 48 * (1 - Math.pow(1 - progress, 2));
  const opacity = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
  return Object.freeze({ dx: 0, dy, opacity: Math.max(0, opacity) });
}

/** 만료된 플로팅 이모지를 제거한다. */
export function pruneFloatingEmojis(
  emojis: readonly StudioFloatingEmoji[],
  now: number,
): readonly StudioFloatingEmoji[] {
  return Object.freeze(emojis.filter((emoji) => now - emoji.createdAt < emoji.ttlMs));
}

// ---------------------------------------------------------------------------
// 따라가기 모드 (투어)
// ---------------------------------------------------------------------------

/** 따라가기 상태. */
export interface StudioFollowState {
  readonly following: boolean;
  /** 따라가는 대상 sessionId. */
  readonly leaderSessionId: string | null;
}

export const NOT_FOLLOWING: StudioFollowState = Object.freeze({
  following: false,
  leaderSessionId: null,
});

/** 따라가기 시작. */
export function startFollowing(leaderSessionId: string): StudioFollowState {
  return Object.freeze({ following: true, leaderSessionId });
}

/** 따라가기 중지. */
export function stopFollowing(): StudioFollowState {
  return NOT_FOLLOWING;
}

/**
 * 리더 뒤를 따라가는 목표 위치를 구한다.
 * 리더 뒤쪽(진행 방향 반대) 일정 거리에 위치한다.
 */
export function followTargetPosition(
  leaderPosition: StudioVirtualSpacePoint,
  leaderVelocity: StudioVirtualSpacePoint,
  followDistance: number = 64,
): StudioVirtualSpacePoint {
  const speed = Math.hypot(leaderVelocity.x, leaderVelocity.y);
  const safeDistance = Number.isFinite(followDistance) && followDistance > 0 ? followDistance : 64;
  if (speed < 1) {
    // 리더가 정지 중이면 아래쪽에 선다
    return Object.freeze({
      x: leaderPosition.x,
      y: leaderPosition.y + safeDistance,
    });
  }
  // 진행 방향 반대쪽
  const nx = leaderVelocity.x / speed;
  const ny = leaderVelocity.y / speed;
  return Object.freeze({
    x: leaderPosition.x - nx * safeDistance,
    y: leaderPosition.y - ny * safeDistance,
  });
}

/**
 * 따라가기 중 수동 입력이 들어오면 따라가기를 해제한다.
 * (사용자가 직접 움직이면 투어가 끝난 것으로 본다)
 */
export function shouldStopFollowingOnInput(
  followState: StudioFollowState,
  manualInput: StudioVirtualSpacePoint,
): boolean {
  if (!followState.following) return false;
  return Math.hypot(manualInput.x, manualInput.y) > 0.1;
}

/**
 * 리더가 너무 멀어지면(다른 존/화면 밖) 따라가기를 유지할지 판단한다.
 * 600px 이상 떨어지면 "리더에게 이동" 안내를 띄우는 용도.
 */
export function followDistanceExceeded(
  followerPosition: StudioVirtualSpacePoint,
  leaderPosition: StudioVirtualSpacePoint,
  threshold: number = 600,
): boolean {
  return studioVirtualSpaceDistance(followerPosition, leaderPosition) > threshold;
}

// ---------------------------------------------------------------------------
// 따라가기 세션 상태머신 (투어 고도화)
//
// B 트랙(Phaser 캔버스)이 소비하는 공개 상태 타입:
// - `StudioFollowSession`을 렌더/이동 루프에 그대로 전달한다.
// - `updateFollowSession(session, event)`는 순수 리듀서다.
// ---------------------------------------------------------------------------

/** 따라가기 세션 모드. */
export type StudioFollowMode =
  | "idle"          // 따라가기 없음
  | "following"     // 리더를 따라 이동 중
  | "paused"        // 수동 입력으로 일시정지 — 재개 가능
  | "reconnecting"  // 리더 presence 끊김 — 재탐색 중
  | "leader-left";  // 리더가 방을 나감/신호 두절 — 리더 변경 가능

/** 따라가기 세션. B 트랙이 캔버스 이동 루프에 그대로 전달하는 스냅샷. */
export interface StudioFollowSession {
  readonly mode: StudioFollowMode;
  /** 따라가는 대상 sessionId. */
  readonly leaderSessionId: string | null;
  readonly leaderName: string | null;
  readonly startedAt: number;
  /** 리더 presence를 마지막으로 본 시각 (ms). */
  readonly lastLeaderSeenAt: number;
  readonly pausedAt: number | null;
}

export const IDLE_FOLLOW_SESSION: StudioFollowSession = Object.freeze({
  mode: "idle",
  leaderSessionId: null,
  leaderName: null,
  startedAt: 0,
  lastLeaderSeenAt: 0,
  pausedAt: null,
});

/** 리더 미수신 후 이 시간이 지나면 reconnecting. */
export const STUDIO_FOLLOW_RECONNECT_AFTER_MS = 5_000;
/** reconnecting 후 이 시간이 지나면 leader-left. */
export const STUDIO_FOLLOW_LEADER_GONE_AFTER_MS = 15_000;
/** 이보다 가까우면 대기 (px). */
export const STUDIO_FOLLOW_MIN_DISTANCE = 48;
/** 이 거리 안이면 편안하게 유지 (px). */
export const STUDIO_FOLLOW_COMFORTABLE_DISTANCE = 160;
/** 이 거리를 넘으면 리더에게 이동 안내 (px). followDistanceExceeded 기본값과 동일. */
export const STUDIO_FOLLOW_CATCH_UP_DISTANCE = 600;

/** 따라가기 세션 이벤트. */
export type StudioFollowEvent =
  | { readonly type: "start"; readonly leaderSessionId: string; readonly leaderName?: string; readonly at: number }
  | { readonly type: "switch-leader"; readonly leaderSessionId: string; readonly leaderName?: string; readonly at: number }
  | { readonly type: "leader-seen"; readonly at: number }
  | { readonly type: "manual-input"; readonly at: number }
  | { readonly type: "pause"; readonly at: number }
  | { readonly type: "resume"; readonly at: number }
  | { readonly type: "leader-gone"; readonly at: number }
  | { readonly type: "tick"; readonly at: number }
  | { readonly type: "stop" };

function safeFollowTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function cleanFollowName(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 따라가기 세션 리듀서 (순수 함수).
 *
 * - start: idle → following (리더 지정)
 * - switch-leader: following/paused/reconnecting/leader-left → following (리더 변경)
 * - leader-seen: reconnecting → following (신호 회복)
 * - manual-input: following → paused (사용자가 직접 움직이면 일시정지)
 * - pause/resume: following ⇄ paused
 * - tick: 리더 미수신 5초 → reconnecting, 15초 → leader-left
 * - leader-gone: 명시적 퇴장 수신 → leader-left
 * - stop: → idle
 */
export function updateFollowSession(
  session: StudioFollowSession,
  event: StudioFollowEvent,
): StudioFollowSession {
  switch (event.type) {
    case "start": {
      if (session.mode !== "idle" || !event.leaderSessionId) return session;
      const at = safeFollowTime(event.at);
      return Object.freeze({
        mode: "following",
        leaderSessionId: event.leaderSessionId,
        leaderName: cleanFollowName(event.leaderName),
        startedAt: at,
        lastLeaderSeenAt: at,
        pausedAt: null,
      });
    }
    case "switch-leader": {
      if (session.mode === "idle" || !event.leaderSessionId) return session;
      if (event.leaderSessionId === session.leaderSessionId) return session;
      const at = safeFollowTime(event.at);
      return Object.freeze({
        ...session,
        mode: "following",
        leaderSessionId: event.leaderSessionId,
        leaderName: cleanFollowName(event.leaderName),
        lastLeaderSeenAt: at,
        pausedAt: null,
      });
    }
    case "leader-seen": {
      if (session.mode !== "following" && session.mode !== "reconnecting") return session;
      const at = safeFollowTime(event.at);
      if (session.mode === "following" && at <= session.lastLeaderSeenAt) return session;
      return Object.freeze({ ...session, mode: "following", lastLeaderSeenAt: at });
    }
    case "manual-input": {
      if (session.mode !== "following") return session;
      return Object.freeze({ ...session, mode: "paused", pausedAt: safeFollowTime(event.at) });
    }
    case "pause": {
      if (session.mode !== "following") return session;
      return Object.freeze({ ...session, mode: "paused", pausedAt: safeFollowTime(event.at) });
    }
    case "resume": {
      if (session.mode !== "paused" || !session.leaderSessionId) return session;
      const at = safeFollowTime(event.at);
      return Object.freeze({ ...session, mode: "following", pausedAt: null, lastLeaderSeenAt: at });
    }
    case "leader-gone": {
      if (session.mode === "idle") return session;
      return Object.freeze({ ...session, mode: "leader-left" });
    }
    case "tick": {
      if (session.mode !== "following" && session.mode !== "reconnecting") return session;
      const at = safeFollowTime(event.at);
      const silent = at - session.lastLeaderSeenAt;
      if (session.mode === "following" && silent >= STUDIO_FOLLOW_RECONNECT_AFTER_MS) {
        return Object.freeze({ ...session, mode: "reconnecting" });
      }
      if (session.mode === "reconnecting" && silent >= STUDIO_FOLLOW_LEADER_GONE_AFTER_MS) {
        return Object.freeze({ ...session, mode: "leader-left" });
      }
      return session;
    }
    case "stop":
      return IDLE_FOLLOW_SESSION;
  }
}

/** 따라가기 중 리더와의 거리 구간. */
export type StudioFollowDistanceBand =
  | "too-close"    // MIN 미만: 대기
  | "comfortable"  // 적정 거리 유지
  | "catching-up"  // 따라가는 중
  | "lost";        // 너무 멈: 리더에게 이동 안내

/**
 * 리더와의 거리를 구간으로 나눈다. 따라가기 중 거리 유지 UX용.
 */
export function followDistanceBand(distance: number): StudioFollowDistanceBand {
  const safe = Number.isFinite(distance) ? Math.max(0, distance) : Number.POSITIVE_INFINITY;
  if (safe < STUDIO_FOLLOW_MIN_DISTANCE) return "too-close";
  if (safe <= STUDIO_FOLLOW_COMFORTABLE_DISTANCE) return "comfortable";
  if (safe <= STUDIO_FOLLOW_CATCH_UP_DISTANCE) return "catching-up";
  return "lost";
}

/**
 * 거리 구간별 이동 목표를 구한다.
 * - too-close: 제자리 (리더가 멀어지길 대기)
 * - comfortable/catching-up: 리더 뒤쪽 목표 위치
 * - lost: 리더 위치 자체 (빠르게 따라붙기)
 */
export function followMovementTarget(
  selfPoint: StudioVirtualSpacePoint,
  leaderPosition: StudioVirtualSpacePoint,
  leaderVelocity: StudioVirtualSpacePoint,
  band: StudioFollowDistanceBand,
): StudioVirtualSpacePoint {
  switch (band) {
    case "too-close":
      return Object.freeze({ x: selfPoint.x, y: selfPoint.y });
    case "lost":
      return Object.freeze({ x: leaderPosition.x, y: leaderPosition.y });
    case "comfortable":
    case "catching-up":
    default:
      return followTargetPosition(leaderPosition, leaderVelocity, STUDIO_FOLLOW_COMFORTABLE_DISTANCE);
  }
}

/** 따라가기 모드 표시 문구. */
export function followModeCopy(
  mode: StudioFollowMode,
  leaderName: string | null = null,
): { readonly ko: string; readonly en: string } {
  const name = leaderName ?? "";
  switch (mode) {
    case "following":
      return name
        ? { ko: `${name}님 따라가는 중`, en: `Following ${name}` }
        : { ko: "따라가는 중", en: "Following" };
    case "paused":
      return { ko: "따라가기 일시정지 — 다시 시작하려면 재개 버튼", en: "Follow paused — resume to continue" };
    case "reconnecting":
      return { ko: "리더를 다시 찾는 중…", en: "Looking for the leader…" };
    case "leader-left":
      return { ko: "리더가 자리를 떠났습니다. 다른 팀원을 선택하세요.", en: "The leader has left. Choose another teammate." };
    case "idle":
    default:
      return { ko: "", en: "" };
  }
}

/** 거리 구간 표시 문구. */
export function followBandCopy(
  band: StudioFollowDistanceBand,
): { readonly ko: string; readonly en: string } {
  switch (band) {
    case "too-close":
      return { ko: "너무 가까워요. 잠시 기다리세요.", en: "Too close. Waiting a moment." };
    case "comfortable":
      return { ko: "적정 거리를 유지하고 있어요.", en: "Keeping a comfortable distance." };
    case "catching-up":
      return { ko: "리더에게 다가가고 있어요.", en: "Catching up with the leader." };
    case "lost":
      return { ko: "리더가 멀리 있어요. 리더에게 이동하세요.", en: "The leader is far away. Move to the leader." };
  }
}
