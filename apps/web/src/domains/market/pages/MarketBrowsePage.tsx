import {
  AlertTriangle,
  ChevronDown,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationType, useSearchParams } from "react-router-dom";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketBrowseJsonLd } from "../models/market-jsonld";
import { MARKET_LICENSES, marketKindMeta } from "../models/market-kind";
import {
  MARKET_RESOURCE_FAMILIES,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";
import {
  parseMarketBrowseQuery,
  resolveMarketBrowseSort,
} from "../models/market-query";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
  CreatorMarketplaceResourceSearchQuerySchema,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

import "../components/market-atelier.css";

const PAGE_SIZE = 12;
const MARKET_BROWSE_DESCRIPTION =
  "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 제작 목적과 사용권으로 찾아보세요.";

function familyForKind(kind: string | null | undefined): MarketResourceFamily | null {
  if (!kind) return null;
  if (kind === "template") return MARKET_RESOURCE_FAMILIES.find((family) => family.id === "template") ?? null;
  if (kind === "asset") return MARKET_RESOURCE_FAMILIES.find((family) => family.id === "2d") ?? null;
  if (kind === "3d-asset" || kind === "3d-preset") return MARKET_RESOURCE_FAMILIES.find((family) => family.id === "3d") ?? null;
  if (kind === "brush") return MARKET_RESOURCE_FAMILIES.find((family) => family.id === "brush") ?? null;
  if (kind === "palette" || kind === "filter") return MARKET_RESOURCE_FAMILIES.find((family) => family.id === "look") ?? null;
  return null;
}

function filterChipClass(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    active
      ? "border-accent/50 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
  );
}

