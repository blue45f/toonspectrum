import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from "three";
import { Document } from "@gltf-transform/core";
import { dequantize } from "@gltf-transform/functions";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { requireStatic } from "./specialist-gltf";

/** World-space static geometry only. No cameras, documents or GPU objects escape the worker. */
export async function extractStaticGeometry(
  document: Document,
  single = false,
): Promise<BufferGeometry[]> {
  requireStatic(document);
  if (
    document
      .getRoot()
      .listExtensionsUsed()
      .some(
        (extension) => extension.extensionName === "EXT_mesh_gpu_instancing",
      )
  ) {
    throw new SpecialistError(
      "unsupported",
      "Instanced meshes must be expanded before geometry-only processing.",
    );
  }
  await document.transform(dequantize());
  const scene =
    document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new SpecialistError("unsupported", "No default scene.");
  const geometries: BufferGeometry[] = [];
  let total = 0;
  try {
    scene.traverse((node) => {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        if (primitive.getMode() !== 4)
          throw new SpecialistError("unsupported", "Triangle primitives only.");
        const attribute = primitive.getAttribute("POSITION");
        if (!attribute || attribute.getType() !== "VEC3")
          throw new SpecialistError("invalid-input", "Missing VEC3 positions.");
        const positions = new Float32Array(attribute.getCount() * 3);
        for (let i = 0; i < attribute.getCount(); i++)
          positions.set(attribute.getElement(i, []), i * 3);
        const rawIndices = primitive.getIndices()?.getArray();
        const indices = rawIndices
          ? Uint32Array.from(rawIndices)
          : Uint32Array.from({ length: attribute.getCount() }, (_, i) => i);
        total += indices.length / 3;
        if (
          indices.length % 3 ||
          total > SPECIALIST_LIMITS.triangles ||
          indices.some((index) => index >= attribute.getCount())
        )
          throw new SpecialistError(
            "budget",
            "Invalid triangle indices or geometry budget.",
          );
        const matrix = new Matrix4().fromArray(node.getWorldMatrix());
        if (
          !matrix.elements.every(Number.isFinite) ||
          Math.abs(matrix.determinant()) < 1e-10
        )
          throw new SpecialistError(
            "unsupported",
            "Singular/non-finite world transform.",
          );
        if (matrix.determinant() < 0)
          for (let i = 0; i < indices.length; i += 3)
            [indices[i + 1], indices[i + 2]] = [
              indices[i + 2]!,
              indices[i + 1]!,
            ];
        const geometry = new BufferGeometry();
        geometries.push(geometry);
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setIndex(new BufferAttribute(indices, 1));
        geometry.applyMatrix4(matrix);
        if (
          positions.some(
            (value) => !Number.isFinite(value) || Math.abs(value) > 10000,
          )
        )
          throw new SpecialistError(
            "budget",
            "World coordinates exceed the geometry budget.",
          );
        geometry.computeVertexNormals();
      }
    });
    if (!geometries.length || (single && geometries.length !== 1))
      throw new SpecialistError(
        "unsupported",
        "This operation requires exactly one mesh primitive per source GLB.",
      );
    return geometries;
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    throw error;
  }
}
export function geometryDocument(
  geometry: BufferGeometry,
  name: string,
): Document {
  const document = new Document();
  const buffer = document.createBuffer();
  const count =
    geometry.index?.count ?? geometry.getAttribute("position").count;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(count, start + geometry.drawRange.count);
  if (start % 3 || (end - start) % 3 || end <= start)
    throw new SpecialistError("runtime", "Empty or invalid geometry result.");
  const position = geometry.getAttribute("position");
  const positions = new Float32Array(position.count * 3);
  const vector = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vector.fromBufferAttribute(position, i);
    positions.set(vector.toArray(), i * 3);
  }
  const indices = Uint32Array.from(
    { length: end - start },
    (_, i) => geometry.index?.getX(start + i) ?? start + i,
  );
  const primitive = document
    .createPrimitive()
    .setAttribute(
      "POSITION",
      document
        .createAccessor()
        .setBuffer(buffer)
        .setType("VEC3")
        .setArray(positions),
    )
    .setIndices(
      document
        .createAccessor()
        .setBuffer(buffer)
        .setType("SCALAR")
        .setArray(indices),
    );
  if (geometry.getAttribute("normal")) {
    const normal = geometry.getAttribute("normal");
    const normals = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      vector.fromBufferAttribute(normal, i);
      normals.set(vector.toArray(), i * 3);
    }
    primitive.setAttribute(
      "NORMAL",
      document
        .createAccessor()
        .setBuffer(buffer)
        .setType("VEC3")
        .setArray(normals),
    );
  }
  const mesh = document.createMesh(name).addPrimitive(primitive);
  document.createScene().addChild(document.createNode(name).setMesh(mesh));
  return document;
}
