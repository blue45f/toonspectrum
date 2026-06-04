import Link from "@/src/compat/router-link";
import type { RankedTitle } from "@/lib/ranking";
import { cn, formatCount } from "@/lib/utils";
import { RatingInline } from "./ui/stars";
import { GenreChip } from "./ui/chip";
import { PlatformTags } from "./availability";
import { TYPE_LABEL, STATUS_LABEL } from "@/lib/taxonomy";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { AdultOverlay } from "./adult-overlay";
import { CoverImage } from "./cover-image";
import { statsAreEstimated } from "@/lib/estimate";

// 미니 표지 썸네일
export function MiniPoster({
  title,
  className,
}: {
  title: { title: string; cover: [string, string]; type: string; coverImage?: string; ageRating?: string };
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md border border-[oklch(0.95_0.01_85/0.14)] font-display text-sm font-bold text-[oklch(0.97_0.012_85)] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]",
        title.type === "webnovel" && "font-serif",
        className
      )}
      style={{
        background: `linear-gradient(145deg, color-mix(in oklch, ${title.cover[0]} 88%, oklch(0.24 0.012 66)), color-mix(in oklch, ${title.cover[1]} 82%, oklch(0.15 0.008 70)))`,
      }}
    >
      {title.coverImage ? (
        <CoverImage
          src={title.coverImage}
          alt=""
          fallback={title.title.charAt(0)}
          className="absolute inset-0 size-full object-cover contrast-[1.03] saturate-[1.04]"
        />
      ) : (
        <span className="relative">{title.title.charAt(0)}</span>
      )}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,oklch(0.13_0.012_70/0.62),transparent_58%)]" />
      <span className="pointer-events-none absolute inset-x-1.5 top-1.5 h-px bg-[oklch(0.95_0.01_85/0.24)]" />
      {title.ageRating === "19" && <AdultOverlay compact />}
    </span>
  );
}

function Delta({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="flex items-center text-[0.7rem] font-semibold text-good tnum">
        <ChevronUp size={12} strokeWidth={3} />
        {delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="flex items-center text-[0.7rem] font-semibold text-bad tnum">
        <ChevronDown size={12} strokeWidth={3} />
        {Math.abs(delta)}
      </span>
    );
  return <Minus size={12} className="text-fg-3" />;
}

export function RankRow({
  ranked,
  metric,
  className,
}: {
  ranked: RankedTitle;
  metric?: (t: RankedTitle["title"]) => { label: string; value: string };
  className?: string;
}) {
  const { title, rank, delta } = ranked;
  const top3 = rank <= 3;
  const m = metric?.(title);
  const live = ranked.evidence?.liveMatched ? ranked.evidence : null;
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group grid grid-cols-[2.75rem_2.5rem_1fr_auto] items-center gap-3 rounded-xl border border-line/40 bg-card/35 px-2 py-2.5 transition-[background,border-color,transform,box-shadow] duration-150 hover:border-line hover:bg-card sm:gap-4 sm:px-3",
        className
      )}
    >
      {/* 인덱스 넘버럴 */}
      <div
        className={cn(
          "relative flex flex-col items-center rounded-xl border px-1.5 py-1 transition-colors duration-150",
          top3 ? "border-accent/45 bg-accent/10 text-accent" : "border-line/70 bg-canvas/40 text-fg-3"
        )}
      >
        <span
          className={cn(
            "numeral leading-none",
            top3 ? "text-3xl text-accent" : "text-2xl text-fg-3"
          )}
        >
          {rank}
        </span>
        <Delta delta={delta} />
        {top3 && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_0_2px_oklch(0.205_0.01_66)]" />
        )}
      </div>

      <MiniPoster title={title} className="w-10" />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-fg transition-colors group-hover:text-accent">
            {title.title}
          </h3>
          <span className="shrink-0 rounded-full border border-line bg-canvas/45 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-fg-3">
            {TYPE_LABEL[title.type]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(title)} size="xs" />
          <span className="hidden text-line-strong sm:inline">·</span>
          <span className="hidden text-xs text-fg-3 sm:inline">
            {title.author} · {STATUS_LABEL[title.status]}
          </span>
          <PlatformTags availability={title.availability} max={2} />
          {live && (
            <span className="rounded-md border border-good/30 bg-[oklch(0.8_0.15_150/0.1)] px-1.5 py-0.5 text-[0.65rem] font-medium text-good">
              LIVE #{live.liveRank} · {live.livePlatform}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-1 max-w-3xl text-xs leading-relaxed text-fg-3 sm:line-clamp-2">
          {title.synopsis}
        </p>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="hidden items-center gap-1.5 md:flex">
          {title.genres.slice(0, 2).map((g) => (
            <GenreChip key={g} genre={g} size="sm" className="hidden lg:inline-flex first:inline-flex" />
          ))}
        </div>
        <div className="w-[3.75rem] shrink-0 rounded-md border border-line/70 bg-canvas/30 px-2 py-1.5 text-right sm:w-16">
          <div className="numeral tnum text-sm text-fg">{m ? m.value : formatCount(title.stats.views)}</div>
          <div className="text-[0.62rem] text-fg-3">{m ? m.label : "조회"}</div>
        </div>
      </div>
    </Link>
  );
}
