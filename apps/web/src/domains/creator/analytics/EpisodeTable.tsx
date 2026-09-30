import { cn, formatCount } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

import type {
  CreatorAnalyticsEpisode,
  CreatorAnalyticsRetentionPoint,
} from "./types";

interface EpisodeRow extends CreatorAnalyticsEpisode {
  retentionPct: number;
  dropOffPct: number;
  isDropOff: boolean;
}

/** 회차별 성과 테이블. 시맨틱 테이블 + 이탈 지점 행 강조. */
export function EpisodeTable({
  episodes,
  retention,
}: {
  episodes: readonly CreatorAnalyticsEpisode[];
  retention: readonly CreatorAnalyticsRetentionPoint[];
}) {
  const t = useT();
  const retentionByEpisode = new Map(
    retention.map((point) => [point.episode, point])
  );
  const rows: EpisodeRow[] = episodes.map((episode) => {
    const point = retentionByEpisode.get(episode.episode);
    return {
      ...episode,
      retentionPct: point?.retentionPct ?? 0,
      dropOffPct: point?.dropOffPct ?? 0,
      isDropOff: point?.isDropOff ?? false,
    };
  });

  const columns = [
    { key: "episode", label: t("creatorAnalytics.episodes.col.episode", "회차"), numeric: false },
    { key: "publishedAt", label: t("creatorAnalytics.episodes.col.publishedAt", "공개일"), numeric: false },
    { key: "views", label: t("creatorAnalytics.episodes.col.views", "조회수"), numeric: true },
    { key: "likes", label: t("creatorAnalytics.episodes.col.likes", "좋아요"), numeric: true },
    { key: "comments", label: t("creatorAnalytics.episodes.col.comments", "댓글"), numeric: true },
    { key: "retention", label: t("creatorAnalytics.episodes.col.retention", "잔존율"), numeric: true },
    { key: "dropOff", label: t("creatorAnalytics.episodes.col.dropOff", "이탈률"), numeric: true },
  ] as const;

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-3">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-2 py-2.5 font-medium",
                  column.numeric && "text-right"
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.episode}
              className={cn(
                "border-b border-line/60 last:border-0",
                row.isDropOff && "bg-rose-500/[0.05]"
              )}
            >
              <td className="whitespace-nowrap px-2 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="numeral font-medium text-fg tabular-nums">
                    {row.episode}화
                  </span>
                  {row.isDropOff && (
                    <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[0.68rem] font-medium text-rose-400">
                      {t("creatorAnalytics.episodes.dropOffFlag", "이탈")}
                    </span>
                  )}
                </span>
              </td>
              <td className="tnum whitespace-nowrap px-2 py-2.5 text-fg-3">
                {row.publishedAt}
              </td>
              <td className="numeral whitespace-nowrap px-2 py-2.5 text-right text-fg tabular-nums">
                {formatCount(row.views)}
              </td>
              <td className="numeral whitespace-nowrap px-2 py-2.5 text-right text-fg-2 tabular-nums">
                {formatCount(row.likes)}
              </td>
              <td className="numeral whitespace-nowrap px-2 py-2.5 text-right text-fg-2 tabular-nums">
                {formatCount(row.comments)}
              </td>
              <td className="numeral whitespace-nowrap px-2 py-2.5 text-right text-fg-2 tabular-nums">
                {row.retentionPct}%
              </td>
              <td
                className={cn(
                  "numeral whitespace-nowrap px-2 py-2.5 text-right tabular-nums",
                  row.isDropOff ? "font-bold text-rose-400" : "text-fg-3"
                )}
              >
                {row.dropOffPct === 0 ? "—" : `${row.dropOffPct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
