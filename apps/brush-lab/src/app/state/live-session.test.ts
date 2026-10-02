// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { presetById } from "../../engine/presets/catalog";
import { createCpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createMockLane, mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveStrokeResult } from "./live-session";
import type { BrushEngineLane } from "../../lanes/lane";
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

/** 외부에서 resolve/reject하는 약속(init 진행 중 상태를 붙잡아 두는 용도). */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface MakeSessionOptions {
  failAddSamples?: boolean;
  /** 두 번째로 만든 레인(clear가 만드는 새 레인)의 init을 이 약속이 끝날 때까지 붙잡는다. */
  holdSecondInit?: Promise<void>;
}

async function makeSession(opts: MakeSessionOptions = {}) {
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
      if (opts.holdSecondInit && lanes.length === 1) {
        const hold = opts.holdSecondInit;
        const originalInit = lane.init.bind(lane);
        lane.init = async (laneEnv, config) => {
          await hold;
          return originalInit(laneEnv, config);
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

  it("clear의 새 레인 init 중에 dispose되면 새 레인도 해제하고 이전 레인을 두 번 해제하지 않는다(누수 방지)", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    // 이전 레인은 해제됐고 새 레인은 만들어졌으나 init이 끝나지 않았다.
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.at(-1)).toBe("dispose");
    expect(s.lanes[1]?.calls).toEqual([]);
    session(s).dispose();
    gate.resolve();
    await clearing;
    // 새 레인은 init을 마친 뒤 곧바로 해제되고, 세션에 대입되지 않는다.
    expect(s.lanes[1]?.calls).toEqual(["init", "dispose"]);
    expect(session(s).currentLane).toBe(s.lanes[0]);
    // 이미 해제된 이전 레인을 dispose()가 다시 해제하지 않는다.
    expect(s.lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
    expect(s.errors).toEqual([]);
  });

  it("clear 중에 들어온 표본은 해제된 이전 레인이 아니라 새 레인이 준비된 뒤 새 레인에 적용된다", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    // 새 레인 init이 진행되는 동안 한 획 전체가 들어온다.
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 6, clientY: 6, timeStamp: 20 }));
    expect(s.fr.tick()).toBe(1);
    await flush();
    // 아직 새 레인이 준비되지 않았으므로 어떤 레인도 표본을 받지 않고 오류도 없다(보류).
    expect(s.errors).toEqual([]);
    expect(s.results).toHaveLength(0);
    expect(s.lanes[0]?.calls).not.toContain("beginStroke");
    gate.resolve();
    await clearing;
    await flush();
    expect(s.errors).toEqual([]);
    expect(s.results).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("beginStroke");
    expect(s.lanes[1]?.calls).toEqual(expect.arrayContaining(["init", "beginStroke", "addSamples", "endStroke", "readback"]));
    expect(session(s).currentLane).toBe(s.lanes[1]);
    session(s).dispose();
    expect(s.lanes[1]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("clear의 새 레인 init이 실패하면 호출자에게 던지고, 이후 입력은 체인을 끊지 않고 onError로 드러난다", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    gate.reject(new Error("새 레인 init 실패"));
    await expect(clearing).rejects.toThrow("새 레인 init 실패");
    // 세션은 해제된 이전 레인을 그대로 들고 있으므로 다음 획은 무음 성공이 아니라 오류로 드러나야 한다.
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(0);
    // init에 실패한 새 레인은 아무도 가리키지 않으므로 세션이 해제한다(누수 방지).
    expect(s.lanes[1]?.calls).toContain("dispose");
    session(s).dispose();
    expect(s.lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("create의 레인 init이 실패하면 방금 만든 레인을 해제하고 오류를 그대로 던진다", async () => {
    const env = mockEnvironment();
    const lanes: MockLane[] = [];
    const err = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createMockLane({ id: "cpu-reference", failInit: "adapter-unavailable" });
        lanes.push(lane);
        return lane;
      },
      env,
      program: presetById("pencil-hb"),
      seed: 7,
      width: 32,
      height: 32,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "adapter-unavailable" });
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.calls).toEqual(["init", "dispose"]);
  });

  /** 실제 CPU 참조 레인으로 세션을 만든다. 첫 레인의 첫 `addSamples`만 던진다(MockLane이 아니라 beginStroke 상태를 강제하는 실제 레인). */
  async function makeRealLaneSession(failFirstAddSamples: boolean) {
    const fr = fakeRaf();
    const env = mockEnvironment();
    const lanes: BrushEngineLane[] = [];
    const results: LiveStrokeResult[] = [];
    const errors: unknown[] = [];
    const session = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createCpuReferenceLane();
        if (failFirstAddSamples && lanes.length === 0) {
          const original = lane.addSamples.bind(lane);
          let failed = false;
          lane.addSamples = (samples) => {
            if (!failed) {
              failed = true;
              throw new Error("boom");
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
      onStrokeEnd: (res) => results.push(res),
      onError: (error) => errors.push(error),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    session.attach(el);
    return { fr, session, lanes, results, errors, el };
  }

  it("획 도중 addSamples가 한 번 실패해도 실제 레인에서 다음 획이 성공한다(레인이 획 도중 상태로 남지 않는다)", async () => {
    const s = await makeRealLaneSession(true);
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(String(s.errors[0])).toContain("boom");
    // 획 밖의 up은 폐기, 이어지는 새 획은 새 레인이 받는다.
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.fr.tick();
    await flush();
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    s.fr.tick();
    await flush();
    // 이전 구현은 여기서 'beginStroke: 이전 획이 endStroke되지 않았다'로 영구히 실패했다.
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(1);
    expect(s.lanes).toHaveLength(2);
    expect(s.session.currentLane).toBe(s.lanes[1]);
    s.session.dispose();
  });

  it("레인 교체가 실패하면 그 오류도 onError로 드러내고, 세션은 체인을 끊지 않는다", async () => {
    const fr = fakeRaf();
    const env = mockEnvironment();
    const lanes: MockLane[] = [];
    const errors: unknown[] = [];
    const session = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createMockLane({ id: "cpu-reference", ...(lanes.length === 1 ? { failInit: "adapter-unavailable" as const } : {}) });
        if (lanes.length === 0) {
          lane.addSamples = () => {
            throw new Error("boom");
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
      onError: (error) => errors.push(error),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    session.attach(el);
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    fr.tick();
    await flush();
    // 원래 오류 + 레인 교체 실패(init 거부) 두 개가 드러나고, 실패한 새 레인은 해제된다.
    expect(errors).toHaveLength(2);
    expect(String(errors[0])).toContain("boom");
    expect(errors[1]).toMatchObject({ code: "adapter-unavailable" });
    expect(lanes[1]?.calls).toEqual(["init", "dispose"]);
    session.dispose();
    expect(lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("endStroke 안의 실패는 레인이 스스로 정리하므로 레인을 교체하지 않는다(문서를 비우지 않는다)", async () => {
    const s = await makeSession();
    const lane = s.lanes[0]!;
    const originalEnd = lane.endStroke.bind(lane);
    let failed = false;
    lane.endStroke = async () => {
      if (failed) return originalEnd();
      failed = true;
      await originalEnd();
      throw new Error("endStroke 실패");
    };
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.lanes).toHaveLength(1);
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(1);
    expect(s.lanes).toHaveLength(1);
    session(s).dispose();
  });
});

function session(s: Awaited<ReturnType<typeof makeSession>>): LiveStrokeSession {
  return s.session;
}
