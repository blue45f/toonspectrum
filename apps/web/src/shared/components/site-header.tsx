import {
  Menu,
  Palette,
  Search,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";

import { AuthMenuShell } from "../../domains/auth/components/auth-menu-shell";

import {
  PRIMARY_SITE_NAVIGATION,
  SITE_NAVIGATION_ITEMS,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";
import { ToonSpectrumMark } from "./visual-marks";

import { isImmersiveMobileRoute } from "@/app/routes/immersive-mobile-route";
import { usePathname } from "@/compat/navigation";
import Link from "@/compat/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";
import { keepInlineText } from "@/shared/lib/text";
import { useUi } from "@/shared/lib/ui-store";

const MobileHeaderNavigation = lazy(() =>
  import("./site-header-mobile-nav").then((mod) => ({ default: mod.MobileHeaderNavigation }))
);

const DISCOVER_PURPOSE_PREFIXES = [
  "/discover",
  "/search",
  "/explore",
  "/ranking",
  "/recommend",
  "/calendar",
  "/compare",
  "/random",
  "/tags",
  "/authors",
  "/author",
  "/title",
] as const;
const CREATE_PURPOSE_PREFIXES = [
  "/make",
  "/studio",
  "/shaper",
  "/brush-lab",
  "/music",
  "/research",
  "/story-lab",
  "/publishing",
  "/opportunities",
] as const;
const MARKET_PURPOSE_PREFIXES = ["/market"] as const;
const COMMUNITY_PURPOSE_PREFIXES = [
  "/community",
  "/reviews",
  "/create",
  "/pencafe",
] as const;
const MY_PURPOSE_PREFIXES = [
  "/my",
  "/me",
  "/library",
  "/settings",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathMatchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Exact destination state for drawer/utility items. A child page must not make
 * both its purpose hub and the child destination announce aria-current="page". */
function useDestinationActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => {
    if (exact) return path === href;
    return path === href || path.startsWith(`${href}/`);
  };
}

/** Broader state used only by the top-level purpose choices. */
function purposeActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/") return pathname === href;
  if (href === "/discover") return pathMatchesAny(pathname, DISCOVER_PURPOSE_PREFIXES);
  if (href === "/make") return pathMatchesAny(pathname, CREATE_PURPOSE_PREFIXES);
  if (href === "/market") return pathMatchesAny(pathname, MARKET_PURPOSE_PREFIXES);
  if (href === "/community") return pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES);
  if (href === "/my") return pathMatchesAny(pathname, MY_PURPOSE_PREFIXES);
  return matchesPrefix(pathname, href);
}

function matchesMobileNavigationViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

const DESKTOP_NAVIGATION_QUERY = "(min-width: 1180px)";

