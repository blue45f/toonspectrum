/**
 * StudioVirtualSpace minimap geometry.
 *
 * Pure functions only: world ↔ minimap coordinate conversion and zone/screen
 * rect/polygon mapping. Rendering lives in `StudioVirtualSpaceMinimap.tsx`.
 *
 * Zone kind classification ("public" | "private" | "silent" | "spotlight") is
 * intentionally an input here rather than derived from the world manifest, so
 * the parent can map whatever zone metadata it has (acoustic policy, spotlight
 * program state, silent-booth booking) without this module inventing rules.
 */

export type StudioMinimapZoneKind = "public" | "private" | "silent" | "spotlight";

export interface StudioMinimapZone {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: StudioMinimapZoneKind;
}

export interface StudioMinimapScreen {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioMinimapPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioMinimapRect extends StudioMinimapPoint {
  readonly width: number;
  readonly height: number;
}

/**
 * Aspect-fit viewport that maps a world rectangle into a minimap rectangle.
 * The world is centered in the view; unused space becomes letterboxing.
 */
export interface StudioMinimapViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function createMinimapViewport(
  worldWidth: number,
  worldHeight: number,
  viewWidth: number,
  viewHeight: number,
  padding = 4,
): StudioMinimapViewport {
  const safeWorldWidth = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 1;
  const safeWorldHeight = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 1;
  const innerWidth = Math.max(1, viewWidth - padding * 2);
  const innerHeight = Math.max(1, viewHeight - padding * 2);
  const scale = Math.min(innerWidth / safeWorldWidth, innerHeight / safeWorldHeight);
  return {
    scale,
    offsetX: (viewWidth - safeWorldWidth * scale) / 2,
    offsetY: (viewHeight - safeWorldHeight * scale) / 2,
    width: viewWidth,
    height: viewHeight,
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight,
  };
}

/** World point → minimap point (SVG/canvas pixel space). */
export function worldToMinimap(viewport: StudioMinimapViewport, point: StudioMinimapPoint): StudioMinimapPoint {
  return Object.freeze({
    x: round2(viewport.offsetX + point.x * viewport.scale),
    y: round2(viewport.offsetY + point.y * viewport.scale),
  });
}

/** Minimap point → world point. Used to resolve a click into a teleport target. */
export function minimapToWorld(viewport: StudioMinimapViewport, point: StudioMinimapPoint): StudioMinimapPoint {
  const scale = viewport.scale > 0 ? viewport.scale : 1;
  return Object.freeze({
    x: round2((point.x - viewport.offsetX) / scale),
    y: round2((point.y - viewport.offsetY) / scale),
  });
}

/** Clamp a world point inside the world bounds so a teleport never lands outside. */
export function clampToWorld(
  viewport: StudioMinimapViewport,
  point: StudioMinimapPoint,
  margin = 20,
): StudioMinimapPoint {
  const x = Math.min(Math.max(point.x, margin), viewport.worldWidth - margin);
  const y = Math.min(Math.max(point.y, margin), viewport.worldHeight - margin);
  return Object.freeze({ x: round2(x), y: round2(y) });
}

/** World rect → minimap rect, e.g. for a zone fill or a screen object marker. */
export function minimapZoneRect(viewport: StudioMinimapViewport, zone: StudioMinimapRect): StudioMinimapRect {
  const topLeft = worldToMinimap(viewport, { x: zone.x, y: zone.y });
  return Object.freeze({
    x: topLeft.x,
    y: topLeft.y,
    width: round2(zone.width * viewport.scale),
    height: round2(zone.height * viewport.scale),
  });
}

/**
 * Rect expressed as an SVG polygon point list ("x,y x,y …"), clockwise from the
 * top-left corner. Zones are rects today, but the minimap renders polygons so
 * non-rectangular rooms can slot in later without touching the component.
 */
export function minimapZonePolygonPoints(viewport: StudioMinimapViewport, zone: StudioMinimapRect): string {
  const rect = minimapZoneRect(viewport, zone);
  const x2 = round2(rect.x + rect.width);
  const y2 = round2(rect.y + rect.height);
  return `${rect.x},${rect.y} ${x2},${rect.y} ${x2},${y2} ${rect.x},${y2}`;
}

/** Point-in-minimap test for hit handling (e.g. ignoring clicks outside the world). */
export function minimapContains(viewport: StudioMinimapViewport, point: StudioMinimapPoint): boolean {
  const world = minimapToWorld(viewport, point);
  return world.x >= 0 && world.x <= viewport.worldWidth && world.y >= 0 && world.y <= viewport.worldHeight;
}
