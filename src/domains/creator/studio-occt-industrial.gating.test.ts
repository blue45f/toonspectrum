/**
 * Industrial CAD fidelity: real OpenCascade WASM path must produce non-zero B-Rep meshes.
 */
import { describe, expect, it } from "vitest";

import {
  loadStudioOcctRuntime,
  occtBooleanCutBoxes,
  occtMakeBoxSolid,
  occtMakeCylinderSolid,
} from "./studio-occt-wasm-facade";

describe("industrial OCCT WASM CAD", () => {
  it("loads opencascade.wasm and reports backend", async () => {
    const rt = await loadStudioOcctRuntime();
    expect(rt.backend).toBe("opencascade-wasm");
    expect(rt.occtVersionHint).toMatch(/OCCT/i);
    expect(rt.loadPath).toBe("node");
    expect(rt.module.BRepPrimAPI_MakeBox_1).toBeTypeOf("function");
  }, 120_000);

  it("BRepPrimAPI_MakeBox tessellates to closed solid mesh", async () => {
    const box = await occtMakeBoxSolid(2, 1, 3);
    expect(box.ok).toBe(true);
    if (!box.ok) return;
    expect(box.backend).toBe("opencascade-wasm");
    expect(box.operation).toBe("BRepPrimAPI_MakeBox");
    expect(box.faceCount).toBe(6);
    expect(box.triangleCount).toBeGreaterThanOrEqual(12);
    expect(box.vertexCount).toBeGreaterThanOrEqual(8);
    expect(box.volumeApprox).toBeCloseTo(6, 5);
    expect(box.mesh.faces.length).toBeGreaterThan(0);
  }, 120_000);

  it("BRepPrimAPI_MakeCylinder tessellates curved solid", async () => {
    const cyl = await occtMakeCylinderSolid(0.5, 2);
    expect(cyl.ok).toBe(true);
    if (!cyl.ok) return;
    expect(cyl.triangleCount).toBeGreaterThan(12);
    expect(cyl.faceCount).toBeGreaterThanOrEqual(3);
    expect(cyl.volumeApprox).toBeGreaterThan(1);
  }, 120_000);

  it("BRepAlgoAPI_Cut produces boolean difference mesh", async () => {
    const cut = await occtBooleanCutBoxes(
      { dx: 2, dy: 2, dz: 2 },
      { dx: 1, dy: 1, dz: 1, ox: 0.5, oy: 0.5, oz: 0.5 },
    );
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.operation).toBe("BRepAlgoAPI_Cut");
    expect(cut.triangleCount).toBeGreaterThan(12);
    expect(cut.backend).toBe("opencascade-wasm");
  }, 120_000);
});
