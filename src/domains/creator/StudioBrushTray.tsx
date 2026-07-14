/**
 * StudioBrushTray — Picsart/Adobe Express inspired visual brush strip.
 * Icon + stroke preview + short label; beginner kit first, expandable expressive set.
 * Pure presentation.
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  listStudioBrushTrayItems,
  type StudioBrushTrayItem,
} from "./studio-creative-ux";
import { STUDIO_FOCUS_RING, STUDIO_EASE } from "./studio-panel-ui";

import { cn } from "@/lib/utils";

export interface StudioBrushTrayProps {
  activeBrushId: string;
  onSelect: (item: StudioBrushTrayItem) => void;
  /** simple density → beginner only until expanded */
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}

function BrushPreviewStroke({ weight, active }: { weight: number; active: boolean }): ReactElement {
  const h = Math.max(2, Math.round(weight * 10));
  return (
    <span
      aria-hidden
      className={cn(
        "block w-7 rounded-full",
        active ? "bg-on-accent/90" : "bg-fg-2/80"
      )}
      style={{ height: h }}
    />
  );
}

export function StudioBrushTray({
  activeBrushId,
  onSelect,
  compact = false,
  className,
  "aria-label": ariaLabel = "브러시 키트",
}: StudioBrushTrayProps): ReactElement {
  const [expanded, setExpanded] = useState(!compact);
  const beginner = listStudioBrushTrayItems("beginner");
  const expressive = listStudioBrushTrayItems("expressive");
  const visible = expanded ? [...beginner, ...expressive] : beginner;

  return (
    <div
      data-studio-brush-tray="true"
      className={cn("flex min-w-0 max-w-full items-center gap-1", className)}
    >
      <div
        role="listbox"
        aria-label={ariaLabel}
        className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((item) => {
          const active = activeBrushId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              title={`${item.name} — ${item.hint}`}
              onClick={() => onSelect(item)}
              className={cn(
                "flex h-9 min-w-[2.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent/60 bg-accent text-on-accent shadow-sm"
                  : "border-line/70 bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
              )}
            >
              <BrushPreviewStroke weight={item.previewWeight} active={active} />
              <span className="text-[0.58rem] font-bold leading-none">{item.shortName}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={expanded ? "기본 브러시만 보기" : "수채·에어브러시 등 확장 브러시 보기"}
        aria-label={expanded ? "브러시 키트 접기" : "브러시 키트 펼치기"}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border border-line bg-card text-fg-3",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          "hover:bg-raised hover:text-fg"
        )}
      >
        {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
    </div>
  );
}
