/**
 * Full built-in brush catalogue metadata.
 *
 * This module is a lazy boundary. Always-visible Studio chrome imports the launch-safe core
 * contract instead, while the library and persisted pro favorites load these 160 descriptors on
 * demand. The heavier procedural dynamics remain in `studio-brush-pack-runtime.ts`.
 */
import {
  listStudioQuickBrushTrayItems,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "../studio-creative-ux";

import {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  listStudioCoreBrushCatalogItems,
  studioBrushCatalogKindLabel,
  type StudioBrushCatalogItem,
} from "./studio-brush-catalog-core";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";

import type { StudioToolOperation } from "../studio-brush";

export {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  listStudioCoreBrushCatalogItems,
  studioBrushCatalogKindLabel,
};
export type { StudioBrushCatalogItem };

export const STUDIO_PRO_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_BRUSH_PACK_DESCRIPTORS.map((descriptor) =>
      Object.freeze({
        id: descriptor.catalogId,
        name: descriptor.catalogName,
        shortName: descriptor.shortName,
        hint: descriptor.hint,
        defaultWidth: descriptor.defaultWidth,
        defaultOpacity: descriptor.defaultOpacity,
        operation: "paint" as const,
        category: "expressive" as const,
        mediaGroup: descriptor.mediaGroup,
        previewWeight: descriptor.previewWeight,
        previewStyle: descriptor.previewStyle,
        source: "pro" as const,
      })
    )
  );

export const STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] = [
  ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
];

export const STUDIO_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "paint"));

export const STUDIO_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "erase"));

const STUDIO_BRUSH_CATALOG_BY_ID: ReadonlyMap<string, StudioBrushCatalogItem> =
  new Map(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

export function studioBrushCatalogItemById(
  brushId: unknown
): StudioBrushCatalogItem | null {
  return typeof brushId === "string"
    ? STUDIO_BRUSH_CATALOG_BY_ID.get(brushId) ?? null
    : null;
}

/**
 * V17.1 quarantine: picker exposure derives from the lifecycle stage. Quarantined ids (see
 * `studio-brush-quarantine.ts`) leave every default listing/search below, but the SSOT arrays
 * above deliberately keep them — persisted documents still resolve metadata by id
 * (`studioBrushCatalogItemById`), replay through their own runtime contract, and the variant-group
 * manifest still partitions them. No "숨김 포함" affordance exists today, so exclusion from the
 * listing is complete until an id is delisted from the quarantine ledger.
 */
export const STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => !isStudioBrushQuarantinedPresetId(item.id)),
  );

export const STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "paint"),
  );

export const STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "erase"),
  );

export function filterStudioBrushCatalogItems(options: {
  operation?: StudioToolOperation;
  category?: StudioBrushTrayCategory | "favorites" | "recent";
  query?: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
} = {}): StudioBrushCatalogItem[] {
  const { operation, ...libraryOptions } = options;
  const query = (libraryOptions.query ?? "").trim();
  // Search is deliberately catalogue-wide. Artists should not have to guess which category owns a
  // named brush before they can find it; the category tabs resume as soon as the query is cleared.
  // `operation`, however, is a tool-family boundary and remains active during global search.
  const category = query ? "all" : libraryOptions.category;
  return filterStudioBrushLibraryItems({
    ...libraryOptions,
    category,
    query,
    catalogItems: operation === undefined
      ? STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS
      : operation === "paint"
        ? STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS
        : STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS,
  }) as StudioBrushCatalogItem[];
}

export function listStudioQuickBrushCatalogItems(options: {
  catalogItems?: readonly StudioBrushTrayItem[];
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  limit?: number;
} = {}): StudioQuickBrushTrayItem[] {
  return listStudioQuickBrushTrayItems({
    ...options,
    // Missing injection must never silently collapse the shelf to core-only tools, but the quick
    // shelf is a LISTING lane, so its fresh default is the listed (non-quarantined) inventory —
    // otherwise a quarantined id persisted in favorites/MRU re-surfaces as a picker affordance.
    // Metadata RESOLUTION for saved documents stays on the unfiltered SSOT via
    // `studioBrushCatalogItemById`; callers who inject `catalogItems` own their lane's filtering.
    catalogItems: options.catalogItems ?? STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  });
}
