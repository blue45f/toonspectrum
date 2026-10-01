/**
 * EpisodeTipRanking.tsx
 *
 * 창작자용 회차별 후원 랭킹. 어떤 회차가 후원자에게
 * 가장 사랑받았는지 한눈에 보여준다.
 */
import { Trophy } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { formatTipKrw, rankEpisodesByTips } from "../models/tip-model";
import { listTipsByCreator } from "../models/tip-store";

interface EpisodeTipRankingProps {
  readonly creatorId: string;
  /** 회차 id → 화면에 보여줄 회차 이름. */
  readonly episodeNames?: Readonly<Record<string, string>>;
  readonly className?: string;
}

export function EpisodeTipRanking({
  creatorId,
  episodeNames,
  className,
}: EpisodeTipRankingProps) {
  const t = useT();
  const ranking = rankEpisodesByTips(creatorId, listTipsByCreator(creatorId));

  if (ranking.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-line p-6 text-center", className)}>
        <Trophy className="mx-auto h-8 w-8 text-muted/50" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-fg">{t("tipping.ranking.emptyTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("tipping.ranking.emptyBody")}</p>
      </div>
    );
  }

  return (
    <section
      aria-label={t("tipping.ranking.title")}
      className={cn("rounded-2xl border border-line p-4 sm:p-6", className)}
    >
      <h3 className="flex items-center gap-2 text-base font-bold text-fg">
        <Trophy className="h-5 w-5 text-accent" aria-hidden />
        {t("tipping.ranking.title")}
      </h3>
      <ol className="mt-4 space-y-2">
        {ranking.map((entry) => (
          <li
            key={entry.episodeId}
            className="flex items-center gap-3 rounded-xl border border-line/60 px-3 py-2.5"
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                entry.rank <= 3 ? "bg-accent/15 text-accent" : "bg-fg/5 text-muted",
              )}
              aria-label={t("tipping.ranking.rank", { rank: entry.rank })}
            >
              {entry.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">
                {episodeNames?.[entry.episodeId] ?? entry.episodeId}
              </p>
              <p className="text-xs tabular-nums text-muted">
                {t("tipping.ranking.stats", {
                  count: entry.tipCount,
                  supporters: entry.supporterCount,
                })}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-fg">
              {formatTipKrw(entry.totalKrw)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
