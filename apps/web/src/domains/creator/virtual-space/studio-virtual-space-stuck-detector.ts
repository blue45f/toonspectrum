/**
 * 가상 스튜디오 끼임(stuck) 감지기
 *
 * 입력을 계속 주는데도 캐릭터가 제자리에서 움직이지 않으면
 * 가구 모서리나 벽 틈에 낀 것으로 보고 탈출 방향을 제안한다.
 * 순수 로직 모듈. 렌더 루프에서 매 프레임 샘플을 기록한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 끼임 감지 샘플. */
export interface StudioStuckSample {
  readonly x: number;
  readonly y: number;
  /** 입력 벡터 (정규화 전, 크기 0~1). */
  readonly inputX: number;
  readonly inputY: number;
  /** 축 분리 슬라이딩에서 X축이 막혔는지. */
  readonly blockedX: boolean;
  /** 축 분리 슬라이딩에서 Y축이 막혔는지. */
  readonly blockedY: boolean;
  /** 샘플 시각 (ms). */
  readonly at: number;
}

/** 끼임 감지기 상태 (링 버퍼). */
export interface StudioStuckDetectorState {
  readonly samples: readonly StudioStuckSample[];
}

/** 감지 윈도우 (ms). */
export const STUDIO_STUCK_WINDOW_MS = 500;

/** 감지로 인정하는 최소 샘플 수. */
export const STUDIO_STUCK_MIN_SAMPLES = 6;

/** 끼임으로 보는 최대 이동 거리 (px). */
export const STUDIO_STUCK_MAX_DISPLACEMENT = 6;

/** 끼임으로 보는 최소 평균 입력 크기. */
export const STUDIO_STUCK_MIN_INPUT = 0.25;

/** 최대 보관 샘플 수. */
const MAX_SAMPLES = 48;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 초기 감지기 상태. */
export function createStudioStuckDetectorState(): StudioStuckDetectorState {
  return Object.freeze({ samples: Object.freeze([]) });
}

/** 감지기 초기화 (탈출 후 호출). */
export function resetStudioStuckDetectorState(): StudioStuckDetectorState {
  return createStudioStuckDetectorState();
}

/** 샘플을 기록한다. 오래된 샘플은 버린다. */
export function recordStudioStuckSample(
  state: StudioStuckDetectorState,
  sample: StudioStuckSample,
): StudioStuckDetectorState {
  const cleaned: StudioStuckSample = Object.freeze({
    x: finiteOr(sample.x, 0),
    y: finiteOr(sample.y, 0),
    inputX: finiteOr(sample.inputX, 0),
    inputY: finiteOr(sample.inputY, 0),
    blockedX: Boolean(sample.blockedX),
    blockedY: Boolean(sample.blockedY),
    at: finiteOr(sample.at, 0),
  });
  const cutoff = cleaned.at - STUDIO_STUCK_WINDOW_MS;
  const kept = state.samples.filter((item) => item.at >= cutoff && item.at <= cleaned.at);
  kept.push(cleaned);
  const trimmed = kept.length > MAX_SAMPLES ? kept.slice(kept.length - MAX_SAMPLES) : kept;
  return Object.freeze({ samples: Object.freeze(trimmed) });
}

/** 끼임 분석 결과. */
export interface StudioStuckReport {
  /** 끼임으로 판정됐는지. */
  readonly stuck: boolean;
  /** 탈출 제안 방향 (정규화된 벡터). stuck이 false면 null. */
  readonly escape: StudioVirtualSpacePoint | null;
}

/**
 * 끼임 여부를 분석한다.
 * - 윈도우 안에 충분한 샘플이 있고
 * - 평균 입력이 임계값 이상인데 (플레이어가 움직이려 하고)
 * - 실제 이동 거리가 거의 없고 (제자리)
 * - 절반 이상 샘플에서 축이 막혔으면 → 끼임
 *
 * 탈출 방향은 지배적인 입력 축에 수직인 방향이다.
 * (예: +X로 밀다 막히면 ±Y로 비켜나간다)
 */
export function analyzeStudioStuckDetector(
  state: StudioStuckDetectorState,
  now: number,
): StudioStuckReport {
  const safeNow = finiteOr(now, 0);
  const cutoff = safeNow - STUDIO_STUCK_WINDOW_MS;
  const samples = state.samples.filter((item) => item.at >= cutoff && item.at <= safeNow);
  if (samples.length < STUDIO_STUCK_MIN_SAMPLES) {
    return Object.freeze({ stuck: false, escape: null });
  }
  let inputX = 0;
  let inputY = 0;
  let blockedCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    inputX += sample.inputX;
    inputY += sample.inputY;
    if (sample.blockedX || sample.blockedY) blockedCount += 1;
    minX = Math.min(minX, sample.x);
    maxX = Math.max(maxX, sample.x);
    minY = Math.min(minY, sample.y);
    maxY = Math.max(maxY, sample.y);
  }
  const averageInput = Math.hypot(inputX, inputY) / samples.length;
  const displacement = Math.hypot(maxX - minX, maxY - minY);
  const stuck = averageInput >= STUDIO_STUCK_MIN_INPUT
    && displacement <= STUDIO_STUCK_MAX_DISPLACEMENT
    && blockedCount * 2 >= samples.length;
  if (!stuck) return Object.freeze({ stuck: false, escape: null });

  const averageX = inputX / samples.length;
  const averageY = inputY / samples.length;
  // 지배적인 입력 축에 수직으로 탈출
  const escape = Math.abs(averageX) >= Math.abs(averageY)
    ? { x: 0, y: averageY >= 0 ? 1 : -1 }
    : { x: averageX >= 0 ? 1 : -1, y: 0 };
  return Object.freeze({ stuck: true, escape: Object.freeze(escape) });
}
