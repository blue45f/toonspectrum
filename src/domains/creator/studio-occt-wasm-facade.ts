/**
 * Industrial CAD path: real OpenCascade Technology via WASM (opencascade.js).
 * Lazy-loaded; never eagerly pulled into the Studio shell bundle.
 *
 * Browser: fetch/locateFile + Embind factory (no node:* builtins).
 * Node/Vitest: dynamic node:fs + vm sandbox (same real WASM binary).
 *
 * License: opencascade.js redistributes OCCT under LGPL-2.1 — loaded dynamically
 * as a separate WASM module (not statically linked into the main app chunk).
 */

import {
  createStudioEditableMeshFromPolygons,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";

export const STUDIO_OCCT_WASM_FACADE_REVISION = 2 as const;

export type StudioOcctRuntime = {
  readonly backend: "opencascade-wasm";
  readonly occtVersionHint: string;
  readonly module: StudioOcctModule;
  readonly loadPath: "browser" | "node";
};

/** Minimal surface of the Embind module we use. */
export type StudioOcctModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [key: string]: any;
};

export type StudioOcctSolidResult = {
  readonly ok: true;
  readonly mesh: StudioEditableMesh;
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly volumeApprox: number;
  readonly backend: "opencascade-wasm";
  readonly operation: string;
  readonly loadPath: "browser" | "node";
};

export type StudioOcctFail = {
  readonly ok: false;
  readonly code: string;
  readonly detail: string;
};

type StudioOcctTriangulation = {
  NbNodes(): number;
  NbTriangles(): number;
  Node(index: number): { X(): number; Y(): number; Z(): number };
  Triangle(index: number): { Value(vertex: number): number };
};

type OcctFactory = (cfg: {
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (path: string, prefix?: string) => string;
}) => Promise<StudioOcctModule>;

let cachedRuntime: StudioOcctRuntime | null = null;
let cachedPromise: Promise<StudioOcctRuntime> | null = null;

function isCallable(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Function]"
    || Object.prototype.toString.call(value) === "[object AsyncFunction]";
}

function isBrowserEnvironment(): boolean {
  // Product browser path: DOM + fetch, and NOT a Node host (Vitest/jsdom still polyfills window).
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!isCallable(globalThis.fetch)) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeVersion = (globalThis as any).process?.versions?.node;
    if (typeof nodeVersion === "string" && nodeVersion.length > 0) {
      // Running under Node (Vitest/jsdom/CI). Use node-loader for the same real WASM binary.
      return false;
    }
  } catch {
    // ignore
  }
  return true;
}

function resolveStudioOcctTriangulation(candidate: unknown): StudioOcctTriangulation | null {
  let result: unknown = candidate;
  if (!result || typeof result !== "object") return null;
  if ("get" in result) {
    try {
      const maybeGet = (result as { get?: unknown }).get;
      if (isCallable(maybeGet)) {
        const unwrapped = (maybeGet as () => unknown).call(result);
        if (unwrapped && typeof unwrapped === "object") result = unwrapped;
      }
    } catch {
      // keep original
    }
  }
  if (!result || typeof result !== "object") return null;
  const tri = result as StudioOcctTriangulation;
  if (
    isCallable(tri.NbNodes)
    && isCallable(tri.NbTriangles)
    && isCallable(tri.Node)
    && isCallable(tri.Triangle)
  ) {
    return tri;
  }
  return null;
}

async function resolveBrowserWasmUrl(): Promise<string> {
  // Vite asset URL (preferred in browser harness / app)
  try {
    const mod = await import(
      /* @vite-ignore */ "opencascade.js/dist/opencascade.wasm.wasm?url"
    );
    const url = (mod as { default?: string }).default;
    if (url && Object.prototype.toString.call(url) === "[object String]") return url;
  } catch {
    // fall through
  }
  // Dev server / absolute package path
  return "/node_modules/opencascade.js/dist/opencascade.wasm.wasm";
}

async function loadBrowserOcctFactory(): Promise<{
  factory: OcctFactory;
  wasmUrl: string;
  wasmBinary: Uint8Array;
}> {
  const wasmUrl = await resolveBrowserWasmUrl();
  const wasmResponse = await fetch(wasmUrl);
  if (!wasmResponse.ok) {
    throw new Error(`OCCT wasm fetch failed: ${wasmResponse.status} ${wasmUrl}`);
  }
  const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
  if (wasmBinary.byteLength < 1_000_000) {
    throw new Error(`OCCT wasm too small (${wasmBinary.byteLength} bytes) at ${wasmUrl}`);
  }

  // Embind factory — ESM default export from opencascade.wasm.js
  const factoryMod = await import(
    /* @vite-ignore */ "opencascade.js/dist/opencascade.wasm.js"
  );
  const factory = ((factoryMod as { default?: OcctFactory }).default
    ?? factoryMod) as OcctFactory;
  if (!isCallable(factory)) {
    throw new Error("opencascade browser factory missing");
  }
  return { factory, wasmUrl, wasmBinary };
}

