import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyStudioVrmSemanticFaceMorphs,
  inspectStudioVrmSemanticFaceMorphProfile,
} from "./studio-vrm-semantic-face-morph";

import type { VRM } from "@pixiv/three-vrm";

function vrmWithMorphs(names: readonly string[], baselines?: readonly number[]): VRM {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = "Face";
  mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]));
  mesh.morphTargetInfluences = names.map((_, index) => baselines?.[index] ?? 0);
  scene.add(mesh);
  return { scene } as unknown as VRM;
}

function firstMorphMesh(vrm: VRM): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  vrm.scene.traverse((object) => {
    if (!found && (object as THREE.Mesh).isMesh) found = object as THREE.Mesh;
  });
  if (!found) throw new Error("missing morph mesh");
  return found;
}

describe("studio-vrm-semantic-face-morph", () => {
  it("admits exact semantic aliases while excluding expression morphs", () => {
    const vrm = vrmWithMorphs([
      "Face_EyeSizeBig",
      "face_eye_size_small",
      "Fcl_EYE_Blink",
      "Fcl_MTH_A",
      "Joy",
    ]);
    const profile = inspectStudioVrmSemanticFaceMorphProfile(vrm);

    expect(profile.status).toBe("ready");
    expect(profile.controls).toHaveLength(1);
    expect(profile.controls[0]).toMatchObject({
      id: "eyeSize",
      minimum: -1,
      maximum: 1,
      positiveTargetCount: 1,
      negativeTargetCount: 1,
    });
    expect(profile.targetCount).toBe(2);
    expect(profile.controls[0]?.targetNames).not.toContain("Fcl_EYE_Blink");
  });

  it("applies positive and negative targets from an exact captured baseline", () => {
    const vrm = vrmWithMorphs(
      ["eyeSizeBig", "eyeSizeSmall", "noseWidthWide"],
      [0.2, 0.1, 0.25],
    );
    const mesh = firstMorphMesh(vrm);
    const releasePositive = applyStudioVrmSemanticFaceMorphs(vrm, {
      eyeSize: 0.5,
      noseWidth: 0.4,
    });

    expect(mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.6);
    expect(mesh.morphTargetInfluences?.[1]).toBeCloseTo(0.1);
    expect(mesh.morphTargetInfluences?.[2]).toBeCloseTo(0.55);

    releasePositive();
    expect(mesh.morphTargetInfluences).toEqual([0.2, 0.1, 0.25]);

    const releaseNegative = applyStudioVrmSemanticFaceMorphs(vrm, { eyeSize: -0.75 });
    expect(mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.2);
    expect(mesh.morphTargetInfluences?.[1]).toBeCloseTo(0.775);
    releaseNegative();
    expect(mesh.morphTargetInfluences).toEqual([0.2, 0.1, 0.25]);
  });

  it("reports one-sided control ranges without inventing the missing direction", () => {
    const positiveOnly = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["avatarMouthWidthWide"]),
    );
    expect(positiveOnly.controls[0]).toMatchObject({
      id: "mouthWidth",
      minimum: 0,
      maximum: 1,
    });

    const negativeOnly = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["blendshapeEarSizeSmall"]),
    );
    expect(negativeOnly.controls[0]).toMatchObject({
      id: "earSize",
      minimum: -1,
      maximum: 0,
    });
  });

  it("fails closed when a model exposes only animation expressions", () => {
    const profile = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["Blink", "Fcl_EYE_Joy", "Fcl_MTH_A", "Surprised"]),
    );
    expect(profile.status).toBe("unavailable");
    expect(profile.controls).toEqual([]);
    expect(profile.targetCount).toBe(0);
  });
});
