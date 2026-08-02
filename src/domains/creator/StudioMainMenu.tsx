/**
 * StudioMainMenu — CSP/Photopea-style top application menu.
 * File · Edit · Insert · View · Filter · Draw · AI · Help as compact dropdowns.
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
import { STUDIO_COLOR_VISION_HINTS } from "./studio-color-vision-coach";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { STUDIO_Z } from "./studio-z-index";
import { StudioToolHintTarget } from "./StudioToolHint";

import type {
  StudioMainMenuGroup,
  StudioMainMenuHintKey,
  StudioMainMenuItem,
  StudioMainMenuProps,
} from "./studio-main-menu-model";
import type { StudioToolHintSpec } from "./studio-tool-hints";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type {
  StudioMainMenuGroup,
  StudioMainMenuItem,
  StudioMainMenuProps,
} from "./studio-main-menu-model";

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

type MenuCoords = { top: number; left: number; minWidth: number };
type MenuOpenFocusIntent = "first" | "preserve";
type MenuGroupNavigationDirection = "next" | "previous";
export type StudioMainMenuNavigationCommand = "first" | "last" | "next" | "previous";

type StudioMainMenuHintMeta = Omit<StudioToolHintSpec, "title" | "description" | "tip"> & {
  titleKey: string;
  descriptionKey: string;
  tipKey?: string;
  titleFallback?: string;
  descriptionFallback?: string;
  tipFallback?: string;
};

const MAIN_MENU_HINTS: Readonly<Record<string, StudioMainMenuHintMeta>> = {
  file: {
    id: "main-menu-file",
    titleKey: "studio.mainMenu.hint.file.title",
    descriptionKey: "studio.mainMenu.hint.file.description",
    tipKey: "studio.mainMenu.hint.file.tip",
    preview: "file-workflow",
  },
  edit: {
    id: "main-menu-edit",
    titleKey: "studio.mainMenu.hint.edit.title",
    descriptionKey: "studio.mainMenu.hint.edit.description",
    tipKey: "studio.mainMenu.hint.edit.tip",
    preview: "edit-workflow",
  },
  insert: {
    id: "main-menu-insert",
    titleKey: "studio.mainMenu.hint.insert.title",
    descriptionKey: "studio.mainMenu.hint.insert.description",
    tipKey: "studio.mainMenu.hint.insert.tip",
    preview: "insert-content",
  },
  view: {
    id: "main-menu-view",
    titleKey: "studio.mainMenu.hint.view.title",
    descriptionKey: "studio.mainMenu.hint.view.description",
    tipKey: "studio.mainMenu.hint.view.tip",
    preview: "view-workflow",
  },
  filter: {
    id: "main-menu-filter",
    titleKey: "studio.mainMenu.hint.filter.title",
    descriptionKey: "studio.mainMenu.hint.filter.description",
    tipKey: "studio.mainMenu.hint.filter.tip",
    preview: "filter",
  },
  draw: {
    id: "main-menu-draw",
    titleKey: "studio.mainMenu.hint.draw.title",
    descriptionKey: "studio.mainMenu.hint.draw.description",
    tipKey: "studio.mainMenu.hint.draw.tip",
    preview: "draw-workflow",
  },
  ai: {
    id: "main-menu-ai",
    titleKey: "studio.mainMenu.hint.ai.title",
    descriptionKey: "studio.mainMenu.hint.ai.description",
    tipKey: "studio.mainMenu.hint.ai.tip",
    preview: "ai-assist",
  },
  help: {
    id: "main-menu-help",
    titleKey: "studio.mainMenu.hint.help.title",
    descriptionKey: "studio.mainMenu.hint.help.description",
    tipKey: "studio.mainMenu.hint.help.tip",
    descriptionFallback: "기능 사용법과 단계별 튜토리얼을 찾거나 익숙한 기본 조작과 단축키를 확인합니다.",
    tipFallback: "‘채우기’, ‘색 섞기’, ‘확대’처럼 하고 싶은 결과로 검색해 보세요.",
    preview: "settings",
  },
};

const MAIN_MENU_ITEM_HINTS: Readonly<Record<StudioMainMenuHintKey, StudioToolHintSpec>> = {
  "color-vision:none": STUDIO_COLOR_VISION_HINTS.none,
  "color-vision:grayscale": STUDIO_COLOR_VISION_HINTS.grayscale,
  "color-vision:protanopia": STUDIO_COLOR_VISION_HINTS.protanopia,
  "color-vision:deuteranopia": STUDIO_COLOR_VISION_HINTS.deuteranopia,
  "color-vision:tritanopia": STUDIO_COLOR_VISION_HINTS.tritanopia,
};

function resolveMainMenuHint(
  group: StudioMainMenuGroup,
  t: (key: string) => string,
): StudioToolHintSpec {
  const hint = MAIN_MENU_HINTS[group.id];
  if (!hint) {
    return {
      id: `main-menu-${group.id}`,
      title: localizeText(t, group.label, `studio.mainMenu.group.${group.id}.label`),
      description: localizeText(
        t,
        "",
        `studio.mainMenu.item.${group.id}.fallbackDescription`,
      ),
    };
  }
  const isKoreanHelp = group.id === "help" && group.label === "도움말";
  const descriptionFallback = group.id === "help" && !isKoreanHelp
    ? "Find step-by-step feature guides, familiar editor controls, and keyboard shortcuts."
    : hint.descriptionFallback ?? "";
  const tipFallback = group.id === "help" && !isKoreanHelp
    ? "Search for the result you want, such as fill, blend color, or zoom."
    : hint.tipFallback ?? "";
  const localizedHint = {
    ...hint,
    title: localizeText(
      t,
      hint.titleFallback
        ?? localizeText(t, group.label, `studio.mainMenu.group.${group.id}.label`),
      hint.titleKey,
    ),
    description: localizeText(
      t,
      descriptionFallback,
      hint.descriptionKey,
    ),
    ...(hint.tipKey
      ? { tip: localizeText(t, tipFallback, hint.tipKey) }
      : {}),
  };
  // `hint` is a valid discriminated StudioToolHintSpec with only its localized
  // copy fields replaced. TypeScript widens the preview/variant correlation
  // when spreading the union, so restore that correlation at this boundary.
  return localizedHint as StudioToolHintSpec;
}

/** Pure APG roving-index resolver; disabled commands remain discoverable by arrow navigation. */
// This colocated export is intentional: the parent task limits the APG change to this component
// and its test, while the pure resolver keeps disabled-item navigation independently verifiable.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveStudioMainMenuItemIndex(
  items: readonly Pick<StudioMainMenuItem, "disabled">[],
  currentIndex: number,
  command: StudioMainMenuNavigationCommand,
): number {
  if (items.length === 0) return -1;
  if (command === "first") return 0;
  if (command === "last") return items.length - 1;
  const currentPosition = currentIndex >= 0 && currentIndex < items.length
    ? currentIndex
    : command === "previous"
      ? 0
      : -1;
  const offset = command === "next" ? 1 : -1;
  return (currentPosition + offset + items.length) % items.length;
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
  onNavigateGroup,
  barActive,
  t,
}: {
  group: StudioMainMenuGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigateGroup: (
    direction: MenuGroupNavigationDirection,
    openNextMenu: boolean,
  ) => void;
  barActive: boolean;
  t: (key: string) => string;
}): ReactElement {
  const unavailableReasonLabel = localizeText(t, "Unavailable condition", "studio.mainMenu.unavailableReason");
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
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      onNavigateGroup(event.key === "ArrowRight" ? "next" : "previous", true);
      return;
    }
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
              const hint = item.hint
                ?? (item.hintKey ? MAIN_MENU_ITEM_HINTS[item.hintKey] : undefined)
                ?? (item.unavailableReason
                      ? {
                        id: `main-menu-item-${group.id}-${item.id}`,
                        title: item.label,
                        description: localizeText(
                          t,
                        "Check why this item is unavailable in the current state.",
                          "studio.mainMenu.itemUnavailableHint",
                        ),
                      }
                  : undefined);
              const unavailableReasonId = item.unavailableReason
                ? `${panelId}-item-${itemIndex}-unavailable-reason`
                : undefined;
              return (
                <div key={item.id}>
                  <StudioToolHintTarget
                    hint={hint}
                    unavailableReason={item.unavailableReason}
                    preferredSide="right"
                    className="flex w-full"
                  >
                    <button
                      ref={(node) => {
                        itemRefs.current[itemIndex] = node;
                      }}
                      type="button"
                      role={
                        item.checked === undefined
                          ? "menuitem"
                          : item.selectionRole === "radio"
                            ? "menuitemradio"
                            : "menuitemcheckbox"
                      }
                      aria-checked={item.checked === undefined ? undefined : item.checked}
                      aria-disabled={item.disabled || undefined}
                      aria-describedby={unavailableReasonId}
                      tabIndex={itemIndex !== activeItemIndex ? -1 : 0}
                      data-studio-main-menu-item-index={itemIndex}
                      onFocus={() => setActiveItemIndex(itemIndex)}
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
                  </StudioToolHintTarget>
                  {item.unavailableReason ? (
                    <span
                      id={unavailableReasonId}
                      data-studio-main-menu-unavailable-reason="true"
                      className="sr-only"
                    >
                      {unavailableReasonLabel}: {item.unavailableReason}
                    </span>
                  ) : null}
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
      <StudioToolHintTarget
        hint={barActive ? null : resolveMainMenuHint(group, t)}
        preferredSide="bottom"
        className="shrink-0"
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
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              onNavigateGroup(
                event.key === "ArrowRight" ? "next" : "previous",
                barActive,
              );
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
            "inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[0.75rem] font-semibold tracking-tight xl:px-2 2xl:px-2.5 2xl:text-[0.78rem] pointer-coarse:h-11 pointer-coarse:px-2",
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
              "hidden opacity-50 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] 2xl:block motion-reduce:transition-none",
              open && "rotate-180 opacity-90"
            )}
          />
        </button>
      </StudioToolHintTarget>
      {menu}
    </div>
  );
}

