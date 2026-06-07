import type { Title, WorkType, PlatformId } from "./types";
import { seededRandom } from "./utils";
import { statsAreEstimated } from "./estimate";

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
    formula: "플랫폼 내 인기백분위(지수감쇠) × 도달가중 × 신뢰계수 + 베이즈평점 보정",
  },
  {
    key: "trending",
    label: "급상승",
    desc: "최근 유입이 폭발 중인 작품",
    formula: "(순위상승 + 트렌드지수×0.4 + 인기백분위×0.5 + 베이즈평점 보정) × 신뢰계수",
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
    formula: "베이즈평점(C=4.0, m=800) ×20 + log(평가수)×2",
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
  const ratingAvg = Math.max(0, Math.min(5, t.stats.ratingAvg));
  const ratingCount = Math.max(0, t.stats.ratingCount);
  return (C * M + ratingAvg * ratingCount) / (M + ratingCount);
}

// 플랫폼 도달 가중 — 플랫폼의 실제 트래픽 규모(도달)를 점수에 반영. 교차-플랫폼 다양성은 유지하되,
// 메이저(네이버/카카오)와 군소 플랫폼의 격차를 '결정적으로' 벌려 #1에 초소형 플랫폼이 오지 않게 한다.
// (과거 '네이버 절대조회수 독식' 회귀는 피하려고 백분위 기반은 유지 — reach는 곱셈 계수로만 작동.)
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
  for (const a of t.availability) w = Math.max(w, PLATFORM_REACH_WEIGHT[a.platformId] ?? 0.4);
  return w || 0.4;
}

// 신뢰 계수 — 실수집 데이터(네이버 웹툰 실평점·실순위)는 확신 있게, 합성(추정) 지표는 약하게 감점한다.
// 인기/급상승처럼 '얼마나 많이 본다'를 다투는 축에서, 추정값 작품이 실데이터 작품을 #1에서 밀어내지
// 못하게 하는 결정적 장치. ratingCount(실 표본)이 클수록 추가 가산 → 검증된 대작이 더 확실히 위로.
// 반환 0.78~1.06: 실데이터는 1.0 기준 위, 순수 추정은 0.78~0.84로 '약한 감점'(완전 배제 X → 다양성 유지).
function confidenceFactor(t: Title): number {
  const estimated = statsAreEstimated(t);
  // 실 표본 신뢰 가산: 평가수 로그 스케일. 실데이터에만 의미 있게 적용(추정 평가수엔 소폭만).
  const sampleBoost = Math.min(0.06, Math.log10(Math.max(0, t.stats.ratingCount) + 1) / 130);
  if (estimated) return 0.78 + sampleBoost * 0.4; // 0.78~0.804: 추정은 표본 가산을 거의 안 줌
  return 1.0 + sampleBoost; // 1.0~1.06: 실데이터 + 검증 표본 가산
}

