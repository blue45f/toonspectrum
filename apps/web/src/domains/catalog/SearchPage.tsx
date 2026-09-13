import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import "./search-page-layout.css";

import type { PlatformId } from "@/shared/lib/types";

import { SearchExplorer } from "@/shared/components/search-explorer";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import Link from "@/compat/router-link";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialFree = searchParams.get("free") === "1";
  const platformIds = new Set(PLATFORM_LIST.map((platform) => platform.id));
  const initialPlatforms = [...new Set((searchParams.get("platforms") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is PlatformId => platformIds.has(entry as PlatformId)))].sort();
  // URL-driven navigation on the same route must not keep an older explorer's
  // useState initializers. Unrelated query parameters do not reset local filters.
  const explorerKey = JSON.stringify([initialQuery, initialFree, initialPlatforms]);
  const t = useT();

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <header className="mb-6 rounded-2xl border border-line bg-panel/45 p-4 sm:mb-8 sm:p-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft/45 px-2.5 py-1 text-xs font-medium text-accent sm:mb-4">
          <Search size={14} aria-hidden="true" />
          {t("search.badge")}
        </div>
        <h1 className="text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight [word-break:keep-all] sm:text-4xl">
          {t("search.title")}
        </h1>
        <p className="lede mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
          {t("search.subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-6">
          <a href="#toonspectrum-search-explorer-top" className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}>
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t("search.filterButton")}
          </a>
          <Link href="/ranking" className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}>
            <Search size={14} aria-hidden="true" />
            {t("search.compareFromRanking")}
          </Link>
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-3 text-xs text-fg-3">
          <span>{t("search.currentQuery")}: <span className="text-fg-2">{initialQuery ? `"${initialQuery}"` : t("search.queryAll")}</span></span>
          <span className="h-1 w-1 rounded-full bg-fg-3" aria-hidden="true" />
          <span>{t("search.freeOnlyLabel")}: {initialFree ? "ON" : "OFF"}</span>
        </p>
      </header>
      <div id="toonspectrum-search-explorer-top" tabIndex={-1} className="search-page-results [scroll-margin-top:var(--site-header-sticky-offset)] outline-none">
        <SearchExplorer key={explorerKey} initialQuery={initialQuery} initialFree={initialFree} initialPlatforms={initialPlatforms} />
      </div>
    </Container>
  );
}
