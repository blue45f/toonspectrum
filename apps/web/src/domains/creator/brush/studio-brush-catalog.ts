/**
 * Product-facing Studio brush catalogue.
 *
 * The renderer still owns a larger internal registry, but the picker, search, material tabs,
 * favorites and recents expose only the curated quality portfolio. A brush earns a product slot
 * only when its material result or hand feel is meaningfully distinct.
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
import {
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
} from "./studio-brush-quality-portfolio";
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
        runtimeBrushId: descriptor.runtimeBrushId,
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
      }),
    ),
  );

/** Internal renderer registry. It is not the user-facing brush list. */
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
    ? STUDIO_BRUSH_CATALOG_BY_ID.get(brushId) ?? null
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

/** The only product-facing brush inventory. */
export const STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  materializeProductPortfolio();

/**
 * Historical export names remain for call-site compatibility, but all product lanes now resolve
 * to the same curated portfolio. There is no hidden "all registered brushes" escape hatch.
 */
export const STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS =
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS;

export const STUDIO_SEARCHABLE_ALL_BRUSH_CATALOG_ITEMS =
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS;

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

export const STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS =
  STUDIO_DEFAULT_QUALITY_PAINT_BRUSH_CATALOG_ITEMS;

export const STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS =
  STUDIO_DEFAULT_QUALITY_ERASER_BRUSH_CATALOG_ITEMS;

function operationInventory(
  operation: StudioToolOperation | undefined,
): readonly StudioBrushCatalogItem[] {
  return operation === undefined
    ? STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS
    : STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.filter(
        (item) => item.operation === operation,
      );
}

export function filterStudioBrushCatalogItems(options: {
  operation?: StudioToolOperation;
  category?: StudioBrushTrayCategory | "favorites" | "recent";
  query?: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
} = {}): StudioBrushCatalogItem[] {
  const { operation, ...libraryOptions } = options;
  const query = (libraryOptions.query ?? "").trim();
  const pinnedLane =
    libraryOptions.category === "favorites" ||
    libraryOptions.category === "recent";
  const category = query && !pinnedLane ? "all" : libraryOptions.category;

  return filterStudioBrushLibraryItems({
    ...libraryOptions,
    category,
    query,
    catalogItems: operationInventory(operation),
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
    const item = byId.get(id);
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
