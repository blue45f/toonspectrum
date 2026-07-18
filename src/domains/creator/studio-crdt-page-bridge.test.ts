import { describe, expect, it } from "vitest";

import {
  StudioCrdtDocument,
  type StudioCrdtPageRecord,
  type StudioCrdtJsonObject,
  type StudioCrdtSceneElementRecord,
  type StudioCrdtStrokeRecord,
} from "./studio-crdt-document";
import {
  reconcileStudioCrdtPages,
  reconcileStudioCrdtSceneGraphPages,
  studioCrdtElementToSceneElement,
  studioCrdtStrokeToDrawElement,
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
  studioPageToCrdtPage,
  studioSceneElementToCrdtElement,
  type StudioCrdtCompatibleDrawElement,
  type StudioCrdtCompatibleSceneElement,
} from "./studio-crdt-page-bridge";

function record(
  id: string,
  pageId: string,
  orderIndex: number,
  overrides: Partial<StudioCrdtStrokeRecord> = {}
): StudioCrdtStrokeRecord {
  return {
    id,
    pageId,
    layerId: "page-root",
    status: "finalized",
    deleted: false,
    orderIndex,
    payload: {
      version: 1,
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [orderIndex, orderIndex, orderIndex + 1, orderIndex + 1],
      pressures: [0.4, 0.8],
      stroke: "#123456",
      strokeWidth: 7,
    },
    ...overrides,
  };
}

function sceneRecord(
  id: string,
  pageId: string,
  orderIndex: number,
  type: "text" | "bubble" = "text",
  overrides: Partial<StudioCrdtSceneElementRecord> = {}
): StudioCrdtSceneElementRecord {
  const props: StudioCrdtJsonObject = type === "text"
    ? { text: "대사", x: 10, y: 20, width: 240, fontSize: 28, fill: "#111", rotation: 0 }
    : {
        variant: "round", text: "말풍선", x: 20, y: 30, width: 260, height: 150,
        fill: "#fff", textFill: "#111", rotation: 0,
      };
  return {
    id,
    pageId,
    layerId: "lettering",
    deleted: false,
    orderIndex,
    payload: { version: 1, type, props },
    ...overrides,
  };
}

function pageRecord(
  id: string,
  orderIndex: number,
  overrides: Partial<StudioCrdtPageRecord> = {}
): StudioCrdtPageRecord {
  return {
    id,
    deleted: false,
    orderIndex,
    payload: {
      version: 1,
      props: { bg: "#ffffff", bgGrad: null, canvasH: 1600, name: id },
    },
    ...overrides,
  };
}

