/**
 * Composited DOMRect edges use finite precision: CSS 44px controls have been observed as
 * 43.999996185302734px and 43.999969482421875px at DPR 1.5/2. Compare at millipixel
 * precision, far finer than a layout/pixel unit. An actual 43.999px control still fails.
 */
export function meetsStudioMinimumTouchTarget(
  bounds: { readonly width: number; readonly height: number },
): boolean {
  return Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
    && Math.round(bounds.width * 1_000) / 1_000 >= 44
    && Math.round(bounds.height * 1_000) / 1_000 >= 44;
}
