import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Eraser,
  FlipHorizontal2,
  GripVertical,
  LayoutTemplate,
  ListFilter,
  LocateFixed,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Move,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Suspense,
  lazy,
  memo,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { StudioEdgeRailButton } from "./studio-chrome-ui";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import {
  studioDeletePageRequest,
  studioDeletePagesBulkRequest,
} from "./studio-destructive-command-catalog";
import {
  DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT,
  loadStudioDetachablePanelState,
  saveStudioDetachablePanelState,
} from "./studio-detachable-panels";
import {
  STUDIO_MOBILE_PAGES_SHEET_ID,
  studioMobileSheetSizeStyle,
  type StudioMobileSheetSnap,
} from "./studio-mobile-sheet-snap";
import {
  filterStudioPageNavigationEntries,
  resolveStudioPageNavigationTarget,
  resolveStudioPageSelection,
  STUDIO_PAGE_NAVIGATION_KEYS,
  type StudioPageListFilter,
  type StudioPageNavigationKey,
} from "./studio-page-navigation";
import { StudioPageThumbnail } from "./studio-page-lazy-ui";
import {
  PAGE_NAME_MAX,
  PAGE_NOTE_MAX,
  autoPageName,
} from "./studio-page-meta";
import {
  PAGE_REVIEW_STATUS_LABELS,
  normalizePageReviewState,
} from "./studio-page-review";
import { shotTagBadgeText, shotTagBadgeTitle } from "./studio-panel-shot-tags";
import { STUDIO_WORKSPACE_LEFT_PANEL_WIDTH } from "./studio-workspaces";
import { StudioDetachablePanelSlot } from "./StudioDetachablePanelSlot";

import type { El } from "./studio-element-model";
import type { DocumentMaster } from "./studio-master-page";
import type { StudioPageDnd } from "./studio-page-dnd";
import type { PageState } from "./studio-page-state";
import type {
  StudioPagePreviewSize,
  StudioUiPreferencesRepository,
} from "./studio-ui-preferences-sqlite";
import type { StudioMobileSheet } from "./StudioMobileEditingDock";
import type { Resizable } from "@/hooks/use-resizable";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from "react";

import { cn } from "@/shared/lib/utils";

const LazyStudioMobileSheetHandle = lazy(() =>
  import("./StudioMobileSheetHandle").then(({ StudioMobileSheetHandle }) => ({
    default: StudioMobileSheetHandle,
  }))
);

const PAGE_PREVIEW_SIZE_VALUES = ["compact", "comfortable", "large"] as const satisfies readonly StudioPagePreviewSize[];

const PAGE_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "content", label: "내용 있음" },
  { value: "empty", label: "빈 페이지" },
  { value: "notes", label: "메모 있음" },
  { value: "needs-review", label: "검토 필요" },
  { value: "approved", label: "승인됨" },
  { value: "locked", label: "잠긴 페이지" },
] as const satisfies readonly { value: StudioPageListFilter; label: string }[];

async function acquireProductStudioUiPreferencesRepository(): Promise<StudioUiPreferencesRepository> {
  const module = await import("./studio-ui-preferences-sqlite");
  return module.acquireProductStudioUiPreferencesRepository();
}

const PAGE_PREVIEW_SIZE_CLASS: Record<StudioPagePreviewSize, string> = {
  compact: "h-14",
  comfortable: "h-24",
  large: "h-36",
};
const PAGE_PREVIEW_SIZE_LABEL: Record<StudioPagePreviewSize, string> = {
  compact: "작게",
  comfortable: "보통",
  large: "크게",
};

function StudioPageListResizeHandle({ leftResize }: { readonly leftResize: Resizable }) {
  const helpId = useId();
  const { handleProps, dragging } = leftResize;
  const label = "페이지 목록 너비 조절";
  return (
    <>
      <div
        {...handleProps}
        aria-label={label}
        aria-describedby={helpId}
        title={`${label} · 현재 ${handleProps["aria-valuenow"]}px · 드래그 / 더블클릭·더블탭·Enter(기본) / ←→`}
        data-studio-panel-resizer="true"
        data-dragging={dragging ? "true" : "false"}
        className={cn(
          "group relative hidden w-3 shrink-0 touch-none cursor-col-resize select-none items-center justify-center self-stretch border-x border-line/35 bg-panel/35 transition-[background-color,border-color] motion-reduce:transition-none lg:flex",
          "before:absolute before:inset-y-0 before:left-1/2 before:w-6 before:-translate-x-1/2 before:content-['']",
          "focus-visible:z-10 focus-visible:border-accent/60 focus-visible:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          "active:border-accent/50 active:bg-accent/15",
          dragging
            ? "border-accent/60 bg-accent/20"
            : "hover:border-accent/35 hover:bg-accent/10",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid h-12 w-2.5 place-items-center rounded-full border shadow-sm transition-[color,background-color,border-color,transform] motion-reduce:transition-none",
            dragging
              ? "scale-105 border-accent bg-accent text-on-accent"
              : "border-line bg-raised text-fg-3 group-hover:border-accent/50 group-hover:bg-accent-soft group-hover:text-accent group-focus-visible:border-accent group-focus-visible:bg-accent-soft group-focus-visible:text-accent",
          )}
        >
          <GripVertical size={10} strokeWidth={2.25} />
        </span>
      </div>
      <span id={helpId} className="sr-only">
        좌우 방향키로 조금씩 조절하고 Home과 End로 최소·최대 너비를 선택할 수 있습니다.
        Enter를 누르거나 더블클릭·더블탭하면 기본 너비로 돌아갑니다.
      </span>
    </>
  );
}

