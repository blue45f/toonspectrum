import { TITLES } from "../data";
import { statsAreEstimated } from "../estimate";
import {
  getLiveRanking,
  getLiveStatusSignals,
  type LiveItem,
  type LiveRankingResult,
  type LiveSourceStatus,
  type LiveStatusResult,
  type LiveStatusSignal,
} from "../server/live";
import { PLATFORM_LIST, PLATFORMS, PRICING_LABEL } from "../platforms";
import { GENRES } from "../taxonomy";
import {
  PERIODS,
  RANK_AXES,
  rankBy,
  type RankedTitle,
  type RankAxis,
  type RankPeriod,
} from "../ranking";
import type { PlatformId, Pricing, SerialStatus, Title, WorkType } from "../types";

export const DEFAULT_RANKING_LIMIT = 50;
export const MAX_RANKING_LIMIT = 100;
export const RANKING_REFRESH_SECONDS = 60;

const validAxes = new Set<RankAxis>(RANK_AXES.map((a) => a.key));
const validPeriods = new Set<RankPeriod>(PERIODS.map((p) => p.key));
const validTypes = new Set<WorkType | "all">(["all", "webtoon", "webnovel"]);
const validGenres = new Set<string>(["all", ...GENRES]);
const validPlatforms = new Set<PlatformId | "all">(["all", ...PLATFORM_LIST.map((p) => p.id)]);
const validStatuses = new Set<SerialStatus | "all">(["all", "ongoing", "completed", "hiatus"]);
const validPricing = new Set<Pricing | "all">(["all", "free", "wait-free", "paid", "subscription"]);

interface QueryReader {
  get(name: string): string | null;
}

export interface RankingParams {
  axis: RankAxis;
  period: RankPeriod;
  type: WorkType | "all";
  genre: string;
  platform: PlatformId | "all";
  status: SerialStatus | "all";
  pricing: Pricing | "all";
  minRating: number;
  onlyRising: boolean;
  limit: number;
}

export interface RankingInsights {
  topGenres: { name: string; count: number; share: number }[];
  platformMix: { id: PlatformId; label: string; color: string; count: number; share: number }[];
  scoreSpread: number;
  leader: { title: string; rank: number; score: number } | null;
  rising: { title: string; delta: number; rank: number } | null;
  liveCoverage: number;
}

export interface RankingStatusSignalMeta {
  enabled: boolean;
  fetchedAt: string | null;
  ttlSeconds: number | null;
  timeoutMs: number | null;
  fetched: number;
  matched: number;
  overridden: number;
  sources: string[];
  sourceStatuses: LiveSourceStatus[];
}

export interface RankingReliability {
  confidence: number;
  level: "high" | "medium" | "low";
  label: string;
  fallbackReason: string | null;
  estimatedCount: number;
  estimatedShare: number;
  liveCoverage: number;
  okSources: number;
  sourceCount: number;
  liveTtlSeconds: number | null;
  timeoutMs: number | null;
  basis: string[];
}

export interface RankingResponse {
  items: RankedTitle[];
  meta: RankingParams & {
    pricingLabel: string;
    total: number;
    generatedAt: string;
    refreshSeconds: number;
    live: {
      enabled: boolean;
      day: string | null;
      fetchedAt: string | null;
      ttlSeconds: number | null;
      timeoutMs: number | null;
      fetched: number;
      matched: number;
      sources: string[];
      sourceStatuses: LiveSourceStatus[];
    };
    statusSignals: RankingStatusSignalMeta;
    reliability: RankingReliability;
    source: "live-api" | "formula-api";
  };
  insights: RankingInsights;
}

export type LiveRankingFetcher = (limit?: number) => Promise<LiveRankingResult>;
export type LiveStatusFetcher = (knownKeys?: Set<string>) => Promise<LiveStatusResult>;

function pick<T extends string>(raw: string | null, allowed: Set<T>, fallback: T): T {
  return raw && allowed.has(raw as T) ? (raw as T) : fallback;
}

function pickLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_RANKING_LIMIT;
  return Math.max(1, Math.min(MAX_RANKING_LIMIT, Math.floor(parsed)));
}

function pickRating(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed * 10) / 10));
}

function uniquePlatforms(title: Title): PlatformId[] {
  return [...new Set(title.availability.map((a) => a.platformId))];
}

