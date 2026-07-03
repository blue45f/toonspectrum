// 정적 스냅샷 운영 랭킹 — 외부 실시간 소스(네이버/카카오 등)를 호출하지 않는다. 랭킹은 커밋된
// 카탈로그 스냅샷에 대한 투명 산식(rankBy)만으로 계산한다.
//
// 이전에는 lib/server/live.ts 가 런타임에 플랫폼을 직접 페치(리퍼러 포함)해 랭킹을 보정하고 스케줄러로
// 주기 갱신했으나, 크롤/저작권·부정경쟁 리스크와 불필요성(모든 호출자가 disableLive)으로 **폐기**했다.
// 응답 스키마는 프론트(components/ranking-board.tsx) 호환을 위해 유지하되 live 관련 필드는 항상
// 비활성(enabled:false·빈 배열·null)으로 채운다.
import { statsAreEstimated } from "../estimate";
import { PLATFORM_LIST, PLATFORMS, PRICING_LABEL } from "../platforms";
import {
  PERIODS,
  RANK_AXES,
  rankBy,
  rankablePoolSize,
  type RankedTitle,
  type RankAxis,
  type RankPeriod,
} from "../ranking";
import { GENRES } from "../taxonomy";

import { TITLES } from "./catalog-store";

import type { PlatformId, Pricing, SerialStatus, Title, WorkType } from "../types";

export const DEFAULT_RANKING_LIMIT = 200;
export const MAX_RANKING_LIMIT = 200;
const RANKING_CANDIDATE_LIMIT = 1000;
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

// 응답 스키마 호환용 최소 타입 — 실시간 소스 비활성이라 실제로는 항상 빈 배열이다.
interface LiveSourceStatus {
  name: string;
  ok: boolean;
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
  refresh: boolean;
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

export interface LiveRefreshPlan {
  mode: "off" | "fixed" | "adaptive";
  running: boolean;
  nextRefreshAt: string | null;
  nextRefreshInSeconds: number | null;
  lastRefreshAt: string | null;
  consecutiveFailures: number;
  demandSignals: number;
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
      nextRefreshAt: string | null;
      ttlSeconds: number | null;
      timeoutMs: number | null;
      fetched: number;
      matched: number;
      sources: string[];
      sourceStatuses: LiveSourceStatus[];
    };
    statusSignals: RankingStatusSignalMeta;
    reliability: RankingReliability;
    liveRefreshPlan: LiveRefreshPlan | null;
    source: "live-api" | "formula-api";
    // 카탈로그에 실제 존재하는 플랫폼(필터 UI가 빈 플랫폼을 노출하지 않도록).
    availablePlatforms: PlatformId[];
  };
  insights: RankingInsights;
}

function pick<T extends string>(raw: string | null, allowed: Set<T>, fallback: T): T {
  return raw && allowed.has(raw as T) ? (raw as T) : fallback;
}

function pickLimit(raw: string | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_RANKING_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_RANKING_LIMIT;
  return Math.max(1, Math.min(MAX_RANKING_LIMIT, Math.floor(parsed)));
}

function pickRefresh(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

function pickRating(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed * 10) / 10));
}

function uniquePlatforms(title: Title): PlatformId[] {
  return [...new Set(title.availability.map((a) => a.platformId))];
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
    refresh: pickRefresh(q.get("refresh")),
    onlyRising: q.get("rising") === "true",
    limit: pickLimit(q.get("limit")),
  };
}

export function buildRankingInsights(items: RankedTitle[]): RankingInsights {
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
    leader: top ? { title: top.title.title, rank: top.rank, score: Math.round(top.score * 10) / 10 } : null,
    // delta 정직화: 양의 변동이 실제로 있을 때만 '상승' 인사이트를 노출(0·추정 0을 상승으로 과장 금지).
    rising:
      strongestRise && strongestRise.delta > 0
        ? { title: strongestRise.title.title, delta: strongestRise.delta, rank: strongestRise.rank }
        : null,
    // 실시간 소스 비활성 — 라이브 커버리지는 항상 0.
    liveCoverage: 0,
  };
}

