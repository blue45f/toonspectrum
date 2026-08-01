/**
 * Industrial IFC city / building body geometry via ThatOpen web-ifc WASM.
 * Streams tessellated meshes for walls/slabs/spaces — not header-only lite.
 */

import { createRequire } from "node:module";
import path from "node:path";

import {
  createStudioEditableMeshFromPolygons,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";

export const STUDIO_WEB_IFC_CITY_REVISION = 1 as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebIfcApi = any;

let cachedApi: WebIfcApi | null = null;
let cachedPromise: Promise<WebIfcApi> | null = null;

function isNodeHost(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (globalThis as any).process?.versions?.node;
    return typeof v === "string" && v.length > 0;
  } catch {
    return false;
  }
}

function v(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

function soupToMesh(positions: number[], indices: number[]): StudioEditableMesh {
  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    verts.push(v(positions[i]!, positions[i + 1]!, positions[i + 2]!));
  }
  const faces: number[][] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    faces.push([indices[i]!, indices[i + 1]!, indices[i + 2]!]);
  }
  return createStudioEditableMeshFromPolygons(verts, faces);
}

/** Load web-ifc API (Node uses web-ifc-node.wasm; browser uses web-ifc.wasm). */
export async function loadStudioWebIfcApi(): Promise<WebIfcApi> {
  if (cachedApi) return cachedApi;
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    if (isNodeHost()) {
      const require = createRequire(import.meta.url);
       
      const WebIFC = require("web-ifc");
      const api = new WebIFC.IfcAPI();
      const wasmDir = path.dirname(require.resolve("web-ifc"));
      api.SetWasmPath(`${wasmDir}${path.sep}`, true);
      await api.Init();
      cachedApi = api;
      return api;
    }
    const WebIFC = await import(/* @vite-ignore */ "web-ifc");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new (WebIFC as any).IfcAPI();
    let wasmPath = "/node_modules/web-ifc/";
    try {
      const urlMod = await import(/* @vite-ignore */ "web-ifc/web-ifc.wasm?url");
      const url = (urlMod as { default?: string }).default;
      if (url) {
        const slash = url.lastIndexOf("/");
        wasmPath = slash >= 0 ? url.slice(0, slash + 1) : wasmPath;
      }
    } catch {
      // keep fallback
    }
    api.SetWasmPath(wasmPath, true);
    await api.Init();
    cachedApi = api;
    return api;
  })();
  return cachedPromise;
}

export function resetStudioWebIfcForTests(): void {
  if (cachedApi) {
    try {
      // no global dispose
    } catch {
      // ignore
    }
  }
  cachedApi = null;
  cachedPromise = null;
}

export type StudioWebIfcCityResult = {
  readonly ok: true;
  readonly backend: "web-ifc";
  readonly modelId: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly wallCount: number;
  readonly slabCount: number;
  readonly spaceCount: number;
  readonly storeyCount: number;
  readonly buildingCount: number;
  readonly meshes: readonly StudioEditableMesh[];
  readonly geometryGrade: "A";
};

/**
 * Import IFC bytes with full body tessellation (city/building scale).
 * Uses StreamAllMeshes — not cartesian-point AABB proxy.
 */
