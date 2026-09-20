import type { HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

export interface AvailabilityFacts { startsAt: string; endsAt: string; expiresAt: string; roles: string[]; tools: string[]; formats: string[]; minRate: number; rateUnit: string; discoverable: boolean; notificationOptIn: boolean; }
export function matchingFacts(availability: AvailabilityFacts, terms: HiringSlotTerms, now: number, notification = false): string[] | null {
  const due = Date.parse(terms.dueAt);
  if (!Number.isFinite(due) || due <= now || !availability.discoverable || (notification && !availability.notificationOptIn)
    || Date.parse(availability.startsAt) > now || Date.parse(availability.expiresAt) <= now
    || Date.parse(availability.startsAt) > Date.parse(terms.startsAt) || Date.parse(availability.endsAt) < Date.parse(terms.dueAt)
    || !availability.roles.includes(terms.role) || !terms.tools.every((v) => availability.tools.includes(v))
    || !terms.formats.every((v) => availability.formats.includes(v)) || availability.rateUnit !== terms.rateUnit
    || availability.minRate > terms.maxRate) return null;
  return ["선택한 역할 일치", "필요한 도구·납품 형식 일치", "작업 기간 포함", "희망 단가 조건 충족"];
}
/** Half-open intervals: adjacent work is allowed; only peak simultaneous work consumes capacity. */
export function peakOverlap(intervals: { startsAt: number; endsAt: number }[], window?: { startsAt: number; endsAt: number }): number {
  const events: [number, number][] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.startsAt, window?.startsAt ?? -Infinity), end = Math.min(interval.endsAt, window?.endsAt ?? Infinity);
    if (start < end) events.push([start, 1], [end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, peak = 0;
  for (const [, delta] of events) { active += delta; peak = Math.max(peak, active); }
  return peak;
}
