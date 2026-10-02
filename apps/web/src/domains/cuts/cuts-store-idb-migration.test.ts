/**
 * 컷츠 스토어 IndexedDB 이관 테스트 —
 * 구 localStorage 클립·좋아요 기록이 첫 읽기에 IDB로 이관돼 보존되는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "../../shared/lib/idb-kv";
import { useCutsStore } from "./cuts-store";

const STORAGE_KEY = "toonstudio-cuts-store-v1";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    clips: [{ id: "legacy-clip-1" }],
    likedClipIds: ["legacy-clip-1"],
    viewedClipIds: ["legacy-clip-1"],
    pendingSync: [],
    remixPolicyOverrides: {},
    viewEvents: [],
  },
  version: 0,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("cuts IDB 이관", () => {
  it("구 localStorage 기록이 하이드레이션으로 보존되고 구 키가 제거된다", async () => {
    localStorage.setItem(STORAGE_KEY, LEGACY_PAYLOAD);
    await useCutsStore.persist.rehydrate();

    const state = useCutsStore.getState();
    expect(state.clips.map((clip) => clip.id)).toEqual(["legacy-clip-1"]);
    expect(state.likedClipIds).toEqual(["legacy-clip-1"]);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expect(idbKvGet(STORAGE_KEY)).resolves.toBe(LEGACY_PAYLOAD);
  });

  it("초기화 쓰기는 IDB에만 남고 localStorage에는 키가 생기지 않는다", async () => {
    useCutsStore.getState().resetForTests();
    await vi.waitFor(async () => {
      expect(await idbKvGet(STORAGE_KEY)).not.toBeNull();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
