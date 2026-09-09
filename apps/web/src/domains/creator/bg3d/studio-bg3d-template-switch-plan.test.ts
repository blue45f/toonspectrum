import { describe, expect, it } from "vitest";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import { allocateStudioBg3dTemplateInstanceNodeIds } from "./studio-bg3d-template-instance";
import { planStudioBg3dCatalogTemplateSwitch } from "./studio-bg3d-template-switch-plan";

function primitive(id: string, parentId: string | null = null): BgPrimitive {
  return { id, parentId, locked: false } as unknown as BgPrimitive;
}

function model(id: string, parentId: string | null = null): BgCustomModelInstance {
  return { id, parentId, locked: false } as unknown as BgCustomModelInstance;
}

function catalogIds(sourceId: string, insertionOffset: number, count: number, seed: string) {
  const allocation = allocateStudioBg3dTemplateInstanceNodeIds({
    sourceKind: "catalog",
    sourceId,
    insertionOffset,
    nodeCount: count,
    occupiedNodeIds: new Set(),
    createSeed: () => seed,
  });
  if (!allocation) throw new Error("test allocation failed");
  return allocation.nodeIds;
}

describe("catalog template switch plan", () => {
  it("replaces every legacy catalog instance while preserving ordinary scene objects", () => {
    const first = catalogIds("room-a", 4, 2, "a");
    const second = catalogIds("room-b", 12, 1, "b");
    const user = primitive("user-chair");
    const plan = planStudioBg3dCatalogTemplateSwitch({
      primitives: [user, primitive(first[0]!), primitive(first[1]!, first[0]!), primitive(second[0]!)],
      customModels: [],
    });

    expect(plan).not.toBeNull();
    expect(plan!.insertionOffset).toBe(4);
    expect(plan!.retainedPrimitives.map((entry) => entry.id)).toEqual(["user-chair"]);
    expect([...plan!.removedNodeIds]).toEqual(expect.arrayContaining([...first, ...second]));
    expect([...plan!.occupiedNodeIds]).toEqual(["user-chair"]);
  });

  it("places the first active catalog template at the visible scene origin", () => {
    const plan = planStudioBg3dCatalogTemplateSwitch({
      primitives: [primitive("user-prop")],
      customModels: [],
    });
    expect(plan?.insertionOffset).toBe(0);
  });

  it("fails closed if a retained entity depends on a template parent", () => {
    const ids = catalogIds("room-a", 0, 1, "a");
    expect(planStudioBg3dCatalogTemplateSwitch({
      primitives: [primitive(ids[0]!), primitive("external-child", ids[0]!)],
      customModels: [],
    })).toBeNull();
  });

  it("fails closed before silently deleting a future catalog-owned model attachment", () => {
    const ids = catalogIds("future-model-template", 0, 1, "model");
    expect(planStudioBg3dCatalogTemplateSwitch({
      primitives: [],
      customModels: [model(ids[0]!)],
    })).toBeNull();
  });
});
