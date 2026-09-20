import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { fortuneMonthDays, type FortuneCalendarCheck, type FortunePeriod, type FortuneZodiacId } from "../../../../../packages/core/src/fortune";

export const FORTUNE_ENRICHMENT_CONFIG = Symbol("FORTUNE_ENRICHMENT_CONFIG");
export const FORTUNE_ENRICHMENT_RUNTIME = Symbol("FORTUNE_ENRICHMENT_RUNTIME");
export const KASI_POLICY_REVISION = "data-go-15012679-20260920";
export interface FortuneEnrichmentConfig {
  kasiEnabled: boolean;
  kasiServiceKey: string;
  horoscopeEnabled: boolean;
  horoscopeRightsApproved: boolean;
  horoscopePolicyRevision: string;
  dailyRequestLimit: number;
}
export interface FortuneEnrichmentRuntime { fetch: typeof globalThis.fetch; now: () => Date }
export function fortuneEnrichmentConfig(env: Readonly<Record<string, string | undefined>>): FortuneEnrichmentConfig {
  const limit = Number(env.FORTUNE_PROVIDER_DAILY_REQUEST_LIMIT ?? "100");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("FORTUNE_PROVIDER_DAILY_REQUEST_LIMIT must be between 1 and 1000");
  return {
    kasiEnabled: env.FORTUNE_KASI_ENABLED === "true",
    // Use the portal's decoded key. URLSearchParams applies exactly one encoding pass.
    kasiServiceKey: env.FORTUNE_KASI_SERVICE_KEY?.trim() ?? "",
    horoscopeEnabled: env.FORTUNE_HOROSCOPE_ENABLED === "true",
    horoscopeRightsApproved: env.FORTUNE_HOROSCOPE_DISPLAY_AND_CACHE_APPROVED === "true",
    horoscopePolicyRevision: env.FORTUNE_HOROSCOPE_POLICY_REVISION?.trim() ?? "",
    dailyRequestLimit: limit,
  };
}
const xmlNumber = z.string().regex(/^\d{1,8}$/u).transform(Number);
const rowSchema = z.object({
  solYear: xmlNumber, solMonth: xmlNumber, solDay: xmlNumber,
  lunYear: xmlNumber, lunMonth: xmlNumber, lunDay: xmlNumber,
  lunLeapmonth: z.enum(["평", "윤"]), solWeek: z.enum(["일", "월", "화", "수", "목", "금", "토"]),
});
export type KasiCalendarRow = z.infer<typeof rowSchema>;
const envelopeSchema = z.object({ response: z.object({
  header: z.object({ resultCode: z.literal("00") }),
  body: z.object({ pageNo: xmlNumber, totalCount: xmlNumber, items: z.object({ item: z.union([rowSchema, z.array(rowSchema).max(31)]) }) }),
}) });
export function parseKasiCalendarPage(xml: string, month: string, pageNo: number) {
  if (Buffer.byteLength(xml, "utf8") > 131072 || /<!/u.test(xml)) throw new Error("invalid-calendar-payload");
  let depth = 0;
  for (const token of xml.matchAll(/<[^>]*>/gu)) {
    if (token[0].startsWith("<?") || token[0].endsWith("/>")) continue;
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth < 0 || depth > 16) throw new Error("invalid-calendar-depth");
  }
  if (depth !== 0 || XMLValidator.validate(xml) !== true) throw new Error("invalid-calendar-xml");
  const parser = new XMLParser({ parseTagValue: false, processEntities: false, ignoreAttributes: true, trimValues: true });
  const body = envelopeSchema.parse(parser.parse(xml)).response.body;
  const expectedDays = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  if (body.pageNo !== pageNo || body.totalCount !== expectedDays) throw new Error("calendar-page-mismatch");
  const rows = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
  if (!rows.length) throw new Error("empty-calendar-page");
  for (const row of rows) {
    if (row.solYear !== Number(month.slice(0, 4)) || row.solMonth !== Number(month.slice(5)) || row.solDay < 1 || row.solDay > expectedDays || row.lunYear < 1899 || row.lunYear > 2050 || row.lunMonth < 1 || row.lunMonth > 12 || row.lunDay < 1 || row.lunDay > 30) throw new Error("calendar-row-mismatch");
  }
  return { rows, totalCount: body.totalCount }; }
export function compareKasiCalendar(month: string, rows: KasiCalendarRow[]): FortuneCalendarCheck[] {
  const local = fortuneMonthDays(month);
  const byDay = new Map(rows.map((row) => [row.solDay, row]));
  if (rows.length !== local.length || byDay.size !== local.length) throw new Error("incomplete-calendar");
  return local.map((day) => {
    const row = byDay.get(Number(day.date.slice(8)));
    if (!row) throw new Error("incomplete-calendar");
    const fields: FortuneCalendarCheck["fields"] = [];
    if (day.lunar.year !== row.lunYear || day.lunar.month !== row.lunMonth || day.lunar.day !== row.lunDay) fields.push("lunar-date");
    if (day.lunar.intercalation !== (row.lunLeapmonth === "윤")) fields.push("leap-month");
    if ("일월화수목금토"[day.weekday] !== row.solWeek) fields.push("weekday");
    return { date: day.date, matches: fields.length === 0, fields };
  });
}
export function kasiCalendarUrl(key: string, month: string, pageNo: number): URL {
  const url = new URL("https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getLunCalInfo");
  url.search = new URLSearchParams({ serviceKey: key, solYear: month.slice(0, 4), solMonth: month.slice(5), pageNo: String(pageNo), numOfRows: "31" }).toString();
  return url;
}
export function horoscopeUrl(sign: FortuneZodiacId, period: FortunePeriod): URL {
  const url = new URL(`https://freehoroscopeapi.com/api/v1/get-horoscope/${period}`);
  url.searchParams.set("sign", sign);
  return url;
}
export function parseProviderHoroscope(text: string, sign: FortuneZodiacId, period: FortunePeriod, date: string): string {
  const result = z.object({ data: z.object({ date: z.string(), period: z.enum(["daily", "weekly", "monthly"]), sign: z.string(), horoscope: z.string().trim().min(20).max(6000).refine((value) => !/[<>]/u.test(value)) }) }).parse(JSON.parse(text));
  if (result.data.date !== date || result.data.sign.toLowerCase() !== sign || result.data.period !== period) throw new Error("horoscope-context-mismatch");
  return result.data.horoscope;
}
export async function readBoundedProviderBody(response: Response): Promise<string> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 131072) throw new Error("provider-response-rejected");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "", size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) throw new Error("provider-body-too-large");
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
