import { createStudioEngineSceneSpatialIndex } from "../render/studio-engine-scene-spatial-index";
import { elBounds, type StudioElementBounds } from "../studio-element-geometry";

import type { El } from "../studio-element-model";

export interface StudioSkiaDocumentHitPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioSkiaDocumentHitRegion extends StudioElementBounds {
  readonly id: string;
}

interface IndexedGeometry {
  readonly element: El;
  readonly bounds: StudioElementBounds;
  readonly indexBounds: StudioElementBounds;
  readonly zOrder: number;
}

function rotationOf(element: El): number {
  return "rotation" in element && typeof element.rotation === "number"
    ? element.rotation
    : 0;
}

function rotatedBounds(
  bounds: StudioElementBounds,
  rotationDeg: number,
): StudioElementBounds {
  if (!rotationDeg) return bounds;
  const angle = rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [0, 0],
    [bounds.w, 0],
    [bounds.w, bounds.h],
    [0, bounds.h],
  ] as const;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const px = bounds.x + x * cos - y * sin;
    const py = bounds.y + x * sin + y * cos;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function geometryFor(element: El, zOrder: number): IndexedGeometry {
  const bounds = elBounds(element);
  const rotated = rotatedBounds(bounds, rotationOf(element));
  const radius = element.type === "draw" ? Math.max(0, element.strokeWidth / 2) : 0;
  return {
    element,
    bounds,
    indexBounds: {
      x: rotated.x - radius,
      y: rotated.y - radius,
      w: rotated.w + radius * 2,
      h: rotated.h + radius * 2,
    },
    zOrder,
  };
}

function squaredDistanceToSegment(
  point: StudioSkiaDocumentHitPoint,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) {
    const px = point.x - x1;
    const py = point.y - y1;
    return px * px + py * py;
  }
  const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared));
  const px = point.x - (x1 + t * dx);
  const py = point.y - (y1 + t * dy);
  return px * px + py * py;
}

function drawHit(
  element: Extract<El, { type: "draw" }>,
  point: StudioSkiaDocumentHitPoint,
  tolerance: number,
): boolean {
  if (element.points.length < 2) return false;
  const radius = Math.max(element.strokeWidth / 2, tolerance);
  const limit = radius * radius;
  if (element.points.length === 2) {
    const dx = point.x - element.points[0]!;
    const dy = point.y - element.points[1]!;
    return dx * dx + dy * dy <= limit;
  }
  for (let index = 2; index + 1 < element.points.length; index += 2) {
    if (squaredDistanceToSegment(
      point,
      element.points[index - 2]!,
      element.points[index - 1]!,
      element.points[index]!,
      element.points[index + 1]!,
    ) <= limit) return true;
  }
  return false;
}

function boxHit(
  element: El,
  bounds: StudioElementBounds,
  point: StudioSkiaDocumentHitPoint,
  tolerance: number,
): boolean {
  const angle = -rotationOf(element) * Math.PI / 180;
  const dx = point.x - bounds.x;
  const dy = point.y - bounds.y;
  const x = dx * Math.cos(angle) - dy * Math.sin(angle);
  const y = dx * Math.sin(angle) + dy * Math.cos(angle);
  return x >= -tolerance
    && x <= bounds.w + tolerance
    && y >= -tolerance
    && y <= bounds.h + tolerance;
}

function exactHit(
  geometry: IndexedGeometry,
  point: StudioSkiaDocumentHitPoint,
  tolerance: number,
): boolean {
  return geometry.element.type === "draw"
    ? drawHit(geometry.element, point, tolerance)
    : boxHit(geometry.element, geometry.bounds, point, tolerance);
}

export function createStudioSkiaDocumentHitIndex() {
  const spatial = createStudioEngineSceneSpatialIndex();
  const geometries = new Map<string, IndexedGeometry>();
  let regions: readonly StudioSkiaDocumentHitRegion[] = [];
  let disposed = false;

  return {
    sync(elements: readonly El[]): readonly StudioSkiaDocumentHitRegion[] {
      if (disposed) return [];
      const visible = elements.filter(
        (element) => !element.hidden && (element.opacity ?? 1) > 0,
      );
      const nextGeometries = new Map<string, IndexedGeometry>();
      const candidates = [];
      const changed = [];
      const nextRegions: StudioSkiaDocumentHitRegion[] = [];
      for (let zOrder = 0; zOrder < visible.length; zOrder += 1) {
        const element = visible[zOrder]!;
        if (nextGeometries.has(element.id)) continue;
        const previous = geometries.get(element.id);
        const geometry = previous?.element === element && previous.zOrder === zOrder
          ? previous
          : geometryFor(element, zOrder);
        nextGeometries.set(element.id, geometry);
        const { x, y, w, h } = geometry.indexBounds;
        const candidate = {
          id: element.id,
          bounds: {
            minX: x,
            minY: y,
            maxX: x + Math.max(w, 0.1),
            maxY: y + Math.max(h, 0.1),
          },
          zOrder,
          interactive: true,
        };
        candidates.push(candidate);
        if (geometry !== previous) changed.push(candidate);
        nextRegions.push({
          id: element.id,
          x,
          y,
          w: Math.max(w, 0.1),
          h: Math.max(h, 0.1),
        });
      }
      const removed = [...geometries.keys()].filter(
        (id) => !nextGeometries.has(id),
      );
      const mutationCount = changed.length + removed.length;
      const rebuildThreshold = Math.max(64, Math.ceil(nextGeometries.size / 4));
      let synchronized = true;
      if (geometries.size === 0 || mutationCount > rebuildThreshold) {
        synchronized = spatial.rebuild(candidates).ok;
      } else {
        for (const id of removed) {
          if (!spatial.remove(id).ok) {
            synchronized = false;
            break;
          }
        }
        if (synchronized) {
          for (const candidate of changed) {
            if (!spatial.upsert(candidate).ok) {
              synchronized = false;
              break;
            }
          }
        }
        if (!synchronized) synchronized = spatial.rebuild(candidates).ok;
      }
      if (!synchronized) {
        regions = [];
        return regions;
      }
      geometries.clear();
      for (const [id, geometry] of nextGeometries) {
        geometries.set(id, geometry);
      }
      regions = Object.freeze(nextRegions);
      return regions;
    },

    regions(): readonly StudioSkiaDocumentHitRegion[] {
      return regions;
    },

    resolve(point: StudioSkiaDocumentHitPoint, effectiveScale: number): El | null {
      if (disposed || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      const tolerance = 8 / Math.max(Math.abs(effectiveScale), 0.001);
      const result = spatial.search({
        minX: point.x - tolerance,
        minY: point.y - tolerance,
        maxX: point.x + tolerance,
        maxY: point.y + tolerance,
      }, {
        includeLocked: true,
        interactiveOnly: true,
        limit: 1024,
      });
      if (!result.ok) return null;
      for (const entry of result.entries) {
        const geometry = geometries.get(entry.id);
        if (geometry && exactHit(geometry, point, tolerance)) {
          return geometry.element;
        }
      }
      return null;
    },

    stats(): { readonly size: number; readonly mutationSequence: number } {
      const snapshot = spatial.getSnapshot();
      return {
        size: geometries.size,
        mutationSequence: snapshot.mutationSequence,
      };
    },

    size(): number {
      return geometries.size;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometries.clear();
      regions = [];
      spatial.dispose();
    },
  };
}
