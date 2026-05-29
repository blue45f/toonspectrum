"use client";

import { useState } from "react";
import { TITLES } from "@/lib/data";
import {
  rankBy,
  RANK_AXES,
  PERIODS,
  axisMeta,
  type RankAxis,
  type RankPeriod,
} from "@/lib/ranking";
import type { WorkType, Title } from "@/lib/types";
import { RankRow } from "./rank-row";
import { Segmented } from "./ui/segmented";
import { cn, formatCount } from "@/lib/utils";
import { FunctionSquare } from "lucide-react";

function metricFor(axis: RankAxis): (t: Title) => { label: string; value: string } {
  switch (axis) {
    case "trending":
      return (t) => ({ label: "트렌드", value: String(Math.round(t.stats.trendingScore)) });
    case "rating":
      return (t) => ({ label: "평점", value: t.stats.ratingAvg.toFixed(1) });
    case "binge":
      return (t) => ({ label: "몰입지수", value: String(Math.round(t.stats.bingeIndex)) });
    case "completed":
      return (t) => ({ label: "완독률", value: `${Math.round(t.stats.completionRate)}%` });
    case "rookie":
      return (t) => ({ label: "데뷔", value: String(t.releaseYear) });
    case "popular":
    default:
      return (t) => ({ label: "조회", value: formatCount(t.stats.views) });
  }
}

export function RankingBoard({ initialAxis = "popular" }: { initialAxis?: RankAxis }) {
  const [axis, setAxis] = useState<RankAxis>(initialAxis);
  const [period, setPeriod] = useState<RankPeriod>("weekly");
  const [type, setType] = useState<WorkType | "all">("all");

  const meta = axisMeta(axis);
  const ranked = rankBy(TITLES, axis, { period, type, limit: 50 });
  const metric = metricFor(axis);

  return (
    <div className="flex flex-col gap-6">
      {/* 축 선택 */}
      <div className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {RANK_AXES.map((a) => {
          const active = a.key === axis;
          return (
            <button
              key={a.key}
              onClick={() => setAxis(a.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
              )}
            >
              <span className="text-base">{a.emoji}</span>
              <span className="flex flex-col items-start leading-tight">
                <span>{a.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 산식 + 기간/유형 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <FunctionSquare size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium text-fg">{meta.desc}</p>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-fg-3">
              <span className="eyebrow mr-1.5 text-[0.6rem] text-accent">산식</span>
              {meta.formula}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={type}
            onChange={setType}
            items={[
              { value: "all", label: "전체" },
              { value: "webtoon", label: "웹툰" },
              { value: "webnovel", label: "웹소설" },
            ]}
          />
          <Segmented
            size="sm"
            value={period}
            onChange={setPeriod}
            items={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          />
        </div>
      </div>

      {/* 랭킹 리스트 */}
      <div className="rounded-2xl border border-line bg-panel/30 p-2 sm:p-3">
        {ranked.length === 0 ? (
          <p className="py-16 text-center text-sm text-fg-3">해당 조건의 작품이 없어요.</p>
        ) : (
          ranked.map((r) => <RankRow key={r.title.id} ranked={r} metric={metric} />)
        )}
      </div>
    </div>
  );
}
