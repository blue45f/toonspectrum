import {
  curateStudioUnifiedAssetHighlights,
  searchStudioUnifiedAssets,
  type StudioUnifiedAssetCategory,
  type StudioUnifiedAssetItem,
  type StudioUnifiedAssetScope,
} from "./studio-unified-asset-catalog";

export const STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY =
  "toonspectrum.studio.unified-asset-library.v1";

export const STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION = 1 as const;

const MAX_FAVORITES = 200;
const MAX_RECENTS = 40;
const MAX_TRAY_ITEMS = 24;
const MAX_ID_LENGTH = 180;

export type StudioUnifiedAssetLibraryView =
  | "all"
  | "favorites"
  | "recent"
  | "tray";

export type StudioUnifiedAssetFormat =
  | "all"
  | "template"
  | "image"
  | "vector"
  | "3d"
  | "tool";

export type StudioUnifiedAssetRightsFilter = "all" | "ready" | "review";
export type StudioUnifiedAssetEditabilityFilter = "all" | "editable";
export type StudioUnifiedAssetSort = "recommended" | "name";

export type StudioUnifiedAssetRightsStatus =
  | "verified"
  | "studio"
  | "personal"
  | "review";

export type StudioUnifiedAssetEditability =
  | "editable"
  | "scalable"
  | "flattened";

export interface StudioUnifiedAssetFacet {
  readonly format: Exclude<StudioUnifiedAssetFormat, "all">;
  readonly rights: StudioUnifiedAssetRightsStatus;
  readonly editability: StudioUnifiedAssetEditability;
}

export interface StudioUnifiedAssetRecentUse {
  readonly id: string;
  readonly usedAt: number;
}

export interface StudioUnifiedAssetLibraryState {
  readonly version: typeof STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION;
  readonly favorites: readonly string[];
  readonly recents: readonly StudioUnifiedAssetRecentUse[];
  readonly tray: readonly string[];
}

export interface DiscoverStudioUnifiedAssetsInput {
  readonly query?: string;
  readonly category?: StudioUnifiedAssetCategory;
  readonly scope?: StudioUnifiedAssetScope;
  readonly libraryView?: StudioUnifiedAssetLibraryView;
  readonly format?: StudioUnifiedAssetFormat;
  readonly rights?: StudioUnifiedAssetRightsFilter;
  readonly editability?: StudioUnifiedAssetEditabilityFilter;
  readonly sort?: StudioUnifiedAssetSort;
  readonly limit?: number;
  readonly libraryState?: StudioUnifiedAssetLibraryState;
}

export const STUDIO_UNIFIED_ASSET_FORMAT_LABELS: Readonly<
  Record<StudioUnifiedAssetFormat, string>
> = Object.freeze({
  all: "전체 형식",
  template: "템플릿",
  image: "이미지",
  vector: "벡터",
  "3d": "3D",
  tool: "제작 도구",
});

export const STUDIO_UNIFIED_ASSET_RIGHTS_LABELS: Readonly<
  Record<StudioUnifiedAssetRightsStatus, string>
> = Object.freeze({
  verified: "권리 확인",
  studio: "Studio 제공",
  personal: "개인 보관",
  review: "권리 검토 필요",
});

export const STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS: Readonly<
  Record<StudioUnifiedAssetEditability, string>
> = Object.freeze({
  editable: "구성 편집 가능",
  scalable: "크기 편집 가능",
  flattened: "평면 에셋",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH) return null;
  return normalized;
}

function sanitizeIdList(value: unknown, limit: number): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Set<string>();
  for (const candidate of value) {
    const id = sanitizeId(candidate);
    if (!id || unique.has(id)) continue;
    unique.add(id);
    if (unique.size >= limit) break;
  }
  return Object.freeze([...unique]);
}

function sanitizeRecents(value: unknown): readonly StudioUnifiedAssetRecentUse[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Set<string>();
  const recents: StudioUnifiedAssetRecentUse[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const id = sanitizeId(candidate.id);
    const usedAt = candidate.usedAt;
    if (
      !id
      || unique.has(id)
      || typeof usedAt !== "number"
      || !Number.isFinite(usedAt)
      || usedAt < 0
    ) {
      continue;
    }
    unique.add(id);
    recents.push(Object.freeze({ id, usedAt }));
    if (recents.length >= MAX_RECENTS) break;
  }
  recents.sort((left, right) => right.usedAt - left.usedAt);
  return Object.freeze(recents);
}

