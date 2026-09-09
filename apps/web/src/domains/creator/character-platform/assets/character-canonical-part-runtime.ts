import * as THREE from "three";

import { classifyMeshName } from "../../vrm/studio-vrm-costume";
import {
  createCharacterCanonicalPartPlan,
  type CharacterCanonicalPartPlan,
} from "./character-canonical-part-plan";

import type {
  CharacterCanonicalManifestV2,
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartSelector,
  CharacterCanonicalPartSlot,
} from "./character-canonical-manifest";
import type { VRM } from "@pixiv/three-vrm";

const HUMAN_BONES = Object.freeze([
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const);

type HumanBoneName = (typeof HUMAN_BONES)[number];

type HumanoidLike = {
  getRawBoneNode(name: HumanBoneName): THREE.Object3D | null;
};

type SourceLease = {
  readonly scene: THREE.Object3D;
  readonly vrm: VRM | null;
  readonly release: () => void;
};

type DonorEntry = {
  readonly vrm: VRM;
  refs: number;
};

const donorPromises = new Map<string, Promise<DonorEntry>>();

function normalizeSha256(value: string): string {
  return value.toLowerCase().replace(/^sha256:/u, "");
}

async function verifySourceSha256(file: string, expected: string): Promise<void> {
  if (
    typeof fetch !== "function"
    || typeof crypto === "undefined"
    || !crypto.subtle
  ) {
    return;
  }
  const response = await fetch(file, { cache: "force-cache" });
  if (!response.ok) throw new Error(`파츠 원본을 읽지 못했습니다. (${response.status})`);
  const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== normalizeSha256(expected)) {
    throw new Error("파츠 원본 SHA-256이 매니페스트와 다릅니다. 적용을 중단했습니다.");
  }
}

async function acquireDonorVrm(file: string, expectedSha256: string): Promise<SourceLease> {
  let promise = donorPromises.get(file);
  if (!promise) {
    promise = (async () => {
      await verifySourceSha256(file, expectedSha256);
      const { loadStudioVrmAsset } = await import("../../vrm/studio-vrm-asset-runtime");
      return { vrm: await loadStudioVrmAsset(file), refs: 0 };
    })();
    donorPromises.set(file, promise);
    void promise.catch(() => donorPromises.delete(file));
  }
  const entry = await promise;
  entry.refs += 1;
  let released = false;
  return {
    scene: entry.vrm.scene,
    vrm: entry.vrm,
    release: () => {
      if (released) return;
      released = true;
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs !== 0) return;
      if (donorPromises.get(file) !== promise) return;
      donorPromises.delete(file);
      void import("../../vrm/studio-vrm-asset-runtime").then(({ disposeStudioVrmAsset }) => {
        disposeStudioVrmAsset(entry.vrm);
      });
    },
  };
}

function disposeScene(scene: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      material.dispose();
    }
  });
  textures.forEach((texture) => texture.dispose());
}

async function acquireGlbPart(file: string, expectedSha256: string): Promise<SourceLease> {
  await verifySourceSha256(file, expectedSha256);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(file);
  let released = false;
  return {
    scene: gltf.scene,
    vrm: null,
    release: () => {
      if (released) return;
      released = true;
      gltf.scene.parent?.remove(gltf.scene);
      disposeScene(gltf.scene);
    },
  };
}

function materialNames(object: THREE.Object3D): string[] {
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh !== true || !mesh.material) return [];
  const values = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return values.map((material) => material?.name ?? "");
}

function semanticMatches(object: THREE.Object3D, semantic: string): boolean {
  const classification = classifyMeshName(object.name, ...materialNames(object));
  if (semantic === "hair") return classification.protected === "hair";
  if (semantic === "eyes") {
    if (classification.protected !== "eye") return false;
    return !/iris|hitomi|pupil/iu.test([object.name, ...materialNames(object)].join(" "));
  }
  if (semantic === "irises") return /iris|hitomi|pupil/iu.test([object.name, ...materialNames(object)].join(" "));
  return classification.slot === semantic;
}

function selectorMatches(object: THREE.Object3D, selector: CharacterCanonicalPartSelector): boolean {
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh !== true) return false;
  if (selector.kind === "nodes") return selector.names.includes(object.name);
  return semanticMatches(object, selector.semantic);
}

