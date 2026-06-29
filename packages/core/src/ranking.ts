import { statsAreEstimated } from "./estimate";

import type { Title, WorkType, PlatformId } from "./types";

export type RankAxis =
  | "popular" // 실시간 인기
  | "rating" // 평점 명작
  | "trending" // 급상승
  | "favorites" // 관심 폭발
  | "hidden" // 숨은 명작
  | "completed" // 완결 정주행
  | "binge" // 정주행 몰입
  | "rookie"; // 기대 신작

export type RankPeriod = "daily" | "weekly" | "monthly" | "all";

export interface RankAxisMeta {
  key: RankAxis;
  label: string;
  desc: string;
  formula: string; // 투명 산식 — 사용자에게 공개
}

export const RANK_AXES: RankAxisMeta[] = [
  {
    key: "popular",
    label: "실시간 인기",
    desc: "조회·관심·좋아요 종합 화력",
    formula: "(인기백분위(지수감쇠) × 도달가중 × 신뢰계수 × 멀티플랫폼 + 베이즈 보정) × 연재 신선도",
  },
  {
    key: "trending",
    label: "급상승",
    desc: "최근 유입이 폭발 중인 작품",
    formula: "(순위상승×4 + 트렌드×0.4 + 인기백분위×0.5×도달×멀티플랫폼 + 베이즈 보정) × 신뢰계수 × 연재 신선도",
  },
  {
    key: "favorites",
    label: "관심 폭발",
    desc: "독자가 가장 많이 찜한 작품",
    formula: "log(관심)×14 + log(좋아요)×4 + 베이즈평점×6",
  },
  {
    key: "rating",
    label: "평점 명작",
    desc: "독자 평점이 검증한 수작",
    formula: "베이즈평점(C·m=카탈로그 분포 유도) ×20 + log(평가수)×2",
  },
  {
    key: "hidden",
    label: "숨은 명작",
    desc: "조회는 적어도 평점이 높은 저평가작",
    formula: "베이즈평점×22 − log(조회수)×3.5 + log(평가수)×2",
  },
  {
    key: "binge",
    label: "정주행 몰입",
    desc: "한 번 잡으면 못 놓는 작품",
    formula: "몰입지수 + 완독률×0.4",
  },
  {
    key: "completed",
    label: "완결 정주행",
    desc: "정주행하기 좋은 완결작",
    formula: "완결 보너스 + 베이즈평점×12 + 완독률×0.3 (완결작만)",
  },
  {
    key: "rookie",
    label: "기대 신작",
    desc: "최근 데뷔한 라이징 작품",
    formula: "데뷔연차 가중 + 트렌드×0.6 + 베이즈평점×6 (2022~)",
  },
];

export function axisMeta(key: RankAxis): RankAxisMeta {
  for (let i = 0; i < RANK_AXES.length; i++) {
    if (RANK_AXES[i].key === key) return RANK_AXES[i];
  }
  return RANK_AXES[0];
}

export const PERIODS: { key: RankPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
  { key: "all", label: "전체" },
];

export const PERIOD_BLEND: Record<RankPeriod, { momentum: number; cumulative: number }> = {
  daily: { momentum: 0.45, cumulative: 0.05 },
  weekly: { momentum: 0.18, cumulative: 0.12 },
  monthly: { momentum: 0.06, cumulative: 0.3 },
  all: { momentum: 0, cumulative: 0.35 },
};

export interface BayesPrior {
  c: number; // 사전 평균 평점
  m: number; // 사전 가중 표본
}
export const DEFAULT_BAYES_PRIOR: BayesPrior = { c: 4.0, m: 800 };
const PRIOR_MIN_RATED = 8; // 유도에 필요한 최소 평가 보유 작품 수
const PRIOR_ESTIMATED_WEIGHT = 0.25; // 추정(합성) 표본의 사전평균 기여 가중

