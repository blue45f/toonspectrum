/**
 * Product-facing Studio brush catalogue.
 *
 * The replay registry remains resolution-complete, the quality portfolio stays first-ranked, and
 * every non-quarantined brush is selectable through the full library, material tabs and search.
 * Favorites and recents may therefore restore advanced engine variants without widening the
 * always-visible quick shelf or eagerly loading procedural runtime code.
 */
import {
  listStudioQuickBrushTrayItems,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
  type StudioQuickBrushTrayItem,
} from "../studio-creative-ux";

import {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_BRUSH_LISTED_CATALOG_COUNTS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  listStudioCoreBrushCatalogItems,
  studioBrushCatalogKindLabel,
  type StudioBrushCatalogItem,
} from "./studio-brush-catalog-core";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import {
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
} from "./studio-brush-quality-portfolio";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";
import {
  STUDIO_V6_BRUSH_CATALOG_COUNT,
  STUDIO_V6_BRUSH_CATALOG_ITEMS,
  studioV6BrushCatalogItemById,
} from "./studio-brush-v6-catalog";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";

import type { StudioToolOperation } from "../studio-brush";

export {
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_BRUSH_LISTED_CATALOG_COUNTS,
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
        runtimeBrushId: descriptor.runtimeBrushId,
        name: descriptor.catalogName,
        shortName: descriptor.shortName,
        hint: descriptor.hint,
        searchAliases: Object.freeze([
          descriptor.category,
          descriptor.runtimeBrushId,
          descriptor.mediaGroup,
          "프로시저럴",
          "procedural",
        ]),
        defaultWidth: descriptor.defaultWidth,
        defaultOpacity: descriptor.defaultOpacity,
        operation: "paint" as const,
        category: "expressive" as const,
        mediaGroup: descriptor.mediaGroup,
        previewWeight: descriptor.previewWeight,
        previewStyle: descriptor.previewStyle,
        source: "pro" as const,
      }),
    ),
  );

/** Replay-complete renderer registry, including quarantined identities kept for old documents. */
export const STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze([
    ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
    ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
  ]);

export const STUDIO_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "paint"),
  );

export const STUDIO_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "erase"),
  );

const STUDIO_BRUSH_CATALOG_BY_ID: ReadonlyMap<string, StudioBrushCatalogItem> =
  new Map(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

export function studioBrushCatalogItemById(
  brushId: unknown,
): StudioBrushCatalogItem | null {
  return typeof brushId === "string"
    ? STUDIO_BRUSH_CATALOG_BY_ID.get(brushId)
      ?? studioV6BrushCatalogItemById(brushId)
      ?? null
    : null;
}

function materializeProductPortfolio(): readonly StudioBrushCatalogItem[] {
  const productItems = STUDIO_BRUSH_QUALITY_PORTFOLIO.map((entry) => {
    const item = STUDIO_BRUSH_CATALOG_BY_ID.get(entry.id);
    if (!item) {
      throw new Error(
        `Studio product brush portfolio references an unregistered brush: ${entry.id}`,
      );
    }
    if (item.source !== entry.source) {
      throw new Error(
        `Studio product brush source drift for ${entry.id}: ${item.source} != ${entry.source}`,
      );
    }
    if (isStudioBrushQuarantinedPresetId(item.id)) {
      throw new Error(
        `Studio product brush portfolio cannot expose quarantined brush: ${item.id}`,
      );
    }
    return item;
  });

  if (
    new Set(productItems.map((item) => item.id)).size !==
    STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS.length
  ) {
    throw new Error("Studio product brush portfolio contains duplicate catalogue ids");
  }

  return Object.freeze(productItems);
}

/** Quality-audited representatives used for ordering, starter recommendations and score gates. */
export const STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  materializeProductPortfolio();

const STUDIO_DEFAULT_QUALITY_BRUSH_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map((item) => item.id),
);

export function isStudioDefaultQualityBrushCatalogId(brushId: unknown): boolean {
  return typeof brushId === "string" && STUDIO_DEFAULT_QUALITY_BRUSH_ID_SET.has(brushId);
}

