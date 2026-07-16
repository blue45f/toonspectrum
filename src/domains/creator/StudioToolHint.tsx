/**
 * Lightweight interaction shell for Studio motion-coach hints.
 * The rich bubble and animated previews are prefetched on intent and remain
 * outside the editor's startup graph.
 */
import {
  Fragment,
  Suspense,
  cloneElement,
  isValidElement,
  lazy,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { StudioToolHintBubbleProps } from "./components/StudioToolHintBubble";
import type { StudioToolHintSide } from "./studio-tool-hint-position";
import type { StudioToolHintSpec } from "./studio-tool-hints";

import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 280;
const EXPAND_DELAY_MS = 620;
// Long enough to cross the visual gap from the target into the portal bubble.
// Entering the bubble cancels this timer, satisfying hoverable-content accessibility.
const HIDE_DELAY_MS = 280;
const FALLBACK_WIDTH = 240;
const FALLBACK_HEIGHT = 92;
const FALLBACK_GAP = 10;
const VIEWPORT_PADDING = 10;
const TOUCH_HOLD_DELAY_MS = 480;

// Selecting a tool can synchronously replace its control while the pointer is
// still parked over it. This guard survives that remount and stays armed until
// the pointer physically moves (or keyboard focus deliberately takes over).
let suppressedPointerHintAt: Readonly<{ x: number; y: number }> | null = null;
let clearPointerSuppressionListener: (() => void) | null = null;

function clearPointerSuppression() {
  clearPointerSuppressionListener?.();
  clearPointerSuppressionListener = null;
  suppressedPointerHintAt = null;
}

function armPointerSuppression(x: number, y: number) {
  clearPointerSuppression();
  suppressedPointerHintAt = { x, y };
  function onPointerMove(event: PointerEvent) {
    if (!suppressedPointerHintAt) return;
    if (Math.hypot(event.clientX - suppressedPointerHintAt.x, event.clientY - suppressedPointerHintAt.y) <= 6) {
      return;
    }
    clearPointerSuppression();
  }
  globalThis.addEventListener("pointermove", onPointerMove, true);
  clearPointerSuppressionListener = () =>
    globalThis.removeEventListener("pointermove", onPointerMove, true);
}

let studioToolHintBubbleModulePromise:
  | Promise<typeof import("./components/StudioToolHintBubble")>
  | null = null;

function loadStudioToolHintBubbleModule() {
  studioToolHintBubbleModulePromise ??= import("./components/StudioToolHintBubble");
  return studioToolHintBubbleModulePromise;
}

const LazyStudioToolHintBubble = lazy(async () => ({
  default: (await loadStudioToolHintBubbleModule()).StudioToolHintBubble,
}));

type DescribedChildProps = {
  "aria-describedby"?: string;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function compactFallbackStyle(
  anchor: DOMRect,
  preferredSide: StudioToolHintSide | undefined
): CSSProperties {
  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;
  const side = preferredSide ?? (anchor.bottom > viewportHeight * 0.72 ? "top" : "right");
  let left = anchor.right + FALLBACK_GAP;
  let top = anchor.top + anchor.height / 2 - FALLBACK_HEIGHT / 2;
  if (side === "left") left = anchor.left - FALLBACK_GAP - FALLBACK_WIDTH;
  if (side === "bottom" || side === "top") {
    left = anchor.left + anchor.width / 2 - FALLBACK_WIDTH / 2;
    top = side === "bottom"
      ? anchor.bottom + FALLBACK_GAP
      : anchor.top - FALLBACK_GAP - FALLBACK_HEIGHT;
  }
  return {
    left: clamp(left, VIEWPORT_PADDING, viewportWidth - FALLBACK_WIDTH - VIEWPORT_PADDING),
    top: clamp(top, VIEWPORT_PADDING, viewportHeight - FALLBACK_HEIGHT - VIEWPORT_PADDING),
  };
}

function StudioToolHintCompactFallback({
  id,
  hint,
  anchor,
  preferredSide,
  onMouseEnter,
  onMouseLeave,
}: Pick<
  StudioToolHintBubbleProps,
  "id" | "hint" | "anchor" | "preferredSide" | "onMouseEnter" | "onMouseLeave"
>): ReactElement {
  return (
    <div
      id={id}
      role="tooltip"
      data-studio-tool-hint="true"
      data-studio-tool-hint-expanded="false"
      data-studio-tool-hint-loading="true"
      className="pointer-events-auto fixed z-[200] w-[min(15rem,calc(100vw-1.25rem))] rounded-lg border border-line/80 bg-panel/98 p-2.5 text-left shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)] backdrop-blur-xl"
      style={compactFallbackStyle(anchor as DOMRect, preferredSide)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[0.78rem] font-bold leading-tight text-fg">{hint.title}</p>
        {hint.shortcut ? (
          <kbd className="shrink-0 rounded-md border border-line/70 bg-canvas/75 px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2">
            {hint.shortcut}
          </kbd>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[0.68rem] leading-relaxed text-fg-2">{hint.description}</p>
    </div>
  );
}

/**
 * Wraps a tool control and provides pointer, keyboard, touch-focus, viewport
 * repositioning, Escape dismissal, and an exact ARIA description relation.
 */
export function StudioToolHintTarget({
  hint,
  children,
  className,
  disabled,
  preferredSide,
}: {
  hint: StudioToolHintSpec | null | undefined;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  preferredSide?: StudioToolHintSide;
}): ReactElement {
  const tipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number>(0);
  const expandTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);
  const touchHoldTimer = useRef<number>(0);
  const touchHoldOpened = useRef(false);
  const pointerDismissed = useRef(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  function clearTimers() {
    if (showTimer.current) globalThis.clearTimeout(showTimer.current);
    if (expandTimer.current) globalThis.clearTimeout(expandTimer.current);
    if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
    if (touchHoldTimer.current) globalThis.clearTimeout(touchHoldTimer.current);
    showTimer.current = 0;
    expandTimer.current = 0;
    hideTimer.current = 0;
    touchHoldTimer.current = 0;
  }

  function hideRenderedTooltipImmediately() {
    if (typeof document === "undefined") return;
    const rendered = document.getElementById(tipId);
    if (rendered?.matches('[data-studio-tool-hint="true"]')) rendered.hidden = true;
  }

  function readAnchor(): DOMRect | null {
    const el = wrapRef.current;
    return el ? el.getBoundingClientRect() : null;
  }

  function reveal(expandImmediately: boolean) {
    if (disabled || !hint) return;
    void loadStudioToolHintBubbleModule();
    if (hideTimer.current) {
      globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }
    const nextAnchor = readAnchor();
    if (!nextAnchor) return;
    setAnchor(nextAnchor);
    setOpen(true);
    if (expandImmediately) {
      setExpanded(true);
      return;
    }
    if (expandTimer.current) globalThis.clearTimeout(expandTimer.current);
    expandTimer.current = globalThis.setTimeout(() => {
      setExpanded(true);
      expandTimer.current = 0;
    }, EXPAND_DELAY_MS) as unknown as number;
  }

  function scheduleShow() {
    if (disabled || !hint) return;
    if (suppressedPointerHintAt) return;
    void loadStudioToolHintBubbleModule();
    if (hideTimer.current) {
      globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }
    if (open) {
      reveal(false);
      return;
    }
    if (showTimer.current) globalThis.clearTimeout(showTimer.current);
    showTimer.current = globalThis.setTimeout(() => {
      reveal(false);
      showTimer.current = 0;
    }, SHOW_DELAY_MS) as unknown as number;
  }

  function scheduleHide() {
    if (showTimer.current) globalThis.clearTimeout(showTimer.current);
    if (expandTimer.current) globalThis.clearTimeout(expandTimer.current);
    showTimer.current = 0;
    expandTimer.current = 0;
    if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
    hideTimer.current = globalThis.setTimeout(() => {
      setOpen(false);
      setExpanded(false);
      hideTimer.current = 0;
    }, HIDE_DELAY_MS) as unknown as number;
  }

  function keepOpenFromBubble() {
    if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
    hideTimer.current = 0;
  }

  function leaveBubble() {
    pointerDismissed.current = false;
    scheduleHide();
  }

  function dismissPointerActivation(
    event?: Pick<ReactPointerEvent<HTMLSpanElement>, "clientX" | "clientY">
  ) {
    // A pointer activation moves focus to the control immediately after
    // pointerdown. Keep that synthetic focus transition from reopening the
    // coach under the user's cursor; leaving the target re-arms hover/focus.
    pointerDismissed.current = true;
    armPointerSuppression(event?.clientX ?? 0, event?.clientY ?? 0);
    touchHoldOpened.current = false;
    hideRenderedTooltipImmediately();
    clearTimers();
    setOpen(false);
    setExpanded(false);
  }

  function handlePointerDownCapture(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "touch") {
      dismissPointerActivation(event);
      return;
    }

    clearTimers();
    hideRenderedTooltipImmediately();
    pointerDismissed.current = true;
    armPointerSuppression(event.clientX, event.clientY);
    touchHoldOpened.current = false;
    setOpen(false);
    setExpanded(false);
    void loadStudioToolHintBubbleModule();
    touchHoldTimer.current = globalThis.setTimeout(() => {
      touchHoldTimer.current = 0;
      touchHoldOpened.current = true;
      pointerDismissed.current = false;
      clearPointerSuppression();
      reveal(true);
    }, TOUCH_HOLD_DELAY_MS) as unknown as number;
  }

  function handlePointerUpCapture(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "touch") return;
    if (touchHoldTimer.current) {
      globalThis.clearTimeout(touchHoldTimer.current);
      touchHoldTimer.current = 0;
    }
    // A completed long-press is a tooltip-only gesture. Keep the coach visible
    // after release so it can actually be read; the following synthetic click
    // is consumed below, and outside tap/Escape dismisses the coach.
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLSpanElement>) {
    if (touchHoldOpened.current) {
      touchHoldOpened.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    dismissPointerActivation(event);
  }

  function handlePointerCancelCapture(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "touch") return;
    clearTimers();
    hideRenderedTooltipImmediately();
    touchHoldOpened.current = false;
    pointerDismissed.current = false;
    clearPointerSuppression();
    setOpen(false);
    setExpanded(false);
  }

  function handleFocus(event: React.FocusEvent<HTMLSpanElement>) {
    if (
      pointerDismissed.current ||
      suppressedPointerHintAt !== null
    ) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(":focus-visible")) {
      pointerDismissed.current = false;
      clearPointerSuppression();
      reveal(true);
    }
  }

  function handleMouseLeave(event: ReactMouseEvent<HTMLSpanElement>) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      // Switching the active tool can replace descendants and synthesize a
      // mouseleave even though the physical pointer never left the hit target.
      return;
    }
    pointerDismissed.current = false;
    scheduleHide();
  }

  function handleBlur() {
    pointerDismissed.current = false;
    scheduleHide();
  }

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    function updatePosition() {
      globalThis.cancelAnimationFrame?.(frame);
      frame = globalThis.requestAnimationFrame?.(() => {
        const nextAnchor = readAnchor();
        if (nextAnchor) setAnchor(nextAnchor);
      }) ?? 0;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      clearTimers();
      setOpen(false);
      setExpanded(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      const activatedHintTarget =
        target instanceof Element && target.closest('[data-studio-tool-hint-target="true"]');
      pointerDismissed.current = Boolean(activatedHintTarget);
      if (activatedHintTarget) armPointerSuppression(event.clientX, event.clientY);
      else clearPointerSuppression();
      const rendered = typeof document === "undefined" ? null : document.getElementById(tipId);
      if (rendered?.matches('[data-studio-tool-hint="true"]')) rendered.hidden = true;
      clearTimers();
      setOpen(false);
      setExpanded(false);
    }
    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      globalThis.cancelAnimationFrame?.(frame);
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, tipId]);

  if (!hint || disabled) {
    return <span className={cn("inline-flex", className)}>{children}</span>;
  }

  const canDescribeChild = isValidElement<DescribedChildProps>(children) && children.type !== Fragment;
  const describedChildren =
    open && canDescribeChild
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], tipId].filter(Boolean).join(" "),
        })
      : children;
  const needsWrapperDescription = open && !canDescribeChild;

  return (
    <span
      ref={wrapRef}
      data-studio-tool-hint-target="true"
      className={cn("relative inline-flex", className)}
      onMouseEnter={scheduleShow}
      onMouseLeave={handleMouseLeave}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerCancelCapture}
      onClickCapture={handleClickCapture}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={needsWrapperDescription ? tipId : undefined}
    >
      {describedChildren}
      {open && !suppressedPointerHintAt && anchor && typeof document !== "undefined"
        ? createPortal(
            <Suspense
              fallback={(
                <StudioToolHintCompactFallback
                  id={tipId}
                  hint={hint}
                  anchor={anchor}
                  preferredSide={preferredSide}
                  onMouseEnter={keepOpenFromBubble}
                  onMouseLeave={leaveBubble}
                />
              )}
            >
              <LazyStudioToolHintBubble
                id={tipId}
                hint={hint}
                anchor={anchor}
                expanded={expanded}
                preferredSide={preferredSide}
                onMouseEnter={keepOpenFromBubble}
                onMouseLeave={leaveBubble}
              />
            </Suspense>,
            document.body
          )
        : null}
    </span>
  );
}
