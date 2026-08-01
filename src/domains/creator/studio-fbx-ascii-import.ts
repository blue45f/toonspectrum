/**
 * ASCII FBX mesh import (grade B) — pure parser for Geometry::Mesh Vertices + PolygonVertexIndex.
 * Produces SceneIR + CompatibilityLoss report. Binary FBX remains bridge/ufbx path.
 */

import {
  createStudioEditableMeshFromPolygons,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";
import {
  buildStudioImportCompatibilityReport,
  commitStudioImportToDocument,
  type StudioImportCompatibilityReport,
  type StudioImportSceneIR,
} from "./studio-import-compatibility-report";

export const STUDIO_FBX_ASCII_IMPORT_REVISION = 1 as const;

export type StudioFbxImportResult =
  | {
      readonly ok: true;
      readonly scene: StudioImportSceneIR;
      readonly report: StudioImportCompatibilityReport;
      readonly commit: ReturnType<typeof commitStudioImportToDocument>;
      readonly meshes: readonly StudioEditableMesh[];
    }
  | { readonly ok: false; readonly detail: string };

function parseNumberList(body: string): number[] {
  const values: number[] = [];
  const cleaned = body.replace(/^[^{]*\{/u, "").replace(/\}[\s\S]*$/u, "");
  const match = /a:\s*([\d\s,.\-eE]+)/u.exec(cleaned) ?? /:\s*([\d\s,.\-eE]+)/u.exec(cleaned);
  const src = match?.[1] ?? cleaned;
  for (const token of src.split(/[,\s]+/u)) {
    if (!token) continue;
    const n = Number(token);
    if (Number.isFinite(n)) values.push(n);
  }
  return values;
}

/**
 * Parse ASCII FBX text into triangle meshes (subset of FBX 7.x Geometry Mesh).
 */
export function parseStudioFbxAscii(text: string): {
  readonly positions: number[];
  readonly polygons: number[][];
  readonly modelNames: string[];
  readonly unsupported: readonly { kind: string; reason: string }[];
} {
  const unsupported: { kind: string; reason: string }[] = [];
  if (!text.includes("FBX") && !text.includes("Vertices:")) {
    unsupported.push({ kind: "format", reason: "not ASCII FBX mesh text" });
  }
  if (text.includes("\0") || /FBXHeaderVersion:\s*\d+/u.test(text) === false) {
    // binary nulls → not our path
    if (text.includes("\0")) {
      unsupported.push({
        kind: "binary-fbx",
        reason: "Binary FBX requires ufbx/Assimp bridge; use convertStudioBg3dModelFilesToGlb",
      });
    }
  }

  const positions: number[] = [];
  const polygons: number[][] = [];
  const modelNames: string[] = [];

  // Vertices block
  const vertBlock = /Vertices:\s*\*\d+\s*\{([^}]*)\}/u.exec(text)
    ?? /Vertices:\s*\{([^}]*)\}/u.exec(text);
  if (vertBlock) {
    positions.push(...parseNumberList(vertBlock[0]));
  }

  // PolygonVertexIndex: last index of each polygon is bitwise NOT of index
  const polyBlock = /PolygonVertexIndex:\s*\*\d+\s*\{([^}]*)\}/u.exec(text)
    ?? /PolygonVertexIndex:\s*\{([^}]*)\}/u.exec(text);
  if (polyBlock) {
    const raw = parseNumberList(polyBlock[0]);
    let current: number[] = [];
    for (const v of raw) {
      if (v < 0) {
        current.push(~v);
        if (current.length >= 3) polygons.push(current);
        current = [];
      } else {
        current.push(v);
      }
    }
  }

  const modelRe = /Model:\s*\d+,\s*"Model::([^"]+)"/gu;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(text)) !== null) {
    modelNames.push(m[1]!);
  }

  if (text.includes("Deformer") || text.includes("AnimationStack")) {
    unsupported.push({
      kind: "animation-or-skin",
      reason: "ASCII FBX skin/animation not imported in lite path",
    });
  }
  if (text.includes("LayerElementMaterial") || text.includes("Material:")) {
    unsupported.push({
      kind: "material",
      reason: "FBX materials partially mapped — appearance may differ",
    });
  }

  return { positions, polygons, modelNames, unsupported };
}

