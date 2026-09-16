import type { WheelEvent as ReactWheelEvent } from "react";

export interface StudioHorizontalWheelMetrics {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

export interface StudioHorizontalWheelInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const LINE_PX = 28;

function pixelDelta(
  value: number,
  deltaMode: number,
  pageWidth: number,
): number {
  if (!Number.isFinite(value)) return 0;
  if (deltaMode === DOM_DELTA_LINE) return value * LINE_PX;
  if (deltaMode === DOM_DELTA_PAGE) return value * Math.max(1, pageWidth);
  return value;
}

/**
 * Resolves mouse-wheel intent for Studio's single-row rails.
 * Trackpad tilt and Shift+wheel always count. A plain vertical wheel also scrolls an
 * overflowing rail, which makes ordinary mouse wheels useful on long application menus.
 */
export function resolveStudioHorizontalWheelDelta(
  input: StudioHorizontalWheelInput,
  metrics: StudioHorizontalWheelMetrics,
): number {
  if (input.ctrlKey || input.metaKey) return 0;
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  if (maxScrollLeft <= 0) return 0;

  const horizontalIntent =
    Math.abs(input.deltaX) > Math.abs(input.deltaY) * 0.35;
  const raw =
    horizontalIntent || input.shiftKey
      ? Math.abs(input.deltaX) > 0
        ? input.deltaX
        : input.deltaY
      : input.deltaY;
  const delta = pixelDelta(raw, input.deltaMode, metrics.clientWidth);
  if (Math.abs(delta) < 0.5) return 0;
  if (delta < 0 && metrics.scrollLeft <= 0) return 0;
  if (delta > 0 && metrics.scrollLeft >= maxScrollLeft - 0.5) return 0;
  return delta;
}

function targetOwnsWheelInput(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select"));
}

/** Shared wheel handler for horizontal Studio rails. */
export function handleStudioHorizontalWheel(
  event: ReactWheelEvent<HTMLElement>,
): void {
  if (event.defaultPrevented || targetOwnsWheelInput(event.target)) return;
  const rail = event.currentTarget;
  const delta = resolveStudioHorizontalWheelDelta(event, rail);
  if (delta === 0) return;
  event.preventDefault();
  const maximum = rail.scrollWidth - rail.clientWidth;
  rail.scrollLeft = Math.max(0, Math.min(maximum, rail.scrollLeft + delta));
}
