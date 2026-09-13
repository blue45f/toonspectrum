import { BoxGeometry, Group, Material, Mesh, MeshBasicMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";

import { isolateCharacterMask } from "./character-shaper-mask-scope";

describe("character semantic mask scope", () => {
  it("mutes only unwanted slots when a kept draw shares their material", () => {
    const shared = new MeshBasicMaterial({ map: new Texture() });
    const original = [shared, shared];
    const mesh = new Mesh(new BoxGeometry(), original);
    const dispose = vi.spyOn(shared, "dispose");
    const textureDispose = vi.spyOn(shared.map!, "dispose");
    const restore = isolateCharacterMask([mesh], [{ mesh, slots: new Set([0]) }]);
    const slots = mesh.material as Material[];
    expect(slots).not.toBe(original);
    expect(slots[0]).toBe(shared);
    expect(slots[1]).not.toBe(shared);
    expect(slots[1].visible).toBe(false);
    expect(shared.colorWrite).toBe(true);
    expect(shared.depthWrite).toBe(true);
    expect(original).toEqual([shared, shared]);
    const placeholderDispose = vi.spyOn(slots[1], "dispose");
    restore();
    restore();
    expect(mesh.material).toBe(original);
    expect(placeholderDispose).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it("preserves a whole kept mesh sharing a material muted in another kept mesh", () => {
    const shared = new Material();
    const eye = new Material();
    const headMaterials = [shared, eye];
    const head = new Mesh(new BoxGeometry(), headMaterials);
    const face = new Mesh(new BoxGeometry(), shared);
    const restore = isolateCharacterMask([head, face], [{ mesh: head, slots: new Set([1]) }, { mesh: face, slots: null }]);
    expect((head.material as Material[])[0].visible).toBe(false);
    expect(face.material).toBe(shared);
    expect(shared.colorWrite).toBe(true);
    expect(shared.depthWrite).toBe(true);
    restore();
    expect(head.material).toBe(headMaterials);
  });

  it.each([true, false])("keeps selected descendants traversable (shared ancestor material: %s)", (shared) => {
    const selectedMaterial = new Material();
    const parentMaterial = shared ? selectedMaterial : new Material();
    const parent = new Mesh(new BoxGeometry(), parentMaterial);
    const group = new Group();
    const child = new Mesh(new BoxGeometry(), selectedMaterial);
    parent.add(group);
    group.add(child);
    const restore = isolateCharacterMask([parent, child], [{ mesh: child, slots: null }]);
    expect(parent.visible).toBe(true);
    expect(child.visible).toBe(true);
    expect(parent.material.colorWrite).toBe(false);
    expect(parent.material.depthWrite).toBe(false);
    expect(selectedMaterial.colorWrite).toBe(true);
    const visited: string[] = [];
    parent.traverseVisible((object) => { if (object === child) visited.push("child"); });
    expect(visited).toEqual(["child"]);
    restore();
    expect(parent.material).toBe(parentMaterial);
    expect(parentMaterial.colorWrite).toBe(true);
  });

  it("retains preexisting hidden flags and disabled material writes", () => {
    const kept = new Mesh(new BoxGeometry(), new Material());
    kept.visible = false;
    const hidden = new Mesh(new BoxGeometry(), new Material());
    hidden.visible = false;
    const muted = new Material();
    muted.depthWrite = false;
    const selected = new Material();
    const mixed = new Mesh(new BoxGeometry(), [muted, selected]);
    const restore = isolateCharacterMask([kept, hidden, mixed], [{ mesh: kept, slots: null }, { mesh: mixed, slots: new Set([1]) }]);
    expect(kept.visible).toBe(false);
    expect(muted.colorWrite).toBe(false);
    restore();
    expect(kept.visible).toBe(false);
    expect(hidden.visible).toBe(false);
    expect(muted.depthWrite).toBe(false);
    expect(muted.colorWrite).toBe(true);
  });

  it("merges repeated slot targets and lets a whole-mesh target win", () => {
    const materials = [new Material(), new Material(), new Material()];
    const mesh = new Mesh(new BoxGeometry(), materials);
    const restore = isolateCharacterMask([mesh], [{ mesh, slots: new Set([0]) }, { mesh, slots: new Set([1]) }]);
    expect(materials.map((material) => material.colorWrite)).toEqual([true, true, false]);
    restore();
    const whole = isolateCharacterMask([mesh], [{ mesh, slots: new Set([0]) }, { mesh, slots: null }, { mesh, slots: new Set([2]) }]);
    expect(materials.every((material) => material.colorWrite)).toBe(true);
    expect(mesh.material).toBe(materials);
    whole();
  });

  it("restores shared flags once across repeated unselected slots and supports reuse", () => {
    const shared = new Material();
    const eye = new Material();
    const materials = [shared, shared, eye];
    const mesh = new Mesh(new BoxGeometry(), materials);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const restore = isolateCharacterMask([mesh], [{ mesh, slots: new Set([2]) }]);
      expect(shared.colorWrite).toBe(false);
      expect(shared.depthWrite).toBe(false);
      restore();
      expect(shared.colorWrite).toBe(true);
      expect(shared.depthWrite).toBe(true);
      expect(mesh.material).toBe(materials);
    }
  });

  it("restores a scope when the synchronous caller fails", () => {
    const shared = new Material();
    const original = [shared, shared];
    const mesh = new Mesh(new BoxGeometry(), original);
    expect(() => {
      const restore = isolateCharacterMask([mesh], [{ mesh, slots: new Set([0]) }]);
      try { throw new Error("render failed"); } finally { restore(); }
    }).toThrow("render failed");
    expect(mesh.material).toBe(original);
    expect(shared.colorWrite).toBe(true);
  });
});
