import Link from "@/src/compat/router-link";
import type { Title } from "@/lib/types";
import { useIsBookmarked } from "@/lib/store";
import { TitlePoster } from "./title-poster";
import { AvailabilityDots, PlatformTags, bestPricing } from "./availability";
import { BookmarkButton } from "./bookmark-button";
import { GenreSpectrum } from "./ui/spectrum-bar";
import { RatingInline } from "./ui/stars";
import { GenreChip } from "./ui/chip";
import { STATUS_LABEL } from "@/lib/taxonomy";
import { statsAreEstimated } from "@/lib/estimate";
import { cn } from "@/lib/utils";

// 표준 그리드 카드 — 포스터 + 메타.
// feature: 그리드의 리드 카드(가로 에디토리얼 레이아웃, 2칸 span).
//   균일한 카드 매트릭스를 깨는 비대칭 리듬용.
export function TitleCard({
  title,
  rank,
  size = "md",
  feature = false,
  className,
}: {
  title: Title;
  rank?: number;
  size?: "sm" | "md" | "lg";
  feature?: boolean;
  className?: string;
}) {
  const price = bestPricing(title.availability);
  // 이미 관심 등록된 작품은 북마크를 상시 노출(그리드에서 한눈에 식별), 그 외엔 호버 시 노출.
  const saved = useIsBookmarked(title.id);
  const bookmarkReveal = saved ? "opacity-100" : "opacity-0 group-hover:opacity-100";

  if (feature) {
    return (
      <Link
        href={`/title/${title.slug}`}
        className={cn("group block rounded-2xl focus-visible:outline-none", className)}
      >
        <div className="relative flex transform-gpu gap-4 overflow-hidden rounded-2xl border border-line/70 bg-panel/40 p-3 backface-hidden transition-[transform,box-shadow,border-color] duration-200 surface-hl group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-[0_18px_42px_-20px_oklch(0.14_0.02_68/0.4)]">
          <div className="w-[38%] max-w-[8.5rem] shrink-0 overflow-hidden rounded-[0.9rem]">
            <div className="transition-transform duration-300 ease-out-expo group-hover:scale-[1.04]">
              <TitlePoster title={title} size={size} rank={rank} />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
            <div className="flex flex-wrap gap-1.5">
              {title.genres.slice(0, 2).map((g) => (
                <GenreChip key={g} genre={g} size="sm" />
              ))}
            </div>
            <h3 className="text-pretty text-base font-bold leading-tight text-fg group-hover:text-accent transition-colors">
              {title.title}
            </h3>
            <p className="line-clamp-3 text-xs leading-relaxed text-fg-3">{title.synopsis}</p>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <RatingInline
                value={title.stats.ratingAvg}
                estimated={statsAreEstimated(title)}
                size="xs"
              />
              <span className={cn("shrink-0 text-[0.7rem] font-medium", price.tone)}>{price.label}</span>
            </div>
            <GenreSpectrum
              genres={title.genres}
              height={4}
              interactive
              label={`${title.title} 장르`}
              className="mt-1"
            />
          </div>
          <div className={cn("absolute right-2 top-2 transition-opacity duration-150 focus-within:opacity-100", bookmarkReveal)}>
            <BookmarkButton titleId={title.id} size={14} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn("group block rounded-2xl focus-visible:outline-none", className)}
    >
      <div className="relative transform-gpu overflow-hidden rounded-2xl border border-line/70 bg-panel/35 p-1 backface-hidden transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-[0_18px_42px_-20px_oklch(0.14_0.02_68/0.4)]">
        <div className="overflow-hidden rounded-[0.9rem] transition-transform duration-300 ease-out-expo group-hover:scale-[1.035]">
          <TitlePoster title={title} size={size} rank={rank} />
        </div>
        {/* 호버 보더 */}
        <div className="pointer-events-none absolute inset-1 rounded-[0.9rem] ring-1 ring-inset ring-transparent transition-colors duration-200 group-hover:ring-accent/50" />
        <div className={cn("absolute right-1.5 top-1.5 transition-opacity duration-150 focus-within:opacity-100", bookmarkReveal)}>
          <BookmarkButton titleId={title.id} size={14} />
        </div>
        <GenreSpectrum
          genres={title.genres}
          height={3}
          className="absolute inset-x-1 bottom-1 rounded-xl opacity-90"
        />
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5 px-1.5">
        <div className="flex items-center justify-between gap-2">
          <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(title)} size="xs" />
          <span className={cn("shrink-0 text-[0.7rem] font-medium", price.tone)}>{price.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-fg-3">
            {STATUS_LABEL[title.status]} · {title.releaseYear}
          </span>
          <AvailabilityDots availability={title.availability} max={3} className="shrink-0" />
        </div>
        <p className="mt-1 line-clamp-2 border-t border-line/50 pt-2 text-xs leading-relaxed text-fg-3">
          {title.synopsis}
        </p>
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
        "group flex gap-3.5 rounded-xl border border-line bg-card/85 p-3 transition-colors duration-150 hover:border-line-strong hover:bg-raised",
        className
      )}
    >
      <div className="w-16 shrink-0 sm:w-20">
        <TitlePoster title={title} size="sm" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-[0.95rem] font-semibold text-fg group-hover:text-accent transition-colors">
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
          <span className="hidden text-line-strong sm:inline">·</span>
          {title.genres.slice(0, 2).map((g) => (
            <GenreChip key={g} genre={g} size="sm" />
          ))}
          <PlatformTags availability={title.availability} className="ml-auto shrink-0" max={2} />
        </div>
      </div>
    </Link>
  );
}
