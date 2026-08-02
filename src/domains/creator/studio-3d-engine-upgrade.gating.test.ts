/**
 * Engine upgrade gates: real ThruSections loft, AABB pure solid CSG,
 * workspace OCCT revolve/sphere/fillet/loft + Manifold boolean.
 */
import { describe, expect, it } from "vitest";

import {
  createStudioUnitCubeMesh,
  studioEditableMeshToTriangleSoup,
} from "./studio-editable-half-edge-mesh";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceManifoldBooleanActive,
  workspaceOcctFillet,
  workspaceOcctLoft,
  workspaceOcctRevolve,
  workspaceOcctSphere,
} from "./studio-hybrid-dcc-workspace";
import {
  occtLoftedTower,
  occtSolidWorksGradeSuite,
  STUDIO_OCCT_WASM_FACADE_REVISION,
} from "./studio-occt-wasm-facade";
import {
  createStudioPureConvexSolidBooleanBackend,
} from "./studio-solid-boolean-backend";

describe("3D engine upgrades", () => {
  it("OCCT loft uses real ThruSections (not fuse-stack rename)", async () => {
    expect(STUDIO_OCCT_WASM_FACADE_REVISION).toBeGreaterThanOrEqual(4);
    const loft = await occtLoftedTower([
      { dx: 2, dy: 2, z: 0 },
      { dx: 1.2, dy: 1.2, z: 1 },
      { dx: 0.6, dy: 0.6, z: 2 },
    ]);
    expect(loft.ok).toBe(true);
    if (!loft.ok) return;
    expect(loft.operation).toBe("BRepOffsetAPI_ThruSections");
    expect(loft.triangleCount).toBeGreaterThanOrEqual(12);
    expect(loft.faceCount).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it("SolidWorks suite reports realThruSections", async () => {
    const suite = await occtSolidWorksGradeSuite();
    expect(suite.ok).toBe(true);
    expect(suite.realThruSections).toBe(true);
    expect(suite.ops.some((o) => o === "BRepOffsetAPI_ThruSections")).toBe(true);
  }, 180_000);

  it("pure AABB cube difference yields non-degenerate solid (no Manifold)", async () => {
    const mesh = createStudioUnitCubeMesh();
    const soup = studioEditableMeshToTriangleSoup(mesh);
    const op = new Float32Array(soup.positions);
    for (let i = 0; i < op.length; i += 3) op[i]! += 0.4;
    for (let i = 0; i < op.length; i += 1) op[i]! *= 0.7;
    const pure = createStudioPureConvexSolidBooleanBackend();
    const out = await pure.boolean({
      left: { positions: soup.positions, indices: soup.indices },
      right: { positions: op, indices: soup.indices },
      operation: "difference",
    });
    expect(out.diagnostic).toMatch(/pure-convex-aabb/u);
    expect(out.indices.length / 3).toBeGreaterThanOrEqual(8);
    expect(out.positions.length / 3).toBeGreaterThanOrEqual(8);
  });

  it("workspace OCCT revolve/sphere/fillet/loft register non-empty assets", async () => {
    let ws = createStudioHybridDccWorkspace("upgrade-ws");
    ws = await workspaceOcctRevolve(ws, "r1", 0.4, 1.0);
    expect(ws.lastOcct?.triangleCount ?? 0).toBeGreaterThan(20);
    expect(ws.session.state.geometry.records["r1"]).toBeTruthy();

    ws = await workspaceOcctSphere(ws, "s1", 0.5);
    expect(ws.lastOcct?.operation).toMatch(/Sphere/u);
    expect(ws.lastOcct?.triangleCount ?? 0).toBeGreaterThan(50);

    ws = await workspaceOcctFillet(ws, "f1");
    expect(ws.lastOcct?.triangleCount ?? 0).toBeGreaterThan(8);

    ws = await workspaceOcctLoft(ws, "l1");
    expect(ws.lastOcct?.operation).toBe("BRepOffsetAPI_ThruSections");
    expect(ws.lastOcct?.triangleCount ?? 0).toBeGreaterThanOrEqual(12);
  }, 180_000);

  it("workspace Manifold boolean on unit cube is non-degenerate", async () => {
    let ws = createStudioHybridDccWorkspace("bool-ws");
    ws = workspaceAddUnitCube(ws);
    const before = Object.keys(ws.session.state.geometry.records).length;
    ws = await workspaceManifoldBooleanActive(ws);
    expect(Object.keys(ws.session.state.geometry.records).length).toBeGreaterThanOrEqual(before);
    const id = ws.activeAssetId!;
    const mesh = ws.session.state.geometry.records[id]!.mesh;
    expect(mesh.faces.length).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
