import { Ban } from "lucide-react";

import { normalizeHexColor } from "./studio-color-utils";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";

import type { StudioColorPopoverPurpose } from "./studio-color-popover-hints";

import { cn } from "@/shared/lib/utils";

function isExplicitNone(value: string | null): boolean {
  if (value === null) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "transparent" || normalized === "none";
}

function uniqueColors(colors: readonly string[], exclude?: string | null): string[] {
  const excluded = exclude ? normalizeHexColor(exclude) : null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const color of colors) {
    const normalized = normalizeHexColor(color);
    if (!normalized || normalized === excluded || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export interface StudioColorFieldProps {
  readonly label: string;
  readonly value: string | null;
  readonly fallbackColor?: string;
  readonly purpose?: StudioColorPopoverPurpose;
  readonly recentColors: readonly string[];
  readonly documentColors?: readonly string[];
  readonly allowNone?: boolean;
  readonly noneLabel?: string;
  readonly mixed?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly controlId?: string;
  readonly onChange: (color: string | null) => void;
  readonly onPreview?: (color: string) => void;
  readonly onCommit?: (color: string) => void;
  readonly onInteractionEnd?: () => void;
  readonly onUseColor?: (color: string) => void;
  readonly onLoadRecentColors?: () => void;
  readonly onRequestCanvasEyedropper?: () => void;
}

export function StudioColorField({
  label,
  value,
  fallbackColor = "#16100c",
  purpose = "generic",
  recentColors,
  documentColors = [],
  allowNone = false,
  noneLabel = "없음",
  mixed = false,
  disabled = false,
  className,
  controlId,
  onChange,
  onPreview,
  onCommit,
  onInteractionEnd,
  onUseColor,
  onLoadRecentColors,
  onRequestCanvasEyedropper,
}: StudioColorFieldProps) {
  const effectiveColor =
    normalizeHexColor(value ?? "") ?? normalizeHexColor(fallbackColor) ?? "#16100c";
  const inlineRecent = uniqueColors(recentColors, value).slice(0, 4);
  const hasNone = isExplicitNone(value);

  const commitColor = (color: string) => {
    onChange(color);
    onCommit?.(color);
    onInteractionEnd?.();
  };

  return (
    <div
      role="group"
      aria-label={`${label} 설정`}
      data-studio-color-field="true"
      data-studio-color-field-none={hasNone || undefined}
      data-studio-color-field-mixed={mixed || undefined}
      className={cn("space-y-1.5", className)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="shrink-0 text-sm text-fg-2">{label}</span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {allowNone ? (
            <button
              type="button"
              aria-label={noneLabel}
              aria-pressed={hasNone}
              disabled={disabled}
              data-inspector-control-id={controlId ? `${controlId}.none` : undefined}
              onClick={() => {
                onChange(hasNone ? effectiveColor : null);
                onInteractionEnd?.();
              }}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl border transition-[border-color,background-color,color,transform] pointer-coarse:size-11",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
                hasNone
                  ? "border-accent/55 bg-accent-soft/45 text-accent ring-1 ring-accent/20"
                  : "border-line/70 bg-card/70 text-fg-3 hover:border-line-strong hover:bg-raised hover:text-fg",
              )}
            >
              <Ban className="size-4" aria-hidden />
            </button>
          ) : null}
          <LazyStudioColorPopover
            value={effectiveColor}
            onChange={(color) => onChange(color)}
            onPreviewColor={onPreview}
            onCommitColor={onCommit}
            onInteractionEnd={onInteractionEnd}
            recentColors={recentColors}
            documentColors={documentColors}
            onUseColor={onUseColor}
            onLoadRecentColors={onLoadRecentColors}
            onRequestCanvasEyedropper={onRequestCanvasEyedropper}
            label={label}
            purpose={purpose}
            initialTab="quick"
            triggerVariant="field"
            triggerNone={hasNone}
            triggerMixed={mixed}
            disabled={disabled}
            controlId={controlId}
          />
        </div>
      </div>

      {inlineRecent.length > 0 ? (
        <div className="flex items-center justify-end gap-1" aria-label={`${label} 최근 색상`}>
          <span className="mr-1 text-[0.58rem] font-medium text-fg-3">최근</span>
          {inlineRecent.map((color, index) => (
            <button
              key={`${color}-${index}`}
              type="button"
              aria-label={`${label} 최근 색상 ${color} 적용`}
              disabled={disabled}
              onClick={() => {
                commitColor(color);
                onUseColor?.(color);
              }}
              className="size-5 rounded-md border border-white/20 shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-8"
              style={{ background: color }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
