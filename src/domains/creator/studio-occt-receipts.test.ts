import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
} from "./studio-editable-half-edge-mesh";
import { inspectStudioOcctMeshTopology } from "./studio-occt-wasm-facade";

describe("Studio OCCT topology receipts", () => {
  it("certifies a consistently oriented closed cube", () => {
    const receipt = inspectStudioOcctMeshTopology(createStudioUnitCubeMesh());
    expect(receipt).toMatchObject({
      boundaryEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      orientationConflictEdgeCount: 0,
      degenerateTriangleCount: 0,
      consistentOrientation: true,
      watertight: true,
      closedSolid: true,
    });
    expect(receipt.signedVolume).toBeCloseTo(1, 10);
  });

  it("distinguishes open, winding-conflicted, and non-manifold meshes", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: -1, z: 0 },
    ];
    const open = inspectStudioOcctMeshTopology(
      createStudioEditableMeshFromPolygons(points, [[0, 1, 2]]),
    );
    expect(open).toMatchObject({
      boundaryEdgeCount: 3,
      watertight: false,
      closedSolid: false,
    });

    const windingConflict = inspectStudioOcctMeshTopology(
      createStudioEditableMeshFromPolygons(points, [[0, 1, 2], [0, 1, 3]]),
    );
    expect(windingConflict.orientationConflictEdgeCount).toBe(1);
    expect(windingConflict.consistentOrientation).toBe(false);
    expect(windingConflict.closedSolid).toBe(false);

    const nonManifold = inspectStudioOcctMeshTopology(
      createStudioEditableMeshFromPolygons(
        points,
        [[0, 1, 2], [1, 0, 3], [0, 1, 4]],
      ),
    );
    expect(nonManifold.nonManifoldEdgeCount).toBe(1);
    expect(nonManifold.watertight).toBe(false);
    expect(nonManifold.closedSolid).toBe(false);
  });
});
