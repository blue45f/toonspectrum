/**
 * StudioMainMenu — Magma/CSP/Photopea-style top application menu.
 * File · Edit · Insert · View · Draw · AI as compact dropdowns.
 * Menus portal to document.body with fixed coords so they never lose to options-strip
 * stacking or menubar overflow clipping.
 * When one menu is open, hovering another group switches (desktop app menubar UX).
 */
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { STUDIO_Z } from "./studio-z-index";

import { cn } from "@/lib/utils";

export interface StudioMainMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
  separatorAfter?: boolean;
  onSelect: () => void;
}

export interface StudioMainMenuGroup {
  id: string;
  label: string;
  items: readonly StudioMainMenuItem[];
}

export interface StudioMainMenuProps {
  groups: readonly StudioMainMenuGroup[];
  className?: string;
}

type MenuCoords = { top: number; left: number; minWidth: number };

function measureTrigger(btn: HTMLButtonElement | null): MenuCoords {
  if (!btn) {
    return { top: 48, left: 8, minWidth: 248 };
  }
  const rect = btn.getBoundingClientRect();
  const minWidth = Math.max(248, rect.width + 48);
  let left = rect.left;
  if (typeof window !== "undefined") {
    left = Math.min(left, window.innerWidth - minWidth - 8);
    left = Math.max(8, left);
  }
  return {
    top: rect.bottom + 6,
    left,
    minWidth,
  };
}

function MenuDropdown({
  group,
  open,
  onOpen,
  onClose,
  barActive,
}: {
  group: StudioMainMenuGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  barActive: boolean;
}): ReactElement {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Keep last coords so the panel can paint on the same frame as open=true
  // (do not gate portal on a second useState tick).
  const [coords, setCoords] = useState<MenuCoords>(() => measureTrigger(null));

  const updateCoords = () => {
    setCoords(measureTrigger(buttonRef.current));
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Defer outside-dismiss so the opening click cannot immediately close the panel.
    let remove: (() => void) | undefined;
    const attachTimer = window.setTimeout(() => {
      function onDoc(e: PointerEvent) {
        const t = e.target as Node | null;
        if (!t) return;
        if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
        const otherTrigger = (e.target as HTMLElement | null)?.closest?.(
          "[data-studio-main-menu-trigger]"
        );
        if (otherTrigger) return;
        onClose();
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
      }
      function onReposition() {
        updateCoords();
      }
      document.addEventListener("pointerdown", onDoc, true);
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", onReposition);
      window.addEventListener("scroll", onReposition, true);
      remove = () => {
        document.removeEventListener("pointerdown", onDoc, true);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", onReposition);
        window.removeEventListener("scroll", onReposition, true);
      };
    }, 0);
    return () => {
      window.clearTimeout(attachTimer);
      remove?.();
    };
  }, [open, onClose]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={panelId}
            role="menu"
            aria-label={group.label}
            data-studio-main-menu-panel="true"
            className={cn(
              "fixed max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel py-1.5 shadow-2xl",
              "[scrollbar-width:thin]"
            )}
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
              // Body-level: beat studio shell / overflow chrome (options strip, absolute leftovers).
              zIndex: STUDIO_Z.workspace,
            }}
          >
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect();
                      onClose();
                    }}
                    className={cn(
                      "mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[0.78rem] font-medium",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      item.danger && "text-bad",
                      item.disabled
                        ? "cursor-not-allowed opacity-40"
                        : "text-fg-2 hover:bg-raised hover:text-fg"
                    )}
                  >
                    {Icon ? (
                      <Icon size={15} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-80" />
                    ) : (
                      <span aria-hidden className="size-[15px] shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate tracking-tight">{item.label}</span>
                    {item.shortcut ? (
                      <span className="shrink-0 rounded-md border border-line/70 bg-canvas/55 px-1.5 py-0.5 text-[0.62rem] font-semibold tabular-nums tracking-wide text-fg-3">
                        {item.shortcut}
                      </span>
                    ) : null}
                  </button>
                  {item.separatorAfter ? (
                    <div role="separator" className="mx-3 my-1.5 h-px bg-line/60" />
                  ) : null}
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => {
        if (barActive && !open) {
          setCoords(measureTrigger(buttonRef.current));
          onOpen();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-studio-main-menu-trigger={group.id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onPointerDown={(e) => {
          // Capture coords before open so the first paint is already positioned.
          if (e.button !== 0) return;
          if (!open) setCoords(measureTrigger(buttonRef.current));
        }}
        onClick={() => (open ? onClose() : onOpen())}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[0.78rem] font-semibold tracking-tight",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          open
            ? "bg-raised text-fg shadow-[inset_0_0_0_1px_oklch(0.45_0.014_64/0.4)]"
            : "text-fg-2 hover:bg-raised/80 hover:text-fg"
        )}
      >
        {group.label}
        <ChevronDown
          size={13}
          aria-hidden
          className={cn(
            "opacity-50 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open && "rotate-180 opacity-90"
          )}
        />
      </button>
      {menu}
    </div>
  );
}

/** Application menu bar — Magma Top Bar menu section. */
export function StudioMainMenu({ groups, className }: StudioMainMenuProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const barActive = openId !== null;

  return (
    <nav
      aria-label="메인 메뉴"
      data-studio-main-menu="true"
      className={cn("flex min-w-0 flex-nowrap items-center gap-0.5", className)}
    >
      {groups.map((group) => (
        <MenuDropdown
          key={group.id}
          group={group}
          open={openId === group.id}
          barActive={barActive}
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId((id) => (id === group.id ? null : id))}
        />
      ))}
    </nav>
  );
}

/** Thin label for menu sections (optional). */
export function StudioMainMenuHint({ children }: { children: ReactNode }): ReactElement {
  return <span className="hidden text-[0.6rem] text-fg-3 xl:inline">{children}</span>;
}
