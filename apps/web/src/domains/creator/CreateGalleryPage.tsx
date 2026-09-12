import { BookOpen, PenLine, Plus, Sparkles, UserCheck, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { CreateFeaturedSections } from "./CreateFeaturedSections";
import { SeriesCard, SeriesForm, WorkCard, WorkGridSkeleton } from "./creator-community-ui";
import { WebtoonGalleryIntro } from "./WebtoonGalleryIntro";

import { Container } from "@/shared/components/section";
import { CreativeJourneyLinks } from "@/shared/components/public-creative";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";
import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import Link from "@/compat/router-link";
import { ErrorState } from "@/components/error-state";
import {
  listFollowingFeed,
  listSeries,
  listWorks,
  type SeriesSummary,
  type WorkSort,
  type WorkSummary,
} from "@/infrastructure/creator-client";


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

// root-relative 자산은 정적 경로 헬퍼를 거쳐 렌더링합니다.
const CREATOR_BOARD_EMPTY = "/assets/create/creator-board-empty.png";

function isSort(value: string | null): value is WorkSort {
  return value === "recent" || value === "likes" || value === "views";
}

function isTab(value: string | null): value is GalleryTab {
  return value === "works" || value === "series" || value === "following";
}

// ── 공용 빈-상태 ─────────────────────────────────────────────────────
// 아이콘 메달리온 기반(시리즈/팔로잉) — 글로우 링 + sparkle 로 프리미엄하게. 일러스트 빈-상태와 톤 일치.
function IconEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-line bg-gradient-to-b from-card/55 to-panel/30 px-6 py-12 text-center">
      {/* 은은한 액센트 글로우 — 배경에만 깔려 가독성 영향 없음 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-4 h-32 w-32 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.72 0.185 42 / 0.35), transparent 70%)" }}
      />
      <span
        aria-hidden
        className="pf-glow relative mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-accent/30 bg-accent-soft/60 text-accent"
      >
        {icon}
        <Sparkles size={13} className="pf-sparkle absolute -right-1 -top-1 text-warn" />
      </span>
      <p className="relative text-base font-semibold text-fg">{title}</p>
      <p className="relative mx-auto mt-1.5 max-w-xs text-pretty text-[0.8125rem] leading-relaxed text-fg-3">
        {description}
      </p>
      {action && <div className="relative mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// 일러스트 기반(전체 작품) — 이제 정상 로드되는 보드 일러스트를 카드에 곱게 프레이밍 + sheen.
function IllustratedEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="sheen-sweep relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-card/60 via-panel/35 to-panel/20 px-6 py-11 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60 blur-3xl"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, oklch(0.72 0.185 42 / 0.28), transparent 75%)" }}
      />
      <div className="relative mx-auto mb-5 w-44 max-w-[60%]">
        {/* 일러스트 프레임 — 흰 배경 일러스트를 라운드 카드 + 링 + 글로우로 감싸 캔버스와 자연스럽게 어우러지게 */}
        <span
          aria-hidden
          className="pf-sparkle absolute -left-3 -top-2 z-10 text-warn drop-shadow"
        >
          <Sparkles size={20} />
        </span>
        <div className="overflow-hidden rounded-2xl bg-[oklch(0.97_0.012_85)] shadow-[0_12px_40px_-12px_oklch(0.1_0.02_60/0.8)] ring-1 ring-line/70">
          <img
            src={resolveAssetUrl(CREATOR_BOARD_EMPTY)}
            alt=""
            className="aspect-square w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <p className="relative text-base font-semibold text-fg">{title}</p>
      <p className="relative mx-auto mt-1.5 max-w-xs text-pretty text-[0.8125rem] leading-relaxed text-fg-3">
        {description}
      </p>
      <Link
        href="/studio"
        className={buttonClass({ size: "md", variant: "solid", className: "relative mt-5 gap-1.5 shadow-lg shadow-accent/20" })}
      >
        <PenLine size={15} />
        창작 스튜디오로 만들기
      </Link>
    </div>
  );
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
      <IllustratedEmptyState
        title={tag ? `#${tag} 태그의 창작물이 아직 없습니다.` : "아직 등록된 창작물이 없습니다."}
        description="첫 번째 작품을 올려 창작 게시판을 채워 보세요. 스튜디오에서 컷툰을 바로 만들 수 있어요."
      />
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
        <IconEmptyState
          icon={<BookOpen size={28} />}
          title="아직 연재 시리즈가 없습니다."
          description="시리즈를 만들고 작품 상세에서 회차로 연결하면 연재가 시작됩니다."
          action={
            userId ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}
              >
                <Plus size={15} />새 시리즈 만들기
              </button>
            ) : undefined
          }
        />
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
      <IconEmptyState
        icon={<UserCheck size={28} />}
        title="로그인하고 좋아하는 창작자를 팔로우해 보세요."
        description="팔로우한 창작자의 새 작품이 이곳에 모입니다."
      />
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
      <IconEmptyState
        icon={<UserCheck size={28} />}
        title="아직 팔로우한 창작자가 없습니다."
        description="마음에 드는 작품의 작성자 프로필에서 팔로우하면 새 작품을 여기서 볼 수 있어요."
      />
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