/** Application menu bar — top-bar menu section. */
export function StudioMainMenu({ groups, className }: StudioMainMenuProps): ReactElement {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const barActive = openId !== null;

  const navigateGroup = (
    currentIndex: number,
    direction: MenuGroupNavigationDirection,
    openNextMenu: boolean,
  ) => {
    if (groups.length === 0) return;
    const offset = direction === "next" ? 1 : -1;
    const nextIndex = (currentIndex + offset + groups.length) % groups.length;
    const nextGroup = groups[nextIndex];
    if (!nextGroup) return;
    if (openNextMenu) {
      setOpenId(nextGroup.id);
      return;
    }
    const triggers = menuBarRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-studio-main-menu-trigger]"
    );
    triggers?.[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <nav
      ref={menuBarRef}
      aria-label={localizeText(t, "Main menu", "studio.mainMenu.aria")}
      data-studio-main-menu="true"
      data-studio-shortcut-boundary="true"
      className={cn("flex min-w-max shrink-0 flex-nowrap items-center gap-0.5", className)}
    >
      {groups.map((group, groupIndex) => (
        <MenuDropdown
          key={group.id}
          group={group}
          open={openId === group.id}
          barActive={barActive}
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId((id) => (id === group.id ? null : id))}
          onNavigateGroup={(direction, openNextMenu) =>
            navigateGroup(groupIndex, direction, openNextMenu)
          }
          t={t}
        />
      ))}
    </nav>
  );
}

/** Thin label for menu sections (optional). */
export function StudioMainMenuHint({ children }: { children: ReactNode }): ReactElement {
  return <span className="hidden text-[0.6rem] text-fg-3 xl:inline">{children}</span>;
}
