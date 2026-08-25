import { RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketBrowseJsonLd } from "../models/market-jsonld";
import { MARKET_KINDS, MARKET_LICENSES, marketKindMeta } from "../models/market-kind";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
} from "@/lib/creator-marketplace-resource-contract";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";
import { useJsonLd } from "@/src/hooks/use-document-title";

const PAGE_SIZE = 12;

function readParam(
  searchParams: URLSearchParams,
  key: string
): string | undefined {
  const value = searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function readKind(searchParams: URLSearchParams): CreatorMarketplaceResourceKind | undefined {
  const value = searchParams.get("kind");
  return MARKET_KINDS.some((meta) => meta.kind === value)
    ? (value as CreatorMarketplaceResourceKind)
    : undefined;
}

function readLicense(searchParams: URLSearchParams): CreatorMarketplaceResourceLicense | undefined {
  const value = searchParams.get("license");
  return MARKET_LICENSES.some((meta) => meta.license === value)
    ? (value as CreatorMarketplaceResourceLicense)
    : undefined;
}

function filterChipClass(active: boolean): string {
  return cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    active
      ? "border-transparent text-fg shadow-sm"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
  );
}

export function MarketBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputId = "market-browse-search";
  const [draftSearch, setDraftSearch] = useState(() => searchParams.get("q") ?? "");

  const query = {
    limit: PAGE_SIZE,
    search: readParam(searchParams, "q"),
    kind: readKind(searchParams),
    license: readLicense(searchParams),
    tag: readParam(searchParams, "tag"),
    publisher: readParam(searchParams, "publisher"),
  };
  const page = useMarketResources(query);

  useJsonLd(marketBrowseJsonLd(page.items, query.kind));

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value.length === 0) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const activeKind = query.kind;
  const activeLicense = query.license;

  const committedSearch = query.search ?? "";
  useEffect(() => {
    if (draftSearch === committedSearch) return;
    const timer = setTimeout(() => {
      patchParams({ q: draftSearch.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearch, committedSearch, patchParams]);

  const hasActiveFilters = Boolean(
    query.search || query.tag || query.publisher || activeKind || activeLicense
  );

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <p className="eyebrow text-accent">Browse</p>
          <h1 className="mt-2 text-pretty text-2xl font-bold leading-tight sm:text-3xl">
            마켓 탐색
          </h1>
          <p className="mt-1 max-w-xl text-xs text-fg-3">
            브러시, 팔레트, 필터, 템플릿, 3D 프리셋 등 웹툰 창작에 필요한 검증된 도구를 탐색하세요.
          </p>

          <form
            role="search"
            className="mt-5 flex max-w-xl items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              patchParams({ q: draftSearch.trim() || null });
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                id={searchInputId}
                type="search"
                aria-label="마켓 리소스 검색"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="리소스·태그·배급자 검색 (예: 잉크, 수채화, 4컷, 배경)"
                className="h-10 w-full rounded-[0.7rem] border border-line bg-card pl-9 pr-9 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors duration-150 focus:border-accent"
              />
              {draftSearch ? (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => {
                    setDraftSearch("");
                    patchParams({ q: null });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-3 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <button type="submit" className={buttonClass({ variant: "solid", size: "md" })}>
              검색
            </button>
          </form>
        </Container>
      </section>

      <Container size="wide" className="py-6">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="리소스 종류 필터">
          <button
            type="button"
            onClick={() => patchParams({ kind: null })}
            aria-pressed={!activeKind}
            className={cn(filterChipClass(!activeKind), !activeKind && "border-accent bg-accent-soft text-accent font-semibold")}
          >
            전체
          </button>
          {MARKET_KINDS.map((kind) => {
            const isSelected = activeKind === kind.kind;
            const KindIcon = kind.icon;
            return (
              <button
                key={kind.kind}
                type="button"
                onClick={() => patchParams({ kind: isSelected ? null : kind.kind })}
                aria-pressed={isSelected}
                className={filterChipClass(isSelected)}
                style={
                  isSelected
                    ? {
                        backgroundColor: `oklch(0.72 0.11 ${kind.hue} / 0.20)`,
                        color: `oklch(0.85 0.12 ${kind.hue})`,
                        borderColor: `oklch(0.72 0.15 ${kind.hue} / 0.5)`,
                      }
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {kind.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* License Filters */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="라이선스 필터">
          <button
            type="button"
            onClick={() => patchParams({ license: null })}
            aria-pressed={!activeLicense}
            className={cn(filterChipClass(!activeLicense), !activeLicense && "border-accent bg-accent-soft text-accent font-semibold")}
          >
            전체 라이선스
          </button>
          {MARKET_LICENSES.map((license) => {
            const isSelected = activeLicense === license.license;
            return (
              <button
                key={license.license}
                type="button"
                onClick={() => patchParams({ license: isSelected ? null : license.license })}
                aria-pressed={isSelected}
                className={cn(
                  filterChipClass(isSelected),
                  isSelected && "border-accent bg-accent-soft text-accent font-semibold"
                )}
              >
                {license.label}
              </button>
            );
          })}
        </div>

        {/* Status and Active Filter Chips */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          {!page.loading && !page.error ? (
            <p className="text-xs text-fg-3" aria-live="polite">
              조건 검색 결과 <span className="numeral tnum font-semibold text-fg">{page.items.length}</span>개 리소스
            </p>
          ) : (
            <span />
          )}

          {hasActiveFilters ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {query.search ? (
                <span className="rounded bg-raised px-2 py-0.5 text-fg-2">
                  검색: “{query.search}”
                </span>
              ) : null}
              {query.tag ? (
                <span className="rounded bg-raised px-2 py-0.5 text-fg-2">
                  #{query.tag}
                </span>
              ) : null}
              {activeKind ? (
                <button
                  type="button"
                  onClick={() => patchParams({ kind: null })}
                  className="inline-flex items-center gap-1 rounded bg-raised px-2 py-0.5 text-fg-2 hover:text-fg"
                >
                  {marketKindMeta(activeKind).label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
              {activeLicense ? (
                <button
                  type="button"
                  onClick={() => patchParams({ license: null })}
                  className="inline-flex items-center gap-1 rounded bg-raised px-2 py-0.5 text-fg-2 hover:text-fg"
                >
                  {MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
              {query.publisher ? (
                <span className="rounded bg-raised px-2 py-0.5 text-fg-2">
                  배급자: {query.publisher}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => patchParams({ q: null, tag: null, publisher: null, kind: null, license: null })}
                className="inline-flex items-center gap-1 rounded bg-bad/10 px-2 py-0.5 text-xs text-bad hover:bg-bad/20"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                조건 초기화
              </button>
            </div>
          ) : null}
        </div>

        {page.stale ? (
          <StaleNoticeBar
            savedAt={page.staleSavedAt ?? new Date().toISOString()}
            onRetry={page.reload}
            className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
          />
        ) : null}

        {page.error ? (
          <StaleNoticeBar
            message="지금은 새 목록을 불러올 수 없어요. 잠시 후 다시 시도해 주세요."
            onRetry={page.reload}
            className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
          />
        ) : null}

        {page.error ? null : (
          <>
            <h2 className="sr-only">탐색 결과</h2>
            <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {page.loading
                ? Array.from({ length: PAGE_SIZE }, (_, index) => (
                    <li key={index} aria-hidden="true">
                      <div className="skeleton aspect-[16/9] w-full rounded-t-xl" />
                      <div className="space-y-2 rounded-b-xl border border-t-0 border-line bg-card p-3.5">
                        <div className="skeleton h-4 w-4/5" />
                        <div className="skeleton h-3 w-2/5" />
                      </div>
                    </li>
                  ))
                : page.items.map((record) => (
                    <li key={record.id}>
                      <MarketResourceCard record={record} className="h-full" />
                    </li>
                  ))}
            </ul>

            {!page.loading && page.items.length === 0 ? (
              <div className="mt-8 rounded-xl border border-dashed border-line bg-panel p-10 text-center">
                <p className="text-sm font-medium text-fg">
                  {activeKind
                    ? `아직 등록된 ${marketKindMeta(activeKind).label} 리소스가 없어요.`
                    : "조건에 맞는 공유 리소스가 없어요."}
                </p>
                <p className="mt-1 text-xs text-fg-3">
                  스튜디오에서 제작한 브러시나 팔레트를 첫 번째로 공유해 보세요!
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="/studio" className={buttonClass({ variant: "solid", size: "sm" })}>
                    스튜디오에서 첫 리소스 공유하기
                  </Link>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={() => patchParams({ q: null, tag: null, publisher: null, kind: null, license: null })}
                      className={buttonClass({ variant: "outline", size: "sm" })}
                    >
                      필터 조건 초기화
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!page.loading && page.hasMore && !page.error ? (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={page.loadMore}
                  disabled={page.loadingMore}
                  className={buttonClass({ variant: "outline", size: "md" })}
                >
                  {page.loadingMore ? "불러오는 중…" : "더 많은 리소스 불러오기"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
