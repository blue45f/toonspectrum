/**
 * engagement 스토어 IndexedDB 이관 테스트 —
 * 구 localStorage 페이로드(알림·독서 일기)가 첫 하이드레이션에서
 * IndexedDB로 옮겨지고 상태가 그대로 복원되는지 검증한다.
 * 알림·일기는 계속 쌓이는 기록이라 유실이 곧 사용자 데이터 손실이다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "@/shared/lib/idb-kv";

import { useEngagement } from "./engagement-store";

const STORAGE_KEY = "toonstudio-engagement-v1";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    notifications: [
      {
        id: "notice-legacy",
        category: "system",
        title: "예전 알림",
        body: "이관 전 알림",
        href: "/library",
        createdAt: "2026-09-01T00:00:00.000Z",
        readAt: null,
        archivedAt: null,
        snoozedUntil: null,
        sourceKey: "legacy",
      },
    ],
    diaryEntries: [
      {
        id: "diary-legacy",
        titleId: "title-1",
        episode: 3,
        totalEpisodes: 12,
        readAt: "2026-09-02T00:00:00.000Z",
        mood: "excited",
        note: "이관 전 일기",
        spoiler: false,
        reread: false,
        platformId: null,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    tastePreferences: null,
    availabilityHistory: [],
    growthExperiments: [],
    notificationCategorySettings: {
      release: true,
      availability: true,
      production: true,
      market: true,
      community: true,
      system: true,
    },
  },
  version: 1,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  // resetEngagementData()를 부르지 않는다 — 그 쓰기가 IDB에 빈 페이로드를 먼저
  // 심으면 어댑터의 "IDB 우선" 규칙 때문에 구 원장이 이관되지 않는다.
  // (실사용에서는 스토어 생성 직후의 자동 하이드레이션이 항상 먼저 이관을 수행한다.)
});

describe("engagement 스토어 IDB 이관", () => {
  it("구 localStorage 알림·일기가 IDB로 이관되고 상태가 복원된다", async () => {
    localStorage.setItem(STORAGE_KEY, LEGACY_PAYLOAD);

    await useEngagement.persist.rehydrate();

    const state = useEngagement.getState();
    expect(state.notifications.map((notice) => notice.id)).toEqual(["notice-legacy"]);
    expect(state.diaryEntries.map((entry) => entry.id)).toEqual(["diary-legacy"]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await vi.waitFor(async () => {
      const persisted = await idbKvGet(STORAGE_KEY);
      expect(persisted).toContain("notice-legacy");
      expect(persisted).toContain("diary-legacy");
    });
  });
});
