import { Mesh, Raycaster, Triangle, Vector2, Vector3 } from "three";

import {
  characterSurfaceObjectPath,
  characterSurfaceSourceMap,
  characterSurfaceTopologyRevision,
  characterSurfaceTriangle,
} from "./character-surface-ink-three-mesh";

import type { CharacterSurfaceInkAnchor } from "./character-surface-ink";
import type { Camera, Intersection, Object3D, Scene } from "three";

export function characterSurfacePointerIntersection(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: Camera,
): Intersection<Object3D> | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const pointer = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const targets: Object3D[] = [];
  scene.traverse((object) => {
    if (
      object instanceof Mesh &&
      object.visible &&
      object.userData.toonstudioSurfaceInk !== true
    ) {
      targets.push(object);
    }
  });
  return (
    raycaster
      .intersectObjects(targets, false)
      .find((hit) => hit.faceIndex != null) ?? null
  );
}

export function characterSurfaceAnchorFromIntersection(
  hit: Intersection<Object3D>,
  modelKey: string,
  pressure: number,
): CharacterSurfaceInkAnchor | null {
  if (!(hit.object instanceof Mesh) || hit.faceIndex == null) return null;
  const mesh = hit.object;
  const faceIndex = hit.faceIndex;
  const surface = characterSurfaceTriangle(mesh, faceIndex);
  if (!surface) return null;
  const local = mesh.worldToLocal(hit.point.clone());
  const barycentric = new Triangle(
    new Vector3(...surface.positions[0]),
    new Vector3(...surface.positions[1]),
    new Vector3(...surface.positions[2]),
  ).getBarycoord(local, new Vector3());
  if (!barycentric) return null;
  const normal = hit.face?.normal ?? new Vector3(0, 0, 1);
  const anchor: CharacterSurfaceInkAnchor = {
    meshAssetId: characterSurfaceObjectPath(mesh),
    topologyRevision: characterSurfaceTopologyRevision(modelKey, mesh),
    primitiveIndex: 0,
    triangleIndex: faceIndex,
    barycentric: [barycentric.x, barycentric.y, barycentric.z],
    localNormal: [normal.x, normal.y, normal.z],
    localTangent: [1, 0, 0],
    skinIndices: [0, 0, 0, 0],
    skinWeights: [1, 0, 0, 0],
    pressure:
      Number.isFinite(pressure) && pressure > 0
        ? Math.min(1, pressure)
        : 0.5,
    width: 1,
  };
  return Object.freeze(anchor);
}

export function characterSurfaceAnchorPosition(
  anchor: CharacterSurfaceInkAnchor,
  scene: Scene,
): Vector3 | null {
  const source = characterSurfaceSourceMap(scene).get(anchor.meshAssetId);
  if (!source) return null;
  const surface = characterSurfaceTriangle(source, anchor.triangleIndex);
  if (!surface) return null;
  return new Vector3()
    .addScaledVector(
      new Vector3(...surface.positions[0]),
      anchor.barycentric[0],
    )
    .addScaledVector(
      new Vector3(...surface.positions[1]),
      anchor.barycentric[1],
    )
    .addScaledVector(
      new Vector3(...surface.positions[2]),
      anchor.barycentric[2],
    );
}
