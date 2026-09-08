/**
 * Application Settings workbench.
 *
 * The dialog keeps every preference immediately applied and device-persisted while adding
 * cross-category search, session undo, input-aware profiles, granular reset, shortcut filtering,
 * and versioned profile import/export. Visual language intentionally remains ToonSpectrum's own.
 */
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileJson2,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  formatStudioShortcutChord,
  hideStudioRailTool,
  listStudioShortcutConflicts,
  moveStudioRailTool,
  normalizeStudioAppSettings,
  normalizeStudioShortcutChordKey,
  studioShortcutActionLabel,
  showStudioRailTool,
  STUDIO_APP_SETTINGS_TABS,
  STUDIO_PIXEL_GRID_SIZE_OPTIONS,
  STUDIO_SHORTCUT_ACTIONS,
  studioAppSettingsTabLabel,
  studioRailHiddenIds,
  studioRailToolLabel,
  type StudioAppSettings,
  type StudioAppSettingsTab,
  type StudioShortcutActionId,
} from "./studio-app-settings";
import {
  STUDIO_APP_SETTINGS_PROFILE_MAX_CHARACTERS,
  StudioAppSettingsProfileError,
  applyStudioAppSettingsPreset,
  parseStudioAppSettingsProfile,
  resetStudioAppSettingsTab,
  serializeStudioAppSettingsProfile,
  summarizeStudioAppSettingsChanges,
  type StudioAppSettingsPresetId,
} from "./studio-app-settings-workbench";
import { runStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioResetApplicationSettingsRequest } from "./studio-destructive-command-catalog";
import { StudioToggleChip } from "./studio-panel-ui";
import {
  MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
  MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
  STUDIO_TOOL_HINT_MODES,
  studioToolHintModeLabel,
} from "./studio-tool-hint-preferences";
import {
  STUDIO_UI_DENSITY_MODES,
  studioUiDensityDescription,
  studioUiDensityLabel,
  type StudioUiDensityMode,
} from "./studio-ui-density";
import { StudioPressureCurveGraph } from "./StudioPressureCurveGraph";
import { activateStudioModalSheet } from "./useStudioModalSheet";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type StudioAppSettingsPanelProps = {
  open: boolean;
  settings: StudioAppSettings;
  initialTab?: StudioAppSettingsTab;
  persistenceState?: "loading" | "saved" | "session-only";
  onClose: () => void;
  onChange: (next: StudioAppSettings) => void;
  onResetAll: () => void;
  onRetryPersistence?: () => void;
};

type SettingsCopy = {
  searchAria: string;
  searchPlaceholder: string;
  searchShortcut: string;
  clearSearch: string;
  searchResults: string;
  searchResultCount: (count: number) => string;
  searchEmpty: string;
  searchHint: string;
  resetTab: string;
  resetTabAria: (tab: string) => string;
  changedCount: (count: number) => string;
  changedTabs: (count: number) => string;
  revertSession: string;
  revertSessionAria: string;
  quickProfilesTitle: string;
  quickProfilesHint: string;
  appliedProfile: (name: string, count: number) => string;
  shortcutSearchAria: string;
  shortcutSearchPlaceholder: string;
  conflictOnly: string;
  shortcutVisibleCount: (visible: number, total: number) => string;
  noShortcutResults: string;
  profileTitle: string;
  profileHint: string;
  exportProfile: string;
  importProfile: string;
  importAria: string;
  exportComplete: string;
  importComplete: (count: number) => string;
  importTooLarge: string;
  importInvalidJson: string;
  importInvalidShape: string;
  importUnsupported: string;
  importReadFailed: string;
  profilePrivacy: string;
  tabResetComplete: (tab: string, count: number) => string;
  loadingPersistence: string;
  presetNames: Record<StudioAppSettingsPresetId, string>;
  presetDescriptions: Record<StudioAppSettingsPresetId, string>;
};

const KO_COPY: SettingsCopy = {
  searchAria: "모든 애플리케이션 설정 검색",
  searchPlaceholder: "설정, 도구 또는 단축키 검색",
  searchShortcut: "⌘/Ctrl F",
  clearSearch: "검색 지우기",
  searchResults: "검색 결과",
  searchResultCount: (count) => `검색 결과 ${count}개`,
  searchEmpty: "일치하는 설정을 찾지 못했습니다.",
  searchHint: "이름, 설명, 탭, 도구와 단축키를 한 번에 검색합니다.",
  resetTab: "이 탭 기본값",
  resetTabAria: (tab) => `${tab} 설정만 기본값으로 되돌리기`,
  changedCount: (count) => `이번에 변경 ${count}개`,
  changedTabs: (count) => `${count}개 탭`,
  revertSession: "이번 변경 되돌리기",
  revertSessionAria: "설정 창을 연 뒤 변경한 내용을 모두 되돌리기",
  quickProfilesTitle: "작업 환경 빠른 설정",
  quickProfilesHint: "단축키와 도구막대는 유지하고 입력 장치에 맞는 핵심 옵션만 조정합니다.",
  appliedProfile: (name, count) => `${name} 빠른 설정을 적용했습니다. ${count}개 값이 변경되었습니다.`,
  shortcutSearchAria: "단축키 동작 검색",
  shortcutSearchPlaceholder: "동작 또는 키 조합 검색",
  conflictOnly: "충돌만",
  shortcutVisibleCount: (visible, total) => `${visible}/${total}개 동작`,
  noShortcutResults: "검색 조건에 맞는 단축키가 없습니다.",
  profileTitle: "설정 백업과 이동",
  profileHint: "현재 설정만 JSON으로 내보내 다른 브라우저나 기기에서 안전하게 가져올 수 있습니다.",
  exportProfile: "설정 내보내기",
  importProfile: "설정 가져오기",
  importAria: "ToonSpectrum Studio 설정 JSON 선택",
  exportComplete: "설정 백업 파일을 만들었습니다.",
  importComplete: (count) => `설정을 가져왔습니다. 현재 상태에서 ${count}개 값이 달라졌습니다.`,
  importTooLarge: "설정 파일이 허용 크기를 초과했습니다.",
  importInvalidJson: "올바른 JSON 설정 파일이 아닙니다.",
  importInvalidShape: "ToonSpectrum Studio 설정 파일로 확인할 수 없습니다.",
  importUnsupported: "이 버전에서 지원하지 않는 설정 파일입니다.",
  importReadFailed: "설정 파일을 읽지 못했습니다. 파일을 다시 확인해 주세요.",
  profilePrivacy: "작품·계정·인증 정보는 포함하지 않고 애플리케이션 설정만 저장합니다.",
  tabResetComplete: (tab, count) => `${tab} 탭을 기본값으로 되돌렸습니다. ${count}개 값이 변경되었습니다.`,
  loadingPersistence: "SQLite/OPFS에서 설정을 확인하는 중입니다.",
  presetNames: {
    "keyboard-mouse": "키보드·마우스",
    "pen-display": "액정 태블릿",
    "touch-tablet": "터치 태블릿",
    focus: "저자극 집중",
  },
  presetDescriptions: {
    "keyboard-mouse": "전체 도구, 간단한 도움말, 휠 확대와 가운데 버튼 이동",
    "pen-display": "전체 도구, 윤곽 커서, 안정화 지연 안내선과 팜 리젝션",
    "touch-tablet": "표준 도구, 큰 터치 흐름, 두 손가락 이동·확대와 세 손가락 실행취소",
    focus: "캔버스 중심 화면, 간단한 도움말과 모션 감소",
  },
};

