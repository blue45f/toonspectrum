import {
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
  type StudioBg3dSceneNode,
  type StudioBg3dQuaternion,
  type StudioBg3dVec3,
} from "./studio-bg3d-scene-document";

export type StudioBg3dPhysicsMotion = "static" | "dynamic" | "kinematic";

export type StudioBg3dCollider =
  | { readonly kind: "box"; readonly halfExtents: readonly [number, number, number] }
  | { readonly kind: "sphere"; readonly radius: number }
  | { readonly kind: "capsule"; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: "convex-hull"; readonly vertexCount: number }
  | { readonly kind: "triangle-mesh"; readonly triangleCount: number };

export interface StudioBg3dPhysicsBody {
  readonly nodeId: string;
  readonly motion: StudioBg3dPhysicsMotion;
  readonly collider: StudioBg3dCollider;
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
}

export interface StudioBg3dPhysicsWorld {
  readonly bodies: readonly StudioBg3dPhysicsBody[];
  readonly solverSubsteps: number;
  readonly allowSleep: boolean;
}

export interface StudioBg3dPhysicsTransformSample {
  readonly nodeId: string;
  readonly position: StudioBg3dVec3;
  readonly rotation: StudioBg3dQuaternion;
}

const MAX_PHYSICS_BODIES = 256;
const MAX_COLLIDER_DIMENSION = 10_000;
const MAX_CONVEX_HULL_VERTICES = 4_096;
const MAX_TRIANGLE_MESH_TRIANGLES = 50_000;
const MAX_WORLD_COORDINATE = 10_000;
const MAX_QUATERNION_COMPONENT = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalizeCollider(value: unknown): StudioBg3dCollider | null {
  if (!isRecord(value)) return null;
  if (value.kind === "convex-hull") {
    if (!Number.isSafeInteger(value.vertexCount) ||
      !finiteInRange(value.vertexCount, 4, MAX_CONVEX_HULL_VERTICES)) return null;
    return Object.freeze({ kind: "convex-hull", vertexCount: value.vertexCount });
  }
  if (value.kind === "triangle-mesh") {
    if (!Number.isSafeInteger(value.triangleCount) ||
      !finiteInRange(value.triangleCount, 1, MAX_TRIANGLE_MESH_TRIANGLES)) return null;
    return Object.freeze({ kind: "triangle-mesh", triangleCount: value.triangleCount });
  }
  if (value.kind === "sphere") {
    if (!finiteInRange(value.radius, 0.001, MAX_COLLIDER_DIMENSION)) return null;
    return Object.freeze({ kind: "sphere", radius: value.radius });
  }
  if (value.kind === "capsule") {
    if (
      !finiteInRange(value.radius, 0.001, MAX_COLLIDER_DIMENSION) ||
      !finiteInRange(value.halfHeight, 0, MAX_COLLIDER_DIMENSION)
    ) return null;
    return Object.freeze({ kind: "capsule", radius: value.radius, halfHeight: value.halfHeight });
  }
  if (value.kind === "box") {
    if (
      !Array.isArray(value.halfExtents) || value.halfExtents.length !== 3 ||
      value.halfExtents.some((component) => !finiteInRange(component, 0.001, MAX_COLLIDER_DIMENSION))
    ) return null;
    return Object.freeze({
      kind: "box",
      halfExtents: Object.freeze([...value.halfExtents]) as readonly [number, number, number],
    });
  }
  return null;
}

