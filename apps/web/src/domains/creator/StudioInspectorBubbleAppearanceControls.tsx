import { Suspense, useEffect, useRef } from "react";

import {
  BUBBLE_OUTLINE_STYLE_OPTIONS,
  normalizeBubbleOutlineStyle,
} from "./lettering/studio-bubble-outline-style";
import { BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT } from "./lettering/studio-bubble-text-fit";
import { bubbleAutoShrinkPreview } from "./lettering/studio-bubble-text-runtime";
import { StudioBubbleVariantGlyph } from "./lettering/StudioBubbleVariantGlyph";
import { BUBBLE_VARIANTS } from "./studio-assets";
import {
  StudioBubbleAutoShrinkPanel,
  StudioBubbleStylePresetPanel,
  StudioGradientEnginePanel,
} from "./studio-page-lazy-ui";
import { StudioColorField } from "./StudioColorField";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type { BubbleEl } from "./studio-element-model";

import { cn } from "@/shared/lib/utils";

export type BubbleAppearancePatch = Partial<
  Pick<
    BubbleEl,
    | "variant"
    | "fill"
    | "textFill"
    | "stroke"
    | "strokeWidth"
    | "strokeStyle"
    | "outlineStyle"
    | "gradient"
    | "autoShrinkText"
    | "autoShrinkMinFontSize"
    | "starAmplitude"
    | "shadowColor"
    | "shadowBlur"
    | "shadowOffsetX"
    | "shadowOffsetY"
    | "shadowOpacity"
    | "font"
  >
>;

export interface StudioInspectorBubbleAppearanceControlsProps {
  readonly recentColors: readonly string[];
  readonly documentColors?: readonly string[];
  readonly selected: BubbleEl;
  readonly webtoonTheme: "classic" | "soft" | "vivid";
  readonly onEnsureRecentColorsLoaded: () => void;
  readonly onPatch: (patch: BubbleAppearancePatch) => void;
  readonly onPreviewPatch?: (patch: BubbleAppearancePatch, key: string) => void;
  readonly onFinishColorPreview?: () => void;
  readonly onRequestColorSample?: (applyColor: (color: string) => void) => void;
  readonly onRememberColor: (color: string) => void;
}

