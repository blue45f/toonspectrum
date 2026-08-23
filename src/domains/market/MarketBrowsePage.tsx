import { Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { MARKET_KINDS, MARKET_LICENSES, marketKindMeta } from "./market-kind";
import { MarketResourceCard } from "./MarketResourceCard";
import { useMarketResources } from "./use-market-resources";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
} from "@/lib/creator-marketplace-resource-contract";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";
import { ErrorState } from "@/src/components/error-state";


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

export function MarketBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputId = "market-browse-search";
  // 입력 중 매 keystroke마다 네트워크를 치지 않도록 커밋된 검색어만 상태으로 유지한다(Enter 제출 시 반영).
  const [draftSearch, setDraftSearch] = useState(() => searchParams.get("q") ?? "");

  const query = {
    limit: PAGE_SIZE,
    search: readParam(searchParams, "q"),
    kind: readKind(searchParams),
    license: readLicense(searchParams),
    tag: readParam(searchParams, "tag"),
  };
  const page = useMarketResources(query);

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

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <p className="eyebrow text-accent">Browse</p>
          <h1 className="mt-2 text-pretty text-2xl font-bold leading-tight sm:text-3xl">
            마켓 탐색
          </h1>
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
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="리소스·태그·배급자 검색"
                className="h-10 w-full rounded-[0.7rem] border border-line bg-card pl-9 pr-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors duration-150 focus:border-accent"
              />
            </div>
            <button type="submit" className={buttonClass({ variant: "solid", size: "md" })}>
              검색
            </button>
          </form>
        </Container>
      </section>

      <Container size="wide" className="py-6">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="리소스 종류 필터">
          <button
            type="button"
            onClick={() => patchParams({ kind: null })}
            aria-pressed={!activeKind}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              !activeKind
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            )}
          >
            전체
          </button>
          {MARKET_KINDS.map((kind) => (
            <button
              key={kind.kind}
              type="button"
              onClick={() => patchParams({ kind: activeKind === kind.kind ? null : kind.kind })}
              aria-pressed={activeKind === kind.kind}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                activeKind === kind.kind
                  ? "border-transparent text-fg"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
              )}
              style={
                activeKind === kind.kind
                  ? { backgroundColor: `oklch(0.72 0.11 ${kind.hue} / 0.16)`, color: `oklch(0.82 0.10 ${kind.hue})` }
                  : undefined
              }
            >
              {kind.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-3">
            <span>라이선스</span>
            <select
              value={activeLicense ?? ""}
              onChange={(event) => patchParams({ license: event.target.value || null })}
              className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
            >
              <option value="">전체</option>
              {MARKET_LICENSES.map((license) => (
                <option key={license.license} value={license.license}>
                  {license.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(query.search || query.tag) ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-2">
            {query.search ? <span>“{query.search}” 검색 결과</span> : null}
            {query.tag ? <span>#{query.tag}</span> : null}
            <button
              type="button"
              onClick={() => patchParams({ q: null, tag: null })}
              className="inline-flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-xs text-fg-2 hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              조건 지우기
            </button>
          </p>
        ) : null}

        {page.error ? (
          <ErrorState
            title="마켓 리소스를 불러오지 못했습니다"
            message={page.error}
            onRetry={page.reload}
            className="mt-6"
          />
        ) : (
          <>
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
                <p className="text-sm text-fg-2">
                  {activeKind
                    ? `아직 공유된 ${marketKindMeta(activeKind).label} 리소스가 없어요.`
                    : "조건에 맞는 공유 리소스가 없어요."}
                </p>
                <Link href="/studio" className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
                  스튜디오에서 첫 리소스 공유하기
                </Link>
              </div>
            ) : null}

            {!page.loading && page.hasMore && !page.error ? (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={page.loadMore}
                  disabled={page.loadingMore}
                  className={buttonClass({ variant: "ghost", size: "md" })}
                >
                  {page.loadingMore ? "불러오는 중…" : "더 보기"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
