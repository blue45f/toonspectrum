import {
  STUDIO_INSPECTOR_PRIMARY_TABS,
  type StudioInspectorPrimaryTab,
} from "./studio-inspector-layout";

/**
 * 작업 패널 크롬 선호.
 *
 * 프로젝트 내용이나 선택 대상은 이 저장소에 들어가지 않는다. 표시 탭과 아이콘 모드는
 * 브라우저 로컬 선호로, 전문 탭 고정은 현재 브라우저 탭의 세션 상태로만 보관한다.
 */
export const STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION = 1 as const;
export const STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY =
  "toonspectrum:studio:inspector-panel:v1";
export const STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY =
  "toonspectrum:studio:inspector-panel-session:v1";

export interface StudioInspectorPanelPreferences {
  readonly version: typeof STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION;
  readonly visiblePrimaryTabs: readonly StudioInspectorPrimaryTab[];
  readonly compactPrimaryTabs: boolean;
}

export interface StudioInspectorPanelSessionState {
  readonly version: typeof STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION;
  /**
   * 선택이 바뀔 때 이미지 전문 하위 탭을 Quick으로 자동 초기화하지 않는다.
   * 대상 객체 자체를 고정하지 않으므로 편집 권위와 undo 경로는 그대로 유지된다.
   */
  readonly contextPinned: boolean;
}

export interface StudioInspectorPanelState extends StudioInspectorPanelPreferences {
  readonly contextPinned: boolean;
}

export interface StudioInspectorPanelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const PRIMARY_TAB_SET = new Set<string>(STUDIO_INSPECTOR_PRIMARY_TABS);

function freezeVisibleTabs(
  tabs: readonly StudioInspectorPrimaryTab[],
): readonly StudioInspectorPrimaryTab[] {
  return Object.freeze([...tabs]);
}

function freezePreferences(
  preferences: StudioInspectorPanelPreferences,
): StudioInspectorPanelPreferences {
  return Object.freeze({
    version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
    visiblePrimaryTabs: freezeVisibleTabs(preferences.visiblePrimaryTabs),
    compactPrimaryTabs: preferences.compactPrimaryTabs,
  });
}

function freezeState(state: StudioInspectorPanelState): StudioInspectorPanelState {
  return Object.freeze({
    version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
    visiblePrimaryTabs: freezeVisibleTabs(state.visiblePrimaryTabs),
    compactPrimaryTabs: state.compactPrimaryTabs,
    contextPinned: state.contextPinned,
  });
}

export const DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES = freezePreferences({
  version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
  visiblePrimaryTabs: STUDIO_INSPECTOR_PRIMARY_TABS,
  compactPrimaryTabs: false,
});

export const DEFAULT_STUDIO_INSPECTOR_PANEL_SESSION_STATE = Object.freeze({
  version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
  contextPinned: false,
}) satisfies StudioInspectorPanelSessionState;