export interface StudioPageListPaneHandlers {
  addPage: () => void;
  applyBgToAll: () => void;
  applyGradeToAll: () => void;
  clearPageFor: (pageId: string) => void;
  commitPageMeta: (pageId: string, patch: { name?: string | null; note?: string | null; }) => void;
  deletePage: (pageId: string) => void;
  deletePagesBulk: (ids: string[]) => void;
  duplicatePage: (pageId: string) => void;
  duplicatePageMirrored: (pageId: string) => void;
  insertPageAfter: (pageId: string) => void;
  insertPageBefore: (pageId: string) => void;
  movePageDown: (pageId: string) => void;
  movePagesBulk: (ids: string[], delta: number) => void;
  movePageToBottom: (pageId: string) => void;
  movePageToTop: (pageId: string) => void;
  movePageUp: (pageId: string) => void;
}

export interface StudioPageListPaneProps {
  collaborationDocumentLocked: boolean;
  collaborationLockMessage: () => string;
  composeWorkAssetPreviewPage: (page: PageState) => PageState;
  currentPageId: string;
  isMobile: boolean;
  leftResize: Resizable;
  master: DocumentMaster<El>;
  masterEditMode: boolean;
  masterPanelOpen: boolean;
  metaEditPageId: string | null;
  mobileKeyboardInset: number;
  mobileSheet: StudioMobileSheet;
  pageDnd: StudioPageDnd;
  pages: PageState[];
  pagesSheetRef: RefObject<HTMLDivElement | null>;
  presentationPanelsHidden: boolean;
  setCurrentPageId: (value: SetStateAction<string>) => boolean;
  setLeftPanelOpen: Dispatch<SetStateAction<boolean>>;
  setMasterPanelOpen: Dispatch<SetStateAction<boolean>>;
  setMetaEditPageId: Dispatch<SetStateAction<string | null>>;
  setMobileSheet: Dispatch<SetStateAction<StudioMobileSheet>>;
  visibleLeftPanelOpen: boolean;
  stableHandlers: StudioPageListPaneHandlers;
  /** Test seam; product defaults to the shared SQLite/OPFS preference authority. */
  acquireUiPreferences?: () => Promise<StudioUiPreferencesRepository>;
}