function useMobileNavigationViewport() {
  const [isMobile, setIsMobile] = useState(matchesMobileNavigationViewport);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

function MobileNavigationFallback() {
  return (
    <nav
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-50 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-line/80 bg-panel/90 backdrop-blur-xl md:hidden"
    />
  );
}

export function SiteHeader() {
  const isActive = useDestinationActive();
  const pathname = usePathname();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const openSearch = useUi((state) => state.openCommandPalette);

  const [menuOpen, setMenuOpen] = useState(false);
  const isMobileNavigationViewport = useMobileNavigationViewport();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRenderMobileNavigation = menuOpen || isMobileNavigationViewport;
  const hideBottomTabs = isImmersiveMobileRoute(pathname);
  const create = SITE_NAVIGATION_ITEMS.make;
  const isPurposeActive = (href: string, exact?: boolean) => purposeActive(pathname, href, exact);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, [setMenuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktopNavigation = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const closeAtDesktop = () => {
      if (desktopNavigation.matches) setMenuOpen(false);
    };
    closeAtDesktop();
    desktopNavigation.addEventListener("change", closeAtDesktop);
    return () => desktopNavigation.removeEventListener("change", closeAtDesktop);
  }, []);

  return (
    <>
      <header
        data-site-chrome="header"
        className="sticky top-0 z-50 border-b border-line/70 bg-canvas/80 shadow-sm backdrop-blur-2xl"
      >
        <div className="mx-auto flex h-[4.25rem] max-w-[1320px] items-center gap-2 px-4 sm:px-6">
          <Link
            href="/"
            aria-label={`${t("app.name")} · ${siteNavigationText(SITE_NAVIGATION_ITEMS.home.description, locale)}`}
            className="group flex min-w-0 shrink-0 items-center gap-2.5 whitespace-nowrap pr-1 sm:pr-3"
          >
            <span className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-line/70 bg-panel/85 shadow-sm transition-transform duration-200 ease-out-expo group-hover:-rotate-3 group-hover:scale-[1.03]">
              <ToonSpectrumMark className="size-7" />
              <span aria-hidden="true" className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-canvas bg-accent" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-display text-[1.05rem] font-bold tracking-[-0.02em] text-fg transition-colors group-hover:text-accent sm:text-lg">
                  {t("app.name")}
                </span>
                <span
                  className="hidden rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 font-display text-[0.55rem] font-bold uppercase leading-none tracking-[0.12em] text-accent min-[410px]:inline"
                  title={t("app.brandBeta")}
                >
                  BETA
                </span>
              </span>
              <span className="hidden font-display text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-fg-3 lg:block">
                Create · Share · Discover
              </span>
            </span>
          </Link>

          <nav
            aria-label={locale === "ko" ? "주요 메뉴" : "Primary navigation"}
            className="ml-2 hidden items-center gap-0.5 rounded-2xl border border-line/60 bg-panel/60 p-1 shadow-sm min-[1180px]:flex"
          >
            {PRIMARY_SITE_NAVIGATION.map((item) => {
              const active = isPurposeActive(item.href, item.exact);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={siteNavigationText(item.description, locale)}
                  className={cx(
                    "relative inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[0.82rem] font-semibold transition-all duration-150",
                    active
                      ? "bg-card text-accent shadow-sm"
                      : "text-fg-2 hover:bg-raised/70 hover:text-fg"
                  )}
                >
                  {siteNavigationText(item.label, locale)}
                  {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
            <Link
              href="/sitemap"
              title={locale === "ko" ? "목적별 전체 메뉴 보기" : "Browse every destination by purpose"}
              className="inline-flex min-h-9 items-center rounded-xl px-3 py-2 text-[0.82rem] font-semibold text-fg-2 transition-colors hover:bg-raised/70 hover:text-fg"
            >
              {t("nav.allMenu")}
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={openSearch}
              aria-label={t("nav.searchOpen")}
              className="group flex size-11 items-center justify-center rounded-xl border border-line bg-card/75 text-fg-3 shadow-sm transition-all duration-150 hover:border-line-strong hover:bg-card hover:text-fg-2 sm:w-48 sm:justify-between sm:px-3 lg:w-40 xl:w-52"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search size={16} className="shrink-0 transition-colors group-hover:text-accent" />
                <span className="hidden truncate text-sm sm:inline">{t("nav.search")}</span>
              </span>
              <kbd
                aria-hidden="true"
                className="hidden items-center gap-0.5 rounded-md border border-line bg-panel px-1.5 py-0.5 font-display text-[0.62rem] text-fg-3 sm:flex lg:hidden xl:flex"
              >
                ⌘K
              </kbd>
            </button>

            <Link
              href={create.href}
              aria-label={siteNavigationText(create.label, locale)}
              aria-current={isPurposeActive(create.href) ? "page" : undefined}
              title={siteNavigationText(create.description, locale)}
              className={cx(
                "group relative hidden h-11 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border px-3 text-sm font-bold [text-wrap:nowrap] [word-break:keep-all] shadow-sm transition-all duration-200 ease-out-expo sm:flex",
                isPurposeActive(create.href)
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong bg-fg text-canvas hover:-translate-y-0.5 hover:border-fg"
              )}
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-on-accent/40 to-transparent" />
              <Palette size={16} className="shrink-0 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" />
              <span className="hidden min-w-max whitespace-nowrap xl:inline-block">
                {keepInlineText(siteNavigationText(create.label, locale))}
              </span>
            </Link>

            <AuthMenuShell />

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t("nav.allMenu")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="grid size-11 place-items-center rounded-xl border border-line bg-card/80 text-fg-2 shadow-sm transition-colors hover:border-line-strong hover:bg-raised hover:text-fg min-[1180px]:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {shouldRenderMobileNavigation && (
        <Suspense fallback={isMobileNavigationViewport && !hideBottomTabs ? <MobileNavigationFallback /> : null}>
          <MobileHeaderNavigation
            menuOpen={menuOpen}
            menuId={menuId}
            panelRef={panelRef}
            closeMenu={closeMenu}
            isActive={isActive}
            isPurposeActive={isPurposeActive}
            hideBottomTabs={hideBottomTabs}
          />
        </Suspense>
      )}
    </>
  );
}