export function deriveBayesPrior(pool: Title[]): BayesPrior {
  let weightSum = 0;
  let ratingSum = 0;
  const counts: number[] = [];
  const len = pool.length;

  for (let i = 0; i < len; i++) {
    const t = pool[i];
    const count = t.stats.ratingCount;
    const avg = t.stats.ratingAvg;
    if (!(count > 0) || !(avg > 0)) continue;
    const w = statsAreEstimated(t) ? count * PRIOR_ESTIMATED_WEIGHT : count;
    weightSum += w;
    ratingSum += w * (avg > 5 ? 5 : avg);
    counts.push(count);
  }

  const cLen = counts.length;
  if (cLen < PRIOR_MIN_RATED || weightSum <= 0) return DEFAULT_BAYES_PRIOR;
  counts.sort((a, b) => a - b);
  const median = counts[Math.floor(cLen / 2)];
  return {
    c: Math.min(4.6, Math.max(3.2, ratingSum / weightSum)),
    m: Math.min(5000, Math.max(50, Math.round(median))),
  };
}

const priorCache = new WeakMap<Title[], BayesPrior>();
let activeBayesPrior: BayesPrior = DEFAULT_BAYES_PRIOR;
function bayesPriorFor(pool: Title[]): BayesPrior {
  let prior = priorCache.get(pool);
  if (!prior) {
    prior = deriveBayesPrior(pool);
    priorCache.set(pool, prior);
  }
  activeBayesPrior = prior;
  return prior;
}

function bayesRating(t: Title, prior: BayesPrior = activeBayesPrior): number {
  const ratingAvg = Math.max(0, Math.min(5, t.stats.ratingAvg));
  const ratingCount = Math.max(0, t.stats.ratingCount);
  return (prior.c * prior.m + ratingAvg * ratingCount) / (prior.m + ratingCount);
}

export const PLATFORM_REACH_WEIGHT: Partial<Record<PlatformId, number>> = {
  "naver-webtoon": 1.0,
  "kakao-webtoon": 0.9,
  "naver-series": 0.82,
  "kakao-page": 0.78,
  lezhin: 0.62,
  ridi: 0.55,
  novelpia: 0.5,
  munpia: 0.46,
  joara: 0.46,
  bomtoon: 0.46,
  toptoon: 0.44,
  toomics: 0.44,
  mrblue: 0.4,
  bookcube: 0.38,
  onestory: 0.38,
  kyobo: 0.4,
  yes24: 0.4,
  postype: 0.36,
};
function reachWeight(t: Title): number {
  let w = 0;
  const avail = t.availability;
  const len = avail.length;
  for (let i = 0; i < len; i++) {
    const rw = PLATFORM_REACH_WEIGHT[avail[i].platformId] ?? 0.4;
    if (rw > w) w = rw;
  }
  return w || 0.4;
}

function multiPlatformBonus(t: Title): number {
  const avail = t.availability;
  const len = avail.length;
  if (len <= 1) return 1;

  let distinct = 0;
  for (let i = 0; i < len; i++) {
    let duplicate = false;
    const pid = avail[i].platformId;
    for (let j = 0; j < i; j++) {
      if (avail[j].platformId === pid) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) distinct++;
  }
  return 1 + 0.02 * Math.min(3, Math.max(0, distinct - 1));
}

function freshnessFactor(t: Title, axis: RankAxis): number {
  if (axis !== "popular" && axis !== "trending") return 1;
  if (t.status === "ongoing") return t.updateDays && t.updateDays.length > 0 ? 1.05 : 1.0;
  if (t.status === "hiatus") return axis === "trending" ? 0.85 : 0.93;
  return axis === "trending" ? 0.8 : 0.95;
}

function confidenceFactor(t: Title): number {
  const estimated = statsAreEstimated(t);
  const sampleBoost = Math.min(0.06, Math.log10(Math.max(0, t.stats.ratingCount) + 1) / 130);
  if (estimated) return 0.78 + sampleBoost * 0.4;
  return 1.0 + sampleBoost;
}

