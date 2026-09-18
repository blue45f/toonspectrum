export const STUDIO_SHELL_STROKE_FOCUS_SETTLE_MS = 700;

export type StudioShellStrokeFocusPhase = "idle" | "drawing" | "settling";

const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[contenteditable=true]",
  "[role=button]",
  "[role=dialog]",
  "[role=menu]",
  "[role=toolbar]",
  "[data-studio-canvas-control]",
  "[data-studio-canvas-context-menu]",
].join(",");

function closestCapableTarget(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") return null;
  const candidate = target as EventTarget & {
    readonly parentElement?: Element | null;
    closest?: (selector: string) => Element | null;
  };
  if (typeof candidate.closest === "function") return candidate as Element;
  return candidate.parentElement ?? null;
}

/**
 * Starts focus mode only for a primary pen/mouse contact on an armed drawing viewport. Canvas
 * controls and editable UI inside the viewport are excluded so changing zoom or a brush option does
 * not make the rest of the Studio disappear.
 */
export function shouldBeginStudioShellStrokeFocus(
  event: Pick<
    PointerEvent,
    "button" | "defaultPrevented" | "isPrimary" | "pointerType" | "target"
  >,
): boolean {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.isPrimary === false
    || (event.pointerType !== "pen" && event.pointerType !== "mouse")
  ) return false;
  const target = closestCapableTarget(event.target);
  if (!target || target.closest(CONTROL_SELECTOR)) return false;
  return Boolean(target.closest(
    '[data-studio-canvas-viewport][data-studio-draw-dock-safe-area="true"]',
  ));
}

export interface StudioShellStrokeFocusController {
  readonly begin: (pointerId: number) => void;
  readonly end: (pointerId: number) => void;
  readonly reset: () => void;
  readonly dispose: () => void;
  readonly snapshot: () => StudioShellStrokeFocusPhase;
}

/**
 * Keeps UI suppressed briefly after pointer-up so a sequence of short strokes does not flash the
 * chrome between marks. The controller owns no DOM and is shared by the React provider and tests.
 */
export function createStudioShellStrokeFocusController(
  onPhaseChange: (phase: StudioShellStrokeFocusPhase) => void,
  settleMs = STUDIO_SHELL_STROKE_FOCUS_SETTLE_MS,
): StudioShellStrokeFocusController {
  const activePointers = new Set<number>();
  let phase: StudioShellStrokeFocusPhase = "idle";
  let settleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let disposed = false;

  const clearSettle = (): void => {
    if (settleTimer === null) return;
    globalThis.clearTimeout(settleTimer);
    settleTimer = null;
  };
  const publish = (next: StudioShellStrokeFocusPhase): void => {
    if (disposed || phase === next) return;
    phase = next;
    onPhaseChange(next);
  };
  const reset = (): void => {
    activePointers.clear();
    clearSettle();
    publish("idle");
  };

  return Object.freeze({
    begin(pointerId) {
      if (disposed) return;
      clearSettle();
      activePointers.add(pointerId);
      publish("drawing");
    },
    end(pointerId) {
      if (disposed || !activePointers.delete(pointerId) || activePointers.size > 0) return;
      clearSettle();
      publish("settling");
      settleTimer = globalThis.setTimeout(() => {
        settleTimer = null;
        publish("idle");
      }, Math.max(0, settleMs));
    },
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
    },
    snapshot: () => phase,
  });
}
