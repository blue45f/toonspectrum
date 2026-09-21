import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

export type ReviewPageMatch =
  | { readonly kind: "matched"; readonly page: StudioVirtualSpaceReviewPreview }
  | { readonly kind: "unmapped" | "not-loaded" | "ambiguous" };

/** Ordinal, filename, geometry and visual similarity are never source identities. */
export function matchReviewSourcePage(source: StudioVirtualSpaceReviewPreview,
  candidates: readonly StudioVirtualSpaceReviewPreview[]): ReviewPageMatch {
  if (source.mapping.status !== "mapped") return { kind: "unmapped" };
  const id = source.mapping.page.id;
  const matches = candidates.filter((item) => item.mapping.status === "mapped" && item.mapping.page.id === id);
  if (matches.length > 1) return { kind: "ambiguous" };
  return matches[0] ? { kind: "matched", page: matches[0] } : { kind: "not-loaded" };
}

export function sameReviewSourcePage(left: StudioVirtualSpaceReviewPreview,
  right: StudioVirtualSpaceReviewPreview): boolean {
  return left.mapping.status === "mapped" && right.mapping.status === "mapped"
    && left.mapping.page.id === right.mapping.page.id;
}

export function reviewOverlayAllowed(left: StudioVirtualSpaceReviewPreview,
  right: StudioVirtualSpaceReviewPreview): boolean {
  if (!sameReviewSourcePage(left, right) || left.mapping.status !== "mapped" || right.mapping.status !== "mapped") return false;
  const a = left.mapping.page, b = right.mapping.page;
  return a.width === b.width && a.height === b.height
    && a.renderWidth === b.renderWidth && a.renderHeight === b.renderHeight;
}

/** Explicit relative position within an identified page; this does not claim cut correspondence. */
export function linkedReviewScroll(sourceTop: number, sourceRange: number, targetRange: number): number | null {
  if (![sourceTop, sourceRange, targetRange].every(Number.isFinite) || sourceRange <= 0 || targetRange < 0) return null;
  return Math.min(1, Math.max(0, sourceTop / sourceRange)) * targetRange;
}
