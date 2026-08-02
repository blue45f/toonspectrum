/**
 * Editable half-edge mesh — Geometry Authority payload for polygon edit mode (MOD-001…011, MOD-024).
 *
 * Three.js BufferGeometry is never the source of truth. Render caches derive from this structure.
 * All public ops return new meshes (immutable) so command undo stores prior references cleanly.
 *
 * Scope is the webtoon P1 subset: selection, transform, extrude, inset, bevel, loop cut,
 * merge/weld/dissolve, normals/crease, non-manifold diagnostics. Knife/bridge/subdiv are out.
 */

export const STUDIO_EDITABLE_MESH_REVISION = 1 as const;

export const STUDIO_EDITABLE_MESH_LIMITS = Object.freeze({
  maxVertices: 250_000,
  maxEdges: 500_000,
  maxFaces: 250_000,
  maxSelection: 50_000,
  weldQuantumDefault: 1e-5,
  areaEpsilon: 1e-12,
});

export type StudioMeshSelectionMode = "vertex" | "edge" | "face";
export type StudioMeshTransformOrientation =
  | "world"
  | "local"
  | "normal"
  | "view"
  | "custom";
export type StudioMeshPivotMode =
  | "median"
  | "active"
  | "individual"
  | "cursor"
  | "origin";

export interface StudioMeshVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioEditableVertex {
  readonly id: number;
  readonly position: StudioMeshVec3;
  readonly crease: number;
  readonly he: number; // one outgoing half-edge, -1 if isolated
}

export interface StudioEditableHalfEdge {
  readonly id: number;
  readonly vertex: number; // destination vertex
  readonly face: number; // -1 for boundary
  readonly next: number;
  readonly prev: number;
  readonly twin: number;
  readonly crease: number;
}

export interface StudioEditableFace {
  readonly id: number;
  readonly he: number; // one boundary half-edge
  readonly materialSlot: number;
  readonly smooth: boolean;
}

export interface StudioEditableMesh {
  readonly revision: typeof STUDIO_EDITABLE_MESH_REVISION;
  readonly vertices: readonly StudioEditableVertex[];
  readonly halfEdges: readonly StudioEditableHalfEdge[];
  readonly faces: readonly StudioEditableFace[];
  readonly nextVertexId: number;
  readonly nextHalfEdgeId: number;
  readonly nextFaceId: number;
}

export interface StudioMeshSelection {
  readonly mode: StudioMeshSelectionMode;
  readonly ids: readonly number[];
}

export type StudioEditableMeshFailureCode =
  | "budget-exceeded"
  | "empty-selection"
  | "invalid-mesh"
  | "invalid-parameter"
  | "non-manifold"
  | "not-found"
  | "topology-failed";

export type StudioEditableMeshResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: StudioEditableMeshFailureCode;
      readonly detail: string;
    };

export interface StudioMeshDiagnostic {
  readonly code:
    | "boundary-edge"
    | "bow-tie"
    | "inverted-shell"
    | "isolated-vertex"
    | "non-manifold-edge"
    | "zero-area-face";
  readonly severity: "info" | "warning" | "error";
  readonly ids: readonly number[];
  readonly message: string;
}

function ok<T>(value: T): StudioEditableMeshResult<T> {
  return { ok: true, value };
}

function fail<T>(
  code: StudioEditableMeshFailureCode,
  detail: string,
): StudioEditableMeshResult<T> {
  return { ok: false, code, detail };
}

function vec(
  x: number,
  y: number,
  z: number,
): StudioMeshVec3 {
  return { x, y, z };
}

function add(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: StudioMeshVec3, s: number): StudioMeshVec3 {
  return vec(a.x * s, a.y * s, a.z * s);
}

