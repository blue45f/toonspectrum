/** Selection policy from the 2026-09-06 contact-sheet review.
 * This does not delete source files, legacy IDs, saved documents or user uploads.
 * Style labels describe the source, not a fabricated artistic quality score.
 */
export const STUDIO_VISUAL_QUARANTINED_ASSET_IDS = Object.freeze([
  "kenney-food-glass-wine",
  "original-soft-snow-overlay",
  "original-night-bokeh",
  "original-golden-dust",
] as const);

const quarantined: ReadonlySet<string> = new Set(STUDIO_VISUAL_QUARANTINED_ASSET_IDS);

export function isStudioAssetVisuallySelectable(id: string): boolean {
  return !quarantined.has(id);
}

export interface StudioAssetPresentationInput {
  readonly id: string;
  readonly kind: string;
  readonly category: string;
  readonly provider?: string;
}

export type StudioAssetPresentationStyle = "detailed-pbr" | "stylized-3d" | "raster";
export type StudioAssetPresentationFilter = "all" | StudioAssetPresentationStyle;

export function studioAssetPresentationStyle(asset: StudioAssetPresentationInput): StudioAssetPresentationStyle {
  if (asset.kind !== "model") return "raster";
  return asset.provider === "Poly Haven" && asset.id.startsWith("polyhaven-")
    ? "detailed-pbr"
    : "stylized-3d";
}

export function studioAssetPresentationLabel(asset: StudioAssetPresentationInput): string {
  if (asset.kind === "effect-mask") return "투명 효과";
  if (asset.kind === "surface-texture") return "표면 재질";
  return studioAssetPresentationStyle(asset) === "detailed-pbr" ? "상세 PBR 3D" : "스타일 3D";
}

export function isStudioAssetAssemblyKit(asset: StudioAssetPresentationInput): boolean {
  if (asset.kind !== "model") return false;
  return asset.id.startsWith("kenney-building-")
    || asset.id.startsWith("kenney-roads-")
    || /^kenney-furniture-(?:wall|floor|stairs)(?:-|$)/u.test(asset.id)
    || asset.id.startsWith("polyhaven-modular-street-seating");
}

export function filterStudioAssetPresentation<T extends StudioAssetPresentationInput>(
  assets: readonly T[],
  style: StudioAssetPresentationFilter = "all",
  includeAssembly = false,
): readonly T[] {
  return assets.filter(asset => isStudioAssetVisuallySelectable(asset.id)
    && (includeAssembly || !isStudioAssetAssemblyKit(asset))
    && (style === "all" || studioAssetPresentationStyle(asset) === style));
}

export function studioAssetPreviewBackground(asset: StudioAssetPresentationInput): string {
  return asset.kind === "effect-mask" ? "#343943" : "#cbd0d8";
}
