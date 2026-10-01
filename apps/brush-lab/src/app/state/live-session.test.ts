// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { presetById } from "../../engine/presets/catalog";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createMockLane, mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveStrokeResult } from "./live-session";
import type { PreviewPoint } from "../../platform/canvas-present";
import type { MockLane } from "../testing/mock-lane";

/** 가짜 rAF: `tick()`으로 한 프레임씩 실행한다. */
function fakeRaf() {
  const queue = new Map<number, (t: number) => void>();
  let next = 1;
  return {
    raf: (cb: (t: number) => void): number => {
      const id = next;
      next += 1;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number): void => {
      queue.delete(id);
    },
    tick(): number {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(0);
      return cbs.length;
    },
  };
}

interface SyntheticInit extends PointerEventInit {
  timeStamp?: number;
  predicted?: PointerEvent[];
}

function pointerEvent(type: string, init: SyntheticInit = {}): PointerEvent {
  const { timeStamp, predicted, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.5,
    ...rest,
  });
  if (typeof timeStamp === "number") Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  if (predicted) Object.defineProperty(ev, "getPredictedEvents", { value: () => predicted });
  return ev;
}

/** 마이크로태스크 체인이 비워질 때까지 기다린다. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

async function makeSession(opts: { failAddSamples?: boolean } = {}) {
  const fr = fakeRaf();
  const env = mockEnvironment();
  const lanes: MockLane[] = [];
  const previews: PreviewPoint[][] = [];
  const canonical: number[] = [];
  const results: LiveStrokeResult[] = [];
  const errors: unknown[] = [];
  const session = await LiveStrokeSession.create({
    createLane: () => {
      const lane = createMockLane({ id: "cpu-reference" });
      if (opts.failAddSamples && lanes.length === 0) {
        const original = lane.addSamples.bind(lane);
        let failed = false;
        lane.addSamples = (samples) => {
          if (!failed) {
            failed = true;
            throw new Error("레인 addSamples 실패");
          }
          return original(samples);
        };
      }
      lanes.push(lane);
      return lane;
    },
    env,
    program: presetById("pencil-hb"),
    seed: 7,
    width: 32,
    height: 32,
    scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
    onPreview: (points) => previews.push(points),
    onCanonical: (samples) => canonical.push(samples.length),
    onStrokeEnd: (res) => results.push(res),
    onError: (error) => errors.push(error),
  });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const detach = session.attach(el);
  return { fr, session, lanes, previews, canonical, results, errors, el, detach };
}

describe("LiveStrokeSession", () => {
  it("예측 표본은 onPreview로만 가고 정본 표본은 프레임당 addSamples 1회로 레인에 들어가며 up에서 획을 끝낸다", async () => {
    const s = await makeSession();
    expect(s.lanes).toHaveLength(1);
    expect(s.lanes[0]?.calls).toEqual(["init"]);
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    const p = pointerEvent("pointermove", { clientX: 9, clientY: 9, timeStamp: 30 });
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, timeStamp: 20, predicted: [p] }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 6, clientY: 6, timeStamp: 24 }));
    // 이벤트 3개 → 정본 3개(down, move, move), 예측 1개는 미리보기에만
    expect(s.canonical).toEqual([1, 1, 1]);
    expect(s.previews.at(-1)).toEqual([]);
    expect(s.previews.some((pts) => pts.length === 1 && pts[0]?.x === 9)).toBe(true);
    expect(s.lanes[0]?.calls.filter((c) => c === "addSamples")).toHaveLength(0);
    expect(s.fr.tick()).toBe(1);
    await flush();
    const lane = s.lanes[0]!;
    expect(lane.calls.filter((c) => c === "beginStroke")).toHaveLength(1);
    expect(lane.calls.filter((c) => c === "addSamples")).toHaveLength(1);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 7, clientY: 7, timeStamp: 40 }));
    s.fr.tick();
    await flush();
    expect(lane.calls.filter((c) => c === "addSamples")).toHaveLength(2);
    expect(lane.calls).toContain("endStroke");
    expect(lane.calls).toContain("readback");
    expect(s.results).toHaveLength(1);
    const res = s.results[0]!;
    expect(res.samples.map((x) => x.phase)).toEqual(["down", "move", "move", "up"]);
    expect(res.samples.every((x) => x.source !== "predicted")).toBe(true);
    expect(res.seed).toBe(7);
    expect(res.image.width).toBe(32);
    expect(res.receipt.dabCount).toBe(4);
    expect(res.frames).toHaveLength(2);
    expect(session(s).strokes).toBe(1);
    expect(s.errors).toEqual([]);
    // 획 밖의 move 잔여는 폐기된다(새 획 시작 없음)
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 1, timeStamp: 50 }));
    s.fr.tick();
    await flush();
    expect(lane.calls.filter((c) => c === "beginStroke")).toHaveLength(1);
    s.detach();
    session(s).dispose();
    expect(lane.calls.at(-1)).toBe("dispose");
  });

  it("같은 프레임에 up과 새 down이 오면 획 경계에서 배치를 나눠 두 획으로 처리한다", async () => {
    const s = await makeSession();
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    expect(s.fr.tick()).toBe(1);
    await flush();
    expect(s.results).toHaveLength(2);
    expect(s.results.map((r) => r.seed)).toEqual([7, 8]);
    expect(s.lanes[0]?.calls.filter((c) => c === "beginStroke")).toHaveLength(2);
    session(s).dispose();
  });

  it("레인 오류는 onError로 드러나고 세션은 다음 획을 받을 수 있다", async () => {
    const s = await makeSession({ failAddSamples: true });
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(0);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.fr.tick();
    await flush();
    // 획 밖의 up은 폐기, 새 down부터 다시 받는다
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    s.fr.tick();
    await flush();
    expect(s.results).toHaveLength(1);
    expect(s.errors).toHaveLength(1);
    session(s).dispose();
  });

  it("clear는 레인을 버리고 새로 init하며, dispose 뒤에는 입력이 무시된다", async () => {
    const s = await makeSession();
    await session(s).clear();
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.at(-1)).toBe("dispose");
    expect(s.lanes[1]?.calls).toEqual(["init"]);
    expect(session(s).currentLane).toBe(s.lanes[1]);
    session(s).dispose();
    expect(s.lanes[1]?.calls.at(-1)).toBe("dispose");
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    expect(s.fr.tick()).toBe(0);
    expect(s.canonical).toEqual([]);
  });
});

function session(s: Awaited<ReturnType<typeof makeSession>>): LiveStrokeSession {
  return s.session;
}
