// 창작자 애널리틱스 순수 계산 로직(NestJS 의존성 없음).
// 리텐션 곡선·이탈 지점 판정·기간 비교 증감률·유입 경로 정규화를 담당한다.
// PUBLISH T3: "이 회차에서 독자가 떨어졌다"를 바로 보여주는 것이 핵심.

import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsRetentionPoint,
} from "./creator-analytics.dto";
import { CREATOR_ANALYTICS_PERIODS } from "./creator-analytics.dto";

/** 회차별 이탈 지점으로 판정하는 직전 회차 대비 이탈률 임계값(%). */
export const DROP_OFF_THRESHOLD_PCT = 15;

export interface RetentionInput {
  episode: number;
  title: string;
  views: number;
}

/**
 * 회차별 조회수 배열로부터 리텐션 곡선 포인트를 계산한다.
 * - retentionPct: 1화 조회수 대비 잔존율(1화 = 100)
 * - dropOffPct: 직전 회차 대비 이탈률(1화 = 0)
 * - isDropOff: dropOffPct >= DROP_OFF_THRESHOLD_PCT
 */
export function computeRetentionPoints(
  episodes: readonly RetentionInput[],
  thresholdPct: number = DROP_OFF_THRESHOLD_PCT,
): CreatorAnalyticsRetentionPoint[] {
  const firstViews = episodes[0]?.views ?? 0;
  return episodes.map((episode, index) => {
    const previousViews = index === 0 ? episode.views : episodes[index - 1].views;
    const retentionPct =
      firstViews > 0 ? (episode.views / firstViews) * 100 : 0;
    const dropOffPct =
      index === 0 || previousViews <= 0
        ? 0
        : ((previousViews - episode.views) / previousViews) * 100;
    return {
      episode: episode.episode,
      title: episode.title,
      views: episode.views,
      retentionPct: round1(retentionPct),
      dropOffPct: round1(dropOffPct),
      isDropOff: dropOffPct >= thresholdPct,
    };
  });
}

/** 이탈 지점으로 판정된 회차 번호 목록(회차 오름차순). */
export function detectDropOffEpisodes(
  points: readonly CreatorAnalyticsRetentionPoint[],
): number[] {
  return points.filter((point) => point.isDropOff).map((point) => point.episode);
}

/** 가장 큰 이탈이 발생한 회차 포인트. 동률이면 앞 회차 우선. */
export function findWorstDropOff(
  points: readonly CreatorAnalyticsRetentionPoint[],
): CreatorAnalyticsRetentionPoint | null {
  let worst: CreatorAnalyticsRetentionPoint | null = null;
  for (const point of points) {
    if (point.episode <= 1) continue;
    if (worst == null || point.dropOffPct > worst.dropOffPct) worst = point;
  }
  return worst;
}

/**
 * 직전 동일 기간 대비 증감률(%).
 * previous 가 0 이하면 current 가 0 일 때 0, 양수일 때 100 으로 정의한다.
 */
export function computeDeltaPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return round1(((current - previous) / previous) * 100);
}

/**
 * 유입 경로 비중(%) 정규화. 합이 정확히 100 이 되도록 최대 나머지법으로 보정한다.
 */
export function normalizeShares(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * 100);
  const floored = raw.map((value) => Math.floor(value * 10) / 10);
  let remainder = Math.round((100 - floored.reduce((a, b) => a + b, 0)) * 10);
  const order = raw
    .map((value, index) => ({ index, frac: value * 10 - Math.floor(value * 10) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const result = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = round1(result[index] + 0.1);
    remainder -= 1;
  }
  return result;
}

/** `period` 쿼리 파라미터 파싱. 허용값이 아니면 null. */
export function parseAnalyticsPeriod(raw: unknown): CreatorAnalyticsPeriod | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return (CREATOR_ANALYTICS_PERIODS as readonly string[]).includes(normalized)
    ? (normalized as CreatorAnalyticsPeriod)
    : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
