export type StudioToolHintSide = "right" | "left" | "bottom" | "top";

export type StudioToolHintRect = Pick<
  DOMRect,
  "left" | "top" | "right" | "bottom" | "width" | "height"
>;

export type StudioToolHintViewport = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  source: "visual" | "layout";
}>;

export type StudioToolHintPosition = {
  left: number;
  top: number;
  side: StudioToolHintSide;
  arrowOffset: number;
};

type StudioToolHintPositionInput = {
  anchor: StudioToolHintRect;
  viewportWidth: number;
  viewportHeight: number;
  viewportLeft?: number;
  viewportTop?: number;
  popupWidth: number;
  popupHeight: number;
  /** Largest width this tooltip may grow to while it remains open. */
  selectionPopupWidth?: number;
  /** Largest height this tooltip may grow to while it remains open. */
  selectionPopupHeight?: number;
  /** Keeps measurement noise from flipping an already-visible bubble. */
  previousSide?: StudioToolHintSide;
  preferredSide?: StudioToolHintSide;
  sideFlipHysteresis?: number;
  gap?: number;
  viewportPadding?: number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Returns the visible CSS-pixel viewport. Mobile browser chrome, pinch zoom,
 * and the on-screen keyboard can make VisualViewport substantially smaller or
 * offset from the layout viewport used by `innerWidth`/`innerHeight`.
 */
export function readStudioToolHintViewport(): StudioToolHintViewport {
  const fallbackWidth = isPositiveFinite(globalThis.innerWidth) ? globalThis.innerWidth : 1280;
  const fallbackHeight = isPositiveFinite(globalThis.innerHeight) ? globalThis.innerHeight : 800;
  const visualViewport = globalThis.visualViewport;

  if (
    visualViewport &&
    isPositiveFinite(visualViewport.width) &&
    isPositiveFinite(visualViewport.height)
  ) {
    const left = finiteOr(visualViewport.offsetLeft, 0);
    const top = finiteOr(visualViewport.offsetTop, 0);
    return {
      left,
      top,
      right: left + visualViewport.width,
      bottom: top + visualViewport.height,
      width: visualViewport.width,
      height: visualViewport.height,
      source: "visual",
    };
  }

  return {
    left: 0,
    top: 0,
    right: fallbackWidth,
    bottom: fallbackHeight,
    width: fallbackWidth,
    height: fallbackHeight,
    source: "layout",
  };
}

export function isStudioToolHintRectVisible(
  rect: StudioToolHintRect,
  viewport: StudioToolHintViewport,
  minimumVisiblePixels = 1
): boolean {
  const visibleWidth = Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left);
  const visibleHeight = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
  return visibleWidth >= minimumVisiblePixels && visibleHeight >= minimumVisiblePixels;
}

/**
 * Viewport-safe rich-hint placement. It keeps the preferred rail side when it
 * fits, reserves room for a later rich-coach expansion, then clamps the bubble
 * and arrow to the actually visible viewport. A previously chosen side stays
 * sticky while it still fits the rendered popup and misses the reserved size
 * by only a small hysteresis margin.
 */
export function planStudioToolHintPosition({
  anchor,
  viewportWidth,
  viewportHeight,
  viewportLeft = 0,
  viewportTop = 0,
  popupWidth,
  popupHeight,
  selectionPopupWidth = popupWidth,
  selectionPopupHeight = popupHeight,
  previousSide,
  preferredSide = "right",
  sideFlipHysteresis = 18,
  gap = 12,
  viewportPadding = 8,
}: StudioToolHintPositionInput): StudioToolHintPosition {
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const room: Record<StudioToolHintSide, number> = {
    right: viewportRight - viewportPadding - anchor.right - gap,
    left: anchor.left - (viewportLeft + viewportPadding) - gap,
    bottom: viewportBottom - viewportPadding - anchor.bottom - gap,
    top: anchor.top - (viewportTop + viewportPadding) - gap,
  };
  const required: Record<StudioToolHintSide, number> = {
    right: Math.max(popupWidth, selectionPopupWidth),
    left: Math.max(popupWidth, selectionPopupWidth),
    bottom: Math.max(popupHeight, selectionPopupHeight),
    top: Math.max(popupHeight, selectionPopupHeight),
  };
  const renderedRequired: Record<StudioToolHintSide, number> = {
    right: popupWidth,
    left: popupWidth,
    bottom: popupHeight,
    top: popupHeight,
  };
  const preferredAxisOrder: StudioToolHintSide[] =
    preferredSide === "right" || preferredSide === "left"
      ? [preferredSide, preferredSide === "right" ? "left" : "right", "bottom", "top"]
      : [preferredSide, preferredSide === "bottom" ? "top" : "bottom", "right", "left"];
  const fittingSide = preferredAxisOrder.find((side) => room[side] >= required[side]);
  let side =
    fittingSide ??
    preferredAxisOrder.reduce((best, candidate) => (room[candidate] > room[best] ? candidate : best));

  if (
    previousSide &&
    previousSide !== side &&
    room[previousSide] >= renderedRequired[previousSide] &&
    room[previousSide] + sideFlipHysteresis >= required[previousSide]
  ) {
    side = previousSide;
  }

  const minLeft = viewportLeft + viewportPadding;
  const minTop = viewportTop + viewportPadding;
  const maxLeft = Math.max(minLeft, viewportRight - viewportPadding - popupWidth);
  const maxTop = Math.max(minTop, viewportBottom - viewportPadding - popupHeight);
  const anchorCenterX = anchor.left + anchor.width / 2;
  const anchorCenterY = anchor.top + anchor.height / 2;

  if (side === "right" || side === "left") {
    const left = clamp(
      side === "right" ? anchor.right + gap : anchor.left - gap - popupWidth,
      minLeft,
      maxLeft
    );
    const top = clamp(anchorCenterY - popupHeight / 2, minTop, maxTop);
    return {
      left,
      top,
      side,
      arrowOffset: clamp(anchorCenterY - top, 16, Math.max(16, popupHeight - 16)),
    };
  }

  const left = clamp(anchorCenterX - popupWidth / 2, minLeft, maxLeft);
  const top = clamp(
    side === "bottom" ? anchor.bottom + gap : anchor.top - gap - popupHeight,
    minTop,
    maxTop
  );
  return {
    left,
    top,
    side,
    arrowOffset: clamp(anchorCenterX - left, 16, Math.max(16, popupWidth - 16)),
  };
}