/**
 * Advanced, selectable rows that passed quarantine but are not one of the compact quality
 * representatives. Keeping this partition explicit lets the UI rank quality first without
 * silently dropping engine variants from the complete library.
 */
export const STUDIO_LISTED_EXTENDED_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) =>
        !isStudioBrushQuarantinedPresetId(item.id)
        && !STUDIO_DEFAULT_QUALITY_BRUSH_ID_SET.has(item.id),
    ),
  );

/** Complete selectable inventory: quality representatives first, then advanced variants. */
export const STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze([
    ...STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
    ...STUDIO_LISTED_EXTENDED_BRUSH_CATALOG_ITEMS,
  ]);

/**
 * Artist-facing complete library. V6 recipes sit directly after the audited representatives so
 * progressive rendering reaches them before the long tail of classic engine variants.
 */
export const STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze([
    ...STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
    ...STUDIO_V6_BRUSH_CATALOG_ITEMS,
    ...STUDIO_LISTED_EXTENDED_BRUSH_CATALOG_ITEMS,
  ]);

/** Classic searchable registry used by renderer audits and replay-safe tooling. */
export const STUDIO_SEARCHABLE_ALL_BRUSH_CATALOG_ITEMS =
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS;

export const STUDIO_DEFAULT_QUALITY_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.operation === "paint",
    ),
  );

export const STUDIO_DEFAULT_QUALITY_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.operation === "erase",
    ),
  );

export const STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.operation === "paint",
    ),
  );

export const STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.operation === "erase",
    ),
  );

export const STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "paint"),
  );

export const STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.operation === "erase"),
  );

export const STUDIO_BRUSH_LIBRARY_COUNTS = Object.freeze({
  classic: STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length,
  v6: STUDIO_V6_BRUSH_CATALOG_COUNT,
  total: STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.length,
  paint: STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS.length,
  erase: STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS.length,
});

const STUDIO_LIBRARY_BRUSH_CATALOG_BY_ID: ReadonlyMap<string, StudioBrushCatalogItem> =
  new Map(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]));

function operationInventory(
  operation: StudioToolOperation | undefined,
  includeV6: boolean,
): readonly StudioBrushCatalogItem[] {
  if (includeV6) {
    if (operation === undefined) return STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS;
    return operation === "erase"
      ? STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS
      : STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS;
  }
  if (operation === undefined) return STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS;
  return operation === "erase"
    ? STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS
    : STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS;
}

export function filterStudioBrushCatalogItems(options: {
  operation?: StudioToolOperation;
  category?: StudioBrushTrayCategory | "favorites" | "recent";
  query?: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  /** Include V6 material recipes on artist-facing library surfaces. */
  includeV6?: boolean;
} = {}): StudioBrushCatalogItem[] {
  const { operation, includeV6 = false, ...libraryOptions } = options;
  const query = (libraryOptions.query ?? "").trim();
  const pinnedLane =
    libraryOptions.category === "favorites" ||
    libraryOptions.category === "recent";
  const category = query && !pinnedLane ? "all" : libraryOptions.category;

  return filterStudioBrushLibraryItems({
    ...libraryOptions,
    category,
    query,
    catalogItems: operationInventory(operation, includeV6),
  }) as StudioBrushCatalogItem[];
}

function quickCatalogInventory(options: {
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
}): readonly StudioBrushCatalogItem[] {
  const byId = new Map(
    STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]),
  );

  for (const id of [
    ...(options.favoriteIds ?? []),
    ...(options.recentIds ?? []),
  ]) {
    const item = STUDIO_LIBRARY_BRUSH_CATALOG_BY_ID.get(id);
    if (item) byId.set(item.id, item);
  }

  return [...byId.values()];
}

export function listStudioQuickBrushCatalogItems(options: {
  catalogItems?: readonly StudioBrushTrayItem[];
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  limit?: number;
} = {}): StudioQuickBrushTrayItem[] {
  return listStudioQuickBrushTrayItems({
    ...options,
    catalogItems: options.catalogItems ?? quickCatalogInventory(options),
  });
}
