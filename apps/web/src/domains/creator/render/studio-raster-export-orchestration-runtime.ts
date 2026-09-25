import { readStudioStageInDocumentView } from "../canvas/studio-stage-document-view";
import { CANVAS_W } from "../studio-assets";
import { confirmStudioDestructiveAction } from "../studio-destructive-action-preview";
import {
  studioExportSplitChoiceRequest,
  studioExportSplitRequiredRequest,
} from "../studio-destructive-command-catalog";
import {
  drawVignette,
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  type PageGrade,
} from "../studio-page-grade";

import type { ExportFormat } from "../export/studio-export";
import type { PresetExportResult, PresetSliceExportOptions, PresetExportPage } from "../export/studio-export-presets";
import type { StudioPresetRasterRegion, StudioPresetTiledRasterSource } from "../export/studio-preset-tiled-raster";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type {
  StudioRasterEncoded,
  StudioRasterInterchangeFormat,
} from "./studio-raster-interchange";
import type { WatermarkSettings } from "../studio-watermark";
import type Konva from "konva";

/** 선택된 페이지 그레이드 합성 표면을 만들 수 없어 원본으로 대체하지 않았음을 나타낸다. */
export class StudioPageGradeBakeUnavailableError extends Error {
  constructor() {
    super("페이지 색보정 합성 표면을 만들지 못해 내보내기를 중단했어요.");
    this.name = "StudioPageGradeBakeUnavailableError";
  }
}

export function bakeStudioPageGradeIntoCanvas(
  source: HTMLCanvasElement,
  grade: PageGrade,
  region?: StudioPresetRasterRegion & { pageWidth: number; pageHeight: number },
): HTMLCanvasElement {
  if (isDefaultPageGrade(grade)) return source;
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d");
  if (!context) throw new StudioPageGradeBakeUnavailableError();
  const cssFilter = pageGradeToCssFilter(grade);
  if (cssFilter) context.filter = cssFilter;
  context.drawImage(source, 0, 0);
  context.filter = "none";
  if (region) context.translate(-region.x, -region.y);
  drawVignette(context, region?.pageWidth ?? output.width, region?.pageHeight ?? output.height, grade.vignette);
  return output;
}

/** Capture at the requested output scale so the current viewport zoom cannot drop a pixel. */
export function captureStudioRasterAtExportScale(
  stage: Konva.Stage,
  effectiveScale: number,
  exportScale: number,
): HTMLCanvasElement {
  return readStudioStageInDocumentView(stage, {
    // captureReadyStageForPage has already restored the full document. Authored page dimensions
    // are integers; undo only the display scale here, including its floating-point roundoff.
    documentWidth: Math.round(stage.width() / effectiveScale),
    documentHeight: Math.round(stage.height() / effectiveScale),
    effectiveScale: exportScale,
  }, () => stage.toCanvas({ pixelRatio: 1 }));
}

export interface StudioRasterExportOrchestrationInput {
  readonly activePage: PageState;
  readonly pages: readonly PageState[];
  readonly masterElements?: readonly El[];
  readonly captureSkiaDocumentForExport?: typeof import(
    "./studio-skia-document-export"
  )["captureStudioSkiaDocumentForExport"];
  readonly currentPageId: string;
  readonly masterEditMode: boolean;
  readonly exportTransparent: boolean;
  readonly exportFormat: ExportFormat;
  readonly exportScale: number;
  readonly effectiveScale: number;
  readonly pageGrade: PageGrade;
  readonly title: string;
  readonly exportRevision?: number | null;
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly ensureWatermarkLoaded: () => Promise<WatermarkSettings>;
  readonly drawWatermarkOnCanvas: (
    canvas: HTMLCanvasElement,
    settings: WatermarkSettings,
  ) => void;
  readonly captureReadyStageForPage: (page: PageState, onReady?: (page: PageState) => void) => Promise<Konva.Stage>;
  readonly preserveStudioViewBeforeCapture: () => void;
  readonly setExportMenuOpen: (open: boolean) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setMasterEditMode: (active: boolean) => void;
  readonly setIsExporting: (exporting: boolean) => void;
  readonly setError: (message: string | null) => void;
  readonly setCurrentPageId: (pageId: string) => void;
}

