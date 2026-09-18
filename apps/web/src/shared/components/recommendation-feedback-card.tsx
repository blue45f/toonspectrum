import { CheckCircle2, EyeOff, GitCompareArrows } from "lucide-react";

import { TitleCard } from "./title-card";

import type { Title } from "@/shared/lib/types";

export function RecommendationFeedbackCard({
  title,
  reason,
  onHide,
  onSeen,
  onSimilar,
  compact = false,
}: {
  readonly title: Title;
  readonly reason?: string;
  readonly onHide: () => void;
  readonly onSeen: () => void;
  readonly onSimilar?: () => void;
  readonly compact?: boolean;
}) {
  return (
    <article className="group/recommendation min-w-0">
      <TitleCard title={title} size={compact ? "sm" : undefined} />
      {reason ? (
        <p className="mt-2 line-clamp-2 text-[0.72rem] leading-5 text-accent">
          {reason}
        </p>
      ) : null}
      <div className="mt-2 grid gap-1.5 text-[0.68rem] sm:grid-cols-2">
        <button
          type="button"
          onClick={onSeen}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 font-semibold text-fg-2 transition-colors hover:border-good/45 hover:text-good focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`${title.title} 이미 본 작품으로 표시`}
        >
          <CheckCircle2 size={13} aria-hidden="true" />
          이미 봤어요
        </button>
        <button
          type="button"
          onClick={onHide}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 font-semibold text-fg-2 transition-colors hover:border-bad/45 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`${title.title} 추천에서 숨기기`}
        >
          <EyeOff size={13} aria-hidden="true" />
          관심 없어요
        </button>
        {onSimilar ? (
          <button
            type="button"
            onClick={onSimilar}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:col-span-2"
            aria-label={`${title.title}와 비슷한 작품 찾기`}
          >
            <GitCompareArrows size={13} aria-hidden="true" />
            비슷한 작품 찾기
          </button>
        ) : null}
      </div>
    </article>
  );
}
