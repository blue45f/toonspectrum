// cover-policy 는 process.env(COVER_IMAGE_POLICY) 를 읽는 서버 전용 표지 정책이라 core 로 옮기지 않고
// 웹 레포의 lib/server/ 에 남겨둔다 — core/server 에서 상대 경로로 climb 해 참조한다(웹 번들은 기존처럼 정적 치환).
import { applyCoverPolicy } from "../../../../lib/server/cover-policy";

import type { Title, WorkType } from "../types";

// "file-snapshot": gz 카탈로그 파일(기본 운영 경로) · "database-snapshot": 레거시 FORCE_DB 모드 전용
export type CatalogSource = "empty" | "file-snapshot" | "database-snapshot" | "cli-ingest";

type CatalogState = {
  source: CatalogSource;
  loadedAt: string;
  titleCount: number;
  titleRevision: number;
  revision: number;
  sourceVersion?: string;
  seedFallback?: boolean;
};

function buildByIdIndex(titles: readonly Title[]) {
  const byId = new Map<string, Title>();
  const len = titles.length;
  for (let i = 0; i < len; i++) {
    const title = titles[i];
    byId.set(title.id, title);
    byId.set(title.slug, title);
  }
  return byId;
}

function buildAdaptationsIndex(titles: readonly Title[]) {
  const byOriginal = new Map<string, Title[]>();
  const len = titles.length;
  for (let i = 0; i < len; i++) {
    const title = titles[i];
    if (!title.adaptedFrom) continue;
    const arr = byOriginal.get(title.adaptedFrom);
    if (arr) arr.push(title);
    else byOriginal.set(title.adaptedFrom, [title]);
  }
  return byOriginal;
}

function buildAuthorIndex(titles: readonly Title[]) {
  const byAuthor = new Map<string, Title[]>();
  const len = titles.length;
  for (let i = 0; i < len; i++) {
    const title = titles[i];
    const names = namesOf(title);
    for (let j = 0; j < names.length; j++) {
      const n = names[j];
      const arr = byAuthor.get(n);
      if (arr) arr.push(title);
      else byAuthor.set(n, [title]);
    }
  }
  for (const arr of byAuthor.values()) {
    arr.sort((a, b) => (b.stats?.views ?? 0) - (a.stats?.views ?? 0));
  }
  return byAuthor;
}

function buildActiveTagsIndex(titles: readonly Title[]) {
  const map = new Map<string, number>();
  const len = titles.length;
  for (let i = 0; i < len; i++) {
    const tags = titles[i].tags;
    const tLen = tags.length;
    for (let j = 0; j < tLen; j++) {
      const tag = tags[j];
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function normalizeCatalog(titles: unknown): Title[] {
  if (!Array.isArray(titles)) return [];
  return titles.filter((item): item is Title => {
    if (!item || typeof item !== "object") return false;

    const candidate = item as Partial<Title>;
    return (
      typeof candidate.id === "string" &&
      candidate.id.trim().length > 0 &&
      typeof candidate.slug === "string" &&
      candidate.slug.trim().length > 0 &&
      typeof candidate.title === "string" &&
      candidate.title.trim().length > 0 &&
      Array.isArray(candidate.availability)
    );
  });
}

let TITLE_REVISION_COUNTER = 1;
let BY_ID = buildByIdIndex([]);
let ADAPTATIONS_BY_ORIGINAL = buildAdaptationsIndex([]);
let AUTHOR_WORKS_INDEX = buildAuthorIndex([]);
let ACTIVE_TAGS_INDEX = buildActiveTagsIndex([]);
let TITLES_INTERNAL: Title[] = [];

let TITLES_META: CatalogState = {
  source: "empty",
  loadedAt: new Date().toISOString(),
  titleCount: TITLES_INTERNAL.length,
  titleRevision: TITLE_REVISION_COUNTER,
  revision: TITLE_REVISION_COUNTER,
  sourceVersion: "empty-runtime-store",
  seedFallback: false,
};

function rebuildIndexes(nextTitles: readonly Title[]) {
  BY_ID = buildByIdIndex(nextTitles);
  ADAPTATIONS_BY_ORIGINAL = buildAdaptationsIndex(nextTitles);
  AUTHOR_WORKS_INDEX = buildAuthorIndex(nextTitles);
  ACTIVE_TAGS_INDEX = buildActiveTagsIndex(nextTitles);
}

export let TITLES: Title[] = TITLES_INTERNAL;

export function getCatalogState(): CatalogState {
  return { ...TITLES_META };
}

function platformPopSignal(t: Title): number {
  const s = t.stats;
  const likes = Math.max(0, Number(s?.likes) || 0);
  if (s?.popularityRank && s.popularityRank > 0) {
    return (250 - Math.min(250, s.popularityRank)) + Math.log10(likes + 1) * 18;
  }
  return Math.log10(Math.max(0, Number(s?.views) || 0) + 1) * 10 + Math.log10(likes + 1) * 4;
}

function computeCrossPlatformPopularity(titles: Title[]): void {
  const len = titles.length;
  for (let i = 0; i < len; i++) {
    const s = titles[i].stats;
    if (s && s.likes === s.bookmarks && s.bookmarks > 0) s.likes = Math.round(s.bookmarks * 0.6);
  }
  const byPlatform = new Map<string, Title[]>();
  for (let i = 0; i < len; i++) {
    const t = titles[i];
    const pid = t.availability?.[0]?.platformId;
    if (!pid || !t.stats) continue;
    const arr = byPlatform.get(pid);
    if (arr) arr.push(t);
    else byPlatform.set(pid, [t]);
  }
  for (const group of byPlatform.values()) {
    const sorted = [...group].sort((a, b) => platformPopSignal(b) - platformPopSignal(a));
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      sorted[i].stats.popularityPercentile = n <= 1 ? 100 : Math.round(((n - 1 - i) / (n - 1)) * 1000) / 10;
    }
  }
}

export function replaceCatalogData(
  incoming: unknown,
  metadata: Partial<Pick<CatalogState, "source" | "sourceVersion">> & {
    seedFallback?: boolean;
  } = {}
): Title[] {
  const normalized = normalizeCatalog(incoming);
  applyCoverPolicy(normalized);
  computeCrossPlatformPopularity(normalized);
  TITLES_INTERNAL = normalized;
  TITLES = TITLES_INTERNAL;
  rebuildIndexes(TITLES_INTERNAL);

  TITLE_REVISION_COUNTER += 1;
  TITLES_META = {
    source: metadata.source ?? "cli-ingest",
    sourceVersion: metadata.sourceVersion,
    loadedAt: new Date().toISOString(),
    titleCount: TITLES_INTERNAL.length,
    titleRevision: TITLE_REVISION_COUNTER,
    revision: TITLE_REVISION_COUNTER,
    seedFallback: false,
  };

  return TITLES_INTERNAL;
}

export function resetCatalogToEmpty(sourceVersion = "empty-runtime-store"): Title[] {
  return replaceCatalogData([], { source: "empty", sourceVersion, seedFallback: false });
}

export function loadCatalogSnapshot(titles: unknown, sourceVersion = "db-snapshot", _seedFallback = false): Title[] {
  return replaceCatalogData(titles, {
    source: "database-snapshot",
    sourceVersion,
    seedFallback: false,
  });
}

export function getTitle(idOrSlug: string): Title | undefined {
  return BY_ID.get(idOrSlug);
}

export function allTitles(): Title[] {
  return TITLES;
}

export function namesOf(t: Title): string[] {
  const author = t.author ? t.author.trim() : "";
  const artist = t.artist ? t.artist.trim() : "";

  const results: string[] = [];
  if (author) {
    const parts = author.split(/[,/]/);
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i].trim();
      if (s && s !== "미상" && !results.includes(s)) results.push(s);
    }
  }
  if (artist && artist !== author) {
    const parts = artist.split(/[,/]/);
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i].trim();
      if (s && s !== "미상" && !results.includes(s)) results.push(s);
    }
  }
  return results;
}

