// 전 페이지 공용 작품 필터 — 클라이언트 적용기 + 서버(explore/search) 파라미터 빌더.
// 페이지마다 노출 facet은 다르지만(예: 캘린더는 웹툰·연재중 고정) 동일한 상태/로직을 공유한다.
import type { AgeRating, PlatformId, Pricing, SerialStatus, Title, WorkType } from "./types";

export interface TitleFilterState {
  types: WorkType[];
  genres: string[];
  status: SerialStatus[];
  platforms: PlatformId[];
  ages: AgeRating[];
  pricing: Pricing[];
  minRating: number; // 0 = 전체
  yearRange: [number, number] | null;
  tags: string[];
  savedOnly: boolean; // 내 찜·서재만
  adaptedOnly: boolean; // 원작/2차창작 연결만
}

export const EMPTY_TITLE_FILTERS: TitleFilterState = {
  types: [],
  genres: [],
  status: [],
  platforms: [],
  ages: [],
  pricing: [],
  minRating: 0,
  yearRange: null,
  tags: [],
  savedOnly: false,
  adaptedOnly: false,
};

export const AGE_OPTIONS: { value: AgeRating; label: string }[] = [
  { value: "all", label: "전체이용가" },
  { value: "12", label: "12세" },
  { value: "15", label: "15세" },
  { value: "19", label: "19세" },
];

export const PRICING_OPTIONS: { value: Pricing; label: string }[] = [
  { value: "free", label: "무료" },
  { value: "wait-free", label: "기다무" },
  { value: "paid", label: "유료" },
  { value: "subscription", label: "구독" },
];

export const STATUS_OPTIONS: { value: SerialStatus; label: string }[] = [
  { value: "ongoing", label: "연재중" },
  { value: "completed", label: "완결" },
  { value: "hiatus", label: "휴재" },
];

export const TYPE_OPTIONS: { value: WorkType; label: string }[] = [
  { value: "webtoon", label: "웹툰" },
  { value: "webnovel", label: "웹소설" },
];

export const MIN_RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "전체" },
  { value: 3, label: "3★+" },
  { value: 4, label: "4★+" },
  { value: 4.5, label: "4.5★+" },
];

// 연도대(연재 시작) — 클라이언트/서버 공용 버킷.
export const YEAR_BUCKETS: { label: string; range: [number, number] }[] = [
  { label: "2022+", range: [2022, 9999] },
  { label: "2018–21", range: [2018, 2021] },
  { label: "2014–17", range: [2014, 2017] },
  { label: "~2013", range: [0, 2013] },
];

function arraysIntersect(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

// 클라이언트 측 필터 적용(캘린더·추천·랭킹·검색 보조 등 이미 받아온 Title[]에 적용).
export function applyTitleFilters(
  titles: Title[],
  state: TitleFilterState,
  savedIds?: Set<string>
): Title[] {
  return titles.filter((t) => {
    if (state.types.length && !state.types.includes(t.type)) return false;
    if (state.genres.length && !arraysIntersect(state.genres, t.genres)) return false;
    if (state.status.length && !state.status.includes(t.status)) return false;
    if (state.ages.length && !state.ages.includes(t.ageRating)) return false;
    if (state.tags.length && !arraysIntersect(state.tags, t.tags)) return false;
    if (state.minRating && (t.stats?.ratingAvg ?? 0) < state.minRating) return false;
    if (state.adaptedOnly && !t.adaptedFrom) return false;
    if (state.yearRange) {
      const y = t.releaseYear ?? 0;
      if (y < state.yearRange[0] || y > state.yearRange[1]) return false;
    }
    if (state.platforms.length && !t.availability.some((a) => state.platforms.includes(a.platformId)))
      return false;
    if (state.pricing.length && !t.availability.some((a) => state.pricing.includes(a.pricing))) return false;
    if (state.savedOnly && savedIds && !savedIds.has(t.id)) return false;
    return true;
  });
}

export function countActiveTitleFilters(state: TitleFilterState): number {
  return (
    state.types.length +
    state.genres.length +
    state.status.length +
    state.platforms.length +
    state.ages.length +
    state.pricing.length +
    state.tags.length +
    (state.minRating ? 1 : 0) +
    (state.yearRange ? 1 : 0) +
    (state.savedOnly ? 1 : 0) +
    (state.adaptedOnly ? 1 : 0)
  );
}

// 서버(explore/search) 쿼리스트링 빌더. 서버가 지원하는 facet만 포함하고,
// pricing/savedOnly 는 클라이언트에서 결과에 추가 적용한다(freeOnly는 무료/기다무만 선택 시 파생).
export function titleFiltersToParams(state: TitleFilterState, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (state.types.length) params.set("types", state.types.join(","));
  if (state.genres.length) params.set("genres", state.genres.join(","));
  if (state.tags.length) params.set("tags", state.tags.join(","));
  if (state.status.length) params.set("status", state.status.join(","));
  if (state.platforms.length) params.set("platforms", state.platforms.join(","));
  if (state.ages.length) params.set("ages", state.ages.join(","));
  if (state.minRating) params.set("minRating", String(state.minRating));
  if (state.yearRange) {
    params.set("yearMin", String(state.yearRange[0]));
    params.set("yearMax", String(state.yearRange[1]));
  }
  const onlyFree =
    state.pricing.length > 0 && state.pricing.every((p) => p === "free" || p === "wait-free");
  if (onlyFree) params.set("freeOnly", "true");
  if (state.adaptedOnly) params.set("adaptedOnly", "true");
  return params.toString();
}

// 서버 결과에 남은 클라이언트 전용 facet(pricing 정밀·savedOnly) 적용.
export function applyClientOnlyFilters(
  titles: Title[],
  state: TitleFilterState,
  savedIds?: Set<string>
): Title[] {
  return titles.filter((t) => {
    if (state.pricing.length && !t.availability.some((a) => state.pricing.includes(a.pricing))) return false;
    if (state.savedOnly && savedIds && !savedIds.has(t.id)) return false;
    return true;
  });
}