const EN_COPY: SettingsCopy = {
  searchAria: "Search all application settings",
  searchPlaceholder: "Search settings, tools, or shortcuts",
  searchShortcut: "⌘/Ctrl F",
  clearSearch: "Clear search",
  searchResults: "Search results",
  searchResultCount: (count) => `${count} search result${count === 1 ? "" : "s"}`,
  searchEmpty: "No matching settings found.",
  searchHint: "Search names, descriptions, tabs, tools, and shortcuts together.",
  resetTab: "Reset this tab",
  resetTabAria: (tab) => `Reset only ${tab} settings`,
  changedCount: (count) => `${count} changed this session`,
  changedTabs: (count) => `${count} tab${count === 1 ? "" : "s"}`,
  revertSession: "Revert session changes",
  revertSessionAria: "Revert every change made since opening settings",
  quickProfilesTitle: "Quick setup profiles",
  quickProfilesHint: "Keep shortcuts and the toolbar intact while tuning core options for your input device.",
  appliedProfile: (name, count) => `Applied ${name}. ${count} value${count === 1 ? "" : "s"} changed.`,
  shortcutSearchAria: "Search shortcut actions",
  shortcutSearchPlaceholder: "Search action or key chord",
  conflictOnly: "Conflicts only",
  shortcutVisibleCount: (visible, total) => `${visible}/${total} actions`,
  noShortcutResults: "No shortcuts match the current filters.",
  profileTitle: "Back up and move settings",
  profileHint: "Export only application settings as JSON, then safely import them in another browser or device.",
  exportProfile: "Export settings",
  importProfile: "Import settings",
  importAria: "Choose a ToonSpectrum Studio settings JSON file",
  exportComplete: "Created the settings backup file.",
  importComplete: (count) => `Imported settings. ${count} value${count === 1 ? "" : "s"} differ from the previous state.`,
  importTooLarge: "The settings file exceeds the supported size.",
  importInvalidJson: "This is not a valid JSON settings file.",
  importInvalidShape: "This file is not recognized as ToonSpectrum Studio settings.",
  importUnsupported: "This settings profile version is not supported.",
  importReadFailed: "The settings file could not be read. Check the file and try again.",
  profilePrivacy: "Artwork, account, and authentication data are excluded; only application settings are saved.",
  tabResetComplete: (tab, count) => `Reset ${tab}. ${count} value${count === 1 ? "" : "s"} changed.`,
  loadingPersistence: "Checking settings in SQLite/OPFS.",
  presetNames: {
    "keyboard-mouse": "Keyboard + mouse",
    "pen-display": "Pen display",
    "touch-tablet": "Touch tablet",
    focus: "Low-motion focus",
  },
  presetDescriptions: {
    "keyboard-mouse": "Full toolset, compact hints, wheel zoom, and middle-button pan",
    "pen-display": "Full toolset, outline cursor, stroke lag guide, and palm rejection",
    "touch-tablet": "Standard toolset, touch-first gestures, two-finger navigation, and three-finger undo",
    focus: "Canvas-first layout, compact hints, and reduced motion",
  },
};

type SearchItem = {
  id: string;
  tab: StudioAppSettingsTab;
  label: string;
  hint: string;
  keywords: string;
  scopedQuery?: string;
};

function normalizeSearchText(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

function SectionLabel({ children }: { children: string }): ReactElement {
  return <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">{children}</p>;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg">{label}</p>
        {hint ? <p className="text-[0.68rem] leading-snug text-fg-3">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function SelectChipGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map((option) => (
        <StudioToggleChip
          key={option.id}
          active={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </StudioToggleChip>
      ))}
    </span>
  );
}

function SearchField({
  value,
  onChange,
  inputRef,
  ariaLabel,
  placeholder,
  shortcut,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  ariaLabel: string;
  placeholder: string;
  shortcut?: string;
}): ReactElement {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{ariaLabel}</span>
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.currentTarget.value.slice(0, 80))
        }
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 w-full rounded-xl border border-line bg-card pl-9 pr-20 text-xs text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-10 pointer-coarse:h-11 pointer-coarse:min-h-11"
      />
      {shortcut ? (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] font-medium text-fg-3">
          {shortcut}
        </kbd>
      ) : null}
    </label>
  );
}

function PresetCard({
  name,
  description,
  onClick,
}: {
  name: string;
  description: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-20 rounded-xl border border-line bg-card/50 p-3 text-left transition hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-24"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <Sparkles className="size-3.5 text-accent" aria-hidden />
        {name}
      </span>
      <span className="mt-1 block text-[0.66rem] leading-relaxed text-fg-3 group-hover:text-fg-2">
        {description}
      </span>
    </button>
  );
}

