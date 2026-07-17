import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  STUDIO_CRDT_APPEND_MAX_SAMPLES,
  STUDIO_CRDT_DELETION_ACKS_ROOT,
  STUDIO_CRDT_DELETION_OPS_ROOT,
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
  STUDIO_CRDT_METADATA_MAX_BYTES,
  STUDIO_CRDT_ORIGIN_LOCAL,
  STUDIO_CRDT_ORIGIN_REMOTE,
  STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_SCENE_ELEMENT_MAX_BYTES,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  StudioCrdtDocument,
  type StudioCrdtChange,
  type StudioCrdtChangeSummary,
  type StudioCrdtDrawStrokePayload,
  type StudioCrdtPageInput,
  type StudioCrdtProjectedChange,
  type StudioCrdtSceneElementInput,
  type StudioCrdtStrokeInput,
} from "./studio-crdt-document";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
} from "./studio-crdt-protocol";

function payload(
  points: number[] = [10, 20],
  overrides: Partial<StudioCrdtDrawStrokePayload> = {}
): StudioCrdtDrawStrokePayload {
  const count = points.length / 2;
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    stroke: "#112233",
    strokeWidth: 8,
    points,
    pressures: Array.from({ length: count }, (_, index) => 0.4 + index * 0.1),
    ...overrides,
  };
}

function stroke(
  id: string,
  pageId: string,
  points: number[] = [10, 20]
): StudioCrdtStrokeInput {
  return {
    id,
    pageId,
    layerId: "page-root",
    payload: payload(points),
  };
}

function comparable(document: StudioCrdtDocument) {
  return document.getStrokes({ includeDeleted: true }).map((record) => ({
    id: record.id,
    pageId: record.pageId,
    layerId: record.layerId,
    status: record.status,
    deleted: record.deleted,
    payload: record.payload,
    orderIndex: record.orderIndex,
  }));
}

function textElement(
  id: string,
  overrides: Record<string, string | number | boolean | null> = {}
): StudioCrdtSceneElementInput {
  return {
    id,
    pageId: "page-a",
    layerId: "lettering",
    payload: {
      version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
      type: "text",
      props: {
        text: "기준 대사",
        x: 10,
        y: 20,
        width: 240,
        fontSize: 28,
        fill: "#111111",
        rotation: 0,
        ...overrides,
      },
    },
  };
}

function page(id: string, overrides: Record<string, string | number | boolean | null | string[]> = {}): StudioCrdtPageInput {
  return {
    id,
    payload: {
      version: STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
      props: {
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1600,
        ...overrides,
      },
    },
  };
}

function underlyingYDoc(document: StudioCrdtDocument): Y.Doc {
  return (document as unknown as { doc: Y.Doc }).doc;
}

function setYjsClientId(document: StudioCrdtDocument, clientId: number): void {
  (underlyingYDoc(document) as unknown as { clientID: number }).clientID = clientId;
}

