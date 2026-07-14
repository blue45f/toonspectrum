import { Copy, FileText, Layers, Scissors } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  loadStudioPsdExportModule,
  loadStudioSvgExportModule,
  preloadStudioPsdExportModule,
  preloadStudioSvgExportModule,
} from "./studio-document-export-loaders";
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  canCopyImageToClipboard,
  exportFormatLabel,
  exportQuality,
  type ExportFormat,
} from "./studio-export";
import {
  EXPORT_PRESETS,
  exportPresetSlices,
  planStripSlices,
  presetExportResultMessage,
  recommendScale,
  validateExport,
  type PresetExportScope,
} from "./studio-export-presets";
import {
  CONTACT_SHEET_PAGE_PRESETS,
  contactSheetResultMessage,
  DEFAULT_CONTACT_SHEET_COLUMNS,
  DEFAULT_CONTACT_SHEET_ROWS,
  exportContactSheetPdf,
} from "./studio-pdf-contact-sheet";
import { exportPagesToPdf, pdfExportResultMessage } from "./studio-pdf-export";
import { WATERMARK_POSITIONS, type WatermarkSettings } from "./studio-watermark";
import { StudioContactSheetPanel } from "./StudioContactSheetPanel";

import type { PsdExportResult } from "./studio-psd-export";
import type { SvgExportResult } from "./studio-svg-export";
import type { Dispatch, SetStateAction } from "react";

import { cx } from "@/lib/cx";

/** 내보내기 진행/결과 안내(규격 슬라이스·PDF 공용) — tone에 따라 색을 달리해 표시한다. */
interface ExportRunStatus {
  tone: "info" | "good" | "warn";
  text: string;
}

export interface StudioExportMenuPanelProps {
  canvasWidth: number;
  canvasHeight: number;
  exportScale: number;
  exportFormat: ExportFormat;
  exportTransparent: boolean;
  exportPresetId: string | null;
  watermark: WatermarkSettings;
  isExporting: boolean;
  /** 규격 슬라이스 파일명에 쓸 작품 제목(비어 있으면 기본 파일명). */
  exportTitle: string;
  /** 전체 페이지 수 — 2 이상이면 "전체 페이지" 규격 내보내기 버튼을 보여준다. */
  pageCount: number;
  /** 페이지별 표시 이름(pageDisplayName 결과) — 콘택트시트 라벨에 쓴다. pages와 같은 순서/길이. */
  pageLabels: string[];
  setExportScale: Dispatch<SetStateAction<number>>;
  setExportFormat: Dispatch<SetStateAction<ExportFormat>>;
  setExportTransparent: Dispatch<SetStateAction<boolean>>;
  setExportPresetId: Dispatch<SetStateAction<string | null>>;
  setWatermark: (next: WatermarkSettings) => void;
  onCopyToClipboard: () => void;
  /**
   * 규격 슬라이스용 페이지 캡처 — 현재 페이지("current") 또는 전체 페이지("all")를
   * 내보내기 배율·색보정 합성으로 캡처해 페이지 순서대로 반환한다. 워터마크는 여기서
   * 찍지 않는다(슬라이스 단계에서 장마다 합성 — 절단면에서 잘리지 않게).
   */
  capturePagesForPreset: (scope: PresetExportScope) => Promise<HTMLCanvasElement[]>;
  /**
   * 현재 페이지를 벡터 SVG로 직렬화 — 요소 데이터가 필요하므로 StudioPage가 페이지
   * elements/배경/그룹/테마를 넘겨 studio-svg-export.exportPageToSvg 를 호출해 결과를 준다.
   * (래스터 캡처와 달리 원본 벡터를 보존하되, 픽셀 필터·톤 등 일부는 스킵 집계로 고지.)
   */
  exportCurrentPageToSvg?: () => Promise<SvgExportResult>;
  /**
   * 현재 페이지를 요소별 레이어를 가진 PSD로 캡처 — Konva 스테이지에서 요소를 하나씩
   * 래스터화해야 하므로(여러 번의 toCanvas) SVG와 달리 비동기다. StudioPage가 stage/요소/
   * 배율을 묶어 studio-psd-export.exportPagePsd 를 호출해 결과를 준다.
   */
  exportCurrentPageToPsd?: () => Promise<PsdExportResult>;
}

