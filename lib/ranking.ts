import type { Title, WorkType, PlatformId } from "./types";
import { seededRandom } from "./utils";

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
  emoji: string;
  formula: string; // 투명 산식 — 사용자에게 공개
}

export const RANK_AXES: RankAxisMeta[] = [
  {
    key: "popular",
    label: "실시간 인기",
    desc: "조회·관심·좋아요 종합 화력",
    emoji: "🔥",
    formula: "log(조회수)×12 + log(좋아요)×6 + log(관심)×5 + 트렌드×0.2",
  },
  {
    key: "trending",
    label: "급상승",
    desc: "최근 유입이 폭발 중인 작품",
    emoji: "🚀",
    formula: "트렌드지수 + max(0, 순위상승)×3 + log(조회수)",
  },
  {
    key: "favorites",
    label: "관심 폭발",
    desc: "독자가 가장 많이 찜한 작품",
    emoji: "💗",
    formula: "log(관심)×14 + log(좋아요)×4 + 베이즈평점×6",
  },
  {
    key: "rating",
    label: "평점 명작",
    desc: "독자 평점이 검증한 수작",
    emoji: "⭐",
    formula: "베이즈평점(C=4.0, m=800) ×20 + log(평가수)×2",
  },
  {
    key: "hidden",
    label: "숨은 명작",
    desc: "조회는 적어도 평점이 높은 저평가작",
    emoji: "💎",
    formula: "베이즈평점×22 − log(조회수)×3.5 + log(평가수)×2",
  },
  {
    key: "binge",
    label: "정주행 몰입",
    desc: "한 번 잡으면 못 놓는 작품",
    emoji: "🌀",
    formula: "몰입지수 + 완독률×0.4",
  },
  {
    key: "completed",
    label: "완결 정주행",
    desc: "정주행하기 좋은 완결작",
    emoji: "🏁",
    formula: "완결 보너스 + 베이즈평점×12 + 완독률×0.3 (완결작만)",
  },
  {
    key: "rookie",
    label: "기대 신작",
    desc: "최근 데뷔한 라이징 작품",
    emoji: "🌱",
    formula: "데뷔연차 가중 + 트렌드×0.6 + 베이즈평점×6 (2022~)",
  },
];

export function axisMeta(key: RankAxis): RankAxisMeta {
  return RANK_AXES.find((a) => a.key === key) ?? RANK_AXES[0];
}

export const PERIODS: { key: RankPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
  { key: "all", label: "전체" },
];

// 베이즈 평균 평점 (적은 표본 보정)
const C = 4.0; // 사전 평균
const M = 800; // 사전 가중 표본
function bayesRating(t: Title): number {
  const { ratingAvg, ratingCount } = t.stats;
  return (C * M + ratingAvg * ratingCount) / (M + ratingCount);
}

function popularityScore(t: Title): number {
  const s = t.stats;
  return (
    Math.log10(s.views + 1) * 12 +
    Math.log10(s.likes + 1) * 6 +
    Math.log10(s.bookmarks + 1) * 5 +
    s.trendingScore * 0.2
  );
}

// 기간별 결정적 변주 — 정적 데이터에서 탭마다 다른 순위 느낌을 주기 위함
function periodFactor(t: Title, axis: RankAxis, period: RankPeriod): number {
  if (period === "all") return 1;
  const wobble = seededRandom(`${t.id}:${axis}:${period}`); // 0..1
  const amp = period === "daily" ? 0.5 : period === "weekly" ? 0.3 : 0.15;
  return 1 - amp / 2 + wobble * amp;
}

function rawScore(t: Title, axis: RankAxis): number {
  const s = t.stats;
  switch (axis) {
    case "popular":
      return popularityScore(t);
    case "trending":
      return s.trendingScore * 1.0 + Math.max(0, s.rankDelta) * 3 + Math.log10(s.views + 1);
    case "rating":
      return bayesRating(t) * 20 + Math.log10(s.ratingCount + 1) * 2;
    case "favorites":
      return Math.log10(s.bookmarks + 1) * 14 + Math.log10(s.likes + 1) * 4 + bayesRating(t) * 6;
    case "hidden":
      return bayesRating(t) * 22 - Math.log10(s.views + 1) * 3.5 + Math.log10(s.ratingCount + 1) * 2;
    case "binge":
      return s.bingeIndex * 1.0 + s.completionRate * 0.4;
    case "completed":
      return (t.status === "completed" ? 40 : 0) + bayesRating(t) * 12 + s.completionRate * 0.3;
    case "rookie":
      return (
        Math.max(0, t.releaseYear - 2021) * 18 + s.trendingScore * 0.6 + bayesRating(t) * 6
      );
  }
}

export interface RankedTitle {
  title: Title;
  rank: number;
  score: number;
  delta: number; // 표시용 순위 변동
  evidence?: {
    source: "formula" | "live";
    liveMatched?: boolean;
    liveRank?: number;
    livePlatform?: string;
    liveBoost?: number;
  };
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
  let pool = all;
  if (type !== "all") pool = pool.filter((t) => t.type === type);
  if (genre !== "all") pool = pool.filter((t) => t.genres.includes(genre));
  if (platform !== "all")
    pool = pool.filter((t) => t.availability.some((a) => a.platformId === platform));
  if (axis === "completed") pool = pool.filter((t) => t.status === "completed");
  if (axis === "rookie") pool = pool.filter((t) => t.releaseYear >= 2022);
  // 숨은 명작: 평가가 너무 적은 작품은 제외(신뢰도)
  if (axis === "hidden") pool = pool.filter((t) => t.stats.ratingCount >= 300);

  const scored = pool
    .map((t) => ({ t, raw: rawScore(t, axis) * periodFactor(t, axis, period) }))
    .sort((a, b) => b.raw - a.raw);

  const out = scored.map((x, i) => ({
    title: x.t,
    rank: i + 1,
    score: x.raw,
    // delta: 데이터의 rankDelta + 기간 변주로 결정적 생성
    delta:
      axis === "popular" || axis === "trending"
        ? x.t.stats.rankDelta
        : Math.round((seededRandom(`${x.t.id}:${axis}:${period}:d`) - 0.45) * 12),
  }));

  return limit ? out.slice(0, limit) : out;
}
