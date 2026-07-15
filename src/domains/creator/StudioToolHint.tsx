/**
 * Magma-style rich tool tooltip — title, description body, optional shortcut badge.
 * Delayed hover; portals to body so rail overflow cannot clip it.
 */
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { StudioToolHintSpec } from "./studio-tool-hints";

import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 380;
const HIDE_DELAY_MS = 80;

export function StudioToolHintBubble({
  hint,
  anchor,
  className,
}: {
  hint: StudioToolHintSpec;
  anchor: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;
  className?: string;
}): ReactElement {
  // Prefer right of rail; flip if near viewport edge.
  const vw = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const vh = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;
  const left = Math.min(vw - 280, Math.max(8, anchor.right + 10));
  const top = Math.min(vh - 120, Math.max(8, anchor.top + anchor.height / 2 - 28));

  return (
    <div
      role="tooltip"
      data-studio-tool-hint="true"
      id={`studio-hint-${hint.id}`}
      className={cn(
        "pointer-events-none fixed z-[200] w-[16.5rem] rounded-xl border border-line/80",
        "bg-panel/98 px-3 py-2.5 shadow-2xl backdrop-blur-md",
        "animate-in fade-in zoom-in-95 duration-150",
        className
      )}
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.78rem] font-bold leading-tight text-fg">{hint.title}</p>
        {hint.shortcut ? (
          <kbd
            data-studio-kbd="true"
            className="shrink-0 rounded-md border border-line/70 bg-canvas/60 px-1.5 py-0.5 text-[0.58rem] font-semibold tabular-nums text-fg-3"
          >
            {hint.shortcut}
          </kbd>
        ) : null}
      </div>
      <p className="mt-1.5 text-[0.68rem] leading-relaxed text-fg-2">{hint.description}</p>
    </div>
  );
}

/**
 * Wraps a control and shows Magma-class detail tooltip after hover dwell.
 * Keeps native title empty when rich hint is provided to avoid double tooltips.
 */
export function StudioToolHintTarget({
  hint,
  children,
  className,
  disabled,
}: {
  hint: StudioToolHintSpec | null | undefined;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  const tipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    return () => {
      if (showTimer.current) globalThis.clearTimeout(showTimer.current);
      if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!hint || disabled) {
    return <span className={cn("inline-flex", className)}>{children}</span>;
  }

  function scheduleShow() {
    if (hideTimer.current) {
      globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }
    if (showTimer.current) globalThis.clearTimeout(showTimer.current);
    showTimer.current = globalThis.setTimeout(() => {
      const el = wrapRef.current;
      if (!el) return;
      setAnchor(el.getBoundingClientRect());
      setOpen(true);
    }, SHOW_DELAY_MS) as unknown as number;
  }

  function scheduleHide() {
    if (showTimer.current) {
      globalThis.clearTimeout(showTimer.current);
      showTimer.current = 0;
    }
    if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
    hideTimer.current = globalThis.setTimeout(() => {
      setOpen(false);
    }, HIDE_DELAY_MS) as unknown as number;
  }

  return (
    <span
      ref={wrapRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <StudioToolHintBubble
              hint={{ ...hint, id: tipId }}
              anchor={anchor}
            />,
            document.body
          )
        : null}
    </span>
  );
}
