import {
  CheckCircle2,
  Cloud,
  LoaderCircle,
  Palette,
  PenTool,
  RefreshCw,
  ShieldCheck,
  Star,
  ThumbsUp,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { useMarketSocial } from "../hooks/use-market-social";

import type {
  CreatorMarketplaceSocialAuthorBadge,
  CreatorMarketplaceSocialReview,
} from "@/lib/creator-marketplace-social-contract";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";

interface MarketReviewsSectionProps {
  resourceId: string;
}

type ReviewSort = "helpful" | "newest" | "rating";

const RATING_DESCRIPTIONS: Record<number, string> = {
  5: "최고예요! 실제 연재 작업에 큰 도움이 됩니다.",
  4: "좋아요! 실무 컷 작업에 유용합니다.",
  3: "보통이에요. 무난하게 쓸 만합니다.",
  2: "아쉬워요. 설정 조절이 필요합니다.",
  1: "개선이 필요해 보여요.",
};

const SUGGESTED_ROLE_TAGS = [
  "현역 웹툰 작가",
  "어시스턴트",
  "콘티/데생 작가",
  "일러스트레이터",
  "웹툰 지망생",
] as const;

const SUGGESTED_REVIEW_TAGS = [
  "선화 최적",
  "작업 속도 단축",
  "필압 우수",
  "3D 구도 편리",
  "색감 통일성",
  "레이어 분리 깔끔",
] as const;

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

function ReviewAuthorBadge({
  badge,
}: {
  badge: CreatorMarketplaceSocialAuthorBadge;
}) {
  if (badge === "studio-verified") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-good/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-good">
        <ShieldCheck className="size-2.5" aria-hidden="true" />
        Studio 사용 인증
      </span>
    );
  }
  if (badge === "library-member") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-cool/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-cool">
        <Cloud className="size-2.5" aria-hidden="true" />
        보관함 회원
      </span>
    );
  }
  if (badge === "publisher") {
    return (
      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-accent">
        배급자
      </span>
    );
  }
  return null;
}

