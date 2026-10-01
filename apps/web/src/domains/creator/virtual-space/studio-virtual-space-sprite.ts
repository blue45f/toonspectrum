import type { StudioVirtualAvatarProfile, StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioCharacterMotionState } from "./studio-virtual-space-character-skins";

/**
 * 8방향 캐릭터 스프라이트 시스템
 *
 * Gather Town은 4방향 스프라이트만 지원한다. toonstudio는 8방향(대각선 포함)으로
 * 더 자연스러운 움직임을 제공한다.
 *
 * 순수 로직 모듈. 실제 스프라이트 렌더링(캔버스/Phaser)은 호출 측에서 담당한다.
 */

/** 8방향. */
export type StudioSpriteDirection =
  | "down"
  | "down-left"
  | "left"
  | "up-left"
  | "up"
  | "up-right"
  | "right"
  | "down-right";

/** 걷기 애니메이션 프레임 수 (한 사이클). */
export const STUDIO_SPRITE_WALK_FRAME_COUNT = 6;

/** 프레임당 지속 시간 (ms). 속도에 따라 조절된다. */
export const STUDIO_SPRITE_FRAME_DURATION_MS = 120;

/** 방향별 스프라이트 시트 행 인덱스. */
const DIRECTION_ROW: Record<StudioSpriteDirection, number> = {
  "down": 0,
  "down-left": 1,
  "left": 2,
  "up-left": 3,
  "up": 4,
  "up-right": 5,
  "right": 6,
  "down-right": 7,
};

/**
 * 속도 벡터에서 8방향을 구한다.
 * 정지 상태(속도 0)에서는 이전 방향을 유지한다.
 */