function popularityScore(t: Title, prior: BayesPrior): number {
  const s = t.stats;
  const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
  const popComp =
    100 * Math.exp((pct - 100) / 2.5) * reachWeight(t) * confidenceFactor(t) * multiPlatformBonus(t);
  const ratingComp = Math.max(0, bayesRating(t, prior) - 3.2) * 5;
  return (popComp + ratingComp) * freshnessFactor(t, "popular");
}

function momentumNorm(t: Title): number {
  const s = t.stats;
  const deltaPart = Math.max(-15, Math.min(15, s.rankDelta)) / 15;
  const trendPart = Math.max(0, Math.min(100, s.trendingScore)) / 100;
  return (deltaPart * 0.6 + trendPart * 0.4) * confidenceFactor(t);
}

function cumulativeNorm(t: Title, axis: RankAxis, prior: BayesPrior): number {
  const s = t.stats;
  const ratingPart = Math.max(0, Math.min(1, (bayesRating(t, prior) - 3) / 2));
  if (axis === "hidden") {
    const samplePart = Math.min(1, Math.log10(Math.max(0, s.ratingCount) + 1) / 6);
    return ratingPart * 0.7 + samplePart * 0.3;
  }
  const viewsPart = Math.min(1, Math.log10(Math.max(0, s.views) + 1) / 9);
  const bookmarkPart = Math.min(1, Math.log10(Math.max(0, s.bookmarks) + 1) / 7);
  return viewsPart * 0.45 + bookmarkPart * 0.3 + ratingPart * 0.25;
}

function rawScore(t: Title, axis: RankAxis, prior: BayesPrior): number {
  const s = t.stats;
  switch (axis) {
    case "popular":
      return popularityScore(t, prior);
    case "trending": {
      const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
      const movement = Math.max(0, s.rankDelta) * 4;
      const momentum = Math.max(0, Math.min(100, s.trendingScore)) * 0.4;
      const reachPct = pct * 0.5 * reachWeight(t) * multiPlatformBonus(t);
      const ratingComp = Math.max(0, bayesRating(t, prior) - 3.2) * 4;
      return (movement + momentum + reachPct + ratingComp) * confidenceFactor(t) * freshnessFactor(t, "trending");
    }
    case "rating":
      return bayesRating(t, prior) * 20 + Math.log10(Math.max(0, s.ratingCount) + 1) * 2;
    case "favorites":
      return (
        Math.log10(Math.max(0, s.bookmarks) + 1) * 14 +
        Math.log10(Math.max(0, s.likes) + 1) * 4 +
        bayesRating(t, prior) * 6
      );
    case "hidden":
      return (
        bayesRating(t, prior) * 22 -
        Math.log10(Math.max(0, s.views) + 1) * 3.5 +
        Math.log10(Math.max(0, s.ratingCount) + 1) * 2
      );
    case "binge":
      return s.bingeIndex * 1.0 + s.completionRate * 0.4;
    case "completed":
      return (t.status === "completed" ? 40 : 0) + bayesRating(t, prior) * 12 + s.completionRate * 0.3;
    case "rookie":
      return (
        Math.max(0, t.releaseYear - 2021) * 18 + s.trendingScore * 0.6 + bayesRating(t, prior) * 6
      );
  }
}

function idEpsilon(id: string): number {
  let h = 2166136261;
  const len = id.length;
  for (let i = 0; i < len; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 9973) / 9973e6;
}

