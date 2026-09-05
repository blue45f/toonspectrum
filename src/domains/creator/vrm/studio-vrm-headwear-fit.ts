import * as THREE from "three";

import type { PropDef, PropInstance, Vec3 } from "./studio-vrm-props";
import type { VRM } from "@pixiv/three-vrm";

/** Local head landmarks and world-space diameters; never persisted into a scene. */
export interface StudioVrmHeadSurface {
  readonly width: number;
  readonly depth: number;
  readonly top: number;
  readonly centerZ: number;
  readonly front: number;
  readonly eyeY: number;
  readonly worldScaleX: number;
  readonly worldScaleY: number;
  readonly facing: 1 | -1;
}

const HEADWEAR = new Set(["cap", "beret", "beanie", "headphones", "ribbon", "blender_wizard_hat", "sunglasses"]);
const MAX_VERTICES = 120_000;
const MAX_POINTS = 16_000;
const quantile = (values: number[], fraction: number) => {
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]!;
};

export function sanitizeStudioVrmHeadSurface(raw: unknown): StudioVrmHeadSurface | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<StudioVrmHeadSurface>;
  const keys = ["width", "depth", "top", "centerZ", "front", "eyeY", "worldScaleX", "worldScaleY", "facing"] as const;
  if (keys.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) return undefined;
  const result = Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as StudioVrmHeadSurface;
  if (result.width < 0.08 || result.width > 0.75 || result.depth < 0.06 || result.depth > 0.75
    || result.top < 0.04 || result.top > 0.65 || Math.abs(result.centerZ) > 0.25
    || result.front < 0 || result.front > 0.4 || Math.abs(result.eyeY) > 0.4
    || (result.facing !== 1 && result.facing !== -1)
    || result.worldScaleX < 0.2 || result.worldScaleX > 5
    || result.worldScaleY < 0.2 || result.worldScaleY > 5) return undefined;
  return result;
}

/** Measure native skinned head/hair, excluding attached props and remote hair tips.
 * Bounds come from actual current skinning, not mesh names or neck-to-head distance.
 * Sampling and duplicate-geometry visits are bounded even on multi-material VRMs.
 */
