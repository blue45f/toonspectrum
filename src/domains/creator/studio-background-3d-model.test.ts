import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  applyBg3dFallbackMaterial,
  cloneBgCustomModelInstances,
  computeAutoFitScale,
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  encodeBg3dSceneWithModelsHash,
  measureBg3dObjectSize,
  parseBg3dSceneWithModelsFromDataUrl,
  type BgCustomModelInstance,
} from "./studio-background-3d-model";
import { createPrimitive, encodeBg3dSceneHash } from "./studio-background-3d-primitives";

describe("studio-background-3d-model", () => {
  it("createBgCustomModelInstance spawns with identity scale and deterministic x-jitter that wraps every 5", () => {
    const at = (existingCount: number) => createBgCustomModelInstance("model-1", existingCount);

    expect(at(0).position).toEqual([0, 0, 0]);
    expect(at(1).position).toEqual([0.8, 0, 0]);
    expect(at(4).position).toEqual([3.2, 0, 0]);
    expect(at(5).position).toEqual([0, 0, 0]); // 5 % 5 === 0, wraps back
    expect(at(7).position).toEqual([1.6, 0, 0]);

    const inst = at(0);
    expect(inst.modelId).toBe("model-1");
    expect(inst.rotation).toEqual([0, 0, 0]);
    expect(inst.scale).toEqual([1, 1, 1]);
    expect(inst.id).toEqual(expect.any(String));
  });

  it("createBgCustomModelInstance accepts an explicit initial scale (e.g. from computeAutoFitScale) and defensively copies it", () => {
    const autoFitScale: [number, number, number] = [0.5, 0.5, 0.5];
    const inst = createBgCustomModelInstance("model-1", 0, autoFitScale);
    autoFitScale[0] = 999; // mutate the source after the fact

    expect(inst.scale).toEqual([0.5, 0.5, 0.5]);
  });

  it("duplicateBgCustomModelInstance keeps modelId/rotation/scale, assigns a new id, and offsets x/z by 0.4", () => {
    const original: BgCustomModelInstance = {
      id: "original-id",
      modelId: "model-42",
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 2, 2],
    };
    const copy = duplicateBgCustomModelInstance(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.modelId).toBe(original.modelId);
    expect(copy.rotation).toEqual(original.rotation);
    expect(copy.scale).toEqual(original.scale);
    expect(copy.position).toEqual([1.4, 2, 3.4]);
  });

  it("cloneBgCustomModelInstances deep-clones tuples so mutating a clone never affects the original", () => {
    const originals: BgCustomModelInstance[] = [
      { id: "a", modelId: "model-1", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    ];
    const cloned = cloneBgCustomModelInstances(originals);
    cloned[0].position[0] = 99;
    cloned[0].scale[1] = 42;

    expect(originals[0].position).toEqual([0, 0, 0]);
    expect(originals[0].scale).toEqual([1, 1, 1]);
    expect(cloned[0].id).toBe("a"); // id/modelId preserved for undo/redo snapshot identity
    expect(cloned[0].modelId).toBe("model-1");
  });

  it("computeAutoFitScale scales the largest dimension to the target size (default 2, or a custom target)", () => {
    expect(computeAutoFitScale([1, 2, 4])).toBeCloseTo(0.5); // default target 2, max dim 4 -> 2/4
    expect(computeAutoFitScale([1, 2, 4], 10)).toBeCloseTo(2.5); // custom target 10 -> 10/4
    // 음수 치수도 절댓값 기준으로 최대 변을 잡는다.
    expect(computeAutoFitScale([-3, 2, 1])).toBeCloseTo(2 / 3);
  });

  it("computeAutoFitScale returns 1 (no-op) for degenerate or non-finite bounding size / target size", () => {
    expect(computeAutoFitScale([0, 0, 0])).toBe(1);
    expect(computeAutoFitScale([Number.NaN, 1, 1])).toBe(1);
    expect(computeAutoFitScale([Number.POSITIVE_INFINITY, 1, 1])).toBe(1);
    expect(computeAutoFitScale([1, 2, 4], 0)).toBe(1);
    expect(computeAutoFitScale([1, 2, 4], -5)).toBe(1);
  });

  it("measureBg3dObjectSize measures a mesh's world-axis-aligned bounding box size", () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6)));

    const [x, y, z] = measureBg3dObjectSize(group);
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(4);
    expect(z).toBeCloseTo(6);
  });

  it("measureBg3dObjectSize returns [0, 0, 0] for an object with no geometry", () => {
    expect(measureBg3dObjectSize(new THREE.Group())).toEqual([0, 0, 0]);
  });

  it("applyBg3dFallbackMaterial shares one neutral MeshStandardMaterial instance across every mesh and disposes the originals", () => {
    const group = new THREE.Group();
    const originalMaterial = new THREE.MeshPhongMaterial({ color: "#111111" });
    const meshA: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), originalMaterial);
    const meshB: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // default material (no .mtl case)
    group.add(meshA, meshB);

    const disposeA = vi.spyOn(originalMaterial, "dispose");
    const disposeB = vi.spyOn(meshB.material as THREE.Material, "dispose");

    applyBg3dFallbackMaterial(group, "#334455");

    expect(meshA.material).toBe(meshB.material); // 하나의 공유 인스턴스
    expect((meshA.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("334455");
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it("applyBg3dFallbackMaterial disposes every material in a multi-material mesh's array", () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const disposeSpies = materials.map((m) => vi.spyOn(m, "dispose"));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);

    applyBg3dFallbackMaterial(mesh);

    expect(Array.isArray(mesh.material)).toBe(false); // 다중 머티리얼도 단일 공유 머티리얼로 교체
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it("encodeBg3dSceneWithModelsHash/parseBg3dSceneWithModelsFromDataUrl round-trips, stays backward-compatible with legacy hashes, and rejects malformed input", () => {
    const primitives = [createPrimitive("box", 0)];
    const customModels = [createBgCustomModelInstance("model-1", 0)];

    const hash = encodeBg3dSceneWithModelsHash(primitives, customModels);
    const restored = parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${hash}`);
    expect(restored?.primitives).toEqual(primitives);
    expect(restored?.customModels).toEqual(customModels);

    // 레거시(프리미티브 전용) 해시도 계속 파싱되어야 한다 — customModels는 빈 배열로 취급.
    const legacyHash = encodeBg3dSceneHash(primitives);
    const restoredLegacy = parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${legacyHash}`);
    expect(restoredLegacy?.primitives).toEqual(primitives);
    expect(restoredLegacy?.customModels).toEqual([]);

    // 잘못된 입력들은 전부 null.
    expect(parseBg3dSceneWithModelsFromDataUrl(undefined)).toBeNull();
    expect(parseBg3dSceneWithModelsFromDataUrl("data:image/png;base64,xyz")).toBeNull(); // '#' 없음
    expect(parseBg3dSceneWithModelsFromDataUrl("data:image/png;base64,xyz#not-json")).toBeNull();
    const foreignToolHash = encodeURIComponent(JSON.stringify({ tool: "vrm-poser", primitives: [] }));
    expect(parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${foreignToolHash}`)).toBeNull();
  });
});