export function StudioInspectorBubbleAppearanceControls({
  recentColors,
  documentColors = [],
  selected,
  webtoonTheme,
  onEnsureRecentColorsLoaded,
  onPatch,
  onPreviewPatch,
  onFinishColorPreview,
  onRequestColorSample,
  onRememberColor,
}: StudioInspectorBubbleAppearanceControlsProps) {
  const previewLineHeight =
    selected.lineHeight ??
    (selected.vertical
      ? 1.4
      : webtoonTheme === "soft"
        ? 1.35
        : webtoonTheme === "vivid"
          ? 1.2
          : 1.25);
  const autoShrinkFit = bubbleAutoShrinkPreview(selected, previewLineHeight);
  const previewAppearancePatch = onPreviewPatch ?? ((patch: BubbleAppearancePatch) => onPatch(patch));
  const lastStrokeRef = useRef({
    color: selected.stroke || "#16100c",
    width: selected.strokeWidth && selected.strokeWidth > 0 ? selected.strokeWidth : 3,
  });
  const lastShadowRef = useRef({
    color: selected.shadowColor || "#000000",
    blur: selected.shadowBlur ?? 6,
    offsetX: selected.shadowOffsetX ?? 2,
    offsetY: selected.shadowOffsetY ?? 3,
    opacity: selected.shadowOpacity ?? 0.15,
  });
  useEffect(() => {
    if (!selected.stroke) return;
    lastStrokeRef.current = {
      color: selected.stroke,
      width: selected.strokeWidth && selected.strokeWidth > 0 ? selected.strokeWidth : 3,
    };
  }, [selected.stroke, selected.strokeWidth]);
  useEffect(() => {
    if (selected.shadowColor === undefined) return;
    lastShadowRef.current = {
      color: selected.shadowColor || "#000000",
      blur: selected.shadowBlur ?? 6,
      offsetX: selected.shadowOffsetX ?? 2,
      offsetY: selected.shadowOffsetY ?? 3,
      opacity: selected.shadowOpacity ?? 0.15,
    };
  }, [
    selected.shadowBlur,
    selected.shadowColor,
    selected.shadowOffsetX,
    selected.shadowOffsetY,
    selected.shadowOpacity,
  ]);

  return (
    <>
      <div
        className="mt-2.5 rounded-2xl border border-line/45 bg-gradient-to-b from-card/70 to-canvas/20 p-2.5"
        data-studio-bubble-variant-picker="true"
      >
        <p className="mb-0.5 text-[0.72rem] font-semibold tracking-tight text-fg-2">
          모양 바꾸기
        </p>
        <p className="mb-2 text-[0.6rem] leading-snug text-fg-3">
          같은 대사이어도 말투만 바꿔 보면 분위기가 달라져요.
        </p>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {BUBBLE_VARIANTS.map((variant) => {
            const active = selected.variant === variant.id;
            return (
              <button
                key={variant.id}
                type="button"
                title={`${variant.label} — ${variant.hint}`}
                aria-pressed={active}
                onClick={() => onPatch({ variant: variant.id })}
                className={cn(
                  "flex flex-col items-stretch gap-0.5 rounded-xl border p-1.5 text-left transition-[border-color,background,transform,box-shadow] duration-150 ease-out",
                  active
                    ? "border-accent/50 bg-accent-soft/55 shadow-sm ring-1 ring-accent/25"
                    : "border-line/55 bg-card/80 hover:border-line-strong/50 hover:bg-raised"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg ring-1",
                    active
                      ? "bg-accent-soft/40 ring-accent/20"
                      : "bg-canvas/40 ring-line/30"
                  )}
                >
                  <StudioBubbleVariantGlyph
                    variant={variant.id}
                    className={cn("h-7 w-full", active ? "text-accent" : "text-fg-2")}
                  />
                </span>
                <span className="truncate text-center text-[0.58rem] font-semibold text-fg">
                  {variant.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Suspense fallback={<StudioPanelLoading label="말풍선 스타일을 여는 중..." />}>
        <StudioBubbleStylePresetPanel selected={selected} onApplyPreset={onPatch} />
      </Suspense>

      <div className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
        배경 투명
        <input
          type="checkbox"
          checked={selected.fill === "transparent"}
          aria-label="말풍선 배경 투명"
          onChange={(event) =>
            onPatch({ fill: event.currentTarget.checked ? "transparent" : "#ffffff" })
          }
          className="size-4 cursor-pointer accent-accent"
        />
      </div>

      {selected.fill !== "transparent" && (
        <div className="mt-2">
          <StudioColorField
            label="말풍선 색상"
            value={selected.fill}
            purpose="bubble-fill"
            recentColors={recentColors}
            documentColors={documentColors}
            onChange={(color) => onPatch({ fill: color ?? "#ffffff" })}
            onPreview={(color) => previewAppearancePatch({ fill: color }, `color:${selected.id}:fill`)}
            onUseColor={onRememberColor}
            onLoadRecentColors={onEnsureRecentColorsLoaded}
            onInteractionEnd={onFinishColorPreview}
            onRequestCanvasEyedropper={
              onRequestColorSample
                ? () =>
                    onRequestColorSample((color) => {
                      onPatch({ fill: color });
                      onRememberColor(color);
                    })
                : undefined
            }
          />
        </div>
      )}

      {selected.fill !== "transparent" && (
        <div className="mt-2.5 space-y-2 border-t border-line/40 pt-2.5">
          <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
            그라데이션 채우기
          </p>
          <Suspense fallback={<StudioPanelLoading label="그라데이션 패널을 여는 중..." />}>
            <StudioGradientEnginePanel
              value={selected.gradient ?? null}
              onChange={(gradient) => onPatch({ gradient: gradient ?? undefined })}
              title="말풍선 그라데이션"
            />
          </Suspense>
        </div>
      )}

      <div className="mt-2.5 space-y-2.5 border-t border-line/40 pt-2.5">
        <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
          테두리 설정
        </p>

        <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
          테두리 커스텀
          <input
            type="checkbox"
            checked={Boolean(selected.stroke)}
            aria-label="말풍선 테두리 커스텀"
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              if (!enabled && selected.stroke) {
                lastStrokeRef.current = {
                  color: selected.stroke,
                  width:
                    selected.strokeWidth && selected.strokeWidth > 0
                      ? selected.strokeWidth
                      : 3,
                };
              }
              onPatch({
                stroke: enabled ? lastStrokeRef.current.color : undefined,
                strokeWidth: enabled ? lastStrokeRef.current.width : undefined,
              });
            }}
            className="size-4 cursor-pointer accent-accent"
          />
        </div>

        {selected.stroke && (
          <>
            <StudioColorField
              label="테두리 색상"
              value={selected.stroke}
              purpose="bubble-stroke"
              recentColors={recentColors}
              documentColors={documentColors}
              onChange={(color) => onPatch({ stroke: color ?? undefined })}
              onPreview={(color) => previewAppearancePatch({ stroke: color }, `color:${selected.id}:stroke`)}
              onUseColor={onRememberColor}
              onLoadRecentColors={onEnsureRecentColorsLoaded}
              onInteractionEnd={onFinishColorPreview}
              onRequestCanvasEyedropper={
                onRequestColorSample
                  ? () =>
                      onRequestColorSample((color) => {
                        onPatch({ stroke: color });
                        onRememberColor(color);
                      })
                  : undefined
              }
            />

            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              테두리 두께
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="테두리 두께"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={selected.strokeWidth ?? 3}
                  onChange={(event) =>
                    onPatch({ strokeWidth: Number(event.currentTarget.value) })
                  }
                  className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                />
                <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                  {(selected.strokeWidth ?? 3).toFixed(1)}px
                </span>
              </span>
            </label>
          </>
        )}

        <div className="space-y-1.5 pt-0.5">
          <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
            외곽선 스타일
          </p>
          <div className="flex gap-1.5" role="group" aria-label="말풍선 외곽선 스타일">
            {BUBBLE_OUTLINE_STYLE_OPTIONS.map((option) => {
              const current = normalizeBubbleOutlineStyle(selected.outlineStyle);
              const active =
                option.id === "smooth" ? current === undefined : current === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  title={option.tip}
                  onClick={() =>
                    onPatch({
                      outlineStyle: option.id === "smooth" ? undefined : option.id,
                    })
                  }
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-[0.7rem] font-semibold transition-colors",
                    active
                      ? "border-accent/50 bg-accent-soft/55 text-accent ring-1 ring-accent/25"
                      : "border-line/55 bg-card/80 text-fg-2 hover:border-line-strong/50 hover:bg-raised"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[0.6rem] leading-snug text-fg-3">
            손그림 스타일은 외곽선을 결정적으로 흔들어 손맛을 더해요(기본 매끈은 벡터 그대로).
          </p>
        </div>
      </div>

      <Suspense fallback={<StudioPanelLoading label="텍스트 크기 고정 패널을 여는 중..." />}>
        <StudioBubbleAutoShrinkPanel
          enabled={Boolean(selected.autoShrinkText)}
          minFontSize={
            selected.autoShrinkMinFontSize ?? BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT
          }
          effectiveFontSize={autoShrinkFit ? Math.round(autoShrinkFit.fontSize) : null}
          overflow={autoShrinkFit?.overflow ?? false}
          onToggleEnabled={(enabled) => onPatch({ autoShrinkText: enabled })}
          onMinFontSizeChange={(fontSize) =>
            onPatch({ autoShrinkMinFontSize: fontSize })
          }
        />
      </Suspense>

      <div className="mt-2.5 space-y-2.5 border-t border-line/40 pt-2.5">
        <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
          말풍선 그림자 (Shadow)
        </p>

        <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
          그림자 사용
          <input
            type="checkbox"
            checked={selected.shadowColor !== undefined}
            aria-label="말풍선 그림자 사용"
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              if (!enabled && selected.shadowColor !== undefined) {
                lastShadowRef.current = {
                  color: selected.shadowColor || "#000000",
                  blur: selected.shadowBlur ?? 6,
                  offsetX: selected.shadowOffsetX ?? 2,
                  offsetY: selected.shadowOffsetY ?? 3,
                  opacity: selected.shadowOpacity ?? 0.15,
                };
              }
              onPatch({
                shadowColor: enabled ? lastShadowRef.current.color : undefined,
                shadowBlur: enabled ? lastShadowRef.current.blur : undefined,
                shadowOffsetX: enabled ? lastShadowRef.current.offsetX : undefined,
                shadowOffsetY: enabled ? lastShadowRef.current.offsetY : undefined,
                shadowOpacity: enabled ? lastShadowRef.current.opacity : undefined,
              });
            }}
            className="size-4 cursor-pointer accent-accent"
          />
        </div>

        {selected.shadowColor !== undefined && (
          <>
            <StudioColorField
              label="그림자 색상"
              value={selected.shadowColor ?? null}
              fallbackColor="#000000"
              purpose="shadow"
              recentColors={recentColors}
              documentColors={documentColors}
              onChange={(color) => onPatch({ shadowColor: color ?? undefined })}
              onPreview={(color) => previewAppearancePatch({ shadowColor: color }, `color:${selected.id}:shadow`)}
              onUseColor={onRememberColor}
              onLoadRecentColors={onEnsureRecentColorsLoaded}
              onInteractionEnd={onFinishColorPreview}
              onRequestCanvasEyedropper={
                onRequestColorSample
                  ? () =>
                      onRequestColorSample((color) => {
                        onPatch({ shadowColor: color });
                        onRememberColor(color);
                      })
                  : undefined
              }
            />

            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              흐림 정도 (Blur)
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="흐림 정도 (Blur)"
                  min={0}
                  max={24}
                  step={1}
                  value={selected.shadowBlur ?? 6}
                  onChange={(event) =>
                    onPatch({ shadowBlur: Number(event.currentTarget.value) })
                  }
                  className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                />
                <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                  {selected.shadowBlur ?? 6}px
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              가로 오프셋 (X)
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="가로 오프셋 (X)"
                  min={-15}
                  max={15}
                  step={1}
                  value={selected.shadowOffsetX ?? 2}
                  onChange={(event) =>
                    onPatch({ shadowOffsetX: Number(event.currentTarget.value) })
                  }
                  className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                />
                <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                  {selected.shadowOffsetX ?? 2}px
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              세로 오프셋 (Y)
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="세로 오프셋 (Y)"
                  min={-15}
                  max={15}
                  step={1}
                  value={selected.shadowOffsetY ?? 3}
                  onChange={(event) =>
                    onPatch({ shadowOffsetY: Number(event.currentTarget.value) })
                  }
                  className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                />
                <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                  {selected.shadowOffsetY ?? 3}px
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              불투명도
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="불투명도"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={selected.shadowOpacity ?? 0.15}
                  onChange={(event) =>
                    onPatch({ shadowOpacity: Number(event.currentTarget.value) })
                  }
                  className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                />
                <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                  {Math.round((selected.shadowOpacity ?? 0.15) * 100)}%
                </span>
              </span>
            </label>
          </>
        )}
      </div>
    </>
  );
}
