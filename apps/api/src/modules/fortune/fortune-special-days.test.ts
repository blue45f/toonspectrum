import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { FORTUNE_SPECIAL_DAY_CATEGORIES, validateFortuneSpecialDays } from "../../../../../packages/core/src/fortune";
import type { UpstashCoordinationPort } from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import { followupConfig, followupCoordination, followupNow, specialItem, specialXml } from "../../../test/fortune-followup-fixtures";
import { FortuneSpecialDaysQuery } from "./fortune-enrichment.controller";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { kasiSpecialDaysUrl, parseKasiSpecialDaysPage } from "./fortune-special-days.provider";

describe("KASI special-day protocol boundary", () => {
  it.each(FORTUNE_SPECIAL_DAY_CATEGORIES)("selects only fixed operations for %s", (category) => {
    const url = kasiSpecialDaysUrl("fixture+/=", "2024-09", category, 1);
    expect(url.origin).toBe("https://apis.data.go.kr"); expect(url.searchParams.get("ServiceKey")).toBe("fixture+/=");
    expect(url.searchParams.get("solYear")).toBe("2024"); expect([...url.searchParams.keys()]).toEqual(["ServiceKey", "solYear", "solMonth", "pageNo", "numOfRows"]);
  });
  it("accepts a single row, empty months and independent same-day entries", () => {
    expect(parseKasiSpecialDaysPage(specialXml(), "2024-09", "holidays", 1).items[0]).toMatchObject({ date: "2024-09-17", name: "테스트 휴일", isHoliday: true });
    expect(parseKasiSpecialDaysPage(specialXml("", 0), "2024-09", "holidays", 1).items).toEqual([]);
    expect(parseKasiSpecialDaysPage(specialXml(specialItem() + specialItem("20240917", 2), 2), "2024-09", "holidays", 1).items).toHaveLength(2);
  });
  it.each(["month", "kind", "duplicate", "page", "total", "business", "doctype", "depth", "empty", "date"])("rejects %s mismatch", (mode) => {
    const candidates: Record<string, string> = { month: specialXml(specialItem("20241001")), kind: specialXml(specialItem("20240917", 1, "03")),
      duplicate: specialXml(specialItem() + specialItem(), 2), page: specialXml(specialItem(), 1, 2), total: specialXml(specialItem(), 101),
      business: specialXml().replace("<resultCode>00", "<resultCode>22"), doctype: "<!DOCTYPE a>" + specialXml(),
      depth: "<a>".repeat(17) + "</a>".repeat(17), empty: specialXml("", 2), date: specialXml(specialItem("20240931")) };
    expect(() => parseKasiSpecialDaysPage(candidates[mode], "2024-09", "holidays", 1)).toThrow();
  });
  it("rejects private fields, invalid categories and forged names", () => {
    for (const query of [{ month: "2024-09", category: "birth" }, { month: "2024-09", category: "holidays", birthDate: "1990-01-01" }, { month: "2024-13", category: "holidays" }]) expect(FortuneSpecialDaysQuery.schema.safeParse(query).success).toBe(false);
    expect(validateFortuneSpecialDays("2024-09", "holidays", [{ date: "2024-09-17", sequence: 1, name: "<img>", isHoliday: true }])).toBe(false);
  });
});
describe("optional special-day integration", () => {
  it("shares the conservative KASI budget and accounts for every page", async () => {
    const coordination = followupCoordination(); const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(specialXml(specialItem(), 2, 1)))
      .mockResolvedValueOnce(new Response(specialXml(specialItem("20240918", 2), 2, 2)));
    const service = new FortuneEnrichmentService(followupConfig, { fetch: fetcher, now: followupNow }, coordination as unknown as UpstashCoordinationPort);
    expect(await service.specialDays("2024-09", "holidays")).toMatchObject({ source: "kasi", status: "external", items: [{ date: "2024-09-17" }, { date: "2024-09-18" }] });
    expect(coordination.consumeProviderBudget).toHaveBeenCalledTimes(2);
    expect(coordination.consumeProviderBudget.mock.calls[0][0]).toMatchObject({ providerId: "fortune-kasi", maximumCostUnits: 0 });
    expect((await service.specialDays("2024-09", "holidays")).status).toBe("external-cache"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["duplicate-pages", "changing-total", "partial", "disabled", "key"])("fails safely for %s", async (mode) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(specialXml(specialItem(), mode === "partial" ? 10 : 2)));
    if (mode === "changing-total") fetcher.mockResolvedValueOnce(new Response(specialXml(specialItem(), 3)));
    const service = new FortuneEnrichmentService({ ...followupConfig, specialDaysEnabled: mode !== "disabled", specialDaysServiceKey: mode === "key" ? "" : "fixture" },
      { fetch: fetcher, now: followupNow }, followupCoordination() as unknown as UpstashCoordinationPort);
    expect(await service.specialDays("2024-09", "holidays")).toMatchObject({ source: "local", status: "local-fallback", items: [] });
    if (mode === "disabled" || mode === "key") expect(fetcher).not.toHaveBeenCalled();
  });
});
