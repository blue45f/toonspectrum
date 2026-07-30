/**
 * Full built-in brush catalogue metadata.
 *
 * This module is a lazy boundary. Always-visible Studio chrome imports the launch-safe core
 * contract instead, while the library and persisted pro favorites load these 160 descriptors on
 * demand. The heavier procedural dynamics remain in `studio-brush-pack-runtime.ts`.
 */
import {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogKindLabel,
  type StudioBrushCatalogItem,
} from "./studio-brush-catalog-core";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import {
  listStudioQuickBrushTrayItems,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "./studio-creative-ux";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";

export {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
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

const STUDIO_BRUSH_CATALOG_BY_ID: ReadonlyMap<string, StudioBrushCatalogItem> =
  new Map(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

export function studioBrushCatalogItemById(
  brushId: unknown
): StudioBrushCatalogItem | null {
  return typeof brushId === "string"
    ? STUDIO_BRUSH_CATALOG_BY_ID.get(brushId) ?? null
    : null;
}

export function filterStudioBrushCatalogItems(options: {
  category?: StudioBrushTrayCategory | "favorites" | "recent";
  query?: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
} = {}): StudioBrushCatalogItem[] {
  const query = (options.query ?? "").trim();
  // Search is deliberately catalogue-wide. Artists should not have to guess which category owns a
  // named brush before they can find it; the category tabs resume as soon as the query is cleared.
  const category = query ? "all" : options.category;
  return filterStudioBrushLibraryItems({
    ...options,
    category,
    query,
    catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
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
    // Missing injection must never silently collapse the shelf from 226 to the 66 core brushes.
    catalogItems: options.catalogItems ?? STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  });
}
