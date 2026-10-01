/**
 * 모바일 독자 뷰(Reader Preview) 패널 — PUBLISH T4.
 *
 * 에디터 안의 "독자 뷰" 토글에서 열리는 세로 스크롤 미리보기. 실제 모바일 폭(390px)
 * 디바이스 프레임 안에 페이지를 이어 붙여 "독자가 읽는 화면"을 재현한다.
 *
 * - 컷 간격 시각화: 컷 사이 간격을 점선 밴드+px 라벨로 표시
 * - 대사 가독성 체크: 독자 폭 환산 폰트가 최소값 미만이면 컷 위에 경고 마커
 * - 안전영역 가이드라인: 좌우 16px 점선 가이드 + 침범 요소 마커
 * - 컷 길이 경고: 과도하게 긴 컷(>3화면)/짧은 컷(<0.5화면)/겹친 컷을 체크리스트에 집계
 * - 스크롤 페이싱 시뮬레이션: 자동 스크롤 재생/일시정지 + 속도 프리셋 + 현재 화면 표시
 *
 * 기하학 계산은 전부 `./reader-preview-analysis` (순수 함수)에 위임한다 — 이 파일은
 * 렌더와 인터랙션만 담당한다. 페이지는 `StudioScrollPreviewPanel` 과 같은
 * `StudioPageThumbnail`(SVG 프록시)로 렌더한다.
 *
 * 반응형: 모바일(base)에서는 전체화면 시트, 데스크톱(md:)에서는 중앙 모달 +
 * 좌측 읽기 체크리스트 사이드패널.
 */
