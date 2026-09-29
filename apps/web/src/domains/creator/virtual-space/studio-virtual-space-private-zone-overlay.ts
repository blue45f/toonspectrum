import type { StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";

export interface StudioPrivateZoneOverlayShape {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly hasDoor: boolean;
}

/**
 * Private acoustic zones rendered as floor overlays in the Phaser canvas.
 * Pure geometry: the canvas draws these once per manifest.
 */
export function studioPrivateZoneOverlayShapes(
  zones: readonly StudioWorldAcousticZoneDefinition[] | undefined,
): readonly StudioPrivateZoneOverlayShape[] {
  if (!zones) return [];
  return zones
    .filter((zone) => zone.policy === "private")
    .map((zone) => ({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      hasDoor: zone.doorId !== undefined,
    }));
}

export interface StudioDashedRectGraphics {
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Stroke a dashed rectangle. The caller sets lineStyle first. */
export function strokeStudioDashedRect(
  graphics: StudioDashedRectGraphics,
  rect: RectLike,
  dash = 10,
  gap = 6,
): void {
  const edges = [
    { x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y },
    { x1: rect.x + rect.width, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height },
    { x1: rect.x + rect.width, y1: rect.y + rect.height, x2: rect.x, y2: rect.y + rect.height },
    { x1: rect.x, y1: rect.y + rect.height, x2: rect.x, y2: rect.y },
  ];
  for (const edge of edges) {
    const length = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
    if (!(length > 0)) continue;
    const dx = (edge.x2 - edge.x1) / length;
    const dy = (edge.y2 - edge.y1) / length;
    let cursor = 0;
    while (cursor < length) {
      const end = Math.min(cursor + dash, length);
      graphics.lineBetween(
        edge.x1 + dx * cursor,
        edge.y1 + dy * cursor,
        edge.x1 + dx * end,
        edge.y1 + dy * end,
      );
      cursor = end + gap;
    }
  }
}
