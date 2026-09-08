import { describe, expect, it } from "vitest";

import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { studioCrdtStrokeToDrawElement } from "./live/studio-crdt-page-bridge";
import { buildClipboardPayload, parseClipboardPayload, planClipboardPaste, serializeClipboardPayload } from "./studio-page-meta";
import { duplicateMirroredPage, duplicatePageState } from "./studio-pages";
import { copyStudioSmartShapeSnapshot } from "./studio-smart-shape-copy";
import {
  commitStudioSmartShapeEdit, createStudioSmartShapePath, readStudioSmartShapeSnapshot,
  restoreStudioSmartShapeOriginal,
} from "./studio-smart-shape-edit";

import type { DrawEl } from "./studio-element-model";

function authored(): DrawEl {
  return {
    id: "authored", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
    points: [10.25, 20.125, 25.25, 24.125, 50.25, 18.125, 75.25, 21.125, 100.25, 20.125],
    pressures: [0.2, 0.4, 0.8, 0.6, 0.3], pressureModel: "linear-full-v1",
    stroke: "#245678", strokeWidth: 6.4, opacity: 0.6,
    groupId: "old-group", hidden: true, locked: true,
  };
}

function corrected(original = authored()): DrawEl {
  const result = commitStudioSmartShapeEdit(original, "line", [10.25, 20.125, 100.25, 20.125]);
  if (!result) throw new Error("Expected valid fixture correction");
  return result;
}

function ids(): () => string {
  let index = 0;
  return () => `copy-${++index}`;
}

function expectCopyRoundTrip(copy: DrawEl, expected: DrawEl): void {
  expect(readStudioSmartShapeSnapshot(copy)?.original).toEqual(expected);
  const reloaded = JSON.parse(JSON.stringify(copy)) as DrawEl;
  const edited = commitStudioSmartShapeEdit(reloaded, "ellipse", createStudioSmartShapePath(reloaded, "ellipse"));
  expect(edited).not.toBeNull();
  const crdt = studioDrawElementToCrdtStroke("copied-page", edited!);
  const projected = studioCrdtStrokeToDrawElement({ ...crdt, status: "finalized", deleted: false, orderIndex: 0 }) as DrawEl;
  expect(readStudioSmartShapeSnapshot(projected)?.kind).toBe("ellipse");
  expect(restoreStudioSmartShapeOriginal(projected)).toEqual(expected);
}

