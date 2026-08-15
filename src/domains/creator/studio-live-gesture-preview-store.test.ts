import { describe, expect, it, vi } from "vitest";

import { STUDIO_LIVE_GESTURE_PREVIEW_VERSION } from "./studio-live-gesture-preview";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS,
  StudioLiveGesturePreviewStore,
  type StudioLiveGesturePreviewStoreScheduler,
} from "./studio-live-gesture-preview-store";

import type { StudioLiveGesturePreviewPayload } from "./studio-live-gesture-preview";

function freehandBegin(
  gestureId: string,
  overrides: Partial<StudioLiveGesturePreviewPayload> = {},
): StudioLiveGesturePreviewPayload {
  return {
    version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
    gestureId,
    pageId: "page-a",
    seq: 1,
    phase: "begin",
    operation: "draw",
    base: { documentGeneration: 7 },
    renderer: {
      kind: "freehand",
      mode: "pen",
      stroke: "#111111",
      strokeWidth: 4,
    },
    samples: {
      startIndex: 0,
      points: [0, 0, 10, 10],
      pressures: [0.4, 0.5],
      sampleTimeOffsets: [0, 8],
    },
    ...overrides,
  };
}

function append(
  gestureId: string,
  seq: number,
  startIndex: number,
  points: readonly number[],
  overrides: Partial<StudioLiveGesturePreviewPayload> = {},
): StudioLiveGesturePreviewPayload {
  const count = points.length / 2;
  return {
    version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
    gestureId,
    pageId: "page-a",
    seq,
    phase: "append",
    operation: "draw",
    samples: {
      startIndex,
      points,
      pressures: Array<number>(count).fill(0.7),
      sampleTimeOffsets: Array.from({ length: count }, (_, index) => 16 + index * 8),
    },
    ...overrides,
  };
}

function shapeBegin(gestureId: string): StudioLiveGesturePreviewPayload {
  return {
    version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
    gestureId,
    pageId: "page-a",
    seq: 1,
    phase: "begin",
    operation: "shape",
    base: { documentGeneration: 7 },
    renderer: {
      kind: "rect",
      mode: "pen",
      stroke: "#111111",
      strokeWidth: 4,
    },
    shape: { kind: "rect", x0: 1, y0: 2, x1: 3, y1: 4 },
  };
}

function retouchBegin(gestureId: string): StudioLiveGesturePreviewPayload {
  return {
    version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
    gestureId,
    pageId: "page-a",
    seq: 1,
    phase: "begin",
    operation: "retouch",
    base: {
      documentGeneration: 7,
      targetElementId: "target-a",
      targetRevision: "revision-a",
    },
    retouch: {
      tool: "smudge",
      startIndex: 0,
      points: [0.1, 0.2],
      radiusNorm: 0.2,
      strength: 0.4,
    },
  };
}

function terminal(
  gestureId: string,
  seq: number,
  operation: StudioLiveGesturePreviewPayload["operation"] = "draw",
  phase: "end" | "cancel" = "end",
): StudioLiveGesturePreviewPayload {
  return {
    version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
    gestureId,
    pageId: "page-a",
    seq,
    phase,
    operation,
  };
}

function manualScheduler(initialNow = 10_000) {
  let now = initialNow;
  let nextHandle = 1;
  const intervals = new Map<number, () => void>();
  const scheduler: StudioLiveGesturePreviewStoreScheduler = {
    now: () => now,
    setInterval: (callback) => {
      const handle = nextHandle++;
      intervals.set(handle, callback);
      return handle;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as number);
    },
  };
  return {
    scheduler,
    advance: (durationMs: number) => { now += durationMs; },
    runIntervals: () => {
      for (const callback of [...intervals.values()]) callback();
    },
    intervalCount: () => intervals.size,
  };
}

