import { useEffect, useRef } from "react";

import { StudioColorField } from "./StudioColorField";

import type { BubbleEl } from "./studio-element-model";

type BubbleShadowPatch = Partial<
  Pick<
    BubbleEl,
    | "shadowColor"
    | "shadowBlur"
    | "shadowOffsetX"
    | "shadowOffsetY"
    | "shadowOpacity"
  >
>;

export interface StudioInspectorBubbleShadowControlsProps {
  readonly selected: BubbleEl;
  readonly recentColors: readonly string[];
  readonly documentColors: readonly string[];
  readonly onEnsureRecentColorsLoaded: () => void;
  readonly onPatch: (patch: BubbleShadowPatch) => void;
  readonly onPreviewPatch: (patch: BubbleShadowPatch, key: string) => void;
  readonly onFinishColorPreview?: () => void;
  readonly onRequestColorSample?: (applyColor: (color: string) => void) => void;
  readonly onRememberColor: (color: string) => void;
}

export function StudioInspectorBubbleShadowControls({
  selected,
  recentColors,
  documentColors,
  onEnsureRecentColorsLoaded,
  onPatch,
  onPreviewPatch,
  onFinishColorPreview,
  onRequestColorSample,
  onRememberColor,
}: StudioInspectorBubbleShadowControlsProps) {
  const lastShadowRef = useRef({
    color: selected.shadowColor || "#000000",
    blur: selected.shadowBlur ?? 6,
    offsetX: selected.shadowOffsetX ?? 2,
    offsetY: selected.shadowOffsetY ?? 3,
    opacity: selected.shadowOpacity ?? 0.15,
  });

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

      {selected.shadowColor !== undefined ? (
        <>
          <StudioColorField
            label="그림자 색상"
            value={selected.shadowColor ?? null}
            fallbackColor="#000000"
            purpose="shadow"
            recentColors={recentColors}
            documentColors={documentColors}
            onChange={(color) => onPatch({ shadowColor: color ?? undefined })}
            onPreview={(color) => onPreviewPatch({ shadowColor: color }, "shadow")}
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

          <ShadowRange
            label="흐림 정도 (Blur)"
            min={0}
            max={24}
            step={1}
            value={selected.shadowBlur ?? 6}
            readout={`${selected.shadowBlur ?? 6}px`}
            onChange={(value) => onPatch({ shadowBlur: value })}
          />
          <ShadowRange
            label="가로 오프셋 (X)"
            min={-15}
            max={15}
            step={1}
            value={selected.shadowOffsetX ?? 2}
            readout={`${selected.shadowOffsetX ?? 2}px`}
            onChange={(value) => onPatch({ shadowOffsetX: value })}
          />
          <ShadowRange
            label="세로 오프셋 (Y)"
            min={-15}
            max={15}
            step={1}
            value={selected.shadowOffsetY ?? 3}
            readout={`${selected.shadowOffsetY ?? 3}px`}
            onChange={(value) => onPatch({ shadowOffsetY: value })}
          />
          <ShadowRange
            label="불투명도"
            min={0.05}
            max={1}
            step={0.05}
            value={selected.shadowOpacity ?? 0.15}
            readout={`${Math.round((selected.shadowOpacity ?? 0.15) * 100)}%`}
            onChange={(value) => onPatch({ shadowOpacity: value })}
          />
        </>
      ) : null}
    </div>
  );
}

function ShadowRange({
  label,
  min,
  max,
  step,
  value,
  readout,
  onChange,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly readout: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
        />
        <span className="w-8 text-right text-xs tabular-nums text-fg-3">
          {readout}
        </span>
      </span>
    </label>
  );
}
