import { BookOpen, PenLine, Plus, Sparkles, Trophy, UserCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { SeriesCard, SeriesForm, WorkCard, WorkGridSkeleton } from "./creator-community-ui";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";
import { ErrorState } from "@/src/components/error-state";
import {
  listFollowingFeed,
  listSeries,
  listWorks,
  type SeriesSummary,
  type WorkSort,
  type WorkSummary,
} from "@/src/lib/creator-client";


const SORTS: { value: WorkSort; label: string }[] = [
  { value: "recent", label: "최신" },
  { value: "likes", label: "인기" },
  { value: "views", label: "조회" },
];

type GalleryTab = "works" | "series" | "following";

const TABS: { value: GalleryTab; label: string }[] = [
  { value: "works", label: "전체 작품" },
  { value: "series", label: "시리즈" },
  { value: "following", label: "팔로잉" },
];

const CREATOR_BOARD_HERO = "/assets/create/creator-board-hero.png";
const CREATOR_BOARD_EMPTY = "/assets/create/creator-board-empty.png";

function isSort(value: string | null): value is WorkSort {
  return value === "recent" || value === "likes" || value === "views";
}

function isTab(value: string | null): value is GalleryTab {
  return value === "works" || value === "series" || value === "following";
}

// ── 전체 작품 탭 ──────────────────────────────────────────────────────
function WorksTab({ sort, tag }: { sort: WorkSort; tag: string }) {
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

  if (error) {
    return (
      <ErrorState
        title="창작물을 불러오지 못했습니다."
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }
  if (loading) return <WorkGridSkeleton />;
  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <img
          src={CREATOR_BOARD_EMPTY}
          alt=""
          className="mx-auto mb-5 aspect-square w-40 max-w-full rounded-2xl object-cover"
          loading="lazy"
          decoding="async"
        />
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
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {works.map((work) => (
        <WorkCard key={work.id} work={work} />
      ))}
    </div>
  );
}

// ── 시리즈 탭 — 연재 시리즈 카드 + 새 시리즈 만들기 ─────────────────────
function SeriesTab({ sort }: { sort: WorkSort }) {
  const userId = useApp((s) => s.userId);
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listSeries({ sort }, controller.signal)
      .then((result) => {
        if (alive) setSeries(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "시리즈 목록을 불러오지 못했습니다.");
        setSeries([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [sort, reloadKey]);

  return (
    <div className="flex flex-col gap-4">
      {userId && (
        <div>
          {creating ? (
            <SeriesForm
              onSaved={(saved) => {
                setCreating(false);
                setSeries((current) => [saved, ...current]);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}
            >
              <Plus size={14} />새 시리즈 만들기
            </button>
          )}
        </div>
      )}

      {error ? (
        <ErrorState
          title="시리즈를 불러오지 못했습니다."
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex gap-3.5 rounded-2xl border border-line bg-panel/30 p-3">
              <span className="skeleton block aspect-[3/4] w-24 rounded-xl sm:w-28" />
              <div className="flex-1 space-y-2 py-1">
                <span className="skeleton block h-4 w-2/3" />
                <span className="skeleton block h-3 w-full" />
                <span className="skeleton block h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
          <BookOpen size={26} className="mx-auto mb-3 text-fg-3" />
          <p className="text-sm font-medium text-fg">아직 연재 시리즈가 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">
            시리즈를 만들고 작품 상세에서 회차로 연결하면 연재가 시작됩니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {series.map((item) => (
            <SeriesCard key={item.id} series={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 팔로잉 탭 — 팔로우한 창작자의 최신 작품(비로그인 시 로그인 유도) ──────
function FollowingTab() {
  const userId = useApp((s) => s.userId);
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listFollowingFeed(controller.signal)
      .then((result) => {
        if (alive) setWorks(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "팔로잉 피드를 불러오지 못했습니다.");
        setWorks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId, reloadKey]);

  if (!userId) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <UserCheck size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">로그인하고 좋아하는 창작자를 팔로우해 보세요.</p>
        <p className="mt-1 text-xs text-fg-3">팔로우한 창작자의 새 작품이 이곳에 모입니다.</p>
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        title="팔로잉 피드를 불러오지 못했습니다."
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }
  if (loading) return <WorkGridSkeleton count={5} />;
  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <UserCheck size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">아직 팔로우한 창작자가 없습니다.</p>
        <p className="mt-1 text-xs text-fg-3">
          마음에 드는 작품의 작성자 프로필에서 팔로우하면 새 작품을 여기서 볼 수 있어요.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {works.map((work) => (
        <WorkCard key={work.id} work={work} />
      ))}
    </div>
  );
}

export function CreateGalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort");
  const sort: WorkSort = isSort(sortParam) ? sortParam : "recent";
  const tabParam = searchParams.get("tab");
  const tab: GalleryTab = isTab(tabParam) ? tabParam : "works";
  const tag = searchParams.get("tag") ?? "";

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value == null) params.delete(key);
    else params.set(key, value);
    setSearchParams(params, { replace: true });
  };

  return (
    <Container size="wide" className="py-10">
      <header className="relative mb-7 overflow-hidden rounded-2xl border border-line bg-panel/45 p-5 shadow-sm sm:p-6">
        <img
          src={CREATOR_BOARD_HERO}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.1_0.015_245/0.92)] via-[oklch(0.1_0.015_245/0.72)] to-[oklch(0.1_0.015_245/0.18)]" />
        <div className="relative flex min-h-[230px] flex-col justify-between gap-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5 text-accent">
                <Sparkles size={14} /> CREATOR BOARD
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">창작 게시판</h1>
              <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-white/78">
                직접 그린 컷툰과 업로드한 작품을 자유롭게 공유하는 공간입니다. 연재 시리즈를 만들고,
                챌린지에 참여하고, 좋아하는 창작자를 팔로우해 보세요.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/create/challenges"
                className={buttonClass({
                  variant: "outline",
                  className: "gap-1.5 border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20",
                })}
              >
                <Trophy size={16} />
                창작 챌린지
              </Link>
              <Link href="/studio" className={buttonClass({ variant: "solid", className: "gap-1.5" })}>
                <PenLine size={16} />
                창작 스튜디오로 만들기
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/15 pt-4">
            {/* 탭: 전체 작품 / 시리즈 / 팔로잉 */}
            <div role="tablist" aria-label="보기" className="flex flex-wrap gap-1.5">
              {TABS.map((option) => {
                const on = option.value === tab;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setParam("tab", option.value === "works" ? null : option.value)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                      on
                        ? "border-accent bg-accent text-on-accent"
                        : "border-white/18 bg-white/10 text-white/78 backdrop-blur-md hover:bg-white/15"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* 정렬(작품·시리즈 탭에서만) */}
            {tab !== "following" && (
              <div role="tablist" aria-label="정렬" className="ml-1 flex flex-wrap gap-1.5 border-l border-white/15 pl-3">
                {SORTS.map((option) => {
                  const on = option.value === sort;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setParam("sort", option.value)}
                      className={cn(
                        "inline-flex h-8 items-center rounded-full border px-3.5 text-[0.8125rem] transition-colors",
                        on
                          ? "border-accent/70 bg-accent text-white"
                          : "border-white/18 bg-white/10 text-white/78 backdrop-blur-md hover:bg-white/15"
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}

            {tag && tab === "works" && (
              <button
                type="button"
                onClick={() => setParam("tag", null)}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border border-accent/50 bg-accent-soft/70 px-3 text-[0.8125rem] text-white transition-colors hover:bg-accent-soft"
              >
                #{tag}
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </header>

      {tab === "works" ? <WorksTab sort={sort} tag={tag} /> : tab === "series" ? <SeriesTab sort={sort} /> : <FollowingTab />}
    </Container>
  );
}
