import { BookOpen, PenLine, RefreshCw, UserCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { useApiResource } from "./use-api-resource";

import type { SeedReview, Title } from "@/lib/types";

import { ReviewCard } from "@/components/review-card";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { Stars } from "@/components/ui/stars";
import { useApp } from "@/lib/store";
import { cn, formatCount } from "@/lib/utils";
import { ErrorState } from "@/src/components/error-state";
import { useDocumentTitle, useMetaDescription } from "@/src/hooks/use-document-title";
import {
  getCreatorProfile,
  listSeries,
  listWorks,
  toggleFollow,
  type CreatorProfile,
  type SeriesSummary,
  type WorkSummary,
} from "@/src/lib/creator-client";
import { SeriesCard, WorkCard, WorkGridSkeleton } from "@/src/pages/create/creator-community-ui";


// 회원 공개 프로필 — 리뷰 카드의 작성자명을 누르면 오는 /u/:userId.
// 리뷰는 기존 /api/reviews 응답(피드+통계)을 userId로 필터해 그대로 재사용하고,
// 창작 활동(팔로우/작품/시리즈)은 /api/creator/users/:id/profile + 목록 API 를 사용한다.
interface ReviewsResponse {
  feed: Array<SeedReview & { title: Title }>;
  stats: { total: number; avg: number; spoilerPct: number; distinctTitles: number };
}

type ProfileTab = "reviews" | "works" | "series";

const TABS: { value: ProfileTab; label: string }[] = [
  { value: "reviews", label: "리뷰" },
  { value: "works", label: "창작 작품" },
  { value: "series", label: "시리즈" },
];

function isTab(value: string | null): value is ProfileTab {
  return value === "reviews" || value === "works" || value === "series";
}

// ── 창작 작품 탭 ──────────────────────────────────────────────────────
function ProfileWorksTab({ userId }: { userId: string }) {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    listWorks({ userId }, controller.signal)
      .then((result) => {
        if (alive) setWorks(result);
      })
      .catch(() => {
        if (alive) setWorks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId]);

  if (loading) return <WorkGridSkeleton count={5} />;
  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center text-sm text-fg-3">
        <PenLine size={24} className="mx-auto mb-2.5" />이 회원이 아직 공개한 창작 작품이 없습니다.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {works.map((work) => (
        <WorkCard key={work.id} work={work} showAuthor={false} />
      ))}
    </div>
  );
}