export const StudioPageListPane = memo(function StudioPageListPane({
  collaborationDocumentLocked,
  collaborationLockMessage,
  composeWorkAssetPreviewPage,
  currentPageId,
  isMobile,
  leftResize,
  master,
  masterEditMode,
  masterPanelOpen,
  metaEditPageId,
  mobileKeyboardInset,
  mobileSheet,
  pageDnd,
  pages,
  pagesSheetRef,
  presentationPanelsHidden,
  setCurrentPageId,
  setLeftPanelOpen,
  setMasterPanelOpen,
  setMetaEditPageId,
  setMobileSheet,
  visibleLeftPanelOpen,
  stableHandlers,
  acquireUiPreferences = acquireProductStudioUiPreferencesRepository,
}: StudioPageListPaneProps) {
  const {
    addPage,
    applyBgToAll,
    applyGradeToAll,
    clearPageFor,
    commitPageMeta,
    deletePage,
    deletePagesBulk,
    duplicatePage,
    duplicatePageMirrored,
    insertPageAfter,
    insertPageBefore,
    movePageDown,
    movePagesBulk,
    movePageToBottom,
    movePageToTop,
    movePageUp,
  } = stableHandlers;
  const [mobileSnap, setMobileSnap] = useState<StudioMobileSheetSnap>("medium");
  const [pagePreviewSize, setPagePreviewSize] = useState<StudioPagePreviewSize>("comfortable");
  const [preferenceAuthority, setPreferenceAuthority] = useState<
    "loading" | "sqlite-opfs" | "memory-only"
  >("loading");
  const preferenceRepositoryRef = useRef<StudioUiPreferencesRepository | null>(null);
  const preferenceDirtyRef = useRef(false);
  const preferenceMountedRef = useRef(true);

  useEffect(() => {
    preferenceMountedRef.current = true;
    return () => {
      preferenceMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void acquireUiPreferences()
      .then(async (repository) => {
        preferenceRepositoryRef.current = repository;
        const persisted = await repository.loadPagePreviewSize();
        if (!active) return;
        setPreferenceAuthority("sqlite-opfs");
        if (!preferenceDirtyRef.current) setPagePreviewSize(persisted);
      })
      .catch(() => {
        if (active) setPreferenceAuthority("memory-only");
      });
    return () => {
      active = false;
    };
  }, [acquireUiPreferences]);

  const selectPagePreviewSize = (next: StudioPagePreviewSize): void => {
    preferenceDirtyRef.current = true;
    setPagePreviewSize(next);
    const save = preferenceRepositoryRef.current
      ? preferenceRepositoryRef.current.savePagePreviewSize(next)
      : acquireUiPreferences().then((repository) => {
          preferenceRepositoryRef.current = repository;
          return repository.savePagePreviewSize(next);
        });
    void save
      .then(() => {
        if (preferenceMountedRef.current) setPreferenceAuthority("sqlite-opfs");
      })
      .catch(() => {
        if (preferenceMountedRef.current) setPreferenceAuthority("memory-only");
      });
  };

  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [selectionAnchorPageId, setSelectionAnchorPageId] = useState<string | null>(currentPageId);
  const [pageQuery, setPageQuery] = useState("");
  const deferredPageQuery = useDeferredValue(pageQuery);
  const [pageFilter, setPageFilter] = useState<StudioPageListFilter>("all");
  const [autoFollowCurrent, setAutoFollowCurrent] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pageButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pageItemRefs = useRef(new Map<string, HTMLDivElement>());
  const pageResultsId = useId();
  const navigationHelpId = useId();

  const pageIdSet = useMemo(() => new Set(pages.map((page) => page.id)), [pages]);
  const liveSelectedPageIds = useMemo(() => {
    const selected = new Set(selectedPageIds);
    return pages.filter((page) => selected.has(page.id)).map((page) => page.id);
  }, [pages, selectedPageIds]);
  const liveSelectedPageIdSet = useMemo(
    () => new Set(liveSelectedPageIds),
    [liveSelectedPageIds],
  );
  const navigationEntries = useMemo(
    () => filterStudioPageNavigationEntries(pages, deferredPageQuery, pageFilter),
    [deferredPageQuery, pageFilter, pages],
  );
  const visiblePageIds = useMemo(
    () => navigationEntries.map(({ page }) => page.id),
    [navigationEntries],
  );
  const visiblePageIdSet = useMemo(() => new Set(visiblePageIds), [visiblePageIds]);
  const hiddenSelectedPageCount = liveSelectedPageIds.filter(
    (id) => !visiblePageIdSet.has(id),
  ).length;
  const multiSelectActive = liveSelectedPageIds.length > 1;
  const navigationActive = pageQuery.trim().length > 0 || pageFilter !== "all";
  const currentPageVisible = visiblePageIdSet.has(currentPageId);

  useEffect(() => {
    if (selectionAnchorPageId && pageIdSet.has(selectionAnchorPageId)) return;
    setSelectionAnchorPageId(pageIdSet.has(currentPageId) ? currentPageId : pages[0]?.id ?? null);
  }, [currentPageId, pageIdSet, pages, selectionAnchorPageId]);

  useEffect(() => {
    if (!autoFollowCurrent || !visibleLeftPanelOpen || !currentPageVisible) return;
    if (isMobile && mobileSheet !== "pages") return;
    const item = pageItemRefs.current.get(currentPageId);
    if (item && typeof item.scrollIntoView === "function") {
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [
    autoFollowCurrent,
    currentPageId,
    currentPageVisible,
    isMobile,
    mobileSheet,
    navigationEntries,
    visibleLeftPanelOpen,
  ]);

  const selectPageFromPointer = (
    event: ReactMouseEvent<HTMLButtonElement>,
    pageId: string,
  ): void => {
    const result = resolveStudioPageSelection({
      orderedPageIds: visiblePageIds,
      selectedPageIds: liveSelectedPageIds,
      targetPageId: pageId,
      anchorPageId: selectionAnchorPageId,
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedPageIds(result.selectedPageIds);
    setSelectionAnchorPageId(result.anchorPageId);
    setCurrentPageId(pageId);
  };

  const focusPageButton = (pageId: string): void => {
    const focus = () => pageButtonRefs.current.get(pageId)?.focus();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus);
    else focus();
  };

  const selectAllVisiblePages = (): void => {
    setSelectedPageIds(visiblePageIds);
    if (!selectionAnchorPageId || !visiblePageIdSet.has(selectionAnchorPageId)) {
      setSelectionAnchorPageId(
        visiblePageIdSet.has(currentPageId) ? currentPageId : visiblePageIds[0] ?? null,
      );
    }
  };

  const handlePageSelectionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    pageId: string,
  ): void => {
    if (
      (event.metaKey || event.ctrlKey)
      && event.key.toLocaleLowerCase("en-US") === "a"
    ) {
      event.preventDefault();
      selectAllVisiblePages();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (navigationActive) {
        setPageQuery("");
        setPageFilter("all");
      } else {
        setSelectedPageIds([pageId]);
        setSelectionAnchorPageId(pageId);
      }
      return;
    }

    if (!STUDIO_PAGE_NAVIGATION_KEYS.includes(event.key as StudioPageNavigationKey)) return;
    event.preventDefault();
    const targetPageId = resolveStudioPageNavigationTarget(
      visiblePageIds,
      pageId,
      event.key as StudioPageNavigationKey,
    );
    if (!targetPageId) return;
    const result = resolveStudioPageSelection({
      orderedPageIds: visiblePageIds,
      selectedPageIds: liveSelectedPageIds,
      targetPageId,
      anchorPageId: selectionAnchorPageId,
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedPageIds(result.selectedPageIds);
    setSelectionAnchorPageId(result.anchorPageId);
    setCurrentPageId(targetPageId);
    focusPageButton(targetPageId);
  };

  const clearNavigation = (): void => {
    setPageQuery("");
    setPageFilter("all");
    searchInputRef.current?.focus();
  };

  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;
  const [detached, setDetached] = useState(() =>
    loadStudioDetachablePanelState("page-list")
  );
  const desktopDetached = !isMobile && detached;
  const setPageListDetached = (next: boolean): void => {
    setDetached(next);
    saveStudioDetachablePanelState("page-list", next);
    if (next) setLeftPanelOpen(true);
  };

  return (
    <>
      {!visibleLeftPanelOpen && !presentationPanelsHidden && (
        <StudioEdgeRailButton
          side="left"
          label="페이지"
          icon={LayoutTemplate}
          onClick={() => setLeftPanelOpen(true)}
          title="페이지 목록 펼치기"
        />
      )}
      <StudioDetachablePanelSlot
        detached={desktopDetached && visibleLeftPanelOpen}
        surfaceId="page-list"
        label="페이지 목록"
        defaultLayout={DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT}
        minWidth={320}
        minHeight={420}
        maxWidth={720}
        maxHeight={1_100}
        allowedDockEdges={["left", "right"]}
        onClose={() => setLeftPanelOpen(false)}
      >
        <div
          id={STUDIO_MOBILE_PAGES_SHEET_ID}
          ref={pagesSheetRef}
          role={isMobile && mobileSheet === "pages" ? "dialog" : undefined}
          aria-modal={isMobile && mobileSheet === "pages" ? true : undefined}
          data-studio-sheet-id="pages"
          data-studio-panel-detached={desktopDetached ? "true" : undefined}
          data-studio-ui-preferences-authority={preferenceAuthority}
          data-studio-mobile-sheet={isMobile && mobileSheet === "pages" ? "true" : undefined}
          data-studio-sheet-snap={isMobile ? mobileSnap : undefined}
          data-popup-kind={isMobile && mobileSheet === "pages" ? "sheet" : undefined}
          aria-label={isMobile && mobileSheet === "pages" ? "페이지 목록" : undefined}
          aria-hidden={isMobile && mobileSheet !== "pages" ? true : undefined}
          tabIndex={isMobile && mobileSheet === "pages" ? -1 : undefined}
          inert={isMobile && mobileSheet !== "pages" ? true : undefined}
          onKeyDown={(event) => {
            const tagName = (event.target as HTMLElement).tagName;
            const editing = tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
            if (
              !editing
              && !event.metaKey
              && !event.ctrlKey
              && !event.altKey
              && event.key === "/"
            ) {
              event.preventDefault();
              searchInputRef.current?.focus();
            }
          }}
          className={cn(
            "flex flex-col gap-1.5 border border-line p-2",
            "fixed inset-x-0 bottom-0 z-[60] overflow-hidden rounded-t-3xl bg-panel pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl transition-[transform,height,max-height] duration-300 ease-out motion-reduce:transition-none",
            "lg:static lg:z-auto lg:max-h-none lg:min-h-0 lg:overflow-hidden lg:rounded-none lg:border-y-0 lg:border-l-0 lg:bg-panel/50 lg:pb-2 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",
            desktopDetached && "lg:h-full lg:w-full lg:flex-1 lg:border-0 lg:bg-transparent lg:p-0",
            !visibleLeftPanelOpen && "lg:hidden",
          )}
          style={
            isMobile
              ? {
                  bottom: safeMobileKeyboardInset,
                  ...studioMobileSheetSizeStyle(mobileSnap, safeMobileKeyboardInset),
                }
              : desktopDetached
                ? { width: "100%", minWidth: 0 }
                : { width: leftResize.width, minWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum }
          }
        >
          <div className="shrink-0 border-b border-line/50 pb-1.5">
            {isMobile ? (
              <Suspense fallback={<div aria-hidden className="min-h-11" />}>
                <LazyStudioMobileSheetHandle
                  active={mobileSheet === "pages"}
                  kind="pages"
                  label="페이지 시트"
                  onDismiss={() => setMobileSheet(null)}
                  onSnapChange={setMobileSnap}
                  sheetRef={pagesSheetRef}
                  snap={mobileSnap}
                />
              </Suspense>
            ) : null}
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
              <span className="flex shrink-0 items-center gap-1 text-[0.7rem] font-bold text-fg-2">
                <button
                  type="button"
                  onClick={() => setLeftPanelOpen(false)}
                  className="hidden size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
                  aria-label="페이지 목록 접기"
                  title="페이지 목록 접기"
                >
                  <ChevronLeft size={13} />
                </button>
                페이지
                <span className="font-normal tabular-nums text-fg-3">
                  {navigationEntries.length === pages.length
                    ? pages.length
                    : `${navigationEntries.length}/${pages.length}`}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {!isMobile ? (
                  <button
                    type="button"
                    onClick={() => setPageListDetached(!detached)}
                    aria-label={detached
                      ? "페이지 목록을 왼쪽 패널에 붙이기"
                      : "페이지 목록을 창으로 분리"}
                    aria-pressed={desktopDetached}
                    title={detached ? "왼쪽 패널에 붙이기" : "자유 배치 창으로 분리"}
                    className="grid size-11 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {detached ? <PanelLeft size={14} aria-hidden /> : <Move size={14} aria-hidden />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileSheet(null)}
                  className="grid size-11 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:hidden"
                  aria-label="페이지 시트 닫기"
                  data-autofocus
                >
                  <X size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-add-page"
                  aria-label="새 페이지 추가"
                  title="새 페이지 추가"
                  onClick={addPage}
                  className="flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 text-[0.7rem] font-semibold text-on-accent hover:bg-accent-hover lg:px-2 lg:text-[10px]"
                >
                  <Plus size={12} aria-hidden /> 페이지 추가
                </button>
              </div>
            </div>

            <div
              role="search"
              aria-label="페이지 검색 및 필터"
              className="mt-1 flex flex-wrap items-center gap-1"
            >
              <div className="relative min-w-[10rem] flex-1">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={pageQuery}
                  maxLength={200}
                  aria-label="페이지 검색"
                  onChange={(event) => setPageQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape" || !pageQuery) return;
                    event.stopPropagation();
                    setPageQuery("");
                  }}
                  aria-controls={pageResultsId}
                  aria-describedby={navigationHelpId}
                  data-testid="studio-page-search"
                  placeholder="이름·메모·태그·담당자 검색"
                  title="페이지 검색 · / 키로 포커스"
                  className="min-h-11 w-full rounded-lg border border-line bg-card pl-9 pr-9 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
                {pageQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPageQuery("");
                      searchInputRef.current?.focus();
                    }}
                    aria-label="페이지 검색어 지우기"
                    className="absolute right-0 top-0 grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg"
                  >
                    <X size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
              <label className="relative flex min-h-11 min-w-[7rem] items-center rounded-lg border border-line bg-card pl-8 text-fg-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30">
                <ListFilter
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 text-fg-3"
                />
                <span className="sr-only">페이지 필터</span>
                <select
                  value={pageFilter}
                  onChange={(event) => setPageFilter(event.currentTarget.value as StudioPageListFilter)}
                  aria-label="페이지 필터"
                  className="min-h-11 w-full appearance-none bg-transparent pr-7 text-[0.7rem] font-semibold outline-none"
                >
                  {PAGE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 text-fg-3"
                />
              </label>
              <button
                type="button"
                onClick={() => setAutoFollowCurrent((value) => !value)}
                aria-label={autoFollowCurrent
                  ? "현재 페이지 자동 추적 끄기"
                  : "현재 페이지 자동 추적 켜기"}
                aria-pressed={autoFollowCurrent}
                title={autoFollowCurrent
                  ? "현재 페이지를 목록 안에 자동으로 유지"
                  : "현재 페이지 자동 추적 꺼짐"}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  autoFollowCurrent
                    ? "border-accent/50 bg-accent-soft/40 text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                <LocateFixed size={14} aria-hidden />
              </button>
            </div>
            <span id={navigationHelpId} className="sr-only">
              검색은 페이지 이름, 번호, 콘티 메모, 샷 태그, 검토 상태와 담당자를 함께 찾습니다.
              페이지 카드에서 방향키, Home, End, Page Up, Page Down으로 이동하고 Shift를 함께
              눌러 연속 선택할 수 있습니다. Control 또는 Command+A는 현재 표시 결과를 모두 선택합니다.
            </span>
            <div className="mt-1 flex min-h-8 flex-wrap items-center gap-1 text-[0.65rem] text-fg-3">
              <span aria-live="polite" aria-atomic="true" className="mr-auto tabular-nums">
                {navigationEntries.length}개 표시
                {hiddenSelectedPageCount > 0 ? ` · 선택 ${hiddenSelectedPageCount}개 숨김` : ""}
                {!currentPageVisible && navigationActive ? " · 현재 페이지 숨김" : ""}
              </span>
              <button
                type="button"
                data-testid="studio-page-select-visible"
                onClick={selectAllVisiblePages}
                disabled={visiblePageIds.length === 0}
                className="min-h-8 rounded-md px-2 font-semibold text-fg-2 hover:bg-raised disabled:opacity-40"
              >
                표시 전체 선택
              </button>
              {liveSelectedPageIds.length > 0 ? (
                <button
                  type="button"
                  data-testid="studio-page-clear-selection"
                  onClick={() => {
                    setSelectedPageIds([]);
                    setSelectionAnchorPageId(currentPageId);
                  }}
                  className="min-h-8 rounded-md px-2 font-semibold text-fg-2 hover:bg-raised"
                >
                  선택 해제
                </button>
              ) : null}
              {!currentPageVisible && navigationActive ? (
                <button
                  type="button"
                  data-testid="studio-page-show-current"
                  onClick={clearNavigation}
                  className="min-h-8 rounded-md px-2 font-semibold text-fg-2 hover:bg-raised"
                >
                  현재 페이지 보기
                </button>
              ) : null}
              {navigationActive ? (
                <button
                  type="button"
                  onClick={clearNavigation}
                  className="min-h-8 rounded-md px-2 font-semibold text-accent hover:bg-accent-soft"
                >
                  검색·필터 초기화
                </button>
              ) : null}
            </div>
            {navigationActive ? (
              <p className="mt-1 rounded-md border border-line/70 bg-raised/40 px-2 py-1 text-[0.62rem] leading-snug text-fg-3">
                검색·필터 중에는 숨은 페이지 사이로 잘못 놓이지 않도록 드래그 정렬을 잠급니다.
                순서 변경 버튼과 일괄 이동은 전체 문서 순서를 기준으로 계속 동작합니다.
              </p>
            ) : null}

            <div
              role="toolbar"
              aria-label="페이지 일괄 작업"
              className="mt-1 flex items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-x-visible"
            >
              <button
                type="button"
                onClick={applyGradeToAll}
                className="min-h-11 min-w-11 shrink-0 rounded-lg border border-line px-3 text-[0.7rem] text-fg-3 hover:bg-raised lg:px-1.5 lg:text-[10px]"
                title="현재 페이지의 색보정을 모든 페이지에 적용"
              >
                그레이드 전체
              </button>
              <button
                type="button"
                onClick={applyBgToAll}
                className="min-h-11 min-w-11 shrink-0 rounded-lg border border-line px-3 text-[0.7rem] text-fg-3 hover:bg-raised lg:px-1.5 lg:text-[10px]"
                title="현재 페이지의 배경을 모든 페이지에 적용"
              >
                배경 전체
              </button>
              <button
                type="button"
                onClick={() => setMasterPanelOpen((value) => !value)}
                disabled={collaborationDocumentLocked}
                aria-pressed={masterPanelOpen}
                className={cn(
                  "min-h-11 min-w-11 shrink-0 rounded-lg border px-3 text-[0.7rem] transition-colors disabled:cursor-not-allowed disabled:opacity-50 lg:px-1.5 lg:text-[10px]",
                  masterEditMode
                    ? "border-accent bg-accent-soft/50 text-accent"
                    : masterPanelOpen
                      ? "border-accent/60 text-fg-2 hover:bg-raised"
                      : "border-line text-fg-3 hover:bg-raised",
                )}
                title={collaborationDocumentLocked
                  ? collaborationLockMessage()
                  : "마스터 페이지(모든 페이지 공통 요소) 관리"}
              >
                마스터{master.elements.length > 0 ? ` ${master.elements.length}` : ""}
              </button>
              <div
                role="group"
                aria-label="페이지 미리보기 크기"
                className="ml-auto flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-1.5"
                title={`페이지 미리보기 ${PAGE_PREVIEW_SIZE_LABEL[pagePreviewSize]}`}
              >
                <Minimize2 size={12} className="shrink-0 text-fg-3" aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={PAGE_PREVIEW_SIZE_VALUES.length - 1}
                  step={1}
                  value={PAGE_PREVIEW_SIZE_VALUES.indexOf(pagePreviewSize)}
                  onChange={(event) => {
                    const next = PAGE_PREVIEW_SIZE_VALUES[Number(event.currentTarget.value)];
                    if (!next) return;
                    selectPagePreviewSize(next);
                  }}
                  aria-label="페이지 미리보기 크기 조절"
                  aria-valuetext={PAGE_PREVIEW_SIZE_LABEL[pagePreviewSize]}
                  className="h-11 w-20 cursor-pointer accent-accent lg:w-16"
                />
                <Maximize2 size={12} className="shrink-0 text-fg-3" aria-hidden />
              </div>
            </div>
            {preferenceAuthority === "memory-only" ? (
              <p role="status" className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[0.62rem] text-fg-2">
                미리보기 크기는 저장소를 다시 연결하기 전까지 이번 탭에서만 유지됩니다.
              </p>
            ) : null}
            {multiSelectActive ? (
              <div
                role="toolbar"
                aria-label="선택한 페이지 일괄 작업"
                data-testid="studio-page-bulk-toolbar"
                className="mt-1.5 flex min-h-11 items-center gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-accent/40 bg-accent-soft/30 px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <span className="shrink-0 px-1.5 text-[0.7rem] font-bold tabular-nums text-accent lg:text-[10px]">
                  {liveSelectedPageIds.length}개 선택
                </span>
                <button
                  type="button"
                  data-testid="studio-page-bulk-move-up"
                  onClick={() => movePagesBulk(liveSelectedPageIds, -1)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 위로 이동"
                  aria-label="선택한 페이지 위로 이동"
                >
                  <ChevronUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-page-bulk-move-down"
                  onClick={() => movePagesBulk(liveSelectedPageIds, 1)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 아래로 이동"
                  aria-label="선택한 페이지 아래로 이동"
                >
                  <ChevronDown size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-page-bulk-delete"
                  onClick={() => {
                    void (async () => {
                      if (
                        !(await confirmStudioDestructiveAction(
                          studioDeletePagesBulkRequest(liveSelectedPageIds.length),
                        ))
                      ) return;
                      deletePagesBulk(liveSelectedPageIds);
                      setSelectedPageIds([]);
                    })();
                  }}
                  disabled={pages.length <= 1}
                  className="ml-auto grid size-11 shrink-0 place-items-center rounded-xl text-bad hover:bg-bad-soft/20 disabled:opacity-30 lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 삭제"
                  aria-label="선택한 페이지 삭제"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>

          <div
            id={pageResultsId}
            data-testid="studio-page-results"
            aria-label="페이지 검색 결과"
            aria-busy={pageQuery !== deferredPageQuery}
            data-studio-page-navigation-active={navigationActive ? "true" : undefined}
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5"
          >
            {navigationEntries.length === 0 ? (
              <div
                aria-live="polite"
                className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line bg-card/50 p-5 text-center"
              >
                <div>
                  <Search size={22} aria-hidden className="mx-auto mb-2 text-fg-3" />
                  <p className="text-sm font-bold text-fg-2">조건에 맞는 페이지가 없습니다</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-3">
                    이름, 번호, 콘티 메모, 샷 태그, 검토 상태와 담당자를 검색할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={clearNavigation}
                    className="mt-3 min-h-11 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    검색·필터 초기화
                  </button>
                </div>
              </div>
            ) : navigationEntries.map(({ page: p, index: idx, displayName }, visibleIndex) => {
              const isActive = p.id === currentPageId;
              const isMultiSelected = liveSelectedPageIdSet.has(p.id);
              const dropIndicator = navigationActive ? null : pageDnd.indicatorFor(idx);
              const dndProps = navigationActive ? null : pageDnd.itemProps(idx);
              const review = normalizePageReviewState(p.review);
              return (
                <div
                  key={p.id}
                  ref={(node) => {
                    if (node) pageItemRefs.current.set(p.id, node);
                    else pageItemRefs.current.delete(p.id);
                  }}
                  data-testid="studio-page-item"
                  data-page-index={idx}
                  data-visible-index={visibleIndex}
                  data-selected={isMultiSelected ? "true" : undefined}
                  {...(dndProps ?? { draggable: false })}
                  title={navigationActive
                    ? "검색·필터 중에는 드래그 정렬이 잠깁니다 · Shift/⌘/Ctrl+클릭으로 다중 선택"
                    : "드래그하여 순서 변경 · Shift 연속 선택 · ⌘/Ctrl+클릭 개별 선택 · 더블클릭 이름 편집"}
                  className={cn(
                    "relative flex w-full flex-col gap-0.5 rounded-lg border p-1.5 transition-all hover:bg-raised/50 [content-visibility:auto] [contain-intrinsic-size:auto_12rem]",
                    isActive || isMultiSelected
                      ? "border-accent bg-accent-soft/40"
                      : "border-line bg-card",
                    isMultiSelected && !isActive && "ring-1 ring-accent/50",
                    !navigationActive && pageDnd.dragIndex === idx && "opacity-50",
                  )}
                >
                  <button
                    ref={(node) => {
                      if (node) pageButtonRefs.current.set(p.id, node);
                      else pageButtonRefs.current.delete(p.id);
                    }}
                    type="button"
                    onClick={(event) => selectPageFromPointer(event, p.id)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setMetaEditPageId(p.id);
                    }}
                    onKeyDown={(event) => handlePageSelectionKeyDown(event, p.id)}
                    aria-label={`${displayName} 선택`}
                    aria-pressed={isActive || isMultiSelected}
                    aria-current={isActive ? "page" : undefined}
                    aria-describedby={navigationHelpId}
                    className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  {dropIndicator ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-10 h-[3px] rounded-full bg-accent",
                        dropIndicator === "before" ? "top-0" : "bottom-0",
                      )}
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-bold text-fg-2 lg:min-w-[3.5rem] lg:text-[10px]"
                      title={displayName}
                    >
                      {displayName}
                    </span>
                    <span className="shrink-0 text-[0.6rem] tabular-nums text-fg-3">
                      {idx + 1}/{pages.length}
                    </span>
                    {shotTagBadgeText(p) ? (
                      <span
                        className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[0.65rem] font-semibold text-accent lg:text-[8px]"
                        title={shotTagBadgeTitle(p) ?? undefined}
                      >
                        {shotTagBadgeText(p)}
                      </span>
                    ) : null}
                    {review.status !== "draft" ? (
                      <span
                        data-testid={`studio-page-review-${p.id}`}
                        className={cn(
                          "shrink-0 rounded px-1 py-0.5 text-[0.62rem] font-semibold lg:text-[8px]",
                          review.status === "approved"
                            ? "bg-good-soft/30 text-good"
                            : review.status === "changes-requested"
                              ? "bg-bad-soft/30 text-bad"
                              : "bg-warning/15 text-warning",
                        )}
                        title={review.assignee
                          ? `${PAGE_REVIEW_STATUS_LABELS[review.status]} · ${review.assignee}`
                          : PAGE_REVIEW_STATUS_LABELS[review.status]}
                      >
                        {PAGE_REVIEW_STATUS_LABELS[review.status]}
                      </span>
                    ) : null}
                    {review.locked ? (
                      <span
                        role="img"
                        className="grid size-6 shrink-0 place-items-center rounded text-fg-3"
                        title="검토 잠금"
                        aria-label="검토 잠금"
                      >
                        <LockKeyhole size={11} aria-hidden />
                      </span>
                    ) : null}
                    <div className="relative z-20 flex max-w-[70%] items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-none lg:flex-wrap lg:justify-end lg:overflow-visible">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMetaEditPageId((value) => (value === p.id ? null : p.id));
                        }}
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-xl hover:bg-raised lg:rounded",
                          metaEditPageId === p.id ? "text-accent" : "text-fg-3",
                        )}
                        title="이름·콘티 메모 편집"
                        aria-label={`${displayName} 이름·콘티 메모 편집`}
                        aria-expanded={metaEditPageId === p.id}
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          movePageUp(p.id);
                        }}
                        disabled={idx === 0}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:rounded"
                        title="위로 이동"
                        aria-label="위로 이동"
                      >
                        <ChevronUp size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          movePageDown(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:rounded"
                        title="아래로 이동"
                        aria-label="아래로 이동"
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          movePageToTop(p.id);
                        }}
                        disabled={idx === 0}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:rounded"
                        title="맨 위로"
                        aria-label="맨 위로 이동"
                      >
                        <span aria-hidden="true" className="text-sm leading-none lg:text-[10px]">⇧</span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          movePageToBottom(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:rounded"
                        title="맨 아래로"
                        aria-label="맨 아래로 이동"
                      >
                        <span aria-hidden="true" className="text-sm leading-none lg:text-[10px]">⇩</span>
                      </button>
                    </div>
                  </div>
                  <Suspense
                    fallback={(
                      <div
                        aria-hidden="true"
                        className={cn(
                          PAGE_PREVIEW_SIZE_CLASS[pagePreviewSize],
                          "animate-pulse rounded border border-line/60 bg-raised/40",
                        )}
                      />
                    )}
                  >
                    <StudioPageThumbnail
                      page={composeWorkAssetPreviewPage(p)}
                      className={PAGE_PREVIEW_SIZE_CLASS[pagePreviewSize]}
                    />
                  </Suspense>
                  {metaEditPageId === p.id ? (
                    <div className="relative z-20 flex flex-col gap-1 pt-1">
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- explicit rename command should focus the editable page name.
                        autoFocus
                        type="text"
                        defaultValue={p.name ?? ""}
                        placeholder={autoPageName(idx)}
                        maxLength={PAGE_NAME_MAX}
                        aria-label="페이지 이름"
                        className="min-h-11 w-full rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none lg:min-h-0 lg:rounded lg:px-1.5 lg:py-1 lg:text-[10px]"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            commitPageMeta(p.id, { name: event.currentTarget.value });
                            setMetaEditPageId(null);
                          } else if (event.key === "Escape") {
                            setMetaEditPageId(null);
                          }
                        }}
                        onBlur={(event) => commitPageMeta(p.id, { name: event.target.value })}
                      />
                      <textarea
                        rows={2}
                        defaultValue={p.note ?? ""}
                        placeholder="콘티 메모 (장면·대사 아이디어)"
                        maxLength={PAGE_NOTE_MAX}
                        spellCheck
                        aria-label="콘티 메모"
                        className="min-h-16 w-full resize-none rounded-lg border border-line bg-card px-2 py-2 text-xs leading-tight text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none lg:min-h-0 lg:rounded lg:px-1.5 lg:py-1 lg:text-[9px]"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onBlur={(event) => commitPageMeta(p.id, { note: event.target.value })}
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMetaEditPageId(null);
                        }}
                        className="min-h-11 self-end rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-hover lg:min-h-0 lg:rounded lg:px-2 lg:py-0.5 lg:text-[9px]"
                      >
                        완료
                      </button>
                    </div>
                  ) : p.note ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-[9px] leading-tight text-fg-3" title={p.note}>
                      {p.note}
                    </p>
                  ) : null}
                  <div className="relative z-20 flex items-center justify-start gap-1 overflow-x-auto overscroll-x-contain pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:justify-end lg:overflow-visible">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        insertPageBefore(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:rounded"
                      title="이 앞에 빈 페이지 삽입"
                      aria-label="이 앞에 빈 페이지 삽입"
                    >
                      <Plus size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        insertPageAfter(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:rounded"
                      title="이 뒤에 빈 페이지 삽입"
                      aria-label="이 뒤에 빈 페이지 삽입"
                    >
                      <Plus size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicatePage(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:rounded"
                      title="페이지 복제"
                      aria-label="페이지 복제"
                    >
                      <Copy size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        duplicatePageMirrored(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:rounded"
                      title="미러 복제 (좌우 반전)"
                      aria-label="미러 복제 (좌우 반전)"
                    >
                      <FlipHorizontal2 size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearPageFor(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:rounded"
                      title="이 페이지 내용 비우기"
                      aria-label="이 페이지 내용 비우기"
                    >
                      <Eraser size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (pages.length <= 1) return;
                        void (async () => {
                          if (
                            !(await confirmStudioDestructiveAction(
                              studioDeletePageRequest({
                                pageNumber: idx + 1,
                                elementCount: p.elements.length,
                              }),
                            ))
                          ) return;
                          deletePage(p.id);
                        })();
                      }}
                      disabled={pages.length <= 1}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-bad hover:bg-bad-soft/20 disabled:opacity-30 lg:rounded"
                      title="페이지 삭제"
                      aria-label="페이지 삭제"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </StudioDetachablePanelSlot>

      {visibleLeftPanelOpen && !desktopDetached ? (
        <StudioPageListResizeHandle leftResize={leftResize} />
      ) : null}
    </>
  );
});