function sortedReviews(
  reviews: readonly CreatorMarketplaceSocialReview[],
  sort: ReviewSort,
): CreatorMarketplaceSocialReview[] {
  return [...reviews].sort((left, right) => {
    if (sort === "helpful") {
      return right.helpfulCount - left.helpfulCount
        || right.createdAt.localeCompare(left.createdAt);
    }
    if (sort === "rating") {
      return right.rating - left.rating
        || right.helpfulCount - left.helpfulCount;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function MarketReviewsSection({
  resourceId,
}: MarketReviewsSectionProps) {
  const session = useSession();
  const viewerKey = session.status === "authenticated"
    ? session.data.user.id
    : "guest";
  const {
    status,
    data,
    error,
    pendingAction,
    refresh,
    saveReview,
    deleteReview,
    toggleReviewHelpful,
  } = useMarketSocial(resourceId, viewerKey);
  const [sort, setSort] = useState<ReviewSort>("helpful");
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [roleTag, setRoleTag] = useState<string>(SUGGESTED_ROLE_TAGS[0]);
  const [tags, setTags] = useState<string[]>([]);

  const reviews = data?.reviews ?? [];
  const displayReviews = useMemo(
    () => sortedReviews(reviews, sort),
    [reviews, sort],
  );
  const mine = data?.viewer.myReviewId
    ? reviews.find((review) => review.id === data.viewer.myReviewId) ?? null
    : null;
  const stats = data?.stats ?? {
    average: 0,
    totalCount: 0,
    recommendPercentage: 0,
    distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  };

  useEffect(() => {
    setFormOpen(false);
    setRating(5);
    setHoverRating(0);
    setTitleInput("");
    setContentInput("");
    setRoleTag(SUGGESTED_ROLE_TAGS[0]);
    setTags([]);
  }, [resourceId]);

  function openEditor(): void {
    if (!data?.viewer.canReview) return;
    if (mine) {
      setRating(mine.rating);
      setTitleInput(mine.title);
      setContentInput(mine.content);
      setRoleTag(mine.roleTag || SUGGESTED_ROLE_TAGS[0]);
      setTags([...mine.tags]);
    } else {
      setRating(5);
      setTitleInput("");
      setContentInput("");
      setRoleTag(SUGGESTED_ROLE_TAGS[0]);
      setTags([]);
    }
    setFormOpen(true);
  }

  function toggleTag(tag: string): void {
    setTags((current) => current.includes(tag)
      ? current.filter((candidate) => candidate !== tag)
      : current.length >= 5
        ? current
        : [...current, tag]);
  }

  async function submitReview(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!titleInput.trim() || !contentInput.trim() || !data?.viewer.canReview) {
      return;
    }
    try {
      await saveReview({
        rating,
        title: titleInput.trim(),
        content: contentInput.trim(),
        roleTag,
        tags,
      });
      setFormOpen(false);
    } catch {
      // Shared store exposes the server message in the inline error status.
    }
  }

  const effectiveRating = hoverRating || rating;
  const reviewRequirement = data?.viewer.reviewRequirement ?? "login";
  const loadingInitial = status === "loading" && !data;

  return (
    <section
      aria-labelledby="market-reviews-heading"
      className="rounded-xl border border-line bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2
            id="market-reviews-heading"
            className="flex items-center gap-2 text-base font-bold text-fg sm:text-lg"
          >
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span>Studio 검증 평점 & 활용 리뷰</span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">
            계정 라이브러리에 추가하고 Studio 설치·적용까지 완료한 사용자만 평가할 수 있어 썸네일 인상보다 실제 작업 경험을 반영합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={status === "loading"}
            aria-label="리뷰 새로고침"
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            <RefreshCw
              className={cn("size-3.5", status === "loading" && "animate-spin")}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => formOpen ? setFormOpen(false) : openEditor()}
            disabled={!data?.viewer.canReview || Boolean(pendingAction)}
            title={!data?.viewer.canReview
              ? "계정 라이브러리 추가와 Studio 적용을 완료해야 합니다."
              : undefined}
            className={buttonClass({
              variant: formOpen ? "outline" : "solid",
              size: "sm",
              className: "gap-1.5 disabled:cursor-not-allowed disabled:opacity-45",
            })}
          >
            <PenTool className="size-3.5" aria-hidden="true" />
            {formOpen ? "작성 취소" : mine ? "내 리뷰 수정" : "리뷰 작성"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-6 rounded-xl border border-line/60 bg-panel/30 p-4 sm:grid-cols-[170px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center border-b border-line/50 pb-4 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
          <div className="numeral tnum text-4xl font-extrabold text-fg">
            {stats.average.toFixed(1)}
          </div>
          <div className="mt-1 flex" aria-label={`평균 ${stats.average.toFixed(1)}점`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={cn(
                  "size-4",
                  index < Math.round(stats.average)
                    ? "fill-amber-400 text-amber-400"
                    : "text-line-strong",
                )}
                aria-hidden="true"
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs font-medium text-fg-2">
            총 <span className="numeral tnum font-bold">{stats.totalCount}</span>개의 검증 평가
          </p>
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-good/15 px-2 py-0.5 text-[0.68rem] font-semibold text-good">
            <UserCheck className="size-3" aria-hidden="true" />
            {stats.recommendPercentage}% 추천
          </div>
        </div>

        <div className="flex flex-col justify-center gap-1.5 text-xs">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = stats.distribution[String(star) as "1" | "2" | "3" | "4" | "5"];
            const percentage = stats.totalCount > 0
              ? Math.round((count / stats.totalCount) * 100)
              : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="flex w-8 shrink-0 items-center gap-0.5 font-medium text-fg-3">
                  {star}<Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-[width] duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="numeral tnum w-10 text-right text-[0.68rem] text-fg-3">
                  {count}개
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {data ? (
        <div className={cn(
          "mt-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-xs",
          data.viewer.canReview
            ? "border-good/35 bg-good/10 text-good"
            : "border-line bg-panel text-fg-2",
        )}>
          {data.viewer.canReview ? (
            <>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span className="font-semibold">Studio 사용 인증 완료 · 리뷰 작성 가능</span>
            </>
          ) : reviewRequirement === "login" ? (
            <span>로그인 후 보관함·Studio 적용 이력을 확인합니다.</span>
          ) : reviewRequirement === "publisher-cannot-review" ? (
            <span>배급자는 자신의 리소스에 평점을 남길 수 없습니다.</span>
          ) : reviewRequirement === "add-to-library" ? (
            <>
              <Cloud className="size-4 text-cool" aria-hidden="true" />
              <span>먼저 상세 페이지의 계정 라이브러리 버튼으로 이 리소스를 소장해 주세요.</span>
            </>
          ) : (
            <>
              <Palette className="size-4 text-accent" aria-hidden="true" />
              <span>Studio에서 실제 설치·적용을 완료하면 리뷰가 열립니다.</span>
              <Link
                href={`/studio?installMarketResource=${resourceId}&assetMarket=community`}
                className="ml-auto font-semibold text-accent hover:underline"
              >
                Studio에서 적용
              </Link>
            </>
          )}
        </div>
      ) : null}

      {formOpen && data?.viewer.canReview ? (
        <form
          onSubmit={(event) => void submitReview(event)}
          className="mt-5 space-y-4 rounded-xl border border-accent/40 bg-panel/70 p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <PenTool className="size-4 text-accent" aria-hidden="true" />
              {mine ? "내 Studio 활용 리뷰 수정" : "Studio 활용 리뷰 남기기"}
            </h3>
            <span className="text-[0.68rem] text-fg-3">
              계정 이름과 Studio 인증 상태가 함께 표시됩니다.
            </span>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-fg">별점 선택</legend>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`${star}점`}
                    aria-pressed={rating === star}
                  >
                    <Star
                      className={cn(
                        "size-6",
                        star <= effectiveRating
                          ? "fill-amber-400 text-amber-400"
                          : "text-line-strong",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-medium text-fg-2">
                {RATING_DESCRIPTIONS[effectiveRating]}
              </span>
            </div>
          </fieldset>

          <div>
            <label htmlFor="review-role-tag" className="block text-xs font-semibold text-fg">
              작업 역할
            </label>
            <select
              id="review-role-tag"
              value={roleTag}
              onChange={(event) => setRoleTag(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus:border-accent focus:outline-none sm:max-w-xs"
            >
              {SUGGESTED_ROLE_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="review-title" className="block text-xs font-semibold text-fg">
              리뷰 제목
            </label>
            <input
              id="review-title"
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              maxLength={80}
              required
              placeholder="예: 선화 작업 시간이 확실히 줄었습니다"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-card px-3 text-xs text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="review-content" className="block text-xs font-semibold text-fg">
              실제 적용 경험
            </label>
            <textarea
              id="review-content"
              rows={4}
              value={contentInput}
              onChange={(event) => setContentInput(event.target.value)}
              maxLength={1_000}
              required
              placeholder="어떤 컷과 설정에서 사용했는지, 품질·성능·호환성의 장단점을 구체적으로 남겨 주세요."
              className="mt-1 w-full rounded-xl border border-line bg-card p-3 text-xs leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-right text-[0.65rem] text-fg-3">
              {contentInput.length} / 1,000자
            </p>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-fg">핵심 키워드</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SUGGESTED_REVIEW_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[0.68rem] font-medium transition-colors",
                      active
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-card text-fg-3 hover:text-fg",
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!titleInput.trim() || !contentInput.trim() || Boolean(pendingAction)}
              className={buttonClass({
                variant: "solid",
                size: "sm",
                className: "gap-1.5 disabled:opacity-40",
              })}
            >
              {pendingAction === "review:save" ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {mine ? "리뷰 수정" : "리뷰 등록"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-auto font-semibold text-accent hover:underline"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-2">검증된 사용자 리뷰</p>
        <label className="flex items-center gap-2 text-[0.68rem] text-fg-3">
          정렬
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ReviewSort)}
            className="h-8 rounded-lg border border-line bg-panel px-2 text-xs text-fg focus:border-accent focus:outline-none"
          >
            <option value="helpful">도움순</option>
            <option value="newest">최신순</option>
            <option value="rating">평점 높은순</option>
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-3.5">
        {loadingInitial ? (
          <div role="status" className="space-y-3" aria-label="리뷰 불러오는 중">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="rounded-xl border border-line/60 bg-panel/30 p-4">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton mt-3 h-3 w-full" />
                <div className="skeleton mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : displayReviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel/50 py-8 text-center">
            <p className="text-xs font-medium text-fg-2">
              아직 검증된 활용 리뷰가 없습니다.
            </p>
          </div>
        ) : (
          displayReviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-line/60 bg-panel/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-fg">{review.author.name}</span>
                    <ReviewAuthorBadge badge={review.author.badge} />
                    {review.roleTag ? (
                      <span className="text-[0.65rem] text-fg-3">· {review.roleTag}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex" aria-label={`${review.rating}점`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={cn(
                            "size-3.5",
                            index < review.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-line-strong",
                          )}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    <time dateTime={review.createdAt} className="text-[0.65rem] text-fg-3">
                      {formatDate(review.createdAt)}
                    </time>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void toggleReviewHelpful(review.id).catch(() => undefined)}
                    disabled={session.status !== "authenticated" || Boolean(pendingAction)}
                    aria-pressed={review.helpfulByViewer}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.68rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      review.helpfulByViewer
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-card text-fg-3 hover:text-fg",
                    )}
                  >
                    <ThumbsUp className="size-3" aria-hidden="true" />
                    도움 {review.helpfulCount > 0 ? review.helpfulCount : ""}
                  </button>
                  {review.isMine ? (
                    <button
                      type="button"
                      onClick={() => void deleteReview().catch(() => undefined)}
                      disabled={Boolean(pendingAction)}
                      aria-label="내 리뷰 삭제"
                      className="rounded p-1.5 text-fg-3 transition-colors hover:bg-warn/10 hover:text-warn disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              <h3 className="mt-3 text-sm font-bold leading-snug text-fg">
                {review.title}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-fg-2">
                {review.content}
              </p>

              {review.tags.length > 0 ? (
                <ul className="mt-2.5 flex flex-wrap gap-1">
                  {review.tags.map((tag) => (
                    <li key={tag} className="rounded bg-raised/80 px-1.5 py-0.5 text-[0.62rem] text-fg-3">
                      #{tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
      </div>

      {data?.truncated.reviews ? (
        <p className="mt-4 text-center text-[0.68rem] text-fg-3">
          리뷰가 많아 최신 100개를 표시하고 있습니다.
        </p>
      ) : null}
    </section>
  );
}
