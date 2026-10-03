/**
 * 캐릭터 토크 스토어 IndexedDB 이관 테스트 —
 * 구 localStorage 대화 기록이 첫 읽기에 IDB로 이관돼 보존되는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "../../shared/lib/idb-kv";
import { CHARACTER_CHAT_STORAGE_KEY } from "./character-chat-profile";
import { useCharacterChatStore } from "./character-chat-store";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    profiles: [
      {
        id: "legacy-profile-1",
        characterName: "구름선장",
        workTitle: "구름 항해사",
        isDemo: false,
      },
    ],
    sessions: [],
    usageByProfile: {},
  },
  version: 1,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("character-chat IDB 이관", () => {
  it("구 localStorage 프로필이 하이드레이션으로 보존되고 구 키가 제거된다", async () => {
    localStorage.setItem(CHARACTER_CHAT_STORAGE_KEY, LEGACY_PAYLOAD);
    await useCharacterChatStore.persist.rehydrate();

    const profiles = useCharacterChatStore.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.characterName).toBe("구름선장");

    expect(localStorage.getItem(CHARACTER_CHAT_STORAGE_KEY)).toBeNull();
    await expect(idbKvGet(CHARACTER_CHAT_STORAGE_KEY)).resolves.toBe(LEGACY_PAYLOAD);
  });

  it("프로필 생성 쓰기는 IDB에만 남는다", async () => {
    useCharacterChatStore.getState().resetForTests();
    await vi.waitFor(async () => {
      expect(await idbKvGet(CHARACTER_CHAT_STORAGE_KEY)).not.toBeNull();
    });
    expect(localStorage.getItem(CHARACTER_CHAT_STORAGE_KEY)).toBeNull();
  });
});
