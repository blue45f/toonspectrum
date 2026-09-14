/**
 * Selection stroke properties for freehand/shape draw elements.
 * Kept as a leaf so context-property tests can drive the shipped control path
 * without mounting the full StudioInspectorAside graph.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  normalizeHexColor,
  normalizeRecentColors,
} from "./studio-color-utils";
import {
  ensureSharedStudioRecentColorsLoaded,
  getStudioRecentColorsServerSnapshot,
  getStudioRecentColorsSnapshot,
  rememberSharedStudioRecentColor,
  subscribeStudioRecentColors,
} from "./studio-recent-colors-bridge";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";

import type { DrawEl, El } from "./studio-element-model";

const DEFAULT_STROKE_COLOR = "#16100c";
const TRANSPARENT_STROKE_VALUES = new Set(["", "none", "transparent"]);

function isTransparentStroke(value: string): boolean {
  return TRANSPARENT_STROKE_VALUES.has(value.trim().toLowerCase());
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(1, value));
}

export interface StudioInspectorSelectionStrokeControlsProps {
  readonly selected: DrawEl;
  readonly patchEl: (id: string, patch: Partial<El>) => void;
  /** Explicit values remain useful for isolated surfaces and tests; the page owner is the default. */
  readonly recentColors?: readonly string[];
  readonly onEnsureRecentColorsLoaded?: () => void;
  readonly onRememberColor?: (color: string) => void;
}