export function measureStudioVrmHeadSurface(vrm: VRM): StudioVrmHeadSurface | undefined {
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  const rawHead = vrm.humanoid?.getRawBoneNode("head");
  if (!head || !rawHead) return undefined;
  vrm.scene.updateMatrixWorld(true);
  if (!Number.isFinite(head.matrixWorld.determinant()) || Math.abs(head.matrixWorld.determinant()) < 1e-8) return undefined;
  const inverse = head.matrixWorld.clone().invert();
  const scale = head.getWorldScale(new THREE.Vector3());
  const points: THREE.Vector3[] = [];
  const seen = new Set<string>();
  const attributeIds = new WeakMap<object, number>();
  let nextAttributeId = 0;
  let visited = 0;
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton || points.length >= MAX_POINTS || visited >= MAX_VERTICES) return;
    const positions = mesh.geometry.getAttribute("position");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const indices = mesh.geometry.getAttribute("skinIndex");
    if (!positions || !weights || !indices) return;
    if (!attributeIds.has(positions)) attributeIds.set(positions, ++nextAttributeId);
    const key = `${attributeIds.get(positions)}:${mesh.skeleton.uuid}:${mesh.matrixWorld.elements.join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    const attached = mesh.skeleton.bones.map((bone) => {
      let cursor: THREE.Object3D | null = bone;
      while (cursor && cursor !== rawHead) cursor = cursor.parent;
      return cursor === rawHead;
    });
    if (!attached.some(Boolean)) return;
    const stride = Math.max(1, Math.ceil(positions.count / 12_000));
    for (let i = 0; i < positions.count && points.length < MAX_POINTS && visited < MAX_VERTICES; i += stride) {
      visited++;
      let weight = 0;
      for (let k = 0; k < Math.min(4, weights.itemSize, indices.itemSize); k++) {
        if (attached[indices.getComponent(i, k)]) weight += weights.getComponent(i, k);
      }
      if (weight < 0.5) continue;
      const point = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if (!point.toArray().every(Number.isFinite) || point.y < -0.04 || point.y > 0.5
        || Math.abs(point.x) > 0.3 || Math.abs(point.z) > 0.3) continue;
      points.push(point);
    }
  });
  if (points.length < 64) return undefined;
  const eyeNodes = [vrm.humanoid.getNormalizedBoneNode("leftEye"), vrm.humanoid.getNormalizedBoneNode("rightEye")];
  const eyes = eyeNodes.filter((node): node is THREE.Object3D => Boolean(node))
    .map((node) => node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
  const eyeZ = eyes.length === 2 ? (eyes[0]!.z + eyes[1]!.z) / 2 : 0;
  const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
  const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
  const armDirection = leftArm && rightArm
    ? leftArm.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).x
      - rightArm.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).x : 0;
  const direction = Math.abs(eyeZ) > 0.001 ? eyeZ : armDirection;
  if (Math.abs(direction) < 0.001) return undefined;
  const facing: 1 | -1 = direction > 0 ? 1 : -1;
  const top = quantile(points.map((point) => point.y), 0.995);
  const crown = points.filter((point) => point.y > top * 0.4 && point.y < top * 0.88);
  if (crown.length < 32) return undefined;
  const left = quantile(crown.map((point) => point.x), 0.015);
  const right = quantile(crown.map((point) => point.x), 0.985);
  const back = quantile(crown.map((point) => point.z * facing), 0.015);
  const front = quantile(crown.map((point) => point.z * facing), 0.985);
  const eyeY = eyes.length === 2 ? (eyes[0]!.y + eyes[1]!.y) / 2 : top * 0.27;
  const face = points.filter((point) => Math.abs(point.x) < (right - left) * 0.35 && Math.abs(point.y - eyeY) < top * 0.13);
  return sanitizeStudioVrmHeadSurface({
    width: (right - left) * Math.abs(scale.x), depth: (front - back) * Math.abs(scale.z),
    top, centerZ: (front + back) / 2, front: face.length > 16 ? quantile(face.map((point) => point.z * facing), 0.95) : front,
    eyeY, worldScaleX: Math.abs(scale.x), worldScaleY: Math.abs(scale.y), facing,
  });
}

export function studioVrmHeadwearScale(def: PropDef, instance: PropInstance, surface?: StudioVrmHeadSurface): number | null {
  if (!surface || !instance.rig?.autoScale || instance.bone !== "head" || !HEADWEAR.has(def.id)) return null;
  if (def.id === "sunglasses") return surface.width / 0.146;
  if (def.id === "ribbon") return surface.width / 0.21;
  if (def.id === "headphones") return surface.width / 0.19;
  return Math.max(surface.width / 0.205, surface.depth / 0.20) * 1.16;
}

/** Only the seven regenerated head wearables opt in; manual and legacy props are untouched. */
export function studioVrmHeadwearSocket(def: PropDef, instance: PropInstance, scale: number, surface?: StudioVrmHeadSurface): Vec3 | null {
  if (studioVrmHeadwearScale(def, instance, surface) === null || !surface) return null;
  const localScale = scale / surface.worldScaleY;
  const z = surface.centerZ;
  const local = (value: Vec3): Vec3 => [value[0] * surface.facing, value[1], value[2] * surface.facing];
  switch (def.id) {
    case "cap": return local([0, surface.top + 0.018 - 0.165 * localScale, z + 0.018]);
    case "beret": return local([-0.01, surface.top + 0.045 - 0.089 * localScale, z + 0.018]);
    case "beanie": return local([0, surface.top + 0.055 - 0.131 * localScale, z + 0.024]);
    case "blender_wizard_hat": return local([0, surface.top * 0.63 - 0.02 * localScale, z]);
    case "headphones": return local([0, surface.top + 0.035 - 0.135 * localScale, z + 0.015]);
    case "sunglasses": return local([0, surface.eyeY, surface.front + 0.01]);
    case "ribbon": return local([surface.width / (2 * surface.worldScaleX) - 0.045 * scale / surface.worldScaleX, surface.top * 0.65, surface.front + 0.006]);
    default: return null;
  }
}
