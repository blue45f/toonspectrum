import {
  ArrowLeft,
  Layers3,
  Map,
  PaintBucket,
  PanelRightOpen,
  PanelsTopLeft,
  Pin,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { requestStudioCommandSearch } from "./studio-help-center-channel";
import {
  STUDIO_DOCUMENT_INSPECTOR_SECTIONS,
  STUDIO_IMAGE_INSPECTOR_SECTIONS,
  STUDIO_INSPECTOR_PRIMARY_TABS,
  navigateStudioInspector,
  type StudioDocumentInspectorSection,
  type StudioImageInspectorSection,
  type StudioInspectorLayout,
  type StudioInspectorPrimaryTab,
  type StudioInspectorRoute,
} from "./studio-inspector-layout";
import {
  ensureStudioInspectorPanelPrimaryTabVisible,
  getServerStudioInspectorPanelState,
  getStudioInspectorPanelState,
  resetStudioInspectorPanelState,
  setStudioInspectorPanelCompactPrimaryTabs,
  setStudioInspectorPanelContextPinned,
  setStudioInspectorPanelPrimaryTabVisible,
  subscribeStudioInspectorPanelState,
} from "./studio-inspector-panel-preferences";
import {
  createStudioInspectorTabA11y,
  type StudioInspectorTabA11y,
} from "./studio-inspector-tab-a11y";
import { STUDIO_FOCUS_RING, StudioContextPill } from "./studio-panel-ui";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface StudioInspectorNavigatorProps {
  layout: StudioInspectorLayout;
  tabA11y?: StudioInspectorTabA11y;
  selectedType: string | null;
  selectionLabel: string | null;
  selectionCount?: number;
  drawing: boolean;
  drawingToolPropertiesAvailable?: boolean;
  /**
   * CSP의 도구 팔레트처럼 선택 항목이 없어도 전문 도구를 찾고 준비 조건을 확인할 수
   * 있게 한다. 생략하면 기존 선택 타입 기반 동작을 유지한다.
   */
  imageToolsAvailable?: boolean;
  /** Active professional-tool target state, resolved by the Inspector availability policy. */
  imageToolsStatusLabel?: string;
  imageToolsStatusDescription?: string;
  imageToolsStatusTone?: "neutral" | "accent" | "good" | "warn";
  layerCount: number;
  mobileSheetHandle?: ReactNode;
  onRequestClose?: () => void;
  onChange: (layout: StudioInspectorLayout) => void;
}

/* ----------------------------------------------------------------- copy */

/**
 * 한 개념은 한 이름으로 부른다. 내부 모델의 properties/document 이름은 유지하되,
 * 화면에서는 사용자가 지금 무엇을 바꾸는지 바로 이해할 수 있는 말로 표시한다.
 */
const COPY = {
  panelTitle: ["studio.inspector.panel.title", "설정"],
  panelHint: [
    "studio.inspector.panel.hint",
    "선택 항목 · 레이어 · 페이지 설정을 한곳에서 바꿉니다",
  ],
  tabTarget: ["studio.inspector.tab.target", "선택 항목"],
  tabLayers: ["studio.inspector.tab.layers", "레이어"],
  tabDocument: ["studio.inspector.tab.document", "페이지"],
  tablist: ["studio.inspector.tablist", "스튜디오 설정"],
  search: ["studio.inspector.search", "찾기"],
  searchLabel: ["studio.inspector.search.label", "기능·설정 찾기"],
  close: ["studio.inspector.close", "설정 닫기"],
  openTarget: ["studio.inspector.openTarget", "설정 열기"],
  openTargetSelection: [
    "studio.inspector.openTarget.selection",
    "선택한 그림·글자·말풍선의 설정을 바로 엽니다",
  ],
  openTargetTool: [
    "studio.inspector.openTarget.tool",
    "현재 그리기 도구의 설정을 바로 엽니다",
  ],
  currentTool: ["studio.inspector.currentTool", "현재 도구 설정"],
  publishTitle: ["studio.inspector.publish.title", "작품 정보"],
  publishHint: [
    "studio.inspector.publish.hint",
    "작품 정보와 게시 준비에 필요한 내용을 확인합니다",
  ],
  publishBack: ["studio.inspector.publish.back", "편집으로 돌아가기"],
  imageTablist: ["studio.inspector.imageTablist", "이미지 설정"],
  documentTablist: ["studio.inspector.documentTablist", "페이지 설정"],
  summaryLayers: ["studio.inspector.summary.layers", "순서·그룹·표시 상태"],
  summaryPublish: ["studio.inspector.summary.publish", "게시 준비"],
  summaryDrawing: ["studio.inspector.summary.drawing", "현재 도구"],
  summaryEmpty: [
    "studio.inspector.summary.empty",
    "그림·글자·말풍선을 선택하면 설정을 바꿀 수 있어요",
  ],
  summaryElement: ["studio.inspector.summary.element", "선택 항목"],
  pin: ["studio.inspector.panel.pin", "현재 전문 탭 고정"],
  unpin: ["studio.inspector.panel.unpin", "선택에 따라 전문 탭 다시 전환"],
  pinned: ["studio.inspector.panel.pinned", "전문 탭 고정"],
  pinnedHint: [
    "studio.inspector.panel.pinnedHint",
    "선택이 바뀌어도 이미지 전문 탭을 자동 초기화하지 않습니다",
  ],
  options: ["studio.inspector.panel.options", "작업 패널 구성"],
  closeOptions: [
    "studio.inspector.panel.options.close",
    "작업 패널 구성 닫기",
  ],
  optionsHint: [
    "studio.inspector.panel.optionsHint",
    "자주 쓰는 탭만 남기고 패널 높이를 줄일 수 있습니다",
  ],
  visibleTabs: ["studio.inspector.panel.visibleTabs", "표시할 탭"],
  compactTabs: ["studio.inspector.panel.compactTabs", "탭 이름을 아이콘으로 접기"],
  compactTabsHint: [
    "studio.inspector.panel.compactTabsHint",
    "탭의 접근 가능한 이름은 유지하고 세로 공간만 줄입니다",
  ],
  resetPanel: ["studio.inspector.panel.reset", "패널 기본값 복원"],
  hiddenSearchHint: [
    "studio.inspector.panel.hiddenSearchHint",
    "숨긴 탭은 기능·설정 찾기로 열면 자동으로 다시 표시됩니다",
  ],
} as const satisfies Record<string, readonly [string, string]>;

type CopyKey = keyof typeof COPY;

function useInspectorCopy(): (key: CopyKey) => string {
  const t = useT();
  return (key) => {
    const [localeKey, fallback] = COPY[key];
    const text = t(localeKey);
    return text === localeKey ? fallback : text;
  };
}

const IMAGE_TAB_META: Readonly<
  Record<StudioImageInspectorSection, { label: string; icon: typeof Sparkles }>
> = {
  quick: { label: "빠른 수정", icon: Sparkles },
  fill: { label: "채우기·선화", icon: PaintBucket },
  transform: { label: "크기·회전", icon: Map },
  retouch: { label: "선택·보정", icon: SlidersHorizontal },
  mask: { label: "가리기", icon: Layers3 },
};

/**
 * 이미지 하위 탭은 단일 정본 순서(`STUDIO_IMAGE_INSPECTOR_SECTIONS`)에서 파생한다.
 * 모델과 표시가 따로 순서를 들고 있던 것이 감사 P1 결함이었다.
 */
const IMAGE_TABS = STUDIO_IMAGE_INSPECTOR_SECTIONS.map((id) => ({ id, ...IMAGE_TAB_META[id] }));

const DOCUMENT_TAB_META: Readonly<
  Record<StudioDocumentInspectorSection, { label: string; icon: typeof PanelsTopLeft }>
> = {
  canvas: { label: "페이지", icon: PanelsTopLeft },
  grade: { label: "색상 보정", icon: SlidersHorizontal },
  navigator: { label: "긴 원고 미니맵", icon: Map },
};

const DOCUMENT_TABS = STUDIO_DOCUMENT_INSPECTOR_SECTIONS.map((id) => ({
  id,
  ...DOCUMENT_TAB_META[id],
}));

const PRIMARY_TAB_ICONS: Readonly<Record<StudioInspectorPrimaryTab, typeof SlidersHorizontal>> = {
  properties: SlidersHorizontal,
  layers: Layers3,
  document: PanelsTopLeft,
};

const PRIMARY_TAB_COPY: Readonly<Record<StudioInspectorPrimaryTab, CopyKey>> = {
  properties: "tabTarget",
  layers: "tabLayers",
  document: "tabDocument",
};

const tabFocusClass = STUDIO_FOCUS_RING;

/* -------------------------------------------------------------- helpers */

function safeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function moveTabFocus(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabList = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
  if (!tabList) return;
  const tabs = Array.from(
    tabList.querySelectorAll<HTMLButtonElement>(':scope > button[role="tab"]')
  ).filter((tab) => !tab.disabled);
  const index = tabs.indexOf(event.currentTarget);
  if (index < 0 || tabs.length === 0) return;

  event.preventDefault();
  // StudioPage의 전역 방향키 nudge가 같은 키 입력으로 선택 원고까지 움직이지 않게 한다.
  event.stopPropagation();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  next?.focus();
  next?.click();
}

/* ------------------------------------------------------------- component */

export function StudioInspectorNavigator({
  layout,
  tabA11y: providedTabA11y,
  selectedType,
  selectionLabel,
  selectionCount = 0,
  drawing,
  imageToolsAvailable,
  imageToolsStatusLabel,
  imageToolsStatusDescription,
  imageToolsStatusTone = "neutral",
  layerCount,
  mobileSheetHandle,
  onRequestClose,
  onChange,
}: StudioInspectorNavigatorProps) {
  const copy = useInspectorCopy();
  const titleId = useId();
  const panelOptionsId = `${titleId}-panel-options`;
  const tabA11y = providedTabA11y ?? createStudioInspectorTabA11y(titleId);
  const propertiesTabRef = useRef<HTMLButtonElement>(null);
  const panelOptionsTriggerRef = useRef<HTMLButtonElement>(null);
  const panelOptionsRef = useRef<HTMLDivElement>(null);
  const [panelOptionsOpen, setPanelOptionsOpen] = useState(false);
  const panelState = useSyncExternalStore(
    subscribeStudioInspectorPanelState,
    getStudioInspectorPanelState,
    getServerStudioInspectorPanelState,
  );
  const normalizedSelectionCount = safeCount(selectionCount);
  const hasSelection = selectedType !== null || normalizedSelectionCount > 0;
  const resolvedImageToolsAvailable =
    imageToolsAvailable ?? (selectedType === "image" || selectedType === "draw");
  const normalizedLayerCount = safeCount(layerCount);
  const shouldShowImageInspectorTabs =
    layout.primary === "properties" && !drawing && resolvedImageToolsAvailable;
  const imagePanelId = selectedType === "image" || selectedType === "draw"
    ? tabA11y.imagePanels.selected
    : tabA11y.imagePanels.unselected;
  const imageToolsStatusId = `${titleId}-image-tools-status`;
  const publishMode = layout.primary === "publish";
  const renderedPrimaryTabs = STUDIO_INSPECTOR_PRIMARY_TABS.filter(
    (tab) => panelState.visiblePrimaryTabs.includes(tab) || layout.primary === tab,
  );

  useEffect(() => {
    if (layout.primary !== "publish") {
      ensureStudioInspectorPanelPrimaryTabVisible(layout.primary);
    }
  }, [layout.primary]);

  useEffect(() => {
    if (!panelOptionsOpen) return;

    const closeOptions = (restoreFocus: boolean) => {
      setPanelOptionsOpen(false);
      if (!restoreFocus) return;
      globalThis.requestAnimationFrame?.(() => {
        panelOptionsTriggerRef.current?.focus({ preventScroll: true });
      });
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        panelOptionsRef.current?.contains(target)
        || panelOptionsTriggerRef.current?.contains(target)
      ) {
        return;
      }
      closeOptions(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      closeOptions(true);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [panelOptionsOpen]);

  function navigate(route: StudioInspectorRoute) {
    onChange(navigateStudioInspector(layout, route));
  }

  const selectionSummary = normalizedSelectionCount > 1
    ? `${normalizedSelectionCount}개 항목`
    : selectionLabel ?? copy("summaryElement");
  const summary = (() => {
    if (layout.primary === "layers") return copy("summaryLayers");
    if (layout.primary === "document") {
      return DOCUMENT_TAB_META[layout.document]?.label ?? copy("tabDocument");
    }
    if (publishMode) return copy("summaryPublish");
    if (normalizedSelectionCount > 1) return `${normalizedSelectionCount}개 항목`;
    if (selectionLabel) return selectionLabel;
    if (normalizedSelectionCount > 0) return copy("summaryElement");
    if (drawing) return copy("summaryDrawing");
    return copy("summaryEmpty");
  })();
  const summaryTone = publishMode
    ? "accent"
    : hasSelection || drawing
      ? "good"
      : "neutral";

  return (
    <section
      aria-labelledby={titleId}
      className="sticky top-0 z-30 -mx-0.5 rounded-lg border border-line bg-panel/95 p-1.5 shadow-[0_6px_20px_oklch(0.12_0.01_70/0.28)] backdrop-blur supports-[backdrop-filter]:bg-panel/90"
      data-testid="studio-inspector-navigator"
      data-inspector-chrome="navigator"
      data-studio-inspector-context-pinned={panelState.contextPinned ? "true" : undefined}
    >
      {mobileSheetHandle ? (
        <div className="-mx-1.5 -mt-1.5 mb-0.5 lg:hidden">{mobileSheetHandle}</div>
      ) : null}
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-1.5 px-0.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 id={titleId} className="truncate text-xs font-bold tracking-tight text-fg">
              {copy("panelTitle")}
            </h2>
            <StudioContextPill tone={summaryTone}>{summary}</StudioContextPill>
          </div>
          <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3 lg:sr-only">
            {copy("panelHint")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Desktop uses the shared search row; mobile opens the same dialog scoped here. */}
          <button
            type="button"
            onClick={() => requestStudioCommandSearch({ scope: "inspector" })}
            aria-label={copy("searchLabel")}
            title={`${copy("searchLabel")} (F1)`}
            data-inspector-priority="chrome"
            data-inspector-control-id="panel.chrome.search"
            data-studio-inspector-search-trigger="true"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-line text-[0.6875rem] font-semibold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg lg:hidden",
              tabFocusClass
            )}
          >
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{copy("search")}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setStudioInspectorPanelContextPinned(!panelState.contextPinned)
            }
            aria-label={panelState.contextPinned ? copy("unpin") : copy("pin")}
            aria-pressed={panelState.contextPinned}
            title={panelState.contextPinned ? copy("unpin") : copy("pin")}
            data-inspector-priority="chrome"
            data-inspector-control-id="panel.chrome.pin"
            data-testid="studio-inspector-context-pin"
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
              panelState.contextPinned
                ? "border-accent bg-accent-soft text-accent"
                : "border-transparent text-fg-3 hover:border-line hover:bg-raised hover:text-fg",
              tabFocusClass,
            )}
          >
            <Pin
              size={15}
              strokeWidth={1.75}
              fill={panelState.contextPinned ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
          <button
            ref={panelOptionsTriggerRef}
            type="button"
            onClick={() => setPanelOptionsOpen((open) => !open)}
            aria-label={copy("options")}
            aria-expanded={panelOptionsOpen}
            aria-haspopup="dialog"
            aria-controls={panelOptionsId}
            title={copy("options")}
            data-inspector-priority="chrome"
            data-inspector-control-id="panel.chrome.options"
            data-testid="studio-inspector-panel-options-trigger"
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
              panelOptionsOpen
                ? "border-accent bg-accent-soft text-accent"
                : "border-transparent text-fg-3 hover:border-line hover:bg-raised hover:text-fg",
              tabFocusClass,
            )}
          >
            <Settings2 size={15} strokeWidth={1.75} aria-hidden />
          </button>
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              aria-label={copy("close")}
              data-autofocus
              data-inspector-priority="chrome"
              data-inspector-control-id="panel.chrome.close"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-raised hover:text-fg lg:hidden",
                tabFocusClass
              )}
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {panelOptionsOpen ? (
        <div
          ref={panelOptionsRef}
          id={panelOptionsId}
          role="dialog"
          aria-modal="false"
          aria-label={copy("options")}
          data-testid="studio-inspector-panel-options"
          data-studio-inspector-panel-options-surface="popover"
          className="absolute inset-x-1 top-[calc(100%+0.375rem)] z-50 max-h-[65vh] overflow-y-auto overscroll-contain rounded-lg border border-line bg-card/95 p-2 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-card/90"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg">{copy("options")}</p>
              <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-fg-3">
                {copy("optionsHint")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.6875rem] font-bold tabular-nums text-accent">
                {panelState.visiblePrimaryTabs.length}/{STUDIO_INSPECTOR_PRIMARY_TABS.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPanelOptionsOpen(false);
                  globalThis.requestAnimationFrame?.(() => {
                    panelOptionsTriggerRef.current?.focus({ preventScroll: true });
                  });
                }}
                aria-label={copy("closeOptions")}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-raised hover:text-fg",
                  tabFocusClass,
                )}
              >
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1 text-[0.6875rem] font-semibold text-fg-2">
              {copy("visibleTabs")}
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {STUDIO_INSPECTOR_PRIMARY_TABS.map((tabId) => {
                const Icon = PRIMARY_TAB_ICONS[tabId];
                const visible = panelState.visiblePrimaryTabs.includes(tabId);
                const active = layout.primary === tabId;
                const cannotHide = visible
                  && (active || panelState.visiblePrimaryTabs.length === 1);
                const disabledReason = active
                  ? "현재 열려 있는 탭은 다른 탭으로 이동한 뒤 숨길 수 있습니다."
                  : "작업 패널에는 탭 하나 이상이 필요합니다.";
                return (
                  <button
                    key={tabId}
                    type="button"
                    aria-label={`${copy(PRIMARY_TAB_COPY[tabId])} 탭 ${
                      visible ? "숨기기" : "표시하기"
                    }`}
                    aria-pressed={visible}
                    disabled={cannotHide}
                    title={cannotHide ? disabledReason : undefined}
                    onClick={() =>
                      setStudioInspectorPanelPrimaryTabVisible(tabId, !visible)
                    }
                    data-inspector-priority="chrome"
                    data-inspector-control-id={`panel.chrome.visible.${tabId}`}
                    data-studio-inspector-tab-visibility={tabId}
                    className={cn(
                      "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[0.6875rem] font-semibold transition-colors",
                      visible
                        ? "border-accent/45 bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
                      cannotHide && "cursor-not-allowed opacity-55",
                      tabFocusClass,
                    )}
                  >
                    <Icon size={13} aria-hidden />
                    <span className="truncate">{copy(PRIMARY_TAB_COPY[tabId])}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            type="button"
            aria-pressed={panelState.compactPrimaryTabs}
            onClick={() =>
              setStudioInspectorPanelCompactPrimaryTabs(
                !panelState.compactPrimaryTabs,
              )
            }
            data-inspector-priority="chrome"
            data-inspector-control-id="panel.chrome.compact-tabs"
            className={cn(
              "mt-2 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
              panelState.compactPrimaryTabs
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-line bg-panel text-fg-2 hover:bg-raised",
              tabFocusClass,
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{copy("compactTabs")}</span>
              <span className="block truncate text-[0.6875rem] text-fg-3">
                {copy("compactTabsHint")}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                panelState.compactPrimaryTabs
                  ? "border-accent bg-accent"
                  : "border-line-strong bg-canvas",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-3.5 rounded-full bg-panel shadow transition-transform",
                  panelState.compactPrimaryTabs ? "translate-x-[1.125rem]" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/60 pt-2">
            <p className="min-w-0 text-[0.6875rem] leading-relaxed text-fg-3">
              {copy("hiddenSearchHint")}
            </p>
            <button
              type="button"
              onClick={() => resetStudioInspectorPanelState()}
              data-inspector-priority="chrome"
              data-inspector-control-id="panel.chrome.reset"
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
                tabFocusClass,
              )}
            >
              <RotateCcw size={13} aria-hidden />
              {copy("resetPanel")}
            </button>
          </div>
        </div>
      ) : null}

      {panelState.contextPinned ? (
        <div
          role="status"
          data-studio-inspector-pin-status="true"
          className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-accent/35 bg-accent-soft/55 px-2 py-1.5"
        >
          <Pin size={13} fill="currentColor" className="shrink-0 text-accent" aria-hidden />
          <span className="shrink-0 text-[0.6875rem] font-bold text-accent">
            {copy("pinned")}
          </span>
          <span className="min-w-0 truncate text-[0.6875rem] text-fg-3">
            {copy("pinnedHint")}
          </span>
        </div>
      ) : null}

      {(hasSelection || drawing) && layout.primary !== "properties" && !publishMode ? (
        <button
          type="button"
          onClick={() => {
            navigate({ primary: "properties" });
            globalThis.requestAnimationFrame?.(() => {
              propertiesTabRef.current?.focus({ preventScroll: true });
            });
          }}
          data-inspector-priority="chrome"
          className={cn(
            "my-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-accent/35 bg-accent-soft px-2.5 py-2 text-left transition-colors hover:border-accent/65 hover:bg-accent-soft/80",
            tabFocusClass,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-on-accent">
              <PanelRightOpen size={14} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-fg">
                {hasSelection ? `${selectionSummary} 설정` : copy("currentTool")}
              </span>
              <span className="block truncate text-[0.6875rem] text-fg-3">
                {hasSelection ? copy("openTargetSelection") : copy("openTargetTool")}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-[0.6875rem] font-bold text-accent">{copy("openTarget")}</span>
        </button>
      ) : null}

      {publishMode ? (
        <div
          className="mb-2 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-accent/35 bg-accent-soft/60 px-2 py-1.5"
          data-studio-inspector-publish-mode="true"
        >
          <div className="min-w-0">
            <p
              id={tabA11y.primary.publish.tabId}
              className="truncate text-xs font-bold text-fg"
            >
              {copy("publishTitle")}
            </p>
            <p className="truncate text-[0.6875rem] text-fg-3">{copy("publishHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ primary: "properties" })}
            data-inspector-priority="chrome"
            className={cn(
              "inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-md border border-line bg-card px-2 text-[0.6875rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
              tabFocusClass,
            )}
          >
            <ArrowLeft size={13} aria-hidden />
            {copy("publishBack")}
          </button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label={copy("tablist")}
        data-studio-inspector-primary-tabs-compact={
          panelState.compactPrimaryTabs ? "true" : undefined
        }
        className="grid gap-0.5 rounded-lg border border-line/70 bg-canvas/55 p-0.5"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, renderedPrimaryTabs.length)}, minmax(0, 1fr))`,
        }}
      >
        {renderedPrimaryTabs.map((tabId, index) => {
          const Icon = PRIMARY_TAB_ICONS[tabId];
          const active = layout.primary === tabId;
          // 게시 준비 모드에서는 선택된 탭이 없다. roving tabindex 는 첫 탭이 이어받는다.
          const tabStop = active || (publishMode && index === 0);
          return (
            <button
              key={tabId}
              ref={tabId === "properties" ? propertiesTabRef : undefined}
              id={tabA11y.primary[tabId].tabId}
              type="button"
              data-studio-inspector-primary-tab={tabId}
              data-inspector-priority="chrome"
              role="tab"
              aria-selected={active}
              aria-controls={
                tabId === "document"
                  ? tabA11y.document[layout.document].panelId
                  : tabA11y.primary[tabId].panelId
              }
              tabIndex={tabStop ? 0 : -1}
              title={
                panelState.compactPrimaryTabs
                  ? copy(PRIMARY_TAB_COPY[tabId])
                  : undefined
              }
              onClick={() => navigate({ primary: tabId })}
              onKeyDown={moveTabFocus}
              className={cn(
                "relative flex min-h-11 min-w-0 items-center justify-center rounded-md px-0.5 text-[0.6875rem] font-semibold transition-colors duration-150",
                panelState.compactPrimaryTabs ? "flex-row gap-0" : "flex-col gap-px",
                active
                  ? "bg-raised text-fg shadow-sm ring-1 ring-accent/25"
                  : "text-fg-3 hover:bg-card hover:text-fg-2",
                tabFocusClass
              )}
            >
              <Icon size={15} strokeWidth={1.75} className={active ? "text-accent" : undefined} aria-hidden />
              <span className={cn("truncate", panelState.compactPrimaryTabs && "sr-only")}>
                {copy(PRIMARY_TAB_COPY[tabId])}
              </span>
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-accent"
                />
              ) : null}
              {tabId === "layers" && normalizedLayerCount > 0 ? (
                <span className="absolute right-1 top-1 rounded-full bg-accent-soft px-1 text-[0.6875rem] font-bold tabular-nums text-accent">
                  {normalizedLayerCount > 99 ? "99+" : normalizedLayerCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {shouldShowImageInspectorTabs ? (
        <div
          role="tablist"
          aria-label={copy("imageTablist")}
          className="mt-2 grid min-w-0 grid-cols-3 gap-1"
        >
          {IMAGE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = layout.image === tab.id;
            return (
              <button
                key={tab.id}
                id={tabA11y.imageTabs[tab.id]}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={imagePanelId}
                aria-describedby={
                  active && imageToolsStatusLabel ? imageToolsStatusId : undefined
                }
                data-inspector-priority="chrome"
                tabIndex={active ? 0 : -1}
                onClick={() => navigate({ primary: "properties", image: tab.id })}
                onKeyDown={moveTabFocus}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[0.6875rem] font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
                  active
                    ? "border-accent bg-accent-soft text-accent shadow-sm"
                    : "border-line bg-card/60 text-fg-3 hover:border-line-strong hover:bg-raised hover:text-fg-2",
                  tabFocusClass
                )}
              >
                <Icon size={13} className="shrink-0" aria-hidden />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {shouldShowImageInspectorTabs && imageToolsStatusLabel ? (
        <div
          id={imageToolsStatusId}
          role="status"
          className="mt-1.5 flex min-w-0 items-center gap-1.5 rounded-lg border border-line/70 bg-canvas/45 px-2 py-1.5 text-[0.6875rem] leading-relaxed"
        >
          <StudioContextPill tone={imageToolsStatusTone}>
            {imageToolsStatusLabel}
          </StudioContextPill>
          <span className="min-w-0 truncate text-fg-3">
            {imageToolsStatusDescription}
          </span>
        </div>
      ) : null}

      {layout.primary === "document" ? (
        <div
          role="tablist"
          aria-label={copy("documentTablist")}
          className="mt-2 grid grid-cols-3 gap-1"
        >
          {DOCUMENT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = layout.document === tab.id;
            return (
              <button
                key={tab.id}
                id={tabA11y.document[tab.id].tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={tabA11y.document[tab.id].panelId}
                data-inspector-priority="chrome"
                tabIndex={active ? 0 : -1}
                onClick={() => navigate({ primary: "document", document: tab.id })}
                onKeyDown={moveTabFocus}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[0.6875rem] font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
                  active
                    ? "border-accent bg-accent-soft text-accent shadow-sm"
                    : "border-line bg-card/60 text-fg-3 hover:border-line-strong hover:bg-raised hover:text-fg-2",
                  tabFocusClass
                )}
              >
                <Icon size={13} className="shrink-0" aria-hidden />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
