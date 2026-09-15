import type { StudioMouseWheelAction } from "../studio-app-settings";

export type StudioCanvasWheelNavigationSource =
  | "native-horizontal"
  | "shift-horizontal"
  | "configured-pan";

export interface StudioCanvasWheelNavigationInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly wheelMode: StudioMouseWheelAction;
  readonly reverseWheel: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface StudioCanvasWheelNavigationPlan {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly source: StudioCanvasWheelNavigationSource;
}

const WHEEL_LINE_HEIGHT_PX = 16;
const FALLBACK_PAGE_SIZE_PX = 800;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finitePositiveOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Convert DOM wheel units to CSS pixels before mutating the canvas scrollport.
 * Conventional mouse wheels frequently report line units while trackpads report
 * pixel units. Treating both as raw pixels makes a wheel notch almost inert on
 * some browsers and excessively large on others.
 */
export function normalizeStudioCanvasWheelDelta(
  delta: number,
  deltaMode: number,
  pageSize: number
): number {
  const unitScale = deltaMode === 1
    ? WHEEL_LINE_HEIGHT_PX
    : deltaMode === 2
      ? finitePositiveOrFallback(pageSize, FALLBACK_PAGE_SIZE_PX)
      : 1;
  return finiteOrZero(delta) * unitScale;
}

function dominantAxisDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
}

/**
 * Resolve wheel navigation before zoom and brush-size actions.
 *
 * Ownership order is deliberate:
 * 1. Ctrl/Meta + wheel remains pointer-anchored zoom.
 * 2. Shift + a conventional vertical wheel becomes horizontal movement, except
 *    in brush-size mode where Shift is the established 5 px size step.
 * 3. The configured pan mode consumes both axes with normalized DOM units.
 * 4. Native horizontal input in zoom/brush-size mode remains horizontal movement
 *    instead of being misread as the configured vertical-wheel action.
 */
export function planStudioCanvasWheelNavigation(
  input: StudioCanvasWheelNavigationInput
): StudioCanvasWheelNavigationPlan | null {
  if (input.ctrlKey || input.metaKey) return null;

  const rawDeltaX = finiteOrZero(input.deltaX);
  const rawDeltaY = finiteOrZero(input.deltaY);
  const direction = input.reverseWheel ? -1 : 1;

  if (input.shiftKey && input.wheelMode !== "brush-size") {
    const rawHorizontalDelta = dominantAxisDelta(rawDeltaX, rawDeltaY);
    const deltaX = normalizeStudioCanvasWheelDelta(
      rawHorizontalDelta,
      input.deltaMode,
      input.viewportWidth
    ) * direction;
    if (deltaX === 0) return null;
    return { deltaX, deltaY: 0, source: "shift-horizontal" };
  }

  if (input.wheelMode === "pan") {
    const deltaX = normalizeStudioCanvasWheelDelta(
      rawDeltaX,
      input.deltaMode,
      input.viewportWidth
    ) * direction;
    const deltaY = normalizeStudioCanvasWheelDelta(
      rawDeltaY,
      input.deltaMode,
      input.viewportHeight
    ) * direction;
    if (deltaX === 0 && deltaY === 0) return null;
    return { deltaX, deltaY, source: "configured-pan" };
  }

  if (Math.abs(rawDeltaX) <= Math.abs(rawDeltaY)) return null;
  const deltaX = normalizeStudioCanvasWheelDelta(
    rawDeltaX,
    input.deltaMode,
    input.viewportWidth
  ) * direction;
  if (deltaX === 0) return null;
  return { deltaX, deltaY: 0, source: "native-horizontal" };
}

export interface StudioCanvasWheelNavigationViewport {
  readonly clientWidth: number;
  readonly clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
}

export type StudioCanvasWheelNavigationEvent = Pick<
  WheelEvent,
  | "deltaX"
  | "deltaY"
  | "deltaMode"
  | "shiftKey"
  | "ctrlKey"
  | "metaKey"
  | "preventDefault"
>;

/** Apply an owned horizontal/configured-pan wheel packet to the canvas scrollport. */
export function applyStudioCanvasWheelNavigation(
  viewport: StudioCanvasWheelNavigationViewport,
  event: StudioCanvasWheelNavigationEvent,
  wheelMode: StudioMouseWheelAction,
  reverseWheel: boolean
): boolean {
  const plan = planStudioCanvasWheelNavigation({
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    wheelMode,
    reverseWheel,
    viewportWidth: viewport.clientWidth,
    viewportHeight: viewport.clientHeight,
  });
  if (!plan) return false;

  event.preventDefault();
  viewport.scrollLeft += plan.deltaX;
  viewport.scrollTop += plan.deltaY;
  return true;
}
