/**
 * 절차 소스(HumanoidModelData) → Babylon 리그 바인딩: VertexData(위치·법선·UV·인덱스·스킨 4가중치),
 * MorphTargetManager(텍스처 모드 요청, 절대 위치 = 기준 + 델타), Skeleton/Bone(rest 행렬, TransformNode 링크),
 * mesh.metadata = { partId, role, materialId }. 재질은 프리셋 팩토리가 만든다.
 */
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget.js";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

import { ALL_AVAILABLE_CAPABILITIES, isHumanoidBoneName, validateMeshPartData } from "../../contracts";
import { qMultiply, qNormalize } from "../../shared/math";
import { resolvePartColorHex } from "../material-presets";

import { addFloat32, toFloat32, toQuaternion, toVector3 } from "./convert";

import type { CharacterRig, RigBone, RigMaterialHooks, RigPart } from "./character-rig";
import type { HumanoidBoneName, HumanoidModelData, LabFailure, MaterialPresetId, MeshPartData, Quat } from "../../contracts";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface ProceduralBindDeps {
  readonly scene: Scene;
  readonly createMaterial: (part: MeshPartData, colorHex: string) => PBRMaterial;
  readonly materials: RigMaterialHooks;
  readonly now?: number;
}

export class RigBindError extends Error {
  readonly failure: LabFailure;

  constructor(failure: LabFailure) {
    super(failure.reasonKo);
    this.name = "RigBindError";
    this.failure = failure;
  }
}

/** mesh.metadata 구조(pick 술어·export 선택이 읽는다) */
export interface RigMeshMetadata {
  readonly partId: number;
  readonly role: string;
  readonly materialId: number;
  readonly outline: boolean;
  readonly characterRig: true;
}

export function rigMeshMetadata(partId: number, role: string, materialId: number, outline: boolean): RigMeshMetadata {
  return { partId, role, materialId, outline, characterRig: true };
}

export function readRigMeshMetadata(value: unknown): RigMeshMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<RigMeshMetadata>;
  if (candidate.characterRig !== true || typeof candidate.partId !== "number") return null;
  return candidate as RigMeshMetadata;
}

interface BoneBuild {
  readonly rb: RigBone;
}

