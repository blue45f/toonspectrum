import {
  FlipHorizontal2,
  Focus,
  Gauge,
  Grid3x3,
  Maximize2,
  RotateCcw,
  RotateCw,
  Scan,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type RefObject,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  closeStudioViewInspectionPanel,
  getStudioViewInspectionSnapshot,
  subscribeStudioViewInspection,
  toggleStudioPerformanceHud,
  toggleStudioPixelPreview,
} from "../studio-view-inspection-store";

import {
  EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS,
  normalizeStudioViewZoomPercent,
  summarizeStudioViewFrameDurations,
  type StudioViewPerformanceMetrics,
} from "./studio-view-performance-metrics";

interface StudioViewInspectorHudProps {
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly zoom: number;
  readonly canvasRotation: number;
  readonly canvasFlipH: boolean;
  readonly selectionCount: number;
  readonly viewDisabledReason?: string | null;
  readonly onZoomToSelection: () => void;
  readonly onFitCanvasToWidth: () => void;
  readonly onActualPixels: () => void;
  readonly onResetView: () => void;
  readonly onRotateLeft: () => void;
  readonly onRotateRight: () => void;
  readonly onToggleFlip: () => void;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

const EMPTY_VIEWPORT_SIZE: ViewportSize = Object.freeze({ width: 0, height: 0 });
const PERFORMANCE_SAMPLE_WINDOW_MS = 750;
const MAX_FRAME_SAMPLES = 180;
const ACTION_BUTTON_CLASS =
  "inline-flex min-h-10 w-full items-center justify-start gap-2 rounded-lg border border-line bg-raised/70 px-3 py-2 text-left text-xs font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function useStudioViewPerformanceMetrics(
  enabled: boolean
): StudioViewPerformanceMetrics {
  const [metrics, setMetrics] = useState<StudioViewPerformanceMetrics>(
    EMPTY_STUDIO_VIEW_PERFORMANCE_METRICS
  );

  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame !== "function") return;

    let frameRequest = 0;
    let previousFrame: number | null = null;
    let sampleWindowStarted = 0;
    let durations: number[] = [];

    const sampleFrame = (now: number) => {
      if (sampleWindowStarted === 0) sampleWindowStarted = now;
      const pageVisible =
        typeof document === "undefined" || document.visibilityState === "visible";

      if (previousFrame !== null && pageVisible) {
        const duration = now - previousFrame;
        if (duration > 0 && duration <= 1000) durations.push(duration);
      }
      previousFrame = now;

      if (now - sampleWindowStarted >= PERFORMANCE_SAMPLE_WINDOW_MS) {
        setMetrics(
          summarizeStudioViewFrameDurations(
            durations.slice(-MAX_FRAME_SAMPLES)
          )
        );
        durations = [];
        sampleWindowStarted = now;
      }
      frameRequest = requestAnimationFrame(sampleFrame);
    };

    frameRequest = requestAnimationFrame(sampleFrame);
    return () => {
      cancelAnimationFrame(frameRequest);
    };
  }, [enabled]);

  return metrics;
}

function useStudioViewportSize(
  viewportRef: RefObject<HTMLDivElement | null>,
  enabled: boolean
): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);

  useEffect(() => {
    if (!enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      setSize({
        width: Math.round(viewport.clientWidth),
        height: Math.round(viewport.clientHeight),
      });
    };

    update();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [enabled, viewportRef]);

  return size;
}

function ViewActionButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  disabledReason,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${ACTION_BUTTON_CLASS} ${
        active ? "border-accent/60 bg-accent/15 text-accent" : ""
      }`}
      disabled={disabled}
      title={disabled ? disabledReason ?? label : label}
      aria-pressed={active || undefined}
      onClick={onClick}
    >
      <Icon size={15} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function ViewToggle({
  icon: Icon,
  label,
  description,
  pressed,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly description: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-raised/50 px-3 py-2 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md ${
          pressed ? "bg-accent/20 text-accent" : "bg-panel text-fg-2"
        }`}
      >
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-fg">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-fg-3">
          {description}
        </span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          pressed ? "border-accent bg-accent" : "border-line bg-panel"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform ${
            pressed ? "translate-x-[1.05rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function getPerformanceQuality(
  metrics: StudioViewPerformanceMetrics
): "측정 중" | "원활" | "주의" | "느림" {
  if (metrics.sampleCount === 0) return "측정 중";
  if (metrics.p95FrameMs <= 20) return "원활";
  if (metrics.p95FrameMs <= 33) return "주의";
  return "느림";
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-raised/70 px-2 py-1.5">
      <dt className="truncate text-[9px] font-semibold uppercase tracking-wide text-fg-3">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[11px] font-bold tabular-nums text-fg">
        {value}
      </dd>
    </div>
  );
}

