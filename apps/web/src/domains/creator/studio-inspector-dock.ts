import { useSyncExternalStore } from "react";

/**
 * 작업 패널(인스펙터) 도킹 방향 선호.
 *
 * 포토샵·클립스튜디오처럼 패널을 캔버스 왼쪽에도 붙일 수 있게 한다. 프로젝트 내용이나
 * 선택 대상이 아니라 브라우저 로컬 크롬 선호이므로, 패널 환경설정
 * (`studio-inspector-panel-preferences`)과 같은 방식으로 로컬 저장소에 보관하고
 * 외부 스토어로 발행한다. 저장이 막힌 환경에서도 편집은 기본값(오른쪽)으로 계속된다.
 */
export type StudioInspectorDockSide = "left" | "right";

export const STUDIO_INSPECTOR_DOCK_STORAGE_KEY =
  "toonspectrum:studio:inspector-dock:v1";
export const DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE: StudioInspectorDockSide = "right";

export interface StudioInspectorDockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function normalizeStudioInspectorDockSide(
  value: unknown,
): StudioInspectorDockSide {
  return value === "left" ? "left" : DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE;
}

export function loadStudioInspectorDockSide(
  storage: StudioInspectorDockStorage | null | undefined,
): StudioInspectorDockSide {
  if (!storage) return DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE;
  try {
    return normalizeStudioInspectorDockSide(
      storage.getItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE;
  }
}

export function saveStudioInspectorDockSide(
  storage: StudioInspectorDockStorage | null | undefined,
  side: StudioInspectorDockSide,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY, side);
    return true;
  } catch {
    return false;
  }
}

function browserLocalStorage(): StudioInspectorDockStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let browserSnapshot: StudioInspectorDockSide | null = null;
let storageListener: ((event: StorageEvent) => void) | null = null;
const listeners = new Set<() => void>();

function emit(next: StudioInspectorDockSide): StudioInspectorDockSide {
  const current = browserSnapshot ?? DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE;
  if (current === next) {
    browserSnapshot = current;
    return current;
  }
  browserSnapshot = next;
  for (const listener of listeners) listener();
  return next;
}

function installStorageListener(): void {
  if (storageListener !== null || typeof window === "undefined") return;
  storageListener = (event) => {
    if (
      event.key !== null
      && event.key !== STUDIO_INSPECTOR_DOCK_STORAGE_KEY
    ) {
      return;
    }
    emit(loadStudioInspectorDockSide(browserLocalStorage()));
  };
  window.addEventListener("storage", storageListener);
}

export function getStudioInspectorDockSide(): StudioInspectorDockSide {
  installStorageListener();
  browserSnapshot ??= loadStudioInspectorDockSide(browserLocalStorage());
  return browserSnapshot;
}

export function getServerStudioInspectorDockSide(): StudioInspectorDockSide {
  return DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE;
}

export function subscribeStudioInspectorDockSide(
  listener: () => void,
): () => void {
  installStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setStudioInspectorDockSide(
  side: StudioInspectorDockSide,
): StudioInspectorDockSide {
  const normalized = normalizeStudioInspectorDockSide(side);
  if (getStudioInspectorDockSide() === normalized) return normalized;
  saveStudioInspectorDockSide(browserLocalStorage(), normalized);
  return emit(normalized);
}

export function resetStudioInspectorDockSide(): StudioInspectorDockSide {
  const storage = browserLocalStorage();
  if (storage) {
    try {
      if (storage.removeItem) {
        storage.removeItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY);
      } else {
        storage.setItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY, "");
      }
    } catch {
      // 저장소 초기화가 막혀도 현재 런타임 상태는 기본값으로 복구한다.
    }
  }
  return emit(DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE);
}

export function useStudioInspectorDockSide(): StudioInspectorDockSide {
  return useSyncExternalStore(
    subscribeStudioInspectorDockSide,
    getStudioInspectorDockSide,
    getServerStudioInspectorDockSide,
  );
}

export function resetStudioInspectorDockStoreForTests(): void {
  browserSnapshot = null;
  listeners.clear();
}
