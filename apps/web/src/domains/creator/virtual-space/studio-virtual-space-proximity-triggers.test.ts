import { describe, expect, it } from "vitest";
import {
  createStudioProximityTracker,
  studioProximityTrackerInside,
  studioProximityTriggerContains,
  updateStudioProximityTracker,
  type StudioProximityTrigger,
} from "./studio-virtual-space-proximity-triggers";

const zone = (overrides: Partial<StudioProximityTrigger> = {}): StudioProximityTrigger => ({
  id: "zone-a",
  point: { x: 100, y: 100 },
  radius: 50,
  kind: "zone",
  cooldownMs: 0,
  ...overrides,
});

describe("studioProximityTriggerContains", () => {
  it("반경 경계(==)는 안쪽으로 판정", () => {
    expect(studioProximityTriggerContains(zone(), { x: 150, y: 100 })).toBe(true);
    expect(studioProximityTriggerContains(zone(), { x: 151, y: 100 })).toBe(false);
  });
});

describe("updateStudioProximityTracker", () => {
  it("진입/이탈 이벤트를 순서대로 발화", () => {
    let tracker = createStudioProximityTracker([zone()]);
    let step = updateStudioProximityTracker(tracker, { x: 0, y: 0 }, 1000);
    expect(step.events).toHaveLength(0);
    tracker = step.state;

    step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 2000);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "enter", at: 2000 }]);
    expect(studioProximityTrackerInside(step.state, "zone-a")).toBe(true);
    tracker = step.state;

    // 안에 머물면 추가 이벤트 없음
    step = updateStudioProximityTracker(tracker, { x: 110, y: 100 }, 3000);
    expect(step.events).toHaveLength(0);

    step = updateStudioProximityTracker(tracker, { x: 0, y: 0 }, 4000);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "exit", at: 4000 }]);
    expect(studioProximityTrackerInside(step.state, "zone-a")).toBe(false);
  });

  it("쿨다운 안의 재진입은 enter를 생략하고 상태만 갱신", () => {
    let tracker = createStudioProximityTracker([zone({ cooldownMs: 10_000 })]);
    tracker = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000).state;
    tracker = updateStudioProximityTracker(tracker, { x: 0, y: 0 }, 2000).state;
    // 쿨다운(10초) 안 재진입 → 이벤트 없음
    const step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 5000);
    expect(step.events).toHaveLength(0);
    expect(studioProximityTrackerInside(step.state, "zone-a")).toBe(true);
    // 이탈해도 미공지 진입이라 exit 없음
    const exit = updateStudioProximityTracker(step.state, { x: 0, y: 0 }, 6000);
    expect(exit.events).toHaveLength(0);
  });

  it("쿨다운이 지나면 재진입 enter 발화", () => {
    let tracker = createStudioProximityTracker([zone({ cooldownMs: 10_000 })]);
    tracker = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000).state;
    tracker = updateStudioProximityTracker(tracker, { x: 0, y: 0 }, 2000).state;
    const step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 12_000);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "enter", at: 12_000 }]);
  });

  it("once 트리거는 최초 1회만 발화", () => {
    let tracker = createStudioProximityTracker([zone({ once: true })]);
    tracker = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000).state;
    tracker = updateStudioProximityTracker(tracker, { x: 0, y: 0 }, 2000).state;
    // exit도 내지 않고, 재진입해도 침묵
    const step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 3000);
    expect(step.events).toHaveLength(0);
    const again = updateStudioProximityTracker(step.state, { x: 0, y: 0 }, 4000);
    expect(again.events).toHaveLength(0);
  });

  it("stay는 체류 임계 후 진입당 1회 발화", () => {
    let tracker = createStudioProximityTracker([zone({ stayAfterMs: 3000 })]);
    tracker = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000).state;
    // 임계 전
    let step = updateStudioProximityTracker(tracker, { x: 105, y: 100 }, 3000);
    expect(step.events).toHaveLength(0);
    // 임계 도달
    step = updateStudioProximityTracker(step.state, { x: 105, y: 100 }, 4500);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "stay", at: 4500 }]);
    // 같은 진입에서 중복 발화 없음
    step = updateStudioProximityTracker(step.state, { x: 105, y: 100 }, 9000);
    expect(step.events).toHaveLength(0);
    // 나갔다 들어오면 다시 발화
    step = updateStudioProximityTracker(step.state, { x: 0, y: 0 }, 10_000);
    expect(step.events[0]?.kind).toBe("exit");
    step = updateStudioProximityTracker(step.state, { x: 100, y: 100 }, 11_000);
    expect(step.events[0]?.kind).toBe("enter");
    step = updateStudioProximityTracker(step.state, { x: 100, y: 100 }, 15_000);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "stay", at: 15_000 }]);
  });

  it("stayAfterMs 미지정이면 stay를 내지 않음", () => {
    let tracker = createStudioProximityTracker([zone()]);
    tracker = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000).state;
    const step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 60_000);
    expect(step.events).toHaveLength(0);
  });

  it("여러 트리거는 독립적으로 판정", () => {
    const triggers = [
      zone({ id: "a", point: { x: 0, y: 0 } }),
      zone({ id: "b", point: { x: 500, y: 500 }, kind: "npc" }),
    ];
    const tracker = createStudioProximityTracker(triggers);
    const step = updateStudioProximityTracker(tracker, { x: 500, y: 500 }, 1000);
    expect(step.events).toEqual([{ triggerId: "b", kind: "enter", at: 1000 }]);
  });

  it("처음부터 안에 있으면 첫 update에서 enter 발화", () => {
    const tracker = createStudioProximityTracker([zone()]);
    const step = updateStudioProximityTracker(tracker, { x: 100, y: 100 }, 1000);
    expect(step.events).toEqual([{ triggerId: "zone-a", kind: "enter", at: 1000 }]);
  });
});
