/**
 * Character Shaper — precision controls shared by the inspector, the paint HUD and the dock.
 *
 * `CharacterRangeControl` is the one continuous control of the workshop and implements the
 * design brief §3 contract: range + locale-safe number input, unit, default marker, per-control
 * reset, `Shift` = ×10 step, `Alt` = ×0.1 step, clamped and finite, and **one** history
 * transaction per completed edit — dragging only previews, the commit happens on pointer-up,
 * key-up, `Enter` or blur. `CharacterColorControl` and `CharacterChipGroup` follow the same
 * rules for discrete values.
 */
import { Check, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { pushCharacterShaperKeyLayer } from "./character-shaper-ui-model";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Numeric helpers                                                             */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function precisionFor(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  if (dot < 0) return 0;
  return Math.min(4, text.length - dot - 1);
}

function snap(value: number, min: number, max: number, step: number): number {
  const bounded = clamp(value, min, max);
  if (!(step > 0)) return bounded;
  const snapped = min + Math.round((bounded - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(precisionFor(step)));
}

/** Rounds a free-form delta (Alt = ×0.1) without dragging float noise into the committed value. */
function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(Math.min(6, Math.max(0, digits))));
}

/**
 * Commit value: clamped, finite and rounded one digit finer than the step — the step grid is the
 * drag resolution, not a ceiling, so `Alt` (×0.1) nudges and typed values keep their precision.
 */
function finalize(value: number, min: number, max: number, step: number): number {
  return roundTo(clamp(value, min, max), precisionFor(step) + 1);
}

/**
 * Accepts both decimal conventions typed on Korean keyboards and pasted from spreadsheets:
 * "1.05", "1,05", "１．０５" (full width), " -0,5 " and "1,234.5". When both separators appear,
 * the last one is the decimal point and the other is a grouping mark.
 */
