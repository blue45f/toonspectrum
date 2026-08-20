/**
 * Launch-safe brush catalogue contract.
 *
 * Core brushes stay on the always-visible quick shelf. The 160 procedural descriptors live in
 * `studio-brush-catalog.ts` and load when a saved pro brush needs metadata or the full library opens.
 *
 * Counts are derived from the live catalogues — never hardcode "229"/"231" in product copy.
 */
import {
  listStudioBrushTrayItems,
  listStudioQuickBrushTrayItems,
  type StudioBrushMediaGroup,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "../studio-creative-ux";

import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";

import type { StudioToolOperation } from "../studio-brush";

export interface StudioBrushCatalogItem extends StudioBrushTrayItem {
  source: "core" | "pro";
}

export const STUDIO_CORE_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    listStudioBrushTrayItems("all").map((item) =>
      Object.freeze({ ...item, source: "core" as const })
    )
  );

export function listStudioCoreBrushCatalogItems(
  operation?: StudioToolOperation
): readonly StudioBrushCatalogItem[] {
  return operation === undefined
    ? STUDIO_CORE_BRUSH_CATALOG_ITEMS
    : STUDIO_CORE_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === operation);
}

/**
 * V17.1 quarantine, core LISTING lane: same lifecycle split as the lazy catalogue
 * (`studio-brush-catalog.ts`). The SSOT array above keeps quarantined ids so
 * `studioCoreBrushCatalogItemById` and the counts stay resolution-complete; only picker-facing
 * listings consume this filtered view. Order is SSOT order — filtering never reorders.
 */
export const STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_CORE_BRUSH_CATALOG_ITEMS.filter((item) => !isStudioBrushQuarantinedPresetId(item.id)),
  );

const STUDIO_CORE_ERASE_BRUSH_COUNT = STUDIO_CORE_BRUSH_CATALOG_ITEMS.filter(
  (item) => item.operation === "erase",
).length;

/**
 * Single source of truth for product-facing brush totals.
 * - `total` = paint + erase (core + pro; grows with engine-lane shelf)
 * - `paint` = every selectable pen/tool in the paint library
 * - historical "229 paint" was core 71 − 2 erase + pro 160 before web-kit core expansion
 * - historical core 99 grew with engine-lane variants (`oil--filbert-ribbon`, …)
 * - 2026-08-13 brush quality wave: core 137 → 148 (total 297 → 308) with 11 new engine lanes
 *   (dry-stamp ×4, wet-texture ×4, oil/impasto ×3)
 * - 2026-08-13 wave 3: core 148 → 165 (total 308 → 325) with 17 new engine lanes
 *   (CC0 MyPaint verbatim ×12, croquis capsule ×2, living-ink bake ×2, bristle-physics oil ×1)
 */
export const STUDIO_BRUSH_CATALOG_COUNTS = Object.freeze({
  core: STUDIO_CORE_BRUSH_CATALOG_ITEMS.length,
  pro: STUDIO_BRUSH_PACK_CATALOG_IDS.length,
  total: STUDIO_CORE_BRUSH_CATALOG_ITEMS.length + STUDIO_BRUSH_PACK_CATALOG_IDS.length,
  erase: STUDIO_CORE_ERASE_BRUSH_COUNT,
  paint:
    STUDIO_CORE_BRUSH_CATALOG_ITEMS.length
    - STUDIO_CORE_ERASE_BRUSH_COUNT
    + STUDIO_BRUSH_PACK_CATALOG_IDS.length,
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
  item: Pick<StudioBrushTrayItem, "mediaGroup" | "operation">
): string {
  if (item.operation === "erase") return "지우개";
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
    // The quick shelf is a LISTING lane, so the fresh default is the listed (non-quarantined)
    // core inventory — a quarantined id persisted in favorites/MRU must not re-surface as a
    // picker affordance. Because this injection is already filtered, `listStudioQuickBrushTrayItems`
    // never re-filters it (callers who inject `catalogItems` own their lane's filtering).
    // Metadata RESOLUTION stays on the unfiltered SSOT via `studioCoreBrushCatalogItemById`.
    catalogItems: options.catalogItems ?? STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS,
  });
}
