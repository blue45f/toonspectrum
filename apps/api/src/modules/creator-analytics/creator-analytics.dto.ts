// 창작자 애널리틱스 API 데이터 계약.
// PUBLISH T3: 목 데이터로 시작하며 실제 집계 파이프라인이 붙으면 동일 스키마를 유지한다.
// 웹 클라이언트는 apps/web/src/domains/creator/analytics/types.ts 에 동일 스키마의
// 복사본을 둔다(apps/* 간 application source 직접 import 금지).

/** 집계 기간. 쿼리 파라미터 `period` 로 받는다. */
export type CreatorAnalyticsPeriod = "7d" | "30d" | "90d";

export const CREATOR_ANALYTICS_PERIODS: readonly CreatorAnalyticsPeriod[] = [
  "7d",
  "30d",
  "90d",
] as const;

export type CreatorAnalyticsKpiKey =
  | "views"
  | "likes"
  | "comments"
  | "subscribeConversion";

export interface CreatorAnalyticsKpi {
  key: CreatorAnalyticsKpiKey;
  /** 기간 내 합계(구독 전환은 %) */
  value: number;
  /** 직전 동일 기간 대비 증감률(%) */
  deltaPct: number;
}

export interface CreatorAnalyticsRetentionPoint {
  /** 1-based 회차 번호 */
  episode: number;
  title: string;
  views: number;
  /** 1화 대비 잔존율(%). 1화는 항상 100 */
  retentionPct: number;
  /** 직전 회차 대비 이탈률(%). 1화는 0 */
  dropOffPct: number;
  /** 이탈 임계값을 넘긴 지점 */
  isDropOff: boolean;
}

export interface CreatorAnalyticsTrafficSource {
  source: string;
  labelKo: string;
  labelEn: string;
  visits: number;
  /** 전체 대비 비중(%) */
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
  /** 목 데이터 표시. 실제 집계로 전환되면 false */
  mock: true;
  kpis: CreatorAnalyticsKpi[];
  retention: CreatorAnalyticsRetentionPoint[];
  trafficSources: CreatorAnalyticsTrafficSource[];
  episodes: CreatorAnalyticsEpisode[];
  /** 이탈 지점으로 판정된 회차 번호 목록(내림차순 정렬 아님, 회차 오름차순) */
  dropOffEpisodes: number[];
  series: CreatorAnalyticsSeriesOption[];
}
