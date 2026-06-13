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
  return RANK_AXES.find((a) => a.key === key) ?? RANK_AXES[0];
}

export const PERIODS: { key: RankPeriod; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
  { key: "all", label: "전체" },
];

// ── 기간별 신호 블렌딩 ──
// 과거에는 기간 탭마다 seededRandom 곱셈 변주(wobble)로 '다른 순위 느낌'만 만들었다. 이제는
// 실제 신호를 기간별 가중치로 블렌딩한다 — 같은 입력이면 항상 같은 출력(결정적)이고, 기간 간
// 순위 차이는 전부 데이터(순위변동·트렌드·누적 조회/관심/평점)의 차이로 설명된다.
//   daily   : 단기 모멘텀(실 순위변동 rankDelta + 트렌드지수) 비중↑
//   weekly  : 균형(기본 블렌드) — delta 추정의 기준 기간
//   monthly : 누적 신호(조회·관심·베이즈평점) 비중↑
//   all     : 모멘텀 제외, 누적+평점 위주
// 최종점수 = 축점수 × (1 + momentum가중 × 모멘텀정규화 + cumulative가중 × 누적정규화) + ε(id)
export const PERIOD_BLEND: Record<RankPeriod, { momentum: number; cumulative: number }> = {
  daily: { momentum: 0.45, cumulative: 0.05 },
  weekly: { momentum: 0.18, cumulative: 0.12 },
  monthly: { momentum: 0.06, cumulative: 0.3 },
  all: { momentum: 0, cumulative: 0.35 },
};

// ── 베이즈 평균 평점 사전값 (적은 표본 보정) ──
// 사전평균 C·사전표본 m을 하드코딩하지 않고 호출 시점 카탈로그 분포에서 유도한다.
//   C = 풀의 평가수 가중 평균 평점 (추정 표본은 25%만 가중 — 합성 평점이 사전평균을 끌고 가지 않게)
//   m = 평가 보유작 ratingCount 중앙값 (그 표본 규모를 넘겨야 자기 평점이 사전평균을 이긴다)
// 안전 클램프: C∈[3.2, 4.6], m∈[50, 5000]. 평가 보유작이 8편 미만인 풀(소형 필터·테스트)은
// 분포 유도가 무의미하므로 기본값(4.0/800)으로 폴백한다.
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
  for (const t of pool) {
    const count = t.stats.ratingCount;
    const avg = t.stats.ratingAvg;
    if (!(count > 0) || !(avg > 0)) continue;
    const w = statsAreEstimated(t) ? count * PRIOR_ESTIMATED_WEIGHT : count;
    weightSum += w;
    ratingSum += w * Math.min(5, avg);
    counts.push(count);
  }
  if (counts.length < PRIOR_MIN_RATED || weightSum <= 0) return DEFAULT_BAYES_PRIOR;
  counts.sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  return {
    c: Math.min(4.6, Math.max(3.2, ratingSum / weightSum)),
    m: Math.min(5000, Math.max(50, Math.round(median))),
  };
}

// rankBy 호출 풀 단위 1회 계산 + WeakMap 캐시(동일 카탈로그 배열 재호출 시 재계산 방지).
// explainScore는 공개 시그니처(t, axis)라 풀을 받지 못하므로, 마지막 rankBy가 유도한 사전값을
// 표시에 사용한다(랭킹 화면 행은 항상 rankBy 결과에서 펼친다). rankBy 호출 전엔 기본값.
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

// 멀티플랫폼 유통(검증된 IP) 보너스 — 2곳 이상에 유통되는 작품은 시장이 검증한 IP일 확률이 높아
// 소폭 가산한다(추가 플랫폼당 +2%, 최대 +6%). 도달가중은 여전히 '최댓값 플랫폼' 기준을 유지한다 —
// 군소 플랫폼 여러 곳을 합산해도 메이저 1곳의 도달을 넘어서지 못하게(합산 도달 왜곡 방지).
function multiPlatformBonus(t: Title): number {
  const distinct = new Set(t.availability.map((a) => a.platformId)).size;
  return 1 + 0.02 * Math.min(3, Math.max(0, distinct - 1));
}

