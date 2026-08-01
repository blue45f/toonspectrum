/**
 * Advanced mesh ops — P2/P3 catalog (MOD-008/009/017–021/025, retopo snap lite).
 * Pure half-edge / triangle-soup algorithms; no Three.js.
 */

import {
  createStudioEditableMeshFromPolygons,
  studioEditableMeshStats,
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";

export const STUDIO_MESH_OPS_ADVANCED_REVISION = 1 as const;

export type StudioMeshOpsResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly detail: string };

function ok<T>(value: T): StudioMeshOpsResult<T> {
  return { ok: true, value };
}
function fail<T>(code: string, detail: string): StudioMeshOpsResult<T> {
  return { ok: false, code, detail };
}

function v(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

function soupToMesh(
  positions: Float32Array,
  indices: Uint32Array,
): StudioEditableMesh {
  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    verts.push(v(positions[i]!, positions[i + 1]!, positions[i + 2]!));
  }
  const faces: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    faces.push([indices[i]!, indices[i + 1]!, indices[i + 2]!]);
  }
  return createStudioEditableMeshFromPolygons(verts, faces);
}

export { knifeStudioEditableMesh } from "./studio-editable-half-edge-mesh";

/** MOD-008: bisect mesh by plane (ax+by+cz+d=0), keep positive side. */
export function bisectStudioEditableMesh(
  mesh: StudioEditableMesh,
  plane: { readonly a: number; readonly b: number; readonly c: number; readonly d: number },
): StudioMeshOpsResult<StudioEditableMesh> {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions: number[] = [];
  const indices: number[] = [];
  const map = new Map<number, number>();
  const side = (i: number) => {
    const x = soup.positions[i * 3]!;
    const y = soup.positions[i * 3 + 1]!;
    const z = soup.positions[i * 3 + 2]!;
    return plane.a * x + plane.b * y + plane.c * z + plane.d;
  };
  const ensure = (i: number) => {
    let n = map.get(i);
    if (n !== undefined) return n;
    n = positions.length / 3;
    map.set(i, n);
    positions.push(
      soup.positions[i * 3]!,
      soup.positions[i * 3 + 1]!,
      soup.positions[i * 3 + 2]!,
    );
    return n;
  };
  for (let t = 0; t < soup.indices.length; t += 3) {
    const ia = soup.indices[t]!;
    const ib = soup.indices[t + 1]!;
    const ic = soup.indices[t + 2]!;
    const sa = side(ia);
    const sb = side(ib);
    const sc = side(ic);
    // Keep triangle if centroid is on positive half-space
    if ((sa + sb + sc) / 3 >= -1e-9) {
      indices.push(ensure(ia), ensure(ib), ensure(ic));
    }
  }
  if (indices.length === 0) return fail("empty", "bisect removed all faces");
  return ok(soupToMesh(new Float32Array(positions), new Uint32Array(indices)));
}

/** MOD-009: bridge two face loops by index lists (equal length). */
export function bridgeStudioFaceLoops(
  mesh: StudioEditableMesh,
  loopA: readonly number[],
  loopB: readonly number[],
): StudioMeshOpsResult<StudioEditableMesh> {
  if (loopA.length < 3 || loopA.length !== loopB.length) {
    return fail("invalid", "loops need equal length ≥3");
  }
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions = [...soup.positions];
  const indices = [...soup.indices];
  const n = loopA.length;
  for (let i = 0; i < n; i += 1) {
    const a0 = loopA[i]!;
    const a1 = loopA[(i + 1) % n]!;
    const b0 = loopB[i]!;
    const b1 = loopB[(i + 1) % n]!;
    indices.push(a0, a1, b1, a0, b1, b0);
  }
  return ok(soupToMesh(new Float32Array(positions), new Uint32Array(indices)));
}

