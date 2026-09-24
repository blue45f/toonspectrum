import { useRef, useState } from "react";

import {
  shouldSeedStudioLiveSharedBootstrapPage,
  studioLiveSharedBootstrapPageId,
} from "../../live/studio-live-jam-session";
import { uid } from "../../studio-id";

import type { PageState } from "../../studio-page-state";

interface UseStudioPageHistorySnapshotsOptions {
  readonly effectiveWorkId: string;
  readonly markStudioDocumentChanged: () => boolean;
  readonly workId: string | null;
  readonly initialCanvasHeight?: number;
  readonly initialPageCount?: number;
  readonly initialPage?: (
    pageId: string,
    pageIndex: number,
  ) => Pick<PageState, "canvasH" | "elements" | "name"> | null;
}

/** Bounded page-snapshot state used by page, stroke, and document undo/redo commands. */
export function useStudioPageHistorySnapshots({
  effectiveWorkId,
  markStudioDocumentChanged,
  workId,
  initialCanvasHeight = 1080,
  initialPageCount = 1,
  initialPage,
}: UseStudioPageHistorySnapshotsOptions) {
  const [pagesHistory, setPagesHistoryState] = useState<PageState[][]>(() => {
    const pageCount = workId === null
      ? Math.min(Math.max(1, Math.floor(initialPageCount)), 200)
      : 1;
    const sharedBootstrap = shouldSeedStudioLiveSharedBootstrapPage(workId);
    const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
      const id = pageIndex === 0 && sharedBootstrap
        ? studioLiveSharedBootstrapPageId(effectiveWorkId)
        : uid();
      const seed = workId === null ? initialPage?.(id, pageIndex) : null;
      return {
        id,
        elements: seed?.elements ?? [],
        bg: "#ffffff",
        bgGrad: null,
        canvasH: seed?.canvasH ?? initialCanvasHeight,
        ...(seed?.name !== undefined ? { name: seed.name } : {}),
      };
    });
    return [pages];
  });
  const setPagesHistory = (next: Parameters<typeof setPagesHistoryState>[0]) => {
    if (!markStudioDocumentChanged()) return;
    setPagesHistoryState(next);
  };

  const [pagesHi, setPagesHiState] = useState(0);
  const setPagesHi = (next: Parameters<typeof setPagesHiState>[0]) => {
    if (!markStudioDocumentChanged()) return;
    setPagesHiState(next);
  };
  const pagesHiRef = useRef(pagesHi);
  pagesHiRef.current = pagesHi;
  const pagesHistoryRef = useRef(pagesHistory);
  pagesHistoryRef.current = pagesHistory;

  return {
    pages: pagesHistory[pagesHi],
    pagesHi,
    pagesHiRef,
    pagesHistory,
    pagesHistoryRef,
    setPagesHi,
    setPagesHiState,
    setPagesHistory,
    setPagesHistoryState,
  } as const;
}
