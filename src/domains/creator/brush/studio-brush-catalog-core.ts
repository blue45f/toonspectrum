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

import { STUDIO_BRUSH_MATERIAL_GROUP_LABELS } from "./studio-brush-material-group";
import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
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

/**
 * Product-facing totals for the LISTED inventory — what a picker can actually offer today.
 *
 * `STUDIO_BRUSH_CATALOG_COUNTS` above counts REGISTERED presets, including quarantined ids that no
 * listing may show; using it in UI copy advertises brushes the drawer cannot open (2026-08-21
 * 로스터 축소 이후 등록 328 vs 노출 240). Derived, never hardcoded, and still launch-safe: the
 * quarantine ledger is a zero-import leaf, so the pro slice is counted as "ledger entries this
 * module does not own" rather than by importing the 160 pack descriptors.
 */
const STUDIO_QUARANTINED_PRO_BRUSH_COUNT = STUDIO_BRUSH_QUARANTINED_PRESET_IDS.filter(
  (quarantinedId) => !STUDIO_CORE_BRUSH_CATALOG_ITEMS.some((item) => item.id === quarantinedId),
).length;

const STUDIO_LISTED_CORE_ERASE_BRUSH_COUNT = STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS.filter(
  (item) => item.operation === "erase",
).length;

export const STUDIO_BRUSH_LISTED_CATALOG_COUNTS = Object.freeze({
  core: STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS.length,
  pro: STUDIO_BRUSH_PACK_CATALOG_IDS.length - STUDIO_QUARANTINED_PRO_BRUSH_COUNT,
  total:
    STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS.length
    + STUDIO_BRUSH_PACK_CATALOG_IDS.length
    - STUDIO_QUARANTINED_PRO_BRUSH_COUNT,
  erase: STUDIO_LISTED_CORE_ERASE_BRUSH_COUNT,
  paint:
    STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS.length
    - STUDIO_LISTED_CORE_ERASE_BRUSH_COUNT
    + STUDIO_BRUSH_PACK_CATALOG_IDS.length
    - STUDIO_QUARANTINED_PRO_BRUSH_COUNT,
});

/**
 * 재질 라벨은 파생 모듈이 소유한다. 여기서 다시 적으면 탭·칩·배지가 서로 다른 이름을 쓰게 된다.
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
    // The quick shelf is a LISTING lane, so the fresh default is the listed (non-quarantined)
    // core inventory — a quarantined id persisted in favorites/MRU must not re-surface as a
    // picker affordance. Because this injection is already filtered, `listStudioQuickBrushTrayItems`
    // never re-filters it (callers who inject `catalogItems` own their lane's filtering).
    // Metadata RESOLUTION stays on the unfiltered SSOT via `studioCoreBrushCatalogItemById`.
    catalogItems: options.catalogItems ?? STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS,
  });
}
