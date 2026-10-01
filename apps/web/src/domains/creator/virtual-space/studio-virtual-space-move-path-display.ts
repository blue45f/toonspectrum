import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 클릭 이동 경로 표시 모델
 *
 * 클릭한 목적지 마커 + 이동 경로 폴리라인을 계산하는 순수 로직 모듈.
 * 실제 그리기(Phaser Graphics)는 캔버스가 담당하고, 미니맵은 같은 모델을
 * 목적지 마커 표시에 재사용한다.
 */

/** 목적지 마커 펄스 주기 (ms). */
export const STUDIO_MOVE_PATH_MARKER_PULSE_MS = 1200;

/** 폴리라인 최대 점 수 (긴 경로는 간소화해 그린다). */
export const STUDIO_MOVE_PATH_MAX_POINTS = 32;

/** 목적지 도착 판정 거리 (px). */
export const STUDIO_MOVE_PATH_ARRIVAL_DISTANCE = 6;

export interface StudioMovePathDisplay {
  /** 표시 자체가 필요한지. */
  readonly visible: boolean;
  /** 현재 위치 → 웨이포인트 → 목적지 폴리라인 (간소화됨). */
  readonly polyline: readonly StudioVirtualSpacePoint[];
  /** 목적지 마커 (null이면 숨김). */
  readonly marker: { readonly point: StudioVirtualSpacePoint; readonly pulse: number } | null;
  /** 현재 위치에서 목적지까지 남은 거리(px). */
  readonly remainingDistance: number;
}

/** 목적지 마커 펄스 0~1 (사인파). reducedMotion이면 0.5 고정. */
export function movePathMarkerPulse(now: number, startedAt: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.5;
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeStart = Number.isFinite(startedAt) ? startedAt : 0;
  const elapsed = Math.max(0, safeNow - safeStart);
  return 0.5 + 0.5 * Math.sin((elapsed / STUDIO_MOVE_PATH_MARKER_PULSE_MS) * Math.PI * 2);
}

/** 폴리라인 간소화: 시작·끝점을 유지하고 균등 간격으로 솎아낸다. */
export function simplifyMovePath(
  points: readonly StudioVirtualSpacePoint[],
  maxPoints: number = STUDIO_MOVE_PATH_MAX_POINTS,
): readonly StudioVirtualSpacePoint[] {
  const safeMax = Number.isFinite(maxPoints) && maxPoints >= 2 ? Math.floor(maxPoints) : 2;
  if (points.length <= safeMax) return points;
  const step = (points.length - 1) / (safeMax - 1);
  const simplified: StudioVirtualSpacePoint[] = [];
  for (let i = 0; i < safeMax; i += 1) {
    const point = points[Math.min(points.length - 1, Math.round(i * step))];
    if (point) simplified.push(point);
  }
  return Object.freeze(simplified);
}

/** 폴리라인 전체 길이(px). */
export function movePathLength(points: readonly StudioVirtualSpacePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const current = points[i]!;
    length += Math.hypot(current.x - prev.x, current.y - prev.y);
  }
  return length;
}

function finitePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}

/**
 * 경로 표시 모델을 만든다.
 * - 목적지가 있고 (이동 중이거나 남은 경로가 있으면) 표시한다.
 * - 도착(목적지 반경 안 + 정지)이면 숨긴다.
 */
export function buildMovePathDisplay(input: {
  readonly current: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly destination: StudioVirtualSpacePoint | null;
  readonly moving: boolean;
  readonly now: number;
  readonly markerStartedAt: number;
  readonly reducedMotion: boolean;
}): StudioMovePathDisplay {
  const current = finitePoint(input.current);
  const destination = input.destination ? finitePoint(input.destination) : null;
  const path = input.path.map(finitePoint);
  if (!destination) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  const arrived = Math.hypot(destination.x - current.x, destination.y - current.y) <= STUDIO_MOVE_PATH_ARRIVAL_DISTANCE
    && !input.moving;
  if (arrived) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  if (!input.moving && path.length === 0) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  const raw = [current, ...path];
  const last = raw[raw.length - 1]!;
  // 경로 끝이 목적지와 다르면 목적지를 이어 붙인다
  if (Math.hypot(last.x - destination.x, last.y - destination.y) > 1) raw.push(destination);
  const polyline = simplifyMovePath(raw);
  return {
    visible: true,
    polyline,
    marker: {
      point: destination,
      pulse: movePathMarkerPulse(input.now, input.markerStartedAt, input.reducedMotion),
    },
    remainingDistance: Math.round(movePathLength(polyline) * 10) / 10,
  };
}
