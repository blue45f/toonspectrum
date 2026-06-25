"use client";

import {
  BarChart3,
  CalendarDays,
  Compass,
  Home,
  Library,
  MessageCircle,
  MessageSquareQuote,
  Palette,
  Sparkles,
  TrendingUp,
  X,
  Moon,
  Gamepad2,
} from "lucide-react";
import { useEffect, type RefObject } from "react";

import { cx } from "@/lib/cx";
import { useT } from "@/lib/i18n";
import Link from "@/src/compat/router-link";

const MOBILE_NAV = [
  { label: "홈", i18n: "nav.home", href: "/", icon: Home, exact: true },
  { label: "랭킹", i18n: "nav.ranking", href: "/ranking", icon: TrendingUp },
  { label: "연재", i18n: "nav.calendar", href: "/calendar", icon: CalendarDays },
  { label: "추천", i18n: "nav.recommend", href: "/recommend", icon: Sparkles },
  { label: "탐색", i18n: "nav.explore", href: "/explore", icon: Compass },
  { label: "운세", i18n: "nav.fortune", href: "/fortune", icon: Moon },
  { label: "놀이터", i18n: "nav.play", href: "/play", icon: Gamepad2 },
  { label: "리뷰", i18n: "nav.reviews", href: "/reviews", icon: MessageSquareQuote },
  { label: "커뮤니티", i18n: "nav.community", href: "/community", icon: MessageCircle },
  { label: "창작", i18n: "nav.create", href: "/create", icon: Palette },
  { label: "인사이트", i18n: "nav.insights", href: "/insights", icon: BarChart3 },
];

// 모바일 하단 탭바: 빠른 접근용 핵심 4개 (+ 서재). 나머지(연재·리뷰·인사이트)는
// 햄버거 오버플로 메뉴로 모두 도달 가능하다.
const MOBILE_TABS = MOBILE_NAV.filter((n) =>
  ["/", "/ranking", "/recommend", "/explore", "/community"].includes(n.href)
);

interface MobileHeaderNavigationProps {
  menuOpen: boolean;
  menuId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  closeMenu: () => void;
  isActive: (href: string, exact?: boolean) => boolean;
}

export function MobileHeaderNavigation({
  menuOpen,
  menuId,
  panelRef,
  closeMenu,
  isActive,
}: MobileHeaderNavigationProps) {
  const t = useT();

  useEffect(() => {
    if (!menuOpen) return;
    const focusId = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    });
    return () => window.cancelAnimationFrame(focusId);
  }, [menuOpen, panelRef]);

  return (
    <>
      {/* 오버플로 메뉴 (<1024px): 9개 목적지 전부 + 내 서재 */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            aria-label="메뉴 닫기"
            onClick={closeMenu}
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm motion-safe:animate-fade-up"
          />
          <div
            ref={panelRef}
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.allMenu")}
            className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b border-line-strong bg-gradient-to-b from-panel/95 to-card/90 shadow-2xl shadow-[oklch(0.1_0.02_70/0.5)] backdrop-blur-xl motion-safe:animate-fade-up"
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
                {MOBILE_NAV.map((n) => {
                  const active = isActive(n.href, n.exact);
                  const Icon = n.icon;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-150",
                          active
                            ? "border-accent/35 bg-accent-soft text-accent"
                            : "border-line bg-card/60 text-fg-2 hover:border-line-strong hover:bg-raised/70 hover:text-fg"
                        )}
                      >
                        <span
                          className={cx(
                            "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
                            active
                              ? "border-accent/35 bg-canvas/45"
                              : "border-line bg-canvas/40 group-hover:border-line-strong"
                          )}
                        >
                          <Icon
                            size={16}
                            className={cx(
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
                    className={cx(
                      "group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-150",
                      isActive("/library")
                        ? "border-accent/35 bg-accent text-on-accent"
                        : "border-line bg-card/60 text-fg-2 hover:border-line-strong hover:bg-raised/70 hover:text-fg"
                    )}
                  >
                    <span
                      className={cx(
                        "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150",
                        isActive("/library")
                          ? "border-on-accent/25 bg-on-accent/10"
                          : "border-line bg-canvas/40 group-hover:border-line-strong"
                      )}
                    >
                      <Library
                        size={16}
                        className={cx(
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
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  active ? "text-accent" : "text-fg-3"
                )}
              >
                {active && (
                  <span className="absolute left-1/2 top-0 h-0.5 w-10 -translate-x-1/2 rounded-full bg-accent" />
                )}
                <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
                {t(n.i18n)}
              </Link>
            );
          })}
          <Link
            href="/library"
            aria-current={isActive("/library") ? "page" : undefined}
            className={cx(
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
