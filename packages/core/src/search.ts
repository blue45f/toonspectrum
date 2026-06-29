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

// Pre-compiled normalized search scoring function for maximum performance
function score(t: Title, nq: string, tokens: string[]): number {
  if (!nq || tokens.length === 0) return 0;
  let s = 0;
  const title = norm(t.title);
  const author = norm(t.author + (t.artist ?? ""));

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (title === tok) s += 120;
    else if (title.startsWith(tok)) s += 80;
    else if (title.includes(tok)) s += 55;

    if (t.altTitles && t.altTitles.length > 0) {
      for (let j = 0; j < t.altTitles.length; j++) {
        if (norm(t.altTitles[j]).includes(tok)) {
          s += 45;
          break;
        }
      }
    }

    if (author.includes(tok)) s += 35;

    let tagMatched = false;
    for (let j = 0; j < t.tags.length; j++) {
      if (norm(t.tags[j]).includes(tok)) {
        s += 22;
        tagMatched = true;
        break;
      }
    }
    if (!tagMatched && t.tags.length > 0) {
      if (t.tags.map(norm).join("").includes(tok)) s += 22;
    }

    let genreMatched = false;
    for (let j = 0; j < t.genres.length; j++) {
      if (norm(t.genres[j]).includes(tok)) {
        s += 18;
        genreMatched = true;
        break;
      }
    }
    if (!genreMatched && t.genres.length > 0) {
      if (t.genres.map(norm).join("").includes(tok)) s += 18;
    }

    if (t.synopsis && norm(t.synopsis).includes(tok)) s += 8;
  }

  // 전체 질의가 제목에 통째로 포함되면 가산
  if (title.includes(nq)) s += 30;
  return s;
}

interface PreparedFilters {
  q: string;
  nq: string;
  tokens: string[];
  typesSet?: Set<WorkType>;
  statusSet?: Set<SerialStatus>;
  ageRatingsSet?: Set<AgeRating>;
  genresArr?: string[];
  tagsArr?: string[];
  platformsSet?: Set<PlatformId>;
  minRating?: number;
  yearMin?: number;
  yearMax?: number;
  freeOnly?: boolean;
  adaptedOnly?: boolean;
  adaptSet?: Set<string>;
}

function passPreparedFilters(t: Title, pf: PreparedFilters): boolean {
  if (pf.typesSet && !pf.typesSet.has(t.type)) return false;
  if (pf.statusSet && !pf.statusSet.has(t.status)) return false;
  if (pf.ageRatingsSet && !pf.ageRatingsSet.has(t.ageRating)) return false;

  if (pf.genresArr && pf.genresArr.length > 0) {
    let hasGenre = false;
    for (let i = 0; i < pf.genresArr.length; i++) {
      if (t.genres.includes(pf.genresArr[i])) {
        hasGenre = true;
        break;
      }
    }
    if (!hasGenre) return false;
  }

  if (pf.tagsArr && pf.tagsArr.length > 0) {
    for (let i = 0; i < pf.tagsArr.length; i++) {
      if (!t.tags.includes(pf.tagsArr[i])) return false;
    }
  }

  if (pf.platformsSet && pf.platformsSet.size > 0) {
    let hasPlatform = false;
    for (let i = 0; i < t.availability.length; i++) {
      if (pf.platformsSet.has(t.availability[i].platformId)) {
        hasPlatform = true;
        break;
      }
    }
    if (!hasPlatform) return false;
  }

  if (pf.minRating !== undefined && t.stats.ratingAvg < pf.minRating) return false;
  if (pf.yearMin !== undefined && t.releaseYear < pf.yearMin) return false;
  if (pf.yearMax !== undefined && t.releaseYear > pf.yearMax) return false;

  if (pf.freeOnly) {
    let hasFree = false;
    for (let i = 0; i < t.availability.length; i++) {
      const p = t.availability[i].pricing;
      if (p === "free" || p === "wait-free") {
        hasFree = true;
        break;
      }
    }
    if (!hasFree) return false;
  }

  if (pf.adaptedOnly) {
    const isTargetOfAdaptation = pf.adaptSet ? pf.adaptSet.has(t.id) : false;
    if (!t.adaptedFrom && !isTargetOfAdaptation) return false;
  }

  return true;
}

export function searchTitles(
  all: Title[],
  filters: SearchFilters,
  sort: SortKey = "relevance"
): Title[] {
  const q = filters.q?.trim() ?? "";
  const nq = norm(q);

  let tokens: string[] = [];
  if (q) {
    // 쉼표/공백 분토큰 및 원본 분토큰 조합으로 세밀한 검색 토큰 생성
    const rawTokens = q.split(/[\s,]+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < rawTokens.length; i++) {
      const nt = norm(rawTokens[i]);
      if (nt) set.add(nt);
    }
    if (nq) set.add(nq);
    tokens = Array.from(set);
  }

  const pf: PreparedFilters = {
    q,
    nq,
    tokens,
    typesSet: filters.types?.length ? new Set(filters.types) : undefined,
    statusSet: filters.status?.length ? new Set(filters.status) : undefined,
    ageRatingsSet: filters.ageRatings?.length ? new Set(filters.ageRatings) : undefined,
    genresArr: filters.genres?.length ? filters.genres : undefined,
    tagsArr: filters.tags?.length ? filters.tags : undefined,
    platformsSet: filters.platforms?.length ? new Set(filters.platforms) : undefined,
    minRating: filters.minRating,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    freeOnly: filters.freeOnly,
    adaptedOnly: filters.adaptedOnly,
    adaptSet: filters.adaptedOnly
      ? new Set(all.map((t) => t.adaptedFrom).filter(Boolean) as string[])
      : undefined,
  };

  const results: Title[] = [];
  if (q) {
    const scored: { t: Title; s: number }[] = [];
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (passPreparedFilters(t, pf)) {
        const s = score(t, nq, tokens);
        if (s > 0) scored.push({ t, s });
      }
    }
    scored.sort((a, b) => b.s - a.s);
    for (let i = 0; i < scored.length; i++) {
      results.push(scored[i].t);
    }
  } else {
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (passPreparedFilters(t, pf)) {
        results.push(t);
      }
    }
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
      return q ? arr : arr.sort((a, b) => b.stats.trendingScore - a.stats.trendingScore);
  }
}

// 인스턴트 자동완성 (상위 N)
export function suggest(all: Title[], q: string, limit = 6): Title[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const nq = norm(trimmed);
  const rawTokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i < rawTokens.length; i++) {
    const nt = norm(rawTokens[i]);
    if (nt) set.add(nt);
  }
  if (nq) set.add(nq);
  const tokens = Array.from(set);

  const scored: { t: Title; s: number }[] = [];
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    const s = score(t, nq, tokens);
    if (s > 0) scored.push({ t, s });
  }

  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
