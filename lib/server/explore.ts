import { TITLES, activeTags } from "./catalog-store";
import { searchTitles, type SearchFilters, type SortKey } from "../search";
import { PLATFORMS } from "../platforms";
import { GENRES } from "../taxonomy";
import type { AgeRating, PlatformId, SerialStatus, Title, WorkType } from "../types";

export type ExploreSearchParams = Record<string, string | undefined>;
export type ExploreSort = SortKey;

export const EXPLORE_PAGE_SIZE = 40;

const SORTS: ExploreSort[] = ["popular", "rating", "trending", "newest"];

const VALID_TYPES = new Set<WorkType>(["webtoon", "webnovel"]);
const VALID_STATUS = new Set<SerialStatus>(["ongoing", "completed", "hiatus"]);
const VALID_AGE = new Set<AgeRating>(["all", "12", "15", "19"]);

// 콤마 구분 멀티값 파싱(+ 허용 집합 검증). 비면 undefined.
function list<T extends string>(raw: string | undefined, allowed?: Set<T>): T[] | undefined {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as T[];
  const filtered = allowed ? values.filter((value) => allowed.has(value)) : values;
  return filtered.length ? filtered : undefined;
}

function numberParam(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolParam(raw: string | undefined): boolean {
  return raw === "true";
}

// 단일 genre/tag(스펙트럼 칩·구버전 링크)와 복수 genres/tags를 병합·중복 제거.
function mergeSingular(plural: string[] | undefined, single: string | undefined): string[] | undefined {
  const set = new Set<string>(plural ?? []);
  if (single) set.add(single);
  return set.size ? [...set] : undefined;
}

export function normalizeExploreParams(sp: ExploreSearchParams) {
  const singleGenre =
    sp.genre && GENRES.includes(sp.genre as (typeof GENRES)[number]) ? sp.genre : undefined;
  const singleTag = sp.tag || undefined;

  const genres = mergeSingular(list(sp.genres), singleGenre);
  const tags = mergeSingular(list(sp.tags), singleTag);
  const types = mergeSingular(list(sp.types, VALID_TYPES), VALID_TYPES.has(sp.type as WorkType) ? sp.type : undefined) as
    | WorkType[]
    | undefined;
  const status = list(sp.status, VALID_STATUS);
  const platforms = list(sp.platforms) as PlatformId[] | undefined;
  const ages = list(sp.ages, VALID_AGE);
  const minRating = numberParam(sp.minRating);
  const yearMin = numberParam(sp.yearMin);
  const yearMax = numberParam(sp.yearMax);
  const freeOnly = boolParam(sp.freeOnly);
  const adaptedOnly = boolParam(sp.adaptedOnly);

  const sort = SORTS.includes(sp.sort as ExploreSort) ? (sp.sort as ExploreSort) : "popular";

  return {
    // 단일 facet(헤더 스펙트럼·태그 칩·구버전 링크 호환)
    genre: singleGenre,
    tag: singleTag,
    type: VALID_TYPES.has(sp.type as WorkType) ? (sp.type as WorkType) : undefined,
    sort,
    // 복수/확장 facet
    genres,
    tags,
    types,
    status,
    platforms,
    ages,
    minRating,
    yearMin,
    yearMax,
    freeOnly,
    adaptedOnly,
  };
}

export async function getExploreData(sp: ExploreSearchParams) {
  const filters = normalizeExploreParams(sp);

  const searchFilters: SearchFilters = {
    types: filters.types,
    genres: filters.genres,
    tags: filters.tags,
    status: filters.status,
    platforms: filters.platforms,
    ageRatings: filters.ages,
    minRating: filters.minRating,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    freeOnly: filters.freeOnly || undefined,
    adaptedOnly: filters.adaptedOnly || undefined,
  };

  const results = searchTitles(TITLES, searchFilters, filters.sort);

  const showCount = Math.min(
    Math.max(Number(sp.show) || EXPLORE_PAGE_SIZE, EXPLORE_PAGE_SIZE),
    results.length
  );
  const shown = results.slice(0, showCount);

  return {
    filters,
    current: {
      genre: filters.genre,
      tag: filters.tag,
      type: filters.type,
      sort: sp.sort ? filters.sort : undefined,
    },
    results,
    shown,
    hasMore: results.length > shown.length,
    showCount,
    pageSize: EXPLORE_PAGE_SIZE,
    tags: activeTags().slice(0, 18),
    genres: GENRES,
    catalog: {
      platformCoverage: platformCoverage(TITLES),
      filteredPlatformCoverage: platformCoverage(results),
    },
    generatedAt: new Date().toISOString(),
    source: "server-catalog",
  };
}

// 플랫폼별 작품 수/점유율(빈 플랫폼은 패널에서 숨김). 캘린더/검색과 동일 형태.
function platformCoverage(titles: Title[]) {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    const ids = new Set(title.availability.map((entry) => entry.platformId));
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: PLATFORMS[id]?.short ?? id,
      color: PLATFORMS[id]?.color ?? "oklch(0.72 0.02 70)",
      count,
      share: titles.length ? Math.round((count / titles.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
