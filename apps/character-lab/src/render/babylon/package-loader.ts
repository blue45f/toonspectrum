/**
 * 제작 패키지 GLB → Babylon 리그. glTF 2.0 로더(.glb 플러그인은 babylon-side-effects가 등록)로 AssetContainer를 만들고
 * AuthoredPackagePlan의 meshRoles/boneMap/shapeKeyMap으로 metadata·morph 이름을 재지정한다.
 * - 멀티 프리미티브 메시는 `<node>_primitive<i>`로 나뉘므로 접미를 떼고 같은 파츠로 묶는다(MorphTargetManager는 각각).
 * - 헤어 LOD는 `hairLodPolicy.preferredLod`만 보이고 나머지는 forceHidden. `_Outline` 셸은 toon·hull에서만 가시.
 * - 규약 밖 메시는 숨기고 notes에 한글 사유를 남긴다(무음 대체 금지).
 * - 좌표계: 장면이 우수(useRightHandedSystem)이므로 AUTO 모드에서 변환 노드 없이 +Z 정면이 유지된다.
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { GLTFLoaderAnimationStartMode, GLTFLoaderCoordinateSystemMode } from "@babylonjs/loaders/glTF/glTFFileLoader.js";

import { OUTLINE_MESH_SUFFIX, allocatePartIds, failVisible, parseAuthoredHairMeshName } from "../../contracts";
import { qMultiply, qNormalize } from "../../shared/math";
import { ROLE_COLOR_KEY, ROLE_DEFAULT_PRESET, resolvePartColorHex } from "../material-presets";

import { fromQuaternion, fromVector3 } from "./convert";
import { RigBindError, rigMeshMetadata } from "./mesh-binding";

import type { CharacterRig, RigBone, RigMaterialHooks, RigPart } from "./character-rig";
import type { AuthoredPackagePlan, HumanoidBoneName, PartRole, Quat } from "../../contracts";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { MorphTarget } from "@babylonjs/core/Morph/morphTarget.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface PackageLoadDeps {
  readonly scene: Scene;
  /** 로더 재질을 역할에 맞게 보강(또는 교체) */
  readonly adaptMaterial: (role: PartRole, mesh: Mesh) => PBRMaterial;
  readonly materials: RigMaterialHooks;
  readonly now?: number;
}

const PRIMITIVE_SUFFIX = /_primitive\d+$/u;

/** 분할 접미·outline 접미를 떼어 파츠 기준 이름과 플래그를 돌려준다. */
export function splitPackageMeshName(name: string): { readonly baseName: string; readonly outline: boolean } {
  let baseName = name.replace(PRIMITIVE_SUFFIX, "");
  const outline = baseName.endsWith(OUTLINE_MESH_SUFFIX);
  if (outline) baseName = baseName.slice(0, -OUTLINE_MESH_SUFFIX.length);
  return { baseName, outline };
}

/** 헤어 LOD 선택: preferred 이하 중 가장 상세, 없으면 가장 상세한 것. */
export function chooseHairLod(lods: readonly number[], preferred: number): number | null {
  if (lods.length === 0) return null;
  const sorted = [...new Set(lods)].sort((a, b) => a - b);
  const atOrBelow = sorted.filter((lod) => lod <= preferred);
  return atOrBelow.length > 0 ? (atOrBelow[atOrBelow.length - 1] ?? null) : (sorted[0] ?? null);
}

interface PartGroup {
  readonly baseName: string;
  readonly role: PartRole;
  readonly meshes: Mesh[];
  readonly outlines: Mesh[];
  readonly hairLod: number | null;
}

