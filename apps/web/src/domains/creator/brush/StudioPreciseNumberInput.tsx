import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/utils";

import { formatStudioPreciseNumber, normalizeStudioPreciseNumber } from "./studio-precise-number";

export interface StudioPreciseNumberInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  onChange: (next: number) => void;
}

/**
 * Compact exact-value entry paired with a visual slider.
 *
 * The field keeps an editable draft so artists can replace `12` with `120`
 * without the controlled value snapping after the first key. A single commit is
 * emitted on blur or Enter; Escape restores the current canonical value.
 */
export function StudioPreciseNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled = false,
  className,
  onChange,
}: StudioPreciseNumberInputProps) {
  const focusedRef = useRef(false);
  const [draft, setDraft] = useState(() => formatStudioPreciseNumber(value, step));

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatStudioPreciseNumber(value, step));
  }, [step, value]);

  const restore = () => setDraft(formatStudioPreciseNumber(value, step));
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      restore();
      return;
    }
    const next = normalizeStudioPreciseNumber(parsed, min, max, step);
    setDraft(formatStudioPreciseNumber(next, step));
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.select();
    } else if (event.key === "Escape") {
      event.preventDefault();
      restore();
      event.currentTarget.blur();
    }
  };

  return (
    <span className={cn("relative inline-flex shrink-0 items-center", className)}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onFocus={(event) => {
          focusedRef.current = true;
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-8 w-14 rounded-lg border border-line bg-card px-1.5 pr-4 text-right text-[0.68rem] font-bold tabular-nums text-fg",
          "outline-none focus:border-accent focus:ring-2 focus:ring-accent/25",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      />
      {suffix ? (
        <span aria-hidden className="pointer-events-none absolute right-1 text-[0.58rem] font-semibold text-fg-3">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
