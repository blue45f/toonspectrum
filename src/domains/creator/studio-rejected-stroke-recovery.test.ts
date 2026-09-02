import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_REJECTED_STROKE_RECOVERY_LIMIT,
  dismissStudioRejectedStroke,
  getStudioRejectedStrokeRecords,
  planStudioRejectedStrokeSalvage,
  recordStudioRejectedStroke,
  resetStudioRejectedStrokeRecovery,
  restoreStudioRejectedStroke,
  setStudioRejectedStrokeRestorer,
  subscribeStudioRejectedStrokeRecovery,
} from "./studio-rejected-stroke-recovery";

import type { DrawEl } from "./studio-element-model";

function drawEl(overrides: Partial<DrawEl> & { id: string }): DrawEl {
  return {
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [0, 0, 10, 10, 20, 18],
    pressures: [0.5, 0.5, 0.5],
    stroke: "#111827",
    strokeWidth: 6,
    ...overrides,
  } as DrawEl;
}

afterEach(() => {
  resetStudioRejectedStrokeRecovery();
});

describe("planStudioRejectedStrokeSalvage", () => {
  it("salvages a complete pen stroke for every provider failure reason", () => {
    const stroke = drawEl({ id: "s1" });
    for (const reason of [
      "device-lost",
      "surface-lost",
      "timeout",
      "request-failed",
      "frame-invalid",
      "canonical-commit-failed",
      "final-seal-missing",
      "unavailable/runtime-rejected",
    ]) {
      expect(planStudioRejectedStrokeSalvage({ stroke, reason, recordedIds: new Set() })).toEqual({
        action: "salvage",
        strokeId: "s1",
      });
    }
  });

  it("keeps user and tool cancellations as discards", () => {
    const stroke = drawEl({ id: "s1" });
    for (const reason of ["cancelled", "canonical-commit-cancelled", "pointercancel"]) {
      expect(planStudioRejectedStrokeSalvage({ stroke, reason, recordedIds: new Set() })).toEqual({
        action: "discard",
        reason: "cancelled",
      });
    }
  });

  it("discards marks that would never have entered history", () => {
    expect(
      planStudioRejectedStrokeSalvage({ stroke: null, reason: "device-lost", recordedIds: new Set() }),
    ).toEqual({ action: "discard", reason: "no-stroke" });
    expect(
      planStudioRejectedStrokeSalvage({
        stroke: drawEl({ id: "dot", points: [4, 4] }),
        reason: "device-lost",
        recordedIds: new Set(),
      }),
    ).toEqual({ action: "salvage", strokeId: "dot" });
    expect(
      planStudioRejectedStrokeSalvage({
        stroke: drawEl({ id: "short-line", kind: "line", points: [0, 0, 1, 1] }),
        reason: "device-lost",
        recordedIds: new Set(),
      }),
    ).toEqual({ action: "discard", reason: "incomplete-stroke" });
  });

  it("is idempotent per stroke id", () => {
    const stroke = drawEl({ id: "s1" });
    expect(
      planStudioRejectedStrokeSalvage({ stroke, reason: "timeout", recordedIds: new Set(["s1"]) }),
    ).toEqual({ action: "discard", reason: "already-recorded" });
  });
});

describe("rejected stroke recovery store", () => {
  it("records newest first, notifies subscribers, and ignores repeats", () => {
    const listener = vi.fn();
    subscribeStudioRejectedStrokeRecovery(listener);

    expect(
      recordStudioRejectedStroke({
        stroke: drawEl({ id: "a" }),
        pageId: "p1",
        provider: "WebGPU 라이브 잉크",
        reason: "timeout",
        at: 1,
      }),
    ).toEqual({ action: "salvage", strokeId: "a" });
    expect(
      recordStudioRejectedStroke({
        stroke: drawEl({ id: "b" }),
        pageId: "p1",
        provider: "습식 매체",
        reason: "unavailable/runtime-rejected",
        at: 2,
      }),
    ).toEqual({ action: "salvage", strokeId: "b" });
    // The pointer-up cancellation reports the same stroke a second time: no duplicate record.
    expect(
      recordStudioRejectedStroke({
        stroke: drawEl({ id: "a" }),
        pageId: "p1",
        provider: "WebGPU 라이브 잉크",
        reason: "device-lost",
        at: 3,
      }),
    ).toEqual({ action: "discard", reason: "already-recorded" });

    const records = getStudioRejectedStrokeRecords();
    expect(records.map((record) => record.id)).toEqual(["b", "a"]);
    expect(records[1]).toMatchObject({ provider: "WebGPU 라이브 잉크", reason: "timeout", at: 1 });
    expect(Object.isFrozen(records)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("drops the oldest record beyond the limit", () => {
    for (let index = 0; index < STUDIO_REJECTED_STROKE_RECOVERY_LIMIT + 3; index += 1) {
      recordStudioRejectedStroke({
        stroke: drawEl({ id: `s${index}` }),
        pageId: "p1",
        provider: "WebGPU 라이브 잉크",
        reason: "timeout",
        at: index,
      });
    }
    const records = getStudioRejectedStrokeRecords();
    expect(records).toHaveLength(STUDIO_REJECTED_STROKE_RECOVERY_LIMIT);
    expect(records[0]?.id).toBe(`s${STUDIO_REJECTED_STROKE_RECOVERY_LIMIT + 2}`);
    expect(records.some((record) => record.id === "s0")).toBe(false);
  });

  it("restores only through the registered restorer and keeps refused records", () => {
    recordStudioRejectedStroke({
      stroke: drawEl({ id: "a" }),
      pageId: "p1",
      provider: "WebGPU 라이브 잉크",
      reason: "device-lost",
      at: 1,
    });

    expect(restoreStudioRejectedStroke("a")).toEqual({ status: "unavailable", recordId: "a" });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(1);

    const restorer = vi.fn((record: { id: string; pageId: string }) =>
      record.pageId === "p1"
        ? ({ status: "restored", recordId: record.id, restoredStrokeId: `${record.id}-restored` } as const)
        : ({ status: "refused", recordId: record.id, reason: "다른 페이지" } as const));
    const unregister = setStudioRejectedStrokeRestorer(restorer);

    expect(restoreStudioRejectedStroke("missing")).toMatchObject({ status: "refused" });
    expect(restoreStudioRejectedStroke("a")).toEqual({
      status: "restored",
      recordId: "a",
      restoredStrokeId: "a-restored",
    });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(0);
    expect(restorer).toHaveBeenCalledTimes(1);

    recordStudioRejectedStroke({
      stroke: drawEl({ id: "other-page" }),
      pageId: "p2",
      provider: "WebGPU 라이브 잉크",
      reason: "device-lost",
      at: 2,
    });
    expect(restoreStudioRejectedStroke("other-page")).toMatchObject({ status: "refused" });
    expect(getStudioRejectedStrokeRecords()).toHaveLength(1);

    unregister();
    expect(restoreStudioRejectedStroke("other-page")).toEqual({
      status: "unavailable",
      recordId: "other-page",
    });
  });

  it("dismisses explicitly and tolerates unknown ids", () => {
    const listener = vi.fn();
    recordStudioRejectedStroke({
      stroke: drawEl({ id: "a" }),
      pageId: "p1",
      provider: "WebGPU 라이브 잉크",
      reason: "timeout",
    });
    subscribeStudioRejectedStrokeRecovery(listener);
    dismissStudioRejectedStroke("nope");
    expect(listener).not.toHaveBeenCalled();
    dismissStudioRejectedStroke("a");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStudioRejectedStrokeRecords()).toEqual([]);
  });
});
