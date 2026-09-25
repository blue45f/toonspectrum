import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import "./search-page-layout.css";

import { SearchExplorer } from "@/shared/components/search-explorer";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  const freeOnly =
    state.filters.pricing.length > 0 &&
    state.filters.pricing.every(
      (pricing) => pricing === "free" || pricing === "wait-free",
    );
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
          <a
            href="#toonspectrum-search-explorer-top"
            className={buttonClass({
              size: "sm",
              variant: "solid",
              className: "gap-1.5",
            })}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t("search.filterButton")}
          </a>
          <Link
            href="/ranking"
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "gap-1.5",
            })}
          >
            <Search size={14} aria-hidden="true" />
            {t("search.compareFromRanking")}
          </Link>
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-3 text-xs text-fg-3">
          <span>
            {t("search.currentQuery")}:{" "}
            <span className="text-fg-2">
              {state.query ? `"${state.query}"` : t("search.queryAll")}
            </span>
          </span>
          <span className="h-1 w-1 rounded-full bg-fg-3" aria-hidden="true" />
          <span>
            {t("search.freeOnlyLabel")}: {freeOnly ? "ON" : "OFF"}
          </span>
        </p>
      </header>

      <DiscoveryWorkspaceNav current="search" className="mb-6 sm:mb-8" />

      <div
        id="toonspectrum-search-explorer-top"
        tabIndex={-1}
        className="search-page-results [scroll-margin-top:var(--site-header-sticky-offset)] outline-none"
      >
        <SearchExplorer
          key={state.query}
          initialQuery={state.query}
          initialFree={freeOnly}
          initialPlatforms={state.filters.platforms}
        />
      </div>
    </Container>
  );
}
