/**
 * Launch-safe brush catalogue contract.
 *
 * Core brushes stay on the always-visible quick shelf. The 160 procedural descriptors live in
 * `studio-brush-catalog.ts` and load when a saved pro brush needs metadata or the full library opens.
 *
 * Counts are derived from the live catalogues — never hardcode historical totals in product copy.
 */
import {
  listStudioBrushTrayItems,
  listStudioQuickBrushTrayItems,
  type StudioBrushMediaGroup,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "../studio-creative-ux";

import { STUDIO_BRUSH_MATERIAL_GROUP_LABELS } from "./studio-brush-material-group";
import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import { STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS } from "./studio-brush-quality-portfolio-counts";
import {
  isStudioBrushQuarantinedPresetId,
  STUDIO_BRUSH_QUARANTINED_PRESET_IDS,
} from "./studio-brush-quarantine";

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
 * Resolution-safe core inventory. It intentionally remains wider than the default quality
 * portfolio because launch chrome and saved-document lookups must still know every non-quarantined
 * core id. The full lazy catalogue performs the final product-facing portfolio curation.
 */
export const STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_CORE_BRUSH_CATALOG_ITEMS.filter((item) => !isStudioBrushQuarantinedPresetId(item.id)),
  );

const STUDIO_CORE_ERASE_BRUSH_COUNT = STUDIO_CORE_BRUSH_CATALOG_ITEMS.filter(
  (item) => item.operation === "erase",
).length;

/** Registered catalogue totals, including ids hidden from the default picker. */
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

/**
 * Product-facing counts for the quality-curated default picker. Similar brushes remain registered,
 * searchable and replayable, but no longer consume another default slot. Kept launch-safe through
 * the tiny count leaf rather than importing the full quality fingerprint manifest here.
 */
const STUDIO_BRUSH_DEFAULT_PORTFOLIO_PRO_COUNT = 7;
export const STUDIO_BRUSH_LISTED_CATALOG_COUNTS = Object.freeze({
  core: STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS.total - STUDIO_BRUSH_DEFAULT_PORTFOLIO_PRO_COUNT,
  pro: STUDIO_BRUSH_DEFAULT_PORTFOLIO_PRO_COUNT,
  total: STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS.total,
  erase: STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS.erase,
  paint: STUDIO_BRUSH_DEFAULT_PORTFOLIO_COUNTS.paint,
});

/**
 * Material labels are owned by the derived material module; duplicating them here makes tabs,
 * chips, and badges drift apart.
 */
export const STUDIO_BRUSH_MEDIA_LABELS: Readonly<Record<StudioBrushMediaGroup, string>> =
  STUDIO_BRUSH_MATERIAL_GROUP_LABELS;

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
    // Current-brush metadata resolution stays on the unfiltered SSOT; picker-facing callers inject
    // the curated lazy inventory once it has loaded. Until then this non-quarantined core fallback
    // keeps the launch shelf functional and never resurrects a quarantined id.
    catalogItems: options.catalogItems ?? STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS,
  });
}

// Keep the quarantine ledger reachable in this launch-safe module so tree-shaking cannot hide a
// registration/exposure mismatch from the catalogue contract tests.
void STUDIO_BRUSH_QUARANTINED_PRESET_IDS;
