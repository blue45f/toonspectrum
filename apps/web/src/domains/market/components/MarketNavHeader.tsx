import {
  Compass,
  GitCompareArrows,
  Library,
  PackagePlus,
  Palette,
  Store,
  UserCheck,
} from "lucide-react";
import { useLocation } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/src/compat/router-link";

interface MarketNavHeaderProps {
  className?: string;
}

export function MarketNavHeader({ className }: MarketNavHeaderProps) {
  const { pathname } = useLocation();
  const navItems = [
    {
      href: "/market",
      label: "추천",
      icon: Store,
      active: pathname === "/market",
    },
    {
      href: "/market/browse",
      label: "탐색",
      icon: Compass,
      active: pathname === "/market/browse" || pathname.startsWith("/market/resource"),
    },
    {
      href: "/market/library",
      label: "내 에셋",
      icon: Library,
      active: pathname === "/market/library",
    },
    {
      href: "/market/compare",
      label: "에셋 비교",
      icon: GitCompareArrows,
      active: pathname === "/market/compare",
    },
    {
      href: "/market/manage",
      label: "판매자 센터",
      icon: UserCheck,
      active: pathname === "/market/manage" || pathname === "/market/publish",
    },
  ] as const;

  return (
    <nav
      aria-label="마켓 주요 내비게이션"
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-4 pt-1",
        className,
      )}
    >
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
          <span>에셋 등록</span>
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
