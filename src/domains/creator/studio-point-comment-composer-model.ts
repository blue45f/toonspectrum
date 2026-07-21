export interface StudioPointCommentViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StudioPointCommentComposerPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Keeps the compact composer beside the click while respecting the visual viewport/keyboard. */
export function planStudioPointCommentComposerPosition(options: {
  point: { x: number; y: number };
  viewport: StudioPointCommentViewportBounds;
  measuredCard?: { width: number; height: number };
}): StudioPointCommentComposerPosition {
  const margin = 12;
  const gap = 16;
  const viewportWidth = Math.max(1, options.viewport.width);
  const viewportHeight = Math.max(1, options.viewport.height);
  const width = Math.min(
    Math.max(240, options.measuredCard?.width ?? 336),
    Math.max(1, viewportWidth - margin * 2)
  );
  const height = Math.min(
    Math.max(176, options.measuredCard?.height ?? 224),
    Math.max(1, viewportHeight - margin * 2)
  );
  const minimumLeft = options.viewport.left + margin;
  const maximumLeft = options.viewport.left + viewportWidth - width - margin;
  const minimumTop = options.viewport.top + margin;
  const maximumTop = options.viewport.top + viewportHeight - height - margin;
  const pointX = Number.isFinite(options.point.x)
    ? options.point.x
    : options.viewport.left + viewportWidth / 2;
  const pointY = Number.isFinite(options.point.y)
    ? options.point.y
    : options.viewport.top + viewportHeight / 2;
  const placeRight = pointX <= options.viewport.left + viewportWidth / 2;
  const placeBelow = pointY <= options.viewport.top + viewportHeight * 0.58;

  return {
    left: clamp(
      placeRight ? pointX + gap : pointX - width - gap,
      minimumLeft,
      Math.max(minimumLeft, maximumLeft)
    ),
    top: clamp(
      placeBelow ? pointY + gap : pointY - height - gap,
      minimumTop,
      Math.max(minimumTop, maximumTop)
    ),
    width,
    maxHeight: Math.max(1, viewportHeight - margin * 2),
  };
}
