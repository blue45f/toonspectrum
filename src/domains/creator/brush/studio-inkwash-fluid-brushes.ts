/**
 * Artist-facing InkWash tools that must start on the shared wet/fluid runtime.
 *
 * `inkwash-bleed-wash` and `inkwash-white-ink` stay on their existing dab engines.
 * This leaf is import-safe from pointer-start (no solver, no field, no DOM).
 */

export const STUDIO_INKWASH_FLUID_BRUSH_IDS = [
  "inkwash-pen",
  "inkwash-water-brush",
] as const;

export type StudioInkwashFluidBrushId = (typeof STUDIO_INKWASH_FLUID_BRUSH_IDS)[number];

export function isStudioInkwashFluidBrush(
  value: unknown,
): value is StudioInkwashFluidBrushId {
  return value === "inkwash-pen" || value === "inkwash-water-brush";
}