function PerformanceCard({
  metrics,
  viewportSize,
  zoomPercent,
  rotation,
  flipped,
}: {
  readonly metrics: StudioViewPerformanceMetrics;
  readonly viewportSize: ViewportSize;
  readonly zoomPercent: number;
  readonly rotation: number;
  readonly flipped: boolean;
}) {
  const dpr =
    typeof window === "undefined"
      ? 1
      : Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const hasSamples = metrics.sampleCount > 0;

  return (
    <section
      className="pointer-events-auto absolute bottom-3 left-3 w-[min(21rem,calc(100%-1.5rem))] rounded-xl border border-line bg-panel/95 p-3 text-xs shadow-xl backdrop-blur"
      aria-label="캔버스 렌더 성능"
      data-studio-view-performance-hud
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-fg">
          <Gauge size={15} aria-hidden />
          렌더 성능
        </div>
        <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] font-bold text-fg-2">
          {getPerformanceQuality(metrics)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-1.5">
        <Metric label="FPS" value={hasSamples ? metrics.fps.toFixed(1) : "—"} />
        <Metric
          label="평균"
          value={hasSamples ? `${metrics.averageFrameMs.toFixed(1)}ms` : "—"}
        />
        <Metric
          label="P95"
          value={hasSamples ? `${metrics.p95FrameMs.toFixed(1)}ms` : "—"}
        />
        <Metric
          label="느린 프레임"
          value={hasSamples ? `${metrics.slowFramePercent.toFixed(1)}%` : "—"}
        />
      </dl>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line/70 pt-2 text-[10px] text-fg-3">
        <span>DPR {dpr}</span>
        <span>
          뷰포트{" "}
          {viewportSize.width > 0
            ? `${viewportSize.width}×${viewportSize.height}`
            : "—"}
        </span>
        <span>확대 {zoomPercent}%</span>
        <span>회전 {rotation}°</span>
        <span>{flipped ? "좌우 반전" : "원본 방향"}</span>
      </div>
    </section>
  );
}