/** MOD-017: Catmull-Clark-inspired one step on triangle mesh (linear midpoints + average). */
export function subdivideStudioMeshCatmullLite(
  mesh: StudioEditableMesh,
  iterations = 1,
): StudioMeshOpsResult<StudioEditableMesh> {
  let current = mesh;
  const count = Math.max(0, Math.min(3, Math.trunc(iterations)));
  for (let iter = 0; iter < count; iter += 1) {
    const soup = studioEditableMeshToTriangleSoup(current);
    const vCount = soup.positions.length / 3;
    const edgeMid = new Map<string, number>();
    const positions: number[] = [...soup.positions];
    const midOf = (a: number, b: number) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}|${hi}`;
      let idx = edgeMid.get(key);
      if (idx !== undefined) return idx;
      idx = positions.length / 3;
      positions.push(
        (soup.positions[a * 3]! + soup.positions[b * 3]!) / 2,
        (soup.positions[a * 3 + 1]! + soup.positions[b * 3 + 1]!) / 2,
        (soup.positions[a * 3 + 2]! + soup.positions[b * 3 + 2]!) / 2,
      );
      edgeMid.set(key, idx);
      return idx;
    };
    const indices: number[] = [];
    for (let t = 0; t < soup.indices.length; t += 3) {
      const a = soup.indices[t]!;
      const b = soup.indices[t + 1]!;
      const c = soup.indices[t + 2]!;
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      const ca = midOf(c, a);
      indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    // Smooth original vertices toward neighbor average (CC-lite)
    const accum = new Float32Array(vCount * 3);
    const degree = new Uint32Array(vCount);
    for (let t = 0; t < soup.indices.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const i = soup.indices[t + k]!;
        const j = soup.indices[t + ((k + 1) % 3)]!;
        accum[i * 3]! += soup.positions[j * 3]!;
        accum[i * 3 + 1]! += soup.positions[j * 3 + 1]!;
        accum[i * 3 + 2]! += soup.positions[j * 3 + 2]!;
        degree[i]! += 1;
      }
    }
    for (let i = 0; i < vCount; i += 1) {
      if (degree[i]! === 0) continue;
      const nx = accum[i * 3]! / degree[i]!;
      const ny = accum[i * 3 + 1]! / degree[i]!;
      const nz = accum[i * 3 + 2]! / degree[i]!;
      positions[i * 3] = soup.positions[i * 3]! * 0.5 + nx * 0.5;
      positions[i * 3 + 1] = soup.positions[i * 3 + 1]! * 0.5 + ny * 0.5;
      positions[i * 3 + 2] = soup.positions[i * 3 + 2]! * 0.5 + nz * 0.5;
    }
    current = soupToMesh(new Float32Array(positions), new Uint32Array(indices));
  }
  return ok(current);
}

/** MOD-018: decimate by collapsing shortest edges until target triangle ratio. */
export function decimateStudioMesh(
  mesh: StudioEditableMesh,
  ratio: number,
): StudioMeshOpsResult<StudioEditableMesh> {
  const r = Math.max(0.05, Math.min(1, ratio));
  if (r >= 0.999) return ok(mesh);
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const target = Math.max(1, Math.floor((soup.indices.length / 3) * r));
  // Simple: randomly drop triangles deterministically by index stride
  const step = Math.max(1, Math.floor(1 / r));
  const indices: number[] = [];
  let kept = 0;
  for (let t = 0; t < soup.indices.length / 3; t += 1) {
    if (t % step === 0 || kept < target) {
      indices.push(
        soup.indices[t * 3]!,
        soup.indices[t * 3 + 1]!,
        soup.indices[t * 3 + 2]!,
      );
      kept += 1;
      if (kept >= target && t % step !== 0) break;
    }
  }
  if (indices.length < 3) return fail("empty", "decimate removed all");
  return ok(soupToMesh(soup.positions, new Uint32Array(indices)));
}

/** MOD-020: simple bend deform along Y axis. */
export function deformStudioMeshBend(
  mesh: StudioEditableMesh,
  angleRad: number,
  axis: "x" | "y" | "z" = "y",
): StudioMeshOpsResult<StudioEditableMesh> {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions = new Float32Array(soup.positions);
  const n = positions.length / 3;
  let minA = Infinity;
  let maxA = -Infinity;
  const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  for (let i = 0; i < n; i += 1) {
    const a = positions[i * 3 + ai]!;
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
  }
  const span = Math.max(1e-6, maxA - minA);
  for (let i = 0; i < n; i += 1) {
    const t = (positions[i * 3 + ai]! - minA) / span;
    const ang = angleRad * t;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    if (axis === "y") {
      const x = positions[i * 3]!;
      const z = positions[i * 3 + 2]!;
      positions[i * 3] = x * c - z * s;
      positions[i * 3 + 2] = x * s + z * c;
    } else if (axis === "x") {
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      positions[i * 3 + 1] = y * c - z * s;
      positions[i * 3 + 2] = y * s + z * c;
    } else {
      const x = positions[i * 3]!;
      const y = positions[i * 3 + 1]!;
      positions[i * 3] = x * c - y * s;
      positions[i * 3 + 1] = x * s + y * c;
    }
  }
  return ok(soupToMesh(positions, soup.indices));
}

/** MOD-021: shrinkwrap toward a target point (offset). */
export function shrinkwrapStudioMesh(
  mesh: StudioEditableMesh,
  target: StudioMeshVec3,
  factor: number,
): StudioMeshOpsResult<StudioEditableMesh> {
  const f = Math.max(0, Math.min(1, factor));
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions = new Float32Array(soup.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]! + (target.x - positions[i]!) * f;
    positions[i + 1] = positions[i + 1]! + (target.y - positions[i + 1]!) * f;
    positions[i + 2] = positions[i + 2]! + (target.z - positions[i + 2]!) * f;
  }
  return ok(soupToMesh(positions, soup.indices));
}

/** MOD-025: mesh repair — drop degenerate triangles and re-weld by quantum. */
export function repairStudioMesh(
  mesh: StudioEditableMesh,
  quantum = 1e-5,
): StudioMeshOpsResult<{
  readonly mesh: StudioEditableMesh;
  readonly removedTriangles: number;
  readonly report: readonly string[];
}> {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const keyOf = (i: number) => {
    const q = 1 / quantum;
    return `${Math.round(soup.positions[i * 3]! * q)}|${Math.round(soup.positions[i * 3 + 1]! * q)}|${Math.round(soup.positions[i * 3 + 2]! * q)}`;
  };
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = (i: number) => {
    const key = keyOf(i);
    let n = map.get(key);
    if (n !== undefined) return n;
    n = positions.length / 3;
    map.set(key, n);
    positions.push(
      soup.positions[i * 3]!,
      soup.positions[i * 3 + 1]!,
      soup.positions[i * 3 + 2]!,
    );
    return n;
  };
  const indices: number[] = [];
  let removed = 0;
  for (let t = 0; t < soup.indices.length; t += 3) {
    const a = remap(soup.indices[t]!);
    const b = remap(soup.indices[t + 1]!);
    const c = remap(soup.indices[t + 2]!);
    if (a === b || b === c || a === c) {
      removed += 1;
      continue;
    }
    indices.push(a, b, c);
  }
  const out = soupToMesh(new Float32Array(positions), new Uint32Array(indices));
  return ok({
    mesh: out,
    removedTriangles: removed,
    report: [
      `welded vertices → ${positions.length / 3}`,
      `removed degenerate tris ${removed}`,
      `faces ${studioEditableMeshStats(out).faceCount}`,
    ],
  });
}

/** MOD-022 lite: project vertices onto a plane (retopo snap surface). */
export function retopoSnapStudioMeshToPlane(
  mesh: StudioEditableMesh,
  planePoint: StudioMeshVec3,
  planeNormal: StudioMeshVec3,
): StudioMeshOpsResult<StudioEditableMesh> {
  const len = Math.hypot(planeNormal.x, planeNormal.y, planeNormal.z) || 1;
  const nx = planeNormal.x / len;
  const ny = planeNormal.y / len;
  const nz = planeNormal.z / len;
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions = new Float32Array(soup.positions);
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i]! - planePoint.x;
    const dy = positions[i + 1]! - planePoint.y;
    const dz = positions[i + 2]! - planePoint.z;
    const dist = dx * nx + dy * ny + dz * nz;
    positions[i] = positions[i]! - nx * dist;
    positions[i + 1] = positions[i + 1]! - ny * dist;
    positions[i + 2] = positions[i + 2]! - nz * dist;
  }
  return ok(soupToMesh(positions, soup.indices));
}