export function buildRankingReliability({
  items,
  statusSignalMeta,
}: {
  items: RankedTitle[];
  statusSignalMeta: Pick<RankingStatusSignalMeta, "enabled" | "matched" | "overridden">;
}): RankingReliability {
  const estimatedCount = items.filter((item) => statsAreEstimated(item.title)).length;
  const estimatedShare = items.length ? Math.round((estimatedCount / items.length) * 100) : 0;

  // 실시간 보정 없음 — 스냅샷 산식 기준 신뢰도. 추정 지표 비중만큼 감산.
  let confidence = 82;
  confidence -= Math.round(estimatedShare * 0.18);
  confidence = clamp(confidence, 18, 96);

  const level = confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low";
  const label = level === "high" ? "신뢰 높음" : level === "medium" ? "주의해서 해석" : "폴백 중심";

  return {
    confidence,
    level,
    label,
    fallbackReason: "현재 랭킹 경로는 스냅샷 산식 운영 모드라 외부 실시간 보정을 호출하지 않습니다.",
    estimatedCount,
    estimatedShare,
    liveCoverage: 0,
    okSources: 0,
    sourceCount: 0,
    liveTtlSeconds: null,
    timeoutMs: null,
    basis: [
      `${items.length}개 후보를 요청 시점에 재계산`,
      "스냅샷 산식 운영 모드",
      "투명 산식 기반 정렬",
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
  if (params.pricing !== "all")
    pool = pool.filter((title) => title.availability.some((a) => a.pricing === params.pricing));
  if (params.minRating > 0) pool = pool.filter((title) => title.stats.ratingAvg >= params.minRating);
  return pool;
}

export async function getRankingData(
  q: QueryReader,
  options: { catalog?: Title[]; now?: () => Date } = {}
): Promise<RankingResponse> {
  const params = normalizeRankingParams(q);
  const catalog = options.catalog ?? TITLES;
  const now = options.now ?? (() => new Date());

  // 실시간 소스(연재상태·라이브 랭킹) 비활성 — 스냅샷 산식만. 상태 신호 메타는 비활성 값으로 채운다.
  const statusSignalMeta: RankingStatusSignalMeta = {
    enabled: false,
    fetchedAt: null,
    ttlSeconds: null,
    timeoutMs: null,
    fetched: 0,
    matched: 0,
    overridden: 0,
    sources: [],
    sourceStatuses: [],
  };

  const pool = filterRankingPool(catalog, params);
  const ranked = rankBy(pool, params.axis, {
    period: params.period,
    type: params.type,
    genre: params.genre,
    platform: params.platform,
    limit: RANKING_CANDIDATE_LIMIT,
  });
  const items = ranked.map((entry) => ({ ...entry, evidence: { source: "formula" as const } }));
  const filtered = params.onlyRising ? items.filter((item) => item.delta > 0) : items;
  const insights = buildRankingInsights(filtered);
  const reliability = buildRankingReliability({
    items: filtered,
    statusSignalMeta,
  });
  const generatedAt = now().toISOString();

  return {
    items: filtered.slice(0, params.limit),
    meta: {
      ...params,
      pricingLabel: params.pricing === "all" ? "전체" : PRICING_LABEL[params.pricing],
      // 후보 한도(RANKING_CANDIDATE_LIMIT) 슬라이스 전 실제 매칭 개수 — 1000 캡 오보 방지.
      // onlyRising은 점수 계산 후 delta 필터라 그 경우만 filtered 기준.
      total: params.onlyRising
        ? filtered.length
        : rankablePoolSize(pool, params.axis, {
            type: params.type,
            genre: params.genre,
            platform: params.platform,
          }),
      generatedAt,
      refreshSeconds: RANKING_REFRESH_SECONDS,
      availablePlatforms: [...new Set(catalog.flatMap((title) => title.availability.map((a) => a.platformId)))],
      live: {
        enabled: false,
        day: null,
        fetchedAt: null,
        nextRefreshAt: null,
        ttlSeconds: null,
        timeoutMs: null,
        fetched: 0,
        matched: 0,
        sources: [],
        sourceStatuses: [],
      },
      statusSignals: statusSignalMeta,
      reliability,
      liveRefreshPlan: null,
      source: "formula-api",
    },
    insights,
  };
}
