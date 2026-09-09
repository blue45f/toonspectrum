import { studioDeterministicContentId } from "../studio-deterministic-serialization";

export interface StudioVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioEulerDegrees {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioTransform3d {
  readonly position: StudioVec3;
  readonly rotation: StudioEulerDegrees;
  readonly scale: StudioVec3;
}

export type StudioAttachmentKind = "figure" | "head" | "hand" | "prop" | "camera" | "light";

export interface StudioAttachmentConstraint {
  readonly type: "copy-position" | "copy-rotation" | "look-at" | "distance";
  readonly targetNodeId: string;
  readonly weight: number;
  readonly distance?: number;
}

export interface StudioAttachmentNode {
  readonly id: string;
  readonly kind: StudioAttachmentKind;
  readonly assetRevisionId: string;
  readonly parentNodeId?: string;
  readonly parentSocket?: string;
  readonly localTransform: StudioTransform3d;
  readonly constraints: readonly StudioAttachmentConstraint[];
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface StudioAttachmentGraph {
  readonly version: 1;
  readonly revision: number;
  readonly nodes: readonly StudioAttachmentNode[];
}

const IDENTITY_TRANSFORM: StudioTransform3d = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 1, y: 1, z: 1 }),
});

function finiteVec(value: StudioVec3, field: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError(`${field} must be finite.`);
}

function validateTransform(transform: StudioTransform3d, field: string): void {
  finiteVec(transform.position, `${field}.position`);
  finiteVec(transform.rotation, `${field}.rotation`);
  finiteVec(transform.scale, `${field}.scale`);
  if ([transform.scale.x, transform.scale.y, transform.scale.z].some((value) => Math.abs(value) < 1e-6 || Math.abs(value) > 10_000)) {
    throw new RangeError(`${field}.scale is outside the supported range.`);
  }
}

function normalizeAngle(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function addVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function subtractVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
}

function multiplyVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x * right.x, y: left.y * right.y, z: left.z * right.z });
}

function divideVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x / right.x, y: left.y / right.y, z: left.z / right.z });
}

function rotateVector(vector: StudioVec3, rotation: StudioEulerDegrees): StudioVec3 {
  const rx = (rotation.x * Math.PI) / 180;
  const ry = (rotation.y * Math.PI) / 180;
  const rz = (rotation.z * Math.PI) / 180;
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x1 = vector.x;
  const y1 = vector.y * cosX - vector.z * sinX;
  const z1 = vector.y * sinX + vector.z * cosX;
  const x2 = x1 * cosY + z1 * sinY;
  const y2 = y1;
  const z2 = -x1 * sinY + z1 * cosY;
  return Object.freeze({
    x: x2 * cosZ - y2 * sinZ,
    y: x2 * sinZ + y2 * cosZ,
    z: z2,
  });
}

function inverseRotateVector(vector: StudioVec3, rotation: StudioEulerDegrees): StudioVec3 {
  return rotateVector(vector, { x: -rotation.x, y: -rotation.y, z: -rotation.z });
}

function composeTransform(parent: StudioTransform3d, local: StudioTransform3d): StudioTransform3d {
  const scaled = multiplyVec(local.position, parent.scale);
  const rotated = rotateVector(scaled, parent.rotation);
  return Object.freeze({
    position: addVec(parent.position, rotated),
    rotation: Object.freeze({
      x: normalizeAngle(parent.rotation.x + local.rotation.x),
      y: normalizeAngle(parent.rotation.y + local.rotation.y),
      z: normalizeAngle(parent.rotation.z + local.rotation.z),
    }),
    scale: multiplyVec(parent.scale, local.scale),
  });
}

function localFromWorld(parent: StudioTransform3d, world: StudioTransform3d): StudioTransform3d {
  const relative = inverseRotateVector(subtractVec(world.position, parent.position), parent.rotation);
  return Object.freeze({
    position: divideVec(relative, parent.scale),
    rotation: Object.freeze({
      x: normalizeAngle(world.rotation.x - parent.rotation.x),
      y: normalizeAngle(world.rotation.y - parent.rotation.y),
      z: normalizeAngle(world.rotation.z - parent.rotation.z),
    }),
    scale: divideVec(world.scale, parent.scale),
  });
}

