import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeletePagesBulkRequest } from "./studio-destructive-command-catalog";
import {
  StudioPageOrganizerGrid,
} from "./StudioPageOrganizerGrid";
import {
  StudioPageOrganizerFooter,
  StudioPageOrganizerToolbar,
  type StudioPageOrganizerBulkAction,
} from "./StudioPageOrganizerToolbar";
import {
  buildStudioPageOrganizerEntries,
  filterStudioPageOrganizerEntries,
  isStudioPageNavigationKey,
  resolveStudioPageKeyboardTarget,
  resolveStudioPageRangeSelection,
  type StudioPageOrganizerFilter,
} from "./studio-page-organizer";

import type {
  StudioPageListPaneHandlers,
  StudioPageListPaneProps,
} from "./StudioPageListPaneBase";
import type { PageState } from "./studio-page-state";

function scheduleBrowserFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 0);
}

function cancelBrowserFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  window.clearTimeout(handle);
}

function nextBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    scheduleBrowserFrame(() => resolve());
  });
}

export interface StudioPageOrganizerDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly pages: PageState[];
  readonly currentPageId: string;
  readonly setCurrentPageId: StudioPageListPaneProps["setCurrentPageId"];
  readonly stableHandlers: StudioPageListPaneHandlers;
  readonly selectedPageIds: string[];
  readonly setSelectedPageIds: Dispatch<SetStateAction<string[]>>;
  readonly renderThumbnail: (page: PageState) => ReactNode;
}

