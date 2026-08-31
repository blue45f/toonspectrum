/**
 * Google Ink brush-geometry WASM boundary (V12 §11.2).
 *
 * The default live path retains one upstream `InProgressStroke` and emits a
 * deterministic retain-and-replace mesh delta after each input batch. The
 * existing single-shot generator remains an explicitly selected final-reference.
 * Both use the same pinned google/ink bridge and noise seed 0.
 *
 * This module is CPU/WASM geometry only. It never reads pixels or buffers back
 * from a GPU. A renderer applies the returned typed-array delta directly to
 * its existing mesh buffers.
 */

/** Upstream commit pin of the committed WASM artifact. */
export const INK_MESH_COMMIT = "1d0daba661f3035f42f3649b8e6a0061b47aa759";

/** Stable wire contract for live mesh updates. */
export const INK_MESH_DELTA_PROTOCOL = "toon-ink-mesh-delta-v1" as const;

/** One pre-modeled input point (matches ./ink-modeler.ts output shape). */
export interface InkMeshInputPoint {
  x: number;
  y: number;
  tMs: number;
  /** [0, 1]; omit for "not reported". Presence must be stroke-consistent. */
  pressure?: number;
  /** [0, π/2] radians from the screen normal; omit when unavailable. */
  tiltRad?: number;
  /** [0, 2π) radians from +x; omit when unavailable. */
  orientationRad?: number;
}

export interface InkMeshBrushParams {
  /** Overall brush size (diameter), px. Default 8. */
  size?: number;
  /** Visual-quality granularity, px. Default size / 50. */
  epsilon?: number;
  /** 0 = square corners … 1 = fully rounded. */
  cornerRounding?: number;
  /** 0 = no pinch … 1 = full pinch. */
  pinch?: number;
  /** Initial tip rotation, radians. */
  rotationRad?: number;
  /** Tip width/height multipliers, both > 0. */
  scale?: { x: number; y: number };
  /** Pressure [0,1] → size multiplier. Null disables pressure response. */
  pressureToSize?: { minMultiplier: number; maxMultiplier: number } | null;
  /**
   * Tilt [0,π/2] → additional tip rotation. Null/default keeps tilt in the
   * StrokeInput without making it visible. This testable behavior proves the
   * optional tilt channel reaches upstream BrushBehavior unchanged.
   */
  tiltToRotation?: { minOffsetRad: number; maxOffsetRad: number } | null;
}

/** Triangle mesh produced by Google Ink's BrushTip geometry pipeline. */
export interface InkStrokeMesh {
  /** x,y per vertex. */
  vertices: Float32Array;
  /** Vertex indices, 3 per triangle. */
  triangles: Uint32Array;
  /** Surface-UV u,v per vertex. */
  texCoords: Float32Array;
  vertexCount: number;
  triangleCount: number;
}

export type InkMeshDeltaOperation = "append" | "update" | "noop";

/**
 * Retain-and-replace delta. Consumers truncate their arrays to the retained
 * counts and append the replacement tails. Triangle indices stay absolute.
 */
export interface InkStrokeMeshDelta {
  protocol: typeof INK_MESH_DELTA_PROTOCOL;
  baseRevision: number;
  revision: number;
  operation: InkMeshDeltaOperation;
  retainedVertexCount: number;
  retainedTriangleCount: number;
  vertices: Float32Array;
  texCoords: Float32Array;
  triangles: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  inputCount: number;
  finished: boolean;
  /** Bytes crossing WASM→JS for this delta (no GPU readback). */
  payloadBytes: number;
}

export interface InkStrokeMeshReplica extends InkStrokeMesh {
  revision: number;
  finished: boolean;
}

export type InkMeshSessionState =
  | "active"
  | "finished"
  | "cancelled"
  | "failed"
  | "disposed";

export type InkMeshSessionBackend =
  | "upstream-in-progress"
  | "single-shot-reference";

export interface InkMeshIncrementalMetrics {
  backend: InkMeshSessionBackend;
  updateCount: number;
  inputCount: number;
  inputPayloadBytes: number;
  /** Actual geometry bytes copied from WASM into JS before any JS-side diff. */
  wasmToJsPayloadBytes: number;
  deltaPayloadBytes: number;
  fullSnapshotEquivalentBytes: number;
  maxDeltaPayloadBytes: number;
  peakTrackedVectorBytes: number;
  peakWasmHeapBytes: number;
  gpuReadbackCount: 0;
}