export function StudioInspectorSelectionStrokeControls({
  selected,
  patchEl,
  recentColors,
  onEnsureRecentColorsLoaded,
  onRememberColor,
}: StudioInspectorSelectionStrokeControlsProps) {
  const sharedRecentColors = useSyncExternalStore(
    subscribeStudioRecentColors,
    getStudioRecentColorsSnapshot,
    getStudioRecentColorsServerSnapshot,
  );
  const availableRecentColors = recentColors ?? sharedRecentColors;
  const requestRecentColors =
    onEnsureRecentColorsLoaded ??
    (recentColors === undefined ? ensureSharedStudioRecentColorsLoaded : undefined);
  const normalizedSelectedStroke = normalizeHexColor(selected.stroke);
  const freehandStrokeOnly = (selected.kind ?? "freehand") === "freehand";
  const selectedOpacity = Number.isFinite(selected.opacity) ? (selected.opacity ?? 1) : 1;
  const strokeDisabled =
    isTransparentStroke(selected.stroke) || (freehandStrokeOnly && selectedOpacity <= 0);
  const lastVisibleStrokeRef = useRef(normalizedSelectedStroke ?? DEFAULT_STROKE_COLOR);
  const lastVisibleOpacityRef = useRef(
    selectedOpacity > 0 ? clampOpacity(selectedOpacity) : 1,
  );

  useEffect(() => {
    requestRecentColors?.();
  }, [requestRecentColors]);

  useEffect(() => {
    if (normalizedSelectedStroke) lastVisibleStrokeRef.current = normalizedSelectedStroke;
  }, [normalizedSelectedStroke]);

  useEffect(() => {
    if (selectedOpacity > 0) lastVisibleOpacityRef.current = clampOpacity(selectedOpacity);
  }, [selectedOpacity]);

  const activeColor = normalizedSelectedStroke ?? lastVisibleStrokeRef.current;
  const displayedRecentColors = normalizeRecentColors(
    availableRecentColors,
    5,
  );
  const width = Math.max(1, Math.min(48, selected.strokeWidth ?? 3));
  const opacity =
    selectedOpacity > 0 ? clampOpacity(selectedOpacity) : lastVisibleOpacityRef.current;
  const previewThickness = Math.max(1, Math.min(12, width * 0.55));

  const rememberColor = (rawColor: string): string | null => {
    const color = normalizeHexColor(rawColor);
    if (!color) return null;
    lastVisibleStrokeRef.current = color;
    if (onRememberColor) onRememberColor(color);
    else rememberSharedStudioRecentColor(color);
    return color;
  };

  const applyColor = (rawColor: string) => {
    const color = rememberColor(rawColor);
    if (!color) return;
    patchEl(selected.id, {
      stroke: color,
      ...(freehandStrokeOnly && selectedOpacity <= 0
        ? { opacity: lastVisibleOpacityRef.current }
        : {}),
    } as Partial<El>);
  };

  const toggleStroke = () => {
    if (strokeDisabled) {
      const restored =
        normalizeHexColor(lastVisibleStrokeRef.current) ??
        displayedRecentColors[0] ??
        DEFAULT_STROKE_COLOR;
      rememberColor(restored);
      patchEl(selected.id, {
        stroke: restored,
        ...(freehandStrokeOnly && selectedOpacity <= 0
          ? { opacity: lastVisibleOpacityRef.current }
          : {}),
      } as Partial<El>);
      return;
    }

    if (normalizedSelectedStroke) lastVisibleStrokeRef.current = normalizedSelectedStroke;
    if (freehandStrokeOnly) {
      lastVisibleOpacityRef.current = opacity;
      patchEl(selected.id, { opacity: 0 } as Partial<El>);
      return;
    }
    patchEl(selected.id, { stroke: "transparent" } as Partial<El>);
  };

  return (
    <div className="space-y-3" data-testid="studio-inspector-selection-stroke-controls">
      <section
        className="rounded-2xl border border-line/55 bg-gradient-to-b from-card/85 to-canvas/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        aria-labelledby="studio-selection-stroke-heading"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="studio-selection-stroke-heading"
              className="text-[0.72rem] font-semibold tracking-tight text-fg"
            >
              선
            </h3>
            <p className="mt-0.5 text-[0.6rem] leading-snug text-fg-3">
              {strokeDisabled
                ? "외곽선이 보이지 않아요. 색을 고르면 다시 켜집니다."
                : `${width}px · ${Math.round(opacity * 100)}% · 선택한 요소에 적용`}
            </p>
          </div>
          <button
            type="button"
            aria-label="선 없음"
            aria-pressed={strokeDisabled}
            onClick={toggleStroke}
            className={
              strokeDisabled
                ? "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-accent/50 bg-accent-soft/60 px-2 text-[0.65rem] font-semibold text-accent ring-1 ring-accent/20 transition-colors pointer-coarse:min-h-11"
                : "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-line/70 bg-card/75 px-2 text-[0.65rem] font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised pointer-coarse:min-h-11"
            }
          >
            <span
              aria-hidden
              className="grid size-4 place-items-center rounded-full border border-current text-[0.55rem] leading-none"
            >
              ╱
            </span>
            없음
          </button>
        </div>

        <div
          className="relative min-h-11 overflow-hidden rounded-xl border border-line/70 bg-card/80 shadow-sm transition-[border-color,box-shadow] hover:border-line-strong focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25"
          data-studio-stroke-color-field="true"
        >
          <div
            aria-hidden
            className="pointer-events-none flex min-h-11 items-center gap-2.5 px-2.5"
          >
            <span
              className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/20 shadow-[0_2px_7px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.24)] pointer-coarse:size-8"
              style={
                strokeDisabled
                  ? {
                      backgroundImage:
                        "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
                      backgroundSize: "7px 7px",
                    }
                  : { background: activeColor }
              }
            >
              {strokeDisabled ? (
                <svg viewBox="0 0 24 24" className="size-full text-danger/80">
                  <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" />
                </svg>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.62rem] font-medium text-fg-3">선 색상</span>
              <span className="block truncate font-mono text-xs font-semibold uppercase tracking-wide text-fg">
                {strokeDisabled ? "선 없음" : activeColor}
              </span>
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0 text-fg-3"
            >
              <path
                d="m7 10 5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {/* LazyStudioColorPopover owns aria-label="선 색상" on the full-field trigger. */}
          <LazyStudioColorPopover
            value={activeColor}
            onChange={applyColor}
            recentColors={availableRecentColors}
            onLoadRecentColors={requestRecentColors}
            label="선 색상"
            purpose="generic"
            className="absolute inset-0 z-10 block h-full w-full [&>*]:block [&>*]:h-full [&>*]:w-full [&_button]:h-full [&_button]:w-full [&_button]:rounded-xl [&_button]:opacity-0"
          />
        </div>

        <div className="mt-2.5" role="group" aria-label="최근 선 색상">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[0.61rem] font-semibold text-fg-3">최근 사용</span>
            <span className="text-[0.56rem] text-fg-3">클릭해 바로 적용</span>
          </div>
          {displayedRecentColors.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {displayedRecentColors.map((color, index) => {
                const selectedColor = !strokeDisabled && color === activeColor;
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={`최근 선 색상 ${index + 1} ${color} 적용`}
                    aria-pressed={selectedColor}
                    onClick={() => applyColor(color)}
                    className={
                      selectedColor
                        ? "size-7 rounded-lg border border-transparent ring-2 ring-accent ring-offset-2 ring-offset-panel shadow-sm transition-transform hover:scale-105 pointer-coarse:size-11"
                        : "size-7 rounded-lg border border-white/20 shadow-sm ring-1 ring-black/10 transition-transform hover:scale-105 pointer-coarse:size-11"
                    }
                    style={{ background: color }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line/55 bg-canvas/20 px-2 py-1.5 text-[0.58rem] leading-snug text-fg-3">
              색을 고르면 자주 쓰는 선색이 여기에 쌓입니다.
            </p>
          )}
        </div>

        <div
          role="img"
          aria-label={
            strokeDisabled
              ? "선 미리보기: 선 없음"
              : `선 미리보기: ${activeColor}, ${width}px, ${Math.round(opacity * 100)}%`
          }
          data-testid="studio-selection-stroke-preview"
          className="relative mt-2.5 h-11 overflow-hidden rounded-xl border border-line/60 bg-[linear-gradient(90deg,#f7f4ed_0%,#f7f4ed_50%,#282421_50%,#282421_100%)] shadow-[inset_0_1px_4px_rgba(0,0,0,0.12)]"
        >
          {strokeDisabled ? (
            <div className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-fg-3/45" />
          ) : (
            <div
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-full shadow-[0_1px_1px_rgba(0,0,0,0.22)]"
              style={{
                height: `${previewThickness}px`,
                background: activeColor,
                opacity,
              }}
            />
          )}
          <span className="absolute bottom-1 right-1.5 rounded bg-black/35 px-1.5 py-0.5 text-[0.5rem] font-medium text-white/85 backdrop-blur-sm">
            {strokeDisabled ? "없음" : `${width}px`}
          </span>
        </div>
      </section>

      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        선 두께
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={1}
            max={48}
            value={width}
            disabled={strokeDisabled}
            aria-label="선 두께"
            onChange={(event) =>
              patchEl(selected.id, {
                strokeWidth: Number(event.currentTarget.value),
              } as Partial<El>)
            }
            className="w-24 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-45"
          />
          <span className="w-9 text-right text-xs tabular-nums text-fg-3">{width}px</span>
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        <span className="flex flex-col">
          <span>불투명도</span>
          <span className="text-[0.55rem] font-normal text-fg-3">전체 요소</span>
        </span>
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            aria-label="불투명도"
            onChange={(event) =>
              patchEl(selected.id, {
                opacity: Number(event.currentTarget.value),
              } as Partial<El>)
            }
            className="w-24 cursor-pointer accent-accent"
          />
          <span className="w-9 text-right text-xs tabular-nums text-fg-3">
            {Math.round(opacity * 100)}%
          </span>
        </span>
      </label>
    </div>
  );
}
