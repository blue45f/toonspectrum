/**
 * Industrial CAD fidelity: real OpenCascade WASM path must produce non-zero B-Rep meshes.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  studioEditableMeshStats,
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
} from "./studio-editable-half-edge-mesh";
import {
  loadStudioOcctRuntime,
  occtBooleanCutBoxes,
  occtMakeBoxSolid,
  occtMakeCylinderSolid,
} from "./studio-occt-wasm-facade";

function signedMeshVolume(mesh: StudioEditableMesh): number {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  let volume = 0;
  for (let i = 0; i + 2 < soup.indices.length; i += 3) {
    const ia = soup.indices[i]! * 3;
    const ib = soup.indices[i + 1]! * 3;
    const ic = soup.indices[i + 2]! * 3;
    const ax = soup.positions[ia]!;
    const ay = soup.positions[ia + 1]!;
    const az = soup.positions[ia + 2]!;
    const bx = soup.positions[ib]!;
    const by = soup.positions[ib + 1]!;
    const bz = soup.positions[ib + 2]!;
    const cx = soup.positions[ic]!;
    const cy = soup.positions[ic + 1]!;
    const cz = soup.positions[ic + 2]!;
    volume += (
      ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx)
    ) / 6;
  }
  return volume;
}

describe("industrial OCCT WASM CAD", () => {
  it("owns every operation-scoped Embind constructor behind deterministic cleanup", () => {
    const source = readFileSync(
      new URL("./studio-occt-wasm-facade.ts", import.meta.url),
      "utf8",
    );
    const operationSource = source.slice(source.indexOf("function makeOcctBoxShape"));
    const unownedConstructors = operationSource
      .split(/\r?\n/u)
      .filter((line) => line.includes("new oc") && !line.includes("owner.own(new oc"))
      // STEP/ThickSolid Embind .delete() corrupts opencascade.js WASM — intentional no-owner lines.
      .filter((line) => !line.includes("STEP_EMBIND_NO_DELETE") && !line.includes("THICK_EMBIND_NO_DELETE"));
    expect(unownedConstructors).toEqual([]);
    expect(source).toContain("return await operation(runtime, owner);");
    expect(source).toContain("owner.dispose();");
    const chainedShape = operationSource
      .split(/\r?\n/u)
      .filter((line) =>
        /new oc(?:\[[^\]]+\]|\.[A-Za-z0-9_]+)\([^;\n]*\)\.Shape\(/u.test(line)
      )
      .filter((line) => !line.includes("STEP_EMBIND_NO_DELETE") && !line.includes("THICK_EMBIND_NO_DELETE"));
    expect(chainedShape).toEqual([]);
  });

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
    expect(box.vertexCount).toBe(8);
    expect(box.volumeApprox).toBeCloseTo(6, 5);
    expect(box.mesh.faces.length).toBeGreaterThan(0);
    expect(studioEditableMeshStats(box.mesh).boundaryEdgeCount).toBe(0);
    expect(signedMeshVolume(box.mesh)).toBeCloseTo(6, 5);
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
    expect(cut.volumeApprox).toBeCloseTo(7, 5);
    expect(studioEditableMeshStats(cut.mesh).boundaryEdgeCount).toBe(0);
    expect(signedMeshVolume(cut.mesh)).toBeCloseTo(7, 5);
    const coords = cut.mesh.vertices.flatMap((vertex) => [
      vertex.position.x,
      vertex.position.y,
      vertex.position.z,
    ]);
    expect(coords.some((coordinate) => Math.abs(coordinate - 0.5) < 1e-5)).toBe(true);
    expect(coords.some((coordinate) => Math.abs(coordinate - 1.5) < 1e-5)).toBe(true);
  }, 120_000);

  it("keeps the shared WASM runtime callable across 100 cleaned tessellations", async () => {
    const runtime = await loadStudioOcctRuntime();
    const heapBefore = runtime.module.HEAPU8?.buffer?.byteLength ?? 0;
    for (let i = 0; i < 100; i += 1) {
      const box = await occtMakeBoxSolid(1 + (i % 3) * 0.1, 1, 1);
      expect(box.ok).toBe(true);
      if (box.ok) {
        expect(box.vertexCount).toBe(8);
        expect(studioEditableMeshStats(box.mesh).boundaryEdgeCount).toBe(0);
      }
    }
    const heapAfter = runtime.module.HEAPU8?.buffer?.byteLength ?? heapBefore;
    expect(heapAfter - heapBefore).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(runtime.module.BRepPrimAPI_MakeCylinder_1).toBeTypeOf("function");
  }, 120_000);
});
