import { TITLES } from "../data";
import { WEEK_DAYS } from "../taxonomy";
import { kstDayOfWeek } from "../utils";

const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5];

export async function getCalendarData() {
  const todayIdx = DAY_IDX_FROM_GETDAY[kstDayOfWeek()];
  const ongoing = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.length
  );
  const byDay = WEEK_DAYS.map((day) =>
    ongoing
      .filter((t) => t.updateDays!.includes(day))
      .sort((a, b) => b.stats.views - a.stats.views)
  );

  return {
    todayIdx,
    todayDay: WEEK_DAYS[todayIdx],
    todayCount: byDay[todayIdx]?.length ?? 0,
    days: WEEK_DAYS.map((day, i) => ({ day, items: byDay[i] })),
    generatedAt: new Date().toISOString(),
  };
}
