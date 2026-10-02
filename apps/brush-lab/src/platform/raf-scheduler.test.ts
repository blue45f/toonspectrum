import { describe, expect, it } from "vitest";

import { FrameScheduler } from "./raf-scheduler";

import type { RawSample } from "../engine/core/types";

function sample(x: number): RawSample {
  return {
    x,
    y: 0,
    tMs: x,
    pressure: 0.5,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    pointerType: "pen",
    phase: "move",
    source: "raw",
  };
}

/** 가짜 rAF: 콜백을 쌓아두고 `tick()`으로 한 프레임씩 실행한다. */
function fakeRaf() {
  const queue = new Map<number, (t: number) => void>();
  let next = 1;
  let cancelled = 0;
  return {
    raf: (cb: (t: number) => void): number => {
      const id = next;
      next += 1;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number): void => {
      if (queue.delete(id)) cancelled += 1;
    },
    tick(t = 0): number {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(t);
      return cbs.length;
    },
    get requested() {
      return queue.size;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

describe("FrameScheduler", () => {
  it("여러 번 enqueue해도 프레임당 flush는 정확히 1회이며 배치는 누적 순서를 유지한다", () => {
    const fr = fakeRaf();
    let now = 100;
    const sched = new FrameScheduler(fr.raf, { now: () => now }, fr.caf);
    const calls: { batch: RawSample[]; t: number }[] = [];
    sched.onFrame((batch, t) => calls.push({ batch, t }));
    sched.enqueue([sample(1), sample(2)]);
    sched.enqueue([sample(3)]);
    sched.enqueue([]);
    expect(fr.requested).toBe(1);
    expect(sched.pendingCount()).toBe(3);
    expect(fr.tick()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.batch.map((s) => s.x)).toEqual([1, 2, 3]);
    expect(calls[0]?.t).toBe(100);
    expect(sched.pendingCount()).toBe(0);
    // 큐가 비어 있으면 추가 프레임 예약 없음
    expect(fr.requested).toBe(0);
    now = 116;
    sched.enqueue([sample(4)]);
    fr.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.t).toBe(116);
    expect(sched.frames()).toBe(2);
  });

  it("stop 이후에는 예약을 취소하고 어떤 콜백도 호출하지 않는다", () => {
    const fr = fakeRaf();
    const sched = new FrameScheduler(fr.raf, { now: () => 0 }, fr.caf);
    let calls = 0;
    sched.onFrame(() => {
      calls += 1;
    });
    sched.enqueue([sample(1)]);
    sched.stop();
    expect(fr.cancelled).toBe(1);
    expect(fr.tick()).toBe(0);
    sched.enqueue([sample(2)]);
    expect(fr.requested).toBe(0);
    expect(calls).toBe(0);
  });

  it("rAF가 없으면 생성 시 명시적으로 실패한다", () => {
    const original = globalThis.requestAnimationFrame;
    Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    try {
      expect(() => new FrameScheduler(undefined, { now: () => 0 })).toThrow(/requestAnimationFrame/);
    } finally {
      if (original) globalThis.requestAnimationFrame = original;
    }
  });
});
