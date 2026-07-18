import { useStudioBottomSheetGesture } from "./useStudioBottomSheetGesture";

import type { RefObject } from "react";

import { cn } from "@/lib/utils";

export type StudioMobileSheetKind = "pages" | "props" | "draw" | "brushes";

interface StudioMobileSheetHandleProps {
  active: boolean;
  className?: string;
  kind: StudioMobileSheetKind;
  label: string;
  onDismiss: () => void;
  sheetRef: RefObject<HTMLElement | null>;
}

/**
 * Shared 44px grabber for Studio's mobile sheets. A tap is a conventional close action; dragging
 * down follows the user's pointer and dismisses after the gesture threshold. Only this handle
 * disables native touch panning, so every content scrollport keeps its normal momentum scroll.
 */
export function StudioMobileSheetHandle({
  active,
  className,
  kind,
  label,
  onDismiss,
  sheetRef,
}: StudioMobileSheetHandleProps) {
  const { handleProps } = useStudioBottomSheetGesture({
    activeKey: active ? kind : null,
    ariaLabel: `${label} 닫기 — 아래로 밀거나 눌러 닫기`,
    onDismiss,
    sheetRef,
  });

  return (
    <button
      {...handleProps}
      data-studio-sheet-kind={kind}
      tabIndex={active ? undefined : -1}
      title={`${label} 닫기`}
      className={cn(
        "group relative flex min-h-11 w-full shrink-0 cursor-grab select-none items-start justify-center rounded-xl pt-2 active:cursor-grabbing",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        "lg:hidden",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-1 w-10 rounded-full bg-line-strong shadow-[0_1px_0_oklch(0.97_0.01_85/0.05)] transition-[width,background-color] duration-150 group-hover:w-12 group-hover:bg-fg-3 group-focus-visible:w-12 group-focus-visible:bg-accent motion-reduce:transition-none"
      />
    </button>
  );
}
