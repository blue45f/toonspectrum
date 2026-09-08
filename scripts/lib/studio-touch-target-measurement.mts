/**
 * A composited DOMRect can round a CSS 44px edge down to 43.999996185302734px.
 * Allow only that numeric noise; a genuinely smaller 43.999px target still fails.
 */
export function meetsStudioMinimumTouchTarget(
  bounds: { readonly width: number; readonly height: number },
): boolean {
  const floatingPointTolerance = 0.00001;
  return Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
    && bounds.width + floatingPointTolerance >= 44
    && bounds.height + floatingPointTolerance >= 44;
}
