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
import { StudioToolHintTarget } from "./StudioToolHint";

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
          "flex max-w-full items-center gap-0.5 rounded-xl border border-line/50 bg-card/40 p-0.5",
          "shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)]"
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
        "sticky top-0 z-[30] flex max-w-full shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto",
        "border-b border-line bg-panel/95 px-2 py-1.5",
        "shadow-[0_1px_0_oklch(0.2_0.01_70/0.08)] backdrop-blur-md",
        "[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:gap-2 lg:px-2.5 lg:py-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Compact app menubar — document + file actions.
 * Outer shell is overflow-visible + z-50 so dropdowns are never clipped by the
 * horizontal scroll row (CSS: overflow-x:auto forces y clipping of absolute menus).
 */
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
        // Magma/Sumo top bar — denser commercial app chrome, still canvas-max height.
        "relative z-[50] h-11 min-h-11 shrink-0 border-b border-line",
        // Critical: do NOT put overflow-x-auto here — it clips File/Edit dropdowns.
        "overflow-visible",
        className
      )}
    >
      <div
        data-studio-app-menubar-scroll="true"
        className={cn(
          "flex h-full min-h-11 w-full flex-nowrap items-center gap-2 px-2.5 sm:gap-2.5 sm:px-3",
          "overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {children}
      </div>
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
        "group hidden w-8 shrink-0 flex-col items-center gap-2.5 border-line bg-panel py-4 text-fg-3",
        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        side === "left" && "border-r",
        side === "right" && "border-l",
        "lg:flex",
        className
      )}
    >
      {Icon ? (
        <Icon size={15} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className="opacity-70 transition-opacity group-hover:opacity-100" />
      ) : null}
      <span className="text-[0.6rem] font-semibold tracking-[0.14em] text-fg-3 [writing-mode:vertical-rl] group-hover:text-fg-2">
        {label}
      </span>
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
 * Magma/Krita/Ibis left vertical Toolbar — icon-first tools left of the canvas.
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
        // xl: slightly wider like Krita docker / Ibis tool column
        "hidden w-12 shrink-0 flex-col items-center gap-1.5 overflow-y-auto overscroll-contain",
        "border-r border-line py-2.5 xl:w-[3.25rem] xl:gap-2 xl:py-3",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:flex",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Krita/Pixlr tool-options identity — “what am I using right now?”
 * Lives at the start of the draw options strip (not marketing copy).
 */
export function StudioToolIdentity({
  icon: Icon,
  title,
  detail,
  shortcut,
  /** Icon + metrics only — tool name lives in title tooltip (CSP/Krita dense chrome). */
  iconFirst = true,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  shortcut?: string;
  iconFirst?: boolean;
  className?: string;
}): ReactElement {
  return (
    <div
      data-studio-tool-identity="true"
      data-studio-tool-identity-icon-first={iconFirst ? "true" : undefined}
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={detail ? `${title} — ${detail}` : title}
      aria-label={detail ? `${title}, ${detail}` : title}
    >
      {Icon ? (
        <span className="grid size-8 place-items-center rounded-lg bg-canvas/60 text-accent shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.18)]">
          <Icon size={16} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
        </span>
      ) : null}
      {iconFirst ? (
        detail ? (
          <span className="hidden min-w-0 tabular-nums text-[0.62rem] font-bold tracking-tight text-fg-2 sm:block">
            {detail}
          </span>
        ) : null
      ) : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[0.72rem] font-bold tracking-tight text-fg">{title}</span>
          {detail ? (
            <span className="block truncate text-[0.58rem] font-medium text-fg-3">{detail}</span>
          ) : null}
        </span>
      )}
      {shortcut ? (
        <StudioKbdBadge className="ml-0.5 hidden sm:inline-flex">{shortcut}</StudioKbdBadge>
      ) : null}
    </div>
  );
}

/** Photopea/CSP-style keyboard chip — menus, identity, HUD. */
export function StudioKbdBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <kbd
      data-studio-kbd="true"
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-line/70 bg-canvas/55 px-1.5 py-0.5",
        "text-[0.58rem] font-semibold tabular-nums tracking-wide text-fg-3",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * CSP / Photopea dual color well — primary + secondary with X-swap affordance.
 * Keeps canvas-max density: no labels, only color geometry + optional recent strip.
 */