export interface InProgressInkStroke {
  readonly backend: InkMeshIncrementalMetrics["backend"];
  readonly state: InkMeshSessionState;
  append(modeledPoints: readonly InkMeshInputPoint[]): InkStrokeMeshDelta;
  finish(): InkStrokeMeshDelta;
  snapshot(): InkStrokeMeshReplica;
  reset(brushParams?: InkMeshBrushParams): void;
  cancel(): void;
  dispose(): void;
  metrics(): InkMeshIncrementalMetrics;
}

export class InkMeshError extends Error {
  /** absl::StatusCode, or -1 for wrapper/protocol validation. */
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "InkMeshError";
    this.code = code;
  }
}

export interface InkMeshGenerator {
  readonly supportsIncrementalMeshDeltas: boolean;
  generateInkStrokeMesh(
    modeledPoints: readonly InkMeshInputPoint[],
    brushParams?: InkMeshBrushParams,
  ): InkStrokeMesh;
  createInProgressStroke(
    brushParams?: InkMeshBrushParams,
    options?: { backend?: InkMeshSessionBackend },
  ): InProgressInkStroke;
}

interface InkMeshWasmModule {
  HEAPU8: Uint8Array;
  HEAPF64: Float64Array;
  HEAPF32: Float32Array;
  HEAPU32: Uint32Array;
  _imk_create(): number;
  _imk_destroy(handle: number): void;
  _imk_point_stride(): number;
  _imk_max_points_per_append(): number;
  _imk_max_stroke_points(): number;
  _imk_begin(handle: number, ...params: number[]): number;
  _imk_append(handle: number, pointsPtr: number, pointCount: number): number;
  _imk_finish(handle: number): number;
  _imk_cancel(handle: number): void;
  _imk_generate(
    handle: number,
    pointsPtr: number,
    pointCount: number,
    ...params: number[]
  ): number;
  _imk_vertex_count(handle: number): number;
  _imk_triangle_count(handle: number): number;
  _imk_positions_ptr(handle: number): number;
  _imk_tex_coords_ptr(handle: number): number;
  _imk_indices_ptr(handle: number): number;
  _imk_delta_kind(handle: number): number;
  _imk_delta_base_revision(handle: number): number;
  _imk_delta_revision(handle: number): number;
  _imk_delta_retained_vertex_count(handle: number): number;
  _imk_delta_retained_triangle_count(handle: number): number;
  _imk_delta_vertex_count(handle: number): number;
  _imk_delta_triangle_count(handle: number): number;
  _imk_delta_positions_ptr(handle: number): number;
  _imk_delta_tex_coords_ptr(handle: number): number;
  _imk_delta_indices_ptr(handle: number): number;
  _imk_input_count(handle: number): number;
  _imk_tracked_vector_bytes(handle: number): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

type InkMeshWasmFactory = (
  moduleArg?: Record<string, unknown>,
) => Promise<InkMeshWasmModule>;

interface NormalizedBrushParams {
  values: readonly number[];
}

interface InputFormat {
  pressure: boolean;
  tilt: boolean;
  orientation: boolean;
}

const POINT_STRIDE = 6;
const FLOAT32_MAX = 3.4028234663852886e38;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
let modulePromise: Promise<InkMeshWasmModule> | null = null;

const defaultInkMeshModuleUrl = new URL(
  "./ink-mesh/ink_mesh.mjs",
  import.meta.url,
).href;
const defaultInkMeshWasmUrl = new URL(
  "./ink-mesh/ink_mesh.wasm",
  import.meta.url,
).href;

function siblingInkMeshWasmUrl(moduleUrl: string): string {
  try {
    return new URL("ink_mesh.wasm", moduleUrl).href;
  } catch {
    return defaultInkMeshWasmUrl;
  }
}

/** Idempotent node/web/Worker loader. */
export function loadInkMeshGenerator(options?: {
  moduleUrl?: string | URL;
  wasmUrl?: string | URL;
}): Promise<InkMeshGenerator> {
  modulePromise ??= (async () => {
    const href =
      options?.moduleUrl !== undefined
        ? String(options.moduleUrl)
        : defaultInkMeshModuleUrl;
    // Keep the binary as its own statically discoverable Vite asset. The generated
    // Emscripten module is imported through a runtime URL, so its internal sibling
    // lookup is outside Vite's hashed asset graph unless locateFile is explicit.
    const wasmHref = options?.wasmUrl !== undefined
      ? String(options.wasmUrl)
      : options?.moduleUrl !== undefined
        ? siblingInkMeshWasmUrl(href)
        : defaultInkMeshWasmUrl;
    const imported = (await import(/* @vite-ignore */ href)) as {
      default: InkMeshWasmFactory;
    };
    const wasm = await imported.default({
      locateFile: (path: string, scriptDirectory: string) =>
        path.endsWith(".wasm")
          ? wasmHref
          : new URL(path, scriptDirectory || href).href,
    });
    if (wasm._imk_point_stride() !== POINT_STRIDE) {
      throw new InkMeshError(
        `ink-mesh ABI mismatch: expected point stride ${POINT_STRIDE}, got ${wasm._imk_point_stride()}`,
        -1,
      );
    }
    return wasm;
  })();
  return modulePromise.then((wasm) => ({
    supportsIncrementalMeshDeltas:
      typeof wasm._imk_begin === "function" && typeof wasm._imk_append === "function",
    generateInkStrokeMesh: (points, params) => generateWith(wasm, points, params),
    createInProgressStroke: (params, sessionOptions) => {
      const unsupportedOption = Object.keys(sessionOptions ?? {}).find(
        (key) => key !== "backend",
      );
      if (unsupportedOption !== undefined) {
        throw new InkMeshError(
          `unsupported ink-mesh session option: ${unsupportedOption}`,
          -1,
        );
      }
      const backend = sessionOptions?.backend ?? "upstream-in-progress";
      if (backend === "single-shot-reference") {
        return createSingleShotReferenceSession(wasm, params);
      }
      if (backend !== "upstream-in-progress") {
        throw new InkMeshError(`unsupported ink-mesh session backend: ${String(backend)}`, -1);
      }
      return createUpstreamIncrementalSession(wasm, params);
    },
  }));
}

function normalizeBrushParams(params?: InkMeshBrushParams): NormalizedBrushParams {
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
  const tiltToRotation = params?.tiltToRotation ?? null;
  const finite = [
    size,
    epsilon,
    cornerRounding,
    pinch,
    rotationRad,
    scaleX,
    scaleY,
    pressureToSize?.minMultiplier ?? 1,
    pressureToSize?.maxMultiplier ?? 1,
    tiltToRotation?.minOffsetRad ?? 0,
    tiltToRotation?.maxOffsetRad ?? 0,
  ];
  if (!finite.every(Number.isFinite)) {
    throw new InkMeshError("ink-mesh brush parameters must be finite", -1);
  }
  if (
    size <= 0 ||
    epsilon <= 0 ||
    scaleX <= 0 ||
    scaleY <= 0 ||
    cornerRounding < 0 ||
    cornerRounding > 1 ||
    pinch < 0 ||
    pinch > 1
  ) {
    throw new InkMeshError("ink-mesh brush parameters are out of range", 3);
  }
  return {
    values: [
      size,
      epsilon,
      cornerRounding,
      pinch,
      rotationRad,
      scaleX,
      scaleY,
      pressureToSize === null ? 0 : 1,
      pressureToSize?.minMultiplier ?? 1,
      pressureToSize?.maxMultiplier ?? 1,
      tiltToRotation === null ? 0 : 1,
      tiltToRotation?.minOffsetRad ?? 0,
      tiltToRotation?.maxOffsetRad ?? 0,
    ],
  };
}

function pointFormat(point: InkMeshInputPoint): InputFormat {
  return {
    pressure: point.pressure !== undefined,
    tilt: point.tiltRad !== undefined,
    orientation: point.orientationRad !== undefined,
  };
}

function sameFormat(a: InputFormat, b: InputFormat): boolean {
  return (
    a.pressure === b.pressure &&
    a.tilt === b.tilt &&
    a.orientation === b.orientation
  );
}

function validatePoints(
  points: readonly InkMeshInputPoint[],
  previousPoint: InkMeshInputPoint | undefined,
  expectedFormat: InputFormat | undefined,
  maxCount: number,
): InputFormat {
  if (points.length < 1) {
    throw new InkMeshError("ink-mesh needs at least 1 modeled point", -1);
  }
  if (points.length > maxCount) {
    throw new InkMeshError(
      `ink-mesh append exceeds ${maxCount} points`,
      8,
    );
  }
  const format = expectedFormat ?? pointFormat(points[0] as InkMeshInputPoint);
  let previous = previousPoint;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as InkMeshInputPoint;
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.tMs) ||
      Math.abs(point.x) > FLOAT32_MAX ||
      Math.abs(point.y) > FLOAT32_MAX
    ) {
      throw new InkMeshError(`ink-mesh point ${index} has non-finite/overflow coordinates`, 3);
    }
    if (!sameFormat(format, pointFormat(point))) {
      throw new InkMeshError(
        "ink-mesh pressure/tilt/orientation presence must be consistent for the stroke",
        3,
      );
    }
    if (
      point.pressure !== undefined &&
      (!Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1)
    ) {
      throw new InkMeshError(`ink-mesh point ${index} pressure is outside [0,1]`, 3);
    }
    if (
      point.tiltRad !== undefined &&
      (!Number.isFinite(point.tiltRad) || point.tiltRad < 0 || point.tiltRad > HALF_PI)
    ) {
      throw new InkMeshError(`ink-mesh point ${index} tilt is outside [0,π/2]`, 3);
    }
    if (
      point.orientationRad !== undefined &&
      (!Number.isFinite(point.orientationRad) ||
        point.orientationRad < 0 ||
        point.orientationRad >= TWO_PI)
    ) {
      throw new InkMeshError(`ink-mesh point ${index} orientation is outside [0,2π)`, 3);
    }
    if (previous !== undefined && point.tMs < previous.tMs) {
      throw new InkMeshError(
        `ink-mesh requires non-decreasing tMs (index ${index}: ${point.tMs} < ${previous.tMs})`,
        3,
      );
    }
    previous = point;
  }
  return format;
}

