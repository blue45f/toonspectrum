/**
 * Google ink brush-geometry (mesh) wasm boundary (ADR-0011 lane 3, V12 §11.2).
 *
 * The wasm module is the committed artifact in ./ink-mesh/ (upstream
 * commit-pinned direct-emcc subset build + first-party C bridge,
 * INTEGRITY.sha256 pinned — see ./ink-mesh/README.md). This wrapper owns init
 * lifecycle, input marshalling and error mapping for the BrushTip geometry
 * pipeline: pre-modeled input points -> InProgressStroke -> triangle mesh.
 *
 * Contract notes:
 * - Input is *modeled* points (the ./ink-modeler.ts lane output plugs in
 *   directly); the bridge selects ink's PassthroughModel so there is no
 *   second smoothing pass.
 * - noise_seed is pinned to 0 in the bridge: identical inputs produce
 *   identical meshes (deterministic replay contract).
 * - Per V12 §11.3 the mesh is NOT tessellated into Vello paths per frame in
 *   production; the PathIR outline approximation exists only for the editing
 *   proxy / smoke-test surface (see tests/visual/ink-mesh-vello-smoke.test.ts).
 *
 * This lane is quarantined per ADR-0011 — production inking stays on the
 * first-party stabilizer + perfect-freehand chain until the blind-lab gate
 * (ADR-0009) rules otherwise.
 */

/** Upstream commit pin of the committed wasm artifact. */
export const INK_MESH_COMMIT = "1d0daba661f3035f42f3649b8e6a0061b47aa759";

/** One pre-modeled input point (matches ./ink-modeler.ts output shape). */
export interface InkMeshInputPoint {
  x: number;
  y: number;
  tMs: number;
  /** [0, 1]; omit (or negative) for "unknown" pressure. */
  pressure?: number;
}

export interface InkMeshBrushParams {
  /** Overall brush size (diameter), px. Default 8. */
  size?: number;
  /**
   * Visual quality granularity, px — smaller values produce denser meshes.
   * Default size / 50 (mirrors upstream guidance that epsilon scales with
   * brush size).
   */
  epsilon?: number;
  /** 0 = square corners … 1 = fully rounded (upstream default 1). */
  cornerRounding?: number;
  /** 0 = no pinch … 1 = full pinch (upstream default 0). */
  pinch?: number;
  /** Initial tip rotation, radians (upstream default 0). */
  rotationRad?: number;
  /** Tip scale (width, height) multipliers, both > 0 (upstream default 1,1). */
  scale?: { x: number; y: number };
  /**
   * Maps normalized pressure [0,1] onto a size multiplier range.
   * Defaults to enabled with [0.3, 1.5] (pen-like width response).
   * Pass null to disable pressure response entirely.
   */
  pressureToSize?: { minMultiplier: number; maxMultiplier: number } | null;
}

/** Triangle mesh produced by the ink BrushTip geometry pipeline. */
export interface InkStrokeMesh {
  /** x,y per vertex (length = 2 * vertexCount). */
  vertices: Float32Array;
  /** Vertex indices, 3 per triangle (length = 3 * triangleCount). */
  triangles: Uint32Array;
  /** Surface-UV u,v per vertex (length = 2 * vertexCount). */
  texCoords: Float32Array;
  vertexCount: number;
  triangleCount: number;
}

export class InkMeshError extends Error {
  /** absl::StatusCode from the wasm boundary, or -1 for wrapper-side validation. */
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "InkMeshError";
    this.code = code;
  }
}

export interface InkMeshGenerator {
  /**
   * Generates the triangle mesh for one complete stroke of pre-modeled
   * points. Deterministic for identical inputs (bridge pins noise_seed = 0).
   */
  generateInkStrokeMesh(
    modeledPoints: readonly InkMeshInputPoint[],
    brushParams?: InkMeshBrushParams,
  ): InkStrokeMesh;
}

