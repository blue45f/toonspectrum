import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A one-target numeric control: drag across it to scrub, arrow keys to step.
 *
 * On-canvas surfaces cannot afford a track-and-thumb slider — a 160px track blows
 * the V5 §15 pointer-distance budgets (브러시 HUD 80px, 레이어 행 동작 120px) on its
 * own. A scrubber puts the whole range inside one 34–40px target, so the control
 * is reachable and the value is still adjustable in a single gesture.
 *
 * It is a real `role="slider"`: `aria-valuenow`/`aria-valuetext` are published and
 * every keyboard interaction a native range input supports works here, so the
 * WCAG gate does not regress relative to the docked sliders it stands in for.
 */
export interface StudioInlineScrubberProps {
  /** Accessible name. Rendered as `aria-label`, never visually. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Human-readable current value ("18px", "80%"). */
  valueText: string;
  onChange: (next: number) => void;
  disabled?: boolean;
  className?: string;
  /** CSS px of pointer travel per `step`. */
  pixelsPerStep?: number;
  title?: string;
  children?: ReactNode;
  /** Extra DOM hook the distance gate queries. */
  surface?: string;
  /** Marks this as a layer-row inline action for the pointer-distance gate. */
  rowAction?: string;
  /**
   * `-1` inside composite widgets that own a roving tab stop (the layer tree
   * gives its rows the tab stop and keeps row controls pointer-first).
   */
  tabIndex?: 0 | -1;
}

const DEFAULT_PIXELS_PER_STEP = 3;

function quantize(value: number, min: number, max: number, step: number): number {
  if (!(step > 0)) return Math.min(max, Math.max(min, value));
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

export function StudioInlineScrubber({
  label,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
  disabled = false,
  className,
  pixelsPerStep = DEFAULT_PIXELS_PER_STEP,
  title,
  children,
  surface,
  rowAction,
  tabIndex = 0,
}: StudioInlineScrubberProps) {
  const dragRef = useRef<{ pointerId: number; originX: number; originValue: number } | null>(null);

  const commit = (next: number) => {
    const quantized = quantize(next, min, max, step);
    if (quantized !== value) onChange(quantized);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    // The canvas owns `pointerdown` for strokes and the layer row owns it for
    // selection. Both must stay out of a scrub.
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, originX: event.clientX, originValue: value };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const travelled = event.clientX - drag.originX;
    commit(drag.originValue + (travelled / Math.max(1, pixelsPerStep)) * step);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const coarse = step * 10;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step;
    else if (event.key === "PageDown") next = value - coarse;
    else if (event.key === "PageUp") next = value + coarse;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    commit(next);
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : tabIndex}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      data-layer-row-control
      data-studio-inline-scrubber={surface ?? label}
      data-studio-layer-row-action={rowAction}
      title={title ?? `${label} · 드래그하거나 방향키로 조절`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        "select-none touch-none",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-ew-resize",
        className
      )}
    >
      {children}
    </div>
  );
}