function liveBoost(item: LiveItem): number {
  const sourceWeight = item.platform === "네이버웹툰" ? 1 : 0.92;
  return Math.max(0, 130 - item.rank * 8) * sourceWeight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRankingParams(q: QueryReader): RankingParams {
  return {
    axis: pick(q.get("axis"), validAxes, "popular"),
    period: pick(q.get("period"), validPeriods, "weekly"),
    type: pick(q.get("type"), validTypes, "all"),
    genre: pick(q.get("genre"), validGenres, "all"),
    platform: pick(q.get("platform"), validPlatforms, "all"),
    status: pick(q.get("status"), validStatuses, "all"),
    pricing: pick(q.get("pricing"), validPricing, "all"),
    minRating: pickRating(q.get("minRating")),
    onlyRising: q.get("rising") === "true",
    limit: pickLimit(q.get("limit")),
  };
}

export function shouldFetchLiveSignals(params: Pick<RankingParams, "axis" | "period" | "type" | "platform">): boolean {
  return (
    (params.axis === "popular" || params.axis === "trending") &&
    (params.period === "daily" || params.period === "weekly") &&
    (params.type === "all" || params.type === "webtoon") &&
    (params.platform === "all" || params.platform === "naver-webtoon" || params.platform === "kakao-webtoon")
  );
}

export function shouldFetchStatusSignals(
  params: Pick<RankingParams, "axis" | "status" | "type" | "platform">
): boolean {
  return (
    (params.type === "all" || params.type === "webtoon") &&
    (params.platform === "all" || params.platform === "naver-webtoon") &&
    (params.status !== "all" || params.axis === "completed" || params.axis === "popular" || params.axis === "trending")
  );
}

export function applyLiveStatusSignals(
  catalog: Title[],
  signals: LiveStatusSignal[]
): { catalog: Title[]; matched: number; overridden: number } {
  if (!signals.length) return { catalog, matched: 0, overridden: 0 };

  const signalById = new Map(signals.map((signal) => [signal.key, signal]));
  let matched = 0;
  let overridden = 0;
  const nextCatalog = catalog.map((title) => {
    const signal = signalById.get(title.id);
    if (!signal) return title;
    matched += 1;
    if (signal.status === title.status) return title;
    overridden += 1;
    return {
      ...title,
      status: signal.status,
      tags: title.tags.includes("실시간상태확인") ? title.tags : [...title.tags, "실시간상태확인"],
    };
  });

  return { catalog: nextCatalog, matched, overridden };
}

export function applyLiveSignals(
  ranked: RankedTitle[],
  liveItems: LiveItem[],
  axis: RankAxis,
  period: RankPeriod
): { items: RankedTitle[]; matched: number } {
  if ((axis !== "popular" && axis !== "trending") || (period !== "daily" && period !== "weekly")) {
    return {
      items: ranked.map((entry) => ({ ...entry, evidence: { source: "formula" } })),
      matched: 0,
    };
  }

  const liveById = new Map(liveItems.map((item) => [item.key, item]));
  let matched = 0;
  const reranked = ranked
    .map((entry) => {
      const live = liveById.get(entry.title.id);
      if (!live) return { entry: { ...entry, evidence: { source: "formula" as const } }, score: entry.score };
      matched += 1;
      const boost = liveBoost(live);
      return {
        entry: {
          ...entry,
          delta: axis === "popular" || axis === "trending" ? Math.max(entry.delta, 12 - live.rank) : entry.delta,
          evidence: {
            source: "live" as const,
            liveMatched: true,
            liveRank: live.rank,
            livePlatform: live.platform,
            liveBoost: Math.round(boost * 10) / 10,
          },
        },
        score: entry.score + boost,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ entry, score }, index) => ({
      ...entry,
      rank: index + 1,
      score,
    }));

  return { items: reranked, matched };
}

export function buildRankingInsights(items: RankedTitle[], liveItems: LiveItem[]): RankingInsights {
  const genreCounts = new Map<string, number>();
  const platformCounts = new Map<PlatformId, number>();
  let scoreMin = Number.POSITIVE_INFINITY;
  let scoreMax = 0;

  for (const item of items) {
    scoreMin = Math.min(scoreMin, item.score);
    scoreMax = Math.max(scoreMax, item.score);
    for (const genre of item.title.genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    for (const platformId of uniquePlatforms(item.title)) {
      platformCounts.set(platformId, (platformCounts.get(platformId) ?? 0) + 1);
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, share: items.length ? Math.round((count / items.length) * 100) : 0 }));

  const platformMix = [...platformCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      id,
      label: PLATFORMS[id].short,
      color: PLATFORMS[id].color,
      count,
      share: items.length ? Math.round((count / items.length) * 100) : 0,
    }));

  const strongestRise = items.reduce<RankedTitle | null>(
    (best, item) => (!best || item.delta > best.delta ? item : best),
    null
  );
  const top = items[0] ?? null;
  const scoreSpread = scoreMin === Number.POSITIVE_INFINITY ? 0 : Math.round((scoreMax - scoreMin) * 10) / 10;

  return {
    topGenres,
    platformMix,
    scoreSpread,
    leader: top
      ? { title: top.title.title, rank: top.rank, score: Math.round(top.score * 10) / 10 }
      : null,
    rising: strongestRise
      ? { title: strongestRise.title.title, delta: strongestRise.delta, rank: strongestRise.rank }
      : null,
    liveCoverage:
      liveItems.length && items.length
        ? Math.round(
            (items.filter((item) => liveItems.some((live) => live.key === item.title.id)).length / items.length) *
              100
          )
        : 0,
  };
}

