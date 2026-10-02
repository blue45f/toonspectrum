/**
 * 타임랩스 공유 스토어(기본 인스턴스) IndexedDB 이관 테스트 —
 * 구 localStorage 페이로드(공유 클립)가 첫 하이드레이션에서
 * IndexedDB로 옮겨지고 상태가 그대로 복원되는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "@/shared/lib/idb-kv";

import { TIMELAPSE_SHARE_STORAGE_KEY, useTimelapseShareStore } from "./timelapse-share-store";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    clips: [
      {
        id: "clip-legacy",
        title: "이관 전 클립",
        description: "그리기 과정",
        visibility: "public",
        width: 800,
        height: 1000,
        durationSec: 42,
        stepCount: 120,
        watermark: true,
        authorName: "레거시 작가",
        authorIsGuest: true,
        ownerKey: "guest:legacy",
        createdAt: "2026-09-01T00:00:00.000Z",
        likes: 7,
        views: 33,
        liked: true,
        thumbnailDataUrl: "",
      },
    ],
    viewedClipIds: ["clip-legacy"],
  },
  version: 1,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("타임랩스 공유 스토어 IDB 이관", () => {
  it("구 localStorage 클립이 IDB로 이관되고 상태가 복원된다", async () => {
    // 모듈 로드 시 시작된 자동 하이드레이션이 끝난 뒤에 시드해야
    // 늦게 도착한 빈 결과가 이관 결과를 덮지 않는다.
    await vi.waitFor(() => {
      expect(useTimelapseShareStore.persist.hasHydrated()).toBe(true);
    });
    localStorage.setItem(TIMELAPSE_SHARE_STORAGE_KEY, LEGACY_PAYLOAD);

    await useTimelapseShareStore.persist.rehydrate();

    const state = useTimelapseShareStore.getState();
    expect(state.clips.map((clip) => clip.id)).toEqual(["clip-legacy"]);
    expect(state.clips[0]?.likes).toBe(7);
    expect(state.viewedClipIds).toEqual(["clip-legacy"]);
    expect(localStorage.getItem(TIMELAPSE_SHARE_STORAGE_KEY)).toBeNull();
    await vi.waitFor(async () => {
      const persisted = await idbKvGet(TIMELAPSE_SHARE_STORAGE_KEY);
      expect(persisted).toContain("clip-legacy");
    });
  });
});