function freezeState(
  favorites: readonly string[],
  recents: readonly StudioUnifiedAssetRecentUse[],
  tray: readonly string[],
): StudioUnifiedAssetLibraryState {
  return Object.freeze({
    version: STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION,
    favorites: Object.freeze([...favorites].slice(0, MAX_FAVORITES)),
    recents: Object.freeze([...recents].slice(0, MAX_RECENTS)),
    tray: Object.freeze([...tray].slice(0, MAX_TRAY_ITEMS)),
  });
}

export function createStudioUnifiedAssetLibraryState(): StudioUnifiedAssetLibraryState {
  return freezeState([], [], []);
}

export function sanitizeStudioUnifiedAssetLibraryState(
  value: unknown,
): StudioUnifiedAssetLibraryState {
  if (!isRecord(value)) return createStudioUnifiedAssetLibraryState();
  return freezeState(
    sanitizeIdList(value.favorites, MAX_FAVORITES),
    sanitizeRecents(value.recents),
    sanitizeIdList(value.tray, MAX_TRAY_ITEMS),
  );
}

export function parseStudioUnifiedAssetLibraryState(
  serialized: string | null | undefined,
): StudioUnifiedAssetLibraryState {
  if (!serialized) return createStudioUnifiedAssetLibraryState();
  try {
    return sanitizeStudioUnifiedAssetLibraryState(JSON.parse(serialized));
  } catch {
    return createStudioUnifiedAssetLibraryState();
  }
}

export function serializeStudioUnifiedAssetLibraryState(
  state: StudioUnifiedAssetLibraryState,
): string {
  return JSON.stringify(sanitizeStudioUnifiedAssetLibraryState(state));
}

function toggleBoundedId(
  values: readonly string[],
  id: string,
  limit: number,
): readonly string[] {
  const sanitized = sanitizeId(id);
  if (!sanitized) return values;
  if (values.includes(sanitized)) {
    return Object.freeze(values.filter((value) => value !== sanitized));
  }
  return Object.freeze([sanitized, ...values].slice(0, limit));
}

