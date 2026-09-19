import {
  MeshoptEncoder,
  MeshoptSimplifier,
  MeshoptTangents,
} from "meshoptimizer";
import {
  dedup,
  meshopt,
  resample,
  simplify,
  tangents,
  unweld,
  weld,
} from "@gltf-transform/functions";
import { SpecialistError } from "./specialist-contract";
import {
  glbArtifact,
  readSpecialistDocument,
  requireStatic,
  specialistStats,
} from "./specialist-gltf";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";
import type { WebIO } from "@gltf-transform/core";

export async function processAssetDerivatives(
  io: WebIO,
  source: Uint8Array,
  options: SpecialistOptions,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const artifacts: SpecialistArtifact[] = [];
  const warnings: string[] = [];
  await Promise.all([
    MeshoptEncoder.ready,
    MeshoptSimplifier.ready,
    MeshoptTangents.ready,
  ]);
  const ratios = options.kind === "lod" ? [1, 0.5, 0.2] : [1];
  for (const [index, ratio] of ratios.entries()) {
    // Each derivative starts from the original, never from an already-decimated LOD.
    const document = await readSpecialistDocument(io, source);
    if (options.kind === "lod") {
      requireStatic(document);
      if (ratio < 1)
        await document.transform(
          weld(),
          simplify({
            simplifier: MeshoptSimplifier,
            ratio,
            error: options.error,
            lockBorder: true,
          }),
        );
    }
    if (options.kind === "tangents") {
      let eligible = 0;
      for (const mesh of document.getRoot().listMeshes())
        for (const primitive of mesh.listPrimitives()) {
          if (
            primitive.getMode() === 4 &&
            primitive.getAttribute("NORMAL") &&
            primitive.getAttribute("TEXCOORD_0")
          )
            eligible++;
        }
      if (!eligible)
        throw new SpecialistError(
          "unsupported",
          "Tangent generation requires triangle meshes with normals and UV0.",
        );
      await document.transform(
        unweld(),
        tangents({
          overwrite: true,
          generateTangents: (positions, normals, uvs) =>
            MeshoptTangents.generateTangents(
              null,
              positions,
              3,
              normals,
              3,
              uvs,
              2,
              ["Compatible"],
            ),
        }),
      );
      if (specialistStats(document).tangentPrimitives === 0)
        throw new SpecialistError(
          "runtime",
          "No tangent attributes were generated.",
        );
    }
    if (options.kind === "animation") {
      if (!document.getRoot().listAnimations().length)
        throw new SpecialistError(
          "unsupported",
          "This file has no animation clips.",
        );
      await document.transform(resample({ tolerance: 0.0001 }));
    }
    await document.transform(
      dedup({ keepUniqueNames: true }),
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    artifacts.push(
      await glbArtifact(
        io,
        document,
        options.kind === "lod" ? `lod-${index}.glb` : `${options.kind}.glb`,
      ),
    );
  }
  if (options.kind === "lod") {
    warnings.push(
      "Ratios are targets, not guaranteed reductions; border protection and error tolerance may retain triangles. Inspect each derivative before catalog admission.",
    );
  }
  warnings.push(
    "Source files are unchanged. Textures are preserved, not converted to KTX2; these derivatives do not automatically receive production asset approval.",
  );
  return { artifacts, warnings };
}
