import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SkinnedMesh,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from "three";

import { createSha256Portable } from "../../studio-sha256";

import { buildCharacterSurfaceInkRibbon } from "./character-surface-ink";

import type {
  CharacterInkVector3,
  CharacterInkVector4,
  CharacterSurfaceInkDocument,
  CharacterSurfaceInkStroke,
  CharacterTriangleSurface,
} from "./character-surface-ink";
import type { BufferAttribute, InterleavedBufferAttribute, Object3D, Scene } from "three";

export const CHARACTER_SURFACE_INK_GROUP_NAME = "__toonstudio_character_surface_ink__";

export function characterSurfaceObjectPath(object: Object3D): string {
  const parts: string[] = [];
  let current: Object3D | null = object;
  while (current) {
    if (current.name) parts.push(current.name);
    current = current.parent;
  }
  return parts.reverse().join("/") || object.uuid;
}

type SurfaceAttribute = BufferAttribute | InterleavedBufferAttribute;
const geometryDigests = new WeakMap<BufferGeometry, {
  position: SurfaceAttribute | undefined;
  index: BufferAttribute | null;
  positionVersion: number;
  indexVersion: number;
  digest: string;
}>();

function attributeVersion(attribute: SurfaceAttribute | null | undefined): number {
  if (!attribute) return -1;
  return "data" in attribute ? attribute.data.version : attribute.version;
}

/** Bind geometry only: ordinary skeleton poses and scene transforms do not change anchors. */
function geometryDigest(geometry: BufferGeometry): string {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const positionVersion = attributeVersion(position);
  const indexVersion = attributeVersion(index);
  const cached = geometryDigests.get(geometry);
  if (cached && cached.position === position && cached.index === index
    && cached.positionVersion === positionVersion && cached.indexVersion === indexVersion) {
    return cached.digest;
  }
  const hash = createSha256Portable();
  hash.update(new TextEncoder().encode(JSON.stringify(["geometry-v2", position?.count ?? 0, index !== null, index?.count ?? 0])));
  const bytes = new Uint8Array(8192);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const write = (value: number) => {
    view.setFloat64(offset, value, true);
    offset += 8;
    if (offset === bytes.length) { hash.update(bytes); offset = 0; }
  };
  for (let vertex = 0; vertex < (position?.count ?? 0); vertex += 1) {
    write(position.getX(vertex)); write(position.getY(vertex)); write(position.getZ(vertex));
  }
  for (let vertex = 0; vertex < (index?.count ?? 0); vertex += 1) write(index!.getX(vertex));
  if (offset) hash.update(bytes.subarray(0, offset));
  const digest = hash.finalizeHex();
  // Three's standard mutation contract increments the attribute (or interleaved buffer) version
  // through needsUpdate. Replaced geometry/attributes also invalidate without object UUIDs.
  geometryDigests.set(geometry, { position, index, positionVersion, indexVersion, digest });
  return digest;
}

export function characterSurfaceTopologyRevision(modelKey: string, mesh: Mesh): string {
  return [modelKey, characterSurfaceObjectPath(mesh), "geometry-v2", geometryDigest(mesh.geometry)].join(":");
}

function tuple4(
  attribute: BufferAttribute | InterleavedBufferAttribute | undefined,
  index: number,
  fallback: CharacterInkVector4,
): CharacterInkVector4 {
  return attribute ? [attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.getW(index)] : fallback;
}

function vertexIndex(mesh: Mesh, faceIndex: number, corner: number): number {
  const offset = faceIndex * 3 + corner;
  return mesh.geometry.index ? mesh.geometry.index.getX(offset) : offset;
}

export function characterSurfaceTriangle(mesh: Mesh, faceIndex: number): CharacterTriangleSurface | null {
  const position = mesh.geometry.attributes.position;
  if (!position) return null;
  const normal = mesh.geometry.attributes.normal;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  const positions: CharacterInkVector3[] = [];
  const normals: CharacterInkVector3[] = [];
  const skinIndices: CharacterInkVector4[] = [];
  const skinWeights: CharacterInkVector4[] = [];
  for (let corner = 0; corner < 3; corner += 1) {
    const index = vertexIndex(mesh, faceIndex, corner);
    positions.push([position.getX(index), position.getY(index), position.getZ(index)]);
    normals.push(normal ? [normal.getX(index), normal.getY(index), normal.getZ(index)] : [0, 0, 1]);
    skinIndices.push(tuple4(skinIndex, index, [0, 0, 0, 0]));
    skinWeights.push(tuple4(skinWeight, index, [1, 0, 0, 0]));
  }
  if (!normal) {
    const a = new Vector3(...positions[0]);
    const b = new Vector3(...positions[1]);
    const c = new Vector3(...positions[2]);
    const computed = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    normals[0] = normals[1] = normals[2] = [computed.x, computed.y, computed.z];
  }
  return {
    positions: positions as unknown as CharacterTriangleSurface["positions"],
    normals: normals as unknown as CharacterTriangleSurface["normals"],
    skinIndices: skinIndices as unknown as CharacterTriangleSurface["skinIndices"],
    skinWeights: skinWeights as unknown as CharacterTriangleSurface["skinWeights"],
  };
}

