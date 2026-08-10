/**
 * Explicit product admission for the page-wide Living Ink surface.
 *
 * Catalogue ids describe an artist-facing preset, not its renderer. In particular, the
 * `watercolor-*` and `sumi-*` packs are backed by airbrush, dry-media, or ink-particle plus their
 * own dynamics. A name match must never replace those presets with the generic Living Ink recipe.
 *
 * Even the exact built-ins stay on the ordinary DrawEl path until the artist opts into physical
 * mode. That keeps one visible element per stroke, preserves the current canvas paper, and makes
 * live/committed geometry follow the same renderer by default.
 */

const STUDIO_LIVING_INK_EXPLICIT_BRUSH_IDS = new Set([
  "watercolor",
  "ink-wash",
  "sumi",
  "sumi-e",
]);

function normalizedId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Returns a stable opt-in key only when catalogue identity and runtime identity describe the same
 * exact built-in. Extended presets intentionally return null even when their names contain
 * `watercolor`, `ink-wash`, or `sumi`.
 */
export function studioLivingInkExplicitBrushKey(
  brushId: string | null | undefined,
  catalogId: string | null | undefined,
): string | null {
  const runtime = normalizedId(brushId);
  const catalog = normalizedId(catalogId);
  if (!runtime || !STUDIO_LIVING_INK_EXPLICIT_BRUSH_IDS.has(runtime)) return null;
  if (catalog && catalog !== runtime) return null;
  return `${runtime}\u001f${catalog ?? runtime}`;
}

export function studioLivingInkSupportsExplicitBrush(
  brushId: string | null | undefined,
  catalogId: string | null | undefined,
): boolean {
  return studioLivingInkExplicitBrushKey(brushId, catalogId) !== null;
}

export function studioLivingInkAdmitsBrush(input: Readonly<{
  brushId: string | null | undefined;
  catalogId: string | null | undefined;
  physicalModeEnabled: boolean;
}>): boolean {
  return input.physicalModeEnabled
    && studioLivingInkSupportsExplicitBrush(input.brushId, input.catalogId);
}