export function StudioViewInspectorHud({
  viewportRef,
  zoom,
  canvasRotation,
  canvasFlipH,
  selectionCount,
  viewDisabledReason,
  onZoomToSelection,
  onFitCanvasToWidth,
  onActualPixels,
  onResetView,
  onRotateLeft,
  onRotateRight,
  onToggleFlip,
}: StudioViewInspectorHudProps) {
  const snapshot = useSyncExternalStore(
    subscribeStudioViewInspection,
    getStudioViewInspectionSnapshot,
    getStudioViewInspectionSnapshot
  );
  const metrics = useStudioViewPerformanceMetrics(snapshot.performanceHudEnabled);
  const viewportSize = useStudioViewportSize(
    viewportRef,
    snapshot.performanceHudEnabled
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const previousImageRendering = viewport.style.imageRendering;
    const previousAttribute = viewport.getAttribute("data-studio-pixel-preview");

    if (snapshot.pixelPreviewEnabled) {
      viewport.style.imageRendering = "pixelated";
      viewport.setAttribute("data-studio-pixel-preview", "true");
    } else {
      viewport.style.imageRendering = "";
      viewport.removeAttribute("data-studio-pixel-preview");
    }

    return () => {
      viewport.style.imageRendering = previousImageRendering;
      if (previousAttribute === null) {
        viewport.removeAttribute("data-studio-pixel-preview");
      } else {
        viewport.setAttribute("data-studio-pixel-preview", previousAttribute);
      }
    };
  }, [snapshot.pixelPreviewEnabled, viewportRef]);

  const zoomPercent = normalizeStudioViewZoomPercent(zoom);
  const normalizedRotation = ((canvasRotation % 360) + 360) % 360;
  const viewBusy = Boolean(viewDisabledReason);
  const selectionDisabledReason =
    viewDisabledReason ??
    (selectionCount === 0
      ? "선택한 개체가 없어 맞춤 확대를 사용할 수 없습니다."
      : null);

  if (
    !snapshot.panelOpen &&
    !snapshot.pixelPreviewEnabled &&
    !snapshot.performanceHudEnabled
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      data-studio-view-inspector
    >
      {snapshot.panelOpen ? (
        <section
          className="pointer-events-auto absolute right-3 top-3 w-[min(24rem,calc(100%-1.5rem))] rounded-xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur"
          aria-labelledby="studio-view-inspector-title"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Scan size={16} className="text-accent" aria-hidden />
                <h2
                  id="studio-view-inspector-title"
                  className="text-sm font-extrabold text-fg"
                >
                  보기 진단
                </h2>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-fg-3">
                선택·배율·회전·픽셀·렌더 상태를 한곳에서 검수합니다. 문서와
                내보내기 결과는 바뀌지 않습니다.
              </p>
            </div>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="보기 진단 닫기"
              onClick={closeStudioViewInspectionPanel}
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold text-fg-2">
            <span className="rounded-full border border-line bg-raised/70 px-2 py-1">
              확대 {zoomPercent}%
            </span>
            <span className="rounded-full border border-line bg-raised/70 px-2 py-1">
              회전 {normalizedRotation}°
            </span>
            <span className="rounded-full border border-line bg-raised/70 px-2 py-1">
              {canvasFlipH ? "좌우 반전" : "원본 방향"}
            </span>
            <span className="rounded-full border border-line bg-raised/70 px-2 py-1">
              선택 {selectionCount}개
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <ViewActionButton
              icon={Focus}
              label="선택 영역 맞춤"
              disabled={selectionCount === 0 || viewBusy}
              disabledReason={selectionDisabledReason}
              onClick={onZoomToSelection}
            />
            <ViewActionButton
              icon={Maximize2}
              label="폭에 맞춤"
              disabled={viewBusy}
              disabledReason={viewDisabledReason}
              onClick={onFitCanvasToWidth}
            />
            <ViewActionButton
              icon={Grid3x3}
              label="실제 픽셀 · 100%"
              disabled={viewBusy}
              disabledReason={viewDisabledReason}
              onClick={onActualPixels}
            />
            <ViewActionButton
              icon={Scan}
              label="보기 초기화"
              disabled={viewBusy}
              disabledReason={viewDisabledReason}
              onClick={onResetView}
            />
            <ViewActionButton
              icon={RotateCcw}
              label="왼쪽 90°"
              disabled={viewBusy}
              disabledReason={viewDisabledReason}
              onClick={onRotateLeft}
            />
            <ViewActionButton
              icon={RotateCw}
              label="오른쪽 90°"
              disabled={viewBusy}
              disabledReason={viewDisabledReason}
              onClick={onRotateRight}
            />
            <div className="col-span-2">
              <ViewActionButton
                icon={FlipHorizontal2}
                label="좌우 반전 검수"
                active={canvasFlipH}
                disabled={viewBusy}
                disabledReason={viewDisabledReason}
                onClick={onToggleFlip}
              />
            </div>
          </div>

          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <ViewToggle
              icon={Grid3x3}
              label="래스터 픽셀 경계"
              description="캔버스 표면의 보간을 끄고 확대 시 픽셀 경계를 선명하게 확인합니다."
              pressed={snapshot.pixelPreviewEnabled}
              onClick={toggleStudioPixelPreview}
            />
            <ViewToggle
              icon={Gauge}
              label="렌더 성능 HUD"
              description="FPS·평균 프레임·P95·DPR·뷰포트 크기를 저빈도로 측정합니다."
              pressed={snapshot.performanceHudEnabled}
              onClick={toggleStudioPerformanceHud}
            />
          </div>

          <p className="mt-2 text-[10px] leading-4 text-fg-3">
            픽셀 경계 모드는 래스터 표시 보간만 바꾸며 벡터·텍스트 원본이나
            저장 데이터에는 영향을 주지 않습니다.
          </p>
        </section>
      ) : null}

      {!snapshot.panelOpen && snapshot.pixelPreviewEnabled ? (
        <button
          type="button"
          className="pointer-events-auto absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-accent/50 bg-panel/95 px-3 py-1.5 text-[11px] font-bold text-accent shadow-lg backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={toggleStudioPixelPreview}
          title="래스터 픽셀 경계 끄기"
        >
          <Grid3x3 size={13} aria-hidden />
          픽셀 경계 켜짐 · 끄기
        </button>
      ) : null}

      {snapshot.performanceHudEnabled ? (
        <PerformanceCard
          metrics={metrics}
          viewportSize={viewportSize}
          zoomPercent={zoomPercent}
          rotation={normalizedRotation}
          flipped={canvasFlipH}
        />
      ) : null}
    </div>
  );
}
