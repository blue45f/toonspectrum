import { STUDIO_CRDT_METADATA_MAX_BYTES } from "./live/studio-crdt-document-constants";
import { payloadMetadataByteLength, validatePayload } from "./live/studio-crdt-document-payload";
import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { DEFAULT_SHAPE_PARAMS } from "./brush/studio-stroke-shapes";
import { decimateStrokeHandles } from "./studio-node-edit";
import { promoteFreehandQuickShapeOnRelease } from "./studio-quickshape";
import {
  applyStudioSmartShapeBrushEffect,
  resolveStudioSmartShapeBrushEffectAvailability,
} from "./studio-smart-shape-brush-effect";

import type { DrawEl, El } from "./studio-element-model";

export const STUDIO_SMART_SHAPE_EDIT_KINDS = ["line", "curve", "polyline", "rect", "ellipse", "polygon"] as const;
export type StudioSmartShapeEditKind = (typeof STUDIO_SMART_SHAPE_EDIT_KINDS)[number];
export interface StudioSmartShapeEditSnapshot {
  version: 1;
  kind: StudioSmartShapeEditKind;
  /** Exact authored stroke, without another nested correction snapshot. */
  original: DrawEl;
}
export const STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES = 16_384;
const MAX_SNAPSHOT_BYTES = 1_000_000;

export function studioSmartShapeEditReason(stroke: DrawEl | null | undefined): string | null {
  if (!stroke) return "교정할 펜 스트로크를 먼저 그려 주세요.";
  if (stroke.smartShape !== undefined && !readStudioSmartShapeSnapshot(stroke)) return "저장된 도형 원본이 손상되어 교정할 수 없어요.";
  if ((stroke.kind ?? "freehand") !== "freehand") return "자유선 스트로크를 선택해 주세요.";
  if (!Array.isArray(stroke.points) || stroke.points.length < 4 || stroke.points.length % 2 !== 0
    || stroke.points.length > STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES
    || stroke.points.some((point) => !Number.isFinite(point) || Math.abs(point) > 1_000_000)) {
    return "이 스트로크의 좌표 또는 크기로는 도형을 편집할 수 없어요.";
  }
  if (resolveStudioSmartShapeBrushEffectAvailability(stroke).status !== "available") {
    return "이 브러시는 원래 획을 보존해야 해서 도형 교정을 지원하지 않아요.";
  }
  try {
    if (JSON.stringify(stroke).length > MAX_SNAPSHOT_BYTES) return "원본을 보존하기에 스트로크가 너무 커요.";
    const withSnapshot = stroke.smartShape ? stroke : { ...stroke, smartShape: { version: 1, kind: "line", original: stroke } };
    if (payloadMetadataByteLength(studioDrawElementToCrdtStroke("smart-shape-check", withSnapshot).payload) > STUDIO_CRDT_METADATA_MAX_BYTES) {
      return "원본을 함께 저장하기에는 스트로크가 너무 커요. 더 짧은 스트로크를 그려 주세요.";
    }
  } catch { return "원본 스트로크를 읽을 수 없어요."; }
  return null;
}

export function readStudioSmartShapeSnapshot(stroke: DrawEl): StudioSmartShapeEditSnapshot | null {
  const value = stroke.smartShape;
  if (!value || value.version !== 1 || !STUDIO_SMART_SHAPE_EDIT_KINDS.includes(value.kind)
    || !value.original || value.original.type !== "draw" || value.original.id !== stroke.id
    || value.original.smartShape !== undefined || studioSmartShapeEditReason(value.original)) return null;
  return value;
}

/** A selected corrected stroke can be reopened; otherwise the most recent drawing is authoritative. */
export function recentStudioSmartShapeStroke(elements: readonly El[], selectedId?: string | null): DrawEl | null {
  const selected = elements.find((element) => element.id === selectedId);
  if (selected?.type === "draw" && readStudioSmartShapeSnapshot(selected)) return selected;
  return elements.findLast((element): element is DrawEl => element.type === "draw") ?? null;
}

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
export function moveStudioSmartShapePoint(points: readonly number[], index: number, x: number, y: number, snap = false): number[] {
  if (!Number.isFinite(x) || !Number.isFinite(y) || index < 0 || index * 2 + 1 >= points.length) return [...points];
  const next = [...points], neighbor = index === 0 ? 2 : (index - 1) * 2;
  if (snap) {
    const dx = x - points[neighbor]!, dy = y - points[neighbor + 1]!;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * Math.PI / 12;
    const length = Math.hypot(dx, dy);
    x = points[neighbor]! + Math.cos(angle) * length; y = points[neighbor + 1]! + Math.sin(angle) * length;
  }
  next[index * 2] = x; next[index * 2 + 1] = y;
  // Keep explicit closure atomic when either copy of the endpoint moves.
  if (points.length > 4 && points[0] === points.at(-2) && points[1] === points.at(-1)) {
    if (index === 0) { next[next.length - 2] = x; next[next.length - 1] = y; }
    if (index * 2 === points.length - 2) { next[0] = x; next[1] = y; }
  }
  return next;
}

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
