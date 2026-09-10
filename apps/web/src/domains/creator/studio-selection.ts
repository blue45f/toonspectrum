/**
 * Studio object-selection facade.
 *
 * Geometry, hit testing, set algebra, and layout live in focused pure modules so the canvas,
 * layer navigator, keyboard commands, and tests can share one deterministic contract.
 */
import { normalizeRectGeometry, type Rect } from "./selection/studio-object-selection-geometry";

export * from "./selection/studio-object-selection-geometry";
export * from "./selection/studio-object-selection-layout";
export * from "./selection/studio-object-selection-marquee";
export * from "./selection/studio-object-selection-pick";
export * from "./selection/studio-object-selection-set";

export type CanvasPlacementFootprint = {
  width: number;
  height: number;
  margin?: number;
};

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampPlacementAxis(center: number, extent: number, canvasExtent: number, margin: number) {
  const safeCanvasExtent = Math.max(1, finiteOr(canvasExtent, 1));
  const safeExtent = Math.max(0, finiteOr(extent));
  const safeMargin = Math.max(0, Math.min(finiteOr(margin), safeCanvasExtent / 2));
  const safeCenter = finiteOr(center, safeCanvasExtent / 2);
  if (safeExtent >= safeCanvasExtent - safeMargin * 2) return safeCanvasExtent / 2;
  return Math.min(
    Math.max(safeCenter, safeMargin + safeExtent / 2),
    safeCanvasExtent - safeMargin - safeExtent / 2
  );
}

/** Keep a center-anchored insertion's full footprint inside the document whenever it can fit. */
export function clampCanvasPlacementCenter(
  canvasW: number,
  canvasH: number,
  center: { x: number; y: number },
  footprint: CanvasPlacementFootprint
): [number, number] {
  return [
    clampPlacementAxis(center.x, footprint.width, canvasW, footprint.margin ?? 0),
    clampPlacementAxis(center.y, footprint.height, canvasH, footprint.margin ?? 0),
  ];
}

/** Studio spawn order: selected frame, visible viewport center, then document center. */
export function viewportSpawnCenter(
  canvasW: number,
  canvasH: number,
  selectedFrame?: Rect | null,
  viewCenter?: { x: number; y: number } | null
): [number, number] {
  const safeCanvasW = Math.max(1, finiteOr(canvasW, 1));
  const safeCanvasH = Math.max(1, finiteOr(canvasH, 1));
  if (selectedFrame) {
    const frame = normalizeRectGeometry(selectedFrame);
    return [frame.x + frame.w / 2, frame.y + frame.h / 2];
  }
  if (viewCenter && Number.isFinite(viewCenter.x) && Number.isFinite(viewCenter.y)) {
    return [
      Math.min(Math.max(viewCenter.x, 0), safeCanvasW),
      Math.min(Math.max(viewCenter.y, 0), safeCanvasH),
    ];
  }
  return [safeCanvasW / 2, safeCanvasH / 2];
}
