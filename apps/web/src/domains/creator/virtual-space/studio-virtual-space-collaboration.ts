import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
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

/** 리액션 → 이모지 매핑. */
const REACTION_EMOJI: Record<StudioVirtualSpaceReaction, string> = {
  "wave": "👋",
  "heart": "❤️",
  "sparkles": "✨",
  "thumbs-up": "👍",
};

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
    emoji: REACTION_EMOJI[reaction],
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
