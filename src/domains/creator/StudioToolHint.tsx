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
  "aria-hidden"?: boolean;
  tabIndex?: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function removeAriaDescription(target: HTMLElement, descriptionId: string) {
  const descriptions = (target.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter((id) => id && id !== descriptionId);
  if (descriptions.length > 0) target.setAttribute("aria-describedby", descriptions.join(" "));
  else target.removeAttribute("aria-describedby");
}

function compactFallbackStyle(
  anchor: DOMRect,
  preferredSide: StudioToolHintSide | undefined,
  hasUnavailableReason: boolean
): CSSProperties {
  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;
  const fallbackHeight = hasUnavailableReason ? 124 : FALLBACK_HEIGHT;
  const side = preferredSide ?? (anchor.bottom > viewportHeight * 0.72 ? "top" : "right");
  let left = anchor.right + FALLBACK_GAP;
  let top = anchor.top + anchor.height / 2 - fallbackHeight / 2;
  if (side === "left") left = anchor.left - FALLBACK_GAP - FALLBACK_WIDTH;
  if (side === "bottom" || side === "top") {
    left = anchor.left + anchor.width / 2 - FALLBACK_WIDTH / 2;
    top = side === "bottom"
      ? anchor.bottom + FALLBACK_GAP
      : anchor.top - FALLBACK_GAP - fallbackHeight;
  }
  return {
    left: clamp(left, VIEWPORT_PADDING, viewportWidth - FALLBACK_WIDTH - VIEWPORT_PADDING),
    top: clamp(top, VIEWPORT_PADDING, viewportHeight - fallbackHeight - VIEWPORT_PADDING),
  };
}

function StudioToolHintCompactFallback({
  id,
  hint,
  anchor,
  unavailableReason,
  preferredSide,
  onMouseEnter,
  onMouseLeave,
}: Pick<
  StudioToolHintBubbleProps,
  | "id"
  | "hint"
  | "anchor"
  | "unavailableReason"
  | "preferredSide"
  | "onMouseEnter"
  | "onMouseLeave"
>): ReactElement {
  return (
    <div
      id={id}
      role="tooltip"
      data-studio-tool-hint="true"
      data-studio-tool-hint-expanded="false"
      data-studio-tool-hint-loading="true"
      className="pointer-events-auto fixed z-[200] w-[min(15rem,calc(100vw-1.25rem))] rounded-lg border border-line/80 bg-panel/98 p-2.5 text-left shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)] backdrop-blur-xl"
      style={compactFallbackStyle(anchor as DOMRect, preferredSide, Boolean(unavailableReason))}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[0.8125rem] font-bold leading-tight text-fg">{hint.title}</p>
        {hint.shortcut ? (
          <kbd className="shrink-0 rounded-md border border-line/70 bg-canvas/75 px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2">
            {hint.shortcut}
          </kbd>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-fg-2">{hint.description}</p>
      {unavailableReason ? (
        <div
          data-studio-tool-hint-unavailable="true"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-warn/35 bg-warn/10 px-2 py-1.5 text-[0.7rem] leading-relaxed"
        >
          <span className="shrink-0 font-bold text-warn">사용 조건</span>
          <span className="min-w-0 text-fg-2">{unavailableReason}</span>
        </div>
      ) : null}
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
  unavailableReason,
  preferredSide,
}: {
  hint: StudioToolHintSpec | null | undefined;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  unavailableReason?: string;
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
  const describedFocusTarget = useRef<HTMLElement | null>(null);
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
    if (!hint) return;
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
    if (!hint) return;
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
    if (disabled) {
      // Preserve native disabled controls and also guard custom button-like
      // descendants that do not implement disabled semantics themselves.
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

  function clearFocusedDescription(target = describedFocusTarget.current) {
    if (!target) return;
    removeAriaDescription(target, tipId);
    if (describedFocusTarget.current === target) describedFocusTarget.current = null;
  }

  function describeFocusedControl(target: EventTarget | null) {
    if (disabled || !(target instanceof HTMLElement) || target === wrapRef.current) return;
    clearFocusedDescription();
    const descriptions = new Set(
      (target.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean)
    );
    descriptions.add(tipId);
    target.setAttribute("aria-describedby", [...descriptions].join(" "));
    describedFocusTarget.current = target;
  }

  function handleFocus(event: React.FocusEvent<HTMLSpanElement>) {
    if (pointerDismissed.current) return;
    // Pointer focus is already filtered by pointerdown suppression. Opening on
    // every remaining focus path clears any suppression left by a previously
    // clicked target. This lets Tab/assistive focus deliberately take over even
    // when the physical pointer has not moved yet, and also covers Safari/
    // embedded WebViews that do not reliably expose :focus-visible.
    pointerDismissed.current = false;
    clearPointerSuppression();
    describeFocusedControl(event.target);
    reveal(true);
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

  function handleBlur(event: React.FocusEvent<HTMLSpanElement>) {
    if (event.target === describedFocusTarget.current) clearFocusedDescription(event.target);
    pointerDismissed.current = false;
    scheduleHide();
  }

  useEffect(() => clearTimers, []);

  useEffect(
    () => () => {
      const target = describedFocusTarget.current;
      if (target) removeAriaDescription(target, tipId);
    },
    [tipId]
  );

  useEffect(() => {
    if (open) return;
    const target = describedFocusTarget.current;
    if (!target) return;
    removeAriaDescription(target, tipId);
    describedFocusTarget.current = null;
  }, [open, tipId]);

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

  if (!hint) {
    return <span className={cn("inline-flex", className)}>{children}</span>;
  }

  const canDescribeChild = isValidElement<DescribedChildProps>(children) && children.type !== Fragment;
  const describedChildren =
    disabled && canDescribeChild
      ? cloneElement(children, {
          "aria-hidden": true,
          tabIndex: -1,
        })
      : open && canDescribeChild
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], tipId].filter(Boolean).join(" "),
        })
      : children;
  const needsWrapperDescription = open && (disabled || !canDescribeChild);

  return (
    <span
      ref={wrapRef}
      data-studio-tool-hint-target="true"
      data-studio-tool-hint-unavailable={disabled ? "true" : undefined}
      className={cn(
        "relative inline-flex",
        disabled && "rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
      onMouseEnter={scheduleShow}
      onMouseLeave={handleMouseLeave}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerCancelCapture}
      onClickCapture={handleClickCapture}
      onFocus={handleFocus}
      onBlur={handleBlur}
      role={disabled ? "button" : undefined}
      aria-label={disabled ? hint.title : undefined}
      aria-disabled={disabled ? true : undefined}
      aria-describedby={needsWrapperDescription ? tipId : undefined}
      tabIndex={disabled ? 0 : undefined}
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
                  unavailableReason={unavailableReason}
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
                unavailableReason={unavailableReason}
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
