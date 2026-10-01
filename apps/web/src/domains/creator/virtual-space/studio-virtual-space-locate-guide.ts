import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 참가자 locate 안내선 (큰 맵에서 사람 찾기)
 *
 * 특정 참가자를 선택하면 그 방향으로 안내선/마커를 표시한다 (Gather식).
 * - 타깃이 화면 안에 있으면 그 위치에 마커.
 * - 화면 밖에 있으면 화면 가장자리에 화살표 마커 + 방향 안내선.
 * - 피어 팔로우(카메라 이동)만으로는 부족하다는 벤치마크 지적을 보완한다.
 *
 * 전부 순수 계산. 그리기는 캔버스(Phaser Graphics)가 담당한다.
 */

export interface StudioLocateGuideInput {
  /** 내 위치 (월드 좌표). */
  readonly self: StudioVirtualSpacePoint;
  /** 찾을 참가자 위치 (월드 좌표, null이면 안내 없음). */
  readonly target: StudioVirtualSpacePoint | null;
  /** 카메라 중심 (월드 좌표). */
  readonly cameraCenter: StudioVirtualSpacePoint;
  /** 화면 크기 (월드 좌표계, 줌 반영 후). */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 가장자리 여유 (px, 기본 48). */
  readonly margin?: number;
}

export interface StudioLocateGuide {
  /** 안내 표시가 필요한지. */
  readonly visible: boolean;
  /** self→target 방향 (rad, 월드 좌표계). */
  readonly angle: number;
  /** 거리 (px). */
  readonly distance: number;
  /** 화면 안이면 타깃 위치, 밖이면 가장자리 마커 위치. */
  readonly markerPoint: StudioVirtualSpacePoint;
  readonly onScreen: boolean;
}

/** 가장자리 기본 여유 (px). */
export const STUDIO_LOCATE_GUIDE_MARGIN = 48;

function finitePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}

export function buildStudioLocateGuide(input: StudioLocateGuideInput): StudioLocateGuide {
  const hidden: StudioLocateGuide = {
    visible: false, angle: 0, distance: 0, markerPoint: { x: 0, y: 0 }, onScreen: false,
  };
  if (!input.target) return hidden;
  const self = finitePoint(input.self);
  const target = finitePoint(input.target);
  const center = finitePoint(input.cameraCenter);
  const viewWidth = Number.isFinite(input.viewWidth) && input.viewWidth > 0 ? input.viewWidth : 0;
  const viewHeight = Number.isFinite(input.viewHeight) && input.viewHeight > 0 ? input.viewHeight : 0;
  if (viewWidth <= 0 || viewHeight <= 0) return hidden;

  const dx = target.x - self.x;
  const dy = target.y - self.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return hidden;

  const angle = Math.atan2(dy, dx);
  const margin = Number.isFinite(input.margin) && (input.margin ?? 0) >= 0
    ? (input.margin as number)
    : STUDIO_LOCATE_GUIDE_MARGIN;
  const halfW = viewWidth / 2 - margin;
  const halfH = viewHeight / 2 - margin;
  if (halfW <= 0 || halfH <= 0) {
    return { ...hidden, visible: true, angle, distance, markerPoint: { x: center.x, y: center.y }, onScreen: false };
  }
  const left = center.x - halfW;
  const right = center.x + halfW;
  const top = center.y - halfH;
  const bottom = center.y + halfH;
  const onScreen = target.x >= left && target.x <= right && target.y >= top && target.y <= bottom;
  if (onScreen) {
    return { visible: true, angle, distance, markerPoint: target, onScreen: true };
  }
  // 화면 밖: 가장자리에 클램프 (Liáng-Barsky 대신 축별 클램프, 안내 마커 용도로 충분)
  const markerPoint = {
    x: Math.min(right, Math.max(left, target.x)),
    y: Math.min(bottom, Math.max(top, target.y)),
  };
  return { visible: true, angle, distance, markerPoint, onScreen: false };
}

/** 거리 라벨: 1000px 이상은 m 단위 느낌으로, 그 미만은 px. */
export function studioLocateDistanceLabel(distance: number): string {
  const safe = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}k`;
  return `${Math.round(safe)}`;
}
