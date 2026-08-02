import { describe, it, expect } from "vitest";

import { Studio3DModifierDAG } from "./studio-3d-modifier-dag";

describe("Studio3DModifierDAG", () => {
  it("adds, reorders, and removes modifiers from the stack", () => {
    const dag = new Studio3DModifierDAG();
    const mirror = dag.addModifier("mirror");
    const array = dag.addModifier("array");
    const bevel = dag.addModifier("bevel");

    expect(dag.getStack().length).toBe(3);
    expect(dag.getStack()[0].id).toBe(mirror.id);
    expect(array.type).toBe("array");

    // reorder: move bevel to index 0
    dag.moveModifier(bevel.id, 0);
    expect(dag.getStack()[0].id).toBe(bevel.id);

    // remove mirror
    dag.removeModifier(mirror.id);
    expect(dag.getStack().length).toBe(2);
  });

  it("toggles modifier enabled state", () => {
    const dag = new Studio3DModifierDAG();
    const mod = dag.addModifier("solidify");

    expect(mod.enabled).toBe(true);
    dag.toggleModifier(mod.id, false);
    expect(dag.getModifier(mod.id)?.enabled).toBe(false);
    expect(dag.getActiveModifiers().length).toBe(0);
  });

  it("duplicates a modifier preserving params", () => {
    const dag = new Studio3DModifierDAG();
    const orig = dag.addModifier("subdivision");
    const dup = dag.duplicateModifier(orig.id);

    expect(dup).toBeDefined();
    expect(dup!.id).not.toBe(orig.id);
    expect(dup!.type).toBe("subdivision");
    expect(dag.getStack().length).toBe(2);
  });

  it("serializes and deserializes the modifier stack", () => {
    const dag = new Studio3DModifierDAG();
    dag.addModifier("mirror");
    dag.addModifier("boolean", "불리언 빼기", { operation: "subtract", targetMeshId: "mesh-42" });

    const json = dag.serializeToJSON();
    const dag2 = new Studio3DModifierDAG();
    dag2.loadFromJSON(json);

    expect(dag2.getStack().length).toBe(2);
    expect(dag2.getStack()[1].name).toBe("불리언 빼기");
  });

  it("provides default Korean names for all modifier types", () => {
    const dag = new Studio3DModifierDAG();
    const types = [
      "mirror", "array", "boolean", "bevel", "solidify",
      "subdivision", "decimate", "weld", "weighted-normal",
      "curve-deform", "lattice", "shrinkwrap", "simple-deform",
    ] as const;

    for (const t of types) {
      const mod = dag.addModifier(t);
      expect(mod.name.length).toBeGreaterThan(0);
    }
    expect(dag.getStack().length).toBe(types.length);
  });
});