export async function importStudioIfcCity(
  source: string | Uint8Array,
): Promise<StudioWebIfcCityResult | { readonly ok: false; readonly code: string; readonly detail: string }> {
  try {
    const api = await loadStudioWebIfcApi();
    const bytes =
      typeof source === "string" ? new TextEncoder().encode(source) : source;
    const modelId = api.OpenModel(bytes) as number;
    const meshes: StudioEditableMesh[] = [];
    let vertexCount = 0;
    let triangleCount = 0;
    let meshCount = 0;

    api.StreamAllMeshes(modelId, (mesh: {
      geometries: { size: () => number; get: (i: number) => { geometryExpressID: number } };
    }) => {
      meshCount += 1;
      const geoms = mesh.geometries;
      const n = geoms.size();
      for (let i = 0; i < n; i += 1) {
        const placed = geoms.get(i);
        const geom = api.GetGeometry(modelId, placed.geometryExpressID);
        try {
          const verts = api.GetVertexArray(
            geom.GetVertexData(),
            geom.GetVertexDataSize(),
          ) as Float32Array | number[];
          const indices = api.GetIndexArray(
            geom.GetIndexData(),
            geom.GetIndexDataSize(),
          ) as Uint32Array | number[];
          const pos: number[] = [];
          // web-ifc vertex array is xyz (float) packed; may include normals
          const arr = verts instanceof Float32Array ? verts : Float32Array.from(verts);
          // Stride: if length divisible by 6, treat as pos+normal interleaved
          const stride = arr.length % 6 === 0 && arr.length % 3 === 0 && arr.length / 6 >= 3 ? 6 : 3;
          for (let k = 0; k + 2 < arr.length; k += stride) {
            pos.push(arr[k]!, arr[k + 1]!, arr[k + 2]!);
          }
          const idx = indices instanceof Uint32Array ? Array.from(indices) : [...indices];
          if (pos.length >= 9 && idx.length >= 3) {
            const m = soupToMesh(pos, idx);
            meshes.push(m);
            vertexCount += m.vertices.length;
            triangleCount += m.faces.length;
          }
        } finally {
          try {
            geom.delete();
          } catch {
            // ignore
          }
        }
      }
    });

    // Semantic counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WebIFC: any = isNodeHost()
      ? createRequire(import.meta.url)("web-ifc")
      : await import(/* @vite-ignore */ "web-ifc");
    const countType = (typeConst: number): number => {
      try {
        const lines = api.GetLineIDsWithType(modelId, typeConst);
        return typeof lines.size === "function" ? lines.size() : 0;
      } catch {
        return 0;
      }
    };
    const wallCount =
      countType(WebIFC.IFCWALL ?? 0) + countType(WebIFC.IFCWALLSTANDARDCASE ?? 0);
    const slabCount = countType(WebIFC.IFCSLAB ?? 0);
    const spaceCount = countType(WebIFC.IFCSPACE ?? 0);
    const storeyCount = countType(WebIFC.IFCBUILDINGSTOREY ?? 0);
    const buildingCount = countType(WebIFC.IFCBUILDING ?? 0);

    api.CloseModel(modelId);

    if (meshCount < 1 && triangleCount < 1) {
      return {
        ok: false,
        code: "no-body-geometry",
        detail: "web-ifc StreamAllMeshes produced no triangles",
      };
    }

    return {
      ok: true,
      backend: "web-ifc",
      modelId,
      meshCount,
      vertexCount,
      triangleCount,
      wallCount,
      slabCount,
      spaceCount,
      storeyCount,
      buildingCount,
      meshes,
      geometryGrade: "A",
    };
  } catch (error) {
    return {
      ok: false,
      code: "web-ifc-unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** City-scale fixture: multi-storey extruded walls + slabs (valid IFC4). */
export function createStudioIfcCityFixture(): string {
  const walls: string[] = [];
  const rels: string[] = [];
  let id = 100;
  const storeys = 3;
  const storeyIds: number[] = [];
  for (let s = 0; s < storeys; s += 1) {
    const sid = id++;
    storeyIds.push(sid);
  }
  // Rebuild with proper sequential IDs
  const lines: string[] = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('city.ifc','2026-08-02T00:00:00',('ToonSpectrum'),('ToonSpectrum'),'web-ifc','web-ifc','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPERSON($,$,'Author',$,$,$,$,$);",
    "#2=IFCORGANIZATION($,'ToonSpectrum',$,$,$);",
    "#3=IFCPERSONANDORGANIZATION(#1,#2,$);",
    "#4=IFCAPPLICATION(#2,'1.0','ToonSpectrum','ts');",
    "#5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,#3,#4,0);",
    "#6=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-05,#7,$);",
    "#7=IFCAXIS2PLACEMENT3D(#8,$,$);",
    "#8=IFCCARTESIANPOINT((0.,0.,0.));",
    "#10=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
    "#11=IFCUNITASSIGNMENT((#10));",
    "#12=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FPRJ',#5,'CityProject',$,$,$,$,(#6),#11);",
    "#13=IFCLOCALPLACEMENT($,#7);",
    "#14=IFCSITE('2O2Fr$t4X7Zf8NOew3FSIT',#5,'Site',$,$,#13,$,$,.ELEMENT.,$,$,$,$,$);",
    "#15=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FRA1',#5,$,$,#12,(#14));",
    "#16=IFCBUILDING('2O2Fr$t4X7Zf8NOew3FBLD',#5,'Tower',$,$,#13,$,$,.ELEMENT.,$,$,$);",
    "#17=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FRA2',#5,$,$,#14,(#16));",
  ];
  let next = 20;
  const storeyEntityIds: number[] = [];
  const elementIds: number[] = [];
  for (let s = 0; s < storeys; s += 1) {
    const elev = s * 3;
    const placeId = next++;
    const axisId = next++;
    const ptId = next++;
    const storeyId = next++;
    lines.push(`#${ptId}=IFCCARTESIANPOINT((0.,0.,${elev}.));`);
    lines.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${ptId},$,$);`);
    lines.push(`#${placeId}=IFCLOCALPLACEMENT(#13,#${axisId});`);
    lines.push(
      `#${storeyId}=IFCBUILDINGSTOREY('2O2Fr$t4X7Zf8NOew3FS${s}',#5,'L${s}',$,$,#${placeId},$,$,.ELEMENT.,${elev}.);`,
    );
    storeyEntityIds.push(storeyId);

    // Wall extruded solid per storey
    const profId = next++;
    const profPlId = next++;
    const profPtId = next++;
    const dirId = next++;
    const solidId = next++;
    const shapeId = next++;
    const pdsId = next++;
    const wallId = next++;
    lines.push(`#${profPtId}=IFCCARTESIANPOINT((0.,0.));`);
    lines.push(`#${profPlId}=IFCAXIS2PLACEMENT2D(#${profPtId},$);`);
    lines.push(`#${profId}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profPlId},${8 + s}.,0.3);`);
    lines.push(`#${dirId}=IFCDIRECTION((0.,0.,1.));`);
    lines.push(`#${solidId}=IFCEXTRUDEDAREASOLID(#${profId},#${axisId},#${dirId},2.8);`);
    lines.push(`#${shapeId}=IFCSHAPEREPRESENTATION(#6,'Body','SweptSolid',(#${solidId}));`);
    lines.push(`#${pdsId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeId}));`);
    lines.push(
      `#${wallId}=IFCWALL('2O2Fr$t4X7Zf8NOew3FW${s}',#5,'Wall${s}',$,$,#${placeId},#${pdsId},$,$);`,
    );
    elementIds.push(wallId);
    walls.push(String(wallId));

    // Slab
    const slabProf = next++;
    const slabSolid = next++;
    const slabShape = next++;
    const slabPds = next++;
    const slabId = next++;
    const slabDir = next++;
    lines.push(`#${slabProf}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profPlId},10.,10.);`);
    lines.push(`#${slabDir}=IFCDIRECTION((0.,0.,1.));`);
    lines.push(`#${slabSolid}=IFCEXTRUDEDAREASOLID(#${slabProf},#${axisId},#${slabDir},0.25);`);
    lines.push(`#${slabShape}=IFCSHAPEREPRESENTATION(#6,'Body','SweptSolid',(#${slabSolid}));`);
    lines.push(`#${slabPds}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${slabShape}));`);
    lines.push(
      `#${slabId}=IFCSLAB('2O2Fr$t4X7Zf8NOew3FL${s}',#5,'Slab${s}',$,$,#${placeId},#${slabPds},$,.FLOOR.);`,
    );
    elementIds.push(slabId);

    // Space
    const spaceId = next++;
    lines.push(
      `#${spaceId}=IFCSPACE('2O2Fr$t4X7Zf8NOew3FP${s}',#5,'Room${s}',$,$,#${placeId},$,$,.ELEMENT.,.INTERNAL.,$);`,
    );

    const contId = next++;
    lines.push(
      `#${contId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FC${s}',#5,$,$,(#${wallId},#${slabId}),#${storeyId});`,
    );
    rels.push(String(contId));
  }
  lines.push(
    `#${next}=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FRA3',#5,$,$,#16,(${storeyEntityIds.map((x) => `#${x}`).join(",")}));`,
  );
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  void walls;
  void elementIds;
  void rels;
  return lines.join("\n");
}
