import { useT } from "@/shared/lib/i18n";

import type { CreatorAnalyticsRetentionPoint } from "./types";
import { findWorstDropOffPoint } from "./analytics-math";

/** "이 회차에서 독자가 떨어졌다" 콜아웃 — 가장 큰 이탈 지점을 강조한다. */
export function DropOffInsight({
  points,
}: {
  points: readonly CreatorAnalyticsRetentionPoint[];
}) {
  const t = useT();
  const worst = findWorstDropOffPoint(points);
  const dropOffs = points.filter((point) => point.isDropOff);
  const suffix = t("creatorAnalytics.dropOff.episodeSuffix", "화");

  return (
    <div
      className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-5"
      role="note"
      aria-label={t("creatorAnalytics.dropOff.title", "이탈 지점")}
    >
      <p className="eyebrow text-rose-400">
        {t("creatorAnalytics.dropOff.title", "이탈 지점")}
      </p>
      {worst == null ? (
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {t(
            "creatorAnalytics.dropOff.none",
            "급격한 이탈 지점이 없어요. 연재 흐름이 안정적입니다."
          )}
        </p>
      ) : (
        <>
          <p className="mt-2 text-pretty text-[1.05rem] font-bold leading-snug text-fg">
            <span className="numeral tabular-nums text-rose-400">
              {worst.episode}
              {suffix}
            </span>
            {t("creatorAnalytics.dropOff.worstSuffix", "에서 독자가 떨어졌어요")} ·{" "}
            <span className="numeral tabular-nums text-rose-400">
              -{worst.dropOffPct}%
            </span>
          </p>
          {dropOffs.length > 1 && (
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              {dropOffs
                .map(
                  (point) =>
                    `${point.episode}${suffix}(-${point.dropOffPct}%)`
                )
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
