import { ArrowRight, Star } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import { pickDiscoverSpotlight, type DiscoverHomeSnapshot } from "./discover-home";

type SerialStatus = Title["status"];

const STATUS_LABEL: Record<SerialStatus, readonly [string, string]> = {
  ongoing: ["연재중", "Ongoing"],
  completed: ["완결", "Completed"],
  hiatus: ["휴재", "On hiatus"],
};

/** 표지를 불러오지 못했을 때 쓰는 스타라이트 토큰 그라데이션 + 첫 글자. 작품 데이터의 임의 색은 쓰지 않는다. */
function PosterFallback({ title, className }: { readonly title: Title; readonly className?: string }) {
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/gu, "").charAt(0) || "T";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-full place-items-center bg-[linear-gradient(150deg,color-mix(in_oklch,var(--color-accent)_42%,var(--color-panel)),color-mix(in_oklch,var(--color-cool)_28%,var(--color-canvas)))] font-display font-bold text-fg/70",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

function Poster({ title, className, glyphClassName, priority }: {
  readonly title: Title;
  readonly className?: string;
  readonly glyphClassName?: string;
  readonly priority?: boolean;
}) {
  return (
    <span className={cn("relative block overflow-hidden border border-line bg-panel", className)}>
      {title.coverImage ? (
        <CoverImage
          src={title.coverImage}
          alt=""
          priority={priority}
          className="absolute inset-0 size-full object-cover"
          fallback={<PosterFallback title={title} className={glyphClassName} />}
        />
      ) : (
        <PosterFallback title={title} className={glyphClassName} />
      )}
    </span>
  );
}

export interface DiscoverSpotlightProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
}

/**
 * 탐색 허브 히어로의 대표 작품 카드 — 편집 추천 작품을 큰 표지와 함께 보여 주고,
 * 같은 추천에서 두 편을 더 잇는다(Netflix·왓챠의 상단 추천 구성).
 * 카드 본문 전체가 대표 작품 링크이고, 아래 추천 두 편은 각자의 링크다.
 */
export function DiscoverSpotlight({ snapshot, loading }: DiscoverSpotlightProps) {
  const bt = useBilingual("DiscoverSpotlight");
  const pick = snapshot ? pickDiscoverSpotlight(snapshot) : null;

  if (!pick) {
    if (!loading) return null;
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={bt("대표 작품을 불러오는 중", "Loading the featured story")}
        className="overflow-hidden rounded-2xl border border-line bg-panel/70 p-5"
      >
        <div className="flex gap-4" aria-hidden="true">
          <span data-slot="skeleton" className="skeleton block aspect-[3/4] w-28 shrink-0 rounded-xl sm:w-32" />
          <span className="flex-1 space-y-2.5 pt-1">
            <span data-slot="skeleton" className="skeleton block h-3 w-20" />
            <span data-slot="skeleton" className="skeleton block h-6 w-4/5" />
            <span data-slot="skeleton" className="skeleton block h-3 w-3/5" />
            <span data-slot="skeleton" className="skeleton block h-3 w-full" />
            <span data-slot="skeleton" className="skeleton block h-3 w-5/6" />
          </span>
        </div>
      </div>
    );
  }

  const { lead, more } = pick;
  const rating = lead.stats.ratingAvg;
  const meta = [lead.author, lead.genres.slice(0, 2).join("·"), bt(...STATUS_LABEL[lead.status])].filter(Boolean).join(" · ");

  return (
    <article
      aria-labelledby="discover-spotlight-title"
      data-discover-spotlight=""
      className="relative isolate overflow-hidden rounded-2xl border border-line bg-panel"
    >
      {/* 표지를 흐리게 깐 배경 — 장식이며, 표지를 못 불러오면 토큰 배경만 남는다. */}
      {lead.coverImage ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-45 motion-safe:transition-opacity">
          <CoverImage src={lead.coverImage} alt="" className="size-full scale-110 object-cover blur-2xl" />
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(115deg,color-mix(in_oklch,var(--color-canvas)_94%,transparent)_20%,color-mix(in_oklch,var(--color-canvas)_72%,transparent)_65%,color-mix(in_oklch,var(--color-accent)_18%,transparent))]"
      />

      <div className="group relative flex gap-4 p-4 sm:gap-5 sm:p-5">
        <Poster
          title={lead}
          priority
          className="aspect-[3/4] w-28 shrink-0 rounded-xl shadow-lg transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 sm:w-36"
          glyphClassName="text-5xl"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <Star size={13} aria-hidden="true" />
            {bt("오늘의 추천", "SPOTLIGHT")}
          </p>
          <h2 id="discover-spotlight-title" className="mt-1.5 line-clamp-2 break-keep text-xl font-bold leading-tight text-fg sm:text-2xl">
            <Link
              href={`/title/${lead.slug}`}
              className="rounded-md after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              {lead.title}
            </Link>
          </h2>
          <p className="mt-1 truncate text-xs text-fg-2">{meta}</p>
          {rating > 0 ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-fg-2">
              <Star size={13} className="fill-current text-accent" aria-hidden="true" />
              <span className="numeral font-semibold text-fg">{rating.toFixed(1)}</span>
              <span className="text-fg-3">{bt("평균 평점", "average rating")}</span>
            </p>
          ) : null}
          {lead.synopsis ? (
            <p className="mt-2 line-clamp-3 text-pretty break-keep text-xs leading-5 text-fg-2 sm:text-[0.8rem]">{lead.synopsis}</p>
          ) : null}
          <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-accent" aria-hidden="true">
            {bt("작품 보기", "View story")}
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>

      {more.length > 0 ? (
        <div className="relative border-t border-line/70 bg-canvas/40 px-4 py-3 sm:px-5">
          <p className="text-[0.7rem] font-semibold text-fg-3">{bt("함께 볼 만한 추천", "More picks")}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {more.map((title) => (
              <li key={title.id} className="min-w-0">
                <Link
                  href={`/title/${title.slug}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <Poster title={title} className="aspect-[3/4] w-8 shrink-0 rounded-md" glyphClassName="text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-fg">{title.title}</span>
                    <span className="block truncate text-[0.7rem] text-fg-3">{title.genres.slice(0, 2).join("·")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
