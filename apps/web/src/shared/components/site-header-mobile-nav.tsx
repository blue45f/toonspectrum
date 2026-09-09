import { X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import {
  MOBILE_SITE_TABS,
  SITE_NAVIGATION_GROUPS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";

import Link from "@/compat/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";

interface MobileHeaderNavigationProps {
  menuOpen: boolean;
  menuId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  closeMenu: () => void;
  isActive: (href: string, exact?: boolean) => boolean;
  isPurposeActive: (href: string, exact?: boolean) => boolean;
  hideBottomTabs?: boolean;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface BackgroundAttributeSnapshot {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: string | null;
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.tabIndex >= 0
      && !element.hidden
      && !element.closest("[hidden], [inert], [aria-hidden='true']")
  );
}

/** Isolate every DOM branch outside the menu while retaining the pointer-only scrim. */
function isolateMenuBranch(overlay: HTMLElement): () => void {
  const snapshots: BackgroundAttributeSnapshot[] = [];
  let branch: HTMLElement | null = overlay;

  while (branch?.parentElement) {
    const parent: HTMLElement = branch.parentElement;
    for (const sibling of [...parent.children]) {
      if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
      snapshots.push({
        element: sibling,
        ariaHidden: sibling.getAttribute("aria-hidden"),
        inert: sibling.getAttribute("inert"),
      });
      sibling.setAttribute("aria-hidden", "true");
      sibling.setAttribute("inert", "");
    }
    branch = parent;
    if (parent === overlay.ownerDocument.body) break;
  }

  return () => {
    for (const snapshot of snapshots) {
      if (snapshot.element.getAttribute("aria-hidden") === "true") {
        if (snapshot.ariaHidden === null) snapshot.element.removeAttribute("aria-hidden");
        else snapshot.element.setAttribute("aria-hidden", snapshot.ariaHidden);
      }
      if (snapshot.element.getAttribute("inert") === "") {
        if (snapshot.inert === null) snapshot.element.removeAttribute("inert");
        else snapshot.element.setAttribute("inert", snapshot.inert);
      }
    }
  };
}

export function MobileHeaderNavigation({
  menuOpen,
  menuId,
  panelRef,
  closeMenu,
  isActive,
  isPurposeActive,
  hideBottomTabs = false,
}: MobileHeaderNavigationProps) {
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const dialog = panelRef.current;
    const overlay = overlayRef.current;
    if (!dialog || !overlay) return;

    const ownerDocument = overlay.ownerDocument;
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const previousRootOverflow = ownerDocument.documentElement.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    ownerDocument.documentElement.style.overflow = "hidden";
    const restoreBackground = isolateMenuBranch(overlay);

    const focusFirst = () => {
      const requested = dialog.querySelector<HTMLElement>("[data-autofocus]");
      const target = requested ?? focusableElements(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
    };
    const focusId = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = ownerDocument.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (dialog.contains(event.target as Node)) return;
      focusFirst();
    };

    ownerDocument.addEventListener("keydown", onKeyDown, true);
    ownerDocument.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.cancelAnimationFrame(focusId);
      ownerDocument.removeEventListener("keydown", onKeyDown, true);
      ownerDocument.removeEventListener("focusin", onFocusIn, true);
      ownerDocument.body.style.overflow = previousBodyOverflow;
      ownerDocument.documentElement.style.overflow = previousRootOverflow;
      restoreBackground();
    };
  }, [closeMenu, menuOpen, panelRef]);

  return (
    <>
      {menuOpen && (
        <div ref={overlayRef} className="fixed inset-0 z-[60] min-[1180px]:hidden">
          <div
            aria-hidden="true"
            data-mobile-menu-backdrop="true"
            onPointerDown={closeMenu}
            className="absolute inset-0 bg-canvas/75 backdrop-blur-md motion-safe:animate-fade-up"
          />
          <div
            ref={panelRef}
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.allMenu")}
            tabIndex={-1}
            className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto overscroll-contain border-b border-line-strong bg-canvas/95 shadow-2xl backdrop-blur-2xl motion-safe:animate-fade-up"
          >
            <div className="sticky top-0 z-10 border-b border-line/60 bg-canvas/92 backdrop-blur-2xl">
              <div className="mx-auto flex min-h-[4.25rem] max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
                <div>
                  <span className="block font-display text-sm font-bold text-fg">{t("nav.menu")}</span>
                  <span className="mt-0.5 block text-[0.68rem] text-fg-3">
                    {locale === "ko" ? "하고 싶은 일에서 바로 시작하세요" : "Start with what you want to do"}
                  </span>
                </div>
                <button
                  type="button"
                  data-autofocus
                  onClick={closeMenu}
                  aria-label={`${t("nav.allMenu")} ${t("common.close")}`}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 shadow-sm transition-colors hover:border-line-strong hover:bg-raised hover:text-fg"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <nav className="mx-auto max-w-[1320px] px-4 pb-6 pt-5 sm:px-6 sm:pb-8">
              <div className="grid gap-4 lg:grid-cols-2">
                {SITE_NAVIGATION_GROUPS.map((group, groupIndex) => (
                  <section
                    key={group.id}
                    aria-labelledby={`${menuId}-${group.id}`}
                    className="rounded-2xl border border-line/70 bg-panel/55 p-3 shadow-sm sm:p-4"
                  >
                    <div className="mb-3 flex items-start gap-3 px-1 sm:px-2">
                      <span aria-hidden="true" className="font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent">
                        0{groupIndex + 1}
                      </span>
                      <div>
                        <h2 id={`${menuId}-${group.id}`} className="font-display text-sm font-bold text-fg">
                          {siteNavigationText(group.label, locale)}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-fg-3">
                          {siteNavigationText(group.description, locale)}
                        </p>
                      </div>
                    </div>
                    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const active = isActive(item.href, item.exact);
                        const Icon = item.icon;
                        const label = siteNavigationText(item.label, locale);
                        return (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              aria-label={label}
                              aria-current={active ? "page" : undefined}
                              className={cx(
                                "group flex min-h-[4.5rem] items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150",
                                active
                                  ? "border-accent/40 bg-accent-soft text-accent shadow-sm"
                                  : "border-line/75 bg-card/70 text-fg-2 hover:border-line-strong hover:bg-raised/80 hover:text-fg"
                              )}
                            >
                              <span
                                className={cx(
                                  "grid size-9 shrink-0 place-items-center rounded-xl border transition-colors",
                                  active
                                    ? "border-accent/35 bg-canvas/55"
                                    : "border-line bg-canvas/45 group-hover:border-line-strong"
                                )}
                              >
                                <Icon size={17} strokeWidth={1.8} className={active ? "text-accent" : "text-fg-3 group-hover:text-accent"} />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{label}</span>
                                <span aria-hidden="true" className="mt-0.5 line-clamp-1 block text-[0.68rem] leading-4 text-fg-3">
                                  {siteNavigationText(item.description, locale)}
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="mt-4 grid gap-2 rounded-2xl border border-line/70 bg-panel/55 p-3 sm:grid-cols-3 sm:p-4">
                {SITE_UTILITY_NAVIGATION.map((item) => {
                  const active = isActive(item.href, item.exact);
                  const Icon = item.icon;
                  const label = siteNavigationText(item.label, locale);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "border-accent/40 bg-accent text-on-accent"
                          : "border-line bg-card/70 text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                      )}
                    >
                      <Icon size={17} className={active ? "text-on-accent" : "text-fg-3 group-hover:text-accent"} />
                      <span>{label}</span>
                      <span aria-hidden="true" className={cx("ml-auto text-xs", active ? "text-on-accent/75" : "text-fg-3")}>↗</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}

      {!hideBottomTabs && (
        <nav
          aria-label={t("nav.quickAccess")}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-panel/92 shadow-[0_-12px_35px_-28px_var(--color-fg)] backdrop-blur-2xl md:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
            {MOBILE_SITE_TABS.map((item) => {
              const active = isPurposeActive(item.href, item.exact);
              const Icon = item.icon;
              const label = siteNavigationText(item.label, locale);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex min-h-[3.75rem] flex-col items-center justify-center gap-1 py-2 text-[0.62rem] font-semibold transition-all duration-150 active:bg-raised/55",
                    active ? "text-accent" : "text-fg-3 hover:text-fg",
                  )}
                >
                  <span className="relative grid size-8 place-items-center rounded-xl transition-colors">
                    {active && (
                      <>
                        <span aria-hidden="true" className="absolute -top-2 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-accent" />
                        <span aria-hidden="true" className="absolute inset-0 rounded-xl bg-accent-soft" />
                      </>
                    )}
                    <Icon size={19} strokeWidth={active ? 2.35 : 1.85} className="relative" />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}