export function StudioDualColorWell({
  primary,
  secondary,
  recent = [],
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  className,
}: {
  primary: string;
  secondary?: string;
  recent?: readonly string[];
  onPrimaryChange: (hex: string) => void;
  onSecondaryChange?: (hex: string) => void;
  onSwap?: () => void;
  className?: string;
}): ReactElement {
  const showSecondary = Boolean(onSecondaryChange && secondary !== undefined);
  return (
    <div
      data-studio-dual-color-well="true"
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      aria-label="색상"
    >
      {recent.slice(0, 5).map((swatch) => (
        <button
          key={swatch}
          type="button"
          title={swatch}
          aria-label={`최근 색 ${swatch}`}
          onClick={() => onPrimaryChange(swatch)}
          className={cn(
            "size-5 rounded-md border shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.12)] transition-transform hover:scale-110",
            STUDIO_FOCUS_RING,
            primary.toLowerCase() === swatch.toLowerCase()
              ? "ring-2 ring-accent ring-offset-1 ring-offset-panel"
              : "border-line/70"
          )}
          style={{ background: swatch }}
        />
      ))}
      <div className="relative size-8 shrink-0" data-studio-color-stack="true">
        {showSecondary ? (
          <label
            className="absolute bottom-0 right-0 size-[1.05rem] cursor-pointer overflow-hidden rounded border border-line shadow-md"
            title="보조 색 (X로 주 색과 교체)"
            style={{ background: secondary }}
          >
            <span className="sr-only">보조 색</span>
            <input
              type="color"
              value={secondary}
              onChange={(e) => onSecondaryChange?.(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              aria-label="보조 색"
            />
          </label>
        ) : null}
        <label
          className="absolute left-0 top-0 size-[1.35rem] cursor-pointer overflow-hidden rounded-lg border border-line shadow-md ring-1 ring-black/10"
          title="주 색"
          style={{ background: primary }}
        >
          <span className="sr-only">주 색 선택</span>
          <input
            type="color"
            value={primary}
            onChange={(e) => onPrimaryChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="주 색 선택"
          />
        </label>
      </div>
      {onSwap && showSecondary ? (
        <button
          type="button"
          onClick={onSwap}
          title="주/보조 색 교체 (X)"
          aria-label="주 색과 보조 색 교체"
          data-studio-color-swap="true"
          className={cn(
            "grid size-7 place-items-center rounded-lg border border-line/80 bg-card/80 text-fg-3",
            "hover:border-line-strong hover:bg-raised hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 7h11M18 7l-3-3M18 7l-3 3M17 17H6M6 17l3-3M6 17l3 3"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** Concepts/Ibis compact metric pill for the status bar. */
export function StudioHudPill({
  children,
  className,
  title,
  accent,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  accent?: boolean;
}): ReactElement {
  return (
    <span
      data-studio-hud-pill="true"
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-line/60 bg-canvas/35 px-2 py-0.5",
        "text-[0.65rem] font-semibold tabular-nums tracking-tight text-fg-2",
        accent && "border-accent/40 bg-accent-soft/50 text-accent",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface StudioRailToolButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  /** Magma-style longer body for rich hover tooltip (shown with StudioToolHintTarget). */
  description?: string;
  /** Magma-style group indicator (long-press / alternate tools exist). */
  grouped?: boolean;
  accented?: boolean;
}

/** Icon-only tool on the left Magma/Ibis-style rail. */
export function StudioRailToolButton({
  active = false,
  icon: Icon,
  label,
  description,
  grouped = false,
  accented = false,
  className,
  disabled,
  type = "button",
  title,
  ...rest
}: StudioRailToolButtonProps): ReactElement {
  // When a rich description is provided, leave title empty so Magma-style bubble is the only hover UI.
  const nativeTitle = description ? undefined : (title ?? label);
  const button = (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={nativeTitle}
      data-studio-tool-description={description ? "true" : undefined}
      aria-pressed={active}
      className={cn(
        // Fresco/Magma: slightly larger hit, soft radius, no hard bevel.
        "relative grid size-10 place-items-center rounded-2xl border border-transparent xl:size-11",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        active
          ? "bg-accent-soft text-fg shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.32),0_2px_8px_oklch(0.72_0.185_42/0.14)]"
          : accented
            ? "text-accent hover:bg-accent-soft/50"
            : "text-fg-2 hover:bg-raised/90 hover:text-fg hover:shadow-[inset_0_0_0_1px_oklch(0.4_0.012_64/0.35)]",
        disabled && "cursor-not-allowed opacity-35",
        className
      )}
      {...rest}
    >
      <Icon
        size={18}
        strokeWidth={STUDIO_ICON_STROKE}
        aria-hidden
        className={cn(active && "text-accent")}
      />
      {grouped ? (
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 size-0 border-b-[4px] border-r-[4px] border-b-current border-r-transparent opacity-55"
        />
      ) : null}
    </button>
  );

  if (!description) return button;
  return (
    <StudioToolHintTarget
      disabled={disabled}
      hint={{
        id: label,
        title: label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label,
        description,
        shortcut: (() => {
          const m = label.match(/\(([^)]+)\)\s*$/);
          return m?.[1];
        })(),
      }}
    >
      {button}
    </StudioToolHintTarget>
  );
}

/** Thin hairline inside the vertical tool rail. */
export function StudioRailDivider({ className }: { className?: string }): ReactElement {
  return (
    <span
      role="separator"
      aria-hidden
      className={cn("my-1 h-px w-6 shrink-0 bg-line/80", className)}
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
      className={cn("studio-opt-cluster shrink-0", className)}
    >
      {children}
    </div>
  );
}

/**
 * Sketchbook/Krita/Concepts status bar — zoom + tool metrics over the canvas.
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
        "pointer-events-auto absolute bottom-3.5 left-3.5 z-[10] flex max-w-[min(100%,44rem)] flex-wrap items-center gap-1.5",
        "rounded-2xl px-3 py-2 text-[0.68rem] font-semibold tracking-tight text-fg-2",
        className
      )}
    >
      {children}
    </div>
  );
}
