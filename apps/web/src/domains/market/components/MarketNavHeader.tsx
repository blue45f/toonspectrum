import {
  Boxes,
  ChevronDown,
  GitCompareArrows,
  Library,
  PackagePlus,
  Palette,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "react-router-dom";

import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
} from "../models/market-resource-taxonomy";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketNavHeaderProps {
  className?: string;
}

function familyIsActive(
  familyId: (typeof MARKET_RESOURCE_FAMILIES)[number]["id"],
  kind: string | null,
): boolean {
  if (familyId === "template") return kind === "template";
  if (familyId === "2d") return kind === "asset";
  if (familyId === "3d") return kind === "3d-asset" || kind === "3d-preset";
  if (familyId === "brush") return kind === "brush";
  return kind === "palette" || kind === "filter";
}

export function MarketNavHeader({ className }: MarketNavHeaderProps) {
  const { pathname, search } = useLocation();
  const kind = new URLSearchParams(search).get("kind");
  const findingAsset =
    pathname === "/market"
    || pathname === "/market/browse"
    || pathname === "/market/fit"
    || pathname === "/market/compare"
    || pathname.startsWith("/market/resource");
  const myAssets = pathname === "/market/library" || pathname === "/market/wishlist";
  const distributing = pathname === "/market/manage" || pathname === "/market/publish";

  return (
    <nav aria-label="마켓 주요 내비게이션" className={cn("mb-6 border-b border-line/70 pb-4 pt-1", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line/60 pb-2">
        <Link href="/market" className="inline-flex min-h-11 items-center gap-2 text-[0.65rem] font-bold tracking-[.12em] text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />TOONSTUDIO / 웹툰 소재 작업실</Link>
        <div className="flex items-center gap-4 text-xs text-fg-2"><Link href="/research/assets" className="inline-flex min-h-11 items-center hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">장면 레퍼런스</Link><Link href="/learn" className="inline-flex min-h-11 items-center hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">제작 강좌 ↗</Link></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto py-1">
          <Link
            href="/market"
            aria-current={pathname === "/market" ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors pointer-coarse:min-h-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              findingAsset ? "bg-accent text-on-accent" : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Search className="size-3.5" aria-hidden="true" />
            찾아보기
          </Link>
          <Link
            href="/market/library"
            aria-current={myAssets ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors pointer-coarse:min-h-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              myAssets ? "bg-accent text-on-accent" : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Library className="size-3.5" aria-hidden="true" />
            내 리소스
          </Link>
          <Link
            href="/market/manage"
            aria-current={distributing ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors pointer-coarse:min-h-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              distributing ? "bg-accent text-on-accent" : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <PackagePlus className="size-3.5" aria-hidden="true" />
            배포하기
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {findingAsset ? (
            <details className="group relative" open={pathname === "/market/fit" || pathname === "/market/compare" ? true : undefined}>
              <summary
                className={cn(
                  buttonClass({ variant: "ghost", size: "sm" }),
                  "cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden",
                )}
              >
                <Boxes className="size-3.5" aria-hidden="true" />
                선택 도구
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-2xl border border-line bg-panel p-2 shadow-xl">
                <p className="px-2 pb-2 pt-1 text-[0.65rem] leading-5 text-fg-3">
                  후보를 찾은 뒤 호환성을 점검하거나 여러 리소스를 비교할 때 사용하세요.
                </p>
                <Link
                  href="/market/fit"
                  aria-current={pathname === "/market/fit" ? "page" : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                >
                  <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                  제작 조건으로 맞는 리소스 찾기
                </Link>
                <Link
                  href="/market/compare"
                  aria-current={pathname === "/market/compare" ? "page" : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                >
                  <GitCompareArrows className="size-4 text-accent" aria-hidden="true" />
                  후보 리소스 비교하기
                </Link>
              </div>
            </details>
          ) : null}
          <Link href="/studio" aria-label="ToonStudio 드로잉 화면 열기" className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <Palette className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Studio</span>
          </Link>
        </div>
      </div>

      {findingAsset ? (
        <div className="mt-3 border-t border-line/50 pt-3">
          <p className="mb-2 text-[0.65rem] font-semibold text-fg-3">무엇을 찾고 있나요?</p>
          <div className="flex max-w-full items-stretch gap-1.5 overflow-x-auto pb-1">
            <Link
              href="/market/browse"
              aria-current={!kind && pathname === "/market/browse" ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-xs font-semibold transition-colors",
                !kind && pathname === "/market/browse"
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              전체
            </Link>
            {MARKET_RESOURCE_FAMILIES.map((family) => {
              const Icon = family.icon;
              const active = familyIsActive(family.id, kind);
              return (
                <Link
                  key={family.id}
                  href={marketResourceBrowseHref(family.subcategories[0])}
                  aria-current={active && pathname === "/market/browse" ? "location" : undefined}
                  className={cn(
                    "group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Icon className="size-4" style={active ? undefined : { color: `oklch(0.72 0.11 ${family.accentHue})` }} aria-hidden="true" />
                  {family.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
