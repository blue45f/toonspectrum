import { describe, expect, it } from "vitest";

import {
  buildCharacterGeometryStrokeMesh,
  createEmptyCharacterGeometryStrokeDocument,
  markCharacterGeometryStrokeTopology,
  validateCharacterGeometryStrokeDocument,
  type CharacterGeometryStroke,
} from "./character-geometry-stroke";

const stroke: CharacterGeometryStroke = {
  strokeId: "stroke:eyelash",
  name: "속눈썹",
  visible: true,
  locked: false,
  status: "valid",
  style: {
    color: "#111111",
    baseWidth: 0.02,
    opacity: 1,
    taperStart: 0.2,
    taperEnd: 0.5,
    pressureWidth: 0.7,
    profile: "ribbon",
    fill: true,
    lineOnly: false,
  },
  points: [
    {
      anchor: {
        kind: "surface",
        position: [0, 0, 0],
        normal: [0, 0, 1],
        meshAssetId: "mesh:face",
        topologyRevision: "topology:v1",
        primitiveIndex: 0,
        triangleIndex: 1,
        barycentric: [0.2, 0.3, 0.5],
      },
      pressure: 0.4,
      width: 1,
      twist: 0,
    },
    {
      anchor: { kind: "free", position: [0.2, 0.1, 0.05], normal: [0, 0, 1] },
      pressure: 0.8,
      width: 0.8,
      twist: 0.1,
    },
    {
      anchor: { kind: "free", position: [0.4, 0.05, 0.1] },
      pressure: 0.2,
      width: 0.3,
      twist: 0.2,
    },
  ],
};

describe("Character geometry stroke", () => {
  it("keeps a renderer-neutral empty document", () => {
    expect(createEmptyCharacterGeometryStrokeDocument()).toEqual({ version: 1, strokes: [] });
    expect(validateCharacterGeometryStrokeDocument({ version: 1, strokes: [stroke] }).strokes).toHaveLength(1);
  });

  it("builds a real ribbon derivative for free and surface control points", () => {
    const mesh = buildCharacterGeometryStrokeMesh(stroke);
    expect(mesh.positions.length).toBe(stroke.points.length * 2 * 3);
    expect(mesh.indices.length).toBe((stroke.points.length - 1) * 6);
    expect([...mesh.positions].every(Number.isFinite)).toBe(true);
  });

  it("marks only topology-bound strokes for reprojection", () => {
    const changed = markCharacterGeometryStrokeTopology({ version: 1, strokes: [stroke] }, "topology:v2");
    expect(changed.strokes[0]?.status).toBe("needs-reprojection");
  });
});
