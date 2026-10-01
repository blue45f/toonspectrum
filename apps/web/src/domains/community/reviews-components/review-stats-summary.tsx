import type { ReviewsResponse } from "@/shared/lib/types";

import { Stars } from "@/shared/components/ui/stars";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type ReviewsStats = ReviewsResponse["stats"];

/** 수치를 아직 모를 때(불러오는 중·실패) 0 대신 보여 주는 자리 표시. */
const UNKNOWN_VALUE = "—";

/**
 * 리뷰 피드 요약 수치. 서버 응답이 없으면(불러오는 중·실패) 0을 실제 값처럼 보이지 않도록 "—"로 표시한다.
 * `aria-busy`는 실제로 불러오는 동안에만 둔다.
 */
export function ReviewStatsSummary({
  stats,
  loading = false,
}: {
  readonly stats: ReviewsStats | null;
  readonly loading?: boolean;
}) {
  const bt = useBilingual("ReviewStatsSummary");
  const count = (value: number | undefined) => (value === undefined ? UNKNOWN_VALUE : value.toLocaleString("ko-KR"));
  return (
    <dl
      aria-busy={loading || undefined}
      className="flex flex-wrap items-end gap-x-9 gap-y-4 border-t border-line pt-5"
    >
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-fg-3">{bt("총 리뷰", "Total reviews")}</dt>
        <dd className="numeral tnum text-2xl text-fg">{count(stats?.total)}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-fg-3">{bt("평균 별점", "Average rating")}</dt>
        <dd className="flex items-center gap-2">
          {stats ? <Stars value={stats.avg} size="sm" /> : null}
          <span className="numeral tnum text-2xl text-fg">{stats ? stats.avg.toFixed(2) : UNKNOWN_VALUE}</span>
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-fg-3">{bt("스포일러 포함", "With spoilers")}</dt>
        <dd className="numeral tnum text-2xl text-fg">
          {stats ? stats.spoilerPct : UNKNOWN_VALUE}
          {stats ? <span className="ml-0.5 text-base text-fg-3">%</span> : null}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-fg-3">{bt("리뷰된 작품", "Reviewed stories")}</dt>
        <dd className="numeral tnum text-2xl text-fg">{count(stats?.distinctTitles)}</dd>
      </div>
    </dl>
  );
}
