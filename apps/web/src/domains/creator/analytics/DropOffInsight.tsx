import { ArrowRight, TriangleAlert, CheckCircle2 } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { CreatorAnalyticsRetentionPoint } from "./types";
import { findWorstDropOffPoint } from "./analytics-math";

/** 이탈이 큰 회차에서 먼저 살펴볼 것 — 수치 해석을 다음 작업으로 잇는다. */
const DROP_OFF_CHECKS: readonly (readonly [string, string])[] = [
  ["첫 3컷에서 앞 회차의 궁금증을 이어받는지", "Does the first three panels pick up the previous hook?"],
  ["분량·컷 간격이 앞 회차보다 급하게 바뀌지 않았는지", "Did length or pacing change abruptly from the prior episode?"],
  ["마지막 컷이 다음 회차를 볼 이유를 남기는지", "Does the last panel give a reason to read on?"],
];

/** "이 회차에서 독자가 떨어졌다" 콜아웃 — 가장 큰 이탈 지점과 점검 항목, 다음 행동을 함께 보여 준다. */
export function DropOffInsight({
  points,
}: {
  points: readonly CreatorAnalyticsRetentionPoint[];
}) {
  const t = useT();
  const bt = useBilingual("CreatorAnalyticsDropOff");
  const worst = findWorstDropOffPoint(points);
  const dropOffs = points.filter((point) => point.isDropOff);
  const suffix = t("creatorAnalytics.dropOff.episodeSuffix", "화");
  const hasDropOff = worst != null && worst.isDropOff;

  return (
    <div
      className={hasDropOff
        ? "flex flex-col rounded-2xl border border-bad/35 bg-bad/[0.07] p-5"
        : "flex flex-col rounded-2xl border border-line bg-card p-5"}
      role="note"
      aria-label={t("creatorAnalytics.dropOff.title", "이탈 지점")}
    >
      <p className="eyebrow flex items-center gap-1.5 text-fg">
        {hasDropOff ? <TriangleAlert size={14} aria-hidden className="text-bad" /> : <CheckCircle2 size={14} aria-hidden className="text-good" />}
        {t("creatorAnalytics.dropOff.title", "이탈 지점")}
      </p>
      {worst == null || !hasDropOff ? (
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {t("creatorAnalytics.dropOff.none", "급격한 이탈 지점이 없어요. 연재 흐름이 안정적입니다.")}
        </p>
      ) : (
        <>
          <p className="mt-2 text-pretty text-[1.05rem] font-bold leading-snug text-fg">
            <span className="numeral">
              {worst.episode}
              {suffix}
            </span>
            {t("creatorAnalytics.dropOff.worstSuffix", "에서 독자가 떨어졌어요")} ·{" "}
            <span className="numeral text-bad">-{worst.dropOffPct}%</span>
          </p>
          {dropOffs.length > 1 ? (
            <p className="mt-2 text-xs leading-relaxed text-fg-2">
              {dropOffs.map((point) => `${point.episode}${suffix}(-${point.dropOffPct}%)`).join(" · ")}
            </p>
          ) : null}
          <p className="mt-4 text-xs font-semibold text-fg">{bt("먼저 확인해 보세요", "Check these first")}</p>
          <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-fg-2">
            {DROP_OFF_CHECKS.map((item) => (
              <li key={item[0]} className="flex gap-2">
                <span aria-hidden className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-fg-3" />
                {bt(...item)}
              </li>
            ))}
          </ul>
          <Link
            href="/studio"
            className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {bt("스튜디오에서 회차 다듬기", "Refine the episode in Studio")}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </>
      )}
    </div>
  );
}