// 연재 신선도 — popular/trending 한정. '지금 보는 인기'를 다투는 축에서 휴재·완결작이 과거 누적
// 신호만으로 상위를 부당 점유하지 않도록, 연재 활동 메타데이터(status·updateDays)로 결정적 가중을 준다.
//   연재중 + 연재요일 보유  ×1.05 (갱신 주기가 확인되는 작품)
//   연재중(요일 미상)       ×1.00
//   휴재                    popular ×0.93 · trending ×0.85
//   완결                    popular ×0.95 · trending ×0.80 — 제외 대신 감쇠(명작 완결의 꼬리 수요 인정)
function freshnessFactor(t: Title, axis: RankAxis): number {
  if (axis !== "popular" && axis !== "trending") return 1;
  if (t.status === "ongoing") return t.updateDays && t.updateDays.length > 0 ? 1.05 : 1.0;
  if (t.status === "hiatus") return axis === "trending" ? 0.85 : 0.93;
  return axis === "trending" ? 0.8 : 0.95;
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

function popularityScore(t: Title, prior: BayesPrior): number {
  const s = t.stats;
  // 교차-플랫폼: 플랫폼 내부 정규화 인기 백분위(0~100)에 지수감쇠를 줘 각 플랫폼의 '최상위'만 크게
  // 부각시킨다. 그래야 작품 수가 많은 네이버의 상위 1% 무더기에 묻히지 않고 카카오/레진 등의 상위작도
  // 상위 구간에 정당히 섞인다(교차-플랫폼 다양성). 단, 도달가중×신뢰계수를 곱해 #1에는 메이저 실데이터가
  // 오게 한다 — 군소 플랫폼의 추정 1위(pct≈100)는 reach·confidence 곱으로 분명히 뒤로 밀린다.
  // 멀티플랫폼 보너스(검증된 IP)는 곱셈 소폭 가산, 연재 신선도는 휴재·완결의 상위 점유를 막는다.
  const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
  const popComp =
    100 * Math.exp((pct - 100) / 2.5) * reachWeight(t) * confidenceFactor(t) * multiPlatformBonus(t);
  const ratingComp = Math.max(0, bayesRating(t, prior) - 3.2) * 5;
  return (popComp + ratingComp) * freshnessFactor(t, "popular");
}

// 단기 모멘텀 정규화(≈ −0.64 ~ 1.06) — 실 주간순위 상승(rankDelta)·트렌드지수의 블렌드.
// 신뢰계수를 곱해 합성(추정) 모멘텀이 실데이터 모멘텀과 같은 힘을 갖지 못하게 한다.
// 음수(순위 하락)도 그대로 반영 — 일간 탭에서 떨어지는 작품은 실제로 내려간다.
function momentumNorm(t: Title): number {
  const s = t.stats;
  const deltaPart = Math.max(-15, Math.min(15, s.rankDelta)) / 15;
  const trendPart = Math.max(0, Math.min(100, s.trendingScore)) / 100;
  return (deltaPart * 0.6 + trendPart * 0.4) * confidenceFactor(t);
}

// 누적 신호 정규화(0~1) — 조회·관심 로그 스케일 + 베이즈평점. hidden 축은 '낮은 조회 역가중'
// 철학과 모순되지 않도록 조회·관심 대신 평점·평가수만 누적 신호로 사용한다.
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
      // 급상승은 '신뢰 가능한 신호'로만 — 실순위 상승(rankDelta)·플랫폼 내 인기백분위·베이즈평점.
      // 합성 trendingScore와 raw log(views)는 추정 작품을 부당히 끌어올리므로 비중을 낮추고(0.4),
      // 전체를 신뢰계수로 감쇠해 순수 추정 작품의 급상승 폭을 억제한다. 완결·휴재작은 신선도 계수로
      // 추가 감쇠(완결작이 '급상승' 상위를 점유하지 않게). 기간 차이는 rankBy의 신호 블렌딩이 담당.
      const pct = typeof s.popularityPercentile === "number" ? s.popularityPercentile : 0;
      const movement = Math.max(0, s.rankDelta) * 4; // 실 주간순위 상승 = 가장 믿을 만한 급상승 신호
      const momentum = Math.max(0, Math.min(100, s.trendingScore)) * 0.4; // 합성 트렌드는 비중 축소
      const reachPct = pct * 0.5 * reachWeight(t) * multiPlatformBonus(t); // 인기 상위 + 도달가중 → 군소 추정작 #1 방지
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

// 동점 타이브레이크 — id의 FNV-1a 해시로 만드는 극소 epsilon(< 1e-6). 점수가 완전히 같은 작품의
// 순서를 정렬 안정성·입력 순서와 무관하게 결정적으로 고정한다. 점수 차이가 1e-6을 넘는 경우에는
// 어떤 영향도 없다(무작위 변주가 아니라 순수 타이브레이크 — docs/ranking-architecture.md 참고).
function idEpsilon(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 9973) / 9973e6;
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
  const fresh = freshnessFactor(t, axis);
  const freshLabel =
    t.status === "ongoing"
      ? t.updateDays && t.updateDays.length > 0
        ? `연재중(요일 확인) ×${fresh.toFixed(2)}`
        : `연재중 ×${fresh.toFixed(2)}`
      : t.status === "hiatus"
        ? `휴재 ×${fresh.toFixed(2)}`
        : `완결 ×${fresh.toFixed(2)}`;
  const platformCount = new Set(t.availability.map((a) => a.platformId)).size;
  const multiLabel = `${platformCount}개 플랫폼 ×${multiPlatformBonus(t).toFixed(2)}`;
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
  // 표시용 순위 변동 — popular/trending은 실데이터 rankDelta 그대로, 그 외 축은 '기간 가중 차이
  // 기반 결정적 추정'(±5 클램프, weekly는 기준 기간이라 0). seededRandom 가짜 delta는 폐기.
  delta: number;
  // delta가 실데이터가 아니라 산식 추정일 때 true — UI가 추정 변동을 과장 노출하지 않기 위한 표식.
  deltaEstimated?: boolean;
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
  // 베이즈 사전값(C·m)은 호출 카탈로그 분포에서 1회 유도(캐시) — 필터별 소풀이 아니라 호출 풀 기준.
  const prior = bayesPriorFor(all);
  const blend = PERIOD_BLEND[period];
  const baseBlend = PERIOD_BLEND.weekly;

  // 기간 점수 = 축점수 × (1 + 기간별 모멘텀/누적 가중) + id 타이브레이크 epsilon.
  // baseScore(주간 기준 블렌드)는 비모멘텀 축의 delta 추정(기간 가중 차이)에만 쓴다.
  const scored = pool.map((t) => {
    const raw = rawScore(t, axis, prior);
    const momentum = momentumNorm(t);
    const cumulative = cumulativeNorm(t, axis, prior);
    const eps = idEpsilon(t.id);
    return {
      t,
      score: raw * (1 + blend.momentum * momentum + blend.cumulative * cumulative) + eps,
      baseScore: raw * (1 + baseBlend.momentum * momentum + baseBlend.cumulative * cumulative) + eps,
    };
  });

  const ordered = [...scored].sort((a, b) => b.score - a.score);

  // delta 정직화 — popular/trending은 실데이터 rankDelta. 그 외 축은 주간(기준 블렌드) 순위 대비
  // 현재 기간 순위의 차이를 ±5로 클램프한 결정적 추정만 노출하고 deltaEstimated로 표식한다.
  const momentumAxis = axis === "popular" || axis === "trending";
  let baseRankById: Map<string, number> | null = null;
  if (!momentumAxis && period !== "weekly") {
    baseRankById = new Map(
      [...scored].sort((a, b) => b.baseScore - a.baseScore).map((x, i) => [x.t.id, i + 1])
    );
  }

  const out = ordered.map((x, i) => {
    const rank = i + 1;
    if (momentumAxis) {
      return { title: x.t, rank, score: x.score, delta: x.t.stats.rankDelta };
    }
    if (!baseRankById) {
      // weekly = 기준 기간 → 변동 주장 없음(0). 가짜 delta를 만들지 않는다.
      return { title: x.t, rank, score: x.score, delta: 0 };
    }
    const estimated = Math.max(-5, Math.min(5, (baseRankById.get(x.t.id) ?? rank) - rank));
    const entry: RankedTitle = { title: x.t, rank, score: x.score, delta: estimated };
    if (estimated !== 0) entry.deltaEstimated = true;
    return entry;
  });

  return limit ? out.slice(0, limit) : out;
}

