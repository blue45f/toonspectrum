import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";

/**
 * G-4. 미니맵 참가자 locate (위치 안내선)
 *
 * Gather Town식 "참가자 찾기"의 toonstudio 적용:
 * - 참가자 목록에서 이름 클릭 → 해당 위치로 안내선 표시
 * - 안내선: 본인 → 대상 방향 벡터 + 거리 + 화면 가장자리 화살표 각도
 * - 미니맵 뷰포트 변환은 studio-virtual-space-minimap이 담당,
 *   이 모듈은 안내선 기하(방향·거리·각도)를 담당한다.
 *
 * 순수 로직 모듈.
 */

export interface StudioLocateGuide {
  /** 본인 → 대상 방향 단위 벡터. */
  readonly direction: { readonly x: number; readonly y: number };
  /** 거리 (월드 단위). */
  readonly distance: number;
  /** 화면 기준 화살표 각도 (라디안, 0 = 오른쪽, 반시계 +). */
  readonly angle: number;
  /** 대상이 화면 안에 있는지 (없으면 가장자리 화살표 표시). */
  readonly onScreen: boolean;
}

/**
 * 본인 위치에서 대상까지의 안내선을 계산한다.
 * @param viewportHalfSize 화면 반크기 (월드 단위). 대상이 이 반경 안에 있으면 onScreen.
 */
export function computeLocateGuide(
  selfPoint: StudioVirtualSpacePoint,
  targetPoint: StudioVirtualSpacePoint,
  viewportHalfSize: number,
): StudioLocateGuide | null {
  const dx = targetPoint.x - selfPoint.x;
  const dy = targetPoint.y - selfPoint.y;
  const distance = studioVirtualSpaceDistance(selfPoint, targetPoint);
  if (distance === 0) return null; // 같은 위치 — 안내 불필요
  const direction = Object.freeze({ x: dx / distance, y: dy / distance });
  const angle = Math.atan2(-dy, dx); // 화면 좌표계 (y 아래가 +) 보정
  const onScreen = distance <= viewportHalfSize;
  return Object.freeze({ direction, distance, angle, onScreen });
}

/**
 * 여러 참가자 중 가장 가까운 N명을 locate 후보로 정렬한다.
 * UI "팀원 찾기" 목록용.
 */
export function sortLocateCandidates(
  selfPoint: StudioVirtualSpacePoint,
  participants: readonly { readonly sessionId: string; readonly point: StudioVirtualSpacePoint }[],
  limit = 10,
): readonly { readonly sessionId: string; readonly distance: number }[] {
  return Object.freeze(
    participants
      .map((p) => ({
        sessionId: p.sessionId,
        distance: studioVirtualSpaceDistance(selfPoint, p.point),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((c) => Object.freeze(c)),
  );
}
