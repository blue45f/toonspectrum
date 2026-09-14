import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";

import { buildStudioVrmSkinnedGarment, disposeStudioVrmSkinnedGarment } from "./studio-vrm-skinned-garment";
import { buildGarmentParts } from "./studio-vrm-wardrobe";
import { measureStudioVrmWardrobeMetrics } from "./StudioVrmWardrobePropsProjection";

it.each(["sample.vrm", "AvatarSample_B.vrm"])("keeps %s sleeve rings on the arm when it lowers", async (filename) => {
  (globalThis as unknown as { self: typeof globalThis }).self = globalThis;
  const bytes = readFileSync(join(process.cwd(), "apps/web/public/vrm", filename));
  const loader = new GLTFLoader();
  // Geometry/skinning regression: omit texture decoding, which needs a browser image API.
  loader.register(() => ({ name: "fixture-no-texture-decode", loadTexture: async () => new THREE.Texture() }));
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
  const vrm = gltf.userData.vrm as VRM;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  vrm.humanoid.resetNormalizedPose();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  const metrics = measureStudioVrmWardrobeMetrics(vrm);
  const parts = buildGarmentParts("tshirt", metrics, 1).filter((part) => (
    part.bone === "leftUpperArm" || part.bone === "rightUpperArm"
  ));
  expect(parts).toHaveLength(2);
  const materials = parts.map(() => new THREE.MeshBasicMaterial());
  const built = buildStudioVrmSkinnedGarment({
    name: "fixture-short-sleeves", root: vrm.scene, parts, materials,
    resolveBone: (bone) => vrm.humanoid.getRawBoneNode(bone),
  });
  expect(built.ok).toBe(true);
  const surface = built.surface!;
  const mesh = surface.mesh;
  vrm.scene.add(mesh);
  vrm.scene.updateMatrixWorld(true);
  const vertices = mesh.geometry.groups.map((group) => {
    const arm = vrm.humanoid.getRawBoneNode(parts[group.materialIndex!].bone)!;
    const indices = new Set<number>();
    for (let i = group.start; i < group.start + group.count; i += 1) indices.add(mesh.geometry.index!.getX(i));
    return [...indices].map((index) => ({
      index, arm,
      local: arm.worldToLocal(mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),
    }));
  }).flat();
  for (const angle of [0.6, 1.25, 0]) {
    vrm.humanoid.getNormalizedBoneNode("leftUpperArm")!.rotation.z = -angle;
    vrm.humanoid.getNormalizedBoneNode("rightUpperArm")!.rotation.z = angle;
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    for (const { index, arm, local } of vertices) {
      const actual = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const expected = arm.localToWorld(local.clone());
      expect(actual.distanceTo(expected), `${filename}: vertex ${index}, arm angle ${angle}`).toBeLessThan(1e-5);
    }
  }
  disposeStudioVrmSkinnedGarment(surface);
  materials.forEach((material) => material.dispose());
  VRMUtils.deepDispose(vrm.scene);
});
