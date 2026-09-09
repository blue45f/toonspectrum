import { useEffect, useRef, type RefObject } from "react";

import {
  hasStudioHandPanCrossedDragThreshold,
  planStudioHandPanInertiaFrame,
  resolveStudioHandPanSource,
  sampleStudioHandPanVelocity,
  type StudioHandPanSource,
  type StudioHandPointerButtonAction,
  type StudioHandTouchOneFingerMode,
} from "./studio-hand-navigation-engine";

interface StudioHandNavigationOptions {
  viewportRef: RefObject<HTMLDivElement | null>;
  handToolActive: boolean;
  temporaryHandActive: boolean;
  middleButtonAction: StudioHandPointerButtonAction;
  rightButtonAction: StudioHandPointerButtonAction;
  touchOneFingerMode: StudioHandTouchOneFingerMode;
}

interface StudioHandPanSession {
  pointerId: number;
  pointerType: string;
  button: number;
  source: StudioHandPanSource;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  lastScrollLeft: number;
  lastScrollTop: number;
  lastTimestamp: number;
  velocityX: number;
  velocityY: number;
  active: boolean;
}

interface StudioHandCursorOverride {
  element: HTMLElement;
  value: string;
  priority: string;
}

const INTERACTIVE_VIEWPORT_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='button']",
  "[role='dialog']",
  "[role='menu']",
  "[role='listbox']",
  "[data-studio-view-tools-hud]",
  "[data-studio-canvas-control]",
  "[data-radix-popper-content-wrapper]",
].join(",");

const ACTIVATION_SUPPRESSION_MS = 120;

function isInteractiveViewportTarget(target: EventTarget | null, viewport: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const interactiveAncestor = target.closest(INTERACTIVE_VIEWPORT_SELECTOR);
  return Boolean(interactiveAncestor && interactiveAncestor !== viewport);
}

function preventOwnedPointerEvent(event: PointerEvent) {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}

function preventOwnedMouseEvent(event: MouseEvent) {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}

/**
 * Professional canvas navigation layered above Konva pointer handling.
 *
 * Mouse and pen ownership starts in native capture phase, so a hand gesture
 * never starts a brush stroke or object drag underneath it. Touch deliberately
 * defers capture until its drag threshold: the existing TouchEvent controller
 * still sees the first contact and can seamlessly take over when a second
 * finger begins a pinch/rotate gesture.
 */