export const DEFAULT_STUDIO_INSPECTOR_PANEL_STATE = freezeState({
  ...DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES,
  contextPinned: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeVisiblePrimaryTabs(
  value: unknown,
  fallback: readonly StudioInspectorPrimaryTab[],
): readonly StudioInspectorPrimaryTab[] {
  if (!Array.isArray(value)) return freezeVisibleTabs(fallback);
  const requested = new Set(
    value.filter(
      (candidate): candidate is StudioInspectorPrimaryTab =>
        typeof candidate === "string" && PRIMARY_TAB_SET.has(candidate),
    ),
  );
  const normalized = STUDIO_INSPECTOR_PRIMARY_TABS.filter((tab) => requested.has(tab));
  return normalized.length > 0
    ? freezeVisibleTabs(normalized)
    : freezeVisibleTabs(fallback);
}

export function normalizeStudioInspectorPanelPreferences(
  value: unknown,
  fallback: StudioInspectorPanelPreferences = DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES,
): StudioInspectorPanelPreferences {
  if (!isRecord(value) || value.version !== STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION) {
    return freezePreferences(fallback);
  }
  return freezePreferences({
    version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
    visiblePrimaryTabs: normalizeVisiblePrimaryTabs(
      value.visiblePrimaryTabs,
      fallback.visiblePrimaryTabs,
    ),
    compactPrimaryTabs:
      typeof value.compactPrimaryTabs === "boolean"
        ? value.compactPrimaryTabs
        : fallback.compactPrimaryTabs,
  });
}

export function normalizeStudioInspectorPanelSessionState(
  value: unknown,
): StudioInspectorPanelSessionState {
  if (!isRecord(value) || value.version !== STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION) {
    return DEFAULT_STUDIO_INSPECTOR_PANEL_SESSION_STATE;
  }
  return Object.freeze({
    version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
    contextPinned:
      typeof value.contextPinned === "boolean" ? value.contextPinned : false,
  });
}

export function loadStudioInspectorPanelPreferences(
  storage: StudioInspectorPanelStorage | null | undefined,
): StudioInspectorPanelPreferences {
  if (!storage) return DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES;
  try {
    const raw = storage.getItem(STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY);
    return raw
      ? normalizeStudioInspectorPanelPreferences(JSON.parse(raw))
      : DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES;
  } catch {
    return DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES;
  }
}

export function saveStudioInspectorPanelPreferences(
  storage: StudioInspectorPanelStorage | null | undefined,
  preferences: StudioInspectorPanelPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeStudioInspectorPanelPreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadStudioInspectorPanelSessionState(
  storage: StudioInspectorPanelStorage | null | undefined,
): StudioInspectorPanelSessionState {
  if (!storage) return DEFAULT_STUDIO_INSPECTOR_PANEL_SESSION_STATE;
  try {
    const raw = storage.getItem(STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY);
    return raw
      ? normalizeStudioInspectorPanelSessionState(JSON.parse(raw))
      : DEFAULT_STUDIO_INSPECTOR_PANEL_SESSION_STATE;
  } catch {
    return DEFAULT_STUDIO_INSPECTOR_PANEL_SESSION_STATE;
  }
}

export function saveStudioInspectorPanelSessionState(
  storage: StudioInspectorPanelStorage | null | undefined,
  state: StudioInspectorPanelSessionState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY,
      JSON.stringify(normalizeStudioInspectorPanelSessionState(state)),
    );
    return true;
  } catch {
    return false;
  }
}

export function setStudioInspectorPrimaryTabVisible(
  preferences: StudioInspectorPanelPreferences,
  tab: StudioInspectorPrimaryTab,
  visible: boolean,
): StudioInspectorPanelPreferences {
  const normalized = normalizeStudioInspectorPanelPreferences(preferences);
  const current = new Set(normalized.visiblePrimaryTabs);
  if (visible) current.add(tab);
  else if (current.size > 1) current.delete(tab);
  const visiblePrimaryTabs = STUDIO_INSPECTOR_PRIMARY_TABS.filter((candidate) =>
    current.has(candidate),
  );
  if (
    visiblePrimaryTabs.length === normalized.visiblePrimaryTabs.length
    && visiblePrimaryTabs.every((candidate, index) =>
      candidate === normalized.visiblePrimaryTabs[index])
  ) {
    return normalized;
  }
  return freezePreferences({ ...normalized, visiblePrimaryTabs });
}

export function setStudioInspectorCompactPrimaryTabs(
  preferences: StudioInspectorPanelPreferences,
  compact: boolean,
): StudioInspectorPanelPreferences {
  const normalized = normalizeStudioInspectorPanelPreferences(preferences);
  return normalized.compactPrimaryTabs === compact
    ? normalized
    : freezePreferences({ ...normalized, compactPrimaryTabs: compact });
}

function browserLocalStorage(): StudioInspectorPanelStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function browserSessionStorage(): StudioInspectorPanelStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readBrowserState(): StudioInspectorPanelState {
  const preferences = loadStudioInspectorPanelPreferences(browserLocalStorage());
  const session = loadStudioInspectorPanelSessionState(browserSessionStorage());
  return freezeState({ ...preferences, contextPinned: session.contextPinned });
}

function sameVisibleTabs(
  left: readonly StudioInspectorPrimaryTab[],
  right: readonly StudioInspectorPrimaryTab[],
): boolean {
  return left.length === right.length
    && left.every((candidate, index) => candidate === right[index]);
}

function sameState(
  left: StudioInspectorPanelState,
  right: StudioInspectorPanelState,
): boolean {
  return left.compactPrimaryTabs === right.compactPrimaryTabs
    && left.contextPinned === right.contextPinned
    && sameVisibleTabs(left.visiblePrimaryTabs, right.visiblePrimaryTabs);
}

let browserSnapshot: StudioInspectorPanelState | null = null;
let storageListenerInstalled = false;
const listeners = new Set<() => void>();

function emit(next: StudioInspectorPanelState): StudioInspectorPanelState {
  const current = browserSnapshot ?? DEFAULT_STUDIO_INSPECTOR_PANEL_STATE;
  if (sameState(current, next)) {
    browserSnapshot = current;
    return current;
  }
  browserSnapshot = next;
  for (const listener of listeners) listener();
  return next;
}

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY) return;
    const current = getStudioInspectorPanelState();
    const preferences = loadStudioInspectorPanelPreferences(browserLocalStorage());
    emit(freezeState({ ...preferences, contextPinned: current.contextPinned }));
  });
}

