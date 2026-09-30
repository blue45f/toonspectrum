/**
 * T9. 현재 적용 레이아웃 ID 상태 관리 훅.
 *
 * - 마운트 시 localStorage에서 불러오고, 변경 시 저장한다
 * - applyLayout(id): 레이아웃 적용 (커스텀·프리셋 모두 가능)
 * - resetLayout(): 기본 프리셋(잉킹용)으로 초기화
 * - 커스텀 레이아웃 CRUD (추가·이름변경·복제·삭제·슬롯 갱신)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addWorkspaceLayout,
  createEmptyWorkspaceLayoutStore,
  duplicateWorkspaceLayout,
  findCustomWorkspaceLayout,
  loadWorkspaceLayoutStore,
  removeWorkspaceLayout,
  renameWorkspaceLayout,
  resolveWorkspaceLayout,
  saveWorkspaceLayoutStore,
  updateWorkspaceLayoutSlots,
  type WorkspaceLayoutStorageLike,
  type WorkspaceLayoutStoreState,
} from "./workspace-layout-store";
import { DEFAULT_WORKSPACE_PRESET_ID } from "./workspace-layout-presets";
import {
  isValidWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspaceSlotId,
  type WorkspaceSlotLayout,
} from "./workspace-layout-model";

export interface UseWorkspaceLayoutOptions {
  /** 주입용 저장소. undefined면 window.localStorage, null이면 영속화 안 함. */
  storage?: WorkspaceLayoutStorageLike | null;
  /** 초기화 시 적용할 레이아웃 id. 기본값은 잉킹용 프리셋. */
  defaultActiveLayoutId?: string;
}

export interface UseWorkspaceLayoutResult {
  /** 커스텀 레이아웃 목록. */
  layouts: WorkspaceLayout[];
  /** 현재 적용 중인 레이아웃 id. */
  activeLayoutId: string;
  /** 현재 적용 중인 레이아웃 (없으면 기본 프리셋으로 폴백). */
  activeLayout: WorkspaceLayout;
  /** 레이아웃 적용. 알 수 없는 id면 false. */
  applyLayout: (id: string) => boolean;
  /** 기본 프리셋(잉킹용)으로 초기화. */
  resetLayout: () => void;
  /** 커스텀 레이아웃 추가. 성공 시 id, 실패 시 null. */
  addLayout: (
    name: string,
    slots?: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>>,
  ) => string | null;
  /** 이름 변경. 성공 여부 반환. */
  renameLayout: (id: string, name: string) => boolean;
  /** 복제. 성공 시 새 id, 실패 시 null. */
  duplicateLayout: (id: string) => string | null;
  /** 삭제. 프리셋은 삭제할 수 없다. */
  removeLayout: (id: string) => boolean;
  /** 슬롯 배치 갱신. */
  updateLayoutSlots: (
    id: string,
    slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>>,
  ) => boolean;
}

export function useWorkspaceLayout(
  options: UseWorkspaceLayoutOptions = {},
): UseWorkspaceLayoutResult {
  const { storage, defaultActiveLayoutId = DEFAULT_WORKSPACE_PRESET_ID } = options;
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const [state, setState] = useState<WorkspaceLayoutStoreState>(() => {
    const loaded = loadWorkspaceLayoutStore(storage);
    return {
      layouts: loaded.layouts,
      activeLayoutId: loaded.activeLayoutId ?? defaultActiveLayoutId,
    };
  });

  // 변경 시 영속화 (초기 마운트 저장은 건너뛰어 불필요한 쓰기를 막는다).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveWorkspaceLayoutStore(state, storageRef.current);
  }, [state]);

  const activeLayout = useMemo(
    () => resolveWorkspaceLayout(state.activeLayoutId, state.layouts),
    [state.activeLayoutId, state.layouts],
  );

  const applyLayout = useCallback(
    (id: string): boolean => {
      const resolved = resolveWorkspaceLayout(id, state.layouts);
      // resolve가 폴백을 반환했는지 확인: id가 실제로 해석되는지 검사
      const known =
        findCustomWorkspaceLayout(state.layouts, id) !== undefined ||
        resolved.id === id;
      if (!known) return false;
      setState((prev) => ({ ...prev, activeLayoutId: id }));
      return true;
    },
    [state.layouts],
  );

  const resetLayout = useCallback(() => {
    setState((prev) => ({ ...prev, activeLayoutId: DEFAULT_WORKSPACE_PRESET_ID }));
  }, []);

  const addLayout = useCallback(
    (
      name: string,
      slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>> = {},
    ): string | null => {
      const { layouts, layout } = addWorkspaceLayout(state.layouts, name, slots);
      if (!layout) return null;
      setState(() => ({ layouts, activeLayoutId: layout.id }));
      return layout.id;
    },
    [state.layouts],
  );

  const renameLayout = useCallback(
    (id: string, name: string): boolean => {
      const target = findCustomWorkspaceLayout(state.layouts, id);
      if (!target) return false;
      const result = renameWorkspaceLayout(target, name);
      if (!result.ok || !result.layout || !isValidWorkspaceLayout(result.layout)) return false;
      const next = result.layout;
      setState((prev) => ({
        ...prev,
        layouts: prev.layouts.map((layout) => (layout.id === id ? next : layout)),
      }));
      return true;
    },
    [state.layouts],
  );

  const duplicateLayout = useCallback(
    (id: string): string | null => {
      const target = findCustomWorkspaceLayout(state.layouts, id)
        ?? resolveWorkspaceLayout(id, state.layouts);
      if (!target || state.layouts.length >= 20) return null;
      const copy = duplicateWorkspaceLayout(target);
      setState((prev) => ({ ...prev, layouts: [...prev.layouts, copy] }));
      return copy.id;
    },
    [state.layouts],
  );

  const removeLayout = useCallback(
    (id: string): boolean => {
      if (!findCustomWorkspaceLayout(state.layouts, id)) return false;
      setState((prev) => ({
        layouts: removeWorkspaceLayout(prev.layouts, id),
        activeLayoutId:
          prev.activeLayoutId === id ? DEFAULT_WORKSPACE_PRESET_ID : prev.activeLayoutId,
      }));
      return true;
    },
    [state.layouts],
  );

  const updateLayoutSlots = useCallback(
    (
      id: string,
      slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>>,
    ): boolean => {
      const target = findCustomWorkspaceLayout(state.layouts, id);
      if (!target) return false;
      const next = updateWorkspaceLayoutSlots(target, slots);
      if (!isValidWorkspaceLayout(next)) return false;
      setState((prev) => ({
        ...prev,
        layouts: prev.layouts.map((layout) => (layout.id === id ? next : layout)),
      }));
      return true;
    },
    [state.layouts],
  );

  return {
    layouts: state.layouts,
    activeLayoutId: state.activeLayoutId ?? DEFAULT_WORKSPACE_PRESET_ID,
    activeLayout,
    applyLayout,
    resetLayout,
    addLayout,
    renameLayout,
    duplicateLayout,
    removeLayout,
    updateLayoutSlots,
  };
}

/** 테스트·초기값용: 저장소 없이 빈 상태로 시작하는 훅 팩토리 옵션. */
export function createUnpersistedWorkspaceLayoutOptions(): UseWorkspaceLayoutOptions {
  return { storage: createUnpersistedStorage() };
}

function createUnpersistedStorage(): WorkspaceLayoutStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

export { createEmptyWorkspaceLayoutStore };
