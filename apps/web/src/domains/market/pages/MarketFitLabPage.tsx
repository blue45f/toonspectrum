import {
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketProductionProfileEditor } from "../components/MarketProductionProfileEditor";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import { useMarketResources } from "../hooks/use-market-resources";
import {
  evaluateAndSortMarketProductionRecords,
  marketProductionFitSearchText,
} from "../models/market-production-fit";

import type { MarketProductionFitStatus } from "../models/market-production-fit";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { cn } from "@/shared/lib/utils";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

const PAGE_SIZE = 20;
const MARKET_FIT_DESCRIPTION =
  "현재 제작 환경과 서버 manifest를 대조해 웹툰 리소스의 Studio 버전, 렌더러, 사용권, AI 공개, 출처와 전달 방식을 사전점검하세요.";

type FitFilter = "all" | MarketProductionFitStatus;

const FILTERS: readonly {
  readonly id: FitFilter;
  readonly label: string;
  readonly icon: typeof ShieldCheck;
}[] = [
  { id: "all", label: "전체", icon: ShieldCheck },
  { id: "ready", label: "조건 일치", icon: CheckCircle2 },
  { id: "review", label: "확인 필요", icon: CircleAlert },
  { id: "blocked", label: "차단", icon: ShieldX },
];

function filterClass(active: boolean): string {
  return cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    active
      ? "border-accent bg-accent text-on-accent shadow-sm"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
  );
}

export function MarketFitLabPage() {
  const [search, setSearch] = useState("");
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const {
    profile,
    updateProfile,
    resetProfile,
    persistenceAvailable,
  } = useMarketProductionProfile();
  const page = useMarketResources({ limit: PAGE_SIZE, sort: "newest" });

  useDocumentTitle("제작 적합성 랩");
  useMetaDescription(MARKET_FIT_DESCRIPTION);
  usePageSocialMeta({
    canonicalPath: "/market/fit",
    title: "제작 적합성 랩 · 툰스펙트럼",
    description: MARKET_FIT_DESCRIPTION,
  });

  const evaluated = useMemo(
    () => evaluateAndSortMarketProductionRecords(page.items, profile),
    [page.items, profile],
  );
  const counts = useMemo(() => ({
    all: evaluated.length,
    ready: evaluated.filter((item) => item.evaluation.status === "ready").length,
    review: evaluated.filter((item) => item.evaluation.status === "review").length,
    blocked: evaluated.filter((item) => item.evaluation.status === "blocked").length,
  }), [evaluated]);
  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const visible = useMemo(() => evaluated.filter(({ record, evaluation }) => {
    if (fitFilter !== "all" && evaluation.status !== fitFilter) return false;
    return normalizedSearch.length === 0
      || marketProductionFitSearchText(record).includes(normalizedSearch);
  }), [evaluated, fitFilter, normalizedSearch]);

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <MarketNavHeader />
          <p className="eyebrow mt-6 text-accent">Production fit lab</p>
          <h1 className="mt-2 text-pretty text-2xl font-bold leading-tight text-fg sm:text-3xl">
            제작 적합성 랩
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-2">
            리소스를 획득하기 전에 현재 제작 조건과 실제 서버 manifest를 대조하세요.
            조건 일치, 확인 필요, 차단 순으로 정렬하며 근거가 없는 평점이나 호환성을 만들지 않습니다.
          </p>
        </Container>
      </section>

      <Container size="wide" className="py-6 sm:py-8">
        <MarketProductionProfileEditor
          profile={profile}
          onChange={updateProfile}
          onReset={resetProfile}
          persistenceAvailable={persistenceAvailable}
        />

        <section aria-labelledby="market-fit-results-title" className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-accent">Evidence-ranked catalog</p>
              <h2 id="market-fit-results-title" className="mt-1 text-xl font-bold text-fg">
                현재 불러온 서버 결과
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">
                서버의 최신순 페이지 안에서 제작 적합성을 다시 계산합니다. 더 보기를 누르면
                다음 서버 페이지도 같은 기준으로 재정렬합니다.
              </p>
            </div>
            <p className="text-xs text-fg-3" aria-live="polite">
              <span className="numeral tnum font-bold text-fg">{visible.length}</span>개 표시 ·
              서버 결과 <span className="numeral tnum">{counts.all}</span>개
            </p>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-panel p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative">
              <label htmlFor="market-fit-search" className="sr-only">
                불러온 마켓 결과 안에서 검색
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"
                aria-hidden="true"
              />
              <input
                id="market-fit-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
                placeholder="이름·태그·배급자·렌더러·전달 방식 검색"
                className="h-10 w-full appearance-none rounded-xl border border-line bg-card pl-9 pr-10 text-sm text-fg outline-none transition-colors duration-150 placeholder:text-fg-3 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="검색어 지우기"
                  className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:size-11"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="flex max-w-full gap-1.5 overflow-x-auto py-0.5" role="group" aria-label="제작 적합성 상태 필터">
              {FILTERS.map((filter) => {
                const Icon = filter.icon;
                const active = fitFilter === filter.id;
                const count = counts[filter.id];
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-label={`${filter.label} ${count}`}
                    aria-pressed={active}
                    onClick={() => setFitFilter(filter.id)}
                    className={filterClass(active)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {filter.label}
                    <span className="numeral tnum opacity-80" aria-hidden="true">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {page.stale ? (
            <StaleNoticeBar
              savedAt={page.staleSavedAt ?? undefined}
              onRetry={page.reload}
              className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2"
            />
          ) : null}

          {page.loading ? (
            <>
              <p role="status" className="sr-only">마켓 리소스를 불러오는 중입니다.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="overflow-hidden rounded-xl border border-line bg-card">
                    <div className="skeleton aspect-[16/9] w-full" />
                    <div className="space-y-2 p-4">
                      <div className="skeleton h-4 w-4/5" />
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton h-6 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : page.error ? (
            <div role="status" className="mt-5 rounded-2xl border border-warn/40 bg-warn/10 p-8 text-center">
              <p className="text-sm font-bold text-fg">서버 마켓을 불러오지 못했습니다</p>
              <p className="mt-1 text-sm text-fg-2">{page.error}</p>
              <button
                type="button"
                onClick={page.reload}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 gap-1.5" })}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                다시 시도
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-line bg-panel p-8 text-center">
              <ShieldCheck className="mx-auto size-8 text-fg-3" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-fg">선택한 조건의 결과가 없습니다</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg-2">
                검색어 또는 상태 필터를 바꾸거나 더 많은 서버 결과를 불러오세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFitFilter("all");
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
              >
                로컬 필터 초기화
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(({ record }) => (
                <MarketResourceCard key={record.id} record={record} />
              ))}
            </div>
          )}

          {page.loadMoreError ? (
            <div role="status" className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-warn">
              <span>{page.loadMoreError}</span>
              <button
                type="button"
                onClick={page.loadMore}
                className="min-h-9 rounded-lg border border-warn/35 bg-warn/10 px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn/50 pointer-coarse:min-h-11"
              >
                다시 불러오기
              </button>
            </div>
          ) : null}

          {page.hasMore && !page.stale && !page.loadMoreError ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={page.loadMore}
                disabled={page.loadingMore}
                className={buttonClass({ variant: "outline", size: "md", className: "min-w-36 gap-1.5" })}
              >
                {page.loadingMore ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {page.loadingMore ? "불러오는 중" : "서버 결과 더 보기"}
              </button>
            </div>
          ) : null}
        </section>
      </Container>
    </div>
  );
}