export function bindProceduralModel(model: HumanoidModelData, deps: ProceduralBindDeps): CharacterRig {
  const { scene } = deps;
  for (const part of model.parts) {
    const failure = validateMeshPartData(part, deps.now);
    if (failure) throw new RigBindError(failure);
  }
  const root = new TransformNode("character-root", scene);
  const disposables: Array<{ dispose(): void }> = [];

  // ---- 스켈레톤(부모 먼저 만들기 위해 이름 → 데이터 인덱스 후 재귀)
  const skeleton = new Skeleton("character", "character", scene);
  skeleton.useTextureToStoreBoneMatrices = true;
  const boneData = new Map(model.skeleton.bones.map((bone) => [bone.name, bone]));
  const built = new Map<string, BoneBuild>();
  const humanoid = new Map<HumanoidBoneName, RigBone>();
  const visiting = new Set<string>();
  const build = (name: string): BoneBuild => {
    const existing = built.get(name);
    if (existing) return existing;
    const data = boneData.get(name);
    if (!data) throw new RigBindError({ code: "rig-bone-missing", reasonKo: `스켈레톤에 없는 본을 참조합니다: ${name}`, at: deps.now ?? Date.now() });
    if (visiting.has(name)) throw new RigBindError({ code: "rig-bone-cycle", reasonKo: `본 부모 관계에 순환이 있습니다: ${name}`, at: deps.now ?? Date.now() });
    visiting.add(name);
    const parent = data.parent !== null && boneData.has(data.parent) ? build(data.parent) : null;
    const restLocal: Quat = qNormalize(data.restRotation);
    const restWorld: Quat = parent ? qNormalize(qMultiply(parent.rb.restWorld, restLocal)) : restLocal;
    const node = new TransformNode(`bone:${name}`, scene);
    node.parent = parent ? parent.rb.node : root;
    node.position = toVector3(data.restTranslation);
    node.rotationQuaternion = toQuaternion(restLocal);
    const local = Matrix.Compose(Vector3.One(), toQuaternion(restLocal), toVector3(data.restTranslation));
    const bone = new Bone(name, skeleton, parent ? parent.rb.bone : null, local);
    bone.linkTransformNode(node);
    const rb: RigBone = {
      name,
      humanoid: isHumanoidBoneName(name) ? name : null,
      bone,
      node,
      parentName: parent ? parent.rb.name : null,
      restLocal,
      restWorld,
      restTranslation: data.restTranslation,
      auxiliary: data.auxiliary === true,
    };
    const entry: BoneBuild = { rb };
    built.set(name, entry);
    if (rb.humanoid) humanoid.set(rb.humanoid, rb);
    visiting.delete(name);
    return entry;
  };
  for (const bone of model.skeleton.bones) build(bone.name);
  const bones = new Map<string, RigBone>();
  for (const [name, entry] of built) bones.set(name, entry.rb);

  // ---- 파츠
  const morphs = new Map<string, MorphTarget[]>();
  const parts: RigPart[] = [];
  for (const part of model.parts) {
    const mesh = new Mesh(part.id, scene);
    const vertexData = new VertexData();
    vertexData.positions = new Float32Array(part.positions);
    vertexData.normals = new Float32Array(part.normals);
    vertexData.uvs = new Float32Array(part.uvs);
    vertexData.indices = new Uint32Array(part.indices);
    if (part.jointIndices && part.jointWeights) {
      vertexData.matricesIndices = toFloat32(part.jointIndices);
      vertexData.matricesWeights = new Float32Array(part.jointWeights);
    }
    vertexData.applyToMesh(mesh, true);
    mesh.parent = root;
    if (part.jointIndices) mesh.skeleton = skeleton;
    mesh.metadata = rigMeshMetadata(part.partId, part.role, part.materialId, false);
    mesh.receiveShadows = true;
    if (part.morphs.length > 0) {
      const manager = new MorphTargetManager(scene);
      manager.useTextureToStoreTargets = true;
      for (const morph of part.morphs) {
        const target = new MorphTarget(morph.name, 0, scene);
        target.setPositions(addFloat32(part.positions, morph.deltaPositions));
        if (morph.deltaNormals) target.setNormals(addFloat32(part.normals, morph.deltaNormals));
        manager.addTarget(target);
        const list = morphs.get(morph.name) ?? [];
        list.push(target);
        morphs.set(morph.name, list);
      }
      mesh.morphTargetManager = manager;
      disposables.push(manager);
    }
    const colorHex = resolvePartColorHex(part, null);
    const pbr = deps.createMaterial(part, colorHex);
    mesh.material = pbr;
    disposables.push(pbr);
    parts.push({
      id: part.id,
      partId: part.partId,
      materialId: part.materialId,
      role: part.role,
      materialPreset: part.materialPreset as MaterialPresetId,
      ...(part.colorKey !== undefined ? { colorKey: part.colorKey } : {}),
      meshes: [mesh],
      outlineMeshes: [],
      pbr,
      hasAlbedoTexture: false,
      toon: null,
      colorHex,
      visible: true,
      forceHidden: false,
    });
  }

  const morphNames = [...model.morphNames];
  for (const name of morphs.keys()) if (!morphNames.includes(name)) morphNames.push(name);

  const rig: CharacterRig = {
    kind: "procedural",
    root,
    parts,
    partById: new Map(parts.map((part) => [part.partId, part])),
    skeleton,
    bones,
    humanoid,
    morphs,
    morphNames,
    chains: model.chains,
    colliders: model.colliders,
    partIdPalette: model.partIdPalette,
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    poseConvention: "bone-local",
    notes: [],
    materials: deps.materials,
    dispose() {
      for (const part of parts) {
        // 툰 재질이 참조하는 텍스처(white·clear·SDF·페인트)는 엔진이 소유하므로 함께 해제하지 않는다(forceDisposeTextures=false).
        part.toon?.dispose(true, false);
        for (const mesh of part.meshes) mesh.dispose(false, false);
      }
      for (const item of disposables) item.dispose();
      skeleton.dispose();
      root.dispose(false, false);
    },
  };
  return rig;
}
