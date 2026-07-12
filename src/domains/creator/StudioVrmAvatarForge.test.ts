import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { countDetectedVrmHairMeshes } from "./StudioVrmAvatarForge";

import type { VRM } from "@pixiv/three-vrm";

function material(name: string) {
  const value = new THREE.MeshBasicMaterial();
  value.name = name;
  return value;
}

function mesh(name: string, materials: THREE.Material | THREE.Material[]) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
  value.name = name;
  return value;
}

function vrmWith(...objects: THREE.Object3D[]) {
  const scene = new THREE.Group();
  scene.add(...objects);
  return { scene } as unknown as VRM;
}

describe("countDetectedVrmHairMeshes", () => {
  it("detects explicitly separated hair meshes by node or material name", () => {
    const namedHair = mesh("Hair_Back", material("Material.001"));
    const materialHair = mesh("Node_001", material("N00_000_Hair_00_HAIR"));

    expect(countDetectedVrmHairMeshes(vrmWith(namedHair, materialHair))).toBe(2);
  });

  it("never treats a baked body mesh with skin and hair materials as replaceable", () => {
    const bakedBody = mesh("Body (merged).baked", [
      material("N00_000_00_Body_00_SKIN (Instance)"),
      material("N00_000_00_HairBack_00_HAIR (Instance)"),
    ]);

    expect(countDetectedVrmHairMeshes(vrmWith(bakedBody))).toBe(0);
  });

  it("rejects face meshes and ambiguous multi-material generic nodes", () => {
    const faceHair = mesh("Face_Hair_Combined", material("Hair"));
    const ambiguous = mesh("Node_002", [material("Hair_Back"), material("Material.002")]);

    expect(countDetectedVrmHairMeshes(vrmWith(faceHair, ambiguous))).toBe(0);
  });

  it("excludes generated forge descendants from subsequent detection passes", () => {
    const forge = new THREE.Group();
    forge.userData.toonSpectrumAvatarForge = true;
    forge.add(mesh("ToonSpectrumAvatarForgeHair_bang", material("Hair_Bang")));

    expect(countDetectedVrmHairMeshes(vrmWith(forge))).toBe(0);
  });
});
