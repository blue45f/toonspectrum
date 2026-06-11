import type { Title, WorkType } from "../types";

export type CatalogSource = "empty" | "database-snapshot" | "cli-ingest";

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
  for (const title of titles) {
    byId.set(title.id, title);
    byId.set(title.slug, title);
  }
  return byId;
}

// 원작 id → 2차창작 목록 — adaptationsOf 가 호출마다 전체(24k+)를 스캔하지 않도록
// 로드 시 1회 색인한다(정적 빌드의 buildHome 패밀리 계산이 O(n²) → O(n)).
function buildAdaptationsIndex(titles: readonly Title[]) {
  const byOriginal = new Map<string, Title[]>();
  for (const title of titles) {
    if (!title.adaptedFrom) continue;
    const arr = byOriginal.get(title.adaptedFrom);
    if (arr) arr.push(title);
    else byOriginal.set(title.adaptedFrom, [title]);
  }
  return byOriginal;
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
}

export let TITLES: Title[] = TITLES_INTERNAL;

export function getCatalogState(): CatalogState {
  return { ...TITLES_META };
}

// 교차-플랫폼 인기 백분위(0~100) — 로드 시 1회 계산(재크롤 불필요).
// 각 플랫폼 내부에서 실순위·실관심 블렌드 신호로 정렬해 백분위를 부여하면 플랫폼 간 비교가 가능해진다.
// (네이버 요일순위가 점수를 독식하던 문제 해소 — 카카오/레진 상위작도 공정하게 경쟁.)
function platformPopSignal(t: Title): number {
  const s = t.stats;
  const likes = Math.max(0, Number(s?.likes) || 0);
  if (s?.popularityRank && s.popularityRank > 0) {
    // 네이버 웹툰: 실순위 위치(요일 최상위) + 실 관심수 블렌드. 관심이 높으면 하위 순위라도 끌어올려
    // '비인기 요일 1위 > 인기 요일 2위' 부당함을 완화하고, 동순위 무더기를 연속값으로 분산한다.
    return (250 - Math.min(250, s.popularityRank)) + Math.log10(likes + 1) * 18;
  }
  // 그 외 플랫폼: 크롤러가 list/rank 순서로 부여한 views(+관심)를 내부 인기 신호로 사용.
  return Math.log10(Math.max(0, Number(s?.views) || 0) + 1) * 10 + Math.log10(likes + 1) * 4;
}

function computeCrossPlatformPopularity(titles: Title[]): void {
  // 좋아요==관심(둘 다 favoriteCount로 채워진 추정값) 중복 제거 — 좋아요는 관심의 ~60%로 분리해
  // UI에서 같은 숫자가 두 번 보이거나 favorites 점수가 한 신호를 이중 계산하지 않게 한다(추정값 한정).
  for (const t of titles) {
    const s = t.stats;
    if (s && s.likes === s.bookmarks && s.bookmarks > 0) s.likes = Math.round(s.bookmarks * 0.6);
  }
  const byPlatform = new Map<string, Title[]>();
  for (const t of titles) {
    const pid = t.availability?.[0]?.platformId;
    if (!pid || !t.stats) continue;
    const arr = byPlatform.get(pid);
    if (arr) arr.push(t);
    else byPlatform.set(pid, [t]);
  }
  for (const group of byPlatform.values()) {
    const sorted = [...group].sort((a, b) => platformPopSignal(b) - platformPopSignal(a));
    const n = sorted.length;
    sorted.forEach((t, i) => {
      // 상위 → 100, 최하위 → ~0. 플랫폼 간 비교 가능한 정규화 인기.
      t.stats.popularityPercentile = n <= 1 ? 100 : Math.round(((n - 1 - i) / (n - 1)) * 1000) / 10;
    });
  }
}

export function replaceCatalogData(
  incoming: unknown,
  metadata: Partial<Pick<CatalogState, "source" | "sourceVersion">> & {
    seedFallback?: boolean;
  } = {}
): Title[] {
  const normalized = normalizeCatalog(incoming);
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
  const raw = [t.author, t.artist].filter(Boolean).join(", ");
  return [...new Set(raw.split(/[,/]/).map((s) => s.trim()).filter((s) => s && s !== "미상"))];
}

export function authorWorks(name: string): Title[] {
  return TITLES.filter((t) => namesOf(t).includes(name)).sort((a, b) => b.stats.views - a.stats.views);
}

export function allAuthorNames(): string[] {
  const set = new Set<string>();
  TITLES.forEach((t) => namesOf(t).forEach((n) => set.add(n)));
  return [...set];
}

// 작가 디렉터리 — 작가별 작품 집계(브라우즈용). 작품 수 → 누적 조회 순 정렬, 상위 limit건 + 전체 작가 수.
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
  const byAuthor = new Map<string, Title[]>();
  for (const t of TITLES) {
    for (const n of namesOf(t)) {
      // 플랫폼 집계 플레이스홀더 제외(예: "네이버웹툰 작가", "포스타입 오리지널") — 실제 작가가 아님.
      if (/\s(작가|오리지널)$/.test(n)) continue;
      const arr = byAuthor.get(n);
      if (arr) arr.push(t);
      else byAuthor.set(n, [t]);
    }
  }
  const authors = [];
  for (const [name, works] of byAuthor) {
    const totalViews = works.reduce((s, w) => s + (w.stats?.views ?? 0), 0);
    const rated = works.filter((w) => (w.stats?.ratingCount ?? 0) > 0);
    const avgRating = rated.length
      ? rated.reduce((s, w) => s + (w.stats?.ratingAvg ?? 0), 0) / rated.length
      : 0;
    const genreCount = new Map<string, number>();
    for (const w of works) for (const g of w.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    const topGenres = [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
    const top = works.reduce((best, w) => ((w.stats?.views ?? 0) > (best.stats?.views ?? 0) ? w : best), works[0]);
    authors.push({
      name,
      workCount: works.length,
      totalViews,
      avgRating: Math.round(avgRating * 10) / 10,
      topGenres,
      types: [...new Set(works.map((w) => w.type))],
      cover: top.cover,
      coverImage: top.coverImage,
    });
  }
  authors.sort((a, b) => b.workCount - a.workCount || b.totalViews - a.totalViews);
  return { total: byAuthor.size, authors: authors.slice(0, limit) };
}

export function titlesByType(type: WorkType): Title[] {
  return TITLES.filter((t) => t.type === type);
}

export function originalOf(t: Title): Title | undefined {
  return t.adaptedFrom ? BY_ID.get(t.adaptedFrom) : undefined;
}

export function adaptationsOf(t: Title): Title[] {
  // 색인 결과는 내부 배열이므로 호출부 변형으로부터 보호하기 위해 복사본을 돌려준다.
  const adaptations = ADAPTATIONS_BY_ORIGINAL.get(t.id);
  return adaptations ? [...adaptations] : [];
}

export function activeTags(): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  TITLES.forEach((t) => t.tags.forEach((tag) => map.set(tag, (map.get(tag) ?? 0) + 1)));
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
