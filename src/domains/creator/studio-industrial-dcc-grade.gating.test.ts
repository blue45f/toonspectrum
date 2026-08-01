/**
 * Industrial DCC grade: openNURBS (rhino3dm), web-ifc city, SolidWorks-grade OCCT suite.
 */
import { describe, expect, it } from "vitest";

import { occtSolidWorksGradeSuite } from "./studio-occt-wasm-facade";
import {
  createStudioRhino3dmNurbsFixture,
  evaluateStudioNurbsCurve,
  evaluateStudioNurbsSurfaceSphere,
  parseStudioRhino3dmOpenNurbs,
} from "./studio-rhino3dm-nurbs";
import {
  createStudioIfcCityFixture,
  importStudioIfcCity,
} from "./studio-web-ifc-city";

describe("openNURBS NURBS eval (rhino3dm WASM)", () => {
  it("evaluates NURBS curve samples and serializes File3dm", async () => {
    const curve = await evaluateStudioNurbsCurve(
      [
        [0, 0, 0],
        [1, 1, 0],
        [2, 0, 0],
        [3, 1, 0],
      ],
      24,
      3,
    );
    expect(curve.ok).toBe(true);
    expect(curve.backend).toBe("rhino3dm-opennurbs");
    expect(curve.sampleCount).toBeGreaterThanOrEqual(20);
    expect(curve.arcLengthApprox).toBeGreaterThan(1);
    expect(curve.file3dmBytes).toBeGreaterThan(100);
  }, 120_000);

  it("tessellates NURBS sphere surface to mesh", async () => {
    const surf = await evaluateStudioNurbsSurfaceSphere(1, 12, 10);
    expect(surf.ok).toBe(true);
    expect(surf.backend).toBe("rhino3dm-opennurbs");
    expect(surf.vertexCount).toBeGreaterThan(50);
    expect(surf.faceCount).toBeGreaterThan(50);
  }, 120_000);

  it("parses openNURBS File3dm fixture with curve samples", async () => {
    const bytes = await createStudioRhino3dmNurbsFixture();
    expect(bytes.byteLength).toBeGreaterThan(500);
    const parsed = await parseStudioRhino3dmOpenNurbs(bytes);
    expect(parsed.ok).toBe(true);
    expect(parsed.backend).toBe("rhino3dm-opennurbs");
    expect(parsed.objectCount + parsed.curveSamples).toBeGreaterThan(0);
  }, 120_000);
});

describe("web-ifc city body geometry", () => {
  it("streams multi-storey wall/slab meshes from IFC city fixture", async () => {
    const ifc = createStudioIfcCityFixture();
    expect(ifc).toMatch(/IFCWALL/u);
    expect(ifc).toMatch(/IFCBUILDINGSTOREY/u);
    const city = await importStudioIfcCity(ifc);
    expect(city.ok).toBe(true);
    if (!city.ok) return;
    expect(city.backend).toBe("web-ifc");
    expect(city.geometryGrade).toBe("A");
    expect(city.triangleCount).toBeGreaterThan(0);
    expect(city.vertexCount).toBeGreaterThan(0);
    expect(city.meshCount).toBeGreaterThan(0);
    expect(city.storeyCount + city.wallCount).toBeGreaterThan(0);
    expect(city.meshes.length).toBeGreaterThan(0);
  }, 120_000);
});

describe("SolidWorks-grade OCCT suite", () => {
  it("runs box/cylinder/cut/fuse/fillet/loft with non-zero triangles", async () => {
    const suite = await occtSolidWorksGradeSuite();
    expect(suite.ok).toBe(true);
    expect(suite.backend).toBe("opencascade-wasm");
    expect(suite.ops.length).toBeGreaterThanOrEqual(4);
    expect(suite.totalTriangles).toBeGreaterThan(20);
    expect(suite.totalFaces).toBeGreaterThan(0);
    const okOps = suite.ops.filter((o) => !o.includes(":fail:"));
    expect(okOps.length).toBeGreaterThanOrEqual(3);
  }, 180_000);
});
