import {
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  LayoutGrid,
  Menu,
  Palette,
  Search,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { AuthMenuShell } from "../../domains/auth/components/auth-menu-shell";

import {
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  siteNavigationContextForPath,
  siteNavigationLocale,
  siteNavigationText,
  type SiteNavigationText,
} from "./site-navigation";
import { workspaceNavigationActiveId } from "./workspace/workspace-navigation-model";
import { ToonStudioMark } from "./toonstudio-mark";
import { ToonStudioWordmark } from "./toonstudio-brand";
import { PublicSiteAppearanceToggle, PublicSiteJourney } from "./public-site-journey";
import {
  isDiscoverPurposeRoute,
  isPublicCreativeRoute,
} from "./site-public-routes";
import { useSiteHeaderHeight } from "./use-site-header-height";

import { isImmersiveMobileRoute } from "@/app/routes/immersive-mobile-route";
import { usePathname } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";
import { keepInlineText } from "@/shared/lib/text";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useUi } from "@/shared/lib/ui-store";

import "./public-site-shell.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-header", ko, en);

const MobileHeaderNavigation = lazy(() =>
  import("./site-header-mobile-nav").then((mod) => ({
    default: mod.MobileHeaderNavigation,
  }))
);

const EngagementHeaderNotifications = lazy(() =>
  import("@/domains/engagement/EngagementHeaderNotifications").then((module) => ({
    default: module.EngagementHeaderNotifications,
  })),
);

const STUDIO_PRODUCTION_PREFIXES = ["/production"] as const;
const STUDIO_ASSET_PREFIXES = [
  "/studio/assets",
  "/studio/brushes",
  "/studio/bg3d",
  "/studio/poser",
  "/studio/character",
  "/brush-lab",
  "/shaper",
  "/music",
] as const;
const STUDIO_CREATE_PREFIXES = [
  "/studio/new",
  "/studio/import",
  "/make",
] as const;
const STUDIO_LEARN_PREFIXES = ["/learn", "/help", "/guide", "/studio/manual"] as const;
const STUDIO_PUBLISH_PREFIXES = ["/studio/publish", "/publishing"] as const;
const STUDIO_WORK_EXCLUDED_PREFIXES = [
  ...STUDIO_CREATE_PREFIXES,
  ...STUDIO_ASSET_PREFIXES,
  ...STUDIO_LEARN_PREFIXES,
  ...STUDIO_PUBLISH_PREFIXES,
  "/studio/templates",
] as const;
const COMMUNITY_PURPOSE_PREFIXES = [
  "/collaborate",
  "/community",
  "/reviews",
  "/showcase",
  "/create",
  "/pencafe",
] as const;
const MY_PURPOSE_PREFIXES = [
  "/my",
  "/me",
  "/library",
  "/notifications",
  "/messages",
  "/settings",
] as const;

/**
 * Canonical destinations for the header's key actions. Legacy aliases (/new, /more)
 * still redirect through the routes team, but the header links the canonical paths
 * directly so users never depend on the redirect.
 */
const CANONICAL_CREATE_HREF = "/studio/new";

interface HeaderNavigationChild {
  id: string;
  href: string;
  icon: LucideIcon;
  label: SiteNavigationText;
  description: SiteNavigationText;
}

interface HeaderPrimaryNavigationItem {
  id: string;
  href: string;
  icon: LucideIcon;
  label: SiteNavigationText;
  description: SiteNavigationText;
  exact?: boolean;
  children?: readonly HeaderNavigationChild[];
}

/**
 * Header-owned primary navigation: 제작(Studio) / 탐색 / 커뮤니티 / 배우기 / 마켓 / 운세.
 * Dropdowns exist only where they earn their place (탐색, 배우기). Icons and base copy
 * come from the shared navigation model; labels stay in the header's tone contract.
 */
