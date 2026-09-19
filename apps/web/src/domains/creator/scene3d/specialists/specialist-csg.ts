import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  Brush,
  Evaluator,
  ADDITION,
  SUBTRACTION,
  INTERSECTION,
} from "three-bvh-csg";
import { createStudioManifoldMeshProvider } from "../../studio-manifold-mesh-provider";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { extractStaticGeometry, geometryDocument } from "./specialist-geometry";
import { glbArtifact, readSpecialistDocument, sha256 } from "./specialist-gltf";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";
import type { WebIO } from "@gltf-transform/core";

export async function processBoolean(
  io: WebIO,
  source: Uint8Array,
  secondary: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "csg" }>,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const documents = await Promise.all([
    readSpecialistDocument(io, source),
    readSpecialistDocument(io, secondary),
  ]);
  if (documents.some((document) => document.getRoot().listTextures().length))
    throw new SpecialistError(
      "unsupported",
      "Geometry-only Boolean export does not preserve textured materials.",
    );
  const geometries: BufferGeometry[] = [];
  const brushes: Brush[] = [];
  const material = new MeshStandardMaterial();
  try {
    for (const document of documents)
      geometries.push(...(await extractStaticGeometry(document, true)));
    if (
      geometries.reduce(
        (sum, geometry) => sum + (geometry.index?.count ?? 0) / 3,
        0,
      ) > SPECIALIST_LIMITS.csgTriangles
    )
      throw new SpecialistError("budget", "Boolean triangle budget exceeded.");
    let output: BufferGeometry;
    if (options.backend === "solid") {
      const provider = createStudioManifoldMeshProvider();
      try {
        const inputs = geometries.map((geometry) => {
          const clone = geometry.clone();
          clone.deleteAttribute("normal");
          const welded = mergeVertices(clone, 1e-6);
          clone.dispose();
          geometries.push(welded);
          return {
            positions: new Float32Array(welded.getAttribute("position").array),
            triangleIndices: new Uint32Array(welded.index!.array),
          };
        });
        const receipt = await provider.boolean({
          left: inputs[0]!,
          right: inputs[1]!,
          epoch: 0,
          operation:
            options.operation === "union"
              ? "union"
              : options.operation === "subtract"
                ? "difference"
                : "intersection",
        });
        if (receipt.output.topology.empty)
          throw new SpecialistError("runtime", "Boolean result is empty.");
        output = new BufferGeometry()
          .setAttribute(
            "position",
            new BufferAttribute(receipt.output.mesh.positions, 3),
          )
          .setIndex(
            new BufferAttribute(receipt.output.mesh.triangleIndices, 1),
          );
        output.computeVertexNormals();
      } finally {
        await provider.destroy();
      }
    } else {
      const [left, right] = geometries.map((geometry) => {
        const brush = new Brush(geometry, material);
        brush.updateMatrixWorld(true);
        brushes.push(brush);
        return brush;
      });
      const evaluator = new Evaluator();
      evaluator.attributes = ["position", "normal"];
      evaluator.useGroups = false;
      const result = evaluator.evaluate(
        left!,
        right!,
        options.operation === "union"
          ? ADDITION
          : options.operation === "subtract"
            ? SUBTRACTION
            : INTERSECTION,
      );
      brushes.push(result);
      output = result.geometry;
    }
    geometries.push(output);
    const artifact = await glbArtifact(
      io,
      geometryDocument(output, "Boolean derivative"),
      `boolean-${options.backend}.glb`,
    );
    const warnings = [
      "Geometry-only derivative: source transforms are baked; source documents, materials, undo and scene state are unchanged.",
      "Secondary source SHA-256: " + sha256(secondary),
    ];
    if (options.backend === "preview")
      warnings.push(
        "BVH CSG is a preview, not a watertight solid guarantee. Select Manifold for validated solid output.",
      );
    return { artifacts: [artifact], warnings };
  } finally {
    for (const brush of brushes) brush.disposeCacheData();
    for (const geometry of new Set(geometries)) geometry.dispose();
    material.dispose();
  }
}