// 칩(탭/정렬) 공용 — 썸 친화 ≥40px 타깃(h-10), 360px 에서도 깔끔히 줄바꿈. 활성=퍼시몬 액센트.
function ChipButton({
  active,
  onClick,
  children,
  tone = "tab",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "tab" | "sort";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent text-on-accent shadow-md shadow-accent/25"
          : tone === "tab"
            ? "border-line-strong bg-card text-fg-2 hover:bg-raised"
            : "border-line bg-card text-fg-2 hover:bg-raised"
      )}
    >
      {children}
    </button>
  );
}

export function CreateGalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort");
  const sort: WorkSort = isSort(sortParam) ? sortParam : "recent";
  const tabParam = searchParams.get("tab");
  const tab: GalleryTab = isTab(tabParam) ? tabParam : "works";
  const tag = searchParams.get("tag") ?? "";

  // 정렬 칩은 작품·시리즈 탭에서만, 활성 태그 칩은 작품 탭에서 태그가 있을 때만 노출.
  // (불리언으로 분리해 JSX 안 좁히기(narrowing)가 tab 리터럴 타입을 헷갈리지 않게 한다.)
  const showSort = tab !== "following";
  const showTagChip = tab === "works" && Boolean(tag);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value == null) params.delete(key);
    else params.set(key, value);
    setSearchParams(params, { replace: true });
  };

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <WebtoonGalleryIntro />
      <header className="webtoon-gallery-filter mb-7 rounded-2xl border border-line p-5 sm:p-6">
        <div>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold">창작자의 작품을 만나보세요</h2><span className="text-xs text-fg-3">WEBTOONS · ILLUSTRATIONS · SERIES</span></div>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {/* 탭: 전체 작품 / 시리즈 / 팔로잉 — 썸 친화 칩, 360px 에서 깔끔히 줄바꿈 */}
            <div role="tablist" aria-label="보기" className="flex flex-wrap gap-2">
              {TABS.map((option) => (
                <ChipButton
                  key={option.value}
                  active={option.value === tab}
                  onClick={() => setParam("tab", option.value === "works" ? null : option.value)}
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>

            {/* 정렬(작품·시리즈 탭에서만) + 활성 태그 칩 */}
            {showSort || showTagChip ? (
              <div className="flex flex-wrap items-center gap-2">
                {showSort && (
                  <div role="tablist" aria-label="정렬" className="flex flex-wrap gap-2">
                    {SORTS.map((option) => (
                      <ChipButton
                        key={option.value}
                        active={option.value === sort}
                        tone="sort"
                        onClick={() => setParam("sort", option.value)}
                      >
                        {option.label}
                      </ChipButton>
                    ))}
                  </div>
                )}

                {showTagChip && (
                  <button
                    type="button"
                    onClick={() => setParam("tag", null)}
                    aria-label={`#${tag} 태그 필터 해제`}
                    className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/50 bg-accent-soft/70 px-4 text-sm font-medium text-fg transition-colors hover:bg-accent-soft active:scale-[0.96]"
                  >
                    #{tag}
                    <X size={14} aria-hidden />
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {tab === "works" && !tag ? <CreateFeaturedSections /> : null}

      {tab === "works" ? <WorksTab sort={sort} tag={tag} /> : tab === "series" ? <SeriesTab sort={sort} /> : <FollowingTab />}
      <CreativeJourneyLinks />
    </Container>
  );
}
