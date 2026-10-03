// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { idbKvGet, idbKvSet } from "./idb-kv";
import { idbJsonStorage, idbStateStorage } from "./idb-json-storage";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("idbStateStorage", () => {
  it("쓰기는 IDB로 가고 localStorage에는 남지 않는다", async () => {
    await idbStateStorage.setItem("k", "v");
    await expect(idbKvGet("k")).resolves.toBe("v");
    expect(localStorage.getItem("k")).toBeNull();
    await expect(idbStateStorage.getItem("k")).resolves.toBe("v");
  });

  it("첫 읽기가 구 localStorage 값을 이관한다 (데이터 보존)", async () => {
    localStorage.setItem("legacy-key", "legacy-value");
    await expect(idbStateStorage.getItem("legacy-key")).resolves.toBe("legacy-value");
    await expect(idbKvGet("legacy-key")).resolves.toBe("legacy-value");
    expect(localStorage.getItem("legacy-key")).toBeNull();
  });

  it("삭제는 양쪽 저장소에서 모두 지운다", async () => {
    await idbKvSet("gone", "1");
    localStorage.setItem("gone", "1");
    await idbStateStorage.removeItem("gone");
    await expect(idbKvGet("gone")).resolves.toBeNull();
    expect(localStorage.getItem("gone")).toBeNull();
  });

  it("IndexedDB를 못 쓰면 localStorage 폴백으로 동등하게 동작한다", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await idbStateStorage.setItem("fb", "fallback-value");
    expect(localStorage.getItem("fb")).toBe("fallback-value");
    await expect(idbStateStorage.getItem("fb")).resolves.toBe("fallback-value");
    await idbStateStorage.removeItem("fb");
    expect(localStorage.getItem("fb")).toBeNull();
  });
});

describe("zustand persist 통합", () => {
  interface CounterState {
    count: number;
    inc: () => void;
  }

  function createCounterStore() {
    return create<CounterState>()(
      persist(
        (set) => ({
          count: 0,
          inc: () => set((state) => ({ count: state.count + 1 })),
        }),
        { name: "counter-v1", storage: idbJsonStorage },
      ),
    );
  }

  it("구 localStorage 페이로드가 하이드레이션으로 보존된다", async () => {
    localStorage.setItem(
      "counter-v1",
      JSON.stringify({ state: { count: 41 }, version: 0 }),
    );
    const store = createCounterStore();
    await store.persist.rehydrate();
    expect(store.getState().count).toBe(41);
    // 이관이 끝났으니 구 키는 사라지고 IDB가 정본이다.
    expect(localStorage.getItem("counter-v1")).toBeNull();
    const persisted = await idbKvGet("counter-v1");
    expect(persisted).toContain("\"count\":41");
  });

  it("변경 사항이 IDB에 영속되고 새 스토어가 복원한다", async () => {
    const first = createCounterStore();
    await first.persist.rehydrate();
    first.getState().inc();
    first.getState().inc();
    // persist 쓰기는 비동기 — IDB에 도달할 때까지 잠깐 기다린다.
    await vi.waitFor(async () => {
      expect(await idbKvGet("counter-v1")).toContain("\"count\":2");
    });
    const second = createCounterStore();
    await second.persist.rehydrate();
    expect(second.getState().count).toBe(2);
  });
});