function cross(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function length(a: StudioMeshVec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: StudioMeshVec3): StudioMeshVec3 {
  const len = length(a);
  if (len <= 1e-12) return vec(0, 0, 0);
  return scale(a, 1 / len);
}

function finiteVec(v: StudioMeshVec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Unit cube centered at origin — 8 verts, 12 triangles as quads split? Use 6 quads via 2 tris each. */
export function createStudioUnitCubeMesh(): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [
    vec(-0.5, -0.5, -0.5),
    vec(0.5, -0.5, -0.5),
    vec(0.5, 0.5, -0.5),
    vec(-0.5, 0.5, -0.5),
    vec(-0.5, -0.5, 0.5),
    vec(0.5, -0.5, 0.5),
    vec(0.5, 0.5, 0.5),
    vec(-0.5, 0.5, 0.5),
  ];
  // Outward-facing CCW quads (right-hand rule). Required for Manifold solid CSG
  // and pure-convex plane half-spaces — inverted soup yields invalid topology.
  const quads: readonly (readonly [number, number, number, number])[] = [
    [0, 3, 2, 1], // -Z
    [4, 5, 6, 7], // +Z
    [0, 1, 5, 4], // -Y
    [3, 7, 6, 2], // +Y
    [0, 4, 7, 3], // -X
    [1, 2, 6, 5], // +X
  ];
  const mesh = createStudioEditableMeshFromPolygons(positions, quads);
  // A box is hard-surface geometry. Flat faces keep its planar silhouette/specular response;
  // callers that want a rounded cube can explicitly enable smoothing or bevel it.
  return {
    ...mesh,
    faces: mesh.faces.map((face) => ({ ...face, smooth: false })),
  };
}

export function createStudioEditableMeshFromPolygons(
  positions: readonly StudioMeshVec3[],
  faces: readonly (readonly number[])[],
): StudioEditableMesh {
  if (positions.length > STUDIO_EDITABLE_MESH_LIMITS.maxVertices) {
    throw new Error("vertex budget exceeded");
  }
  if (faces.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) {
    throw new Error("face budget exceeded");
  }
  for (const p of positions) {
    if (!finiteVec(p)) throw new Error("non-finite position");
  }

  const vertices: StudioEditableVertex[] = positions.map((position, id) => ({
    id,
    position,
    crease: 0,
    he: -1,
  }));
  const halfEdges: StudioEditableHalfEdge[] = [];
  const faceRecords: StudioEditableFace[] = [];
  const edgeKeyToHe = new Map<string, number>();

  const edgeKey = (a: number, b: number) => `${a}|${b}`;

  for (let fi = 0; fi < faces.length; fi += 1) {
    const loop = faces[fi]!;
    if (loop.length < 3) throw new Error(`face ${fi} needs ≥3 verts`);
    const startHe = halfEdges.length;
    const faceId = fi;
    for (let i = 0; i < loop.length; i += 1) {
      const from = loop[i]!;
      const to = loop[(i + 1) % loop.length]!;
      if (from < 0 || from >= vertices.length || to < 0 || to >= vertices.length) {
        throw new Error(`face ${fi} index out of range`);
      }
      const heId = halfEdges.length;
      halfEdges.push({
        id: heId,
        vertex: to,
        face: faceId,
        next: -1,
        prev: -1,
        twin: -1,
        crease: 0,
      });
      edgeKeyToHe.set(edgeKey(from, to), heId);
      if (vertices[from]!.he < 0) {
        vertices[from] = { ...vertices[from]!, he: heId };
      }
    }
    for (let i = 0; i < loop.length; i += 1) {
      const heId = startHe + i;
      const next = startHe + ((i + 1) % loop.length);
      const prev = startHe + ((i + loop.length - 1) % loop.length);
      halfEdges[heId] = {
        ...halfEdges[heId]!,
        next,
        prev,
      };
    }
    faceRecords.push({
      id: faceId,
      he: startHe,
      materialSlot: 0,
      smooth: true,
    });
  }

  // Twin wiring
  for (const he of halfEdges) {
    if (he.twin >= 0) continue;
    const origin = halfEdges[he.prev]!.vertex;
    const dest = he.vertex;
    const twinId = edgeKeyToHe.get(edgeKey(dest, origin));
    if (twinId !== undefined) {
      halfEdges[he.id] = { ...he, twin: twinId };
      halfEdges[twinId] = { ...halfEdges[twinId]!, twin: he.id };
    }
  }

  return {
    revision: STUDIO_EDITABLE_MESH_REVISION,
    vertices,
    halfEdges,
    faces: faceRecords,
    nextVertexId: vertices.length,
    nextHalfEdgeId: halfEdges.length,
    nextFaceId: faceRecords.length,
  };
}

export function studioEditableMeshStats(mesh: StudioEditableMesh): {
  readonly vertexCount: number;
  readonly halfEdgeCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
  readonly boundaryEdgeCount: number;
} {
  let boundary = 0;
  let edges = 0;
  for (const he of mesh.halfEdges) {
    if (he.twin < 0) boundary += 1;
    if (he.twin < 0 || he.id < he.twin) edges += 1;
  }
  return {
    vertexCount: mesh.vertices.length,
    halfEdgeCount: mesh.halfEdges.length,
    edgeCount: edges,
    faceCount: mesh.faces.length,
    boundaryEdgeCount: boundary,
  };
}

export function diagnoseStudioEditableMesh(
  mesh: StudioEditableMesh,
): readonly StudioMeshDiagnostic[] {
  const out: StudioMeshDiagnostic[] = [];
  const edgeUse = new Map<string, number[]>();
  for (const he of mesh.halfEdges) {
    if (he.twin < 0) {
      out.push({
        code: "boundary-edge",
        severity: "info",
        ids: [he.id],
        message: `Boundary half-edge ${he.id}`,
      });
    }
    const origin = mesh.halfEdges[he.prev]?.vertex ?? -1;
    const a = Math.min(origin, he.vertex);
    const b = Math.max(origin, he.vertex);
    const key = `${a}|${b}`;
    const list = edgeUse.get(key) ?? [];
    list.push(he.id);
    edgeUse.set(key, list);
  }
  for (const [key, hes] of edgeUse) {
    if (hes.length > 2) {
      out.push({
        code: "non-manifold-edge",
        severity: "error",
        ids: hes,
        message: `Non-manifold edge ${key} used ${hes.length} times`,
      });
    }
  }
  for (const v of mesh.vertices) {
    if (v.he < 0) {
      out.push({
        code: "isolated-vertex",
        severity: "warning",
        ids: [v.id],
        message: `Isolated vertex ${v.id}`,
      });
    }
  }
  for (const face of mesh.faces) {
    const area = faceArea(mesh, face.id);
    if (area <= STUDIO_EDITABLE_MESH_LIMITS.areaEpsilon) {
      out.push({
        code: "zero-area-face",
        severity: "error",
        ids: [face.id],
        message: `Zero-area face ${face.id}`,
      });
    }
  }
  return out;
}

const studioEditableFaceIndexCache = new WeakMap<
  StudioEditableMesh,
  ReadonlyMap<number, StudioEditableFace>
>();

function indexedFace(mesh: StudioEditableMesh, faceId: number): StudioEditableFace | undefined {
  let index = studioEditableFaceIndexCache.get(mesh);
  if (!index) {
    index = new Map(mesh.faces.map((face) => [face.id, face] as const));
    studioEditableFaceIndexCache.set(mesh, index);
  }
  return index.get(faceId);
}

function faceLoopVertexIds(mesh: StudioEditableMesh, faceId: number): number[] {
  const face = indexedFace(mesh, faceId);
  if (!face) return [];
  const ids: number[] = [];
  let he = face.he;
  const start = he;
  let guard = 0;
  do {
    // Origin of half-edge he (destination of prev) — matches polygon construction order.
    const origin = mesh.halfEdges[mesh.halfEdges[he]!.prev]!.vertex;
    ids.push(origin);
    he = mesh.halfEdges[he]!.next;
    guard += 1;
    if (guard > mesh.halfEdges.length + 2) break;
  } while (he !== start);
  return ids;
}

function faceArea(mesh: StudioEditableMesh, faceId: number): number {
  const ids = faceLoopVertexIds(mesh, faceId);
  if (ids.length < 3) return 0;
  const origin = mesh.vertices[ids[0]!]!.position;
  let accum = vec(0, 0, 0);
  for (let i = 1; i + 1 < ids.length; i += 1) {
    const a = sub(mesh.vertices[ids[i]!]!.position, origin);
    const b = sub(mesh.vertices[ids[i + 1]!]!.position, origin);
    accum = add(accum, cross(a, b));
  }
  return 0.5 * length(accum);
}

export function faceNormalStudioEditableMesh(
  mesh: StudioEditableMesh,
  faceId: number,
): StudioMeshVec3 {
  const ids = faceLoopVertexIds(mesh, faceId);
  if (ids.length < 3) return vec(0, 1, 0);
  const origin = mesh.vertices[ids[0]!]!.position;
  let accum = vec(0, 0, 0);
  for (let i = 1; i + 1 < ids.length; i += 1) {
    const a = sub(mesh.vertices[ids[i]!]!.position, origin);
    const b = sub(mesh.vertices[ids[i + 1]!]!.position, origin);
    accum = add(accum, cross(a, b));
  }
  return normalize(accum);
}

export function selectStudioMeshElements(
  mesh: StudioEditableMesh,
  mode: StudioMeshSelectionMode,
  ids: readonly number[],
): StudioEditableMeshResult<StudioMeshSelection> {
  if (ids.length > STUDIO_EDITABLE_MESH_LIMITS.maxSelection) {
    return fail("budget-exceeded", "selection too large");
  }
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  for (const id of unique) {
    if (mode === "vertex" && !mesh.vertices.some((v) => v.id === id)) {
      return fail("not-found", `vertex ${id}`);
    }
    if (mode === "face" && !mesh.faces.some((f) => f.id === id)) {
      return fail("not-found", `face ${id}`);
    }
    if (mode === "edge") {
      const he = mesh.halfEdges.find((h) => h.id === id);
      if (!he) return fail("not-found", `edge/he ${id}`);
    }
  }
  return ok({ mode, ids: unique });
}

/**
 * MOD-002: edge loop walk from a seed half-edge.
 * On non-manifold or pole termination, stops predictably (returns partial loop + stopped reason).
 */
export function selectStudioMeshEdgeLoop(
  mesh: StudioEditableMesh,
  startHalfEdgeId: number,
): StudioEditableMeshResult<{
  readonly selection: StudioMeshSelection;
  readonly stopped: "closed" | "boundary" | "non-manifold" | "pole" | "budget";
}> {
  const start = mesh.halfEdges.find((h) => h.id === startHalfEdgeId);
  if (!start) return fail("not-found", `he ${startHalfEdgeId}`);
  const ids: number[] = [];
  const seen = new Set<number>();
  let he = start.id;
  let stopped: "closed" | "boundary" | "non-manifold" | "pole" | "budget" = "budget";
  for (let i = 0; i < STUDIO_EDITABLE_MESH_LIMITS.maxSelection; i += 1) {
    if (seen.has(he)) {
      stopped = "closed";
      break;
    }
    seen.add(he);
    ids.push(he);
    const cur = mesh.halfEdges[he]!;
    if (cur.twin < 0) {
      stopped = "boundary";
      break;
    }
    // Advance: twin → next → next (quad-strip loop step)
    const twin = mesh.halfEdges[cur.twin]!;
    const after = mesh.halfEdges[twin.next]!;
    // Pole heuristic: if destination vertex valence > 4, stop
    const valence = mesh.halfEdges.filter(
      (h) => mesh.halfEdges[h.prev]!.vertex === after.vertex || h.vertex === after.vertex,
    ).length;
    he = after.next;
    if (valence > 8) {
      stopped = "pole";
      break;
    }
    if (he === start.id) {
      stopped = "closed";
      break;
    }
  }
  return ok({
    selection: { mode: "edge", ids: [...new Set(ids)].sort((a, b) => a - b) },
    stopped,
  });
}

/** MOD-002: face ring — faces sharing edges around a seed face (1-ring). */
export function selectStudioMeshFaceRing(
  mesh: StudioEditableMesh,
  seedFaceId: number,
): StudioEditableMeshResult<StudioMeshSelection> {
  const face = mesh.faces.find((f) => f.id === seedFaceId);
  if (!face) return fail("not-found", `face ${seedFaceId}`);
  const ids = new Set<number>([seedFaceId]);
  let he = face.he;
  const start = he;
  do {
    const cur = mesh.halfEdges[he]!;
    if (cur.twin >= 0) {
      const twinFace = mesh.halfEdges[cur.twin]!.face;
      if (twinFace >= 0) ids.add(twinFace);
    }
    he = cur.next;
  } while (he !== start);
  return ok({ mode: "face", ids: [...ids].sort((a, b) => a - b) });
}

export interface StudioMeshTransformParams {
  readonly translate?: StudioMeshVec3;
  readonly rotateEulerRad?: StudioMeshVec3;
  readonly scale?: StudioMeshVec3;
  readonly pivot?: StudioMeshVec3;
  readonly orientation?: StudioMeshTransformOrientation;
  readonly pivotMode?: StudioMeshPivotMode;
  readonly customAxis?: StudioMeshVec3;
}

function rotateYXZ(v: StudioMeshVec3, euler: StudioMeshVec3): StudioMeshVec3 {
  // XYZ intrinsic like geometry-nodes (apply Z then Y then X on column vectors via matrices)
  const { x: rx, y: ry, z: rz } = euler;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  const m00 = cz * cy;
  const m01 = cz * sy * sx - sz * cx;
  const m02 = cz * sy * cx + sz * sx;
  const m10 = sz * cy;
  const m11 = sz * sy * sx + cz * cx;
  const m12 = sz * sy * cx - cz * sx;
  const m20 = -sy;
  const m21 = cy * sx;
  const m22 = cy * cx;
  return vec(
    m00 * v.x + m01 * v.y + m02 * v.z,
    m10 * v.x + m11 * v.y + m12 * v.z,
    m20 * v.x + m21 * v.y + m22 * v.z,
  );
}

export function transformStudioEditableMesh(
  mesh: StudioEditableMesh,
  selection: StudioMeshSelection,
  params: StudioMeshTransformParams,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (selection.mode !== "vertex" && selection.mode !== "face" && selection.mode !== "edge") {
    return fail("invalid-parameter", "unknown selection mode");
  }
  const vertexIds = new Set<number>();
  if (selection.mode === "vertex") {
    for (const id of selection.ids) vertexIds.add(id);
  } else if (selection.mode === "face") {
    for (const fid of selection.ids) {
      for (const vid of faceLoopVertexIds(mesh, fid)) vertexIds.add(vid);
    }
  } else {
    for (const heId of selection.ids) {
      const he = mesh.halfEdges.find((h) => h.id === heId);
      if (!he) return fail("not-found", `he ${heId}`);
      vertexIds.add(he.vertex);
      vertexIds.add(mesh.halfEdges[he.prev]!.vertex);
    }
  }
  if (vertexIds.size === 0) return fail("empty-selection", "no vertices to transform");

  let pivot = params.pivot ?? vec(0, 0, 0);
  if (!params.pivot) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const id of vertexIds) {
      const p = mesh.vertices.find((v) => v.id === id)!.position;
      sx += p.x;
      sy += p.y;
      sz += p.z;
    }
    const n = vertexIds.size;
    pivot = vec(sx / n, sy / n, sz / n);
  }

  const translate = params.translate ?? vec(0, 0, 0);
  const rotate = params.rotateEulerRad ?? vec(0, 0, 0);
  const scl = params.scale ?? vec(1, 1, 1);
  if (!finiteVec(translate) || !finiteVec(rotate) || !finiteVec(scl) || !finiteVec(pivot)) {
    return fail("invalid-parameter", "non-finite transform");
  }

  const vertices = mesh.vertices.map((v) => {
    if (!vertexIds.has(v.id)) return v;
    let p = sub(v.position, pivot);
    p = vec(p.x * scl.x, p.y * scl.y, p.z * scl.z);
    p = rotateYXZ(p, rotate);
    p = add(add(p, pivot), translate);
    return { ...v, position: p };
  });

  return ok({ ...mesh, vertices });
}

