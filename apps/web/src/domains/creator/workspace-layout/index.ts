/**
 * T9. 워크스페이스 레이아웃 저장·전환 — 공개 API 배럴.
 *
 * 기존 StudioCompanionWorkspacePresets / StudioWorkspaceArrangementControls 와
 * 이름이 겹치지 않도록 WorkspaceLayout* 네임스페이스를 사용한다.
 */
export {
  WORKSPACE_SLOT_IDS,
  WORKSPACE_SLOT_LABELS,
  WORKSPACE_PANEL_REGISTRY,
  createEmptyWorkspaceSlots,
  createWorkspaceLayout,
  createWorkspaceSlotLayout,
  extendWorkspacePanelRegistry,
  isKnownWorkspacePanel,
  isValidWorkspaceLayout,
  normalizeWorkspaceLayout,
  validateWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspacePanelInfo,
  type WorkspaceSlotId,
  type WorkspaceSlotLayout,
} from "./workspace-layout-model";

export {
  DEFAULT_WORKSPACE_PRESET_ID,
  WORKSPACE_PRESET_COLORING_ID,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESET_INKING_ID,
  WORKSPACE_PRESET_MANGA_ID,
  findWorkspaceLayoutPreset,
  getWorkspaceLayoutPresets,
  getWorkspacePresetDescription,
  isWorkspaceLayoutPresetId,
} from "./workspace-layout-presets";

export {
  WORKSPACE_LAYOUTS_MAX_CUSTOM,
  WORKSPACE_LAYOUTS_STORAGE_KEY,
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
  type RenameWorkspaceLayoutResult,
  type WorkspaceLayoutStorageLike,
  type WorkspaceLayoutStoreState,
} from "./workspace-layout-store";

export {
  createUnpersistedWorkspaceLayoutOptions,
  useWorkspaceLayout,
  type UseWorkspaceLayoutOptions,
  type UseWorkspaceLayoutResult,
} from "./useWorkspaceLayout";

export {
  QuickAccessPalette,
  QUICK_ACCESS_MAX_ITEMS,
  type QuickAccessCommand,
  type QuickAccessPaletteProps,
} from "./QuickAccessPalette";

export {
  ShortcutCustomizer,
  type ShortcutCustomizerProps,
} from "./ShortcutCustomizer";
export {
  DEFAULT_SHORTCUT_BINDINGS,
  captureShortcutFromKeyboardEvent,
  findDuplicateShortcutKeys,
  normalizeShortcutKeys,
  type ShortcutCommandBinding,
} from "./shortcut-bindings";
