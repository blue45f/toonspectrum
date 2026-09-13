import * as THREE from "three";

import { isStudioAuthoredAttachment } from "./studio-vrm-authored-attachment";
import { percentileOfSorted } from "./studio-vrm-body-silhouette";
import { createStudioVrmSurfaceVertexSampler } from "./studio-vrm-surface-vertex-sampler";

export interface StudioVrmBodyCapsuleMeasurementInput {
  readonly id: string;
  readonly bone: THREE.Object3D;
  readonly head: readonly [number, number, number];
  readonly tail: readonly [number, number, number];
  readonly fallbackRadius: number;
}

export interface StudioVrmBodyCapsuleMeasurement {
  readonly radius: number;
  readonly source: "skinned-surface-envelope" | "skeleton-fallback";
  readonly sampleCount: number;
}

export interface StudioVrmSkirtBodyProfile {
  readonly capsules: Readonly<Record<string, StudioVrmBodyCapsuleMeasurement>>;
  readonly inspectedVertices: number;
}

const SCENE_VERTEX_BUDGET = 48_000;
const MESH_VERTEX_BUDGET = 12_000;
const MIN_SAMPLES = 12;

type SurfaceAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
interface ShapeDependencyCache {
  readonly stamp: readonly unknown[];
  readonly revision: number;
  readonly eligibleCount: number;
  readonly morphIndices: readonly number[];
}

// One geometry can be shared by meshes with different skeleton bone ordering. Keep a small
// bounded set of eligibility maps instead of treating geometry identity as skeleton identity.
const dependencyCache = new WeakMap<THREE.BufferGeometry, Map<string, ShapeDependencyCache>>();
const MAX_SKELETON_MAPS_PER_GEOMETRY = 8;
const MAX_MORPH_COMPONENT_READS = 1_440_000;
let nextDependencyRevision = 1;

function attributeStamp(attribute: SurfaceAttribute | undefined): readonly unknown[] {
  if (!attribute) return [null];
  const storage = "data" in attribute ? attribute.data : attribute;
  return [attribute, storage.array, storage.version, attribute.count, attribute.itemSize,
    attribute.normalized, "offset" in attribute ? attribute.offset : 0,
    "stride" in storage ? storage.stride : attribute.itemSize];
}

function shapeDependencies(mesh: THREE.SkinnedMesh, bones: readonly THREE.Object3D[]): ShapeDependencyCache | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const indices = geometry.getAttribute("skinIndex");
  const weights = geometry.getAttribute("skinWeight");
  if (!position || position.itemSize < 3 || !indices || !weights
    || indices.itemSize < 4 || weights.itemSize < 4
    || indices.count < position.count || weights.count < position.count) return null;
  const boneIndices = bones.map((bone) => mesh.skeleton.bones.indexOf(bone as THREE.Bone)).filter((index) => index >= 0);
  if (boneIndices.length === 0) return null;
  const key = [...new Set(boneIndices)].sort((a, b) => a - b).join(",");
  const morphs = geometry.morphAttributes.position ?? [];
  const stamp = [geometry.morphTargetsRelative, ...attributeStamp(position), ...attributeStamp(indices),
    ...attributeStamp(weights), ...morphs.flatMap(attributeStamp)];
  let entries = dependencyCache.get(geometry);
  const cached = entries?.get(key);
  if (cached && cached.stamp.length === stamp.length && cached.stamp.every((value, index) => Object.is(value, stamp[index]))) return cached;

  const wanted = new Set(boneIndices);
  const eligible: number[] = [];
  // Match measurement's deterministic mesh sampling budget. Inspecting morphology is a
  // dependency check only; it never samples a different mesh deformation into the profile.
  const stride = Math.max(1, Math.ceil(position.count / MESH_VERTEX_BUDGET));
  for (let vertex = 0; vertex < position.count; vertex += stride) {
    let dominant = -1;
    let maximumWeight = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = weights.getComponent(vertex, slot);
      if (weight > maximumWeight) { maximumWeight = weight; dominant = indices.getComponent(vertex, slot); }
    }
    if (maximumWeight >= 0.5 && wanted.has(dominant)) eligible.push(vertex);
  }
  const morphIndices: number[] = [];
  let componentReads = 0;
  if (eligible.length > 0) for (let index = 0; index < morphs.length; index += 1) {
    const morph = morphs[index];
    let relevant = morph.itemSize < 3 || morph.count < position.count;
    for (const vertex of eligible) {
      if (relevant) break;
      if (componentReads + 3 > MAX_MORPH_COMPONENT_READS) { relevant = true; break; }
      componentReads += 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = morph.getComponent(vertex, axis);
        const delta = geometry.morphTargetsRelative ? value : value - position.getComponent(vertex, axis);
        if (!Number.isFinite(delta) || delta !== 0) { relevant = true; break; }
      }
    }
    // Budget exhaustion includes the remaining influences conservatively; it never silently
    // treats an unexamined body morph as irrelevant. Cache hits do not rescan vertex arrays.
    if (relevant) morphIndices.push(index);
  }
  const result: ShapeDependencyCache = { stamp, revision: nextDependencyRevision++, eligibleCount: eligible.length, morphIndices };
  if (!entries) { entries = new Map(); dependencyCache.set(geometry, entries); }
  if (!entries.has(key) && entries.size >= MAX_SKELETON_MAPS_PER_GEOMETRY) entries.delete(entries.keys().next().value!);
  entries.set(key, result);
  return result;
}

