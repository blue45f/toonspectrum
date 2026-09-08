import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  Loader2,
  RotateCcw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ReferenceComparisonDialog,
  ReferenceDetailDialog,
} from "./ReferenceAssetDialogs";
import {
  ResultControls,
  SearchLensGrid,
  SearchWorkspace,
} from "./ReferenceAssetDiscovery";
import type { RecentReferenceSearch } from "./ReferenceAssetDiscovery";
import {
  AssetCard,
  EmptyState,
  ResultSkeleton,
} from "./ReferenceAssetGallery";
import { AssetImage, CountBadge } from "./reference-asset-ui";
import { RESOURCE_BUTTON } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";
import type { ReferenceSearchState, ReferenceViewState } from "@/shared/lib/reference-assets";

import { apiPath } from "@/infrastructure/api";
import { attributionMarkdown, parseSearchResult } from "@/shared/lib/creator-resources";
import {
  buildReferenceApiParams,
  buildReferenceUrlParams,
  defaultReferenceSearchState,
  defaultReferenceViewState,
  filterAndSortReferenceItems,
  nextReferenceComparison,
  parseReferenceUrlParams,
  referenceFacets,
  referenceSearchLabel,
  referenceSearchValidation,
} from "@/shared/lib/reference-assets";
import { toast } from "@/shared/lib/toast-store";

const RECENT_SEARCH_KEY = "toonstudio.reference-assets.recent.v1";
const MAX_COMPARISON = 4;
const EMPTY_RESOURCES: CreatorResource[] = [];

function readRecentSearches(): RecentReferenceSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_SEARCH_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<RecentReferenceSearch>;
      return typeof candidate.key === "string"
        && typeof candidate.label === "string"
        && typeof candidate.params === "string"
        && candidate.key.length <= 500
        && candidate.label.length <= 200
        && candidate.params.length <= 1000
        ? [{ key: candidate.key, label: candidate.label, params: candidate.params }]
        : [];
    }).slice(0, 6);
  } catch {
    return [];
  }
}

function writeRecentSearches(items: RecentReferenceSearch[]) {
  try {
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(items.slice(0, 6)));
  } catch {
    // Search remains fully usable when browser storage is unavailable.
  }
}

