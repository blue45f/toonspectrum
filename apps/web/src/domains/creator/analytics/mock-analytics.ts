import type {
  CreatorAnalyticsEpisode,
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
  CreatorAnalyticsRetentionPoint,
} from "./types";

// API(/api/creator/analytics)가 아직 붙지 않았을 때(404) 대시보드가 바로 동작하도록
// 번들에 포함되는 결정적 목 데이터. API 응답 스키마와 동일하다.
// 실제 집계가 붙으면 이 폴백은 404 경로에서만 사용된다.

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERIES = [
  { id: "series-midnight-diner", title: "심야식당 괴담", episodeCount: 12 },
  { id: "series-starfall", title: "별이 떨어지는 밤", episodeCount: 8 },
] as const;

const TRAFFIC = [
  { source: "home", labelKo: "홈 추천", labelEn: "Home recommendations", sharePct: 34 },
  { source: "ranking", labelKo: "랭킹", labelEn: "Rankings", sharePct: 22 },
  { source: "search", labelKo: "검색", labelEn: "Search", sharePct: 16 },
  { source: "subscriptions", labelKo: "구독함", labelEn: "Subscriptions", sharePct: 14 },
  { source: "external", labelKo: "외부 유입", labelEn: "External", sharePct: 9 },
  { source: "community", labelKo: "커뮤니티", labelEn: "Community", sharePct: 5 },
] as const;

const PERIOD_SCALE: Record<CreatorAnalyticsPeriod, number> = {
  "7d": 7 / 30,
  "30d": 1,
  "90d": 3,
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function buildClientMockAnalytics(
  period: CreatorAnalyticsPeriod,
  seriesId?: string,
): CreatorAnalyticsResponse {
  const series = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
  const rand = mulberry32(20260930 + period.length * 77 + series.id.length);
  const scale = PERIOD_SCALE[period];

  const episodes: CreatorAnalyticsEpisode[] = [];
  for (let episode = 1; episode <= series.episodeCount; episode += 1) {
    // 7화 급락(이탈 지점 시연) + 완만한 감소 곡선
    const base = 42000 * Math.exp(-0.055 * (episode - 1));
    const cliff = episode === 7 ? 0.62 : 1;
    const views = Math.max(120, Math.round(base * cliff * scale * (0.94 + rand() * 0.12)));
    episodes.push({
      episode,
      title: `${episode}화`,
      publishedAt: new Date(Date.now() - (series.episodeCount - episode) * 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      views,
      likes: Math.round(views * (0.055 + rand() * 0.02)),
      comments: Math.round(views * (0.006 + rand() * 0.004)),
      newSubscribers: Math.round(views * (0.004 + rand() * 0.003)),
    });
  }

  const firstViews = episodes[0]?.views ?? 0;
  const retention: CreatorAnalyticsRetentionPoint[] = episodes.map((item, index) => {
    const previous = index === 0 ? item.views : episodes[index - 1].views;
    const dropOffPct =
      index === 0 || previous <= 0 ? 0 : ((previous - item.views) / previous) * 100;
    return {
      episode: item.episode,
      title: item.title,
      views: item.views,
      retentionPct: firstViews > 0 ? round1((item.views / firstViews) * 100) : 0,
      dropOffPct: round1(dropOffPct),
      isDropOff: dropOffPct >= 15,
    };
  });

  const sum = (pick: (episode: CreatorAnalyticsEpisode) => number): number =>
    episodes.reduce((total, episode) => total + pick(episode), 0);
  const views = sum((episode) => episode.views);
  const likes = sum((episode) => episode.likes);
  const comments = sum((episode) => episode.comments);
  const newSubscribers = sum((episode) => episode.newSubscribers);
  const conversion = views > 0 ? round1((newSubscribers / views) * 100) : 0;
  const delta = (value: number): number => {
    const previous = value * (0.82 + rand() * 0.26);
    return previous <= 0 ? 0 : round1(((value - previous) / previous) * 100);
  };

  return {
    seriesId: series.id,
    period,
    generatedAt: new Date().toISOString(),
    mock: true,
    kpis: [
      { key: "views", value: views, deltaPct: delta(views) },
      { key: "likes", value: likes, deltaPct: delta(likes) },
      { key: "comments", value: comments, deltaPct: delta(comments) },
      { key: "subscribeConversion", value: conversion, deltaPct: delta(conversion) },
    ],
    retention,
    trafficSources: TRAFFIC.map((item) => ({
      source: item.source,
      labelKo: item.labelKo,
      labelEn: item.labelEn,
      visits: Math.round((views * item.sharePct) / 100),
      sharePct: item.sharePct,
    })),
    episodes,
    dropOffEpisodes: retention.filter((point) => point.isDropOff).map((point) => point.episode),
    series: SERIES.map((item) => ({ ...item })),
  };
}
