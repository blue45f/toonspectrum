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
}

export let TITLES: Title[] = TITLES_INTERNAL;

export function getCatalogState(): CatalogState {
  return { ...TITLES_META };
}

export function replaceCatalogData(
  incoming: unknown,
  metadata: Partial<Pick<CatalogState, "source" | "sourceVersion">> & {
    seedFallback?: boolean;
  } = {}
): Title[] {
  const normalized = normalizeCatalog(incoming);
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

export function titlesByType(type: WorkType): Title[] {
  return TITLES.filter((t) => t.type === type);
}

export function originalOf(t: Title): Title | undefined {
  return t.adaptedFrom ? BY_ID.get(t.adaptedFrom) : undefined;
}

export function adaptationsOf(t: Title): Title[] {
  return TITLES.filter((x) => x.adaptedFrom === t.id);
}

export function activeTags(): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  TITLES.forEach((t) => t.tags.forEach((tag) => map.set(tag, (map.get(tag) ?? 0) + 1)));
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
