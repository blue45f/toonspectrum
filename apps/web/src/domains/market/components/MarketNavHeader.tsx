import {
  Boxes,
  ChevronDown,
  GitCompareArrows,
  Heart,
  Library,
  PackagePlus,
  Palette,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketNavHeaderProps {
  readonly className?: string;
}

type MarketPlaceId = "find" | "library" | "wishlist" | "distribute";

const MARKET_PLACES: ReadonlyArray<{
  readonly id: MarketPlaceId;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: readonly [string, string];
}> = [
  { id: "find", href: "/market", icon: Search, label: ["찾아보기", "Browse"] },
  { id: "library", href: "/market/library", icon: Library, label: ["내 에셋", "My assets"] },
  { id: "wishlist", href: "/market/wishlist", icon: Heart, label: ["찜 목록", "Wishlist"] },
  { id: "distribute", href: "/market/manage", icon: PackagePlus, label: ["배포하기", "Distribute"] },
];

/** 후보를 고른 뒤 쓰는 보조 도구 — 상단 탭이 아니라 "선택 도구"로 묶는다. */
const SELECTION_TOOLS: ReadonlyArray<{
  readonly href: "/market/fit" | "/market/compare";
  readonly icon: LucideIcon;
  readonly shortLabel: readonly [string, string];
  readonly label: readonly [string, string];
}> = [
  { href: "/market/fit", icon: ShieldCheck, shortLabel: ["조건 맞춤", "Fit check"], label: ["제작 조건으로 맞는 리소스 찾기", "Find resources that fit your production"] },
  { href: "/market/compare", icon: GitCompareArrows, shortLabel: ["후보 비교", "Compare"], label: ["후보 리소스 비교하기", "Compare candidate resources"] },
];

/** 현재 경로가 어느 마켓 장소에 속하는지 — 강조 표시(active)와 정확한 현재 위치(current)를 나눈다. */
function marketPlaceState(id: MarketPlaceId, pathname: string, findingAsset: boolean) {
  switch (id) {
    case "find":
      return { active: findingAsset, current: pathname === "/market" };
    case "library":
      return { active: pathname === "/market/library", current: pathname === "/market/library" };
    case "wishlist":
      return { active: pathname === "/market/wishlist", current: pathname === "/market/wishlist" };
    case "distribute": {
      const distributing = pathname === "/market/manage" || pathname === "/market/publish";
      return { active: distributing, current: distributing };
    }
  }
}

function isFindingAsset(pathname: string): boolean {
  return pathname === "/market"
    || pathname === "/market/browse"
    || pathname === "/market/fit"
    || pathname === "/market/compare"
    || pathname.startsWith("/market/resource");
}

/**
 * 모든 마켓 화면 맨 위에 같은 자리로 두는 스토어 내비게이션.
 * 좁은 화면에서는 네 장소를 4열 격자로 모두 보여 줘 가로 스크롤에 숨지 않게 한다.
 */
export function MarketNavHeader({ className }: MarketNavHeaderProps) {
  const bt = useBilingual("MarketNavHeader");
  const { pathname } = useLocation();
  const findingAsset = isFindingAsset(pathname);
  const toolOpen = SELECTION_TOOLS.some((tool) => tool.href === pathname);

  return (
    <nav aria-label={bt("마켓 주요 내비게이션", "Market navigation")} className={cn("mb-6 border-b border-line/70 pb-4 pt-1", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line/60 pb-2">
        <Link href="/market" className="inline-flex min-h-11 items-center gap-2 text-xs font-bold tracking-[.08em] text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />{bt("TOONSTUDIO / 웹툰 소재 작업실", "TOONSTUDIO / WEBTOON MATERIALS")}</Link>
        <div className="flex items-center gap-4 text-xs text-fg-2"><Link href="/research/assets" className="inline-flex min-h-11 items-center hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bt("장면 레퍼런스", "Scene references")}</Link><Link href="/learn" className="inline-flex min-h-11 items-center hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{bt("제작 강좌 ↗", "Production lessons ↗")}</Link></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center">
          {MARKET_PLACES.map((place) => {
            const Icon = place.icon;
            const { active, current } = marketPlaceState(place.id, pathname, findingAsset);
            return (
              <Link
                key={place.id}
                href={place.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1.5 text-xs font-bold transition-colors",
                  "sm:min-h-11 sm:shrink-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  active ? "bg-accent text-on-accent" : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0 sm:size-3.5" aria-hidden="true" />
                {bt(...place.label)}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {findingAsset ? (
            <div className="grid flex-1 grid-cols-2 gap-2 sm:hidden">
              {SELECTION_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const current = pathname === tool.href;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 text-xs font-bold",
                      current ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-card text-fg-2",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {bt(...tool.shortLabel)}
                  </Link>
                );
              })}
            </div>
          ) : null}
          {findingAsset ? (
            <details className="group relative hidden sm:block" open={toolOpen ? true : undefined}>
              <summary
                className={cn(
                  buttonClass({ variant: "ghost", size: "sm" }),
                  "cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden",
                )}
              >
                <Boxes className="size-3.5" aria-hidden="true" />
                {bt("선택 도구", "Selection tools")}
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-2xl border border-line bg-panel p-2 shadow-xl">
                <p className="px-2 pb-2 pt-1 text-xs leading-5 text-fg-3">
                  {bt("후보를 찾은 뒤 호환성을 점검하거나 여러 리소스를 비교할 때 사용하세요.", "Use these after finding candidates to check compatibility or compare resources.")}
                </p>
                {SELECTION_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      aria-current={pathname === tool.href ? "page" : undefined}
                      className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                    >
                      <Icon className="size-4 text-accent" aria-hidden="true" />
                      {bt(...tool.label)}
                    </Link>
                  );
                })}
              </div>
            </details>
          ) : null}
          <Link href="/studio" aria-label={bt("ToonStudio 드로잉 화면 열기", "Open the ToonStudio drawing screen")} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 shrink-0 gap-1.5" })}>
            <Palette className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Studio</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