/** Validates a physics job against document identity without retaining engine-specific bodies. */
export function normalizeStudioBg3dPhysicsWorld(
  value: unknown,
  document?: Pick<StudioBg3dSceneDocument, "nodes">,
): StudioBg3dPhysicsWorld | null {
  try {
    if (
      !isRecord(value) || !Array.isArray(value.bodies) ||
      value.bodies.length > MAX_PHYSICS_BODIES ||
      !Number.isSafeInteger(value.solverSubsteps) ||
      !finiteInRange(value.solverSubsteps, 1, 16) ||
      typeof value.allowSleep !== "boolean"
    ) return null;
    const nodeById = document
      ? new Map(document.nodes.map((node) => [node.id, node] as const))
      : null;
    const parentNodeIds = document
      ? new Set(document.nodes.flatMap((node) => node.parentId ? [node.parentId] : []))
      : null;
    const documentOrder = document
      ? new Map(document.nodes.map((node, index) => [node.id, index] as const))
      : null;
    const seen = new Set<string>();
    const bodies: StudioBg3dPhysicsBody[] = [];
    for (const rawBody of value.bodies) {
      if (!isRecord(rawBody)) return null;
      const nodeId = rawBody.nodeId;
      const motion = rawBody.motion;
      const node = typeof nodeId === "string" ? nodeById?.get(nodeId) : undefined;
      if (
        typeof nodeId !== "string" || !nodeId || nodeId.length > 80 ||
        seen.has(nodeId) || (nodeById && !node) ||
        (motion !== "static" && motion !== "dynamic" && motion !== "kinematic") ||
        (motion === "dynamic" && (
          node?.parentId || node?.locked || parentNodeIds?.has(nodeId)
        )) ||
        !finiteInRange(rawBody.mass, 0, 1_000_000) ||
        !finiteInRange(rawBody.friction, 0, 2) ||
        !finiteInRange(rawBody.restitution, 0, 1) ||
        !finiteInRange(rawBody.linearDamping, 0, 100) ||
        !finiteInRange(rawBody.angularDamping, 0, 100)
      ) return null;
      const collider = normalizeCollider(rawBody.collider);
      if (
        !collider || (motion === "dynamic" && rawBody.mass <= 0) ||
        (motion !== "dynamic" && rawBody.mass !== 0) ||
        (motion === "dynamic" && collider.kind === "triangle-mesh")
      ) return null;
      seen.add(nodeId);
      bodies.push(Object.freeze({
        nodeId,
        motion,
        collider,
        mass: rawBody.mass,
        friction: rawBody.friction,
        restitution: rawBody.restitution,
        linearDamping: rawBody.linearDamping,
        angularDamping: rawBody.angularDamping,
      }));
    }
    bodies.sort((left, right) => {
      if (documentOrder) {
        return (documentOrder.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER) -
          (documentOrder.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER);
      }
      return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0;
    });
    return Object.freeze({
      bodies: Object.freeze(bodies),
      solverSubsteps: value.solverSubsteps,
      allowSleep: value.allowSleep,
    });
  } catch {
    return null;
  }
}

function defaultCollider(node: StudioBg3dSceneNode): StudioBg3dCollider {
  const scale = node.transform.scale.map((component) => Math.abs(component)) as [number, number, number];
  // Model geometry is not trusted to be cheap enough for runtime hull generation. Until verified
  // collider metadata exists, a bounded unit-space AABB is the deterministic preview fallback.
  if (node.kind === "model") {
    return Object.freeze({
      kind: "box",
      halfExtents: Object.freeze(scale.map((component) => component / 2)) as readonly [number, number, number],
    });
  }
  if (node.primitiveKind === "sphere" || node.primitiveKind === "hemisphere") {
    return Object.freeze({ kind: "sphere", radius: Math.max(...scale) / 2 });
  }
  if (node.primitiveKind === "capsule") {
    return Object.freeze({
      kind: "capsule",
      radius: Math.max(scale[0], scale[2]) * 0.3,
      halfHeight: scale[1] * 0.35,
    });
  }
  if (node.primitiveKind === "plane" || node.primitiveKind === "ring") {
    return Object.freeze({
      kind: "box",
      halfExtents: Object.freeze([
        scale[0] / 2,
        scale[1] / 2,
        0.001,
      ]) as readonly [number, number, number],
    });
  }
  return Object.freeze({
    kind: "box",
    halfExtents: Object.freeze(scale.map((component) => component / 2)) as readonly [number, number, number],
  });
}

