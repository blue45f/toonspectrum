import {
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

import {
  SITE_UTILITY_NAVIGATION,
  mobileSiteTabsForPath,
  siteNavigationContextForPath,
  siteNavigationGroupsForPath,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";
import { ToonSpectrumMark } from "./visual-marks";

import { usePathname } from "@/compat/navigation";
import Link from "@/compat/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-header-mobile-nav", ko, en);

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
      element.tabIndex >= 0 &&
      !element.hidden &&
      !element.closest("[hidden], [inert], [aria-hidden='true']")
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
        if (snapshot.ariaHidden === null)
          snapshot.element.removeAttribute("aria-hidden");
        else snapshot.element.setAttribute("aria-hidden", snapshot.ariaHidden);
      }
      if (snapshot.element.getAttribute("inert") === "") {
        if (snapshot.inert === null) snapshot.element.removeAttribute("inert");
        else snapshot.element.setAttribute("inert", snapshot.inert);
      }
    }
  };
}

/** Render context-aware mobile tabs and the accessible full-navigation dialog. */
export function MobileHeaderNavigation({
  menuOpen,
  menuId,
  panelRef,
  closeMenu,
  isActive,
  isPurposeActive,
  hideBottomTabs = false,
}: MobileHeaderNavigationProps) {
  useBilingualI18nRevision();
  const pathname = usePathname();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);
  const navigationContext = siteNavigationContextForPath(pathname);
  const navigationGroups = siteNavigationGroupsForPath(pathname);
  const mobileTabs = mobileSiteTabsForPath(pathname);
  const menuDescription =
    navigationContext === "studio"
      ? bi(
          "기획부터 검수·내보내기까지, 필요한 단계로 바로 이동하세요",
          "Jump straight to planning, production, review or export"
        )
      : bi(
          "영감을 찾고, 그리고, 함께 나누는 작업실",
          "Discover inspiration, draw and share your work"
        );

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
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
        return;

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
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
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
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[60] min-[1180px]:hidden"
        >
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
            data-site-product={navigationContext}
            className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto overscroll-contain border-b border-line-strong bg-canvas/95 shadow-2xl backdrop-blur-2xl motion-safe:animate-fade-up"
          >
            <div className="sticky top-0 z-10 border-b border-line/60 bg-canvas/92 backdrop-blur-2xl">
              <div className="mx-auto flex min-h-[4.5rem] max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <ToonSpectrumMark className="size-10 rounded-[0.85rem]" />
                  <div className="min-w-0">
                    <span className="block truncate font-display text-sm font-bold text-fg">
                      {navigationContext === "studio"
                        ? "ToonStudio"
                        : t("nav.menu")}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                      {menuDescription}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-autofocus
                  onClick={closeMenu}
                  aria-label={`${t("nav.allMenu")} ${t("common.close")}`}
                  className="grid size-11 shrink-0 place-items-center rounded-[0.9rem] border border-line bg-card text-fg-2 shadow-sm outline-none transition-[border-color,background-color,color,transform] hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <nav className="mx-auto max-w-[1320px] px-4 pb-6 pt-5 sm:px-6 sm:pb-8">
              <aside className="relative mb-4 min-h-40 overflow-hidden rounded-[1.35rem] border border-accent/25 bg-[oklch(0.16_0.035_275)] shadow-[0_20px_60px_-38px_var(--color-accent)] sm:min-h-44">
                <img
                  src="/brand/atelier-world-960.webp"
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover opacity-55"
                />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[oklch(0.13_0.035_275/0.98)] via-[oklch(0.13_0.035_275/0.86)] to-[oklch(0.13_0.035_275/0.3)]" />
                <img
                  src="/brand/toonstudio-visual-identity/ai-creative-director.webp"
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  className="absolute -bottom-8 -right-3 h-40 w-auto object-contain drop-shadow-[0_16px_24px_oklch(0.08_0.04_275/0.65)] sm:h-48"
                />
                <div className="relative z-[1] max-w-[75%] p-4 sm:p-5">
                  <p className="font-display text-[0.62rem] font-black uppercase tracking-[0.18em] text-accent">TOONSTUDIO NAVIGATOR</p>
                  <h2 className="mt-2 font-display text-xl font-black leading-tight text-white sm:text-2xl">
                    {bi("어디서든 같은 제작 흐름", "One studio, every screen")}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/70">
                    {bi("제작·탐색·커뮤니티와 새 기능을 두 번의 탭 안에서 찾으세요.", "Reach creation, discovery, community and every new tool within two taps.")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/studio/new" className="inline-flex min-h-10 items-center rounded-xl bg-accent px-3 text-xs font-black text-on-accent shadow-lg shadow-accent/15">
                      {bi("새 작품", "New work")}
                    </Link>
                    <Link href="/sitemap" className="inline-flex min-h-10 items-center rounded-xl border border-white/20 bg-black/25 px-3 text-xs font-bold text-white backdrop-blur-md">
                      {bi("전체 기능", "All tools")}
                    </Link>
                  </div>
                </div>
              </aside>

              <div className="grid gap-4 lg:grid-cols-2">
                {navigationGroups.map((group, groupIndex) => (
                  <section
                    key={group.id}
                    aria-labelledby={`${menuId}-${group.id}`}
                    className="rounded-2xl border border-line/70 bg-panel/55 p-3 shadow-sm sm:p-4"
                  >
                    <div className="mb-3 flex items-start gap-3 px-1 sm:px-2">
                      <span
                        aria-hidden="true"
                        className="font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent"
                      >
                        0{groupIndex + 1}
                      </span>
                      <div>
                        <h2
                          id={`${menuId}-${group.id}`}
                          className="font-display text-sm font-bold text-fg"
                        >
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
                                <Icon
                                  size={17}
                                  strokeWidth={1.8}
                                  className={
                                    active
                                      ? translateCurrentStaticSourceText(
                                          "shared.components.site.header.mobile.nav",
                                          "en",
                                          "text-accent"
                                        )
                                      : translateCurrentStaticSourceText(
                                          "shared.components.site.header.mobile.nav",
                                          "en",
                                          "text-fg-3 group-hover:text-accent"
                                        )
                                  }
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">
                                  {label}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="mt-0.5 line-clamp-1 block text-[0.68rem] leading-4 text-fg-3"
                                >
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
                      <Icon
                        size={17}
                        className={
                          active
                            ? translateCurrentStaticSourceText(
                                "shared.components.site.header.mobile.nav",
                                "en",
                                "text-on-accent"
                              )
                            : translateCurrentStaticSourceText(
                                "shared.components.site.header.mobile.nav",
                                "en",
                                "text-fg-3 group-hover:text-accent"
                              )
                        }
                      />
                      <span>{label}</span>
                      <span
                        aria-hidden="true"
                        className={cx(
                          "ml-auto text-xs",
                          active ? "text-on-accent/75" : "text-fg-3"
                        )}
                      >
                        ↗
                      </span>
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
          data-site-product={navigationContext}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-panel/92 shadow-[0_-12px_35px_-28px_var(--color-fg)] backdrop-blur-2xl md:hidden"
        >
          <div
            className={cx(
              "mx-auto grid max-w-md pb-[env(safe-area-inset-bottom)]",
              mobileTabs.length === 5 ? "grid-cols-5" : "grid-cols-4"
            )}
          >
            {mobileTabs.map((item) => {
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
                    active ? "text-accent" : "text-fg-3 hover:text-fg"
                  )}
                >
                  <span className="relative grid size-8 place-items-center rounded-xl transition-colors">
                    {active && (
                      <>
                        <span
                          aria-hidden="true"
                          className="absolute -top-2 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-accent"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-xl bg-accent-soft"
                        />
                      </>
                    )}
                    <Icon
                      size={19}
                      strokeWidth={active ? 2.35 : 1.85}
                      className="relative"
                    />
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