function withPackedPoints<T>(
  wasm: InkMeshWasmModule,
  points: readonly InkMeshInputPoint[],
  run: (pointsPtr: number) => T,
): T {
  const bytes = points.length * POINT_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  const pointsPtr = wasm._malloc(bytes);
  if (pointsPtr === 0) {
    throw new InkMeshError("ink-mesh input allocation failed", 8);
  }
  try {
    const heap = wasm.HEAPF64;
    const base = pointsPtr / Float64Array.BYTES_PER_ELEMENT;
    points.forEach((point, index) => {
      const offset = base + index * POINT_STRIDE;
      heap[offset] = point.x;
      heap[offset + 1] = point.y;
      heap[offset + 2] = point.tMs / 1000;
      heap[offset + 3] = point.pressure ?? -1;
      heap[offset + 4] = point.tiltRad ?? -1;
      heap[offset + 5] = point.orientationRad ?? -1;
    });
    return run(pointsPtr);
  } finally {
    wasm._free(pointsPtr);
  }
}

function throwStatus(action: string, status: number): never {
  throw new InkMeshError(
    `ink-mesh ${action} rejected stroke (absl status ${-status})`,
    -status,
  );
}

function readFullMesh(wasm: InkMeshWasmModule, handle: number): InkStrokeMesh {
  const vertexCount = wasm._imk_vertex_count(handle);
  const triangleCount = wasm._imk_triangle_count(handle);
  if (vertexCount < 0 || triangleCount < 0) {
    throw new InkMeshError("ink-mesh returned invalid mesh counts", -1);
  }
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
}

