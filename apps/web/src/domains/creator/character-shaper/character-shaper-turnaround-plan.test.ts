import { Bone, Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshBasicMaterial, PerspectiveCamera, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { measureCharacterTurnaroundBounds, planCharacterTurnaround } from "./character-shaper-turnaround-plan";

function geometry() {
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 1, 1, -1, 0, -1], 3));
}

describe("character turnaround planning", () => {
  it.each([4, 8] as const)("fits every corner into %s views with identical scale", (count) => {
    const bounds = new Box3(new Vector3(-2, -0.2, -0.7), new Vector3(3, 2.8, 2));
    const before = bounds.clone();
    const views = planCharacterTurnaround(bounds, count, 0.75, 0.4);
    expect(views).toHaveLength(count);
    expect(new Set(views.map((view) => view.camera.top)).size).toBe(1);
    for (const view of views) {
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new Vector3(x, y, z).project(view.camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 / 1.16 + 1e-9);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 / 1.16 + 1e-9);
        expect(Math.abs(projected.z)).toBeLessThan(1);
      }
    }
    expect(bounds.equals(before)).toBe(true);
  });
  it("uses transformed morph positions and ignores hidden and wrong-layer meshes", async () => {
    const scene = new Group();
    const shape = geometry();
    shape.morphAttributes.position = [new Float32BufferAttribute([0, 1, 0, 1, 3, 1, -1, 2, -1], 3)];
    const mesh = new Mesh(shape, new MeshBasicMaterial());
    mesh.morphTargetInfluences![0] = 1;
    mesh.position.x = 4;
    scene.add(mesh);
    const hidden = new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial());
    hidden.visible = false;
    scene.add(hidden);
    const layered = hidden.clone();
    layered.visible = true;
    layered.layers.set(2);
    scene.add(layered);
    const bounds = await measureCharacterTurnaroundBounds(scene, new PerspectiveCamera());
    expect(bounds.min.toArray()).toEqual([3, 1, -1]);
    expect(bounds.max.toArray()).toEqual([5, 3, 1]);
  });
  it("measures current skin deformation instead of cached bind-pose bounds", async () => {
    const shape = geometry();
    shape.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(12), 4));
    shape.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(shape, new MeshBasicMaterial());
    const bone = new Bone();
    mesh.add(bone);
    mesh.bind(new Skeleton([bone]));
    mesh.computeBoundingBox();
    bone.position.y = 2;
    const scene = new Group();
    scene.add(mesh);
    const bounds = await measureCharacterTurnaroundBounds(scene, new PerspectiveCamera());
    expect(bounds.min.y).toBe(2);
    expect(bounds.max.y).toBe(3);
    expect(mesh.boundingBox!.min.y).toBe(0);
  });
  it("yields during vertex inspection and cancels before completing", async () => {
    const scene = new Group();
    const shape = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(9000 * 3), 3));
    scene.add(new Mesh(shape, new MeshBasicMaterial()));
    const controller = new AbortController();
    const progress = vi.fn(() => controller.abort());
    await expect(measureCharacterTurnaroundBounds(scene, new PerspectiveCamera(), { signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(8192, 9000);
  });
  it("rejects empty scenes and unsupported instance bounds rather than misframing", async () => {
    await expect(measureCharacterTurnaroundBounds(new Group(), new PerspectiveCamera())).rejects.toThrow("표시 중인 모델");
    const scene = new Group();
    scene.add(new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1));
    await expect(measureCharacterTurnaroundBounds(scene, new PerspectiveCamera())).rejects.toThrow("인스턴스");
    expect(() => planCharacterTurnaround(new Box3(), 4)).toThrow();
    expect(() => planCharacterTurnaround(new Box3(new Vector3(), new Vector3(1, 1, 1)), 6 as 4)).toThrow();
  });
});
