/**
 * Application Settings modal — tabs:
 * General · Shortcuts · Mouse · Touch · Toolbar · Grids · Other
 * Warm-ink design tokens only; no external brand styling.
 */
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  formatStudioShortcutChord,
  hideStudioRailTool,
  listStudioShortcutConflicts,
  moveStudioRailTool,
  normalizeStudioShortcutChordKey,
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

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export type StudioAppSettingsPanelProps = {
  open: boolean;
  settings: StudioAppSettings;
  initialTab?: StudioAppSettingsTab;
  persistenceState?: "saved" | "session-only";
  onClose: () => void;
  onChange: (next: StudioAppSettings) => void;
  onResetAll: () => void;
  onRetryPersistence?: () => void;
};

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
  children: React.ReactNode;
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
  onChange: (v: T) => void;
}): ReactElement {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <StudioToggleChip key={opt.id} active={value === opt.id} onClick={() => onChange(opt.id)}>
          {opt.label}
        </StudioToggleChip>
      ))}
    </span>
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
  const titleId = useId();
  const [tab, setTab] = useState<StudioAppSettingsTab>(initialTab);
  const [recordingAction, setRecordingAction] = useState<StudioShortcutActionId | null>(null);
  const [toolbarQuery, setToolbarQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissModal = useEffectEvent(() => {
    if (recordingAction) {
      setRecordingAction(null);
      return;
    }
    onClose();
  });

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setToolbarQuery("");
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !recordingAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingAction(null);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        onChange({
          ...settings,
          shortcuts: { ...settings.shortcuts, [recordingAction]: "" },
        });
        setRecordingAction(null);
        return;
      }
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("Mod");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      let key = "";
      if (e.code === "BracketLeft") key = "[";
      else if (e.code === "BracketRight") key = "]";
      else if (e.code === "Tab") key = "Tab";
      else if (e.key === "?") key = "?";
      else if (e.key.length === 1) key = e.key.toUpperCase();
      else if (e.key !== "Control" && e.key !== "Meta" && e.key !== "Shift" && e.key !== "Alt") {
        key = e.key;
      }
      if (!key) return;
      parts.push(key);
      onChange({
        ...settings,
        shortcuts: { ...settings.shortcuts, [recordingAction]: parts.join("+") },
      });
      setRecordingAction(null);
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [open, recordingAction, settings, onChange]);

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

  const patch = (partial: Partial<StudioAppSettings>) => onChange({ ...settings, ...partial });
  const visible = settings.toolbar.visibleIds;
  const hidden = studioRailHiddenIds(visible);
  const normalizedToolbarQuery = toolbarQuery.trim().normalize("NFKC").toLocaleLowerCase();
  const matchesToolbarQuery = (id: (typeof DEFAULT_STUDIO_RAIL_TOOL_ORDER)[number]) =>
    !normalizedToolbarQuery
    || studioRailToolLabel(id).normalize("NFKC").toLocaleLowerCase().includes(normalizedToolbarQuery);
  const visibleMatches = visible.filter(matchesToolbarQuery);
  const hiddenMatches = hidden.filter(matchesToolbarQuery);
  const shortcutConflicts = listStudioShortcutConflicts(settings.shortcuts);
  const shortcutConflictCount = shortcutConflicts.size;
  const actionLabelById = new Map(STUDIO_SHORTCUT_ACTIONS.map((a) => [a.id, a.label]));

  const body = (
    <div
      className="fixed inset-0 z-[95] grid place-items-end bg-[oklch(0.08_0.01_70/0.55)] p-0 sm:place-items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-accent" aria-hidden />
            <div>
              <h2 id={titleId} className="text-sm font-bold text-fg">
                애플리케이션 설정
              </h2>
              <p className="text-[0.68rem] text-fg-3">툴바 · 단축키 · 마우스 · 터치 · 그리드 · 기타</p>
            </div>
          </div>
          <button
            type="button"
            className={cn(
              buttonClass({ size: "sm", variant: "quiet" }),
              "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            )}
            onClick={onClose}
            aria-label="설정 닫기"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-36 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
            aria-label="설정 탭"
          >
            {STUDIO_APP_SETTINGS_TABS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 min-w-11 shrink-0 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition sm:min-h-8 sm:min-w-0 sm:py-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:py-2",
                  tab === id
                    ? "bg-accent-soft text-accent ring-1 ring-accent/20"
                    : "text-fg-2 hover:bg-raised hover:text-fg"
                )}
                aria-current={tab === id ? "page" : undefined}
              >
                {studioAppSettingsTabLabel(id)}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {tab === "general" ? (
              <>
                <SectionLabel>레이아웃</SectionLabel>
                <Row label="UI 밀도" hint="슈퍼심플 / 심플 / 전체 3단 레이아웃 모드">
                  <SelectChipGroup
                    value={settings.general.densityMode}
                    options={STUDIO_UI_DENSITY_MODES.map((m) => ({
                      id: m,
                      label: studioUiDensityLabel(m),
                    }))}
                    onChange={(densityMode: StudioUiDensityMode) =>
                      patch({ general: { ...settings.general, densityMode } })
                    }
                  />
                </Row>
                <p className="text-[0.68rem] text-fg-3">
                  {studioUiDensityDescription(settings.general.densityMode)}
                </p>
                <Row
                  label="도구 도움말"
                  hint="간단은 이름·설명만, 동작 미리보기는 애니메이션 코치까지 보여 줍니다"
                >
                  <SelectChipGroup
                    value={settings.general.toolHintMode}
                    options={STUDIO_TOOL_HINT_MODES.map((mode) => ({
                      id: mode,
                      label: studioToolHintModeLabel(mode),
                    }))}
                    onChange={(toolHintMode) =>
                      patch({ general: { ...settings.general, toolHintMode } })
                    }
                  />
                </Row>
                <Row
                  label="브러시 커서"
                  hint="윤곽은 실제 브러시 크기를, 점은 중심만 표시합니다. 시스템은 십자 포인터만 사용합니다"
                >
                  <SelectChipGroup
                    value={settings.general.brushCursorStyle}
                    options={[
                      { id: "outline", label: "윤곽" },
                      { id: "dot", label: "점" },
                      { id: "none", label: "시스템" },
                    ]}
                    onChange={(brushCursorStyle) =>
                      patch({ general: { ...settings.general, brushCursorStyle } })
                    }
                  />
                </Row>
                <Row label="레이어 비우기 확인">
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
                    {settings.general.confirmBeforeClearLayer ? "확인" : "바로 실행"}
                  </StudioToggleChip>
                </Row>
              </>
            ) : null}

            {tab === "shortcuts" ? (
              <>
                <SectionLabel>키보드 단축키</SectionLabel>
                <p className="text-[0.68rem] leading-relaxed text-fg-3">
                  행을 누른 뒤 원하는 키 조합을 입력하세요. Backspace로 해제, Esc로 녹화를 취소합니다.
                  Mod는 macOS ⌘ / Windows Ctrl입니다.
                </p>
                {shortcutConflictCount > 0 ? (
                  <p
                    role="status"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.68rem] leading-relaxed text-amber-900 dark:text-amber-100"
                  >
                    같은 키 조합이 {shortcutConflictCount}곳 이상에 중복 할당되어 있습니다. 아래 행의
                    「충돌」표시를 확인하세요.
                  </p>
                ) : null}
                <ul className="divide-y divide-line/60 rounded-xl border border-line">
                  {STUDIO_SHORTCUT_ACTIONS.map((action) => {
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
                      <li key={action.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 text-xs text-fg">
                          <span className="block">{action.label}</span>
                          {hasConflict ? (
                            <span
                              className="mt-0.5 block text-[0.62rem] font-medium text-amber-700 dark:text-amber-200"
                              title={peerLabels ? `충돌: ${peerLabels}` : "단축키 충돌"}
                            >
                              충돌{peerLabels ? ` · ${peerLabels}` : ""}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            buttonClass({ size: "sm", variant: recording ? "outline" : "quiet" }),
                            "min-h-11 min-w-[5.5rem] font-mono text-[0.7rem] sm:min-h-8 pointer-coarse:min-h-11",
                            recording && "ring-2 ring-accent/40",
                            hasConflict && !recording && "ring-1 ring-amber-500/50"
                          )}
                          onClick={() => setRecordingAction(recording ? null : action.id)}
                        >
                          {recording ? "키 입력…" : formatStudioShortcutChord(chord)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: "quiet" }),
                    "min-h-11 sm:min-h-8 pointer-coarse:min-h-11"
                  )}
                  onClick={() =>
                    patch({
                      shortcuts: Object.fromEntries(
                        STUDIO_SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKeys])
                      ) as StudioAppSettings["shortcuts"],
                    })
                  }
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  단축키 기본값
                </button>
              </>
            ) : null}

            {tab === "mouse" ? (
              <>
                <SectionLabel>마우스</SectionLabel>
                <Row label="휠" hint="스크롤 시 동작">
                  <SelectChipGroup
                    value={settings.mouse.wheel}
                    options={[
                      { id: "zoom", label: "줌" },
                      { id: "pan", label: "팬" },
                      { id: "brush-size", label: "브러시 크기" },
                    ]}
                    onChange={(wheel) => patch({ mouse: { ...settings.mouse, wheel } })}
                  />
                </Row>
                <Row label="휠 방향 반전">
                  <StudioToggleChip
                    active={settings.mouse.reverseWheel}
                    onClick={() =>
                      patch({ mouse: { ...settings.mouse, reverseWheel: !settings.mouse.reverseWheel } })
                    }
                  >
                    {settings.mouse.reverseWheel ? "반전" : "기본"}
                  </StudioToggleChip>
                </Row>
                <Row label="가운데 버튼">
                  <SelectChipGroup
                    value={settings.mouse.middleButton}
                    options={[
                      { id: "pan", label: "팬" },
                      { id: "zoom", label: "줌" },
                      { id: "eyedropper", label: "스포이드" },
                      { id: "none", label: "없음" },
                    ]}
                    onChange={(middleButton) => patch({ mouse: { ...settings.mouse, middleButton } })}
                  />
                </Row>
                <Row label="오른쪽 버튼">
                  <SelectChipGroup
                    value={settings.mouse.rightButton}
                    options={[
                      { id: "context", label: "메뉴" },
                      { id: "eyedropper", label: "스포이드" },
                      { id: "pan", label: "팬" },
                      { id: "none", label: "없음" },
                    ]}
                    onChange={(rightButton) => patch({ mouse: { ...settings.mouse, rightButton } })}
                  />
                </Row>
              </>
            ) : null}

            {tab === "touch" ? (
              <>
                <SectionLabel>터치 · 펜</SectionLabel>
                <p className="text-[0.68rem] leading-relaxed text-fg-3">
                  Apple Pencil 등 펜을 쓸 때는 한 손가락 드래그를「없음」또는「팬」으로 두면 손바닥
                  오입력을 줄일 수 있습니다. 손가락으로 그리려면「그리기」로 두세요.
                </p>
                <Row label="한 손가락 드래그">
                  <SelectChipGroup
                    value={settings.touch.oneFingerDrag}
                    options={[
                      { id: "draw", label: "그리기" },
                      { id: "pan", label: "팬" },
                      { id: "none", label: "없음" },
                    ]}
                    onChange={(oneFingerDrag) => patch({ touch: { ...settings.touch, oneFingerDrag } })}
                  />
                </Row>
                <Row label="두 손가락">
                  <SelectChipGroup
                    value={settings.touch.twoFinger}
                    options={[
                      { id: "pan-zoom", label: "팬·줌" },
                      { id: "undo-redo", label: "실행취소·다시" },
                    ]}
                    onChange={(twoFinger) => patch({ touch: { ...settings.touch, twoFinger } })}
                  />
                </Row>
                <Row label="세 손가락 탭">
                  <SelectChipGroup
                    value={settings.touch.threeFinger}
                    options={[
                      { id: "undo", label: "실행취소" },
                      { id: "toggle-ui", label: "UI 토글" },
                      { id: "none", label: "없음" },
                    ]}
                    onChange={(threeFinger) => patch({ touch: { ...settings.touch, threeFinger } })}
                  />
                </Row>
                <Row label="손바닥 거부" hint="펜 획 중 터치 입력을 무시합니다">
                  <StudioToggleChip
                    active={settings.touch.palmRejection}
                    onClick={() =>
                      patch({
                        touch: { ...settings.touch, palmRejection: !settings.touch.palmRejection },
                      })
                    }
                  >
                    {settings.touch.palmRejection ? "켜짐" : "꺼짐"}
                  </StudioToggleChip>
                </Row>
                <Row
                  label="도움말 길게 누르기"
                  hint="도구를 실행하지 않고 Motion Coach를 여는 터치 대기 시간"
                >
                  <label className="flex items-center gap-2 text-[0.7rem] text-fg-2">
                    <input
                      type="range"
                      min={MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}
                      max={MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}
                      step={20}
                      value={settings.touch.toolHintHoldMs}
                      onChange={(event) =>
                        patch({
                          touch: {
                            ...settings.touch,
                            toolHintHoldMs: Number(event.target.value),
                          },
                        })
                      }
                      className="min-h-11 w-28 accent-accent sm:min-h-8 pointer-coarse:min-h-11"
                      aria-label="도구 도움말 길게 누르기 시간"
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
                <div className="sticky -top-4 z-10 -mx-4 -mt-4 space-y-2 border-b border-line bg-panel/95 px-4 pb-3 pt-4 backdrop-blur-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <SectionLabel>툴바 사용자 정의</SectionLabel>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        보이는 도구의 순서를 바꾸거나 숨길 수 있어요. 단축키는 숨겨도 그대로 동작합니다.
                      </p>
                    </div>
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold tabular-nums text-fg-3">
                      표시 {visible.length} · 숨김 {hidden.length}
                    </span>
                  </div>
                  <label className="relative block">
                    <span className="sr-only">툴바 도구 검색</span>
                    <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
                    <input
                      type="search"
                      value={toolbarQuery}
                      onChange={(event) => setToolbarQuery(event.target.value.slice(0, 80))}
                      placeholder="도구 이름 검색"
                      className="h-11 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-10 pointer-coarse:h-11 pointer-coarse:min-h-11"
                    />
                  </label>
                </div>
                <div className="grid min-h-0 gap-3 sm:grid-cols-2">
                  <section className="flex min-h-0 flex-col rounded-xl border border-line bg-card/20 p-2" aria-labelledby={`${titleId}-toolbar-visible`}>
                    <p id={`${titleId}-toolbar-visible`} className="mb-2 flex items-center justify-between gap-2 px-1 text-[0.66rem] font-semibold text-fg-3">
                      <span>표시 중</span>
                      <span className="tabular-nums">{visibleMatches.length}</span>
                    </p>
                    <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                      {visibleMatches.map((id) => (
                        <li
                          key={id}
                          className="group flex min-h-11 items-center gap-1 rounded-lg border border-transparent bg-card/70 px-2 py-1.5 text-xs text-fg transition-colors hover:border-line hover:bg-raised"
                        >
                          <span className="min-w-0 flex-1 truncate">{studioRailToolLabel(id)}</span>
                          <button
                            type="button"
                            className={cn(
                              buttonClass({ size: "sm", variant: "quiet" }),
                              "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                            )}
                            aria-label={`${studioRailToolLabel(id)} 위로`}
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
                              "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                            )}
                            aria-label={`${studioRailToolLabel(id)} 아래로`}
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
                              "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                            )}
                            aria-label={`${studioRailToolLabel(id)} 숨기기`}
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
                          표시 중인 도구에서 검색 결과가 없어요.
                        </li>
                      ) : null}
                    </ul>
                  </section>
                  <section className="flex min-h-0 flex-col rounded-xl border border-line border-dashed bg-card/10 p-2" aria-labelledby={`${titleId}-toolbar-hidden`}>
                    <p id={`${titleId}-toolbar-hidden`} className="mb-2 flex items-center justify-between gap-2 px-1 text-[0.66rem] font-semibold text-fg-3">
                      <span>숨김 · 더보기에서 사용</span>
                      <span className="tabular-nums">{hiddenMatches.length}</span>
                    </p>
                    {hiddenMatches.length === 0 ? (
                      <p className="grid min-h-24 place-items-center px-2 py-5 text-center text-[0.68rem] leading-relaxed text-fg-3">
                        {normalizedToolbarQuery ? "숨긴 도구에서 검색 결과가 없어요." : "숨긴 도구가 없어요."}
                      </p>
                    ) : (
                      <ul className="max-h-[min(26rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                        {hiddenMatches.map((id) => (
                          <li
                            key={id}
                            className="flex min-h-11 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-2 transition-colors hover:bg-raised"
                          >
                            <span className="min-w-0 flex-1 truncate">{studioRailToolLabel(id)}</span>
                            <button
                              type="button"
                              className={cn(
                                buttonClass({ size: "sm", variant: "quiet" }),
                                "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                              )}
                              aria-label={`${studioRailToolLabel(id)} 표시`}
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
                  <p className="text-[0.68rem] text-fg-3">순서와 표시 상태는 즉시 적용됩니다.</p>
                  <button
                    type="button"
                    className={cn(
                      buttonClass({ size: "sm", variant: "quiet" }),
                      "min-h-11 sm:min-h-8 pointer-coarse:min-h-11"
                    )}
                    onClick={() =>
                      patch({ toolbar: { visibleIds: [...DEFAULT_STUDIO_RAIL_TOOL_ORDER] } })
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    툴바 기본값
                  </button>
                </div>
              </>
            ) : null}

            {tab === "grids" ? (
              <>
                <SectionLabel>그리드</SectionLabel>
                <Row label="픽셀 격자 표시" hint="확대 시 정렬용 격자">
                  <StudioToggleChip
                    active={settings.grids.showPixelGrid}
                    onClick={() =>
                      patch({
                        grids: { ...settings.grids, showPixelGrid: !settings.grids.showPixelGrid },
                      })
                    }
                  >
                    {settings.grids.showPixelGrid ? "켜짐" : "꺼짐"}
                  </StudioToggleChip>
                </Row>
                <Row label="격자 간격">
                  <select
                    value={settings.grids.pixelGridSize}
                    onChange={(e) =>
                      patch({
                        grids: { ...settings.grids, pixelGridSize: Number(e.target.value) },
                      })
                    }
                    className="min-h-11 rounded-md border border-line bg-card px-2 py-1 text-xs text-fg sm:min-h-8 pointer-coarse:min-h-11"
                  >
                    {STUDIO_PIXEL_GRID_SIZE_OPTIONS.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}px
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="격자에 스냅" hint="배치·드래그 시 격자 정렬">
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
                    {settings.grids.snapToPixelGrid ? "켜짐" : "꺼짐"}
                  </StudioToggleChip>
                </Row>
                <Row label="드로잉 시 아이소메트릭 힌트">
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
                    {settings.grids.showIsometricOnDraw ? "켜짐" : "꺼짐"}
                  </StudioToggleChip>
                </Row>
              </>
            ) : null}

            {tab === "other" ? (
              <>
                <SectionLabel>필압 · 기타</SectionLabel>
                <div className="rounded-xl border border-line bg-card/40 p-3">
                  <StudioPressureCurveGraph
                    pressureCurve={settings.other.pressureCurve}
                    onPressureCurveChange={(pressureCurve) =>
                      patch({ other: { ...settings.other, pressureCurve } })
                    }
                  />
                  <p className="mt-2 text-[0.68rem] text-fg-3">
                    값이 작을수록 약한 압력에도 두꺼워지고, 클수록 단단한 필압 느낌이 납니다.
                  </p>
                </div>
                <Row label="모션 줄이기" hint="애니메이션·마칭앤츠 등 움직임 완화">
                  <StudioToggleChip
                    active={settings.other.reduceMotion}
                    onClick={() =>
                      patch({
                        other: { ...settings.other, reduceMotion: !settings.other.reduceMotion },
                      })
                    }
                  >
                    {settings.other.reduceMotion ? "켜짐" : "꺼짐"}
                  </StudioToggleChip>
                </Row>
                <div className="rounded-xl border border-bad/30 bg-bad/5 p-3">
                  <p className="text-xs font-semibold text-fg">모든 설정 초기화</p>
                  <p className="mt-0.5 text-[0.68rem] text-fg-3">
                    단축키·툴바·마우스·터치·그리드·필압을 기본값으로 되돌립니다.
                  </p>
                  <button
                    type="button"
                    className={cn(
                      buttonClass({ size: "sm", variant: "quiet" }),
                      "mt-2 min-h-11 text-bad sm:min-h-8 pointer-coarse:min-h-11"
                    )}
                    onClick={() => {
                      if (
                        globalThis.confirm?.(
                          "애플리케이션 설정을 모두 기본값으로 되돌릴까요? 이 작업은 문서 내용에는 영향을 주지 않습니다."
                        )
                      ) {
                        onResetAll();
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    기본값으로 재설정
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {persistenceState === "session-only" ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] leading-snug text-warning"
              >
                <span>브라우저 저장소에 저장하지 못해 현재 세션에만 적용됩니다.</span>
                {onRetryPersistence ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg px-2 font-semibold underline decoration-warning/50 underline-offset-2 hover:bg-warning/10 sm:min-h-9 pointer-coarse:min-h-11"
                    onClick={onRetryPersistence}
                  >
                    다시 저장
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-[0.68rem] text-fg-3">변경 내용은 이 기기에 자동 저장됩니다.</p>
            )}
          </div>
          <button
            type="button"
            className={cn(
              buttonClass({ size: "sm", variant: "outline" }),
              "min-h-11 sm:min-h-8 pointer-coarse:min-h-11"
            )}
            onClick={onClose}
          >
            완료
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
