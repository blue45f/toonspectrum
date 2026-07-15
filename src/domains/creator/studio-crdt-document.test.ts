import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  STUDIO_CRDT_APPEND_MAX_SAMPLES,
  STUDIO_CRDT_METADATA_MAX_BYTES,
  STUDIO_CRDT_ORIGIN_LOCAL,
  STUDIO_CRDT_ORIGIN_REMOTE,
  StudioCrdtDocument,
  type StudioCrdtDrawStrokePayload,
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

describe("StudioCrdtDocument", () => {
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

    const document = new StudioCrdtDocument();
    const changes = vi.fn();
    document.subscribeChanges(changes);
    expect(() => document.applyUpdate(Y.encodeStateAsUpdate(attacker))).not.toThrow();
    expect(() => document.getStrokes({ includeDeleted: true })).not.toThrow();
    expect(document.getStrokes({ includeDeleted: true })).toEqual([]);
    expect(document.getStroke("string-stroke", true)).toBeNull();
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
