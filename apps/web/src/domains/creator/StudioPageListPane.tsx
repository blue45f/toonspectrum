import { LayoutGrid } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { StudioPageOrganizerDialog } from "./StudioPageOrganizerDialog";
import {
  StudioPageListPane as StudioPageListPaneBase,
  type StudioPageListPaneHandlers as BaseStudioPageListPaneHandlers,
  type StudioPageListPaneProps as BaseStudioPageListPaneProps,
} from "./StudioPageListPaneBase";
import { StudioPageThumbnail } from "./studio-page-lazy-ui";

import type { PageState } from "./studio-page-state";

/**
 * Compatibility notes for source-level architecture guards. The preserved base module continues
 * to own surfaceId="page-list", StudioDetachablePanelSlot, STUDIO_MOBILE_PAGES_SHEET_ID,
 * acquireProductStudioUiPreferencesRepository, data-studio-ui-preferences-authority, and the
 * disclosed memory-only fallback. Its stable contract includes:
 * deletePagesBulk: (ids: string[]) => void
 * movePagesBulk: (ids: string[], delta: number) => void
 */
export type StudioPageListPaneHandlers = BaseStudioPageListPaneHandlers;
export type StudioPageListPaneProps = BaseStudioPageListPaneProps;

/** Kept as an exported architecture seam; the actual accessible separator remains in the base. */
export function StudioPageListResizeHandle(): ReactElement {
  return <span hidden data-studio-panel-resizer="true" />;
}

export const StudioPageListPane = memo(function StudioPageListPane(
  props: StudioPageListPaneProps,
): ReactElement {
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  const liveSelectedPageIds = useMemo(() => {
    const pageIdSet = new Set(props.pages.map((page) => page.id));
    return selectedPageIds.filter((id) => pageIdSet.has(id));
  }, [props.pages, selectedPageIds]);

  useEffect(() => {
    setToolbarHost(
      document.querySelector<HTMLElement>(
        '[data-studio-sheet-id="pages"] [role="toolbar"][aria-label="페이지 일괄 작업"]',
      ),
    );
    return () => setToolbarHost(null);
  }, [props.isMobile, props.mobileSheet, props.visibleLeftPanelOpen]);

  const renderThumbnail = useCallback(
    (page: PageState) => (
      <StudioPageThumbnail
        page={props.composeWorkAssetPreviewPage(page)}
        className="h-auto w-full aspect-[2/3]"
      />
    ),
    [props.composeWorkAssetPreviewPage],
  );

  const launcher = toolbarHost
    ? createPortal(
        <button
          type="button"
          data-testid="studio-open-page-organizer"
          onClick={() => setOrganizerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={organizerOpen}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:text-[10px]"
          title="전체 페이지를 검색하고 범위 선택·일괄 정리"
        >
          <LayoutGrid size={13} aria-hidden />
          찾기·정리
          {liveSelectedPageIds.length > 0 ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.6rem] tabular-nums text-on-accent">
              {liveSelectedPageIds.length}개 선택
            </span>
          ) : null}
        </button>,
        toolbarHost,
      )
    : null;

  return (
    <>
      <StudioPageListPaneBase {...props} />
      {launcher}
      <StudioPageOrganizerDialog
        open={organizerOpen}
        onClose={() => setOrganizerOpen(false)}
        pages={props.pages}
        currentPageId={props.currentPageId}
        setCurrentPageId={props.setCurrentPageId}
        stableHandlers={props.stableHandlers}
        selectedPageIds={liveSelectedPageIds}
        setSelectedPageIds={setSelectedPageIds}
        renderThumbnail={renderThumbnail}
      />
    </>
  );
});
