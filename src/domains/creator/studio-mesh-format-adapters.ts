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

export type StudioMeshAdapterFormat =
  | "stl"
  | "ply"
  | "dae"
  | "dxf"
  | "off"
  | "3mf"
  | "bvh"
  | "ifc"
  | "step";

export type StudioMeshAdapterResult = {
  readonly format: StudioMeshAdapterFormat;
  readonly scene: StudioImportSceneIR;
  readonly report: StudioImportCompatibilityReport;
  readonly commitHash: string;
  readonly meshes: readonly StudioEditableMesh[];
  readonly extras?: Readonly<Record<string, unknown>>;
};

function sceneShell(
  format: StudioMeshAdapterFormat,
  meshes: { name: string; vertexCount: number; triangleCount: number }[],
  unsupported: { kind: string; reason: string }[] = [],
): StudioImportSceneIR {
  const planLike =
    format === "dxf" || format === "bvh" || format === "ifc" || format === "step";
  return {
    format: planLike ? "unknown" : "obj",
    units: planLike ? "unitless" : "meters",
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

/** OFF (Object File Format) — vertices then faces. */
export function importStudioOff(text: string): StudioMeshAdapterResult {
  const lines = text
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  const unsupported: { kind: string; reason: string }[] = [];
  if (lines.length === 0 || !/^OFF\b/iu.test(lines[0]!)) {
    unsupported.push({ kind: "off", reason: "missing OFF header" });
  }
  let countsLine = 1;
  if (lines[0] && /^OFF\s+\d/iu.test(lines[0]!)) {
    // "OFF nV nF nE" single line form
    countsLine = 0;
  }
  const counts = (lines[countsLine] ?? "0 0 0").replace(/^OFF\s+/iu, "").split(/\s+/u).map(Number);
  const vertexCount = counts[0] ?? 0;
  const faceCount = counts[1] ?? 0;
  const start = countsLine === 0 ? 1 : 2;
  const positions: number[] = [];
  const faces: number[][] = [];
  let cursor = start;
  for (let v = 0; v < vertexCount && cursor < lines.length; v += 1, cursor += 1) {
    const p = lines[cursor]!.split(/\s+/u).map(Number);
    positions.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  }
  for (let f = 0; f < faceCount && cursor < lines.length; f += 1, cursor += 1) {
    const p = lines[cursor]!.split(/\s+/u).map(Number);
    const n = p[0] ?? 0;
    const idx = p.slice(1, 1 + n);
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
    "off",
    meshes.length
      ? [{ name: "off-mesh", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    unsupported,
  );
  return finish("off", "studio-mesh-format-adapters/off", text, scene, meshes, {
    geometry: meshes.length ? "A" : "X",
    material: "X",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

/** Minimal 3MF: mesh vertices/triangles inside model XML (no full OPC ZIP expand required for raw XML). */
export function importStudio3mfMinimal(text: string): StudioMeshAdapterResult {
  const unsupported: { kind: string; reason: string }[] = [];
  const positions: number[] = [];
  const faces: number[][] = [];
  const vertexRe = /<vertex\b[^>]*\bx=["']?([-\d.eE+]+)["']?[^>]*\by=["']?([-\d.eE+]+)["']?[^>]*\bz=["']?([-\d.eE+]+)["']?/giu;
  let m: RegExpExecArray | null;
  while ((m = vertexRe.exec(text)) !== null) {
    positions.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const triRe = /<triangle\b[^>]*\bv1=["']?(\d+)["']?[^>]*\bv2=["']?(\d+)["']?[^>]*\bv3=["']?(\d+)["']?/giu;
  while ((m = triRe.exec(text)) !== null) {
    faces.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  if (!positions.length) {
    unsupported.push({ kind: "3mf", reason: "no <vertex> elements (ZIP package may need unzip first)" });
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
  const scene = sceneShell(
    "3mf",
    meshes.length
      ? [{ name: "3mf-mesh", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    unsupported,
  );
  return finish("3mf", "studio-mesh-format-adapters/3mf", text, scene, meshes, {
    geometry: meshes.length ? "B" : "X",
    material: "P",
    rigAnimation: "X",
    semanticHistory: "P",
  });
}

export type StudioBvhJoint = {
  readonly name: string;
  readonly offset: readonly [number, number, number];
  readonly channels: readonly string[];
  readonly children: readonly StudioBvhJoint[];
};

/** BVH skeleton + frame channel count (motion retarget report path). */
export function importStudioBvhMotion(text: string): StudioMeshAdapterResult {
  const unsupported: { kind: string; reason: string }[] = [];
  const joints: { name: string; offset: [number, number, number] }[] = [];
  const lines = text.split(/\r?\n/u);
  let frameCount = 0;
  let frameTime = 0;
  let channelTotal = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (/^(ROOT|JOINT)\s+/u.test(line)) {
      const name = line.replace(/^(ROOT|JOINT)\s+/u, "").trim();
      let offset: [number, number, number] = [0, 0, 0];
      for (let j = i; j < Math.min(i + 8, lines.length); j += 1) {
        const o = /^\s*OFFSET\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/u.exec(lines[j]!);
        if (o) {
          offset = [Number(o[1]), Number(o[2]), Number(o[3])];
          break;
        }
      }
      joints.push({ name, offset });
    }
    const ch = /^\s*CHANNELS\s+(\d+)/u.exec(line);
    if (ch) channelTotal += Number(ch[1]);
    if (line.startsWith("Frames:")) frameCount = Number(line.split(":")[1]?.trim() ?? 0);
    if (line.startsWith("Frame Time:")) frameTime = Number(line.split(":")[1]?.trim() ?? 0);
  }
  if (!joints.length) {
    unsupported.push({ kind: "bvh", reason: "no ROOT/JOINT hierarchy" });
  }
  // Build a stick-figure mesh from joint offsets (parent chain approximated as sequential)
  const positions: number[] = [];
  const faces: number[][] = [];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < joints.length; i += 1) {
    const j = joints[i]!;
    const nx = cx + j.offset[0];
    const ny = cy + j.offset[1];
    const nz = cz + j.offset[2];
    const base = positions.length / 3;
    // thin box segment from parent to joint
    const s = 0.02;
    positions.push(
      cx, cy, cz,
      nx, ny, nz,
      nx + s, ny, nz,
      cx + s, cy, cz,
    );
    faces.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
    cx = nx;
    cy = ny;
    cz = nz;
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
    "bvh",
    meshes.length
      ? [{ name: "bvh-stick", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    [
      ...unsupported,
      {
        kind: "bvh-motion",
        reason: `hierarchy joints=${joints.length} channels=${channelTotal} frames=${frameCount} dt=${frameTime}; skin weights not in BVH`,
      },
    ],
  );
  const result = finish("bvh", "studio-mesh-format-adapters/bvh", text, scene, meshes, {
    geometry: meshes.length ? "B" : "P",
    material: "X",
    rigAnimation: frameCount > 0 ? "B" : "P",
    semanticHistory: "P",
  });
  return {
    ...result,
    extras: {
      joints: joints.map((j) => j.name),
      frameCount,
      frameTime,
      channelTotal,
    },
  };
}

/** IFC STEP-physical shell: extract IfcCartesianPoint / IfcSpace names (not full geometry tessellation). */
export function importStudioIfcShell(text: string): StudioMeshAdapterResult {
  const unsupported: { kind: string; reason: string }[] = [];
  const points: number[][] = [];
  const spaces: string[] = [];
  const pointRe = /IFCCARTESIANPOINT\s*\(\s*\(([^)]+)\)/giu;
  let m: RegExpExecArray | null;
  while ((m = pointRe.exec(text)) !== null) {
    const nums = m[1]!.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
    if (nums.length >= 2) {
      points.push([nums[0]!, nums[1]!, nums[2] ?? 0]);
    }
  }
  const spaceRe = /IFCSPACE\s*\([^;]*'([^']*)'/giu;
  while ((m = spaceRe.exec(text)) !== null) {
    spaces.push(m[1]!);
  }
  const wallCount = (text.match(/IFCWALL\b/giu) ?? []).length;
  const slabCount = (text.match(/IFCSLAB\b/giu) ?? []).length;
  if (!points.length && !spaces.length && !wallCount) {
    unsupported.push({ kind: "ifc", reason: "no recognizable IFC entities" });
  }
  // Build point-cloud boxes / hull ribbon for preview
  const positions: number[] = [];
  const faces: number[][] = [];
  const sample = points.slice(0, 64);
  for (const p of sample) {
    const base = positions.length / 3;
    const [x, y, z] = p;
    const s = 0.05;
    positions.push(
      x, y, z,
      x + s, y, z,
      x + s, y + s, z,
      x, y + s, z,
    );
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
    "ifc",
    meshes.length
      ? [{ name: "ifc-shell", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    [
      ...unsupported,
      {
        kind: "ifc-subset",
        reason: `points=${points.length} spaces=${spaces.length} walls=${wallCount} slabs=${slabCount}; full BREP tessellation deferred to web-ifc WASM path`,
      },
    ],
  );
  const result = finish("ifc", "studio-mesh-format-adapters/ifc", text, scene, meshes, {
    geometry: meshes.length ? "C" : "P",
    material: "X",
    rigAnimation: "X",
    semanticHistory: spaces.length ? "B" : "P",
  });
  return {
    ...result,
    extras: { spaces, wallCount, slabCount, pointCount: points.length },
  };
}

/**
 * STEP/IGES shell — cartesian points + product names (tessellation deferred to OCCT WASM).
 */
export function importStudioStepShell(text: string): StudioMeshAdapterResult {
  const unsupported: { kind: string; reason: string }[] = [];
  const isIges = /^\s*S\s*\d+/m.test(text) || text.includes("START SECTION");
  const points: number[][] = [];
  const cartRe = /CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(([^)]+)\)/giu;
  let m: RegExpExecArray | null;
  while ((m = cartRe.exec(text)) !== null) {
    const nums = m[1]!.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
    if (nums.length >= 2) points.push([nums[0]!, nums[1]!, nums[2] ?? 0]);
  }
  const products = [...text.matchAll(/PRODUCT\s*\(\s*'([^']*)'/giu)].map((x) => x[1]!);
  const advancedFaces = (text.match(/ADVANCED_FACE\b/giu) ?? []).length;
  if (!points.length && !products.length && !advancedFaces) {
    unsupported.push({
      kind: "step",
      reason: isIges ? "IGES shell without mapped entities" : "no STEP cartesian/product entities",
    });
  }
  const positions: number[] = [];
  const faces: number[][] = [];
  for (const p of points.slice(0, 48)) {
    const base = positions.length / 3;
    const s = 0.04;
    positions.push(p[0]!, p[1]!, p[2]!, p[0]! + s, p[1]!, p[2]!, p[0]! + s, p[1]! + s, p[2]!, p[0]!, p[1]! + s, p[2]!);
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
    "step",
    meshes.length
      ? [{ name: "step-shell", vertexCount: positions.length / 3, triangleCount: faces.length }]
      : [],
    [
      ...unsupported,
      {
        kind: "step-subset",
        reason: `points=${points.length} products=${products.length} advancedFaces=${advancedFaces}; B-Rep tessellation needs OCCT`,
      },
    ],
  );
  const result = finish("step", "studio-mesh-format-adapters/step", text, scene, meshes, {
    geometry: meshes.length ? "C" : "P",
    material: "X",
    rigAnimation: "X",
    semanticHistory: products.length ? "B" : "P",
  });
  return {
    ...result,
    extras: { products, advancedFaces, pointCount: points.length, isIges },
  };
}

export function importStudioMeshByExtension(
  fileName: string,
  bytes: Uint8Array,
): StudioMeshAdapterResult | null {
  const lower = fileName.toLowerCase();
  const text = () => new TextDecoder().decode(bytes);
  if (lower.endsWith(".stl")) return importStudioStl(bytes);
  if (lower.endsWith(".ply")) return importStudioPlyAscii(text());
  if (lower.endsWith(".dae")) return importStudioDaeMinimal(text());
  if (lower.endsWith(".dxf")) return importStudioDxfPlan(text());
  if (lower.endsWith(".off")) return importStudioOff(text());
  if (lower.endsWith(".3mf") || lower.endsWith(".model")) return importStudio3mfMinimal(text());
  if (lower.endsWith(".bvh")) return importStudioBvhMotion(text());
  if (lower.endsWith(".ifc")) return importStudioIfcShell(text());
  if (lower.endsWith(".step") || lower.endsWith(".stp") || lower.endsWith(".iges") || lower.endsWith(".igs")) {
    return importStudioStepShell(text());
  }
  return null;
}
