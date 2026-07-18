import * as THREE from "three";

import { resolveStudioBg3dHierarchy } from "./studio-bg3d-hierarchy";

export interface StudioBg3dThreeHierarchyEntity {
  readonly id: string;
  readonly parentId?: string | null;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface StudioBg3dThreeLocalTransform {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly scale: [number, number, number];
}

const STUDIO_BG3D_MATRIX_RECOMPOSE_EPSILON = 1e-6;

/**
 * Converts a matrix to the engine-neutral TRS contract only when doing so is lossless enough for
 * editing. A rotated child under a non-uniformly scaled parent can introduce shear; silently
 * decomposing that matrix would make the object jump on the next document round-trip.
 */
export function decomposeStudioBg3dThreeLocalMatrix(
  matrix: THREE.Matrix4,
): StudioBg3dThreeLocalTransform | null {
  if (Math.abs(matrix.determinant()) < 1e-12) return null;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  const values = [
    position.x, position.y, position.z,
    rotation.x, rotation.y, rotation.z,
    scale.x, scale.y, scale.z,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;

  const recomposed = new THREE.Matrix4().compose(position, quaternion, scale);
  const magnitude = Math.max(1, ...matrix.elements.map((value) => Math.abs(value)));
  const maximumDifference = matrix.elements.reduce(
    (maximum, value, index) => Math.max(
      maximum,
      Math.abs(value - (recomposed.elements[index] ?? Number.NaN)),
    ),
    0,
  );
  if (
    !Number.isFinite(maximumDifference) ||
    maximumDifference > magnitude * STUDIO_BG3D_MATRIX_RECOMPOSE_EPSILON
  ) {
    return null;
  }
  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

function localMatrix(entity: StudioBg3dThreeHierarchyEntity): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...entity.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...entity.rotation, "XYZ")),
    new THREE.Vector3(...entity.scale),
  );
}

/**
 * Computes a new local TRS that keeps the entity's current world transform when its parent changes.
 * Returns null for missing entities or singular parent matrices; callers then keep the old local TRS.
 */
export function calculateStudioBg3dThreeReparentTransform(
  entities: readonly StudioBg3dThreeHierarchyEntity[],
  entityId: string,
  nextParentId: string | null,
): StudioBg3dThreeLocalTransform | null {
  const entityById = new Map(entities.map((entity) => [entity.id, entity] as const));
  const entity = entityById.get(entityId);
  if (!entity || (nextParentId !== null && !entityById.has(nextParentId))) return null;
  const hierarchy = resolveStudioBg3dHierarchy(entities);
  const worldById = new Map<string, THREE.Matrix4>();
  const worldMatrix = (id: string): THREE.Matrix4 | null => {
    const cached = worldById.get(id);
    if (cached) return cached;
    const current = entityById.get(id);
    if (!current) return null;
    const local = localMatrix(current);
    const parentId = hierarchy.parentById.get(id) ?? null;
    const parentWorld = parentId ? worldMatrix(parentId) : null;
    const world = parentWorld ? parentWorld.clone().multiply(local) : local;
    worldById.set(id, world);
    return world;
  };
  const currentWorld = worldMatrix(entityId);
  if (!currentWorld) return null;
  let nextLocal = currentWorld.clone();
  if (nextParentId !== null) {
    const nextParentWorld = worldMatrix(nextParentId);
    if (!nextParentWorld || Math.abs(nextParentWorld.determinant()) < 1e-12) return null;
    nextLocal = nextParentWorld.clone().invert().multiply(currentWorld);
  }
  return decomposeStudioBg3dThreeLocalMatrix(nextLocal);
}

/** Applies one TransformControls world-space delta to an object under any other parent. */
export function calculateStudioBg3dThreeWorldDeltaTransform(input: {
  readonly initialDriverWorldMatrix: THREE.Matrix4;
  readonly currentDriverWorldMatrix: THREE.Matrix4;
  readonly initialTargetWorldMatrix: THREE.Matrix4;
  readonly targetParentWorldMatrix?: THREE.Matrix4 | null;
}): StudioBg3dThreeLocalTransform | null {
  if (Math.abs(input.initialDriverWorldMatrix.determinant()) < 1e-12) return null;
  const worldDelta = input.currentDriverWorldMatrix.clone().multiply(
    input.initialDriverWorldMatrix.clone().invert(),
  );
  const targetWorld = worldDelta.multiply(input.initialTargetWorldMatrix);
  const parentWorld = input.targetParentWorldMatrix;
  if (parentWorld && Math.abs(parentWorld.determinant()) < 1e-12) return null;
  const targetLocal = parentWorld
    ? parentWorld.clone().invert().multiply(targetWorld)
    : targetWorld;
  return decomposeStudioBg3dThreeLocalMatrix(targetLocal);
}
