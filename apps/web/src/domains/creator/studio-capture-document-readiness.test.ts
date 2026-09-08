import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "./export/studio-export";
import { createStudioRasterExportOrchestration } from "./render/studio-raster-export-orchestration-runtime";
import { waitForStudioCaptureReady } from "./studio-capture-readiness";
import { DEFAULT_PAGE_GRADE } from "./studio-page-grade";

import type { ExportFormat } from "./export/studio-export";
import type { PageState } from "./studio-page-state";
import type Konva from "konva";

vi.mock("./export/studio-export", async (importOriginal) => ({
  ...await importOriginal<typeof import("./export/studio-export")>(),
  canvasToBlob: async (canvas: HTMLCanvasElement & { elementIds: string[] }, mime: string) =>
    new Blob([JSON.stringify(canvas.elementIds)], { type: mime }),
  downloadBlob: vi.fn(),
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

function editor() {
  const originalPage = { id: "page-1", elements: [] as { id: string; src?: string }[] };
  const acceptedStroke = { id: "accepted-stroke", src: "blob:accepted-ink" };
  const document = {
    drawingRef: { current: null as object | null },
    drawingPointerTransportRef: { current: { getSession: () => null as object | null } },
    pendingStrokeCommitsRef: { current: { strokes: [acceptedStroke] } as object | null },
    flushPendingStrokes: vi.fn((): void => {
      const page = { ...originalPage, elements: [acceptedStroke] };
      document.pagesHistoryRef.current = [[originalPage], [page]];
      document.pagesHiRef.current = 1;
      document.pendingStrokeCommitsRef.current = null;
    }),
    pagesHistoryRef: { current: [[originalPage]] },
    pagesHiRef: { current: 0 },
    captureCommitRef: { current: { pageId: originalPage.id, historyIndex: 0, page: originalPage } },
    master: { elements: [{ id: "master-image", src: "blob:master" }] },
  };
  const targetStage = {
    batchDraw: vi.fn(),
    // A retained live overlay is not part of this document Stage. Only its committed render is.
    toCanvas: vi.fn(() => ({ elementIds: document.captureCommitRef.current.page.elements.map(({ id }) => id) })),
  };
  const preloadImage = vi.fn(async (_src: string) => undefined);
  const options = {
    pageId: originalPage.id,
    getRenderedPageId: () => document.captureCommitRef.current.pageId,
    getStage: () => targetStage,
    // The caller captured this empty page before the export's first await.
    assetSources: originalPage.elements.flatMap((element) => element.src ? [element.src] : []),
    document,
    nextFrame: vi.fn(async () => {
      const page = document.pagesHistoryRef.current[document.pagesHiRef.current]![0]!;
      document.captureCommitRef.current = {
        pageId: page.id, historyIndex: document.pagesHiRef.current, page,
      };
    }),
    waitForFonts: async (): Promise<void> => undefined,
    preloadImage,
    waitForRasterPresentations: vi.fn(async (_identities: unknown, draw: () => void) => { draw(); }),
  };
  return { originalPage, acceptedStroke, document, targetStage, options, preloadImage };
}

describe("document capture includes accepted deferred ink", () => {
  it("flushes before taking the page snapshot and exports the accepted stroke without its idle timer", async () => {
    const state = editor();
    const onReady = vi.fn();
    const readyStage = await waitForStudioCaptureReady({ ...state.options, document: { ...state.document, onReady } });

    expect(readyStage.toCanvas().elementIds).toEqual([state.acceptedStroke.id]);
    expect(state.document.flushPendingStrokes).toHaveBeenCalledOnce();
    expect(state.document.pendingStrokeCommitsRef.current).toBeNull();
    expect(state.preloadImage.mock.calls.map(([source]) => source)).toEqual([
      "blob:accepted-ink", "blob:master",
    ]);
    expect(state.originalPage.elements).toEqual([]);
    expect(onReady).toHaveBeenCalledExactlyOnceWith(state.document.pagesHistoryRef.current[1]![0]);
  });

  it.each(["drawing", "transport"] as const)("does not flush or capture while %s owns the active gesture", async (owner) => {
    const state = editor();
    if (owner === "drawing") state.document.drawingRef.current = {};
    else state.document.drawingPointerTransportRef.current.getSession = () => ({});

    await expect(waitForStudioCaptureReady(state.options)).rejects.toMatchObject({ code: "pending-ink" });
    expect(state.document.flushPendingStrokes).not.toHaveBeenCalled();
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
    expect(state.targetStage.toCanvas).not.toHaveBeenCalled();
    expect(state.preloadImage).not.toHaveBeenCalled();
  });

  it("preserves an unreceipted or rejected batch and produces no raster", async () => {
    const state = editor();
    const pending = state.document.pendingStrokeCommitsRef.current;
    // The existing provider/publication gate owns the receipt and may retain the batch.
    state.document.flushPendingStrokes.mockImplementation(() => undefined);

    await expect(waitForStudioCaptureReady(state.options)).rejects.toMatchObject({ code: "pending-ink" });
    expect(state.document.pendingStrokeCommitsRef.current).toBe(pending);
    expect(state.document.pagesHistoryRef.current).toEqual([[state.originalPage]]);
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
    expect(state.preloadImage).not.toHaveBeenCalled();
  });

  it("waits for the exact projected elements even when a coalesced edit keeps the same history index", async () => {
    const state = editor();
    let frames = 0;
    state.document.flushPendingStrokes.mockImplementation(() => {
      state.document.pagesHistoryRef.current = [[{ ...state.originalPage, elements: [state.acceptedStroke] }]];
      state.document.pendingStrokeCommitsRef.current = null;
    });
    const render = state.options.nextFrame.getMockImplementation()!;
    state.options.nextFrame.mockImplementation(async () => {
      frames += 1;
      if (frames >= 4) await render();
    });
    state.preloadImage.mockImplementation(async () => {
      expect(state.document.captureCommitRef.current.page.elements).toEqual([state.acceptedStroke]);
    });

    const readyStage = await waitForStudioCaptureReady(state.options);
    expect(readyStage.toCanvas().elementIds).toEqual([state.acceptedStroke.id]);
    expect(frames).toBeGreaterThanOrEqual(7);
  });

  it("fails before assets or capture if the requested page was removed from canonical history", async () => {
    const state = editor();
    state.document.pendingStrokeCommitsRef.current = null;
    state.document.pagesHistoryRef.current = [[]];

    await expect(waitForStudioCaptureReady(state.options)).rejects.toMatchObject({ code: "stale-page" });
    expect(state.preloadImage).not.toHaveBeenCalled();
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
  });

  it("waits for a metadata-only page commit with the same elements and history index", async () => {
    const state = editor();
    state.document.pendingStrokeCommitsRef.current = null;
    const page = { ...state.originalPage, bg: "#123456", canvasH: 1440 };
    state.document.pagesHistoryRef.current = [[page]];
    let frames = 0;
    const onReady = vi.fn();
    const render = state.options.nextFrame.getMockImplementation()!;
    state.options.nextFrame.mockImplementation(async () => {
      frames += 1;
      if (frames >= 4) await render();
    });
    state.preloadImage.mockImplementation(async () => {
      expect(state.document.captureCommitRef.current.page).toBe(page);
    });

    await waitForStudioCaptureReady({ ...state.options, document: { ...state.document, onReady } });

    expect(frames).toBeGreaterThanOrEqual(7);
    expect(onReady).toHaveBeenCalledExactlyOnceWith(page);
  });

  it("does not capture a newer document that replaces the snapshot while assets load", async () => {
    const state = editor();
    state.preloadImage.mockImplementation(async () => {
      state.document.pagesHistoryRef.current = [[{ ...state.originalPage, elements: [] }]];
      state.document.pagesHiRef.current = 0;
    });

    await expect(waitForStudioCaptureReady(state.options)).rejects.toMatchObject({ code: "stale-page" });
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
    expect(state.targetStage.toCanvas).not.toHaveBeenCalled();
  });

  it("rejects a new active gesture that starts while the capture is preparing", async () => {
    const state = editor();
    state.preloadImage.mockImplementation(async () => { state.document.drawingRef.current = {}; });

    await expect(waitForStudioCaptureReady(state.options)).rejects.toMatchObject({ code: "pending-ink" });
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
  });

  it("does not mutate pending ink when cancellation precedes the preparation", async () => {
    const state = editor();
    const controller = new AbortController();
    controller.abort();

    await expect(waitForStudioCaptureReady({ ...state.options, signal: controller.signal }))
      .rejects.toMatchObject({ code: "aborted" });
    expect(state.document.flushPendingStrokes).not.toHaveBeenCalled();
    expect(state.document.pendingStrokeCommitsRef.current).not.toBeNull();
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
  });

  it("preserves the committed stroke and produces no artifact when cancelled after the flush", async () => {
    const state = editor();
    const controller = new AbortController();
    state.options.waitForFonts = async () => { controller.abort(); };

    await expect(waitForStudioCaptureReady({ ...state.options, signal: controller.signal }))
      .rejects.toMatchObject({ code: "aborted" });
    expect(state.document.pagesHistoryRef.current[1]![0]!.elements).toEqual([state.acceptedStroke]);
    expect(state.targetStage.batchDraw).not.toHaveBeenCalled();
    expect(state.targetStage.toCanvas).not.toHaveBeenCalled();
  });

  it("takes a fresh canonical snapshot for each page in a multi-page export", async () => {
    const state = editor();
    const secondPage = { id: "page-2", elements: [{ id: "second", src: "blob:second" }] };
    state.document.flushPendingStrokes.mockImplementation(() => {
      state.document.pagesHistoryRef.current = [[
        { ...state.originalPage, elements: [state.acceptedStroke] }, secondPage,
      ]];
      state.document.pendingStrokeCommitsRef.current = null;
    });
    const captured = [];
    for (const pageId of [state.originalPage.id, secondPage.id]) {
      state.options.nextFrame.mockImplementation(async () => {
        const page = state.document.pagesHistoryRef.current[0]!.find((page) => page.id === pageId)!;
        state.document.captureCommitRef.current = { pageId, historyIndex: 0, page };
      });
      const readyStage = await waitForStudioCaptureReady({ ...state.options, pageId });
      captured.push(readyStage.toCanvas().elementIds);
    }
    expect(captured).toEqual([[state.acceptedStroke.id], ["second"]]);
    expect(state.document.flushPendingStrokes).toHaveBeenCalledOnce();
  });
});

function rasterExport(state: ReturnType<typeof editor>, format: ExportFormat = "png", signal?: AbortSignal) {
  const page = { ...state.originalPage, canvasH: 1080, bg: "#ffffff", bgGrad: null } as PageState;
  const stage = Object.assign(state.targetStage, {
    width: () => 720, height: () => 1080, x: () => 0, y: () => 0,
    scaleX: () => 1, scaleY: () => 1, rotation: () => 0,
    size: () => undefined, position: () => undefined, scale: () => undefined,
    draw: () => undefined, findOne: () => null,
  });
  state.targetStage.toCanvas.mockImplementation(() => {
    const elementIds = state.document.captureCommitRef.current.page.elements.map(({ id }) => id);
    return {
      elementIds, width: 720, height: 1080,
      // Canvas/encoder is a CPU port; the actual orchestration and readiness are used.
      toBlob: (callback: BlobCallback, mime: string) => callback(new Blob([JSON.stringify(elementIds)], { type: mime })),
    };
  });
  const setError = vi.fn();
  const setIsExporting = vi.fn();
  const orchestration = createStudioRasterExportOrchestration({
    activePage: page, pages: [page], currentPageId: page.id, masterEditMode: false,
    exportTransparent: false, exportFormat: format, exportScale: 1, effectiveScale: 1,
    pageGrade: { ...DEFAULT_PAGE_GRADE, brightness: 1.25 }, title: "accepted ink",
    ensureSharedDocumentAvailableForExport: () => true,
    ensureWatermarkLoaded: async () => ({ enabled: false, text: "", opacity: 0, position: "br", size: 1 }),
    drawWatermarkOnCanvas: () => undefined,
    captureReadyStageForPage: async (_page, onReady) => {
      const ready = await waitForStudioCaptureReady({
        ...state.options, signal,
        document: { ...state.document, onReady: (snapshot) => onReady?.(snapshot as unknown as PageState) },
      });
      return ready as unknown as Konva.Stage;
    },
    preserveStudioViewBeforeCapture: () => undefined,
    setExportMenuOpen: () => undefined, setSelectedId: () => undefined,
    setMasterEditMode: () => undefined, setCurrentPageId: () => undefined,
    setError, setIsExporting,
  });
  return { orchestration, setError, setIsExporting, stage };
}

describe("raster export readiness product orchestration", () => {
  it.each(["png", "jpg", "webp"] as const)("%s downloads the accepted canonical stroke through the shared capture gate", async (format) => {
    const state = editor();
    const output = rasterExport(state, format);

    await output.orchestration.handleDownload();

    // The stale caller grade is nondefault. Canonical undefined means it was removed; no
    // grade surface/DOM allocation is available here, so reapplying the stale grade fails.
    expect(output.setError).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledOnce();
    const blob = vi.mocked(downloadBlob).mock.calls[0]![0];
    expect(JSON.parse(await blob.text())).toEqual([state.acceptedStroke.id]);
    expect(blob.type).toBe(`image/${format === "jpg" ? "jpeg" : format}`);
    expect(output.setIsExporting).toHaveBeenLastCalledWith(false);
  });

  it.each(["pending-receipt", "cancelled"] as const)("%s restores export mode and never reaches the file sink", async (reason) => {
    const state = editor();
    const controller = new AbortController();
    if (reason === "pending-receipt") state.document.flushPendingStrokes.mockImplementation(() => undefined);
    else state.options.waitForFonts = async () => { controller.abort(); };
    const output = rasterExport(state, "png", controller.signal);

    await output.orchestration.handleDownload();

    expect(output.setError).toHaveBeenCalledOnce();
    expect(output.setIsExporting).toHaveBeenLastCalledWith(false);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(state.targetStage.toCanvas).not.toHaveBeenCalled();
  });
});
