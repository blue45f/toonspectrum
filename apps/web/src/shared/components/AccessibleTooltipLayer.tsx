import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom";

type TooltipSource = Readonly<{
  target: HTMLElement;
  title: string;
  description?: string;
  shortcut?: string;
  reducedMotion: boolean;
}>;

type TooltipPlacement = Readonly<{
  left: number;
  top: number;
  arrowOffset: number;
  side: TooltipSide;
}>;

const SHOW_DELAY_MS = 360;
const WARM_SHOW_DELAY_MS = 90;
const HIDE_DELAY_MS = 120;
const EXIT_DURATION_MS = 100;
const VIEWPORT_PADDING = 10;
const GAP = 10;
const TOUCH_HOLD_DELAY_MS = 520;
const TOUCH_MOVE_TOLERANCE_PX = 10;
const CANDIDATE_SELECTOR = [
  "[data-tooltip]",
  "[data-app-tooltip]",
  "[title]",
  "button[aria-label]",
  "a[aria-label]",
  '[role="button"][aria-label]',
  '[role="tab"][aria-label]',
  '[role="menuitem"][aria-label]',
  '[role="switch"][aria-label]',
  '[role="checkbox"][aria-label]',
  '[role="radio"][aria-label]',
  '[role="option"][aria-label]',
].join(",");

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function cleanCopy(value: string | null | undefined): string | undefined {
  const copy = value?.replace(/\s+/gu, " ").trim();
  return copy || undefined;
}

function hasUsableArea(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      rect.width > 0 &&
      rect.height > 0,
  );
}

function tooltipAnchorRect(target: HTMLElement): DOMRect | null {
  const targetRect = target.getBoundingClientRect();
  if (hasUsableArea(targetRect)) return targetRect;

  // Inline wrappers can keep a zero-sized box while their rendered child
  // already has stable geometry. Anchor to that real hit area instead.
  const childRect = target.firstElementChild?.getBoundingClientRect();
  return hasUsableArea(childRect) ? childRect : null;
}

function hasVisibleText(target: HTMLElement): boolean {
  if (typeof document === "undefined" || typeof NodeFilter === "undefined") {
    return Boolean(cleanCopy(target.textContent));
  }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!cleanCopy(node.textContent)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest('[aria-hidden="true"], [hidden], .sr-only')
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  return Boolean(walker.nextNode());
}

function isKoreanDocument(): boolean {
  if (typeof document === "undefined") return true;
  const lang = document.documentElement.lang.trim().toLowerCase();
  return !lang || lang.startsWith("ko");
}