export function StudioPageOrganizerDialog({
  open,
  onClose,
  pages,
  currentPageId,
  setCurrentPageId,
  stableHandlers,
  selectedPageIds,
  setSelectedPageIds,
  renderThumbnail,
}: StudioPageOrganizerDialogProps): ReactElement | null {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<StudioPageOrganizerFilter>("all");
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<StudioPageOrganizerBulkAction>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pageButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const entries = useMemo(() => buildStudioPageOrganizerEntries(pages), [pages]);
  const filteredEntries = useMemo(
    () => filterStudioPageOrganizerEntries(entries, deferredQuery, filter),
    [deferredQuery, entries, filter],
  );
  const orderedPageIds = useMemo(() => pages.map((page) => page.id), [pages]);
  const visiblePageIds = useMemo(
    () => filteredEntries.map((entry) => entry.id),
    [filteredEntries],
  );
  const pageIdSet = useMemo(() => new Set(orderedPageIds), [orderedPageIds]);
  const canonicalSelectedIds = useMemo(
    () => orderedPageIds.filter((id) => selectedPageIds.includes(id)),
    [orderedPageIds, selectedPageIds],
  );
  const currentPageVisible = visiblePageIds.includes(currentPageId);
  const organizerActive = deferredQuery.trim() !== "" || filter !== "all";

  useEffect(() => {
    if (!open) return;
    if (selectedPageIds.some((id) => pageIdSet.has(id))) return;
    if (pageIdSet.has(currentPageId)) {
      setSelectedPageIds([currentPageId]);
      setSelectionAnchorId(currentPageId);
    }
  }, [currentPageId, open, pageIdSet, selectedPageIds, setSelectedPageIds]);

  useEffect(() => {
    if (!open) return;
    const frame = scheduleBrowserFrame(() => searchInputRef.current?.focus());
    return () => cancelBrowserFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !currentPageVisible) return;
    const frame = scheduleBrowserFrame(() => {
      pageButtonRefs.current.get(currentPageId)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
    return () => cancelBrowserFrame(frame);
  }, [currentPageId, currentPageVisible, open]);

  useEffect(() => {
    if (!open) return;
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const focusPage = (pageId: string): void => {
    scheduleBrowserFrame(() => pageButtonRefs.current.get(pageId)?.focus());
  };

  const setPageButtonRef = (pageId: string, node: HTMLButtonElement | null): void => {
    if (node) pageButtonRefs.current.set(pageId, node);
    else pageButtonRefs.current.delete(pageId);
  };

  const selectPage = (
    pageId: string,
    options: { readonly additive: boolean; readonly range: boolean },
  ): void => {
    if (!setCurrentPageId(pageId)) return;
    if (options.range) {
      const next = resolveStudioPageRangeSelection(
        visiblePageIds,
        selectionAnchorId ?? currentPageId ?? pageId,
        pageId,
        {
          additive: options.additive,
          currentSelection: canonicalSelectedIds,
        },
      );
      setSelectedPageIds(next);
      if (!selectionAnchorId) setSelectionAnchorId(currentPageId || pageId);
      return;
    }
    setSelectionAnchorId(pageId);
    if (options.additive) {
      setSelectedPageIds((previous) => {
        const live = orderedPageIds.filter((id) => previous.includes(id));
        return live.includes(pageId)
          ? live.filter((id) => id !== pageId)
          : orderedPageIds.filter((id) => live.includes(id) || id === pageId);
      });
      return;
    }
    setSelectedPageIds([pageId]);
  };

  const onPageKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    pageId: string,
  ): void => {
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedPageIds(visiblePageIds);
      if (visiblePageIds[0]) setSelectionAnchorId(visiblePageIds[0]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (organizerActive) {
        setQuery("");
        setFilter("all");
      } else {
        setSelectedPageIds(pageIdSet.has(currentPageId) ? [currentPageId] : []);
        setSelectionAnchorId(currentPageId || null);
      }
      return;
    }
    if (!isStudioPageNavigationKey(event.key)) return;
    event.preventDefault();
    const target = resolveStudioPageKeyboardTarget(visiblePageIds, pageId, event.key);
    if (!target || target === pageId) return;
    selectPage(target, { additive: command, range: event.shiftKey });
    focusPage(target);
  };

  const moveSelected = (delta: number): void => {
    if (canonicalSelectedIds.length === 0) return;
    stableHandlers.movePagesBulk(canonicalSelectedIds, delta);
  };

  const duplicateSelected = async (): Promise<void> => {
    if (canonicalSelectedIds.length === 0 || bulkAction) return;
    setBulkAction("duplicate");
    try {
      // Reverse document order so every single-page insertion remains next to its source.
      for (const pageId of [...canonicalSelectedIds].reverse()) {
        stableHandlers.duplicatePage(pageId);
        await nextBrowserPaint();
      }
    } finally {
      setBulkAction(null);
    }
  };

  const deleteSelected = async (): Promise<void> => {
    if (canonicalSelectedIds.length === 0 || pages.length <= 1 || bulkAction) return;
    setBulkAction("delete");
    try {
      const approved = await confirmStudioDestructiveAction(
        studioDeletePagesBulkRequest(canonicalSelectedIds.length),
      );
      if (!approved) return;
      stableHandlers.deletePagesBulk(canonicalSelectedIds);
      setSelectedPageIds([]);
      setSelectionAnchorId(null);
    } finally {
      setBulkAction(null);
    }
  };

  const resetOrganizer = (): void => {
    setQuery("");
    setFilter("all");
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-page-organizer-title"
      className="fixed inset-0 z-[100] flex bg-[oklch(0.08_0.01_70/0.86)] p-2 text-fg backdrop-blur-sm sm:p-4"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="mx-auto flex h-full w-full max-w-[112rem] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <StudioPageOrganizerToolbar
          query={query}
          filter={filter}
          filteredCount={filteredEntries.length}
          pageCount={pages.length}
          visibleCount={visiblePageIds.length}
          selectedCount={canonicalSelectedIds.length}
          currentPageHidden={!currentPageVisible && organizerActive}
          bulkAction={bulkAction}
          canDelete={pages.length > 1}
          searchInputRef={searchInputRef}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onSelectAll={() => {
            setSelectedPageIds(visiblePageIds);
            if (visiblePageIds[0]) setSelectionAnchorId(visiblePageIds[0]);
          }}
          onReset={resetOrganizer}
          onRevealCurrent={() => {
            resetOrganizer();
            scheduleBrowserFrame(() => focusPage(currentPageId));
          }}
          onMove={moveSelected}
          onDuplicate={() => void duplicateSelected()}
          onClearSelection={() => setSelectedPageIds([])}
          onDelete={() => void deleteSelected()}
          onAddPage={stableHandlers.addPage}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
          <StudioPageOrganizerGrid
            entries={filteredEntries}
            selectedPageIds={canonicalSelectedIds}
            currentPageId={currentPageId}
            setPageButtonRef={setPageButtonRef}
            onSelectPage={selectPage}
            onPageKeyDown={onPageKeyDown}
            onReset={resetOrganizer}
            renderThumbnail={renderThumbnail}
          />
        </div>

        <StudioPageOrganizerFooter />
      </section>
    </div>,
    document.body,
  );
}