// ── 시리즈 탭 ─────────────────────────────────────────────────────────
function ProfileSeriesTab({ userId }: { userId: string }) {
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    listSeries({ userId }, controller.signal)
      .then((result) => {
        if (alive) setSeries(result);
      })
      .catch(() => {
        if (alive) setSeries([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex gap-3.5 rounded-2xl border border-line bg-panel/30 p-3">
            <span className="skeleton block aspect-[3/4] w-24 rounded-xl" />
            <div className="flex-1 space-y-2 py-1">
              <span className="skeleton block h-4 w-2/3" />
              <span className="skeleton block h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center text-sm text-fg-3">
        <BookOpen size={24} className="mx-auto mb-2.5" />이 회원이 아직 만든 연재 시리즈가 없습니다.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {series.map((item) => (
        <SeriesCard key={item.id} series={item} />
      ))}
    </div>
  );
}

export function UserProfilePage() {
  const { userId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab = isTab(tabParam) ? tabParam : "reviews";
  const viewerId = useApp((s) => s.userId);
  const isSelf = !!viewerId && viewerId === userId;

  const { data, loading, error, reload } = useApiResource<ReviewsResponse>(
    `/api/reviews?userId=${encodeURIComponent(userId)}`,
    "프로필을 불러오지 못했습니다."
  );

  // 창작자 프로필(이름/아바타/소개 + 팔로우/작품/시리즈 수) — 리뷰가 없어도 동작.
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const controller = new AbortController();
    getCreatorProfile(userId, controller.signal)
      .then((result) => {
        if (alive) setProfile(result);
      })
      .catch(() => {
        if (alive) setProfile(null);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId, viewerId]);

  const feed = data?.feed ?? [];
  const author = profile?.name ?? feed[0]?.author ?? "사용자";
  const avatar = profile?.avatar ?? feed[0]?.avatar ?? "#7c5cfc";
  const total = data?.stats.total ?? 0;
  const avg = data?.stats.avg ?? 0;
  const distinctTitles = data?.stats.distinctTitles ?? 0;
  useDocumentTitle(loading && !profile ? "프로필" : `${author} 님`);
  useMetaDescription(
    data
      ? `${author} 님의 리뷰 ${total}편 · 작품 ${distinctTitles}편 · 평균 별점 ${avg ? avg.toFixed(1) : "-"} — 툰스펙트럼.`
      : null
  );

  async function onToggleFollow() {
    if (!profile || !viewerId || isSelf || followBusy) return;
    setFollowBusy(true);
    // 낙관적 토글 — 실패 시 원복.
    const prev = { isFollowing: profile.isFollowing, followers: profile.followers };
    setProfile({
      ...profile,
      isFollowing: !prev.isFollowing,
      followers: prev.followers + (prev.isFollowing ? -1 : 1),
    });
    try {
      const result = await toggleFollow(profile.id);
      setProfile((current) =>
        current ? { ...current, isFollowing: result.following, followers: result.followers } : current
      );
    } catch {
      setProfile((current) => (current ? { ...current, ...prev } : current));
    } finally {
      setFollowBusy(false);
    }
  }

  const setTab = (next: ProfileTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "reviews") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-12 lg:py-16">
          <p className="eyebrow text-accent">READER PROFILE</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-bold text-[oklch(0.97_0.012_85)] ring-1 ring-[oklch(0.95_0.01_85/0.16)] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]"
              style={{ background: `linear-gradient(140deg, ${avatar}, oklch(0.3 0.05 60))` }}
              aria-hidden
            >
              {author.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold leading-tight sm:text-3xl">{author}</h1>
              <p className="mt-1 text-sm text-fg-3">{profile?.bio || "독자가 남긴 리뷰와 창작 활동"}</p>
            </div>
            {/* 팔로우 버튼 — 본인 프로필이면 숨김, 비로그인은 비활성 안내 */}
            {profile && !isSelf && (
              <button
                type="button"
                onClick={onToggleFollow}
                disabled={!viewerId || followBusy}
                aria-pressed={profile.isFollowing}
                title={viewerId ? undefined : "로그인 후 팔로우할 수 있습니다."}
                className={buttonClass({
                  size: "sm",
                  variant: profile.isFollowing ? "outline" : "solid",
                  className: "shrink-0 gap-1.5",
                })}
              >
                {profile.isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                {profile.isFollowing ? "팔로잉" : "팔로우"}
              </button>
            )}
          </div>

          <dl className="mt-8 flex flex-wrap items-end gap-x-9 gap-y-5 border-t border-line pt-6">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">팔로워</dt>
              <dd className="numeral tnum text-2xl text-fg">{formatCount(profile?.followers ?? 0)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">작성한 리뷰</dt>
              <dd className="numeral tnum text-2xl text-fg">{total.toLocaleString("ko-KR")}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">평균 별점</dt>
              <dd className="flex items-center gap-2">
                <Stars value={avg} size="sm" />
                <span className="numeral tnum text-2xl text-fg">{avg.toFixed(2)}</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">창작 작품</dt>
              <dd className="numeral tnum text-2xl text-fg">{(profile?.works ?? 0).toLocaleString("ko-KR")}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">연재 시리즈</dt>
              <dd className="numeral tnum text-2xl text-fg">{(profile?.series ?? 0).toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
        </Container>
      </section>

      <Container size="wide" className="py-10 lg:py-12">
        {/* 탭: 리뷰 / 창작 작품 / 시리즈 */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="프로필 콘텐츠" className="flex flex-wrap gap-1.5">
            {TABS.map((option) => {
              const on = option.value === tab;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(option.value)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                    on
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {tab === "reviews" && (
            <button
              type="button"
              onClick={reload}
              className={buttonClass({ size: "sm", variant: "quiet", className: "ml-auto gap-1.5" })}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              갱신
            </button>
          )}
        </div>

        {tab === "works" ? (
          <ProfileWorksTab userId={userId} />
        ) : tab === "series" ? (
          <ProfileSeriesTab userId={userId} />
        ) : loading ? (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-line bg-card p-5">
                <span className="skeleton mb-2 block h-4 w-full" />
                <span className="skeleton mb-2 block h-4 w-5/6" />
                <span className="skeleton block h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState title="프로필을 불러오지 못했습니다." message={error} onRetry={reload} />
        ) : feed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center text-sm text-fg-3">
            이 회원이 아직 작성한 리뷰가 없습니다.
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {feed.map((review) => (
              <ReviewCard key={review.id} review={review} title={review.title} showTitle />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