export function velocityToSpriteDirection(
  velocity: StudioVirtualSpacePoint,
  previous: StudioSpriteDirection = "down",
): StudioSpriteDirection {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 1) return previous;
  // atan2: x축 기준 반시계 방향. 화면 좌표계(y 아래)에서는 시계 방향이 된다.
  // 8섹터로 나누기: 각 섹터 45도, "down"을 중심으로.
  const angle = Math.atan2(velocity.y, velocity.x); // -PI ~ PI
  // down(아래, +y)을 0도로 하는 각도로 변환
  const downAngle = angle - Math.PI / 2; // down 방향이 0
  const normalized = ((downAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.round(normalized / (Math.PI / 4)) % 8;
  const directions: readonly StudioSpriteDirection[] = [
    "down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right",
  ];
  return directions[sector] ?? "down";
}

/** 8방향을 4방향 facing으로 변환한다 (P2P 패킷 호환용). */
export function spriteDirectionToFacing(direction: StudioSpriteDirection): StudioVirtualSpaceFacing {
  switch (direction) {
    case "down":
    case "down-left":
    case "down-right":
      return "down";
    case "up":
    case "up-left":
    case "up-right":
      return "up";
    case "left":
      return "left";
    case "right":
      return "right";
  }
}

/** 걷기 애니메이션 프레임 인덱스 (0 ~ 5). */
export function walkAnimationFrame(
  distanceTraveled: number,
  pixelsPerFrame: number = 18,
  reducedMotion: boolean = false,
): number {
  if (reducedMotion || !Number.isFinite(distanceTraveled) || distanceTraveled < 0) return 0;
  const safePixels = Number.isFinite(pixelsPerFrame) && pixelsPerFrame > 0 ? pixelsPerFrame : 18;
  return Math.floor(distanceTraveled / safePixels) % STUDIO_SPRITE_WALK_FRAME_COUNT;
}

/** 스프라이트 시트 좌표 (행, 열). */
export function spriteSheetCell(
  direction: StudioSpriteDirection,
  frame: number,
  motionState: StudioCharacterMotionState = "idle",
): { readonly row: number; readonly column: number } {
  if (motionState === "sit") {
    // 앉기: 별도 시트 영역 (행 8)
    return Object.freeze({ row: 8, column: Math.max(0, Math.min(3, frame)) });
  }
  if (motionState === "talk") {
    // 말하기: 입 움직임 프레임 (행 9)
    return Object.freeze({ row: 9, column: Math.max(0, Math.min(1, frame)) });
  }
  const row = DIRECTION_ROW[direction];
  const column = motionState === "idle" ? 0 : Math.max(0, Math.min(STUDIO_SPRITE_WALK_FRAME_COUNT - 1, frame));
  return Object.freeze({ row, column });
}

/** 말풍선 상태. */
export interface StudioSpeechBubbleState {
  readonly visible: boolean;
  /** 말풍선 애니메이션 프레임 (0: 나타남, 1: 유지, 2: 사라짐). */
  readonly frame: number;
  readonly text: string | null;
}

/** 발화 중 말풍선을 표시한다. */
export function speechBubbleState(
  speaking: boolean,
  text: string | null,
  startedAt: number,
  now: number,
): StudioSpeechBubbleState {
  if (!speaking) {
    return Object.freeze({ visible: false, frame: 0, text: null });
  }
  const elapsed = Math.max(0, now - startedAt);
  const frame = elapsed < 150 ? 0 : elapsed > 2_000 ? 2 : 1;
  return Object.freeze({ visible: true, frame, text });
}

/** 자리비움 표시 상태. */
export interface StudioAwayIndicatorState {
  readonly visible: boolean;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 상태에 따른 자리비움/휴식 표시. */
export function awayIndicatorState(status: StudioUserStatus): StudioAwayIndicatorState {
  switch (status) {
    case "away":
      return Object.freeze({ visible: true, labelKo: "자리 비움", labelEn: "Away" });
    case "break":
      return Object.freeze({ visible: true, labelKo: "휴식 중", labelEn: "On a break" });
    case "in-meeting":
      return Object.freeze({ visible: true, labelKo: "회의 중", labelEn: "In a meeting" });
    case "presenting":
      return Object.freeze({ visible: true, labelKo: "발표 중", labelEn: "Presenting" });
    case "focusing":
      return Object.freeze({ visible: true, labelKo: "집중 중", labelEn: "Focusing" });
    default:
      return Object.freeze({ visible: false, labelKo: "", labelEn: "" });
  }
}

/** 캐릭터 렌더 파라미터 (아바타 프로필 + 스프라이트 상태 통합). */
export interface StudioCharacterRenderParams {
  readonly profile: StudioVirtualAvatarProfile;
  readonly direction: StudioSpriteDirection;
  readonly frame: number;
  readonly cell: { readonly row: number; readonly column: number };
  readonly motionState: StudioCharacterMotionState;
  readonly speechBubble: StudioSpeechBubbleState;
  readonly awayIndicator: StudioAwayIndicatorState;
  readonly shadowScale: number;
}

/**
 * 캐릭터 렌더 파라미터를 조립한다.
 * 호출 측(캔버스/Phaser)은 이 파라미터로 스프라이트를 그린다.
 */
export function buildCharacterRenderParams(input: {
  readonly profile: StudioVirtualAvatarProfile;
  readonly velocity: StudioVirtualSpacePoint;
  readonly previousDirection: StudioSpriteDirection;
  readonly distanceTraveled: number;
  readonly motionState: StudioCharacterMotionState;
  readonly speaking: boolean;
  readonly speechText: string | null;
  readonly speechStartedAt: number;
  readonly userStatus: StudioUserStatus;
  readonly now: number;
  readonly reducedMotion: boolean;
  readonly shadowScale?: number;
}): StudioCharacterRenderParams {
  const direction = input.motionState === "sit"
    ? input.previousDirection
    : velocityToSpriteDirection(input.velocity, input.previousDirection);
  const frame = input.motionState === "sit"
    ? 0
    : walkAnimationFrame(input.distanceTraveled, 18, input.reducedMotion);
  return Object.freeze({
    profile: input.profile,
    direction,
    frame,
    cell: spriteSheetCell(direction, frame, input.motionState),
    motionState: input.motionState,
    speechBubble: speechBubbleState(input.speaking, input.speechText, input.speechStartedAt, input.now),
    awayIndicator: awayIndicatorState(input.userStatus),
    shadowScale: Number.isFinite(input.shadowScale) ? input.shadowScale as number : 1,
  });
}
