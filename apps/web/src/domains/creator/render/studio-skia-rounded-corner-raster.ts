export interface StudioSkiaRoundedCornerRasterInput {
  readonly target: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly contentOffsetX: number;
  readonly contentOffsetY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly radius: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Applies the authored rounded image frame before filters are evaluated.
 * The 2x2 sub-pixel coverage keeps the edge deterministic without a readback.
 */
export function applyStudioSkiaRoundedCornerAlphaToPixels(
  input: StudioSkiaRoundedCornerRasterInput,
): boolean {
  const {
    target,
    width,
    height,
    contentOffsetX,
    contentOffsetY,
    contentWidth,
    contentHeight,
  } = input;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || target.length !== width * height * 4
    || ![
      contentOffsetX,
      contentOffsetY,
      contentWidth,
      contentHeight,
      input.radius,
    ].every(finite)
    || contentOffsetX < 0
    || contentOffsetY < 0
    || contentWidth <= 0
    || contentHeight <= 0
    || input.radius < 0
  ) return false;

  const radius = Math.min(input.radius, contentWidth / 2, contentHeight / 2);
  if (radius <= 0) return true;
  const left = contentOffsetX;
  const top = contentOffsetY;
  const right = left + contentWidth;
  const bottom = top + contentHeight;
  const sampleOffsets = [0.25, 0.75] as const;
  const inside = (x: number, y: number): boolean => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const cornerX = x < left + radius
      ? left + radius
      : x > right - radius ? right - radius : x;
    const cornerY = y < top + radius
      ? top + radius
      : y > bottom - radius ? bottom - radius : y;
    const dx = x - cornerX;
    const dy = y - cornerY;
    return dx * dx + dy * dy <= radius * radius;
  };
  const minX = Math.max(0, Math.floor(left));
  const minY = Math.max(0, Math.floor(top));
  const maxX = Math.min(width, Math.ceil(right));
  const maxY = Math.min(height, Math.ceil(bottom));
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const inHorizontalBody = x >= left + radius && x + 1 <= right - radius;
      const inVerticalBody = y >= top + radius && y + 1 <= bottom - radius;
      if (inHorizontalBody || inVerticalBody) continue;
      let accepted = 0;
      for (const offsetY of sampleOffsets) {
        for (const offsetX of sampleOffsets) {
          if (inside(x + offsetX, y + offsetY)) accepted += 1;
        }
      }
      if (accepted === 4) continue;
      const alphaOffset = (y * width + x) * 4 + 3;
      target[alphaOffset] = Math.round(target[alphaOffset]! * (accepted / 4));
    }
  }
  return true;
}
