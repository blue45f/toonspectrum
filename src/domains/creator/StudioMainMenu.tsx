/**
 * StudioMainMenu — Magma/CSP/Photopea-style top application menu.
 * File · Edit · Insert · View · AI  as compact dropdowns (not a 40-button toolbelt).
 * Pure presentation; parent supplies actions.
 */
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

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

function MenuDropdown({
  group,
  open,
  onOpen,
  onClose,
}: {
  group: StudioMainMenuGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}): ReactElement {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? onClose() : onOpen())}
        className={cn(
          "inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-[0.72rem] font-semibold",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          open
            ? "bg-raised text-fg"
            : "text-fg-2 hover:bg-raised/80 hover:text-fg"
        )}
      >
        {group.label}
        <ChevronDown
          size={12}
          aria-hidden
          className={cn("opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label={group.label}
          className="absolute left-0 top-full z-[80] mt-1 min-w-[12.5rem] rounded-lg border border-line bg-panel py-1 shadow-xl"
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
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.72rem] font-medium",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    item.danger && "text-bad",
                    item.disabled
                      ? "cursor-not-allowed opacity-40"
                      : "text-fg-2 hover:bg-raised hover:text-fg"
                  )}
                >
                  {Icon ? <Icon size={14} aria-hidden className="shrink-0 opacity-80" /> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.shortcut ? (
                    <span className="shrink-0 text-[0.62rem] tabular-nums text-fg-3">{item.shortcut}</span>
                  ) : null}
                </button>
                {item.separatorAfter ? (
                  <div role="separator" className="my-1 h-px bg-line/80" />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Application menu bar — Magma Top Bar menu section. */
export function StudioMainMenu({ groups, className }: StudioMainMenuProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);

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
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId(null)}
        />
      ))}
    </nav>
  );
}

/** Thin label for menu sections (optional). */
export function StudioMainMenuHint({ children }: { children: ReactNode }): ReactElement {
  return <span className="hidden text-[0.6rem] text-fg-3 xl:inline">{children}</span>;
}
