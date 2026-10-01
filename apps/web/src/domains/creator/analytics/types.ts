// 창작자 애널리틱스 클라이언트 타입.
// API 계약(apps/api/src/modules/creator-analytics/creator-analytics.dto.ts)의 복사본.
// apps/* 간 application source 직접 import 금지에 따라 스키마를 미러링한다.

export type CreatorAnalyticsPeriod = "7d" | "30d" | "90d";

export const CREATOR_ANALYTICS_PERIODS: readonly CreatorAnalyticsPeriod[] = [
  "7d",
  "30d",
  "90d",
] as const;

/** 직전 회차 대비 조회가 이 비율(%) 이상 줄면 이탈 지점으로 본다. API(`DROP_OFF_THRESHOLD_PCT`)와 같은 값. */
export const CREATOR_ANALYTICS_DROP_OFF_THRESHOLD_PCT = 15;

export type CreatorAnalyticsKpiKey =
  | "views"
  | "likes"
  | "comments"
  | "subscribeConversion";

export interface CreatorAnalyticsKpi {
  key: CreatorAnalyticsKpiKey;
  value: number;
  deltaPct: number;
}

export interface CreatorAnalyticsRetentionPoint {
  episode: number;
  title: string;
  views: number;
  retentionPct: number;
  dropOffPct: number;
  isDropOff: boolean;
}

export interface CreatorAnalyticsTrafficSource {
  source: string;
  labelKo: string;
  labelEn: string;
  visits: number;
  sharePct: number;
}

export interface CreatorAnalyticsEpisode {
  episode: number;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  newSubscribers: number;
}

export interface CreatorAnalyticsSeriesOption {
  id: string;
  title: string;
  episodeCount: number;
}

export interface CreatorAnalyticsResponse {
  seriesId: string;
  period: CreatorAnalyticsPeriod;
  generatedAt: string;
  mock: boolean;
  kpis: CreatorAnalyticsKpi[];
  retention: CreatorAnalyticsRetentionPoint[];
  trafficSources: CreatorAnalyticsTrafficSource[];
  episodes: CreatorAnalyticsEpisode[];
  dropOffEpisodes: number[];
  series: CreatorAnalyticsSeriesOption[];
}
