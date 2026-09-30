/**
 * T9. 워크스페이스 레이아웃 저장·불러오기·삭제·이름변경 CRUD 유틸 + localStorage 영속화.
 *
 * 모두 순수 함수다. storage 인자를 주입받으므로 테스트·SSR 환경에서도
 * localStorage 없이 동작한다. 실제 브라우저에서는 기본값으로 window.localStorage를 쓴다.
 */
import {
  createWorkspaceLayout,
  isValidWorkspaceLayout,
  normalizeWorkspaceLayout,
  WORKSPACE_SLOT_IDS,
  type WorkspaceLayout,
  type WorkspaceSlotId,
  type WorkspaceSlotLayout,
} from "./workspace-layout-model";
import {
  DEFAULT_WORKSPACE_PRESET_ID,
  findWorkspaceLayoutPreset,
  isWorkspaceLayoutPresetId,
} from "./workspace-layout-presets";

/** localStorage 키 (요구사항 고정값 — 오타 "toontudio" 유지). */
export const WORKSPACE_LAYOUTS_STORAGE_KEY = "toontudio.workspace-layouts.v1";

/** 사용자 저장 레이아웃 최대 개수. */
export const WORKSPACE_LAYOUTS_MAX_CUSTOM = 20;

export interface WorkspaceLayoutStoreState {
  /** 사용자가 저장한 커스텀 레이아웃 목록 (내장 프리셋 제외). */
  layouts: WorkspaceLayout[];
  /** 현재 적용 중인 레이아웃 id (커스텀 또는 프리셋). */
  activeLayoutId: string | null;
}

/** localStorage 호환 최소 인터페이스. */
export interface WorkspaceLayoutStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function defaultStorage(): WorkspaceLayoutStorageLike | null {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return null;
}

export function createEmptyWorkspaceLayoutStore(): WorkspaceLayoutStoreState {
  return { layouts: [], activeLayoutId: null };
}

/* ── CRUD (순수 함수) ─────────────────────────────────────────────── */

export interface RenameWorkspaceLayoutResult {
  ok: boolean;
  reason?: string;
  layout?: WorkspaceLayout;
}

/** 레이아웃 생성. 이름이 비어 있으면 null. */
export function addWorkspaceLayout(
  layouts: ReadonlyArray<WorkspaceLayout>,
  name: string,
  slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>> = {},
  options: { now?: number } = {},
): { layouts: WorkspaceLayout[]; layout: WorkspaceLayout | null } {
  const trimmed = name.trim();
  if (trimmed.length === 0 || layouts.length >= WORKSPACE_LAYOUTS_MAX_CUSTOM) {
    return { layouts: [...layouts], layout: null };
  }
  const layout = normalizeWorkspaceLayout(
    createWorkspaceLayout(trimmed, slots, { now: options.now }),
  );
  return { layouts: [...layouts, layout], layout };
}

/** 이름 변경. 실패 시 ok:false + 사유. */
export function renameWorkspaceLayout(
  layout: WorkspaceLayout,
  name: string,
  options: { now?: number } = {},
): RenameWorkspaceLayoutResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, reason: "이름이 비어 있습니다." };
  if (trimmed.length > 40) return { ok: false, reason: "이름은 40자까지 입력할 수 있습니다." };
  return {
    ok: true,
    layout: { ...layout, name: trimmed, updatedAt: options.now ?? Date.now() },
  };
}

/** 슬롯 배치 갱신 (부분 병합 + 정규화). */
export function updateWorkspaceLayoutSlots(
  layout: WorkspaceLayout,
  slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>>,
  options: { now?: number } = {},
): WorkspaceLayout {
  const merged: Record<WorkspaceSlotId, WorkspaceSlotLayout> = { ...layout.slots };
  for (const slotId of WORKSPACE_SLOT_IDS) {
    const partial = slots[slotId];
    if (partial) merged[slotId] = { ...merged[slotId], ...partial };
  }
  return normalizeWorkspaceLayout({
    ...layout,
    slots: merged,
    updatedAt: options.now ?? Date.now(),
  });
}

/** 복제 — 새 id, 이름 뒤에 " 복사" 추가. */
export function duplicateWorkspaceLayout(
  layout: WorkspaceLayout,
  options: { now?: number } = {},
): WorkspaceLayout {
  const now = options.now ?? Date.now();
  return normalizeWorkspaceLayout({
    ...layout,
    id: `layout-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${layout.name} 복사`,
    updatedAt: now,
  });
}

/** 삭제. */
export function removeWorkspaceLayout(
  layouts: ReadonlyArray<WorkspaceLayout>,
  id: string,
): WorkspaceLayout[] {
  return layouts.filter((layout) => layout.id !== id);
}

