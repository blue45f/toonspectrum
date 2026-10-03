import { MessageSquareQuote, PenLine, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ReviewControls } from "./reviews-components/review-controls";
import { parseReviewRating, parseReviewSort } from "./reviews-components/review-query";
import { ReviewStatsSummary } from "./reviews-components/review-stats-summary";
import { TopReviewedList, type TopReviewedStatus } from "./reviews-components/top-reviewed-list";

import type { ReviewFeedItem, ReviewsResponse } from "@/shared/lib/types";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { ReviewCard } from "@/shared/components/review-card";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { fetchApiResource, useApiResource } from "@/platform/use-api-resource";

/** 한 번에 가져오는 리뷰 수 — 무제한 렌더 방지용 페이지 크기. */
const REVIEWS_PAGE_SIZE = 30;
const SKELETON_CARD_COUNT = 9;

const REVIEWS_FETCH_ERROR = "리뷰 데이터를 불러오지 못했습니다.";

/**
 * 첫 페이지 응답(`base`)에 이어 붙인 추가 페이지.
 * 첫 페이지가 바뀌면(조건 변경·갱신) 기준이 달라지므로 자동으로 버려진다 — 동기화 effect가 필요 없다.
 */
interface FollowingPages {
  readonly base: ReviewsResponse;
  readonly items: readonly ReviewFeedItem[];
  readonly nextOffset: number | null;
}

function ReviewFeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid" aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="skeleton size-9 rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-3 w-28" />
              <span className="skeleton block h-3 w-16" />
            </span>
          </div>
          <span className="skeleton mb-2 block h-4 w-full" />
          <span className="skeleton mb-2 block h-4 w-5/6" />
          <span className="skeleton block h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const [searchParams] = useSearchParams();
  const t = useBilingual("domains.community.ReviewsPage");
  const sort = parseReviewSort(searchParams.get("sort"));
  const rating = parseReviewRating(searchParams.get("rating"));
  const spoilerHidden = searchParams.get("spoiler") === "hide";
  const baseParams = new URLSearchParams({ sort });
  if (spoilerHidden) baseParams.set("spoiler", "hide");
  if (rating !== "all") baseParams.set("rating", rating);
  const baseQuery = baseParams.toString();

  const { data, loading, error, reload } = useApiResource<ReviewsResponse>(
    `/api/reviews?${baseQuery}&limit=${REVIEWS_PAGE_SIZE}&offset=0`,
    REVIEWS_FETCH_ERROR,
  );

  // 무한 스크롤 — 첫 페이지는 useApiResource, 이후 페이지는 직접 fetch 해 첫 페이지 기준으로 누적한다.
  const [following, setFollowing] = useState<FollowingPages | null>(null);
  // 다음 페이지 실패도 같은 첫 페이지 기준으로만 표시한다.
  const [moreFailedFor, setMoreFailedFor] = useState<ReviewsResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 센티넬 콜백이 같은 틱에 연속으로 들어와도 fetch가 한 번만 나가도록
  // 동기 가드용 ref — state 반영 타이밍(리렌더 후)과 무관하게 동작한다.
  const loadingMoreRef = useRef(false);

  const current = data && following?.base === data ? following : null;
  const feed = useMemo<readonly ReviewFeedItem[]>(
    () => (data ? (current ? [...data.feed, ...current.items] : data.feed) : []),
    [current, data],
  );
  const nextOffset = current ? current.nextOffset : data?.nextOffset ?? null;
  const moreFailed = data !== null && moreFailedFor === data;

  const loadMore = useCallback(async () => {
    if (!data || nextOffset == null || loadingMoreRef.current) return;
    const base = data;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreFailedFor(null);
    try {
      const page = await fetchApiResource<ReviewsResponse>(
        `/api/reviews?${baseQuery}&limit=${REVIEWS_PAGE_SIZE}&offset=${nextOffset}`,
        REVIEWS_FETCH_ERROR,
      );
      setFollowing((previous) => ({
        base,
        items: [...(previous?.base === base ? previous.items : []), ...page.feed],
        nextOffset: page.nextOffset,
      }));
    } catch {
      setMoreFailedFor(base);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [baseQuery, data, nextOffset]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextOffset == null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  const firstLoad = loading && !data;
  const topStatus: TopReviewedStatus = data ? "ready" : error ? "unavailable" : "loading";

  return (
    <div>
      <Container size="wide" className="pt-7 sm:pt-10 lg:pt-12">
        <SitePageHeader
          icon={MessageSquareQuote}
          eyebrow="READER REVIEWS"
          title={t("독자들이 남긴 한 줄", "One line from every reader")}
          description={t(
            "정주행의 끝에서, 누군가는 별점 대신 문장을 남겼어요. 마음에 드는 작품을 찾았다면 작품 상세에서 리뷰를 남겨 보세요.",
            "At the end of a binge, some readers leave a sentence instead of a star. Found a story you love? Review it on its detail page.",
          )}
          actions={
            <Link href="/discover" className={buttonClass({ size: "md", className: "min-h-11 gap-1.5" })}>
              <PenLine size={15} aria-hidden="true" />
              {t("리뷰할 작품 찾기", "Find a story to review")}
            </Link>
          }
          aside={
            <img
              src="/images/section-explore.webp"
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
          }
          asideClassName="hidden lg:block"
        >
          <ReviewStatsSummary stats={data?.stats ?? null} loading={firstLoad} />
        </SitePageHeader>
      </Container>

      <Container size="wide" className="py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_268px] lg:items-start">
          <section className="min-w-0 lg:order-1" aria-label={t("리뷰 피드", "Review feed")}>
            <div className="mb-6 rail -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ReviewControls />
            </div>

            <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-2">
              {data ? (
                <h2 className="text-sm font-normal text-fg-3" aria-live="polite">
                  <span className="numeral text-fg-2">{data.stats.total.toLocaleString("ko-KR")}</span>
                  <span className="ml-1">{t("개의 리뷰", "reviews")}</span>
                  {feed.length < data.stats.total ? (
                    <span className="ml-1.5">
                      · {formatI18nTemplate(t("{v0}개 표시", "showing {v0}"), { v0: feed.length.toLocaleString("ko-KR") })}
                    </span>
                  ) : null}
                </h2>
              ) : firstLoad ? (
                <p role="status" className="flex items-center gap-2 text-sm text-fg-3">
                  <span className="skeleton inline-block h-4 w-24" aria-hidden="true" />
                  <span className="sr-only">{t("리뷰를 불러오는 중", "Loading reviews")}</span>
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={reload}
                className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-11 gap-1.5" })}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
                {t("갱신", "Refresh")}
              </button>
            </div>

            {firstLoad ? (
              <ReviewFeedSkeleton />
            ) : error && !data ? (
              <ErrorState title={t("리뷰 데이터를 불러오지 못했습니다.", "Couldn't load reviews.")} message={error} onRetry={reload} />
            ) : feed.length === 0 ? (
              <ActionableEmptyState
                art="generic"
                icon={PenLine}
                title={t("아직 등록된 리뷰가 없습니다", "No reviews have been posted yet")}
                description={t(
                  "첫 리뷰를 남겨 보세요. 별점 대신 짧은 문장으로 작품의 첫인상을 남기면 바로 이 피드에 반영됩니다.",
                  "Be the first to leave a review. A short sentence about your first impression shows up right here in the feed.",
                )}
                primary={{ href: "/discover", label: t("작품 찾고 첫 리뷰 남기기", "Find a title and write the first review") }}
              />
            ) : (
              <>
                <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                  {feed.map((review) => (
                    <ReviewCard key={review.id} review={review} title={review.title} showTitle />
                  ))}
                </div>
                {/* 무한 스크롤 센티넬 — 뷰포트 근처에서 다음 페이지 자동 로드 */}
                {nextOffset != null ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
                {loadingMore ? (
                  <p role="status" className="mt-2 flex items-center justify-center gap-2 py-6 text-sm text-fg-3">
                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    {t("리뷰를 더 불러오는 중…", "Loading more reviews…")}
                  </p>
                ) : null}
                {moreFailed && !loadingMore ? (
                  <div className="mt-2 text-center">
                    <p role="alert" className="text-sm text-fg-3">{t("리뷰를 더 불러오지 못했습니다.", "Couldn't load more reviews.")}</p>
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      className={buttonClass({ size: "sm", variant: "outline", className: "mt-2 gap-1.5" })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      {t("다시 시도", "Try again")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <aside className="lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)] lg:order-2">
            <TopReviewedList items={data?.topReviewed ?? []} status={topStatus} />
          </aside>
        </div>
      </Container>
    </div>
  );
}
