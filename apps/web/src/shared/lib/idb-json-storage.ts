/**
 * zustand persist용 IndexedDB JSON 스토리지.
 *
 * 기존 `createJSONStorage(() => localStorage)`를 그대로 교체할 수 있는
 * 비동기 어댑터다. 값의 정본은 IndexedDB({@link ./idb-kv})에 두고,
 * localStorage에는 두 가지 역할만 남긴다.
 *
 * 1. **1회 이관 소스**: 처음 읽을 때 구 localStorage 값을 IDB로 옮긴다
 *    (검증 후에만 구 키 제거 — {@link migrateLocalStorageValueToIdb}).
 * 2. **폴백**: IndexedDB를 못 쓰는 환경(테스트 jsdom, 프라이버시 모드 등)
 *    에서는 읽고 쓰기가 localStorage로 떨어져 기존 동작과 같아진다.
 *
 * 주의: persist 하이드레이션이 비동기가 되므로, 이 어댑터를 쓰는 스토어는
 * 첫 페인트에서 동기 초기값을 기대하면 안 된다. 부팅 경로에서 동기
 * 하이드레이션이 필수인 스토어(메인 앱 스토어, 인증 세션)는 계속
 * localStorage를 써야 한다.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware";

import { idbKvGet, idbKvRemove, idbKvSet, migrateLocalStorageValueToIdb } from "./idb-kv";

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export const idbStateStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    await migrateLocalStorageValueToIdb(name);
    const value = await idbKvGet(name);
    if (value !== null) return value;
    // IDB에 값이 없거나 IDB 자체를 못 쓰는 경우 — 이관되지 않은 구 값이
    // localStorage에 남아 있을 수 있으니 마지막으로 확인한다.
    try {
      return localStorageOrNull()?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, newValue: string): Promise<void> => {
    const written = await idbKvSet(name, newValue);
    const storage = localStorageOrNull();
    if (!storage) return;
    try {
      if (written) {
        // 정본은 IDB다. 낡은 사본이 남아 있으면 지워 혼선을 막는다.
        storage.removeItem(name);
      } else {
        // IDB를 못 쓰는 환경에서는 localStorage가 정본 역할을 한다.
        storage.setItem(name, newValue);
      }
    } catch {
      /* 폴백 정리 실패는 무시한다. */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await idbKvRemove(name);
    try {
      localStorageOrNull()?.removeItem(name);
    } catch {
      /* 무시 */
    }
  },
};

/** `createJSONStorage(() => localStorage)`의 드롭인 교체재. */
export const idbJsonStorage = createJSONStorage(() => idbStateStorage);