/** id로 조회 (커스텀 목록에서). */
export function findCustomWorkspaceLayout(
  layouts: ReadonlyArray<WorkspaceLayout>,
  id: string,
): WorkspaceLayout | undefined {
  return layouts.find((layout) => layout.id === id);
}

/**
 * 커스텀 목록 + 내장 프리셋에서 id로 레이아웃을 해석한다.
 * 찾지 못하면 기본 프리셋(잉킹용)을 반환한다.
 */
export function resolveWorkspaceLayout(
  id: string | null | undefined,
  customLayouts: ReadonlyArray<WorkspaceLayout>,
  now: number = Date.now(),
): WorkspaceLayout {
  if (id) {
    const custom = findCustomWorkspaceLayout(customLayouts, id);
    if (custom) return custom;
    if (isWorkspaceLayoutPresetId(id)) {
      const preset = findWorkspaceLayoutPreset(id, now);
      if (preset) return preset;
    }
  }
  return findWorkspaceLayoutPreset(DEFAULT_WORKSPACE_PRESET_ID, now)
    ?? createWorkspaceLayout("잉킹용");
}

/* ── localStorage 영속화 ─────────────────────────────────────────── */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 파싱된 JSON이 WorkspaceLayout 형태인지 느슨하게 검사한다. */
function coerceStoredLayout(value: unknown): WorkspaceLayout | null {
  if (!isPlainRecord(value)) return null;
  const { id, name, slots, updatedAt } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  if (!isPlainRecord(slots)) return null;
  const coercedSlots = { ...slots } as Record<WorkspaceSlotId, WorkspaceSlotLayout>;
  for (const slotId of WORKSPACE_SLOT_IDS) {
    const slot = (slots as Record<string, unknown>)[slotId];
    if (!isPlainRecord(slot) || !Array.isArray(slot["panelIds"])) return null;
    coercedSlots[slotId] = {
      panelIds: (slot["panelIds"] as unknown[]).filter(
        (panelId): panelId is string => typeof panelId === "string",
      ),
      collapsed: slot["collapsed"] === true,
      size: typeof slot["size"] === "number" ? slot["size"] : 0.25,
    };
  }
  const layout: WorkspaceLayout = {
    id,
    name: name.trim().slice(0, 40),
    slots: coercedSlots,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  };
  if (!isValidWorkspaceLayout(normalizeWorkspaceLayout(layout))) return null;
  return normalizeWorkspaceLayout(layout);
}

function coerceStoredState(value: unknown): WorkspaceLayoutStoreState | null {
  if (!isPlainRecord(value)) return null;
  const layouts = Array.isArray(value["layouts"])
    ? value["layouts"]
        .map(coerceStoredLayout)
        .filter((layout): layout is WorkspaceLayout => layout !== null)
        .slice(0, WORKSPACE_LAYOUTS_MAX_CUSTOM)
    : [];
  const activeLayoutId =
    typeof value["activeLayoutId"] === "string" ? value["activeLayoutId"] : null;
  const activeValid =
    activeLayoutId !== null &&
    (layouts.some((layout) => layout.id === activeLayoutId) ||
      isWorkspaceLayoutPresetId(activeLayoutId));
  return { layouts, activeLayoutId: activeValid ? activeLayoutId : null };
}

/** 저장소에서 상태를 불러온다. 파싱 실패·형식 오류 시 빈 상태 반환. */
export function loadWorkspaceLayoutStore(
  storage?: WorkspaceLayoutStorageLike | null,
): WorkspaceLayoutStoreState {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return createEmptyWorkspaceLayoutStore();
  let raw: string | null;
  try {
    raw = store.getItem(WORKSPACE_LAYOUTS_STORAGE_KEY);
  } catch {
    return createEmptyWorkspaceLayoutStore();
  }
  if (!raw) return createEmptyWorkspaceLayoutStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    return coerceStoredState(parsed) ?? createEmptyWorkspaceLayoutStore();
  } catch {
    return createEmptyWorkspaceLayoutStore();
  }
}

/** 상태를 저장소에 기록한다. 성공 여부 반환. */
export function saveWorkspaceLayoutStore(
  state: WorkspaceLayoutStoreState,
  storage?: WorkspaceLayoutStorageLike | null,
): boolean {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return false;
  try {
    store.setItem(
      WORKSPACE_LAYOUTS_STORAGE_KEY,
      JSON.stringify({ layouts: state.layouts, activeLayoutId: state.activeLayoutId }),
    );
    return true;
  } catch {
    return false;
  }
}
