import { describe, expect, it } from "vitest";

import { addCharacterSurfaceInkStroke, createEmptyCharacterSurfaceInkDocument } from "./character-surface-ink";
import { parseCharacterSurfaceInkDocument } from "./character-surface-ink-storage";

function fixture() {
  const anchor = { meshAssetId: "face", topologyRevision: "topology-1", primitiveIndex: 0, triangleIndex: 0,
    barycentric: [1, 0, 0] as const, localNormal: [0, 0, 1] as const, localTangent: [1, 0, 0] as const,
    skinIndices: [0, 0, 0, 0] as const, skinWeights: [1, 0, 0, 0] as const, pressure: 0.5, width: 1 };
  return JSON.parse(JSON.stringify(addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "ink", {
    strokeId: "stroke-1", meshAssetId: "face", topologyRevision: "topology-1", status: "valid",
    anchors: [anchor, { ...anchor, barycentric: [0, 1, 0] }],
    style: { color: "#111111", widthMode: "surface", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0,
      pressureWidth: 0, pressureOpacity: 0, smoothing: 0, surfaceOffset: 0.001, cap: "round", join: "round", frontFacesOnly: true },
  })));
}

describe("surface ink persisted input validation", () => {
  it.each(["valid", "needs-reprojection", "orphaned"])("preserves complete %s records", (status) => {
    const document = fixture();
    document.layers[0].strokes[0].status = status;
    expect(parseCharacterSurfaceInkDocument(JSON.stringify(document))).toEqual(document);
  });

  it.each([
    ["layer", "layerId"], ["layer", "name"], ["layer", "visible"], ["layer", "locked"],
    ["layer", "opacity"], ["layer", "blendMode"], ["stroke", "strokeId"], ["stroke", "status"],
    ["stroke", "style"], ["stroke", "meshAssetId"], ["stroke", "topologyRevision"],
    ["anchor", "primitiveIndex"], ["anchor", "triangleIndex"], ["anchor", "pressure"], ["anchor", "width"],
    ["anchor", "meshAssetId"], ["anchor", "topologyRevision"], ["style", "color"], ["style", "widthMode"],
    ["style", "baseWidth"], ["style", "opacity"], ["style", "taperStart"], ["style", "taperEnd"],
    ["style", "pressureWidth"], ["style", "pressureOpacity"], ["style", "smoothing"],
    ["style", "surfaceOffset"], ["style", "cap"], ["style", "join"], ["style", "frontFacesOnly"],
  ])("rejects a missing %s.%s instead of importing invisible ink", (kind, field) => {
    const document = fixture();
    const layer = document.layers[0];
    const stroke = layer.strokes[0];
    const record = kind === "layer" ? layer : kind === "stroke" ? stroke : kind === "anchor" ? stroke.anchors[0] : stroke.style;
    delete record[field];
    expect(() => parseCharacterSurfaceInkDocument(JSON.stringify(document))).toThrow();
  });

  it.each([
    ["status", "future"], ["style", null], ["anchors", []],
  ])("rejects malformed stroke %s", (field, value) => {
    const document = fixture();
    document.layers[0].strokes[0][field as string] = value;
    expect(() => parseCharacterSurfaceInkDocument(JSON.stringify(document))).toThrow();
  });

  it.each(["triangleIndex", "primitiveIndex", "pressure", "width"])("rejects invalid anchor %s", (field) => {
    const document = fixture();
    document.layers[0].strokes[0].anchors[0][field] = -1;
    expect(() => parseCharacterSurfaceInkDocument(JSON.stringify(document))).toThrow();
  });
});
