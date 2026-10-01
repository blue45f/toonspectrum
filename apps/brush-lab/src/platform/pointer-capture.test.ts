// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { attachPointerCapture, splitPredicted } from "./pointer-capture";

import type { RawSample } from "../engine/core/types";

interface SyntheticInit extends PointerEventInit {
  timeStamp?: number;
  coalesced?: PointerEvent[];
  predicted?: PointerEvent[];
}

/** jsdom PointerEvent에 coalesced/predicted·timeStamp를 모의로 붙인다. */
function pointerEvent(type: string, init: SyntheticInit = {}): PointerEvent {
  const { timeStamp, coalesced, predicted, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.5,
    ...rest,
  });
  if (typeof timeStamp === "number") {
    Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  }
  if (coalesced) {
    Object.defineProperty(ev, "getCoalescedEvents", { value: () => coalesced });
  }
  if (predicted) {
    Object.defineProperty(ev, "getPredictedEvents", { value: () => predicted });
  }
  return ev;
}

function setup(opts?: Parameters<typeof attachPointerCapture>[2]) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const batches: RawSample[][] = [];
  const detach = attachPointerCapture(el, (raw) => batches.push(raw), opts);
  return { el, batches, detach };
}

describe("attachPointerCapture", () => {
  it("pointerdown은 down 표본 1개, coalesced는 마지막만 raw, predicted는 predicted로 태깅한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 20, timeStamp: 100 }));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      expect.objectContaining({ x: 10, y: 20, tMs: 100, phase: "down", source: "raw", pointerType: "pen" }),
    ]);

    const c1 = pointerEvent("pointermove", { clientX: 11, clientY: 21, timeStamp: 104, pressure: 0.6 });
    const c2 = pointerEvent("pointermove", { clientX: 12, clientY: 22, timeStamp: 108, pressure: 0.7 });
    const p1 = pointerEvent("pointermove", { clientX: 13, clientY: 23, timeStamp: 116, pressure: 0.7 });
    el.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 12,
        clientY: 22,
        timeStamp: 108,
        pressure: 0.7,
        coalesced: [c1, c2],
        predicted: [p1],
      }),
    );
    expect(batches).toHaveLength(2);
    const move = batches[1] ?? [];
    expect(move.map((s) => [s.source, s.phase, s.x])).toEqual([
      ["coalesced", "move", 11],
      ["raw", "move", 12],
      ["predicted", "move", 13],
    ]);
    const split = splitPredicted(move);
    expect(split.canonical).toHaveLength(2);
    expect(split.predicted).toHaveLength(1);
    detach();
  });

  it("pointerup은 phase up 표본 1개이며 마지막 접촉 압력을 쓴다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0, pressure: 0.4 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, pressure: 0.8 }));
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 6, clientY: 6, pressure: 0 }));
    const last = batches[batches.length - 1] ?? [];
    expect(last).toHaveLength(1);
    expect(last[0]).toEqual(expect.objectContaining({ phase: "up", source: "raw", x: 6, tiltXDeg: 0 }));
    // jsdom은 pressure를 float32로 저장하므로 근사 비교한다.
    expect(last[0]?.pressure).toBeCloseTo(0.8, 5);
    detach();
  });

  it("getCoalescedEvents가 없으면 pointermove 1개를 raw 표본 1개로 넘긴다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 3, clientY: 4 }));
    expect(batches[1]).toEqual([expect.objectContaining({ x: 3, y: 4, source: "raw", phase: "move" })]);
    detach();
  });

  it("다른 포인터와 pen 직후 touch(팜)는 무시하고 primary 포인터 하나만 획을 소유한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, timeStamp: 1000 }));
    // 다른 pointerId의 move는 무시
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 99, clientY: 99, timeStamp: 1001 }));
    expect(batches).toHaveLength(1);
    el.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, timeStamp: 1002 }));
    expect(batches).toHaveLength(2);
    // pen 이후 500 ms 이내 touch down은 손바닥으로 보고 무시
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 3, pointerType: "touch", timeStamp: 1200 }));
    expect(batches).toHaveLength(2);
    // 접촉폭 20 px 이상 touch도 무시
    el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", width: 24, timeStamp: 3000 }),
    );
    expect(batches).toHaveLength(2);
    // 충분히 지난 뒤의 작은 touch는 허용
    el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 5, pointerType: "touch", width: 4, timeStamp: 3001 }),
    );
    expect(batches).toHaveLength(3);
    expect(batches[2]?.[0]?.pointerType).toBe("touch");
    detach();
  });

  it("호버는 onHover로만 전달되고 표본을 만들지 않으며 detach 후에는 아무 콜백도 없다", () => {
    const hovers: [number, number][] = [];
    const { el, batches, detach } = setup({ onHover: (x, y) => hovers.push([x, y]) });
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 7, clientY: 8, buttons: 0 }));
    expect(hovers).toEqual([[7, 8]]);
    expect(batches).toHaveLength(0);
    expect(el.style.touchAction).toBe("none");
    detach();
    expect(el.style.touchAction).toBe("");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(batches).toHaveLength(0);
  });

  it("logicalSize가 주어지면 요소 좌표를 논리 캔버스 좌표로 변환한다", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { logicalSize: { width: 400, height: 200 } });
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 150, clientY: 100 }));
    expect(batches[0]?.[0]).toEqual(expect.objectContaining({ x: 100, y: 100 }));
    detach();
  });
});
