/**
 * Lightweight built-in brush catalogue metadata.
 *
 * The 87-brush physics table remains behind StudioBrushLibrarySheet's dynamic import. This module
 * only carries labels and preview hints, so opening Studio does not eagerly parse custom alpha tips.
 */
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import { listStudioBrushTrayItems, type StudioBrushTrayItem } from "./studio-creative-ux";

export interface StudioBrushCatalogItem extends StudioBrushTrayItem {
  source: "core" | "pro";
}

export const STUDIO_CORE_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  listStudioBrushTrayItems("all").map((item) => ({ ...item, source: "core" }));

export const STUDIO_PRO_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  STUDIO_BRUSH_PACK_DESCRIPTORS.map((descriptor) => ({
    id: descriptor.catalogId,
    name: descriptor.catalogName,
    shortName: descriptor.shortName,
    hint: descriptor.hint,
    defaultWidth: descriptor.defaultWidth,
    defaultOpacity: descriptor.defaultOpacity,
    category: "expressive",
    mediaGroup: descriptor.mediaGroup,
    previewWeight: descriptor.previewWeight,
    previewStyle: descriptor.previewStyle,
    source: "pro",
  }));

export const STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] = [
  ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
];
