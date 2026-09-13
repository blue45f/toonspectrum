import { describe, expect, it } from "vitest";

import { isEffectivelyHidden, isEffectivelyLocked } from "./studio-layers";
import { resolvePixelSelectionSceneTarget } from "./studio-pixel-selection-scene-target";
import { resolvePixelSelectionAutoTarget } from "./studio-selection-tools";

import type { LayerGroup } from "./studio-layers";
import type { PixelSelectionSceneElement } from "./studio-pixel-selection-scene-target";
import type { PixelSelectionAutoTargetCandidate } from "./studio-selection-tools";

const image = (id: string, extra: Partial<Extract<PixelSelectionSceneElement, { type: "image" }>> = {}): Extract<PixelSelectionSceneElement, { type: "image" }> => ({
  id, type: "image", x: 0, y: 0, width: 100, height: 100, rotation: 0, ...extra,
});
const point = { x: 50, y: 50 };

// Exact former host algorithm: extraction must preserve the selection and lock rules.
function formerHost(elements: PixelSelectionSceneElement[], groups: LayerGroup[], locked: boolean) {
  if (locked) return { kind: "none" };
  const candidates: PixelSelectionAutoTargetCandidate[] = [];
  for (const el of elements) {
    if (el.type !== "image") continue;
    candidates.push({
      id: el.id,
      frame: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
      hidden: isEffectivelyHidden(el, groups),
      locked: isEffectivelyLocked(el, groups),
    });
  }
  return resolvePixelSelectionAutoTarget(candidates, point);
}

describe("pixel selection scene target extraction", () => {
  it("selects the frontmost image and ignores foreground vector elements", () => {
    expect(resolvePixelSelectionSceneTarget([
      image("back"), image("front"), { id: "vector", type: "draw" },
    ], [], point, false)).toEqual({ kind: "target", id: "front" });
  });

  it("preserves inherited hidden and locked group behavior", () => {
    const groups = [
      { id: "hidden", name: "Hidden", hidden: true },
      { id: "locked", name: "Locked", locked: true },
    ];
    const foreground = [image("locked-image", { groupId: "locked" }), image("hidden-image", { groupId: "hidden" })];
    expect(resolvePixelSelectionSceneTarget([image("back"), ...foreground], groups, point, false))
      .toEqual({ kind: "target", id: "back" });
    expect(resolvePixelSelectionSceneTarget(foreground, groups, point, false))
      .toEqual({ kind: "locked", id: "locked-image" });
  });

  it("does not inspect any element on a review-locked surface", () => {
    const element = image("guarded");
    Object.defineProperty(element, "type", { get() { throw new Error("must not inspect locked content"); } });
    expect(resolvePixelSelectionSceneTarget([element], [], point, true)).toEqual({ kind: "none" });
  });

  it("does not mutate scene order, coordinates or layer groups", () => {
    const elements = [image("back"), image("front", { groupId: "g" })];
    const groups = [{ id: "g", name: "Group", locked: true }];
    elements.forEach(Object.freeze);
    groups.forEach(Object.freeze);
    Object.freeze(elements);
    Object.freeze(groups);
    expect(resolvePixelSelectionSceneTarget(elements, groups, point, false)).toEqual({ kind: "target", id: "back" });
    expect(elements.map((el) => el.id)).toEqual(["back", "front"]);
  });

  it("retains rotation, empty-scene and invalid-pointer behavior", () => {
    expect(resolvePixelSelectionSceneTarget([image("rotated", { rotation: 90 })], [], { x: -50, y: 50 }, false))
      .toEqual({ kind: "target", id: "rotated" });
    expect(resolvePixelSelectionSceneTarget([], [], point, false)).toEqual({ kind: "none" });
    expect(resolvePixelSelectionSceneTarget([image("a")], [], { x: NaN, y: 0 }, false)).toEqual({ kind: "none" });
  });

  for (const reviewLocked of [false, true]) {
    for (const hidden of [false, true]) {
      for (const locked of [false, true]) {
        for (const groupState of ["normal", "hidden", "locked"] as const) {
          it(`matches the former host: review=${reviewLocked}, hidden=${hidden}, locked=${locked}, group=${groupState}`, () => {
            const elements: PixelSelectionSceneElement[] = [image("back"), image("front", { hidden, locked, groupId: "g" }), { id: "text", type: "text" }];
            const groups = [{ id: "g", name: "G", hidden: groupState === "hidden", locked: groupState === "locked" }];
            expect(resolvePixelSelectionSceneTarget(elements, groups, point, reviewLocked))
              .toEqual(formerHost(elements, groups, reviewLocked));
          });
        }
      }
    }
  }
});
