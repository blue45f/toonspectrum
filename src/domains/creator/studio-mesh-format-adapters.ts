/**
 * Pure mesh format adapters: STL (ASCII/binary), PLY (ASCII), DAE (minimal COLLADA), DXF (lines/polyline).
 * Each path emits SceneIR + CompatibilityLoss report fields.
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

export const STUDIO_MESH_FORMAT_ADAPTERS_REVISION = 1 as const;

export type StudioMeshAdapterResult = {
  readonly format: "stl" | "ply" | "dae" | "dxf";
  readonly scene: StudioImportSceneIR;
  readonly report: StudioImportCompatibilityReport;
  readonly commitHash: string;
  readonly meshes: readonly StudioEditableMesh[];
};

function sceneShell(
  format: StudioMeshAdapterResult["format"],
  meshes: { name: string; vertexCount: number; triangleCount: number }[],
  unsupported: { kind: string; reason: string }[] = [],
): StudioImportSceneIR {
  return {
    format: format === "dxf" ? "unknown" : "obj",
    units: format === "dxf" ? "unitless" : "meters",
    axis: "y-up",
    meshes,
    materials: [],
    textures: [],
    nodes: [{ name: "root" }, ...meshes.map((m) => ({ name: m.name, parent: "root" }))],
    unsupported,
  };
}

function meshFromSoup(
  positions: number[],
  faces: number[][],
): StudioEditableMesh {
  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    verts.push({ x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! });
  }
  return createStudioEditableMeshFromPolygons(verts, faces);
}

function finish(
  format: StudioMeshAdapterResult["format"],
  parser: string,
  bytes: Uint8Array | string,
  scene: StudioImportSceneIR,
  meshes: StudioEditableMesh[],
  fidelity?: StudioImportCompatibilityReport["fidelity"],
): StudioMeshAdapterResult {
  const report = buildStudioImportCompatibilityReport({
    parser,
    sourceBytes: typeof bytes === "string" ? bytes : bytes,
    scene,
    committed: meshes.length > 0,
  });
  const finalReport: StudioImportCompatibilityReport = {
    ...report,
    fidelity: fidelity ?? report.fidelity,
  };
  const commit = commitStudioImportToDocument(finalReport, scene);
  return {
    format,
    scene,
    report: finalReport,
    commitHash: commit.commitHash,
    meshes,
  };
}

/** ASCII or binary STL. */
export function importStudioStl(bytes: Uint8Array): StudioMeshAdapterResult {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(80, bytes.length)));
  const positions: number[] = [];
  const faces: number[][] = [];
  const unsupported: { kind: string; reason: string }[] = [];

  if (head.startsWith("solid") && !head.includes("\0") && bytes.length > 100) {
    const text = new TextDecoder().decode(bytes);
    const vertexRe = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/gu;
    let match: RegExpExecArray | null;
    const verts: number[] = [];
    while ((match = vertexRe.exec(text)) !== null) {
      verts.push(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    for (let i = 0; i + 8 < verts.length; i += 9) {
      const base = positions.length / 3;
      positions.push(
        verts[i]!, verts[i + 1]!, verts[i + 2]!,
        verts[i + 3]!, verts[i + 4]!, verts[i + 5]!,
        verts[i + 6]!, verts[i + 7]!, verts[i + 8]!,
      );
      faces.push([base, base + 1, base + 2]);
    }
  } else if (bytes.length >= 84) {
    // binary STL
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triCount = view.getUint32(80, true);
    let offset = 84;
    for (let t = 0; t < triCount && offset + 50 <= bytes.length; t += 1) {
      offset += 12; // normal
      const base = positions.length / 3;
      for (let v = 0; v < 3; v += 1) {
        positions.push(
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true),
        );
        offset += 12;
      }
      faces.push([base, base + 1, base + 2]);
      offset += 2; // attribute
    }
  } else {
    unsupported.push({ kind: "stl", reason: "unrecognized STL" });
  }

  let meshes: StudioEditableMesh[] = [];
  if (faces.length > 0) {
    try {
      meshes = [meshFromSoup(positions, faces)];
    } catch (e) {
      unsupported.push({
        kind: "topology",
        reason: e instanceof Error ? e.message : "rebuild failed",
      });
    }
  }
  const scene = sceneShell(
    "stl",
    meshes.length
      ? [{ name: "stl-mesh", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    unsupported,
  );
  return finish("stl", "studio-mesh-format-adapters/stl", bytes, scene, meshes, {
    geometry: meshes.length ? "A" : "X",
    material: "X",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

/** ASCII PLY vertex/face. */
export function importStudioPlyAscii(text: string): StudioMeshAdapterResult {
  const lines = text.split(/\r?\n/u);
  let vertexCount = 0;
  let faceCount = 0;
  let headerEnd = 0;
  let formatOk = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === "end_header") {
      headerEnd = i + 1;
      break;
    }
    if (line.startsWith("format ascii")) formatOk = true;
    if (line.startsWith("element vertex")) vertexCount = Number(line.split(/\s+/u)[2] ?? 0);
    if (line.startsWith("element face")) faceCount = Number(line.split(/\s+/u)[2] ?? 0);
  }
  const positions: number[] = [];
  const faces: number[][] = [];
  const unsupported: { kind: string; reason: string }[] = [];
  if (!formatOk && !text.startsWith("ply")) {
    unsupported.push({ kind: "ply", reason: "not ASCII PLY" });
  }
  let cursor = headerEnd;
  for (let v = 0; v < vertexCount && cursor < lines.length; v += 1, cursor += 1) {
    const parts = lines[cursor]!.trim().split(/\s+/u);
    positions.push(Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0));
  }
  for (let f = 0; f < faceCount && cursor < lines.length; f += 1, cursor += 1) {
    const parts = lines[cursor]!.trim().split(/\s+/u).map(Number);
    const n = parts[0] ?? 0;
    const idx = parts.slice(1, 1 + n);
    if (idx.length >= 3) faces.push(idx);
  }
  let meshes: StudioEditableMesh[] = [];
  if (faces.length) {
    try {
      meshes = [meshFromSoup(positions, faces)];
    } catch (e) {
      unsupported.push({
        kind: "topology",
        reason: e instanceof Error ? e.message : "rebuild failed",
      });
    }
  }
  const scene = sceneShell(
    "ply",
    meshes.length
      ? [{ name: "ply-mesh", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    unsupported,
  );
  return finish("ply", "studio-mesh-format-adapters/ply", text, scene, meshes, {
    geometry: meshes.length ? "A" : "X",
    material: "P",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

/** Minimal COLLADA: float_array positions + triangles p indices. */
export function importStudioDaeMinimal(text: string): StudioMeshAdapterResult {
  const unsupported: { kind: string; reason: string }[] = [];
  const floatArray = /<float_array[^>]*>([\d\s.eE+-]+)<\/float_array>/u.exec(text);
  const positions: number[] = [];
  if (floatArray) {
    for (const t of floatArray[1]!.trim().split(/\s+/u)) {
      const n = Number(t);
      if (Number.isFinite(n)) positions.push(n);
    }
  } else {
    unsupported.push({ kind: "dae", reason: "no float_array positions" });
  }
  const pBlock = /<p>([\d\s]+)<\/p>/u.exec(text);
  const faces: number[][] = [];
  if (pBlock) {
    const idx = pBlock[1]!.trim().split(/\s+/u).map(Number).filter(Number.isFinite);
    // assume vertex-only stride 1
    for (let i = 0; i + 2 < idx.length; i += 3) {
      faces.push([idx[i]!, idx[i + 1]!, idx[i + 2]!]);
    }
  }
  let meshes: StudioEditableMesh[] = [];
  if (faces.length && positions.length >= 9) {
    try {
      meshes = [meshFromSoup(positions, faces)];
    } catch (e) {
      unsupported.push({
        kind: "topology",
        reason: e instanceof Error ? e.message : "rebuild failed",
      });
    }
  }
  if (text.includes("controller") || text.includes("animation")) {
    unsupported.push({ kind: "skin-anim", reason: "DAE skin/animation not in minimal path" });
  }
  const scene = sceneShell(
    "dae",
    meshes.length
      ? [{ name: "dae-mesh", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    unsupported,
  );
  return finish("dae", "studio-mesh-format-adapters/dae", text, scene, meshes, {
    geometry: meshes.length ? "B" : "X",
    material: "P",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

/** DXF LINE / LWPOLYLINE → wall guide polylines as degenerate mesh ribbons (report-first). */
export function importStudioDxfPlan(text: string): StudioMeshAdapterResult {
  const lines = text.split(/\r?\n/u);
  const segments: { a: [number, number]; b: [number, number] }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.trim() === "LINE") {
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      for (let j = i; j < Math.min(i + 20, lines.length); j += 1) {
        const code = lines[j]!.trim();
        const val = lines[j + 1]?.trim() ?? "0";
        if (code === "10") x1 = Number(val);
        if (code === "20") y1 = Number(val);
        if (code === "11") x2 = Number(val);
        if (code === "21") y2 = Number(val);
      }
      segments.push({ a: [x1, y1], b: [x2, y2] });
    }
  }
  // Build thin vertical quads as walls for each segment (height 1)
  const positions: number[] = [];
  const faces: number[][] = [];
  for (const seg of segments) {
    const base = positions.length / 3;
    const [x1, z1] = seg.a;
    const [x2, z2] = seg.b;
    positions.push(x1, 0, z1, x2, 0, z2, x2, 1, z2, x1, 1, z1);
    faces.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
  }
  let meshes: StudioEditableMesh[] = [];
  if (faces.length) {
    try {
      meshes = [meshFromSoup(positions, faces)];
    } catch {
      // leave empty
    }
  }
  const scene = sceneShell(
    "dxf",
    meshes.length
      ? [{ name: "dxf-plan", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    [
      {
        kind: "dxf-subset",
        reason: `LINE entities only (${segments.length}); arcs/blocks/text not imported`,
      },
    ],
  );
  return finish("dxf", "studio-mesh-format-adapters/dxf", text, scene, meshes, {
    geometry: meshes.length ? "B" : "P",
    material: "X",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

export function importStudioMeshByExtension(
  fileName: string,
  bytes: Uint8Array,
): StudioMeshAdapterResult | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".stl")) return importStudioStl(bytes);
  if (lower.endsWith(".ply")) return importStudioPlyAscii(new TextDecoder().decode(bytes));
  if (lower.endsWith(".dae")) return importStudioDaeMinimal(new TextDecoder().decode(bytes));
  if (lower.endsWith(".dxf")) return importStudioDxfPlan(new TextDecoder().decode(bytes));
  return null;
}