export function buildRankingReliability({
  items,
  liveItems,
  liveSources,
  shouldFetchLive,
  matched,
  axis,
  period,
  liveTtlSeconds,
  timeoutMs,
  statusSignalMeta,
}: {
  items: RankedTitle[];
  liveItems: LiveItem[];
  liveSources: LiveSourceStatus[];
  shouldFetchLive: boolean;
  matched: number;
  axis: RankAxis;
  period: RankPeriod;
  liveTtlSeconds: number | null;
  timeoutMs: number | null;
  statusSignalMeta: Pick<RankingStatusSignalMeta, "enabled" | "matched" | "overridden">;
}): RankingReliability {
  const estimatedCount = items.filter((item) => statsAreEstimated(item.title)).length;
  const estimatedShare = items.length ? Math.round((estimatedCount / items.length) * 100) : 0;
  const liveCoverage =
    liveItems.length && items.length
      ? Math.round((items.filter((item) => liveItems.some((live) => live.key === item.title.id)).length / items.length) * 100)
      : 0;
  const okSources = liveSources.filter((source) => source.ok).length;
  const sourceCount = liveSources.length;

  let confidence = shouldFetchLive ? 64 : 82;
  if (shouldFetchLive) {
    confidence += okSources * 8;
    confidence += Math.min(12, Math.round(liveCoverage * 0.12));
    if (liveItems.length === 0) confidence -= 24;
    else if (matched === 0) confidence -= 14;
  }
  confidence -= Math.round(estimatedShare * 0.18);
  confidence = clamp(confidence, 18, 96);

  const level = confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low";
  const label = level === "high" ? "신뢰 높음" : level === "medium" ? "주의해서 해석" : "폴백 중심";
  const fallbackReason = !shouldFetchLive
    ? `${axis}/${period} 조합은 공개 실시간 소스 보정 대상이 아니어서 산식만 사용합니다.`
    : liveItems.length === 0
      ? "실시간 소스 응답이 없어 서버 산식으로 즉시 폴백했습니다."
      : matched === 0
        ? "실시간 응답은 있었지만 로컬 작품 DB와 매칭된 항목이 없습니다."
        : null;

  return {
    confidence,
    level,
    label,
    fallbackReason,
    estimatedCount,
    estimatedShare,
    liveCoverage,
    okSources,
    sourceCount,
    liveTtlSeconds,
    timeoutMs,
    basis: [
      `${items.length}개 후보를 요청 시점에 재계산`,
      shouldFetchLive ? `외부 소스 ${okSources}/${sourceCount}개 정상` : "외부 실시간 보정 비대상 축",
      shouldFetchLive ? `라이브 매칭 ${matched}/${liveItems.length}` : "투명 산식 기반 정렬",
      statusSignalMeta.enabled
        ? `연재 상태 확인 ${statusSignalMeta.matched}개, 보정 ${statusSignalMeta.overridden}개`
        : "로컬 연재 상태 기준",
      `추정 핵심 지표 ${estimatedShare}%`,
    ],
  };
}

function filterRankingPool(catalog: Title[], params: RankingParams): Title[] {
  let pool = catalog;
  if (params.status !== "all") pool = pool.filter((title) => title.status === params.status);
  if (params.pricing !== "all") pool = pool.filter((title) => title.availability.some((a) => a.pricing === params.pricing));
  if (params.minRating > 0) pool = pool.filter((title) => title.stats.ratingAvg >= params.minRating);
  return pool;
}

