import { describe, expect, it } from "vitest";

import {
  StudioBg3dCommandTimeline,
  canonicalizeStudioBg3dCommandState,
  createStudioBg3dReplacementCommand,
  hashStudioBg3dCommandState,
  type StudioBg3dStateCommand,
} from "./studio-bg3d-command-core";

type TestState = {
  readonly count: number;
  readonly labels: readonly string[];
  readonly camera: { readonly x: number; readonly y: number };
};

const INITIAL: TestState = Object.freeze({
  count: 0,
  labels: Object.freeze([]),
  camera: Object.freeze({ x: 0, y: 0 }),
});

function increment(amount = 1): StudioBg3dStateCommand<TestState> {
  return {
    id: "bg3d.test.increment",
    label: `Increment ${amount}`,
    source: "test",
    apply: (state) => ({ ...state, count: state.count + amount }),
  };
}

function append(label: string): StudioBg3dStateCommand<TestState> {
  return {
    id: "bg3d.test.append-label",
    label: `Append ${label}`,
    source: "test",
    apply: (state) => ({ ...state, labels: [...state.labels, label] }),
  };
}

describe("Studio BG3D typed command core", () => {
  it("canonicalizes key order and hashes equivalent state identically", () => {
    const left = { z: 2, a: { q: 1, b: true } };
    const right = { a: { b: true, q: 1 }, z: 2 };

    expect(canonicalizeStudioBg3dCommandState(left)).toBe(
      canonicalizeStudioBg3dCommandState(right),
    );
    expect(hashStudioBg3dCommandState(left)).toBe(hashStudioBg3dCommandState(right));
  });

  it("keeps typed values distinct from look-alike JSON objects and strings", () => {
    const timestamp = "2026-09-15T00:00:00.000Z";
    expect(canonicalizeStudioBg3dCommandState(new Date(timestamp))).not.toBe(
      canonicalizeStudioBg3dCommandState(timestamp),
    );
    expect(canonicalizeStudioBg3dCommandState(BigInt(12))).not.toBe(
      canonicalizeStudioBg3dCommandState("12"),
    );
    expect(canonicalizeStudioBg3dCommandState(new Set(["a", "b"]))).not.toBe(
      canonicalizeStudioBg3dCommandState({ $set: ["a", "b"] }),
    );
    expect(canonicalizeStudioBg3dCommandState(new Uint8Array([1, 2]))).not.toBe(
      canonicalizeStudioBg3dCommandState({ type: "Uint8Array", bytes: [1, 2] }),
    );
  });

  it("canonicalizes map and set insertion order", () => {
    expect(canonicalizeStudioBg3dCommandState(new Set(["b", "a"]))).toBe(
      canonicalizeStudioBg3dCommandState(new Set(["a", "b"])),
    );
    expect(canonicalizeStudioBg3dCommandState(new Map([["b", 2], ["a", 1]]))).toBe(
      canonicalizeStudioBg3dCommandState(new Map([["a", 1], ["b", 2]])),
    );
  });

  it("commits, undoes and redoes exact immutable states", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);

    expect(timeline.commit(increment(2))).toMatchObject({
      status: "applied",
      revision: 1,
      cursor: 1,
    });
    expect(timeline.commit(append("chair"))).toMatchObject({
      status: "applied",
      revision: 2,
      cursor: 2,
    });
    expect(timeline.readState()).toEqual({
      count: 2,
      labels: ["chair"],
      camera: { x: 0, y: 0 },
    });

    expect(timeline.undo()).toMatchObject({ status: "applied", cursor: 1 });
    expect(timeline.readState()).toEqual({
      count: 2,
      labels: [],
      camera: { x: 0, y: 0 },
    });
    expect(timeline.redo()).toMatchObject({ status: "applied", cursor: 2 });
    expect(timeline.readState().labels).toEqual(["chair"]);
    expect(timeline.verifyReplay().stateHash).toBe(timeline.stateHash);
  });

  it("does not advance revision for semantic no-ops", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const receipt = timeline.commit({
      id: "bg3d.test.noop",
      label: "No change",
      source: "test",
      apply: (state) => ({ ...state }),
    });

    expect(receipt.status).toBe("noop");
    expect(timeline.revision).toBe(0);
    expect(timeline.cursor).toBe(0);
  });

  it("keeps a failed transaction completely atomic", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const before = timeline.readSnapshot();

    expect(() => timeline.transact({
      id: "bg3d.test.atomic-transaction",
      label: "Atomic edit",
      source: "test",
      commands: [
        increment(4),
        {
          id: "bg3d.test.throw",
          label: "Fail",
          source: "test",
          apply: () => {
            throw new Error("kernel failed");
          },
        },
      ],
    })).toThrow("kernel failed");

    expect(timeline.readSnapshot()).toEqual(before);
  });

  it("previews and cancels a gesture without changing state or revision", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const token = timeline.beginGesture({ label: "Move object", source: "canvas" });
    const preview = timeline.previewGesture(token, increment(8));

    expect(preview.state.count).toBe(8);
    expect(timeline.readState().count).toBe(0);
    expect(timeline.revision).toBe(0);
    expect(timeline.cancelGesture(token)).toBe(true);
    expect(timeline.revision).toBe(0);
    expect(timeline.cursor).toBe(0);
  });

  it("commits a complete gesture as exactly one history step", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const token = timeline.beginGesture({ label: "Move object" });

    expect(timeline.commitGesture(token, increment(10))).toMatchObject({
      status: "applied",
      cursor: 1,
    });
    expect(timeline.readState().count).toBe(10);
    expect(timeline.undo().state.count).toBe(0);
  });

  it("rejects a late asynchronous result after any intervening edit", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const fence = timeline.captureFence("boolean:desk-cutout");
    timeline.commit(increment());

    const receipt = timeline.commitPrepared(fence, {
      commandId: "bg3d.worker.boolean-result",
      label: "Apply Boolean",
      source: "worker",
      nextState: { ...INITIAL, count: 99 },
    });

    expect(receipt.status).toBe("stale");
    expect(timeline.readState().count).toBe(1);
    expect(timeline.cursor).toBe(1);
  });

  it("accepts an asynchronous result only against its exact source fence", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    const fence = timeline.captureFence("occt:room-shell");

    expect(timeline.commitPrepared(fence, {
      commandId: "bg3d.worker.occt-result",
      label: "Apply exact shell",
      nextState: { ...INITIAL, count: 7 },
    })).toMatchObject({ status: "applied", revision: 1 });
    expect(timeline.readState().count).toBe(7);
  });

  it("cuts the redo branch when a new command follows undo", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    timeline.commit(increment(1));
    timeline.commit(increment(2));
    timeline.undo();
    timeline.commit(increment(10));

    expect(timeline.readState().count).toBe(11);
    expect(timeline.canRedo).toBe(false);
    expect(timeline.readSnapshot().entryCount).toBe(2);
  });

  it("rebases a transient camera view without adding an undo step", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL);
    timeline.commit(increment());
    const beforeCursor = timeline.cursor;

    expect(timeline.rebaseCurrent({
      ...timeline.readState(),
      camera: { x: 12, y: 4 },
    }).status).toBe("applied");
    expect(timeline.cursor).toBe(beforeCursor);
    expect(timeline.verifyReplay().state.camera).toEqual({ x: 12, y: 4 });
    expect(timeline.undo().state).toEqual(INITIAL);
  });

  it("replays one thousand deterministic commands to the same canonical hash", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL, { maxEntries: 2_000 });
    for (let index = 0; index < 1_000; index += 1) {
      timeline.commit(increment(index % 5));
    }

    const replay = timeline.verifyReplay();
    expect(replay.state.count).toBe(2_000);
    expect(replay.stateHash).toBe(timeline.stateHash);
    expect(timeline.cursor).toBe(800);
  });

  it("keeps replay valid after bounded checkpoint trimming", () => {
    const timeline = new StudioBg3dCommandTimeline(INITIAL, { maxEntries: 4 });
    for (let index = 0; index < 12; index += 1) timeline.commit(increment());

    expect(timeline.readState().count).toBe(12);
    expect(timeline.readSnapshot().entryCount).toBe(4);
    expect(timeline.cursor).toBe(4);
    expect(timeline.verifyReplay().state.count).toBe(12);

    for (let index = 0; index < 4; index += 1) timeline.undo();
    expect(timeline.readState().count).toBe(8);
  });

  it("owns replacement command state instead of retaining a mutable caller object", () => {
    const next = { ...INITIAL, labels: ["wall"] };
    const command = createStudioBg3dReplacementCommand<TestState>({
      id: "bg3d.test.replace",
      label: "Replace scene",
      nextState: next,
      source: "test",
    });
    next.labels.push("mutated-outside");
    const timeline = new StudioBg3dCommandTimeline(INITIAL);

    timeline.commit(command);
    expect(timeline.readState().labels).toEqual(["wall"]);
  });
});