export function useStudioHandNavigation({
  viewportRef,
  handToolActive,
  temporaryHandActive,
  middleButtonAction,
  rightButtonAction,
  touchOneFingerMode,
}: StudioHandNavigationOptions) {
  const latestModeRef = useRef({
    handToolActive,
    temporaryHandActive,
    middleButtonAction,
    rightButtonAction,
    touchOneFingerMode,
  });

  useEffect(() => {
    latestModeRef.current = {
      handToolActive,
      temporaryHandActive,
      middleButtonAction,
      rightButtonAction,
      touchOneFingerMode,
    };
  }, [
    handToolActive,
    middleButtonAction,
    rightButtonAction,
    temporaryHandActive,
    touchOneFingerMode,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let session: StudioHandPanSession | null = null;
    let inertiaFrame: number | null = null;
    let cursorOverride: StudioHandCursorOverride | null = null;
    let activationSuppressionTimer: ReturnType<typeof setTimeout> | null = null;
    let suppressClick = false;
    let suppressAuxClick = false;
    let suppressContextMenu = false;
    let reducedMotion = false;
    const reducedMotionQuery = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    );

    const restoreCursorOverride = () => {
      if (!cursorOverride) return;
      const { element, value, priority } = cursorOverride;
      if (value) element.style.setProperty("cursor", value, priority);
      else element.style.removeProperty("cursor");
      cursorOverride = null;
    };

    const applyCursorOverride = (cursor: "grab" | "grabbing") => {
      const nextElement =
        viewport.querySelector<HTMLElement>("[data-studio-canvas-cursor]") ?? viewport;
      if (cursorOverride?.element !== nextElement) {
        restoreCursorOverride();
        cursorOverride = {
          element: nextElement,
          value: nextElement.style.getPropertyValue("cursor"),
          priority: nextElement.style.getPropertyPriority("cursor"),
        };
      }
      nextElement.style.setProperty("cursor", cursor, "important");
    };

    const clearPanVisuals = () => {
      delete viewport.dataset.studioHandPanArmed;
      delete viewport.dataset.studioHandPanActive;
      delete viewport.dataset.studioHandPanSource;
      restoreCursorOverride();
    };

    const clearActivationSuppression = () => {
      if (activationSuppressionTimer !== null) {
        globalThis.clearTimeout(activationSuppressionTimer);
        activationSuppressionTimer = null;
      }
      suppressClick = false;
      suppressAuxClick = false;
      suppressContextMenu = false;
    };

    const armActivationSuppression = (completedSession: StudioHandPanSession) => {
      clearActivationSuppression();
      suppressClick = completedSession.button === 0;
      suppressAuxClick = completedSession.button === 1;
      suppressContextMenu = completedSession.button === 2;
      activationSuppressionTimer = globalThis.setTimeout(
        clearActivationSuppression,
        ACTIVATION_SUPPRESSION_MS
      );
    };

    const capturePointer = (pointerId: number) => {
      try {
        viewport.setPointerCapture(pointerId);
      } catch {
        // Capture can fail for a pointer synchronously cancelled by the browser.
      }
    };

    const releasePointer = (pointerId: number) => {
      if (!viewport.hasPointerCapture?.(pointerId)) return;
      try {
        viewport.releasePointerCapture(pointerId);
      } catch {
        // Blur, pointercancel, or platform gesture arbitration may release first.
      }
    };

    const cancelInertia = () => {
      if (inertiaFrame !== null) {
        globalThis.cancelAnimationFrame(inertiaFrame);
        inertiaFrame = null;
      }
      delete viewport.dataset.studioHandPanInertia;
    };

    const startInertia = (velocityX: number, velocityY: number) => {
      cancelInertia();
      if (reducedMotion || Math.hypot(velocityX, velocityY) < 72) return;

      let nextVelocityX = velocityX;
      let nextVelocityY = velocityY;
      let previousTimestamp = globalThis.performance.now();
      viewport.dataset.studioHandPanInertia = "true";

      const tick = (timestamp: number) => {
        const frame = planStudioHandPanInertiaFrame({
          velocityX: nextVelocityX,
          velocityY: nextVelocityY,
          elapsedMs: timestamp - previousTimestamp,
          reducedMotion,
        });
        previousTimestamp = timestamp;

        const beforeLeft = viewport.scrollLeft;
        const beforeTop = viewport.scrollTop;
        viewport.scrollLeft += frame.deltaX;
        viewport.scrollTop += frame.deltaY;

        const movedX = viewport.scrollLeft !== beforeLeft;
        const movedY = viewport.scrollTop !== beforeTop;
        nextVelocityX = movedX ? frame.velocityX : 0;
        nextVelocityY = movedY ? frame.velocityY : 0;

        if (frame.shouldContinue && (nextVelocityX !== 0 || nextVelocityY !== 0)) {
          inertiaFrame = globalThis.requestAnimationFrame(tick);
          return;
        }

        inertiaFrame = null;
        delete viewport.dataset.studioHandPanInertia;
      };

      inertiaFrame = globalThis.requestAnimationFrame(tick);
    };

    const finishSession = ({
      allowInertia,
      suppressActivation,
    }: {
      allowInertia: boolean;
      suppressActivation: boolean;
    }) => {
      const completedSession = session;
      session = null;
      clearPanVisuals();
      if (!completedSession) return;

      releasePointer(completedSession.pointerId);
      if (suppressActivation) armActivationSuppression(completedSession);
      if (allowInertia && completedSession.active) {
        startInertia(completedSession.velocityX, completedSession.velocityY);
      }
    };

    const modeStillOwnsSession = (currentSession: StudioHandPanSession) => {
      const mode = latestModeRef.current;
      if (currentSession.source === "hand-tool") {
        if (!mode.handToolActive) return false;
        if (currentSession.pointerType === "touch") {
          return mode.touchOneFingerMode === "draw";
        }
        return true;
      }
      if (currentSession.source === "temporary-space") {
        return mode.temporaryHandActive;
      }
      if (currentSession.source === "middle-button") {
        return mode.middleButtonAction === "pan";
      }
      return mode.rightButtonAction === "pan";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        session &&
        session.pointerType === "touch" &&
        event.pointerType === "touch" &&
        session.pointerId !== event.pointerId
      ) {
        // Release the first contact before the second TouchEvent frame. The
        // existing two-finger controller re-arms from the current geometry.
        finishSession({ allowInertia: false, suppressActivation: false });
        return;
      }
      if (session || event.defaultPrevented) return;

      const mode = latestModeRef.current;
      const source = resolveStudioHandPanSource({
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
        handToolActive: mode.handToolActive,
        temporaryHandActive: mode.temporaryHandActive,
        interactiveTarget: isInteractiveViewportTarget(event.target, viewport),
        middleButtonAction: mode.middleButtonAction,
        rightButtonAction: mode.rightButtonAction,
        touchOneFingerMode: mode.touchOneFingerMode,
      });
      if (!source) return;

      cancelInertia();
      clearActivationSuppression();
      session = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        source,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: viewport.scrollLeft,
        startScrollTop: viewport.scrollTop,
        lastScrollLeft: viewport.scrollLeft,
        lastScrollTop: viewport.scrollTop,
        lastTimestamp: event.timeStamp,
        velocityX: 0,
        velocityY: 0,
        active: false,
      };
      viewport.dataset.studioHandPanArmed = "true";
      viewport.dataset.studioHandPanSource = source;
      applyCursorOverride("grab");
      viewport.focus({ preventScroll: true });

      if (event.pointerType !== "touch") {
        capturePointer(event.pointerId);
        preventOwnedPointerEvent(event);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const currentSession = session;
      if (!currentSession || currentSession.pointerId !== event.pointerId) return;

      if (
        !modeStillOwnsSession(currentSession) ||
        (event.pointerType !== "touch" && event.buttons === 0)
      ) {
        finishSession({ allowInertia: false, suppressActivation: false });
        return;
      }

      const coalescedEvents = event.getCoalescedEvents?.() ?? [];
      const sample = coalescedEvents[coalescedEvents.length - 1] ?? event;
      const deltaX = sample.clientX - currentSession.startClientX;
      const deltaY = sample.clientY - currentSession.startClientY;

      if (
        !currentSession.active &&
        !hasStudioHandPanCrossedDragThreshold({
          deltaX,
          deltaY,
          pointerType: currentSession.pointerType,
        })
      ) {
        if (currentSession.pointerType !== "touch") {
          preventOwnedPointerEvent(event);
        }
        return;
      }

      if (!currentSession.active) {
        currentSession.active = true;
        viewport.dataset.studioHandPanActive = "true";
        applyCursorOverride("grabbing");
        if (currentSession.pointerType === "touch") {
          capturePointer(currentSession.pointerId);
        }
      }

      preventOwnedPointerEvent(event);
      viewport.scrollLeft = currentSession.startScrollLeft - deltaX;
      viewport.scrollTop = currentSession.startScrollTop - deltaY;

      const elapsedMs = Math.max(1, sample.timeStamp - currentSession.lastTimestamp);
      currentSession.velocityX = sampleStudioHandPanVelocity({
        currentVelocity: currentSession.velocityX,
        deltaPx: viewport.scrollLeft - currentSession.lastScrollLeft,
        elapsedMs,
      });
      currentSession.velocityY = sampleStudioHandPanVelocity({
        currentVelocity: currentSession.velocityY,
        deltaPx: viewport.scrollTop - currentSession.lastScrollTop,
        elapsedMs,
      });
      currentSession.lastScrollLeft = viewport.scrollLeft;
      currentSession.lastScrollTop = viewport.scrollTop;
      currentSession.lastTimestamp = sample.timeStamp;
    };

    const onPointerUp = (event: PointerEvent) => {
      const currentSession = session;
      if (!currentSession || currentSession.pointerId !== event.pointerId) return;
      if (currentSession.pointerType !== "touch" || currentSession.active) {
        preventOwnedPointerEvent(event);
      }
      finishSession({ allowInertia: true, suppressActivation: true });
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!session || session.pointerId !== event.pointerId) return;
      finishSession({ allowInertia: false, suppressActivation: false });
    };

    const onLostPointerCapture = (event: PointerEvent) => {
      if (!session || session.pointerId !== event.pointerId) return;
      finishSession({ allowInertia: false, suppressActivation: false });
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      clearActivationSuppression();
      preventOwnedMouseEvent(event);
    };

    const onAuxClick = (event: MouseEvent) => {
      if (!suppressAuxClick) return;
      clearActivationSuppression();
      preventOwnedMouseEvent(event);
    };

    const onContextMenu = (event: MouseEvent) => {
      if (session?.source !== "right-button" && !suppressContextMenu) return;
      if (suppressContextMenu) clearActivationSuppression();
      preventOwnedMouseEvent(event);
    };

    const onViewportKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (session) {
          event.preventDefault();
          finishSession({ allowInertia: false, suppressActivation: false });
        }
        cancelInertia();
        return;
      }

      if (event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const normalStep = 48;
      const horizontalStep = event.shiftKey
        ? Math.max(120, viewport.clientWidth / 4)
        : normalStep;
      const verticalStep = event.shiftKey
        ? Math.max(120, viewport.clientHeight / 4)
        : normalStep;
      let deltaX = 0;
      let deltaY = 0;

      if (event.key === "ArrowLeft") deltaX = -horizontalStep;
      else if (event.key === "ArrowRight") deltaX = horizontalStep;
      else if (event.key === "ArrowUp") deltaY = -verticalStep;
      else if (event.key === "ArrowDown") deltaY = verticalStep;
      else return;

      event.preventDefault();
      cancelInertia();
      viewport.scrollLeft += deltaX;
      viewport.scrollTop += deltaY;
    };

    const onWindowKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && session?.source === "temporary-space") {
        finishSession({ allowInertia: false, suppressActivation: false });
      }
    };

    const onWindowBlur = () => {
      finishSession({ allowInertia: false, suppressActivation: false });
      cancelInertia();
      clearActivationSuppression();
    };

    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState === "hidden") onWindowBlur();
    };

    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) cancelInertia();
    };

    const onWheel = () => cancelInertia();

    reducedMotion = reducedMotionQuery?.matches ?? false;
    reducedMotionQuery?.addEventListener("change", onReducedMotionChange);
    viewport.addEventListener("pointerdown", onPointerDown, true);
    viewport.addEventListener("pointermove", onPointerMove, true);
    viewport.addEventListener("pointerup", onPointerUp, true);
    viewport.addEventListener("pointercancel", onPointerCancel, true);
    viewport.addEventListener("lostpointercapture", onLostPointerCapture, true);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("auxclick", onAuxClick, true);
    viewport.addEventListener("contextmenu", onContextMenu, true);
    viewport.addEventListener("keydown", onViewportKeyDown);
    viewport.addEventListener("wheel", onWheel, { passive: true });
    globalThis.addEventListener("keyup", onWindowKeyUp);
    globalThis.addEventListener("blur", onWindowBlur);
    globalThis.document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      finishSession({ allowInertia: false, suppressActivation: false });
      cancelInertia();
      clearPanVisuals();
      clearActivationSuppression();
      reducedMotionQuery?.removeEventListener("change", onReducedMotionChange);
      viewport.removeEventListener("pointerdown", onPointerDown, true);
      viewport.removeEventListener("pointermove", onPointerMove, true);
      viewport.removeEventListener("pointerup", onPointerUp, true);
      viewport.removeEventListener("pointercancel", onPointerCancel, true);
      viewport.removeEventListener("lostpointercapture", onLostPointerCapture, true);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("auxclick", onAuxClick, true);
      viewport.removeEventListener("contextmenu", onContextMenu, true);
      viewport.removeEventListener("keydown", onViewportKeyDown);
      viewport.removeEventListener("wheel", onWheel);
      globalThis.removeEventListener("keyup", onWindowKeyUp);
      globalThis.removeEventListener("blur", onWindowBlur);
      globalThis.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [viewportRef]);
}
