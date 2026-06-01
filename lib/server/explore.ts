import { TITLES, activeTags } from "../data";
import { searchTitles, type SortKey } from "../search";
import { GENRES } from "../taxonomy";
import type { WorkType } from "../types";

export type ExploreSearchParams = Record<string, string | undefined>;
export type ExploreSort = SortKey;

export const EXPLORE_PAGE_SIZE = 40;

const SORTS: ExploreSort[] = ["popular", "rating", "trending", "newest"];

export function normalizeExploreParams(sp: ExploreSearchParams) {
  const genre = sp.genre && GENRES.includes(sp.genre as (typeof GENRES)[number]) ? sp.genre : undefined;
  const tag = sp.tag || undefined;
  const type =
    sp.type === "webtoon" || sp.type === "webnovel" ? (sp.type as WorkType) : undefined;
  const sort = SORTS.includes(sp.sort as ExploreSort) ? (sp.sort as ExploreSort) : "popular";

  return { genre, tag, type, sort };
}

export async function getExploreData(sp: ExploreSearchParams) {
  const filters = normalizeExploreParams(sp);
  const results = searchTitles(
    TITLES,
    {
      genres: filters.genre ? [filters.genre] : undefined,
      tags: filters.tag ? [filters.tag] : undefined,
      types: filters.type ? [filters.type] : undefined,
    },
    filters.sort
  );

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
    generatedAt: new Date().toISOString(),
    source: "server-catalog",
  };
}