function collectSourceMeshes(scene: THREE.Object3D, selector: CharacterCanonicalPartSelector): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (selectorMatches(object, selector)) meshes.push(object as THREE.Mesh);
  });
  return meshes;
}

function targetSlotMatches(object: THREE.Object3D, slot: CharacterCanonicalPartSlot): boolean {
  const classification = classifyMeshName(object.name, ...materialNames(object));
  if (slot === "hair") return classification.protected === "hair";
  if (slot === "eyes") return classification.protected === "eye" && !/iris|hitomi|pupil/iu.test(object.name);
  if (slot === "irises") return /iris|hitomi|pupil/iu.test([object.name, ...materialNames(object)].join(" "));
  if (slot === "top") return classification.slot === "tops" || classification.slot === "outer" || classification.slot === "onepiece";
  if (slot === "bottom") return classification.slot === "bottoms" || classification.slot === "onepiece";
  if (slot === "shoes") return classification.slot === "shoes";
  if (slot === "accessory") return classification.slot === "accessory";
  const text = [object.name, ...materialNames(object)].join(" ").toLowerCase();
  if (slot === "nose") return /nose|hana/iu.test(text);
  if (slot === "mouth") return /mouth|lip|kuchi/iu.test(text);
  if (slot === "ears") return /ear|mimi/iu.test(text);
  return false;
}

function cloneMaterial(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  cloned.name = material.name;
  cloned.userData = { ...material.userData };
  return cloned;
}

function cloneMaterials(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  return Array.isArray(material) ? material.map(cloneMaterial) : cloneMaterial(material);
}

function humanoidBoneMap(vrm: VRM): Map<THREE.Object3D, HumanBoneName> {
  const result = new Map<THREE.Object3D, HumanBoneName>();
  const humanoid = vrm.humanoid as unknown as HumanoidLike;
  for (const name of HUMAN_BONES) {
    const node = humanoid.getRawBoneNode(name);
    if (node) result.set(node, name);
  }
  return result;
}

function targetHumanBone(vrm: VRM, name: HumanBoneName): THREE.Bone | null {
  const node = (vrm.humanoid as unknown as HumanoidLike).getRawBoneNode(name);
  return node instanceof THREE.Bone ? node : null;
}

function targetNodeByName(vrm: VRM, name: string): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  vrm.scene.traverse((node) => {
    if (!result && node.name === name) result = node;
  });
  return result;
}

function mappedTargetBones(source: THREE.SkinnedMesh, sourceVrm: VRM | null, targetVrm: VRM): THREE.Bone[] {
  const sourceHumanoid = sourceVrm ? humanoidBoneMap(sourceVrm) : null;
  const targetByName = new Map<string, THREE.Bone>();
  targetVrm.scene.traverse((node) => {
    if (node instanceof THREE.Bone && node.name) targetByName.set(node.name, node);
  });
  return source.skeleton.bones.map((sourceBone) => {
    const normalized = sourceHumanoid?.get(sourceBone);
    const target = normalized ? targetHumanBone(targetVrm, normalized) : targetByName.get(sourceBone.name) ?? null;
    if (!target) throw new Error(`파츠 스킨 본 ${sourceBone.name || "(unnamed)"}을 현재 VRM 리그에 매핑할 수 없습니다.`);
    return target;
  });
}

