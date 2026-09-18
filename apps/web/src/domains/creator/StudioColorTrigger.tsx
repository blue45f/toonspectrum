import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { ChevronDown } from "lucide-react";
import { forwardRef, type CSSProperties } from "react";

import { normalizeHexColor } from "./studio-color-utils";

import { cn } from "@/shared/lib/utils";

export type StudioColorTriggerVariant = "swatch" | "field";

export interface StudioColorTriggerProps {
  readonly value: string;
  readonly label: string;
  readonly variant?: StudioColorTriggerVariant;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly isNone?: boolean;
  readonly mixed?: boolean;
  readonly className?: string;
  readonly controlId?: string;
  readonly onClick?: () => void;
  readonly onFocus?: () => void;
  readonly onMouseEnter?: () => void;
}

function checkerboardStyle(color: string, isNone: boolean): CSSProperties {
  if (!isNone) return { background: color };
  return {
    backgroundColor: "#ffffff",
    backgroundImage:
      "linear-gradient(45deg,#d8d8d8 25%,transparent 25%),linear-gradient(-45deg,#d8d8d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d8d8d8 75%),linear-gradient(-45deg,transparent 75%,#d8d8d8 75%)",
    backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
    backgroundSize: "8px 8px",
  };
}

export const StudioColorTrigger = forwardRef<HTMLButtonElement, StudioColorTriggerProps>(
  function StudioColorTrigger(
    {
      value,
      label,
      variant = "swatch",
      expanded = false,
      controls,
      busy = false,
      disabled = false,
      isNone = false,
      mixed = false,
      className,
      controlId,
      onClick,
      onFocus,
      onMouseEnter,
    },
    ref,
  ) {
    const normalized = normalizeHexColor(value) ?? value;
    const displayValue = mixed ? "혼합" : isNone ? "없음" : normalized.toUpperCase();
    const swatchStyle = checkerboardStyle(normalized, isNone || mixed);

    if (variant === "field") {
      return (
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          aria-controls={controls}
          aria-busy={busy || undefined}
          disabled={disabled}
          data-studio-color-trigger="field"
          data-inspector-control-id={controlId}
          data-studio-color-trigger-none={isNone || undefined}
          data-studio-color-trigger-mixed={mixed || undefined}
          onClick={onClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          className={cn(
            "group flex min-h-9 min-w-[7.25rem] items-center gap-2 rounded-xl border border-line/75 bg-card/75 px-1.5 pr-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color,box-shadow,transform]",
            "hover:border-line-strong hover:bg-raised active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            expanded && "border-accent/55 bg-accent-soft/25 ring-1 ring-accent/20",
            className,
          )}
        >
          <span
            className="relative size-7 shrink-0 overflow-hidden rounded-lg border border-white/20 shadow-[0_1px_4px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] pointer-coarse:size-8"
            style={swatchStyle}
            aria-hidden
          >
            {(isNone || mixed) && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className={cn(
                    "block h-px w-10 -rotate-45 shadow-[0_1px_0_rgba(255,255,255,0.7)]",
                    mixed ? "bg-fg-3/70" : "bg-danger/90",
                  )}
                />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[0.68rem] font-semibold tabular-nums text-fg-1">
              {displayValue}
            </span>
            <span className="block truncate text-[0.56rem] font-medium text-fg-3">
              {mixed ? translateCurrentStaticSourceText("domains.creator.StudioColorTrigger", "ko", "여러 색") : isNone ? translateCurrentStaticSourceText("domains.creator.StudioColorTrigger", "ko", "적용 안 함") : translateCurrentStaticSourceText("domains.creator.StudioColorTrigger", "ko", "색상 편집")}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-fg-3 transition-transform",
              expanded && "rotate-180 text-accent",
            )}
            aria-hidden
          />
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-controls={controls}
        aria-busy={busy || undefined}
        disabled={disabled}
        data-studio-color-trigger="swatch"
        data-inspector-control-id={controlId}
        data-studio-color-trigger-none={isNone || undefined}
        data-studio-color-trigger-mixed={mixed || undefined}
        onClick={onClick}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
        className={cn(
          "relative size-7 cursor-pointer overflow-hidden rounded-lg border border-white/20 shadow-sm transition-transform hover:scale-105 active:scale-95 pointer-coarse:size-11",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
          expanded && "ring-2 ring-accent ring-offset-1 ring-offset-panel",
          className,
        )}
        style={swatchStyle}
      >
        {(isNone || mixed) && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <span
              className={cn(
                "block h-px w-12 -rotate-45 shadow-[0_1px_0_rgba(255,255,255,0.7)]",
                mixed ? "bg-fg-3/70" : "bg-danger/90",
              )}
            />
          </span>
        )}
      </button>
    );
  },
);