export function validateStudioAttachmentGraph(graph: StudioAttachmentGraph): StudioAttachmentGraph {
  if (graph.version !== 1) throw new TypeError("unsupported attachment graph version.");
  if (!Number.isSafeInteger(graph.revision) || graph.revision < 0) throw new RangeError("attachment graph revision is invalid.");
  if (graph.nodes.length > 2_048) throw new RangeError("attachment graph exceeds its node budget.");
  const nodes = new Map<string, StudioAttachmentNode>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || !node.assetRevisionId.trim()) throw new TypeError("attachment identity is required.");
    if (nodes.has(node.id)) throw new TypeError(`duplicate attachment node: ${node.id}`);
    validateTransform(node.localTransform, node.id);
    for (const constraint of node.constraints) {
      if (!constraint.targetNodeId.trim() || !Number.isFinite(constraint.weight) || constraint.weight < 0 || constraint.weight > 1) {
        throw new TypeError(`invalid attachment constraint on ${node.id}`);
      }
      if (constraint.type === "distance" && (!Number.isFinite(constraint.distance) || (constraint.distance ?? -1) < 0)) {
        throw new TypeError(`distance constraint on ${node.id} is invalid.`);
      }
    }
    nodes.set(node.id, node);
  }
  for (const node of graph.nodes) {
    if (node.parentNodeId && !nodes.has(node.parentNodeId)) throw new TypeError(`attachment parent is missing: ${node.parentNodeId}`);
    for (const constraint of node.constraints) {
      if (!nodes.has(constraint.targetNodeId)) throw new TypeError(`constraint target is missing: ${constraint.targetNodeId}`);
    }
  }
  for (const node of graph.nodes) {
    const seen = new Set<string>([node.id]);
    let parentId = node.parentNodeId;
    while (parentId) {
      if (seen.has(parentId)) throw new TypeError("attachment graph contains a parent cycle.");
      seen.add(parentId);
      parentId = nodes.get(parentId)?.parentNodeId;
    }
  }
  return graph;
}

