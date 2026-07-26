import type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";

interface StudioFullBrushCatalogModule {
  readonly STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[];
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

export async function loadStudioFullBrushCatalogItems(): Promise<
  readonly StudioBrushCatalogItem[]
> {
  return (await loadStudioFullBrushCatalog()).STUDIO_ALL_BRUSH_CATALOG_ITEMS;
}

export async function loadStudioBrushCatalogItemById(
  brushId: unknown
): Promise<StudioBrushCatalogItem | null> {
  return (await loadStudioFullBrushCatalog()).studioBrushCatalogItemById(brushId);
}