export interface ScoreFactor {
  label: string;
  value: string;
}
export function explainScore(t: Title, axis: RankAxis): ScoreFactor[] {
  const s = t.stats;
  const bayes = bayesRating(t).toFixed(2);
  const pct = Math.round(typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0);
  const reach = reachWeight(t).toFixed(2);
  const conf = confidenceFactor(t);
  const confLabel = statsAreEstimated(t) ? `추정 ×${conf.toFixed(2)}` : `실데이터 ×${conf.toFixed(2)}`;
  const fresh = freshnessFactor(t, axis);
  const freshLabel =
    t.status === "ongoing"
      ? t.updateDays && t.updateDays.length > 0
        ? `연재중(요일 확인) ×${fresh.toFixed(2)}`
        : `연재중 ×${fresh.toFixed(2)}`
      : t.status === "hiatus"
        ? `휴재 ×${fresh.toFixed(2)}`
        : `완결 ×${fresh.toFixed(2)}`;

  const platformCount = t.availability.length <= 1 ? t.availability.length : multiPlatformBonus(t);
  const multiLabel = `${Math.round((platformCount - 1) / 0.02) + 1}개 플랫폼 ×${multiPlatformBonus(t).toFixed(2)}`;
  const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
  switch (axis) {
    case "popular":
      return [
        { label: "플랫폼 내 인기 백분위", value: `${pct}%` },
        { label: "플랫폼 도달 가중", value: `×${reach}` },
        { label: "데이터 신뢰", value: confLabel },
        { label: "연재 신선도", value: freshLabel },
        { label: "멀티플랫폼 유통", value: multiLabel },
        { label: "베이즈 평점", value: `${bayes} (평가 ${n(s.ratingCount)})` },
      ];
    case "trending":
      return [
        { label: "실 순위 상승", value: s.rankDelta > 0 ? `+${s.rankDelta}` : "변동 없음" },
        { label: "트렌드 지수", value: `${Math.round(s.trendingScore)}` },
        { label: "인기 백분위", value: `${pct}%` },
        { label: "연재 신선도", value: freshLabel },
        { label: "데이터 신뢰", value: confLabel },
        { label: "베이즈 평점", value: bayes },
      ];
    case "rating":
      return [
        { label: "베이즈 평점", value: bayes },
        { label: "평가 수", value: n(s.ratingCount) },
        {
          label: "사전값(카탈로그 유도)",
          value: `C=${activeBayesPrior.c.toFixed(2)} · m=${n(activeBayesPrior.m)}`,
        },
      ];
    case "favorites":
      return [
        { label: "관심(북마크)", value: n(s.bookmarks) },
        { label: "좋아요", value: n(s.likes) },
        { label: "베이즈 평점", value: bayes },
      ];
    case "hidden":
      return [
        { label: "베이즈 평점", value: bayes },
        { label: "낮은 조회수 (역가중)", value: n(s.views) },
        { label: "평가 수", value: n(s.ratingCount) },
      ];
    case "binge":
      return [
        { label: "몰입 지수", value: `${Math.round(s.bingeIndex)}` },
        { label: "완독률", value: `${Math.round(s.completionRate)}%` },
      ];
    case "completed":
      return [
        { label: "완결 여부", value: t.status === "completed" ? "완결 보너스" : "연재중" },
        { label: "베이즈 평점", value: bayes },
        { label: "완독률", value: `${Math.round(s.completionRate)}%` },
      ];
    case "rookie":
      return [
        { label: "데뷔 연차", value: `${t.releaseYear}년` },
        { label: "트렌드 지수", value: `${Math.round(s.trendingScore)}` },
        { label: "베이즈 평점", value: bayes },
      ];
  }
}

export interface RankedTitle {
  title: Title;
  rank: number;
  score: number;
  delta: number;
  deltaEstimated?: boolean;
  evidence?: {
    source: "formula" | "live";
    liveMatched?: boolean;
    liveRank?: number;
    livePlatform?: string;
    liveBoost?: number;
  };
}

function rankablePool(
  all: Title[],
  axis: RankAxis,
  opts: { type?: WorkType | "all"; genre?: string | "all"; platform?: PlatformId | "all" }
): Title[] {
  const { type = "all", genre = "all", platform = "all" } = opts;
  const currentYearPlusOne = new Date().getFullYear() + 1;
  const len = all.length;
  const res: Title[] = [];

  for (let i = 0; i < len; i++) {
    const t = all[i];
    if (type !== "all" && t.type !== type) continue;
    if (genre !== "all" && !t.genres.includes(genre)) continue;
    if (platform !== "all") {
      let hasPlat = false;
      const avail = t.availability;
      const aLen = avail.length;
      for (let j = 0; j < aLen; j++) {
        if (avail[j].platformId === platform) {
          hasPlat = true;
          break;
        }
      }
      if (!hasPlat) continue;
    }
    if (axis === "completed" && t.status !== "completed") continue;
    if (axis === "rookie" && (t.releaseYear < 2022 || t.releaseYear > currentYearPlusOne)) continue;
    if (axis === "hidden" && t.stats.ratingCount < 300) continue;

    res.push(t);
  }
  return res;
}