export function importStudioFbxAsciiDocument(
  source: string | Uint8Array,
  options: { readonly parser?: string } = {},
): StudioFbxImportResult {
  const text =
    typeof source === "string"
      ? source
      : new TextDecoder().decode(source);
  const parsed = parseStudioFbxAscii(text);
  if (parsed.positions.length < 9 || parsed.polygons.length === 0) {
    return {
      ok: false,
      detail: "ASCII FBX contained no importable mesh polygons",
    };
  }

  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i + 2 < parsed.positions.length; i += 3) {
    verts.push({
      x: parsed.positions[i]!,
      y: parsed.positions[i + 1]!,
      z: parsed.positions[i + 2]!,
    });
  }

  const meshes: StudioEditableMesh[] = [];
  try {
    meshes.push(createStudioEditableMeshFromPolygons(verts, parsed.polygons));
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "mesh rebuild failed",
    };
  }

  const triCount = parsed.polygons.reduce(
    (n, p) => n + Math.max(0, p.length - 2),
    0,
  );
  const scene: StudioImportSceneIR = {
    format: "unknown",
    units: "cm", // FBX often cm
    axis: "y-up",
    meshes: [
      {
        name: parsed.modelNames[0] ?? "fbx-mesh",
        vertexCount: verts.length,
        triangleCount: triCount,
      },
    ],
    materials: [],
    textures: [],
    nodes: [
      { name: "RootNode" },
      ...(parsed.modelNames.length
        ? parsed.modelNames.map((name) => ({ name, parent: "RootNode" }))
        : [{ name: "fbx-mesh", parent: "RootNode" }]),
    ],
    bones: [],
    animations: [],
    morphTargets: [],
    unsupported: [
      ...parsed.unsupported,
      {
        kind: "format-grade",
        reason: "ASCII FBX lite import — grade B; binary FBX uses Three FBXLoader bridge",
      },
    ],
  };
  // Tag as fbx-compatible for report: use format unknown → force via cast by setting meshes
  const sceneTagged = { ...scene, format: "obj" as const }; // closest mesh-only grade until format enum extended

  const report = buildStudioImportCompatibilityReport({
    parser: options.parser ?? "studio-fbx-ascii-import",
    sourceBytes: text,
    scene: {
      ...sceneTagged,
      format: "obj",
      unsupported: [
        ...(scene.unsupported ?? []),
        { kind: "fbx", reason: "Imported via ASCII FBX subset (not full FBX SDK)" },
      ],
    },
    committed: true,
  });
  // Override format label for consumers
  const reportFbx: StudioImportCompatibilityReport = {
    ...report,
    format: "unknown",
    warnings: [
      ...report.warnings,
      "FBX ASCII lite path (grade B). Binary FBX: convertStudioBg3dModelFilesToGlb / Three FBXLoader.",
    ],
    fidelity: {
      ...report.fidelity,
      geometry: "B",
      material: "P",
      rigAnimation: "X",
      semanticHistory: "P",
    },
  };

  return {
    ok: true,
    scene: { ...scene, format: "unknown" },
    report: reportFbx,
    commit: commitStudioImportToDocument(reportFbx, { ...scene, format: "unknown" }),
    meshes,
  };
}

/** Minimal ASCII FBX triangle fixture generator for tests. */
export function createStudioAsciiFbxTriangleFixture(): string {
  return [
    "; FBX 7.4.0 project file",
    "FBXHeaderExtension:  {",
    "\tFBXHeaderVersion: 1003",
    "\tFBXVersion: 7400",
    "}",
    "Objects:  {",
    "\tGeometry: 1, \"Geometry::Triangle\", \"Mesh\" {",
    "\t\tVertices: *9 {",
    "\t\t\ta: 0,0,0,1,0,0,0,1,0",
    "\t\t}",
    "\t\tPolygonVertexIndex: *3 {",
    "\t\t\ta: 0,1,-3",
    "\t\t}",
    "\t}",
    "\tModel: 2, \"Model::Triangle\", \"Mesh\" {",
    "\t\tVersion: 232",
    "\t}",
    "}",
    "Connections:  {",
    "\tC: \"OO\",1,2",
    "\tC: \"OO\",2,0",
    "}",
  ].join("\n");
}
