import {
  FileUp,
  Layers3,
  Map,
  PaintBucket,
  PanelRightOpen,
  PanelsTopLeft,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { requestStudioInspectorFocus } from "./studio-inspector-focus";
import {
  filterStudioInspectorActions,
  navigateStudioInspector,
  studioInspectorActions,
  type StudioDocumentInspectorSection,
  type StudioImageInspectorSection,
  type StudioInspectorAction,
  type StudioInspectorLayout,
  type StudioInspectorPrimarySection,
  type StudioInspectorRoute,
} from "./studio-inspector-layout";
import {
  createStudioInspectorTabA11y,
  type StudioInspectorTabA11y,
} from "./studio-inspector-tab-a11y";
import {
  STUDIO_FOCUS_RING,
  StudioContextPill,
  StudioEmptyState,
} from "./studio-panel-ui";

import { cn } from "@/lib/utils";

export interface StudioInspectorNavigatorProps {
  layout: StudioInspectorLayout;
  tabA11y?: StudioInspectorTabA11y;
  selectedType: string | null;
  selectionLabel: string | null;
  selectionCount?: number;
  drawing: boolean;
  drawingToolPropertiesAvailable?: boolean;
  /**
   * CSP의 도구 팔레트처럼 대상이 아직 없어도 전문 도구를 찾고 준비 조건을 확인할 수
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

const PRIMARY_TABS: readonly {
  id: StudioInspectorPrimarySection;
  label: string;
  icon: typeof SlidersHorizontal;
}[] = [
  { id: "properties", label: "속성", icon: SlidersHorizontal },
  { id: "layers", label: "레이어", icon: Layers3 },
  { id: "document", label: "페이지", icon: PanelsTopLeft },
  { id: "publish", label: "작품 정보", icon: Send },
];

const IMAGE_TABS: readonly {
  id: StudioImageInspectorSection;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { id: "quick", label: "빠른 수정", icon: Sparkles },
  { id: "fill", label: "채우기·선화", icon: PaintBucket },
  { id: "transform", label: "변형", icon: Map },
  { id: "retouch", label: "선택·리터치", icon: SlidersHorizontal },
  { id: "mask", label: "마스크", icon: Layers3 },
];

const DOCUMENT_TABS: readonly {
  id: StudioDocumentInspectorSection;
  label: string;
  icon: typeof PanelsTopLeft;
}[] = [
  { id: "canvas", label: "캔버스", icon: PanelsTopLeft },
  { id: "grade", label: "색보정", icon: SlidersHorizontal },
  { id: "navigator", label: "미니맵", icon: Map },
];

const tabFocusClass = STUDIO_FOCUS_RING;

function safeLayerCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function safeSelectionCount(value: number): number {
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

function contextualSummary({
  layout,
  selectionLabel,
  selectionCount,
  drawing,
}: Pick<
  StudioInspectorNavigatorProps,
  "layout" | "selectionLabel" | "selectionCount" | "drawing"
>): string {
  if (layout.primary === "layers") return "순서·그룹·표시 상태";
  if (layout.primary === "document") {
    return DOCUMENT_TABS.find((tab) => tab.id === layout.document)?.label ?? "페이지";
  }
  if (layout.primary === "publish") return "초안·게시 공통 정보";
  if ((selectionCount ?? 0) > 1) return `${selectionCount}개 요소`;
  if (selectionLabel) return selectionLabel;
  if ((selectionCount ?? 0) > 0) return "요소";
  if (drawing) return "그리기 도구";
  // Empty canvas coaching — competitive apps never leave a dead "select something" dead-end.
  return "B 펜 · V 선택 · 빈 화면에서 바로 그리기";
}

export function StudioInspectorNavigator({
  layout,
  tabA11y: providedTabA11y,
  selectedType,
  selectionLabel,
  selectionCount = 0,
  drawing,
  drawingToolPropertiesAvailable,
  imageToolsAvailable,
  imageToolsStatusLabel,
  imageToolsStatusDescription,
  imageToolsStatusTone = "neutral",
  layerCount,
  mobileSheetHandle,
  onRequestClose,
  onChange,
}: StudioInspectorNavigatorProps) {
  const titleId = useId();
  const tabA11y = providedTabA11y ?? createStudioInspectorTabA11y(titleId);
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const propertiesTabRef = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedSelectionCount = safeSelectionCount(selectionCount);
  const hasSelection = selectedType !== null || normalizedSelectionCount > 0;
  const resolvedImageToolsAvailable =
    imageToolsAvailable ?? (selectedType === "image" || selectedType === "draw");
  const actions = studioInspectorActions({
    hasSelection,
    selectedType,
    drawing,
    drawingToolPropertiesAvailable,
    imageToolsAvailable: resolvedImageToolsAvailable,
  });
  const results = filterStudioInspectorActions(actions, query);
  const normalizedLayerCount = safeLayerCount(layerCount);
  const imageInspectorTabs = IMAGE_TABS;
  const shouldShowImageInspectorTabs =
    layout.primary === "properties" && !drawing && resolvedImageToolsAvailable;
  const activeImageInspectorTab = layout.image;
  const imagePanelId = selectedType === "image" || selectedType === "draw"
    ? tabA11y.imagePanels.selected
    : tabA11y.imagePanels.unselected;
  const imageToolsStatusId = `${titleId}-image-tools-status`;

  function navigate(
    route: StudioInspectorRoute,
    restoreSearchFocus = false,
    focusTarget?: StudioInspectorAction["focusTarget"],
  ) {
    onChange(navigateStudioInspector(layout, route));
    setSearchOpen(false);
    setQuery("");
    globalThis.requestAnimationFrame?.(() => {
      if (focusTarget) requestStudioInspectorFocus(focusTarget);
      else if (restoreSearchFocus) searchToggleRef.current?.focus();
    });
  }

  function openSearch() {
    setSearchOpen(true);
    globalThis.requestAnimationFrame?.(() => searchInputRef.current?.focus());
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    globalThis.requestAnimationFrame?.(() => searchToggleRef.current?.focus());
  }

  const summary = contextualSummary({
    layout,
    selectionLabel,
    selectionCount: normalizedSelectionCount,
    drawing,
  });
  const selectionSummary = normalizedSelectionCount > 1
    ? `${normalizedSelectionCount}개 요소`
    : selectionLabel ?? "요소";
  const summaryTone =
    layout.primary === "publish"
      ? "accent"
      : hasSelection || drawing
        ? "good"
        : "neutral";

  return (
    <section
      aria-labelledby={titleId}
      className="sticky top-0 z-30 -mx-0.5 rounded-lg border border-line bg-panel/95 p-1.5 shadow-[0_6px_20px_oklch(0.12_0.01_70/0.28)] backdrop-blur supports-[backdrop-filter]:bg-panel/90"
      data-testid="studio-inspector-navigator"
    >
      {mobileSheetHandle ? (
        <div className="-mx-1.5 -mt-1.5 mb-0.5 lg:hidden">{mobileSheetHandle}</div>
      ) : null}
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-1.5 px-0.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 id={titleId} className="truncate text-[0.7rem] font-bold tracking-tight text-fg">
              작업 패널
            </h2>
            <StudioContextPill tone={summaryTone}>{summary}</StudioContextPill>
          </div>
          <p className="mt-0.5 truncate text-[0.58rem] text-fg-3 lg:sr-only">
            속성 · 레이어 · 페이지 · 게시를 한곳에서 전환합니다
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            ref={searchToggleRef}
            type="button"
            onClick={searchOpen ? closeSearch : openSearch}
            aria-expanded={searchOpen}
            aria-controls={`${searchInputId}-panel`}
            aria-label={searchOpen ? "패널 찾기 닫기" : "패널과 기능 찾기"}
            title="패널과 기능 찾기"
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-line px-2 text-[0.68rem] font-semibold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg lg:min-h-8 lg:rounded-md",
              searchOpen && "border-accent bg-accent-soft text-accent",
              tabFocusClass
            )}
          >
            {searchOpen ? <X size={15} strokeWidth={1.75} aria-hidden /> : <Search size={15} strokeWidth={1.75} aria-hidden />}
            <span>{searchOpen ? "닫기" : "찾기"}</span>
          </button>
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              aria-label="작업 패널 닫기"
              data-autofocus
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

      {(hasSelection || drawing) && layout.primary !== "properties" ? (
        <button
          type="button"
          onClick={() => {
            navigate({ primary: "properties" });
            globalThis.requestAnimationFrame?.(() => {
              propertiesTabRef.current?.focus({ preventScroll: true });
            });
          }}
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
              <span className="block truncate text-[0.7rem] font-bold text-fg">
                {hasSelection
                  ? `${selectionSummary} 편집`
                  : "현재 도구 설정"}
              </span>
              <span className="block truncate text-[0.6rem] text-fg-3">
                {hasSelection ? "선택한 대상의 속성을 바로 엽니다" : "브러시와 그리기 옵션을 바로 엽니다"}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-[0.65rem] font-bold text-accent">속성 열기</span>
        </button>
      ) : null}

      <div
        role="tablist"
        aria-label="스튜디오 작업 패널"
        className="grid grid-cols-4 gap-0.5 rounded-lg border border-line/70 bg-canvas/55 p-0.5"
      >
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = layout.primary === tab.id;
          return (
            <button
              key={tab.id}
              ref={tab.id === "properties" ? propertiesTabRef : undefined}
              id={tabA11y.primary[tab.id].tabId}
              type="button"
              data-studio-inspector-primary-tab={tab.id}
              role="tab"
              aria-selected={active}
              aria-controls={
                tab.id === "document"
                  ? tabA11y.document[layout.document].panelId
                  : tabA11y.primary[tab.id].panelId
              }
              tabIndex={active ? 0 : -1}
              onClick={() => navigate({ primary: tab.id })}
              onKeyDown={moveTabFocus}
              className={cn(
                "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-px rounded-md px-0.5 text-[0.6rem] font-semibold transition-colors duration-150 lg:min-h-9",
                active
                  ? "bg-raised text-fg shadow-sm ring-1 ring-accent/25"
                  : "text-fg-3 hover:bg-card hover:text-fg-2",
                tabFocusClass
              )}
            >
              <Icon size={15} strokeWidth={1.75} className={active ? "text-accent" : undefined} aria-hidden />
              <span className="truncate">{tab.label}</span>
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-accent"
                />
              ) : null}
              {tab.id === "layers" && normalizedLayerCount > 0 ? (
                <span className="absolute right-1 top-1 rounded-full bg-accent-soft px-1 text-[0.52rem] font-bold tabular-nums text-accent">
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
          aria-label="이미지 전문 도구"
          className="mt-2 flex min-w-0 gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {imageInspectorTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeImageInspectorTab === tab.id;
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
                tabIndex={active ? 0 : -1}
                onClick={() => navigate({ primary: "properties", image: tab.id })}
                onKeyDown={moveTabFocus}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-[0.65rem] font-semibold transition-colors duration-150 lg:min-h-9 lg:px-2 pointer-coarse:min-h-11 pointer-coarse:px-3",
                  active
                    ? "border-accent bg-accent-soft text-accent shadow-sm"
                    : "border-line bg-card/60 text-fg-3 hover:border-line-strong hover:bg-raised hover:text-fg-2",
                  tabFocusClass
                )}
              >
                <Icon size={13} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {shouldShowImageInspectorTabs && imageToolsStatusLabel ? (
        <div
          id={imageToolsStatusId}
          role="status"
          className="mt-1.5 flex min-w-0 items-center gap-1.5 rounded-lg border border-line/70 bg-canvas/45 px-2 py-1.5 text-[0.62rem] leading-relaxed"
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
          aria-label="페이지 설정"
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
                tabIndex={active ? 0 : -1}
                onClick={() => navigate({ primary: "document", document: tab.id })}
                onKeyDown={moveTabFocus}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[0.65rem] font-semibold transition-colors duration-150 lg:min-h-9 pointer-coarse:min-h-11",
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

      {searchOpen ? (
        <div
          id={`${searchInputId}-panel`}
          className="mt-2 overflow-hidden rounded-xl border border-line bg-card shadow-xl"
        >
          <label htmlFor={searchInputId} className="sr-only">
            패널과 기능 검색
          </label>
          <div className="relative border-b border-line">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              id={searchInputId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSearch();
                } else if (event.key === "Enter" && results[0]) {
                  event.preventDefault();
                  navigate(results[0].route, true, results[0].focusTarget);
                }
              }}
              placeholder="속성, 도구, 도움말 검색…"
              autoComplete="off"
              className={cn(
                "min-h-11 w-full bg-panel py-2 pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3",
                tabFocusClass
              )}
            />
          </div>
          <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
            <p role="status" aria-live="polite" className="sr-only">
              {results.length}개 패널을 찾았습니다.
            </p>
            {results.length > 0 ? (
              results.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigate(action.route, true, action.focusTarget)}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-raised",
                    tabFocusClass
                  )}
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                    {action.kind === "property" ? (
                      <SlidersHorizontal size={13} aria-hidden />
                    ) : action.kind === "tool" ? (
                      <Sparkles size={13} aria-hidden />
                    ) : (
                      <FileUp size={13} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-fg-2">
                        {action.label}
                      </span>
                      <span className="shrink-0 rounded bg-canvas/70 px-1 py-0.5 text-[0.52rem] font-bold text-fg-3">
                        {action.kind === "property" ? "속성" : action.kind === "tool" ? "도구" : "패널"}
                      </span>
                    </span>
                    {action.path ? (
                      <span className="mt-0.5 block truncate text-[0.58rem] font-medium text-accent/85">
                        {action.path}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-[0.62rem] leading-relaxed text-fg-3">
                      {action.description}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <StudioEmptyState
                className="border-0 bg-transparent py-6 shadow-none"
                title="일치하는 패널이 없습니다"
                description="채우기, 마스크, 레이어, 게시처럼 작업 이름을 짧게 입력해 보세요."
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
