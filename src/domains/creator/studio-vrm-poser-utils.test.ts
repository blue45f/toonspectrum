import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STUDIO_HUMANOID_BONE_NAMES } from "./studio-humanoid-bones";
import {
  STUDIO_VRM_APPLIED_HUMANOID_BONES,
  applyPoseToVrm,
  stripFingerBones,
  applyPoserVisualState,
  applyFullState,
  planFullStateRestore,
  buildFullVrmStateFromSharedDataUrl,
  canRestoreFullVrmHistoryState,
  normalizeVrmBodyRotation,
  serializeFullVrmState,
  buildVrmPoseDataUrlMetadata,
  createFullStateLoadHandlers,
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
  it("applies the complete shared 55-bone vocabulary including optional face and toe bones", () => {
    expect(STUDIO_VRM_APPLIED_HUMANOID_BONES).toEqual(STUDIO_HUMANOID_BONE_NAMES);
    const scene = new THREE.Group();
    const optionalBones = [
      "upperChest",
      "leftEye",
      "rightEye",
      "jaw",
      "leftToes",
      "rightToes",
    ] as const;
    const nodes = new Map<VRMHumanBoneName, THREE.Object3D>();
    for (const bone of optionalBones) {
      const node = new THREE.Object3D();
      scene.add(node);
      nodes.set(bone, node);
    }
    const vrm = {
      scene,
      humanoid: {
        resetNormalizedPose: () => nodes.forEach((node) => node.rotation.set(0, 0, 0)),
        getNormalizedBoneNode: (bone: VRMHumanBoneName) => nodes.get(bone) ?? null,
        update: () => undefined,
      },
      update: () => undefined,
    } as unknown as VRM;
    const pose = Object.fromEntries(
      optionalBones.map((bone, index) => [bone, { rotation: [0.01 * (index + 1), 0.02, -0.03] }]),
    ) as PoseBoneMap;

    expect(applyPoseToVrm(vrm, pose, 0)).toBe(true);
    for (const bone of optionalBones) {
      expect(nodes.get(bone)?.rotation.x).toBeCloseTo(pose[bone]!.rotation![0]);
    }
  });

  it("serializes a bounded body rotation and explicit model owner while rejecting unsafe values", () => {
    const serialized = serializeFullVrmState({
      modelId: "model-a",
      bodyRotation: Math.PI / 3,
    });
    expect(serialized.modelId).toBe("model-a");
    expect(serialized.bodyRotation).toBeCloseTo(Math.PI / 3);

    const transported = JSON.parse(JSON.stringify(serialized)) as FullVrmState;
    const restorePlan = planFullStateRestore(transported);
    expect(restorePlan.modelId).toBe("model-a");
    expect(restorePlan.bodyRotation).toBeCloseTo(Math.PI / 3);

    expect(serializeFullVrmState({ bodyRotation: Number.POSITIVE_INFINITY }).bodyRotation).toBe(0);
    expect(serializeFullVrmState({ bodyRotation: Math.PI * 4 }).bodyRotation).toBe(Math.PI);
    expect(serializeFullVrmState({ bodyRotation: -Math.PI * 4 }).bodyRotation).toBe(-Math.PI);
    expect(serializeFullVrmState({ modelId: "bad\u0000id" }).modelId).toBeUndefined();
    expect(serializeFullVrmState({ modelId: " model-a " }).modelId).toBeUndefined();
    expect(serializeFullVrmState({ modelId: "x".repeat(257) }).modelId).toBeUndefined();
    expect(normalizeVrmBodyRotation(Number.NaN)).toBe(0);
  });

  it("allows undo/redo only for an explicitly matching model owner", () => {
    const owned = serializeFullVrmState({ modelId: "model-a" });
    const legacy = serializeFullVrmState({});

    expect(canRestoreFullVrmHistoryState(owned, "model-a")).toBe(true);
    expect(canRestoreFullVrmHistoryState(owned, "model-b")).toBe(false);
    expect(canRestoreFullVrmHistoryState(legacy, "model-a")).toBe(false);
    expect(canRestoreFullVrmHistoryState(owned, "")).toBe(false);
  });

  it("builds one canonical PNG metadata payload for share and re-edit", () => {
    const metadata = buildVrmPoseDataUrlMetadata({
      modelId: "model-a",
      bones: { hips: { rotation: [0, 0.1, 0] } },
      bodyRotation: Math.PI / 6,
      props: { version: 1, items: [] },
    }, "Model A");

    expect(metadata.tool).toBe("vrm-poser");
    expect(metadata.modelName).toBe("Model A");
    expect(metadata.modelId).toBe("model-a");
    expect(metadata.bodyRotation).toBeCloseTo(Math.PI / 6);
    expect(metadata.vrmProps).toEqual({ version: 1, items: [] });
    expect("props" in metadata).toBe(false);

    const restored = buildFullVrmStateFromSharedDataUrl(
      `data:image/png;base64,AA#${encodeURIComponent(JSON.stringify(metadata))}`,
    );
    expect(restored?.modelId).toBe("model-a");
    expect(restored?.bodyRotation).toBeCloseTo(Math.PI / 6);
    expect(planFullStateRestore(restored as FullVrmState).bodyRotation).toBeCloseTo(Math.PI / 6);
  });

  it("keeps explicit full-state load as an intentional cross-model transfer", () => {
    const saved = serializeFullVrmState({
      modelId: "source-model",
      bodyRotation: 0.4,
    });
    const committed: FullVrmState[] = [];
    const handlers = createFullStateLoadHandlers({
      savedFullStates: { saved },
      commitFullStateRestore: (state) => committed.push(state),
      vrmRef: { current: null },
    });

    handlers.handleLoadFullLocal("saved");
    expect(committed).toEqual([saved]);
  });

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
      modelId: "model-a",
      bones: {
        hips: { rotation: [0, 0, 0] },
        leftIndexProximal: { rotation: [0, 0, 0.3] },
      },
      yOffset: 0.1,
      bodyRotation: Math.PI / 4,
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
    expect(plan.modelId).toBe("model-a");
    expect(plan.bodyRotation).toBeCloseTo(Math.PI / 4);
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
    expect(absent.bodyRotation).toBe(0);
    expect(absent.propsItems).toEqual([]);
    expect(absent.sceneProps.active).toEqual([]);
  });

  it("restores wardrobe, material effects and avatar forge state from shared PNG metadata", () => {
    const metadata = {
      modelId: "model-shared",
      bones: { hips: { rotation: [0, 0, 0] } },
      yOffset: 0.04,
      bodyRotation: -Math.PI / 2,
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
    expect(state?.modelId).toBe("model-shared");
    expect(state?.bodyRotation).toBeCloseTo(-Math.PI / 2);
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
