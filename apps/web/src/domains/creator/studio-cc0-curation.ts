import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";

export type StudioCc0StyleFilter = "all" | "detailed" | "stylized";
export interface StudioCc0CurationOptions {
  readonly includeComponents?: boolean;
  readonly style?: StudioCc0StyleFilter;
}

export type StudioCc0ReviewStatus = "unreviewed" | "contact-sheet-reviewed" | "excluded";

const EXCLUDED_CURATION_STATUSES = new Set([
  "quarantine", "quarantined", "quarantine-from-new-selection", "rejected", "failed",
  "retired", "retire-rotation-duplicate", "legacy-reference-not-wearable",
]);

/** New review protocols require an explicit level/status pair here. A truthy flag,
 * supplier name or an unfamiliar higher-sounding level cannot grant admission.
 */
const ACCEPTED_VISUAL_REVIEWS: readonly {
  readonly level: string;
  readonly curationStatus: string;
  readonly status: Exclude<StudioCc0ReviewStatus, "unreviewed" | "excluded">;
}[] = Object.freeze([
  Object.freeze({
    level: "contact-sheet-visual-triage",
    curationStatus: "selected-after-visual-triage",
    status: "contact-sheet-reviewed",
  }),
]);

/** Confirmed in the actual 2026-09-06 review, sheet 10, item 228.
 * Keep its original URL for existing works; do not offer it for new insertion.
 */
export const STUDIO_CC0_QUARANTINED_IDS: readonly string[] = Object.freeze([
  "kenney-food-glass-wine",
]);

/** Assembly components are useful, but are not finished backgrounds/props. */
export function isStudioCc0AssemblyComponent(asset: Pick<StudioCc0Asset, "id" | "role">): boolean {
  if (asset.role === "assembly-component") return true;
  const id = asset.id;
  return id.startsWith("kenney-building-")
    || /^kenney-furniture-(?:floor|wall|panelling)(?:-|$)/u.test(id)
    || /^kenney-nature-(?:cliff|ground|path|platform|bridge-center|bridge-side)(?:-|$)/u.test(id)
    || /^kenney-survival-(?:floor|metal-panel|structure|tent-frame)(?:-|$)/u.test(id)
    || /^kenney-suburban-(?:driveway|fence|path)(?:-|$)/u.test(id)
    || /^kenney-roads-(?:bridge-pillar|electricity-wires|road|tile|sign-object|traffic-light-object)(?:-|$)/u.test(id)
    || /^kenney-watercraft-(?:arrow|gate)(?:-|$)/u.test(id)
    || id === "polyhaven-modular-street-seating";
}

export function isStudioCc0Quarantined(asset: Pick<StudioCc0Asset, "id" | "role" | "curationStatus">): boolean {
  return STUDIO_CC0_QUARANTINED_IDS.includes(asset.id)
    || EXCLUDED_CURATION_STATUSES.has(asset.curationStatus ?? "")
    || asset.role === "legacy-reference-not-wearable";
}

export function getStudioCc0ReviewStatus(asset: StudioCc0Asset): StudioCc0ReviewStatus {
  if (isStudioCc0Quarantined(asset)) return "excluded";
  if (asset.visualReviewed !== true || !asset.visualReviewSource?.trim()) return "unreviewed";
  const review = ACCEPTED_VISUAL_REVIEWS.find((entry) =>
    entry.level === asset.visualReviewLevel && entry.curationStatus === asset.curationStatus);
  return review?.status ?? "unreviewed";
}

export function studioCc0ReviewLabel(asset: StudioCc0Asset): string {
  const status = getStudioCc0ReviewStatus(asset);
  if (status === "excluded") return "신규 선택 제외";
  if (status === "contact-sheet-reviewed") return "미리보기 검수";
  return "시각 검수 전";
}

export function isStudioCc0EligibleForNewSelection(asset: StudioCc0Asset): boolean {
  const status = getStudioCc0ReviewStatus(asset);
  if (status === "excluded") return false;
  return asset.kind !== "model"
    || (asset.browserRenderVerified === true && status === "contact-sheet-reviewed");
}

function hasDetailedStyle(asset: Pick<StudioCc0Asset, "provider" | "style">): boolean {
  if (asset.style && /stylized|low-poly/u.test(asset.style)) return false;
  if (asset.style && /pbr|photoreal|detailed/u.test(asset.style)) return true;
  // Legacy supplier fallback describes expression only. Admission is checked separately.
  return asset.provider === "Poly Haven";
}

export function studioCc0StyleLabel(asset: Pick<StudioCc0Asset, "kind" | "provider" | "style">): string {
  if (asset.kind !== "model") return asset.kind === "effect-mask" ? "투명 효과" : "원본 표면 재질";
  return hasDetailedStyle(asset) ? "디테일 PBR" : "스타일라이즈 · 로우폴리";
}

/** Apply after the ordinary text/kind filter; default selection hides parts.
 * This also protects against a stale cached manifest offering a quarantined ID.
 * Stable copies preserve the source array and every retained asset identity.
 */
export function curateStudioCc0Selection(
  assets: readonly StudioCc0Asset[],
  options: StudioCc0CurationOptions = {},
): readonly StudioCc0Asset[] {
  return assets.filter((asset) => {
    if (!isStudioCc0EligibleForNewSelection(asset)) return false;
    if (!options.includeComponents && isStudioCc0AssemblyComponent(asset)) return false;
    if (options.style === "detailed" && !hasDetailedStyle(asset)) return false;
    if (options.style === "stylized" && (asset.kind !== "model" || hasDetailedStyle(asset))) return false;
    return true;
  }).toSorted((a, b) => Number(hasDetailedStyle(b)) - Number(hasDetailedStyle(a)));
}
