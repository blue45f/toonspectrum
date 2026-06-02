import { TITLES } from "./catalog-store";
import { PLATFORMS } from "../platforms";
import { WEEK_DAYS } from "../taxonomy";
import type { PlatformId, Title } from "../types";
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
    totalScheduled: ongoing.length,
    platformCoverage: platformCoverage(ongoing),
    generatedAt: new Date().toISOString(),
  };
}

function platformCoverage(titles: Title[]) {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    const ids = new Set(title.availability.map((entry) => entry.platformId));
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: PLATFORMS[id]?.short ?? id,
      color: PLATFORMS[id]?.color ?? "oklch(0.72 0.02 70)",
      count,
      share: titles.length ? Math.round((count / titles.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