export async function getRankingData(
  q: QueryReader,
  options: {
    catalog?: Title[];
    fetchLive?: LiveRankingFetcher;
    fetchStatus?: LiveStatusFetcher;
    now?: () => Date;
  } = {}
): Promise<RankingResponse> {
  const params = normalizeRankingParams(q);
  const catalog = options.catalog ?? TITLES;
  const fetchLive = options.fetchLive ?? getLiveRanking;
  const fetchStatus = options.fetchStatus ?? getLiveStatusSignals;
  const now = options.now ?? (() => new Date());
  const shouldFetchStatus = shouldFetchStatusSignals(params);
  let statusSignals: LiveStatusSignal[] = [];
  let statusSignalFetchedAt: string | null = null;
  let statusSignalTtlSeconds: number | null = null;
  let statusSignalTimeoutMs: number | null = null;
  let statusSignalSources: LiveSourceStatus[] = [];

  if (shouldFetchStatus) {
    const knownKeys = new Set(
      catalog
        .filter((title) => title.type === "webtoon" && title.id.startsWith("nw-"))
        .map((title) => title.id)
    );
    if (knownKeys.size > 0) {
      const liveStatus = await fetchStatus(knownKeys);
      statusSignals = liveStatus.items;
      statusSignalFetchedAt = liveStatus.fetchedAt;
      statusSignalTtlSeconds = liveStatus.ttlSeconds;
      statusSignalTimeoutMs = liveStatus.timeoutMs;
      statusSignalSources = liveStatus.sources;
    }
  }

  const {
    catalog: statusAdjustedCatalog,
    matched: statusMatched,
    overridden: statusOverridden,
  } = applyLiveStatusSignals(catalog, statusSignals);
  const statusSignalMeta: RankingStatusSignalMeta = {
    enabled: shouldFetchStatus,
    fetchedAt: statusSignalFetchedAt,
    ttlSeconds: statusSignalTtlSeconds,
    timeoutMs: statusSignalTimeoutMs,
    fetched: statusSignals.length,
    matched: statusMatched,
    overridden: statusOverridden,
    sources: statusSignalSources.filter((source) => source.ok).map((source) => source.name),
    sourceStatuses: statusSignalSources,
  };

  const pool = filterRankingPool(statusAdjustedCatalog, params);
  const ranked = rankBy(pool, params.axis, {
    period: params.period,
    type: params.type,
    genre: params.genre,
    platform: params.platform,
    limit: MAX_RANKING_LIMIT,
  });
  const shouldFetchLive = shouldFetchLiveSignals(params);

  let liveItems: LiveItem[] = [];
  let liveDay: string | null = null;
  let liveFetchedAt: string | null = null;
  let liveTtlSeconds: number | null = null;
  let timeoutMs: number | null = null;
  let liveSources: LiveSourceStatus[] = [];
  if (shouldFetchLive) {
    const live = await fetchLive(30);
    liveItems = live.items;
    liveDay = live.day;
    liveFetchedAt = live.fetchedAt;
    liveTtlSeconds = live.ttlSeconds;
    timeoutMs = live.timeoutMs;
    liveSources = live.sources;
  }

  const { items, matched } = applyLiveSignals(ranked, liveItems, params.axis, params.period);
  const filtered = params.onlyRising ? items.filter((item) => item.delta > 0) : items;
  const insights = buildRankingInsights(filtered, liveItems);
  const reliability = buildRankingReliability({
    items: filtered,
    liveItems,
    liveSources,
    shouldFetchLive,
    matched,
    axis: params.axis,
    period: params.period,
    liveTtlSeconds,
    timeoutMs,
    statusSignalMeta,
  });
  const generatedAt = now().toISOString();

  return {
    items: filtered.slice(0, params.limit),
    meta: {
      ...params,
      pricingLabel: params.pricing === "all" ? "전체" : PRICING_LABEL[params.pricing],
      total: filtered.length,
      generatedAt,
      refreshSeconds: RANKING_REFRESH_SECONDS,
      live: {
        enabled: shouldFetchLive,
        day: liveDay,
        fetchedAt: liveFetchedAt,
        ttlSeconds: liveTtlSeconds,
        timeoutMs,
        fetched: liveItems.length,
        matched,
        sources: liveSources.filter((source) => source.ok).map((source) => source.name),
        sourceStatuses: liveSources,
      },
      statusSignals: statusSignalMeta,
      reliability,
      source: shouldFetchLive && liveItems.length > 0 ? "live-api" : "formula-api",
    },
    insights,
  };
}

export async function getRankingHealth(fetchLive: LiveRankingFetcher = getLiveRanking) {
  const startedAt = performance.now();
  const live = await fetchLive(30);
  const okSources = live.sources.filter((source) => source.ok).length;
  const sourceCount = live.sources.length;
  const status = okSources === sourceCount && live.items.length > 0 ? "ok" : okSources > 0 ? "degraded" : "down";

  return {
    status,
    generatedAt: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
    live: {
      day: live.day,
      fetchedAt: live.fetchedAt,
      ttlSeconds: live.ttlSeconds,
      timeoutMs: live.timeoutMs,
      fetched: live.items.length,
      okSources,
      sourceCount,
      sources: live.sources,
    },
  };
}
