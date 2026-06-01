"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, EyeOff } from "lucide-react";
import type { SeedReview, Title } from "@/lib/types";
import { Stars } from "./ui/stars";
import { Badge } from "./ui/chip";
import { useApp, useHydrated } from "@/lib/store";
import { cn, relativeDate } from "@/lib/utils";
import { ReviewReplies } from "./review-replies";

const PROGRESS_TONE: Record<string, "good" | "accent" | "neutral" | "bad"> = {
  완독: "good",
  정주행중: "accent",
  "정주행 예정": "neutral",
  하차: "bad",
};

export function ReviewCard({
  review,
  title,
  showTitle,
  enableReplies = false,
  className,
}: {
  review: SeedReview;
  title?: Title;
  showTitle?: boolean;
  enableReplies?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const hydrated = useHydrated();
  const liked = useApp((s) => s.likedReviews[review.id]);
  const toggleLike = useApp((s) => s.toggleLikeReview);
  const likeCount = review.likes + (hydrated && liked ? 1 : 0);
  const hideText = review.spoiler && !revealed;
  const profileHref = review.userId ? `/u/${review.userId}` : null;

  const avatar = (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-1 ring-white/10"
      style={{ background: `linear-gradient(140deg, ${review.avatar}, oklch(0.3 0.05 60))` }}
    >
      {review.author.charAt(0)}
    </span>
  );

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-line-strong",
        className
      )}
    >
      <header className="flex items-center gap-3">
        {profileHref ? (
          <Link href={profileHref} className="shrink-0 transition-opacity hover:opacity-80">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {profileHref ? (
              <Link
                href={profileHref}
                className="truncate text-sm font-semibold text-fg transition-colors hover:text-accent"
              >
                {review.author}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-fg">{review.author}</span>
            )}
            {review.progress && (
              <Badge tone={PROGRESS_TONE[review.progress] ?? "neutral"}>{review.progress}</Badge>
            )}
          </div>
          <span className="text-xs text-fg-3">{relativeDate(review.createdAt)}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Stars value={review.rating} size="sm" />
          <span className="numeral text-xs text-fg-2">{review.rating.toFixed(1)}</span>
        </div>
      </header>

      {showTitle && title && (
        <Link
          href={`/title/${title.slug}`}
          className="flex items-center gap-2 rounded-lg bg-raised/60 px-2.5 py-1.5 text-xs text-fg-2 transition-colors hover:text-fg"
        >
          <span
            className="size-4 rounded"
            style={{ background: `linear-gradient(140deg, ${title.cover[0]}, ${title.cover[1]})` }}
          />
          <span className="truncate font-medium">{title.title}</span>
        </Link>
      )}

      <div className="relative">
        <p
          aria-hidden={hideText}
          className={cn(
            "text-pretty text-sm leading-relaxed text-fg-2 transition-[filter]",
            hideText && "select-none blur-[6px]"
          )}
        >
          {review.text}
        </p>
        {hideText && (
          <button
            onClick={() => setRevealed(true)}
            aria-label="스포일러 내용 보기"
            className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-medium text-fg-2 hover:text-fg"
          >
            <EyeOff size={14} /> 스포일러 — 눌러서 보기
          </button>
        )}
      </div>

      <footer className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((t) => (
            <span key={t} className="rounded-md bg-raised px-1.5 py-0.5 text-[0.7rem] text-fg-3">
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={() => toggleLike(review.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
            hydrated && liked ? "text-accent" : "text-fg-3 hover:text-fg-2"
          )}
        >
          <Heart size={14} className={hydrated && liked ? "fill-accent" : ""} />
          <span className="tnum">{likeCount.toLocaleString("ko-KR")}</span>
        </button>
      </footer>
      {enableReplies && <ReviewReplies reviewId={review.id} />}
    </article>
  );
}
