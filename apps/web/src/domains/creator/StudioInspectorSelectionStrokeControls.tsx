/** Selection stroke properties for freehand and shape elements. */
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
import { StudioColorField } from "./StudioColorField";

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
  readonly previewPatch?: (id: string, patch: Partial<El>, key: string) => void;
  /** Explicit values remain useful for isolated surfaces and tests; the page owner is the default. */
  readonly recentColors?: readonly string[];
  readonly documentColors?: readonly string[];
  readonly onEnsureRecentColorsLoaded?: () => void;
  readonly onRememberColor?: (color: string) => void;
  readonly onFinishColorPreview?: () => void;
  readonly onRequestColorSample?: (applyColor: (color: string) => void) => void;
}

export function StudioInspectorSelectionStrokeControls({
  selected,
  patchEl,
  previewPatch,
  recentColors,
  documentColors = [],
  onEnsureRecentColorsLoaded,
  onRememberColor,
  onFinishColorPreview,
  onRequestColorSample,
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
  const displayedRecentColors = normalizeRecentColors(availableRecentColors, 5);

  const normalizedSelectedStroke = normalizeHexColor(selected.stroke);
  const freehandStrokeOnly = (selected.kind ?? "freehand") === "freehand";
  const selectedOpacity = Number.isFinite(selected.opacity) ? (selected.opacity ?? 1) : 1;
  const strokeDisabled =
    isTransparentStroke(selected.stroke) || (freehandStrokeOnly && selectedOpacity <= 0);
  const lastVisibleStroke = useRef(
    normalizedSelectedStroke ?? displayedRecentColors[0] ?? DEFAULT_STROKE_COLOR,
  );
  const lastVisibleOpacity = useRef(
    selectedOpacity > 0 ? clampOpacity(selectedOpacity) : 1,
  );

  useEffect(() => {
    requestRecentColors?.();
  }, [requestRecentColors]);

  useEffect(() => {
    if (normalizedSelectedStroke) lastVisibleStroke.current = normalizedSelectedStroke;
  }, [normalizedSelectedStroke]);

  useEffect(() => {
    if (selectedOpacity > 0) lastVisibleOpacity.current = clampOpacity(selectedOpacity);
  }, [selectedOpacity]);

  const activeColor = normalizedSelectedStroke ?? lastVisibleStroke.current;
  const strokeWidth = Math.max(1, Math.min(48, selected.strokeWidth ?? 3));
  const opacity =
    selectedOpacity > 0 ? clampOpacity(selectedOpacity) : lastVisibleOpacity.current;
  const previewWidth = Math.max(1, Math.min(12, strokeWidth));

  const visiblePatch = (color: string): Partial<El> => ({
    stroke: color,
    ...(freehandStrokeOnly && selectedOpacity <= 0
      ? { opacity: lastVisibleOpacity.current }
      : {}),
  } as Partial<El>);

  const hiddenPatch = (): Partial<El> => {
    if (freehandStrokeOnly) {
      lastVisibleOpacity.current = opacity;
      return { opacity: 0 } as Partial<El>;
    }
    return { stroke: "transparent" } as Partial<El>;
  };

  const patchStroke = (color: string | null) => {
    if (color === null) {
      if (normalizedSelectedStroke) lastVisibleStroke.current = normalizedSelectedStroke;
      patchEl(selected.id, hiddenPatch());
      return;
    }
    const normalized = normalizeHexColor(color) ?? color;
    lastVisibleStroke.current = normalized;
    patchEl(selected.id, visiblePatch(normalized));
  };

  const previewStroke = (color: string) => {
    const normalized = normalizeHexColor(color) ?? color;
    lastVisibleStroke.current = normalized;
    const patch = visiblePatch(normalized);
    if (previewPatch) previewPatch(selected.id, patch, `color:${selected.id}:stroke`);
    else patchEl(selected.id, patch);
  };

  const rememberStroke = (rawColor: string) => {
    const color = normalizeHexColor(rawColor);
    if (!color) return;
    lastVisibleStroke.current = color;
    if (onRememberColor) onRememberColor(color);
    else rememberSharedStudioRecentColor(color);
  };

  return (
    <div className="space-y-3" data-testid="studio-inspector-selection-stroke-controls">
      <StudioColorField
        label="선 색상"
        value={strokeDisabled ? null : activeColor}
        fallbackColor={lastVisibleStroke.current}
        purpose="stroke"
        recentColors={availableRecentColors}
        documentColors={documentColors}
        allowNone
        noneLabel="선 없음"
        onChange={patchStroke}
        onPreview={previewStroke}
        onUseColor={rememberStroke}
        onLoadRecentColors={requestRecentColors}
        onInteractionEnd={onFinishColorPreview}
        onRequestCanvasEyedropper={
          onRequestColorSample
            ? () =>
                onRequestColorSample((color) => {
                  patchStroke(color);
                  rememberStroke(color);
                })
            : undefined
        }
      />

      <div
        className="relative h-10 overflow-hidden rounded-xl border border-line/60 shadow-inner"
        data-studio-stroke-preview="true"
        data-testid="studio-selection-stroke-preview"
        role="img"
        aria-label={
          strokeDisabled
            ? "선 미리보기: 선 없음"
            : `선 미리보기: ${activeColor}, ${strokeWidth}px, ${Math.round(opacity * 100)}%`
        }
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-[#f7f5f1]" aria-hidden />
        <span className="absolute inset-y-0 right-0 w-1/2 bg-[#211b18]" aria-hidden />
        <svg className="absolute inset-0 size-full" viewBox="0 0 240 40" aria-hidden>
          <line
            x1="16"
            y1="20"
            x2="224"
            y2="20"
            stroke={strokeDisabled ? "transparent" : activeColor}
            strokeWidth={previewWidth}
            strokeLinecap="round"
            opacity={opacity}
          />
        </svg>
        {strokeDisabled ? (
          <span className="absolute inset-0 grid place-items-center text-[0.62rem] font-semibold text-fg-3">
            선 없음
          </span>
        ) : null}
      </div>

      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        선 두께
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={1}
            max={48}
            value={strokeWidth}
            aria-label="선 두께"
            disabled={strokeDisabled}
            onChange={(event) =>
              patchEl(selected.id, {
                strokeWidth: Number(event.currentTarget.value),
              } as Partial<El>)
            }
            className="w-24 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-45"
          />
          <span className="w-9 text-right text-xs tabular-nums text-fg-3">
            {strokeWidth}px
          </span>
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        <span>
          <span className="sr-only">불투명도</span>
          <span aria-hidden>전체 불투명도</span>
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
