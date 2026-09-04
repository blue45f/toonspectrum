/**
 * Commercial pressure response graph — direct curve manipulation plus a live calibration pad.
 * Existing documents still persist one scalar exponent; the editor only makes that contract easier
 * to tune from real stylus samples.
 */
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  BRUSH_PRESSURE_CURVE_PRESETS,
  pressureCurvePresetId,
  pressureCurveValueForPreset,
  type BrushPressureCurvePresetId,
} from "./studio-brush";
import { StudioPressureCurveGlyph } from "./studio-creative-visuals";
import {
  recommendStudioPressureCurveExponent,
  studioPressureCalibrationStats,
  studioPressureCurveExponentForPoint,
  studioPressureCurveHandlePoint,
  studioPressureCurveMap,
  studioPressureCurvePathD,
  studioPressureCurveSliderMeta,
  studioPressurePreviewDiameter,
} from "./studio-pressure-curve-graph";

import { cn } from "@/lib/utils";

const CHART_W = 160;
const CHART_H = 88;
const TEST_W = 320;
const TEST_H = 78;
const TEST_POINT_LIMIT = 180;

interface StudioPressureTestPoint {
  readonly x: number;
  readonly y: number;
  readonly rawPressure: number;
}

type CoalescedPointerEvent = PointerEvent & {
  getCoalescedEvents?: () => readonly PointerEvent[];
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pressurePercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function safeCoalescedPointerEvents(event: PointerEvent): readonly PointerEvent[] {
  const method = (event as CoalescedPointerEvent).getCoalescedEvents;
  if (typeof method !== "function") return [event];
  try {
    const samples = method.call(event);
    return samples.length > 0 ? samples : [event];
  } catch {
    // Safari versions and embedded webviews can expose a method that still throws.
    return [event];
  }
}

function normalizedReportedPressure(event: PointerEvent): number {
  const reportedPressure = Number.isFinite(event.pressure) ? event.pressure : 0;
  if (reportedPressure > 0) return clamp(reportedPressure, 0, 1);
  // Mouse PointerEvents commonly expose a fixed 0.5 while pressed. Keeping that value makes the
  // scratch pad usable but the calibration recommendation rejects its near-zero dynamic range.
  if (event.pointerType === "mouse" || event.pointerType === "touch") return 0.5;
  // A zero pen sample stays zero so release/contact sentinels cannot bias the recommendation.
  return 0;
}

function normalizedTestPoint(
  event: PointerEvent,
  rect: DOMRect
): StudioPressureTestPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const x = clamp(((event.clientX - rect.left) / rect.width) * TEST_W, 0, TEST_W);
  const y = clamp(((event.clientY - rect.top) / rect.height) * TEST_H, 0, TEST_H);
  return { x, y, rawPressure: normalizedReportedPressure(event) };
}

export interface StudioPressureCurveGraphProps {
  pressureCurve: number;
  onPressureCurveChange: (value: number) => void;
  pressureMinSize?: number;
  className?: string;
  density?: "compact" | "touch";
}

