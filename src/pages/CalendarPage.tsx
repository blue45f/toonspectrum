import Link from "@/src/compat/router-link";
import { AvailabilityDots } from "@/components/availability";
import { MiniPoster } from "@/components/rank-row";
import { Container } from "@/components/section";
import { RatingInline } from "@/components/ui/stars";
import { statsAreEstimated } from "@/lib/estimate";
import { cn } from "@/lib/utils";
import { calendarSnapshot } from "./page-utils";

export function CalendarPage() {
  const { todayIdx, todayDay, todayCount, days } = calendarSnapshot();

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7">
        <p className="eyebrow text-accent">RELEASE CALENDAR</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">연재 캘린더</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          요일별 웹툰 연재 일정입니다. 오늘은 <span className="font-semibold text-accent">{todayDay}요일</span>,
          새 회차가 올라오는 작품이 <span className="numeral text-fg">{todayCount}</span>편 있어요.
        </p>
      </header>

      <div className="rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        {days.map(({ day, items }, index) => {
          const isToday = index === todayIdx;
          return (
            <section
              key={day}
              className={cn(
                "flex w-[160px] shrink-0 flex-col rounded-2xl border sm:w-auto sm:flex-1",
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
    </Container>
  );
}
