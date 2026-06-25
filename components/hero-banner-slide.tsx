import { ArrowRight } from "lucide-react";

import { AvailabilityDots } from "./availability";
import { TitlePoster } from "./title-poster";
import { GenreChip } from "./ui/chip";
import { RatingInline } from "./ui/stars";

import type { Title } from "@/lib/types";

import { statsAreEstimated } from "@/lib/estimate";
import { formatCount } from "@/lib/format";
import { genreColor } from "@/lib/genre-color";
import Link from "@/src/compat/router-link";

export const HERO_BANNER_AUTOPLAY_MS = 5500;

export function HeroBannerSlide({ title }: { title: Title }) {
  const hue = genreColor(title.genres[0] ?? "드라마", 0.72);
  // 19+ 작품은 흐릿한 배경 표지 레이어도 노출하지 않는다(hero-banner-static와 동일 가드).
  const isRestricted = title.ageRating === "19";

  return (
    <Link href={`/title/${title.slug}`} className="group/slide relative block">
      <div className="absolute inset-0" aria-hidden>
        {title.coverImage && !isRestricted ? (
          <img
            src={title.coverImage}
            alt=""
            loading="lazy"
            className="size-full scale-110 object-cover opacity-[0.14] transition-transform duration-700 ease-out-expo group-hover/slide:scale-[1.16]"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 120% at 84% 12%, ${genreColor(title.genres[0] ?? "드라마", 0.72)}1f, transparent 56%), linear-gradient(100deg, oklch(0.18 0.012 70 / 0.97) 34%, oklch(0.18 0.012 70 / 0.55))`,
          }}
        />
      </div>

      <div className="relative grid grid-cols-[5.5rem_1fr] items-center gap-4 p-4 sm:grid-cols-[11rem_1fr] sm:gap-6 sm:p-6">
        <div className="overflow-hidden rounded-xl shadow-[0_20px_44px_-22px_oklch(0.1_0.02_70/0.85)] ring-1 ring-line/60 transition-transform duration-500 ease-out-expo group-hover/slide:-translate-y-0.5">
          <TitlePoster title={title} size="lg" priority unframed titleAs="div" />
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
          <div className="flex flex-wrap gap-1.5">
            {title.genres.slice(0, 2).map((genre) => (
              <GenreChip key={genre} genre={genre} size="sm" />
            ))}
          </div>
          <div className="text-pretty text-xl font-bold leading-tight text-fg sm:text-2xl lg:text-[1.75rem]">
            {title.title}
          </div>
          <p className="truncate text-xs text-fg-3">
            {title.author}
            {title.artist && title.artist !== title.author ? ` · 그림 ${title.artist}` : ""}
          </p>
          <RatingInline
            value={title.stats.ratingAvg}
            count={title.stats.ratingCount}
            estimated={statsAreEstimated(title)}
            size="sm"
          />
          <p className="line-clamp-2 max-w-prose font-serif text-sm italic leading-relaxed text-fg-2">
            {title.editorNote ?? title.synopsis}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <AvailabilityDots availability={title.availability} max={4} />
            <span className="numeral text-[0.72rem] text-fg-3 tnum">
              {statsAreEstimated(title) && <span aria-hidden>≈</span>}
              {formatCount(title.stats.views)} 조회
            </span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-semibold text-on-accent transition-transform duration-150 ease-out-expo group-hover/slide:translate-x-0.5">
              보러가기
              <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }}
      />
    </Link>
  );
}