/**
 * Radii depend on the measured lower-body surface, not blink/face/hair animation. Bone identity
 * is resolved per mesh skeleton; shared position buffers alone cannot establish eligibility.
 * Visibility and versioned geometry edits remain dependencies. Pose changes are owned by the
 * rig signature and do not force the bounded surface measurement to run again.
 */
export function readStudioVrmSkirtBodyProfileSignature(
  scene: THREE.Object3D,
  measurementBones: readonly THREE.Object3D[],
): string {
  const signature: unknown[] = [];
  scene.traverseVisible((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton || isStudioAuthoredAttachment(mesh)) return;
    const dependencies = shapeDependencies(mesh, measurementBones);
    if (!dependencies || dependencies.eligibleCount === 0) return;
    signature.push([
      mesh.uuid, mesh.geometry.uuid, dependencies.revision,
      measurementBones.map((bone) => [bone.uuid, mesh.skeleton.bones.indexOf(bone as THREE.Bone)]),
      dependencies.morphIndices.map((index) => [index, mesh.morphTargetInfluences?.[index] ?? 0]),
      // Even a zero delta multiplied by NaN/Infinity invalidates the rendered mixed mesh.
      (mesh.geometry.morphAttributes.position ?? []).flatMap((_, index) => {
        const influence = mesh.morphTargetInfluences?.[index] ?? 0;
        return Number.isFinite(influence) ? [] : [[index, String(influence)]];
      }),
    ]);
  });
  return JSON.stringify(signature);
}

/**
 * Bounded model-local envelope, sampled when the imported visible shape changes. Clothing can
 * share skin weights with the body, so this is a visible surface envelope, not anatomical truth.
 * The capsule remains a conservative proxy; its radius must never depend on the garment's fit.
 */
export function measureStudioVrmSkirtBodyProfile(
  scene: THREE.Object3D,
  inputs: readonly StudioVrmBodyCapsuleMeasurementInput[],
): StudioVrmSkirtBodyProfile {
  scene.updateMatrixWorld(true);
  const usableFrame = scene.matrixWorld.elements.every(Number.isFinite)
    && Math.abs(scene.matrixWorld.determinant()) > 1e-12;
  const toModel = usableFrame ? scene.matrixWorld.clone().invert() : new THREE.Matrix4();
  const measurements = inputs.map((input) => ({
    input,
    samples: [] as number[],
    head: new THREE.Vector3(...input.head),
    axis: new THREE.Vector3(...input.tail).sub(new THREE.Vector3(...input.head)),
  }));
  const point = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const measurementBones = inputs.map((input) => input.bone);
  let inspectedVertices = 0;
  if (usableFrame) scene.traverseVisible((object) => {
    if (inspectedVertices >= SCENE_VERTEX_BUDGET || isStudioAuthoredAttachment(object)) return;
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    // Shared skeletons often list leg bones on face/hair meshes that have no leg weights.
    // Those meshes must not exhaust the scene's sample budget before reaching the body.
    const dependencies = shapeDependencies(mesh, measurementBones);
    if (!dependencies || dependencies.eligibleCount === 0) return;
    const sampler = createStudioVrmSurfaceVertexSampler(mesh, toModel);
    if (!sampler) return;
    const position = mesh.geometry.getAttribute("position");
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const byBone = new Map<number, typeof measurements[number]>();
    for (const measurement of measurements) {
      const index = mesh.skeleton.bones.indexOf(measurement.input.bone as THREE.Bone);
      if (index >= 0) byBone.set(index, measurement);
    }
    if (byBone.size === 0) return;
    const stride = Math.max(1, Math.ceil(position.count / MESH_VERTEX_BUDGET));
    for (let vertex = 0; vertex < position.count && inspectedVertices < SCENE_VERTEX_BUDGET; vertex += stride) {
      inspectedVertices += 1;
      let dominant = -1;
      let maximumWeight = 0;
      for (let slot = 0; slot < 4; slot += 1) {
        const weight = weights.getComponent(vertex, slot);
        if (weight > maximumWeight) {
          dominant = indices.getComponent(vertex, slot);
          maximumWeight = weight;
        }
      }
      const measurement = byBone.get(dominant);
      if (!measurement || maximumWeight < 0.5 || !sampler(vertex, point)) continue;
      const lengthSquared = measurement.axis.lengthSq();
      if (!Number.isFinite(lengthSquared) || lengthSquared < 1e-10) continue;
      relative.copy(point).sub(measurement.head);
      const t = relative.dot(measurement.axis) / lengthSquared;
      // Exclude joints and adjacent regions; their different skin envelopes inflate a whole limb.
      if (t < 0.05 || t > 0.95) continue;
      const distance = relative.addScaledVector(measurement.axis, -t).length();
      if (Number.isFinite(distance) && distance >= 0.004 && distance <= 0.5) {
        measurement.samples.push(distance);
      }
    }
  });
  const capsules: Record<string, StudioVrmBodyCapsuleMeasurement> = {};
  for (const { input, samples } of measurements) {
    const fallback = Math.min(0.5, Math.max(0.004, Number.isFinite(input.fallbackRadius) ? input.fallbackRadius : 0.004));
    const measured = samples.length >= MIN_SAMPLES;
    capsules[input.id] = Object.freeze({
      radius: measured
        ? Math.min(0.5, Math.max(fallback, percentileOfSorted(samples.sort((a, b) => a - b), 0.98) + 0.003))
        : fallback,
      source: measured ? "skinned-surface-envelope" : "skeleton-fallback",
      sampleCount: samples.length,
    });
  }
  return Object.freeze({ capsules: Object.freeze(capsules), inspectedVertices });
}