/**
 * Load OpenCascade WASM in browser (fetch) or Node (separate node-loader).
 * Honest failure if the package or WASM binary is missing.
 */
export async function loadStudioOcctRuntime(): Promise<StudioOcctRuntime> {
  if (cachedRuntime) return cachedRuntime;
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    try {
      if (isBrowserEnvironment()) {
        const { factory, wasmUrl, wasmBinary } = await loadBrowserOcctFactory();
        const oc = await factory({
          wasmBinary,
          locateFile: (p: string) => (p.endsWith(".wasm") ? wasmUrl : p),
        });
        if (!oc?.BRepPrimAPI_MakeBox_1) {
          throw new Error("opencascade module missing BRepPrimAPI_MakeBox_1");
        }
        const runtime: StudioOcctRuntime = {
          backend: "opencascade-wasm",
          occtVersionHint: "OCCT-7.4 via opencascade.js@1.1.1",
          module: oc,
          loadPath: "browser",
        };
        cachedRuntime = runtime;
        return runtime;
      }

      // Node/Vitest only — dynamic import keeps node:* out of the browser graph.
      const { loadStudioOcctModuleFromNode } = await import("./studio-occt-wasm-node-loader");
      const loaded = await loadStudioOcctModuleFromNode();
      const runtime: StudioOcctRuntime = {
        backend: "opencascade-wasm",
        occtVersionHint: "OCCT-7.4 via opencascade.js@1.1.1",
        module: loaded.module,
        loadPath: "node",
      };
      cachedRuntime = runtime;
      return runtime;
    } catch (error) {
      cachedPromise = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  })();
  return cachedPromise;
}

export function resetStudioOcctRuntimeForTests(): void {
  cachedRuntime = null;
  cachedPromise = null;
}

function v(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

/** Tessellate a TopoDS_Shape into a welded triangle soup mesh. */
export function tessellateStudioOcctShape(
  oc: StudioOcctModule,
  shape: unknown,
  linearDeflection = 0.2,
): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly faceCount: number;
  readonly triangleCount: number;
} {
  new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, false);
  const faceEnum = oc.TopAbs_ShapeEnum.TopAbs_FACE;
  const exp = new oc.TopExp_Explorer_2(shape, faceEnum, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const positions: number[] = [];
  const indices: number[] = [];
  let faceCount = 0;
  while (exp.More()) {
    faceCount += 1;
    const face = oc.TopoDS.Face_1(exp.Current());
    const loc = new oc.TopLoc_Location_1();
    const tri = (() => {
      try {
        return resolveStudioOcctTriangulation(oc.BRep_Tool.Triangulation_1(face, loc));
      } catch {
        try {
          return resolveStudioOcctTriangulation(oc.BRep_Tool.Triangulation(face, loc));
        } catch {
          return null;
        }
      }
    })();
    if (!tri) {
      exp.Next();
      continue;
    }
    const nNodes = tri.NbNodes();
    const nTris = tri.NbTriangles();
    const base = positions.length / 3;
    for (let i = 1; i <= nNodes; i += 1) {
      const p = tri.Node(i);
      positions.push(p.X(), p.Y(), p.Z());
    }
    for (let i = 1; i <= nTris; i += 1) {
      const t = tri.Triangle(i);
      indices.push(base + t.Value(1) - 1, base + t.Value(2) - 1, base + t.Value(3) - 1);
    }
    exp.Next();
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    faceCount,
    triangleCount: indices.length / 3,
  };
}

