import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";

import {
  applyStudioResumeViewport,
  captureStudioResumeViewport,
  planStudioResumeViewportRestore,
  readStudioResumeCheckpoint,
  writeStudioResumeCheckpoint,
  type StudioResumeCheckpointStorage,
} from "./studio-resume-checkpoint";

interface StudioResumeElementLike {
  readonly id: string;
}

interface StudioResumePageLike {
  readonly id: string;
  readonly elements: readonly StudioResumeElementLike[];
}

interface StudioResumeViewportSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
}

interface UseStudioResumeCheckpointInput {
  readonly activePageId: string;
  readonly documentKey: string;
  readonly hydrated: boolean;
  readonly layoutKey: string;
  readonly marqueeIds: readonly string[];
  readonly pages: readonly StudioResumePageLike[];
  readonly selectedId: string | null;
  readonly setCurrentPageId: (pageId: string) => unknown;
  readonly setMarqueeIds: (ids: string[]) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setZoom: (zoom: number | ((current: number) => number)) => void;
  readonly storage?: StudioResumeCheckpointStorage | null;
  readonly updateScrollPosRef: MutableRefObject<() => void>;
  readonly viewport: StudioResumeViewportSnapshot;
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly zoom: number;
}

interface LatestCheckpointInput {
  readonly activePageId: string;
  readonly documentKey: string;
  readonly marqueeIds: readonly string[];
  readonly pages: readonly StudioResumePageLike[];
  readonly selectedId: string | null;
  readonly viewport: StudioResumeViewportSnapshot;
  readonly wrap: HTMLDivElement | null;
  readonly zoom: number;
}

const SAVE_DELAY_MS = 800;

function selectedIdsForCheckpoint(input: LatestCheckpointInput): readonly string[] {
  const page = input.pages.find((candidate) => candidate.id === input.activePageId);
  if (!page) return [];
  const available = new Set(page.elements.map((element) => element.id));
  const candidates = input.marqueeIds.length > 0
    ? input.marqueeIds
    : input.selectedId ? [input.selectedId] : [];
  return [...new Set(candidates)].filter((id) => available.has(id));
}

/**
 * Restores and persists editor-only continuity. It never writes project content, history, comments,
 * collaboration state or source files; those remain under the document repositories and autosave.
 */
export function useStudioResumeCheckpoint(input: UseStudioResumeCheckpointInput): void {
  const {
    activePageId,
    documentKey,
    hydrated,
    layoutKey,
    marqueeIds,
    pages,
    selectedId,
    setCurrentPageId,
    setMarqueeIds,
    setSelectedId,
    setZoom,
    storage,
    updateScrollPosRef,
    viewport,
    wrapRef,
    zoom,
  } = input;
  const [restorePhase, setRestorePhase] = useState<"idle" | "pending" | "ready">("idle");
  const checkpointRef = useRef<ReturnType<typeof readStudioResumeCheckpoint>>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const scheduledRestoreRef = useRef<number[]>([]);
  const readyRef = useRef(false);
  const latestRef = useRef<LatestCheckpointInput>({
    activePageId,
    documentKey,
    marqueeIds,
    pages,
    selectedId,
    viewport,
    wrap: wrapRef.current,
    zoom,
  });
  latestRef.current = {
    activePageId,
    documentKey,
    marqueeIds,
    pages,
    selectedId,
    viewport,
    wrap: wrapRef.current,
    zoom,
  };

  useEffect(() => {
    if (!hydrated || loadedDocumentKeyRef.current === documentKey) return;
    loadedDocumentKeyRef.current = documentKey;
    readyRef.current = false;
    const checkpoint = readStudioResumeCheckpoint(documentKey, storage);
    checkpointRef.current = checkpoint;
    if (!checkpoint) {
      readyRef.current = true;
      setRestorePhase("ready");
      return;
    }
    const page = pages.find((candidate) => candidate.id === checkpoint.pageId);
    if (!page) {
      readyRef.current = true;
      setRestorePhase("ready");
      return;
    }
    const available = new Set(page.elements.map((element) => element.id));
    const selection = checkpoint.selectedIds.filter((id) => available.has(id));
    setCurrentPageId(page.id);
    setSelectedId(selection[0] ?? null);
    setMarqueeIds(selection.length > 1 ? [...selection] : []);
    setRestorePhase("pending");
  }, [
    documentKey,
    hydrated,
    pages,
    setCurrentPageId,
    setMarqueeIds,
    setSelectedId,
    storage,
  ]);

  useLayoutEffect(() => {
    if (restorePhase !== "pending") return;
    const checkpoint = checkpointRef.current;
    const wrap = wrapRef.current;
    if (!checkpoint || checkpoint.pageId !== activePageId || !wrap) return;
    setZoom(checkpoint.viewport.zoom);
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        const currentWrap = wrapRef.current;
        if (!currentWrap) return;
        const plan = planStudioResumeViewportRestore(checkpoint.viewport, {
          scrollWidth: currentWrap.scrollWidth,
          scrollHeight: currentWrap.scrollHeight,
          viewportWidth: currentWrap.clientWidth,
          viewportHeight: currentWrap.clientHeight,
        });
        applyStudioResumeViewport(currentWrap, plan);
        updateScrollPosRef.current();
        checkpointRef.current = null;
        readyRef.current = true;
        setRestorePhase("ready");
      });
      scheduledRestoreRef.current.push(secondFrame);
    });
    scheduledRestoreRef.current.push(firstFrame);
    return () => {
      for (const frame of scheduledRestoreRef.current) window.cancelAnimationFrame(frame);
      scheduledRestoreRef.current = [];
    };
  }, [
    activePageId,
    layoutKey,
    restorePhase,
    setZoom,
    updateScrollPosRef,
    wrapRef,
  ]);

  const persistLatest = useCallback(() => {
    if (!readyRef.current) return;
    const latest = latestRef.current;
    const wrap = latest.wrap ?? wrapRef.current;
    if (!wrap || !latest.activePageId) return;
    writeStudioResumeCheckpoint({
      documentKey: latest.documentKey,
      pageId: latest.activePageId,
      selectedIds: selectedIdsForCheckpoint(latest),
      viewport: captureStudioResumeViewport({
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
        scrollWidth: wrap.scrollWidth || latest.viewport.scrollWidth,
        scrollHeight: wrap.scrollHeight || latest.viewport.scrollHeight,
        viewportWidth: wrap.clientWidth || latest.viewport.width,
        viewportHeight: wrap.clientHeight || latest.viewport.height,
        zoom: latest.zoom,
      }),
      updatedAt: Date.now(),
    }, storage);
  }, [storage, wrapRef]);

  useEffect(() => {
    if (restorePhase !== "ready") return;
    const timer = window.setTimeout(persistLatest, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    activePageId,
    layoutKey,
    marqueeIds,
    persistLatest,
    restorePhase,
    selectedId,
    viewport.height,
    viewport.left,
    viewport.scrollHeight,
    viewport.scrollWidth,
    viewport.top,
    viewport.width,
    zoom,
  ]);

  useEffect(() => {
    const persistBeforeHide = () => persistLatest();
    window.addEventListener("pagehide", persistBeforeHide);
    return () => {
      window.removeEventListener("pagehide", persistBeforeHide);
      persistLatest();
    };
  }, [persistLatest]);
}