export interface StudioRasterExportOrchestration {
  readonly handleExportPresetSlices: (
    indices: readonly number[] | null,
    options: Omit<PresetSliceExportOptions, "pages">,
  ) => Promise<PresetExportResult>;
  readonly handleDownload: () => Promise<void>;
  readonly exportCurrentPageToRasterInterchange: (
    format: StudioRasterInterchangeFormat
  ) => Promise<StudioRasterEncoded>;
  readonly handleCopyToClipboard: () => Promise<void>;
  readonly handleDownloadAll: (spacing?: number) => Promise<void>;
  readonly handleCapturePagesForPreset: (
    scope: "current" | "all"
  ) => Promise<HTMLCanvasElement[]>;
  readonly handleCapturePagesForIndices: (
    indices: number[]
  ) => Promise<HTMLCanvasElement[]>;
}

/**
 * Rare raster-export work lives in an intent-loaded runtime factory outside the editor's
 * interaction coordinator. StudioPage therefore keeps the capture/download implementation out of
 * its compilation unit and initial rendering graph.
 */
export function createStudioRasterExportOrchestration({
  activePage,
  pages,
  masterElements = [],
  captureSkiaDocumentForExport,
  currentPageId,
  masterEditMode,
  exportTransparent,
  exportFormat,
  exportScale,
  effectiveScale,
  title,
  exportRevision,
  ensureSharedDocumentAvailableForExport,
  ensureWatermarkLoaded,
  drawWatermarkOnCanvas,
  captureReadyStageForPage,
  preserveStudioViewBeforeCapture,
  setExportMenuOpen,
  setSelectedId,
  setMasterEditMode,
  setIsExporting,
  setError,
  setCurrentPageId,
}: StudioRasterExportOrchestrationInput): StudioRasterExportOrchestration {
  async function capturePage(page: PageState) {
    let capturedPage = page;
    const stage = await captureReadyStageForPage(page, (readyPage) => { capturedPage = readyPage; });
    return { stage, page: capturedPage };
  }

  async function captureRawPageAtScale(
    page: PageState,
    scale: number,
    transparent: boolean,
  ): Promise<{ canvas: HTMLCanvasElement; page: PageState }> {
    const captured = await capturePage(page);
    try {
      const capture = captureSkiaDocumentForExport
        ?? (await import("./studio-skia-document-export")).captureStudioSkiaDocumentForExport;
      const skia = await capture({
        page: captured.page,
        masterElements,
        exportScale: scale,
        transparent,
      });
      if (skia.status === "captured") {
        return { canvas: skia.canvas, page: captured.page };
      }
    } catch {
      // The existing document renderer remains the exact compatibility authority.
    }

    const backgroundNode = transparent ? captured.stage.findOne(".bg") : null;
    if (backgroundNode) {
      backgroundNode.hide();
      captured.stage.batchDraw();
    }
    try {
      const canvas = captureStudioRasterAtExportScale(
        captured.stage,
        effectiveScale,
        scale,
      );
      if (canvas.dataset) {
        canvas.dataset.studioRasterExportBackend = "konva-compatibility";
      }
      return { canvas, page: captured.page };
    } finally {
      if (backgroundNode) {
        backgroundNode.show();
        captured.stage.batchDraw();
      }
    }
  }

  async function captureBakedPageAtScale(
    page: PageState,
    scale: number,
    transparent = false,
  ): Promise<{ canvas: HTMLCanvasElement; page: PageState }> {
    const captured = await captureRawPageAtScale(page, scale, transparent);
    return {
      canvas: bakeStudioPageGradeIntoCanvas(
        captured.canvas,
        normalizePageGrade(captured.page.grade),
      ),
      page: captured.page,
    };
  }

  async function handleDownload() {
    if (!ensureSharedDocumentAvailableForExport()) return;
    const watermarkForExport = await ensureWatermarkLoaded();
    setExportMenuOpen(false);
    setSelectedId(null);
    const originalMasterEditMode = masterEditMode;
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    try {
      const exportedAt = new Date();
      const transparent = exportTransparent && exportFormat !== "jpg";
      const { canvas } = await captureBakedPageAtScale(
        activePage,
        exportScale,
        transparent,
      );
      drawWatermarkOnCanvas(canvas, watermarkForExport);
      const {
        canvasToBlob,
        downloadBlob,
        exportMimeType,
        exportQuality,
        pageExportFileName,
      } = await import("../export/studio-export");
      const blob = await canvasToBlob(
        canvas,
        exportMimeType(exportFormat),
        exportQuality(exportFormat)
      );
      downloadBlob(blob, pageExportFileName(
        title,
        exportFormat,
        transparent,
        { revision: exportRevision, exportedAt },
      ));
    } catch (error) {
      setError(error instanceof Error ? error.message : "이미지 내보내기에 실패했어요.");
    } finally {
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
    }
  }

  async function exportCurrentPageToRasterInterchange(
    format: StudioRasterInterchangeFormat
  ): Promise<StudioRasterEncoded> {
    if (!ensureSharedDocumentAvailableForExport()) {
      throw new Error("공유 문서를 불러온 뒤 내보낼 수 있습니다.");
    }
    const watermarkForExport = await ensureWatermarkLoaded();
    const originalMasterEditMode = masterEditMode;
    setSelectedId(null);
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    try {
      await new Promise<void>((resolve) => {
        if (typeof globalThis.requestAnimationFrame === "function") {
          globalThis.requestAnimationFrame(() => resolve());
        } else {
          globalThis.setTimeout(resolve, 0);
        }
      });
      const alphaCapable = format === "qoi" || format === "tga" || format === "pam";
      const transparent = exportTransparent && alphaCapable;
      const { canvas } = await captureBakedPageAtScale(
        activePage,
        exportScale,
        transparent,
      );
      drawWatermarkOnCanvas(canvas, watermarkForExport);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("출력 픽셀을 읽을 수 없습니다.");
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const { encodeStudioRasterInterchangeAsync } = await import( "./studio-raster-interchange-worker-client"
      );
      const encoded = await encodeStudioRasterInterchangeAsync(format, {
        width: image.width,
        height: image.height,
        data: image.data,
      }, { executionMode: "worker" });
      return encoded.encoded;
    } finally {
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
    }
  }

  async function handleCopyToClipboard() {
    if (!ensureSharedDocumentAvailableForExport()) return;
    const watermarkForExport = await ensureWatermarkLoaded();
    setExportMenuOpen(false);
    setSelectedId(null);
    const originalMasterEditMode = masterEditMode;
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    try {
      const { canvas } = await captureBakedPageAtScale(activePage, exportScale);
      drawWatermarkOnCanvas(canvas, watermarkForExport);
      const { copyCanvasToClipboard } = await import("../export/studio-export");
      await copyCanvasToClipboard(canvas);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "클립보드 복사에 실패했어요.");
    } finally {
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
    }
  }

  async function handleDownloadAll(spacing = 24) {
    if (!ensureSharedDocumentAvailableForExport()) return;
    const watermarkForExport = await ensureWatermarkLoaded();
    const exportedAt = new Date();
    const versionContext = { revision: exportRevision, exportedAt };
    setExportMenuOpen(false);
    const {
      MAX_CANVAS_DIM,
      canvasToBlob,
      downloadBlob,
      exportMimeType,
      exportQuality,
      maxFittingScale,
      splitPagesForExport,
      stripExportFileName,
      stripTotalHeight,
    } = await import("../export/studio-export");
    const pageHeights = pages.map((page) => page.canvasH);
    let scale = exportScale;
    let split = false;
    if (stripTotalHeight(pageHeights, spacing, scale) > MAX_CANVAS_DIM) {
      const fittingScale = maxFittingScale(pageHeights, spacing, scale);
      const plannedParts = splitPagesForExport(pageHeights, spacing, scale).length;
      if (fittingScale !== null) {
        // 취소가 "저장 안 함"이 아니라 "배율을 낮춰 한 파일로 저장"이다. 두 결과를 버튼
        // 라벨로 드러내야 사용자가 무엇을 고르는지 안다(네이티브 confirm 은 못 하던 일).
        split = await confirmStudioDestructiveAction(
          studioExportSplitChoiceRequest({
            scale,
            maxCanvasDimLabel: MAX_CANVAS_DIM.toLocaleString(),
            partCount: plannedParts,
            fittingScale,
          })
        );
        if (!split) scale = fittingScale;
      } else {
        if (
          !(await confirmStudioDestructiveAction(
            studioExportSplitRequiredRequest({ scale, partCount: plannedParts })
          ))
        ) {
          return;
        }
        split = true;
      }
    }

    setSelectedId(null);
    const originalPageId = currentPageId;
    const originalMasterEditMode = masterEditMode;
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    const pageCanvases: HTMLCanvasElement[] = [];
    let phase: "capture" | "encode" | "bundle" = "capture";

    try {
      try {
        for (const page of pages) {
          setCurrentPageId(page.id);
          const { canvas } = await captureBakedPageAtScale(page, scale);
          pageCanvases.push(canvas);
        }
      } finally {
        setCurrentPageId(originalPageId);
        setMasterEditMode(originalMasterEditMode);
      }

      if (pageCanvases.length === 0) return;
      const chunks = split
        ? splitPagesForExport(
            pageCanvases.map((canvas) => canvas.height),
            spacing * scale,
            1
          )
        : [pageCanvases.map((_, index) => index)];
      const deliveries: Array<{ blob: Blob; fileName: string }> = [];
      phase = "encode";

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex]!;
        const compositeCanvas = document.createElement("canvas");
        const firstPageIndex = chunk[0];
        if (firstPageIndex === undefined) continue;
        const width = pageCanvases[firstPageIndex]!.width;
        let totalHeight = 0;
        for (let index = 0; index < chunk.length; index += 1) {
          totalHeight += pageCanvases[chunk[index]!]!.height;
          if (index < chunk.length - 1) totalHeight += spacing * scale;
        }
        compositeCanvas.width = width;
        compositeCanvas.height = totalHeight;
        const context = compositeCanvas.getContext("2d");
        if (!context) {
          throw new Error("스트립 합성 표면을 만들지 못해 내보내기를 중단했어요.");
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, totalHeight);
        let currentY = 0;
        for (const pageIndex of chunk) {
          const pageCanvas = pageCanvases[pageIndex]!;
          context.drawImage(pageCanvas, 0, currentY);
          currentY += pageCanvas.height + spacing * scale;
        }
        drawWatermarkOnCanvas(compositeCanvas, watermarkForExport);
        try {
          deliveries.push({
            blob: await canvasToBlob(
              compositeCanvas,
              exportMimeType(exportFormat),
              exportQuality(exportFormat)
            ),
            fileName: stripExportFileName(
              title,
              exportFormat,
              {
                index: chunkIndex,
                total: chunks.length,
              },
              versionContext,
            ),
          });
        } finally {
          // Encoded Blob owns the bytes now; release the large temporary raster before ZIP work.
          compositeCanvas.width = 1;
          compositeCanvas.height = 1;
        }
      }

      if (deliveries.length === 0) return;
      if (deliveries.length === 1) {
        const delivery = deliveries[0]!;
        downloadBlob(delivery.blob, delivery.fileName);
      } else {
        phase = "bundle";
        const { buildStudioDownloadBundle } = await import("../export/studio-download-bundle");
        const bundle = await buildStudioDownloadBundle({
          title,
          files: deliveries,
          generatedAt: exportedAt,
          versionContext,
          crc32ExecutionMode: "worker",
        });
        downloadBlob(bundle.blob, bundle.fileName);
      }
      setError(null);
    } catch (error) {
      const fallback = phase === "capture"
        ? "페이지 캡처를 준비하지 못했어요."
        : phase === "bundle"
          ? "분할 이미지를 ZIP 다운로드 묶음으로 만들지 못했어요."
          : "이미지 내보내기에 실패했어요.";
      setError(error instanceof Error ? error.message : fallback);
    } finally {
      setCurrentPageId(originalPageId);
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
      for (const canvas of pageCanvases) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  async function handleCapturePagesForIndices(
    indices: number[]
  ): Promise<HTMLCanvasElement[]> {
    if (!ensureSharedDocumentAvailableForExport()) return [];
    setSelectedId(null);
    const originalPageId = currentPageId;
    const originalMasterEditMode = masterEditMode;
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    const captured: HTMLCanvasElement[] = [];
    try {
      const seen = new Set<number>();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= pages.length) continue;
        if (seen.has(index)) continue;
        seen.add(index);
        const page = pages[index]!;
        setCurrentPageId(page.id);
        const { canvas } = await captureBakedPageAtScale(page, exportScale);
        captured.push(canvas);
      }
    } finally {
      setCurrentPageId(originalPageId);
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
    }
    return captured;
  }

  async function handleExportPresetSlices(
    indices: readonly number[] | null,
    options: Omit<PresetSliceExportOptions, "pages">,
  ): Promise<PresetExportResult> {
    if (!ensureSharedDocumentAvailableForExport()) throw new Error("공동 문서를 불러온 뒤 내보낼 수 있어요.");
    const selected = indices === null
      ? [pages.find((page) => page.id === currentPageId) ?? activePage]
      : [...new Set(indices)].map((index) => {
        const page = Number.isInteger(index) && index >= 0 ? pages[index] : undefined;
        if (!page) throw new Error("내보낼 페이지 범위가 올바르지 않아요.");
        return page;
      });
    if (selected.length === 0) throw new Error("내보낼 페이지가 없어요.");
    setSelectedId(null);
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    const owned: HTMLCanvasElement[] = [];
    try {
      const [{ exportPresetSlices }, { planVipsExportRoute }] = await Promise.all([
        import("../export/studio-export-presets"), import("../export/studio-vips-export"),
      ]);
      let currentCapture: Awaited<ReturnType<typeof capturePage>> | null = null;
      const sources: PresetExportPage[] = [];
      for (const page of selected) {
        const width = Math.round(CANVAS_W * exportScale);
        const height = Math.round(page.canvasH * exportScale);
        if (width <= 16_384 && height <= 16_384
          && planVipsExportRoute(width, height, options.vipsLimits).route !== "out-of-core") {
          setCurrentPageId(page.id);
          const captured = await captureBakedPageAtScale(page, exportScale);
          owned.push(captured.canvas);
          sources.push(captured.canvas);
          continue;
        }
        const source: StudioPresetTiledRasterSource = {
          kind: "studio-preset-tiled-raster", width, height,
          readRegion: async (region) => {
            if (currentCapture?.page.id !== page.id) {
              setCurrentPageId(page.id);
              currentCapture = await capturePage(page);
            }
            const { stage, page: capturedPage } = currentCapture;
            if (Math.round(capturedPage.canvasH * exportScale) !== height) {
              throw new Error("캡처 준비 중 페이지 크기가 바뀌어 내보내기를 중단했어요.");
            }
            const raw = readStudioStageInDocumentView(stage, {
              documentWidth: CANVAS_W, documentHeight: capturedPage.canvasH,
              effectiveScale: exportScale, captureRegion: region,
            }, () => stage.toCanvas({ pixelRatio: 1 }));
            let baked: HTMLCanvasElement | undefined;
            try {
              baked = bakeStudioPageGradeIntoCanvas(raw, normalizePageGrade(capturedPage.grade), {
                ...region, pageWidth: width, pageHeight: height,
              });
              const context = baked.getContext("2d", { willReadFrequently: true });
              if (!context) throw new Error("대형 페이지의 타일 픽셀을 읽지 못했어요.");
              const { data } = context.getImageData(0, 0, region.width, region.height);
              return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            } finally {
              raw.width = 1; raw.height = 1;
              if (baked && baked !== raw) { baked.width = 1; baked.height = 1; }
            }
          },
        };
        sources.push(source);
      }
      return await exportPresetSlices({ ...options, pages: sources });
    } finally {
      for (const canvas of owned) { canvas.width = 1; canvas.height = 1; }
      setCurrentPageId(currentPageId);
      setMasterEditMode(masterEditMode);
      setIsExporting(false);
    }
  }

  async function handleCapturePagesForPreset(
    scope: "current" | "all"
  ): Promise<HTMLCanvasElement[]> {
    if (scope === "all" && pages.length > 1) {
      return handleCapturePagesForIndices(pages.map((_, index) => index));
    }
    if (!ensureSharedDocumentAvailableForExport()) return [];
    setSelectedId(null);
    const originalPageId = currentPageId;
    const originalMasterEditMode = masterEditMode;
    setMasterEditMode(false);
    preserveStudioViewBeforeCapture();
    setIsExporting(true);
    const captured: HTMLCanvasElement[] = [];
    try {
      const page = pages.find((item) => item.id === currentPageId) ?? activePage;
      const { canvas } = await captureBakedPageAtScale(page, exportScale);
      captured.push(canvas);
    } finally {
      setCurrentPageId(originalPageId);
      setMasterEditMode(originalMasterEditMode);
      setIsExporting(false);
    }
    return captured;
  }

  return {
    handleExportPresetSlices,
    handleDownload,
    exportCurrentPageToRasterInterchange,
    handleCopyToClipboard,
    handleDownloadAll,
    handleCapturePagesForPreset,
    handleCapturePagesForIndices,
  };
}
