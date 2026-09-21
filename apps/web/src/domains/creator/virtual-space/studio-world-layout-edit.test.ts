import { describe, expect, it } from "vitest";

import { alignStudioWorldLayout, duplicateStudioWorldLayoutProps, resizeStudioWorldLayoutProp, rotateStudioWorldLayout,
  studioWorldLayoutPointer, studioWorldLayoutTargets, translateStudioWorldLayout, type WorldLayoutEdit } from "./studio-world-layout-edit";
import { validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";
import { createStudioWorldEditHistory, recordStudioWorldEdit, stepStudioWorldEdit } from "./studio-virtual-space-world-edit-history";

const world = (): World => ({ id: "fixture", version: 1, width: 500, height: 400, backgroundAssetKey: "background", backgroundUrl: "/background.webp",
  rooms: [{ id: "lounge", x: 0, y: 0, width: 500, height: 400, labelKo: "방", labelEn: "Room" }],
  props: [{ id: "desk", kind: "interactive", x: 120, y: 120, width: 40, height: 40, assetUrl: "/desk.png", action: "review", interactionRadius: 40,
    collider: { x: 100, y: 88, width: 40, height: 22 } },
    { id: "plant", kind: "decor", x: 240, y: 190, width: 20, height: 30, assetUrl: "/plant.png" },
    { id: "painted", kind: "solid", x: 330, y: 190, width: 60, height: 40 }],
  interactions: [{ id: "desk", zoneId: "lounge", point: { x: 120, y: 125 }, radius: 40, action: "review", labelKo: "검수", labelEn: "Review" }],
  colliders: [], spawns: [{ id: "entry", point: { x: 30, y: 30 } }], npcs: [], portals: [],
  interactionRules: [{ id: "review-rule", interactionId: "desk", trigger: "explicit-use", activities: ["available"], action: "review", messageKo: "검수 열기", messageEn: "Open review" }],
});
const value = (result: WorldLayoutEdit): World => { if (!result.ok) throw new Error(result.reason); return result.world; };
describe("atomic world layout proposals", () => {
  it("moves a real prop, its exact collider and its explicit matching tool anchor together", () => {
    const before = world(), saved = JSON.stringify(before);
    expect(validateStudioWorldManifest(before)).toEqual([]);
    const next = value(translateStudioWorldLayout(before, "props", ["props:desk", "props:plant"], 16, 8));
    expect(next.props[0]).toMatchObject({ x: 136, y: 128, collider: { x: 116, y: 96 } });
    expect(next.interactions[0]?.point).toEqual({ x: 136, y: 133 });
    expect(next.props[1]).toMatchObject({ x: 256, y: 198 });
    expect(next.props[2]).toBe(before.props[2]); expect(next.interactionRules).toBe(before.interactionRules);
    expect(JSON.stringify(before)).toBe(saved);
    expect(validateStudioWorldManifest(next)).toEqual([]);
    const history = recordStudioWorldEdit(createStudioWorldEditHistory(before), next);
    expect(stepStudioWorldEdit(history, "undo").present.value).toEqual(before);
  });
  it("never moves or duplicates furniture baked into the background", () => {
    expect(translateStudioWorldLayout(world(), "props", ["props:painted"], 10, 0)).toEqual({ ok: false, reason: "baked-art" });
    expect(duplicateStudioWorldLayoutProps(world(), ["props:painted"])).toMatchObject({ ok: false });
    expect(studioWorldLayoutTargets(world(), "props")[2]?.movable).toBe(false);
  });
  it.each([[], ["props:desk", "props:desk"], ["props:missing"]])("rejects invalid selection %j", (...keys) => {
    expect(translateStudioWorldLayout(world(), "props", keys as string[], 10, 0)).toMatchObject({ ok: false, reason: "selection" });
  });
  it("rejects invalid numbers and out-of-bounds multi-selection without partial changes", () => {
    const before = world(), serialized = JSON.stringify(before);
    expect(translateStudioWorldLayout(before, "props", ["props:plant"], NaN, 1)).toMatchObject({ ok: false });
    expect(translateStudioWorldLayout(before, "props", ["props:desk", "props:plant"], 400, 0)).toMatchObject({ ok: false });
    expect(JSON.stringify(before)).toBe(serialized);
  });
  it("aligns visible bounds using the first selection without changing its geometry", () => {
    const before = world(), next = value(alignStudioWorldLayout(before, "props", ["props:desk", "props:plant"], "left"));
    expect(next.props[0]).toBe(before.props[0]);
    expect(next.props[1]?.x).toBe(110);
    expect(alignStudioWorldLayout(before, "props", ["props:desk"], "left")).toMatchObject({ ok: false });
  });
  it("only rotates/resizes standalone visuals; structural geometry is not guessed", () => {
    const before = world();
    expect(rotateStudioWorldLayout(before, ["props:desk"], 90)).toEqual({ ok: false, reason: "rotation" });
    expect(resizeStudioWorldLayoutProp(before, "props:desk", 80, 80)).toEqual({ ok: false, reason: "size" });
    expect(value(rotateStudioWorldLayout(before, ["props:plant"], 90)).props[1]?.rotation).toBe(90);
    expect(value(resizeStudioWorldLayoutProp(before, "props:plant", 60, 70)).props[1]).toMatchObject({ width: 60, height: 70 });
    expect(resizeStudioWorldLayoutProp(before, "props:plant", 5000, 70)).toMatchObject({ ok: false });
  });
  it("duplicates image data references, exact tool anchors and confirmation rules with fresh identities", () => {
    const before = world(), once = value(duplicateStudioWorldLayoutProps(before, ["props:desk"]));
    expect(once.props.at(-1)).toMatchObject({ id: "desk-copy-1", assetKey: "desk", x: 136, y: 136 });
    expect(once.interactions.at(-1)).toMatchObject({ id: "desk-copy-1", point: { x: 136, y: 141 } });
    expect(once.interactionRules?.at(-1)).toMatchObject({ interactionId: "desk-copy-1", action: "review" });
    const twice = value(duplicateStudioWorldLayoutProps(once, ["props:desk"]));
    expect(twice.props.at(-1)?.id).toBe("desk-copy-2"); expect(validateStudioWorldManifest(twice)).toEqual([]);
  });
  it("converts pointer coordinates correctly across zoom and letterboxing", () => {
    const canvas = { width: 500, height: 400 };
    expect(studioWorldLayoutPointer({ x: 350, y: 220 }, { x: 100, y: 20, width: 500, height: 400 }, canvas)).toEqual({ x: 250, y: 200 });
    expect(studioWorldLayoutPointer({ x: 250, y: 200 }, { x: 0, y: 0, width: 500, height: 400 }, { width: 400, height: 400 })).toEqual({ x: 200, y: 200 });
    expect(studioWorldLayoutPointer({ x: 10, y: 200 }, { x: 0, y: 0, width: 500, height: 400 }, { width: 400, height: 400 })).toBeNull();
    expect(studioWorldLayoutPointer({ x: Infinity, y: 0 }, { x: 0, y: 0, width: 500, height: 400 }, canvas)).toBeNull();
  });
});
