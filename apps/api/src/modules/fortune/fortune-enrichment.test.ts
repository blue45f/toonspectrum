import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { fortuneMonthDays } from "../../../../../packages/core/src/fortune";
import type { UpstashCoordinationPort } from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import { FortuneCalendarQuery, FortuneHoroscopeQuery, FortuneEnrichmentController } from "./fortune-enrichment.controller";
import { FortuneRefreshWorker } from "./fortune-refresh.worker";
import { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { compareKasiCalendar, fortuneEnrichmentConfig, parseKasiCalendarPage, parseProviderHoroscope, readBoundedProviderBody, type FortuneEnrichmentConfig } from "./fortune-enrichment.provider";

const config: FortuneEnrichmentConfig = { kasiEnabled: true, kasiServiceKey: "fixture-not-a-real-key", horoscopeEnabled: true, horoscopeRightsApproved: true, horoscopePolicyRevision: "fixture-approved-v1", dailyRequestLimit: 100 };
const now = () => new Date("2026-09-20T01:00:00Z");
const closed = { state: "closed", consecutiveFailures: 0, openedUntilEpochMs: 0, observedAtEpochMs: now().getTime() };
function port() { return {
  readProviderCircuit: vi.fn().mockResolvedValue(closed), closeProviderCircuit: vi.fn().mockResolvedValue(closed), recordProviderFailure: vi.fn().mockResolvedValue(closed),
  consumeProviderBudget: vi.fn().mockResolvedValue({ accepted: true, duplicate: false, requestUnits: 1, costUnits: 0, windowId: "utc-day:1", remainingTtlMs: 3600000 }),
}; }
function fixtureRows(month = "2024-02") {
  // Synthetic protocol fixtures, not evidence of independent astronomical verification.
  return fortuneMonthDays(month).map((day) => ({ solYear: Number(day.date.slice(0, 4)), solMonth: Number(day.date.slice(5, 7)), solDay: Number(day.date.slice(8)),
    lunYear: day.lunar.year, lunMonth: day.lunar.month, lunDay: day.lunar.day, lunLeapmonth: day.lunar.intercalation ? "윤" as const : "평" as const, solWeek: "일월화수목금토"[day.weekday] as "일" }));
}
function xml(month = "2024-02", page = 1, size = 31) {
  const rows = fixtureRows(month);
  return `<response><header><resultCode>00</resultCode></header><body><pageNo>${page}</pageNo><totalCount>${rows.length}</totalCount><items>${rows.slice((page - 1) * size, page * size).map((row) => `<item>${Object.entries(row).map(([key, value]) => `<${key}>${value}</${key}>`).join("")}</item>`).join("")}</items></body></response>`;
}
function setup(overrides: Partial<FortuneEnrichmentConfig> = {}) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml())); const coordination = port();
  const service = new FortuneEnrichmentService({ ...config, ...overrides }, { fetch: fetcher, now }, coordination as unknown as UpstashCoordinationPort);
  return { fetcher, coordination, service };
}
describe("fortune external boundaries", () => {
  it("rejects invalid dates, private fields, arbitrary signs and excessive limits", () => {
    for (const month of ["2026-13", "1899-01", "2051-01", "2026-1"]) expect(FortuneCalendarQuery.schema.safeParse({ month }).success).toBe(false);
    expect(FortuneCalendarQuery.schema.safeParse({ month: "2026-09", birthDate: "1996-02-01" }).success).toBe(false);
    expect(FortuneHoroscopeQuery.schema.safeParse({ sign: "aries", period: "daily", date: "2026-02-30" }).success).toBe(false);
    expect(FortuneHoroscopeQuery.schema.safeParse({ sign: "file:///secret", period: "daily", date: "2026-09-20" }).success).toBe(false);
    expect(() => fortuneEnrichmentConfig({ FORTUNE_PROVIDER_DAILY_REQUEST_LIMIT: "1001" })).toThrow();
    expect(fortuneEnrichmentConfig({})).toMatchObject({ kasiEnabled: false, horoscopeEnabled: false });
  });
  it.each(["not-configured", "rights-pending", "coordination-unavailable"])("fails closed for %s", async (reason) => {
    const fetcher = vi.fn<typeof fetch>();
    const conf = { ...config, horoscopeEnabled: reason !== "not-configured", horoscopeRightsApproved: reason !== "rights-pending" };
    const service = new FortuneEnrichmentService(conf, { fetch: fetcher, now }, reason === "coordination-unavailable" ? null : port() as unknown as UpstashCoordinationPort);
    expect(await service.horoscope("aries", "daily", "2026-09-20")).toMatchObject({ source: "local", status: "local-fallback", reason });
    expect(fetcher).not.toHaveBeenCalled(); expect(JSON.stringify(service.capabilities())).not.toContain(config.kasiServiceKey);
  });
  it("joins concurrent requests, caches public checks and isolates caller mutations", async () => {
    const { service, fetcher, coordination } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => service.calendar("2024-02")));
    expect(fetcher).toHaveBeenCalledTimes(1); expect(coordination.consumeProviderBudget).toHaveBeenCalledTimes(1);
    expect(results[0].checks).toHaveLength(29); expect(results[0].checks.every((check) => check.matches)).toBe(true);
    results[0].checks[0].matches = false;
    expect((await service.calendar("2024-02")).checks[0].matches).toBe(true);
    expect((await service.calendar("2024-02")).status).toBe("external-cache");
    const [url, init] = fetcher.mock.calls[0]; expect(String(url)).not.toContain("birth"); expect(init?.redirect).toBe("error");
    expect(coordination.consumeProviderBudget.mock.calls[0][0]).toMatchObject({ maximumCostUnits: 0, costUnits: 0, requestUnits: 1 });
  });
  it("accounts for every page and rejects partial/duplicate months", async () => {
    const { service, fetcher, coordination } = setup();
    fetcher.mockImplementation(async (url) => new Response(xml("2024-02", Number(new URL(String(url)).searchParams.get("pageNo")), 10)));
    expect((await service.calendar("2024-02")).checks).toHaveLength(29); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Set(coordination.consumeProviderBudget.mock.calls.map(([request]) => request.operationId)).size).toBe(3);
    expect(() => compareKasiCalendar("2024-02", fixtureRows().slice(1))).toThrow();
    const rows = fixtureRows(); rows[1] = rows[0]; expect(() => compareKasiCalendar("2024-02", rows)).toThrow();
  });
  it("reports differing fields rather than silently replacing the calendar", () => {
    const rows = fixtureRows(); rows[0].lunDay = rows[0].lunDay === 1 ? 2 : 1; rows[0].lunLeapmonth = "윤";
    expect(compareKasiCalendar("2024-02", rows)[0]).toEqual({ date: "2024-02-01", matches: false, fields: ["lunar-date", "leap-month"] });
  });
  it.each(["budget", "circuit", "coordination"])("does not call the provider when %s is unavailable", async (mode) => {
    const { service, fetcher, coordination } = setup();
    if (mode === "budget") coordination.consumeProviderBudget.mockResolvedValueOnce({ accepted: false });
    if (mode === "circuit") coordination.readProviderCircuit.mockResolvedValueOnce({ state: "open" });
    if (mode === "coordination") coordination.consumeProviderBudget.mockRejectedValueOnce(new Error("network"));
    expect((await service.calendar("2024-02")).status).toBe("local-fallback"); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["http", "timeout", "business-error", "wrong-month", "doctype", "depth", "oversize"])("isolates %s failures", async (mode) => {
    const { service, fetcher } = setup();
    if (mode === "http") fetcher.mockResolvedValueOnce(new Response("limited", { status: 429 }));
    if (mode === "timeout") fetcher.mockRejectedValueOnce(new Error("timed out"));
    if (mode === "business-error") fetcher.mockResolvedValueOnce(new Response(xml().replace("<resultCode>00", "<resultCode>22")));
    if (mode === "wrong-month") fetcher.mockResolvedValueOnce(new Response(xml("2024-03")));
    if (mode === "doctype") fetcher.mockResolvedValueOnce(new Response("<!DOCTYPE x [<!ENTITY a 'x'>]>" + xml()));
    if (mode === "depth") fetcher.mockResolvedValueOnce(new Response("<a>".repeat(50) + "</a>".repeat(50)));
    if (mode === "oversize") fetcher.mockResolvedValueOnce(new Response(" ".repeat(131073)));
    expect(await service.calendar("2024-02")).toMatchObject({ source: "local", status: "local-fallback", checks: [] });
  });
  it("serves rights-approved original English only with matching source context", async () => {
    const { service, fetcher } = setup();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: { sign: "Aries", period: "daily", date: "2026-09-20", horoscope: "Consider one small creative step before starting the next scene." } })));
    expect(await service.horoscope("aries", "daily", "2026-09-20")).toMatchObject({ status: "external", source: "free-horoscope", language: "en", sourceDate: "2026-09-20" });
    expect(String(fetcher.mock.calls[0][0])).toBe("https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=aries");
  });
  it.each(["date", "sign", "period", "html"])("rejects horoscope %s mismatch", (mode) => {
    const data = { sign: "Aries", period: "daily", date: "2026-09-20", horoscope: "Consider one small creative step before starting the next scene." };
    if (mode === "date") data.date = "2026-09-19";
    if (mode === "sign") data.sign = "Leo";
    if (mode === "period") data.period = "monthly";
    if (mode === "html") data.horoscope = "<script>alert('external content')</script>";
    expect(() => parseProviderHoroscope(JSON.stringify({ data }), "aries", "daily", "2026-09-20")).toThrow();
  });
  it("never fetches or reuses external text for a historical reference day", async () => {
    const { service, fetcher } = setup();
    expect(await service.horoscope("aries", "daily", "2026-09-19")).toMatchObject({ reason: "historical-request", source: "local" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects unbounded streams and malformed XML", async () => {
    await expect(readBoundedProviderBody(new Response("x".repeat(131073)))).rejects.toThrow();
    expect(() => parseKasiCalendarPage("<response><broken></response>", "2024-02", 1)).toThrow();
    expect(() => parseKasiCalendarPage(xml(), "2024-02", 2)).toThrow();
  });
});

