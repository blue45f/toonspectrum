import type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";

interface StudioFullBrushCatalogModule {
  readonly STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[];
  readonly STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[];
  studioBrushCatalogItemById(brushId: unknown): StudioBrushCatalogItem | null;
}

let studioFullBrushCatalogPromise: Promise<StudioFullBrushCatalogModule> | null = null;

/**
 * One cached dynamic boundary shared by the quick shelf and current-brush summary.
 *
 * Failed loads are retryable: a transient deployment/HMR chunk error must not permanently hide a
 * user's persisted pro favorite for the rest of the editing session.
 */
export function loadStudioFullBrushCatalog(): Promise<StudioFullBrushCatalogModule> {
  studioFullBrushCatalogPromise ??= import("./studio-brush-catalog").catch((error) => {
    studioFullBrushCatalogPromise = null;
    throw error;
  });
  return studioFullBrushCatalogPromise;
}

/**
 * RESOLUTION lane: the unfiltered SSOT, including quarantined ids, so saved-document metadata and
 * current-brush summaries never lose a persisted preset. Never feed this into a picker listing.
 */
export async function loadStudioFullBrushCatalogItems(): Promise<
  readonly StudioBrushCatalogItem[]
> {
  return (await loadStudioFullBrushCatalog()).STUDIO_ALL_BRUSH_CATALOG_ITEMS;
}

/**
 * LISTING lane: the complete non-quarantined product inventory in quality-first order. The audited
 * representatives stay at the front, while safe engine/procedural variants remain discoverable by
 * material, search, favorites, and recents. `loadStudioBrushCatalogItemById` stays unfiltered so
 * saved documents can still resolve replay-only quarantined identities.
 */
export async function loadStudioListedBrushCatalogItems(): Promise<
  readonly StudioBrushCatalogItem[]
> {
  return (await loadStudioFullBrushCatalog()).STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS;
}

export async function loadStudioBrushCatalogItemById(
  brushId: unknown
): Promise<StudioBrushCatalogItem | null> {
  return (await loadStudioFullBrushCatalog()).studioBrushCatalogItemById(brushId);
}
