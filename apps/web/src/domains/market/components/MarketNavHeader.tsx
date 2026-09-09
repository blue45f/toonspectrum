import {
  Compass,
  GitCompareArrows,
  Library,
  PackagePlus,
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketNavHeaderProps {
  className?: string;
}

export function MarketNavHeader({ className }: MarketNavHeaderProps) {
  const { pathname } = useLocation();
  const findingAsset =
    pathname === "/market"
    || pathname === "/market/browse"
    || pathname === "/market/fit"
    || pathname === "/market/compare"
    || pathname.startsWith("/market/resource");
  const myAssets = pathname === "/market/library" || pathname === "/market/wishlist";
  const distributing = pathname === "/market/manage" || pathname === "/market/publish";

  const navItems = [
    {
      href: "/market",
      label: "에셋 찾기",
      icon: Compass,
      active: findingAsset,
    },
    {
      href: "/market/library",
      label: "내 에셋",
      icon: Library,
      active: myAssets,
    },
    {
      href: "/market/manage",
      label: "배포 관리",
      icon: PackagePlus,
      active: distributing,
    },
  ] as const;

  const secondaryItems = [
    { href: "/market/browse", label: "상세 탐색", icon: Compass },
    { href: "/market/fit", label: "제작 조건", icon: ShieldCheck },
    { href: "/market/compare", label: "에셋 비교", icon: GitCompareArrows },
  ] as const;

  return (
    <nav
      aria-label="마켓 주요 내비게이션"
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-4 pt-1",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  item.active
                    ? "bg-accent text-on-accent shadow-sm"
                    : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="mt-1 flex max-w-full items-center gap-1 overflow-x-auto" aria-label="마켓 보조 도구">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === "/market/browse" && pathname.startsWith("/market/resource"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[0.68rem] font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3 pointer-coarse:text-xs",
                  active ? "text-accent" : "text-fg-3 hover:text-fg",
                )}
              >
                <Icon className="size-3" aria-hidden="true" />{item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/market/publish"
          className={buttonClass({
            variant: "solid",
            size: "sm",
            className: "gap-1.5",
          })}
        >
          <PackagePlus className="size-3.5" aria-hidden="true" />
          <span>에셋 배포</span>
        </Link>
        <Link
          href="/studio"
          className={buttonClass({
            variant: "outline",
            size: "sm",
            className: "gap-1.5 text-fg-2 hover:text-fg",
          })}
        >
          <Palette className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Studio</span>
        </Link>
      </div>
    </nav>
  );
}