function meshPayloadBytes(mesh: InkStrokeMesh): number {
  return mesh.vertices.byteLength + mesh.texCoords.byteLength + mesh.triangles.byteLength;
}

function generateWith(
  wasm: InkMeshWasmModule,
  points: readonly InkMeshInputPoint[],
  params?: InkMeshBrushParams,
): InkStrokeMesh {
  const maxStrokePoints = wasm._imk_max_stroke_points();
  validatePoints(points, undefined, undefined, maxStrokePoints);
  const normalized = normalizeBrushParams(params);
  const handle = wasm._imk_create();
  if (handle === 0) throw new InkMeshError("ink-mesh allocation failed", 8);
  try {
    return withPackedPoints(wasm, points, (pointsPtr) => {
      const produced = wasm._imk_generate(
        handle,
        pointsPtr,
        points.length,
        ...normalized.values,
      );
      if (produced < 0) throwStatus("single-shot", produced);
      return readFullMesh(wasm, handle);
    });
  } finally {
    wasm._imk_destroy(handle);
  }
}

function operationFromCode(code: number): InkMeshDeltaOperation {
  if (code === 0) return "noop";
  if (code === 1) return "append";
  if (code === 2) return "update";
  throw new InkMeshError(`ink-mesh returned unknown delta operation ${code}`, -1);
}

