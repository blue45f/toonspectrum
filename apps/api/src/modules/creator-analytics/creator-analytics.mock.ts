// 창작자 애널리틱스 목 데이터 생성기.
// PUBLISH T3: 실제 집계 파이프라인이 붙기 전까지 대시보드 개발·데모용으로 사용한다.
// 결정적 시드(mulberry32) 기반이라 기간·시리즈가 같으면 항상 같은 응답을 돌려준다.

import type {
  CreatorAnalyticsEpisode,
  CreatorAnalyticsKpi,
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
  CreatorAnalyticsSeriesOption,
  CreatorAnalyticsTrafficSource,
} from "./creator-analytics.dto";
import {
  computeDeltaPct,
  computeRetentionPoints,
  detectDropOffEpisodes,
  normalizeShares,
} from "./creator-analytics.math";

/** 결정적 난수 생성기. 목 데이터 스냅샷 안정성을 위해 사용. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERIES: CreatorAnalyticsSeriesOption[] = [
  { id: "series-midnight-diner", title: "심야식당 괴담", episodeCount: 12 },
  { id: "series-starfall", title: "별이 떨어지는 밤", episodeCount: 8 },
];

const TRAFFIC_SOURCE_DEFS = [
  { source: "home", labelKo: "홈 추천", labelEn: "Home recommendations", weight: 34 },
  { source: "ranking", labelKo: "랭킹", labelEn: "Rankings", weight: 22 },
  { source: "search", labelKo: "검색", labelEn: "Search", weight: 16 },
  { source: "subscriptions", labelKo: "구독함", labelEn: "Subscriptions", weight: 14 },
  { source: "external", labelKo: "외부 유입", labelEn: "External", weight: 9 },
  { source: "community", labelKo: "커뮤니티", labelEn: "Community", weight: 5 },
] as const;

const PERIOD_DAYS: Record<CreatorAnalyticsPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const PERIOD_SEED: Record<CreatorAnalyticsPeriod, number> = {
  "7d": 1107,
  "30d": 1130,
  "90d": 1190,
};

/**
 * 회차별 기본 조회수 곡선.
 * 1화 대비 완만한 감소 + 7화에서 급락(이탈 지점 시연) + 이후 회복세를 그린다.
 */
function episodeBaseViews(episode: number, rand: () => number): number {
  const base = 42000 * Math.exp(-0.055 * (episode - 1));
  const cliff = episode === 7 ? 0.62 : 1;
  const rebound = episode > 7 ? 1 + 0.04 * (episode - 7) : 1;
  const noise = 0.94 + rand() * 0.12;
  return Math.round(base * cliff * rebound * noise);
}

function buildEpisodes(
  seriesId: string,
  period: CreatorAnalyticsPeriod,
  rand: () => number,
): CreatorAnalyticsEpisode[] {
  const option = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
  const days = PERIOD_DAYS[period];
  const scale = days / 30;
  const episodes: CreatorAnalyticsEpisode[] = [];
  for (let episode = 1; episode <= option.episodeCount; episode += 1) {
    const views = Math.max(120, Math.round(episodeBaseViews(episode, rand) * scale));
    const likes = Math.round(views * (0.055 + rand() * 0.02));
    const comments = Math.round(views * (0.006 + rand() * 0.004));
    const newSubscribers = Math.round(views * (0.004 + rand() * 0.003));
    const publishedAt = new Date(Date.now() - (option.episodeCount - episode) * 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    episodes.push({
      episode,
      title: `${episode}화`,
      publishedAt,
      views,
      likes,
      comments,
      newSubscribers,
    });
  }
  return episodes;
}

function buildKpis(
  episodes: readonly CreatorAnalyticsEpisode[],
  rand: () => number,
): CreatorAnalyticsKpi[] {
  const sum = (pick: (episode: CreatorAnalyticsEpisode) => number) =>
    episodes.reduce((total, episode) => total + pick(episode), 0);
  const views = sum((episode) => episode.views);
  const likes = sum((episode) => episode.likes);
  const comments = sum((episode) => episode.comments);
  const newSubscribers = sum((episode) => episode.newSubscribers);
  const subscribeConversion = views > 0 ? (newSubscribers / views) * 100 : 0;
  // 직전 기간은 현재의 0.82~1.08 배로 시뮬레이션(결정적).
  const previousFactor = () => 0.82 + rand() * 0.26;
  const withDelta = (value: number) => {
    const previous = value * previousFactor();
    return { value: Math.round(value), deltaPct: computeDeltaPct(value, previous) };
  };
  const conversion = withDelta(Math.round(subscribeConversion * 10) / 10);
  return [
    { key: "views", ...withDelta(views) },
    { key: "likes", ...withDelta(likes) },
    { key: "comments", ...withDelta(comments) },
    {
      key: "subscribeConversion",
      value: conversion.value,
      deltaPct: conversion.deltaPct,
    },
  ];
}

function buildTrafficSources(
  totalViews: number,
  rand: () => number,
): CreatorAnalyticsTrafficSource[] {
  const jittered = TRAFFIC_SOURCE_DEFS.map((def) => def.weight * (0.9 + rand() * 0.2));
  const shares = normalizeShares(jittered);
  return TRAFFIC_SOURCE_DEFS.map((def, index) => ({
    source: def.source,
    labelKo: def.labelKo,
    labelEn: def.labelEn,
    visits: Math.round((totalViews * shares[index]) / 100),
    sharePct: shares[index],
  }));
}

/** 목 애널리틱스 응답 생성. period·seriesId 가 같으면 항상 동일하다. */
export function buildMockCreatorAnalytics(
  period: CreatorAnalyticsPeriod,
  seriesId?: string,
): CreatorAnalyticsResponse {
  const resolvedSeriesId = SERIES.some((item) => item.id === seriesId)
    ? (seriesId as string)
    : SERIES[0].id;
  const rand = mulberry32(PERIOD_SEED[period] + resolvedSeriesId.length * 131);
  const episodes = buildEpisodes(resolvedSeriesId, period, rand);
  const retention = computeRetentionPoints(
    episodes.map((episode) => ({
      episode: episode.episode,
      title: episode.title,
      views: episode.views,
    })),
  );
  const kpis = buildKpis(episodes, rand);
  const totalViews = episodes.reduce((sum, episode) => sum + episode.views, 0);
  return {
    seriesId: resolvedSeriesId,
    period,
    generatedAt: new Date().toISOString(),
    mock: true,
    kpis,
    retention,
    trafficSources: buildTrafficSources(totalViews, rand),
    episodes,
    dropOffEpisodes: detectDropOffEpisodes(retention),
    series: SERIES,
  };
}

export const MOCK_SERIES_OPTIONS: readonly CreatorAnalyticsSeriesOption[] = SERIES;
