import { readStudioSmartShapeSnapshot } from "./studio-smart-shape-snapshot";

import type { DrawEl } from "./studio-element-model";

interface SmartShapeCopyElement {
  id: string;
  type?: unknown;
  smartShape?: unknown;
  groupId?: unknown;
  hidden?: unknown;
  locked?: unknown;
}

export interface StudioSmartShapeCopyTransform {
  mapPoint?: (x: number, y: number) => readonly [number, number];
  mapStrokeWidth?: (width: number) => number;
}

/**
 * Carry a validated authored stroke through the same copy/geometry operation as its outer shape.
 * Call after assigning the copied element's ID, group and visibility. The caller owns the outer
 * geometry; only the retained original receives these transforms. Invalid snapshots are not repaired.
 */
export function copyStudioSmartShapeSnapshot<E extends SmartShapeCopyElement>(
  source: SmartShapeCopyElement,
  copied: E,
  transform: StudioSmartShapeCopyTransform = {},
): E {
  if (source.type !== "draw" || copied.type !== "draw" || source.smartShape === undefined) return copied;
  const snapshot = readStudioSmartShapeSnapshot(source as DrawEl);
  if (!snapshot) return copied;

  const original = structuredClone(snapshot.original);
  original.id = copied.id;
  if (typeof copied.groupId === "string") original.groupId = copied.groupId;
  else delete original.groupId;
  for (const key of ["hidden", "locked"] as const) {
    const value = copied[key];
    if (typeof value === "boolean") original[key] = value;
    else delete original[key];
  }
  if (transform.mapPoint) {
    const points: number[] = [];
    for (let index = 0; index < original.points.length; index += 2) {
      const point = transform.mapPoint(original.points[index]!, original.points[index + 1]!);
      points.push(point[0], point[1]);
    }
    original.points = points;
  }
  if (transform.mapStrokeWidth) original.strokeWidth = transform.mapStrokeWidth(original.strokeWidth);
  return { ...copied, smartShape: { ...snapshot, original } };
}
