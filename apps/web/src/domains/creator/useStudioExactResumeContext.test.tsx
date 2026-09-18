// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallback, useRef, useState } from "react";

import {
  readStudioExactResumeContext,
  writeStudioExactResumeContext,
} from "./studio-exact-resume-context";
import { useStudioExactResumeContext } from "./useStudioExactResumeContext";

import type { DrawMode, Tool } from "./studio-editor-tool-model";

const PAGES = [
  { id: "page-1", elements: [{ id: "panel-1" }] },
  { id: "page-2", elements: [{ id: "bubble-2" }, { id: "caption-2" }] },
] as const;

function Harness({
  resumeRequested,
  onRestored,
}: {
  readonly resumeRequested: boolean;
  readonly onRestored?: (pageId: string | null) => void;
}) {
  const [currentPageId, setCurrentPageIdState] = useState("page-1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [drawMode, setDrawMode] = useState<DrawMode>("eraser");
  const viewportRef = useRef<HTMLDivElement>(null);
  const setCurrentPageId = useCallback((pageId: string) => {
    setCurrentPageIdState(pageId);
    return true;
  }, []);
  const updateViewport = useCallback(() => undefined, []);

  useStudioExactResumeContext({
    projectId: "project-1",
    documentId: "document-1",
    workspace: "comic",
    focus: "cut:2",
    language: "ko-KR",
    sourceVersion: "v4",
    resumeRequested,
    hydrated: true,
    pages: PAGES,
    currentPageId,
    setCurrentPageId,
    selectedId,
    marqueeIds,
    setSelectedId,
    setMarqueeIds,
    zoom,
    setZoom,
    scrollLeft: 0,
    scrollTop: 0,
    viewportRef,
    updateViewport,
    tool,
    setTool,
    drawMode,
    setDrawMode,
    onRestored: (context) => onRestored?.(context.pageId),
  });

  return (
    <div>
      <div
        ref={(node) => {
          viewportRef.current = node;
          if (!node) return;
          Object.defineProperties(node, {
            clientWidth: { configurable: true, value: 200 },
            clientHeight: { configurable: true, value: 300 },
            scrollWidth: { configurable: true, value: 1_200 },
            scrollHeight: { configurable: true, value: 2_400 },
          });
        }}
        data-testid="viewport"
      />
      <output data-testid="state">
        {JSON.stringify({ currentPageId, selectedId, marqueeIds, zoom, tool, drawMode })}
      </output>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useStudioExactResumeContext", () => {
  it("restores the page, selection, tool, zoom and viewport from the trusted latest context", async () => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "page-2",
      selectedElementIds: ["bubble-2", "caption-2", "missing-element"],
      zoom: 2,
      scrollLeft: 480,
      scrollTop: 1_100,
      tool: "draw",
      drawMode: "pen",
      focus: "cut:2",
      language: "ko-KR",
      sourceVersion: "v4",
      updatedAt: "2026-09-17T10:00:00.000Z",
    });

    render(<Harness resumeRequested />);

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain('"currentPageId":"page-2"');
      expect(screen.getByTestId("state").textContent).toContain('"marqueeIds":["bubble-2","caption-2"]');
      expect(screen.getByTestId("state").textContent).toContain('"zoom":2');
      expect(screen.getByTestId("state").textContent).toContain('"tool":"draw"');
      expect(screen.getByTestId("state").textContent).toContain('"drawMode":"pen"');
    });
    await waitFor(() => {
      const viewport = screen.getByTestId("viewport");
      expect(viewport.scrollLeft).toBe(480);
      expect(viewport.scrollTop).toBe(1_100);
    });
  });

  it("ignores a stale page target and replaces it with the current valid context", async () => {
    const onRestored = vi.fn();
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "deleted-page",
      selectedElementIds: ["missing-element"],
      zoom: 3,
      scrollLeft: 800,
      scrollTop: 1_500,
      tool: "draw",
      drawMode: "pen",
      updatedAt: "2026-09-17T10:00:00.000Z",
    });

    render(<Harness resumeRequested onRestored={onRestored} />);

    await waitFor(() => {
      expect(readStudioExactResumeContext(window.localStorage, "project-1", "document-1")).toMatchObject({
        pageId: "page-1",
        selectedElementIds: [],
        zoom: 1,
        tool: "select",
        drawMode: "eraser",
      });
    }, { timeout: 2_000 });
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByTestId("state").textContent).toContain('"currentPageId":"page-1"');
  });

  it("persists the current context without blocking editing when no restore was requested", async () => {
    render(<Harness resumeRequested={false} />);

    await waitFor(() => {
      const context = readStudioExactResumeContext(window.localStorage, "project-1", "document-1");
      expect(context).toMatchObject({
        pageId: "page-1",
        workspace: "comic",
        zoom: 1,
        tool: "select",
        drawMode: "eraser",
        focus: "cut:2",
        language: "ko-KR",
        sourceVersion: "v4",
      });
    }, { timeout: 2_000 });
  });
});
