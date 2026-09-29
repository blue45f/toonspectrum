import {
  Columns2,
  Link2,
  Link2Off,
  ScanSearch,
  SlidersHorizontal,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./process-compare.css";
import {
  applySyncedScroll,
  canOpenProcessCompare,
  clampProcessCompareBlinkMs,
  clampProcessCompareZoom,
  defaultProcessCompareSources,
  findProcessCompareItem,
  groupProcessCompareItems,
  PROCESS_COMPARE_BLINK_MAX_MS,
  PROCESS_COMPARE_BLINK_MIN_MS,
  processComparePlaceholderArt,
  processCompareSliderClip,
  zoomProcessCompareIn,
  zoomProcessCompareOut,
  type ProcessCompareItem,
  type ProcessCompareLayout,
  type ProcessCompareMode,
  type ProcessComparePaneSource,
} from "./process-compare-model";
import { useProcessCompareBlink } from "./use-process-compare-blink";
import { useProcessCompareDiffRegions } from "./use-process-compare-diff";
import { useProcessCompareSliderDrag } from "./use-process-compare-slider-drag";
import { ProcessCompareNoDataArt, ProcessComparePaneEmptyArt } from "./process-compare-empty-art";

const MODE_ICONS: Record<ProcessCompareMode, typeof Columns2> = {
  panes: Columns2,
  slider: SlidersHorizontal,
  blink: Zap,
};

const MODE_COPY: Record<ProcessCompareMode, { ko: string; en: string }> = {
  panes: { ko: "나란히 보기", en: "Side by side" },
  slider: { ko: "비포·애프터", en: "Before / After" },
  blink: { ko: "깜빡임 비교", en: "Blink compare" },
};

interface PaneViewportProps {
  readonly item: ProcessCompareItem | null;
  readonly badge: string;
  readonly groups: ReturnType<typeof groupProcessCompareItems>;
  readonly onSelect: (source: ProcessComparePaneSource) => void;
  readonly zoom: number;
  readonly viewportRef: (el: HTMLDivElement | null) => void;
  readonly onScrollSync: (el: HTMLDivElement) => void;
  readonly bt: (ko: string, en: string) => string;
}

/** 단일 비교 페인: 소스 피커 + 줌/스크롤 뷰포트. */
function ComparePane({
  item,
  badge,
  groups,
  onSelect,
  zoom,
  viewportRef,
  onScrollSync,
  bt,
}: PaneViewportProps) {
  const selectedValue = item ? `${item.processId}::${item.revisionId}` : "";
  const artSeed = item ? item.revisionIndex : 0;
  const imageSrc = item?.imageUrl ?? (item ? processComparePlaceholderArt(item.kind, item.processLabel, artSeed) : null);

  return (
    <section className="pcv-pane" aria-label={bt(`비교 페인 ${badge}`, `Compare pane ${badge}`)}>
      <div className="pcv-pane-head">
        <span className="pcv-pane-badge" aria-hidden="true">{badge}</span>
        <select
          className="pcv-picker"
          value={selectedValue}
          onChange={(event) => {
            const [processId, revisionId] = event.target.value.split("::");
            if (processId && revisionId) onSelect({ processId, revisionId });
          }}
          aria-label={bt("이 페인에 표시할 공정과 버전 선택", "Choose process and version for this pane")}
        >
          <option value="">{bt("선택…", "Select…")}</option>
          {groups.map((group) => (
            <optgroup key={group.processId} label={group.processLabel}>
              {group.items.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.processLabel} · {candidate.revisionLabel}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div
        className="pcv-viewport"
        ref={viewportRef}
        onScroll={(event) => onScrollSync(event.currentTarget)}
        data-testid={`pcv-viewport-${badge}`}
      >
        {item && imageSrc ? (
          <div className="pcv-zoomwrap" style={{ transform: `scale(${zoom})` }}>
            <img
              className="pcv-image"
              src={imageSrc}
              alt={`${item.processLabel} ${item.revisionLabel}`}
              draggable={false}
            />
          </div>
        ) : (
          <div className="pcv-empty">
            <ProcessComparePaneEmptyArt />
            <p>{bt("위에서 공정과 버전을 선택하세요", "Choose a process and version above")}</p>
          </div>
        )}
      </div>
      <div className="pcv-foot">
        <span className="pcv-status" data-tone={item ? item.statusTone : "ready"}>
          {item ? `${item.processLabel} · ${item.revisionLabel}` : bt("미선택", "Unselected")}
        </span>
        {item ? <time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time> : null}
      </div>
    </section>
  );
}

export interface ProcessCompareViewerProps {
  readonly items: readonly ProcessCompareItem[];
  readonly initialLayout?: ProcessCompareLayout;
  readonly onClose?: () => void;
  readonly title?: string;
}

/**
 * 공정 비교 뷰어: 2~4개 페인 나란히 보기 + 비포·애프터 슬라이더 + 깜빡임 비교.
 * 시각적 품질이 최우선 — 슬라이더 드래그는 직접 DOM 업데이트로 60fps를 노린다.
 */
export function ProcessCompareViewer({ items, initialLayout = 2, onClose, title }: ProcessCompareViewerProps) {
  const bt = useBilingual("ProcessCompare");
  const [layout, setLayout] = useState<ProcessCompareLayout>(initialLayout);
  const [mode, setMode] = useState<ProcessCompareMode>("panes");
  const [sources, setSources] = useState<readonly ProcessComparePaneSource[]>(() =>
    defaultProcessCompareSources(items, initialLayout),
  );
  const [syncScroll, setSyncScroll] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [blinkMs, setBlinkMs] = useState(800);
  const [blinkOn, setBlinkOn] = useState(true);
  const [diffOn, setDiffOn] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const viewportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const syncingRef = useRef(false);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const slider = useProcessCompareSliderDrag();
  const { phase: blinkPhase, togglePhase: toggleBlinkPhase } = useProcessCompareBlink(
    mode === "blink",
    blinkOn,
    blinkMs,
  );

  const groups = useMemo(() => groupProcessCompareItems(items), [items]);
  const canOpen = canOpenProcessCompare(items);

  const paneItems = useMemo(
    () => sources.map((source) => findProcessCompareItem(items, source)),
    [sources, items],
  );

  // 슬라이더/깜빡임 모드에서 쓰는 두 페인 (첫 두 페인)
  const compareA = paneItems[0] ?? null;
  const compareB = paneItems[1] ?? null;
  const artA = compareA ? (compareA.imageUrl ?? processComparePlaceholderArt(compareA.kind, compareA.processLabel, compareA.revisionIndex)) : null;
  const artB = compareB ? (compareB.imageUrl ?? processComparePlaceholderArt(compareB.kind, compareB.processLabel, compareB.revisionIndex)) : null;

  const diffRegions = useProcessCompareDiffRegions(diffOn, mode, artA, artB, imgARef, imgBRef);

  const modeLabel = useCallback((m: ProcessCompareMode) => bt(MODE_COPY[m].ko, MODE_COPY[m].en), [bt]);

  const handleModeChange = useCallback((next: ProcessCompareMode) => {
    setMode(next);
    setLiveMessage(bt(MODE_COPY[next].ko, MODE_COPY[next].en));
  }, [bt]);

  // 레이아웃 변경 시 페인 수 맞추기
  const handleLayoutChange = useCallback((next: ProcessCompareLayout) => {
    setLayout(next);
    setSources((prev) => {
      if (prev.length === next) return prev;
      if (prev.length > next) return prev.slice(0, next);
      const filled = [...prev];
      const defaults = defaultProcessCompareSources(items, next);
      for (const candidate of defaults) {
        if (filled.length >= next) break;
        if (!filled.some((s) => s.processId === candidate.processId && s.revisionId === candidate.revisionId)) {
          filled.push(candidate);
        }
      }
      return filled;
    });
  }, [items]);

  const handlePaneSelect = useCallback((index: number, source: ProcessComparePaneSource) => {
    setSources((prev) => prev.map((s, i) => (i === index ? source : s)));
  }, []);

  const handleScrollSync = useCallback((el: HTMLDivElement) => {
    if (!syncScroll || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const targets = viewportRefs.current.filter((node): node is HTMLDivElement => node !== null && node !== el);
      applySyncedScroll(targets, el);
    } finally {
      syncingRef.current = false;
    }
  }, [syncScroll]);

  if (!canOpen) {
    return (
      <div className="pcv-root" data-testid="pcv-root">
        <div className="pcv-empty">
          <ProcessCompareNoDataArt />
          <p>{bt("비교할 공정 결과물이 2개 이상 필요합니다", "Need at least 2 process outputs to compare")}</p>
          <p className="pcv-empty-hint">
            {bt(
              "각 공정에 결과물(리비전)을 2개 이상 등록한 뒤 다시 열어주세요",
              "Register at least 2 outputs (revisions) across processes, then open compare again",
            )}
          </p>
          {onClose ? (
            <button type="button" className="pcv-tool-btn" data-primary="true" onClick={onClose}>
              <X size={15} aria-hidden="true" />
              {title ?? bt("닫기", "Close")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="pcv-root" data-testid="pcv-root">
      {/* ── 툴바 ── */}
      <div className="pcv-toolbar" role="toolbar" aria-label={bt("비교 도구", "Compare tools")}>
        <div className="pcv-seg" role="group" aria-label={bt("비교 방식", "Compare mode")}>
          {(Object.keys(MODE_ICONS) as ProcessCompareMode[]).map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <button
                key={m}
                type="button"
                data-active={mode === m}
                onClick={() => handleModeChange(m)}
                aria-pressed={mode === m}
                title={modeLabel(m)}
              >
                <Icon size={15} aria-hidden="true" />
                {modeLabel(m)}
              </button>
            );
          })}
        </div>

        {mode === "panes" && (
          <div className="pcv-seg" role="group" aria-label={bt("페인 개수", "Pane count")}>
            {([2, 3, 4] as ProcessCompareLayout[]).map((n) => (
              <button
                key={n}
                type="button"
                data-active={layout === n}
                onClick={() => handleLayoutChange(n)}
                aria-pressed={layout === n}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="pcv-tool-btn"
          data-active={syncScroll}
          onClick={() => setSyncScroll((v) => !v)}
          aria-pressed={syncScroll}
          title={bt("한 페인을 스크롤하면 다른 페인도 함께 스크롤", "Scroll panes together")}
        >
          {syncScroll ? <Link2 size={15} aria-hidden="true" /> : <Link2Off size={15} aria-hidden="true" />}
          {bt("동기 스크롤", "Sync scroll")}
        </button>

        {(mode === "slider" || mode === "blink") && (
          <button
            type="button"
            className="pcv-tool-btn"
            data-active={diffOn}
            onClick={() => setDiffOn((v) => !v)}
            aria-pressed={diffOn}
            title={bt("두 이미지 간 차이가 큰 영역을 표시", "Highlight areas with big differences")}
          >
            <ScanSearch size={15} aria-hidden="true" />
            {bt("차이 표시", "Show diff")}
          </button>
        )}
      </div>

      {/* ── 나란히 보기 ── */}
      {mode === "panes" && (
        <div className="pcv-panes" data-layout={layout}>
          {paneItems.map((item, index) => (
            <ComparePane
              key={`pane-${index}`}
              item={item}
              badge={String(index + 1)}
              groups={groups}
              onSelect={(source) => handlePaneSelect(index, source)}
              zoom={zoom}
              viewportRef={(el) => { viewportRefs.current[index] = el; }}
              onScrollSync={handleScrollSync}
              bt={bt}
            />
          ))}
        </div>
      )}

      {/* ── 비포·애프터 슬라이더 ── */}
      {mode === "slider" && (
        <div
          className="pcv-slider-stage"
          ref={slider.stageRef}
          data-testid="pcv-slider-stage"
          onPointerDown={slider.onPointerDown}
          onPointerMove={slider.onPointerMove}
          onPointerUp={slider.onPointerUp}
          onPointerCancel={slider.onPointerUp}
        >
          <div className="pcv-slider-layer" data-testid="pcv-slider-after">
            {artB ? (
              <img ref={imgBRef} src={artB} alt={compareB ? `${compareB.processLabel} ${compareB.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" />
            ) : null}
            <span className="pcv-slider-tag" data-side="after">
              {compareB ? `${compareB.processLabel} · ${compareB.revisionLabel}` : bt("이후", "After")}
            </span>
          </div>
          <div
            className="pcv-slider-layer"
            ref={slider.beforeRef}
            data-testid="pcv-slider-before"
            style={{ clipPath: processCompareSliderClip(slider.position) }}
          >
            {artA ? (
              <img ref={imgARef} src={artA} alt={compareA ? `${compareA.processLabel} ${compareA.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" />
            ) : null}
            <span className="pcv-slider-tag" data-side="before">
              {compareA ? `${compareA.processLabel} · ${compareA.revisionLabel}` : bt("이전", "Before")}
            </span>
          </div>
          {diffOn && diffRegions.map((region, i) => (
            <div
              key={i}
              className="pcv-diff-region"
              data-testid="pcv-diff-region"
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            />
          ))}
          <div
            className="pcv-slider-handle"
            ref={slider.handleRef}
            data-testid="pcv-slider-handle"
            data-dragging={slider.isDragging}
            style={{ left: `${slider.position}%` }}
            role="slider"
            tabIndex={0}
            aria-label={bt("이전·이후 비교 슬라이더", "Before-after compare slider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(slider.position)}
            aria-valuetext={`${Math.round(slider.position)}%`}
            onKeyDown={slider.onKeyDown}
          >
            <div className="pcv-slider-line" aria-hidden="true" />
            <div className="pcv-slider-knob" aria-hidden="true">
              <SlidersHorizontal size={18} />
            </div>
          </div>
        </div>
      )}

      {/* ── 깜빡임 비교 ── */}
      {mode === "blink" && (
        <div className="pcv-blink-stage" data-testid="pcv-blink-stage">
          <div className="pcv-blink-layer" style={{ opacity: blinkPhase ? 0 : 1 }} data-testid="pcv-blink-a">
            {artA ? (
              <img ref={imgARef} src={artA} alt={compareA ? `${compareA.processLabel} ${compareA.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" />
            ) : null}
            <span className="pcv-slider-tag" data-side="before">
              {compareA ? `${compareA.processLabel} · ${compareA.revisionLabel}` : bt("이전", "Before")}
            </span>
          </div>
          <div className="pcv-blink-layer" style={{ opacity: blinkPhase ? 1 : 0 }} data-testid="pcv-blink-b">
            {artB ? (
              <img ref={imgBRef} src={artB} alt={compareB ? `${compareB.processLabel} ${compareB.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" />
            ) : null}
            <span className="pcv-slider-tag" data-side="after">
              {compareB ? `${compareB.processLabel} · ${compareB.revisionLabel}` : bt("이후", "After")}
            </span>
          </div>
          {diffOn && diffRegions.map((region, i) => (
            <div
              key={i}
              className="pcv-diff-region"
              data-testid="pcv-diff-region"
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            />
          ))}
          <div className="pcv-blink-controls">
            <label>
              <input
                type="checkbox"
                checked={blinkOn}
                onChange={(e) => setBlinkOn(e.target.checked)}
              />
              {bt("자동 전환", "Auto toggle")}
            </label>
            <button type="button" className="pcv-tool-btn" onClick={toggleBlinkPhase}>
              {bt("수동 전환", "Toggle manually")}
            </button>
            <details className="pcv-advanced">
              <summary>{bt("고급 설정", "Advanced settings")}</summary>
              <label>
                {bt("주기", "Interval")}
                <input
                  type="range"
                  min={PROCESS_COMPARE_BLINK_MIN_MS}
                  max={PROCESS_COMPARE_BLINK_MAX_MS}
                  step={50}
                  value={blinkMs}
                  onChange={(e) => setBlinkMs(clampProcessCompareBlinkMs(Number(e.target.value)))}
                  aria-label={bt("깜빡임 주기", "Blink interval")}
                />
                <span>{blinkMs}ms</span>
              </label>
            </details>
          </div>
        </div>
      )}

      {/* ── 하단 상태바 ── */}
      <div className="pcv-statusbar">
        <span data-testid="pcv-hint">
          {mode === "slider"
            ? bt("가운데 핸들을 잡고 드래그하세요 · ←/→ 키로 미세 조정", "Drag the center handle · ←/→ for fine control")
            : mode === "blink"
              ? bt("두 이미지가 번갈아 표시됩니다 · 차이가 보이는 곳을 찾으세요", "Images alternate · spot the differences")
              : bt("휠로 확대 · 드래그로 이동 · 페인별 공정 선택 가능", "Wheel to zoom · drag to pan · pick process per pane")}
        </span>
        {mode === "panes" && (
          <div className="pcv-zoomctl" role="group" aria-label={bt("확대/축소", "Zoom")}>
            <button type="button" className="pcv-tool-btn" onClick={() => setZoom((z) => zoomProcessCompareOut(z))} aria-label={bt("축소", "Zoom out")} disabled={zoom <= 0.5}>
              <ZoomOut size={15} aria-hidden="true" />
            </button>
            <span className="pcv-zoomval" data-testid="pcv-zoomval">{Math.round(clampProcessCompareZoom(zoom) * 100)}%</span>
            <button type="button" className="pcv-tool-btn" onClick={() => setZoom((z) => zoomProcessCompareIn(z))} aria-label={bt("확대", "Zoom in")} disabled={zoom >= 4}>
              <ZoomIn size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* 닫기: 다이얼로그로 쓸 때 부모가 전달 */}
      {onClose ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="pcv-tool-btn pcv-close" onClick={onClose}>
            <X size={15} aria-hidden="true" />
            {title ?? bt("닫기", "Close")}
          </button>
        </div>
      ) : null}
      <div className="pcv-live" aria-live="polite" data-testid="pcv-live">{liveMessage}</div>
    </div>
  );
}
