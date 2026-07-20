/**
 * StudioMainMenu — CSP/Photopea-style top application menu.
 * File · Edit · Insert · View · Draw · AI as compact dropdowns.
 * Menus portal to document.body with fixed coords so they never lose to options-strip
 * stacking or menubar overflow clipping.
 * When one menu is open, hovering another group switches (desktop app menubar UX).
 */
import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { StudioKbdBadge } from "./studio-chrome-ui";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { STUDIO_Z } from "./studio-z-index";

import type {
  StudioMainMenuGroup,
  StudioMainMenuItem,
  StudioMainMenuProps,
} from "./studio-main-menu-model";

import { cn } from "@/lib/utils";

export type {
  StudioMainMenuGroup,
  StudioMainMenuItem,
  StudioMainMenuProps,
} from "./studio-main-menu-model";

type MenuCoords = { top: number; left: number; minWidth: number };
type MenuOpenFocusIntent = "first" | "preserve";
export type StudioMainMenuNavigationCommand = "first" | "last" | "next" | "previous";

/** Pure APG roving-index resolver; enabled items wrap while disabled items are never targeted. */
// This colocated export is intentional: the parent task limits the APG change to this component
// and its test, while the pure resolver keeps disabled-item navigation independently verifiable.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveStudioMainMenuItemIndex(
  items: readonly Pick<StudioMainMenuItem, "disabled">[],
  currentIndex: number,
  command: StudioMainMenuNavigationCommand,
): number {
  const enabledIndexes: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (!items[index]?.disabled) enabledIndexes.push(index);
  }
  if (enabledIndexes.length === 0) return -1;
  if (command === "first") return enabledIndexes[0] ?? -1;
  if (command === "last") return enabledIndexes.at(-1) ?? -1;
  const enabledPosition = enabledIndexes.indexOf(currentIndex);
  if (enabledPosition < 0) {
    return command === "previous"
      ? (enabledIndexes.at(-1) ?? -1)
      : (enabledIndexes[0] ?? -1);
  }
  const offset = command === "next" ? 1 : -1;
  const targetPosition = (
    enabledPosition + offset + enabledIndexes.length
  ) % enabledIndexes.length;
  return enabledIndexes[targetPosition] ?? -1;
}

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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openedRef = useRef(false);
  const openFocusIntentRef = useRef<MenuOpenFocusIntent>("first");
  const closeMenuRef = useRef<(restoreFocus?: boolean) => void>(() => undefined);
  // Keep last coords so the panel can paint on the same frame as open=true
  // (do not gate portal on a second useState tick).
  const [coords, setCoords] = useState<MenuCoords>(() => measureTrigger(null));
  const [activeItemIndex, setActiveItemIndex] = useState(() =>
    resolveStudioMainMenuItemIndex(group.items, -1, "first")
  );

  const updateCoords = () => {
    setCoords(measureTrigger(buttonRef.current));
  };

  const closeMenu = (restoreFocus = true) => {
    onClose();
    // Escape and explicit menu actions return to the owning trigger. Pointer dismissal must leave
    // focus on the control the artist just clicked; pulling it back makes form fields require a
    // second click and breaks the expected desktop-app menu contract.
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const openMenu = (focusIntent: MenuOpenFocusIntent) => {
    openFocusIntentRef.current = focusIntent;
    setCoords(measureTrigger(buttonRef.current));
    onOpen();
  };

  const focusMenuItem = (
    command: StudioMainMenuNavigationCommand,
    currentIndex = activeItemIndex,
  ) => {
    const nextIndex = resolveStudioMainMenuItemIndex(group.items, currentIndex, command);
    if (nextIndex < 0) return;
    setActiveItemIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus({ preventScroll: true });
  };

  useEffect(() => {
    closeMenuRef.current = closeMenu;
  });

  useLayoutEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    updateCoords();
    const firstEnabledIndex = resolveStudioMainMenuItemIndex(group.items, -1, "first");
    setActiveItemIndex(firstEnabledIndex);
    if (openFocusIntentRef.current === "first" && firstEnabledIndex >= 0) {
      itemRefs.current[firstEnabledIndex]?.focus({ preventScroll: true });
    } else if (openFocusIntentRef.current === "first") {
      menuRef.current?.focus({ preventScroll: true });
    }
    openFocusIntentRef.current = "first";
  }, [group.items, open]);

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
        closeMenuRef.current(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        closeMenuRef.current();
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
  }, [open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    const command: StudioMainMenuNavigationCommand | null =
      event.key === "ArrowDown"
        ? "next"
        : event.key === "ArrowUp"
          ? "previous"
          : event.key === "Home"
            ? "first"
            : event.key === "End"
              ? "last"
              : null;
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    const itemElement = (event.target as HTMLElement | null)?.closest?.(
      "[data-studio-main-menu-item-index]"
    );
    const itemIndex = Number(itemElement?.getAttribute("data-studio-main-menu-item-index"));
    focusMenuItem(command, Number.isSafeInteger(itemIndex) ? itemIndex : activeItemIndex);
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={panelId}
            role="menu"
            aria-label={group.label}
            tabIndex={-1}
            data-studio-main-menu-panel="true"
            data-studio-shortcut-boundary="true"
            onKeyDown={handleMenuKeyDown}
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
            {group.items.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  <button
                    ref={(node) => {
                      itemRefs.current[itemIndex] = node;
                    }}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={item.checked === undefined ? undefined : item.checked}
                    disabled={item.disabled}
                    tabIndex={item.disabled || itemIndex !== activeItemIndex ? -1 : 0}
                    data-studio-main-menu-item-index={itemIndex}
                    onFocus={() => {
                      if (!item.disabled) setActiveItemIndex(itemIndex);
                    }}
                    onClick={() => {
                      if (item.disabled) return;
                      try {
                        item.onSelect();
                      } finally {
                        closeMenu();
                      }
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
                    {item.checked ? (
                      <Check size={13} strokeWidth={2.25} aria-hidden className="shrink-0 text-accent" />
                    ) : null}
                    {item.shortcut ? <StudioKbdBadge>{item.shortcut}</StudioKbdBadge> : null}
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
          // Desktop hover switching should not yank keyboard focus into the newly revealed menu.
          openMenu("preserve");
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
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            return;
          }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            focusMenuItem("first", -1);
          } else {
            openMenu("first");
          }
        }}
        onClick={() => (open ? closeMenu() : openMenu("first"))}
        className={cn(
          // Keep the full File/Edit/Insert/View/Filter/Draw/AI vocabulary at laptop widths.
          // The chevron is decorative (aria-haspopup owns the affordance), so compact it
          // before allowing labels to collide inside the compressible menubar lane.
          "inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[0.75rem] font-semibold tracking-tight xl:px-2 2xl:px-2.5 2xl:text-[0.78rem]",
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
          data-studio-main-menu-chevron="true"
          className={cn(
            "hidden opacity-50 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] 2xl:block",
            open && "rotate-180 opacity-90"
          )}
        />
      </button>
      {menu}
    </div>
  );
}

/** Application menu bar — top-bar menu section. */
export function StudioMainMenu({ groups, className }: StudioMainMenuProps): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const barActive = openId !== null;

  return (
    <nav
      aria-label="메인 메뉴"
      data-studio-main-menu="true"
      data-studio-shortcut-boundary="true"
      className={cn("flex min-w-max shrink-0 flex-nowrap items-center gap-0.5", className)}
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