/** Extrude selected faces along average normal by distance (region extrude). */
export function extrudeStudioEditableMeshFaces(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  distance: number,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(distance)) {
    return fail("invalid-parameter", "distance must be finite");
  }
  if (faceIds.length === 0) return fail("empty-selection", "no faces");
  if (mesh.faces.length + faceIds.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) {
    return fail("budget-exceeded", "face budget");
  }

  // Convert to triangle soup with duplicated extruded region, rebuild half-edge.
  const polygons: number[][] = [];
  const positions: StudioMeshVec3[] = mesh.vertices.map((v) => v.position);
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));

  for (const face of mesh.faces) {
    if (faceIds.includes(face.id)) continue;
    const loop = faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id)!);
    polygons.push(loop);
  }

  for (const fid of faceIds) {
    const face = mesh.faces.find((f) => f.id === fid);
    if (!face) return fail("not-found", `face ${fid}`);
    const n = faceNormalStudioEditableMesh(mesh, fid);
    const offset = scale(n, distance);
    const oldLoop = faceLoopVertexIds(mesh, fid);
    const newLoop: number[] = [];
    for (const vid of oldLoop) {
      const p = mesh.vertices.find((v) => v.id === vid)!.position;
      newLoop.push(positions.length);
      positions.push(add(p, offset));
    }
    polygons.push(newLoop);
    // side walls
    for (let i = 0; i < oldLoop.length; i += 1) {
      const a = idMap.get(oldLoop[i]!)!;
      const b = idMap.get(oldLoop[(i + 1) % oldLoop.length]!)!;
      const c = newLoop[(i + 1) % newLoop.length]!;
      const d = newLoop[i]!;
      polygons.push([a, b, c, d]);
    }
  }

  try {
    return ok(createStudioEditableMeshFromPolygons(positions, polygons));
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "extrude rebuild failed",
    );
  }
}