function readWasmDelta(
  wasm: InkMeshWasmModule,
  handle: number,
  finished: boolean,
): InkStrokeMeshDelta {
  const deltaVertexCount = wasm._imk_delta_vertex_count(handle);
  const deltaTriangleCount = wasm._imk_delta_triangle_count(handle);
  const vertexCount = wasm._imk_vertex_count(handle);
  const triangleCount = wasm._imk_triangle_count(handle);
  if (
    deltaVertexCount < 0 ||
    deltaTriangleCount < 0 ||
    vertexCount < 0 ||
    triangleCount < 0
  ) {
    throw new InkMeshError("ink-mesh returned invalid delta counts", -1);
  }
  const positionBase =
    wasm._imk_delta_positions_ptr(handle) / Float32Array.BYTES_PER_ELEMENT;
  const texCoordBase =
    wasm._imk_delta_tex_coords_ptr(handle) / Float32Array.BYTES_PER_ELEMENT;
  const indexBase =
    wasm._imk_delta_indices_ptr(handle) / Uint32Array.BYTES_PER_ELEMENT;
  const vertices = wasm.HEAPF32.slice(
    positionBase,
    positionBase + deltaVertexCount * 2,
  );
  const texCoords = wasm.HEAPF32.slice(
    texCoordBase,
    texCoordBase + deltaVertexCount * 2,
  );
  const triangles = wasm.HEAPU32.slice(
    indexBase,
    indexBase + deltaTriangleCount * 3,
  );
  return {
    protocol: INK_MESH_DELTA_PROTOCOL,
    baseRevision: wasm._imk_delta_base_revision(handle),
    revision: wasm._imk_delta_revision(handle),
    operation: operationFromCode(wasm._imk_delta_kind(handle)),
    retainedVertexCount: wasm._imk_delta_retained_vertex_count(handle),
    retainedTriangleCount: wasm._imk_delta_retained_triangle_count(handle),
    vertices,
    texCoords,
    triangles,
    vertexCount,
    triangleCount,
    inputCount: wasm._imk_input_count(handle),
    finished,
    payloadBytes: vertices.byteLength + texCoords.byteLength + triangles.byteLength,
  };
}

export function createEmptyInkStrokeMeshReplica(): InkStrokeMeshReplica {
  return {
    vertices: new Float32Array(),
    texCoords: new Float32Array(),
    triangles: new Uint32Array(),
    vertexCount: 0,
    triangleCount: 0,
    revision: 0,
    finished: false,
  };
}

/** Applies a protocol-v1 delta without reading any GPU resource. */
export function applyInkStrokeMeshDelta(
  replica: InkStrokeMeshReplica,
  delta: InkStrokeMeshDelta,
): InkStrokeMeshReplica {
  if (delta.protocol !== INK_MESH_DELTA_PROTOCOL) {
    throw new InkMeshError(`unsupported ink-mesh delta protocol ${delta.protocol}`, -1);
  }
  if (delta.baseRevision !== replica.revision || delta.revision !== replica.revision + 1) {
    throw new InkMeshError(
      `ink-mesh delta revision mismatch: replica ${replica.revision}, delta ${delta.baseRevision}->${delta.revision}`,
      -1,
    );
  }
  if (
    delta.retainedVertexCount > replica.vertexCount ||
    delta.retainedTriangleCount > replica.triangleCount ||
    delta.vertexCount !== delta.retainedVertexCount + delta.vertices.length / 2 ||
    delta.triangleCount !== delta.retainedTriangleCount + delta.triangles.length / 3 ||
    delta.texCoords.length !== delta.vertices.length
  ) {
    throw new InkMeshError("ink-mesh delta counts are inconsistent", -1);
  }
  if (
    delta.operation === "append" &&
    (delta.retainedVertexCount !== replica.vertexCount ||
      delta.retainedTriangleCount !== replica.triangleCount)
  ) {
    throw new InkMeshError("ink-mesh append delta cannot truncate the replica", -1);
  }
  if (
    delta.operation === "noop" &&
    (delta.vertices.length !== 0 ||
      delta.triangles.length !== 0 ||
      delta.vertexCount !== replica.vertexCount ||
      delta.triangleCount !== replica.triangleCount)
  ) {
    throw new InkMeshError("ink-mesh noop delta contains geometry changes", -1);
  }
  for (const coordinate of delta.vertices) {
    if (!Number.isFinite(coordinate)) {
      throw new InkMeshError("ink-mesh delta contains a non-finite vertex", -1);
    }
  }
  for (const coordinate of delta.texCoords) {
    if (!Number.isFinite(coordinate)) {
      throw new InkMeshError("ink-mesh delta contains a non-finite texCoord", -1);
    }
  }
  for (const index of delta.triangles) {
    if (index >= delta.vertexCount) {
      throw new InkMeshError(`ink-mesh delta triangle index ${index} is out of range`, -1);
    }
  }

  const vertices = new Float32Array(delta.vertexCount * 2);
  const texCoords = new Float32Array(delta.vertexCount * 2);
  const triangles = new Uint32Array(delta.triangleCount * 3);
  vertices.set(replica.vertices.subarray(0, delta.retainedVertexCount * 2));
  texCoords.set(replica.texCoords.subarray(0, delta.retainedVertexCount * 2));
  triangles.set(replica.triangles.subarray(0, delta.retainedTriangleCount * 3));
  vertices.set(delta.vertices, delta.retainedVertexCount * 2);
  texCoords.set(delta.texCoords, delta.retainedVertexCount * 2);
  triangles.set(delta.triangles, delta.retainedTriangleCount * 3);
  return {
    vertices,
    texCoords,
    triangles,
    vertexCount: delta.vertexCount,
    triangleCount: delta.triangleCount,
    revision: delta.revision,
    finished: delta.finished,
  };
}