export function StudioPressureCurveGraph({
  pressureCurve,
  onPressureCurveChange,
  pressureMinSize = 0,
  className,
  density = "compact",
}: StudioPressureCurveGraphProps): ReactElement {
  const curveId = pressureCurvePresetId(pressureCurve);
  const pathD = studioPressureCurvePathD(pressureCurve, CHART_W, CHART_H, 28);
  const slider = studioPressureCurveSliderMeta(pressureCurve);
  const handle = studioPressureCurveHandlePoint(pressureCurve);
  const handleOutputMinimum = studioPressureCurveMap(handle.x, slider.max);
  const handleOutputMaximum = studioPressureCurveMap(handle.x, slider.min);
  const touch = density === "touch";
  const curvePointerIdRef = useRef<number | null>(null);
  const testPointerIdRef = useRef<number | null>(null);
  const [testPoints, setTestPoints] = useState<readonly StudioPressureTestPoint[]>([]);
  const rawSamples = useMemo(
    () => testPoints.map((point) => point.rawPressure),
    [testPoints]
  );
  const stats = useMemo(() => studioPressureCalibrationStats(rawSamples), [rawSamples]);
  const recommendation = useMemo(
    () => recommendStudioPressureCurveExponent(rawSamples),
    [rawSamples]
  );
  const latestPoint = testPoints.at(-1) ?? null;
  const latestRaw = latestPoint?.rawPressure ?? 0;
  const latestMapped = studioPressureCurveMap(latestRaw, pressureCurve);

  const setCurveFromPointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!(rect.height > 0)) return;
    const output = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    onPressureCurveChange(studioPressureCurveExponentForPoint(handle.x, output));
  };

  const onCurvePointerDown = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    event.stopPropagation();
    curvePointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Embedded webviews can expose pointer capture methods that still throw.
    }
    setCurveFromPointer(event);
  };

  const onCurvePointerMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    setCurveFromPointer(event);
  };

  const finishCurvePointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    setCurveFromPointer(event);
    curvePointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const cancelCurvePointer = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    curvePointerIdRef.current = null;
  };

  const onCurveKeyDown = (event: KeyboardEvent<SVGCircleElement>): void => {
    let nextExponent: number | null = null;
    // The direct handle represents output, not gamma: Up/Right increases visible output and
    // therefore lowers the exponent. Home/End retain standard slider min/max semantics.
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextExponent = slider.value + slider.step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextExponent = slider.value - slider.step;
    } else if (event.key === "Home") {
      nextExponent = slider.max;
    } else if (event.key === "End") {
      nextExponent = slider.min;
    }
    if (nextExponent === null) return;
    event.preventDefault();
    onPressureCurveChange(clamp(nextExponent, slider.min, slider.max));
  };

  const appendTestPoints = (
    event: ReactPointerEvent<SVGSVGElement>,
    replace: boolean
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const samples = safeCoalescedPointerEvents(event.nativeEvent)
      .map((sample) => normalizedTestPoint(sample, rect))
      .filter((sample): sample is StudioPressureTestPoint => sample !== null);
    if (samples.length === 0) return;
    setTestPoints((current) => {
      const next = replace ? samples : [...current, ...samples];
      return next.length > TEST_POINT_LIMIT
        ? next.slice(next.length - TEST_POINT_LIMIT)
        : next;
    });
  };

  const onTestPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    testPointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The global pointer stream remains a safe fallback.
    }
    appendTestPoints(event, true);
  };

  const onTestPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    appendTestPoints(event, false);
  };

  const finishTestPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    testPointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const cancelTestPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    testPointerIdRef.current = null;
  };

  return (
    <div
      data-studio-pressure-curve-graph="true"
      className={cn(
        "rounded-xl border border-line/70 bg-card/50 p-2.5",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.68rem] font-bold text-fg-2">필압 반응 곡선</p>
        <span className="tabular-nums text-[0.6rem] font-semibold text-fg-3">
          γ {slider.value.toFixed(2)}
        </span>
      </div>

      <svg
        aria-label="필압 곡선 직접 편집"
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mb-2 block h-auto max-h-28 w-full touch-none rounded-lg border border-line/50 bg-canvas/50"
        data-studio-pressure-curve-chart="true"
      >
        <path
          d={`M0 ${CHART_H} H${CHART_W} M0 0 V${CHART_H}`}
          fill="none"
          stroke="oklch(0.42 0.012 64 / 0.45)"
          strokeWidth={1}
        />
        <path
          d={`M0 ${CHART_H / 2} H${CHART_W} M${CHART_W / 2} 0 V${CHART_H}`}
          fill="none"
          stroke="oklch(0.42 0.012 64 / 0.25)"
          strokeWidth={0.75}
          strokeDasharray="3 3"
        />
        <path
          d={`M0 ${CHART_H} L${CHART_W} 0`}
          fill="none"
          stroke="oklch(0.57 0.012 76 / 0.35)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <path
          d={pathD}
          fill="none"
          stroke="oklch(0.72 0.185 42)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={handle.x * CHART_W}
          y1={CHART_H}
          x2={handle.x * CHART_W}
          y2={(1 - handle.y) * CHART_H}
          stroke="oklch(0.72 0.185 42 / 0.32)"
          strokeWidth={0.8}
          strokeDasharray="2 2"
          pointerEvents="none"
        />
        <circle
          cx={handle.x * CHART_W}
          cy={(1 - handle.y) * CHART_H}
          r={touch ? 18 : 14}
          fill="transparent"
          stroke="transparent"
          role="slider"
          tabIndex={0}
          aria-label="필압 곡선 제어점"
          aria-orientation="vertical"
          aria-valuemin={Math.round(handleOutputMinimum * 100)}
          aria-valuemax={Math.round(handleOutputMaximum * 100)}
          aria-valuenow={Math.round(handle.y * 100)}
          aria-valuetext={`중간 필압 출력 ${pressurePercent(handle.y)} · 감마 ${slider.value.toFixed(2)}`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
          data-studio-pressure-curve-handle="true"
          className="cursor-ns-resize outline-none focus-visible:stroke-2 focus-visible:stroke-accent"
          onPointerDown={onCurvePointerDown}
          onPointerMove={onCurvePointerMove}
          onPointerUp={finishCurvePointer}
          onPointerCancel={cancelCurvePointer}
          onKeyDown={onCurveKeyDown}
        />
        <circle
          cx={handle.x * CHART_W}
          cy={(1 - handle.y) * CHART_H}
          r={4.5}
          fill="oklch(0.72 0.185 42)"
          stroke="oklch(0.98 0.01 80)"
          strokeWidth={1.5}
          pointerEvents="none"
          aria-hidden="true"
        />
      </svg>
      <p className="mb-2 text-[0.58rem] leading-relaxed text-fg-3">
        위로 올리면 약한 압력에 더 민감해지고, 아래로 내리면 더 단단해집니다. 방향키로도 조절할 수 있습니다.
      </p>

      <div
        className="mb-2 flex items-center gap-1"
        role="group"
        aria-label="필압 프리셋"
      >
        {BRUSH_PRESSURE_CURVE_PRESETS.map((preset) => {
          const active = curveId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={active}
              onClick={() =>
                onPressureCurveChange(
                  pressureCurveValueForPreset(preset.id as BrushPressureCurvePresetId)
                )
              }
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1 rounded-lg border text-[0.6rem] font-bold transition-colors",
                touch ? "h-11" : "h-8",
                active
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line/70 bg-canvas/40 text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              <StudioPressureCurveGlyph curve={preset.id} />
              <span className="hidden sm:inline">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <label
        className={cn(
          "flex items-center gap-2 text-fg-3",
          touch ? "min-h-11" : ""
        )}
      >
        <span className="sr-only">필압 지수 연속 조절</span>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.value}
          onChange={(event) => onPressureCurveChange(Number(event.target.value))}
          aria-valuetext={`감마 ${slider.value.toFixed(2)}`}
          aria-label="필압 반응 강도"
          className={cn("w-full accent-accent", touch ? "h-10" : "h-8")}
        />
      </label>

      <details
        data-studio-pressure-calibration="true"
        className="group mt-2.5 rounded-lg border border-line/55 bg-canvas/45 p-2"
      >
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center justify-between gap-2 rounded-md text-[0.62rem] font-bold text-fg-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/45 [&::-webkit-details-marker]:hidden",
            touch ? "min-h-11" : "min-h-9"
          )}
        >
          <span>필압 테스트 · 자동 보정</span>
          <span className="text-[0.54rem] font-semibold text-fg-3 group-open:hidden">
            실제 펜 입력으로 열기
          </span>
          <span className="hidden text-[0.54rem] font-semibold text-fg-3 group-open:inline">
            접기
          </span>
        </summary>

        <div className="mt-2 border-t border-line/45 pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[0.62rem] font-bold text-fg-2">
              실시간 필압 테스트
            </span>
            <span className="tabular-nums text-[0.56rem] font-semibold text-fg-3">
              입력 {pressurePercent(latestRaw)} → 출력 {pressurePercent(latestMapped)}
            </span>
          </div>

          <svg
            role="group"
            aria-label="필압 시험선 입력 영역"
            viewBox={`0 0 ${TEST_W} ${TEST_H}`}
            data-studio-pressure-test-pad="true"
            className={cn(
              "block w-full touch-none select-none rounded-md border border-line/45 bg-card/60",
              touch ? "h-24" : "h-20"
            )}
            onPointerDown={onTestPointerDown}
            onPointerMove={onTestPointerMove}
            onPointerUp={finishTestPointer}
            onPointerCancel={cancelTestPointer}
          >
            <path
              d={`M0 ${TEST_H / 2} H${TEST_W}`}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="4 4"
              aria-hidden="true"
            />
            {testPoints.length === 0 ? (
              <text
                x={TEST_W / 2}
                y={TEST_H / 2 + 3}
                textAnchor="middle"
                fill="currentColor"
                className="text-fg-3 text-[10px]"
                aria-hidden="true"
              >
                펜을 약하게→강하게 눌러 시험선을 그리세요
              </text>
            ) : null}
            <g className="text-accent" aria-hidden="true">
              {testPoints.slice(1).map((point, index) => {
                const previous = testPoints[index] ?? point;
                const averagePressure = (previous.rawPressure + point.rawPressure) / 2;
                return (
                  <line
                    key={`${index}-${point.x.toFixed(2)}-${point.y.toFixed(2)}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="currentColor"
                    strokeWidth={studioPressurePreviewDiameter(
                      averagePressure,
                      pressureCurve,
                      pressureMinSize,
                      18
                    )}
                    strokeOpacity={
                      0.45 +
                      studioPressureCurveMap(point.rawPressure, pressureCurve) * 0.55
                    }
                    strokeLinecap="round"
                  />
                );
              })}
              {testPoints.length === 1 ? (
                <circle
                  cx={testPoints[0]?.x}
                  cy={testPoints[0]?.y}
                  r={
                    studioPressurePreviewDiameter(
                      testPoints[0]?.rawPressure ?? 0.5,
                      pressureCurve,
                      pressureMinSize,
                      18
                    ) / 2
                  }
                  fill="currentColor"
                />
              ) : null}
            </g>
          </svg>

          <div
            className="mt-1.5 grid grid-cols-2 gap-1.5"
            aria-label="현재 필압 입출력"
          >
            <div>
              <div className="mb-0.5 flex justify-between text-[0.54rem] text-fg-3">
                <span>원시 입력</span>
                <span>{pressurePercent(latestRaw)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-fg-3/55"
                  style={{ width: pressurePercent(latestRaw) }}
                />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-[0.54rem] text-fg-3">
                <span>적용 출력</span>
                <span>{pressurePercent(latestMapped)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: pressurePercent(latestMapped) }}
                />
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <p
              className="min-w-0 flex-1 text-[0.56rem] leading-relaxed text-fg-3"
              aria-live="polite"
            >
              {stats
                ? `입력 샘플 ${stats.sampleCount}개 · 범위 ${pressurePercent(stats.minimum)}–${pressurePercent(stats.maximum)} · 중앙 ${pressurePercent(stats.median)} · P90 ${pressurePercent(stats.p90)}`
                : "입력 샘플 없음 · 다양한 압력으로 한 번에 그리면 자동 보정할 수 있습니다."}
            </p>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setTestPoints([])}
                disabled={testPoints.length === 0}
                className={cn(
                  "rounded-md border border-line/70 px-2 text-[0.58rem] font-semibold text-fg-3 disabled:cursor-not-allowed disabled:opacity-40",
                  touch ? "min-h-11" : "min-h-8"
                )}
              >
                지우기
              </button>
              <button
                type="button"
                onClick={() =>
                  recommendation !== null && onPressureCurveChange(recommendation)
                }
                disabled={recommendation === null}
                title={
                  recommendation === null
                    ? "서로 다른 압력의 유효 샘플이 8개 이상 필요합니다"
                    : `권장 감마 ${recommendation.toFixed(2)} 적용`
                }
                className={cn(
                  "rounded-md border border-accent/45 bg-accent-soft px-2 text-[0.58rem] font-bold text-accent disabled:cursor-not-allowed disabled:opacity-40",
                  touch ? "min-h-11" : "min-h-8"
                )}
              >
                자동 보정
                {recommendation === null ? "" : ` γ${recommendation.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      </details>

      <p className="mt-1.5 text-[0.58rem] leading-relaxed text-fg-3">
        가로=입력 필압 · 세로=획 굵기/농도. 시험선은 실제 작품에 기록되지 않으며 현재 설정만 미리 봅니다.
      </p>
    </div>
  );
}
