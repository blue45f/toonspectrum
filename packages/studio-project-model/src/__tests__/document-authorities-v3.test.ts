import { describe, expect, it } from "vitest";

import {
  LayerGraphInvariantError,
  identityTransformV3,
  parseLayerGraphV3,
} from "../ir/layer-graph-v3";
import {
  parseSceneDocument3DV3,
  threeDLiveLayerLinkV3Schema,
} from "../ir/scene-3d-v3";
import {
  decodedTileByteLength,
  selectResidentTilesV3,
  sparseTileSetV3Schema,
  tileKeyV3String,
} from "../ir/sparse-tile-v3";
import {
  editableVectorStrokeV3Schema,
  parseEditableVectorStrokeV3,
  rescaleVectorStrokeV3,
  vectorStrokeV3Bounds,
} from "../ir/vector-stroke-v3";

const hash = "a".repeat(64);

describe("LayerGraphV3", () => {
  it("accepts a bidirectionally linked group and mask graph", () => {
    const graph = parseLayerGraphV3({
      schemaVersion: 3,
      rootLayerIds: ["group-1", "mask-1"],
      layers: {
        "group-1": {
          id: "group-1",
          kind: "group",
          name: "선화",
          childIds: ["vector-1"],
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "pass-through",
          transform: identityTransformV3(),
          maskLayerIds: ["mask-1"],
          effectNodeIds: [],
          metadata: {},
        },
        "vector-1": {
          id: "vector-1",
          kind: "vector",
          name: "G펜",
          parentId: "group-1",
          childIds: [],
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
          transform: identityTransformV3(),
          contentRef: "vector-content-1",
          maskLayerIds: [],
          effectNodeIds: [],
          metadata: {},
        },
        "mask-1": {
          id: "mask-1",
          kind: "mask",
          name: "마스크",
          childIds: [],
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
          transform: identityTransformV3(),
          contentRef: "mask-content-1",
          maskLayerIds: [],
          effectNodeIds: [],
          metadata: {},
        },
      },
    });
    expect(graph.layers["vector-1"]?.parentId).toBe("group-1");
  });

  it("rejects cycles even when every referenced layer exists", () => {
    expect(() => parseLayerGraphV3({
      schemaVersion: 3,
      rootLayerIds: [],
      layers: {
        a: {
          id: "a",
          kind: "group",
          name: "A",
          parentId: "b",
          childIds: ["b"],
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
          transform: identityTransformV3(),
          maskLayerIds: [],
          effectNodeIds: [],
          metadata: {},
        },
        b: {
          id: "b",
          kind: "group",
          name: "B",
          parentId: "a",
          childIds: ["a"],
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
          transform: identityTransformV3(),
          maskLayerIds: [],
          effectNodeIds: [],
          metadata: {},
        },
      },
    })).toThrow(LayerGraphInvariantError);
  });
});

describe("SparseTileSetV3", () => {
  it("uses deterministic tile keys and validates document bounds", () => {
    const key = { layerId: "raster-1", mip: 0, x: 1, y: 2 };
    const tile = {
      key,
      blob: {
        id: "blob-1",
        sha256: hash,
        size: 262_144,
        mediaType: "application/x-toon-tile",
        role: "tile",
      },
      pixelFormat: "rgba8",
      colorSpace: "display-p3",
      premultiplied: true,
    };
    const set = sparseTileSetV3Schema.parse({
      schemaVersion: 3,
      tileSize: 256,
      width: 1_000,
      height: 120_000,
      tiles: { [tileKeyV3String(key)]: tile },
    });
    expect(Object.keys(set.tiles)).toEqual(["raster-1:0:1:2"]);
    expect(decodedTileByteLength(256, "rgba8")).toBe(262_144);
  });

  it("keeps viewport-near tiles within an explicit decoded-memory budget", () => {
    expect(selectResidentTilesV3([
      { key: "far", decodedBytes: 100, viewportDistance: 4, mipPenalty: 0, lastUsedAt: 5 },
      { key: "near-new", decodedBytes: 100, viewportDistance: 0, mipPenalty: 0, lastUsedAt: 10 },
      { key: "near-old", decodedBytes: 100, viewportDistance: 0, mipPenalty: 0, lastUsedAt: 1 },
    ], 200)).toEqual(["near-new", "near-old"]);
  });
});

describe("EditableVectorStrokeV3", () => {
  it("preserves deterministic brush identity while editing geometry", () => {
    const stroke = parseEditableVectorStrokeV3({
      id: "stroke-1",
      brushRef: { brushId: "g-pen", version: "1.0.0", contentHash: hash },
      centerline: [{
        p0: { x: 0, y: 0 },
        p1: { x: 5, y: 0 },
        p2: { x: 5, y: 10 },
        p3: { x: 10, y: 10 },
      }],
      widthProfile: [
        { t: 0, width: 2 },
        { t: 1, width: 6 },
      ],
      color: { r: 0, g: 0, b: 0, a: 1 },
      opacity: 1,
      deterministicSeed: 42,
    });
    const scaled = rescaleVectorStrokeV3(stroke, 2, 2);
    expect(scaled.brushRef).toEqual(stroke.brushRef);
    expect(scaled.widthProfile[1]?.width).toBe(12);
    expect(vectorStrokeV3Bounds(stroke)).toEqual({ minX: -3, minY: -3, maxX: 13, maxY: 13 });
  });

  it("rejects unordered width profiles", () => {
    expect(() => editableVectorStrokeV3Schema.parse({
      id: "stroke-invalid",
      brushRef: { brushId: "g-pen", version: "1.0.0", contentHash: hash },
      centerline: [{
        p0: { x: 0, y: 0 },
        p1: { x: 1, y: 0 },
        p2: { x: 1, y: 1 },
        p3: { x: 2, y: 1 },
      }],
      widthProfile: [
        { t: 0, width: 1 },
        { t: 0.8, width: 1 },
        { t: 0.7, width: 1 },
        { t: 1, width: 1 },
      ],
      color: { r: 0, g: 0, b: 0, a: 1 },
      opacity: 1,
      deterministicSeed: 1,
    })).toThrow(/strictly increasing/u);
  });
});

describe("SceneDocument3DV3", () => {
  it("pins a camera, variant and editable webtoon render passes", () => {
    const scene = parseSceneDocument3DV3({
      schemaVersion: 3,
      rootNodeIds: ["camera-node"],
      nodes: {
        "camera-node": {
          id: "camera-node",
          kind: "camera",
          name: "37컷 카메라",
          childIds: [],
          transform: {
            translation: [0, 1, 5],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
          visible: true,
          locked: false,
        },
      },
      cameras: {
        "camera-37": {
          id: "camera-37",
          nodeId: "camera-node",
          projection: "perspective",
          focalLengthMm: 50,
          near: 0.01,
          far: 10_000,
        },
      },
      variants: {
        night: {
          id: "night",
          name: "야간",
          visibleNodeIds: ["camera-node"],
          hiddenNodeIds: [],
          materialOverrides: {},
        },
      },
      activeCameraId: "camera-37",
      activeVariantId: "night",
    });
    expect(scene.activeCameraId).toBe("camera-37");
    expect(threeDLiveLayerLinkV3Schema.parse({
      sceneArtifactId: "scene-artifact-1",
      sceneRevisionId: "scene-revision-9",
      cameraId: "camera-37",
      variantId: "night",
      renderProfileId: "webtoon-line-tone",
      outputPasses: ["line", "tone", "depth", "object-id"],
      pinMode: "pinned-revision",
    }).outputPasses).toContain("object-id");
  });
});