export function StudioExportMenuPanel({
  canvasWidth,
  canvasHeight,
  exportScale,
  exportFormat,
  exportTransparent,
  exportPresetId,
  watermark,
  isExporting,
  exportTitle,
  pageCount,
  pageLabels,
  setExportScale,
  setExportFormat,
  setExportTransparent,
  setExportPresetId,
  setWatermark,
  onCopyToClipboard,
  capturePagesForPreset,
  exportCurrentPageToSvg,
  exportCurrentPageToPsd,
}: StudioExportMenuPanelProps) {
  // 규격 슬라이스 실행 상태 — 캡처·저장이 비동기라 패널 안에서 진행/결과를 안내한다.
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetStatus, setPresetStatus] = useState<ExportRunStatus | null>(null);
  // PDF 내보내기 실행 상태 — 규격 슬라이스와 독립 실행이라 상태도 따로 안내한다.
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<ExportRunStatus | null>(null);
  // SVG(벡터) 내보내기 결과 안내 — 스킵/근사 집계를 사용자에게 고지한다.
  const [svgBusy, setSvgBusy] = useState(false);
  const [svgStatus, setSvgStatus] = useState<ExportRunStatus | null>(null);
  // PSD(레이어별) 내보내기 실행 상태 — 요소별 캡처가 여러 번 돌아 비동기라 진행/결과를 안내한다.
  const [psdBusy, setPsdBusy] = useState(false);
  const [psdStatus, setPsdStatus] = useState<ExportRunStatus | null>(null);
  // 콘택트시트(다중 페이지 축소판을 인쇄용 한 장에 타일링) 실행 상태 — 다른 내보내기와 독립.
  const [contactColumns, setContactColumns] = useState<number>(DEFAULT_CONTACT_SHEET_COLUMNS);
  const [contactRows, setContactRows] = useState<number>(DEFAULT_CONTACT_SHEET_ROWS);
  const [contactPagePresetId, setContactPagePresetId] = useState<string>(CONTACT_SHEET_PAGE_PRESETS[0].id);
  const [contactShowLabels, setContactShowLabels] = useState(true);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactStatus, setContactStatus] = useState<ExportRunStatus | null>(null);
  // 페이지당 요소 수만큼 순차 캡처라 다른 내보내기보다 오래 걸린다 — 진행 중 패널이 닫히거나
  // 언마운트되면(다른 내보내기 형식으로 전환 등) 뒤늦게 도착한 결과가 상태를 덮어쓰지 않게 막는다.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const selectedPreset = exportPresetId ? EXPORT_PRESETS.find((preset) => preset.id === exportPresetId) : null;
  const outW = Math.round(canvasWidth * exportScale);
  const outH = Math.round(canvasHeight * exportScale);
  const validation = selectedPreset
    ? validateExport({ width: outW, height: outH, format: exportFormat }, selectedPreset)
    : null;
  const maxH = selectedPreset?.maxImageHeight;
  const slices = maxH !== undefined && outH > maxH ? planStripSlices(outH, maxH) : null;
  const quality = exportQuality(exportFormat);

  // 전체 페이지 캡처 → JPEG 인코드 → 미니멀 PDF 조립 → 한 파일 다운로드.
  async function runPdfExport() {
    if (pdfBusy || presetBusy || psdBusy || svgBusy || isExporting || contactBusy) return;
    setPdfBusy(true);
    setPdfStatus({ tone: "info", text: pageCount > 1 ? `${pageCount}페이지 캡처 중…` : "페이지 캡처 중…" });
    try {
      const pages = await capturePagesForPreset("all");
      const result = await exportPagesToPdf({
        pages,
        title: exportTitle,
        watermark,
        onProgress: (done, total) => setPdfStatus({ tone: "info", text: `${done}/${total}페이지 PDF 변환 중…` }),
      });
      setPdfStatus({ tone: "good", text: pdfExportResultMessage(result) });
    } catch (err) {
      setPdfStatus({
        tone: "warn",
        text: err instanceof Error ? err.message : "PDF 내보내기에 실패했어요.",
      });
    } finally {
      setPdfBusy(false);
    }
  }

  // 페이지 축소판 여러 장을 한 인쇄용 시트에 격자로 배치 → PDF 한 파일. PDF 바이트 조립은
  // exportPagesToPdf와 동일한 buildPdfFromJpegPages를 재사용(studio-pdf-contact-sheet 내부).
  async function runContactSheetExport() {
    if (contactBusy || pdfBusy || presetBusy || psdBusy || svgBusy || isExporting) return;
    const preset = CONTACT_SHEET_PAGE_PRESETS.find((p) => p.id === contactPagePresetId) ?? CONTACT_SHEET_PAGE_PRESETS[0];
    setContactBusy(true);
    setContactStatus({ tone: "info", text: pageCount > 1 ? `${pageCount}페이지 캡처 중…` : "페이지 캡처 중…" });
    try {
      const pages = await capturePagesForPreset("all");
      const result = await exportContactSheetPdf({
        pages,
        pageLabels,
        columns: contactColumns,
        rows: contactRows,
        sheetWidth: preset.widthPx,
        sheetHeight: preset.heightPx,
        showLabels: contactShowLabels,
        title: exportTitle,
        onProgress: (done, total) => setContactStatus({ tone: "info", text: `${done}/${total}장 합성 중…` }),
      });
      if (!mountedRef.current) return;
      setContactStatus({ tone: "good", text: contactSheetResultMessage(result) });
    } catch (err) {
      if (!mountedRef.current) return;
      setContactStatus({ tone: "warn", text: err instanceof Error ? err.message : "콘택트시트 내보내기에 실패했어요." });
    } finally {
      if (mountedRef.current) setContactBusy(false);
    }
  }

  // 현재 페이지 → 벡터 SVG 한 파일. 요소 직렬화는 StudioPage(exportCurrentPageToSvg)가 하고,
  // 여기선 Blob 다운로드 + 스킵/근사 고지만 담당한다.
  async function runSvgExport() {
    if (!exportCurrentPageToSvg || svgBusy || psdBusy || pdfBusy || presetBusy || isExporting || contactBusy) return;
    setSvgBusy(true);
    setSvgStatus({ tone: "info", text: "벡터 내보내기 엔진을 준비하는 중…" });
    try {
      const [result, { SVG_EXPORT_MIME, svgExportFileName, svgExportResultMessage }] =
        await Promise.all([exportCurrentPageToSvg(), loadStudioSvgExportModule()]);
      if (!mountedRef.current) return;
      const blob = new Blob([result.svg], { type: SVG_EXPORT_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = svgExportFileName(exportTitle);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSvgStatus({ tone: result.skipped.length > 0 ? "warn" : "good", text: svgExportResultMessage(result) });
    } catch (err) {
      if (!mountedRef.current) return;
      setSvgStatus({ tone: "warn", text: err instanceof Error ? err.message : "SVG 내보내기에 실패했어요." });
    } finally {
      if (mountedRef.current) setSvgBusy(false);
    }
  }

  // 현재 페이지 → 요소별 레이어를 가진 PSD 한 파일. 캡처(stage.toCanvas 여러 번)는
  // StudioPage(exportCurrentPageToPsd)가 하고, 여기선 Blob 다운로드 + 스킵 고지만 담당한다.
  async function runPsdExport() {
    if (!exportCurrentPageToPsd || psdBusy || svgBusy || pdfBusy || presetBusy || isExporting || contactBusy) return;
    setPsdBusy(true);
    setPsdStatus({ tone: "info", text: "레이어별로 캡처하는 중…" });
    try {
      const [result, { psdExportFileName, psdExportResultMessage }] = await Promise.all([
        exportCurrentPageToPsd(),
        loadStudioPsdExportModule(),
      ]);
      if (!mountedRef.current) return; // 언마운트 후 도착한 결과는 버린다.
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = psdExportFileName(exportTitle);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPsdStatus({ tone: result.skipped.length > 0 ? "warn" : "good", text: psdExportResultMessage(result) });
    } catch (err) {
      if (!mountedRef.current) return;
      setPsdStatus({ tone: "warn", text: err instanceof Error ? err.message : "PSD 내보내기에 실패했어요." });
    } finally {
      if (mountedRef.current) setPsdBusy(false);
    }
  }

  // 규격 선택 → 캡처 → 리샘플·분할 → 순차 다운로드까지 한 번에 실행.
  async function runPresetSliceExport(scope: PresetExportScope) {
    if (!selectedPreset || presetBusy || pdfBusy || psdBusy || svgBusy || contactBusy) return;
    setPresetBusy(true);
    setPresetStatus({ tone: "info", text: scope === "all" ? `${pageCount}페이지 캡처 중…` : "페이지 캡처 중…" });
    try {
      const pages = await capturePagesForPreset(scope);
      const result = await exportPresetSlices({
        pages,
        preset: selectedPreset,
        format: exportFormat,
        title: exportTitle,
        watermark,
        onProgress: (done, total) => setPresetStatus({ tone: "info", text: `${done}/${total}장 저장 중…` }),
      });
      setPresetStatus({
        tone: result.oversized > 0 ? "warn" : "good",
        text: presetExportResultMessage(result, selectedPreset),
      });
    } catch (err) {
      setPresetStatus({
        tone: "warn",
        text: err instanceof Error ? err.message : "규격 내보내기에 실패했어요.",
      });
    } finally {
      setPresetBusy(false);
    }
  }

  // Always fixed (never absolute): menubar uses overflow-x-auto which clips absolute
  // children to the chrome row — File → 내보내기 then looked like a dead click.
  return (
    <div
      data-studio-export-menu-panel="true"
      className="fixed inset-x-2 top-12 z-[100] max-h-[calc(100dvh-4rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-2xl sm:inset-x-auto sm:right-3 sm:w-72"
    >
      <div className="mb-2.5">
        <span className="mb-1 block text-xs font-semibold text-fg-2">플랫폼 규격</span>
        <div className="flex flex-wrap gap-1">
          {EXPORT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setExportPresetId(preset.id);
                setPresetStatus(null);
                if (!preset.allowedFormats.includes(exportFormat)) setExportFormat(preset.recommendedFormat);
                if (preset.width > 0) setExportScale(recommendScale(canvasWidth, preset));
              }}
              aria-pressed={exportPresetId === preset.id}
              title={preset.note}
              className={cx(
                "h-7 rounded-lg border px-2 text-[0.68rem] font-semibold transition-colors",
                exportPresetId === preset.id
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-2">배율</span>
        <div className="flex items-center gap-1">
          {EXPORT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => {
                setExportScale(scale);
                setExportPresetId(null);
              }}
              aria-pressed={exportScale === scale}
              className={cx(
                "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                exportScale === scale ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
              )}
            >
              {scale}×
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-2">포맷</span>
        <div className="flex items-center gap-1">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setExportFormat(format)}
              aria-pressed={exportFormat === format}
              className={cx(
                "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                exportFormat === format ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
              )}
            >
              {exportFormatLabel(format)}
            </button>
          ))}
        </div>
      </div>

      <label
        className={cx(
          "mt-2.5 flex items-center gap-1.5 text-xs",
          exportFormat === "jpg" ? "cursor-not-allowed text-fg-3 opacity-50" : "cursor-pointer text-fg-2"
        )}
        title={exportFormat === "jpg" ? "JPG는 투명도를 지원하지 않아요" : "배경 없이 투명하게 내보내기"}
      >
        <input
          type="checkbox"
          checked={exportTransparent && exportFormat !== "jpg"}
          disabled={exportFormat === "jpg"}
          onChange={(event) => setExportTransparent(event.target.checked)}
          className="size-3.5 cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed"
        />
        투명 배경 (PNG·WebP)
      </label>

      <div className="mt-2.5 border-t border-line pt-2.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={watermark.enabled}
            onChange={(event) => setWatermark({ ...watermark, enabled: event.target.checked })}
            className="size-3.5 cursor-pointer accent-[var(--color-accent)]"
          />
          서명·워터마크
        </label>
        {watermark.enabled && (
          <div className="mt-1.5 space-y-1.5">
            <input
              type="text"
              value={watermark.text}
              onChange={(event) => setWatermark({ ...watermark, text: event.target.value })}
              placeholder="© 작가명 / @아이디"
              maxLength={60}
              className="w-full rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg outline-none focus:border-accent/50"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={watermark.position}
                onChange={(event) =>
                  setWatermark({ ...watermark, position: event.target.value as WatermarkSettings["position"] })
                }
                className="h-7 flex-1 rounded-lg border border-line bg-card px-1.5 text-[0.7rem] text-fg outline-none focus:border-accent/50"
                aria-label="워터마크 위치"
              >
                {WATERMARK_POSITIONS.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={watermark.opacity}
                onChange={(event) => setWatermark({ ...watermark, opacity: Number(event.target.value) })}
                className="h-1 w-16 cursor-pointer accent-[var(--color-accent)]"
                title="워터마크 투명도"
                aria-label="워터마크 투명도"
              />
            </div>
          </div>
        )}
      </div>

      {canCopyImageToClipboard() && (
        <button
          type="button"
          onClick={onCopyToClipboard}
          disabled={isExporting}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:opacity-50"
          title="현재 페이지를 클립보드에 이미지로 복사 (붙여넣기로 바로 사용)"
        >
          <Copy size={13} /> 클립보드로 복사
        </button>
      )}

      {/* 전체 페이지 → PDF 한 파일 — JPG(품질 92%)로 담는 규격 무관 백업·제출·공유용. */}
      <button
        type="button"
        onClick={() => void runPdfExport()}
        disabled={pdfBusy || presetBusy || psdBusy || svgBusy || isExporting || contactBusy}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        title={`전체 ${pageCount}페이지를 JPG로 담은 PDF 한 파일로 저장`}
      >
        <FileText size={13} /> PDF (전체 {pageCount}페이지)
      </button>
      <p
        aria-live="polite"
        className={cx(
          pdfStatus ? "mt-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug" : "sr-only",
          pdfStatus?.tone === "info" && "border-line bg-card text-fg-3",
          pdfStatus?.tone === "good" && "border-good/40 bg-good/10 text-good",
          pdfStatus?.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
        )}
      >
        {pdfStatus?.text}
      </p>

      <StudioContactSheetPanel
        columns={contactColumns}
        rows={contactRows}
        pagePresetId={contactPagePresetId}
        showLabels={contactShowLabels}
        pageCount={pageCount}
        busy={contactBusy}
        disabled={pdfBusy || presetBusy || psdBusy || svgBusy || isExporting}
        status={contactStatus}
        setColumns={setContactColumns}
        setRows={setContactRows}
        setPagePresetId={setContactPagePresetId}
        setShowLabels={setContactShowLabels}
        onExport={() => void runContactSheetExport()}
      />

      {/* 현재 페이지 → 벡터 SVG — 도형·말풍선·텍스트를 벡터로 보존(픽셀 필터·톤 등 일부는 스킵 고지). */}
      {exportCurrentPageToSvg && (
        <>
          <button
            type="button"
            onClick={() => void runSvgExport()}
            onPointerEnter={preloadStudioSvgExportModule}
            onPointerDown={preloadStudioSvgExportModule}
            onFocus={preloadStudioSvgExportModule}
            disabled={svgBusy || psdBusy || pdfBusy || presetBusy || isExporting || contactBusy}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            title="현재 페이지를 벡터 SVG 파일로 저장 (도형·텍스트·말풍선 벡터 보존)"
          >
            <FileText size={13} /> SVG (벡터, 현재 페이지)
          </button>
          <p
            aria-live="polite"
            className={cx(
              svgStatus ? "mt-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug" : "sr-only",
              svgStatus?.tone === "info" && "border-line bg-card text-fg-3",
              svgStatus?.tone === "good" && "border-good/40 bg-good/10 text-good",
              svgStatus?.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
            )}
          >
            {svgStatus?.text}
          </p>
        </>
      )}

      {/* 현재 페이지 → 레이어별 PSD — 요소 하나당 레이어 하나(포토샵에서 개별 편집 가능). */}
      {exportCurrentPageToPsd && (
        <>
          <button
            type="button"
            onClick={() => void runPsdExport()}
            onPointerEnter={preloadStudioPsdExportModule}
            onPointerDown={preloadStudioPsdExportModule}
            onFocus={preloadStudioPsdExportModule}
            disabled={psdBusy || svgBusy || pdfBusy || presetBusy || isExporting || contactBusy}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            title="현재 페이지를 요소별 레이어를 가진 PSD 파일로 저장 (포토샵에서 레이어별 편집 가능)"
          >
            <Layers size={13} /> PSD (레이어별)
          </button>
          <p
            aria-live="polite"
            className={cx(
              psdStatus ? "mt-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug" : "sr-only",
              psdStatus?.tone === "info" && "border-line bg-card text-fg-3",
              psdStatus?.tone === "good" && "border-good/40 bg-good/10 text-good",
              psdStatus?.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
            )}
          >
            {psdStatus?.text}
          </p>
        </>
      )}

      <p className="mt-2 text-[10px] tabular-nums text-fg-3">
        출력 폭 {outW.toLocaleString()}px
        {quality !== undefined ? ` · 품질 ${Math.round(quality * 100)}%` : ""}
      </p>

      {selectedPreset && validation && (
        <div className="mt-2 space-y-1">
          {validation.warnings.map((warning) => (
            <p
              key={warning.code}
              className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[10px] leading-snug text-warn"
            >
              ⚠ {warning.message}
            </p>
          ))}
          {slices && maxH !== undefined && (
            <p className="rounded-md border border-line bg-card px-2 py-1 text-[10px] leading-snug text-fg-3">
              규격 높이 {maxH.toLocaleString()}px 기준 {slices.length}장으로 나눠 올리는 걸 권장해요.
            </p>
          )}
          {validation.ok && !slices && (
            <p className="rounded-md border border-good/40 bg-good/10 px-2 py-1 text-[10px] leading-snug text-good">
              {selectedPreset.label} 규격에 맞아요.
            </p>
          )}

          {/* 규격 실행 — 규격 폭 리샘플 + 규격 높이 자동 분할을 실제 파일 저장으로. */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => void runPresetSliceExport("current")}
              disabled={presetBusy || pdfBusy || psdBusy || svgBusy || isExporting || contactBusy}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 text-[0.68rem] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              title={`현재 페이지를 ${selectedPreset.label} 규격(폭 리샘플·세로 분할)으로 저장`}
            >
              <Scissors size={12} /> 규격으로 저장
            </button>
            {pageCount > 1 && (
              <button
                type="button"
                onClick={() => void runPresetSliceExport("all")}
                disabled={presetBusy || pdfBusy || psdBusy || svgBusy || isExporting || contactBusy}
                className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                title={`${pageCount}페이지를 이어 붙여 ${selectedPreset.label} 규격으로 나눠 저장`}
              >
                <Scissors size={12} /> 전체 {pageCount}페이지
              </button>
            )}
          </div>
          <p
            aria-live="polite"
            className={cx(
              presetStatus
                ? "rounded-md border px-2 py-1 text-[10px] leading-snug"
                : "sr-only",
              presetStatus?.tone === "info" && "border-line bg-card text-fg-3",
              presetStatus?.tone === "good" && "border-good/40 bg-good/10 text-good",
              presetStatus?.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
            )}
          >
            {presetStatus?.text}
          </p>
        </div>
      )}
    </div>
  );
}