describe("StudioLiveGesturePreviewStore", () => {
  it("reduces begin/append/end into detached immutable snapshots with stable no-op identity", () => {
    const clock = manualScheduler();
    const store = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      scheduler: clock.scheduler,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const begin = freehandBegin("gesture-a");

    expect(store.apply("sender-a", begin)).toEqual({ status: "applied" });
    const first = store.getSnapshot();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(Object.isFrozen(first[0]!.samples?.points)).toBe(true);
    expect(first[0]).toMatchObject({
      senderSessionId: "sender-a",
      gestureId: "gesture-a",
      seq: 1,
      lastPhase: "begin",
      sampleCount: 2,
    });

    expect(store.apply("sender-a", begin)).toEqual({ status: "duplicate" });
    expect(store.getSnapshot()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);

    (begin.samples!.points as number[])[0] = 999;
    expect(first[0]!.samples?.points[0]).toBe(0);

    expect(store.apply("sender-a", append("gesture-a", 2, 2, [20, 20]))).toEqual({
      status: "applied",
    });
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(second[0]!.samples).toEqual({
      startIndex: 0,
      points: [0, 0, 10, 10, 20, 20],
      pressures: [0.4, 0.5, 0.7],
      sampleTimeOffsets: [0, 8, 16],
    });
    expect(first[0]!.samples?.points).toEqual([0, 0, 10, 10]);

    const end = terminal("gesture-a", 3);
    expect(store.apply("sender-a", end)).toEqual({ status: "applied" });
    expect(store.getSnapshot()).toEqual([]);
    expect(store.apply("sender-a", end)).toEqual({ status: "duplicate" });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("replaces only a shape endpoint snapshot and cancels it without retaining content", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    expect(store.apply("sender-a", shapeBegin("shape-a"))).toEqual({ status: "applied" });

    expect(store.apply("sender-a", {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "shape-a",
      pageId: "page-a",
      seq: 2,
      phase: "replace",
      operation: "shape",
      shape: { kind: "rect", x0: 1, y0: 2, x1: 30, y1: 40 },
    })).toEqual({ status: "applied" });
    expect(store.getSnapshot()[0]).toMatchObject({
      seq: 2,
      lastPhase: "replace",
      shape: { kind: "rect", x0: 1, y0: 2, x1: 30, y1: 40 },
      renderer: { kind: "rect" },
    });

    expect(store.apply("sender-a", terminal("shape-a", 3, "shape", "cancel"))).toEqual({
      status: "applied",
    });
    expect(store.getSnapshot()).toEqual([]);
  });

  it("keys identical gesture ids independently for each sender", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    expect(store.apply("sender-a", freehandBegin("shared-id"))).toEqual({ status: "applied" });
    expect(store.apply("sender-b", freehandBegin("shared-id"))).toEqual({ status: "applied" });

    expect(store.getSnapshot().map((entry) => [
      entry.senderSessionId,
      entry.gestureId,
    ])).toEqual([
      ["sender-a", "shared-id"],
      ["sender-b", "shared-id"],
    ]);
    expect(store.apply("sender-a", terminal("shared-id", 2))).toEqual({ status: "applied" });
    expect(store.getSnapshot().map((entry) => entry.senderSessionId)).toEqual(["sender-b"]);
  });

  it("fails closed for conflicting duplicates, old packets, and sequence gaps", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    const begin = freehandBegin("conflict");
    expect(store.apply("sender-a", begin)).toEqual({ status: "applied" });
    expect(store.apply("sender-a", freehandBegin("conflict", {
      samples: {
        ...begin.samples!,
        points: [1, 1, 10, 10],
      },
    }))).toEqual({ status: "rejected", reason: "sequence" });
    expect(store.getSnapshot()).toEqual([]);
    expect(store.apply("sender-a", append("conflict", 2, 2, [20, 20]))).toEqual({
      status: "rejected",
      reason: "sequence",
    });

    expect(store.apply("sender-a", freehandBegin("old"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", append("old", 2, 2, [20, 20]))).toEqual({
      status: "applied",
    });
    expect(store.apply("sender-a", append("old", 1, 3, [30, 30]))).toEqual({
      status: "rejected",
      reason: "sequence",
    });
    expect(store.getSnapshot()).toEqual([]);

    expect(store.apply("sender-a", freehandBegin("gap"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", append("gap", 3, 2, [20, 20]))).toEqual({
      status: "rejected",
      reason: "sequence",
    });
    expect(store.getSnapshot()).toEqual([]);
  });

  it("requires aligned append suffixes and an invariant optional-channel schema", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    expect(store.apply("sender-a", freehandBegin("offset"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", append("offset", 2, 1, [20, 20]))).toEqual({
      status: "rejected",
      reason: "unaligned-suffix",
    });

    expect(store.apply("sender-a", freehandBegin("channels"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", {
      ...append("channels", 2, 2, [20, 20]),
      samples: { startIndex: 2, points: [20, 20] },
    })).toEqual({ status: "rejected", reason: "channel-schema" });

    expect(store.apply("sender-a", freehandBegin("time"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", {
      ...append("time", 2, 2, [20, 20]),
      samples: {
        startIndex: 2,
        points: [20, 20],
        pressures: [0.7],
        sampleTimeOffsets: [4],
      },
    })).toEqual({ status: "rejected", reason: "unaligned-suffix" });
  });

  it("requires retouch suffix alignment and immutable tool parameters", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    expect(store.apply("sender-a", retouchBegin("retouch-a"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "retouch-a",
      pageId: "page-a",
      seq: 2,
      phase: "append",
      operation: "retouch",
      retouch: {
        tool: "smudge",
        startIndex: 1,
        points: [0.2, 0.3],
        radiusNorm: 0.2,
        strength: 0.7,
      },
    })).toEqual({ status: "rejected", reason: "retouch-schema" });
    expect(store.getSnapshot()).toEqual([]);
  });

  it("enforces peer, gesture, and per-gesture/global sample caps without evicting valid peers", () => {
    const store = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      limits: {
        maxPeers: 1,
        maxActiveGestures: 2,
        maxGesturesPerPeer: 1,
        maxSamplesPerGesture: 3,
        maxTotalSamples: 3,
      },
    });
    expect(store.apply("sender-a", freehandBegin("kept"))).toEqual({ status: "applied" });
    expect(store.apply("sender-a", freehandBegin("same-peer"))).toEqual({
      status: "rejected",
      reason: "peer-gesture-cap",
    });
    expect(store.apply("sender-b", freehandBegin("new-peer"))).toEqual({
      status: "rejected",
      reason: "peer-cap",
    });
    expect(store.getSnapshot().map((entry) => entry.gestureId)).toEqual(["kept"]);

    expect(store.apply("sender-a", append("kept", 2, 2, [20, 20]))).toEqual({
      status: "applied",
    });
    expect(store.apply("sender-a", append("kept", 3, 3, [30, 30]))).toEqual({
      status: "rejected",
      reason: "sample-cap",
    });
    expect(store.getSnapshot()).toEqual([]);

    const gestureCapStore = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      limits: {
        maxPeers: 2,
        maxActiveGestures: 1,
        maxGesturesPerPeer: 2,
      },
    });
    expect(gestureCapStore.apply("sender-a", freehandBegin("first"))).toEqual({
      status: "applied",
    });
    expect(gestureCapStore.apply("sender-a", freehandBegin("second"))).toEqual({
      status: "rejected",
      reason: "gesture-cap",
    });

    const totalSampleStore = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      limits: {
        maxPeers: 2,
        maxActiveGestures: 2,
        maxGesturesPerPeer: 2,
        maxSamplesPerGesture: 10,
        maxTotalSamples: 3,
      },
    });
    expect(totalSampleStore.apply("sender-a", freehandBegin("sample-first"))).toEqual({
      status: "applied",
    });
    expect(totalSampleStore.apply("sender-a", freehandBegin("sample-second"))).toEqual({
      status: "rejected",
      reason: "sample-cap",
    });
    expect(totalSampleStore.getSnapshot().map((entry) => entry.gestureId)).toEqual([
      "sample-first",
    ]);
  });

  it("keeps terminal and failed gestures tombstoned until their TTL expires", () => {
    const clock = manualScheduler();
    const store = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      scheduler: clock.scheduler,
    });
    const begin = freehandBegin("terminal-tombstone");
    store.apply("sender-a", begin);
    store.apply("sender-a", terminal("terminal-tombstone", 2));

    expect(store.apply("sender-a", begin)).toEqual({
      status: "rejected",
      reason: "sequence",
    });
    clock.advance(STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS + 1);
    expect(store.apply("sender-a", begin)).toEqual({ status: "applied" });
  });

  it("cleans up by presence, page, transport, and the three-second TTL", () => {
    const clock = manualScheduler();
    const store = new StudioLiveGesturePreviewStore({
      pageId: "page-a",
      scheduler: clock.scheduler,
      limits: { maxGesturesPerPeer: 2 },
    });
    const unsubscribe = store.subscribe(() => undefined);
    expect(clock.intervalCount()).toBe(1);
    store.apply("sender-a", freehandBegin("peer-a"));
    store.apply("sender-b", freehandBegin("peer-b"));

    expect(store.retainPresentSenders(["sender-a"])).toBe(1);
    expect(store.getSnapshot().map((entry) => entry.gestureId)).toEqual(["peer-a"]);
    expect(store.setActivePage("page-b")).toBe(1);
    expect(store.apply("sender-a", freehandBegin("wrong-page"))).toEqual({
      status: "rejected",
      reason: "inactive-page",
    });
    expect(store.apply("sender-a", freehandBegin("right-page", { pageId: "page-b" }))).toEqual({
      status: "applied",
    });
    expect(store.clearForTransportLoss()).toBe(1);
    expect(store.getSnapshot()).toEqual([]);

    expect(store.apply("sender-a", freehandBegin("expires", { pageId: "page-b" }))).toEqual({
      status: "applied",
    });
    clock.advance(STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS + 1);
    clock.runIntervals();
    expect(store.getSnapshot()).toEqual([]);
    expect(store.apply("sender-a", freehandBegin("expires", { pageId: "page-b" }))).toEqual({
      status: "duplicate",
    });

    unsubscribe();
    expect(clock.intervalCount()).toBe(0);
  });

  it("rejects malformed transport input without changing snapshot identity", () => {
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a" });
    const empty = store.getSnapshot();
    expect(store.ingest("sender-a", {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "invalid",
    })).toEqual({ status: "rejected", reason: "invalid-payload" });
    expect(store.apply(" ", freehandBegin("invalid-sender"))).toEqual({
      status: "rejected",
      reason: "invalid-sender",
    });
    expect(store.getSnapshot()).toBe(empty);
  });
});