function freshMetrics(
  backend: InkMeshIncrementalMetrics["backend"],
  wasm: InkMeshWasmModule,
): InkMeshIncrementalMetrics {
  return {
    backend,
    updateCount: 0,
    inputCount: 0,
    inputPayloadBytes: 0,
    wasmToJsPayloadBytes: 0,
    deltaPayloadBytes: 0,
    fullSnapshotEquivalentBytes: 0,
    maxDeltaPayloadBytes: 0,
    peakTrackedVectorBytes: 0,
    peakWasmHeapBytes: wasm.HEAPU8.byteLength,
    gpuReadbackCount: 0,
  };
}

function recordMetrics(
  metrics: InkMeshIncrementalMetrics,
  delta: InkStrokeMeshDelta,
  inputPoints: number,
  trackedVectorBytes: number,
  wasmHeapBytes: number,
  wasmToJsPayloadBytes = delta.payloadBytes,
): void {
  metrics.updateCount += 1;
  metrics.inputCount = delta.inputCount;
  metrics.inputPayloadBytes +=
    inputPoints * POINT_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  metrics.wasmToJsPayloadBytes += wasmToJsPayloadBytes;
  metrics.deltaPayloadBytes += delta.payloadBytes;
  metrics.fullSnapshotEquivalentBytes +=
    delta.vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT * 2 +
    delta.triangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT;
  metrics.maxDeltaPayloadBytes = Math.max(metrics.maxDeltaPayloadBytes, delta.payloadBytes);
  metrics.peakTrackedVectorBytes = Math.max(
    metrics.peakTrackedVectorBytes,
    trackedVectorBytes,
  );
  metrics.peakWasmHeapBytes = Math.max(metrics.peakWasmHeapBytes, wasmHeapBytes);
}

function createUpstreamIncrementalSession(
  wasm: InkMeshWasmModule,
  initialParams?: InkMeshBrushParams,
): InProgressInkStroke {
  let handle = wasm._imk_create();
  if (handle === 0) throw new InkMeshError("ink-mesh allocation failed", 8);
  let sessionState: InkMeshSessionState = "active";
  let lastPoint: InkMeshInputPoint | undefined;
  let format: InputFormat | undefined;
  let replica = createEmptyInkStrokeMeshReplica();
  let metricsValue = freshMetrics("upstream-in-progress", wasm);

  const begin = (params?: InkMeshBrushParams): void => {
    const normalized = normalizeBrushParams(params);
    const status = wasm._imk_begin(handle, ...normalized.values);
    if (status < 0) {
      wasm._imk_destroy(handle);
      handle = 0;
      sessionState = "failed";
      throwStatus("begin", status);
    }
    sessionState = "active";
    lastPoint = undefined;
    format = undefined;
    replica = createEmptyInkStrokeMeshReplica();
    metricsValue = freshMetrics("upstream-in-progress", wasm);
  };
  begin(initialParams);

  const ensureActive = (action: string): void => {
    if (sessionState !== "active" || handle === 0) {
      throw new InkMeshError(`cannot ${action} an ink-mesh session in state ${sessionState}`, 9);
    }
  };
  const fail = (action: string, status: number): never => {
    if (handle !== 0) {
      wasm._imk_cancel(handle);
      wasm._imk_destroy(handle);
      handle = 0;
    }
    sessionState = "failed";
    throwStatus(action, status);
  };
  const consumeDelta = (finished: boolean, inputPoints: number): InkStrokeMeshDelta => {
    const delta = readWasmDelta(wasm, handle, finished);
    replica = applyInkStrokeMeshDelta(replica, delta);
    recordMetrics(
      metricsValue,
      delta,
      inputPoints,
      wasm._imk_tracked_vector_bytes(handle),
      wasm.HEAPU8.byteLength,
    );
    return delta;
  };

  return {
    backend: "upstream-in-progress",
    get state() {
      return sessionState;
    },
    append(points) {
      ensureActive("append to");
      if (metricsValue.inputCount > wasm._imk_max_stroke_points() - points.length) {
        throw new InkMeshError(
          `ink-mesh stroke exceeds ${wasm._imk_max_stroke_points()} points`,
          8,
        );
      }
      format = validatePoints(
        points,
        lastPoint,
        format,
        wasm._imk_max_points_per_append(),
      );
      const status = withPackedPoints(wasm, points, (pointsPtr) =>
        wasm._imk_append(handle, pointsPtr, points.length),
      );
      if (status < 0) return fail("append", status);
      lastPoint = points[points.length - 1];
      return consumeDelta(false, points.length);
    },
    finish() {
      ensureActive("finish");
      if (lastPoint === undefined) {
        throw new InkMeshError("cannot finish an ink-mesh stroke with no inputs", 9);
      }
      const status = wasm._imk_finish(handle);
      if (status < 0) return fail("finish", status);
      sessionState = "finished";
      return consumeDelta(true, 0);
    },
    snapshot() {
      if (handle === 0 || sessionState === "cancelled" || sessionState === "disposed") {
        throw new InkMeshError(`cannot snapshot an ink-mesh session in state ${sessionState}`, 9);
      }
      const mesh = readFullMesh(wasm, handle);
      return { ...mesh, revision: replica.revision, finished: sessionState === "finished" };
    },
    reset(params) {
      if (handle === 0 || sessionState === "cancelled" || sessionState === "disposed") {
        throw new InkMeshError(`cannot reset an ink-mesh session in state ${sessionState}`, 9);
      }
      begin(params);
    },
    cancel() {
      if (handle !== 0) {
        wasm._imk_cancel(handle);
        wasm._imk_destroy(handle);
        handle = 0;
      }
      sessionState = "cancelled";
    },
    dispose() {
      if (handle !== 0) {
        wasm._imk_cancel(handle);
        wasm._imk_destroy(handle);
        handle = 0;
      }
      sessionState = "disposed";
    },
    metrics() {
      return { ...metricsValue };
    },
  };
}

