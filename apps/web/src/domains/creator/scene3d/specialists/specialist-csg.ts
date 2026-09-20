import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from "three-bvh-csg";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { extractStaticGeometry, geometryDocument } from "./specialist-geometry";
import { glbArtifact, readSpecialistDocument, sha256 } from "./specialist-gltf";
import { evaluateCompoundSolid } from "./specialist-solid-compound";
import type { SpecialistArtifact, SpecialistOptions } from "./specialist-contract";
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
  if (documents.some((document) => document.getRoot().listTextures().length)) {
    throw new SpecialistError("unsupported", "Geometry-only Boolean export does not preserve textured materials.");
  }
  const warnings = [
    "Geometry-only derivative: source transforms are baked; source documents, materials, undo and scene state are unchanged.",
    "Secondary source SHA-256: " + sha256(secondary),
  ];
  if (options.backend === "solid") {
    const result = await evaluateCompoundSolid(documents[0]!, documents[1]!, options.operation);
    const geometry = new BufferGeometry()
      .setAttribute("position", new BufferAttribute(result.mesh.positions, 3))
      .setIndex(new BufferAttribute(result.mesh.triangleIndices, 1));
    try {
      geometry.computeVertexNormals();
      const artifact = await glbArtifact(io, geometryDocument(geometry, "Boolean derivative"), "boolean-solid.glb");
      const report = new TextEncoder().encode(JSON.stringify({
        ...result.report,
        sourceSha256: sha256(source),
        secondarySha256: sha256(secondary),
        artifactSha256: artifact.sha256,
        operation: options.operation,
      }, null, 2));
      return {
        artifacts: [artifact, {
          name: "boolean-report.json", mime: "application/json", bytes: report, sha256: sha256(report),
        }],
        warnings: [...warnings,
          "Manifold combines mesh nodes by union before the requested Boolean. Primitives within each node must collectively form a closed oriented solid; textures, source materials and editable scene application are not preserved by this geometry-only export.",
        ],
      };
    } finally {
      geometry.dispose();
    }
  }
  const geometries: BufferGeometry[] = [];
  const brushes: Brush[] = [];
  const material = new MeshStandardMaterial();
  try {
    for (const document of documents) geometries.push(...await extractStaticGeometry(document, true));
    if (geometries.reduce((sum, geometry) => sum + geometry.index!.count / 3, 0) > SPECIALIST_LIMITS.csgTriangles) {
      throw new SpecialistError("budget", "Boolean triangle budget exceeded.");
    }
    const [left, right] = geometries.map((geometry) => {
      const brush = new Brush(geometry, material);
      brush.updateMatrixWorld(true);
      brushes.push(brush);
      return brush;
    });
    const evaluator = new Evaluator();
    evaluator.attributes = ["position", "normal"];
    evaluator.useGroups = false;
    const result = evaluator.evaluate(left!, right!, options.operation === "union"
      ? ADDITION : options.operation === "subtract" ? SUBTRACTION : INTERSECTION);
    brushes.push(result);
    geometries.push(result.geometry);
    const artifact = await glbArtifact(io, geometryDocument(result.geometry, "Boolean derivative"), "boolean-preview.glb");
    return {
      artifacts: [artifact],
      warnings: [...warnings, "BVH CSG is a preview, not a watertight solid guarantee. Select Manifold for validated solid output."],
    };
  } finally {
    for (const brush of brushes) brush.disposeCacheData();
    for (const geometry of new Set(geometries)) geometry.dispose();
    material.dispose();
  }
}