export function getStudioInspectorPanelState(): StudioInspectorPanelState {
  installStorageListener();
  browserSnapshot ??= readBrowserState();
  return browserSnapshot;
}

export function getServerStudioInspectorPanelState(): StudioInspectorPanelState {
  return DEFAULT_STUDIO_INSPECTOR_PANEL_STATE;
}

export function subscribeStudioInspectorPanelState(listener: () => void): () => void {
  installStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writePreferencesAndEmit(
  preferences: StudioInspectorPanelPreferences,
): StudioInspectorPanelState {
  const current = getStudioInspectorPanelState();
  const normalized = normalizeStudioInspectorPanelPreferences(preferences);
  if (
    current.compactPrimaryTabs === normalized.compactPrimaryTabs
    && sameVisibleTabs(current.visiblePrimaryTabs, normalized.visiblePrimaryTabs)
  ) {
    return current;
  }
  saveStudioInspectorPanelPreferences(browserLocalStorage(), normalized);
  return emit(freezeState({ ...normalized, contextPinned: current.contextPinned }));
}

export function setStudioInspectorPanelPrimaryTabVisible(
  tab: StudioInspectorPrimaryTab,
  visible: boolean,
): StudioInspectorPanelState {
  const current = getStudioInspectorPanelState();
  return writePreferencesAndEmit(setStudioInspectorPrimaryTabVisible(current, tab, visible));
}

export function ensureStudioInspectorPanelPrimaryTabVisible(
  tab: StudioInspectorPrimaryTab,
): StudioInspectorPanelState {
  const current = getStudioInspectorPanelState();
  return current.visiblePrimaryTabs.includes(tab)
    ? current
    : setStudioInspectorPanelPrimaryTabVisible(tab, true);
}

export function setStudioInspectorPanelCompactPrimaryTabs(
  compact: boolean,
): StudioInspectorPanelState {
  const current = getStudioInspectorPanelState();
  return writePreferencesAndEmit(setStudioInspectorCompactPrimaryTabs(current, compact));
}

export function setStudioInspectorPanelContextPinned(
  contextPinned: boolean,
): StudioInspectorPanelState {
  const current = getStudioInspectorPanelState();
  if (current.contextPinned === contextPinned) return current;
  saveStudioInspectorPanelSessionState(browserSessionStorage(), {
    version: STUDIO_INSPECTOR_PANEL_PREFERENCES_VERSION,
    contextPinned,
  });
  return emit(freezeState({ ...current, contextPinned }));
}

function removeStorageKey(
  storage: StudioInspectorPanelStorage | null,
  key: string,
): void {
  if (!storage) return;
  try {
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, "");
  } catch {
    // 저장소 초기화가 막혀도 현재 런타임 상태는 기본값으로 복구한다.
  }
}

export function resetStudioInspectorPanelState(): StudioInspectorPanelState {
  removeStorageKey(
    browserLocalStorage(),
    STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY,
  );
  removeStorageKey(
    browserSessionStorage(),
    STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY,
  );
  return emit(DEFAULT_STUDIO_INSPECTOR_PANEL_STATE);
}

/** 테스트 격리용. 마운트된 구독자가 없는 시점에만 호출한다. */
export function resetStudioInspectorPanelStoreForTests(): void {
  removeStorageKey(
    browserLocalStorage(),
    STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY,
  );
  removeStorageKey(
    browserSessionStorage(),
    STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY,
  );
  browserSnapshot = null;
  listeners.clear();
}