// 랭킹 허브(/ranking) 구조화 데이터 — 서버 순위 상위권을 schema.org ItemList(JSON-LD)로 변환.
// 자체 산식 점수·추정 지표는 스키마에 넣지 않는다(외부 평점처럼 보이면 안 됨 — 데이터 정직성.
// aggregateRating은 실제 사용자 평점이 있는 작품 상세의 봇 주입(api/og.js)에만 존재).
// index.html의 WebSite/Organization @graph와 충돌하지 않도록 @id 없는 독립 객체로 만든다.
const SITE_BASE = "https://toonspectrum.vercel.app"; // 정규 호스트 — scripts/build-static-catalog.ts 사이트맵과 동일 기준
const RANKING_ITEMLIST_TOP = 20; // 상위 20개만 — 리스트 전체(200)를 넣으면 신호 희석 + 페이로드 낭비

export function rankingItemListJsonLd(items: RankedTitle[], axisLabel: string) {
  if (items.length === 0) return null;
  const top = items.slice(0, RANKING_ITEMLIST_TOP);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `툰스펙트럼 통합 랭킹 · ${axisLabel}`,
    numberOfItems: top.length,
    itemListElement: top.map((r) => ({
      "@type": "ListItem",
      position: r.rank,
      name: r.title.title,
      url: `${SITE_BASE}/title/${encodeURIComponent(r.title.slug)}`,
    })),
  };
}
