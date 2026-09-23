import type { El } from "../studio-element-model";
import {
  hasActiveImageFilters,
  type ImageFilterFields,
} from "./studio-konva-filter-fields";

export const STUDIO_SKIA_SPECIALIST_RASTER_ANIMATION_INTERVAL_MS = 80;

export type StudioSkiaSpecialistRasterElement =
  Extract<El, { type: "image" }> & ImageFilterFields;

// Mirrors the authoritative filter-mask surface ID contract without importing its Zod/schema graph
// into the Studio entry. Invalid external IDs remain outside retained-renderer admission.
const STUDIO_FILTER_MASK_SURFACE_ID_PATTERN =
  /^filter-mask:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function hasEnabledFilterMask(element: StudioSkiaSpecialistRasterElement): boolean {
  const hasSource = Boolean(element.filterMaskSrc)
    || (
      typeof element.filterMaskSurfaceId === "string"
      && STUDIO_FILTER_MASK_SURFACE_ID_PATTERN.test(element.filterMaskSurfaceId)
    );
  return hasSource && element.filterMaskEnabled !== false;
}

function hasEnabledLayerMask(element: StudioSkiaSpecialistRasterElement): boolean {
  return Boolean(element.maskSrc) && element.maskEnabled !== false;
}

/** Lightweight admission predicate. Pixel/filter preparation remains behind a dynamic boundary. */
export function requiresStudioSkiaSpecialistRaster(
  element: El,
): element is StudioSkiaSpecialistRasterElement {
  if (element.type !== "image") return false;
  return hasActiveImageFilters(element)
    || hasEnabledFilterMask(element)
    || hasEnabledLayerMask(element)
    || element.isAnimatedGif === true
    || (element.frames?.length ?? 0) > 1;
}
