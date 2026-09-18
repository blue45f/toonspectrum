import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Check, Smartphone } from "lucide-react";

import {
  STUDIO_WEBTOON_CANVAS_PRESETS,
  studioWebtoonCanvasMagicResizePreset,
} from "./studio-webtoon-canvas-presets";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

import type { MagicResizeCanvasSize, MagicResizePreset } from "./studio-magic-resize";
import type { ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface StudioWebtoonCanvasPresetPickerProps {
  currentSize?: MagicResizeCanvasSize;
  disabled?: boolean;
  onApplyPreset: (preset: MagicResizePreset) => void;
}

function matchesPlatformAspect(
  currentSize: MagicResizeCanvasSize | undefined,
  targetWidth: number,
  targetHeight: number,
): boolean {
  if (!currentSize || currentSize.width <= 0 || currentSize.height <= 0) return false;
  const expectedHeight = Math.round((currentSize.width * targetHeight) / targetWidth);
  return Math.abs(currentSize.height - expectedHeight) <= 1;
}

export function StudioWebtoonCanvasPresetPicker({
  currentSize,
  disabled = false,
  onApplyPreset,
}: StudioWebtoonCanvasPresetPickerProps): ReactElement {
  const language = useI18n((state) => state.lang);
  const korean = language.toLocaleLowerCase().startsWith("ko");

  return (
    <section data-studio-webtoon-canvas-presets="true">
      <div className="mb-1.5">
        <p className="text-[0.68rem] font-bold text-fg">
          {korean ? translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "ko", "웹툰 플랫폼 규격") : translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "en", "Webtoon platform sizes")}
        </p>
        <p className="mt-0.5 text-[0.6rem] leading-snug text-fg-3">
          {korean
            ? translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "ko", "현재 원고의 비율을 바꾸고, 선택한 내용 맞춤 방식으로 요소를 재배치합니다.")
            : translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "en", "Resize the current work and reflow its content with the selected strategy.")}
        </p>
      </div>

      <div
        role="group"
        aria-label={korean ? translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "ko", "웹툰 플랫폼 규격") : translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "en", "Webtoon platform sizes")}
        className="grid grid-cols-2 gap-1.5"
      >
        {STUDIO_WEBTOON_CANVAS_PRESETS.map((preset) => {
          const active = matchesPlatformAspect(currentSize, preset.width, preset.height);
          const label = korean ? preset.guideLabelKo : preset.labelEn.split(" · ")[0]!;
          const applyLabel = korean
            ? `${label} ${preset.width} × ${preset.height}px 규격 적용`
            : `Apply ${label} ${preset.width} × ${preset.height}px`;
          return (
            <button
              key={preset.id}
              type="button"
              data-studio-webtoon-canvas-preset={preset.id}
              disabled={disabled}
              aria-label={applyLabel}
              aria-pressed={active}
              title={korean ? preset.labelKo : preset.labelEn}
              onClick={() => onApplyPreset(studioWebtoonCanvasMagicResizePreset(preset))}
              className={cn(
                "relative flex min-h-14 items-center gap-2 rounded-xl border px-2 py-2 text-left",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:border-accent/40 hover:bg-raised hover:text-fg",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg",
                active ? "bg-accent text-on-accent" : "bg-raised text-fg-3",
              )}>
                {active ? <Check size={14} aria-hidden /> : <Smartphone size={14} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.66rem] font-bold">{label}</span>
                <span className="block text-[0.56rem] tabular-nums text-fg-3">
                  {preset.width.toLocaleString()} × {preset.height.toLocaleString()}px
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[0.56rem] leading-snug text-fg-3">
        {korean
          ? translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "ko", "편집 폭 720px을 유지하면서 목표 플랫폼의 가로세로 비율을 높이에 반영합니다. 변경은 한 번의 실행취소로 되돌릴 수 있어요.")
          : translateCurrentStaticSourceText("domains.creator.StudioWebtoonCanvasPresetPicker", "en", "The editor keeps its 720px working width and maps the target aspect ratio to canvas height. One undo restores the previous size.")}
      </p>
    </section>
  );
}