function firstChangedVertex(before: InkStrokeMesh, after: InkStrokeMesh): number {
  const limit = Math.min(before.vertexCount, after.vertexCount);
  for (let index = 0; index < limit; index += 1) {
    if (
      before.vertices[index * 2] !== after.vertices[index * 2] ||
      before.vertices[index * 2 + 1] !== after.vertices[index * 2 + 1] ||
      before.texCoords[index * 2] !== after.texCoords[index * 2] ||
      before.texCoords[index * 2 + 1] !== after.texCoords[index * 2 + 1]
    ) {
      return index;
    }
  }
  return limit;
}

function firstChangedTriangle(before: InkStrokeMesh, after: InkStrokeMesh): number {
  const limit = Math.min(before.triangleCount, after.triangleCount);
  for (let index = 0; index < limit; index += 1) {
    if (
      before.triangles[index * 3] !== after.triangles[index * 3] ||
      before.triangles[index * 3 + 1] !== after.triangles[index * 3 + 1] ||
      before.triangles[index * 3 + 2] !== after.triangles[index * 3 + 2]
    ) {
      return index;
    }
  }
  return limit;
}

function diffFullMeshes(
  before: InkStrokeMeshReplica,
  after: InkStrokeMesh,
  inputCount: number,
  finished: boolean,
): InkStrokeMeshDelta {
  const retainedVertexCount = firstChangedVertex(before, after);
  const retainedTriangleCount = firstChangedTriangle(before, after);
  const vertices = after.vertices.slice(retainedVertexCount * 2);
  const texCoords = after.texCoords.slice(retainedVertexCount * 2);
  const triangles = after.triangles.slice(retainedTriangleCount * 3);
  const changed =
    retainedVertexCount !== after.vertexCount ||
    retainedTriangleCount !== after.triangleCount ||
    before.vertexCount !== after.vertexCount ||
    before.triangleCount !== after.triangleCount;
  const operation: InkMeshDeltaOperation = !changed
    ? "noop"
    : retainedVertexCount === before.vertexCount &&
        retainedTriangleCount === before.triangleCount
      ? "append"
      : "update";
  return {
    protocol: INK_MESH_DELTA_PROTOCOL,
    baseRevision: before.revision,
    revision: before.revision + 1,
    operation,
    retainedVertexCount,
    retainedTriangleCount,
    vertices,
    texCoords,
    triangles,
    vertexCount: after.vertexCount,
    triangleCount: after.triangleCount,
    inputCount,
    finished,
    payloadBytes: vertices.byteLength + texCoords.byteLength + triangles.byteLength,
  };
}