export function characterSurfaceSourceMap(scene: Scene): Map<string, Mesh> {
  const values = new Map<string, Mesh>();
  scene.traverse((object) => {
    if (object instanceof Mesh && object.userData.toonstudioSurfaceInk !== true) values.set(characterSurfaceObjectPath(object), object);
  });
  return values;
}

/** Call only after the current model has attached to its ready capture scene. */
export function reconcileCharacterSurfaceInkTopology(
  document: CharacterSurfaceInkDocument,
  modelKey: string,
  scene: Scene,
): CharacterSurfaceInkDocument {
  if (document.layers.every((layer) => layer.strokes.length === 0)) return document;
  const sources = characterSurfaceSourceMap(scene);
  let changed = false;
  const layers = document.layers.map((layer) => {
    let layerChanged = false;
    const strokes = layer.strokes.map((stroke) => {
      const source = sources.get(stroke.meshAssetId);
      const status = source && characterSurfaceTopologyRevision(modelKey, source) === stroke.topologyRevision
        ? "valid" : "needs-reprojection";
      if (status === stroke.status) return stroke;
      changed = layerChanged = true;
      return Object.freeze({ ...stroke, status });
    });
    return layerChanged ? Object.freeze({ ...layer, strokes: Object.freeze(strokes) }) : layer;
  });
  return changed ? Object.freeze({ ...document, layers: Object.freeze(layers) }) : document;
}

export function disposeCharacterSurfaceInkGroup(group: Group): void {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  group.removeFromParent();
}

function materialFor(stroke: CharacterSurfaceInkStroke): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: stroke.style.color,
    transparent: stroke.style.opacity < 1,
    opacity: stroke.style.opacity,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export function rebuildCharacterSurfaceInkGroup(scene: Scene, document: CharacterSurfaceInkDocument): Group {
  const previous = scene.getObjectByName(CHARACTER_SURFACE_INK_GROUP_NAME);
  if (previous instanceof Group) disposeCharacterSurfaceInkGroup(previous);
  const group = new Group();
  group.name = CHARACTER_SURFACE_INK_GROUP_NAME;
  group.userData.toonstudioSurfaceInk = true;
  const sources = characterSurfaceSourceMap(scene);
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    for (const stroke of layer.strokes) {
      if (stroke.status !== "valid") continue;
      const source = sources.get(stroke.meshAssetId);
      if (!source) continue;
      const triangles = new Map<number, CharacterTriangleSurface>();
      for (const anchor of stroke.anchors) {
        const triangle = characterSurfaceTriangle(source, anchor.triangleIndex);
        if (triangle) triangles.set(anchor.triangleIndex, triangle);
      }
      try {
        const ribbon = buildCharacterSurfaceInkRibbon(stroke, triangles);
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(ribbon.positions, 3));
        geometry.setAttribute("normal", new Float32BufferAttribute(ribbon.normals, 3));
        geometry.setAttribute("uv", new Float32BufferAttribute(ribbon.uvs, 2));
        geometry.setAttribute("skinIndex", new Uint16BufferAttribute(ribbon.skinIndices, 4));
        geometry.setAttribute("skinWeight", new Float32BufferAttribute(ribbon.skinWeights, 4));
        geometry.setIndex(new Uint32BufferAttribute(ribbon.indices, 1));
        geometry.computeBoundingSphere();
        const ink = source instanceof SkinnedMesh ? new SkinnedMesh(geometry, materialFor(stroke)) : new Mesh(geometry, materialFor(stroke));
        if (source instanceof SkinnedMesh && ink instanceof SkinnedMesh) {
          ink.bindMode = source.bindMode;
          ink.bind(source.skeleton, source.bindMatrix.clone());
          ink.bindMatrixInverse.copy(source.bindMatrixInverse);
        }
        ink.name = `surface-ink:${stroke.strokeId}`;
        ink.userData.toonstudioSurfaceInk = true;
        ink.renderOrder = 10_000;
        ink.frustumCulled = false;
        ink.matrixAutoUpdate = false;
        // Keep one disposable group owner, but refresh each ribbon from its source on every
        // scene transform update. A one-time world matrix copy detaches ink after pose edits.
        const updateMatrixWorld = ink.updateMatrixWorld.bind(ink);
        ink.updateMatrixWorld = (force) => {
          source.updateWorldMatrix(true, false);
          ink.matrix.copy(group.matrixWorld).invert().multiply(source.matrixWorld);
          updateMatrixWorld(force);
        };
        group.add(ink);
      } catch {
        // Corrupt/orphaned data remains recoverable but is omitted from rendering.
      }
    }
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  return group;
}
