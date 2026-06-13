"use client";

import {
  Search,
  Library,
  Home,
  TrendingUp,
  Compass,
  BarChart3,
  MessageSquareQuote,
  Sparkles,
  CalendarDays,
  MessageCircle,
  Palette,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { AuthMenu } from "./auth/auth-menu";
import { ToonSpectrumMark } from "./visual-marks";

import { useT } from "@/lib/i18n";
import { cn, keepInlineText } from "@/lib/utils";
import { usePathname } from "@/src/compat/navigation";
import Link from "@/src/compat/router-link";

const NAV = [
  { label: "홈", i18n: "nav.home", href: "/", icon: Home, exact: true },
  { label: "랭킹", i18n: "nav.ranking", href: "/ranking", icon: TrendingUp },
  { label: "연재", i18n: "nav.calendar", href: "/calendar", icon: CalendarDays },
  { label: "추천", i18n: "nav.recommend", href: "/recommend", icon: Sparkles },
  { label: "탐색", i18n: "nav.explore", href: "/explore", icon: Compass },
  { label: "리뷰", i18n: "nav.reviews", href: "/reviews", icon: MessageSquareQuote },
  { label: "커뮤니티", i18n: "nav.community", href: "/community", icon: MessageCircle },
  { label: "창작", i18n: "nav.create", href: "/create", icon: Palette },
  { label: "인사이트", i18n: "nav.insights", href: "/insights", icon: BarChart3 },
];

// 모바일 하단 탭바: 빠른 접근용 핵심 4개 (+ 서재). 나머지(연재·리뷰·인사이트)는
// 햄버거 오버플로 메뉴로 모두 도달 가능하다.
const MOBILE_TABS = NAV.filter((n) =>
  ["/", "/ranking", "/recommend", "/explore", "/community"].includes(n.href)
);

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(href + "/");
}