/** Inset selected faces by factor in [0, 0.49]. */
export function insetStudioEditableMeshFaces(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  factor: number,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(factor) || factor <= 0 || factor >= 0.5) {
    return fail("invalid-parameter", "factor must be in (0, 0.5)");
  }
  if (faceIds.length === 0) return fail("empty-selection", "no faces");

  const positions: StudioMeshVec3[] = mesh.vertices.map((v) => v.position);
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const polygons: number[][] = [];

  for (const face of mesh.faces) {
    if (faceIds.includes(face.id)) continue;
    polygons.push(faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id)!));
  }

  for (const fid of faceIds) {
    const loop = faceLoopVertexIds(mesh, fid);
    if (loop.length < 3) return fail("invalid-mesh", `face ${fid}`);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const vid of loop) {
      const p = mesh.vertices.find((v) => v.id === vid)!.position;
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const n = loop.length;
    const center = vec(cx / n, cy / n, cz / n);
    const inner: number[] = [];
    for (const vid of loop) {
      const p = mesh.vertices.find((v) => v.id === vid)!.position;
      const q = add(p, scale(sub(center, p), factor));
      inner.push(positions.length);
      positions.push(q);
    }
    polygons.push(inner);
    for (let i = 0; i < loop.length; i += 1) {
      const a = idMap.get(loop[i]!)!;
      const b = idMap.get(loop[(i + 1) % loop.length]!)!;
      const c = inner[(i + 1) % inner.length]!;
      const d = inner[i]!;
      polygons.push([a, b, c, d]);
    }
  }

  try {
    return ok(createStudioEditableMeshFromPolygons(positions, polygons));
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "inset rebuild failed",
    );
  }
}

