import Link from "@/src/compat/router-link";
import type { Title } from "@/lib/types";
import { TitlePoster } from "./title-poster";
import { AvailabilityDots, PlatformTags, bestPricing } from "./availability";
import { BookmarkButton } from "./bookmark-button";
import { GenreSpectrum } from "./ui/spectrum-bar";
import { RatingInline } from "./ui/stars";
import { GenreChip } from "./ui/chip";
import { STATUS_LABEL } from "@/lib/taxonomy";
import { statsAreEstimated } from "@/lib/estimate";
import { cn } from "@/lib/utils";

// 표준 그리드 카드 — 포스터 + 메타
export function TitleCard({
  title,
  rank,
  size = "md",
  className,
}: {
  title: Title;
  rank?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const price = bestPricing(title.availability);
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn("group block focus-visible:outline-none", className)}
    >
      <div className="relative overflow-hidden rounded-xl">
        <div className="transition-transform duration-300 ease-out-expo group-hover:scale-[1.035]">
          <TitlePoster title={title} size={size} rank={rank} />
        </div>
        {/* 호버 보더 */}
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent transition-colors duration-200 group-hover:ring-accent/50" />
        <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <BookmarkButton titleId={title.id} size={14} />
        </div>
        <GenreSpectrum
          genres={title.genres}
          height={3}
          className="absolute inset-x-0 bottom-0 rounded-none opacity-80"
        />
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(title)} size="xs" />
          <span className={cn("text-[0.7rem] font-medium", price.tone)}>{price.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-fg-3">
            {STATUS_LABEL[title.status]} · {title.releaseYear}
          </span>
          <AvailabilityDots availability={title.availability} max={3} />
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-fg-3">{title.synopsis}</p>
      </div>
    </Link>
  );
}

// 가로 리스트 행 (검색결과/리뷰목록 등 밀도 높은 맥락)
export function TitleRow({ title, className }: { title: Title; className?: string }) {
  const price = bestPricing(title.availability);
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group flex gap-3.5 rounded-xl border border-line bg-card p-3 transition-colors duration-150 hover:border-line-strong hover:bg-raised",
        className
      )}
    >
      <div className="w-16 shrink-0 sm:w-20">
        <TitlePoster title={title} size="sm" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[0.95rem] font-semibold text-fg group-hover:text-accent transition-colors">
            {title.title}
          </h3>
          <span className={cn("shrink-0 text-xs font-medium", price.tone)}>{price.label}</span>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-fg-3">{title.synopsis}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          <RatingInline
            value={title.stats.ratingAvg}
            count={title.stats.ratingCount}
            estimated={statsAreEstimated(title)}
            size="xs"
          />
          <span className="text-line-strong">·</span>
          {title.genres.slice(0, 2).map((g) => (
            <GenreChip key={g} genre={g} size="sm" />
          ))}
          <PlatformTags availability={title.availability} className="ml-auto" max={2} />
        </div>
      </div>
    </Link>
  );
}
