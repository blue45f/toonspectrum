import { Hash, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  filterTagDirectory,
  tagDirectorySort,
  type TagDirectoryEntry,
  type TagDirectorySort,
} from "./tag-directory";

import Link from "@/compat/router-link";
import { ErrorState } from "@/components/error-state";
import { Container } from "@/shared/components/section";
import { genreBorder, genreTextColor, genreTint } from "@/shared/lib/genre-color";
import { useApiResource } from "@/platform/use-api-resource";

interface TagsResponse {
  readonly tags: TagDirectoryEntry[];
}

const INITIAL_VISIBLE = 120;
const VISIBLE_STEP = 120;

export function TagsPage() {
  const { data, loading, error, reload } = useApiResource<TagsResponse>(
    "/api/tags",
    "태그를 불러오지 못했습니다.",
  );
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 80);
  const sort = tagDirectorySort(params.get("sort"));
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const filtered = useMemo(
    () => filterTagDirectory(data?.tags ?? [], query, sort),
    [data?.tags, query, sort],
  );
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => setVisibleCount(INITIAL_VISIBLE), [query, sort]);

  const updateParam = (name: "q" | "sort", value: string, fallback: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!value || value === fallback) next.delete(name);
      else next.set(name, value);
      return next;
    }, { replace: true, preventScrollReset: true });
  };
  const setSort = (value: TagDirectorySort) => updateParam("sort", value, "popular");

  return (
    <Container size="wide" className="py-8 sm:py-11 lg:py-14">
      <header className="max-w-3xl">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <Hash size={14} aria-hidden="true" /> TAG SPECTRUM
        </p>
        <h1 className="mt-2 text-pretty font-display text-[clamp(2.25rem,7vw,4.75rem)] font-bold leading-[1] tracking-[-0.055em] text-fg">
          태그로 작품 찾기
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">
          작품의 분위기와 소재를 검색하고, 인기순 또는 이름순으로 좁혀 보세요.
          태그는 한 번에 120개씩 표시해 모바일에서도 빠르게 탐색할 수 있습니다.
        </p>
      </header>

      <section className="mt-7 rounded-3xl border border-line bg-panel/60 p-4 sm:p-5" aria-labelledby="tag-filter-title">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <SlidersHorizontal size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="tag-filter-title" className="font-display text-lg font-bold text-fg">태그 검색과 정렬</h2>
            <p className="mt-1 text-xs leading-6 text-fg-3">검색과 정렬 조건은 주소에 남아 같은 결과를 다시 열거나 공유할 수 있습니다.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="sr-only">태그 검색</span>
            <span className="flex min-h-12 items-center gap-3 rounded-xl border border-line-strong bg-card px-3 text-fg-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                maxLength={80}
                onChange={(event) => updateParam("q", event.target.value, "")}
                placeholder="예: 힐링, 회귀, 학원물"
                className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => updateParam("q", "", "")}
                  className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  aria-label="태그 검색 지우기"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </label>
          <fieldset className="flex min-h-12 gap-2" aria-label="태그 정렬">
            {(["popular", "name"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-fg-3 aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {value === "popular" ? "인기순" : "이름순"}
              </button>
            ))}
          </fieldset>
        </div>
      </section>

      <p className="mt-5 text-xs text-fg-3" role="status" aria-live="polite">
        {loading
          ? "태그를 불러오는 중입니다."
          : `${filtered.length.toLocaleString("ko-KR")}개 태그 중 ${visible.length.toLocaleString("ko-KR")}개 표시`}
      </p>

      {error ? (
        <div className="mt-5">
          <ErrorState title="태그를 불러오지 못했습니다." message={error} onRetry={reload} />
        </div>
      ) : loading ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="태그 목록 불러오는 중">
          {Array.from({ length: 24 }).map((_, index) => (
            <span key={index} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : visible.length ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="태그 목록">
          {visible.map(({ tag, count }) => (
            <li key={tag} className="min-w-0">
              <Link
                href={`/explore?tags=${encodeURIComponent(tag)}`}
                aria-label={`${tag}, 작품 ${count.toLocaleString("ko-KR")}편`}
                className="flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-transform duration-150 ease-out-expo hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                style={{
                  color: genreTextColor(tag, 0.9),
                  backgroundColor: genreTint(tag, 0.1),
                  borderColor: genreBorder(tag, 0.28),
                }}
              >
                <span aria-hidden="true" className="shrink-0 opacity-50">#</span>
                <span className="min-w-0 flex-1 truncate">{tag}</span>
                <span className="shrink-0 rounded-full bg-canvas/60 px-2 py-1 text-[0.68rem] font-semibold text-fg-3">
                  {count.toLocaleString("ko-KR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-line-strong bg-panel/50 p-8 text-center">
          <Hash size={28} className="mx-auto text-accent" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-bold text-fg">일치하는 태그가 없습니다.</h2>
          <p className="mt-2 text-sm leading-6 text-fg-3">검색어를 줄이거나 다른 표현으로 찾아보세요.</p>
          <button
            type="button"
            onClick={() => updateParam("q", "", "")}
            className="mt-3 min-h-11 rounded-xl px-4 text-sm font-bold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            검색 초기화
          </button>
        </div>
      )}

      {visible.length < filtered.length ? (
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + VISIBLE_STEP)}
            className="min-h-12 rounded-xl border border-line-strong bg-card px-5 text-sm font-bold text-fg-2 hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            다음 {Math.min(VISIBLE_STEP, filtered.length - visible.length).toLocaleString("ko-KR")}개 태그 보기
          </button>
        </div>
      ) : null}
    </Container>
  );
}
