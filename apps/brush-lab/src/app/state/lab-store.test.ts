import { describe, expect, it } from "vitest";

import { createLabActions, createLabStore, initialLabState } from "./lab-store";

describe("labStore", () => {
  it("set은 얕은 병합이며 변경이 없으면 구독자를 깨우지 않는다", () => {
    const store = createLabStore();
    let wakes = 0;
    const unsubscribe = store.subscribe(() => {
      wakes += 1;
    });
    store.set({ tab: "gallery" });
    expect(store.get().tab).toBe("gallery");
    expect(wakes).toBe(1);
    store.set({ tab: "gallery" });
    expect(wakes).toBe(1);
    store.set((prev) => ({ seed: prev.seed + 1 }));
    expect(store.get().seed).toBe(2);
    expect(wakes).toBe(2);
    unsubscribe();
    store.set({ tab: "report" });
    expect(wakes).toBe(2);
  });

  it("액션: 프리셋 변경은 오버라이드를 비우고, 오류는 순번을 붙이며, capability는 레인별로 갱신된다", () => {
    const store = createLabStore();
    const actions = createLabActions(store);
    actions.setOverride({ sizePx: 20 });
    actions.setOverride({ hardness: 0.3 });
    expect(store.get().overrides).toEqual({ sizePx: 20, hardness: 0.3 });
    actions.setPreset("ink-g-pen");
    expect(store.get().presetId).toBe("ink-g-pen");
    expect(store.get().overrides).toEqual({});

    actions.pushError({ laneId: "webgpu-compute", code: "webgpu-api-unavailable", message: "없음" });
    actions.pushError({ laneId: null, code: "worker-error", message: "실패" });
    expect(store.get().errors.map((e) => e.seq)).toEqual([1, 2]);
    actions.clearErrors();
    expect(store.get().errors).toEqual([]);

    actions.setCapability("cpu-reference", {
      laneId: "cpu-reference",
      status: "supported",
      reasons: [],
      adapterInfo: null,
      features: [],
      limits: {},
      softwareRenderer: null,
    });
    expect(store.get().capability["cpu-reference"]?.status).toBe("supported");
    expect(store.get().capability["webgpu-compute"]).toBeNull();

    actions.setLane("b", "canvas2d");
    expect(store.get().laneB).toBe("canvas2d");
    actions.setFixture("spiral");
    expect(store.get().fixtureId).toBe("spiral");
    expect(store.get().fixtureSource).toBe("builtin");
  });

  it("reset은 초기 상태로 되돌리고 초기값 재정의를 받는다", () => {
    const store = createLabStore({ tab: "report" });
    expect(store.get().tab).toBe("report");
    store.reset();
    expect(store.get()).toEqual(initialLabState());
  });
});
