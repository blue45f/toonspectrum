import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "@/src/compat/router-link";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { ErrorState } from "@/src/components/error-state";
import { cn, formatCount, relativeDate } from "@/lib/utils";
import { listWorks, type WorkSort, type WorkSummary } from "@/src/lib/creator-client";
import { Eye, Heart, MessageCircle, PenLine, Sparkles, X } from "lucide-react";

const SORTS: { value: WorkSort; label: string }[] = [
  { value: "recent", label: "최신" },
  { value: "likes", label: "인기" },
  { value: "views", label: "조회" },
];

const FORMAT_LABEL: Record<WorkSummary["format"], string> = {
  cuttoon: "컷툰",
  upload: "업로드",
};

function isSort(value: string | null): value is WorkSort {
  return value === "recent" || value === "likes" || value === "views";
}

function WorkCard({ work }: { work: WorkSummary }) {
  return (
    <Link
      href={`/create/${work.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/30 transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-raised/40">
        <CoverImage
          src={work.cover}
          alt={work.title}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          fallback={
            <span className="grid h-full w-full place-items-center bg-gradient-to-br from-raised to-card text-fg-3">
              <PenLine size={28} />
            </span>
          }
        />
        <span className="absolute left-2 top-2 inline-flex items-center rounded-full border border-line/60 bg-[oklch(0.16_0.01_70/0.7)] px-2 py-0.5 text-[0.66rem] font-medium text-fg-2 backdrop-blur-md">
          {FORMAT_LABEL[work.format]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-fg group-hover:text-accent">
          {work.title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-fg-3">
          <span className="size-4 shrink-0 overflow-hidden rounded-full bg-raised ring-1 ring-line">
            {work.author.avatar ? (
              <CoverImage
                src={work.author.avatar}
                alt=""
                className="h-full w-full object-cover"
                fallback={<span className="block h-full w-full bg-raised" />}
              />
            ) : (
              <span className="block h-full w-full bg-raised" aria-hidden />
            )}
          </span>
          <span className="truncate">{work.author.name}</span>
        </div>
        <div className="mt-auto flex items-center gap-3 pt-1.5 text-[0.72rem] text-fg-3">
          <span className="inline-flex items-center gap-1">
            <Heart size={12} className={cn(work.liked && "fill-accent text-accent")} />
            <span className="numeral">{formatCount(work.likes)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} />
            <span className="numeral">{formatCount(work.comments)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye size={12} />
            <span className="numeral">{formatCount(work.views)}</span>
          </span>
          <span className="ml-auto shrink-0">{relativeDate(work.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export function CreateGalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort");
  const sort: WorkSort = isSort(sortParam) ? sortParam : "recent";
  const tag = searchParams.get("tag") ?? "";

  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listWorks({ sort, tag: tag || undefined }, controller.signal)
      .then((result) => {
        if (alive) setWorks(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "창작물 목록을 불러오지 못했습니다.");
        setWorks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [sort, tag, reloadKey]);

  const setSort = (next: WorkSort) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", next);
    setSearchParams(params, { replace: true });
  };

  const clearTag = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("tag");
    setSearchParams(params, { replace: true });
  };

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7 overflow-hidden rounded-2xl border border-line bg-panel/45 p-5 surface-hl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <Sparkles size={14} /> CREATOR BOARD
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">창작 게시판</h1>
            <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
              직접 그린 컷툰과 업로드한 작품을 자유롭게 공유하는 공간입니다. 좋아요와 댓글로 다른
              창작자를 응원해 보세요.
            </p>
          </div>
          <Link
            href="/studio"
            className={buttonClass({ variant: "solid", className: "shrink-0 gap-1.5" })}
          >
            <PenLine size={16} />
            창작 스튜디오로 만들기
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <div role="tablist" aria-label="정렬" className="flex flex-wrap gap-1.5">
            {SORTS.map((option) => {
              const on = option.value === sort;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSort(option.value)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3.5 text-[0.8125rem] transition-colors",
                    on
                      ? "border-accent/60 bg-accent-soft/55 text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {tag && (
            <button
              type="button"
              onClick={clearTag}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border border-accent/50 bg-accent-soft/50 px-3 text-[0.8125rem] text-accent transition-colors hover:bg-accent-soft"
            >
              #{tag}
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      {error ? (
        <ErrorState
          title="창작물을 불러오지 못했습니다."
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel/30">
              <span className="skeleton block aspect-[3/4]" />
              <div className="space-y-2 p-3">
                <span className="skeleton block h-4 w-full" />
                <span className="skeleton block h-3 w-2/3" />
                <span className="skeleton block h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
          <PenLine size={26} className="mx-auto mb-3 text-fg-3" />
          <p className="text-sm font-medium text-fg">
            {tag ? `#${tag} 태그의 창작물이 아직 없습니다.` : "아직 등록된 창작물이 없습니다."}
          </p>
          <p className="mt-1 text-xs text-fg-3">첫 번째 작품을 올려 창작 게시판을 채워 보세요.</p>
          <Link
            href="/studio"
            className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
          >
            <PenLine size={14} />
            창작 스튜디오로 만들기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {works.map((work) => (
            <WorkCard key={work.id} work={work} />
          ))}
        </div>
      )}
    </Container>
  );
}