const HEADER_PRIMARY_NAVIGATION: readonly HeaderPrimaryNavigationItem[] = [
  {
    id: "studio",
    href: SITE_NAVIGATION_ITEMS.studio.href,
    icon: SITE_NAVIGATION_ITEMS.studio.icon,
    label: { ko: "제작", en: "Studio" },
    description: SITE_NAVIGATION_ITEMS.studio.description,
  },
  {
    id: "explore",
    href: SITE_NAVIGATION_ITEMS.explore.href,
    icon: SITE_NAVIGATION_ITEMS.explore.icon,
    label: { ko: "탐색", en: "Discover" },
    description: SITE_NAVIGATION_ITEMS.explore.description,
    children: [
      {
        id: "explore-genres",
        href: "/explore",
        icon: LayoutGrid,
        label: { ko: "장르", en: "Genres" },
        description: {
          ko: "장르·태그·플랫폼 조건으로 작품 찾기",
          en: "Browse stories by genre, tag and platform",
        },
      },
      {
        id: "explore-ranking",
        href: "/ranking",
        icon: TrendingUp,
        label: { ko: "랭킹", en: "Rankings" },
        description: {
          ko: "기간과 지표별 인기 흐름",
          en: "Trending stories across periods and signals",
        },
      },
      {
        id: "explore-new",
        href: "/calendar",
        icon: CalendarDays,
        label: { ko: "신작", en: "New releases" },
        description: {
          ko: "요일별 신작과 연재 일정",
          en: "New releases and schedules by weekday",
        },
      },
    ],
  },
  {
    id: "community",
    href: SITE_NAVIGATION_ITEMS.community.href,
    icon: SITE_NAVIGATION_ITEMS.community.icon,
    label: { ko: "커뮤니티", en: "Community" },
    description: SITE_NAVIGATION_ITEMS.community.description,
  },
  {
    id: "learn",
    href: SITE_NAVIGATION_ITEMS.learn.href,
    icon: SITE_NAVIGATION_ITEMS.learn.icon,
    label: { ko: "배우기", en: "Learn" },
    description: SITE_NAVIGATION_ITEMS.learn.description,
    children: [
      {
        id: "learn-classroom",
        href: "/learn/classroom",
        icon: GraduationCap,
        label: { ko: "클래스룸", en: "Classroom" },
        description: {
          ko: "단계별 강좌로 창작 실력 키우기",
          en: "Level up with step-by-step courses",
        },
      },
      {
        id: "learn-guide",
        href: "/guide",
        icon: BookOpen,
        label: { ko: "가이드", en: "Guide" },
        description: {
          ko: "서비스 사용법과 창작 길잡이",
          en: "How-to guides for the service and the craft",
        },
      },
    ],
  },
  {
    id: "market",
    href: SITE_NAVIGATION_ITEMS.market.href,
    icon: SITE_NAVIGATION_ITEMS.market.icon,
    label: { ko: "마켓", en: "Market" },
    description: SITE_NAVIGATION_ITEMS.market.description,
  },
  {
    id: "fortune",
    href: SITE_NAVIGATION_ITEMS.fortune.href,
    icon: SITE_NAVIGATION_ITEMS.fortune.icon,
    label: { ko: "운세", en: "Fortune" },
    description: {
      ko: "오늘의 운세와 타로를 가볍게 확인",
      en: "Check today's fortune and tarot, lightly",
    },
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathMatchesAny(
  pathname: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Return whether a pathname belongs to the Studio work purpose in the header. */
function isStudioWorkPurpose(pathname: string): boolean {
  if (!matchesPrefix(pathname, "/studio")) return false;
  return !pathMatchesAny(pathname, STUDIO_WORK_EXCLUDED_PREFIXES);
}

/** Exact destination state for drawer/utility items. A child page must not make
 * both its purpose hub and the child destination announce aria-current="page". */
function useDestinationActive() {
  useBilingualI18nRevision();
  const path = canonicalSitePath(usePathname());
  return (href: string, exact?: boolean) => {
    const destination = canonicalSitePath(href);
    if (exact) return path === destination;
    return path === destination || path.startsWith(`${destination}/`);
  };
}

/** Broader state used only by the top-level purpose choices. */
function purposeActive(
  pathname: string,
  href: string,
  exact?: boolean
): boolean {
  const destination = TOONSTUDIO_PRIMARY_NAVIGATION.find(
    (item) => item.href === href
  );
  if (destination)
    return workspaceNavigationActiveId(pathname) === destination.id;
  if (href === "/production")
    return pathMatchesAny(pathname, STUDIO_PRODUCTION_PREFIXES);
  if (href === "/studio") return isStudioWorkPurpose(pathname);
  if (href === "/studio/new")
    return pathMatchesAny(pathname, STUDIO_CREATE_PREFIXES);
  if (href === "/studio/assets")
    return pathMatchesAny(pathname, STUDIO_ASSET_PREFIXES);
  if (href === "/studio/publish")
    return pathMatchesAny(pathname, STUDIO_PUBLISH_PREFIXES);
  if (href === "/learn") return pathMatchesAny(pathname, STUDIO_LEARN_PREFIXES);
  if (exact || href === "/") return pathname === href;
  if (href === "/discover") return isDiscoverPurposeRoute(pathname);
  if (href === "/ranking") return matchesPrefix(pathname, "/ranking");
  if (href === "/community")
    return pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES);
  if (href === "/library") return matchesPrefix(pathname, "/library");
  if (href === "/my") return pathMatchesAny(pathname, MY_PURPOSE_PREFIXES);
  if (href === "/market") return matchesPrefix(pathname, "/market");
  return matchesPrefix(pathname, href);
}

function matchesMobileNavigationViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

const DESKTOP_NAVIGATION_QUERY = "(min-width: 1180px)";

function useMobileNavigationViewport() {
  useBilingualI18nRevision();
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
  useBilingualI18nRevision();
  return (
    <nav
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-50 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-line/80 bg-panel/90 backdrop-blur-xl md:hidden"
    />
  );
}

/** One top-level header destination, with an optional hover/focus dropdown.
 * The panel opens on pointer hover and on keyboard focus-within; it is
 * `visibility: hidden` otherwise so its links stay out of the tab order. */
function HeaderPrimaryNavigationEntry({
  item,
  locale,
  isPurposeActive,
  isActive,
}: {
  item: HeaderPrimaryNavigationItem;
  locale: string;
  isPurposeActive: (href: string, exact?: boolean) => boolean;
  isActive: (href: string, exact?: boolean) => boolean;
}) {
  const active = isPurposeActive(item.href, item.exact);
  const activeChild = item.children?.find((child) => isActive(child.href));
  const Icon = item.icon;
  const label = siteNavigationText(item.label, locale);
  const highlighted = active || activeChild !== undefined;

  const link = (
    <Link
      href={item.href}
      aria-current={activeChild ? "true" : active ? "page" : undefined}
      aria-haspopup={item.children ? "true" : undefined}
      title={siteNavigationText(item.description, locale)}
      data-navigation-entry={item.id}
      className="site-header__primary-link group"
    >
      <Icon
        size={15}
        strokeWidth={highlighted ? 2.35 : 1.9}
        aria-hidden="true"
        className={cx(
          "shrink-0 transition-transform",
          highlighted ? "text-accent" : "text-fg-3 group-hover:text-accent"
        )}
      />
      <span>{label}</span>
      {item.children ? (
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="text-fg-3 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180 motion-reduce:transition-none"
        />
      ) : null}
    </Link>
  );

  if (!item.children) return link;

  return (
    <div className="group relative">
      {link}
      <div className="invisible absolute left-0 top-full z-50 w-64 translate-y-1 pt-1 opacity-0 transition-[opacity,transform,visibility] duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
        <ul
          aria-label={label}
          className="rounded-xl border border-line bg-panel p-1.5 shadow-2xl"
        >
          {item.children.map((child) => {
            const childActive = activeChild?.id === child.id;
            const ChildIcon = child.icon;
            return (
              <li key={child.id}>
                <Link
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    childActive
                      ? "bg-accent-soft text-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg"
                  )}
                >
                  <ChildIcon
                    size={16}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {siteNavigationText(child.label, locale)}
                    </span>
                    <span className="block truncate text-xs text-fg-3">
                      {siteNavigationText(child.description, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Render the responsive site header for the active Studio or Spectrum context. */
export function SiteHeader() {
  useBilingualI18nRevision();
  const isActive = useDestinationActive();
  const pathname = usePathname();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const openSearch = useUi((state) => state.openCommandPalette);

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMobileNavigationViewport = useMobileNavigationViewport();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRenderMobileNavigation = menuOpen || isMobileNavigationViewport;
  const hideBottomTabs = isImmersiveMobileRoute(pathname);
  const navigationContext = siteNavigationContextForPath(pathname);
  const isPublicPage = isPublicCreativeRoute(pathname);
  const isHomePage = canonicalSitePath(pathname) === "/";
  const headerRef = useRef<HTMLElement>(null);
  useSiteHeaderHeight(headerRef);
  const create = SITE_NAVIGATION_ITEMS.make;
  const brandHref = "/";
  // ToonStudio is the user-facing product name across public and creator contexts. The
  // navigation contract may change by audience, but the brand must not appear to switch apps.
  const brandName = "ToonStudio";
  const brandDescription =
    navigationContext === "studio"
      ? SITE_NAVIGATION_ITEMS.production.description
      : SITE_NAVIGATION_ITEMS.home.description;
  const brandTagline = bi("이야기를 작품으로", "Bring stories to life");
  const isPurposeActive = (href: string, exact?: boolean) =>
    purposeActive(pathname, href, exact);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true })
    );
  }, [setMenuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const syncScrolled = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setScrolled(window.scrollY > 8)
      );
    };
    syncScrolled();
    window.addEventListener("scroll", syncScrolled, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncScrolled);
    };
  }, []);

  useEffect(() => {
    const desktopNavigation = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const closeAtDesktop = () => {
      if (desktopNavigation.matches) setMenuOpen(false);
    };
    closeAtDesktop();
    desktopNavigation.addEventListener("change", closeAtDesktop);
    return () =>
      desktopNavigation.removeEventListener("change", closeAtDesktop);
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        data-site-chrome="header"
        data-site-product={navigationContext}
        data-public-site={isPublicPage || undefined}
        data-site-home={isHomePage || undefined}
        data-scrolled={scrolled || undefined}
        className="site-header"
      >
        <div className="site-header__inner">
          <Link
            href={brandHref}
            aria-label={`${brandName} · ${siteNavigationText(
              brandDescription,
              locale
            )}`}
            className="site-header__brand group"
          >
            <span className="site-header__brand-mark">
              <ToonStudioMark className="size-7 rounded-md" />
            </span>
            <span className="site-header__brand-copy">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-display text-[1.05rem] font-bold tracking-[-0.02em] text-fg transition-colors group-hover:text-accent sm:text-lg">
                  <ToonStudioWordmark />
                </span>
                <span
                  className="site-header__beta hidden rounded border border-accent/35 bg-accent-soft px-1 py-0.5 font-display text-[0.6rem] font-bold uppercase leading-none tracking-[0.08em] text-accent min-[480px]:inline"
                  title={t("app.brandBeta")}
                >
                  {translateCurrentStaticSourceText(
                    "shared.components.site.header",
                    "en",
                    "BETA"
                  )}
                </span>
              </span>
              <span className="site-header__tagline">
                {brandTagline}
              </span>
            </span>
          </Link>

          <nav
            aria-label={bi("주요 메뉴", "Primary navigation")}
            className="site-header__primary"
          >
            {HEADER_PRIMARY_NAVIGATION.map((item) => (
              <HeaderPrimaryNavigationEntry
                key={item.id}
                item={item}
                locale={locale}
                isPurposeActive={isPurposeActive}
                isActive={isActive}
              />
            ))}
          </nav>

          <div className="site-header__utilities">
            <button
              type="button"
              onClick={openSearch}
              aria-label={t("nav.searchOpen")}
              className="site-header__search group flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-card/80 text-fg-3 outline-none transition-[border-color,background-color,color,box-shadow] duration-150 hover:border-line-strong hover:bg-card hover:text-fg-2 focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:justify-between sm:px-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search
                  size={16}
                  className="shrink-0 transition-colors group-hover:text-accent"
                />
                <span className="site-header__search-label truncate text-sm">
                  {t("nav.search")}
                </span>
              </span>
              <kbd
                aria-hidden="true"
                className="site-header__search-shortcut items-center gap-0.5 rounded border border-line bg-panel px-1 py-0.5 font-display text-[0.62rem] text-fg-3"
              >
                ⌘K
              </kbd>
            </button>

            <Link
              href={CANONICAL_CREATE_HREF}
              aria-label={siteNavigationText(create.label, locale)}
              aria-current={isPurposeActive(create.href) ? "page" : undefined}
              title={siteNavigationText(create.description, locale)}
              className={cx(
                "site-header__create group relative hidden h-11 min-w-11 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-md border px-3 text-sm font-bold [text-wrap:nowrap] [word-break:keep-all] shadow-sm outline-none transition-all duration-200 ease-out-expo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:flex",
                isPurposeActive(create.href)
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong bg-fg text-canvas hover:-translate-y-0.5 hover:border-fg"
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-on-accent/40 to-transparent"
              />
              <Palette
                size={16}
                className="shrink-0 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110"
              />
              <span className="hidden min-w-max whitespace-nowrap xl:inline-block">
                {keepInlineText(siteNavigationText(create.label, locale))}
              </span>
            </Link>

            {isHomePage && <PublicSiteAppearanceToggle locale={locale} className="site-header__appearance" />}

            <Suspense fallback={null}>
              <EngagementHeaderNotifications />
            </Suspense>

            <AuthMenuShell />

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={
                menuOpen
                  ? `${t("nav.allMenu")} ${t("common.close")}`
                  : t("nav.allMenu")
              }
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-card/80 text-fg-2 outline-none transition-[border-color,background-color,color,transform] hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] min-[1180px]:hidden"
            >
              {menuOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {isPublicPage && !isHomePage && (
          <PublicSiteJourney pathname={pathname} locale={locale} />
        )}
      </header>

      {shouldRenderMobileNavigation && (
        <Suspense
          fallback={
            isMobileNavigationViewport && !hideBottomTabs ? (
              <MobileNavigationFallback />
            ) : null
          }
        >
          <MobileHeaderNavigation
            menuOpen={menuOpen}
            menuId={menuId}
            panelRef={panelRef}
            closeMenu={closeMenu}
            isActive={isActive}
            isPurposeActive={isPurposeActive}
            hideBottomTabs={hideBottomTabs}
            isMobileViewport={isMobileNavigationViewport}
          />
        </Suspense>
      )}
    </>
  );
}
