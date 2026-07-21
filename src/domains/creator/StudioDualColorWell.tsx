import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";
import { studioToolHintFromLabel } from "./studio-tool-hints";
import { StudioToolHintTarget } from "./StudioToolHint";

import { cn } from "@/lib/utils";

/* eslint-disable react-refresh/only-export-components -- typed hint contracts share this lazy UI boundary */

/** Exact rich-help contracts for the CSP-style foreground/background color well. */
export const STUDIO_DUAL_COLOR_WELL_HINTS = {
  primary: studioToolHintFromLabel(
    "주 색",
    "펜·도형·채우기에 바로 적용할 앞쪽 색입니다. 색상 칩을 눌러 시스템 색 선택기를 열어요.",
    undefined,
    "color-palette",
    "primary-color"
  ),
  secondary: studioToolHintFromLabel(
    "보조 색",
    "주 색과 빠르게 교체해 쓰는 뒤쪽 색입니다. 칩을 눌러 보조 색을 따로 지정할 수 있어요.",
    undefined,
    "color-palette",
    "secondary-color"
  ),
  swap: studioToolHintFromLabel(
    "주·보조 색 교체",
    "앞쪽 주 색과 뒤쪽 보조 색의 역할을 한 번에 맞바꿉니다.",
    "X",
    "color-palette",
    "swap-colors"
  ),
} as const;

/** CSP / Photopea-style primary + secondary color well with a bounded recent strip. */
export function StudioDualColorWell({
  primary,
  secondary,
  recent = [],
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  className,
}: {
  primary: string;
  secondary?: string;
  recent?: readonly string[];
  onPrimaryChange: (hex: string) => void;
  onSecondaryChange?: (hex: string) => void;
  onSwap?: () => void;
  className?: string;
}) {
  const showSecondary = Boolean(onSecondaryChange && secondary !== undefined);
  return (
    <div
      data-studio-dual-color-well="true"
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      role="group"
      aria-label="색상"
    >
      {recent.slice(0, 5).map((swatch, index) => {
        const isCurrentPrimary = primary.toLowerCase() === swatch.toLowerCase();
        return (
          <button
            key={`${swatch}-${index}`}
            type="button"
            data-studio-recent-color="true"
            data-studio-recent-color-current={isCurrentPrimary ? "true" : undefined}
            aria-label={
              isCurrentPrimary
                ? `최근 색 ${index + 1} ${swatch} · 현재 주 색`
                : `최근 색 ${index + 1} ${swatch} · 주 색으로 적용`
            }
            aria-pressed={isCurrentPrimary}
            onClick={() => onPrimaryChange(swatch)}
            className={cn(
              "size-5 rounded-md border shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.12)] transition-transform hover:scale-110 motion-reduce:transform-none",
              index >= 3 && "max-xl:hidden",
              STUDIO_FOCUS_RING,
              isCurrentPrimary
                ? "ring-2 ring-accent ring-offset-1 ring-offset-panel"
                : "border-line/70"
            )}
            style={{ background: swatch }}
          />
        );
      })}
      <div className="relative size-8 shrink-0" data-studio-color-stack="true">
        {showSecondary ? (
          <StudioToolHintTarget
            preferredSide="top"
            className="absolute bottom-0 right-0 size-[1.05rem]"
            hint={STUDIO_DUAL_COLOR_WELL_HINTS.secondary}
          >
            <label
              className="block size-full cursor-pointer overflow-hidden rounded border border-line shadow-md"
              style={{ background: secondary }}
            >
              <span className="sr-only">보조 색 선택 · 현재 {secondary}</span>
              <input
                type="color"
                value={secondary}
                onChange={(event) => onSecondaryChange?.(event.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label={`보조 색 선택 · 현재 ${secondary}`}
              />
            </label>
          </StudioToolHintTarget>
        ) : null}
        <StudioToolHintTarget
          preferredSide="top"
          className="absolute left-0 top-0 size-[1.35rem]"
          hint={STUDIO_DUAL_COLOR_WELL_HINTS.primary}
        >
          <label
            className="block size-full cursor-pointer overflow-hidden rounded-lg border border-line shadow-md ring-1 ring-black/10"
            style={{ background: primary }}
          >
            <span className="sr-only">주 색 선택 · 현재 {primary}</span>
            <input
              type="color"
              value={primary}
              onChange={(event) => onPrimaryChange(event.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              aria-label={`주 색 선택 · 현재 ${primary}`}
            />
          </label>
        </StudioToolHintTarget>
      </div>
      {onSwap && showSecondary ? (
        <StudioToolHintTarget preferredSide="top" hint={STUDIO_DUAL_COLOR_WELL_HINTS.swap}>
          <button
            type="button"
            onClick={onSwap}
            aria-label="주 색과 보조 색 교체"
            aria-keyshortcuts="X"
            data-studio-color-swap="true"
            className={cn(
              "grid size-7 place-items-center rounded-lg border border-line/80 bg-card/80 text-fg-3",
              "hover:border-line-strong hover:bg-raised hover:text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7 7h11M18 7l-3-3M18 7l-3 3M17 17H6M6 17l3-3M6 17l3 3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </StudioToolHintTarget>
      ) : null}
    </div>
  );
}
