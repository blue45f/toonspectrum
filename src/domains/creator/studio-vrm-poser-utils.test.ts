import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  stripFingerBones,
  applyPoserVisualState,
  applyFullState,
  planFullStateRestore,
  buildFullVrmStateFromSharedDataUrl,
  applyVrmMaterialFx,
  hasVrmMToonMaterial,
  DEFAULT_VRM_MATERIAL_FX,
  type PoseBoneMap,
  type FingerRotationMap,
  type BodyScale,
  type FullVrmState,
  type VrmMaterialFx,
} from "./studio-vrm-poser-utils";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";


type BoneNodes = Partial<Record<VRMHumanBoneName, THREE.Object3D>>;

function addBone(bones: BoneNodes, name: VRMHumanBoneName, parent: THREE.Object3D, position: THREE.Vector3Tuple) {
  const bone = new THREE.Object3D();
  bone.name = name;
  bone.position.set(position[0], position[1], position[2]);
  parent.add(bone);
  bones[name] = bone;
  return bone;
}

function createMinimalVrm() {
  const scene = new THREE.Group();
  const bones: BoneNodes = {};
  const hips = addBone(bones, "hips", scene, [0, 1.02, 0]);
  const spine = addBone(bones, "spine", hips, [0, 0.22, 0]);
  const chest = addBone(bones, "chest", spine, [0, 0.26, 0]);
  const neck = addBone(bones, "neck", chest, [0, 0.28, 0]);
  addBone(bones, "head", neck, [0, 0.18, 0]);

  const leftShoulder = addBone(bones, "leftShoulder", chest, [0.06, 0.13, 0]);
  const leftUpperArm = addBone(bones, "leftUpperArm", leftShoulder, [0.12, 0, 0]);
  const leftLowerArm = addBone(bones, "leftLowerArm", leftUpperArm, [0.34, -0.62, 0]);
  const leftHand = addBone(bones, "leftHand", leftLowerArm, [0.14, -0.58, 0]);
  addBone(bones, "leftIndexProximal", leftHand, [0.06, -0.07, 0]);

  const rightShoulder = addBone(bones, "rightShoulder", chest, [-0.06, 0.13, 0]);
  const rightUpperArm = addBone(bones, "rightUpperArm", rightShoulder, [-0.12, 0, 0]);
  const rightLowerArm = addBone(bones, "rightLowerArm", rightUpperArm, [-0.34, -0.62, 0]);
  const rightHand = addBone(bones, "rightHand", rightLowerArm, [-0.14, -0.58, 0]);
  addBone(bones, "rightIndexProximal", rightHand, [-0.06, -0.07, 0]);

  const humanoid = {
    resetNormalizedPose: () => {
      Object.values(bones).forEach((b) => {
        b.rotation.set(0, 0, 0);
        b.quaternion.identity();
      });
      scene.position.set(0, 0, 0);
      scene.updateMatrixWorld(true);
    },
    getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name] ?? null,
    update: () => scene.updateMatrixWorld(true),
  };

  const vrm = {
    scene,
    humanoid,
    update: () => scene.updateMatrixWorld(true),
  } as unknown as VRM;

  return { vrm, bones };
}

/** MToonMaterial의 구조적 형태를 흉내 낸 재질(패키지 미의존 — applyVrmMaterialFx와 같은 방식). */
type MToonLikeMaterial = THREE.MeshStandardMaterial & {
  isMToonMaterial: boolean;
  shadeColorFactor: THREE.Color;
  outlineColorFactor: THREE.Color;
  parametricRimColorFactor: THREE.Color;
  rimLightingMixFactor: number;
};

function createMToonLikeMaterial(): MToonLikeMaterial {
  const mat = new THREE.MeshStandardMaterial() as MToonLikeMaterial;
  mat.isMToonMaterial = true;
  mat.shadeColorFactor = new THREE.Color("#ffffff");
  mat.outlineColorFactor = new THREE.Color("#000000");
  mat.parametricRimColorFactor = new THREE.Color("#ffffff");
  mat.rimLightingMixFactor = 0;
  mat.emissiveIntensity = 0;
  return mat;
}