export function resolveStudioAttachmentWorldTransforms(
  graph: StudioAttachmentGraph,
): ReadonlyMap<string, StudioTransform3d> {
  validateStudioAttachmentGraph(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const world = new Map<string, StudioTransform3d>();
  const resolve = (id: string): StudioTransform3d => {
    const cached = world.get(id);
    if (cached) return cached;
    const node = nodes.get(id);
    if (!node) throw new TypeError(`attachment node not found: ${id}`);
    const value = node.parentNodeId
      ? composeTransform(resolve(node.parentNodeId), node.localTransform)
      : node.localTransform;
    world.set(id, value);
    return value;
  };
  for (const node of graph.nodes) resolve(node.id);
  return world;
}

export function reparentStudioAttachment(
  graph: StudioAttachmentGraph,
  nodeId: string,
  parentNodeId: string | undefined,
  parentSocket?: string,
): StudioAttachmentGraph {
  validateStudioAttachmentGraph(graph);
  if (nodeId === parentNodeId) throw new TypeError("attachment cannot parent itself.");
  const world = resolveStudioAttachmentWorldTransforms(graph);
  const nodeWorld = world.get(nodeId);
  if (!nodeWorld) throw new TypeError("attachment node does not exist.");
  const parentWorld = parentNodeId ? world.get(parentNodeId) : IDENTITY_TRANSFORM;
  if (parentNodeId && !parentWorld) throw new TypeError("new attachment parent does not exist.");
  const nodes = graph.nodes.map((node) =>
    node.id === nodeId
      ? Object.freeze({
          ...node,
          ...(parentNodeId ? { parentNodeId } : { parentNodeId: undefined }),
          ...(parentSocket ? { parentSocket } : { parentSocket: undefined }),
          localTransform: localFromWorld(parentWorld ?? IDENTITY_TRANSFORM, nodeWorld),
        })
      : node,
  );
  const next = Object.freeze({ ...graph, revision: graph.revision + 1, nodes: Object.freeze(nodes) });
  validateStudioAttachmentGraph(next);
  return next;
}

function lerp(left: number, right: number, weight: number): number {
  return left + (right - left) * weight;
}

export function applyStudioAttachmentConstraints(graph: StudioAttachmentGraph): StudioAttachmentGraph {
  const world = resolveStudioAttachmentWorldTransforms(graph);
  const nodes = graph.nodes.map((node) => {
    if (node.locked || node.constraints.length === 0) return node;
    let currentWorld = world.get(node.id) ?? node.localTransform;
    for (const constraint of node.constraints) {
      const target = world.get(constraint.targetNodeId);
      if (!target || constraint.weight <= 0) continue;
      if (constraint.type === "copy-position") {
        currentWorld = { ...currentWorld, position: Object.freeze({
          x: lerp(currentWorld.position.x, target.position.x, constraint.weight),
          y: lerp(currentWorld.position.y, target.position.y, constraint.weight),
          z: lerp(currentWorld.position.z, target.position.z, constraint.weight),
        }) };
      } else if (constraint.type === "copy-rotation") {
        currentWorld = { ...currentWorld, rotation: Object.freeze({
          x: lerp(currentWorld.rotation.x, target.rotation.x, constraint.weight),
          y: lerp(currentWorld.rotation.y, target.rotation.y, constraint.weight),
          z: lerp(currentWorld.rotation.z, target.rotation.z, constraint.weight),
        }) };
      } else if (constraint.type === "look-at") {
        const dx = target.position.x - currentWorld.position.x;
        const dy = target.position.y - currentWorld.position.y;
        const dz = target.position.z - currentWorld.position.z;
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        const pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        currentWorld = { ...currentWorld, rotation: Object.freeze({
          x: lerp(currentWorld.rotation.x, pitch, constraint.weight),
          y: lerp(currentWorld.rotation.y, yaw, constraint.weight),
          z: currentWorld.rotation.z,
        }) };
      } else {
        const desired = constraint.distance ?? 0;
        const delta = subtractVec(currentWorld.position, target.position);
        const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
        const constrained = {
          x: target.position.x + (delta.x / length) * desired,
          y: target.position.y + (delta.y / length) * desired,
          z: target.position.z + (delta.z / length) * desired,
        };
        currentWorld = { ...currentWorld, position: Object.freeze({
          x: lerp(currentWorld.position.x, constrained.x, constraint.weight),
          y: lerp(currentWorld.position.y, constrained.y, constraint.weight),
          z: lerp(currentWorld.position.z, constrained.z, constraint.weight),
        }) };
      }
    }
    const parentWorld = node.parentNodeId ? world.get(node.parentNodeId) : IDENTITY_TRANSFORM;
    return Object.freeze({
      ...node,
      localTransform: localFromWorld(parentWorld ?? IDENTITY_TRANSFORM, currentWorld),
    });
  });
  const next = Object.freeze({ ...graph, revision: graph.revision + 1, nodes: Object.freeze(nodes) });
  validateStudioAttachmentGraph(next);
  return next;
}

export interface StudioAttachmentTransaction {
  readonly id: string;
  readonly before: StudioAttachmentGraph;
  readonly after: StudioAttachmentGraph;
  readonly beforeHash: string;
  readonly afterHash: string;
}

export function createStudioAttachmentTransaction(
  id: string,
  before: StudioAttachmentGraph,
  after: StudioAttachmentGraph,
): StudioAttachmentTransaction {
  validateStudioAttachmentGraph(before);
  validateStudioAttachmentGraph(after);
  if (!id.trim()) throw new TypeError("attachment transaction id is required.");
  return Object.freeze({
    id: id.trim(),
    before,
    after,
    beforeHash: studioDeterministicContentId(before),
    afterHash: studioDeterministicContentId(after),
  });
}
