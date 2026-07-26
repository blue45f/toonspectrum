/**
 * Launch-safe brush catalogue contract.
 *
 * Studio's 54 core brushes are small enough for the always-visible quick shelf. The 160
 * procedural descriptors intentionally live in `studio-brush-catalog.ts`, which is loaded only
 * when a saved pro brush needs metadata or the full library opens.
 */
import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import {
  listStudioBrushTrayItems,
  listStudioQuickBrushTrayItems,
  type StudioBrushMediaGroup,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "./studio-creative-ux";

export interface StudioBrushCatalogItem extends StudioBrushTrayItem {
  source: "core" | "pro";
}

export const STUDIO_CORE_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    listStudioBrushTrayItems("all").map((item) =>
      Object.freeze({ ...item, source: "core" as const })
    )
  );

export const STUDIO_BRUSH_CATALOG_COUNTS = Object.freeze({
  core: STUDIO_CORE_BRUSH_CATALOG_ITEMS.length,
  pro: STUDIO_BRUSH_PACK_CATALOG_IDS.length,
  total: STUDIO_CORE_BRUSH_CATALOG_ITEMS.length + STUDIO_BRUSH_PACK_CATALOG_IDS.length,
});

export const STUDIO_BRUSH_MEDIA_LABELS: Readonly<Record<StudioBrushMediaGroup, string>> =
  Object.freeze({
    line: "선화",
    marker: "마커",
    paint: "채색",
    fx: "효과",
    texture: "질감",
  });

const STUDIO_CORE_BRUSH_CATALOG_BY_ID: ReadonlyMap<string, StudioBrushCatalogItem> =
  new Map(STUDIO_CORE_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

export function studioCoreBrushCatalogItemById(
  brushId: unknown
): StudioBrushCatalogItem | null {
  return typeof brushId === "string"
    ? STUDIO_CORE_BRUSH_CATALOG_BY_ID.get(brushId) ?? null
    : null;
}

export function studioBrushCatalogKindLabel(
  item: Pick<StudioBrushTrayItem, "mediaGroup">
): string {
  return STUDIO_BRUSH_MEDIA_LABELS[item.mediaGroup];
}

export function listStudioCoreQuickBrushCatalogItems(options: {
  catalogItems?: readonly StudioBrushTrayItem[];
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  limit?: number;
} = {}): StudioQuickBrushTrayItem[] {
  return listStudioQuickBrushTrayItems({
    ...options,
    catalogItems: options.catalogItems ?? STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  });
}
