import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import "./search-page-layout.css";

import { SearchExplorer } from "@/shared/components/search-explorer";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

/**
 * 모바일 첫 화면용 검색 입력. 390px에서는 탐색기 입력이 두 번째 화면으로 밀리므로
 * 헤더에 실제 동작하는 검색창을 노출한다(데스크톱 레이아웃은 그대로).
 * URL `q` 파라미터를 공유 소스로 써서 탐색기 입력과 양방향 동기화된다.
 */
function MobileQuickSearch({ query }: { query: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  // 탐색기 입력 등 외부에서 검색어가 바뀌면, 입력 중이 아닐 때만 반영.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(query);
  }, [query]);

  const commit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === query.trim()) return;
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      setSearchParams(next, { replace: true, preventScrollReset: true });
    },
    [query, searchParams, setSearchParams],
  );

  // 타이핑이 잠잠해지면 URL에 반영(탐색기와 같은 디바운스 리듬).
  useEffect(() => {
    const timer = window.setTimeout(() => commit(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit(draft);
    inputRef.current?.blur();
  };

  return (
    <form role="search" onSubmit={submit} className="mt-4 sm:hidden">
      <label htmlFor="search-page-mobile-query" className="sr-only">
        {t("search.explorer.search.label")}
      </label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card px-3 transition-colors focus-within:border-accent/50">
        <Search size={16} aria-hidden="true" className="shrink-0 text-fg-3" />
        <input
          ref={inputRef}
          id="search-page-mobile-query"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("search.explorer.search.placeholder")}
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-fg outline-none placeholder:text-fg-3"
        />
      </div>
    </form>
  );
}

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
        <MobileQuickSearch query={state.query} />
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-6">
          <a
            href="#toonstudio-search-explorer-top"
            className={buttonClass({
              size: "sm",
              variant: "solid",
              className: "gap-1.5",
            })}
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
  );
}