describe("Smart Shape copying retains the authored stroke", () => {
  it("remaps current ID/group/visibility without sharing mutable original arrays", () => {
    const source = corrected();
    const before = structuredClone(source);
    const copy = copyStudioSmartShapeSnapshot(source, {
      ...source, id: "new-id", groupId: "new-group", hidden: false, locked: false,
    });
    expectCopyRoundTrip(copy, {
      ...authored(), id: "new-id", groupId: "new-group", hidden: false, locked: false,
    });
    copy.smartShape!.original.points[0] = 999;
    copy.smartShape!.original.pressures![0] = 0.99;
    expect(source).toEqual(before);
  });

  it("removes stale group/hidden/locked fields when the copied element omits them", () => {
    const source = corrected();
    const next = { ...source, id: "ungrouped" };
    delete next.groupId; delete next.hidden; delete next.locked;
    const expected = { ...authored(), id: "ungrouped" };
    delete expected.groupId; delete expected.hidden; delete expected.locked;
    expectCopyRoundTrip(copyStudioSmartShapeSnapshot(source, next), expected);
  });

  it("supports Host translation without applying the outer translation twice", () => {
    const source = corrected();
    const shifted = { ...source, points: source.points.map((value, index) => value + (index % 2 ? -7 : 12)) };
    const copy = copyStudioSmartShapeSnapshot(source, shifted, { mapPoint: (x, y) => [x + 12, y - 7] });
    expect(copy.points).toEqual(shifted.points);
    expectCopyRoundTrip(copy, {
      ...authored(), points: authored().points.map((value, index) => value + (index % 2 ? -7 : 12)),
    });
  });

  it("does not manufacture a valid original from mismatched or nested snapshots", () => {
    const source = corrected();
    const invalid = { ...source, id: "mismatched" };
    const next = { ...invalid, id: "another-copy" };
    expect(copyStudioSmartShapeSnapshot(invalid, next)).toBe(next);
    expect(readStudioSmartShapeSnapshot(next)).toBeNull();
    const nested = { ...source, smartShape: { ...source.smartShape!, original: source } };
    const nestedCopy = { ...nested, id: "nested-copy" };
    expect(copyStudioSmartShapeSnapshot(nested, nestedCopy)).toBe(nestedCopy);
    expect(readStudioSmartShapeSnapshot(nestedCopy)).toBeNull();
    const plain = authored();
    const plainCopy = { ...plain, id: "plain-copy" };
    expect(copyStudioSmartShapeSnapshot(plain, plainCopy)).toBe(plainCopy);
  });

  it("clipboard scale, same-page shift and new relations also transform the original", () => {
    const source = corrected();
    const before = structuredClone(source);
    const payload = buildClipboardPayload([{ ...source }], { canvasW: 720, canvasH: 1080, pageId: "same" }, 1);
    const imported = parseClipboardPayload(serializeClipboardPayload(payload));
    expect(imported).not.toBeNull();
    const plan = planClipboardPaste(imported!, { canvasW: 1080, canvasH: 1620, pageId: "same" }, ids());
    expect(plan).not.toBeNull();
    const copy = plan!.els[0] as unknown as DrawEl;
    const scaledAndShifted = (value: number) => Math.round((Math.round(value * 1.5 * 100) / 100 + 16) * 100) / 100;
    expect(copy.id).toBe("copy-1");
    expect(copy.groupId).toBe("copy-2");
    expect(copy.points).toEqual(source.points.map(scaledAndShifted));
    expect(copy.strokeWidth).toBe(9.6);
    expectCopyRoundTrip(copy, {
      ...authored(), id: "copy-1", groupId: "copy-2", hidden: false, locked: false,
      points: authored().points.map(scaledAndShifted), strokeWidth: 9.6,
    });
    expect(source).toEqual(before);
    expect(imported!.els[0]).toEqual(source);
  });

  it("clipboard rescue from a taller page shifts both paths by the same amount", () => {
    const original = { ...authored(), points: authored().points.map((value, index) => value + (index % 2 ? 1000 : 0)) };
    const source = commitStudioSmartShapeEdit(original, "rect", [10, 1000, 100, 1000, 100, 1040, 10, 1040, 10, 1000])!;
    const payload = buildClipboardPayload([{ ...source }], { canvasW: 720, canvasH: 2000, pageId: "tall" }, 1);
    const plan = planClipboardPaste(payload, { canvasW: 720, canvasH: 100, pageId: "short" }, ids())!;
    const copy = plan.els[0] as unknown as DrawEl;
    expect(copy.points).toEqual([10, 60, 100, 60, 100, 100, 10, 100, 10, 60]);
    expectCopyRoundTrip(copy, {
      ...original, id: copy.id, groupId: copy.groupId, hidden: false, locked: false,
      points: original.points.map((value, index) => Math.round((value - (index % 2 ? 940 : 0)) * 100) / 100),
    });
  });

  it("page duplication preserves a restorable original under the new element ID", () => {
    const source = corrected();
    const page = { id: "source-page", elements: [source], bg: "#fff", bgGrad: null, canvasH: 1080 };
    const before = structuredClone(page);
    const duplicate = duplicatePageState(page, ids());
    expect(duplicate.id).toBe("copy-1");
    expectCopyRoundTrip(duplicate.elements[0]!, { ...authored(), id: "copy-2" });
    duplicate.elements[0]!.smartShape!.original.points[0] = 900;
    expect(page).toEqual(before);
  });

  it("mirrored duplication reflects the original and double-mirroring restores its geometry", () => {
    const source = corrected();
    const page = { id: "source-page", elements: [source], bg: "#fff", bgGrad: null, canvasH: 1080 };
    const before = structuredClone(page);
    const mirrored = duplicateMirroredPage(page, ids(), 720);
    const copy = mirrored.elements[0]!;
    expect(copy.points).toEqual(source.points.map((value, index) => index % 2 ? value : 720 - value));
    expectCopyRoundTrip(copy, {
      ...authored(), id: copy.id,
      points: authored().points.map((value, index) => index % 2 ? value : 720 - value),
    });
    const restored = duplicateMirroredPage(mirrored, ids(), 720);
    expectCopyRoundTrip(restored.elements[0]!, { ...authored(), id: restored.elements[0]!.id });
    expect(page).toEqual(before);
  });
});
