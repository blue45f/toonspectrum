import type { Resizable } from "@/components/use-resizable";

import { cn } from "@/lib/utils";

export interface StudioPanelResizeHandleProps {
  readonly dragging: boolean;
  readonly handleProps: Resizable["handleProps"];
  readonly label: string;
}

/** Shared desktop splitter for the Studio page and inspector edge panels. */
export function StudioPanelResizeHandle({
  handleProps,
  dragging,
  label,
}: StudioPanelResizeHandleProps) {
  return (
    <div
      {...handleProps}
      aria-label={label}
      title={`${label} — 드래그·더블클릭(기본)·←/→`}
      className={cn(
        "group relative hidden w-2 shrink-0 cursor-col-resize select-none items-center justify-center self-stretch rounded-full transition-colors lg:flex",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        dragging ? "bg-accent/25" : "hover:bg-accent/15"
      )}
    >
      <span
        className={cn(
          "h-10 w-1 rounded-full transition-colors",
          dragging ? "bg-accent" : "bg-line group-hover:bg-accent/60"
        )}
      />
    </div>
  );
}
