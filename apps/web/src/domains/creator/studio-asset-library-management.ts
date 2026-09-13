import type { StudioAsset } from "./studio-asset-library";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export const STUDIO_ASSET_LIBRARY_PAGE_SIZE = 24;
export type StudioAssetLibrarySort = "recent" | "name";
export type StudioSceneLibraryKind = "all" | "background" | "scene-template";

export interface StudioAssetLibraryPage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}
function matches(value: string, query: string): boolean {
  const haystack = normalized(value);
  return normalized(query).split(/\s+/u).filter(Boolean).every((token) => haystack.includes(token));
}
function paginate<T>(items: readonly T[], requestedPage: number): StudioAssetLibraryPage<T> {
  const pages = Math.max(1, Math.ceil(items.length / STUDIO_ASSET_LIBRARY_PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.max(0, Math.min(pages - 1, Math.floor(requestedPage))) : 0;
  return {
    items: items.slice(page * STUDIO_ASSET_LIBRARY_PAGE_SIZE, (page + 1) * STUDIO_ASSET_LIBRARY_PAGE_SIZE),
    total: items.length, page, pages,
  };
}

export function studioLocalAssetKindLabel(asset: StudioAsset): string {
  if (asset.kind === "bg3d") return "3D 렌더 이미지";
  if (asset.kind === "ai") return "AI 이미지";
  return "업로드 이미지";
}

export function selectStudioLocalAssetPage(
  assets: readonly StudioAsset[],
  query = "",
  sort: StudioAssetLibrarySort = "recent",
  page = 0,
): StudioAssetLibraryPage<StudioAsset> {
  const result = assets.filter((asset) => matches(`${asset.name} ${studioLocalAssetKindLabel(asset)}`, query));
  result.sort((left, right) => sort === "name"
    ? left.name.localeCompare(right.name, "ko")
    : right.createdAt - left.createdAt || left.name.localeCompare(right.name, "ko"));
  return paginate(result, page);
}

export function selectStudioSceneLibraryPage(
  items: readonly StudioUnifiedAssetItem[],
  query = "",
  kind: StudioSceneLibraryKind = "all",
  page = 0,
): StudioAssetLibraryPage<StudioUnifiedAssetItem> {
  const result = items.filter((item) => {
    if (item.source.kind !== "background" && item.source.kind !== "scene-template") return false;
    if (kind !== "all" && item.source.kind !== kind) return false;
    return matches([item.title, item.description, ...item.keywords, ...item.badges].join(" "), query);
  });
  return paginate(result, page);
}

/** Report only removals present in authoritative React props, never a swallowed void callback. */
export function summarizeStudioAssetDeletion(
  requestedIds: readonly string[],
  currentAssets: readonly Pick<StudioAsset, "id">[],
): { readonly removed: number; readonly remaining: number } {
  const current = new Set(currentAssets.map((asset) => asset.id));
  const requested = new Set(requestedIds);
  let remaining = 0;
  for (const id of requested) if (current.has(id)) remaining += 1;
  return { removed: requested.size - remaining, remaining };
}