export function ReferenceAssetsPage() {
  const [params, setParams] = useSearchParams();
  const paramKey = params.toString();
  const parsed = useMemo(() => parseReferenceUrlParams(new URLSearchParams(paramKey)), [paramKey]);
  const search = parsed.search;
  const view = parsed.view;
  const requestSearch = useMemo<ReferenceSearchState>(() => ({
    query: search.query,
    page: search.page,
    field: search.field,
    departmentId: search.departmentId,
    medium: search.medium,
    geoLocation: search.geoLocation,
    dateBegin: search.dateBegin,
    dateEnd: search.dateEnd,
    highlightOnly: search.highlightOnly,
  }), [
    search.query,
    search.page,
    search.field,
    search.departmentId,
    search.medium,
    search.geoLocation,
    search.dateBegin,
    search.dateEnd,
    search.highlightOnly,
  ]);
  const [draft, setDraft] = useState<ReferenceSearchState>(requestSearch);
  const [advancedOpen, setAdvancedOpen] = useState(() => Boolean(
    search.departmentId || search.medium || search.geoLocation || search.dateBegin || search.dateEnd || search.highlightOnly || search.field !== "all",
  ));
  const [recent, setRecent] = useState<RecentReferenceSearch[]>(readRecentSearches);
  const [result, setResult] = useState<ResourceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [formError, setFormError] = useState("");
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<CreatorResource | null>(null);
  const [detailReturnFocus, setDetailReturnFocus] = useState<HTMLElement | null>(null);
  const [comparison, setComparison] = useState<CreatorResource[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareReturnFocus, setCompareReturnFocus] = useState<HTMLElement | null>(null);
  const { workspace, update, error, ready, saving, writable } = useCreatorWorkspace();

  useEffect(() => {
    setDraft(requestSearch);
    if (requestSearch.field !== "all" || requestSearch.departmentId || requestSearch.medium || requestSearch.geoLocation || requestSearch.dateBegin || requestSearch.dateEnd || requestSearch.highlightOnly) {
      setAdvancedOpen(true);
    }
  }, [requestSearch]);

  useEffect(() => {
    setRequestError("");
    setFormError("");
    if (view.mode === "saved") {
      setLoading(false);
      return;
    }
    if (!requestSearch.query) {
      setResult(null);
      setLoading(false);
      return;
    }
    const validation = referenceSearchValidation(requestSearch);
    if (validation) {
      setResult(null);
      setLoading(false);
      setRequestError(validation);
      return;
    }
    setResult(null);
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    void fetch(apiPath(`/api/creator-resources/search?${buildReferenceApiParams(requestSearch)}`), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (response.status === 429) throw new Error("검색 요청이 많습니다. 잠시 후 다시 시도하세요.");
      if (!response.ok) throw new Error("Met 검색 서버에 연결하지 못했습니다.");
      const parsedResult = parseSearchResult(await response.json());
      if (!parsedResult || parsedResult.provider !== "met") throw new Error("검색 응답 형식을 확인하지 못했습니다.");
      if (!disposed) setResult(parsedResult);
    }).catch((cause: unknown) => {
      if (disposed) return;
      setRequestError(controller.signal.aborted
        ? "검색 시간이 초과되었습니다. 조건을 줄이거나 다시 시도하세요."
        : cause instanceof Error ? cause.message : "검색하지 못했습니다.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [requestSearch, view.mode, retry]);

  const savedItems = useMemo(
    () => workspace.saved.filter((item) => item.provider === "met"),
    [workspace.saved],
  );
  const savedIds = useMemo(() => new Set(workspace.saved.map((item) => item.id)), [workspace.saved]);
  const sourceItems = view.mode === "saved" ? savedItems : result?.items ?? EMPTY_RESOURCES;
  const facets = useMemo(() => ({
    departments: referenceFacets(sourceItems, "department"),
    cultures: referenceFacets(sourceItems, "culture"),
    classifications: referenceFacets(sourceItems, "classification"),
  }), [sourceItems]);
  const visibleItems = useMemo(
    () => filterAndSortReferenceItems(sourceItems, view, savedIds),
    [sourceItems, view, savedIds],
  );
  const savingDisabled = !ready || !writable || saving;

  const replaceUrl = (nextSearch: ReferenceSearchState, nextView: ReferenceViewState) => {
    setParams(buildReferenceUrlParams(nextSearch, nextView));
  };

  const updateView = (next: Partial<ReferenceViewState>) => {
    replaceUrl(search, { ...view, ...next });
  };

  const rememberSearch = (nextSearch: ReferenceSearchState) => {
    const paramsValue = buildReferenceUrlParams(nextSearch, defaultReferenceViewState()).toString();
    const entry: RecentReferenceSearch = {
      key: paramsValue,
      label: referenceSearchLabel(nextSearch),
      params: paramsValue,
    };
    setRecent((current) => {
      const next = [entry, ...current.filter((item) => item.key !== entry.key)].slice(0, 6);
      writeRecentSearches(next);
      return next;
    });
  };

  const runSearch = (nextDraft = draft) => {
    const normalized = {
      ...nextDraft,
      query: nextDraft.query.trim(),
      medium: nextDraft.medium.trim(),
      geoLocation: nextDraft.geoLocation.trim(),
      dateBegin: nextDraft.dateBegin.trim(),
      dateEnd: nextDraft.dateEnd.trim(),
      page: 1,
    };
    const validation = referenceSearchValidation(normalized);
    setFormError(validation);
    if (validation) return;
    const nextView = {
      ...view,
      mode: "results" as const,
      within: "",
      department: "",
      culture: "",
      classification: "",
    };
    rememberSearch(normalized);
    replaceUrl(normalized, nextView);
  };

  const runSimilarSearch = (query: string) => {
    const next = {
      ...defaultReferenceSearchState(),
      query: query.trim().slice(0, 80),
    };
    setDetail(null);
    runSearch(next);
  };

  const toggleSaved = (item: CreatorResource) => {
    const remove = savedIds.has(item.id);
    if (!remove && workspace.saved.length >= 200) {
      toast("연구 보드는 최대 200개까지 저장할 수 있습니다. 기존 자료를 정리한 뒤 다시 시도하세요.", { tone: "error" });
      return;
    }
    void update((value) => ({
      ...value,
      saved: remove
        ? value.saved.filter((saved) => saved.id !== item.id)
        : value.saved.some((saved) => saved.id === item.id)
          ? value.saved
          : [...value.saved, item],
    })).then((committed) => {
      if (committed) toast(remove ? "연구 보드에서 제거했습니다." : "연구 보드에 저장했습니다.", { tone: "success" });
    });
  };

  const toggleComparison = (item: CreatorResource) => {
    const currentIds = comparison.map((candidate) => candidate.id);
    const nextIds = nextReferenceComparison(currentIds, item.id, MAX_COMPARISON);
    if (!currentIds.includes(item.id) && nextIds.length === currentIds.length) {
      toast(`비교 보드에는 최대 ${MAX_COMPARISON}개까지 담을 수 있습니다.`, { tone: "error" });
      return;
    }
    setComparison(nextIds.map((id) => comparison.find((candidate) => candidate.id === id) ?? item));
  };

  const openDetail = (item: CreatorResource, trigger: HTMLElement | null) => {
    setDetailReturnFocus(trigger);
    setDetail(item);
  };

  const exportJson = () => {
    downloadText(
      "toonstudio-reference-board.json",
      JSON.stringify({
        schema: "toonstudio.reference-board.v1",
        exportedAt: new Date().toISOString(),
        notice: "Met CC0 표시와 각 작품 원문을 제작 시점에 다시 확인하세요.",
        items: savedItems,
      }, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const showControls = Boolean(search.query || view.mode === "saved" || savedItems.length);
  const gridClass = view.density === "compact"
    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
    : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <ResourceLayout
      width="wide"
      title="창작 레퍼런스 아틀라스"
      intro="The Met의 공개 미술 자료를 장면 목적에 맞게 탐색하고, 형태·시대·재료를 비교한 뒤 출처와 함께 연구 보드에 보관하세요. 공개 도메인과 CC0 표시, 안전한 이미지 주소가 확인된 자료만 미리보기를 제공합니다."
    >
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent-soft via-panel to-raised p-6 sm:p-8">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <CountBadge><ShieldCheck size={14} aria-hidden="true" /> 공개 이용 검증</CountBadge>
              <CountBadge><Filter size={14} aria-hidden="true" /> 장면 목적 필터</CountBadge>
              <CountBadge><Scale size={14} aria-hidden="true" /> 최대 4개 비교</CountBadge>
            </div>
            <h2 className="mt-6 max-w-3xl font-display text-2xl font-bold leading-tight text-fg sm:text-3xl">
              검색 결과를 모으는 페이지에서<br className="hidden sm:block" /> 장면의 시각 근거를 설계하는 작업대로
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2">
              복식, 소품, 공간, 자세, 패턴을 검색하고 현재 결과 안에서 문화권과 분류를 좁혀 보세요. 상세 화면에서는 고해상도 원본, 치수, 재료, 태그를 확인하고 출처 문구를 바로 복사할 수 있습니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-line bg-canvas/80 p-4 backdrop-blur">
              <p className="text-2xl font-bold text-fg">{savedItems.length}</p>
              <p className="mt-1 text-xs text-fg-3">저장 자료</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas/80 p-4 backdrop-blur">
              <p className="text-2xl font-bold text-fg">{result?.items.length ?? 0}</p>
              <p className="mt-1 text-xs text-fg-3">현재 검증</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas/80 p-4 backdrop-blur">
              <p className="text-2xl font-bold text-fg">{comparison.length}</p>
              <p className="mt-1 text-xs text-fg-3">비교 선택</p>
            </div>
          </div>
        </div>
      </section>

      <ProviderStatus provider="met" />

      <SearchWorkspace
        draft={draft}
        setDraft={setDraft}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        recent={recent}
        onSubmit={() => runSearch()}
        onResetFilters={() => setDraft((current) => ({ ...defaultReferenceSearchState(), query: current.query }))}
        onRecent={(entry) => setParams(new URLSearchParams(entry.params))}
        onClearRecent={() => {
          setRecent([]);
          writeRecentSearches([]);
        }}
      />

      {!search.query && view.mode === "results" ? <SearchLensGrid onSelect={(next) => runSearch(next)} /> : null}

      {showControls ? (
        <ResultControls
          search={search}
          view={view}
          itemCount={result?.items.length ?? 0}
          total={result?.total}
          savedCount={savedItems.length}
          facets={facets}
          onView={updateView}
          onExportMarkdown={() => downloadText("toonstudio-reference-sources.md", attributionMarkdown(savedItems))}
          onExportJson={exportJson}
        />
      ) : null}

      <div aria-live="polite" aria-atomic="true" className="space-y-2 text-sm leading-6 text-fg-2">
        {loading ? <p role="status" className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> 공개 이용 조건과 작품 메타데이터를 확인하고 있습니다…</p> : null}
        {formError ? <p role="alert" className="font-semibold text-fg">{formError}</p> : null}
        {requestError ? <p role="alert" className="font-semibold text-fg">{requestError}</p> : null}
        {!loading && result?.message && view.mode === "results" ? <p><Info className="mr-1 inline size-4" aria-hidden="true" /> {result.message}</p> : null}
        {result?.status === "partial" ? <p>일부 상세 응답은 제외했지만 확인된 자료는 계속 사용할 수 있습니다.</p> : null}
      </div>

      {requestError ? (
        <button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={() => setRetry((value) => value + 1)}>
          <RotateCcw size={15} aria-hidden="true" /> 다시 시도
        </button>
      ) : null}

      {loading && view.mode === "results" ? <ResultSkeleton density={view.density} /> : null}

      {!loading && visibleItems.length > 0 ? (
        <div className={gridClass} aria-label="창작 레퍼런스 결과">
          {visibleItems.map((item) => (
            <AssetCard
              key={item.id}
              item={item}
              density={view.density}
              saved={savedIds.has(item.id)}
              compared={comparison.some((candidate) => candidate.id === item.id)}
              savingDisabled={savingDisabled}
              onOpen={(trigger) => openDetail(item, trigger)}
              onToggleSaved={() => toggleSaved(item)}
              onToggleCompare={() => toggleComparison(item)}
            />
          ))}
        </div>
      ) : null}

      {!loading && view.mode === "saved" && savedItems.length === 0 ? (
        <EmptyState title="아직 저장한 레퍼런스가 없습니다" description="검색 결과에서 북마크 버튼을 누르면 공개 이용 정보와 출처를 함께 이 브라우저의 연구 보드에 보관합니다." />
      ) : null}

      {!loading && sourceItems.length > 0 && visibleItems.length === 0 ? (
        <EmptyState
          title="현재 결과 필터와 일치하는 자료가 없습니다"
          description="결과 내 검색어나 문화권·분류 필터를 줄이면 다시 표시됩니다."
          action={<button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={() => updateView({ within: "", department: "", culture: "", classification: "" })}><RotateCcw size={15} aria-hidden="true" /> 결과 필터 초기화</button>}
        />
      ) : null}

      {!loading && !requestError && view.mode === "results" && search.query && result && result.items.length === 0 ? (
        <EmptyState
          title="검증해 표시할 자료를 찾지 못했습니다"
          description="검색 후보가 있어도 공개 도메인 표시나 안전한 이미지가 확인되지 않으면 제외됩니다. 더 넓은 키워드나 다른 부서로 다시 검색해 보세요."
          action={<button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={() => setAdvancedOpen(true)}><SlidersHorizontal size={15} aria-hidden="true" /> 검색 조건 조정</button>}
        />
      ) : null}

      {!search.query && view.mode === "results" ? (
        <div className="grid gap-4 rounded-3xl border border-line bg-panel p-6 md:grid-cols-3">
          <div>
            <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-fg">권리 상태 우선</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">공개 도메인·CC0와 안전한 Met 이미지 호스트가 확인된 결과만 화면에 남깁니다.</p>
          </div>
          <div>
            <Tags className="size-5 text-accent" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-fg">메타데이터 기반 탐색</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">부서, 문화권, 시대, 오브젝트 유형, 재료와 태그를 장면 설계의 단서로 사용합니다.</p>
          </div>
          <div>
            <Scale className="size-5 text-accent" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-fg">비교 후 저장</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">최대 네 작품을 나란히 비교하고 선택한 자료만 출처와 함께 연구 보드로 넘깁니다.</p>
          </div>
        </div>
      ) : null}

      {!loading && view.mode === "results" && result && (result.status === "ready" || result.status === "partial") ? (
        <nav className="flex items-center justify-center gap-4" aria-label="레퍼런스 검색 결과 페이지">
          <button
            type="button"
            className={`${RESOURCE_BUTTON} gap-2`}
            disabled={search.page <= 1}
            onClick={() => replaceUrl({ ...search, page: search.page - 1 }, { ...view, within: "", department: "", culture: "", classification: "" })}
          >
            <ChevronLeft size={16} aria-hidden="true" /> 이전
          </button>
          <span className="min-w-24 text-center text-sm font-semibold text-fg-2">{search.page} / 20 페이지</span>
          <button
            type="button"
            className={`${RESOURCE_BUTTON} gap-2`}
            disabled={!result.hasMore || search.page >= 20}
            onClick={() => replaceUrl({ ...search, page: search.page + 1 }, { ...view, within: "", department: "", culture: "", classification: "" })}
          >
            다음 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      <LocalSaveNotice error={error} writable={writable} saving={saving} />

      {comparison.length > 0 ? (
        <aside className="sticky bottom-4 z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-canvas/95 p-3 shadow-2xl backdrop-blur" aria-label="레퍼런스 비교 선택">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Scale size={17} aria-hidden="true" /></span>
            {comparison.map((item) => (
              <button key={item.id} type="button" onClick={(event) => openDetail(item, event.currentTarget)} className="flex min-w-40 max-w-52 items-center gap-2 rounded-xl border border-line bg-panel p-2 text-left">
                <AssetImage item={item} className="size-10 shrink-0 rounded-lg p-1" />
                <span className="min-w-0 truncate text-xs font-semibold text-fg">{item.title}</span>
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-fg-3">{comparison.length}/{MAX_COMPARISON}</span>
          <button type="button" className={`${RESOURCE_BUTTON} gap-2 border-accent bg-accent text-white hover:bg-accent/90`} disabled={comparison.length < 2} onClick={(event) => {
            setCompareReturnFocus(event.currentTarget);
            setCompareOpen(true);
          }}>
            <Scale size={15} aria-hidden="true" /> 비교하기
          </button>
          <button type="button" className={RESOURCE_BUTTON} onClick={() => setComparison([])}>비우기</button>
        </aside>
      ) : null}

      {detail ? (
        <ReferenceDetailDialog
          key={detail.id}
          item={detail}
          saved={savedIds.has(detail.id)}
          savingDisabled={savingDisabled}
          returnFocus={detailReturnFocus}
          onClose={() => setDetail(null)}
          onToggleSaved={() => toggleSaved(detail)}
          onSimilar={runSimilarSearch}
        />
      ) : null}

      {compareOpen && comparison.length >= 2 ? (
        <ReferenceComparisonDialog
          items={comparison}
          returnFocus={compareReturnFocus}
          onClose={() => setCompareOpen(false)}
          onRemove={(id) => {
            setComparison((items) => items.filter((item) => item.id !== id));
            if (comparison.length <= 2) setCompareOpen(false);
          }}
          onOpenDetail={(item) => {
            setCompareOpen(false);
            openDetail(item, null);
          }}
        />
      ) : null}
    </ResourceLayout>
  );
}
