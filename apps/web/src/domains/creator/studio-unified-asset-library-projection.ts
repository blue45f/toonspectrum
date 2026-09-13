import {
  createStudioUnifiedAssetLibraryState,
  deriveStudioUnifiedAssetFacet,
  type DiscoverStudioUnifiedAssetsInput,
} from "./studio-unified-asset-intelligence";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export type StudioUnifiedAssetLibraryProjectionInput = Pick<
  DiscoverStudioUnifiedAssetsInput,
  "libraryView" | "format" | "rights" | "editability" | "sort" | "libraryState"
>;

/**
 * Project the searchable corpus, NOT a recommendation page. The child insertion hub applies its
 * own query/category and rendering limit. Capping here made later 3D/templates/personal assets
 * impossible to find even with an exact query, and made category counts misleading.
 */
export function projectStudioUnifiedAssetLibrary(
  items: readonly StudioUnifiedAssetItem[],
  input: StudioUnifiedAssetLibraryProjectionInput = {},
): readonly StudioUnifiedAssetItem[] {
  const state = input.libraryState ?? createStudioUnifiedAssetLibraryState();
  const view = input.libraryView ?? "all";
  const format = input.format ?? "all";
  const rights = input.rights ?? "all";
  const editability = input.editability ?? "all";
  const favorites = new Set(state.favorites);
  const tray = new Set(state.tray);
  const recents = new Map(state.recents.map((recent, index) => [recent.id, index]));

  const result = items.filter((item) => {
    if (view === "favorites" && !favorites.has(item.id)) return false;
    if (view === "tray" && !tray.has(item.id)) return false;
    if (view === "recent" && !recents.has(item.id)) return false;
    if (format === "all" && rights === "all" && editability === "all") return true;
    const facet = deriveStudioUnifiedAssetFacet(item);
    if (format !== "all" && facet.format !== format) return false;
    if (rights === "ready" && facet.rights === "review") return false;
    if (rights === "review" && facet.rights !== "review") return false;
    if (editability === "editable" && facet.editability === "flattened") return false;
    return true;
  });
  result.sort((left, right) => {
    if (view === "recent") {
      return (recents.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (recents.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    }
    if (input.sort === "name") return left.title.localeCompare(right.title, "ko");
    return right.sortPriority - left.sortPriority
      || left.title.localeCompare(right.title, "ko");
  });
  return Object.freeze(result);
}
