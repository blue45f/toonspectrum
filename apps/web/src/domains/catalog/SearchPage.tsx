import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import "./search-page-layout.css";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
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
    <PageEntrance variant="pop">
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Search}
        eyebrow={t("search.badge")}
        title={t("search.title")}
        description={t("search.subtitle")}
        actions={
          <>
            <a
              href="#toonstudio-search-explorer-top"
              className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              {t("search.filterButton")}
            </a>
            {/* 랭킹 동선은 보조 링크로 격하 — 검색이 목적인 페이지의 주 CTA가 아니다. */}
            <Link
              href="/ranking"
              className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-fg-3 underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              {t("search.compareFromRanking")}
            </Link>
          </>
        }
      >
        {/* 검색 입력은 바로 아래 탐색기 하나만 둔다 — 390px에서도 첫 화면 안에 보이므로 헤더에 중복 입력을 두지 않는다. */}
        <p className="flex flex-wrap items-center gap-3 text-xs text-fg-3">
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
      </SitePageHeader>

      <DiscoveryWorkspaceNav current="search" className="mb-6 sm:mb-8" />

      <div
        id="toonstudio-search-explorer-top"
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
    </PageEntrance>
  );
}