function soupToMesh(positions: Float32Array, indices: Uint32Array): StudioEditableMesh {
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

function approxVolumeBox(dx: number, dy: number, dz: number): number {
  return Math.abs(dx * dy * dz);
}

function packResult(
  operation: string,
  mesh: StudioEditableMesh,
  faceCount: number,
  triangleCount: number,
  volumeApprox: number,
  loadPath: "browser" | "node",
): StudioOcctSolidResult {
  return {
    ok: true,
    mesh,
    faceCount,
    triangleCount,
    vertexCount: mesh.vertices.length,
    volumeApprox,
    backend: "opencascade-wasm",
    operation,
    loadPath,
  };
}

/** Core solid: axis-aligned box via BRepPrimAPI_MakeBox. */
export async function occtMakeBoxSolid(
  dx: number,
  dy: number,
  dz: number,
): Promise<StudioOcctSolidResult | StudioOcctFail> {
  try {
    const runtime = await loadStudioOcctRuntime();
    const oc = runtime.module;
    const shape = new oc.BRepPrimAPI_MakeBox_1(dx, dy, dz).Shape();
    const tess = tessellateStudioOcctShape(oc, shape);
    if (tess.triangleCount < 1) {
      return { ok: false, code: "empty-tessellation", detail: "box produced no triangles" };
    }
    return packResult(
      "BRepPrimAPI_MakeBox",
      soupToMesh(tess.positions, tess.indices),
      tess.faceCount,
      tess.triangleCount,
      approxVolumeBox(dx, dy, dz),
      runtime.loadPath,
    );
  } catch (error) {
    return {
      ok: false,
      code: "occt-unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Core solid: cylinder via BRepPrimAPI_MakeCylinder. */
export async function occtMakeCylinderSolid(
  radius: number,
  height: number,
): Promise<StudioOcctSolidResult | StudioOcctFail> {
  try {
    const runtime = await loadStudioOcctRuntime();
    const oc = runtime.module;
    let shape: unknown = null;
    for (const key of [
      "BRepPrimAPI_MakeCylinder_1",
      "BRepPrimAPI_MakeCylinder_2",
      "BRepPrimAPI_MakeCylinder",
    ]) {
      if (!isCallable(oc[key])) continue;
      try {
        shape = new oc[key](radius, height).Shape();
        break;
      } catch {
        try {
          shape = new oc[key](radius, height, Math.PI * 2).Shape();
          break;
        } catch {
          // next
        }
      }
    }
    if (!shape) {
      return { ok: false, code: "no-cylinder-ctor", detail: "MakeCylinder overloads failed" };
    }
    const tess = tessellateStudioOcctShape(oc, shape, 0.15);
    if (tess.triangleCount < 1) {
      return { ok: false, code: "empty-tessellation", detail: "cylinder produced no triangles" };
    }
    return packResult(
      "BRepPrimAPI_MakeCylinder",
      soupToMesh(tess.positions, tess.indices),
      tess.faceCount,
      tess.triangleCount,
      Math.PI * radius * radius * height,
      runtime.loadPath,
    );
  } catch (error) {
    return {
      ok: false,
      code: "occt-unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Boolean cut (A − B) using BRepAlgoAPI_Cut on two OCCT boxes.
 */
export async function occtBooleanCutBoxes(
  a: { readonly dx: number; readonly dy: number; readonly dz: number },
  b: {
    readonly dx: number;
    readonly dy: number;
    readonly dz: number;
    readonly ox?: number;
    readonly oy?: number;
    readonly oz?: number;
  },
): Promise<StudioOcctSolidResult | StudioOcctFail> {
  try {
    const runtime = await loadStudioOcctRuntime();
    const oc = runtime.module;
    const shapeA = new oc.BRepPrimAPI_MakeBox_1(a.dx, a.dy, a.dz).Shape();
    let shapeB: unknown;
    if (b.ox || b.oy || b.oz) {
      const p1 = new oc.gp_Pnt_3(b.ox ?? 0, b.oy ?? 0, b.oz ?? 0);
      const p2 = new oc.gp_Pnt_3(
        (b.ox ?? 0) + b.dx,
        (b.oy ?? 0) + b.dy,
        (b.oz ?? 0) + b.dz,
      );
      let mk: { Shape: () => unknown } | null = null;
      for (const key of ["BRepPrimAPI_MakeBox_3", "BRepPrimAPI_MakeBox_2", "BRepPrimAPI_MakeBox_4"]) {
        if (!isCallable(oc[key])) continue;
        try {
          mk = new oc[key](p1, p2);
          break;
        } catch {
          // next
        }
      }
      shapeB = mk ? mk.Shape() : new oc.BRepPrimAPI_MakeBox_1(b.dx, b.dy, b.dz).Shape();
    } else {
      shapeB = new oc.BRepPrimAPI_MakeBox_1(b.dx, b.dy, b.dz).Shape();
    }
    let cutShape: unknown = null;
    for (const key of [
      "BRepAlgoAPI_Cut_3",
      "BRepAlgoAPI_Cut_1",
      "BRepAlgoAPI_Cut_2",
      "BRepAlgoAPI_Cut",
    ]) {
      if (!isCallable(oc[key])) continue;
      try {
        const cut = new oc[key](shapeA, shapeB);
        if (isCallable(cut.Build)) cut.Build();
        cutShape = isCallable(cut.Shape) ? cut.Shape() : cut;
        break;
      } catch {
        // next overload
      }
    }
    if (!cutShape) {
      return { ok: false, code: "boolean-failed", detail: "BRepAlgoAPI_Cut overloads failed" };
    }
    const tess = tessellateStudioOcctShape(oc, cutShape, 0.15);
    if (tess.triangleCount < 1) {
      return { ok: false, code: "empty-tessellation", detail: "cut produced no triangles" };
    }
    return packResult(
      "BRepAlgoAPI_Cut",
      soupToMesh(tess.positions, tess.indices),
      tess.faceCount,
      tess.triangleCount,
      Math.max(0, approxVolumeBox(a.dx, a.dy, a.dz) - approxVolumeBox(b.dx, b.dy, b.dz) * 0.5),
      runtime.loadPath,
    );
  } catch (error) {
    return {
      ok: false,
      code: "occt-unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Linear extrusion stand-in via OCCT box solid (profile → prism). */
export async function occtExtrudeRectangle(
  width: number,
  depth: number,
  height: number,
): Promise<StudioOcctSolidResult | StudioOcctFail> {
  return occtMakeBoxSolid(width, height, depth);
}