function parseLocaleNumber(raw: string): number | null {
  const text = raw.normalize("NFKC").trim().replace(/\s|_/gu, "");
  if (text.length === 0) return null;
  if (!/^[+-]?[\d.,]+$/u.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized = text;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot
      ? `${text.slice(0, lastComma).replace(/[.,]/gu, "")}.${text.slice(lastComma + 1)}`
      : `${text.slice(0, lastDot).replace(/[.,]/gu, "")}.${text.slice(lastDot + 1)}`;
  } else if (lastComma >= 0) {
    normalized = `${text.slice(0, lastComma).replace(/,/gu, "")}.${text.slice(lastComma + 1)}`;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultFormat(value: number, step: number, unit?: string): string {
  const precision = precisionFor(step);
  if (unit === "%") return `${Math.round(value * 100)}%`;
  if (unit === "×") return `${value.toFixed(Math.max(2, precision))}×`;
  if (unit === "°") return `${value.toFixed(precision)}°`;
  return `${value.toFixed(precision)}${unit ? ` ${unit}` : ""}`;
}

function plainNumber(value: number, step: number): string {
  return value.toFixed(precisionFor(step));
}

/* -------------------------------------------------------------------------- */
/* Range control                                                               */
/* -------------------------------------------------------------------------- */

export interface CharacterRangeControlProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly defaultValue: number;
  /** Overrides the readout text (the number input always shows the raw value). */
  readonly format?: (value: number) => string;
  /** Called on every drag frame. Never a history step — use it for live viewport feedback. */
  readonly onPreview?: (value: number) => void;
  /** Called once per completed edit (pointer-up, key-up, Enter, blur, reset). */
  readonly onCommit: (value: number) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly id?: string;
}

export function CharacterRangeControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  defaultValue,
  format,
  onPreview,
  onCommit,
  disabled = false,
  hint,
  id,
}: CharacterRangeControlProps) {
  const generatedId = useId();
  const rangeId = id ?? `${generatedId}-range`;
  const numberId = `${rangeId}-number`;
  const hintId = `${rangeId}-hint`;
  const [draft, setDraft] = useState<number | null>(null);
  const [text, setText] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  const safeValue = Number.isFinite(value) ? clamp(value, min, max) : clamp(defaultValue, min, max);
  const shown = draft ?? safeValue;
  const normalizedDefault = snap(defaultValue, min, max, step);
  const readout = format ? format(shown) : defaultFormat(shown, step, unit);
  const defaultReadout = format ? format(normalizedDefault) : defaultFormat(normalizedDefault, step, unit);
  const changed = Math.abs(safeValue - normalizedDefault) > (step > 0 ? step / 2 : 1e-6);
  const span = max - min;
  const markerPercent = span > 0 ? clamp(((normalizedDefault - min) / span) * 100, 0, 100) : 0;

  const preview = (next: number) => {
    setDraft(next);
    onPreview?.(next);
  };

  const editing = draft !== null || text !== null;

  useEffect(() => {
    cancelRef.current = () => {
      setDraft(null);
      setText(null);
      if (draft !== null) onPreview?.(safeValue);
    };
  });

  // An unfinished edit owns Escape: the shell's own layer would otherwise close the dialog while
  // the creator only wanted to drop the value they were typing.
  useEffect(() => {
    if (!editing) return;
    return pushCharacterShaperKeyLayer((event) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelRef.current();
      return true;
    }, window);
  }, [editing]);

  const commit = (next: number) => {
    setDraft(null);
    setText(null);
    if (disabled || !Number.isFinite(next)) return;
    const settled = finalize(next, min, max, step);
    if (Math.abs(settled - safeValue) < 1e-9) return;
    onCommit(settled);
  };

  const commitDraft = () => {
    if (draft === null) return;
    commit(draft);
  };

  const nudge = (direction: 1 | -1, event: ReactKeyboardEvent<HTMLInputElement>) => {
    const scale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const delta = step * scale * direction;
    const next = clamp(roundTo(shown + delta, precisionFor(step) + 1), min, max);
    preview(next);
  };

  const onRangeKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled || event.metaKey || event.ctrlKey) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        nudge(1, event);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        nudge(-1, event);
        return;
      case "PageUp":
        event.preventDefault();
        preview(clamp(roundTo(shown + step * 10, precisionFor(step) + 1), min, max));
        return;
      case "PageDown":
        event.preventDefault();
        preview(clamp(roundTo(shown - step * 10, precisionFor(step) + 1), min, max));
        return;
      case "Home":
        event.preventDefault();
        preview(min);
        return;
      case "End":
        event.preventDefault();
        preview(max);
        return;
      case "Enter":
        event.preventDefault();
        commitDraft();
        return;
      case "Escape":
        if (draft === null) return;
        event.preventDefault();
        event.stopPropagation();
        setDraft(null);
        onPreview?.(safeValue);
        return;
      default:
    }
  };

  const commitText = () => {
    const raw = text;
    setText(null);
    if (raw === null) return;
    const parsed = parseLocaleNumber(raw);
    // Unparseable text is discarded on purpose: the control snaps back to the live value
    // instead of writing a guess into the scene.
    if (parsed === null) return;
    commit(parsed);
  };

  return (
    <div
      data-character-range={label}
      className="rounded-xl border border-line/80 bg-card/70 p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={rangeId} className="block text-[0.72rem] font-bold text-fg-2">
            {label}
          </label>
          {hint ? (
            <p id={hintId} className="mt-0.5 line-clamp-2 text-[0.62rem] leading-relaxed text-fg-3">
              {hint}
            </p>
          ) : null}
        </div>
        <output
          htmlFor={rangeId}
          aria-live="off"
          className="shrink-0 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.66rem] font-bold tabular-nums text-fg-2"
        >
          {readout}
        </output>
      </div>

      <div className="relative mt-1.5">
        <input
          id={rangeId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          aria-valuetext={readout}
          className="h-11 w-full min-w-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-45"
          onChange={(event) => preview(Number(event.currentTarget.value))}
          onPointerUp={commitDraft}
          onPointerCancel={commitDraft}
          onKeyDown={onRangeKeyDown}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === "Escape") return;
            commitDraft();
          }}
          onBlur={commitDraft}
        />
        <span
          aria-hidden
          title={`기본값 ${defaultReadout}`}
          className="pointer-events-none absolute bottom-1 h-1.5 w-px -translate-x-1/2 rounded-full bg-fg-3/70"
          style={{ left: `${markerPercent}%` }}
        />
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <label htmlFor={numberId} className="shrink-0 text-[0.62rem] font-semibold text-fg-3">
          값
        </label>
        <input
          id={numberId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text ?? plainNumber(shown, step)}
          disabled={disabled}
          aria-label={`${label} 값 입력`}
          className={cn(
            "min-h-11 w-20 shrink-0 rounded-lg border border-line bg-panel px-2 text-right text-[0.7rem] font-semibold tabular-nums text-fg",
            STUDIO_FOCUS_RING,
            "disabled:cursor-not-allowed disabled:opacity-45",
          )}
          onChange={(event) => setText(event.currentTarget.value)}
          onBlur={commitText}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitText();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setText(null);
            }
          }}
        />
        <span className="min-w-0 flex-1 truncate text-[0.6rem] text-fg-3" aria-hidden>
          기본 {defaultReadout}
        </span>
        {changed ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label} 기본값 ${defaultReadout}(으)로 되돌리기`}
            title={`기본값 ${defaultReadout}(으)로 되돌리기`}
            onClick={() => commit(normalizedDefault)}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-fg-3",
              "transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
            )}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Color control                                                               */
/* -------------------------------------------------------------------------- */

export interface CharacterColorSwatch {
  readonly color: string;
  readonly label: string;
}

export interface CharacterColorControlProps {
  readonly label: string;
  /** `null` means "the model's own color" — the control says so instead of faking a value. */
  readonly value: string | null;
  readonly onCommit: (color: string | null) => void;
  readonly swatches?: readonly CharacterColorSwatch[];
  readonly allowClear?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/iu;

function normalizeHex(raw: string): string | null {
  const text = raw.trim();
  const withHash = text.startsWith("#") ? text : `#${text}`;
  const expanded = /^#[0-9a-f]{3}$/iu.test(withHash)
    ? `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`
    : withHash;
  return HEX_PATTERN.test(expanded) ? expanded.toLowerCase() : null;
}