function bakeRestGeometryToTarget(
  source: THREE.SkinnedMesh,
  targetVrm: VRM,
  targetBones: readonly THREE.Bone[],
  scale: Readonly<{ x: number; y: number; z: number }>,
): THREE.BufferGeometry {
  source.updateWorldMatrix(true, false);
  targetVrm.scene.updateWorldMatrix(true, true);
  const geometry = source.geometry.clone();
  const position = geometry.getAttribute("position");
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  if (!position || !skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) {
    throw new Error(`스킨 파츠 ${source.name || "(unnamed)"}에 position/skinIndex/skinWeight가 없습니다.`);
  }
  const sourceBoneInverseWorld = source.skeleton.bones.map((bone) => bone.matrixWorld.clone().invert());
  const targetRootInverse = targetVrm.scene.matrixWorld.clone().invert();
  const sourcePoint = new THREE.Vector3();
  const bonePoint = new THREE.Vector3();
  const targetPoint = new THREE.Vector3();
  const output = new THREE.Vector3();
  const indices = new THREE.Vector4();
  const weights = new THREE.Vector4();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    sourcePoint.set(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(source.matrixWorld);
    indices.set(
      skinIndex.getX(vertex),
      skinIndex.getY(vertex),
      skinIndex.getZ(vertex),
      skinIndex.getW(vertex),
    );
    weights.set(
      skinWeight.getX(vertex),
      skinWeight.getY(vertex),
      skinWeight.getZ(vertex),
      skinWeight.getW(vertex),
    );
    output.set(0, 0, 0);
    let totalWeight = 0;
    for (let component = 0; component < 4; component += 1) {
      const weight = weights.getComponent(component);
      const boneIndex = Math.round(indices.getComponent(component));
      if (weight <= 0 || !sourceBoneInverseWorld[boneIndex] || !targetBones[boneIndex]) continue;
      bonePoint.copy(sourcePoint).applyMatrix4(sourceBoneInverseWorld[boneIndex]!);
      targetPoint.copy(bonePoint).applyMatrix4(targetBones[boneIndex]!.matrixWorld);
      output.addScaledVector(targetPoint, weight);
      totalWeight += weight;
    }
    if (totalWeight <= 1e-6) output.copy(sourcePoint);
    else if (Math.abs(totalWeight - 1) > 1e-6) output.multiplyScalar(1 / totalWeight);
    output.applyMatrix4(targetRootInverse);
    output.set(output.x * scale.x, output.y * scale.y, output.z * scale.z);
    position.setXYZ(vertex, output.x, output.y, output.z);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSkinnedTransplant(
  source: THREE.SkinnedMesh,
  sourceVrm: VRM | null,
  targetVrm: VRM,
  plan: CharacterCanonicalPartPlan,
): THREE.SkinnedMesh {
  const targetBones = mappedTargetBones(source, sourceVrm, targetVrm);
  const geometry = bakeRestGeometryToTarget(source, targetVrm, targetBones, plan.scale);
  const mesh = new THREE.SkinnedMesh(geometry, cloneMaterials(source.material));
  mesh.name = `CanonicalPart:${source.name || "SkinnedMesh"}`;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.renderOrder = source.renderOrder;
  mesh.frustumCulled = false;
  mesh.userData = { ...source.userData };
  const skeleton = new THREE.Skeleton([...targetBones]);
  skeleton.calculateInverses();
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

function relativeTransform(source: THREE.Object3D, anchor: THREE.Object3D): THREE.Matrix4 {
  source.updateWorldMatrix(true, false);
  anchor.updateWorldMatrix(true, false);
  return anchor.matrixWorld.clone().invert().multiply(source.matrixWorld);
}

function sceneLocalTransform(source: THREE.Object3D, sourceRoot: THREE.Object3D): THREE.Matrix4 {
  sourceRoot.updateWorldMatrix(true, true);
  source.updateWorldMatrix(true, false);
  return sourceRoot.matrixWorld.clone().invert().multiply(source.matrixWorld);
}

function sourceAnchorForRigid(sourceVrm: VRM | null, part: CharacterCanonicalPartDescriptor): THREE.Object3D | null {
  if (!sourceVrm) return null;
  const boneName = part.binding.targetBone as HumanBoneName | undefined;
  if (boneName && HUMAN_BONES.includes(boneName)) {
    return (sourceVrm.humanoid as unknown as HumanoidLike).getRawBoneNode(boneName);
  }
  if (part.slot === "hair" || part.slot === "eyes" || part.slot === "irises" || part.slot === "ears") {
    return (sourceVrm.humanoid as unknown as HumanoidLike).getRawBoneNode("head");
  }
  return (sourceVrm.humanoid as unknown as HumanoidLike).getRawBoneNode("hips");
}

function targetAnchor(
  targetVrm: VRM,
  manifest: CharacterCanonicalManifestV2,
  part: CharacterCanonicalPartDescriptor,
): THREE.Object3D {
  if (part.binding.targetSocket) {
    const socket = manifest.fitting.sockets.find((entry) => entry.id === part.binding.targetSocket);
    if (!socket) throw new Error(`부착 소켓 ${part.binding.targetSocket}이 없습니다.`);
    const node = targetNodeByName(targetVrm, socket.node);
    if (!node) throw new Error(`부착 소켓 노드 ${socket.node}을 찾지 못했습니다.`);
    return node;
  }
  const boneName = (part.binding.targetBone
    ?? ((part.slot === "hair" || part.slot === "eyes" || part.slot === "irises" || part.slot === "ears") ? "head" : "hips")) as HumanBoneName;
  if (!HUMAN_BONES.includes(boneName)) throw new Error(`지원하지 않는 humanoid bone ${boneName}입니다.`);
  const node = (targetVrm.humanoid as unknown as HumanoidLike).getRawBoneNode(boneName);
  if (!node) throw new Error(`현재 VRM에 ${boneName} 본이 없습니다.`);
  return node;
}

function cloneRigidToAnchor(
  source: THREE.Mesh,
  sourceAnchor: THREE.Object3D | null,
  sourceRoot: THREE.Object3D,
  targetAnchorNode: THREE.Object3D,
  plan: CharacterCanonicalPartPlan,
): THREE.Mesh {
  const mesh = new THREE.Mesh(source.geometry.clone(), cloneMaterials(source.material));
  mesh.name = `CanonicalPart:${source.name || "Mesh"}`;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.renderOrder = source.renderOrder;
  mesh.frustumCulled = false;
  mesh.userData = { ...source.userData };
  const relative = sourceAnchor
    ? relativeTransform(source, sourceAnchor)
    : sceneLocalTransform(source, sourceRoot);
  relative.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.scale.multiply(new THREE.Vector3(plan.scale.x, plan.scale.y, plan.scale.z));
  if (plan.clearanceMeters > 0) {
    const factor = 1 + plan.clearanceMeters;
    mesh.scale.multiplyScalar(factor);
  }
  targetAnchorNode.add(mesh);
  return mesh;
}

function disposeInstalledRoot(root: THREE.Object3D): void {
  root.parent?.remove(root);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
}

function semanticLayerForSlot(slot: CharacterCanonicalPartSlot): string {
  if (slot === "hair") return "hair-front";
  if (slot === "top") return "top";
  if (slot === "bottom") return "bottom";
  if (slot === "shoes") return "shoes";
  if (slot === "accessory") return "accessory";
  if (slot === "eyes" || slot === "irises") return slot;
  return "face";
}

function hideTargetObjects(targetVrm: VRM, slot: CharacterCanonicalPartSlot): Map<THREE.Object3D, boolean> {
  const ledger = new Map<THREE.Object3D, boolean>();
  targetVrm.scene.traverse((object) => {
    if (!targetSlotMatches(object, slot)) return;
    if (object.userData.characterCanonicalPart === true) return;
    ledger.set(object, object.visible);
    object.visible = false;
  });
  return ledger;
}

function restoreVisibility(ledger: ReadonlyMap<THREE.Object3D, boolean>): void {
  for (const [object, visible] of ledger) object.visible = visible;
}

async function acquireSource(
  part: CharacterCanonicalPartDescriptor,
  plan: CharacterCanonicalPartPlan,
): Promise<SourceLease> {
  if (plan.lod) return acquireGlbPart(plan.lod.sourceFile, plan.lod.sourceSha256);
  if (part.source.format === "vrm-donor") return acquireDonorVrm(part.source.file, part.source.sha256);
  return acquireGlbPart(part.source.file, part.source.sha256);
}

export interface CharacterCanonicalInstalledPart {
  readonly partId: string;
  readonly slot: CharacterCanonicalPartSlot;
  readonly meshCount: number;
  readonly plan: CharacterCanonicalPartPlan;
}

type InstalledInternal = CharacterCanonicalInstalledPart & {
  readonly roots: readonly THREE.Object3D[];
  readonly visibilityLedger: ReadonlyMap<THREE.Object3D, boolean>;
  readonly releaseSource: () => void;
};

export class CharacterCanonicalPartSession {
  readonly #targetVrm: VRM;
  readonly #manifest: CharacterCanonicalManifestV2;
  readonly #installed = new Map<CharacterCanonicalPartSlot, InstalledInternal>();
  #generation = 0;
  #disposed = false;

  constructor(input: { readonly targetVrm: VRM; readonly manifest: CharacterCanonicalManifestV2 }) {
    this.#targetVrm = input.targetVrm;
    this.#manifest = input.manifest;
  }

  get selections(): Readonly<Partial<Record<CharacterCanonicalPartSlot, string>>> {
    return Object.freeze(Object.fromEntries(
      [...this.#installed.entries()].map(([slot, installed]) => [slot, installed.partId]),
    ));
  }

  async apply(part: CharacterCanonicalPartDescriptor, projectedHeightPx = 2048): Promise<CharacterCanonicalInstalledPart> {
    if (this.#disposed) throw new Error("캐릭터 파츠 세션이 종료되었습니다.");
    const generation = ++this.#generation;
    const plan = createCharacterCanonicalPartPlan({ manifest: this.#manifest, part, projectedHeightPx });
    if (plan.availability.status !== "supported") throw new Error(plan.availability.reason);
    const sourceLease = await acquireSource(part, plan);
    if (this.#disposed || generation !== this.#generation) {
      sourceLease.release();
      throw new Error("다른 파츠 작업이 시작되어 이전 로드를 취소했습니다.");
    }
    sourceLease.scene.updateMatrixWorld(true);
    this.#targetVrm.scene.updateMatrixWorld(true);
    const sourceMeshes = collectSourceMeshes(sourceLease.scene, part.source.selector);
    if (sourceMeshes.length === 0) {
      sourceLease.release();
      throw new Error(`${part.label} 원본에서 지정한 메시를 찾지 못했습니다.`);
    }

    const roots: THREE.Object3D[] = [];
    try {
      if (part.binding.kind === "skinned-transplant") {
        for (const sourceMesh of sourceMeshes) {
          if (!(sourceMesh instanceof THREE.SkinnedMesh)) continue;
          const transplanted = createSkinnedTransplant(sourceMesh, sourceLease.vrm, this.#targetVrm, plan);
          transplanted.userData.characterCanonicalPart = true;
          transplanted.userData.characterCanonicalPartId = part.id;
          transplanted.userData.characterSemanticLayer = semanticLayerForSlot(part.slot);
          this.#targetVrm.scene.add(transplanted);
          roots.push(transplanted);
        }
        if (roots.length === 0) throw new Error(`${part.label}은 스킨 메시를 포함하지 않아 재바인딩할 수 없습니다.`);
      } else {
        const target = targetAnchor(this.#targetVrm, this.#manifest, part);
        const sourceAnchor = sourceAnchorForRigid(sourceLease.vrm, part);
        for (const sourceMesh of sourceMeshes) {
          if (sourceMesh instanceof THREE.SkinnedMesh) continue;
          const cloned = cloneRigidToAnchor(sourceMesh, sourceAnchor, sourceLease.scene, target, plan);
          cloned.userData.characterCanonicalPart = true;
          cloned.userData.characterCanonicalPartId = part.id;
          cloned.userData.characterSemanticLayer = semanticLayerForSlot(part.slot);
          roots.push(cloned);
        }
        if (roots.length === 0) throw new Error(`${part.label}은 rigid 파츠 메시를 포함하지 않습니다.`);
      }
    } catch (error) {
      roots.forEach(disposeInstalledRoot);
      sourceLease.release();
      throw error;
    }

    const previous = this.#installed.get(part.slot);
    if (previous) this.#removeInstalled(previous);
    const visibilityLedger = plan.hideTargetPart ? hideTargetObjects(this.#targetVrm, part.slot) : new Map();
    const installed: InstalledInternal = Object.freeze({
      partId: part.id,
      slot: part.slot,
      meshCount: roots.length,
      plan,
      roots: Object.freeze([...roots]),
      visibilityLedger,
      releaseSource: sourceLease.release,
    });
    this.#installed.set(part.slot, installed);
    return installed;
  }

  remove(slot: CharacterCanonicalPartSlot): boolean {
    const installed = this.#installed.get(slot);
    if (!installed) return false;
    this.#generation += 1;
    this.#removeInstalled(installed);
    return true;
  }

  #removeInstalled(installed: InstalledInternal): void {
    if (this.#installed.get(installed.slot) === installed) this.#installed.delete(installed.slot);
    restoreVisibility(installed.visibilityLedger);
    installed.roots.forEach(disposeInstalledRoot);
    installed.releaseSource();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    for (const installed of [...this.#installed.values()]) this.#removeInstalled(installed);
    this.#installed.clear();
  }
}
