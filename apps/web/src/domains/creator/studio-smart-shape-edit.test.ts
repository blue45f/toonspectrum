import { describe, expect, it } from "vitest";
import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { studioCrdtStrokeToDrawElement } from "./live/studio-crdt-page-bridge";

import {
  commitStudioSmartShapeEdit, createStudioSmartShapePath, initialStudioSmartShapeKind,
  moveStudioSmartShapePoint, readStudioSmartShapeSnapshot, recentStudioSmartShapeStroke,
  restoreStudioSmartShapeOriginal, STUDIO_SMART_SHAPE_EDIT_KINDS,
  studioSmartShapeEditReason, transformStudioSmartShapePath,
} from "./studio-smart-shape-edit";

import type { DrawEl } from "./studio-element-model";

const source = (): DrawEl => ({
  id: "stroke-1", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
  points: [10, 20, 25, 21, 50, 19, 75, 20, 100, 20],
  stroke: "#245678", strokeWidth: 6, opacity: 0.6,
  pressures: [0.1, 0.3, 0.6, 0.8, 1], pressureModel: "linear-full-v1",
});

describe("editable Smart Shape document workflow", () => {
  it("reuses QuickShape recognition for the current stroke", () => {
    expect(initialStudioSmartShapeKind(source())).toBe("line");
    expect(createStudioSmartShapePath(source(), "line")).toHaveLength(4);
  });
  it.each(STUDIO_SMART_SHAPE_EDIT_KINDS)("creates bounded editable %s points without modifying the source", (kind) => {
    const original = source(); const before = structuredClone(original);
    const points = createStudioSmartShapePath(original, kind);
    const result = commitStudioSmartShapeEdit(original, kind, points)!;
    expect(original).toEqual(before);
    expect(result.kind).toBe("freehand");
    expect(result.points.every(Number.isFinite)).toBe(true);
    expect(result.pressures).toHaveLength(result.points.length / 2);
    expect(result.pressures?.[0]).toBe(0.1);
    expect(result.pressures?.at(-1)).toBe(1);
    expect(result.stroke).toBe(original.stroke);
    expect(result.opacity).toBe(original.opacity);
    expect(result.brush).toBe(original.brush);
    expect(result.smartShape?.original).toEqual(before);
  });
  it("retains the exact original after JSON reload, kind changes and later point edits", () => {
    const original = source();
    const corrected = commitStudioSmartShapeEdit(original, "rect", createStudioSmartShapePath(original, "rect"))!;
    const reloaded = JSON.parse(JSON.stringify(corrected)) as DrawEl;
    const edited = commitStudioSmartShapeEdit(reloaded, "polyline", [30, 40, 60, 45, 90, 60])!;
    expect(readStudioSmartShapeSnapshot(edited)?.original).toEqual(original);
    expect(edited.smartShape?.original.smartShape).toBeUndefined();
    expect(restoreStudioSmartShapeOriginal(edited)).toEqual(original);
    edited.points[0] = 999;
    expect(original.points[0]).toBe(10);
  });
  it("retains the original snapshot through the product CRDT projection used by SQLite autosave", () => {
    const original = source();
    const corrected = commitStudioSmartShapeEdit(original, "ellipse", createStudioSmartShapePath(original, "ellipse"))!;
    const projected = studioCrdtStrokeToDrawElement({ ...studioDrawElementToCrdtStroke("page-1", corrected), status: "finalized", deleted: false, orderIndex: 0 }) as DrawEl;
    expect(projected.smartShape).toEqual(corrected.smartShape);
    expect(restoreStudioSmartShapeOriginal(projected)).toEqual(original);
  });
  it("rejects snapshots beyond the existing CRDT metadata budget before mutation", () => {
    const huge = { ...source(), points: Array.from({ length: 3000 }, (_, index) => index + 0.123456789), pressures: undefined };
    expect(studioSmartShapeEditReason(huge)).toContain("너무 커요");
    expect(commitStudioSmartShapeEdit(huge, "line", [0, 0, 1, 1])).toBeNull();
  });
  it("does not silently edit an older stroke when the latest drawing uses an unsupported brush", () => {
    const older = source();
    const latest = { ...source(), id: "newest", mode: "eraser" as const };
    expect(recentStudioSmartShapeStroke([older, latest], older.id)).toBe(latest);
    expect(studioSmartShapeEditReason(latest)).not.toBeNull();
  });
  it("reopens a selected corrected stroke, retaining exact identity", () => {
    const corrected = commitStudioSmartShapeEdit(source(), "line", [10, 20, 100, 20])!;
    expect(recentStudioSmartShapeStroke([corrected, { ...source(), id: "newest" }], corrected.id)).toBe(corrected);
  });
  it("rejects malformed, nested and mismatched imported correction snapshots", () => {
    const original = source();
    const corrected = commitStudioSmartShapeEdit(original, "line", [10, 20, 100, 20])!;
    expect(readStudioSmartShapeSnapshot({ ...corrected, smartShape: { version: 1, kind: "line", original: { ...original, points: null } as unknown as DrawEl } })).toBeNull();
    expect(readStudioSmartShapeSnapshot({ ...corrected, smartShape: { version: 1, kind: "line", original: corrected } })).toBeNull();
    expect(readStudioSmartShapeSnapshot({ ...corrected, id: "other" })).toBeNull();
    expect(commitStudioSmartShapeEdit(original, "line", [0, 0, Infinity, 1])).toBeNull();
    expect(studioSmartShapeEditReason({ ...original, points: [1, 2, 3] })).not.toBeNull();
  });
  it("rotates and scales around the path center without mutating existing coordinates", () => {
    const points = [0, 0, 10, 0];
    const transformed = transformStudioSmartShapePath(points, 2, 90);
    expect(transformed[0]).toBeCloseTo(5); expect(transformed[1]).toBeCloseTo(-10);
    expect(transformed[2]).toBeCloseTo(5); expect(transformed[3]).toBeCloseTo(10);
    expect(points).toEqual([0, 0, 10, 0]);
  });
  it("keeps closed contours sealed and snaps handle angles in page coordinates", () => {
    expect(moveStudioSmartShapePoint([0, 0, 10, 0, 10, 10, 0, 0], 0, 2, 3)).toEqual([2, 3, 10, 0, 10, 10, 2, 3]);
    const moved = moveStudioSmartShapePoint([0, 0, 10, 0], 1, 9, 2, true);
    const degrees = Math.atan2(moved[3]!, moved[2]!) * 180 / Math.PI;
    expect(degrees).toBeCloseTo(15);
  });
});
