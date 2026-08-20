import { describe, expect, it } from "vitest";

import { studioLocalLiveChannelName, type StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import {
  STUDIO_LIVE_INK_BACKPRESSURE_HIGH_QUEUED_CHUNKS,
  STUDIO_LIVE_INK_BACKPRESSURE_MID_QUEUED_CHUNKS,
  STUDIO_LIVE_INK_CHUNK_CADENCE_HIGH_MS,
  STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_FAST_MS,
  STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_MS,
  STUDIO_LIVE_INK_CHUNK_CADENCE_MID_MS,
  StudioLiveRoom,
  type StudioLiveInkRoomEvent,
  type StudioLiveRoomDependencies,
} from "./studio-live-collaboration-room";
import {
  createStudioMemoryLiveTransportFactory,
  StudioMemoryBroadcastHub,
} from "./studio-live-collaboration-transport";
import {
  decodeStudioLiveInkSamples,
  encodeStudioLiveInkSamples,
  hashStudioLiveInkPayloads,
} from "./studio-live-ink-codec";
import {
  createStudioLiveInkWireMessage,
  STUDIO_LIVE_INK_PROTOCOL_VERSION,
  STUDIO_LIVE_INK_SAMPLE_SCHEMA,
  type StudioLiveInkBegin,
  type StudioLiveInkChunk,
  type StudioLiveInkPrediction,
} from "./studio-live-ink-protocol";

const alice: StudioLiveParticipant = {
  sessionId: "session-alice",
  displayName: "서윤 탭",
  role: "owner",
};
const bob: StudioLiveParticipant = {
  sessionId: "session-bob",
  displayName: "민호 탭",
  role: "editor",
};
const viewer: StudioLiveParticipant = {
  sessionId: "session-viewer",
  displayName: "관전 탭",
  role: "viewer",
};

function payloadOf(count: number, base = 0): ArrayBuffer {
  return encodeStudioLiveInkSamples(
    Array.from({ length: count }, (_, index) => ({
      x: base + index,
      y: base + index * 2,
      pressure: 0.5,
      timeDeltaMs: 8,
    }))
  );
}

function beginInput(strokeId = "stroke-1", startedAt = 1_000_000): Omit<StudioLiveInkBegin, "kind"> {
  return {
    protocolVersion: STUDIO_LIVE_INK_PROTOCOL_VERSION,
    strokeId,
    pageId: "page-1",
    layerId: "layer-1",
    coordinateSpaceId: "space-a4",
    coordinateSpaceRevision: 1,
    provider: {
      providerId: "vello-hybrid",
      providerVersion: "1.4.0",
      buildHash: "9f2c11ab",
    },
    brushPresetId: "brush-gpen",
    brushContractHash: "c0ffee42",
    seed: 7,
    mode: "pen",
    blendMode: "normal",
    color: "#112233",
    width: 8,
    opacity: 1,
    sampleSchema: STUDIO_LIVE_INK_SAMPLE_SCHEMA,
    startedAt,
  };
}

function chunkInput(
  strokeId: string,
  chunkSequence: number,
  firstSampleIndex: number,
  sampleCount = 4
): Omit<StudioLiveInkChunk, "kind"> {
  return {
    strokeId,
    chunkSequence,
    firstSampleIndex,
    sampleCount,
    payload: payloadOf(sampleCount, firstSampleIndex),
  };
}

function predictionInput(
  strokeId: string,
  predictionSequence: number,
  expiresAt: number
): Omit<StudioLiveInkPrediction, "kind"> {
  return {
    strokeId,
    predictionSequence,
    replacesFromSampleIndex: 0,
    expiresAt,
    sampleCount: 2,
    payload: payloadOf(2),
  };
}

function harness() {
  let now = 1_000_000;
  const hub = new StudioMemoryBroadcastHub();
  interface PendingTimeout {
    id: number;
    handler: () => void;
    delay: number;
  }
  const pendingTimeouts: PendingTimeout[] = [];
  let nextTimeoutId = 1;
  const baseDependencies: StudioLiveRoomDependencies = {
    transportFactory: createStudioMemoryLiveTransportFactory(hub),
    now: () => now,
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: (handler, delay) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      pendingTimeouts.push({ id, handler, delay });
      return id;
    },
    clearTimeout: (handle) => {
      const index = pendingTimeouts.findIndex((entry) => entry.id === handle);
      if (index >= 0) pendingTimeouts.splice(index, 1);
    },
    cursorIntervalMs: 40,
  };
  return {
    hub,
    pendingTimeouts,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    runNextTimeout: () => {
      const next = pendingTimeouts.shift();
      next?.handler();
    },
    room: (
      participant: StudioLiveParticipant,
      dependencies: Partial<StudioLiveRoomDependencies> = {}
    ) =>
      new StudioLiveRoom({
        workId: "work-1",
        participant,
        dependencies: { ...baseDependencies, ...dependencies },
      }),
  };
}