const httpService = new FortuneEnrichmentService(fortuneEnrichmentConfig({}), { fetch: globalThis.fetch, now });
const httpWorker = new FortuneRefreshWorker(fortuneEnrichmentConfig({}), { fetch: globalThis.fetch, now }, httpService);
@Module({ controllers: [FortuneEnrichmentController], providers: [{ provide: FortuneEnrichmentService, useValue: httpService }, { provide: FortuneRefreshWorker, useValue: httpWorker }] })
class FortuneEnrichmentHttpModule {}
it("validates real GET routes without compiler-emitted parameter metadata", async () => {
  const app = await NestFactory.create(FortuneEnrichmentHttpModule, { logger: false });
  app.setGlobalPrefix("api");
  try {
    await app.listen(0, "127.0.0.1"); const baseUrl = await app.getUrl();
    const capabilities = await fetch(`${baseUrl}/api/fortune/capabilities`);
    expect(await capabilities.json()).toMatchObject({ paidFallback: false, tarotDecks: ["major-22", "full-78"], maintenance: { scope: "process-local", enabled: false, running: false, lastRun: null } });
    const special = await fetch(`${baseUrl}/api/fortune/special-days?month=2024-02&category=holidays`);
    expect(special.status).toBe(200); expect(special.headers.get("cache-control")).toBe("no-store");
    expect(await special.json()).toMatchObject({ kind: "special-days", status: "local-fallback", items: [] });
    expect((await fetch(`${baseUrl}/api/fortune/special-days?month=2024-02&category=holidays&birthDate=1990-01-01`)).status).toBe(400);
    const calendar = await fetch(`${baseUrl}/api/fortune/calendar?month=2024-02`);
    expect(calendar.status).toBe(200); expect(calendar.headers.get("cache-control")).toBe("no-store");
    expect(await calendar.json()).toMatchObject({ month: "2024-02", status: "local-fallback", reason: "not-configured" });
    for (const query of ["month=2026-13", "month=2024-02&birthDate=1996-02-01", "month=2024-02&month=2024-03"]) {
      expect((await fetch(`${baseUrl}/api/fortune/calendar?${query}`)).status).toBe(400);
    }
    expect((await fetch(`${baseUrl}/api/fortune/horoscope?sign=aries&period=daily&date=2026-02-30`)).status).toBe(400);
  } finally { await app.close(); }
});

it.each([429, 503, 200])("cancels rejected upstream streams (%s)", async (status) => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const response = new Response(body, { status, headers: status === 200 ? { "content-length": "131073" } : {} });
  await expect(readBoundedProviderBody(response)).rejects.toThrow("provider-response-rejected");
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("expires cached horoscope originals at KST midnight", async () => {
  let clock = new Date("2026-09-20T14:59:59.000Z");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: {
    sign: "Aries", period: "daily", date: "2026-09-20", horoscope: "Pause to notice the small details in the scene around you.",
  } })));
  const service = new FortuneEnrichmentService(config, { fetch: fetcher, now: () => clock }, port() as unknown as UpstashCoordinationPort);
  expect((await service.horoscope("aries", "daily", "2026-09-20")).status).toBe("external");
  expect((await service.horoscope("aries", "daily", "2026-09-20")).status).toBe("external-cache");
  clock = new Date("2026-09-20T15:00:00.000Z");
  expect(await service.horoscope("aries", "daily", "2026-09-20")).toMatchObject({ source: "local", reason: "historical-request" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
