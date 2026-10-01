/**
 * LabStore 포트를 React에 연결하는 훅(`useSyncExternalStore`). 컨텍스트에 의존하지 않고 store를 직접 받는다.
 * 컨텍스트 버전은 core의 `app/shell/lab-store-context.tsx`(`useLabState`, `useLabSelector`)다.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";

import type { LabState, LabStore } from "../contracts";

export type EqualityFn<T> = (a: T, b: T) => boolean;

/** 1단계 얕은 비교(배열·객체). 선택자가 매번 새 배열을 만들 때 쓴다. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(recordB, key) || !Object.is(recordA[key], recordB[key])) return false;
  }
  return true;
}

export function useLabStoreState(store: LabStore): LabState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

interface SelectorCache<T> {
  state: LabState;
  selected: T;
}

/**
 * 선택자 구독. 같은 상태 참조면 캐시를 돌려주고, 상태가 바뀌어도 `isEqual`이 참이면 이전 값을 유지해
 * 불필요한 리렌더를 막는다(선택자가 새 객체를 만들어도 안전).
 */
export function useLabStoreSelector<T>(store: LabStore, selector: (state: LabState) => T, isEqual: EqualityFn<T> = Object.is): T {
  const cache = useRef<SelectorCache<T> | null>(null);
  const getSnapshot = useCallback((): T => {
    const state = store.getState();
    const cached = cache.current;
    if (cached && cached.state === state) return cached.selected;
    const selected = selector(state);
    if (cached && isEqual(cached.selected, selected)) {
      cache.current = { state, selected: cached.selected };
      return cached.selected;
    }
    cache.current = { state, selected };
    return selected;
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
