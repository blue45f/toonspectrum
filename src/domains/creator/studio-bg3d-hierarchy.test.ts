import { describe, expect, it } from "vitest";

import {
  canSetStudioBg3dParent,
  normalizeStudioBg3dHierarchyParents,
  resolveStudioBg3dHierarchy,
} from "./studio-bg3d-hierarchy";

describe("studio-bg3d-hierarchy", () => {
  it("preserves stable forest order while repairing orphan and self-parent edges", () => {
    const hierarchy = resolveStudioBg3dHierarchy([
      { id: "root" },
      { id: "child-b", parentId: "root" },
      { id: "orphan", parentId: "missing" },
      { id: "self", parentId: "self" },
      { id: "child-a", parentId: "root" },
    ]);

    expect(hierarchy.roots).toEqual(["root", "orphan", "self"]);
    expect(hierarchy.childrenByParent.get("root")).toEqual(["child-b", "child-a"]);
    expect(hierarchy.parentById.get("orphan")).toBeNull();
    expect(hierarchy.parentById.get("self")).toBeNull();
    expect(hierarchy).toMatchObject({
      repairedOrphans: 1,
      repairedSelfParents: 1,
      repairedCycles: 0,
    });
  });

  it("breaks one deterministic edge per cycle and returns a renderable tree", () => {
    const hierarchy = resolveStudioBg3dHierarchy([
      { id: "a", parentId: "b" },
      { id: "b", parentId: "c" },
      { id: "c", parentId: "a" },
      { id: "leaf", parentId: "b" },
    ]);

    expect(hierarchy.roots).toEqual(["a"]);
    expect(hierarchy.parentById.get("a")).toBeNull();
    expect(hierarchy.childrenByParent.get("a")).toEqual(["c"]);
    expect(hierarchy.childrenByParent.get("c")).toEqual(["b"]);
    expect(hierarchy.childrenByParent.get("b")).toEqual(["leaf"]);
    expect(hierarchy.repairedCycles).toBe(1);
  });

  it("normalizes only repaired records and rejects descendant reparenting", () => {
    const root = { id: "root", parentId: null, value: 1 };
    const child = { id: "child", parentId: "root", value: 2 };
    const orphan = { id: "orphan", parentId: "missing", value: 3 };
    const normalized = normalizeStudioBg3dHierarchyParents([root, child, orphan]);

    expect(normalized[0]).toBe(root);
    expect(normalized[1]).toBe(child);
    expect(normalized[2]).toEqual({ ...orphan, parentId: null });
    expect(canSetStudioBg3dParent(normalized, "root", "child")).toBe(false);
    expect(canSetStudioBg3dParent(normalized, "child", "orphan")).toBe(true);
    expect(canSetStudioBg3dParent(normalized, "child", null)).toBe(true);
    expect(canSetStudioBg3dParent(normalized, "missing", null)).toBe(false);
  });
});