function popularityScore(t: Title): number {
  const s = t.stats;
  // 교차-플랫폼: 플랫폼 내부 정규화 인기 백분위(0~100)에 지수감쇠를 줘 각 플랫폼의 '최상위'만 크게
  // 부각시킨다. 그래야 작품 수가 많은 네이버의 상위 1% 무더기에 묻히지 않고 카카오/레진 등의 상위작도
  // 상위 구간에 정당히 섞인다(교차-플랫폼 다양성). 단, 도달가중×신뢰계수를 곱해 #1에는 메이저 실데이터가
  // 오게 한다 — 군소 플랫폼의 추정 1위(pct≈100)는 reach·confidence 곱으로 분명히 뒤로 밀린다.
  const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
  const popComp = 100 * Math.exp((pct - 100) / 2.5) * reachWeight(t) * confidenceFactor(t);
  const ratingComp = Math.max(0, bayesRating(t) - 3.2) * 5;
  return popComp + ratingComp;
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
    case "trending": {
      // 급상승은 '신뢰 가능한 신호'로만 — 실순위 상승(rankDelta)·플랫폼 내 인기백분위·베이즈평점.
      // 합성 trendingScore와 raw log(views)는 추정 작품을 부당히 끌어올리므로 비중을 낮추고(0.4),
      // 전체를 신뢰계수로 감쇠해 순수 추정 작품의 급상승 폭을 억제한다. seededRandom 변주는 rankBy의
      // periodFactor가 작게(±)만 준다 → 결정적(static) 유지.
      const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
      const movement = Math.max(0, s.rankDelta) * 4; // 실 주간순위 상승 = 가장 믿을 만한 급상승 신호
      const momentum = Math.max(0, Math.min(100, s.trendingScore)) * 0.4; // 합성 트렌드는 비중 축소
      const reachPct = pct * 0.5 * reachWeight(t); // 인기 상위 + 도달가중 → 군소 추정작 #1 방지
      const ratingComp = Math.max(0, bayesRating(t) - 3.2) * 4;
      return (movement + momentum + reachPct + ratingComp) * confidenceFactor(t);
    }
    case "rating":
      return bayesRating(t) * 20 + Math.log10(Math.max(0, s.ratingCount) + 1) * 2;
    case "favorites":
      return Math.log10(Math.max(0, s.bookmarks) + 1) * 14 + Math.log10(Math.max(0, s.likes) + 1) * 4 + bayesRating(t) * 6;
    case "hidden":
      return bayesRating(t) * 22 - Math.log10(Math.max(0, s.views) + 1) * 3.5 + Math.log10(Math.max(0, s.ratingCount) + 1) * 2;
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

// "왜 이 순위인가" — 각 축의 점수에 기여한 핵심 요인을 사람이 읽을 수 있게 분해한다.
// rawScore 와 같은 신호를 사용(단일 출처). UI(랭킹 행 펼침)·투명성 공개에 쓴다.
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
  const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
  switch (axis) {
    case "popular":
      return [
        { label: "플랫폼 내 인기 백분위", value: `${pct}%` },
        { label: "플랫폼 도달 가중", value: `×${reach}` },
        { label: "데이터 신뢰", value: confLabel },
        { label: "베이즈 평점", value: `${bayes} (평가 ${n(s.ratingCount)})` },
      ];
    case "trending":
      return [
        { label: "실 순위 상승", value: s.rankDelta > 0 ? `+${s.rankDelta}` : "변동 없음" },
        { label: "트렌드 지수", value: `${Math.round(s.trendingScore)}` },
        { label: "인기 백분위", value: `${pct}%` },
        { label: "데이터 신뢰", value: confLabel },
        { label: "베이즈 평점", value: bayes },
      ];
    case "rating":
      return [
        { label: "베이즈 평점", value: bayes },
        { label: "평가 수", value: n(s.ratingCount) },
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
  delta: number; // 표시용 순위 변동
  evidence?: {
    source: "formula" | "live";
    liveMatched?: boolean;
    liveRank?: number;
    livePlatform?: string;
    liveBoost?: number;
  };
}

// 랭킹 후보 풀 필터(축/유형/장르/플랫폼). rankBy와 총개수 계산이 공유한다.
function rankablePool(
  all: Title[],
  axis: RankAxis,
  opts: { type?: WorkType | "all"; genre?: string | "all"; platform?: PlatformId | "all" }
): Title[] {
  const { type = "all", genre = "all", platform = "all" } = opts;
  let pool = all;
  if (type !== "all") pool = pool.filter((t) => t.type === type);
  if (genre !== "all") pool = pool.filter((t) => t.genres.includes(genre));
  if (platform !== "all") pool = pool.filter((t) => t.availability.some((a) => a.platformId === platform));
  if (axis === "completed") pool = pool.filter((t) => t.status === "completed");
  if (axis === "rookie")
    pool = pool.filter((t) => t.releaseYear >= 2022 && t.releaseYear <= new Date().getFullYear() + 1);
  if (axis === "hidden") pool = pool.filter((t) => t.stats.ratingCount >= 300);
  return pool;
}

// 후보 풀 크기(limit 적용 전 실제 매칭 개수) — meta.total 정확도용.
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

  // popular 축은 실순위(popularityRank)를 그대로 반영해야 하므로 기간 변주(곱셈 wobble)를 끈다
  // — wobble은 인접 순위를 뒤섞어 실제 플랫폼 순서를 깨뜨린다. 나머지 축은 기존대로 변주 적용.
  const scored = pool
    .map((t) => ({ t, raw: rawScore(t, axis) * (axis === "popular" ? 1 : periodFactor(t, axis, period)) }))
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
