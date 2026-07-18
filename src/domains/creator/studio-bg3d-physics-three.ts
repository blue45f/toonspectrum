import * as THREE from "three";

import {
  createStudioBg3dPhysicsDefaultCollider,
  normalizeStudioBg3dPhysicsWorld,
  type StudioBg3dPhysicsTransformSample,
  type StudioBg3dPhysicsWorld,
} from "./studio-bg3d-physics";
import {
  calculateStudioBg3dThreeWorldMatrix,
  decomposeStudioBg3dThreeLocalMatrix,
} from "./studio-bg3d-three-hierarchy";

import type {
  StudioBg3dSceneDocument,
  StudioBg3dVec3,
} from "./studio-bg3d-scene-document";

const MAX_WORLD_COORDINATE = 10_000;

export interface StudioBg3dPhysicsThreeJob {
  readonly world: StudioBg3dPhysicsWorld;
  readonly initialPoses: readonly StudioBg3dPhysicsTransformSample[];
}

/**
 * Resolves collider dimensions and poses from the same hierarchy world matrix. This preserves
 * inherited scale for nested static colliders and rejects shear that a rigid Rapier body cannot
 * represent without silently diverging from the rendered scene.
 */
export function createStudioBg3dPhysicsThreeJob(
  document: StudioBg3dSceneDocument,
  localWorld: StudioBg3dPhysicsWorld,
): StudioBg3dPhysicsThreeJob | null {
  const normalizedLocalWorld = normalizeStudioBg3dPhysicsWorld(localWorld, document);
  if (!normalizedLocalWorld) return null;
  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  const hierarchyEntities = document.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
  }));
  const bodies = normalizedLocalWorld.bodies.map((body) => {
    const node = nodeById.get(body.nodeId);
    if (!node) return null;
    const worldMatrix = calculateStudioBg3dThreeWorldMatrix(
      hierarchyEntities,
      body.nodeId,
    );
    if (!worldMatrix) return null;
    const decomposed = decomposeStudioBg3dThreeLocalMatrix(worldMatrix);
    if (!decomposed) return null;
    const effectiveScale: StudioBg3dVec3 = [
      Math.abs(decomposed.scale[0]),
      Math.abs(decomposed.scale[1]),
      Math.abs(decomposed.scale[2]),
    ];
    if (effectiveScale.some((component) => !Number.isFinite(component) || component <= 1e-8)) {
      return null;
    }
    return {
      ...body,
      collider: createStudioBg3dPhysicsDefaultCollider(node, effectiveScale),
    };
  });
  if (bodies.some((body) => body === null)) return null;
  const world = normalizeStudioBg3dPhysicsWorld({
    ...normalizedLocalWorld,
    bodies,
  }, document);
  if (!world) return null;
  const initialPoses = createStudioBg3dPhysicsInitialPoses(document, world);
  if (!initialPoses) return null;
  return Object.freeze({ world, initialPoses });
}

/**
 * Builds immutable world-space poses in physics-body order. SceneDocument transforms are local to
 * their parent, whereas a rigid-body backend expects one world transform per body.
 */
export function createStudioBg3dPhysicsInitialPoses(
  document: Pick<StudioBg3dSceneDocument, "nodes">,
  world: StudioBg3dPhysicsWorld,
): readonly StudioBg3dPhysicsTransformSample[] | null {
  const normalizedWorld = normalizeStudioBg3dPhysicsWorld(world, document);
  if (!normalizedWorld) return null;
  const hierarchyEntities = document.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
  }));
  const samples: StudioBg3dPhysicsTransformSample[] = [];
  for (const body of normalizedWorld.bodies) {
    const matrix = calculateStudioBg3dThreeWorldMatrix(hierarchyEntities, body.nodeId);
    if (!matrix) return null;
    const decomposed = decomposeStudioBg3dThreeLocalMatrix(matrix);
    if (!decomposed) return null;
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...decomposed.rotation, "XYZ"),
    );
    const [x, y, z] = decomposed.position;
    if (
      [x, y, z, rotation.x, rotation.y, rotation.z, rotation.w]
        .some((component) => !Number.isFinite(component)) ||
      Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > MAX_WORLD_COORDINATE ||
      rotation.lengthSq() < 1e-12
    ) return null;
    rotation.normalize();
    samples.push(Object.freeze({
      nodeId: body.nodeId,
      position: Object.freeze([x, y, z] as const),
      rotation: Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const),
    }));
  }
  return Object.freeze(samples);
}

/** Applies an already validated transient sample set without mutating canonical React state. */
export function projectStudioBg3dPhysicsSamples(
  samples: readonly StudioBg3dPhysicsTransformSample[],
  objects: ReadonlyMap<string, THREE.Object3D>,
): boolean {
  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample.nodeId)) return false;
    const object = objects.get(sample.nodeId);
    if (!object || object.parent?.type !== "Scene") {
      // Dynamic bodies are root-only. Rejecting a newly parented object prevents a transient world
      // transform from being interpreted as a local transform if the scene changes mid-session.
      return false;
    }
    const [x, y, z] = sample.position;
    const [qx, qy, qz, qw] = sample.rotation;
    if (
      [x, y, z, qx, qy, qz, qw].some((component) => !Number.isFinite(component)) ||
      Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > MAX_WORLD_COORDINATE
    ) return false;
    const rotationLength = Math.hypot(qx, qy, qz, qw);
    if (!Number.isFinite(rotationLength) || rotationLength < 1e-8) return false;
    seen.add(sample.nodeId);
  }
  for (const sample of samples) {
    const object = objects.get(sample.nodeId)!;
    object.position.set(...sample.position);
    object.quaternion.set(...sample.rotation).normalize();
    object.updateMatrix();
    object.updateWorldMatrix(false, true);
  }
  return true;
}