export function rankablePoolSize(
  all: Title[],
  axis: RankAxis,
  opts: { type?: WorkType | "all"; genre?: string | "all"; platform?: PlatformId | "all" } = {}
): number {
  return rankablePool(all, axis, opts).length;
}

export function rankBy(
  all: Title[],
  axis: RankAxis,
  opts: {
    period?: RankPeriod;
    type?: WorkType | "all";
    genre?: string | "all";
    platform?: PlatformId | "all";
    limit?: number;
  } = {}
): RankedTitle[] {
  const { period = "weekly", type = "all", genre = "all", platform = "all", limit } = opts;
  const pool = rankablePool(all, axis, { type, genre, platform });
  const prior = bayesPriorFor(all);
  const blend = PERIOD_BLEND[period];
  const baseBlend = PERIOD_BLEND.weekly;

  const pLen = pool.length;
  const scored = new Array<{ t: Title; score: number; baseScore: number }>(pLen);

  for (let i = 0; i < pLen; i++) {
    const t = pool[i];
    const raw = rawScore(t, axis, prior);
    const momentum = momentumNorm(t);
    const cumulative = cumulativeNorm(t, axis, prior);
    const eps = idEpsilon(t.id);
    scored[i] = {
      t,
      score: raw * (1 + blend.momentum * momentum + blend.cumulative * cumulative) + eps,
      baseScore: raw * (1 + baseBlend.momentum * momentum + baseBlend.cumulative * cumulative) + eps,
    };
  }

  scored.sort((a, b) => b.score - a.score);

  const momentumAxis = axis === "popular" || axis === "trending";
  let baseRankById: Map<string, number> | null = null;
  if (!momentumAxis && period !== "weekly") {
    const baseOrdered = [...scored].sort((a, b) => b.baseScore - a.baseScore);
    baseRankById = new Map<string, number>();
    for (let i = 0; i < pLen; i++) {
      baseRankById.set(baseOrdered[i].t.id, i + 1);
    }
  }

  const out = new Array<RankedTitle>(pLen);
  for (let i = 0; i < pLen; i++) {
    const x = scored[i];
    const rank = i + 1;
    if (momentumAxis) {
      out[i] = { title: x.t, rank, score: x.score, delta: x.t.stats.rankDelta };
    } else if (!baseRankById) {
      out[i] = { title: x.t, rank, score: x.score, delta: 0 };
    } else {
      const estimated = Math.max(-5, Math.min(5, (baseRankById.get(x.t.id) ?? rank) - rank));
      const entry: RankedTitle = { title: x.t, rank, score: x.score, delta: estimated };
      if (estimated !== 0) entry.deltaEstimated = true;
      out[i] = entry;
    }
  }

  return limit ? out.slice(0, limit) : out;
}

const SITE_BASE = "https://toonspectrum.vercel.app";
const RANKING_ITEMLIST_TOP = 20;

export function rankingItemListJsonLd(items: RankedTitle[], axisLabel: string) {
  if (items.length === 0) return null;
  const topCount = Math.min(items.length, RANKING_ITEMLIST_TOP);
  const elements = new Array(topCount);
  for (let i = 0; i < topCount; i++) {
    const r = items[i];
    elements[i] = {
      "@type": "ListItem",
      position: r.rank,
      name: r.title.title,
      url: `${SITE_BASE}/title/${encodeURIComponent(r.title.slug)}`,
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `툰스펙트럼 통합 랭킹 · ${axisLabel}`,
    numberOfItems: topCount,
    itemListElement: elements,
  };
}