export function toggleStudioUnifiedAssetFavorite(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetLibraryState {
  return freezeState(
    toggleBoundedId(state.favorites, id, MAX_FAVORITES),
    state.recents,
    state.tray,
  );
}

export function toggleStudioUnifiedAssetTray(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetLibraryState {
  return freezeState(
    state.favorites,
    state.recents,
    toggleBoundedId(state.tray, id, MAX_TRAY_ITEMS),
  );
}

export function recordStudioUnifiedAssetUse(
  state: StudioUnifiedAssetLibraryState,
  id: string,
  usedAt = Date.now(),
): StudioUnifiedAssetLibraryState {
  const sanitized = sanitizeId(id);
  if (!sanitized || !Number.isFinite(usedAt) || usedAt < 0) return state;
  const recents = [
    Object.freeze({ id: sanitized, usedAt }),
    ...state.recents.filter((item) => item.id !== sanitized),
  ].slice(0, MAX_RECENTS);
  return freezeState(state.favorites, recents, state.tray);
}

export function deriveStudioUnifiedAssetFacet(
  item: StudioUnifiedAssetItem,
): StudioUnifiedAssetFacet {
  const rights: StudioUnifiedAssetRightsStatus =
    item.discoverability === "caution" || item.badges.includes("권리 미확인")
      ? "review"
      : item.scope === "mine"
        ? item.badges.includes("권리 확인")
          ? "verified"
          : "personal"
        : "studio";

  switch (item.source.kind) {
    case "scene-template":
      return Object.freeze({
        format: "template",
        rights,
        editability: "editable",
      });
    case "element":
      return Object.freeze({
        format: "vector",
        rights,
        editability: "editable",
      });
    case "object-3d":
      return Object.freeze({
        format: "3d",
        rights,
        editability: "editable",
      });
    case "native-tool":
      return Object.freeze({
        format: "tool",
        rights,
        editability: "editable",
      });
    case "background":
      return Object.freeze({
        format: item.preview.kind === "svg" ? "vector" : "image",
        rights,
        editability: item.preview.kind === "svg" ? "scalable" : "flattened",
      });
    case "local":
      return Object.freeze({
        format: item.preview.kind === "svg" ? "vector" : "image",
        rights,
        editability: item.preview.kind === "svg" ? "scalable" : "flattened",
      });
    default: {
      const exhaustive: never = item.source;
      throw new Error(`지원하지 않는 에셋 소스입니다: ${String(exhaustive)}`);
    }
  }
}

function matchesLibraryView(
  item: StudioUnifiedAssetItem,
  view: StudioUnifiedAssetLibraryView,
  state: StudioUnifiedAssetLibraryState,
): boolean {
  if (view === "favorites") return state.favorites.includes(item.id);
  if (view === "recent") return state.recents.some((recent) => recent.id === item.id);
  if (view === "tray") return state.tray.includes(item.id);
  return true;
}

function matchesFacetFilters(
  item: StudioUnifiedAssetItem,
  format: StudioUnifiedAssetFormat,
  rights: StudioUnifiedAssetRightsFilter,
  editability: StudioUnifiedAssetEditabilityFilter,
): boolean {
  const facet = deriveStudioUnifiedAssetFacet(item);
  if (format !== "all" && facet.format !== format) return false;
  if (rights === "ready" && facet.rights === "review") return false;
  if (rights === "review" && facet.rights !== "review") return false;
  if (editability === "editable" && facet.editability === "flattened") return false;
  return true;
}

function recentPosition(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): number {
  const index = state.recents.findIndex((recent) => recent.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function discoverStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  input: DiscoverStudioUnifiedAssetsInput = {},
): readonly StudioUnifiedAssetItem[] {
  const query = input.query?.trim() ?? "";
  const category = input.category ?? "all";
  const scope = input.scope ?? "all";
  const libraryView = input.libraryView ?? "all";
  const format = input.format ?? "all";
  const rights = input.rights ?? "all";
  const editability = input.editability ?? "all";
  const sort = input.sort ?? "recommended";
  const state = input.libraryState ?? createStudioUnifiedAssetLibraryState();
  const limit = Math.max(1, Math.min(240, Math.floor(input.limit ?? 80)));

  const eligible = items
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => scope === "all" || item.scope === scope)
    .filter((item) => matchesLibraryView(item, libraryView, state))
    .filter((item) => matchesFacetFilters(item, format, rights, editability));

  const hasStructuredFilters =
    libraryView !== "all"
    || format !== "all"
    || rights !== "all"
    || editability !== "all";
  let result = query
    ? [...searchStudioUnifiedAssets(eligible, { query, limit: 240 })]
    : hasStructuredFilters
      ? [...eligible].sort(
          (left, right) =>
            right.sortPriority - left.sortPriority
            || left.title.localeCompare(right.title, "ko"),
        )
      : [...curateStudioUnifiedAssetHighlights(eligible, { limit: 120 })];

  if (libraryView === "recent") {
    result.sort(
      (left, right) => recentPosition(state, left.id) - recentPosition(state, right.id),
    );
  } else if (sort === "name") {
    result.sort((left, right) => left.title.localeCompare(right.title, "ko"));
  }

  return Object.freeze(result.slice(0, limit));
}

function normalizeToken(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function itemTokens(item: StudioUnifiedAssetItem): ReadonlySet<string> {
  return new Set(
    [item.title, item.categoryLabel, ...item.keywords, ...item.badges]
      .flatMap((value) => normalizeToken(value).split(/[^\p{L}\p{N}]+/u))
      .filter((value) => value.length >= 2),
  );
}

function relatedScore(
  anchor: StudioUnifiedAssetItem,
  candidate: StudioUnifiedAssetItem,
): number {
  const anchorFacet = deriveStudioUnifiedAssetFacet(anchor);
  const candidateFacet = deriveStudioUnifiedAssetFacet(candidate);
  let score = 0;
  if (anchor.category === candidate.category) score += 50;
  if (anchorFacet.format === candidateFacet.format) score += 30;
  if (anchor.source.kind === candidate.source.kind) score += 16;
  if (anchor.scope === candidate.scope) score += 6;
  if (candidate.discoverability === "featured") score += 10;
  if (candidateFacet.rights === "review") score -= 120;

  const anchorTokens = itemTokens(anchor);
  const candidateTokens = itemTokens(candidate);
  for (const token of anchorTokens) {
    if (candidateTokens.has(token)) score += 12;
  }
  return score;
}

export function findRelatedStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  anchor: StudioUnifiedAssetItem,
  limit = 6,
): readonly StudioUnifiedAssetItem[] {
  const boundedLimit = Math.max(1, Math.min(12, Math.floor(limit)));
  return Object.freeze(
    items
      .filter(
        (item) =>
          item.id !== anchor.id
          && deriveStudioUnifiedAssetFacet(item).rights !== "review",
      )
      .map((item) => ({ item, score: relatedScore(anchor, item) }))
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score
          || right.item.sortPriority - left.item.sortPriority
          || left.item.title.localeCompare(right.item.title, "ko"),
      )
      .slice(0, boundedLimit)
      .map(({ item }) => item),
  );
}
