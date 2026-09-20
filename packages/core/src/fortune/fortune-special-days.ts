import { fortuneMonthDays } from "./fortune-calendar";

import type { FortuneEnrichmentStatus, FortuneUnavailableReason } from "./fortune-enrichment";

export const FORTUNE_SPECIAL_DAY_CATEGORIES = ["holidays", "national-days", "anniversaries", "solar-terms", "seasonal-days"] as const;
export type FortuneSpecialDayCategory = typeof FORTUNE_SPECIAL_DAY_CATEGORIES[number];
export const FORTUNE_SPECIAL_DAY_LABELS: Record<FortuneSpecialDayCategory, string> = {
  holidays: "공휴일", "national-days": "국경일", anniversaries: "기념일", "solar-terms": "24절기", "seasonal-days": "잡절",
};
export interface FortuneSpecialDay {
  date: string;
  sequence: number;
  name: string;
  isHoliday: boolean;
}
export interface FortuneSpecialDaysEnrichment {
  kind: "special-days";
  month: string;
  category: FortuneSpecialDayCategory;
  status: FortuneEnrichmentStatus;
  source: "local" | "kasi";
  policyRevision: string;
  checkedAt?: string;
  expiresAt?: string;
  reason?: FortuneUnavailableReason;
  items: FortuneSpecialDay[];
}
/** Date-only data; never replaces birth-chart or astronomical instant calculations. */
export function validateFortuneSpecialDays(month: string, category: FortuneSpecialDayCategory, items: readonly FortuneSpecialDay[]): boolean {
  if (!FORTUNE_SPECIAL_DAY_CATEGORIES.includes(category) || items.length > 100) return false;
  const dates = new Set(fortuneMonthDays(month).map((day) => day.date));
  const identities = new Set<string>();
  for (const item of items) {
    const id = `${item.date}:${item.sequence}`;
    if (!dates.has(item.date) || !Number.isSafeInteger(item.sequence) || item.sequence < 1 || item.sequence > 99999999
      || typeof item.name !== "string" || !item.name.trim() || item.name !== item.name.trim() || item.name.length > 50
      || /[<>\p{Cc}\p{Cf}]/u.test(item.name) || typeof item.isHoliday !== "boolean" || identities.has(id)) return false;
    identities.add(id);
  }
  return true;
}
