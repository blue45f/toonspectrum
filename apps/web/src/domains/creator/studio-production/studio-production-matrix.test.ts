import { describe, expect, it } from "vitest";
import { productionEpisodeRows } from "./studio-production-matrix";
import type { ProductionHierarchyNode, ProductionTask } from "./studio-production-workspace-runtime";

const node = (id: string, kind: ProductionHierarchyNode["kind"], parentId: string | null): ProductionHierarchyNode =>
  ({ id, kind, parentId, title: id, order: 0, pageId: null });
const task = (id: string, hierarchyNodeId: string | null): ProductionTask =>
  ({ id, hierarchyNodeId, title: id, owner: "", due: "", status: "todo", progress: 0 });
describe("episode matrix projection", () => {
  it("uses hierarchy ancestry and keeps unlinked tasks explicit", () => {
    const hierarchy = [node("ep1", "episode", null), node("seq", "sequence", "ep1"), node("scene", "scene", "seq"), node("page", "page", "scene")];
    const rows = productionEpisodeRows([task("ink", "page"), task("missing", "other"), task("root", null)], hierarchy);
    expect(rows[0]?.tasks.map((item) => item.id)).toEqual(["ink"]);
    expect(rows[1]?.id).toBeNull();
    expect(rows[1]?.tasks.map((item) => item.id)).toEqual(["missing", "root"]);
  });
  it("does not invent episode membership for cycles or ambiguous node IDs", () => {
    const hierarchy = [node("a", "scene", "b"), node("b", "sequence", "a"), node("ep", "episode", null), node("ep", "episode", null)];
    const rows = productionEpisodeRows([task("cycle", "a"), task("duplicate", "ep")], hierarchy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBeNull();
    expect(rows[0]?.tasks).toHaveLength(2);
  });
  it("preserves empty configured episodes and does not mutate input order", () => {
    const hierarchy = [node("later", "episode", null), { ...node("first", "episode", null), order: -1 }];
    expect(productionEpisodeRows([], hierarchy).map((row) => row.id)).toEqual(["first", "later"]);
    expect(hierarchy[0]?.id).toBe("later");
  });
});
