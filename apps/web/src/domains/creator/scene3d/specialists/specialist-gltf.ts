import { preflightSpecialistGlb } from "./specialist-glb-preflight";
import { WebIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { sha256HexPortable } from "../../studio-sha256";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import type { Document } from "@gltf-transform/core";
import type {
  SpecialistArtifact,
  SpecialistStats,
} from "./specialist-contract";

export { preflightSpecialistGlb } from "./specialist-glb-preflight";

export function sha256(bytes: Uint8Array): string {
  return "sha256:" + sha256HexPortable(bytes);
}
export async function createSpecialistIo(): Promise<WebIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  // Keep the encoder compatible with the pinned Three/BG3D decoder; do not emit v1 by accident.
  const encoder = {
    ...MeshoptEncoder,
    encodeGltfBuffer: (
      bytes: Uint8Array,
      count: number,
      stride: number,
      mode: string,
    ) => MeshoptEncoder.encodeGltfBuffer(bytes, count, stride, mode, 0),
  };
  return new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": encoder,
    })
    .setStrictResources(true)
    .setLogger(new Logger(Logger.Verbosity.ERROR));
}
export async function readSpecialistDocument(
  io: WebIO,
  bytes: Uint8Array,
): Promise<Document> {
  preflightSpecialistGlb(bytes);
  const document = await io.readBinary(bytes);
  for (const accessor of document.getRoot().listAccessors()) {
    const array = accessor.getArray();
    if (
      array instanceof Float32Array &&
      array.some((value) => !Number.isFinite(value))
    ) {
      throw new SpecialistError(
        "invalid-input",
        "Non-finite accessor values cannot be processed.",
      );
    }
  }
  return document;
}
export function specialistStats(document: Document): SpecialistStats {
  const root = document.getRoot();
  let triangles = 0;
  let vertices = 0;
  let tangentPrimitives = 0;
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getAttribute("POSITION")?.getCount() ?? 0;
      vertices += count;
      if (primitive.getMode() === 4)
        triangles += Math.floor(
          (primitive.getIndices()?.getCount() ?? count) / 3,
        );
      if (primitive.getAttribute("TANGENT")) tangentPrimitives++;
    }
  if (
    vertices > SPECIALIST_LIMITS.vertices ||
    triangles > SPECIALIST_LIMITS.triangles
  )
    throw new SpecialistError("budget", "Geometry budget exceeded.");
  return {
    triangles,
    vertices,
    nodes: root.listNodes().length,
    animations: root.listAnimations().length,
    animationKeys: root
      .listAnimations()
      .reduce(
        (sum, animation) =>
          sum +
          animation
            .listSamplers()
            .reduce(
              (n, sampler) => n + (sampler.getInput()?.getCount() ?? 0),
              0,
            ),
        0,
      ),
    tangentPrimitives,
  };
}
export function requireStatic(document: Document): void {
  const root = document.getRoot();
  if (
    root.listSkins().length ||
    root.listAnimations().length ||
    root
      .listMeshes()
      .some((mesh) => mesh.listPrimitives().some((p) => p.listTargets().length))
  ) {
    throw new SpecialistError(
      "unsupported",
      "Static meshes only: skin, morph and animation must remain in their dedicated authoring path.",
    );
  }
}
export async function glbArtifact(
  io: WebIO,
  document: Document,
  name: string,
): Promise<SpecialistArtifact> {
  const stats = specialistStats(document);
  const bytes = new Uint8Array(await io.writeBinary(document));
  if (bytes.length > SPECIALIST_LIMITS.outputBytes)
    throw new SpecialistError("budget", "Output budget exceeded.");
  // Do not report success until a real encode/decode round trip works.
  preflightSpecialistGlb(bytes);
  specialistStats(await io.readBinary(bytes));
  return {
    name,
    mime: "model/gltf-binary",
    bytes,
    sha256: sha256(bytes),
    stats,
  };
}
