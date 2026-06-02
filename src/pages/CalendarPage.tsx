import Link from "@/src/compat/router-link";
import { AvailabilityDots } from "@/components/availability";
import { MiniPoster } from "@/components/rank-row";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { RatingInline } from "@/components/ui/stars";
import { statsAreEstimated } from "@/lib/estimate";
import { WEEK_DAYS } from "@/lib/taxonomy";
import type { PlatformId, Title } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays, Database, RefreshCw } from "lucide-react";
import { useApiResource } from "./use-api-resource";

interface CalendarResponse {
  todayIdx: number;
  todayDay: string;
  todayCount: number;
  totalScheduled: number;
  platformCoverage: { id: PlatformId; label: string; color: string; count: number; share: number }[];
  days: { day: string; items: Title[] }[];
  generatedAt: string;
}

export function CalendarPage() {
  const { data, loading, error, reload } = useApiResource<CalendarResponse>(
    "/api/calendar",
    "연재 캘린더를 불러오지 못했습니다."
  );
  const todayIdx = data?.todayIdx ?? 0;
  const todayDay = data?.todayDay ?? WEEK_DAYS[todayIdx] ?? "월";
  const todayCount = data?.todayCount ?? 0;
  const totalScheduled = data?.totalScheduled ?? 0;
  const days = data?.days ?? WEEK_DAYS.map((day) => ({ day, items: [] }));

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7 rounded-2xl border border-line bg-panel/45 p-5 surface-hl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <CalendarDays size={14} /> RELEASE CALENDAR
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">연재 캘린더</h1>
            <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
              서버 DB 스냅샷의 연재요일 메타데이터가 있는 작품을 요일별로 모두 표시합니다. 오늘은{" "}
              <span className="font-semibold text-accent">{todayDay}요일</span>, 새 회차가 올라오는 작품이{" "}
              <span className="numeral text-fg">{todayCount.toLocaleString("ko-KR")}</span>편입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs text-fg-2">
              <Database size={14} className="text-accent" />
              전체 연재 <span className="numeral text-fg">{totalScheduled.toLocaleString("ko-KR")}</span>편
            </span>
            <button
              type="button"
              onClick={reload}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              갱신
            </button>
          </div>
        </div>

        {data?.platformCoverage.length ? (
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
            {data.platformCoverage.slice(0, 8).map((platform) => (
              <span
                key={platform.id}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[0.72rem] text-fg-2"
                title={`${platform.label} ${platform.count.toLocaleString("ko-KR")}편`}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: platform.color }} />
                {platform.label}
                <span className="numeral text-fg">{platform.count.toLocaleString("ko-KR")}</span>
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] px-5 py-12 text-center">
          <p className="text-sm font-medium text-fg">연재 캘린더를 불러오지 못했습니다.</p>
          <p className="mt-1 text-sm text-fg-3">{error}</p>
          <button
            type="button"
            onClick={reload}
            className={buttonClass({ size: "sm", variant: "outline", className: "mt-4" })}
          >
            다시 시도
          </button>
        </div>
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {WEEK_DAYS.map((day) => (
            <section key={day} className="rounded-2xl border border-line bg-panel/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-sm font-bold">{day}</span>
                <span className="skeleton h-4 w-8" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="flex gap-2.5">
                    <span className="skeleton h-12 w-10 rounded-lg" />
                    <span className="flex-1 space-y-2 py-1">
                      <span className="skeleton block h-3 w-full" />
                      <span className="skeleton block h-3 w-2/3" />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-7 xl:overflow-visible">
          {days.map(({ day, items }, index) => {
            const isToday = index === todayIdx;
            return (
              <section
                key={day}
                className={cn(
                  "flex w-[220px] shrink-0 flex-col rounded-2xl border sm:w-[240px] xl:w-auto",
                  isToday ? "border-accent/50 bg-accent-soft/40" : "border-line bg-panel/30"
                )}
              >
                <header
                  className={cn(
                    "flex items-center justify-between rounded-t-2xl border-b px-3.5 py-2.5",
                    isToday ? "border-accent/30" : "border-line"
                  )}
                >
                  <span className={cn("font-display text-sm font-bold tracking-wide", isToday ? "text-accent" : "text-fg")}>
                    {day}
                    {isToday && <span className="ml-1.5 text-[0.6rem] font-medium">오늘</span>}
                  </span>
                  <span className="numeral text-xs text-fg-3">{items.length}</span>
                </header>
                <div className="flex flex-col gap-2.5 p-2.5">
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-fg-3">연재 없음</p>
                  ) : (
                    items.map((title) => (
                      <Link
                        key={title.id}
                        href={`/title/${title.slug}`}
                        className="group flex gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-raised"
                      >
                        <MiniPoster title={title} className="w-10 shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                          <span className="line-clamp-2 text-xs font-medium leading-tight text-fg group-hover:text-accent">
                            {title.title}
                          </span>
                          <span className="flex items-center justify-between gap-1">
                            <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(title)} size="xs" />
                            <AvailabilityDots availability={title.availability} max={2} />
                          </span>
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && !error && totalScheduled === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-card/40 p-10 text-center">
          <p className="text-sm font-medium text-fg">연재요일 정보가 있는 작품이 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">다음 카탈로그 수집이 성공하면 DB 스냅샷 기준으로 자동 반영됩니다.</p>
        </div>
      )}
    </Container>
  );
}