/** Emscripten module surface exported by ink-mesh/ink_mesh.mjs. */
interface InkMeshWasmModule {
  HEAPF64: Float64Array;
  HEAPF32: Float32Array;
  HEAPU32: Uint32Array;
  _imk_create(): number;
  _imk_destroy(handle: number): void;
  _imk_point_stride(): number;
  _imk_generate(
    handle: number,
    pointsPtr: number,
    pointCount: number,
    brushSize: number,
    brushEpsilon: number,
    cornerRounding: number,
    pinch: number,
    rotationRad: number,
    scaleX: number,
    scaleY: number,
    pressureToSizeEnabled: number,
    sizeMultiplierMin: number,
    sizeMultiplierMax: number,
  ): number;
  _imk_vertex_count(handle: number): number;
  _imk_triangle_count(handle: number): number;
  _imk_positions_ptr(handle: number): number;
  _imk_tex_coords_ptr(handle: number): number;
  _imk_indices_ptr(handle: number): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

type InkMeshWasmFactory = (
  moduleArg?: Record<string, unknown>,
) => Promise<InkMeshWasmModule>;

const POINT_STRIDE = 4;

let modulePromise: Promise<InkMeshWasmModule> | null = null;

/**
 * Idempotent loader (node + web). The default module URL resolves next to
 * this file; browser hosts bundling from elsewhere can pass an explicit URL.
 */
export function loadInkMeshGenerator(options?: {
  moduleUrl?: string | URL;
}): Promise<InkMeshGenerator> {
  modulePromise ??= (async () => {
    const href =
      options?.moduleUrl !== undefined
        ? String(options.moduleUrl)
        : new URL("./ink-mesh/ink_mesh.mjs", import.meta.url).href;
    // Computed specifier on purpose: the emscripten loader resolves its wasm
    // via import.meta.url, and static analysis must not inline/rewrite it.
    const imported = (await import(/* @vite-ignore */ href)) as {
      default: InkMeshWasmFactory;
    };
    const wasm = await imported.default();
    if (wasm._imk_point_stride() !== POINT_STRIDE) {
      throw new InkMeshError(
        `ink-mesh ABI mismatch: expected point stride ${POINT_STRIDE}, got ${wasm._imk_point_stride()}`,
        -1,
      );
    }
    return wasm;
  })();
  return modulePromise.then((wasm) => ({
    generateInkStrokeMesh: (points, params) =>
      generateWith(wasm, points, params),
  }));
}

function generateWith(
  wasm: InkMeshWasmModule,
  points: readonly InkMeshInputPoint[],
  params?: InkMeshBrushParams,
): InkStrokeMesh {
  if (points.length < 1) {
    throw new InkMeshError("ink-mesh needs at least 1 modeled point", -1);
  }
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous !== undefined && current !== undefined && current.tMs < previous.tMs) {
      throw new InkMeshError(
        `ink-mesh requires non-decreasing tMs (index ${i}: ${current.tMs} < ${previous.tMs})`,
        3, // absl kInvalidArgument
      );
    }
  }
  const size = params?.size ?? 8;
  const epsilon = params?.epsilon ?? size / 50;
  const cornerRounding = params?.cornerRounding ?? 1;
  const pinch = params?.pinch ?? 0;
  const rotationRad = params?.rotationRad ?? 0;
  const scaleX = params?.scale?.x ?? 1;
  const scaleY = params?.scale?.y ?? 1;
  const pressureToSize =
    params?.pressureToSize === undefined
      ? { minMultiplier: 0.3, maxMultiplier: 1.5 }
      : params.pressureToSize;

  const handle = wasm._imk_create();
  if (handle === 0) {
    throw new InkMeshError("ink-mesh allocation failed", -1);
  }
  const bytes = points.length * POINT_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  const pointsPtr = wasm._malloc(bytes);
  if (pointsPtr === 0) {
    wasm._imk_destroy(handle);
    throw new InkMeshError("ink-mesh input allocation failed", -1);
  }
  try {
    // Re-read the heap view after _malloc: ALLOW_MEMORY_GROWTH can re-anchor.
    const f64 = wasm.HEAPF64;
    const base = pointsPtr / Float64Array.BYTES_PER_ELEMENT;
    points.forEach((point, index) => {
      const offset = base + index * POINT_STRIDE;
      f64[offset] = point.x;
      f64[offset + 1] = point.y;
      f64[offset + 2] = point.tMs / 1000;
      f64[offset + 3] =
        point.pressure === undefined || point.pressure < 0 ? -1 : point.pressure;
    });
    const produced = wasm._imk_generate(
      handle,
      pointsPtr,
      points.length,
      size,
      epsilon,
      cornerRounding,
      pinch,
      rotationRad,
      scaleX,
      scaleY,
      pressureToSize === null ? 0 : 1,
      pressureToSize === null ? 1 : pressureToSize.minMultiplier,
      pressureToSize === null ? 1 : pressureToSize.maxMultiplier,
    );
    if (produced < 0) {
      throw new InkMeshError(
        `ink-mesh rejected stroke (absl status ${-produced})`,
        -produced,
      );
    }
    const vertexCount = wasm._imk_vertex_count(handle);
    const triangleCount = wasm._imk_triangle_count(handle);
    const positionsBase =
      wasm._imk_positions_ptr(handle) / Float32Array.BYTES_PER_ELEMENT;
    const texCoordsBase =
      wasm._imk_tex_coords_ptr(handle) / Float32Array.BYTES_PER_ELEMENT;
    const indicesBase =
      wasm._imk_indices_ptr(handle) / Uint32Array.BYTES_PER_ELEMENT;
    return {
      vertices: wasm.HEAPF32.slice(positionsBase, positionsBase + vertexCount * 2),
      texCoords: wasm.HEAPF32.slice(texCoordsBase, texCoordsBase + vertexCount * 2),
      triangles: wasm.HEAPU32.slice(indicesBase, indicesBase + triangleCount * 3),
      vertexCount,
      triangleCount,
    };
  } finally {
    wasm._free(pointsPtr);
    wasm._imk_destroy(handle);
  }
}

