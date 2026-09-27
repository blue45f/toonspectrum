/**
 * Character Shaper — mobile bottom sheet (shelf + inspector) with three snap states.
 *
 * The grabber reuses the studio's compositor-only sheet gesture (`useStudioBottomSheetGesture`):
 * drag up/down to step between collapsed / half / full, tap to cycle, ArrowUp / ArrowDown on the
 * keyboard. The sheet lives in normal flow under the viewport, so it never hides the model
 * completely; the dialog decides whether the background needs to be inert.
 */
import { useId, useRef } from "react";

import { useStudioBottomSheetGesture } from "../useStudioBottomSheetGesture";

import {
  characterSheetStateIndex,
  characterSheetStateLabel,
  collapseCharacterSheet,
  cycleCharacterSheet,
  expandCharacterSheet,
} from "./character-shaper-ui-model";

import type { CharacterShaperMobileSheetProps } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";

export function CharacterShaperMobileSheet({ state, onStateChange, title, header, children }: CharacterShaperMobileSheetProps) {
  const contentId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const stateLabel = characterSheetStateLabel(state);
  const { handleProps } = useStudioBottomSheetGesture({
    activeKey: "character-shaper",
    ariaLabel: `${title} 시트 높이 — 현재 ${stateLabel}. 위아래로 밀거나 눌러 크기 전환`,
    onActivate: () => onStateChange(cycleCharacterSheet(state)),
    onCollapse: () => onStateChange(collapseCharacterSheet(state)),
    onDismiss: () => onStateChange("collapsed"),
    onExpand: () => onStateChange(expandCharacterSheet(state)),
    onKeyboardCollapse: () => onStateChange(collapseCharacterSheet(state)),
    sheetRef,
  });
  const collapsed = state === "collapsed";
  const snapIndex = characterSheetStateIndex(state);

  return (
    <section
      ref={sheetRef}
      aria-label={title}
      data-character-shaper-sheet={state}
      className={cn(
        "relative flex min-h-0 w-full shrink flex-col rounded-t-2xl border-t border-line bg-panel",
        "shadow-[0_-12px_32px_oklch(0.05_0.01_70/0.35)] transition-[height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
      )}
    >
      <div data-character-shaper-sheet-header="true">
      <button
        {...handleProps}
        data-character-shaper-sheet-handle={header ? "compact" : "true"}
        role="slider"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={snapIndex}
        aria-valuetext={`시트 높이 ${stateLabel}`}
        title={`${title} 크기 전환 (현재 ${stateLabel})`}
        className={cn(
          "group relative flex min-h-11 w-full shrink-0 cursor-grab select-none items-center justify-center gap-2 rounded-t-2xl py-1 active:cursor-grabbing",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        )}
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full bg-line-strong transition-[width,background-color] duration-150 group-hover:w-12 group-hover:bg-fg-3 group-focus-visible:w-12 group-focus-visible:bg-accent motion-reduce:transition-none"
        />
        {/* 세 단계 스냅 위치를 눈으로 확인하게 한다. collapsed/half/full 한 칸씩 채워진다. */}
        <span aria-hidden data-character-shaper-sheet-snaps="true" className="flex items-center gap-1">
          {[0, 1, 2].map((step) => (
            <span
              key={step}
              data-character-shaper-sheet-snap={step <= snapIndex ? "on" : "off"}
              className="h-1 w-1 rounded-full bg-line-strong transition-colors duration-150 motion-reduce:transition-none"
            />
          ))}
        </span>
        <span className={header ? "sr-only" : "min-w-0 truncate text-[0.75rem] font-semibold text-fg"}>{title}</span>
      </button>
      {header}
        <div data-character-quality-launcher="true" className="shrink-0" />
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => onStateChange(collapsed ? "half" : "collapsed")}
          className={cn(
            // 펼치기/접기는 글자 수가 달라 폭이 흔들린다. 고정 폭으로 헤더가 안정된다.
            "inline-flex min-h-11 w-16 shrink-0 items-center justify-center rounded-lg px-2 text-[0.68rem] font-semibold text-fg-3 hover:bg-raised hover:text-fg",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          )}
        >
          {collapsed ? "펼치기" : "접기"}
        </button>
      </div>
      <div
        id={contentId}
        data-character-shaper-sheet-safe-area="true"
        hidden={collapsed}
        className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        {children}
      </div>
    </section>
  );
}