/**
 * Bevel selected edges with topology change (MOD-006).
 * Manifold edge with two faces: insert four offset verts + one chamfer face (segments=1).
 * Cube one-edge bevel: 8v/6f → 12v/7f.
 */
export function bevelStudioEditableMeshEdges(
  mesh: StudioEditableMesh,
  halfEdgeIds: readonly number[],
  amount: number,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("invalid-parameter", "amount must be > 0");
  }
  if (halfEdgeIds.length === 0) return fail("empty-selection", "no edges");

  const t = Math.min(0.49, Math.max(0.01, amount));
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const positions: StudioMeshVec3[] = mesh.vertices.map((v) => v.position);
  const faceLoops: number[][] = mesh.faces.map((face) =>
    faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id)!),
  );

  // Undirected selected edges (by original vertex ids)
  const undirected = new Set<string>();
  for (const heId of halfEdgeIds) {
    const he = mesh.halfEdges.find((h) => h.id === heId);
    if (!he) return fail("not-found", `he ${heId}`);
    const a = mesh.halfEdges[he.prev]!.vertex;
    const b = he.vertex;
    undirected.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }

  const newFaces: number[][] = [];

  for (const key of undirected) {
    const [aIdStr, bIdStr] = key.split("|");
    const aOrig = Number(aIdStr);
    const bOrig = Number(bIdStr);
    const aIdx = idMap.get(aOrig);
    const bIdx = idMap.get(bOrig);
    if (aIdx === undefined || bIdx === undefined) {
      return fail("topology-failed", "bevel edge vertices missing");
    }

    // Find faces that contain directed edge a→b or b→a
    type Hit = { faceIndex: number; dir: "ab" | "ba"; prev: number; next: number };
    const hits: Hit[] = [];
    for (let fi = 0; fi < faceLoops.length; fi += 1) {
      const loop = faceLoops[fi]!;
      for (let i = 0; i < loop.length; i += 1) {
        const u = loop[i]!;
        const v = loop[(i + 1) % loop.length]!;
        const prev = loop[(i + loop.length - 1) % loop.length]!;
        const next = loop[(i + 2) % loop.length]!;
        if (u === aIdx && v === bIdx) {
          hits.push({ faceIndex: fi, dir: "ab", prev, next });
        } else if (u === bIdx && v === aIdx) {
          hits.push({ faceIndex: fi, dir: "ba", prev, next });
        }
      }
    }
    if (hits.length === 0) {
      return fail("topology-failed", "selected edge not found on any face");
    }
    if (hits.length > 2) {
      return fail("non-manifold", "cannot bevel non-manifold edge");
    }

    const posOf = (idx: number) => positions[idx]!;
    const makeOffset = (from: number, toward: number): number => {
      const p = add(posOf(from), scale(sub(posOf(toward), posOf(from)), t));
      const idx = positions.length;
      positions.push(p);
      return idx;
    };

    if (hits.length === 1) {
      // Boundary edge: insert two verts and a thin bevel strip as a quad with a degenerate back
      const hit = hits[0]!;
      const a1 = makeOffset(aIdx, hit.prev);
      const b1 = makeOffset(bIdx, hit.next);
      const loop = faceLoops[hit.faceIndex]!;
      const replaced: number[] = [];
      for (let i = 0; i < loop.length; i += 1) {
        const u = loop[i]!;
        const v = loop[(i + 1) % loop.length]!;
        replaced.push(u);
        if (
          (hit.dir === "ab" && u === aIdx && v === bIdx)
          || (hit.dir === "ba" && u === bIdx && v === aIdx)
        ) {
          if (hit.dir === "ab") {
            replaced[replaced.length - 1] = a1;
            replaced.push(b1);
          } else {
            replaced[replaced.length - 1] = b1;
            replaced.push(a1);
          }
        }
      }
      faceLoops[hit.faceIndex] = replaced;
      newFaces.push([aIdx, bIdx, b1, a1]);
      continue;
    }

    // Two-face manifold bevel
    const hitAb = hits.find((h) => h.dir === "ab") ?? hits[0]!;
    const hitBa = hits.find((h) => h.dir === "ba") ?? hits[1]!;
    // On ab face: ... prev - a - b - next ...
    const a1 = makeOffset(aIdx, hitAb.prev);
    const b1 = makeOffset(bIdx, hitAb.next);
    // On ba face: ... prev - b - a - next ... so prev is neighbor of b, next neighbor of a
    const b2 = makeOffset(bIdx, hitBa.prev);
    const a2 = makeOffset(aIdx, hitBa.next);

    for (const hit of [hitAb, hitBa]) {
      const loop = faceLoops[hit.faceIndex]!;
      const replaced: number[] = [];
      for (let i = 0; i < loop.length; i += 1) {
        const u = loop[i]!;
        const v = loop[(i + 1) % loop.length]!;
        if (hit.dir === "ab" && u === aIdx && v === bIdx) {
          replaced.push(a1, b1);
          // skip emitting original u; next iteration will emit from b's successors
          // We already consumed the edge; don't push u
          continue;
        }
        if (hit.dir === "ba" && u === bIdx && v === aIdx) {
          replaced.push(b2, a2);
          continue;
        }
        // Avoid double-pushing when previous step advanced past edge
        if (replaced.length > 0 && replaced[replaced.length - 1] === u) {
          // already placed as end of bevel insert
        } else {
          replaced.push(u);
        }
      }
      // Dedup consecutive
      const clean: number[] = [];
      for (const idx of replaced) {
        if (clean.length === 0 || clean[clean.length - 1] !== idx) clean.push(idx);
      }
      if (clean.length >= 2 && clean[0] === clean[clean.length - 1]) clean.pop();
      faceLoops[hit.faceIndex] = clean;
    }
    // Chamfer face along the original edge
    newFaces.push([a1, b1, b2, a2]);
  }

  const polygons = [...faceLoops, ...newFaces].filter((loop) => loop.length >= 3);
  try {
    const next = createStudioEditableMeshFromPolygons(positions, polygons);
    const before = studioEditableMeshStats(mesh);
    const after = studioEditableMeshStats(next);
    if (after.vertexCount <= before.vertexCount && after.faceCount <= before.faceCount) {
      return fail(
        "topology-failed",
        `bevel did not increase topology (v ${before.vertexCount}→${after.vertexCount}, f ${before.faceCount}→${after.faceCount})`,
      );
    }
    return ok(next);
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "bevel rebuild failed",
    );
  }
}

