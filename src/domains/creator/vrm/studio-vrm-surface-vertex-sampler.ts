import * as THREE from "three";

/** One bounded measurement pass. Invalid imports leave the caller's target untouched. */
export type StudioVrmSurfaceVertexSampler = (index: number, target: THREE.Vector3) => boolean;
const finiteMatrix = (matrix: THREE.Matrix4): boolean => matrix.elements.every(Number.isFinite);

/**
 * Match the rendered surface: active morphs, all four weighted bones, mesh world transform, then
 * the reference space. The heaviest bone classifies the region; it must not deform it alone.
 * The caller updates world matrices once and limits the sample budget. No source state is changed.
 */
export function createStudioVrmSurfaceVertexSampler(
  mesh: THREE.SkinnedMesh,
  worldToReference: THREE.Matrix4,
): StudioVrmSurfaceVertexSampler | null {
  const { geometry, skeleton } = mesh;
  const position = geometry.getAttribute("position");
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  if (!position || position.itemSize !== 3 || !skinIndex || !skinWeight || !skeleton
    || skinIndex.itemSize < 4 || skinWeight.itemSize < 4
    || skinIndex.count < position.count || skinWeight.count < position.count
    || !finiteMatrix(mesh.bindMatrix) || !finiteMatrix(mesh.bindMatrixInverse)
    || !finiteMatrix(mesh.matrixWorld) || !finiteMatrix(worldToReference)) return null;

  const validBones = skeleton.bones.map((bone, index) => Boolean(
    bone && skeleton.boneInverses[index]
    && finiteMatrix(bone.matrixWorld) && finiteMatrix(skeleton.boneInverses[index]),
  ));
  const morphs = geometry.morphAttributes.position ?? [];
  const influences = mesh.morphTargetInfluences;
  if (influences && morphs.some((attribute, index) => (
    !Number.isFinite(influences[index])
    || (influences[index] !== 0 && (attribute.count < position.count || attribute.itemSize !== 3))
  ))) return null;

  const transform = new THREE.Matrix4().multiplyMatrices(worldToReference, mesh.matrixWorld);
  const sampled = new THREE.Vector3();
  return (index, target) => {
    if (!Number.isInteger(index) || index < 0 || index >= position.count) return false;
    let totalWeight = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = skinWeight.getComponent(index, slot);
      if (!Number.isFinite(weight) || weight < 0) return false;
      if (weight === 0) continue;
      const boneIndex = skinIndex.getComponent(index, slot);
      if (!Number.isInteger(boneIndex) || !validBones[boneIndex]) return false;
      totalWeight += weight;
    }
    if (totalWeight <= 0 || !Number.isFinite(totalWeight)) return false;
    mesh.getVertexPosition(index, sampled).applyMatrix4(transform);
    if (!Number.isFinite(sampled.x) || !Number.isFinite(sampled.y) || !Number.isFinite(sampled.z)) return false;
    target.copy(sampled);
    return true;
  };
}