export function CharacterColorControl({
  label,
  value,
  onCommit,
  swatches = [],
  allowClear = false,
  disabled = false,
  hint,
}: CharacterColorControlProps) {
  const generatedId = useId();
  const pickerId = `${generatedId}-color`;
  const hexId = `${generatedId}-hex`;
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null) return;
    return pushCharacterShaperKeyLayer((event) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDraft(null);
      return true;
    }, window);
  }, [draft]);

  const current = value !== null ? normalizeHex(value) : null;
  const pickerValue = current ?? "#8a6257";
  const shown = draft ?? (current ? current.toUpperCase() : "");

  const commitHex = () => {
    const raw = draft;
    setDraft(null);
    if (raw === null) return;
    if (raw.trim().length === 0) {
      if (allowClear) onCommit(null);
      return;
    }
    const hex = normalizeHex(raw);
    if (hex === null || hex === current) return;
    onCommit(hex);
  };

  return (
    <div data-character-color={label} className="rounded-xl border border-line/80 bg-card/70 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={pickerId} className="text-[0.72rem] font-bold text-fg-2">
          {label}
        </label>
        <span className="text-[0.62rem] text-fg-3">{current ? current.toUpperCase() : "모델 원본 색"}</span>
      </div>
      {hint ? <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">{hint}</p> : null}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          id={pickerId}
          type="color"
          value={pickerValue}
          disabled={disabled}
          aria-label={`${label} 색 선택`}
          className={cn(
            "size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-panel p-1 disabled:cursor-not-allowed disabled:opacity-45",
            STUDIO_FOCUS_RING,
          )}
          onChange={(event) => onCommit(event.currentTarget.value.toLowerCase())}
        />
        <input
          id={hexId}
          type="text"
          value={shown}
          disabled={disabled}
          maxLength={7}
          placeholder="#RRGGBB"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label={`${label} HEX 값`}
          className={cn(
            "min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 text-[0.7rem] font-semibold uppercase tabular-nums text-fg",
            STUDIO_FOCUS_RING,
            "disabled:cursor-not-allowed disabled:opacity-45",
          )}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitHex}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
            }
          }}
        />
        {allowClear ? (
          <button
            type="button"
            disabled={disabled || current === null}
            aria-label={`${label} 모델 원본 색으로 되돌리기`}
            title="모델 원본 색으로 되돌리기"
            onClick={() => onCommit(null)}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-fg-3",
              "transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
            )}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      {swatches.length > 0 ? (
        <div role="group" aria-label={`${label} 추천 색`} className="mt-1.5 flex flex-wrap gap-1">
          {swatches.map((swatch) => {
            const active = current !== null && current === normalizeHex(swatch.color);
            return (
              <button
                key={`${swatch.color}-${swatch.label}`}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                aria-label={`${label} ${swatch.label}`}
                title={`${swatch.label} ${swatch.color.toUpperCase()}`}
                onClick={() => onCommit(swatch.color.toLowerCase())}
                className={cn(
                  "grid size-11 place-items-center rounded-lg border",
                  STUDIO_FOCUS_RING,
                  "disabled:cursor-not-allowed disabled:opacity-45",
                  active ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden
                  className="grid size-7 place-items-center rounded-md border border-line/60"
                  style={{ backgroundColor: swatch.color }}
                >
                  {active ? <Check size={13} className="text-on-accent drop-shadow" aria-hidden /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip group                                                                  */
/* -------------------------------------------------------------------------- */

export interface CharacterChipOption {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly swatch?: string;
  readonly disabled?: boolean;
}

export interface CharacterChipGroupProps {
  readonly label: string;
  readonly options: readonly CharacterChipOption[];
  readonly value: string | null;
  readonly onSelect: (id: string) => void;
  readonly disabled?: boolean;
  /** Renders the group as a wrapping row (default) or a fixed-column grid. */
  readonly columns?: number;
}

export function CharacterChipGroup({
  label,
  options,
  value,
  onSelect,
  disabled = false,
  columns,
}: CharacterChipGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-character-chip-group={label}
      className={cn("gap-1", columns ? "grid" : "flex flex-wrap")}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            disabled={disabled || option.disabled}
            title={option.hint ? `${option.label} · ${option.hint}` : option.label}
            onClick={() => onSelect(option.id)}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[0.7rem] font-semibold",
              "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {option.swatch ? (
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full border border-line/70"
                style={{ backgroundColor: option.swatch }}
              />
            ) : null}
            <span className="truncate">{option.label}</span>
            {active ? <Check size={12} aria-hidden className="shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}
