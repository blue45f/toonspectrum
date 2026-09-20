import { BufferAttribute, BufferGeometry } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  createStudioManifoldMeshProvider,
  STUDIO_MANIFOLD_MESH_BUDGETS,
} from "../../studio-manifold-mesh-provider";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { extractStaticGeometryGroups } from "./specialist-geometry";
import type { Document } from "@gltf-transform/core";
import type {
  StudioManifoldMeshProvider,
  StudioManifoldMeshReceipt,
  StudioManifoldTriangleMeshInput,
} from "../../studio-manifold-mesh-provider";
import type { StaticGeometryGroup } from "./specialist-geometry";

export const COMPOUND_SOLID_LIMITS = Object.freeze({
  meshNodesPerSource: 32,
  workUnits: STUDIO_MANIFOLD_MESH_BUDGETS.maxWorkUnits,
  weldTolerance: 1e-6,
});

/** Merge material-split primitives of ONE mesh node, not different overlapping solids. */
function weldMeshNode(group: StaticGeometryGroup): StudioManifoldTriangleMeshInput {
  const vertices = group.geometries.reduce((n, g) => n + g.getAttribute("position").count, 0);
  const indexCount = group.geometries.reduce((n, g) => n + g.index!.count, 0);
  if (vertices > STUDIO_MANIFOLD_MESH_BUDGETS.maxInputVertices
    || indexCount / 3 > SPECIALIST_LIMITS.csgTriangles) {
    throw new SpecialistError("budget", "A Boolean mesh node exceeds the solid input budget.");
  }
  const positions = new Float32Array(vertices * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of group.geometries) {
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const offset = (vertexOffset + i) * 3;
      positions[offset] = position.getX(i);
      positions[offset + 1] = position.getY(i);
      positions[offset + 2] = position.getZ(i);
    }
    for (let i = 0; i < geometry.index!.count; i++) {
      indices[indexOffset++] = geometry.index!.getX(i) + vertexOffset;
    }
    vertexOffset += position.count;
  }
  const joined = new BufferGeometry()
    .setAttribute("position", new BufferAttribute(positions, 3))
    .setIndex(new BufferAttribute(indices, 1));
  let welded: BufferGeometry | undefined;
  try {
    welded = mergeVertices(joined, COMPOUND_SOLID_LIMITS.weldTolerance);
    return {
      positions: new Float32Array(welded.getAttribute("position").array),
      triangleIndices: new Uint32Array(welded.index!.array),
    };
  } finally {
    welded?.dispose();
    joined.dispose();
  }
}

function triangleCount(mesh: StudioManifoldTriangleMeshInput): number {
  return (mesh.triangleIndices as Uint32Array).length / 3;
}

export async function evaluateCompoundSolid(
  leftDocument: Document,
  rightDocument: Document,
  operation: "union" | "subtract" | "intersect",
  createProvider: () => StudioManifoldMeshProvider = createStudioManifoldMeshProvider,
) {
  const ownedGroups: StaticGeometryGroup[] = [];
  let provider: StudioManifoldMeshProvider | undefined;
  try {
    const limits = {
      triangles: SPECIALIST_LIMITS.csgTriangles,
      meshNodes: COMPOUND_SOLID_LIMITS.meshNodesPerSource,
    };
    const leftGroups = await extractStaticGeometryGroups(leftDocument, limits);
    ownedGroups.push(...leftGroups);
    const rightGroups = await extractStaticGeometryGroups(rightDocument, limits);
    ownedGroups.push(...rightGroups);
    const inputTriangles = ownedGroups.reduce((n, group) => n
      + group.geometries.reduce((sum, g) => sum + g.index!.count / 3, 0), 0);
    if (inputTriangles > SPECIALIST_LIMITS.csgTriangles) {
      throw new SpecialistError("budget", "Combined Boolean triangle budget exceeded.");
    }
    // Material partitions of a node must collectively form an oriented closed solid.
    const leftParts = leftGroups.map(weldMeshNode);
    const rightParts = rightGroups.map(weldMeshNode);
    provider = createProvider();
    let workUnits = 0;
    const steps: {
      phase: "left-union" | "right-union" | "result";
      operation: StudioManifoldMeshReceipt["operation"];
      receiptHash: string;
      outputHash: string;
      triangles: number;
      volume: number;
    }[] = [];
    const evaluate = async (
      left: StudioManifoldTriangleMeshInput,
      right: StudioManifoldTriangleMeshInput,
      op: StudioManifoldMeshReceipt["operation"],
      phase: typeof steps[number]["phase"],
    ): Promise<StudioManifoldMeshReceipt> => {
      const estimate = triangleCount(left) * triangleCount(right);
      if (!Number.isSafeInteger(estimate)
        || estimate > COMPOUND_SOLID_LIMITS.workUnits - workUnits) {
        throw new SpecialistError("budget", "Compound Boolean cumulative work budget exceeded.");
      }
      workUnits += estimate;
      const result = await provider!.boolean({ left, right, operation: op, epoch: 0 });
      if (result.output.topology.empty) {
        throw new SpecialistError("runtime", "Boolean result is empty.");
      }
      if (result.output.mesh.triangleCount > SPECIALIST_LIMITS.csgTriangles
        || result.output.mesh.vertexCount > STUDIO_MANIFOLD_MESH_BUDGETS.maxInputVertices) {
        throw new SpecialistError("budget", "Compound Boolean intermediate geometry budget exceeded.");
      }
      steps.push({
        phase,
        operation: op,
        receiptHash: result.receiptHash,
        outputHash: result.output.hash,
        triangles: result.output.mesh.triangleCount,
        volume: result.output.topology.volume,
      });
      return result;
    };
    // Balanced pairwise union removes internal overlap; concatenation alone does not.
    const compose = async (
      parts: StudioManifoldTriangleMeshInput[],
      phase: "left-union" | "right-union",
    ): Promise<StudioManifoldTriangleMeshInput> => {
      let level = parts;
      while (level.length > 1) {
        const next: StudioManifoldTriangleMeshInput[] = [];
        for (let i = 0; i < level.length; i += 2) {
          const left = level[i]!;
          const right = level[i + 1];
          next.push(right ? (await evaluate(left, right, "union", phase)).output.mesh : left);
        }
        level = next;
      }
      return level[0]!;
    };
    const left = await compose(leftParts, "left-union");
    const right = await compose(rightParts, "right-union");
    const result = await evaluate(left, right,
      operation === "subtract" ? "difference" : operation === "intersect" ? "intersection" : "union",
      "result");
    return {
      mesh: result.output.mesh,
      report: {
        version: 1,
        provider: result.runtimeVersion,
        composition: "union-of-mesh-nodes",
        coordinates: "source-world/right-handed/Y-up",
        volumeUnits: "source-units-cubed",
        weldTolerance: COMPOUND_SOLID_LIMITS.weldTolerance,
        sourceParts: {
          left: leftGroups.map((g) => ({ name: g.nodeName, primitives: g.geometries.length })),
          right: rightGroups.map((g) => ({ name: g.nodeName, primitives: g.geometries.length })),
        },
        inputTriangles,
        workUnits,
        steps,
        output: { meshHash: result.output.hash, topology: result.output.topology },
        authority: "derived-glb-only",
        materials: "not-preserved",
      },
    };
  } finally {
    for (const group of ownedGroups) for (const geometry of group.geometries) geometry.dispose();
    await provider?.destroy();
  }
}