/** JSON-safe mesh snapshot for OPFS recovery / undo stacks. */
export interface StudioEditableMeshSnapshot {
  readonly revision: typeof STUDIO_EDITABLE_MESH_REVISION;
  readonly positions: readonly (readonly [number, number, number])[];
  readonly faces: readonly (readonly number[])[];
  readonly faceAttributes?: readonly {
    readonly faceIndex: number;
    readonly materialSlot: number;
    readonly smooth: boolean;
  }[];
  readonly vertexCreases?: readonly {
    readonly vertexIndex: number;
    readonly crease: number;
  }[];
  readonly halfEdgeCreases?: readonly {
    readonly faceIndex: number;
    readonly edgeIndex: number;
    readonly crease: number;
  }[];
}

export function serializeStudioEditableMesh(
  mesh: StudioEditableMesh,
): StudioEditableMeshSnapshot {
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const positions = mesh.vertices.map(
    (v) => [v.position.x, v.position.y, v.position.z] as const,
  );
  const faces = mesh.faces.map((face) =>
    faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id)!),
  );
  const halfEdgeCreases: Array<{
    readonly faceIndex: number;
    readonly edgeIndex: number;
    readonly crease: number;
  }> = [];
  mesh.faces.forEach((face, faceIndex) => {
    let halfEdgeId = face.he;
    let edgeIndex = 0;
    do {
      const halfEdge = mesh.halfEdges[halfEdgeId]!;
      if (halfEdge.crease !== 0) {
        halfEdgeCreases.push({ faceIndex, edgeIndex, crease: halfEdge.crease });
      }
      halfEdgeId = halfEdge.next;
      edgeIndex += 1;
    } while (halfEdgeId !== face.he && edgeIndex <= mesh.halfEdges.length);
  });
  return {
    revision: STUDIO_EDITABLE_MESH_REVISION,
    positions,
    faces,
    faceAttributes: mesh.faces.map((face, faceIndex) => ({
      faceIndex,
      materialSlot: face.materialSlot,
      smooth: face.smooth,
    })),
    vertexCreases: mesh.vertices.flatMap((vertex, vertexIndex) => (
      vertex.crease === 0 ? [] : [{ vertexIndex, crease: vertex.crease }]
    )),
    halfEdgeCreases,
  };
}

export function deserializeStudioEditableMesh(
  snapshot: StudioEditableMeshSnapshot,
): StudioEditableMesh {
  const positions = snapshot.positions.map(([x, y, z]) => vec(x, y, z));
  const base = createStudioEditableMeshFromPolygons(positions, snapshot.faces);
  const vertexCreases = new Map(
    (snapshot.vertexCreases ?? []).map((entry) => [entry.vertexIndex, entry.crease] as const),
  );
  const faceAttributes = new Map(
    (snapshot.faceAttributes ?? []).map((entry) => [entry.faceIndex, entry] as const),
  );
  const halfEdgeCreases = new Map<string, number>(
    (snapshot.halfEdgeCreases ?? []).map((entry) => (
      [`${entry.faceIndex}:${entry.edgeIndex}`, entry.crease] as const
    )),
  );
  const halfEdgeLocation = new Map<number, string>();
  base.faces.forEach((face, faceIndex) => {
    let halfEdgeId = face.he;
    let edgeIndex = 0;
    do {
      halfEdgeLocation.set(halfEdgeId, `${faceIndex}:${edgeIndex}`);
      halfEdgeId = base.halfEdges[halfEdgeId]!.next;
      edgeIndex += 1;
    } while (halfEdgeId !== face.he && edgeIndex <= base.halfEdges.length);
  });
  return {
    ...base,
    vertices: base.vertices.map((vertex, vertexIndex) => ({
      ...vertex,
      crease: vertexCreases.get(vertexIndex) ?? 0,
    })),
    halfEdges: base.halfEdges.map((halfEdge) => ({
      ...halfEdge,
      crease: halfEdgeCreases.get(halfEdgeLocation.get(halfEdge.id) ?? "") ?? 0,
    })),
    faces: base.faces.map((face, faceIndex) => {
      const attributes = faceAttributes.get(faceIndex);
      return attributes ? {
        ...face,
        materialSlot: attributes.materialSlot,
        smooth: attributes.smooth,
      } : face;
    }),
  };
}