/** Creates a conservative preview world; only explicitly selected root nodes become dynamic. */
export function createStudioBg3dPhysicsWorld(
  document: StudioBg3dSceneDocument,
  dynamicNodeIds: ReadonlySet<string>,
): StudioBg3dPhysicsWorld | null {
  if (dynamicNodeIds.size > MAX_PHYSICS_BODIES) return null;
  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  const parentNodeIds = new Set(document.nodes.flatMap((node) =>
    node.parentId ? [node.parentId] : []
  ));
  for (const id of dynamicNodeIds) {
    const node = nodeById.get(id);
    if (!node || node.parentId || node.locked || parentNodeIds.has(id)) return null;
  }
  const bodies: StudioBg3dPhysicsBody[] = document.nodes.map((node) => {
    const dynamic = dynamicNodeIds.has(node.id);
    return {
      nodeId: node.id,
      motion: dynamic ? "dynamic" : "static",
      collider: defaultCollider(node),
      mass: dynamic ? 1 : 0,
      friction: 0.6,
      restitution: 0.1,
      linearDamping: 0.05,
      angularDamping: 0.05,
    };
  });
  return normalizeStudioBg3dPhysicsWorld({ bodies, solverSubsteps: 2, allowSleep: true }, document);
}

function quaternionToEulerXyz(
  raw: StudioBg3dQuaternion,
): StudioBg3dVec3 | null {
  const length = Math.hypot(...raw);
  if (!Number.isFinite(length) || length < 1e-8) return null;
  const [x, y, z, w] = raw.map((component) => component / length) as [number, number, number, number];
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.min(1, Math.max(-1, m13)));
  const ex = Math.abs(m13) < 0.9999999 ? Math.atan2(-m23, m33) : Math.atan2(m32, m22);
  const ez = Math.abs(m13) < 0.9999999 ? Math.atan2(-m12, m11) : 0;
  const canonicalAngle = (angle: number): number =>
    ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return [canonicalAngle(ex), canonicalAngle(ey), canonicalAngle(ez)];
}

/** Applies validated root-local bake results as a new canonical SceneDocument. */
export function applyStudioBg3dPhysicsTransforms(
  document: StudioBg3dSceneDocument,
  samples: unknown,
  worldValue: unknown,
): StudioBg3dSceneDocument | null {
  if (!Array.isArray(samples) || samples.length > MAX_PHYSICS_BODIES) return null;
  const world = normalizeStudioBg3dPhysicsWorld(worldValue, document);
  if (!world) return null;
  const dynamicNodeIds = new Set(
    world.bodies.filter((body) => body.motion === "dynamic").map((body) => body.nodeId),
  );
  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  const patchById = new Map<string, { position: StudioBg3dVec3; rotation: StudioBg3dVec3 }>();
  try {
    for (const sample of samples) {
      if (!isRecord(sample) || typeof sample.nodeId !== "string") return null;
      const node = nodeById.get(sample.nodeId);
      const position = sample.position;
      const rawRotation = sample.rotation;
      if (
        !node || node.parentId || node.locked || !dynamicNodeIds.has(sample.nodeId) ||
        patchById.has(sample.nodeId) ||
        !Array.isArray(position) || position.length !== 3 ||
        position.some((component: unknown) =>
          !finiteInRange(component, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE)
        ) ||
        !Array.isArray(rawRotation) || rawRotation.length !== 4 ||
        rawRotation.some((component: unknown) =>
          !finiteInRange(component, -MAX_QUATERNION_COMPONENT, MAX_QUATERNION_COMPONENT)
        )
      ) return null;
      const typedPosition = [...position] as unknown as StudioBg3dVec3;
      const typedRotation = [...rawRotation] as unknown as StudioBg3dQuaternion;
      const rotation = quaternionToEulerXyz(typedRotation);
      if (!rotation) return null;
      patchById.set(sample.nodeId, { position: typedPosition, rotation });
    }
  } catch {
    return null;
  }
  const raw = {
    ...document,
    nodes: document.nodes.map((node) => {
      const patch = patchById.get(node.id);
      return patch ? { ...node, transform: { ...node.transform, ...patch } } : node;
    }),
  };
  const serialized = serializeStudioBg3dSceneDocument(raw);
  return serialized ? parseStudioBg3dSceneDocument(serialized) : null;
}
