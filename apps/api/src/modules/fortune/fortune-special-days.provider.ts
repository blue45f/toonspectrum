import { z } from "zod";
import { validateFortuneSpecialDays, type FortuneSpecialDay, type FortuneSpecialDayCategory } from "../../../../../packages/core/src/fortune";
import { parseBoundedKasiXml } from "./fortune-enrichment.provider";

export const KASI_SPECIAL_POLICY_REVISION = "data-go-15012690-20260920";
const operations: Record<FortuneSpecialDayCategory, string> = {
  holidays: "getRestDeInfo", "national-days": "getHoliDeInfo", anniversaries: "getAnniversaryInfo", "solar-terms": "get24DivisionsInfo", "seasonal-days": "getSundryDayInfo",
};
const kinds: Record<FortuneSpecialDayCategory, string> = { holidays: "01", "national-days": "01", anniversaries: "02", "solar-terms": "03", "seasonal-days": "04" };
const number = z.string().regex(/^\d{1,8}$/u).transform(Number);
const row = z.object({ locdate: z.string().regex(/^\d{8}$/u), seq: number, dateKind: z.string(),
  dateName: z.string().trim().min(1).max(50), isHoliday: z.enum(["Y", "N"]) });
const envelope = z.object({ response: z.object({ header: z.object({ resultCode: z.literal("00") }), body: z.object({
  pageNo: number, totalCount: number, items: z.union([z.literal(""), z.object({ item: z.union([row, z.array(row).max(100)]).optional() })]).optional(),
}) }) });
export function kasiSpecialDaysUrl(key: string, month: string, category: FortuneSpecialDayCategory, page: number): URL {
  const operation = operations[category];
  if (!operation) throw new Error("invalid-special-day-category");
  const url = new URL(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/${operation}`);
  url.search = new URLSearchParams({ ServiceKey: key, solYear: month.slice(0, 4), solMonth: month.slice(5), pageNo: String(page), numOfRows: "100" }).toString();
  return url;
}
export function parseKasiSpecialDaysPage(xml: string, month: string, category: FortuneSpecialDayCategory, page: number) {
  const body = envelope.parse(parseBoundedKasiXml(xml)).response.body;
  if (body.pageNo !== page || body.totalCount > 100) throw new Error("special-days-page-mismatch");
  const input = body.items && typeof body.items === "object" ? body.items.item : undefined;
  const rows = input ? (Array.isArray(input) ? input : [input]) : [];
  if (rows.some((item) => item.dateKind !== kinds[category]) || rows.length > body.totalCount || (body.totalCount > 0 && !rows.length)) throw new Error("special-days-row-mismatch");
  const items: FortuneSpecialDay[] = rows.map((item) => ({ date: `${item.locdate.slice(0, 4)}-${item.locdate.slice(4, 6)}-${item.locdate.slice(6)}`,
    sequence: item.seq, name: item.dateName, isHoliday: item.isHoliday === "Y" }));
  if (!validateFortuneSpecialDays(month, category, items)) throw new Error("invalid-special-days");
  return { items, totalCount: body.totalCount };
}
