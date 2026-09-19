import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { markStudioProjectOpened } from "./studio-project-library-store";
import {
  STUDIO_EXACT_RESUME_RESTORED_EVENT,
  readStudioExactResumeContext,
  writeStudioExactResumeContext,
  type StudioExactResumeContextV1,
} from "./studio-exact-resume-context";

import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import type { DrawMode, Tool } from "./studio-editor-tool-model";

interface ResumePageLike {
  readonly id: string;
  readonly elements: readonly { readonly id: string }[];
}

export interface UseStudioExactResumeContextInput {
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly workspace: StudioDocumentWorkspaceId | null;
  readonly focus: string | null;
  readonly language: string | null;
  readonly sourceVersion: string | null;
  readonly resumeRequested: boolean;
  readonly hydrated: boolean;
  readonly pages: readonly ResumePageLike[];
  readonly currentPageId: string;
  readonly setCurrentPageId: (pageId: string) => boolean;
  readonly selectedId: string | null;
  readonly marqueeIds: readonly string[];
  readonly setSelectedId: (id: string | null) => void;
  readonly setMarqueeIds: (ids: string[]) => void;
  readonly zoom: number;
  readonly setZoom: (zoom: number) => void;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly viewportRef: RefObject<HTMLElement | null>;
  readonly updateViewport: () => void;
  readonly tool: Tool;
  readonly setTool: (tool: Tool) => void;
  readonly drawMode: DrawMode;
  readonly setDrawMode: (mode: DrawMode) => void;
  readonly onRestored?: (context: StudioExactResumeContextV1) => void;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function selectedIds(selectedId: string | null, marqueeIds: readonly string[]): readonly string[] {
  if (marqueeIds.length > 0) return marqueeIds;
  return selectedId ? [selectedId] : [];
}

function applyViewportResume(viewport: HTMLElement, scrollLeft: number, scrollTop: number): void {
  viewport.scrollLeft = Math.min(scrollLeft, Math.max(0, viewport.scrollWidth - viewport.clientWidth));
  viewport.scrollTop = Math.min(scrollTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
}

export function useStudioExactResumeContext(input: UseStudioExactResumeContextInput): void {
  const {
    projectId, documentId, workspace, focus, language, sourceVersion, resumeRequested, hydrated,
    pages, currentPageId, setCurrentPageId, selectedId, marqueeIds, setSelectedId, setMarqueeIds,
    zoom, setZoom, scrollLeft, scrollTop, viewportRef, updateViewport, tool, setTool, drawMode, setDrawMode,
    onRestored,
  } = input;
  const restoreIdentity = `${projectId ?? ""}\u0000${documentId ?? ""}`;
  const restoredRef = useRef(false);
  const restoreFrameRef = useRef<number | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    restoredRef.current = false;
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current);
    restoreFrameRef.current = null;
  }, [restoreIdentity, resumeRequested]);

  useLayoutEffect(() => {
    if (
      restoredRef.current
      || !resumeRequested
      || !hydrated
      || !projectId
      || !documentId
      || !workspace
    ) return;
    const storage = browserStorage();
    const context = storage
      ? readStudioExactResumeContext(storage, projectId, documentId)
      : null;
    if (!context) {
      restoredRef.current = true;
      return;
    }
    const targetPage = context.pageId
      ? pages.find((page) => page.id === context.pageId)
      : null;
    if (context.pageId && !targetPage) {
      restoredRef.current = true;
      return;
    }
    if (targetPage && currentPageId !== targetPage.id) {
      setCurrentPageId(targetPage.id);
      return;
    }
    const activePage = pages.find((page) => page.id === currentPageId) ?? pages[0];
    const availableIds = new Set(activePage?.elements.map((element) => element.id) ?? []);
    const restoredSelection = context.selectedElementIds.filter((id) => availableIds.has(id));
    if (restoredSelection.length > 1) {
      setSelectedId(null);
      setMarqueeIds([...restoredSelection]);
    } else {
      setMarqueeIds([]);
      setSelectedId(restoredSelection[0] ?? null);
    }
    setTool(context.tool);
    setDrawMode(context.drawMode);
    setZoom(context.zoom);
    restoredRef.current = true;
    restoreFrameRef.current = requestAnimationFrame(() => {
      restoreFrameRef.current = requestAnimationFrame(() => {
        restoreFrameRef.current = null;
        const viewport = viewportRef.current;
        if (!viewport) return;
        applyViewportResume(viewport, context.scrollLeft, context.scrollTop);
        updateViewport();
        const restoredContext = Object.freeze({
          ...context,
          pageId: activePage?.id ?? null,
          selectedElementIds: Object.freeze([...restoredSelection]),
        });
        onRestored?.(restoredContext);
        window.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_RESTORED_EVENT, {
          detail: restoredContext,
        }));
      });
    });
  }, [
    currentPageId,
    documentId,
    drawMode,
    hydrated,
    onRestored,
    pages,
    projectId,
    resumeRequested,
    setCurrentPageId,
    setDrawMode,
    setMarqueeIds,
    setSelectedId,
    setTool,
    setZoom,
    tool,
    updateViewport,
    viewportRef,
    workspace,
  ]);

  useEffect(() => {
    if (!hydrated || !projectId || !documentId) return;
    const storage = browserStorage();
    if (!storage) return;
    try {
      markStudioProjectOpened(storage, projectId, documentId, { target: window });
    } catch {
      // Server-owned or imported documents may not exist in the local project index.
    }
  }, [documentId, hydrated, projectId]);

  useEffect(() => {
    if (
      !hydrated
      || !projectId
      || !documentId
      || !workspace
      || (resumeRequested && !restoredRef.current)
    ) return;
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const storage = browserStorage();
      if (!storage) return;
      const viewport = viewportRef.current;
      try {
        writeStudioExactResumeContext(storage, {
          projectId: projectId!,
          documentId: documentId!,
          workspace: workspace!,
          pageId: currentPageId || null,
          selectedElementIds: selectedIds(selectedId, marqueeIds),
          zoom: zoom,
          scrollLeft: viewport?.scrollLeft ?? scrollLeft,
          scrollTop: viewport?.scrollTop ?? scrollTop,
          tool: tool,
          drawMode: drawMode,
          focus: focus,
          language: language,
          sourceVersion: sourceVersion,
        }, window);
      } catch {
        // Resume state is convenience metadata and must never interrupt editing or autosave.
      }
    }, 450);
    return () => {
      if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    };
  }, [
    currentPageId,
    documentId,
    drawMode,
    focus,
    hydrated,
    language,
    marqueeIds,
    projectId,
    resumeRequested,
    scrollLeft,
    scrollTop,
    selectedId,
    sourceVersion,
    tool,
    viewportRef,
    workspace,
    zoom,
  ]);

  useEffect(() => () => {
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current);
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
  }, []);
}
