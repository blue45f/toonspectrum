import Link from "@/src/compat/router-link";
import { AvailabilityDots } from "@/components/availability";
import { MiniPoster } from "@/components/rank-row";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { RatingInline } from "@/components/ui/stars";
import { ErrorState } from "@/src/components/error-state";
import { TitleFilterPanel } from "@/components/title-filter-panel";
import { statsAreEstimated } from "@/lib/estimate";
import { useSavedTitleIds } from "@/lib/store";
import { WEEK_DAYS } from "@/lib/taxonomy";
import {
  EMPTY_TITLE_FILTERS,
  applyTitleFilters,
  countActiveTitleFilters,
  type TitleFilterState,
} from "@/lib/title-filters";
import type { PlatformId, Title } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays, Database, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
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
  // 표시할 플랫폼 선택(빈 집합 = 전체 표시). 캘린더 응답에 작품별 availability가 들어 있어 클라에서 필터.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformId>>(new Set());
  const platformFilterActive = selectedPlatforms.size > 0;
  const togglePlatform = (id: PlatformId) =>
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const matchesFilter = (title: Title) =>
    !platformFilterActive || title.availability.some((a) => selectedPlatforms.has(a.platformId));

  // 공용 작품 필터(찜·장르·가격·이용가·평점·태그). 플랫폼은 전용 셀렉터가 따로 있어 facet에서 제외.
  const [filters, setFilters] = useState<TitleFilterState>(EMPTY_TITLE_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const savedIds = useSavedTitleIds();
  const titleFilterCount = countActiveTitleFilters(filters);
  const titleFilterActive = titleFilterCount > 0;
  const anyFilterActive = platformFilterActive || titleFilterActive;

  const todayIdx = data?.todayIdx ?? 0;
  const todayDay = data?.todayDay ?? WEEK_DAYS[todayIdx] ?? "월";
  const rawDays = data?.days ?? WEEK_DAYS.map((day) => ({ day, items: [] }));
  // 플랫폼 셀렉터 + 공용 필터를 둘 다 적용. 둘 다 비활성이면 원본 그대로 사용.
  const days = anyFilterActive
    ? rawDays.map((d) => ({
        day: d.day,
        items: applyTitleFilters(d.items.filter(matchesFilter), filters, savedIds),
      }))
    : rawDays;
  const totalScheduled = anyFilterActive
    ? days.reduce((n, d) => n + d.items.length, 0)
    : data?.totalScheduled ?? 0;
  const todayCount = anyFilterActive
    ? days[todayIdx]?.items.length ?? 0
    : data?.todayCount ?? 0;

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
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-pressed={titleFilterActive}
              className={buttonClass({
                size: "sm",
                variant: titleFilterActive ? "outline" : "quiet",
                className: "gap-1.5",
              })}
            >
              <SlidersHorizontal size={14} className={titleFilterActive ? "text-accent" : undefined} />
              필터
              {titleFilterActive && (
                <span className="rounded-full bg-accent/15 px-1.5 text-[0.68rem] text-accent">
                  {titleFilterCount}
                </span>
              )}
            </button>
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
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.72rem] font-medium text-fg-3">
                표시할 플랫폼{platformFilterActive ? ` · ${selectedPlatforms.size}개 선택` : " · 전체"}
              </span>
              {platformFilterActive && (
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(new Set())}
                  className="text-[0.72rem] text-accent hover:underline"
                >
                  전체 보기
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.platformCoverage.map((platform) => {
                const on = selectedPlatforms.has(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.72rem] transition-colors",
                      on
                        ? "border-accent/60 bg-accent-soft/50 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised",
                      platformFilterActive && !on && "opacity-45"
                    )}
                    title={`${platform.label} ${platform.count.toLocaleString("ko-KR")}편`}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: platform.color }} />
                    {platform.label}
                    <span className="numeral text-fg-3">{platform.count.toLocaleString("ko-KR")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showFilters && (
          <div className="mt-4 border-t border-line pt-4">
            <TitleFilterPanel
              value={filters}
              onChange={setFilters}
              facets={["saved", "genre", "pricing", "age", "minRating", "tag"]}
              savedCount={savedIds.size}
            />
          </div>
        )}
      </header>

      {error ? (
        <ErrorState title="연재 캘린더를 불러오지 못했습니다." message={error} onRetry={reload} />
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
          {anyFilterActive ? (
            <>
              <p className="text-sm font-medium text-fg">선택한 조건에 맞는 연재 작품이 없습니다.</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlatforms(new Set());
                  setFilters(EMPTY_TITLE_FILTERS);
                }}
                className="mt-1 text-xs text-accent hover:underline"
              >
                필터 초기화
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-fg">연재요일 정보가 있는 작품이 없습니다.</p>
              <p className="mt-1 text-xs text-fg-3">다음 카탈로그 수집이 성공하면 DB 스냅샷 기준으로 자동 반영됩니다.</p>
            </>
          )}
        </div>
      )}
    </Container>
  );
}
