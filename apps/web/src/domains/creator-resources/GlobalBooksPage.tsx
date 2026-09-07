import { BookOpen, ExternalLink, LibraryBig, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { CreatorResource, ResourceProvider, ResourceSearchResult } from "@/shared/lib/creator-resources";

import {
  attributionMarkdown,
  parseSearchResult,
  RESOURCE_LABELS,
} from "@/shared/lib/creator-resources";
import { apiPath } from "@/src/infrastructure/api";

const EXAMPLES = ["webtoon drawing", "manga art", "graphic novel", "9784088820118"] as const;
const SEARCH_PROVIDERS: ResourceProvider[] = ["openlibrary", "openbd"];

interface ProviderResultState {
  provider: ResourceProvider;
  result: ResourceSearchResult | null;
  error: string;
}

function normalizeIsbnCandidate(value: string): string {
  const normalized = value.replace(/[^0-9Xx]/gu, "").toUpperCase();
  return normalized.length === 10 || normalized.length === 13 ? normalized : "";
}

function usageLabel(item: CreatorResource): string {
  if (item.license === "book-promotion") return "도서 소개 목적";
  if (item.license === "CC0") return "공개 이용 확인";
  return "메타데이터·원문 링크";
}

function BookResultCard({
  item,
  saved,
  disabled,
  onToggle,
}: {
  item: CreatorResource;
  saved: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-raised text-accent">
          <BookOpen size={19} aria-hidden="true" />
        </span>
        <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[0.7rem] font-semibold text-fg-2">
          {usageLabel(item)}
        </span>
      </div>
      <p className="mt-5 text-xs font-semibold text-accent">{RESOURCE_LABELS[item.provider]}</p>
      <h2 className="mt-2 break-words text-lg font-bold leading-7 text-fg">{item.title}</h2>
      <p className="mt-2 text-sm leading-6 text-fg-2">
        {item.creator || "저자 정보는 원문에서 확인하세요."}
        {item.dateLabel ? ` · ${item.dateLabel}` : ""}
      </p>
      {item.description ? <p className="mt-3 text-sm leading-6 text-fg-2">{item.description}</p> : null}
      <dl className="mt-4 grid gap-2 rounded-xl bg-raised p-3 text-xs leading-5 text-fg-2">
        {item.credit ? <div><dt className="inline font-semibold text-fg">출판·제공 </dt><dd className="inline">{item.credit}</dd></div> : null}
        {item.isbn ? <div><dt className="inline font-semibold text-fg">ISBN </dt><dd className="inline break-all">{item.isbn}</dd></div> : null}
        <div><dt className="inline font-semibold text-fg">조회 </dt><dd className="inline">{new Date(item.fetchedAt).toLocaleString("ko-KR")}</dd></div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-fg-3">
        {item.provider === "openbd"
          ? "openBD 자료는 일본 도서의 소개·홍보 범위로 사용하며 원본 서지 데이터의 재판매나 임의 변경을 하지 않습니다."
          : "Open Library 검색 결과는 판본 조사와 원문 연결을 위한 메타데이터입니다. 표지나 도서 원문의 이용 권한을 뜻하지 않습니다."}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <a className={RESOURCE_BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
          원문 확인 <ExternalLink size={14} aria-hidden="true" />
        </a>
        <button type="button" className={RESOURCE_BUTTON} aria-pressed={saved} disabled={disabled} onClick={onToggle}>
          {saved ? "저장 해제" : "보드에 저장"}
        </button>
      </div>
    </article>
  );
}

async function requestProvider(
  provider: ResourceProvider,
  query: string,
  page: number,
  signal: AbortSignal,
): Promise<ResourceSearchResult> {
  const search = new URLSearchParams({ provider, q: query, page: String(page) });
  const response = await fetch(apiPath(`/api/creator-resources/search?${search}`), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 429) throw new Error("요청이 많습니다. 잠시 후 다시 검색하세요.");
  if (!response.ok) throw new Error("검색 제공처에 연결하지 못했습니다.");
  const parsed = parseSearchResult(await response.json());
  if (!parsed || parsed.provider !== provider) throw new Error("검색 응답 형식을 확인하지 못했습니다.");
  return parsed;
}

export function GlobalBooksPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= 20 ? pageValue : 1;
  const [draft, setDraft] = useState(query);
  const [states, setStates] = useState<ProviderResultState[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [retry, setRetry] = useState(0);
  const { workspace, update, error, ready, saving, writable } = useCreatorWorkspace();

  useEffect(() => { setDraft(query); }, [query]);

  useEffect(() => {
    setStates([]);
    setRequestError("");
    const trimmed = query.trim();
    if (!trimmed) { setLoading(false); return; }
    if (trimmed.length < 2 || trimmed.length > 80) {
      setLoading(false);
      setRequestError("검색어를 2~80자로 입력하세요.");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    setLoading(true);
    const isbn = normalizeIsbnCandidate(trimmed);
    const providers = isbn && page === 1 ? SEARCH_PROVIDERS : ["openlibrary"] satisfies ResourceProvider[];
    void Promise.allSettled(
      providers.map(async (provider) => ({
        provider,
        result: await requestProvider(provider, trimmed, page, controller.signal),
      })),
    ).then((settled) => {
      if (disposed) return;
      const next = settled.map((entry, index): ProviderResultState => {
        const provider = providers[index];
        if (entry.status === "fulfilled") return { provider, result: entry.value.result, error: "" };
        return {
          provider,
          result: null,
          error: entry.reason instanceof Error ? entry.reason.message : "검색하지 못했습니다.",
        };
      });
      setStates(next);
      if (next.every((entry) => !entry.result)) setRequestError("모든 제공처의 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
    }).catch(() => {
      if (!disposed) setRequestError("검색 결과를 정리하지 못했습니다. 다시 시도하세요.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, page, retry]);

  const items = useMemo(
    () => states.flatMap((state) => state.result?.items ?? []),
    [states],
  );
  const openLibraryResult = states.find((state) => state.provider === "openlibrary")?.result;
  const savedItems = workspace.saved.filter((item) => SEARCH_PROVIDERS.includes(item.provider));
  const hasPartialFailure = states.some((state) => state.error || state.result?.status === "partial" || state.result?.status === "unavailable");

  const toggle = (item: CreatorResource) => {
    const remove = workspace.saved.some((saved) => saved.id === item.id);
    void update((value) => ({
      ...value,
      saved: remove
        ? value.saved.filter((saved) => saved.id !== item.id)
        : value.saved.some((saved) => saved.id === item.id)
          ? value.saved
          : [...value.saved, item],
    }));
  };
  const searchFor = (value: string) => setParams({ q: value.trim(), page: "1" });

  return (
    <ResourceLayout
      title="글로벌 만화·도서 판본 탐색"
      intro="공급자를 고르지 않아도 Open Library의 글로벌 서지와 openBD의 일본 ISBN 정보를 함께 확인합니다. 결과는 판본 조사와 원문 연결을 위한 메타데이터이며, 표지·본문 이용 권한을 의미하지 않습니다."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ProviderStatus provider="openlibrary" />
        <ProviderStatus provider="openbd" />
      </div>

      <form className="space-y-3 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); searchFor(draft); }}>
        <label htmlFor="global-book-query" className="block text-sm font-semibold">작품명·작가·ISBN 검색</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input
              id="global-book-query"
              className={`${RESOURCE_INPUT} pl-10`}
              type="search"
              required
              minLength={2}
              maxLength={80}
              value={draft}
              placeholder="예: graphic novel, manga art, ISBN"
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <button className={`${RESOURCE_BUTTON} shrink-0 bg-accent-soft`} type="submit">통합 검색</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => searchFor(value)}>{value}</button>)}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold text-fg">
          <LibraryBig size={16} aria-hidden="true" /> 저장한 글로벌 판본 {savedItems.length}개
        </span>
        <button className={RESOURCE_BUTTON} disabled={!savedItems.length} onClick={() => downloadText("toonstudio-global-book-sources.md", attributionMarkdown(savedItems))}>출처 내보내기</button>
        <Link className={RESOURCE_BUTTON} to="/research">전체 연구 보드</Link>
        <Link className={RESOURCE_BUTTON} to="/search">기존 작품 검색</Link>
      </div>

      <div aria-live="polite" aria-atomic="true" className="space-y-2 text-sm leading-6 text-fg-2">
        {loading ? <p role="status">글로벌 도서 메타데이터를 확인하고 있습니다…</p> : null}
        {requestError ? <p role="alert">{requestError}</p> : null}
        {!query ? <p>작품명·작가를 입력하면 Open Library를 검색하고, 정확한 ISBN을 입력하면 openBD 일본 판본도 함께 조회합니다.</p> : null}
        {!loading && query && !requestError && items.length === 0 ? <p>현재 검색 범위에서 표시할 판본을 찾지 못했습니다. 다른 표기나 ISBN으로 다시 확인하세요.</p> : null}
        {hasPartialFailure && items.length > 0 ? <p>일부 제공처는 응답하지 않았지만 확인된 결과는 계속 표시합니다.</p> : null}
        {states.map((state) => state.result?.message ? <p key={state.provider}>{RESOURCE_LABELS[state.provider]} · {state.result.message}</p> : null)}
      </div>

      {requestError || hasPartialFailure ? <button className={RESOURCE_BUTTON} type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button> : null}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy={loading}>
        {items.map((item) => (
          <BookResultCard
            key={item.id}
            item={item}
            saved={workspace.saved.some((saved) => saved.id === item.id)}
            disabled={!ready || !writable || saving}
            onToggle={() => toggle(item)}
          />
        ))}
      </div>

      {openLibraryResult && (openLibraryResult.status === "ready" || openLibraryResult.status === "partial") ? (
        <nav className="flex items-center justify-center gap-4" aria-label="글로벌 도서 검색 결과 페이지">
          <button className={RESOURCE_BUTTON} type="button" disabled={page <= 1 || loading} onClick={() => setParams({ q: query, page: String(page - 1) })}>이전</button>
          <span className="text-sm text-fg-2">{page} 페이지</span>
          <button className={RESOURCE_BUTTON} type="button" disabled={!openLibraryResult.hasMore || loading} onClick={() => setParams({ q: query, page: String(page + 1) })}>다음</button>
        </nav>
      ) : null}

      <LocalSaveNotice error={error} writable={writable} saving={saving} />
    </ResourceLayout>
  );
}