function collectInk(room: StudioLiveRoom): StudioLiveInkRoomEvent[] {
  const events: StudioLiveInkRoomEvent[] = [];
  room.subscribeInk((event) => events.push(event));
  return events;
}

describe("StudioLiveRoom ink channel (V18)", () => {
  it("publishes a stroke lifecycle over the binary lane, separate from cursor events", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);
    const cursorEvents: string[] = [];
    roomB.subscribe((event) => cursorEvents.push(event.type));

    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    const sampleHash = hashStudioLiveInkPayloads([payloadOf(4, 0)]);
    expect(
      roomA.publishInkEnd({
        strokeId: "stroke-1",
        lastChunkSequence: 1,
        totalActualSamples: 4,
        sampleHash,
        crdtStrokeId: "crdt-stroke-1",
      })
    ).toBe(true);
    // The end frame waits for the next cadence tick behind the chunk it must not overtake.
    test.advance(STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_FAST_MS);
    test.runNextTimeout();

    expect(inkEvents.map((event) => event.message.kind)).toEqual([
      "ink:begin",
      "ink:chunk",
      "ink:end",
    ]);
    expect(inkEvents[0]!.participant).toEqual(alice);
    const receivedChunk = inkEvents[1]!.message;
    if (receivedChunk.kind !== "ink:chunk") throw new Error("chunk expected");
    const decoded = decodeStudioLiveInkSamples(receivedChunk.payload);
    expect(decoded.samples).toHaveLength(4);
    expect(decoded.samples[0]).toMatchObject({ x: 0, y: 0, timeDeltaMs: 8 });
    expect(decoded.samples[0]!.pressure).toBeCloseTo(0.5, 4);
    const receivedEnd = inkEvents[2]!.message;
    if (receivedEnd.kind !== "ink:end") throw new Error("end expected");
    expect(receivedEnd.sampleHash).toBe(sampleHash);
    // Ink never leaks into the JSON room-event surface.
    expect(cursorEvents).not.toContain("transport-error");
    expect(cursorEvents.filter((type) => type === "cursor")).toHaveLength(0);
    roomA.close();
    roomB.close();
  });

  it("keeps cursor throttling untouched while the ink scheduler runs", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);

    const cursor = { x: 0.5, y: 0.5, pageId: "page-1", tool: "brush" };
    expect(roomA.publishCursor(cursor)).toBe(true);
    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    // Ink traffic must not consume or reset the 40ms cursor interval.
    expect(roomA.publishCursor(cursor)).toBe(false);
    test.advance(40);
    expect(roomA.publishCursor(cursor)).toBe(true);
    expect(inkEvents.map((event) => event.message.kind)).toEqual(["ink:begin", "ink:chunk"]);
    roomA.close();
    roomB.close();
  });

  it("walks backpressure low→mid→high, sheds predictions first and never drops actuals", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);

    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.getInkBackpressure()).toMatchObject({
      level: "low",
      chunkCadenceMs: STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_FAST_MS,
    });
    // First chunk flushes immediately; later chunks buffer because time is frozen.
    let sequence = 1;
    let sampleIndex = 0;
    const publishChunk = () => {
      expect(roomA.publishInkChunk(chunkInput("stroke-1", sequence, sampleIndex))).toBe(true);
      sequence += 1;
      sampleIndex += 4;
    };
    publishChunk();
    publishChunk();
    publishChunk();
    expect(roomA.getInkBackpressure()).toMatchObject({
      level: "low",
      queuedChunks: 2,
      chunkCadenceMs: STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_MS,
    });
    // A queued prediction is legal below the high watermark.
    expect(
      roomA.publishInkPrediction(predictionInput("stroke-1", 1, test.now() + 500))
    ).toBe(true);
    while (roomA.getInkBackpressure().level !== "mid") publishChunk();
    expect(roomA.getInkBackpressure()).toMatchObject({
      level: "mid",
      chunkCadenceMs: STUDIO_LIVE_INK_CHUNK_CADENCE_MID_MS,
    });
    expect(roomA.getInkBackpressure().queuedChunks).toBeGreaterThanOrEqual(
      STUDIO_LIVE_INK_BACKPRESSURE_MID_QUEUED_CHUNKS
    );
    while (roomA.getInkBackpressure().level !== "high") publishChunk();
    const high = roomA.getInkBackpressure();
    expect(high.chunkCadenceMs).toBe(STUDIO_LIVE_INK_CHUNK_CADENCE_HIGH_MS);
    expect(high.queuedChunks).toBeGreaterThanOrEqual(
      STUDIO_LIVE_INK_BACKPRESSURE_HIGH_QUEUED_CHUNKS
    );
    // Entering high shed the queued prediction; new predictions are refused outright.
    expect(high.droppedPredictions).toBe(1);
    expect(
      roomA.publishInkPrediction(predictionInput("stroke-1", 2, test.now() + 500))
    ).toBe(false);
    expect(roomA.getInkBackpressure().droppedPredictions).toBe(2);

    const totalChunks = sequence - 1;
    expect(
      roomA.publishInkEnd({
        strokeId: "stroke-1",
        lastChunkSequence: totalChunks,
        totalActualSamples: sampleIndex,
        sampleHash: hashStudioLiveInkPayloads([]),
        crdtStrokeId: "crdt-stroke-1",
      })
    ).toBe(true);

    // Drain: every buffered actual arrives in order; the shed prediction never does.
    for (let guard = 0; guard < 200 && test.pendingTimeouts.length > 0; guard += 1) {
      test.advance(STUDIO_LIVE_INK_CHUNK_CADENCE_HIGH_MS);
      test.runNextTimeout();
    }
    expect(roomA.getInkBackpressure()).toMatchObject({
      level: "low",
      queuedMessages: 0,
      queuedBytes: 0,
    });
    const kinds = inkEvents.map((event) => event.message.kind);
    expect(kinds[0]).toBe("ink:begin");
    expect(kinds.at(-1)).toBe("ink:end");
    expect(kinds).not.toContain("ink:prediction");
    const receivedSequences = inkEvents
      .map((event) => event.message)
      .filter((message): message is StudioLiveInkChunk => message.kind === "ink:chunk")
      .map((message) => message.chunkSequence);
    expect(receivedSequences).toEqual(
      Array.from({ length: totalChunks }, (_, index) => index + 1)
    );
    roomA.close();
    roomB.close();
  });

  it("drops expired predictions at flush time without touching actuals", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);

    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    expect(
      roomA.publishInkPrediction(predictionInput("stroke-1", 1, test.now() + 10))
    ).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 2, 4))).toBe(true);
    // Let the prediction expire before its turn on the wire.
    test.advance(STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_MS * 4);
    test.runNextTimeout();
    test.advance(STUDIO_LIVE_INK_CHUNK_CADENCE_LOW_MS);
    test.runNextTimeout();

    expect(inkEvents.map((event) => event.message.kind)).toEqual([
      "ink:begin",
      "ink:chunk",
      "ink:chunk",
    ]);
    expect(roomA.getInkBackpressure().droppedPredictions).toBe(1);
    roomA.close();
    roomB.close();
  });

  it("fails closed when the transport did not negotiate ink-v2 — sender side", async () => {
    const test = harness();
    const roomA = test.room(alice, {
      transportFactory: createStudioMemoryLiveTransportFactory(test.hub, { inkLane: false }),
    });
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);

    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(false);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(false);
    expect(inkEvents).toEqual([]);
    // The V18 contract keeps the room cursor-only — presence and cursors still flow.
    expect(roomA.publishCursor({ x: 0.1, y: 0.2, pageId: "page-1", tool: "brush" })).toBe(true);
    expect(roomB.getCursors()).toHaveLength(1);
    roomA.close();
    roomB.close();
  });

  it("fails closed when the transport did not negotiate ink-v2 — receiver side", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob, {
      transportFactory: createStudioMemoryLiveTransportFactory(test.hub, { inkLane: false }),
    });
    await roomA.start();
    await roomB.start();
    const inkEvents = collectInk(roomB);

    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    // No approximate re-rendering path: the lane-less peer receives nothing but cursors.
    expect(inkEvents).toEqual([]);
    expect(roomA.publishCursor({ x: 0.4, y: 0.6, pageId: "page-1", tool: "brush" })).toBe(true);
    expect(roomB.getCursors()).toHaveLength(1);
    roomA.close();
    roomB.close();
  });

  it("refuses viewers, unknown strokes and out-of-order lifecycles at the publisher", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomV = test.room(viewer);
    await roomA.start();
    await roomV.start();

    expect(roomV.publishInkBegin(beginInput("stroke-viewer", test.now()))).toBe(false);
    expect(roomA.publishInkChunk(chunkInput("stroke-unbegun", 1, 0))).toBe(false);
    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(false);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 2, 0))).toBe(false);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    expect(
      roomA.publishInkEnd({
        strokeId: "stroke-1",
        lastChunkSequence: 9,
        totalActualSamples: 4,
        sampleHash: hashStudioLiveInkPayloads([]),
        crdtStrokeId: "crdt-1",
      })
    ).toBe(false);
    expect(roomA.publishInkCancel({ strokeId: "stroke-1", reason: "user" })).toBe(true);
    roomA.close();
    roomV.close();
  });

  it("drops inbound ink from senders without verified presence and replayed chunks", async () => {
    const test = harness();
    const roomB = test.room(bob);
    await roomB.start();
    const inkEvents = collectInk(roomB);
    const ghostChannel = test.hub.create(studioLocalLiveChannelName("work-1"));

    // A structurally valid frame from a session that never joined presence is refused.
    ghostChannel.postMessage(
      createStudioLiveInkWireMessage({
        workId: "work-1",
        senderSessionId: "session-ghost",
        sentAt: test.now(),
        message: { ...beginInput("stroke-ghost", test.now()), kind: "ink:begin" },
      })
    );
    expect(inkEvents).toEqual([]);

    // A presence-verified editor is accepted, but replayed chunk sequences fail closed.
    const roomA = test.room(alice);
    await roomA.start();
    expect(roomA.publishInkBegin(beginInput("stroke-1", test.now()))).toBe(true);
    expect(roomA.publishInkChunk(chunkInput("stroke-1", 1, 0))).toBe(true);
    const replay = createStudioLiveInkWireMessage({
      workId: "work-1",
      senderSessionId: alice.sessionId,
      sentAt: test.now(),
      message: { ...chunkInput("stroke-1", 1, 0), kind: "ink:chunk" },
    });
    ghostChannel.postMessage(replay);
    expect(
      inkEvents.map((event) => event.message.kind)
    ).toEqual(["ink:begin", "ink:chunk"]);
    roomA.close();
    roomB.close();
  });
});
