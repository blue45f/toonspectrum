/**
 * Studio chrome UI — toolbar, dock, and menu-shell primitives shared by StudioPage.
 *
 * Competitor mapping (names not cloned):
 * - CSP / Fresco: labeled tool groups + strong separators
 * - Procreate: icon-first primary tools, secondary menus
 * - Magma: sticky menu header + subtab chips
 *
 * Pure presentation only — no document state.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
  studioSegmentChipClass,
  studioToolButtonClass,
} from "./studio-panel-ui";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/* eslint-disable react-refresh/only-export-components -- chrome tokens shared with StudioPage toolbar shell */
export const STUDIO_ICON_SIZE = {
  subtab: 13,
  tool: 15,
  dock: 19,
  header: 16,
} as const;

/** Horizontal hairline between tool groups (CSP-style tool belt). */
export function StudioToolbarDivider({
  label,
  className,
}: {
  label?: string;
  className?: string;
}): ReactElement {
  if (label) {
    return (
      <span
        role="separator"
        aria-label={label}
        className={cn(
          "mx-0.5 hidden h-8 shrink-0 items-center gap-1.5 self-center lg:inline-flex",
          className
        )}
      >
        <span aria-hidden className="h-6 w-px bg-line-strong/70" />
        <span className="select-none text-[0.6rem] font-bold uppercase tracking-[0.1em] text-fg-3">
          {label}
        </span>
        <span aria-hidden className="h-6 w-px bg-line-strong/70" />
      </span>
    );
  }
  return (
    <span
      role="separator"
      aria-hidden
      className={cn("mx-0.5 h-6 w-px shrink-0 self-center bg-line-strong/60", className)}
    />
  );
}

/** Desktop tool-group shell: keeps related actions visually clustered. */
export function StudioToolbarCluster({
  label,
  children,
  className,
  showCaption = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Optional desktop caption under the cluster (draw-app IA). */
  showCaption?: boolean;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex max-w-full shrink-0 flex-col items-stretch gap-0.5",
        className
      )}
    >
      <div className="flex max-w-full items-center gap-1 rounded-xl border border-line/60 bg-card/40 p-0.5 shadow-[inset_0_1px_0_oklch(0.95_0.01_85/0.04)]">
        {children}
      </div>
      {showCaption ? (
        <span className="hidden select-none px-1 text-center text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-fg-3 lg:block">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Outer tool-belt rail — full-width sticky chrome for the draw-app shell. */
export function StudioToolBelt({
  children,
  className,
  "aria-label": ariaLabel = "스튜디오 도구",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-studio-tool-belt="true"
      className={cn(
        "sticky top-0 z-30 flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto",
        "rounded-none border-b border-line bg-panel/95 px-2 py-1.5 shadow-[0_1px_0_oklch(0.2_0.01_70/0.06)]",
        "[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:flex-wrap lg:overflow-visible lg:rounded-none lg:px-3 lg:py-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface StudioToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  /** Show label next to icon (default true). Icon-only keeps aria-label. */
  showLabel?: boolean;
  chevron?: "up" | "down" | false;
  accented?: boolean;
}

/** Primary toolbar control — icon + short label, competitor-style affordance. */
export function StudioToolButton({
  active = false,
  icon: Icon,
  label,
  showLabel = true,
  chevron = false,
  accented = false,
  className,
  disabled,
  type = "button",
  ...rest
}: StudioToolButtonProps): ReactElement {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={showLabel ? undefined : label}
      className={cn(
        studioToolButtonClass(active, { dense: true }),
        accented && !active && "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40",
        disabled && "cursor-not-allowed opacity-40",
        className
      )}
      {...rest}
    >
      <Icon size={STUDIO_ICON_SIZE.tool} aria-hidden className="shrink-0" />
      {showLabel ? <span className="truncate">{label}</span> : null}
      {chevron ? (
        <span
          aria-hidden
          className={cn(
            "inline-block size-0 border-x-[3.5px] border-x-transparent border-t-[4px] border-t-current opacity-70 transition-transform duration-150",
            chevron === "up" && "rotate-180"
          )}
        />
      ) : null}
    </button>
  );
}

/** Sticky header inside a toolbar group popover (Magma / CSP subtool panel). */
export function StudioMenuPopoverHeader({
  title,
  description,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        "mb-2 flex min-w-0 items-start gap-2.5 rounded-xl border border-line/80 bg-canvas/50 px-2.5 py-2",
        className
      )}
    >
      {Icon ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent/15">
          <Icon size={STUDIO_ICON_SIZE.header} aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold tracking-tight text-fg">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3 text-pretty">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export interface StudioMenuSubtabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  title?: string;
  disabled?: boolean;
}

/** Segmented subtabs for group menus — sticky above scrollable content. */
export function StudioMenuSubtabs({
  items,
  activeId,
  onSelect,
  className,
  "aria-label": ariaLabel = "메뉴 구역",
}: {
  items: readonly StudioMenuSubtabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "sticky top-0 z-10 -mx-0.5 mb-2 flex flex-wrap gap-1 border-b border-line/70 bg-panel pb-2",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            title={item.title ?? item.label}
            onClick={() => onSelect(item.id)}
            className={cn(
              studioSegmentChipClass(active),
              item.disabled && "cursor-not-allowed opacity-40"
            )}
          >
            <Icon size={STUDIO_ICON_SIZE.subtab} aria-hidden className="shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Mobile dock / contextual toolbar control — icon over caption. */
export const StudioDockButton = forwardRef<
  HTMLButtonElement,
  {
    active?: boolean;
    icon?: LucideIcon;
    label: string;
    danger?: boolean;
    swatch?: ReactNode;
    className?: string;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function StudioDockButton(
  {
    active = false,
    icon: Icon,
    label,
    danger = false,
    className,
    disabled,
    type = "button",
    swatch,
    ...rest
  },
  ref
): ReactElement {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[0.6875rem] font-semibold leading-none",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        STUDIO_TOUCH_TARGET,
        active
          ? "bg-accent text-on-accent shadow-sm"
          : danger
            ? "text-bad hover:bg-bad/10"
            : "text-fg-2 hover:bg-raised active:bg-raised",
        disabled && "cursor-not-allowed opacity-35",
        className
      )}
      {...rest}
    >
      {swatch ?? (Icon ? <Icon size={STUDIO_ICON_SIZE.dock} aria-hidden /> : null)}
      <span>{label}</span>
    </button>
  );
});

/** Secondary mobile bar (pages / props / zoom). */
export function StudioDockNavButton({
  active = false,
  icon: Icon,
  label,
  className,
  disabled,
  type = "button",
  ...rest
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">): ReactElement {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[0.6875rem] font-medium",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        active ? "bg-accent-soft/70 text-accent" : "text-fg-2 hover:bg-raised",
        disabled && "opacity-40",
        className
      )}
      {...rest}
    >
      <Icon size={17} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/** Contextual selection bar chip (Photoshop Mobile style). */
export function StudioContextActionButton({
  icon: Icon,
  label,
  danger = false,
  active = false,
  className,
  type = "button",
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  active?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">): ReactElement {
  return (
    <button
      type={type}
      className={cn(
        "flex min-h-11 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[0.62rem] font-semibold",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        active && "bg-accent text-on-accent",
        !active && danger && "text-bad hover:bg-bad/10",
        !active && !danger && "text-fg-2 hover:bg-raised",
        className
      )}
      {...rest}
    >
      <Icon size={16} aria-hidden />
      {label}
    </button>
  );
}