import {
  AlertTriangle,
  BookOpenText,
  ChevronDown,
  CircleAlert,
  Info,
  LocateFixed,
  Pause,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { CANVAS_W } from "../studio-assets";
import { pageDisplayName } from "../studio-page-meta";
import { planStudioAutoScrollStep } from "../studio-scroll-rhythm";
import { StudioPageThumbnail } from "../StudioPageThumbnails";
import type { ThumbPageLike } from "../studio-page-thumbs";

import {
  READER_PREVIEW_DEVICE_WIDTH_PX,
  READER_PREVIEW_PAGE_GAP_PX,
  READER_PREVIEW_SAFE_AREA_INSET_PX,
  analyzeReaderPreview,
  type ReaderPreviewAnalysis,
  type ReaderPreviewPageAnalysis,
  type ReaderPreviewWarning,
  type ReaderPreviewWarningSeverity,
} from "./reader-preview-analysis";
import { formatReaderPreviewText } from "./reader-preview-i18n";

import { useT } from "@/shared/lib/i18n";
import { reducedMotion } from "@/shared/hooks/use-in-view";
import { cn } from "@/shared/lib/utils";

/** ThumbPageLike + 표시용 이름 — StudioScrollPreviewPanel 의 ScrollPreviewPage 와 동일 계약. */
export type ReaderPreviewPage = ThumbPageLike & { name?: string };

export interface ReaderPreviewPanelProps {
  open: boolean;
  onClose: () => void;
  pages: ReaderPreviewPage[];
  /** 현재 편집 중인 페이지 — 열릴 때 그 위치로 자동 스크롤한다. */
  currentPageId: string;
  /** 페이지 클릭 시 그 페이지로 점프 + 패널 닫기. 생략하면 순수 열람 모드. */
  onSelectPage?: (pageId: string) => void;
}

const AUTO_SCROLL_SPEED_PRESETS = [
  { id: "slow", pxPerSecond: 120 },
  { id: "normal", pxPerSecond: 240 },
  { id: "fast", pxPerSecond: 420 },
] as const;

const FRAME_PX = READER_PREVIEW_DEVICE_WIDTH_PX;
const SAFE_INSET_PX = READER_PREVIEW_SAFE_AREA_INSET_PX;

function warningTone(severity: ReaderPreviewWarningSeverity): string {
  if (severity === "critical") return "bg-danger";
  if (severity === "warning") return "bg-amber-400";
  return "bg-accent";
}

function warningIcon(severity: ReaderPreviewWarningSeverity): ReactElement {
  if (severity === "critical")
    return <CircleAlert size={13} aria-hidden className="shrink-0 text-danger" />;
  if (severity === "warning")
    return <AlertTriangle size={13} aria-hidden className="shrink-0 text-amber-500" />;
  return <Info size={13} aria-hidden className="shrink-0 text-accent" />;
}

function buildPageLabelMap(pages: readonly ReaderPreviewPage[]): ReadonlyMap<string, string> {
  return new Map(pages.map((page, index) => [page.id, pageDisplayName(page, index)]));
}

function formatScreens(t: (key: string) => string, screens: number): string {
  return formatReaderPreviewText(t("reader.preview.screenUnit"), { count: screens });
}

function ReadingChecklist({
  analysis,
  pageLabels,
  onJumpToPage,
  collapsed,
  onToggleCollapsed,
}: {
  analysis: ReaderPreviewAnalysis;
  pageLabels: ReadonlyMap<string, string>;
  onJumpToPage: (pageId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}): ReactElement {
  const t = useT();
  const warnings = analysis.warnings;
  return (
    <aside
      aria-label={t("reader.preview.checklistTitle")}
      className="w-full shrink-0 rounded-xl border border-line bg-panel/95 shadow-lg md:sticky md:top-0 md:w-72"
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ShieldCheck size={14} aria-hidden className="text-accent" />
        <h3 className="text-sm font-bold text-fg">{t("reader.preview.checklistTitle")}</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.68rem] font-bold",
            warnings.length > 0 ? "bg-amber-400/15 text-amber-500" : "bg-accent-soft text-accent",
          )}
        >
          {warnings.length}건
        </span>
        <span className="ml-auto text-[0.68rem] text-fg-4">
          {formatReaderPreviewText(t("reader.preview.totalScreens"), {
            count: analysis.totalScreens,
          })}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn("text-fg-3 transition-transform", !collapsed && "rotate-180")}
        />
      </button>
      {!collapsed && (
        <div className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3 md:max-h-[60dvh]">
          {warnings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-2.5 py-3 text-[0.7rem] leading-5 text-fg-3">
              {t("reader.preview.noWarnings")}
            </p>
          ) : (
            warnings.map((warning, index) => (
              <button
                key={`${warning.code}-${warning.pageId}-${warning.cutIndex ?? "x"}-${index}`}
                type="button"
                onClick={() => onJumpToPage(warning.pageId)}
                className="block w-full rounded-lg border border-line bg-card px-2.5 py-2 text-left transition-colors hover:bg-raised"
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={cn("mt-1 size-1.5 shrink-0 rounded-full", warningTone(warning.severity))}
                  />
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-semibold text-fg">
                      {warning.message}
                      <span className="ml-1 font-normal text-fg-4">
                        · {pageLabels.get(warning.pageId) ?? warning.pageId}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.64rem] leading-4 text-fg-4">{warning.detail}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}

/** 390px 디바이스 프레임 안의 한 페이지 — 썸네일 + 컷/간격/안전영역 오버레이. */
function ReaderFramePage({
  page,
  pageIndex,
  pageCount,
  pageAnalysis,
  pageLabel,
  onSelectPage,
  pageRef,
}: {
  page: ReaderPreviewPage;
  pageIndex: number;
  pageCount: number;
  pageAnalysis: ReaderPreviewPageAnalysis;
  pageLabel: string;
  onSelectPage?: (pageId: string) => void;
  pageRef: (element: HTMLDivElement | null) => void;
}): ReactElement {
  const t = useT();
  const canvasH = page.canvasH > 0 ? page.canvasH : 1080;
  const scale = pageAnalysis.scale;

  const elementById = useMemo(() => {
    const map = new Map<string, ReaderPreviewPage["elements"][number]>();
    for (const element of page.elements) {
      if (element.id) map.set(element.id, element);
    }
    return map;
  }, [page.elements]);

  const warningsByCut = useMemo(() => {
    const map = new Map<number, ReaderPreviewWarning[]>();
    for (const warning of pageAnalysis.warnings) {
      if (warning.cutIndex === null) continue;
      const list = map.get(warning.cutIndex) ?? [];
      list.push(warning);
      map.set(warning.cutIndex, list);
    }
    return map;
  }, [pageAnalysis.warnings]);

  const textWarnings = useMemo(
    () =>
      pageAnalysis.warnings.filter(
        (warning) =>
          (warning.code === "SMALL_DIALOGUE_TEXT" ||
            warning.code === "SAFE_AREA_INTRUSION") &&
          warning.elementId !== null,
      ),
    [pageAnalysis.warnings],
  );

  return (
    <div
      ref={pageRef}
      className="relative"
      data-page-id={page.id}
      style={{ marginBottom: pageIndex < pageCount - 1 ? READER_PREVIEW_PAGE_GAP_PX : 0 }}
    >
      <section
        aria-label={`${pageIndex + 1}/${pageCount}페이지 — ${pageLabel}`}
        className="relative w-full overflow-hidden rounded-lg bg-white shadow-sm"
        style={{ aspectRatio: `${CANVAS_W} / ${canvasH}` }}
      >
        <StudioPageThumbnail page={page} className="h-full w-full rounded-none border-0" />

        {/* 안전영역 가이드라인 — 좌우 16px 점선 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-20 border-r border-dashed border-accent/70"
          style={{ left: SAFE_INSET_PX }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-20 border-l border-dashed border-accent/70"
          style={{ right: SAFE_INSET_PX }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 z-20 rounded bg-accent/85 px-1 py-px text-[9px] font-bold leading-3 text-white"
        >
          {t("reader.preview.safeAreaLabel")}
        </span>

        {/* 컷 밴드 — 컷 경계와 화면 수, 경고 배지 */}
        {pageAnalysis.cuts.map((cut) => {
          const cutWarnings = warningsByCut.get(cut.index) ?? [];
          const hasWarning = cutWarnings.length > 0;
          return (
            <div
              key={`cut-${cut.index}`}
              aria-hidden={!hasWarning}
              aria-label={
                hasWarning
                  ? formatReaderPreviewText(t("reader.preview.cutLabel"), {
                      index: cut.index + 1,
                    }) + ` — ${cutWarnings[0]?.message ?? ""}`
                  : undefined
              }
              className={cn(
                "pointer-events-none absolute inset-x-0 z-10 border-y",
                hasWarning ? "border-amber-400/80 bg-amber-400/10" : "border-white/25",
              )}
              style={{ top: cut.y * scale, height: Math.max(2, cut.height * scale) }}
            >
              <span
                className={cn(
                  "absolute right-1 top-0.5 rounded px-1 py-px text-[9px] font-bold leading-3",
                  hasWarning ? "bg-amber-400/90 text-black" : "bg-black/55 text-white",
                )}
              >
                {cut.index + 1} · {formatScreens(t, cut.screens)}
              </span>
              {hasWarning && (
                <span className="absolute left-1 top-0.5 grid size-4 place-items-center rounded-full bg-amber-400 text-black">
                  <AlertTriangle size={10} aria-hidden />
                </span>
              )}
            </div>
          );
        })}

        {/* 컷 간격 시각화 — 컷 사이 밴드 + px 라벨 */}
        {pageAnalysis.cuts.map((cut) => {
          if (cut.gapAfterPx === null) return null;
          const overlapped = cut.gapAfterPx < 0;
          const top = (cut.y + cut.height) * scale;
          const height = Math.max(3, Math.abs(cut.gapAfterReaderPx ?? 0));
          return (
            <div
              key={`gap-${cut.index}`}
              aria-hidden
              title={formatReaderPreviewText(t("reader.preview.gapLabel"), {
                gap: Math.round(cut.gapAfterPx),
              })}
              className={cn(
                "pointer-events-none absolute inset-x-0 z-10",
                overlapped
                  ? "bg-danger/25"
                  : "border-y border-dotted border-accent/60 bg-accent/5",
              )}
              style={{ top, height }}
            >
              {(cut.gapAfterReaderPx ?? 0) >= 14 && (
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[9px] font-semibold leading-3 text-accent">
                  {formatReaderPreviewText(t("reader.preview.gapLabel"), {
                    gap: Math.round(cut.gapAfterPx),
                  })}
                </span>
              )}
            </div>
          );
        })}

        {/* 대사 가독성/안전영역 마커 */}
        {textWarnings.map((warning, index) => {
          const element = warning.elementId ? elementById.get(warning.elementId) : undefined;
          if (!element || !Number.isFinite(element.y)) return null;
          return (
            <span
              key={`text-warn-${index}`}
              role="img"
              aria-label={warning.message}
              title={`${warning.message} — ${warning.detail}`}
              className={cn(
                "absolute right-2 z-20 grid size-5 -translate-y-1/2 place-items-center rounded-full border shadow",
                warning.severity === "info"
                  ? "border-accent/60 bg-panel text-accent"
                  : "border-amber-500/70 bg-amber-400 text-black",
              )}
              style={{ top: (element.y as number) * scale }}
            >
              {warningIcon(warning.severity)}
            </span>
          );
        })}
      </section>

      <span
        aria-hidden
        className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-white"
      >
        {pageLabel}
      </span>
      {onSelectPage && (
        <button
          type="button"
          onClick={() => onSelectPage(page.id)}
          aria-label={`${pageLabel} 편집하기`}
          className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      )}
    </div>
  );
}

export function ReaderPreviewPanel({
  open,
  onClose,
  pages,
  currentPageId,
  onSelectPage,
}: ReaderPreviewPanelProps): ReactElement | null {
  const t = useT();
  const [checklistCollapsed, setChecklistCollapsed] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(240);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [screenPosition, setScreenPosition] = useState(0);
  const pageRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const initialPageId = useRef(currentPageId).current;

  const analysis = useMemo(() => analyzeReaderPreview(pages), [pages]);
  const pageLabels = useMemo(() => buildPageLabelMap(pages), [pages]);
  const pageAnalysisById = useMemo(
    () => new Map(analysis.pages.map((pageAnalysis) => [pageAnalysis.pageId, pageAnalysis])),
    [analysis],
  );

  useEffect(() => {
    if (!open) return;
    pageRefs.current.get(initialPageId)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [initialPageId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !autoScrolling) return;
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    let animationFrame = 0;
    let previousTimestamp: number | null = null;
    const advance = (timestamp: number) => {
      if (previousTimestamp !== null) {
        const step = planStudioAutoScrollStep({
          scrollTop: viewport.scrollTop,
          scrollHeight: viewport.scrollHeight,
          viewportHeight: viewport.clientHeight,
          speedPxPerSecond: autoScrollSpeed,
          elapsedMs: timestamp - previousTimestamp,
        });
        viewport.scrollTop = step.nextScrollTop;
        if (step.reachedEnd) {
          setAutoScrolling(false);
          return;
        }
      }
      previousTimestamp = timestamp;
      animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [autoScrollSpeed, autoScrolling, open]);

  const handleViewportScroll = (): void => {
    const viewport = scrollViewportRef.current;
    if (!viewport || viewport.clientHeight <= 0) return;
    setScreenPosition(viewport.scrollTop / viewport.clientHeight);
  };

  const jumpToPage = (pageId: string): void => {
    pageRefs.current
      .get(pageId)
      ?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  if (!open) return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("reader.preview.title")}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] text-fg backdrop-blur-sm md:p-4"
    >
      {/* 스크림 클릭으로 닫기 — 마우스 전용 부가 편의. 키보드 닫기는 Esc와 닫기 버튼이 담당. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 z-0 hidden cursor-default md:block"
      />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden border-line bg-panel shadow-2xl md:rounded-2xl md:border">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <BookOpenText size={16} className="text-accent" aria-hidden />
          <h2 className="text-sm font-bold text-fg">{t("reader.preview.title")}</h2>
          <span className="text-xs text-fg-3">
            {formatReaderPreviewText(t("reader.preview.totalPages"), { count: pages.length })}
          </span>
          {analysis.warningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.7rem] font-bold text-amber-500">
              <AlertTriangle size={11} aria-hidden />
              {analysis.warningCount}건
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              aria-live="polite"
              className="hidden text-[0.7rem] tabular-nums text-fg-4 sm:inline"
            >
              {formatReaderPreviewText(t("reader.preview.scrollPosition"), {
                position: (Math.floor(screenPosition * 10) / 10).toFixed(1),
              })}
            </span>
            <div
              role="group"
              aria-label={t("reader.preview.autoScroll")}
              className="flex min-h-8 items-center overflow-hidden rounded-lg border border-line bg-card"
            >
              <select
                aria-label={t("reader.preview.speedLabel")}
                value={autoScrollSpeed}
                onChange={(event) => setAutoScrollSpeed(Number(event.target.value))}
                className="min-h-8 border-0 bg-transparent px-2 text-[0.7rem] font-medium text-fg-2 outline-none"
              >
                {AUTO_SCROLL_SPEED_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.pxPerSecond}>
                    {t(`reader.preview.speed.${preset.id}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={autoScrolling ? t("reader.preview.pause") : t("reader.preview.play")}
                aria-pressed={autoScrolling}
                onClick={() => {
                  const viewport = scrollViewportRef.current;
                  if (
                    !autoScrolling &&
                    viewport &&
                    viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight - 1
                  ) {
                    viewport.scrollTop = 0;
                  }
                  setAutoScrolling((playing) => !playing);
                }}
                className={cn(
                  "grid size-8 place-items-center border-l border-line text-fg-3 transition-colors hover:bg-raised hover:text-fg",
                  autoScrolling && "bg-accent-soft text-accent",
                )}
                title={t("reader.preview.autoScroll")}
              >
                {autoScrolling ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => jumpToPage(currentPageId)}
              className="flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
              title={t("reader.preview.gotoCurrentPage")}
            >
              <LocateFixed size={12} aria-hidden />
              <span className="hidden sm:inline">{t("reader.preview.gotoCurrentPage")}</span>
            </button>
            <button
              type="button"
              aria-label={t("reader.preview.close")}
              title={`${t("reader.preview.close")} (Esc)`}
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </div>

        <div
          ref={scrollViewportRef}
          onScroll={handleViewportScroll}
          className="min-h-0 flex-1 overflow-y-auto bg-raised/30 px-3 py-6"
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col items-stretch gap-4 md:flex-row md:items-start">
            <ReadingChecklist
              analysis={analysis}
              pageLabels={pageLabels}
              onJumpToPage={jumpToPage}
              collapsed={checklistCollapsed}
              onToggleCollapsed={() => setChecklistCollapsed((collapsed) => !collapsed)}
            />
            <div className="mx-auto w-full shrink-0 md:mx-0" style={{ width: FRAME_PX, maxWidth: "100%" }}>
              {/* 디바이스 프레임 — 실제 모바일 폭 390px */}
              <div className="overflow-hidden rounded-2xl border border-line bg-black/40 shadow-xl">
                <div className="flex items-center justify-center gap-1.5 border-b border-line bg-panel px-3 py-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-line" />
                  <span aria-hidden className="size-1.5 rounded-full bg-line" />
                  <span aria-hidden className="size-1.5 rounded-full bg-line" />
                  <span className="ml-1 text-[0.62rem] font-semibold tabular-nums text-fg-4">
                    {FRAME_PX}px
                  </span>
                </div>
                <div className="bg-canvas px-0 py-3">
                  {pages.length === 0 ? (
                    <p className="mx-3 rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-fg-4">
                      {t("reader.preview.noWarnings")}
                    </p>
                  ) : (
                    pages.map((page, index) => (
                      <ReaderFramePage
                        key={page.id}
                        page={page}
                        pageIndex={index}
                        pageCount={pages.length}
                        pageAnalysis={
                          pageAnalysisById.get(page.id) ??
                          ({
                            pageId: page.id,
                            scale: FRAME_PX / CANVAS_W,
                            cuts: [],
                            warnings: [],
                            screenCount: 0,
                            dialogueElementCount: 0,
                            smallDialogueCount: 0,
                          } satisfies ReaderPreviewPageAnalysis)
                        }
                        pageLabel={pageLabels.get(page.id) ?? page.id}
                        onSelectPage={onSelectPage}
                        pageRef={(element) => {
                          if (element) pageRefs.current.set(page.id, element);
                          else pageRefs.current.delete(page.id);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
