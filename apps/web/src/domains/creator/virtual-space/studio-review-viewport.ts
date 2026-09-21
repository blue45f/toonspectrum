import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

export interface ReviewScrollPosition { readonly x: number; readonly y: number }
export interface ReviewScrollMetrics {
  readonly scrollLeft: number; readonly scrollTop: number;
  readonly scrollWidth: number; readonly scrollHeight: number;
  readonly clientWidth: number; readonly clientHeight: number;
}
export const REVIEW_SCROLL_ORIGIN: ReviewScrollPosition = Object.freeze({ x: 0, y: 0 });
const unit = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const range = (content: number, viewport: number) => Number.isFinite(content) && Number.isFinite(viewport)
  ? Math.max(0, content - viewport) : 0;

/** Keep a logical position when a fit-width layout temporarily has no scrollable range. */
export function readReviewScrollPosition(metrics: ReviewScrollMetrics,
  prior: ReviewScrollPosition = REVIEW_SCROLL_ORIGIN): ReviewScrollPosition {
  const x = range(metrics.scrollWidth, metrics.clientWidth), y = range(metrics.scrollHeight, metrics.clientHeight);
  return { x: x > 0 ? unit(metrics.scrollLeft / x) : unit(prior.x),
    y: y > 0 ? unit(metrics.scrollTop / y) : unit(prior.y) };
}
export function reviewScrollTarget(position: ReviewScrollPosition, metrics: ReviewScrollMetrics) {
  return { left: unit(position.x) * range(metrics.scrollWidth, metrics.clientWidth),
    top: unit(position.y) * range(metrics.scrollHeight, metrics.clientHeight) };
}

/** Leased URLs and expiry are not image identity. A different page/source/digest resets the view. */
export function reviewPreviewIdentity(preview: StudioVirtualSpaceReviewPreview): string {
  const mapping = preview.mapping;
  return JSON.stringify([preview.ordinal, preview.sha256, mapping.status === "mapped"
    ? [mapping.sourceServerRevision, mapping.sourceContentDigest, mapping.page.id, mapping.page.ordinal,
      mapping.page.width, mapping.page.height, mapping.page.renderWidth, mapping.page.renderHeight]
    : [mapping.status, mapping.reason]]);
}