export async function loadPackageRig(plan: AuthoredPackagePlan, bytes: Uint8Array, deps: PackageLoadDeps): Promise<CharacterRig> {
  const { scene } = deps;
  const now = deps.now ?? Date.now();
  let container: Awaited<ReturnType<typeof LoadAssetContainerAsync>>;
  try {
    container = await LoadAssetContainerAsync(bytes, scene, {
      pluginExtension: ".glb",
      pluginOptions: {
        gltf: {
          coordinateSystemMode: GLTFLoaderCoordinateSystemMode.AUTO,
          animationStartMode: GLTFLoaderAnimationStartMode.NONE,
          loadNodeAnimations: false,
          compileMaterials: false,
          createInstances: false,
          alwaysComputeBoundingBox: true,
          useSRGBBuffers: true,
        },
      },
    });
  } catch (error) {
    throw new RigBindError(failVisible("package-glb-load-failed", `제작 패키지 GLB를 Babylon 로더로 열지 못했습니다: ${plan.glbUrl}`, error, now));
  }
  container.addAllToScene();
  const root = new TransformNode("character-root", scene);
  for (const node of container.rootNodes) if (node instanceof TransformNode) node.parent = root;

  const notes: string[] = [];
  const groups = new Map<string, PartGroup>();
  const hairLods: number[] = [];
  for (const abstract of container.meshes) {
    if (!(abstract instanceof Mesh) || abstract.getTotalVertices() === 0) continue;
    const { baseName, outline } = splitPackageMeshName(abstract.name);
    const role = plan.meshRoles[baseName] ?? plan.meshRoles[abstract.name] ?? null;
    if (!role) {
      abstract.isVisible = false;
      notes.push(`메시 '${abstract.name}'은(는) 플랜 meshRoles에 없어 숨깁니다(규약 밖 이름).`);
      continue;
    }
    const hair = parseAuthoredHairMeshName(baseName);
    const group = groups.get(baseName) ?? { baseName, role, meshes: [], outlines: [], hairLod: hair?.lod ?? null };
    if (!groups.has(baseName)) groups.set(baseName, group);
    (outline ? group.outlines : group.meshes).push(abstract);
    if (hair && !outline) hairLods.push(hair.lod);
  }
  const chosenLod = chooseHairLod(hairLods, plan.hairLodPolicy.preferredLod);
  const ordered = [...groups.values()].filter((group) => group.meshes.length > 0).sort((a, b) => a.baseName.localeCompare(b.baseName));
  const partIdPalette = allocatePartIds(ordered.map((group) => ({ role: group.role })));
  const materialIndex = new Map(container.materials.map((material, index) => [material, index]));

  const parts: RigPart[] = [];
  const morphs = new Map<string, MorphTarget[]>();
  const morphNames: string[] = [];
  const registerMorph = (rawName: string, target: MorphTarget): void => {
    const mapped = plan.shapeKeyMap[rawName] ?? rawName;
    const list = morphs.get(mapped) ?? [];
    list.push(target);
    morphs.set(mapped, list);
    if (!morphNames.includes(mapped)) morphNames.push(mapped);
  };
  ordered.forEach((group, index) => {
    const partId = index + 1;
    const firstMesh = group.meshes[0];
    if (!firstMesh) return;
    const materialId = firstMesh.material ? Math.min(255, materialIndex.get(firstMesh.material) ?? 0) : 0;
    const pbr = deps.adaptMaterial(group.role, firstMesh);
    for (const mesh of group.meshes) {
      mesh.material = pbr;
      mesh.metadata = rigMeshMetadata(partId, group.role, materialId, false);
      mesh.receiveShadows = true;
      const manager = mesh.morphTargetManager;
      if (manager) {
        manager.useTextureToStoreTargets = true;
        for (let i = 0; i < manager.numTargets; i += 1) registerMorph(manager.getTarget(i).name, manager.getTarget(i));
      }
    }
    for (const mesh of group.outlines) {
      mesh.metadata = rigMeshMetadata(partId, group.role, materialId, true);
      mesh.isVisible = false;
    }
    const forceHidden = group.hairLod !== null && group.hairLod !== chosenLod;
    const colorKey = ROLE_COLOR_KEY[group.role];
    const materialPreset = ROLE_DEFAULT_PRESET[group.role];
    const hasAlbedoTexture = pbr.albedoTexture !== null;
    const part: RigPart = {
      id: group.baseName,
      partId,
      materialId,
      role: group.role,
      materialPreset,
      ...(colorKey !== undefined ? { colorKey } : {}),
      meshes: group.meshes,
      outlineMeshes: group.outlines,
      pbr,
      hasAlbedoTexture,
      toon: null,
      colorHex: resolvePartColorHex({ materialPreset, ...(colorKey !== undefined ? { colorKey } : {}) }, null),
      visible: !forceHidden,
      forceHidden,
      ...(forceHidden ? { forceHiddenReasonKo: `헤어 LOD${group.hairLod}은(는) 선택 LOD${chosenLod ?? 0}가 아니라 숨깁니다.` } : {}),
    };
    if (forceHidden) for (const mesh of group.meshes) mesh.isVisible = false;
    parts.push(part);
  });

  // ---- 본(글TF 로더가 TransformNode를 링크해 둔다)
  const skeleton = container.skeletons[0] ?? null;
  const bones = new Map<string, RigBone>();
  const humanoid = new Map<HumanoidBoneName, RigBone>();
  if (skeleton) {
    const restWorldCache = new Map<Bone, Quat>();
    const restWorldOf = (bone: Bone): Quat => {
      const cached = restWorldCache.get(bone);
      if (cached) return cached;
      const node = bone.getTransformNode();
      const local = fromQuaternion(node?.rotationQuaternion);
      const parent = bone.getParent();
      const world: Quat = parent ? qNormalize(qMultiply(restWorldOf(parent), local)) : local;
      restWorldCache.set(bone, world);
      return world;
    };
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (!node) {
        notes.push(`본 '${bone.name}'에 링크된 TransformNode가 없어 포즈를 적용할 수 없습니다.`);
        continue;
      }
      if (!node.rotationQuaternion) node.rotationQuaternion = node.rotation.toQuaternion();
      const parent = bone.getParent();
      const humanoidName = plan.boneMap[bone.name] ?? null;
      const rb: RigBone = {
        name: bone.name,
        humanoid: humanoidName,
        bone,
        node,
        parentName: parent ? parent.name : null,
        restLocal: fromQuaternion(node.rotationQuaternion),
        restWorld: restWorldOf(bone),
        restTranslation: fromVector3(node.position),
        auxiliary: humanoidName === null,
      };
      bones.set(bone.name, rb);
      if (humanoidName && !humanoid.has(humanoidName)) humanoid.set(humanoidName, rb);
    }
    skeleton.useTextureToStoreBoneMatrices = true;
  } else {
    notes.push("패키지에 스켈레톤이 없어 포즈·손 포즈 슬롯이 적용되지 않습니다.");
  }

  return {
    kind: "package",
    root,
    parts,
    partById: new Map(parts.map((part) => [part.partId, part])),
    skeleton,
    bones,
    humanoid,
    morphs,
    morphNames,
    chains: [],
    colliders: [],
    partIdPalette,
    capabilities: plan.capabilities,
    poseConvention: "model-space",
    notes,
    materials: deps.materials,
    dispose() {
      // 툰 재질의 공유 텍스처는 엔진 소유 — 재질만 해제한다. 알베도 텍스처는 container.dispose()가 정리한다.
      for (const part of parts) part.toon?.dispose(true, false);
      container.dispose();
      root.dispose(false, false);
    },
  };
}
