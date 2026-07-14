/**
 * Studio chrome UI — toolbar, dock, and menu-shell primitives shared by StudioPage.
 *
 * Competitor mapping (names not cloned; IA only from public Magma help):
 * - Magma Editor: Top Bar + left vertical Toolbar + center Canvas + right Properties/Layers
 *   + bottom Status Bar + Quick Actions (undo/redo/zoom/fit)
 *   Layout modes Super Simple / Simple / Full
 *   https://help.magma.com/en/articles/6871160-magma-s-editor-user-interface
 *   https://help.magma.com/en/articles/10586978-magma-layout-modes
 * - CSP / Fresco: labeled tool groups
 * - Figma: edge-dock shell
 *
 * Canvas-max policy: chrome is dense, flush, and sticky — never steals vertical
 * space with marketing headers or multi-row wrap on desktop.
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
  tool: 16,
  toolCompact: 15,
  dock: 18,
  header: 15,
  rail: 14,
} as const;

/** Default stroke for small chrome icons — slightly thicker reads cleaner at 14–16px. */
export const STUDIO_ICON_STROKE = 1.75;

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
          "mx-0.5 hidden h-7 shrink-0 items-center gap-1 self-center lg:inline-flex",
          className
        )}
      >
        <span aria-hidden className="h-5 w-px bg-line-strong/70" />
        <span className="select-none text-[0.55rem] font-bold uppercase tracking-[0.12em] text-fg-3">
          {label}
        </span>
        <span aria-hidden className="h-5 w-px bg-line-strong/70" />
      </span>
    );
  }
  return (
    <span
      role="separator"
      aria-hidden
      className={cn("mx-0.5 h-5 w-px shrink-0 self-center bg-line-strong/55", className)}
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
        "flex max-w-full shrink-0 flex-col items-stretch gap-px",
        className
      )}
    >
      <div
        className={cn(
          "flex max-w-full items-center gap-0.5 rounded-lg border border-line/55 bg-card/35 p-px",
          "shadow-[inset_0_1px_0_oklch(0.95_0.01_85/0.035)]"
        )}
      >
        {children}
      </div>
      {showCaption ? (
        <span className="hidden select-none px-0.5 text-center text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-fg-3 lg:block">
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
        // Single-row draw-app belt (Figma/CSP): horizontal scroll, never multi-row wrap.
        "sticky top-0 z-30 flex max-w-full shrink-0 flex-nowrap items-center gap-1 overflow-x-auto",
        "border-b border-line bg-panel/97 px-1.5 py-1",
        "shadow-[0_1px_0_oklch(0.2_0.01_70/0.06)] backdrop-blur-sm",
        "[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:gap-1.5 lg:px-2 lg:py-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Compact app menubar above the tool belt — document + file actions, one thin strip. */
export function StudioAppMenubar({
  children,
  className,
  "aria-label": ariaLabel = "문서 메뉴",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="banner"
      aria-label={ariaLabel}
      data-studio-app-menubar="true"
      className={cn(
        "flex min-h-9 shrink-0 flex-nowrap items-center gap-1.5 border-b border-line/80 bg-panel px-2 py-1",
        "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
      title={showLabel ? undefined : label}
      className={cn(
        studioToolButtonClass(active, { dense: true }),
        !showLabel && "justify-center px-2",
        accented && !active && "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40",
        disabled && "cursor-not-allowed opacity-40",
        className
      )}
      {...rest}
    >
      <Icon
        size={showLabel ? STUDIO_ICON_SIZE.toolCompact : STUDIO_ICON_SIZE.tool}
        strokeWidth={STUDIO_ICON_STROKE}
        aria-hidden
        className="shrink-0"
      />
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
        "mb-1.5 flex min-w-0 items-start gap-2 rounded-lg border border-line/80 bg-canvas/45 px-2 py-1.5",
        className
      )}
    >
      {Icon ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent ring-1 ring-accent/15">
          <Icon size={STUDIO_ICON_SIZE.header} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.72rem] font-bold tracking-tight text-fg">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[0.6rem] leading-snug text-fg-3 text-pretty">{description}</p>
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
        "sticky top-0 z-10 -mx-0.5 mb-1.5 flex flex-wrap gap-0.5 border-b border-line/70 bg-panel pb-1.5",
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
              "text-[0.68rem]",
              item.disabled && "cursor-not-allowed opacity-40"
            )}
          >
            <Icon size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className="shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Collapsed edge rail (Figma/CSP style) — thin vertical strip that re-opens a dock.
 * Prefer over wide rounded cards when panels are collapsed so canvas stays wide.
 */
export function StudioEdgeRailButton({
  label,
  side,
  onClick,
  icon: Icon,
  className,
  title,
}: {
  label: string;
  side: "left" | "right";
  onClick: () => void;
  icon?: LucideIcon;
  className?: string;
  title?: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `${label} 펼치기`}
      aria-label={`${label} 펼치기`}
      data-studio-edge-rail={side}
      className={cn(
        "group hidden w-8 shrink-0 flex-col items-center gap-2 border-line bg-panel/90 py-3 text-fg-3",
        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        side === "left" && "border-r",
        side === "right" && "border-l",
        "lg:flex",
        className
      )}
    >
      {Icon ? (
        <Icon size={STUDIO_ICON_SIZE.rail} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className="opacity-80 group-hover:opacity-100" />
      ) : null}
      <span className="text-[0.62rem] font-bold tracking-wide [writing-mode:vertical-rl]">{label}</span>
    </button>
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
      {swatch ??
        (Icon ? (
          <Icon size={STUDIO_ICON_SIZE.dock} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
        ) : null)}
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
      <Icon size={17} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
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
      <Icon size={16} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
      {label}
    </button>
  );
}

/**
 * Magma-style left vertical Toolbar — icon-first tools left of the canvas.
 * Grouped tools can show a flyout chevron (Magma Super Simple triangle affordance).
 */
export function StudioVerticalToolRail({
  children,
  className,
  "aria-label": ariaLabel = "그리기 도구",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      data-studio-tool-rail="true"
      className={cn(
        "hidden w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain",
        "border-r border-line bg-panel/95 py-1.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:flex",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface StudioRailToolButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  /** Magma-style group indicator (long-press / alternate tools exist). */
  grouped?: boolean;
  accented?: boolean;
}

/** Icon-only tool on the left Magma-style rail. */
export function StudioRailToolButton({
  active = false,
  icon: Icon,
  label,
  grouped = false,
  accented = false,
  className,
  disabled,
  type = "button",
  ...rest
}: StudioRailToolButtonProps): ReactElement {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "relative grid size-9 place-items-center rounded-md border",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        active
          ? "border-accent/60 bg-accent-soft/70 text-fg shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.14)]"
          : accented
            ? "border-accent/25 bg-accent-soft/20 text-accent hover:bg-accent-soft/35"
            : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
        disabled && "cursor-not-allowed opacity-35",
        className
      )}
      {...rest}
    >
      <Icon size={STUDIO_ICON_SIZE.tool} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
      {grouped ? (
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 size-0 border-b-[4px] border-r-[4px] border-b-current border-r-transparent opacity-55"
        />
      ) : null}
    </button>
  );
}

/** Thin hairline inside the vertical tool rail. */
export function StudioRailDivider({ className }: { className?: string }): ReactElement {
  return (
    <span
      role="separator"
      aria-hidden
      className={cn("my-0.5 h-px w-7 shrink-0 bg-line-strong/50", className)}
    />
  );
}

/**
 * Magma Top Bar Quick Actions — undo / redo / zoom / fit, icon-first.
 * Lives in the horizontal tool belt center (Magma Quick Actions strip).
 */
export function StudioQuickActionsBar({
  children,
  className,
  "aria-label": ariaLabel = "빠른 작업",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-studio-quick-actions="true"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-lg border border-line/55 bg-card/40 p-px",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Magma Status Bar — bottom-left magnification + layout mode, over the canvas.
 * Does not steal layout height when position=absolute.
 */
export function StudioStatusBar({
  children,
  className,
  "aria-label": ariaLabel = "캔버스 상태",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      data-studio-status-bar="true"
      className={cn(
        "pointer-events-auto absolute bottom-2 left-2 z-20 flex max-w-[min(100%,28rem)] flex-wrap items-center gap-1",
        "rounded-lg border border-line/80 bg-panel/92 px-1.5 py-1 text-[0.62rem] font-semibold text-fg-2 shadow-md backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
