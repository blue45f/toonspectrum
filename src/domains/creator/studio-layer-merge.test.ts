import { describe, expect, it } from "vitest";

import {
  applyStudioLayerMergePlan,
  planStudioLayerFlattenVisible,
  planStudioLayerMergeDown,
  planStudioLayerMergeSelected,
} from "./studio-layer-merge";

import type { LayerItemLike } from "./studio-layers";

const items: LayerItemLike[] = [
  { id: "a" },
  { id: "b" },
  { id: "c", locked: true },
  { id: "d", hidden: true },
  { id: "e" },
];

describe("studio layer merge planners", () => {
  it("plans merge-down with the layer immediately below", () => {
    const result = planStudioLayerMergeDown({ items, selectedId: "b" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.removeIds).toEqual(["a", "b"]);
    expect(result.plan.insertIndex).toBe(0);
    expect(result.plan.sources.map((s) => s.zIndex)).toEqual([0, 1]);
  });

  it("rejects merge-down for bottom or locked layers", () => {
    expect(planStudioLayerMergeDown({ items, selectedId: "a" }).ok).toBe(false);
    expect(planStudioLayerMergeDown({ items, selectedId: "c" }).ok).toBe(false);
  });

  it("plans merge-selected for two unlocked visible layers", () => {
    const result = planStudioLayerMergeSelected({
      items,
      selectedIds: ["b", "e"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.removeIds).toEqual(["b", "e"]);
    expect(result.plan.insertIndex).toBe(1);
  });

  it("plans flatten-visible skipping hidden and failing on locked", () => {
    const unlocked = items.map((item) =>
      item.id === "c" ? { ...item, locked: false } : item
    );
    const flat = planStudioLayerFlattenVisible({ items: unlocked });
    expect(flat.ok).toBe(true);
    if (!flat.ok) return;
    // a,b,c,e visible (d hidden)
    expect(flat.plan.removeIds).toEqual(["a", "b", "c", "e"]);

    expect(planStudioLayerFlattenVisible({ items }).ok).toBe(false);
  });

  it("applies merge plan by removing sources and inserting composite", () => {
    const plan = planStudioLayerMergeDown({ items, selectedId: "b" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const next = applyStudioLayerMergePlan(items, plan.plan, { id: "merged" });
    expect(next.map((item) => item.id)).toEqual(["merged", "c", "d", "e"]);
  });
});