export function MarketBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
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
  const activeFamily = familyForKind(query.kind);
  const pageTitle = activeFamily
    ? `${activeFamily.label} 찾기`
    : query.kind
      ? `${marketKindMeta(query.kind).label} 찾기`
      : "리소스 찾기";

  useDocumentTitle(pageTitle);
  useMetaDescription(MARKET_BROWSE_DESCRIPTION);
  usePageSocialMeta({
    canonicalPath: "/market/browse",
    title: `${pageTitle} · 툰스튜디오`,
    description: MARKET_BROWSE_DESCRIPTION,
  });
  useJsonLd(marketBrowseJsonLd(page.items, query.kind));

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value.length === 0) next.delete(key);
          else next.set(key, value);
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const activeSearch = query.search;
  const activeKind = query.kind;
  const activeLicense = query.license;
  const activePublisherLabel = query.publisher
    ? page.items.find((record) => record.publisher.id === query.publisher)?.publisher.name ?? "선택한 배급자"
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

  const serializedSearchParams = searchParams.toString();
  useEffect(() => {
    if (navigationType !== "POP") return;
    cancelPendingSearchCommit();
    setDraftSearch(committedSearch);
  }, [cancelPendingSearchCommit, committedSearch, navigationType, serializedSearchParams]);

  const updateDraftSearch = useCallback((value: string) => {
    setDraftSearch(value);
    cancelPendingSearchCommit();
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

  const selectFamily = (family: MarketResourceFamily) => {
    const first = family.subcategories[0];
    patchParams({ kind: first.kind, tag: null });
  };

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <MarketNavHeader />
          <div className="market-browse-masthead">
            <div><p className="eyebrow text-accent">THE WEBTOON MATERIAL LIBRARY</p>
              <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{pageTitle}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-2">다음 컷에 필요한 재료를 골라보세요. 구도를 시작하는 템플릿, 장면을 채우는 소재, 손맛을 만드는 브러시와 색감까지 웹툰 제작 순서에 맞춰 찾을 수 있습니다.</p>
              <div className="mt-3 flex flex-wrap gap-4"><Link href="/market/library" className="inline-flex min-h-11 items-center text-xs font-semibold text-accent underline underline-offset-4">저장한 리소스 보기</Link><Link href="/learn/paths/visual-finish" className="inline-flex min-h-11 items-center text-xs font-semibold text-fg-2 underline underline-offset-4">선화·채색 실습으로 연결</Link></div>
            </div>
            <img src="/brand/atelier-materials.webp" alt="선과 색, 소품 스케치를 모은 재료 콘셉트 이미지" width={640} height={480} />
          </div>

          <form
            role="search"
            className="mt-5 flex max-w-2xl items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              cancelPendingSearchCommit();
              const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(draftSearch);
              if (parsed.success) patchParams({ q: parsed.data || null, ...(parsed.data ? {} : { sort: null }) });
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                type="search"
                aria-label="마켓 리소스 검색"
                value={draftSearch}
                onChange={(event) => updateDraftSearch(event.target.value)}
                maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
                aria-invalid={parsedUrlQuery.issues.some((issue) => issue.param === "q") || undefined}
                aria-describedby={parsedUrlQuery.issues.some((issue) => issue.param === "q") ? "market-invalid-query" : undefined}
                placeholder="예: 고백 장면, 학교 배경, G펜, 야간 보정"
                className="h-12 w-full appearance-none rounded-2xl border border-line bg-card pl-10 pr-12 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {draftSearch ? (
                <button type="button" aria-label="검색어 지우기" onClick={clearSearch} className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <button type="submit" className={buttonClass({ variant: "solid", size: "md" })}>검색</button>
          </form>
        </Container>
      </section>

      <Container size="wide" className="py-6 sm:py-8">
        <section aria-labelledby="market-work-family-title">
          <h2 id="market-work-family-title" className="text-sm font-bold text-fg">어떤 리소스가 필요한가요?</h2>
          <p className="mt-1 text-xs text-fg-3">한 번 선택하면 그 작업군에 필요한 세부 카테고리만 아래에 보여줍니다.</p>
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => patchParams({ kind: null, tag: null })} aria-pressed={!activeFamily} className={filterChipClass(!activeFamily)}>
              전체
            </button>
            {MARKET_RESOURCE_FAMILIES.map((family) => {
              const Icon = family.icon;
              const selected = activeFamily?.id === family.id;
              return (
                <button key={family.id} type="button" onClick={() => selectFamily(family)} aria-pressed={selected} className={filterChipClass(selected)}>
                  <Icon className="mr-1.5 size-4" style={selected ? undefined : { color: `oklch(0.72 0.11 ${family.accentHue})` }} aria-hidden="true" />
                  {family.label}
                </button>
              );
            })}
          </div>
        </section>

        {activeFamily ? (
          <section className="mt-5 rounded-2xl border border-line bg-card/60 p-3 sm:p-4" aria-labelledby="market-subcategory-title">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent">
                {(() => { const ActiveIcon = activeFamily.icon; return <ActiveIcon className="size-4" aria-hidden="true" />; })()}
              </span>
              <div>
                <h2 id="market-subcategory-title" className="text-sm font-bold text-fg">{activeFamily.label} 세부 카테고리</h2>
                <p className="mt-0.5 text-xs leading-5 text-fg-3">{activeFamily.description}</p>
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
                    <strong className={cn("block text-xs", selected ? "text-accent" : "text-fg")}>{subcategory.label}</strong>
                    <span className="mt-0.5 block text-[0.68rem] leading-5 text-fg-3">{subcategory.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
          {!hasInvalidQuery && !page.loading && !page.error ? (
            <p className="text-xs text-fg-3" aria-live="polite">
              현재 <span className="numeral tnum font-semibold text-fg">{page.items.length}</span>개 표시
            </p>
          ) : <span />}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <details className="group relative">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                세부 조건
                {activeLicense || query.publisher ? <span className="size-2 rounded-full bg-accent" aria-label="세부 조건 적용됨" /> : null}
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-3 shadow-xl">
                <p className="text-[0.68rem] font-bold text-fg">라이선스</p>
                <div className="mt-2 grid gap-1.5">
                  <button type="button" onClick={() => patchParams({ license: null })} aria-pressed={!activeLicense} className={cn(filterChipClass(!activeLicense), "justify-start")}>전체 라이선스</button>
                  {MARKET_LICENSES.map((license) => (
                    <button key={license.license} type="button" onClick={() => patchParams({ license: activeLicense === license.license ? null : license.license })} aria-pressed={activeLicense === license.license} className={cn(filterChipClass(activeLicense === license.license), "justify-start")}>
                      {license.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[0.65rem] leading-5 text-fg-3">무료 여부와 상업 이용 가능 여부는 다릅니다. 작품 공개 전 상세 화면의 사용권 요약을 다시 확인하세요.</p>
              </div>
            </details>

            <label className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-fg-2">
              <span>정렬</span>
              <select aria-label="정렬 기준" value={query.sort} onChange={(event) => patchParams({ sort: event.target.value })} className="h-11 rounded-xl border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70">
                <option value="relevance" disabled={!query.search}>관련도순</option>
                <option value="newest">최신순</option>
              </select>
            </label>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" aria-label="적용된 조건">
            {query.search ? <button type="button" aria-label={`검색: “${query.search}” 필터 제거`} onClick={clearSearch} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">검색: “{query.search}” <X className="size-3" aria-hidden="true" /></button> : null}
            {query.tag ? <button type="button" aria-label={`#${query.tag} 태그 필터 제거`} onClick={() => patchParams({ tag: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">#{query.tag} <X className="size-3" aria-hidden="true" /></button> : null}
            {activeLicense ? <button type="button" aria-label={`${MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label ?? activeLicense} 필터 제거`} onClick={() => patchParams({ license: null })} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.publisher ? <button type="button" aria-label={`배급자: ${activePublisherLabel} 필터 제거`} onClick={() => patchParams({ publisher: null })} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg"><span className="max-w-64 truncate">배급자: {activePublisherLabel}</span><X className="size-3 shrink-0" aria-hidden="true" /></button> : null}
            <button type="button" onClick={resetFilters} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-bad/10 px-2.5 text-bad hover:bg-bad/20"><RotateCcw className="size-3" aria-hidden="true" />조건 초기화</button>
          </div>
        ) : null}

        {hasInvalidQuery ? (
          <div id="market-invalid-query" role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg-2">
            <p className="font-medium text-fg">주소의 검색 조건을 적용할 수 없어요.</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              {parsedUrlQuery.issues.map((issue) => <li key={`${issue.param}-${issue.code}`}>{issue.message}</li>)}
            </ul>
            <button type="button" onClick={() => { cancelPendingSearchCommit(); const patch = Object.fromEntries([...new Set(parsedUrlQuery.issues.map((issue) => issue.param))].map((param) => [param, null])); if ("q" in patch) setDraftSearch(""); patchParams(patch); }} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3" })}>
              잘못된 조건 제거
            </button>
          </div>
        ) : null}

        {!hasInvalidQuery && page.stale ? <StaleNoticeBar savedAt={page.staleSavedAt ?? new Date().toISOString()} onRetry={page.reload} className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto" /> : null}

        {!hasInvalidQuery && page.error && page.items.length === 0 ? (
          <div role="alert" className="mt-8 rounded-2xl border border-warn/30 bg-warn/5 p-8 text-center sm:p-12">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn/10 text-warn"><AlertTriangle className="size-6" aria-hidden="true" /></div>
            <h2 className="mt-4 text-base font-bold text-fg">리소스를 불러올 수 없어요</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">일시적인 네트워크 문제이거나 서버에 장애가 발생했을 수 있어요. 현재 조건은 유지되므로 다시 시도해도 됩니다.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3"><button type="button" onClick={page.reload} className={buttonClass({ variant: "solid", size: "sm" })}><RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />다시 시도</button><Link href="/studio" className={buttonClass({ variant: "outline", size: "sm" })}>Studio로 이동</Link></div>
          </div>
        ) : null}

        {hasInvalidQuery || (page.error && page.items.length === 0) ? null : (
          <>
            <h2 className="sr-only">탐색 결과</h2>
            {page.loading ? <p role="status" className="sr-only">마켓 탐색 결과를 불러오는 중입니다.</p> : null}
            <ul aria-busy={page.loading || undefined} className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {page.loading && page.items.length === 0
                ? Array.from({ length: PAGE_SIZE }, (_, index) => <li key={index} aria-hidden="true"><div className="skeleton aspect-[16/9] w-full rounded-t-xl" /><div className="space-y-2 rounded-b-xl border border-t-0 border-line bg-card p-3.5"><div className="skeleton h-4 w-4/5" /><div className="skeleton h-3 w-2/5" /></div></li>)
                : page.items.map((record) => <li key={record.id}><MarketResourceCard record={record} className="h-full" /></li>)}
            </ul>

            {!page.loading && page.items.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel p-8 text-center sm:p-12">
                {activeSearch ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><SearchX className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">&lsquo;{activeSearch}&rsquo; 검색 결과가 없어요</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">더 짧은 단어로 검색하거나 선택한 카테고리를 하나씩 해제해 보세요.</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><button type="button" onClick={() => { setDraftSearch(""); patchParams({ q: null }); }} className={buttonClass({ variant: "solid", size: "sm" })}>검색어 초기화</button>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />모든 조건 초기화</button> : null}</div></>
                ) : activeKind ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{(() => { const Icon = marketKindMeta(activeKind).icon; return <Icon className="size-6" aria-hidden="true" />; })()}</div><h2 className="mt-4 text-base font-bold text-fg">아직 이 조건에 맞는 {marketKindMeta(activeKind).label}이 없어요</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">세부 카테고리를 바꾸거나 Studio에서 만든 리소스를 첫 번째로 공유해 보세요.</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />Studio에서 공유하기</Link><button type="button" onClick={() => patchParams({ kind: null, tag: null })} className={buttonClass({ variant: "outline", size: "sm" })}>전체 리소스 보기</button></div></>
                ) : (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><PackageSearch className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">조건에 맞는 공유 리소스가 없어요</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">조건을 초기화하거나 Studio에서 만든 리소스를 첫 번째로 공유해 보세요.</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />Studio에서 첫 리소스 공유하기</Link>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />조건 초기화</button> : null}</div></>
                )}
              </div>
            ) : null}

            {!page.loading && page.loadMoreError && !page.error ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-bad" role="alert"><span>{page.loadMoreError}</span><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "sm" })}>{page.loadingMore ? "다시 불러오는 중…" : "다시 시도"}</button></div>
            ) : !page.loading && page.hasMore && !page.error ? (
              <div className="mt-8 text-center"><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "md" })}>{page.loadingMore ? "불러오는 중…" : "더 많은 리소스 불러오기"}</button></div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
