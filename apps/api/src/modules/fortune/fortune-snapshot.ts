import { createHash } from "node:crypto";
import { z } from "zod";
import { FORTUNE_SPECIAL_DAY_CATEGORIES, FORTUNE_ZODIAC_IDS, fortuneKstDate, fortuneMonthDays, fortunePeriodWindow, validateFortuneSpecialDays,
  type FortuneCalendarEnrichment, type FortuneHoroscopeEnrichment, type FortuneSpecialDaysEnrichment } from "../../../../../packages/core/src/fortune";

export type FortunePublicResult = FortuneCalendarEnrichment | FortuneHoroscopeEnrichment | FortuneSpecialDaysEnrichment;
export type FortunePublicSnapshot = FortunePublicResult & { status: "external"; checkedAt: string; expiresAt: string };
export const FORTUNE_SNAPSHOT_PORT = Symbol("FORTUNE_SNAPSHOT_PORT");
export interface FortuneSnapshotPort {
  get(key: string, now: Date): Promise<FortunePublicSnapshot | null>;
  put(value: FortunePublicSnapshot): Promise<void>;
  prune(): Promise<void>;
}
const base = { status: z.literal("external"), checkedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  policyRevision: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,95}$/u) };
const month = z.string().regex(/^\d{4}-\d{2}$/u);
const calendar = z.object({ ...base, kind: z.literal("calendar"), source: z.literal("kasi"), month,
  checks: z.array(z.object({ date: z.string(), matches: z.boolean(), fields: z.array(z.enum(["lunar-date", "leap-month", "weekday"])).max(3) }).strict()).max(31) }).strict();
const horoscope = z.object({ ...base, kind: z.literal("horoscope"), source: z.literal("free-horoscope"), sign: z.enum(FORTUNE_ZODIAC_IDS),
  period: z.enum(["daily", "weekly", "monthly"]), referenceDate: z.string(), sourceDate: z.string(), periodStart: z.string(), periodEndExclusive: z.string(),
  language: z.literal("en"), text: z.string().min(20).max(6000).refine((v) => !/[<>\p{Cc}\p{Cf}]/u.test(v)) }).strict();
const special = z.object({ ...base, kind: z.literal("special-days"), source: z.literal("kasi"), month, category: z.enum(FORTUNE_SPECIAL_DAY_CATEGORIES),
  items: z.array(z.object({ date: z.string(), sequence: z.number().int(), name: z.string().max(50), isHoliday: z.boolean() }).strict()).max(100) }).strict();
const snapshot = z.discriminatedUnion("kind", [calendar, horoscope, special]);
/** Invalidate verification snapshots whenever the relevant local calendar output changes. */
export function fortuneCalendarSnapshotKey(month: string, policyRevision: string): string {
  const baseline = fortuneMonthDays(month).map(({ date, weekday, lunar }) => [date, weekday, lunar.year, lunar.month, lunar.day, lunar.intercalation]);
  const digest = createHash("sha256").update(JSON.stringify(baseline)).digest("hex");
  return `v3:calendar:${month}:${digest}:${policyRevision}`;
}
export function fortuneSnapshotKey(value: FortunePublicResult): string {
  if (value.kind === "calendar") return fortuneCalendarSnapshotKey(value.month, value.policyRevision);
  const context = value.kind === "special-days" ? `${value.month}:${value.category}` : `${value.sign}:${value.period}:${value.referenceDate}`;
  return `v2:${value.kind}:${context}:${value.policyRevision}`;
}
export function parseFortuneSnapshot(input: unknown, key: string, now: Date): FortunePublicSnapshot {
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 32768) throw new Error("snapshot-too-large");
  const value = snapshot.parse(input);
  const checked = Date.parse(value.checkedAt), expires = Date.parse(value.expiresAt), at = now.getTime();
  if (fortuneSnapshotKey(value) !== key || checked > at || expires <= at || expires <= checked || expires - checked > 86400000) throw new Error("snapshot-context-mismatch");
  if (value.kind === "calendar") {
    const dates = fortuneMonthDays(value.month).map((d) => d.date);
    if (value.checks.length !== dates.length || new Set(value.checks.map((c) => c.date)).size !== dates.length
      || value.checks.some((c) => !dates.includes(c.date) || c.matches !== (c.fields.length === 0) || new Set(c.fields).size !== c.fields.length)) throw new Error("snapshot-calendar-mismatch");
  } else if (value.kind === "special-days") {
    if (!validateFortuneSpecialDays(value.month, value.category, value.items)) throw new Error("snapshot-special-days-mismatch");
  } else {
    const window = fortunePeriodWindow(value.referenceDate, value.period);
    const midnight = Date.parse(`${value.referenceDate}T00:00:00+09:00`) + 86400000;
    if (value.sourceDate !== value.referenceDate || value.referenceDate !== fortuneKstDate(now) || window.periodStart !== value.periodStart
      || window.periodEndExclusive !== value.periodEndExclusive || expires > midnight || expires - checked > 3600000) throw new Error("snapshot-horoscope-mismatch");
  }
  return value;
}
