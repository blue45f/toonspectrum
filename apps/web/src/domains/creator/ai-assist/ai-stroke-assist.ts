/**
 * AI 선화 보조 — 스트로크 스무딩·손떨림 보정·대칭 그리기
 *
 * 실시간 드로잉 입력을 보정하는 순수 함수 모듈.
 * - 손떨림 보정: One Euro 필터 (가벼운 적응형 저역통과 필터)
 * - 러프→선화: Chaikin 코너 커팅으로 곡선 스무딩
 * - 대칭 그리기: 축 기준 미러 변환
 * - 선 굵기 균일화: 압력 값 정규화
 */

export interface AiStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestamp: number;
}

/** One Euro 필터 상태 (인스턴스별 유지) */
export interface OneEuroFilterState {
  lastTime: number;
  lastValue: number;
  lastDerivative: number;
}

export function createOneEuroFilterState(): OneEuroFilterState {
  return { lastTime: -1, lastValue: 0, lastDerivative: 0 };
}

function smoothingFactor(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

/**
 * One Euro 필터 1차원 적용.
 * minCutoff가 낮을수록 떨림 제거가 강하고, beta가 높을수록 빠른 움직임 추적이 좋다.
 */
export function oneEuroFilter1D(
  state: OneEuroFilterState,
  value: number,
  timestamp: number,
  minCutoff = 1.0,
  beta = 0.007,
  derivativeCutoff = 1.0,
): number {
  if (state.lastTime < 0) {
    state.lastTime = timestamp;
    state.lastValue = value;
    state.lastDerivative = 0;
    return value;
  }
  const dt = Math.max(1, timestamp - state.lastTime) / 1000;
  const derivative = (value - state.lastValue) / dt;
  const aD = smoothingFactor(derivativeCutoff, dt);
  state.lastDerivative = aD * derivative + (1 - aD) * state.lastDerivative;
  const cutoff = minCutoff + beta * Math.abs(state.lastDerivative);
  const a = smoothingFactor(cutoff, dt);
  const filtered = a * value + (1 - a) * state.lastValue;
  state.lastTime = timestamp;
  state.lastValue = filtered;
  return filtered;
}

/** 스트로크 포인트 시퀀스에 손떨림 보정 적용 */
export function stabilizeStroke(
  points: readonly AiStrokePoint[],
  intensity: number,
): AiStrokePoint[] {
  if (points.length === 0) return [];
  // intensity 0-1 → minCutoff 매핑 (낮을수록 강한 보정)
  const minCutoff = 3.5 - 3.0 * Math.min(1, Math.max(0, intensity));
  const sx = createOneEuroFilterState();
  const sy = createOneEuroFilterState();
  return points.map((p) => ({
    ...p,
    x: oneEuroFilter1D(sx, p.x, p.timestamp, minCutoff),
    y: oneEuroFilter1D(sy, p.y, p.timestamp, minCutoff),
  }));
}

/**
 * Chaikin 코너 커팅 — 폴리라인을 부드러운 곡선으로 변환.
 * iterations 횟수만큼 반복 적용.
 */
export function smoothStrokeChaikin(
  points: readonly AiStrokePoint[],
  iterations = 2,
): AiStrokePoint[] {
  if (points.length < 3 || iterations <= 0) return [...points];
  let current: AiStrokePoint[] = [...points];
  for (let iter = 0; iter < iterations; iter += 1) {
    const next: AiStrokePoint[] = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const p = current[i];
      const q = current[i + 1];
      const t = (p.timestamp + q.timestamp) / 2;
      const pressure = (p.pressure + q.pressure) / 2;
      next.push(
        { x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25, pressure, timestamp: t },
        { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75, pressure, timestamp: t },
      );
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/** 대칭 축 */
export type AiSymmetryAxis = "vertical" | "horizontal" | "both" | "none";

/**
 * 대칭 그리기 — 기준점(center) 대비 대칭 위치의 미러 포인트를 생성한다.
 * 원본 포인트는 그대로 두고 미러 포인트를 추가로 반환.
 */
export function mirrorStrokeSymmetric(
  points: readonly AiStrokePoint[],
  axis: AiSymmetryAxis,
  centerX: number,
  centerY: number,
): AiStrokePoint[] {
  if (axis === "none") return [...points];
  const mirrored = points.map((p) => ({
    ...p,
    x: axis === "vertical" || axis === "both" ? 2 * centerX - p.x : p.x,
    y: axis === "horizontal" || axis === "both" ? 2 * centerY - p.y : p.y,
  }));
  return [...points, ...mirrored];
}

/**
 * 선 굵기(압력) 균일화 — 급격한 압력 변화를 완화해 일정한 선을 만든다.
 * intensity 0-1: 1이면 완전 균일(평균 압력), 0이면 원본 유지.
 */
export function normalizeStrokePressure(
  points: readonly AiStrokePoint[],
  intensity: number,
): AiStrokePoint[] {
  if (points.length === 0) return [];
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped === 0) return [...points];
  const avg = points.reduce((sum, p) => sum + p.pressure, 0) / points.length;
  return points.map((p) => ({
    ...p,
    pressure: p.pressure + (avg - p.pressure) * clamped,
  }));
}

/** 스트로크 전체 길이 (px) */
export function strokeLength(points: readonly AiStrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.hypot(dx, dy);
  }
  return total;
}
