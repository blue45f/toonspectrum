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

export type StudioFbxBinarySniff = {
  readonly byteLength: number;
  readonly version: number | null;
  readonly magicOk: boolean;
};

export type StudioFbxImportResult =
  | {
      readonly ok: true;
      readonly scene: StudioImportSceneIR;
      readonly report: StudioImportCompatibilityReport;
      readonly commit: ReturnType<typeof commitStudioImportToDocument>;
      readonly meshes: readonly StudioEditableMesh[];
      readonly header: StudioFbxAsciiHeader;
    }
  | {
      readonly ok: false;
      readonly detail: string;
      readonly report?: StudioImportCompatibilityReport;
      readonly binary?: StudioFbxBinarySniff;
      readonly header?: StudioFbxAsciiHeader;
    };

/** Read Kaydara binary header version field (uint32 LE at offset 23) when magic matches. */
export function sniffStudioFbxBinaryHeader(bytes: Uint8Array): StudioFbxBinarySniff {
  const magicOk = isStudioFbxBinary(bytes);
  let version: number | null = null;
  if (magicOk && bytes.length >= 27) {
    version =
      bytes[23]!
      | (bytes[24]! << 8)
      | (bytes[25]! << 16)
      | (bytes[26]! << 24);
  }
  return { byteLength: bytes.length, version, magicOk };
}

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

export type StudioFbxAsciiHeader = {
  readonly fbxVersion: number | null;
  readonly headerVersion: number | null;
  readonly creator: string | null;
  readonly geometryMeshCount: number;
  readonly modelCount: number;
  readonly hasLayerElementUV: boolean;
  readonly hasDeformer: boolean;
};

/** Pure header/stats scan for ASCII FBX (no mesh rebuild). */
export function parseStudioFbxAsciiHeader(text: string): StudioFbxAsciiHeader {
  const fbxVersion = /FBXVersion:\s*(\d+)/u.exec(text);
  const headerVersion = /FBXHeaderVersion:\s*(\d+)/u.exec(text);
  const creator = /Creator:\s*"([^"]*)"/u.exec(text) ?? /Creator:\s*([^\n\r]+)/u.exec(text);
  const geometryMeshCount = (text.match(/Geometry:\s*\d+,\s*"Geometry::[^"]+",\s*"Mesh"/gu) ?? []).length
    || (text.match(/Geometry:\s*\d+,\s*"[^"]*",\s*"Mesh"/gu) ?? []).length;
  const modelCount = (text.match(/Model:\s*\d+,\s*"Model::/gu) ?? []).length;
  return {
    fbxVersion: fbxVersion ? Number(fbxVersion[1]) : null,
    headerVersion: headerVersion ? Number(headerVersion[1]) : null,
    creator: creator?.[1]?.trim() ?? null,
    geometryMeshCount,
    modelCount,
    hasLayerElementUV: /LayerElementUV\b/u.test(text),
    hasDeformer: /Deformer\b/u.test(text) || /AnimationStack\b/u.test(text),
  };
}

/**
 * Parse ASCII FBX text into triangle meshes (subset of FBX 7.x Geometry Mesh).
 */
export function parseStudioFbxAscii(text: string): {
  readonly positions: number[];
  readonly polygons: number[][];
  readonly modelNames: string[];
  readonly header: StudioFbxAsciiHeader;
  readonly unsupported: readonly { kind: string; reason: string }[];
} {
  const unsupported: { kind: string; reason: string }[] = [];
  const header = parseStudioFbxAsciiHeader(text);
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

  if (header.hasDeformer) {
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
  if (header.geometryMeshCount > 1) {
    unsupported.push({
      kind: "multi-geometry",
      reason: `ASCII lite imports first Vertices/PolygonVertexIndex only (${header.geometryMeshCount} Geometry::Mesh declared)`,
    });
  }
  if (header.hasLayerElementUV) {
    unsupported.push({
      kind: "uv",
      reason: "LayerElementUV present but not bound on lite path",
    });
  }

  return { positions, polygons, modelNames, header, unsupported };
}

/** Detect Kaydara FBX binary magic (Kaydara FBX Binary  \x00). */
export function isStudioFbxBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 23) return false;
  const magic = "Kaydara FBX Binary  ";
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Unified FBX entry: ASCII mesh path, or binary → report-only bridge (no silent fake mesh).
 */
export function importStudioFbxDocument(
  source: string | Uint8Array,
  options: { readonly parser?: string } = {},
): StudioFbxImportResult {
  if (typeof source !== "string" && isStudioFbxBinary(source)) {
    const sniff = sniffStudioFbxBinaryHeader(source);
    const report = buildStudioImportCompatibilityReport({
      parser: options.parser ?? "studio-fbx-binary-sniff",
      sourceBytes: source,
      scene: {
        format: "unknown",
        units: "cm",
        axis: "y-up",
        meshes: [],
        materials: [],
        textures: [],
        nodes: [{ name: "RootNode" }],
        bones: [],
        animations: [],
        morphTargets: [],
        unsupported: [
          {
            kind: "fbx-binary",
            reason: `Binary FBX v${sniff.version ?? "?"} (${sniff.byteLength} bytes); use ufbx WASM / Assimp bridge — not parsed in browser pure core`,
          },
        ],
      },
      committed: false,
    });
    const fidelityReport: StudioImportCompatibilityReport = {
      ...report,
      fidelity: {
        ...report.fidelity,
        geometry: "X",
        material: "X",
        rigAnimation: "X",
        semanticHistory: "P",
      },
    };
    return {
      ok: false,
      detail: `binary-fbx:${fidelityReport.sourceHash}`,
      report: fidelityReport,
      binary: sniff,
    };
  }
  return importStudioFbxAsciiDocument(source, options);
}

export function importStudioFbxAsciiDocument(
  source: string | Uint8Array,
  options: { readonly parser?: string } = {},
): StudioFbxImportResult {
  const text =
    typeof source === "string"
      ? source
      : new TextDecoder().decode(source);
  if (typeof source !== "string" && isStudioFbxBinary(source)) {
    return importStudioFbxDocument(source, options);
  }
  const parsed = parseStudioFbxAscii(text);
  if (parsed.positions.length < 9 || parsed.polygons.length === 0) {
    return {
      ok: false,
      detail: "ASCII FBX contained no importable mesh polygons",
      header: parsed.header,
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
      `ASCII header fbxVersion=${parsed.header.fbxVersion ?? "?"} geometryMeshCount=${parsed.header.geometryMeshCount} modelCount=${parsed.header.modelCount}`,
    ],
    fidelity: {
      ...report.fidelity,
      geometry: "B",
      material: "P",
      rigAnimation: parsed.header.hasDeformer ? "X" : "P",
      semanticHistory: "P",
    },
  };

  return {
    ok: true,
    scene: { ...scene, format: "unknown" },
    report: reportFbx,
    commit: commitStudioImportToDocument(reportFbx, { ...scene, format: "unknown" }),
    meshes,
    header: parsed.header,
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