export function authorWorks(name: string): Title[] {
  const arr = AUTHOR_WORKS_INDEX.get(name);
  return arr ? [...arr] : [];
}

export function allAuthorNames(): string[] {
  return Array.from(AUTHOR_WORKS_INDEX.keys());
}

export function getAuthorDirectory(limit = 240): {
  total: number;
  authors: Array<{
    name: string;
    workCount: number;
    totalViews: number;
    avgRating: number;
    topGenres: string[];
    types: WorkType[];
    cover: [string, string];
    coverImage?: string;
  }>;
} {
  const authors: Array<{
    name: string;
    workCount: number;
    totalViews: number;
    avgRating: number;
    topGenres: string[];
    types: WorkType[];
    cover: [string, string];
    coverImage?: string;
  }> = [];

  for (const [name, works] of AUTHOR_WORKS_INDEX) {
    if (/\s(작가|오리지널)$/.test(name)) continue;
    let totalViews = 0;
    let ratedSum = 0;
    let ratedCount = 0;
    const genreCount = new Map<string, number>();
    let topWork = works[0];
    let topViews = topWork?.stats?.views ?? 0;

    const wLen = works.length;
    for (let i = 0; i < wLen; i++) {
      const w = works[i];
      const v = w.stats?.views ?? 0;
      totalViews += v;
      if (v > topViews) {
        topViews = v;
        topWork = w;
      }

      if ((w.stats?.ratingCount ?? 0) > 0) {
        ratedSum += w.stats?.ratingAvg ?? 0;
        ratedCount++;
      }

      const gLen = w.genres.length;
      for (let j = 0; j < gLen; j++) {
        const g = w.genres[j];
        genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
      }
    }

    const avgRating = ratedCount > 0 ? ratedSum / ratedCount : 0;
    const topGenres = [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    const typesSet = new Set<WorkType>();
    for (let i = 0; i < wLen; i++) typesSet.add(works[i].type);

    authors.push({
      name,
      workCount: wLen,
      totalViews,
      avgRating: Math.round(avgRating * 10) / 10,
      topGenres,
      types: Array.from(typesSet),
      cover: topWork.cover,
      coverImage: topWork.coverImage,
    });
  }

  authors.sort((a, b) => b.workCount - a.workCount || b.totalViews - a.totalViews);
  return { total: AUTHOR_WORKS_INDEX.size, authors: authors.slice(0, limit) };
}

export function titlesByType(type: WorkType): Title[] {
  const len = TITLES.length;
  const res: Title[] = [];
  for (let i = 0; i < len; i++) {
    if (TITLES[i].type === type) res.push(TITLES[i]);
  }
  return res;
}

export function originalOf(t: Title): Title | undefined {
  return t.adaptedFrom ? BY_ID.get(t.adaptedFrom) : undefined;
}

export function adaptationsOf(t: Title): Title[] {
  const adaptations = ADAPTATIONS_BY_ORIGINAL.get(t.id);
  return adaptations ? [...adaptations] : [];
}

export function activeTags(): { tag: string; count: number }[] {
  return [...ACTIVE_TAGS_INDEX];
}
