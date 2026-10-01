import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 고스트 모드 (G 키: 반투명 + 통과 이동)
 *
 * - 목적: 대규모 이벤트에서 아바타가 벽·가구에 끼는 문제 해소.
 * - 책임 분할: 물리적 통과 판정(충돌기 비활성화·내비게이션 게이팅 우회)은 트랙3,
 *   반투명 렌더링은 트랙1이 `ghost` 플래그 API로 노출 예정.
 * - 인터페이스: `STUDIO_GHOST_SPRITE_ALPHA` 값은 양쪽이 공유한다.
 *   트랙1 렌더러가 들어오면 캔버스 임시 알파 적용을 그 API로 교체한다.
 */

/** 고스트 토글 키 (KeyboardEvent.code). */
export const STUDIO_GHOST_TOGGLE_KEY = "KeyG";

/**
 * 트랙1 렌더러가 고스트 상태에서 쓸 스프라이트 불투명도.
 * 캔버스는 트랙1 API가 오기 전까지 이 값을 직접 적용한다.
 */
export const STUDIO_GHOST_SPRITE_ALPHA = 0.55;

export interface StudioGhostModeState {
  readonly enabled: boolean;
}

export function toggleStudioGhostMode(state: StudioGhostModeState): StudioGhostModeState {
  return { enabled: !state.enabled };
}

/**
 * 고스트 이동 입력: 장애물·내비게이션 무시하고 목적지로 직진한다.
 * 목적지가 없으면 null (키보드 입력 사용).
 */
export function studioGhostSeekInput(
  current: StudioVirtualSpacePoint,
  destination: StudioVirtualSpacePoint | null,
): { readonly x: number; readonly y: number } | null {
  if (!destination) return null;
  const dx = destination.x - current.x;
  const dy = destination.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return null;
  return { x: dx / distance, y: dy / distance };
}

/**
 * 고스트가 활성화됐을 때 스킵해야 할 판정들 (캔버스에서 사용).
 * - 충돌기(collider) 활성화: off
 * - "벽 안에 갇힘" 자동 탈출 보정: off (의도적 통과 중이므로)
 * - 내비게이션 segmentFits 게이팅: off (직진 seek)
 * 월드 경계(setCollideWorldBounds)는 고스트에서도 유지한다.
 */
export function studioGhostCollisionOverrides(enabled: boolean): {
  readonly collidersActive: boolean;
  readonly skipOccupancyCorrection: boolean;
  readonly skipNavigationGating: boolean;
  readonly keepWorldBounds: boolean;
} {
  return {
    collidersActive: !enabled,
    skipOccupancyCorrection: enabled,
    skipNavigationGating: enabled,
    keepWorldBounds: true,
  };
}
