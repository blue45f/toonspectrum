import {
  CheckCircle2,
  PenTool,
  Star,
  ThumbsUp,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  addMarketReview,
  deleteMarketReview,
  getMarketReviews,
  toggleMarketReviewHelpful,
  MARKET_SOCIAL_EVENT,
} from "../models/market-social-store";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";

interface MarketReviewsSectionProps {
  resourceId: string;
}

const RATING_DESCRIPTIONS: Record<number, string> = {
  5: "최고예요! 상업 연재 작업에 큰 도움이 됩니다.",
  4: "좋아요! 실무 컷 작업에 유용하게 씁니다.",
  3: "보통이에요. 무난하게 쓸 만합니다.",
  2: "아쉬워요. 설정 조절이 조금 필요해요.",
  1: "별로예요. 개선이 필요해 보여요.",
};

const SUGGESTED_ROLE_TAGS = [
  "현역 웹툰 작가",
  "어시스턴트",
  "콘티/데생 작가",
  "일러스트레이터",
  "웹툰 지망생",
];

const SUGGESTED_REVIEW_TAGS = [
  "선화 최적",
  "작업 속도 단축",
  "필압 우수",
  "3D 구도 잡기 편함",
  "색감 통일성",
  "레이어 분리 깔끔",
];

export function MarketReviewsSection({ resourceId }: MarketReviewsSectionProps) {
  const session = useSession();
  const loggedInUserName =
    session.status === "authenticated"
      ? (session.data as { name?: string; nickname?: string })?.nickname
        || (session.data as { name?: string; nickname?: string })?.name
      : undefined;

  const [{ reviews, stats }, setSocialData] = useState(() =>
    getMarketReviews(resourceId),
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [authorNameInput, setAuthorNameInput] = useState(loggedInUserName ?? "");
  const [selectedRoleTag, setSelectedRoleTag] = useState("현역 웹툰 작가");
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "선화 최적",
    "작업 속도 단축",
  ]);

  useEffect(() => {
    const refresh = () => setSocialData(getMarketReviews(resourceId));
    window.addEventListener(MARKET_SOCIAL_EVENT, refresh);
    return () => window.removeEventListener(MARKET_SOCIAL_EVENT, refresh);
  }, [resourceId]);

  useEffect(() => {
    if (loggedInUserName && !authorNameInput) {
      setAuthorNameInput(loggedInUserName);
    }
  }, [loggedInUserName, authorNameInput]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleReviewSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !contentInput.trim()) return;

    addMarketReview(resourceId, {
      rating,
      title: titleInput,
      content: contentInput,
      authorName: authorNameInput || "웹툰 창작자",
      roleTag: selectedRoleTag,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });

    setTitleInput("");
    setContentInput("");
    setIsFormOpen(false);
    setSocialData(getMarketReviews(resourceId));
  };

  const effectiveRating = hoverRating > 0 ? hoverRating : rating;

  return (
    <section
      aria-labelledby="market-reviews-heading"
      className="rounded-xl border border-line bg-card p-5 sm:p-6"
    >
      {/* Reviews Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2
            id="market-reviews-heading"
            className="flex items-center gap-2 text-base font-bold text-fg sm:text-lg"
          >
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span>작가 평점 & 활용 리뷰</span>
          </h2>
          <p className="mt-0.5 text-xs text-fg-3">
            실제 스튜디오에서 소재를 활용한 웹툰 작가들의 실측 피드백
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className={buttonClass({
            variant: isFormOpen ? "outline" : "solid",
            size: "sm",
            className: "gap-1.5",
          })}
        >
          <PenTool className="size-3.5" aria-hidden="true" />
          <span>{isFormOpen ? "작성 취소" : "리뷰 작성하기"}</span>
        </button>
      </div>

      {/* Aggregate Score & Distribution Bar Chart */}
      <div className="mt-4 grid gap-6 rounded-xl border border-line/60 bg-panel/30 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        {/* Score Column */}
        <div className="flex flex-col items-center justify-center border-b border-line/50 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 text-center">
          <div className="text-4xl font-extrabold text-fg numeral tnum">
            {stats.average.toFixed(1)}
          </div>
          <div className="mt-1 flex text-amber-400">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={cn(
                  "size-4",
                  i < Math.round(stats.average)
                    ? "fill-amber-400 text-amber-400"
                    : "text-line-strong",
                )}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs font-medium text-fg-2">
            총 <span className="numeral tnum font-bold">{stats.totalCount}</span>개의 평가
          </p>
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-good/15 px-2 py-0.5 text-[0.68rem] font-semibold text-good">
            <UserCheck className="size-3" />
            <span>{stats.recommendPercentage}% 작가 추천</span>
          </div>
        </div>

        {/* 5-star to 1-star Breakdown Bars */}
        <div className="flex flex-col justify-center gap-1.5 text-xs">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = stats.distribution[star];
            const percentage =
              stats.totalCount > 0 ? Math.round((count / stats.totalCount) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="w-8 shrink-0 font-medium text-fg-3 flex items-center gap-0.5">
                  <span>{star}</span>
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[0.68rem] numeral tnum text-fg-3">
                  {count}개
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Submission Form (Expandable) */}
      {isFormOpen ? (
        <form
          onSubmit={handleReviewSubmit}
          className="mt-5 rounded-xl border border-accent/40 bg-panel/70 p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
            <h3 className="text-sm font-bold text-fg flex items-center gap-1.5">
              <PenTool className="size-4 text-accent" />
              <span>에셋 활용 리뷰 남기기</span>
            </h3>
            <span className="text-[0.68rem] text-fg-3">
              작성된 리뷰는 에셋 마켓 상세 페이지에 즉시 반영됩니다.
            </span>
          </div>

          {/* Star Rating Picker */}
          <div>
            <span className="block text-xs font-semibold text-fg">별점 선택</span>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
                    aria-label={`${star}점`}
                  >
                    <Star
                      className={cn(
                        "size-6",
                        star <= effectiveRating
                          ? "fill-amber-400 text-amber-400"
                          : "text-line-strong",
                      )}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-medium text-fg-2">
                {RATING_DESCRIPTIONS[effectiveRating] ?? ""}
              </span>
            </div>
          </div>

          {/* Role & Name */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="review-author-name" className="block text-xs font-semibold text-fg">창작자 닉네임</label>
              <input
                id="review-author-name"
                type="text"
                value={authorNameInput}
                onChange={(e) => setAuthorNameInput(e.target.value)}
                placeholder="예: 웹툰 작가 민우"
                maxLength={20}
                className="mt-1 h-8 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="review-role-tag" className="block text-xs font-semibold text-fg">작가 역할 태그</label>
              <select
                id="review-role-tag"
                value={selectedRoleTag}
                onChange={(e) => setSelectedRoleTag(e.target.value)}
                className="mt-1 h-8 w-full rounded-lg border border-line bg-card px-2 text-xs text-fg focus:border-accent focus:outline-none"
              >
                {SUGGESTED_ROLE_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title & Body */}
          <div>
            <label htmlFor="review-title" className="block text-xs font-semibold text-fg">리뷰 제목</label>
            <input
              id="review-title"
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="예: 선화 추출과 투시 구도 잡을 때 필수입니다"
              maxLength={80}
              required
              className="mt-1 h-8 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="review-content" className="block text-xs font-semibold text-fg">상세 리뷰 내용</label>
            <textarea
              id="review-content"
              rows={4}
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              placeholder="스튜디오에서 어떻게 활용하셨는지, 선화·채색·연출 작업에 어떤 점이 좋았는지 자세한 팁을 나눠주세요."
              maxLength={1000}
              required
              className="mt-1 w-full rounded-xl border border-line bg-card p-3 text-xs leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
            />
          </div>

          {/* Quick Tags Selection */}
          <div>
            <span className="block text-xs font-semibold text-fg">핵심 장점 키워드</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SUGGESTED_REVIEW_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[0.68rem] font-medium transition-colors",
                      active
                        ? "border-accent bg-accent/15 text-accent font-bold"
                        : "border-line bg-card text-fg-3 hover:text-fg",
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-3">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!titleInput.trim() || !contentInput.trim()}
              className={buttonClass({
                variant: "solid",
                size: "sm",
                className: "disabled:opacity-40",
              })}
            >
              리뷰 등록하기
            </button>
          </div>
        </form>
      ) : null}

      {/* Reviews List */}
      <div className="mt-5 space-y-3.5">
        {reviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel/50 py-8 text-center">
            <p className="text-xs font-medium text-fg-2">
              아직 등록된 작가 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!
            </p>
          </div>
        ) : (
          reviews.map((rev) => (
            <article
              key={rev.id}
              className="rounded-xl border border-line/60 bg-panel/40 p-4 transition-colors hover:border-line-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-fg">
                      {rev.author.name}
                    </span>
                    {rev.author.roleTag ? (
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-medium text-fg-2">
                        {rev.author.roleTag}
                      </span>
                    ) : null}
                    {rev.author.isVerifiedBuyer ? (
                      <span className="inline-flex items-center gap-0.5 text-[0.62rem] font-medium text-good">
                        <CheckCircle2 className="size-2.5" /> 구매 인증
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex text-amber-400">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "size-3",
                            i < Math.round(rev.rating)
                              ? "fill-amber-400 text-amber-400"
                              : "text-line-strong",
                          )}
                        />
                      ))}
                    </div>
                    <time
                      dateTime={rev.createdAt}
                      className="text-[0.65rem] text-fg-3"
                    >
                      {rev.createdAt.slice(0, 10)}
                    </time>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      toggleMarketReviewHelpful(resourceId, rev.id);
                      setSocialData(getMarketReviews(resourceId));
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.68rem] font-medium transition-colors",
                      rev.helpfulByMe
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-card text-fg-3 hover:text-fg",
                    )}
                  >
                    <ThumbsUp className="size-3" aria-hidden="true" />
                    <span>도움이 돼요 {rev.helpfulCount > 0 ? rev.helpfulCount : ""}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteMarketReview(resourceId, rev.id);
                      setSocialData(getMarketReviews(resourceId));
                    }}
                    title="리뷰 삭제"
                    className="p-1 text-fg-3 opacity-50 hover:text-warn hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">삭제</span>
                  </button>
                </div>
              </div>

              <h4 className="mt-2 text-xs font-bold text-fg leading-snug">
                {rev.title}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-fg-2 whitespace-pre-wrap">
                {rev.content}
              </p>

              {rev.tags && rev.tags.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {rev.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-raised/80 px-1.5 py-0.5 text-[0.62rem] text-fg-3"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
