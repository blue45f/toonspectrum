import { groupByWeekday, kstTodayIdx } from "../calendar";
import { platformCoverage } from "../derive";
import { WEEK_DAYS } from "../taxonomy";

import { TITLES } from "./catalog-store";

export async function getCalendarData() {
  const todayIdx = kstTodayIdx();
  const ongoing = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.length
  );
  const byDay = groupByWeekday(ongoing);

  return {
    todayIdx,
    todayDay: WEEK_DAYS[todayIdx],
    todayCount: byDay[todayIdx]?.length ?? 0,
    days: WEEK_DAYS.map((day, i) => ({ day, items: byDay[i] })),
    totalScheduled: ongoing.length,
    platformCoverage: platformCoverage(ongoing),
    generatedAt: new Date().toISOString(),
  };
}