describe("studio CRDT page bridge", () => {
  it("round-trips the complete drawing metadata and aligns legacy pointer arrays", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [0.75],
      pressureModel: "linear-full-v1",
      stroke: "#abcdef",
      strokeWidth: 12,
      opacity: 0.6,
      brush: "calligraphy",
      brushTip: { tiltEnabled: true, angleDeg: 45, roundness: 0.7 },
      stamp: { flow: 0.4, hardness: 0.9, minSize: 0.2 },
      stampPipeline: "causal-walker-v2",
      symmetry: { type: "vertical", centerX: 400, centerY: 600 },
      groupId: "inks",
      hidden: true,
      layerColor: "blue",
      emeresSourceId: "custom:underlay-a",
    };

    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.layerId).toBe("inks");
    expect(encoded.payload.pressures).toEqual([0.75, 1]);
    expect(encoded.payload.extensions).toMatchObject({
      groupId: "inks",
      hidden: true,
      layerColor: "blue",
      emeresSourceId: "custom:underlay-a",
      stamp: { flow: 0.4, hardness: 0.9, minSize: 0.2 },
      stampPipeline: "causal-walker-v2",
      pressureModel: "linear-full-v1",
    });
    expect(encoded.payload.version).toBe(1);
    expect(encoded.payload.extensions?.paintModel).toBeUndefined();

    const decoded = studioCrdtStrokeToDrawElement({
      ...record("stroke-a", "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded).toMatchObject({
      id: "stroke-a",
      groupId: "inks",
      hidden: true,
      brush: "calligraphy",
      opacity: 0.6,
      pressureModel: "linear-full-v1",
      emeresSourceId: "custom:underlay-a",
      stamp: { flow: 0.4, hardness: 0.9, minSize: 0.2 },
      stampPipeline: "causal-walker-v2",
    });
    expect(decoded.paintModel).toBeUndefined();
  });

  it("round-trips layered-flow only for compatible ordinary pen and marker strokes", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-layered-marker",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [1, 1],
      paintModel: "layered-flow-v1",
      stroke: "rgba(20, 40, 80, 0.5)",
      strokeWidth: 18,
      opacity: 0.6,
      brush: "marker",
      sampleSpacing: 0,
    };

    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.payload).toMatchObject({
      version: 2,
      opacity: 0.6,
      brush: "marker",
      extensions: { paintModel: "layered-flow-v1" },
    });

    const decoded = studioCrdtStrokeToDrawElement({
      ...record(element.id, "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded.paintModel).toBe("layered-flow-v1");
    expect(decoded.stroke).toBe(element.stroke);
  });

  it("round-trips the causal watercolor pipeline as an explicit CRDT extension", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "watercolor-v2",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [0, 0, 12, 4, 24, 0],
      pressures: [0.2, 0.6, 0.9],
      stroke: "#315f73",
      strokeWidth: 24,
      brush: "watercolor",
      watercolorPipeline: "causal-walker-v2",
    };

    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.payload.extensions).toEqual({
      watercolorPipeline: "causal-walker-v2",
    });

    const decoded = studioCrdtStrokeToDrawElement({
      ...record(element.id, "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded).toMatchObject({
      id: element.id,
      brush: "watercolor",
      points: element.points,
      pressures: element.pressures,
      watercolorPipeline: "causal-walker-v2",
    });
  });

  it("preserves omitted legacy pressure semantics and ignores unknown pressure models", () => {
    const legacy: StudioCrdtCompatibleDrawElement = {
      id: "stroke-legacy-pressure",
      type: "draw",
      points: [0, 0],
      pressures: [0.5],
      stroke: "#000000",
      strokeWidth: 8,
    };

    const encodedLegacy = studioDrawElementToCrdtStroke("page-a", legacy);
    expect(encodedLegacy.payload.extensions).toBeUndefined();
    const decodedLegacy = studioCrdtStrokeToDrawElement({
      ...record("stroke-legacy-pressure", "page-a", 0),
      ...encodedLegacy,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decodedLegacy.pressureModel).toBeUndefined();
    expect("pressureModel" in decodedLegacy).toBe(false);
    expect(decodedLegacy.paintModel).toBeUndefined();
    expect("paintModel" in decodedLegacy).toBe(false);
    expect(decodedLegacy.stampPipeline).toBeUndefined();
    expect("stampPipeline" in decodedLegacy).toBe(false);
    expect(decodedLegacy.watercolorPipeline).toBeUndefined();
    expect("watercolorPipeline" in decodedLegacy).toBe(false);

    const encodedUnknown = studioDrawElementToCrdtStroke("page-a", {
      ...legacy,
      id: "stroke-unknown-pressure-write",
      pressureModel: "future-pressure-v2",
    } as unknown as StudioCrdtCompatibleDrawElement);
    expect(encodedUnknown.payload.extensions).toBeUndefined();

    const decodedUnknown = studioCrdtStrokeToDrawElement(record(
      "stroke-unknown-pressure-read",
      "page-a",
      0,
      {
        payload: {
          ...record("source", "page-a", 0).payload,
          extensions: { pressureModel: "future-pressure-v2" },
        },
      }
    ));
    expect(decodedUnknown.pressureModel).toBeUndefined();
    expect("pressureModel" in decodedUnknown).toBe(false);

    const encodedUnknownPaint = studioDrawElementToCrdtStroke("page-a", {
      ...legacy,
      id: "stroke-unknown-paint-write",
      paintModel: "layered-flow-v2",
    } as unknown as StudioCrdtCompatibleDrawElement);
    expect(encodedUnknownPaint.payload.extensions).toBeUndefined();

    const decodedUnknownPaint = studioCrdtStrokeToDrawElement(record(
      "stroke-unknown-paint-read",
      "page-a",
      0,
      {
        payload: {
          ...record("paint-source", "page-a", 0).payload,
          extensions: { paintModel: "layered-flow-v2" },
        },
      }
    ));
    expect(decodedUnknownPaint.paintModel).toBeUndefined();
    expect("paintModel" in decodedUnknownPaint).toBe(false);

    const decodedLegacyPaint = studioCrdtStrokeToDrawElement(record(
      "stroke-legacy-paint-read",
      "page-a",
      0,
      {
        payload: {
          ...record("legacy-paint-source", "page-a", 0).payload,
          version: 1,
          brush: "marker",
          opacity: 0.6,
          extensions: { paintModel: "layered-flow-v1" },
        },
      }
    ));
    expect(decodedLegacyPaint.paintModel).toBeUndefined();

    const decodedIncompatiblePaint = studioCrdtStrokeToDrawElement(record(
      "stroke-incompatible-paint-read",
      "page-a",
      0,
      {
        payload: {
          ...record("incompatible-paint-source", "page-a", 0).payload,
          version: 2,
          mode: "eraser",
          brush: "marker",
          opacity: 0.6,
          extensions: { paintModel: "layered-flow-v1" },
        },
      }
    ));
    expect(decodedIncompatiblePaint.paintModel).toBeUndefined();
  });

  it("round-trips the residual V2 ink contract as an explicit CRDT extension", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-residual-v2",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [0, 0, 4, 0, 8, 0],
      pressures: [0],
      pressureModel: "linear-residual-v2",
      sampleSpacing: 0,
      stroke: "#123456",
      strokeWidth: 16,
    };
    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.payload.extensions?.pressureModel).toBe("linear-residual-v2");
    expect(encoded.payload.sampleSpacing).toBe(0);
    expect(encoded.payload.pressures).toEqual([0, 1, 1]);

    const decoded = studioCrdtStrokeToDrawElement({
      ...record("stroke-residual-v2", "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded.pressureModel).toBe("linear-residual-v2");
    expect(decoded.sampleSpacing).toBe(0);
    expect(decoded.pressures).toEqual([0, 1, 1]);
  });

  it("round-trips V3 path-phase ink without upgrading or weakening its model", () => {
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-residual-path-v3",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [0, 0, 9, 0, 9, 0, 10, 0],
      pressures: [1, 1, 0, 0],
      pressureModel: "linear-residual-path-v3",
      sampleSpacing: 0,
      stroke: "#123456",
      strokeWidth: 50,
    };
    const encoded = studioDrawElementToCrdtStroke("page-a", element);
    expect(encoded.payload.extensions?.pressureModel).toBe("linear-residual-path-v3");
    expect(encoded.payload.pressures).toEqual([1, 1, 0, 0]);

    const decoded = studioCrdtStrokeToDrawElement({
      ...record(element.id, "page-a", 0),
      ...encoded,
      orderIndex: 0,
      status: "finalized",
      deleted: false,
    });
    expect(decoded.pressureModel).toBe("linear-residual-path-v3");
    expect(decoded.sampleSpacing).toBe(0);
    expect(decoded.pressures).toEqual([1, 1, 0, 0]);
  });

  it("streams explicit-model fallback pressure through begin and append while legacy stays 0.5", () => {
    const document = new StudioCrdtDocument();
    const residual: StudioCrdtCompatibleDrawElement = {
      id: "stroke-residual-stream",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [0, 0],
      pressures: undefined,
      pressureModel: "linear-residual-v2",
      sampleSpacing: 0,
      stroke: "#123456",
      strokeWidth: 16,
    };
    const legacy: StudioCrdtCompatibleDrawElement = {
      ...residual,
      id: "stroke-legacy-stream",
      pressureModel: undefined,
    };

    document.beginStroke(studioDrawElementToCrdtStroke("page-a", residual));
    document.appendStrokeSamples(
      residual.id,
      studioDrawElementSampleSlice({ ...residual, points: [0, 0, 4, 0, 8, 0] }, 1)!
    );
    document.finalizeStroke(residual.id);

    document.beginStroke(studioDrawElementToCrdtStroke("page-a", legacy));
    document.appendStrokeSamples(
      legacy.id,
      studioDrawElementSampleSlice({ ...legacy, points: [0, 0, 4, 0, 8, 0] }, 1)!
    );
    document.finalizeStroke(legacy.id);

    expect(document.getStroke(residual.id)?.payload.pressures).toEqual([1, 1, 1]);
    expect(document.getStroke(legacy.id)?.payload.pressures).toEqual([0.5, 0.5, 0.5]);
    document.destroy();
  });

  it("aligns only the requested streaming suffix and never reads prior dynamics", () => {
    const accessedIndices: number[] = [];
    const pressures = new Proxy([0.1, 0.2, 0.3, 0.8, 0.9], {
      get(target, key, receiver) {
        const index = typeof key === "string" ? Number(key) : Number.NaN;
        if (Number.isInteger(index)) {
          if (index < 3) throw new Error("streaming suffix read historical pressure data");
          accessedIndices.push(index);
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-stream",
      type: "draw",
      points: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
      pressures,
      stroke: "#000000",
      strokeWidth: 4,
    };

    expect(studioDrawElementSampleSlice(element, 3)).toEqual({
      points: [3, 3, 4, 4],
      pressures: [0.8, 0.9],
      tiltXs: undefined,
      tiltYs: undefined,
      twists: undefined,
      speeds: undefined,
      tangentialPressures: undefined,
    });
    expect(accessedIndices).toEqual([3, 4]);
  });

  it("fills sparse, missing, and non-finite dynamics inside the requested suffix", () => {
    const tiltXs = [11, 12] as number[];
    tiltXs[3] = 33;
    const element: StudioCrdtCompatibleDrawElement = {
      id: "stroke-sparse",
      type: "draw",
      points: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
      pressures: [0.1, 0.2, Number.NaN, 0.8],
      tiltXs,
      twists: [1, 2, Number.POSITIVE_INFINITY, 4, 5],
      stroke: "#000000",
      strokeWidth: 4,
    };

    expect(studioDrawElementSampleSlice(element, 2)).toEqual({
      points: [2, 2, 3, 3, 4, 4],
      pressures: [0.5, 0.8, 0.5],
      tiltXs: [0, 33, 0],
      tiltYs: undefined,
      twists: [0, 4, 5],
      speeds: undefined,
      tangentialPressures: undefined,
    });
  });

  it("reconciles only CRDT-owned IDs and keeps deterministic stroke order in existing slots", () => {
    const pages = [{
      id: "page-a",
      title: "kept",
      elements: [
        { id: "background", type: "image", src: "data:image/png;base64,AA==" },
        { id: "stroke-b", type: "draw", points: [], stroke: "#000", strokeWidth: 1 },
        { id: "lettering", type: "text", text: "hello" },
        { id: "stroke-a", type: "draw", points: [], stroke: "#000", strokeWidth: 1 },
      ],
    }];

    const result = reconcileStudioCrdtPages(pages, [
      record("stroke-a", "page-a", 0),
      record("stroke-b", "page-a", 1),
      record("stroke-c", "page-a", 2),
    ]);

    expect(result.changed).toBe(true);
    expect(result.pages[0]?.title).toBe("kept");
    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual([
      "background",
      "stroke-a",
      "lettering",
      "stroke-b",
      "stroke-c",
    ]);
  });

  it("removes tombstoned strokes without touching legacy drawing IDs", () => {
    const pages = [{
      id: "page-a",
      elements: [
        { id: "legacy", type: "draw", points: [0, 0], stroke: "#000", strokeWidth: 1 },
        { id: "deleted", type: "draw", points: [1, 1], stroke: "#000", strokeWidth: 1 },
      ],
    }];
    const result = reconcileStudioCrdtPages(pages, [
      record("deleted", "page-a", 0, { deleted: true }),
    ]);

    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual(["legacy"]);
  });

  it("round-trips explicitly supported text and bubble fields without accepting raster payloads", () => {
    const text: StudioCrdtCompatibleSceneElement = {
      id: "text-a",
      type: "text",
      text: "세로 대사\n둘째 줄",
      x: 30,
      y: 40,
      width: 260,
      fontSize: 32,
      fill: "#222222",
      rotation: 5,
      fontStyle: "bold",
      gradient: { type: "linear", angle: 90, stops: [] },
      groupId: "lettering",
      hidden: true,
    };
    const encoded = studioSceneElementToCrdtElement("page-a", text);
    const decoded = studioCrdtElementToSceneElement({
      ...sceneRecord("text-a", "page-a", 0),
      ...encoded,
      orderIndex: 0,
      deleted: false,
    });
    expect(decoded).toMatchObject(text);

    const bubble = studioSceneElementToCrdtElement("page-a", {
      id: "bubble-a",
      type: "bubble",
      variant: "cloud",
      text: "동시 편집",
      x: 100,
      y: 120,
      width: 300,
      height: 180,
      fill: "#fff",
      textFill: "#000",
      rotation: 0,
      tailAnchorPoint: { x: 450, y: 500 },
      customShapePoints: [0, 0, 300, 0, 300, 180],
    });
    expect(bubble.payload.type).toBe("bubble");
    expect(bubble.payload.props.tailAnchorPoint).toEqual({ x: 450, y: 500 });
    expect(() => studioSceneElementToCrdtElement("page-a", {
      ...text,
      id: "bad-raster",
      src: "data:image/png;base64,AA==",
    })).toThrow("src 속성은 동기화할 수 없습니다");
  });

  it("uses the shared draw/scene order for deterministic mixed z-order while preserving legacy slots", () => {
    const pages = [{
      id: "page-a",
      bg: "#fff",
      bgGrad: null,
      canvasH: 1600,
      elements: [
        { id: "legacy-image", type: "image", src: "asset:background" },
        { id: "ink", type: "draw", points: [], stroke: "#000", strokeWidth: 1 },
        { id: "caption", type: "text", text: "old" },
      ],
    }];

    const result = reconcileStudioCrdtSceneGraphPages(
      pages,
      [record("ink", "page-a", 4)],
      [sceneRecord("caption", "page-a", 2)],
      []
    );

    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual([
      "legacy-image",
      "caption",
      "ink",
    ]);
    expect(result.pages[0]?.elements[1]).toMatchObject({ type: "text", text: "대사" });
  });

  it("materializes authoritative page payloads, deterministic order, creation and tombstones", () => {
    const pages = [
      {
        id: "page-a", bg: "#aaa", bgGrad: null, canvasH: 1200,
        elements: [{ id: "a-text", type: "text", text: "A" }], future: "preserve-a",
      },
      {
        id: "legacy-page", bg: "#ccc", bgGrad: null, canvasH: 1400,
        elements: [{ id: "legacy-text", type: "text", text: "legacy" }],
      },
      {
        id: "page-b", bg: "#bbb", bgGrad: null, canvasH: 1300,
        elements: [{ id: "b-text", type: "text", text: "B" }], future: "preserve-b",
      },
    ];
    const result = reconcileStudioCrdtSceneGraphPages(
      pages,
      [],
      [],
      [
        pageRecord("page-b", 0, { payload: { version: 1, props: {
          bg: "#0b0b0b", bgGrad: null, canvasH: 2000, name: "이동한 B",
        } } }),
        pageRecord("page-c", 1, { payload: { version: 1, props: {
          bg: "#ffffff", bgGrad: ["#fff", "#eee"], canvasH: 1800, name: "새 C",
        } } }),
        pageRecord("page-a", 2, { deleted: true }),
      ]
    );

    expect(result.pages.map((page) => page.id)).toEqual(["page-b", "legacy-page", "page-c"]);
    expect(result.pages[0]).toMatchObject({
      id: "page-b", bg: "#0b0b0b", canvasH: 2000, future: "preserve-b",
    });
    expect(result.pages[0]?.elements.map((element) => element.id)).toEqual(["b-text"]);
    expect(result.pages[2]).toMatchObject({ id: "page-c", elements: [], name: "새 C" });

    expect(studioPageToCrdtPage(result.pages[0]!)).toMatchObject({
      id: "page-b",
      payload: { props: { bg: "#0b0b0b", canvasH: 2000, name: "이동한 B" } },
    });
  });
});
