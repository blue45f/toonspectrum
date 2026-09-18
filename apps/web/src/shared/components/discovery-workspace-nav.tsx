import { Compass, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import {
  catalogDiscoveryHref,
  type CatalogDiscoveryMode,
} from "@/shared/lib/catalog-discovery-state";

import { cn } from "@/shared/lib/utils";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("discovery-workspace-nav", ko, en);

interface DiscoveryDestination {
  readonly id: CatalogDiscoveryMode;
  readonly icon: LucideIcon;
  readonly ko: string;
  readonly en: string;
  readonly koDescription: string;
  readonly enDescription: string;
}

const DESTINATIONS: readonly DiscoveryDestination[] = [
  {
    id: "search",
    icon: Search,
    ko: "바로 찾기",
    en: "Search",
    koDescription: "제목·작가·태그를 검색",
    enDescription: "Search titles, creators and tags",
  },
  {
    id: "explore",
    icon: Compass,
    ko: "조건으로 둘러보기",
    en: "Explore",
    koDescription: "장르·분위기·상태로 좁히기",
    enDescription: "Browse by genre, mood and status",
  },
  {
    id: "recommend",
    icon: Sparkles,
    ko: "취향 추천",
    en: "Recommendations",
    koDescription: "선택과 평가로 추천 다듬기",
    enDescription: "Shape recommendations with feedback",
  },
] as const;

export function DiscoveryWorkspaceNav({
  current,
  className,
}: {
  readonly current: CatalogDiscoveryMode;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const [params] = useSearchParams();



  return (
    <nav
      aria-label={bi("작품 발견 방식", "Discovery modes")}
      className={cn(
        "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="grid min-w-[42rem] grid-cols-3 gap-2 sm:min-w-0">
        {DESTINATIONS.map((destination) => {
          const active = destination.id === current;
          const Icon = destination.icon;
          return (
            <Link
              key={destination.id}
              href={catalogDiscoveryHref(destination.id, params)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 transition-[border-color,background-color,transform]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent/55 bg-accent-soft text-fg"
                  : "border-line bg-card/75 text-fg-2 hover:-translate-y-0.5 hover:border-line-strong hover:bg-card",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl border",
                  active
                    ? "border-accent/35 bg-accent/15 text-accent"
                    : "border-line bg-panel text-fg-3 group-hover:text-accent",
                )}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-bold">
                  {bi(destination.ko, destination.en)}
                </strong>
                <span className="mt-0.5 block truncate text-[0.7rem] text-fg-3">
                  {bi(destination.koDescription, destination.enDescription)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