function addMesh(parent: THREE.Object3D, name: string, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

describe("studio-vrm-poser-utils unified pipeline", () => {
  it("stripFingerBones removes finger entries", () => {
    const bones: PoseBoneMap = {
      hips: { rotation: [0, 0, 0] },
      leftIndexProximal: { rotation: [0, 0, 0.3] },
    };
    const stripped = stripFingerBones(bones);
    expect("hips" in stripped).toBe(true);
    expect("leftIndexProximal" in stripped).toBe(false);
  });

  it("applyPoserVisualState applies pose (stripped) then fingerEdits and bodyScale; finger survives different pose", () => {
    const { vrm } = createMinimalVrm();

    const pose1: PoseBoneMap = { hips: { rotation: [0, 0, 0] } };
    const finger: FingerRotationMap = { leftIndexProximal: [0, 0, 0.4] };
    const scale: BodyScale = { height: 1.2, width: 0.9 };

    applyPoserVisualState(vrm, { bones: pose1, fingerEdits: finger, bodyScale: scale });

    const fingerBone = vrm.humanoid!.getNormalizedBoneNode("leftIndexProximal");
    expect(fingerBone?.rotation.z).toBeCloseTo(0.4);

    expect(vrm.scene.scale.y).toBeCloseTo(1.2, 2);

    // switch to different pose
    const pose2: PoseBoneMap = { hips: { rotation: [0.1, 0, 0] } };
    applyPoserVisualState(vrm, { bones: pose2, fingerEdits: finger, bodyScale: scale });

    // finger should still be applied (survives)
    const fingerBone2 = vrm.humanoid!.getNormalizedBoneNode("leftIndexProximal");
    expect(fingerBone2?.rotation.z).toBeCloseTo(0.4);
  });

  it("applyFullState invokes costume/props/physics delegates when present", () => {
    const { vrm } = createMinimalVrm();

    const calls: string[] = [];
    const mockApplyers = {
      applyPose: () => { calls.push("pose"); },
      applyExpr: () => { calls.push("expr"); },
      applyCostume: (c: any) => { calls.push("costume:" + (c ? "yes" : "no")); },
      applyProps: (p: any) => { calls.push("props:" + (p?.items ? "yes" : "no")); },
      applyPhysics: (p: any) => { calls.push("physics:" + (p ? "yes" : "no")); },
      applyCustomColors: (colors: Record<string, string>) => { calls.push("colors:" + colors.face); },
    };

    const fullState = {
      version: 2,
      bones: {},
      costume: { hidden: ["foo"] },
      props: { items: [{ uid: "1" }] },
      physics: { stiffnessScale: 1 },
      customColors: { face: "#123456" },
    } as any;

    applyFullState(vrm, fullState, mockApplyers);

    expect(calls).toContain("costume:yes");
    expect(calls).toContain("props:yes");
    expect(calls).toContain("physics:yes");
    expect(calls).toContain("colors:#123456");
  });

  it("applyFullState sends an empty normalized prop collection when props are absent", () => {
    const { vrm } = createMinimalVrm();
    let received: unknown = null;
    applyFullState(vrm, { version: 2, bones: {}, yOffset: 0 }, {
      applyPose: () => undefined,
      applyExpr: () => undefined,
      applyProps: (props) => { received = props; },
    });
    expect(received).toEqual(expect.objectContaining({ items: [] }));
  });

  it("planFullStateRestore returns complete plan with stripped bones for maximal AC2 input", () => {
    const input: FullVrmState = {
      version: 2,
      bones: {
        hips: { rotation: [0, 0, 0] },
        leftIndexProximal: { rotation: [0, 0, 0.3] },
      },
      yOffset: 0.1,
      expressionWeights: { happy: 0.8 },
      bodyScale: { height: 1.2, width: 0.95 },
      lighting: { intensity: 1.5, colorTemp: 0.7, directionDeg: 45 },
      env: "floor",
      fingerOverrides: { leftIndexProximal: [0, 0, 0.3] },
      costume: { hidden: ["x"] },
      props: {
        version: 1,
        items: [{
          uid: "p1",
          propId: "book",
          bone: "leftHand",
          position: [0.02, 0.01, 0.04],
          rotationDeg: [60, 0, 0],
          scale: 1,
          color: "#7a3b3b",
        }],
      },
      sceneProps: {
        version: 1,
        active: ["cat"],
        attachments: { cat: { bone: "none", offsetX: 0.1, offsetY: 0, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 } },
      },
      physics: { stiffnessScale: 1.1 },
      materialFx: { rimIntensity: 0.35 },
      avatarForge: { version: 1, presetId: "hero" },
      customColors: { face: "#123456", body: "#123456" },
    } as any;

    const plan = planFullStateRestore(input);
    expect("leftIndexProximal" in plan.strippedBones).toBe(false);
    expect("hips" in plan.strippedBones).toBe(true);
    expect(plan.yOffset).toBe(0.1);
    expect(plan.expressionWeights.happy).toBe(0.8);
    expect(plan.bodyScale?.height).toBe(1.2);
    expect(plan.lighting?.intensity).toBe(1.5);
    expect(plan.env).toBe("floor");
    expect(plan.fingerOverrides?.leftIndexProximal?.[2]).toBeCloseTo(0.3);
    expect((plan.costume as any)?.hidden).toContain("x");
    expect((plan.propsItems as any)?.[0]?.uid).toBe("p1");
    expect(plan.sceneProps.active).toEqual(["cat"]);
    expect((plan.physics as any)?.stiffnessScale).toBe(1.1);
    expect(plan.materialFx?.rimIntensity).toBe(0.35);
    expect(plan.avatarForge).toEqual({ version: 1, presetId: "hero" });
    expect(plan.customColors?.face).toBe("#123456");
  });

  it("normalizes corrupted props and clears stale props when the field is absent", () => {
    const corrupted = planFullStateRestore({
      version: 2,
      bones: {},
      yOffset: 0,
      props: {
        version: 1,
        items: [
          { propId: "ghost" },
          { uid: "valid", propId: "book", bone: "tail", position: [999, 0, 0] },
        ],
      },
    });
    expect(corrupted.propsItems).toHaveLength(1);
    expect(corrupted.propsItems[0]?.bone).toBe("leftHand");
    expect(corrupted.propsItems[0]?.position[0]).toBe(1);

    const absent = planFullStateRestore({ version: 2, bones: {}, yOffset: 0 });
    expect(absent.propsItems).toEqual([]);
    expect(absent.sceneProps.active).toEqual([]);
  });

  it("restores wardrobe, material effects and avatar forge state from shared PNG metadata", () => {
    const metadata = {
      bones: { hips: { rotation: [0, 0, 0] } },
      yOffset: 0.04,
      wardrobe: { version: 1, slots: { top: { itemId: "lab-coat" } } },
      sceneProps: {
        version: 1,
        active: ["cat"],
        attachments: { cat: { bone: "none", offsetX: 0, offsetY: 0, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 } },
      },
      materialFx: { rimIntensity: 0.42 },
      avatarForge: { version: 1, presetId: "soft-hero" },
    };
    const state = buildFullVrmStateFromSharedDataUrl(
      `data:image/png;base64,AA#${encodeURIComponent(JSON.stringify(metadata))}`
    );

    expect(state?.wardrobe).toEqual(metadata.wardrobe);
    expect(state?.sceneProps).toEqual(metadata.sceneProps);
    expect(state?.materialFx).toEqual(metadata.materialFx);
    expect(state?.avatarForge).toEqual(metadata.avatarForge);
  });
});

describe("VRM material fx (MToon shade/outline/rim/emissive)", () => {
  it("hasVrmMToonMaterial is false with no meshes or only non-MToon meshes, true once an MToon mesh exists", () => {
    const { vrm } = createMinimalVrm();
    expect(hasVrmMToonMaterial(vrm)).toBe(false);

    addMesh(vrm.scene, "Body", new THREE.MeshBasicMaterial());
    expect(hasVrmMToonMaterial(vrm)).toBe(false);

    addMesh(vrm.scene, "Tops", createMToonLikeMaterial());
    expect(hasVrmMToonMaterial(vrm)).toBe(true);
  });

  it("applyVrmMaterialFx sets shade/outline/rim/emissive uniforms on MToon materials only", () => {
    const { vrm } = createMinimalVrm();
    const mtoonMat = createMToonLikeMaterial();
    const standardMat = new THREE.MeshStandardMaterial();
    addMesh(vrm.scene, "Tops", mtoonMat);
    addMesh(vrm.scene, "Body", standardMat);

    const fx: VrmMaterialFx = {
      shadeColor: "#112233",
      outlineColor: "#445566",
      rimColor: "#778899",
      rimIntensity: 0.6,
      emissiveColor: "#ff00ff",
      emissiveIntensity: 0.4,
    };
    applyVrmMaterialFx(vrm, fx);

    expect(`#${mtoonMat.shadeColorFactor.getHexString()}`).toBe("#112233");
    expect(`#${mtoonMat.outlineColorFactor.getHexString()}`).toBe("#445566");
    expect(`#${mtoonMat.parametricRimColorFactor.getHexString()}`).toBe("#778899");
    expect(mtoonMat.rimLightingMixFactor).toBeCloseTo(0.6);
    expect(`#${mtoonMat.emissive.getHexString()}`).toBe("#ff00ff");
    expect(mtoonMat.emissiveIntensity).toBeCloseTo(0.4);

    // 표준 재질엔 isMToonMaterial 플래그가 없으므로 색 변경 없이 조용히 건너뛴다(에러 없음).
    expect(standardMat.emissive.getHexString()).toBe("000000");
  });

  it("applyVrmMaterialFx leaves emissive untouched on protected (face/eye) meshes but still applies shade/outline/rim", () => {
    const { vrm } = createMinimalVrm();
    const faceMat = createMToonLikeMaterial();
    addMesh(vrm.scene, "Face", faceMat);

    const fx: VrmMaterialFx = {
      ...DEFAULT_VRM_MATERIAL_FX,
      shadeColor: "#123456",
      emissiveColor: "#ff00ff",
      emissiveIntensity: 0.9,
    };
    applyVrmMaterialFx(vrm, fx);

    expect(`#${faceMat.shadeColorFactor.getHexString()}`).toBe("#123456");
    // 보호 카테고리(얼굴)는 발광색 변경에서 제외된다.
    expect(`#${faceMat.emissive.getHexString()}`).not.toBe("#ff00ff");
  });

  it("applyVrmMaterialFx is a no-op when every fx field is null/default", () => {
    const { vrm } = createMinimalVrm();
    const mat = createMToonLikeMaterial();
    addMesh(vrm.scene, "Tops", mat);

    expect(() => applyVrmMaterialFx(vrm, DEFAULT_VRM_MATERIAL_FX)).not.toThrow();
    expect(`#${mat.shadeColorFactor.getHexString()}`).toBe("#ffffff");
    expect(`#${mat.outlineColorFactor.getHexString()}`).toBe("#000000");
  });
});