/**
 * Editing-proxy approximation (V12 §11.3): converts the mesh's boundary
 * (edges used by exactly one triangle) into closed polyline loops, ordered
 * deterministically. This is NOT the production render path for the mesh —
 * it exists so the Kurbo/Vello editing-proxy lane and smoke tests can
 * consume the stroke shape as PathIR-style outlines.
 */
export function inkMeshBoundaryLoops(
  mesh: InkStrokeMesh,
): Array<Array<readonly [number, number]>> {
  const edgeUse = new Map<string, number>();
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;
  const { triangles } = mesh;
  for (let i = 0; i < mesh.triangleCount; i += 1) {
    const a = triangles[i * 3] ?? 0;
    const b = triangles[i * 3 + 1] ?? 0;
    const c = triangles[i * 3 + 2] ?? 0;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(u, v);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  // Adjacency over boundary edges only.
  const neighbors = new Map<number, number[]>();
  for (const [key, count] of edgeUse) {
    if (count !== 1) continue;
    const [aRaw, bRaw] = key.split(":");
    const a = Number(aRaw);
    const b = Number(bRaw);
    (neighbors.get(a) ?? neighbors.set(a, []).get(a))?.push(b);
    (neighbors.get(b) ?? neighbors.set(b, []).get(b))?.push(a);
  }
  const visited = new Set<number>();
  const loops: Array<Array<readonly [number, number]>> = [];
  const starts = [...neighbors.keys()].sort((a, b) => a - b);
  for (const start of starts) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current = start;
    let previous = -1;
    while (!visited.has(current)) {
      visited.add(current);
      loop.push(current);
      const next = (neighbors.get(current) ?? []).find(
        (candidate) => candidate !== previous && !visited.has(candidate),
      );
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length >= 3) {
      loops.push(
        loop.map((index) => {
          const x = mesh.vertices[index * 2] ?? 0;
          const y = mesh.vertices[index * 2 + 1] ?? 0;
          return [x, y] as const;
        }),
      );
    }
  }
  return loops;
}
