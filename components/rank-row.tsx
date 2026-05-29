import Link from "next/link";
import type { RankedTitle } from "@/lib/ranking";
import { cn, formatCount } from "@/lib/utils";
import { RatingInline } from "./ui/stars";
import { GenreChip } from "./ui/chip";
import { PlatformTags } from "./availability";
import { TYPE_LABEL, STATUS_LABEL } from "@/lib/taxonomy";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { AdultOverlay } from "./adult-overlay";

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
        "relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md font-display text-sm font-bold text-white/95 ring-1 ring-white/10",
        title.type === "webnovel" && "font-serif",
        className
      )}
      style={{ background: `linear-gradient(145deg, ${title.cover[0]}, ${title.cover[1]})` }}
    >
      {title.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={title.coverImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        title.title.charAt(0)
      )}
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
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group grid grid-cols-[2.75rem_2.5rem_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 transition-colors duration-150 hover:border-line hover:bg-card sm:gap-4 sm:px-3",
        className
      )}
    >
      {/* 인덱스 넘버럴 */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "numeral leading-none",
            top3 ? "text-3xl text-accent" : "text-2xl text-fg-3"
          )}
        >
          {rank}
        </span>
        <Delta delta={delta} />
      </div>

      <MiniPoster title={title} className="w-10" />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-fg transition-colors group-hover:text-accent">
            {title.title}
          </h3>
          <span className="shrink-0 text-[0.65rem] font-medium uppercase tracking-wide text-fg-3">
            {TYPE_LABEL[title.type]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <RatingInline value={title.stats.ratingAvg} size="xs" />
          <span className="hidden text-line-strong sm:inline">·</span>
          <span className="hidden text-xs text-fg-3 sm:inline">
            {title.author} · {STATUS_LABEL[title.status]}
          </span>
          <PlatformTags availability={title.availability} max={2} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1.5 lg:flex">
          {title.genres.slice(0, 2).map((g) => (
            <GenreChip key={g} genre={g} size="sm" />
          ))}
        </div>
        <div className="w-16 text-right">
          <div className="numeral text-sm text-fg">{m ? m.value : formatCount(title.stats.views)}</div>
          <div className="text-[0.62rem] text-fg-3">{m ? m.label : "조회"}</div>
        </div>
      </div>
    </Link>
  );
}
