/**
 * Google Ink triangle mesh → editable `PathIR` outline.
 *
 * ADR 0005 keeps `google-ink-mesh` behind a PoC gate in `compileVectorBrush`, and one of the four
 * named promotion conditions is that "mesh→PathIR 변환 비용이 게이트 내" — a cost nobody had
 * measured, because no mesh→PathIR conversion existed. The gate could not open on evidence that
 * was never produced. This module is that conversion, written so the cost and the fidelity can
 * both be measured (see tests/benchmarks/harness/ink-mesh-path.ts).
 *
 * The conversion is boundary extraction, not tessellation-in-reverse. Ink's tip geometry is a
 * triangle soup covering the stroke; its silhouette is exactly the set of edges used by ONE
 * triangle. Interior edges are shared by two and cancel. Chaining the survivors gives closed
 * loops, which is what an editable fill path is.
 *
 * Two properties matter for an editable proxy and both are asserted by the tests:
 * - the outline encloses the same area as the mesh it came from, so the proxy is not a different
 *   shape from what the engine drew;
 * - loop winding is normalised so the outer contour is positive and holes are negative, which is
 *   what `fill-rule: nonzero` needs in order to punch a hole rather than fill it twice.
 */

import type { InkStrokeMesh } from "./ink-mesh";
import type { PathIR, PathVerbIR } from "@toonspectrum/studio-project-model";


export interface InkMeshPathConversion {
  path: PathIR;
  /** One entry per closed contour, in emission order. */
  loops: readonly InkMeshPathLoop[];
  /** Signed area of the mesh triangles (absolute value; the mesh may wind either way). */
  meshArea: number;
  /** Total absolute area enclosed by the emitted contours. */
  pathArea: number;
  /** |meshArea - pathArea| / meshArea. 0 means the proxy encloses exactly the drawn shape. */
  areaError: number;
  boundaryEdgeCount: number;
}

export interface InkMeshPathLoop {
  vertexCount: number;
  /** Positive for an outer contour, negative for a hole. */
  signedArea: number;
}

export class InkMeshPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InkMeshPathError";
  }
}

/** Undirected edge key. Boundary edges appear once; interior edges twice and cancel. */
function edgeKey(a: number, b: number): number {
  // Vertex indices are Uint32 but a real stroke mesh is far below 2^21 vertices, so packing two
  // into one double keeps the map keys primitive — string keys dominated the profile otherwise.
  return a < b ? a * 4_194_304 + b : b * 4_194_304 + a;
}

function triangleSignedArea(
  vertices: Float32Array,
  a: number,
  b: number,
  c: number,
): number {
  const ax = vertices[a * 2]!;
  const ay = vertices[a * 2 + 1]!;
  const bx = vertices[b * 2]!;
  const by = vertices[b * 2 + 1]!;
  const cx = vertices[c * 2]!;
  const cy = vertices[c * 2 + 1]!;
  return ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

function loopSignedArea(vertices: Float32Array, loop: readonly number[]): number {
  let area = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index]!;
    const next = loop[(index + 1) % loop.length]!;
    area += vertices[current * 2]! * vertices[next * 2 + 1]!
      - vertices[next * 2]! * vertices[current * 2 + 1]!;
  }
  return area / 2;
}

/**
 * Convert a stroke mesh into closed outline contours.
 *
 * Deterministic: edges are walked in triangle order and each vertex's outgoing boundary edges are
 * consumed in insertion order, so the same mesh always yields the same verb list. That is required
 * for the fidelity lab to hash a converted path the way it hashes the mesh.
 */
export function inkStrokeMeshToPathIR(mesh: InkStrokeMesh): InkMeshPathConversion {
  const { vertices, triangles, triangleCount } = mesh;
  if (triangleCount === 0) {
    return {
      path: { verbs: [] },
      loops: [],
      meshArea: 0,
      pathArea: 0,
      areaError: 0,
      boundaryEdgeCount: 0,
    };
  }
  if (triangles.length < triangleCount * 3) {
    throw new InkMeshPathError(
      `mesh declares ${triangleCount} triangles but carries ${triangles.length} indices`,
    );
  }

  // Directed boundary edges. An edge shared by two triangles is traversed once in each direction,
  // so cancelling on the undirected key leaves exactly the silhouette, already oriented.
  const directed = new Map<number, { from: number; to: number }>();
  let meshArea = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = triangles[triangle * 3]!;
    const b = triangles[triangle * 3 + 1]!;
    const c = triangles[triangle * 3 + 2]!;
    meshArea += triangleSignedArea(vertices, a, b, c);
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(from, to);
      if (directed.has(key)) directed.delete(key);
      else directed.set(key, { from, to });
    }
  }

  const boundaryEdgeCount = directed.size;
  const outgoing = new Map<number, number[]>();
  for (const { from, to } of directed.values()) {
    const list = outgoing.get(from);
    if (list) list.push(to);
    else outgoing.set(from, [to]);
  }

  const verbs: PathVerbIR[] = [];
  const loops: InkMeshPathLoop[] = [];
  let pathArea = 0;
  for (const { from: start } of directed.values()) {
    const first = outgoing.get(start);
    if (!first || first.length === 0) continue;
    const loop: number[] = [start];
    let cursor = start;
    // Bounded by the edge count: every step consumes one boundary edge, so a malformed mesh
    // terminates instead of spinning.
    for (let step = 0; step < boundaryEdgeCount; step += 1) {
      const next = outgoing.get(cursor);
      if (!next || next.length === 0) break;
      const to = next.shift()!;
      if (to === start) break;
      loop.push(to);
      cursor = to;
    }
    if (loop.length < 3) continue;
    const signedArea = loopSignedArea(vertices, loop);
    loops.push({ vertexCount: loop.length, signedArea });
    pathArea += Math.abs(signedArea);
    verbs.push({ v: "M", x: vertices[loop[0]! * 2]!, y: vertices[loop[0]! * 2 + 1]! });
    for (let index = 1; index < loop.length; index += 1) {
      verbs.push({
        v: "L",
        x: vertices[loop[index]! * 2]!,
        y: vertices[loop[index]! * 2 + 1]!,
      });
    }
    verbs.push({ v: "Z" });
  }

  const absoluteMeshArea = Math.abs(meshArea);
  return {
    path: { verbs },
    loops,
    meshArea: absoluteMeshArea,
    pathArea,
    areaError: absoluteMeshArea === 0 ? 0 : Math.abs(absoluteMeshArea - pathArea) / absoluteMeshArea,
    boundaryEdgeCount,
  };
}