function createSingleShotReferenceSession(
  wasm: InkMeshWasmModule,
  initialParams?: InkMeshBrushParams,
): InProgressInkStroke {
  let params = initialParams;
  let points: InkMeshInputPoint[] = [];
  let format: InputFormat | undefined;
  let replica = createEmptyInkStrokeMeshReplica();
  let sessionState: InkMeshSessionState = "active";
  let metricsValue = freshMetrics("single-shot-reference", wasm);
  const ensureActive = (action: string): void => {
    if (sessionState !== "active") {
      throw new InkMeshError(`cannot ${action} an ink-mesh session in state ${sessionState}`, 9);
    }
  };
  return {
    backend: "single-shot-reference",
    get state() {
      return sessionState;
    },
    append(next) {
      ensureActive("append to");
      if (points.length > wasm._imk_max_stroke_points() - next.length) {
        throw new InkMeshError(
          `ink-mesh stroke exceeds ${wasm._imk_max_stroke_points()} points`,
          8,
        );
      }
      format = validatePoints(
        next,
        points[points.length - 1],
        format,
        wasm._imk_max_points_per_append(),
      );
      points.push(...next);
      const full = generateWith(wasm, points, params);
      const delta = diffFullMeshes(replica, full, points.length, false);
      replica = applyInkStrokeMeshDelta(replica, delta);
      recordMetrics(
        metricsValue,
        delta,
        next.length,
        points.length * POINT_STRIDE * Float64Array.BYTES_PER_ELEMENT +
          meshPayloadBytes(full),
        wasm.HEAPU8.byteLength,
        meshPayloadBytes(full),
      );
      return delta;
    },
    finish() {
      ensureActive("finish");
      if (points.length === 0) {
        throw new InkMeshError("cannot finish an ink-mesh stroke with no inputs", 9);
      }
      const full: InkStrokeMesh = replica;
      const delta = diffFullMeshes(replica, full, points.length, true);
      replica = applyInkStrokeMeshDelta(replica, delta);
      sessionState = "finished";
      recordMetrics(
        metricsValue,
        delta,
        0,
        points.length * POINT_STRIDE * Float64Array.BYTES_PER_ELEMENT +
          meshPayloadBytes(full),
        wasm.HEAPU8.byteLength,
        0,
      );
      return delta;
    },
    snapshot() {
      if (sessionState === "cancelled" || sessionState === "disposed") {
        throw new InkMeshError(`cannot snapshot an ink-mesh session in state ${sessionState}`, 9);
      }
      return {
        vertices: replica.vertices.slice(),
        texCoords: replica.texCoords.slice(),
        triangles: replica.triangles.slice(),
        vertexCount: replica.vertexCount,
        triangleCount: replica.triangleCount,
        revision: replica.revision,
        finished: sessionState === "finished",
      };
    },
    reset(nextParams) {
      if (sessionState === "cancelled" || sessionState === "disposed") {
        throw new InkMeshError(`cannot reset an ink-mesh session in state ${sessionState}`, 9);
      }
      normalizeBrushParams(nextParams);
      params = nextParams;
      points = [];
      format = undefined;
      replica = createEmptyInkStrokeMeshReplica();
      metricsValue = freshMetrics("single-shot-reference", wasm);
      sessionState = "active";
    },
    cancel() {
      points = [];
      replica = createEmptyInkStrokeMeshReplica();
      sessionState = "cancelled";
    },
    dispose() {
      points = [];
      replica = createEmptyInkStrokeMeshReplica();
      sessionState = "disposed";
    },
    metrics() {
      return { ...metricsValue };
    },
  };
}

/**
 * Editing-proxy approximation: converts boundary edges to deterministic
 * loops. This is not the production mesh renderer.
 */
export function inkMeshBoundaryLoops(
  mesh: InkStrokeMesh,
): Array<Array<readonly [number, number]>> {
  const edgeUse = new Map<string, number>();
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let i = 0; i < mesh.triangleCount; i += 1) {
    const a = mesh.triangles[i * 3] ?? 0;
    const b = mesh.triangles[i * 3 + 1] ?? 0;
    const c = mesh.triangles[i * 3 + 2] ?? 0;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(u, v);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
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
  for (const start of [...neighbors.keys()].sort((a, b) => a - b)) {
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
        loop.map((index) => [
          mesh.vertices[index * 2] ?? 0,
          mesh.vertices[index * 2 + 1] ?? 0,
        ] as const),
      );
    }
  }
  return loops;
}