/** Loop cut on a quad strip: inserts a ring of vertices at factor along each selected edge pair. */
export function loopCutStudioEditableMesh(
  mesh: StudioEditableMesh,
  startHalfEdgeId: number,
  factor = 0.5,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(factor) || factor <= 0 || factor >= 1) {
    return fail("invalid-parameter", "factor must be in (0,1)");
  }
  const start = mesh.halfEdges.find((h) => h.id === startHalfEdgeId);
  if (!start) return fail("not-found", `he ${startHalfEdgeId}`);

  // Collect a simple loop: walk next.twin.next around faces until return or break.
  const loop: number[] = [];
  let he = start.id;
  const seen = new Set<number>();
  for (let i = 0; i < mesh.halfEdges.length; i += 1) {
    if (seen.has(he)) break;
    seen.add(he);
    loop.push(he);
    const cur = mesh.halfEdges[he]!;
    if (cur.twin < 0) break;
    const twin = mesh.halfEdges[cur.twin]!;
    he = twin.next;
    const after = mesh.halfEdges[he]!;
    he = after.next;
    if (he === start.id) {
      loop.push(he);
      break;
    }
  }

  if (loop.length < 2) {
    return fail("topology-failed", "could not walk loop");
  }

  const positions = mesh.vertices.map((v) => v.position);
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const splitMap = new Map<string, number>(); // undirected edge -> new vertex index

  for (const heId of loop) {
    const heRec = mesh.halfEdges[heId]!;
    const a = mesh.halfEdges[heRec.prev]!.vertex;
    const b = heRec.vertex;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (splitMap.has(key)) continue;
    const pa = mesh.vertices.find((v) => v.id === a)!.position;
    const pb = mesh.vertices.find((v) => v.id === b)!.position;
    const p = add(pa, scale(sub(pb, pa), factor));
    splitMap.set(key, positions.length);
    positions.push(p);
  }

  const polygons: number[][] = [];
  for (const face of mesh.faces) {
    const verts = faceLoopVertexIds(mesh, face.id);
    const newLoop: number[] = [];
    for (let i = 0; i < verts.length; i += 1) {
      const a = verts[i]!;
      const b = verts[(i + 1) % verts.length]!;
      newLoop.push(idMap.get(a)!);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const mid = splitMap.get(key);
      if (mid !== undefined) newLoop.push(mid);
    }
    // Fan-split n-gon into quads/tris by ear from first — keep as single polygon for half-edge
    polygons.push(newLoop);
  }

  try {
    return ok(createStudioEditableMeshFromPolygons(positions, polygons));
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "loop cut failed",
    );
  }
}

export function weldStudioEditableMesh(
  mesh: StudioEditableMesh,
  quantum: number = STUDIO_EDITABLE_MESH_LIMITS.weldQuantumDefault,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(quantum) || quantum <= 0) {
    return fail("invalid-parameter", "quantum must be > 0");
  }
  const keyOf = (p: StudioMeshVec3) => {
    const q = 1 / quantum;
    return `${Math.round(p.x * q)}|${Math.round(p.y * q)}|${Math.round(p.z * q)}`;
  };
  const map = new Map<string, number>();
  const positions: StudioMeshVec3[] = [];
  const remap = new Map<number, number>();
  for (const v of mesh.vertices) {
    const key = keyOf(v.position);
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length;
      map.set(key, idx);
      positions.push(v.position);
    }
    remap.set(v.id, idx);
  }
  const polygons: number[][] = [];
  for (const face of mesh.faces) {
    const loop = faceLoopVertexIds(mesh, face.id).map((id) => remap.get(id)!);
    const dedup: number[] = [];
    for (const idx of loop) {
      if (dedup.length === 0 || dedup[dedup.length - 1] !== idx) dedup.push(idx);
    }
    if (dedup.length >= 2 && dedup[0] === dedup[dedup.length - 1]) dedup.pop();
    if (dedup.length >= 3) polygons.push(dedup);
  }
  try {
    return ok(createStudioEditableMeshFromPolygons(positions, polygons));
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "weld failed",
    );
  }
}

export function dissolveStudioEditableMeshFaces(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
): StudioEditableMeshResult<StudioEditableMesh> {
  if (faceIds.length === 0) return fail("empty-selection", "no faces");
  const drop = new Set(faceIds);
  if (drop.size >= mesh.faces.length) {
    return fail("invalid-parameter", "cannot dissolve all faces");
  }
  const positions = mesh.vertices.map((v) => v.position);
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const polygons: number[][] = [];
  for (const face of mesh.faces) {
    if (drop.has(face.id)) continue;
    polygons.push(faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id)!));
  }
  try {
    return ok(createStudioEditableMeshFromPolygons(positions, polygons));
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "dissolve failed",
    );
  }
}

export function setStudioEditableMeshCrease(
  mesh: StudioEditableMesh,
  halfEdgeIds: readonly number[],
  crease: number,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(crease) || crease < 0 || crease > 1) {
    return fail("invalid-parameter", "crease in [0,1]");
  }
  const set = new Set(halfEdgeIds);
  const halfEdges = mesh.halfEdges.map((he) =>
    set.has(he.id) ? { ...he, crease } : he,
  );
  return ok({ ...mesh, halfEdges });
}

