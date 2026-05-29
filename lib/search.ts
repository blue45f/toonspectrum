import type { Title, WorkType, SerialStatus, AgeRating, PlatformId } from "./types";

export interface SearchFilters {
  q?: string;
  types?: WorkType[];
  genres?: string[];
  tags?: string[];
  status?: SerialStatus[];
  platforms?: PlatformId[];
  ageRatings?: AgeRating[];
  minRating?: number;
  yearMin?: number;
  yearMax?: number;
  freeOnly?: boolean; // 무료/기다무만
  adaptedOnly?: boolean; // 원작/2차창작 연결된 작품만
}

export type SortKey =
  | "relevance"
  | "rating"
  | "popular"
  | "trending"
  | "bookmarks"
  | "completion"
  | "newest"
  | "title";

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// 검색 점수 (제목 > 별칭 > 작가 > 태그 > 장르 > 시놉시스)
function score(t: Title, q: string): number {
  if (!q) return 0;
  const nq = norm(q);
  const tokens = nq.split(/[\s,]+/).filter(Boolean);
  let s = 0;
  const title = norm(t.title);
  const alts = (t.altTitles ?? []).map(norm);
  const author = norm(t.author + (t.artist ?? ""));
  const tags = t.tags.map(norm).join("");
  const genres = t.genres.map(norm).join("");
  const syn = norm(t.synopsis);

  for (const tok of tokens) {
    if (title === tok) s += 120;
    else if (title.startsWith(tok)) s += 80;
    else if (title.includes(tok)) s += 55;
    if (alts.some((a) => a.includes(tok))) s += 45;
    if (author.includes(tok)) s += 35;
    if (tags.includes(tok)) s += 22;
    if (genres.includes(tok)) s += 18;
    if (syn.includes(tok)) s += 8;
  }
  // 전체 질의가 제목에 통째로 포함되면 가산
  if (title.includes(nq)) s += 30;
  return s;
}

function passFilters(t: Title, f: SearchFilters): boolean {
  if (f.types?.length && !f.types.includes(t.type)) return false;
  if (f.status?.length && !f.status.includes(t.status)) return false;
  if (f.ageRatings?.length && !f.ageRatings.includes(t.ageRating)) return false;
  if (f.genres?.length && !f.genres.some((g) => t.genres.includes(g))) return false;
  if (f.tags?.length && !f.tags.every((tag) => t.tags.includes(tag))) return false;
  if (f.platforms?.length && !t.availability.some((a) => f.platforms!.includes(a.platformId)))
    return false;
  if (f.minRating && t.stats.ratingAvg < f.minRating) return false;
  if (f.yearMin && t.releaseYear < f.yearMin) return false;
  if (f.yearMax && t.releaseYear > f.yearMax) return false;
  if (f.freeOnly && !t.availability.some((a) => a.pricing === "free" || a.pricing === "wait-free"))
    return false;
  if (f.adaptedOnly && !t.adaptedFrom && !hasAdaptation(t)) return false;
  return true;
}

let ADAPT_SET: Set<string> | null = null;
function hasAdaptation(t: Title): boolean {
  // adaptedFrom 으로 이 작품을 가리키는 다른 작품이 있는지
  // (검색에서만 쓰므로 호출부에서 allTitles 주입)
  return ADAPT_SET?.has(t.id) ?? false;
}

export function searchTitles(
  all: Title[],
  filters: SearchFilters,
  sort: SortKey = "relevance"
): Title[] {
  ADAPT_SET = new Set(all.map((t) => t.adaptedFrom).filter(Boolean) as string[]);
  const q = filters.q?.trim() ?? "";
  let results = all.filter((t) => passFilters(t, filters));

  if (q) {
    results = results
      .map((t) => ({ t, s: score(t, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
  }

  return sortTitles(results, sort, q);
}

export function sortTitles(list: Title[], sort: SortKey, q = ""): Title[] {
  const arr = [...list];
  switch (sort) {
    case "rating":
      return arr.sort(
        (a, b) =>
          b.stats.ratingAvg - a.stats.ratingAvg || b.stats.ratingCount - a.stats.ratingCount
      );
    case "popular":
      return arr.sort((a, b) => b.stats.views - a.stats.views);
    case "trending":
      return arr.sort((a, b) => b.stats.trendingScore - a.stats.trendingScore);
    case "bookmarks":
      return arr.sort((a, b) => b.stats.bookmarks - a.stats.bookmarks);
    case "completion":
      return arr.sort((a, b) => b.stats.completionRate - a.stats.completionRate);
    case "newest":
      return arr.sort((a, b) => b.releaseYear - a.releaseYear);
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    case "relevance":
    default:
      // q 있으면 이미 점수순. 없으면 인기 가중.
      return q ? arr : arr.sort((a, b) => b.stats.trendingScore - a.stats.trendingScore);
  }
}

// 인스턴트 자동완성 (상위 N)
export function suggest(all: Title[], q: string, limit = 6): Title[] {
  if (!q.trim()) return [];
  return all
    .map((t) => ({ t, s: score(t, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
