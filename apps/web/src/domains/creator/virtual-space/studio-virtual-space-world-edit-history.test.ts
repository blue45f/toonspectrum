import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST as world } from "./studio-virtual-space-world-manifest";
import { createStudioWorldEditHistory, recordStudioWorldEdit, stepStudioWorldEdit, patchStudioWorldProp, STUDIO_WORLD_HISTORY_LIMIT } from "./studio-virtual-space-world-edit-history";

describe("world edit history", () => {
  it("undoes and redoes immutable snapshots without changing the original", () => {
    const changed = { ...world, version: world.version + 1 };
    const initial = createStudioWorldEditHistory(world);
    const recorded = recordStudioWorldEdit(initial, changed);
    expect(initial.past).toEqual([]);
    expect(recorded.present.value).toBe(changed);
    const undone = stepStudioWorldEdit(recorded, "undo");
    expect(undone.present.value).toBe(world);
    expect(stepStudioWorldEdit(undone, "redo").present.value).toBe(changed);
  });
  it("drops redo on a new edit and ignores equivalent no-op values", () => {
    const initial = createStudioWorldEditHistory(world);
    expect(recordStudioWorldEdit(initial, { ...world })).toBe(initial);
    expect(stepStudioWorldEdit(initial, "undo")).toBe(initial);
    const undone = stepStudioWorldEdit(recordStudioWorldEdit(initial, { ...world, version: 2 }), "undo");
    const branched = recordStudioWorldEdit(undone, { ...world, version: 3 });
    expect(branched.future).toEqual([]);
    expect(stepStudioWorldEdit(branched, "redo")).toBe(branched);
  });
  it("bounds old snapshots without losing the current draft", () => {
    let history = createStudioWorldEditHistory(world);
    for (let index = 1; index <= STUDIO_WORLD_HISTORY_LIMIT + 10; index += 1) {
      history = recordStudioWorldEdit(history, { ...world, version: 100 + index });
    }
    expect(history.past.length).toBeLessThanOrEqual(STUDIO_WORLD_HISTORY_LIMIT);
    expect(history.present.value.version).toBe(100 + STUDIO_WORLD_HISTORY_LIMIT + 10);
  });
  it("evicts oversized history instead of accumulating large imported drafts", () => {
    const large = { ...world, backgroundUrl: "x".repeat(4 * 1024 * 1024) };
    const history = recordStudioWorldEdit(createStudioWorldEditHistory(world), large);
    expect(history.past).toEqual([]);
    expect(history.present.value).toBe(large);
  });
});
describe("authored prop movement", () => {
  const prop = { id: "desk", kind: "solid" as const, x: 100, y: 150, collider: { x: 90, y: 160, width: 48, height: 16 } };
  it("preserves the collider offset when changing both position axes", () => {
    expect(patchStudioWorldProp(prop, { x: 120, y: 140 }).collider).toEqual({ x: 110, y: 150, width: 48, height: 16 });
    expect(prop.collider.x).toBe(90);
  });
  it("does not fabricate colliders for decorations", () => {
    expect(patchStudioWorldProp({ ...prop, collider: undefined }, { x: 120 }).collider).toBeUndefined();
  });
  it("keeps explicit collider edits/removal and non-position edits authoritative", () => {
    const collider = { x: 1, y: 2, width: 3, height: 4 };
    expect(patchStudioWorldProp(prop, { x: 120, collider }).collider).toBe(collider);
    expect(patchStudioWorldProp(prop, { x: 120, collider: undefined }).collider).toBeUndefined();
    expect(patchStudioWorldProp(prop, { rotation: 20 }).collider).toBe(prop.collider);
  });
});
