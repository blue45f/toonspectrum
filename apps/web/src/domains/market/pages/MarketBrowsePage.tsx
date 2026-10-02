import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import {
  AlertTriangle,
  ChevronDown,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  Store,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationType, useSearchParams } from "react-router-dom";

import { MarketCompareShelf } from "../components/MarketCompareShelf";
import { MarketFamilyPicker } from "../components/MarketFamilyPicker";
import { MarketViewToggle } from "../components/MarketViewToggle";
import { MarketNavHeader } from "../components/MarketNavHeader";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketBrowseJsonLd } from "../models/market-jsonld";
import { MARKET_LICENSES, marketKindMeta } from "../models/market-kind";
import {
  marketResourceFamilyForKind,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";
import {
  parseMarketBrowseQuery,
  resolveMarketBrowseSort,
} from "../models/market-query";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
  CreatorMarketplaceResourceSearchQuerySchema,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import "../components/market-atelier.css";

const PAGE_SIZE = 12;

/** 세부 조건(라이선스) 목록의 선택 버튼. */
function filterChipClass(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    active
      ? "border-accent/50 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
  );
}

export function MarketBrowsePage({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const t = useBilingual("MarketBrowsePage");
  const marketBrowseDescription = t(
    "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 제작 목적과 사용권으로 찾아보세요.",
    "Find webtoon templates, 2D/3D assets, brushes, palettes, and filters by production purpose and license.",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const layout = searchParams.get("layout") === "list" ? "list" : "grid";
  const composingRef = useRef(false);
  const serializedSearchParams = searchParams.toString();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  // React Router search-param updates are navigation calls, not queued React state updates.
  // Keep an eager snapshot so submit + sort/filter actions in the same turn merge instead of
  // replacing one another with a stale render's URL.
  if (searchParamsRef.current.toString() !== serializedSearchParams) {
    searchParamsRef.current = new URLSearchParams(searchParams);
  }
  const parsedUrlQuery = parseMarketBrowseQuery(searchParams);
  const [draftSearch, setDraftSearch] = useState(() => parsedUrlQuery.searchDraft);
  const pendingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = {
    limit: PAGE_SIZE,
    ...parsedUrlQuery.values,
    sort: resolveMarketBrowseSort(parsedUrlQuery.values),
  };
  const hasInvalidQuery = parsedUrlQuery.issues.length > 0;
  const page = useMarketResources(hasInvalidQuery ? null : query);
  const activeFamily = marketResourceFamilyForKind(query.kind);
  const pageTitle = activeFamily
    ? t(`${activeFamily.label} 찾기`, `Find ${activeFamily.labelEn}`)
    : query.kind
      ? t(`${marketKindMeta(query.kind).label} 찾기`, `Find ${marketKindMeta(query.kind).label}`)
      : t("리소스 찾기", "Find resources");

  useDocumentTitle(pageTitle);
  useMetaDescription(marketBrowseDescription);
  usePageSocialMeta({
    canonicalPath: "/market/browse",
    title: `${pageTitle} · ${t("툰스튜디오", "ToonStudio")}`,
    description: marketBrowseDescription,
  });
  useJsonLd(marketBrowseJsonLd(page.items, query.kind));

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParamsRef.current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value.length === 0) next.delete(key);
        else next.set(key, value);
      }
      searchParamsRef.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const activeSearch = query.search;
  const activeKind = query.kind;
  const activeLicense = query.license;
  const activePublisherLabel = query.publisher
    ? page.items.find((record) => record.publisher.id === query.publisher)?.publisher.name ?? t("선택한 배급자", "Selected publisher")
    : null;

  const committedSearch = parsedUrlQuery.searchDraft;
  const cancelPendingSearchCommit = useCallback(() => {
    if (pendingSearchTimerRef.current === null) return;
    clearTimeout(pendingSearchTimerRef.current);
    pendingSearchTimerRef.current = null;
  }, []);

  useEffect(() => {
    cancelPendingSearchCommit();
    setDraftSearch(committedSearch);
    return cancelPendingSearchCommit;
  }, [cancelPendingSearchCommit, committedSearch]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    cancelPendingSearchCommit();
    setDraftSearch(committedSearch);
  }, [cancelPendingSearchCommit, committedSearch, navigationType, serializedSearchParams]);

  const updateDraftSearch = useCallback((value: string) => {
    setDraftSearch(value);
    cancelPendingSearchCommit();
    if (composingRef.current) return;
    const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(value);
    if (!parsed.success) return;
    pendingSearchTimerRef.current = setTimeout(() => {
      pendingSearchTimerRef.current = null;
      patchParams({ q: parsed.data || null, ...(parsed.data ? {} : { sort: null }) });
    }, 300);
  }, [cancelPendingSearchCommit, patchParams]);

  const clearSearch = useCallback(() => {
    cancelPendingSearchCommit();
    setDraftSearch("");
    patchParams({ q: null, ...(query.sort === "relevance" ? { sort: null } : {}) });
  }, [cancelPendingSearchCommit, patchParams, query.sort]);

  const resetFilters = useCallback(() => {
    cancelPendingSearchCommit();
    setDraftSearch("");
    patchParams({ q: null, tag: null, publisher: null, kind: null, license: null, sort: null });
  }, [cancelPendingSearchCommit, patchParams]);

  const hasActiveFilters = Boolean(query.search || query.tag || query.publisher || activeKind || activeLicense);

  const selectFamily = (family: MarketResourceFamily | null) => {
    patchParams({ kind: family ? family.subcategories[0].kind : null, tag: null });
  };

  return (
    <div className="market-browse-page">
      <CampusObjectSource objects={hasInvalidQuery ? [] : page.items.map((record) => ({
        id: record.id, title: record.name, href: `/market/resource/${encodeURIComponent(record.id)}`,
      }))} />
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10 lg:py-12">
          {!embedded ? <MarketNavHeader /> : null}
          <SitePageHeader
            surface="plain"
            icon={Store}
            eyebrow="THE WEBTOON MATERIAL LIBRARY"
            title={pageTitle}
            description={t("다음 컷에 필요한 재료를 골라보세요. 구도를 시작하는 템플릿, 장면을 채우는 소재, 손맛을 만드는 브러시와 색감까지 웹툰 제작 순서에 맞춰 찾을 수 있습니다.", "Pick the materials your next panel needs. From composition-starting templates to scene-filling materials, brushes, and colors that shape your hand — find them in webtoon production order.")}
            aside={<WorkflowIllustration kind="assets" sizes="(max-width: 1023px) 100vw, 360px" />}
            asideClassName="hidden lg:block"
            actions={
              <>
                <Link href="/market/library" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 text-accent" })}>{t("저장한 리소스 보기", "View saved resources")}</Link>
                <Link href="/learn/paths/visual-finish" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>{t("선화·채색 실습으로 연결", "Continue to line-art & coloring practice")}</Link>
              </>
            }
          />

          <form
            role="search"
            className="mt-5 flex max-w-2xl items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (composingRef.current) return;
              cancelPendingSearchCommit();
              const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(draftSearch);
              if (parsed.success) patchParams({ q: parsed.data || null, ...(parsed.data ? {} : { sort: null }) });
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                type="search"
                aria-label={t("마켓 리소스 검색", "Search market resources")}
                value={draftSearch}
                onCompositionStart={() => { composingRef.current = true; cancelPendingSearchCommit(); }}
                onCompositionEnd={(event) => { composingRef.current = false; updateDraftSearch(event.currentTarget.value); }}
                onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                onChange={(event) => updateDraftSearch(event.target.value)}
                maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
                aria-invalid={parsedUrlQuery.issues.some((issue) => issue.param === "q") || undefined}
                aria-describedby={parsedUrlQuery.issues.some((issue) => issue.param === "q") ? "market-invalid-query" : undefined}
                placeholder={t("예: 고백 장면, 학교 배경, G펜, 야간 보정", "e.g. confession scene, school background, G-pen, night retouch")}
                className="h-12 w-full appearance-none rounded-2xl border border-line bg-card pl-10 pr-12 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {draftSearch ? (
                <button type="button" aria-label={t("검색어 지우기", "Clear search")} onClick={clearSearch} className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <button type="submit" className={buttonClass({ variant: "solid", size: "md" })}>{t("검색", "Search")}</button>
          </form>
        </Container>
      </section>

      <Container size="wide" className="py-6 sm:py-8">
        <section aria-labelledby="market-work-family-title">
          <h2 id="market-work-family-title" className="text-sm font-bold text-fg">{t("어떤 리소스가 필요한가요?", "What kind of resource do you need?")}</h2>
          <p className="mt-1 text-xs text-fg-3">{t("한 번 선택하면 그 작업군에 필요한 세부 카테고리만 아래에 보여줍니다.", "Once selected, only the subcategories for that work family are shown below.")}</p>
          <MarketFamilyPicker
            className="mt-3"
            labelledBy="market-work-family-title"
            selected={activeFamily?.id ?? (activeKind ? null : "all")}
            target={{ kind: "button", onSelect: selectFamily }}
          />
        </section>

        {activeFamily ? (
          <section className="mt-5 rounded-2xl border border-line bg-card/60 p-3 sm:p-4" aria-labelledby="market-subcategory-title">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent">
                <activeFamily.icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 id="market-subcategory-title" className="text-sm font-bold text-fg">{t(`${activeFamily.label} 세부 카테고리`, `${activeFamily.labelEn} subcategories`)}</h2>
                <p className="mt-0.5 text-xs leading-5 text-fg-3">{t(activeFamily.description, activeFamily.descriptionEn)}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeFamily.subcategories.map((subcategory) => {
                const selected = activeKind === subcategory.kind && query.tag === subcategory.tag;
                return (
                  <button
                    key={subcategory.id}
                    type="button"
                    onClick={() => patchParams({ kind: subcategory.kind, tag: selected ? null : subcategory.tag ?? null })}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-14 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      selected ? "border-accent/50 bg-accent-soft" : "border-line bg-panel hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <strong className={cn("block text-xs", selected ? "text-accent" : "text-fg")}>{t(subcategory.label, subcategory.labelEn)}</strong>
                    <span className="mt-0.5 block text-[0.68rem] leading-5 text-fg-3">{t(subcategory.description, subcategory.descriptionEn)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
          {!hasInvalidQuery && !page.loading && !page.error ? (
            <p className="text-xs text-fg-3" aria-live="polite">
              {t("현재", "Showing")} <span className="numeral tnum font-semibold text-fg">{page.items.length}</span>{t("개 표시", " items")}
            </p>
          ) : <span />}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <MarketViewToggle value={layout} onChange={(value) => patchParams({ layout: value === "grid" ? null : value })} />
            <label className="grid min-w-[10.5rem] gap-1 text-[0.66rem] font-bold text-fg-3 sm:hidden">
              {t("라이선스", "License")}
              <select
                aria-label={t("라이선스 필터", "License filter")}
                value={activeLicense ?? ""}
                onChange={(event) => patchParams({ license: event.target.value || null })}
                className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-fg"
              >
                <option value="">{t("전체 라이선스", "All licenses")}</option>
                {MARKET_LICENSES.map((license) => (
                  <option key={license.license} value={license.license}>{license.label}</option>
                ))}
              </select>
            </label>
            <details className="group relative hidden sm:block">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {t("세부 조건", "Detailed filters")}
                {activeLicense || query.publisher ? <span className="size-2 rounded-full bg-accent" aria-label={t("세부 조건 적용됨", "Detailed filters applied")} /> : null}
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-3 shadow-xl">
                <p className="text-[0.68rem] font-bold text-fg">{t("라이선스", "License")}</p>
                <div className="mt-2 grid gap-1.5">
                  <button type="button" onClick={() => patchParams({ license: null })} aria-pressed={!activeLicense} className={cn(filterChipClass(!activeLicense), "justify-start")}>{t("전체 라이선스", "All licenses")}</button>
                  {MARKET_LICENSES.map((license) => (
                    <button key={license.license} type="button" onClick={() => patchParams({ license: activeLicense === license.license ? null : license.license })} aria-pressed={activeLicense === license.license} className={cn(filterChipClass(activeLicense === license.license), "justify-start")}>
                      {license.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[0.65rem] leading-5 text-fg-3">{t("무료 여부와 상업 이용 가능 여부는 다릅니다. 작품 공개 전 상세 화면의 사용권 요약을 다시 확인하세요.", "Whether it's free and whether commercial use is allowed are different things. Re-check the license summary on the detail screen before publishing your work.")}</p>
              </div>
            </details>

            <label className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-fg-2">
              <span>{t("정렬", "Sort")}</span>
              <select aria-label={t("정렬 기준", "Sort by")} value={query.sort} onChange={(event) => patchParams({ sort: event.target.value })} className="h-11 rounded-xl border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70">
                <option value="relevance" disabled={!query.search}>{t("관련도순", "By relevance")}</option>
                <option value="newest">{t("최신순", "Newest")}</option>
              </select>
            </label>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" aria-label={t("적용된 조건", "Applied filters")}>
            {activeKind ? <button type="button" aria-label={t(`종류: ${marketKindMeta(activeKind).label} 필터 제거`, `Remove kind filter: ${marketKindMeta(activeKind).label}`)} onClick={() => patchParams({ kind: null })} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{marketKindMeta(activeKind).label}<X className="size-3" aria-hidden="true" /></button> : null}
            {query.search ? <button type="button" aria-label={t(`검색: “${query.search}” 필터 제거`, `Remove search filter: “${query.search}”`)} onClick={clearSearch} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{t("검색", "Search")}: “{query.search}” <X className="size-3" aria-hidden="true" /></button> : null}
            {query.tag ? <button type="button" aria-label={t(`#${query.tag} 태그 필터 제거`, `Remove #${query.tag} tag filter`)} onClick={() => patchParams({ tag: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">#{query.tag} <X className="size-3" aria-hidden="true" /></button> : null}
            {activeLicense ? <button type="button" aria-label={t(`${MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label ?? activeLicense} 필터 제거`, `Remove license filter: ${MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label ?? activeLicense}`)} onClick={() => patchParams({ license: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.publisher ? <button type="button" aria-label={t(`배급자: ${activePublisherLabel} 필터 제거`, `Remove publisher filter: ${activePublisherLabel}`)} onClick={() => patchParams({ publisher: null })} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg"><span className="max-w-64 truncate">{t("배급자", "Publisher")}: {activePublisherLabel}</span><X className="size-3 shrink-0" aria-hidden="true" /></button> : null}
            <button type="button" onClick={resetFilters} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-bad/10 px-2.5 text-bad hover:bg-bad/20"><RotateCcw className="size-3" aria-hidden="true" />{t("조건 초기화", "Reset filters")}</button>
          </div>
        ) : null}

        {hasInvalidQuery ? (
          <div id="market-invalid-query" role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg-2">
            <p className="font-medium text-fg">{t("주소의 검색 조건을 적용할 수 없어요.", "The search conditions in the URL could not be applied.")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              {parsedUrlQuery.issues.map((issue) => <li key={`${issue.param}-${issue.code}`}>{issue.message}</li>)}
            </ul>
            <button type="button" onClick={() => { cancelPendingSearchCommit(); const patch = Object.fromEntries([...new Set(parsedUrlQuery.issues.map((issue) => issue.param))].map((param) => [param, null])); if ("q" in patch) setDraftSearch(""); patchParams(patch); }} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3" })}>
              {t("잘못된 조건 제거", "Remove invalid conditions")}
            </button>
          </div>
        ) : null}

        {!hasInvalidQuery && page.stale ? <StaleNoticeBar savedAt={page.staleSavedAt ?? new Date().toISOString()} onRetry={page.reload} className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto" /> : null}

        {!hasInvalidQuery && page.error && page.items.length === 0 ? (
          <div role="alert" className="mt-8 rounded-2xl border border-warn/30 bg-warn/5 p-8 text-center sm:p-12">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn/10 text-warn"><AlertTriangle className="size-6" aria-hidden="true" /></div>
            <h2 className="mt-4 text-base font-bold text-fg">{t("리소스를 불러올 수 없어요", "Resources could not be loaded")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("일시적인 네트워크 문제이거나 서버에 장애가 발생했을 수 있어요. 현재 조건은 유지되므로 다시 시도해도 됩니다.", "This may be a temporary network issue or a server problem. Your current filters are kept, so feel free to try again.")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3"><button type="button" onClick={page.reload} className={buttonClass({ variant: "solid", size: "sm" })}><RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />{t("다시 시도", "Try again")}</button><Link href="/studio" className={buttonClass({ variant: "outline", size: "sm" })}>{t("Studio로 이동", "Go to Studio")}</Link></div>
          </div>
        ) : null}

        {hasInvalidQuery || (page.error && page.items.length === 0) ? null : (
          <>
            <h2 className="sr-only">{t("탐색 결과", "Browse results")}</h2>
            {page.loading ? <p role="status" className="sr-only">{t("마켓 탐색 결과를 불러오는 중입니다.", "Loading market browse results.")}</p> : null}
            <ul aria-busy={page.loading || undefined} className={`market-browse-results market-browse-results--${layout}`}>
              {page.loading && page.items.length === 0
                ? Array.from({ length: PAGE_SIZE }, (_, index) => <li key={index} aria-hidden="true"><div className="skeleton aspect-[16/9] w-full rounded-t-xl" /><div className="space-y-2 rounded-b-xl border border-t-0 border-line bg-card p-3.5"><div className="skeleton h-4 w-4/5" /><div className="skeleton h-3 w-2/5" /></div></li>)
                : page.items.map((record, index) => <li key={record.id} {...introItemProps(index)}><MarketResourceCard record={record} className="h-full" /></li>)}
            </ul>

            {!page.loading && page.items.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel p-8 text-center sm:p-12">
                {activeSearch ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><SearchX className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">{t(`“${activeSearch}” 검색 결과가 없어요`, `No results for “${activeSearch}”`)}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("더 짧은 단어로 검색하거나 선택한 카테고리를 하나씩 해제해 보세요.", "Try shorter keywords or clear the selected categories one by one.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><button type="button" onClick={clearSearch} className={buttonClass({ variant: "solid", size: "sm" })}>{t("검색어 초기화", "Clear search")}</button>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />{t("모든 조건 초기화", "Reset all filters")}</button> : null}</div></>
                ) : activeKind ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{(() => { const Icon = marketKindMeta(activeKind).icon; return <Icon className="size-6" aria-hidden="true" />; })()}</div><h2 className="mt-4 text-base font-bold text-fg">{t(`아직 이 조건에 맞는 ${marketKindMeta(activeKind).label}이 없어요`, `No ${marketKindMeta(activeKind).label} matches these conditions yet`)}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("세부 카테고리를 바꾸거나 Studio에서 만든 리소스를 첫 번째로 공유해 보세요.", "Try a different subcategory, or be the first to share a resource you made in Studio.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />{t("Studio에서 공유하기", "Share from Studio")}</Link><button type="button" onClick={() => patchParams({ kind: null, tag: null })} className={buttonClass({ variant: "outline", size: "sm" })}>{t("전체 리소스 보기", "View all resources")}</button></div></>
                ) : (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><PackageSearch className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">{t("조건에 맞는 공유 리소스가 없어요", "No shared resources match these conditions")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("공개 마켓에 없는 소재는 기본 무료 제작 소재에서 찾아보세요. 회원가입 없이 원본 파일과 사용 조건을 확인할 수 있습니다.", "For materials not on the public market, try the built-in free production materials. You can check source files and terms without signing up.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio/assets?view=essentials" className={buttonClass({ variant: "solid", size: "sm" })}>{t("기본 무료 소재 사용하기", "Use built-in free materials")}</Link><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />{t("Studio에서 첫 리소스 공유하기", "Share your first resource from Studio")}</Link>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />{t("조건 초기화", "Reset filters")}</button> : null}</div></>
                )}
              </div>
            ) : null}

            {!page.loading && page.loadMoreError && !page.error ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-bad" role="alert"><span>{page.loadMoreError}</span><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "sm" })}>{page.loadingMore ? t("다시 불러오는 중…", "Loading again…") : t("다시 시도", "Try again")}</button></div>
            ) : !page.loading && page.hasMore && !page.error ? (
              <div className="mt-8 text-center"><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "md" })}>{page.loadingMore ? t("불러오는 중…", "Loading…") : t("더 많은 리소스 불러오기", "Load more resources")}</button></div>
            ) : null}
          </>
        )}
        <MarketCompareShelf />
      </Container>
    </div>
  );
}