export function SiteHeader() {
  const isActive = useActive();
  const pathname = usePathname();
  const t = useT();
  const openSearch = () => window.dispatchEvent(new Event("toonspectrum:search"));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 라우트 이동 시 오버플로 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 열렸을 때: Esc 닫기 + 배경 스크롤 잠금 + 첫 포커스 이동
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  // 닫힐 때 트리거로 포커스 복귀
  const closeMenu = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/70 bg-panel/85 bg-[linear-gradient(to_bottom,oklch(0.21_0.02_68/0.9),oklch(0.19_0.018_68/0.86))] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 px-4 sm:px-6">
          {/* 로고 */}
          <Link href="/" className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap pr-2">
            <ToonSpectrumMark className="transition-transform duration-150 group-hover:scale-105" />
            <span className="font-display text-lg font-bold text-fg transition-colors group-hover:text-accent">
              툰스펙트럼
            </span>
          </Link>

          {/* 데스크탑 내비 (≥1024px) — 9개 항목이 좁은 폭을 침범하지 않도록 lg에서만 노출.
              텍스트 전용 링크: 항목별 아이콘 박스는 EN 라벨 합산 폭이 컨테이너 상한(1320px)을
              넘겨 어느 뷰포트에서도 한 줄에 들어가지 않는다(아이콘은 오버플로/모바일 메뉴 담당). */}
          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href, n.exact) ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium transition-colors duration-150 xl:px-3",
                  isActive(n.href, n.exact)
                    ? "bg-accent-soft text-accent"
                    : "text-fg-2 hover:bg-raised/70 hover:text-fg"
                )}
              >
                {t(n.i18n)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* 검색 트리거 — lg(1024~1280px)에선 9개 내비와 폭을 절충해 한 단계 좁힘.
                힌트 텍스트는 truncate로 방어하고 ⌘K 배지는 그 구간만 양보(xl부터 복귀) */}
            <button
              onClick={openSearch}
              aria-label={t("nav.searchOpen")}
              className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card/70 px-3 text-sm text-fg-3 transition-all duration-150 hover:border-line-strong hover:bg-card hover:text-fg-2 sm:w-48 sm:justify-between lg:w-40 xl:w-56"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search size={16} className="shrink-0" />
                <span className="hidden truncate sm:inline">{t("nav.search")}</span>
              </span>
              <kbd
                aria-hidden="true"
                className="hidden items-center gap-0.5 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.65rem] sm:flex lg:hidden xl:flex"
              >
                ⌘K
              </kbd>
            </button>

            {/* 내 서재 */}
            <Link
              href="/library"
              aria-label={t("nav.library")}
              aria-current={isActive("/library") ? "page" : undefined}
              className={cn(
                "group flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium [text-wrap:nowrap] [word-break:keep-all] transition-colors",
                isActive("/library")
                  ? "bg-accent text-on-accent"
                  : "border border-line bg-card text-fg-2 hover:text-fg hover:border-line-strong"
              )}
            >
              <Library size={16} className="shrink-0 text-fg-3 transition-colors group-hover:text-accent" />
              <span className="hidden min-w-max whitespace-nowrap [text-wrap:nowrap] [word-break:keep-all] xl:inline-block">
                {keepInlineText(t("nav.library"))}
              </span>
            </Link>
            <AuthMenu />

            {/* 오버플로 메뉴 트리거 (<1024px) — 모든 목적지 도달 보장 */}
            <button
              ref={triggerRef}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("nav.allMenu")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="grid size-10 place-items-center rounded-xl border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg lg:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* 오버플로 메뉴 (<1024px): 9개 목적지 전부 + 내 서재 */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          {/* 백드롭 */}
          <button
            aria-label="메뉴 닫기"
            onClick={closeMenu}
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm motion-safe:animate-fade-up"
          />
          {/* 패널 */}
          <div
            ref={panelRef}
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.allMenu")}
            className="absolute inset-x-0 top-0 border-b border-line-strong bg-panel/95 bg-[linear-gradient(to_bottom,oklch(0.21_0.02_68/0.97),oklch(0.185_0.018_68/0.96))] shadow-2xl shadow-[oklch(0.1_0.02_70/0.5)] backdrop-blur-xl motion-safe:animate-fade-up"
          >
            <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-4 sm:px-6">
              <span className="font-display text-sm font-semibold text-fg-2">{t("nav.menu")}</span>
              <button
                data-autofocus
                onClick={closeMenu}
                aria-label="메뉴 닫기"
                className="grid size-10 place-items-center rounded-xl border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="mx-auto max-w-[1320px] px-3 pb-4 sm:px-5">
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {NAV.map((n) => {
                  const active = isActive(n.href, n.exact);
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-150",
                          active
                            ? "border-accent/35 bg-accent-soft text-accent"
                            : "border-line bg-card/60 text-fg-2 hover:border-line-strong hover:bg-raised/70 hover:text-fg"
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
                            active
                              ? "border-accent/35 bg-canvas/45"
                              : "border-line bg-canvas/40 group-hover:border-line-strong"
                          )}
                        >
                          <n.icon
                            size={16}
                            className={cn(
                              "transition-colors",
                              active ? "text-accent" : "text-fg-3 group-hover:text-accent"
                            )}
                          />
                        </span>
                        {t(n.i18n)}
                      </Link>
                    </li>
                  );
                })}
                <li className="col-span-2 sm:col-span-3">
                  <Link
                    href="/library"
                    aria-current={isActive("/library") ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-150",
                      isActive("/library")
                        ? "border-accent/35 bg-accent text-on-accent"
                        : "border-line bg-card/60 text-fg-2 hover:border-line-strong hover:bg-raised/70 hover:text-fg"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
                        isActive("/library")
                          ? "border-on-accent/25 bg-on-accent/10"
                          : "border-line bg-canvas/40 group-hover:border-line-strong"
                      )}
                    >
                      <Library
                        size={16}
                        className={cn(
                          "transition-colors",
                          isActive("/library") ? "text-on-accent" : "text-fg-3 group-hover:text-accent"
                        )}
                      />
                    </span>
                    {t("nav.library")}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}

      {/* 모바일 하단 탭바 (<768px): 빠른 접근용. 전체 목적지는 상단 햄버거 메뉴 */}
      <nav
        aria-label="빠른 이동"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-panel/90 backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_TABS.map((n) => {
            const active = isActive(n.href, n.exact);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  active ? "text-accent" : "text-fg-3"
                )}
              >
                {active && (
                  <span className="absolute left-1/2 top-0 h-0.5 w-10 -translate-x-1/2 rounded-full bg-accent" />
                )}
                <n.icon size={19} strokeWidth={active ? 2.4 : 1.9} />
                {t(n.i18n)}
              </Link>
            );
          })}
          <Link
            href="/library"
            aria-current={isActive("/library") ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
              isActive("/library") ? "text-accent" : "text-fg-3"
            )}
          >
            <Library size={19} strokeWidth={isActive("/library") ? 2.4 : 1.9} />
            서재
          </Link>
        </div>
      </nav>
    </>
  );
}