function targetPrefersReducedMotion(target: HTMLElement): boolean {
  if (target.closest('[data-studio-reduce-motion="true"]')) return true;
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function contextualDescription(target: HTMLElement): string | undefined {
  const explicit = cleanCopy(
    target.getAttribute("data-tooltip-description") ??
      target.getAttribute("aria-description"),
  );
  if (explicit) return explicit;

  const korean = isKoreanDocument();
  const disabledReason = cleanCopy(target.getAttribute("data-tooltip-disabled-reason"));
  if (disabledReason) return disabledReason;
  if (
    target.hasAttribute("disabled") ||
    target.getAttribute("aria-disabled") === "true"
  ) {
    return korean ? "현재 사용할 수 없습니다." : "Unavailable right now.";
  }

  const pressed = target.getAttribute("aria-pressed");
  if (pressed === "true") {
    return korean ? "현재 선택되어 있습니다. 누르면 해제합니다." : "Selected. Activate to turn it off.";
  }
  if (pressed === "false") {
    return korean ? "누르면 선택합니다." : "Activate to select.";
  }

  const checked = target.getAttribute("aria-checked");
  if (checked === "true") {
    return korean ? "현재 켜져 있습니다. 누르면 끕니다." : "On. Activate to turn it off.";
  }
  if (checked === "false") {
    return korean ? "현재 꺼져 있습니다. 누르면 켭니다." : "Off. Activate to turn it on.";
  }

  const expanded = target.getAttribute("aria-expanded");
  if (expanded === "true") {
    return korean ? "현재 열려 있습니다. 누르면 닫습니다." : "Open. Activate to close.";
  }
  if (expanded === "false") {
    return korean ? "누르면 관련 메뉴나 패널을 엽니다." : "Activate to open the related menu or panel.";
  }

  const selected = target.getAttribute("aria-selected");
  if (selected === "true") {
    return korean ? "현재 선택된 항목입니다." : "Currently selected.";
  }
  if (selected === "false") {
    return korean ? "누르면 이 항목으로 전환합니다." : "Activate to switch to this item.";
  }

  return undefined;
}

function tooltipSourceFromEventTarget(eventTarget: EventTarget | null): TooltipSource | null {
  if (!(eventTarget instanceof Element)) return null;
  const target = eventTarget.closest<HTMLElement>(CANDIDATE_SELECTOR);
  if (!target || !target.isConnected) return null;
  if (
    target.closest(
      '[data-app-tooltip-exclude="true"], [data-studio-tool-hint-target="true"], [data-studio-tool-hint="true"], [data-studio-tool-hint-mode="off"]',
    )
  ) {
    return null;
  }
  if (target.hidden || target.closest('[hidden], [inert], [aria-hidden="true"]')) return null;

  const dataTitle = cleanCopy(
    target.getAttribute("data-tooltip") ?? target.getAttribute("data-app-tooltip"),
  );
  const nativeTitle = cleanCopy(target.getAttribute("title"));
  const ariaLabel = cleanCopy(target.getAttribute("aria-label"));
  const explicit = Boolean(dataTitle || nativeTitle);
  if (!explicit && hasVisibleText(target)) return null;

  const title = dataTitle ?? nativeTitle ?? ariaLabel;
  if (!title) return null;

  return {
    target,
    title,
    description: contextualDescription(target),
    shortcut: cleanCopy(
      target.getAttribute("data-tooltip-shortcut") ??
        target.getAttribute("aria-keyshortcuts"),
    ),
    reducedMotion: targetPrefersReducedMotion(target),
  };
}

function addDescription(target: HTMLElement, id: string): void {
  const ids = new Set(
    (target.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean),
  );
  ids.add(id);
  target.setAttribute("aria-describedby", [...ids].join(" "));
}
function removeDescription(target: HTMLElement, id: string): void {
  const ids = (target.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter((candidate) => candidate && candidate !== id);
  if (ids.length > 0) target.setAttribute("aria-describedby", ids.join(" "));
  else target.removeAttribute("aria-describedby");
}

function resolvePlacement(
  target: HTMLElement,
  bubble: HTMLElement,
): TooltipPlacement | null {
  const anchor = tooltipAnchorRect(target);
  if (!anchor) return null;

  const popup = bubble.getBoundingClientRect();
  const visualViewport = globalThis.visualViewport;
  const viewportLeft = visualViewport?.offsetLeft ?? 0;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportWidth = visualViewport?.width ?? globalThis.innerWidth;
  const viewportHeight = visualViewport?.height ?? globalThis.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const popupWidth = Math.max(popup.width, 1);
  const popupHeight = Math.max(popup.height, 1);
  const spaceAbove = anchor.top - viewportTop;
  const spaceBelow = viewportBottom - anchor.bottom;
  const side: TooltipSide =
    spaceBelow >= popupHeight + GAP || spaceBelow >= spaceAbove ? "bottom" : "top";
  const idealLeft = anchor.left + anchor.width / 2 - popupWidth / 2;
  const left = clamp(
    idealLeft,
    viewportLeft + VIEWPORT_PADDING,
    viewportRight - popupWidth - VIEWPORT_PADDING,
  );
  const top = clamp(
    side === "bottom" ? anchor.bottom + GAP : anchor.top - popupHeight - GAP,
    viewportTop + VIEWPORT_PADDING,
    viewportBottom - popupHeight - VIEWPORT_PADDING,
  );

  return {
    left,
    top,
    side,
    arrowOffset: clamp(
      anchor.left + anchor.width / 2 - left,
      14,
      Math.max(14, popupWidth - 14),
    ),
  };
}

export function AccessibleTooltipLayer(): ReactElement | null {
  const tooltipId = `app-tooltip-${useId().replaceAll(":", "")}`;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<TooltipSource | null>(null);
  const nativeTitleRef = useRef<Readonly<{ target: HTMLElement; value: string }> | null>(null);
  const showTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);
  const exitTimer = useRef<number>(0);
  const [active, setActive] = useState<TooltipSource | null>(null);
  const [closing, setClosing] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  useEffect(() => {
    let hoveredTarget: HTMLElement | null = null;
    let focusedTarget: HTMLElement | null = null;
    let bubbleHovered = false;
    let touchHoldTimer = 0;
    let pointerFocusSuppressionTimer = 0;
    let pointerFocusSuppressedTarget: HTMLElement | null = null;
    let touchIntent: {
      source: TooltipSource;
      pointerId: number;
      x: number;
      y: number;
      opened: boolean;
    } | null = null;

    function clearShowTimer(): void {
      if (showTimer.current) globalThis.clearTimeout(showTimer.current);
      showTimer.current = 0;
    }

    function clearHideTimer(): void {
      if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }

    function clearExitTimer(): void {
      if (exitTimer.current) globalThis.clearTimeout(exitTimer.current);
      exitTimer.current = 0;
    }

    function clearTouchHoldTimer(): void {
      if (touchHoldTimer) globalThis.clearTimeout(touchHoldTimer);
      touchHoldTimer = 0;
    }

    function clearPointerFocusSuppression(): void {
      if (pointerFocusSuppressionTimer) {
        globalThis.clearTimeout(pointerFocusSuppressionTimer);
      }
      pointerFocusSuppressionTimer = 0;
      pointerFocusSuppressedTarget = null;
    }

    function clearTimers(): void {
      clearShowTimer();
      clearHideTimer();
      clearExitTimer();
    }

    function isInsideTooltip(eventTarget: EventTarget | null): boolean {
      return (
        eventTarget instanceof Element &&
        eventTarget.closest('[data-app-tooltip-layer="true"]') !== null
      );
    }

    function isInsideTarget(
      target: HTMLElement | null,
      eventTarget: EventTarget | null,
    ): boolean {
      return Boolean(target && eventTarget instanceof Node && target.contains(eventTarget));
    }

    function sourceForEventTarget(eventTarget: EventTarget | null): TooltipSource | null {
      const source = tooltipSourceFromEventTarget(eventTarget);
      if (source) return source;
      const current = activeRef.current;
      return isInsideTarget(current?.target ?? null, eventTarget) ? current : null;
    }

    function restoreNativeTitle(): void {
      const original = nativeTitleRef.current;
      if (!original) return;
      if (!original.target.hasAttribute("title")) {
        original.target.setAttribute("title", original.value);
      }
      nativeTitleRef.current = null;
    }

    function finishClose(): void {
      const current = activeRef.current;
      if (current) removeDescription(current.target, tooltipId);
      restoreNativeTitle();
      activeRef.current = null;
      setActive(null);
      setPlacement(null);
      setClosing(false);
    }

    function close(immediate = false): void {
      clearTimers();
      const current = activeRef.current;
      if (!current) return;
      if (immediate || current.reducedMotion) {
        finishClose();
        return;
      }
      setClosing(true);
      exitTimer.current = globalThis.setTimeout(() => {
        exitTimer.current = 0;
        finishClose();
      }, EXIT_DURATION_MS) as unknown as number;
    }

    function open(source: TooltipSource): void {
      clearTimers();
      const previous = activeRef.current;
      if (previous && previous.target !== source.target) {
        removeDescription(previous.target, tooltipId);
        restoreNativeTitle();
      }
      const nativeTitle = source.target.getAttribute("title");
      if (nativeTitle) {
        nativeTitleRef.current = { target: source.target, value: nativeTitle };
        source.target.removeAttribute("title");
      }
      addDescription(source.target, tooltipId);
      activeRef.current = source;
      setPlacement(null);
      setClosing(false);
      setActive(source);
    }

    function scheduleOpen(source: TooltipSource, immediate: boolean): void {
      clearHideTimer();
      clearExitTimer();
      setClosing(false);
      if (activeRef.current?.target === source.target) {
        activeRef.current = source;
        setActive(source);
        return;
      }
      clearShowTimer();
      if (immediate) {
        open(source);
        return;
      }
      const delay = activeRef.current ? WARM_SHOW_DELAY_MS : SHOW_DELAY_MS;
      showTimer.current = globalThis.setTimeout(() => {
        showTimer.current = 0;
        if (!source.target.isConnected) return;
        open(source);
      }, delay) as unknown as number;
    }

    function scheduleClose(target: HTMLElement | null): void {
      if (!target || activeRef.current?.target !== target) {
        clearShowTimer();
        return;
      }
      if (hoveredTarget === target || focusedTarget === target || bubbleHovered) return;
      clearHideTimer();
      hideTimer.current = globalThis.setTimeout(() => {
        hideTimer.current = 0;
        close();
      }, HIDE_DELAY_MS) as unknown as number;
    }

    function cancelTouchIntent(closeOpened = false): void {
      clearTouchHoldTimer();
      if (closeOpened && touchIntent?.opened) close(true);
      touchIntent = null;
    }

    function onPointerOver(event: PointerEvent): void {
      if (isInsideTooltip(event.target)) {
        bubbleHovered = true;
        clearHideTimer();
        return;
      }
      if (event.pointerType === "touch") return;
      const source = sourceForEventTarget(event.target);
      const current = activeRef.current;
      if (source) {
        if (pointerFocusSuppressedTarget === source.target) return;
        hoveredTarget = source.target;
        scheduleOpen(source, false);
        return;
      }
      if (current && isInsideTarget(current.target, event.target)) {
        hoveredTarget = current.target;
      }
    }

    function onPointerOut(event: PointerEvent): void {
      if (isInsideTooltip(event.target)) {
        if (isInsideTooltip(event.relatedTarget)) return;
        bubbleHovered = false;
        const currentTarget = activeRef.current?.target ?? null;
        if (isInsideTarget(currentTarget, event.relatedTarget)) {
          hoveredTarget = currentTarget;
          return;
        }
        scheduleClose(currentTarget);
        return;
      }

      const source = sourceForEventTarget(event.target);
      const activeTarget = activeRef.current?.target ?? null;
      const currentTarget = source?.target ??
        (isInsideTarget(activeTarget, event.target) ? activeTarget : null);
      if (!currentTarget) return;
      if (isInsideTarget(currentTarget, event.relatedTarget)) return;
      if (hoveredTarget === currentTarget) hoveredTarget = null;
      if (pointerFocusSuppressedTarget === currentTarget) {
        clearPointerFocusSuppression();
      }
      scheduleClose(currentTarget);
    }

    function onFocusIn(event: FocusEvent): void {
      if (isInsideTooltip(event.target)) return;
      const source = sourceForEventTarget(event.target);
      const activeTarget = activeRef.current?.target ?? null;
      if (source) {
        if (pointerFocusSuppressedTarget === source.target) return;
        focusedTarget = source.target;
        scheduleOpen(source, true);
      } else if (isInsideTarget(activeTarget, event.target)) {
        focusedTarget = activeTarget;
      }
    }

    function onFocusOut(event: FocusEvent): void {
      const source = sourceForEventTarget(event.target);
      const currentTarget = source?.target ?? activeRef.current?.target ?? null;
      if (!currentTarget) return;
      if (isInsideTarget(currentTarget, event.relatedTarget)) return;
      if (focusedTarget === currentTarget) focusedTarget = null;
      scheduleClose(currentTarget);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      cancelTouchIntent();
      clearPointerFocusSuppression();
      close(true);
    }

    function onPointerDown(event: PointerEvent): void {
      if (isInsideTooltip(event.target)) {
        cancelTouchIntent();
        close(true);
        return;
      }

      const source = sourceForEventTarget(event.target);
      hoveredTarget = null;
      cancelTouchIntent();
      close(true);
      clearPointerFocusSuppression();
      if (!source) return;

      pointerFocusSuppressedTarget = source.target;
      pointerFocusSuppressionTimer = globalThis.setTimeout(() => {
        pointerFocusSuppressionTimer = 0;
        pointerFocusSuppressedTarget = null;
      }, 800) as unknown as number;

      if (event.pointerType !== "touch") return;
      touchIntent = {
        source,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        opened: false,
      };
      touchHoldTimer = globalThis.setTimeout(() => {
        touchHoldTimer = 0;
        if (!touchIntent || !touchIntent.source.target.isConnected) return;
        touchIntent.opened = true;
        open(touchIntent.source);
      }, TOUCH_HOLD_DELAY_MS) as unknown as number;
    }

    function onPointerMove(event: PointerEvent): void {
      if (event.pointerType !== "touch") {
        if (pointerFocusSuppressedTarget) clearPointerFocusSuppression();
        return;
      }
      const intent = touchIntent;
      if (!intent || intent.pointerId !== event.pointerId || intent.opened) return;
      if (
        Math.hypot(event.clientX - intent.x, event.clientY - intent.y) <=
        TOUCH_MOVE_TOLERANCE_PX
      ) {
        return;
      }
      cancelTouchIntent();
    }

    function onPointerUp(event: PointerEvent): void {
      const intent = touchIntent;
      if (event.pointerType === "touch" && intent?.pointerId === event.pointerId) {
        clearTouchHoldTimer();
        if (!intent.opened) touchIntent = null;
      }
      clearPointerFocusSuppression();
    }

    function onPointerCancel(event: PointerEvent): void {
      if (touchIntent?.pointerId !== event.pointerId) return;
      cancelTouchIntent(true);
      clearPointerFocusSuppression();
    }

    function onClick(event: MouseEvent): void {
      const intent = touchIntent;
      if (intent?.opened && isInsideTarget(intent.source.target, event.target)) {
        event.preventDefault();
        event.stopPropagation();
        touchIntent = null;
        return;
      }
      // Pointer/focus tooltips are descriptive, not interactive popovers. Once a normal control
      // click commits an action, close immediately so the old help bubble cannot cover the modal
      // or sheet that the action just opened.
      close(true);
    }

    function onContextMenu(event: MouseEvent): void {
      const intent = touchIntent;
      if (!intent?.opened || !isInsideTarget(intent.source.target, event.target)) return;
      event.preventDefault();
    }

    function onViewportChange(): void {
      cancelTouchIntent();
      clearPointerFocusSuppression();
      close(true);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== "visible") onViewportChange();
    }

    const passiveCapture = { capture: true, passive: true } as const;
    document.addEventListener("pointerover", onPointerOver, passiveCapture);
    document.addEventListener("pointerout", onPointerOut, passiveCapture);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("pointerdown", onPointerDown, passiveCapture);
    globalThis.addEventListener("pointermove", onPointerMove, passiveCapture);
    globalThis.addEventListener("pointerup", onPointerUp, passiveCapture);
    globalThis.addEventListener("pointercancel", onPointerCancel, passiveCapture);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    globalThis.addEventListener("scroll", onViewportChange, passiveCapture);
    globalThis.addEventListener("wheel", onViewportChange, passiveCapture);
    globalThis.addEventListener("resize", onViewportChange);
    globalThis.addEventListener("blur", onViewportChange);
    globalThis.visualViewport?.addEventListener("resize", onViewportChange);
    globalThis.visualViewport?.addEventListener("scroll", onViewportChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const mutationObserver = typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          const current = activeRef.current;
          if (current && !current.target.isConnected) close(true);
        })
      : null;
    mutationObserver?.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("pointerover", onPointerOver, passiveCapture);
      document.removeEventListener("pointerout", onPointerOut, passiveCapture);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("pointerdown", onPointerDown, passiveCapture);
      globalThis.removeEventListener("pointermove", onPointerMove, passiveCapture);
      globalThis.removeEventListener("pointerup", onPointerUp, passiveCapture);
      globalThis.removeEventListener("pointercancel", onPointerCancel, passiveCapture);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      globalThis.removeEventListener("scroll", onViewportChange, passiveCapture);
      globalThis.removeEventListener("wheel", onViewportChange, passiveCapture);
      globalThis.removeEventListener("resize", onViewportChange);
      globalThis.removeEventListener("blur", onViewportChange);
      globalThis.visualViewport?.removeEventListener("resize", onViewportChange);
      globalThis.visualViewport?.removeEventListener("scroll", onViewportChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mutationObserver?.disconnect();
      clearTimers();
      clearTouchHoldTimer();
      clearPointerFocusSuppression();
      const current = activeRef.current;
      if (current) removeDescription(current.target, tooltipId);
      restoreNativeTitle();
      activeRef.current = null;
    };
  }, [tooltipId]);

  useLayoutEffect(() => {
    const target = active?.target;
    const bubble = bubbleRef.current;
    if (!target || !bubble) return;

    const observedTarget = target;
    const observedBubble = bubble;
    function updatePlacement(): void {
      if (!observedTarget.isConnected) return;
      const next = resolvePlacement(observedTarget, observedBubble);
      if (next) setPlacement(next);
    }

    updatePlacement();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(observedTarget);
    observer.observe(observedBubble);
    return () => observer.disconnect();
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const renderedPlacement = placement ?? {
    left: VIEWPORT_PADDING,
    top: VIEWPORT_PADDING,
    arrowOffset: 20,
    side: "bottom" as const,
  };
  const style: CSSProperties = {
    left: renderedPlacement.left,
    top: renderedPlacement.top,
    "--app-tooltip-arrow-offset": `${renderedPlacement.arrowOffset}px`,
  } as CSSProperties;

  return createPortal(
    <div
      ref={bubbleRef}
      id={tooltipId}
      role="tooltip"
      data-app-tooltip-layer="true"
      data-side={renderedPlacement.side}
      data-state={closing ? "closing" : "open"}
      data-positioned={placement ? "true" : "false"}
      data-app-tooltip-reduced-motion={active.reducedMotion ? "true" : undefined}
      className="pointer-events-auto fixed z-[240] w-max max-w-[min(18rem,calc(100vw-1.25rem))] rounded-lg border border-line/80 bg-panel/98 px-2.5 py-2 text-left shadow-[0_18px_48px_oklch(0.06_0.01_70/0.62)] backdrop-blur-xl"
      style={style}
    >
      <span aria-hidden data-app-tooltip-arrow="true" />
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 text-[0.75rem] font-bold leading-snug text-fg">
          {active.title}
        </span>
        {active.shortcut ? (
          <kbd className="shrink-0 rounded border border-line/70 bg-canvas/75 px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2">
            {active.shortcut}
          </kbd>
        ) : null}
      </span>
      {active.description ? (
        <p className="mt-1 max-w-[30ch] text-[0.7rem] leading-relaxed text-fg-2">
          {active.description}
        </p>
      ) : null}
      <span aria-hidden data-app-tooltip-accent="true" />
    </div>,
    document.body,
  );
}