describe("StudioCrdtDocument", () => {
  it("uses full fallback pressure for sparse residual V2 payloads", () => {
    const document = new StudioCrdtDocument();
    const record = document.addStroke({
      ...stroke("residual-sparse", "page-a"),
      payload: payload([0, 0, 4, 0, 8, 0], {
        pressures: undefined,
        extensions: { pressureModel: "linear-residual-v2" },
      }),
    });

    expect(record.payload.pressures).toEqual([1, 1, 1]);
    document.destroy();
  });

  it("uses the stored pressure model when streamed samples omit pressures", () => {
    const document = new StudioCrdtDocument();
    document.beginStroke({
      ...stroke("residual-stream", "page-a", []),
      payload: payload([], {
        pressures: undefined,
        extensions: { pressureModel: "linear-residual-v2" },
      }),
    });
    document.appendStrokeSamples("residual-stream", { points: [0, 0, 4, 0, 8, 0] });

    document.beginStroke({
      ...stroke("legacy-stream", "page-a", []),
      payload: payload([], { pressures: undefined }),
    });
    document.appendStrokeSamples("legacy-stream", { points: [0, 0, 4, 0, 8, 0] });

    expect(document.finalizeStroke("residual-stream").payload.pressures).toEqual([1, 1, 1]);
    expect(document.finalizeStroke("legacy-stream").payload.pressures).toEqual([0.5, 0.5, 0.5]);
    document.destroy();
  });

  it("streams V3 stationary pressure state without dropping or upgrading samples", () => {
    const document = new StudioCrdtDocument();
    document.beginStroke({
      ...stroke("residual-path-v3-stream", "page-a", []),
      payload: payload([], {
        pressures: undefined,
        sampleSpacing: 0,
        extensions: { pressureModel: "linear-residual-path-v3" },
      }),
    });
    document.appendStrokeSamples("residual-path-v3-stream", {
      points: [0, 0, 9, 0],
      pressures: [1, 1],
    });
    document.appendStrokeSamples("residual-path-v3-stream", {
      points: [9, 0, 10, 0],
      pressures: [0, 0],
    });
    const finalized = document.finalizeStroke("residual-path-v3-stream");

    expect(finalized.payload.points).toEqual([0, 0, 9, 0, 9, 0, 10, 0]);
    expect(finalized.payload.pressures).toEqual([1, 1, 0, 0]);
    expect(finalized.payload.sampleSpacing).toBe(0);
    expect(finalized.payload.extensions?.pressureModel).toBe("linear-residual-path-v3");
    document.destroy();
  });

  it("preserves zero sample spacing for fixed-rate causal ink", () => {
    const document = new StudioCrdtDocument();

    const record = document.addStroke({
      ...stroke("fixed-rate", "page-a"),
      payload: payload([10, 20, 11, 21], { sampleSpacing: 0 }),
    });

    expect(record.payload.sampleSpacing).toBe(0);
    expect(document.getStroke("fixed-rate")?.payload.sampleSpacing).toBe(0);
    document.destroy();
  });

  it("streams aligned pointer samples and finalizes one immutable drawing operation", () => {
    const document = new StudioCrdtDocument();

    expect(document.beginStroke(stroke("stroke-a", "page-a")).status).toBe("drawing");
    expect(document.appendStrokeSamples("stroke-a", {
      points: [15, 25, 20, 30],
      pressures: [0.6, 0.8],
      tiltXs: [10, 12],
      tiltYs: [-4, -3],
      twists: [20, 25],
      speeds: [1.2, 1.5],
      tangentialPressures: [0.1, 0.2],
    })).toBe(3);
    const finished = document.finalizeStroke("stroke-a");

    expect(finished.status).toBe("finalized");
    expect(finished.payload.points).toEqual([10, 20, 15, 25, 20, 30]);
    expect(finished.payload.pressures).toEqual([0.4, 0.6, 0.8]);
    expect(finished.payload.tiltXs).toEqual([0, 10, 12]);
    expect(finished.payload.tangentialPressures).toEqual([0, 0.1, 0.2]);
    expect(() => document.appendStrokeSamples("stroke-a", { points: [30, 40] }))
      .toThrow("완료된 획");

    document.destroy();
  });

  it("splits the 4096-sample append boundary into publishable local Yjs updates", () => {
    const document = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    document.subscribe((update, origin) => {
      if (origin === STUDIO_CRDT_ORIGIN_LOCAL) updates.push(update);
    });
    document.beginStroke({
      ...stroke("max-append", "page-a"),
      payload: payload([], { pressures: [] }),
    });
    updates.length = 0;
    const count = STUDIO_CRDT_APPEND_MAX_SAMPLES;
    const values = Array.from({ length: count }, (_, index) => index / 10);

    expect(document.appendStrokeSamples("max-append", {
      points: values.flatMap((value) => [value, value + 1]),
      pressures: Array<number>(count).fill(0.65),
      tiltXs: Array<number>(count).fill(12),
      tiltYs: Array<number>(count).fill(-8),
      twists: Array<number>(count).fill(45),
      speeds: Array<number>(count).fill(2.5),
      tangentialPressures: Array<number>(count).fill(0.2),
    })).toBe(count);

    expect(updates.length).toBeGreaterThan(1);
    expect(Math.max(...updates.map((update) => update.byteLength)))
      .toBeLessThanOrEqual(STUDIO_CRDT_UPDATE_MAX_BYTES);
    expect(document.getStroke("max-append")?.payload.points).toHaveLength(count * 2);
    document.destroy();
  });

  it("converges concurrent strokes and deterministic compositing order regardless of delivery order", () => {
    const left = new StudioCrdtDocument();
    const right = new StudioCrdtDocument();
    left.addStroke(stroke("left-stroke", "page-a", [0, 0, 10, 10]));
    right.addStroke(stroke("right-stroke", "page-a", [20, 20, 30, 30]));

    const leftUpdate = left.encodeStateAsUpdate();
    const rightUpdate = right.encodeStateAsUpdate();
    right.applyUpdate(leftUpdate);
    left.applyUpdate(rightUpdate);

    expect(comparable(left)).toEqual(comparable(right));
    expect(comparable(left).map((record) => record.id).sort()).toEqual([
      "left-stroke",
      "right-stroke",
    ]);

    left.destroy();
    right.destroy();
  });

  it("uses page-global CRDT order instead of grouping compositing by layerId", () => {
    const document = new StudioCrdtDocument();
    document.addStroke({ ...stroke("back", "page-a"), layerId: "z-background" });
    document.addStroke({ ...stroke("front", "page-a"), layerId: "a-foreground" });

    expect(document.getStrokes({ pageId: "page-a" }).map(({ id }) => id)).toEqual([
      "back",
      "front",
    ]);
    document.moveStroke("front", "back");
    expect(document.getStrokes({ pageId: "page-a" }).map(({ id }) => id)).toEqual([
      "front",
      "back",
    ]);
    document.destroy();
  });

  it("converges a concurrent delete and edit and retains a tombstone for late peers", () => {
    const left = new StudioCrdtDocument();
    left.addStroke(stroke("shared-stroke", "page-a", [0, 0, 10, 10]));
    const right = new StudioCrdtDocument(left.encodeStateAsUpdate());

    expect(left.deleteStroke("shared-stroke")).toBe(true);
    right.upsertStroke(
      stroke("shared-stroke", "page-a", [0, 0, 30, 30]),
      { status: "finalized" }
    );

    const leftState = left.encodeStateAsUpdate();
    const rightState = right.encodeStateAsUpdate();
    left.applyUpdate(rightState);
    right.applyUpdate(leftState);

    expect(comparable(left)).toEqual(comparable(right));
    left.deleteStroke("shared-stroke");
    right.applyUpdate(left.encodeStateAsUpdate(right.encodeStateVector()));
    expect(left.getStrokes()).toEqual([]);
    expect(right.getStrokes()).toEqual([]);
    expect(left.getStroke("shared-stroke", true)?.deleted).toBe(true);

    left.destroy();
    right.destroy();
  });

  it.each([
    { deleteClientId: 10, editClientId: 20 },
    { deleteClientId: 20, editClientId: 10 },
  ])(
    "keeps an initial-registration delete when the deleting clientID is $deleteClientId and the editing clientID is $editClientId",
    ({ deleteClientId, editClientId }) => {
      const baseline = textElement("initial-delete");
      const deletingPeer = new StudioCrdtDocument();
      const editingPeer = new StudioCrdtDocument();
      setYjsClientId(deletingPeer, deleteClientId);
      setYjsClientId(editingPeer, editClientId);

      deletingPeer.upsertSceneElement(baseline, {
        baselineProps: baseline.payload.props,
        changedProps: [],
      });
      expect(deletingPeer.deleteSceneElement("initial-delete")).toBe(true);
      editingPeer.upsertSceneElement(textElement("initial-delete", { x: 640 }), {
        baselineProps: baseline.payload.props,
        changedProps: ["x"],
      });

      const deletionUpdate = deletingPeer.encodeStateAsUpdate();
      const editUpdate = editingPeer.encodeStateAsUpdate();
      deletingPeer.applyUpdate(editUpdate);
      editingPeer.applyUpdate(deletionUpdate);

      expect(deletingPeer.getSceneElement("initial-delete")).toBeNull();
      expect(editingPeer.getSceneElement("initial-delete")).toBeNull();
      expect(deletingPeer.getSceneElement("initial-delete", true)?.payload.props.x).toBe(640);
      expect(editingPeer.getSceneElement("initial-delete", true)?.deleted).toBe(true);
      deletingPeer.destroy();
      editingPeer.destroy();
    }
  );

  it("acknowledges only observed deletes so stale restore cannot erase a concurrent delete", () => {
    const source = new StudioCrdtDocument();
    source.addSceneElement(textElement("observed-remove"));
    const baseline = source.encodeStateAsUpdate();
    const firstDeleter = new StudioCrdtDocument(baseline);
    const restorer = new StudioCrdtDocument(baseline);
    const staleDeleter = new StudioCrdtDocument(baseline);
    const staleRestorer = new StudioCrdtDocument(baseline);

    expect(firstDeleter.deleteSceneElement("observed-remove")).toBe(true);
    expect(staleRestorer.restoreSceneElement("observed-remove")).toBe(false);
    staleRestorer.upsertSceneElement(textElement("observed-remove", { x: 777 }), {
      resurrect: true,
    });
    staleRestorer.applyUpdate(firstDeleter.encodeStateAsUpdate());
    expect(staleRestorer.getSceneElement("observed-remove")).toBeNull();
    expect(staleRestorer.getSceneElement("observed-remove", true)?.payload.props.x).toBe(777);

    restorer.applyUpdate(firstDeleter.encodeStateAsUpdate());
    expect(restorer.restoreSceneElement("observed-remove")).toBe(true);
    expect(staleDeleter.deleteSceneElement("observed-remove")).toBe(true);

    const restoredState = restorer.encodeStateAsUpdate();
    const concurrentDeleteState = staleDeleter.encodeStateAsUpdate();
    for (const peer of [firstDeleter, restorer, staleDeleter]) {
      peer.applyUpdate(restoredState);
      peer.applyUpdate(concurrentDeleteState);
      expect(peer.getSceneElement("observed-remove")).toBeNull();
    }

    expect(restorer.restoreSceneElement("observed-remove")).toBe(true);
    const finalRestore = restorer.encodeStateAsUpdate();
    firstDeleter.applyUpdate(finalRestore);
    staleDeleter.applyUpdate(finalRestore);
    expect(firstDeleter.getSceneElement("observed-remove")?.deleted).toBe(false);
    expect(staleDeleter.getSceneElement("observed-remove")?.deleted).toBe(false);

    source.destroy();
    firstDeleter.destroy();
    restorer.destroy();
    staleDeleter.destroy();
    staleRestorer.destroy();
  });

  it("uses the same flat grow-only deletion protocol for strokes, scenes, pages, and groups", () => {
    const document = new StudioCrdtDocument();
    document.addStroke(stroke("delete-stroke", "page-a"));
    document.addSceneElement(textElement("delete-scene"));
    document.addPage(page("delete-page"));
    document.addLayerGroup({
      id: "delete-group",
      pageId: "page-a",
      payload: {
        version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
        props: { name: "삭제 그룹" },
      },
    });

    const raw = underlyingYDoc(document);
    expect((raw.getMap("strokes").get("delete-stroke") as Y.Map<unknown>).has("deleted")).toBe(false);
    expect(raw.getMap("scene-element:delete-scene").has("deleted")).toBe(false);
    expect(raw.getMap("studio-page:delete-page").has("deleted")).toBe(false);
    const groupKey = `${"page-a".length}:page-a${"delete-group".length}:delete-group`;
    expect(raw.getMap(`layer-group:${encodeURIComponent(groupKey)}`).has("deleted")).toBe(false);
    expect(raw.getMap(STUDIO_CRDT_DELETION_OPS_ROOT).size).toBe(0);
    expect(raw.getMap(STUDIO_CRDT_DELETION_ACKS_ROOT).size).toBe(0);

    expect(document.deleteStroke("delete-stroke")).toBe(true);
    expect(document.deleteSceneElement("delete-scene")).toBe(true);
    expect(document.deletePage("delete-page")).toBe(true);
    expect(document.deleteLayerGroup("page-a", "delete-group")).toBe(true);
    expect(raw.getMap(STUDIO_CRDT_DELETION_OPS_ROOT).size).toBe(4);

    expect(document.restoreStroke("delete-stroke")).toBe(true);
    expect(document.restoreSceneElement("delete-scene")).toBe(true);
    expect(document.restorePage("delete-page")).toBe(true);
    expect(document.restoreLayerGroup("page-a", "delete-group")).toBe(true);
    expect(raw.getMap(STUDIO_CRDT_DELETION_ACKS_ROOT).size).toBe(4);
    expect(document.getStroke("delete-stroke")?.deleted).toBe(false);
    expect(document.getSceneElement("delete-scene")?.deleted).toBe(false);
    expect(document.getPage("delete-page")?.deleted).toBe(false);
    expect(document.getLayerGroup("page-a", "delete-group")?.deleted).toBe(false);
    document.destroy();
  });

  it.each(["stroke", "scene", "page", "group"] as const)(
    "keeps a concurrent initial %s delete over an independent first registration",
    (kind) => {
      const deletingPeer = new StudioCrdtDocument();
      const editingPeer = new StudioCrdtDocument();
      setYjsClientId(deletingPeer, 90);
      setYjsClientId(editingPeer, 5);
      if (kind === "stroke") {
        deletingPeer.addStroke(stroke("initial-shared", "page-a"));
        editingPeer.addStroke(stroke("initial-shared", "page-a", [40, 50]));
        deletingPeer.deleteStroke("initial-shared");
      } else if (kind === "scene") {
        deletingPeer.addSceneElement(textElement("initial-shared"));
        editingPeer.addSceneElement(textElement("initial-shared", { x: 500 }));
        deletingPeer.deleteSceneElement("initial-shared");
      } else if (kind === "page") {
        deletingPeer.addPage(page("initial-shared"));
        editingPeer.addPage(page("initial-shared", { name: "동시 편집" }));
        deletingPeer.deletePage("initial-shared");
      } else {
        const input = {
          id: "initial-shared",
          pageId: "page-a",
          payload: {
            version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
            props: { name: "초기 그룹" },
          },
        } as const;
        deletingPeer.addLayerGroup(input);
        editingPeer.addLayerGroup({
          ...input,
          payload: { ...input.payload, props: { name: "동시 편집 그룹" } },
        });
        deletingPeer.deleteLayerGroup("page-a", "initial-shared");
      }

      const deletionState = deletingPeer.encodeStateAsUpdate();
      const editingState = editingPeer.encodeStateAsUpdate();
      deletingPeer.applyUpdate(editingState);
      editingPeer.applyUpdate(deletionState);
      const deletingRecord = kind === "stroke"
        ? deletingPeer.getStroke("initial-shared", true)
        : kind === "scene"
          ? deletingPeer.getSceneElement("initial-shared", true)
          : kind === "page"
            ? deletingPeer.getPage("initial-shared", true)
            : deletingPeer.getLayerGroup("page-a", "initial-shared", true);
      const editingRecord = kind === "stroke"
        ? editingPeer.getStroke("initial-shared", true)
        : kind === "scene"
          ? editingPeer.getSceneElement("initial-shared", true)
          : kind === "page"
            ? editingPeer.getPage("initial-shared", true)
            : editingPeer.getLayerGroup("page-a", "initial-shared", true);
      expect(deletingRecord?.deleted).toBe(true);
      expect(editingRecord?.deleted).toBe(true);
      expect(underlyingYDoc(editingPeer).getMap(STUDIO_CRDT_DELETION_OPS_ROOT).size).toBe(1);
      deletingPeer.destroy();
      editingPeer.destroy();
    }
  );

  it("merges independent fields when two peers first register the same legacy scene element", () => {
    const baseline = textElement("legacy-text");
    const left = new StudioCrdtDocument();
    const right = new StudioCrdtDocument();
    left.upsertSceneElement(textElement("legacy-text", { text: "왼쪽이 고친 대사" }), {
      baselineProps: baseline.payload.props,
      changedProps: ["text"],
    });
    right.upsertSceneElement(textElement("legacy-text", { x: 480 }), {
      baselineProps: baseline.payload.props,
      changedProps: ["x"],
    });

    const leftUpdate = left.encodeStateAsUpdate();
    const rightUpdate = right.encodeStateAsUpdate();
    left.applyUpdate(rightUpdate);
    right.applyUpdate(leftUpdate);

    expect(left.getSceneElement("legacy-text")?.payload.props).toMatchObject({
      text: "왼쪽이 고친 대사",
      x: 480,
      y: 20,
      width: 240,
    });
    expect(right.getSceneElement("legacy-text")).toEqual(left.getSceneElement("legacy-text"));
    left.destroy();
    right.destroy();
  });

  it("merges a first-registration optional-property removal with another peer's field edit", () => {
    const baseline = textElement("legacy-unset", { font: "Pretendard" });
    const withoutFont = textElement("legacy-unset");
    const left = new StudioCrdtDocument();
    const right = new StudioCrdtDocument();
    left.upsertSceneElement(withoutFont, {
      baselineProps: baseline.payload.props,
      changedProps: [],
      unsetProps: ["font"],
    });
    right.upsertSceneElement(textElement("legacy-unset", { font: "Pretendard", x: 720 }), {
      baselineProps: baseline.payload.props,
      changedProps: ["x"],
    });

    const leftUpdate = left.encodeStateAsUpdate();
    const rightUpdate = right.encodeStateAsUpdate();
    left.applyUpdate(rightUpdate);
    right.applyUpdate(leftUpdate);

    expect(left.getSceneElement("legacy-unset")?.payload.props).toMatchObject({ x: 720 });
    expect(left.getSceneElement("legacy-unset")?.payload.props).not.toHaveProperty("font");
    expect(right.getSceneElement("legacy-unset")).toEqual(left.getSceneElement("legacy-unset"));
    left.destroy();
    right.destroy();
  });

  it("resolves a same-property conflict deterministically on every peer", () => {
    const left = new StudioCrdtDocument();
    left.addSceneElement(textElement("shared-text"));
    const right = new StudioCrdtDocument(left.encodeStateAsUpdate());
    left.patchSceneElement("shared-text", { set: { text: "왼쪽 버전" } });
    right.patchSceneElement("shared-text", { set: { text: "오른쪽 버전" } });

    const leftUpdate = left.encodeStateAsUpdate();
    const rightUpdate = right.encodeStateAsUpdate();
    left.applyUpdate(rightUpdate);
    right.applyUpdate(leftUpdate);

    const resolved = left.getSceneElement("shared-text")?.payload.props.text;
    expect(["왼쪽 버전", "오른쪽 버전"]).toContain(resolved);
    expect(right.getSceneElement("shared-text")).toEqual(left.getSceneElement("shared-text"));
    left.destroy();
    right.destroy();
  });

  it("keeps a scene tombstone across a concurrent edit and requires explicit resurrection", () => {
    const left = new StudioCrdtDocument();
    left.addSceneElement(textElement("deleted-text"));
    const right = new StudioCrdtDocument(left.encodeStateAsUpdate());
    left.deleteSceneElement("deleted-text");
    right.upsertSceneElement(textElement("deleted-text", { x: 900 }));

    const leftUpdate = left.encodeStateAsUpdate();
    const rightUpdate = right.encodeStateAsUpdate();
    left.applyUpdate(rightUpdate);
    right.applyUpdate(leftUpdate);

    expect(left.getSceneElement("deleted-text")).toBeNull();
    expect(right.getSceneElement("deleted-text")).toBeNull();
    expect(left.getSceneElement("deleted-text", true)?.payload.props.x).toBe(900);
    expect(() => left.upsertSceneElement(textElement("deleted-text"))).toThrow("명시적으로 복원");
    left.upsertSceneElement(textElement("deleted-text", { x: 900 }), { resurrect: true });
    right.applyUpdate(left.encodeStateAsUpdate(right.encodeStateVector()));
    expect(right.getSceneElement("deleted-text")?.payload.props.x).toBe(900);
    left.destroy();
    right.destroy();
  });

  it("rejects oversized or unsupported scene metadata before mutating the Yjs document", () => {
    const document = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    document.subscribe((update, origin) => {
      if (origin === STUDIO_CRDT_ORIGIN_LOCAL) updates.push(update);
    });
    const hugeText = "가".repeat(STUDIO_CRDT_SCENE_ELEMENT_MAX_BYTES);
    expect(() => document.addSceneElement(textElement("too-large", { text: hugeText })))
      .toThrow("16KiB 한도");
    expect(() => document.addSceneElement({
      ...textElement("unsupported-field"),
      payload: {
        ...textElement("unsupported-field").payload,
        props: { ...textElement("unsupported-field").payload.props, src: "data:image/png;base64,AA==" },
      },
    })).toThrow("src 속성은 동기화할 수 없습니다");
    expect(updates).toHaveLength(0);
    expect(document.getSceneElements({ includeDeleted: true })).toEqual([]);
    document.destroy();
  });

  it("shares one mixed z-order between strokes and scene elements without exceeding the wire cap", () => {
    const document = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    document.subscribe((update, origin) => {
      if (origin === STUDIO_CRDT_ORIGIN_LOCAL) updates.push(update);
    });
    document.addStroke(stroke("ink", "page-a"));
    document.addSceneElement(textElement("caption"), "ink");

    const caption = document.getSceneElement("caption");
    const ink = document.getStroke("ink");
    expect(caption?.orderIndex).toBeLessThan(ink?.orderIndex ?? -1);
    document.moveElement("ink", "caption");
    expect(document.getStroke("ink")!.orderIndex)
      .toBeLessThan(document.getSceneElement("caption")!.orderIndex);
    document.moveElement("caption", "ink");
    expect(document.getSceneElement("caption")!.orderIndex)
      .toBeLessThan(document.getStroke("ink")!.orderIndex);
    expect(Math.max(...updates.map((update) => update.byteLength)))
      .toBeLessThanOrEqual(STUDIO_CRDT_UPDATE_MAX_BYTES);
    document.destroy();
  });

  it("creates, reorders, patches and tombstones authoritative page payloads", () => {
    const document = new StudioCrdtDocument();
    document.addPage(page("page-a", { name: "첫 페이지" }));
    document.addPage(page("page-b", { name: "둘째 페이지" }));
    document.movePage("page-b", "page-a");
    document.patchPage("page-b", { set: { canvasH: 2200, note: "원격 콘티" } });

    expect(document.getPages().map(({ id }) => id)).toEqual(["page-b", "page-a"]);
    expect(document.getPage("page-b")?.payload.props).toMatchObject({
      canvasH: 2200,
      note: "원격 콘티",
    });
    expect(document.deletePage("page-a")).toBe(true);
    expect(document.getPages().map(({ id }) => id)).toEqual(["page-b"]);
    expect(document.getPage("page-a", true)?.deleted).toBe(true);
    document.destroy();
  });

  it("merges independent first-registration page fields and resolves same-field edits deterministically", () => {
    const baseline = page("legacy-page", { name: "기준", note: "삭제할 메모" });
    const left = new StudioCrdtDocument();
    const right = new StudioCrdtDocument();
    left.upsertPage(page("legacy-page", { name: "왼쪽 제목" }), {
      baselineProps: baseline.payload.props,
      changedProps: ["name"],
      unsetProps: ["note"],
    });
    right.upsertPage(page("legacy-page", {
      bg: "#101010",
      name: "기준",
      note: "삭제할 메모",
    }), {
      baselineProps: baseline.payload.props,
      changedProps: ["bg"],
    });

    const firstLeft = left.encodeStateAsUpdate();
    const firstRight = right.encodeStateAsUpdate();
    left.applyUpdate(firstRight);
    right.applyUpdate(firstLeft);
    expect(left.getPage("legacy-page")?.payload.props).toMatchObject({
      bg: "#101010",
      name: "왼쪽 제목",
    });
    expect(left.getPage("legacy-page")?.payload.props).not.toHaveProperty("note");

    left.patchPage("legacy-page", { set: { name: "왼쪽 재수정" } });
    right.patchPage("legacy-page", { set: { name: "오른쪽 재수정" } });
    const secondLeft = left.encodeStateAsUpdate();
    const secondRight = right.encodeStateAsUpdate();
    left.applyUpdate(secondRight);
    right.applyUpdate(secondLeft);
    expect(right.getPage("legacy-page")).toEqual(left.getPage("legacy-page"));
    expect(["왼쪽 재수정", "오른쪽 재수정"])
      .toContain(left.getPage("legacy-page")?.payload.props.name);
    left.destroy();
    right.destroy();
  });

  it("batches local updates without echoing remotely applied updates", () => {
    vi.useFakeTimers();
    const document = new StudioCrdtDocument();
    const batches: Uint8Array[] = [];
    const origins: ReadonlySet<unknown>[] = [];
    const subscription = document.subscribeBatchedUpdates((batch) => {
      batches.push(batch.update);
      origins.push(batch.origins);
    });

    document.beginStroke(stroke("local-stroke", "page-a"));
    document.appendStrokeSamples("local-stroke", { points: [20, 30], pressures: [0.7] });
    vi.advanceTimersByTime(40);

    expect(batches).toHaveLength(1);
    expect(origins[0]?.has(STUDIO_CRDT_ORIGIN_LOCAL)).toBe(true);

    const remote = new StudioCrdtDocument();
    remote.addStroke(stroke("remote-stroke", "page-a"));
    document.applyUpdate(remote.encodeStateAsUpdate(), STUDIO_CRDT_ORIGIN_REMOTE);
    vi.advanceTimersByTime(50);
    expect(batches).toHaveLength(1);

    subscription.unsubscribe();
    remote.destroy();
    document.destroy();
    vi.useRealTimers();
  });

  it("replaces a long finalized stroke through bounded progressive updates", () => {
    vi.useFakeTimers();
    const document = new StudioCrdtDocument();
    const batches: Uint8Array[] = [];
    const subscription = document.subscribeBatchedUpdates(({ update }) => batches.push(update));
    const points = Array.from({ length: 4_000 }, (_, index) => index / 10);
    const count = points.length / 2;

    const replaced = document.replaceStroke({
      ...stroke("replace-stroke", "page-a", points),
      payload: payload(points, { pressures: Array<number>(count).fill(0.65) }),
    });
    vi.advanceTimersByTime(50);

    expect(replaced.status).toBe("finalized");
    expect(replaced.payload.points).toEqual(points);
    expect(replaced.payload.pressures).toHaveLength(count);
    expect(batches.length).toBeGreaterThan(1);
    expect(Math.max(...batches.map((update) => update.byteLength))).toBeLessThan(48 * 1024);

    subscription.unsubscribe();
    document.destroy();
    vi.useRealTimers();
  });

  it("expands a partial sample patch to the full aligned pointer-array group", () => {
    const document = new StudioCrdtDocument();
    document.addStroke(stroke("sample-patch", "page-a", [0, 0, 10, 10]));

    expect(() => document.patchStroke("sample-patch", {
      payload: payload([0, 0, 10, 10, 20, 20], { pressures: undefined }),
      changedPayloadKeys: ["points"],
    })).not.toThrow();

    expect(document.getStroke("sample-patch")?.payload).toMatchObject({
      points: [0, 0, 10, 10, 20, 20],
      pressures: [0.5, 0.5, 0.5],
      tiltXs: [0, 0, 0],
      tiltYs: [0, 0, 0],
      twists: [0, 0, 0],
      speeds: [0, 0, 0],
      tangentialPressures: [0, 0, 0],
    });
    document.destroy();
  });

  it("keeps full-size add/upsert replacement updates below the incremental wire cap", () => {
    const document = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    document.subscribe((update, origin) => {
      if (origin === STUDIO_CRDT_ORIGIN_LOCAL) updates.push(update);
    });
    const count = STUDIO_CRDT_APPEND_MAX_SAMPLES;
    const points = Array.from({ length: count }, (_, index) => [index, index + 0.5]).flat();
    const fullPayload = payload(points, {
      pressures: Array<number>(count).fill(0.7),
      tiltXs: Array<number>(count).fill(1),
      tiltYs: Array<number>(count).fill(2),
      twists: Array<number>(count).fill(3),
      speeds: Array<number>(count).fill(4),
      tangentialPressures: Array<number>(count).fill(0.1),
      extensions: { inlineNote: "M".repeat(12 * 1024) },
    });

    document.addStroke({ ...stroke("bounded-upsert", "page-a"), payload: fullPayload });
    document.replaceStroke({
      ...stroke("bounded-upsert", "page-a"),
      payload: { ...fullPayload, stroke: "#abcdef" },
    });

    expect(updates.length).toBeGreaterThan(4);
    expect(Math.max(...updates.map((update) => update.byteLength)))
      .toBeLessThanOrEqual(STUDIO_CRDT_UPDATE_MAX_BYTES);
    expect(document.getStroke("bounded-upsert")?.payload.stroke).toBe("#abcdef");
    document.destroy();
  });

  it("rejects oversized inline mask metadata before begin or replacement mutates the document", () => {
    const document = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    document.subscribe((update, origin) => {
      if (origin === STUDIO_CRDT_ORIGIN_LOCAL) updates.push(update);
    });
    const oversized = {
      maskSrc: `data:image/png;base64,${"A".repeat(60 * 1024)}`,
    };
    expect(JSON.stringify(oversized).length).toBeGreaterThan(STUDIO_CRDT_METADATA_MAX_BYTES);
    expect(() => document.beginStroke({
      ...stroke("oversized-new", "page-a"),
      payload: payload([1, 2], { extensions: oversized }),
    })).toThrow("메타데이터가 실시간 동기화 한도를 초과");
    expect(updates).toHaveLength(0);
    expect(document.getStroke("oversized-new", true)).toBeNull();

    document.addStroke(stroke("safe-existing", "page-a"));
    const before = document.getStroke("safe-existing", true);
    updates.length = 0;
    expect(() => document.replaceStroke({
      ...stroke("safe-existing", "page-a", [90, 90]),
      payload: payload([90, 90], { extensions: oversized }),
    })).toThrow("메타데이터가 실시간 동기화 한도를 초과");
    expect(updates).toHaveLength(0);
    expect(document.getStroke("safe-existing", true)).toEqual(before);
    document.destroy();
  });

  it("ignores malicious non-map Yjs roots and malformed nested records without read crashes", () => {
    const attacker = new Y.Doc();
    attacker.getMap<unknown>("strokes").set("string-stroke", "not-a-map");
    const malformed = new Y.Map<unknown>();
    malformed.set("id", "malformed-stroke");
    malformed.set("pageId", "page-a");
    malformed.set("layerId", "page-root");
    malformed.set("status", "finalized");
    malformed.set("points", "not-an-array");
    attacker.getMap<unknown>("strokes").set("malformed-stroke", malformed);
    attacker.getArray<unknown>("stroke-order").push(["not-a-map", 42]);
    attacker.getMap<boolean>("scene-elements").set("poison-scene", true);
    attacker.getArray<unknown>("scene-element:poison-scene").push(["not-a-map"]);
    attacker.getMap<boolean>("studio-pages").set("poison-page", true);
    attacker.getArray<unknown>("studio-page:poison-page").push(["not-a-map"]);

    const document = new StudioCrdtDocument();
    const changes = vi.fn();
    document.subscribeChanges(changes);
    expect(() => document.applyUpdate(Y.encodeStateAsUpdate(attacker))).not.toThrow();
    expect(() => document.getStrokes({ includeDeleted: true })).not.toThrow();
    expect(document.getStrokes({ includeDeleted: true })).toEqual([]);
    expect(document.getStroke("string-stroke", true)).toBeNull();
    expect(document.getSceneElements({ includeDeleted: true })).toEqual([]);
    expect(document.getPages(true)).toEqual([]);
    expect(changes).toHaveBeenCalled();

    document.destroy();
    attacker.destroy();
  });

  it("reports exact changed stroke IDs and filters origins before materializing changes", () => {
    const document = new StudioCrdtDocument();
    const remoteOnly = vi.fn();
    document.subscribeChanges(remoteOnly, {
      includeOrigin: (origin) => origin === STUDIO_CRDT_ORIGIN_REMOTE,
    });
    document.addStroke(stroke("local-only", "page-a"));
    expect(remoteOnly).not.toHaveBeenCalled();

    const remote = new StudioCrdtDocument();
    remote.addStroke(stroke("remote-only", "page-a"));
    document.applyUpdate(remote.encodeStateAsUpdate(), STUDIO_CRDT_ORIGIN_REMOTE);

    expect(remoteOnly).toHaveBeenCalledTimes(1);
    const change = remoteOnly.mock.calls[0]?.[0];
    expect(change.local).toBe(false);
    expect([...change.changedStrokeIds]).toEqual(["remote-only"]);

    remote.beginStroke(stroke("remote-stream", "page-a"));
    document.applyUpdate(
      remote.encodeStateAsUpdate(document.encodeStateVector()),
      STUDIO_CRDT_ORIGIN_REMOTE
    );
    remote.appendStrokeSamples("remote-stream", { points: [30, 40], pressures: [0.8] });
    document.applyUpdate(
      remote.encodeStateAsUpdate(document.encodeStateVector()),
      STUDIO_CRDT_ORIGIN_REMOTE
    );
    const streamedChange = remoteOnly.mock.calls.at(-1)?.[0];
    expect([...streamedChange.changedStrokeIds]).toEqual(["remote-stream"]);
    document.destroy();
    remote.destroy();
  });

  it("filters transaction summaries before materializing an enumerable change frontier", () => {
    const document = new StudioCrdtDocument();
    const getStrokes = vi.spyOn(document, "getStrokes");
    const getSceneElements = vi.spyOn(document, "getSceneElements");
    const getPages = vi.spyOn(document, "getPages");
    const getLayerGroups = vi.spyOn(document, "getLayerGroups");
    const readRasterSnapshot = vi.spyOn(
      document as unknown as { tryReadExactRasterDocumentSnapshot(): unknown },
      "tryReadExactRasterDocumentSnapshot"
    );
    const includeChange = vi.fn(
      (summary: StudioCrdtChangeSummary) => summary.changedSceneElementIds.size > 0
    );
    const changes: StudioCrdtChange[] = [];
    document.subscribeChanges((change) => changes.push(change), {
      includeOrigin: () => true,
      includeChange,
    });

    document.addStroke(stroke("filtered-stroke", "page-a"));

    expect(includeChange).toHaveBeenCalled();
    expect(changes).toEqual([]);
    expect(getStrokes).not.toHaveBeenCalled();
    expect(getSceneElements).not.toHaveBeenCalled();
    expect(getPages).not.toHaveBeenCalled();
    expect(getLayerGroups).not.toHaveBeenCalled();
    expect(readRasterSnapshot).not.toHaveBeenCalled();
    includeChange.mockClear();

    document.addSceneElement(textElement("included-text"));

    expect(includeChange).toHaveBeenCalled();
    expect(changes).not.toHaveLength(0);
    const includedChange = changes.at(-1)!;
    expect(includedChange.sceneElements.map(({ id }) => id)).toEqual(["included-text"]);
    expect(new Set(Object.keys(includedChange))).toEqual(new Set([
      "origin",
      "local",
      "changedStrokeIds",
      "strokes",
      "changedSceneElementIds",
      "sceneElements",
      "changedPageIds",
      "pages",
      "changedLayerGroupIds",
      "layerGroups",
      "changedRasterSurfaceIds",
      "changedRasterOperationIds",
      "changedRasterUndoOperationIds",
      "changedRasterUndoAcknowledgementIds",
      "changedRasterCheckpointIds",
      "rasterOperationLogs",
      "rasterCheckpoints",
    ]));
    expect(getStrokes).toHaveBeenCalledTimes(1);
    expect(getSceneElements).toHaveBeenCalledTimes(1);
    expect(getPages).toHaveBeenCalledTimes(1);
    expect(getLayerGroups).toHaveBeenCalledTimes(1);
    expect(readRasterSnapshot).toHaveBeenCalledTimes(1);

    document.destroy();
  });

  it("keeps each accepted change frontier fixed at its transaction", () => {
    const document = new StudioCrdtDocument();
    const changes: StudioCrdtChange[] = [];
    document.subscribeChanges((change) => changes.push(change), {
      includeOrigin: () => true,
      includeChange: ({ changedStrokeIds }) => changedStrokeIds.size > 0,
    });

    document.addStroke(stroke("first-stroke", "page-a"));
    const firstChange = changes.at(-1);
    document.addStroke(stroke("second-stroke", "page-a"));
    const secondChange = changes.at(-1);
    document.destroy();

    expect(firstChange?.strokes.map(({ id }) => id)).toEqual(["first-stroke"]);
    expect(secondChange?.strokes.map(({ id }) => id)).toEqual([
      "first-stroke",
      "second-stroke",
    ]);
  });

  it("materializes only projected snapshot fields after summary filtering", () => {
    const document = new StudioCrdtDocument();
    document.addStroke(stroke("projected-existing", "page-a"));
    document.addPage(page("projected-page"));
    const getStrokes = vi.spyOn(document, "getStrokes");
    const getSceneElements = vi.spyOn(document, "getSceneElements");
    const getPages = vi.spyOn(document, "getPages");
    const getLayerGroups = vi.spyOn(document, "getLayerGroups");
    const readRasterSnapshot = vi.spyOn(
      document as unknown as { tryReadExactRasterDocumentSnapshot(): unknown },
      "tryReadExactRasterDocumentSnapshot"
    );
    const changes: StudioCrdtProjectedChange<readonly ["strokes", "pages"]>[] = [];
    document.subscribeChanges((change) => changes.push(change), {
      includeChange: ({ changedSceneElementIds }) => changedSceneElementIds.size > 0,
      snapshotFields: ["strokes", "pages"],
    });

    document.addStroke(stroke("projected-filtered", "page-a"));

    expect(changes).toEqual([]);
    expect(getStrokes).not.toHaveBeenCalled();
    expect(getSceneElements).not.toHaveBeenCalled();
    expect(getPages).not.toHaveBeenCalled();
    expect(getLayerGroups).not.toHaveBeenCalled();
    expect(readRasterSnapshot).not.toHaveBeenCalled();

    document.addSceneElement(textElement("projected-included"));

    expect(changes).toHaveLength(1);
    expect(getStrokes).toHaveBeenCalledTimes(1);
    expect(getPages).toHaveBeenCalledTimes(1);
    expect(getSceneElements).not.toHaveBeenCalled();
    expect(getLayerGroups).not.toHaveBeenCalled();
    expect(readRasterSnapshot).not.toHaveBeenCalled();
    const includedChange = changes[0]!;
    expect(includedChange.snapshotMode).toBe("projected");
    expect(includedChange.snapshotFields).toEqual(["strokes", "pages"]);
    expect(Object.isFrozen(includedChange.snapshotFields)).toBe(true);
    expect(Object.keys(includedChange.snapshot)).toEqual(["strokes", "pages"]);
    expect(includedChange.snapshot.strokes.map(({ id }) => id)).toEqual([
      "projected-existing",
      "projected-filtered",
    ]);
    expect(includedChange.snapshot.pages.map(({ id }) => id)).toEqual(["projected-page"]);
    expect("sceneElements" in includedChange.snapshot).toBe(false);
    expect("strokes" in includedChange).toBe(false);
    type SnapshotHasNoSceneElements = "sceneElements" extends
      keyof typeof includedChange.snapshot ? never : true;
    type ChangeHasNoTopLevelStrokes = "strokes" extends keyof typeof includedChange ? never : true;
    const snapshotHasNoSceneElements: SnapshotHasNoSceneElements = true;
    const changeHasNoTopLevelStrokes: ChangeHasNoTopLevelStrokes = true;
    expect(snapshotHasNoSceneElements).toBe(true);
    expect(changeHasNoTopLevelStrokes).toBe(true);
    document.destroy();
  });

  it("keeps projected frontiers exact after later transactions and document destruction", () => {
    const document = new StudioCrdtDocument();
    const changes: StudioCrdtProjectedChange<readonly ["strokes"]>[] = [];
    document.subscribeChanges((change) => changes.push(change), {
      includeChange: ({ changedStrokeIds }) => changedStrokeIds.size > 0,
      snapshotFields: ["strokes"],
    });

    document.addStroke(stroke("projected-first", "page-a"));
    const firstChange = changes.at(-1)!;
    document.addStroke(stroke("projected-second", "page-a"));
    const secondChange = changes.at(-1)!;
    document.destroy();

    expect(firstChange.snapshot.strokes.map(({ id }) => id)).toEqual(["projected-first"]);
    expect(secondChange.snapshot.strokes.map(({ id }) => id)).toEqual([
      "projected-first",
      "projected-second",
    ]);
  });

  it("reads one shared raster frontier for projected raster fields", () => {
    const document = new StudioCrdtDocument();
    const getStrokes = vi.spyOn(document, "getStrokes");
    const getSceneElements = vi.spyOn(document, "getSceneElements");
    const getPages = vi.spyOn(document, "getPages");
    const getLayerGroups = vi.spyOn(document, "getLayerGroups");
    const readRasterSnapshot = vi.spyOn(
      document as unknown as { tryReadExactRasterDocumentSnapshot(): unknown },
      "tryReadExactRasterDocumentSnapshot"
    );
    const changes = vi.fn();
    document.subscribeChanges(changes, {
      snapshotFields: [
        "rasterOperationLogs",
        "rasterCheckpoints",
        "rasterOperationLogs",
      ],
    });

    document.addSceneElement(textElement("projected-raster-trigger"));

    expect(changes).toHaveBeenCalledTimes(1);
    expect(readRasterSnapshot).toHaveBeenCalledTimes(1);
    expect(getStrokes).not.toHaveBeenCalled();
    expect(getSceneElements).not.toHaveBeenCalled();
    expect(getPages).not.toHaveBeenCalled();
    expect(getLayerGroups).not.toHaveBeenCalled();
    const change = changes.mock.calls[0]?.[0];
    expect(Object.keys(change.snapshot)).toEqual([
      "rasterOperationLogs",
      "rasterCheckpoints",
    ]);
    expect(change.snapshot.rasterOperationLogs).toEqual([]);
    expect(change.snapshot.rasterCheckpoints).toEqual([]);
    document.destroy();
  });

  it("reports exact scene and page IDs introduced by one remote update", () => {
    const receiver = new StudioCrdtDocument();
    const changes = vi.fn();
    receiver.subscribeChanges(changes, {
      includeOrigin: (origin) => origin === STUDIO_CRDT_ORIGIN_REMOTE,
    });
    const remote = new StudioCrdtDocument();
    remote.addSceneElement(textElement("remote-text"));
    remote.addPage(page("remote-page"));

    receiver.applyUpdate(remote.encodeStateAsUpdate(), STUDIO_CRDT_ORIGIN_REMOTE);

    expect(changes).toHaveBeenCalledTimes(1);
    const change = changes.mock.calls[0]?.[0];
    expect([...change.changedStrokeIds]).toEqual([]);
    expect([...change.changedSceneElementIds]).toEqual(["remote-text"]);
    expect([...change.changedPageIds]).toEqual(["remote-page"]);
    expect(change.sceneElements.map(({ id }: { id: string }) => id)).toEqual(["remote-text"]);
    expect(change.pages.map(({ id }: { id: string }) => id)).toEqual(["remote-page"]);
    receiver.destroy();
    remote.destroy();
  });

  it("reassembles a chunked server diff once and computes the reverse offline diff", () => {
    const server = new StudioCrdtDocument();
    server.addStroke(stroke("server-stroke", "page-a", [1, 2, 3, 4]));
    const client = new StudioCrdtDocument();
    client.addStroke(stroke("client-stroke", "page-a", [5, 6, 7, 8]));

    const serverDiff = server.encodeStateAsUpdate(client.encodeStateVector());
    const chunks = encodeStudioCrdtSyncChunks(serverDiff);
    client.applySyncResponse({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-a",
      requestId: "request-a",
      transferId: "transfer-a",
      chunks,
      chunkCount: chunks.length,
      totalBytes: serverDiff.byteLength,
      serverStateVector: encodeStudioCrdtStateVector(server.encodeStateVector()),
      serverSequence: "1",
    });
    const missingOnServer = client.encodeMissingUpdate(
      encodeStudioCrdtStateVector(server.encodeStateVector())
    );
    server.applyUpdate(missingOnServer);

    expect(comparable(client)).toEqual(comparable(server));

    client.destroy();
    server.destroy();
  });

  it("rejects malformed sample alignment and cannot be used after destroy", () => {
    const document = new StudioCrdtDocument();
    expect(() => document.beginStroke({
      ...stroke("invalid-stroke", "page-a"),
      payload: payload([1, 2, 3, 4], { pressures: [0.5] }),
    })).toThrow("정렬되지 않았습니다");

    document.destroy();
    expect(() => document.getStrokes()).toThrow("이미 닫힌");
  });
});