export function setStudioEditableMeshFaceSmooth(
  mesh: StudioEditableMesh,
  faceIds: readonly number[],
  smooth: boolean,
): StudioEditableMeshResult<StudioEditableMesh> {
  const set = new Set(faceIds);
  const faces = mesh.faces.map((f) => (set.has(f.id) ? { ...f, smooth } : f));
  return ok({ ...mesh, faces });
}

/**
 * MOD-008 knife / plane cut through mesh: split faces crossed by plane, keep both sides.
 * Returns mesh with inserted verts along cut and split faces (topology change).
 */
export function knifeStudioEditableMesh(
  mesh: StudioEditableMesh,
  plane: {
    readonly point: StudioMeshVec3;
    readonly normal: StudioMeshVec3;
  },
): StudioEditableMeshResult<StudioEditableMesh> {
  const n = normalize(plane.normal);
  if (length(n) < 1e-12) return fail("invalid-parameter", "knife plane normal");
  const d = -(n.x * plane.point.x + n.y * plane.point.y + n.z * plane.point.z);
  const sideOf = (p: StudioMeshVec3) => n.x * p.x + n.y * p.y + n.z * p.z + d;

  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions: number[] = [...soup.positions];
  const edgeCut = new Map<string, number>();
  const cutOnEdge = (a: number, b: number): number | null => {
    const sa = sideOf({
      x: soup.positions[a * 3]!,
      y: soup.positions[a * 3 + 1]!,
      z: soup.positions[a * 3 + 2]!,
    });
    const sb = sideOf({
      x: soup.positions[b * 3]!,
      y: soup.positions[b * 3 + 1]!,
      z: soup.positions[b * 3 + 2]!,
    });
    if (sa * sb >= 0) return null;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const existing = edgeCut.get(key);
    if (existing !== undefined) return existing;
    const t = sa / (sa - sb);
    const idx = positions.length / 3;
    positions.push(
      soup.positions[a * 3]! + (soup.positions[b * 3]! - soup.positions[a * 3]!) * t,
      soup.positions[a * 3 + 1]!
        + (soup.positions[b * 3 + 1]! - soup.positions[a * 3 + 1]!) * t,
      soup.positions[a * 3 + 2]!
        + (soup.positions[b * 3 + 2]! - soup.positions[a * 3 + 2]!) * t,
    );
    edgeCut.set(key, idx);
    return idx;
  };

  const faces: number[][] = [];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const i0 = soup.indices[t]!;
    const i1 = soup.indices[t + 1]!;
    const i2 = soup.indices[t + 2]!;
    const c01 = cutOnEdge(i0, i1);
    const c12 = cutOnEdge(i1, i2);
    const c20 = cutOnEdge(i2, i0);
    const cuts = [c01, c12, c20].filter((c): c is number => c !== null);
    if (cuts.length === 0) {
      faces.push([i0, i1, i2]);
      continue;
    }
    if (cuts.length === 2) {
      // Split into triangle + quad → 3 tris
      if (c01 !== null && c12 !== null) {
        faces.push([i0, c01, i2], [c01, i1, c12], [c01, c12, i2]);
      } else if (c12 !== null && c20 !== null) {
        faces.push([i0, i1, c12], [i0, c12, c20], [c20, c12, i2]);
      } else if (c20 !== null && c01 !== null) {
        faces.push([i0, c01, c20], [c01, i1, i2], [c20, c01, i2]);
      }
    } else {
      faces.push([i0, i1, i2]);
    }
  }

  try {
    const verts = [];
    for (let i = 0; i < positions.length; i += 3) {
      verts.push(vec(positions[i]!, positions[i + 1]!, positions[i + 2]!));
    }
    const next = createStudioEditableMeshFromPolygons(verts, faces);
    const before = studioEditableMeshStats(mesh);
    const after = studioEditableMeshStats(next);
    if (after.vertexCount <= before.vertexCount) {
      // Plane missed mesh — still valid knife with no cut
      return ok(mesh);
    }
    return ok(next);
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "knife failed",
    );
  }
}

/** Export triangle positions/indices for render cache or Manifold (derived only). */
export function studioEditableMeshToTriangleSoup(mesh: StudioEditableMesh): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
} {
  const positions = new Float32Array(mesh.vertices.length * 3);
  const indexOf = new Map<number, number>();
  mesh.vertices.forEach((v, i) => {
    indexOf.set(v.id, i);
    positions[i * 3] = v.position.x;
    positions[i * 3 + 1] = v.position.y;
    positions[i * 3 + 2] = v.position.z;
  });
  const tris: number[] = [];
  for (const face of mesh.faces) {
    const loop = faceLoopVertexIds(mesh, face.id).map((id) => indexOf.get(id)!);
    for (let i = 1; i + 1 < loop.length; i += 1) {
      tris.push(loop[0]!, loop[i]!, loop[i + 1]!);
    }
  }
  return { positions, indices: new Uint32Array(tris) };
}

export function hashStudioEditableMesh(mesh: StudioEditableMesh): string {
  // Structural fingerprint for undo/recovery tests (not crypto).
  const parts: string[] = [`v${mesh.vertices.length}`, `f${mesh.faces.length}`, `h${mesh.halfEdges.length}`];
  for (const v of mesh.vertices) {
    parts.push(
      `${v.id}:${v.position.x.toFixed(5)},${v.position.y.toFixed(5)},${v.position.z.toFixed(5)}:${v.crease}`,
    );
  }
  for (const f of mesh.faces) {
    parts.push(`F${f.id}:${faceLoopVertexIds(mesh, f.id).join(",")}:${f.smooth ? 1 : 0}`);
  }
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `mesh:${(h >>> 0).toString(16).padStart(8, "0")}`;
}
