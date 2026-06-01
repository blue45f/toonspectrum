"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { spectrumGradient } from "@/lib/genre-color";
import { AuthMenu } from "./auth/auth-menu";

const NAV = [
  { label: "홈", href: "/", icon: Home, exact: true },
  { label: "랭킹", href: "/ranking", icon: TrendingUp },
  { label: "연재", href: "/calendar", icon: CalendarDays },
  { label: "추천", href: "/recommend", icon: Sparkles },
  { label: "탐색", href: "/explore", icon: Compass },
  { label: "리뷰", href: "/reviews", icon: MessageSquareQuote },
  { label: "커뮤니티", href: "/community", icon: MessageCircle },
  { label: "인사이트", href: "/insights", icon: BarChart3 },
];

// 모바일 하단 탭바는 핵심 4개만 (+ 서재)
const MOBILE_NAV = NAV.filter((n) =>
  ["/", "/ranking", "/recommend", "/explore", "/community", "/reviews"].includes(n.href)
);

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(href + "/");
}

const mark = spectrumGradient(["로맨스", "판타지", "액션", "SF"], 135);

export function SiteHeader() {
  const isActive = useActive();
  const openSearch = () => window.dispatchEvent(new Event("webdex:search"));

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-panel/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 px-4 sm:px-6">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2.5 pr-2">
            <span
              className="size-7 rounded-[0.5rem] ring-1 ring-white/10"
              style={{ background: mark }}
              aria-hidden
            />
            <span className="font-display text-lg font-bold tracking-[-0.02em] text-fg">
              WEBDEX
            </span>
          </Link>

          {/* 데스크탑 내비 */}
          <nav className="ml-2 hidden items-center gap-0.5 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive(n.href, n.exact)
                    ? "bg-raised text-fg"
                    : "text-fg-2 hover:bg-raised/60 hover:text-fg"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* 검색 트리거 */}
            <button
              onClick={openSearch}
              className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 sm:w-56 sm:justify-between"
            >
              <span className="flex items-center gap-2">
                <Search size={16} />
                <span className="hidden sm:inline">작품·작가·태그 검색</span>
              </span>
              <kbd className="hidden items-center gap-0.5 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.65rem] sm:flex">
                ⌘K
              </kbd>
            </button>

            {/* 내 서재 */}
            <Link
              href="/library"
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive("/library")
                  ? "bg-accent text-on-accent"
                  : "border border-line bg-card text-fg-2 hover:text-fg hover:border-line-strong"
              )}
            >
              <Library size={16} />
              <span className="hidden lg:inline">내 서재</span>
            </Link>
            <AuthMenu />
          </div>
        </div>
      </header>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-7">
          {MOBILE_NAV.map((n) => {
            const active = isActive(n.href, n.exact);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  active ? "text-accent" : "text-fg-3"
                )}
              >
                <n.icon size={19} strokeWidth={active ? 2.4 : 1.9} />
                {n.label}
              </Link>
            );
          })}
          <Link
            href="/library"
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
