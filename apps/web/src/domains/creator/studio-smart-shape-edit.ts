import { validatePayload } from "./live/studio-crdt-document-payload";
import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { DEFAULT_SHAPE_PARAMS } from "./brush/studio-stroke-shapes";
import { decimateStrokeHandles } from "./studio-node-edit";
import { promoteFreehandQuickShapeOnRelease } from "./studio-quickshape";
import {
  applyStudioSmartShapeBrushEffect,
} from "./studio-smart-shape-brush-effect";

import {
  readStudioSmartShapeSnapshot, studioSmartShapeEditReason, STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES,
  type StudioSmartShapeEditKind,
} from "./studio-smart-shape-snapshot";

import type { DrawEl } from "./studio-element-model";

// Retain the public API while keeping copy/eligibility paths independent of edit-time validation.
export {
  readStudioSmartShapeSnapshot, recentStudioSmartShapeStroke, studioSmartShapeEditReason,
  STUDIO_SMART_SHAPE_EDIT_KINDS, STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES,
  type StudioSmartShapeEditKind, type StudioSmartShapeEditSnapshot,
} from "./studio-smart-shape-snapshot";
export { moveStudioSmartShapePoint } from "./studio-smart-shape-geometry";

export function initialStudioSmartShapeKind(stroke: DrawEl): StudioSmartShapeEditKind {
  const snapshot = readStudioSmartShapeSnapshot(stroke);
  if (snapshot) return snapshot.kind;
  const match = promoteFreehandQuickShapeOnRelease(stroke.points);
  return match?.kind === "triangle" ? "polygon" : match?.kind ?? "polyline";
}

export function studioSmartShapeBounds(points: readonly number[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let index = 0; index < points.length; index += 2) {
    left = Math.min(left, points[index]!); right = Math.max(right, points[index]!);
    top = Math.min(top, points[index + 1]!); bottom = Math.max(bottom, points[index + 1]!);
  }
  return { left, top, width: right - left, height: bottom - top };
}

export function createStudioSmartShapePath(stroke: DrawEl, kind: StudioSmartShapeEditKind): number[] {
  const original = readStudioSmartShapeSnapshot(stroke)?.original ?? stroke;
  const points = original.points;
  if (kind === "polyline") {
    return decimateStrokeHandles(points, { maxHandles: 12, minSpacingPx: 18 }).flatMap(({ x, y }) => [x, y]);
  }
  if (kind === "curve") {
    const middle = Math.floor(points.length / 4) * 2;
    const start = points.slice(0, 2), end = points.slice(-2), control = points.slice(middle, middle + 2);
    return Array.from({ length: 33 }, (_, index) => {
      const t = index / 32, s = 1 - t;
      return [s * s * start[0]! + 2 * s * t * control[0]! + t * t * end[0]!,
        s * s * start[1]! + 2 * s * t * control[1]! + t * t * end[1]!];
    }).flat();
  }
  const box = studioSmartShapeBounds(points);
  const match = promoteFreehandQuickShapeOnRelease(points);
  const bounds = kind === "line"
    ? match?.kind === "line" ? match.points : [...points.slice(0, 2), ...points.slice(-2)]
    : [box.left, box.top, box.left + Math.max(1, box.width), box.top + Math.max(1, box.height)];
  const result = applyStudioSmartShapeBrushEffect({
    ...original, kind, points: bounds,
    shapeParams: { ...DEFAULT_SHAPE_PARAMS, polygonSides: match?.kind === "triangle" ? 3 : match?.polygonSides ?? 5 },
  }, original);
  return result.status === "applied" ? result.stroke.points : [...points];
}

export function transformStudioSmartShapePath(points: readonly number[], scale: number, degrees: number): number[] {
  const box = studioSmartShapeBounds(points);
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const safeScale = Number.isFinite(scale) ? Math.min(10, Math.max(0.05, scale)) : 1;
  const angle = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return points.map((_, index) => {
    const offset = index - index % 2, x = (points[offset]! - cx) * safeScale, y = (points[offset + 1]! - cy) * safeScale;
    return index % 2 === 0 ? cx + x * cosine - y * sine : cy + x * sine + y * cosine;
  });
}

/** Existing point handles share page coordinates; Shift snaps a moved point relative to its neighbor. */
export function commitStudioSmartShapeEdit(stroke: DrawEl, kind: StudioSmartShapeEditKind, points: number[]): DrawEl | null {
  if (studioSmartShapeEditReason(stroke) || points.length < 4 || points.length % 2 !== 0
    || points.length > STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES
    || points.some((point) => !Number.isFinite(point) || Math.abs(point) > 1_000_000)) return null;
  const original = structuredClone(readStudioSmartShapeSnapshot(stroke)?.original ?? stroke);
  delete original.smartShape;
  const result: DrawEl = { ...stroke, kind: "freehand", points: [...points], smartShape: { version: 1, kind, original } };
  const channels = ["pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures", "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets"] as const;
  for (const field of channels) {
    const source = stroke[field];
    if (!source?.length) continue;
    result[field] = Array.from({ length: points.length / 2 }, (_, index) => {
      const position = index / Math.max(1, points.length / 2 - 1) * (source.length - 1);
      const low = Math.floor(position), high = Math.min(source.length - 1, low + 1);
      return source[low]! + (source[high]! - source[low]!) * (position - low);
    });
  }
  try { validatePayload(studioDrawElementToCrdtStroke("smart-shape-check", result).payload, false); }
  catch { return null; }
  return result;
}

export function restoreStudioSmartShapeOriginal(stroke: DrawEl): DrawEl | null {
  const snapshot = readStudioSmartShapeSnapshot(stroke);
  return snapshot ? structuredClone(snapshot.original) : null;
}
