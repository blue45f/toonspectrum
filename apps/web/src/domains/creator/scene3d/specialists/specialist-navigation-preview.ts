import { CylinderGeometry, Quaternion, Vector3 } from "three";
import type { Document } from "@gltf-transform/core";
import { SpecialistError } from "./specialist-contract";
import type { buildNavigationRoute } from "./specialist-navigation-path";

/** Separate display artifact; exact JSON and navmesh binary are unchanged. */
export function addNavigationRoutePreview(
  document: Document, route: ReturnType<typeof buildNavigationRoute>, cellSize: number,
): void {
  const scene = document.getRoot().listScenes()[0];
  const buffer = document.getRoot().listBuffers()[0];
  if (!scene || !buffer) throw new SpecialistError("runtime", "Missing navigation preview scene.");
  const material = document.createMaterial("Walkable surface").setBaseColorFactor([0.24, 0.3, 0.38, 1]).setRoughnessFactor(1).setDoubleSided(true);
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) primitive.setMaterial(material);
  const radius = Math.min(0.1, Math.max(0.025, cellSize / 5));
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    const start = new Vector3(a.x, a.y + radius * 2, a.z);
    const end = new Vector3(b.x, b.y + radius * 2, b.z);
    const direction = end.clone().sub(start);
    const geometry = new CylinderGeometry(radius, radius, direction.length(), 6, 1);
    try {
      geometry.applyQuaternion(new Quaternion().setFromUnitVectors(up, direction.normalize()));
      const middle = start.add(end).multiplyScalar(0.5);
      geometry.translate(middle.x, middle.y, middle.z);
      const offset = positions.length / 3;
      const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
      for (let j = 0; j < position.count; j++) {
        positions.push(position.getX(j), position.getY(j), position.getZ(j));
        normals.push(normal.getX(j), normal.getY(j), normal.getZ(j));
      }
      for (let j = 0; j < geometry.index!.count; j++) indices.push(offset + geometry.index!.getX(j));
    } finally { geometry.dispose(); }
  }
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", document.createAccessor().setBuffer(buffer).setType("VEC3").setArray(new Float32Array(positions)))
    .setAttribute("NORMAL", document.createAccessor().setBuffer(buffer).setType("VEC3").setArray(new Float32Array(normals)))
    .setIndices(document.createAccessor().setBuffer(buffer).setType("SCALAR").setArray(new Uint32Array(indices)))
    .setMaterial(document.createMaterial("Route highlight").setBaseColorFactor([1, 0.35, 0.06, 1]).setEmissiveFactor([0.3, 0.05, 0.01]).setRoughnessFactor(1));
  scene.addChild(document.createNode("Ordered route (display offset only)").setMesh(document.createMesh("Route").addPrimitive(primitive)));
  const marker = new CylinderGeometry(radius * 3, radius * 3, radius * 2, 8);
  try {
    const markerPrimitive = document.createPrimitive()
      .setAttribute("POSITION", document.createAccessor().setBuffer(buffer).setType("VEC3").setArray(new Float32Array(marker.getAttribute("position").array)))
      .setAttribute("NORMAL", document.createAccessor().setBuffer(buffer).setType("VEC3").setArray(new Float32Array(marker.getAttribute("normal").array)))
      .setIndices(document.createAccessor().setBuffer(buffer).setType("SCALAR").setArray(new Uint32Array(marker.index!.array)))
      .setMaterial(document.createMaterial("Stops").setBaseColorFactor([1, 0.8, 0.08, 1]).setRoughnessFactor(1));
    const mesh = document.createMesh("Stop marker").addPrimitive(markerPrimitive);
    route.stops.forEach(({ projected }, index) => scene.addChild(document.createNode(`Stop ${index + 1}`)
      .setMesh(mesh).setTranslation([projected.x, projected.y + radius * 2, projected.z])));
  } finally { marker.dispose(); }
}