export function StudioAppSettingsPanel({
  open,
  settings,
  initialTab = "general",
  persistenceState = "saved",
  onClose,
  onChange,
  onResetAll,
  onRetryPersistence,
}: StudioAppSettingsPanelProps): ReactElement | null {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const copy = lang.toLocaleLowerCase().startsWith("ko") ? KO_COPY : EN_COPY;
  const titleId = useId();
  const [tab, setTab] = useState<StudioAppSettingsTab>(initialTab);
  const [recordingAction, setRecordingAction] = useState<StudioShortcutActionId | null>(null);
  const [toolbarQuery, setToolbarQuery] = useState("");
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [showShortcutConflictsOnly, setShowShortcutConflictsOnly] = useState(false);
  const [settingsQuery, setSettingsQuery] = useState("");
  const [operationStatus, setOperationStatus] = useState("");
  const [baselineRevision, setBaselineRevision] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabListRef = useRef<HTMLElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const sessionBaselineRef = useRef<StudioAppSettings>(normalizeStudioAppSettings(settings));
  const userChangedRef = useRef(false);

  const startSettingsSession = useEffectEvent((nextTab: StudioAppSettingsTab) => {
    sessionBaselineRef.current = normalizeStudioAppSettings(settings);
    userChangedRef.current = false;
    setBaselineRevision((revision) => revision + 1);
    setTab(nextTab);
    setRecordingAction(null);
    setToolbarQuery("");
    setShortcutQuery("");
    setShowShortcutConflictsOnly(false);
    setSettingsQuery("");
    setOperationStatus("");
  });

  const refreshHydratedBaseline = useEffectEvent(() => {
    if (userChangedRef.current) return;
    sessionBaselineRef.current = normalizeStudioAppSettings(settings);
    setBaselineRevision((revision) => revision + 1);
  });

  useEffect(() => {
    if (open) startSettingsSession(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (open && persistenceState === "saved") refreshHydratedBaseline();
  }, [open, persistenceState]);

  const dismissModal = useEffectEvent(() => {
    if (recordingAction) {
      setRecordingAction(null);
      return;
    }
    if (settingsQuery) {
      setSettingsQuery("");
      searchRef.current?.focus();
      return;
    }
    onClose();
  });

  const commitSettings = useCallback(
    (next: StudioAppSettings, status?: string) => {
      userChangedRef.current = true;
      onChange(normalizeStudioAppSettings(next));
      if (status !== undefined) setOperationStatus(status);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open || !recordingAction) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingAction(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        commitSettings({
          ...settings,
          shortcuts: { ...settings.shortcuts, [recordingAction]: "" },
        });
        setRecordingAction(null);
        return;
      }
      const parts: string[] = [];
      if (event.metaKey || event.ctrlKey) parts.push("Mod");
      if (event.shiftKey) parts.push("Shift");
      if (event.altKey) parts.push("Alt");
      let key = "";
      if (event.code === "BracketLeft") key = "[";
      else if (event.code === "BracketRight") key = "]";
      else if (event.code === "Tab") key = "Tab";
      else if (event.key === "?") key = "?";
      else if (event.key.length === 1) key = event.key.toUpperCase();
      else if (
        event.key !== "Control"
        && event.key !== "Meta"
        && event.key !== "Shift"
        && event.key !== "Alt"
      ) {
        key = event.key;
      }
      if (!key) return;
      parts.push(key);
      commitSettings({
        ...settings,
        shortcuts: { ...settings.shortcuts, [recordingAction]: parts.join("+") },
      });
      setRecordingAction(null);
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [commitSettings, open, recordingAction, settings]);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    return activateStudioModalSheet({
      dialog,
      document: dialog.ownerDocument,
      onDismiss: dismissModal,
      root: dialog.ownerDocument.body,
    });
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const patch = (partial: Partial<StudioAppSettings>) => {
    commitSettings({ ...settings, ...partial });
  };
  const visible = settings.toolbar.visibleIds;
  const hidden = studioRailHiddenIds(visible);
  const normalizedToolbarQuery = normalizeSearchText(toolbarQuery);
  const matchesToolbarQuery = (id: (typeof DEFAULT_STUDIO_RAIL_TOOL_ORDER)[number]) =>
    !normalizedToolbarQuery
    || studioRailToolLabel(id, t).normalize("NFKC").toLocaleLowerCase().includes(normalizedToolbarQuery);
  const visibleMatches = visible.filter(matchesToolbarQuery);
  const hiddenMatches = hidden.filter(matchesToolbarQuery);
  const shortcutConflicts = listStudioShortcutConflicts(settings.shortcuts);
  const shortcutConflictCount = shortcutConflicts.size;
  const conflictActionIds = new Set([...shortcutConflicts.values()].flat());
  const actionLabelById = new Map(
    STUDIO_SHORTCUT_ACTIONS.map((action) => [action.id, studioShortcutActionLabel(action.id, t)]),
  );
  const normalizedShortcutQuery = normalizeSearchText(shortcutQuery);
  const filteredShortcutActions = STUDIO_SHORTCUT_ACTIONS.filter((action) => {
    if (showShortcutConflictsOnly && !conflictActionIds.has(action.id)) return false;
    if (!normalizedShortcutQuery) return true;
    const label = actionLabelById.get(action.id) ?? action.label;
    const chord = settings.shortcuts[action.id] ?? "";
    return normalizeSearchText(`${label} ${chord} ${formatStudioShortcutChord(chord)}`).includes(
      normalizedShortcutQuery,
    );
  });

  const searchItems: SearchItem[] = [
    {
      id: "general-density",
      tab: "general",
      label: t("studio.settings.general.uiDensityLabel"),
      hint: t("studio.settings.general.uiDensityHint"),
      keywords: "interface layout density focus simple full workspace 화면 UI 레이아웃 밀도 집중 표준 전체",
    },
    {
      id: "general-hints",
      tab: "general",
      label: t("studio.settings.general.toolHintLabel"),
      hint: t("studio.settings.general.toolHintHint"),
      keywords: "tooltip help preview compact rich off 도움말 툴팁 미리보기",
    },
    {
      id: "general-cursor",
      tab: "general",
      label: t("studio.settings.general.brushCursorLabel"),
      hint: t("studio.settings.general.brushCursorHint"),
      keywords: "cursor outline dot brush pointer 커서 윤곽 점 브러시",
    },
    {
      id: "general-stroke-guide",
      tab: "general",
      label: t("studio.settings.general.strokeGuideLabel"),
      hint: t("studio.settings.general.strokeGuideHint"),
      keywords: "latency stabilizer tether guide lag 지연 안정화 안내선",
    },
    {
      id: "general-confirm-clear",
      tab: "general",
      label: t("studio.settings.general.clearLayerConfirmLabel"),
      hint: t("studio.settings.general.clearLayerConfirmLabel"),
      keywords: "confirm destructive clear layer warning 확인 삭제 지우기 레이어",
    },
    {
      id: "general-profiles",
      tab: "general",
      label: copy.quickProfilesTitle,
      hint: copy.quickProfilesHint,
      keywords: "preset profile keyboard mouse pen display tablet touch focus 빠른 설정 프리셋 키보드 마우스 펜 태블릿 터치 집중",
    },
    {
      id: "mouse-wheel",
      tab: "mouse",
      label: t("studio.settings.mouse.wheelLabel"),
      hint: t("studio.settings.mouse.wheelHint"),
      keywords: "wheel zoom pan brush size reverse 휠 확대 이동 브러시 크기 반전",
    },
    {
      id: "mouse-middle",
      tab: "mouse",
      label: t("studio.settings.mouse.middleButtonLabel"),
      hint: t("studio.settings.mouse.middleButtonLabel"),
      keywords: "middle button pan zoom eyedropper 가운데 버튼 이동 확대 스포이드",
    },
    {
      id: "mouse-right",
      tab: "mouse",
      label: t("studio.settings.mouse.rightButtonLabel"),
      hint: t("studio.settings.mouse.rightButtonLabel"),
      keywords: "right button context menu eyedropper 오른쪽 우클릭 컨텍스트 메뉴 스포이드",
    },
    {
      id: "touch-gestures",
      tab: "touch",
      label: t("studio.settings.section.touchPen"),
      hint: t("studio.settings.touch.sectionHint"),
      keywords: "touch gesture finger one two three undo pan zoom 터치 제스처 손가락 실행취소 이동 확대",
    },
    {
      id: "touch-palm",
      tab: "touch",
      label: t("studio.settings.touch.palmRejectionLabel"),
      hint: t("studio.settings.touch.palmRejectionHint"),
      keywords: "palm rejection stylus pen hand 팜 리젝션 손바닥 펜",
    },
    {
      id: "touch-hold",
      tab: "touch",
      label: t("studio.settings.touch.toolTipHoldLabel"),
      hint: t("studio.settings.touch.toolTipHoldHint"),
      keywords: "long press hold delay tooltip 길게 누르기 시간 지연 도구 설명",
    },
    {
      id: "grids-ruler",
      tab: "grids",
      label: t("studio.settings.grids.canvasRulerLabel"),
      hint: t("studio.settings.grids.canvasRulerHint"),
      keywords: "ruler unit coordinate 눈금자 단위 좌표",
    },
    {
      id: "grids-pixel",
      tab: "grids",
      label: t("studio.settings.grids.pixelGridLabel"),
      hint: t("studio.settings.grids.pixelGridHint"),
      keywords: "pixel grid size snap 픽셀 그리드 격자 크기 스냅",
    },
    {
      id: "grids-alignment",
      tab: "grids",
      label: t("studio.settings.grids.alignGuideLabel"),
      hint: t("studio.settings.grids.alignGuideHint"),
      keywords: "alignment smart guide snap 정렬 가이드 스냅",
    },
    {
      id: "grids-isometric",
      tab: "grids",
      label: t("studio.settings.grids.isometricLabel"),
      hint: t("studio.settings.grids.isometricLabel"),
      keywords: "isometric perspective guide 아이소메트릭 투시 가이드",
    },
    {
      id: "other-pressure",
      tab: "other",
      label: t("studio.settings.section.other"),
      hint: t("studio.settings.other.pressureHint"),
      keywords: "pressure curve stylus pen 필압 곡선 펜 태블릿",
    },
    {
      id: "other-motion",
      tab: "other",
      label: t("studio.settings.other.motionReduceLabel"),
      hint: t("studio.settings.other.motionReduceHint"),
      keywords: "accessibility reduce motion animation 접근성 모션 애니메이션 감소",
    },
    {
      id: "other-profile",
      tab: "other",
      label: copy.profileTitle,
      hint: copy.profileHint,
      keywords: "backup restore import export transfer json profile 백업 복원 가져오기 내보내기 이동 설정 파일",
    },
    ...STUDIO_SHORTCUT_ACTIONS.map((action): SearchItem => ({
      id: `shortcut-${action.id}`,
      tab: "shortcuts",
      label: actionLabelById.get(action.id) ?? action.label,
      hint: formatStudioShortcutChord(settings.shortcuts[action.id] ?? ""),
      keywords: `shortcut key keyboard hotkey 단축키 키 ${action.defaultKeys}`,
      scopedQuery: actionLabelById.get(action.id) ?? action.label,
    })),
    ...DEFAULT_STUDIO_RAIL_TOOL_ORDER.map((toolId): SearchItem => ({
      id: `toolbar-${toolId}`,
      tab: "toolbar",
      label: studioRailToolLabel(toolId, t),
      hint: t("studio.settings.section.toolbar"),
      keywords: "toolbar rail visible hidden tool 도구막대 툴바 표시 숨김 도구",
      scopedQuery: studioRailToolLabel(toolId, t),
    })),
  ];
  const normalizedSettingsQuery = normalizeSearchText(settingsQuery);
  const matchingSearchItems = normalizedSettingsQuery
    ? searchItems.filter((item) =>
        normalizeSearchText(
          `${item.label} ${item.hint} ${item.keywords} ${studioAppSettingsTabLabel(item.tab, t)}`,
        ).includes(normalizedSettingsQuery),
      )
    : [];

  const changeSummary = summarizeStudioAppSettingsChanges(sessionBaselineRef.current, settings);
  void baselineRevision;
  const changedTabCount = STUDIO_APP_SETTINGS_TABS.filter(
    (tabId) => changeSummary.byTab[tabId] > 0,
  ).length;

  const openSearchResult = (item: SearchItem) => {
    setTab(item.tab);
    setSettingsQuery("");
    if (item.tab === "shortcuts" && item.scopedQuery) setShortcutQuery(item.scopedQuery);
    if (item.tab === "toolbar" && item.scopedQuery) setToolbarQuery(item.scopedQuery);
    setOperationStatus("");
  };

  const resetCurrentTab = () => {
    const next = resetStudioAppSettingsTab(settings, tab);
    const changed = summarizeStudioAppSettingsChanges(settings, next).total;
    commitSettings(next, copy.tabResetComplete(studioAppSettingsTabLabel(tab, t), changed));
  };

  const applyPreset = (presetId: StudioAppSettingsPresetId) => {
    const next = applyStudioAppSettingsPreset(settings, presetId);
    const changed = summarizeStudioAppSettingsChanges(settings, next).total;
    commitSettings(next, copy.appliedProfile(copy.presetNames[presetId], changed));
  };

  const revertSessionChanges = () => {
    onChange(normalizeStudioAppSettings(sessionBaselineRef.current));
    userChangedRef.current = true;
    setOperationStatus("");
  };

  const exportProfile = () => {
    const raw = serializeStudioAppSettingsProfile(settings);
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `toonspectrum-studio-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    setOperationStatus(copy.exportComplete);
  };

  const importProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > STUDIO_APP_SETTINGS_PROFILE_MAX_CHARACTERS * 4) {
      setOperationStatus(copy.importTooLarge);
      return;
    }
    try {
      const raw = await file.text();
      const next = parseStudioAppSettingsProfile(raw);
      const changed = summarizeStudioAppSettingsChanges(settings, next).total;
      commitSettings(next, copy.importComplete(changed));
    } catch (error) {
      if (error instanceof StudioAppSettingsProfileError) {
        const message = {
          "too-large": copy.importTooLarge,
          "invalid-json": copy.importInvalidJson,
          "invalid-shape": copy.importInvalidShape,
          "unsupported-version": copy.importUnsupported,
        }[error.code];
        setOperationStatus(message);
        return;
      }
      setOperationStatus(copy.importReadFailed);
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      event.stopPropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  };

  const handleTabListKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const current = STUDIO_APP_SETTINGS_TABS.indexOf(tab);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = STUDIO_APP_SETTINGS_TABS.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (current - 1 + STUDIO_APP_SETTINGS_TABS.length) % STUDIO_APP_SETTINGS_TABS.length;
    } else {
      next = (current + 1) % STUDIO_APP_SETTINGS_TABS.length;
    }
    const nextTab = STUDIO_APP_SETTINGS_TABS[next];
    if (!nextTab) return;
    setTab(nextTab);
    setSettingsQuery("");
    globalThis.requestAnimationFrame?.(() => {
      tabListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-settings-tab="${nextTab}"]`)
        ?.focus();
    });
  };

  const body = (
    <div
      className="fixed inset-0 z-[95] grid place-items-end bg-[oklch(0.08_0.01_70/0.55)] p-0 sm:place-items-center sm:p-4"
      role="presentation"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[min(94dvh,50rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
      >
        <header className="border-b border-line px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Settings2 className="size-4 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-bold text-fg">
                  {t("studio.settings.title")}
                </h2>
                <p className="truncate text-[0.68rem] text-fg-3">{t("studio.settings.subtitle")}</p>
              </div>
            </div>
            <button
              type="button"
              className={cn(
                buttonClass({ size: "sm", variant: "quiet" }),
                "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
              )}
              onClick={onClose}
              aria-label={t("studio.settings.panelCloseAria")}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <SearchField
              value={settingsQuery}
              onChange={(value) => {
                setSettingsQuery(value);
                setOperationStatus("");
              }}
              inputRef={searchRef}
              ariaLabel={copy.searchAria}
              placeholder={copy.searchPlaceholder}
              shortcut={copy.searchShortcut}
            />
            {changeSummary.total > 0 ? (
              <span
                className="hidden shrink-0 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1.5 text-[0.66rem] font-semibold tabular-nums text-accent sm:inline-flex"
                title={`${copy.changedCount(changeSummary.total)} · ${copy.changedTabs(changedTabCount)}`}
              >
                {copy.changedCount(changeSummary.total)}
              </span>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            ref={tabListRef}
            role="tablist"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-40 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
            aria-label={t("studio.settings.toolbar.tabAria")}
            onKeyDown={handleTabListKeyDown}
          >
            {STUDIO_APP_SETTINGS_TABS.map((id) => {
              const tabChanges = changeSummary.byTab[id];
              return (
                <button
                  key={id}
                  id={`${titleId}-tab-${id}`}
                  data-settings-tab={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id && !normalizedSettingsQuery}
                  aria-controls={`${titleId}-panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => {
                    setTab(id);
                    setSettingsQuery("");
                    setOperationStatus("");
                  }}
                  className={cn(
                    "min-h-11 min-w-11 shrink-0 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition sm:min-h-8 sm:min-w-0 sm:py-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:py-2",
                    tab === id && !normalizedSettingsQuery
                      ? "bg-accent-soft text-accent ring-1 ring-accent/20"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  aria-current={tab === id && !normalizedSettingsQuery ? "page" : undefined}
                >
                  {studioAppSettingsTabLabel(id, t)}
                  {tabChanges > 0 ? (
                    <span
                      className="ml-2 inline-grid size-5 shrink-0 place-items-center rounded-full bg-accent/10 text-[0.6rem] font-bold tabular-nums text-accent"
                      aria-label={copy.changedCount(tabChanges)}
                    >
                      {tabChanges}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {normalizedSettingsQuery ? (
              <section
                className="space-y-3 p-4"
                aria-labelledby={`${titleId}-search-results`}
                role="region"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <SectionLabel>{copy.searchResults}</SectionLabel>
                    <p id={`${titleId}-search-results`} className="mt-1 text-xs font-semibold text-fg">
                      {copy.searchResultCount(matchingSearchItems.length)}
                    </p>
                    <p className="mt-0.5 text-[0.68rem] text-fg-3">{copy.searchHint}</p>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      buttonClass({ size: "sm", variant: "quiet" }),
                      "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                    )}
                    onClick={() => {
                      setSettingsQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    <X className="size-3.5" aria-hidden />
                    {copy.clearSearch}
                  </button>
                </div>
                {matchingSearchItems.length === 0 ? (
                  <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line p-6 text-center">
                    <div>
                      <Search className="mx-auto size-5 text-fg-3" aria-hidden />
                      <p className="mt-2 text-xs font-medium text-fg-2">{copy.searchEmpty}</p>
                    </div>
                  </div>
                ) : (
                  <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line bg-card/20">
                    {matchingSearchItems.slice(0, 60).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent pointer-coarse:min-h-16"
                          onClick={() => openSearchResult(item)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-fg">{item.label}</span>
                            <span className="mt-0.5 block truncate text-[0.66rem] text-fg-3">
                              {studioAppSettingsTabLabel(item.tab, t)} · {item.hint}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section
                id={`${titleId}-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`${titleId}-tab-${tab}`}
                tabIndex={0}
                className="space-y-4 p-4 outline-none"
              >
                <div className="sticky -top-4 z-20 -mx-4 -mt-4 flex items-center justify-between gap-2 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-sm">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-fg">
                      {studioAppSettingsTabLabel(tab, t)}
                    </p>
                    {changeSummary.byTab[tab] > 0 ? (
                      <p className="text-[0.64rem] font-medium text-accent">
                        {copy.changedCount(changeSummary.byTab[tab])}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={cn(
                      buttonClass({ size: "sm", variant: "quiet" }),
                      "min-h-11 shrink-0 sm:min-h-8 pointer-coarse:min-h-11",
                    )}
                    aria-label={copy.resetTabAria(studioAppSettingsTabLabel(tab, t))}
                    onClick={resetCurrentTab}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {copy.resetTab}
                  </button>
                </div>

                {tab === "general" ? (
                  <>
                    <section className="rounded-xl border border-accent/20 bg-accent-soft/35 p-3">
                      <SectionLabel>{copy.quickProfilesTitle}</SectionLabel>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        {copy.quickProfilesHint}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(
                          ["keyboard-mouse", "pen-display", "touch-tablet", "focus"] as const
                        ).map((presetId) => (
                          <PresetCard
                            key={presetId}
                            name={copy.presetNames[presetId]}
                            description={copy.presetDescriptions[presetId]}
                            onClick={() => applyPreset(presetId)}
                          />
                        ))}
                      </div>
                    </section>
                    <SectionLabel>{t("studio.settings.section.layout")}</SectionLabel>
                    <Row
                      label={t("studio.settings.general.uiDensityLabel")}
                      hint={t("studio.settings.general.uiDensityHint")}
                    >
                      <SelectChipGroup
                        value={settings.general.densityMode}
                        options={STUDIO_UI_DENSITY_MODES.map((mode) => ({
                          id: mode,
                          label: studioUiDensityLabel(mode, t),
                        }))}
                        onChange={(densityMode: StudioUiDensityMode) =>
                          patch({ general: { ...settings.general, densityMode } })
                        }
                      />
                    </Row>
                    <p className="text-[0.68rem] text-fg-3">
                      {studioUiDensityDescription(settings.general.densityMode, t)}
                    </p>
                    <Row
                      label={t("studio.settings.general.toolHintLabel")}
                      hint={t("studio.settings.general.toolHintHint")}
                    >
                      <SelectChipGroup
                        value={settings.general.toolHintMode}
                        options={STUDIO_TOOL_HINT_MODES.map((mode) => ({
                          id: mode,
                          label: studioToolHintModeLabel(mode, t),
                        }))}
                        onChange={(toolHintMode) =>
                          patch({ general: { ...settings.general, toolHintMode } })
                        }
                      />
                    </Row>
                    <Row
                      label={t("studio.settings.general.brushCursorLabel")}
                      hint={t("studio.settings.general.brushCursorHint")}
                    >
                      <SelectChipGroup
                        value={settings.general.brushCursorStyle}
                        options={[
                          { id: "outline", label: t("studio.settings.general.brushCursor.outline") },
                          { id: "dot", label: t("studio.settings.general.brushCursor.dot") },
                          { id: "none", label: t("studio.settings.general.brushCursor.none") },
                        ]}
                        onChange={(brushCursorStyle) =>
                          patch({ general: { ...settings.general, brushCursorStyle } })
                        }
                      />
                    </Row>
                    <Row
                      label={t("studio.settings.general.strokeGuideLabel")}
                      hint={t("studio.settings.general.strokeGuideHint")}
                    >
                      <StudioToggleChip
                        active={settings.general.showStrokeGuide}
                        onClick={() =>
                          patch({
                            general: {
                              ...settings.general,
                              showStrokeGuide: !settings.general.showStrokeGuide,
                            },
                          })
                        }
                      >
                        {settings.general.showStrokeGuide
                          ? t("studio.settings.general.strokeGuide.visible")
                          : t("studio.settings.general.strokeGuide.hidden")}
                      </StudioToggleChip>
                    </Row>
                    <Row label={t("studio.settings.general.clearLayerConfirmLabel")}>
                      <StudioToggleChip
                        active={settings.general.confirmBeforeClearLayer}
                        onClick={() =>
                          patch({
                            general: {
                              ...settings.general,
                              confirmBeforeClearLayer: !settings.general.confirmBeforeClearLayer,
                            },
                          })
                        }
                      >
                        {settings.general.confirmBeforeClearLayer
                          ? t("studio.settings.general.confirmBeforeClear")
                          : t("studio.settings.general.applyImmediately")}
                      </StudioToggleChip>
                    </Row>
                  </>
                ) : null}

                {tab === "shortcuts" ? (
                  <>
                    <div className="space-y-2 rounded-xl border border-line bg-card/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchField
                          value={shortcutQuery}
                          onChange={setShortcutQuery}
                          ariaLabel={copy.shortcutSearchAria}
                          placeholder={copy.shortcutSearchPlaceholder}
                        />
                        <StudioToggleChip
                          active={showShortcutConflictsOnly}
                          onClick={() => setShowShortcutConflictsOnly((value) => !value)}
                        >
                          {copy.conflictOnly}
                        </StudioToggleChip>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[0.66rem] text-fg-3">
                        <span>{t("studio.settings.shortcuts.recordingHint")}</span>
                        <span className="shrink-0 tabular-nums">
                          {copy.shortcutVisibleCount(
                            filteredShortcutActions.length,
                            STUDIO_SHORTCUT_ACTIONS.length,
                          )}
                        </span>
                      </div>
                    </div>
                    {shortcutConflictCount > 0 ? (
                      <p
                        role="status"
                        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.68rem] leading-relaxed text-amber-900 dark:text-amber-100"
                      >
                        {t("studio.settings.shortcuts.conflictHeader")
                          .replace("{count}", String(shortcutConflictCount))
                          .replace("{marker}", t("studio.settings.shortcuts.conflict"))}
                      </p>
                    ) : null}
                    {filteredShortcutActions.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-[0.7rem] text-fg-3">
                        {copy.noShortcutResults}
                      </p>
                    ) : (
                      <ul className="divide-y divide-line/60 rounded-xl border border-line">
                        {filteredShortcutActions.map((action) => {
                          const chord = settings.shortcuts[action.id] ?? "";
                          const recording = recordingAction === action.id;
                          const chordKey = chord ? normalizeStudioShortcutChordKey(chord) : null;
                          const conflictPeers = chordKey ? shortcutConflicts.get(chordKey) : undefined;
                          const hasConflict = !!conflictPeers && conflictPeers.length > 1;
                          const peerLabels = hasConflict
                            ? conflictPeers
                                .filter((id) => id !== action.id)
                                .map((id) => actionLabelById.get(id) ?? id)
                                .join(", ")
                            : "";
                          return (
                            <li
                              key={action.id}
                              className="flex min-h-12 items-center justify-between gap-2 px-3 py-2"
                            >
                              <span className="min-w-0 text-xs text-fg">
                                <span className="block">{actionLabelById.get(action.id) ?? action.label}</span>
                                {hasConflict ? (
                                  <span
                                    className="mt-0.5 block text-[0.62rem] font-medium text-amber-700 dark:text-amber-200"
                                    title={
                                      peerLabels
                                        ? t("studio.settings.shortcuts.conflictPeers").replace(
                                            "{peers}",
                                            peerLabels,
                                          )
                                        : t("studio.settings.shortcuts.noConflictHint")
                                    }
                                  >
                                    {t("studio.settings.shortcuts.conflict")}
                                    {peerLabels ? ` · ${peerLabels}` : ""}
                                  </span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                className={cn(
                                  buttonClass({
                                    size: "sm",
                                    variant: recording ? "outline" : "quiet",
                                  }),
                                  "min-h-11 min-w-[5.5rem] font-mono text-[0.7rem] sm:min-h-8 pointer-coarse:min-h-11",
                                  recording && "ring-2 ring-accent/40",
                                  hasConflict && !recording && "ring-1 ring-amber-500/50",
                                )}
                                onClick={() => setRecordingAction(recording ? null : action.id)}
                              >
                                {recording
                                  ? t("studio.settings.shortcuts.recordingState")
                                  : formatStudioShortcutChord(chord)}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button
                      type="button"
                      className={cn(
                        buttonClass({ size: "sm", variant: "quiet" }),
                        "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                      )}
                      onClick={() => commitSettings(resetStudioAppSettingsTab(settings, "shortcuts"))}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      {t("studio.settings.shortcuts.reset")}
                    </button>
                  </>
                ) : null}

                {tab === "mouse" ? (
                  <>
                    <SectionLabel>{t("studio.settings.section.mouse")}</SectionLabel>
                    <Row
                      label={t("studio.settings.mouse.wheelLabel")}
                      hint={t("studio.settings.mouse.wheelHint")}
                    >
                      <SelectChipGroup
                        value={settings.mouse.wheel}
                        options={[
                          { id: "zoom", label: t("studio.settings.mouse.wheel.zoom") },
                          { id: "pan", label: t("studio.settings.mouse.wheel.pan") },
                          { id: "brush-size", label: t("studio.settings.mouse.wheel.brushSize") },
                        ]}
                        onChange={(wheel) => patch({ mouse: { ...settings.mouse, wheel } })}
                      />
                    </Row>
                    <Row label={t("studio.settings.mouse.reverseLabel")}>
                      <StudioToggleChip
                        active={settings.mouse.reverseWheel}
                        onClick={() =>
                          patch({
                            mouse: {
                              ...settings.mouse,
                              reverseWheel: !settings.mouse.reverseWheel,
                            },
                          })
                        }
                      >
                        {settings.mouse.reverseWheel
                          ? t("studio.settings.state.enabled")
                          : t("studio.settings.state.disabled")}
                      </StudioToggleChip>
                    </Row>
                    <Row label={t("studio.settings.mouse.middleButtonLabel")}>
                      <SelectChipGroup
                        value={settings.mouse.middleButton}
                        options={[
                          { id: "pan", label: t("studio.settings.mouse.middleButton.pan") },
                          { id: "zoom", label: t("studio.settings.mouse.middleButton.zoom") },
                          {
                            id: "eyedropper",
                            label: t("studio.settings.mouse.middleButton.eyedropper"),
                          },
                          { id: "none", label: t("studio.settings.state.none") },
                        ]}
                        onChange={(middleButton) =>
                          patch({ mouse: { ...settings.mouse, middleButton } })
                        }
                      />
                    </Row>
                    <Row label={t("studio.settings.mouse.rightButtonLabel")}>
                      <SelectChipGroup
                        value={settings.mouse.rightButton}
                        options={[
                          { id: "context", label: t("studio.settings.mouse.rightButton.context") },
                          {
                            id: "eyedropper",
                            label: t("studio.settings.mouse.rightButton.eyedropper"),
                          },
                          { id: "pan", label: t("studio.settings.mouse.rightButton.pan") },
                          { id: "none", label: t("studio.settings.state.none") },
                        ]}
                        onChange={(rightButton) =>
                          patch({ mouse: { ...settings.mouse, rightButton } })
                        }
                      />
                    </Row>
                  </>
                ) : null}

                {tab === "touch" ? (
                  <>
                    <SectionLabel>{t("studio.settings.section.touchPen")}</SectionLabel>
                    <p className="text-[0.68rem] leading-relaxed text-fg-3">
                      {t("studio.settings.touch.sectionHint")}
                    </p>
                    <Row label={t("studio.settings.touch.oneFingerDragLabel")}>
                      <SelectChipGroup
                        value={settings.touch.oneFingerDrag}
                        options={[
                          { id: "draw", label: t("studio.settings.touch.oneFingerDrag.draw") },
                          { id: "pan", label: t("studio.settings.touch.oneFingerDrag.pan") },
                          { id: "none", label: t("studio.settings.state.none") },
                        ]}
                        onChange={(oneFingerDrag) =>
                          patch({ touch: { ...settings.touch, oneFingerDrag } })
                        }
                      />
                    </Row>
                    <Row label={t("studio.settings.touch.twoFingerLabel")}>
                      <SelectChipGroup
                        value={settings.touch.twoFinger}
                        options={[
                          { id: "pan-zoom", label: t("studio.settings.touch.twoFinger.panZoom") },
                          {
                            id: "undo-redo",
                            label: t("studio.settings.touch.twoFinger.undoRedo"),
                          },
                        ]}
                        onChange={(twoFinger) =>
                          patch({ touch: { ...settings.touch, twoFinger } })
                        }
                      />
                    </Row>
                    <Row label={t("studio.settings.touch.threeFingerLabel")}>
                      <SelectChipGroup
                        value={settings.touch.threeFinger}
                        options={[
                          { id: "undo", label: t("studio.settings.touch.threeFinger.undo") },
                          {
                            id: "toggle-ui",
                            label: t("studio.settings.touch.threeFinger.toggleUi"),
                          },
                          { id: "none", label: t("studio.settings.state.none") },
                        ]}
                        onChange={(threeFinger) =>
                          patch({ touch: { ...settings.touch, threeFinger } })
                        }
                      />
                    </Row>
                    <Row
                      label={t("studio.settings.touch.palmRejectionLabel")}
                      hint={t("studio.settings.touch.palmRejectionHint")}
                    >
                      <StudioToggleChip
                        active={settings.touch.palmRejection}
                        onClick={() =>
                          patch({
                            touch: {
                              ...settings.touch,
                              palmRejection: !settings.touch.palmRejection,
                            },
                          })
                        }
                      >
                        {settings.touch.palmRejection
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                    <Row
                      label={t("studio.settings.touch.toolTipHoldLabel")}
                      hint={t("studio.settings.touch.toolTipHoldHint")}
                    >
                      <label className="flex items-center gap-2 text-[0.7rem] text-fg-2">
                        <input
                          type="range"
                          min={MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}
                          max={MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}
                          step={20}
                          value={settings.touch.toolHintHoldMs}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            patch({
                              touch: {
                                ...settings.touch,
                                toolHintHoldMs: Number(event.currentTarget.value),
                              },
                            })
                          }
                          className="min-h-11 w-28 accent-accent sm:min-h-8 pointer-coarse:min-h-11"
                          aria-label={t("studio.settings.touch.toolTipHoldAria")}
                        />
                        <output className="min-w-12 tabular-nums text-fg-3">
                          {settings.touch.toolHintHoldMs}ms
                        </output>
                      </label>
                    </Row>
                  </>
                ) : null}

                {tab === "toolbar" ? (
                  <>
                    <div className="space-y-2 rounded-xl border border-line bg-card/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <SectionLabel>{t("studio.settings.section.toolbar")}</SectionLabel>
                          <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                            {t("studio.settings.toolbar.searchLiveHint")}
                          </p>
                        </div>
                        <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold tabular-nums text-fg-3">
                          {`${t("studio.settings.toolbar.visibleLabel")} ${visible.length} · ${t("studio.settings.toolbar.hiddenLabel")} ${hidden.length}`}
                        </span>
                      </div>
                      <SearchField
                        value={toolbarQuery}
                        onChange={setToolbarQuery}
                        ariaLabel={t("studio.settings.toolbar.searchAria")}
                        placeholder={t("studio.settings.toolbar.searchPlaceholder")}
                      />
                    </div>
                    <div className="grid min-h-0 gap-3 sm:grid-cols-2">
                      <section
                        className="flex min-h-0 flex-col rounded-xl border border-line bg-card/20 p-2"
                        aria-labelledby={`${titleId}-toolbar-visible`}
                      >
                        <p
                          id={`${titleId}-toolbar-visible`}
                          className="mb-2 flex items-center justify-between gap-2 px-1 text-[0.66rem] font-semibold text-fg-3"
                        >
                          <span>{t("studio.settings.toolbar.visibleLabel")}</span>
                          <span className="tabular-nums">{visibleMatches.length}</span>
                        </p>
                        <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                          {visibleMatches.map((id) => (
                            <li
                              key={id}
                              className="group flex min-h-11 items-center gap-1 rounded-lg border border-transparent bg-card/70 px-2 py-1.5 text-xs text-fg transition-colors hover:border-line hover:bg-raised"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {studioRailToolLabel(id, t)}
                              </span>
                              <button
                                type="button"
                                className={cn(
                                  buttonClass({ size: "sm", variant: "quiet" }),
                                  "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                                )}
                                aria-label={`${studioRailToolLabel(id, t)} ${t("studio.settings.toolbar.moveUp")}`}
                                disabled={visible.indexOf(id) === 0}
                                onClick={() =>
                                  patch({
                                    toolbar: { visibleIds: moveStudioRailTool(visible, id, -1) },
                                  })
                                }
                              >
                                <ChevronUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  buttonClass({ size: "sm", variant: "quiet" }),
                                  "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                                )}
                                aria-label={`${studioRailToolLabel(id, t)} ${t("studio.settings.toolbar.moveDown")}`}
                                disabled={visible.indexOf(id) === visible.length - 1}
                                onClick={() =>
                                  patch({
                                    toolbar: { visibleIds: moveStudioRailTool(visible, id, 1) },
                                  })
                                }
                              >
                                <ChevronDown className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  buttonClass({ size: "sm", variant: "quiet" }),
                                  "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                                )}
                                aria-label={`${studioRailToolLabel(id, t)} ${t("studio.settings.toolbar.hide")}`}
                                disabled={visible.length <= 1}
                                onClick={() =>
                                  patch({ toolbar: { visibleIds: hideStudioRailTool(visible, id) } })
                                }
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                            </li>
                          ))}
                          {visibleMatches.length === 0 ? (
                            <li className="rounded-lg px-2 py-6 text-center text-[0.7rem] text-fg-3">
                              {t("studio.settings.toolbar.visibleHint")}
                            </li>
                          ) : null}
                        </ul>
                      </section>
                      <section
                        className="flex min-h-0 flex-col rounded-xl border border-line border-dashed bg-card/10 p-2"
                        aria-labelledby={`${titleId}-toolbar-hidden`}
                      >
                        <p
                          id={`${titleId}-toolbar-hidden`}
                          className="mb-2 flex items-center justify-between gap-2 px-1 text-[0.66rem] font-semibold text-fg-3"
                        >
                          <span>{t("studio.settings.toolbar.hiddenLabel")}</span>
                          <span className="tabular-nums">{hiddenMatches.length}</span>
                        </p>
                        {hiddenMatches.length === 0 ? (
                          <p className="grid min-h-24 place-items-center px-2 py-5 text-center text-[0.68rem] leading-relaxed text-fg-3">
                            {normalizedToolbarQuery
                              ? t("studio.settings.toolbar.hiddenEmptyWithQuery")
                              : t("studio.settings.toolbar.hiddenEmpty")}
                          </p>
                        ) : (
                          <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                            {hiddenMatches.map((id) => (
                              <li
                                key={id}
                                className="flex min-h-11 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-2 transition-colors hover:bg-raised"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {studioRailToolLabel(id, t)}
                                </span>
                                <button
                                  type="button"
                                  className={cn(
                                    buttonClass({ size: "sm", variant: "quiet" }),
                                    "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                                  )}
                                  aria-label={`${studioRailToolLabel(id, t)} ${t("studio.settings.toolbar.show")}`}
                                  onClick={() =>
                                    patch({ toolbar: { visibleIds: showStudioRailTool(visible, id) } })
                                  }
                                >
                                  <Eye className="size-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/20 p-2.5">
                      <p className="text-[0.68rem] text-fg-3">
                        {t("studio.settings.toolbar.moveApplyHint")}
                      </p>
                      <button
                        type="button"
                        className={cn(
                          buttonClass({ size: "sm", variant: "quiet" }),
                          "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                        )}
                        aria-label={t("studio.settings.toolbar.resetAria")}
                        onClick={() =>
                          patch({ toolbar: { visibleIds: [...DEFAULT_STUDIO_RAIL_TOOL_ORDER] } })
                        }
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        {t("studio.settings.toolbar.reset")}
                      </button>
                    </div>
                  </>
                ) : null}

                {tab === "grids" ? (
                  <>
                    <SectionLabel>{t("studio.settings.section.grids")}</SectionLabel>
                    <Row
                      label={t("studio.settings.grids.canvasRulerLabel")}
                      hint={t("studio.settings.grids.canvasRulerHint")}
                    >
                      <StudioToggleChip
                        active={settings.grids.showCanvasRulers}
                        onClick={() =>
                          patch({
                            grids: {
                              ...settings.grids,
                              showCanvasRulers: !settings.grids.showCanvasRulers,
                            },
                          })
                        }
                      >
                        {settings.grids.showCanvasRulers
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                    <Row
                      label={t("studio.settings.grids.pixelGridLabel")}
                      hint={t("studio.settings.grids.pixelGridHint")}
                    >
                      <StudioToggleChip
                        active={settings.grids.showPixelGrid}
                        onClick={() =>
                          patch({
                            grids: {
                              ...settings.grids,
                              showPixelGrid: !settings.grids.showPixelGrid,
                            },
                          })
                        }
                      >
                        {settings.grids.showPixelGrid
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                    <Row label={t("studio.settings.grids.gridSizeLabel")}>
                      <select
                        value={settings.grids.pixelGridSize}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          patch({
                            grids: {
                              ...settings.grids,
                              pixelGridSize: Number(event.currentTarget.value),
                            },
                          })
                        }
                        className="min-h-11 rounded-md border border-line bg-card px-2 py-1 text-xs text-fg sm:min-h-8 pointer-coarse:min-h-11"
                      >
                        {STUDIO_PIXEL_GRID_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}px
                          </option>
                        ))}
                      </select>
                    </Row>
                    <Row
                      label={t("studio.settings.grids.snapLabel")}
                      hint={t("studio.settings.grids.snapHint")}
                    >
                      <StudioToggleChip
                        active={settings.grids.snapToPixelGrid}
                        onClick={() =>
                          patch({
                            grids: {
                              ...settings.grids,
                              snapToPixelGrid: !settings.grids.snapToPixelGrid,
                            },
                          })
                        }
                      >
                        {settings.grids.snapToPixelGrid
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                    <Row
                      label={t("studio.settings.grids.alignGuideLabel")}
                      hint={t("studio.settings.grids.alignGuideHint")}
                    >
                      <StudioToggleChip
                        active={settings.grids.showAlignmentGuides}
                        onClick={() =>
                          patch({
                            grids: {
                              ...settings.grids,
                              showAlignmentGuides: !settings.grids.showAlignmentGuides,
                            },
                          })
                        }
                      >
                        {settings.grids.showAlignmentGuides
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                    <Row label={t("studio.settings.grids.isometricLabel")}>
                      <StudioToggleChip
                        active={settings.grids.showIsometricOnDraw}
                        onClick={() =>
                          patch({
                            grids: {
                              ...settings.grids,
                              showIsometricOnDraw: !settings.grids.showIsometricOnDraw,
                            },
                          })
                        }
                      >
                        {settings.grids.showIsometricOnDraw
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>
                  </>
                ) : null}

                {tab === "other" ? (
                  <>
                    <SectionLabel>{t("studio.settings.section.other")}</SectionLabel>
                    <div className="rounded-xl border border-line bg-card/40 p-3">
                      <StudioPressureCurveGraph
                        pressureCurve={settings.other.pressureCurve}
                        onPressureCurveChange={(pressureCurve) =>
                          patch({ other: { ...settings.other, pressureCurve } })
                        }
                      />
                      <p className="mt-2 text-[0.68rem] text-fg-3">
                        {t("studio.settings.other.pressureHint")}
                      </p>
                    </div>
                    <Row
                      label={t("studio.settings.other.motionReduceLabel")}
                      hint={t("studio.settings.other.motionReduceHint")}
                    >
                      <StudioToggleChip
                        active={settings.other.reduceMotion}
                        onClick={() =>
                          patch({
                            other: {
                              ...settings.other,
                              reduceMotion: !settings.other.reduceMotion,
                            },
                          })
                        }
                      >
                        {settings.other.reduceMotion
                          ? t("studio.settings.state.on")
                          : t("studio.settings.state.off")}
                      </StudioToggleChip>
                    </Row>

                    <section className="rounded-xl border border-line bg-card/40 p-3">
                      <div className="flex items-start gap-2">
                        <FileJson2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-fg">{copy.profileTitle}</p>
                          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                            {copy.profileHint}
                          </p>
                          <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
                            {copy.profilePrivacy}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={cn(
                            buttonClass({ size: "sm", variant: "outline" }),
                            "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                          )}
                          onClick={exportProfile}
                        >
                          <Download className="size-3.5" aria-hidden />
                          {copy.exportProfile}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            buttonClass({ size: "sm", variant: "outline" }),
                            "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                          )}
                          onClick={() => importInputRef.current?.click()}
                        >
                          <Upload className="size-3.5" aria-hidden />
                          {copy.importProfile}
                        </button>
                        <input
                          ref={importInputRef}
                          type="file"
                          accept="application/json,.json"
                          className="sr-only"
                          aria-label={copy.importAria}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            void importProfile(event);
                          }}
                        />
                      </div>
                    </section>

                    <div className="rounded-xl border border-bad/30 bg-bad/5 p-3">
                      <p className="text-xs font-semibold text-fg">
                        {t("studio.settings.other.resetSectionTitle")}
                      </p>
                      <p className="mt-0.5 text-[0.68rem] text-fg-3">
                        {t("studio.settings.other.resetHint")}
                      </p>
                      <button
                        type="button"
                        className={cn(
                          buttonClass({ size: "sm", variant: "quiet" }),
                          "mt-2 min-h-11 text-bad sm:min-h-8 pointer-coarse:min-h-11",
                        )}
                        onClick={() => {
                          void runStudioDestructiveAction({
                            request: studioResetApplicationSettingsRequest(),
                            execute: onResetAll,
                          });
                        }}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        {t("studio.settings.other.reset")}
                      </button>
                    </div>
                  </>
                ) : null}
              </section>
            )}
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1" aria-live="polite">
            {operationStatus ? (
              <p className="mb-1 flex items-start gap-1.5 text-[0.68rem] font-medium leading-snug text-accent">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{operationStatus}</span>
              </p>
            ) : null}
            {persistenceState === "session-only" ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] leading-snug text-warning"
              >
                <span>{t("studio.settings.other.persistenceSessionWarning")}</span>
                {onRetryPersistence ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg px-2 font-semibold underline decoration-warning/50 underline-offset-2 hover:bg-warning/10 sm:min-h-9 pointer-coarse:min-h-11"
                    aria-label={t("studio.settings.other.persistenceRetry")}
                    onClick={onRetryPersistence}
                  >
                    {t("studio.settings.other.persistenceRetry")}
                  </button>
                ) : null}
              </div>
            ) : persistenceState === "loading" ? (
              <p
                className="text-[0.68rem] text-fg-3"
                data-studio-app-settings-persistence="loading"
              >
                {copy.loadingPersistence}
              </p>
            ) : (
              <p className="text-[0.68rem] text-fg-3">
                {t("studio.settings.other.persistenceSaved")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {changeSummary.total > 0 ? (
              <>
                <span className="rounded-full border border-accent/20 bg-accent-soft px-2 py-1 text-[0.64rem] font-semibold tabular-nums text-accent sm:hidden">
                  {copy.changedCount(changeSummary.total)}
                </span>
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: "quiet" }),
                    "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
                  )}
                  aria-label={copy.revertSessionAria}
                  onClick={revertSessionChanges}
                >
                  <Undo2 className="size-3.5" aria-hidden />
                  {copy.revertSession}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={cn(
                buttonClass({ size: "sm", variant: "outline" }),
                "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
              )}
              onClick={onClose}
            >
              {t("studio.settings.state.save")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
