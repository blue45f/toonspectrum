import type { Metadata } from "next";
import Link from "next/link";
import { TITLES } from "@/lib/data";
import { WEEK_DAYS } from "@/lib/taxonomy";
import { Container } from "@/components/section";
import { MiniPoster } from "@/components/rank-row";
import { RatingInline } from "@/components/ui/stars";
import { AvailabilityDots } from "@/components/availability";
import { cn, kstDayOfWeek } from "@/lib/utils";

export const metadata: Metadata = {
  title: "연재 캘린더",
  description: "요일별 웹툰 연재 일정. 오늘 올라오는 작품을 한눈에.",
};

// '오늘'이 빌드 시각에 박제되지 않도록 ISR로 1시간마다 재생성 (정적 무기한 캐시 방지)
export const revalidate = 3600;

const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5]; // getDay() 0=일 → WEEK_DAYS 인덱스

export default function CalendarPage() {
  // 재생성 시점의 오늘 (KST 기준)
  const todayIdx = DAY_IDX_FROM_GETDAY[kstDayOfWeek()];

  const ongoing = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.length
  );
  const byDay = WEEK_DAYS.map((day) =>
    ongoing
      .filter((t) => t.updateDays!.includes(day))
      .sort((a, b) => b.stats.views - a.stats.views)
  );
  const todayCount = byDay[todayIdx]?.length ?? 0;

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7">
        <p className="eyebrow text-accent">RELEASE CALENDAR</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">연재 캘린더</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          요일별 웹툰 연재 일정입니다. 오늘은{" "}
          <span className="font-semibold text-accent">{WEEK_DAYS[todayIdx]}요일</span>, 새 회차가
          올라오는 작품이 <span className="numeral text-fg">{todayCount}</span>편 있어요.
        </p>
      </header>

      <div className="rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        {WEEK_DAYS.map((day, i) => {
          const isToday = i === todayIdx;
          const list = byDay[i];
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
                <span
                  className={cn(
                    "font-display text-sm font-bold tracking-wide",
                    isToday ? "text-accent" : "text-fg"
                  )}
                >
                  {day}
                  {isToday && <span className="ml-1.5 text-[0.6rem] font-medium">오늘</span>}
                </span>
                <span className="numeral text-xs text-fg-3">{list.length}</span>
              </header>
              <div className="flex flex-col gap-2.5 p-2.5">
                {list.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-fg-3">연재 없음</p>
                ) : (
                  list.map((t) => (
                    <Link
                      key={t.id}
                      href={`/title/${t.slug}`}
                      className="group flex gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-raised"
                    >
                      <MiniPoster title={t} className="w-10 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                        <span className="line-clamp-2 text-xs font-medium leading-tight text-fg group-hover:text-accent">
                          {t.title}
                        </span>
                        <span className="flex items-center justify-between gap-1">
                          <RatingInline value={t.stats.ratingAvg} size="xs" />
                          <AvailabilityDots availability={t.availability} max={2} />
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
