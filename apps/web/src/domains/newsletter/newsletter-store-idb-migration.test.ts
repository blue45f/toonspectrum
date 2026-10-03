/**
 * 뉴스레터 스토어 IndexedDB 이관 테스트 —
 * 구 localStorage 구독·발행 이력이 첫 읽기에 IDB로 이관돼 보존되는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "../../shared/lib/idb-kv";
import { useNewsletterStore } from "./newsletter-store";

const STORAGE_KEY = "toonstudio-newsletter-v1";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    subscriptions: [
      {
        readerId: "reader-legacy",
        authorName: "김밤하늘",
        cadence: "weekly",
        subscribedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    issues: [],
    sendHistory: [],
    penName: "밤하늘",
  },
  version: 0,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("newsletter IDB 이관", () => {
  it("구 localStorage 구독이 하이드레이션으로 보존되고 구 키가 제거된다", async () => {
    localStorage.setItem(STORAGE_KEY, LEGACY_PAYLOAD);
    await useNewsletterStore.persist.rehydrate();

    const state = useNewsletterStore.getState();
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]?.authorName).toBe("김밤하늘");
    expect(state.penName).toBe("밤하늘");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expect(idbKvGet(STORAGE_KEY)).resolves.toBe(LEGACY_PAYLOAD);
  });

  it("초기화 쓰기는 IDB에만 남고 localStorage에는 키가 생기지 않는다", async () => {
    useNewsletterStore.getState().resetForTests();
    await vi.waitFor(async () => {
      expect(await idbKvGet(STORAGE_KEY)).not.toBeNull();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
