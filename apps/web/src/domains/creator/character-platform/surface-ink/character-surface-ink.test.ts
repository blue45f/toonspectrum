import { describe, expect, it } from "vitest";

import {
  addCharacterSurfaceInkStroke,
  buildCharacterSurfaceInkRibbon,
  createEmptyCharacterSurfaceInkDocument,
  evaluateCharacterSurfaceInkAnchor,
  markCharacterSurfaceInkTopology,
  removeCharacterSurfaceInkStroke,
  resampleCharacterInkPositions,
} from "./character-surface-ink";

import type {
  CharacterSurfaceInkAnchor,
  CharacterSurfaceInkStroke,
  CharacterTriangleSurface,
} from "./character-surface-ink";

const triangle: CharacterTriangleSurface = {
  positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
  skinIndices: [[0, 1, 0, 0], [1, 2, 0, 0], [2, 3, 0, 0]],
  skinWeights: [[0.8, 0.2, 0, 0], [0.6, 0.4, 0, 0], [0.5, 0.5, 0, 0]],
};

function anchor(index: number, barycentric: readonly [number, number, number]): CharacterSurfaceInkAnchor {
  return {
    meshAssetId: "face",
    topologyRevision: "topology-1",
    primitiveIndex: 0,
    triangleIndex: index,
    barycentric,
    localNormal: [0, 0, 1],
    localTangent: [1, 0, 0],
    skinIndices: [0, 0, 0, 0],
    skinWeights: [1, 0, 0, 0],
    pressure: 0.5,
    width: 1,
  };
}

function stroke(): CharacterSurfaceInkStroke {
  return {
    strokeId: "stroke-1",
    meshAssetId: "face",
    topologyRevision: "topology-1",
    anchors: [anchor(0, [0.8, 0.1, 0.1]), anchor(1, [0.1, 0.8, 0.1])],
    style: {
      color: "#111111",
      widthMode: "surface",
      baseWidth: 0.02,
      opacity: 1,
      taperStart: 0,
      taperEnd: 0,
      pressureWidth: 0,
      pressureOpacity: 0,
      smoothing: 0.4,
      surfaceOffset: 0.001,
      cap: "round",
      join: "round",
      frontFacesOnly: true,
    },
    status: "valid",
  };
}

describe("character surface ink", () => {
  it("evaluates barycentric position and normalized skin weights", () => {
    const value = evaluateCharacterSurfaceInkAnchor(anchor(0, [0.5, 0.25, 0.25]), triangle);
    expect(value.position).toEqual([0.25, 0.25, 0]);
    expect(value.skinWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it("builds a two-sided skinned ribbon", () => {
    const ribbon = buildCharacterSurfaceInkRibbon(stroke(), new Map([[0, triangle], [1, triangle]]));
    expect(ribbon.positions).toHaveLength(12);
    expect(ribbon.skinIndices).toHaveLength(16);
    expect(ribbon.skinWeights).toHaveLength(16);
    expect(ribbon.indices).toEqual(new Uint32Array([0, 2, 1, 2, 3, 1]));
    expect(ribbon.bounds.minimum[2]).toBeCloseTo(0.001);
  });

  it("resamples paths and preserves the final point", () => {
    const values = resampleCharacterInkPositions([[0, 0, 0], [1, 0, 0]], 0.25);
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values.at(-1)).toEqual([1, 0, 0]);
  });

  it("stores strokes by layer and marks topology mismatches without deleting data", () => {
    const withStroke = addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "details", stroke());
    expect(withStroke.layers[0]?.strokes).toHaveLength(1);
    const changed = markCharacterSurfaceInkTopology(withStroke, "topology-2");
    expect(changed.layers[0]?.strokes[0]?.status).toBe("needs-reprojection");
    expect(removeCharacterSurfaceInkStroke(changed, "stroke-1").layers[0]?.strokes).toHaveLength(0);
  });
});
