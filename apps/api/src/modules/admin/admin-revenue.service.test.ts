import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { monetizationPlans, revenueLedger, users } from "../../db/schema";
import { AdminRevenueService } from "./admin-revenue.service";

const doubles = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  audit: vi.fn().mockResolvedValue(undefined), schema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../db", async () => ({ ...await import("../../db/schema"), db: doubles.db, dbClient: {} }));
vi.mock("../../server/session", () => ({ invalidateSessionUser: vi.fn(), getSessionUserCached: vi.fn() }));
vi.mock("../../server/user-lifecycle", async (original) => ({
  ...await original<typeof import("../../server/user-lifecycle")>(), ensureUserLifecycleSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./admin-types", async (original) => ({
  ...await original<typeof import("./admin-types")>(), ensureAdminSchema: doubles.schema, logAuditAction: doubles.audit,
}));

type Row = Record<string, unknown>;
interface Query { table?: unknown; selection: unknown; conditions: SQL[]; limit?: number }
interface Write { kind: "insert" | "update"; table: unknown; values?: Row; condition?: SQL }
let actor: Row | undefined;
let readResults: Row[][];
let writeResults: Row[][];
let queries: Query[];
let writes: Write[];
const dialect = new PgDialect();
const NOW = new Date("2026-09-07T12:00:00.000Z");
const service = new AdminRevenueService();
const plan = { code: " PRO ", name: "  전문가  ", priceCents: 12000, intervalDays: 30, currency: "krw", perks: "보관함, 협업", isActive: true };
function event(patch: Row = {}): Row {
  return { id: "event-1", kind: "subscription", amountCents: "12000", status: "approved", currency: "KRW",
    payerId: "payer", recipientId: "creator", metadata: {}, createdAt: NOW, ...patch };
}
function financialReads() { return queries.filter((query) => query.table !== users); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  vi.stubEnv("ADMIN_EMAILS", "");
  actor = { id: "admin-299", name: "검증 관리자", email: "admin299@example.invalid", role: "admin", status: "active" };
  readResults = []; writeResults = []; queries = []; writes = [];
  doubles.db.select.mockImplementation((selection: unknown) => {
    const query: Query = { selection, conditions: [] };
    queries.push(query);
    let rows: Row[] = [];
    const chain = {
      from(table: unknown) { query.table = table; rows = table === users ? actor ? [actor] : [] : readResults.shift() ?? []; return chain; },
      where(condition: SQL) { query.conditions.push(condition); return chain; },
      orderBy() { return chain; }, leftJoin() { return chain; }, groupBy() { return chain; },
      limit(value: number) { query.limit = value; return chain; },
      then(resolve: (value: Row[]) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(rows).then(resolve, reject); },
    };
    return chain;
  });
  for (const kind of ["insert", "update"] as const) doubles.db[kind].mockImplementation((table: unknown) => {
    const write: Write = { kind, table }; writes.push(write);
    const chain = {
      set(values: Row) { write.values = values; return chain; },
      values(values: Row) { write.values = values; return chain; },
      where(condition: SQL) { write.condition = condition; return chain; },
      returning: async () => writeResults.shift() ?? [],
    };
    return chain;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("admin revenue authority and plans", () => {
  it.each([
    ["plans", () => service.getPlans("admin-299")],
    ["plan mutation", () => service.upsertPlan("admin-299", plan)],
    ["revenue", () => service.getRevenue("admin-299", 30)],
    ["status mutation", () => service.setRevenueStatus("admin-299", "event-1", { status: "paid" })],
    ["settlement", () => service.settleRevenueEvent("admin-299", "event-1", {})],
    ["CSV", () => service.exportRevenueCsv("admin-299")],
    ["bulk mutation", () => service.bulkSetRevenueStatus("admin-299", ["event-1"], "approved")],
  ])("denies an ordinary account before %s can read or write financial data", async (_name, request) => {
    actor = { ...actor, role: "user" };
    await expect(request()).rejects.toBeInstanceOf(ForbiddenException);
    expect(financialReads()).toEqual([]); expect(writes).toEqual([]); expect(doubles.audit).not.toHaveBeenCalled();
  });
  it.each(["suspended", "deleted", "missing"])("denies a %s admin account", async (status) => {
    actor = status === "missing" ? undefined : { ...actor, status };
    await expect(service.getRevenue("admin-299", 30)).rejects.toBeInstanceOf(ForbiddenException);
    expect(financialReads()).toEqual([]);
  });
  it("lists plans and converts absent perks to an empty collection", async () => {
    actor = { ...actor, role: "operator" };
    readResults.push([{ id: "p1", perks: null }, { id: "p2", perks: ["저장"] }]);
    expect(await service.getPlans("admin-299")).toEqual({ items: [{ id: "p1", perks: [] }, { id: "p2", perks: ["저장"] }], currency: "KRW" });
    expect(financialReads()[0]!.table).toBe(monetizationPlans);
  });
  it("normalizes an inserted plan and audits only a successful durable result", async () => {
    readResults.push([]); writeResults.push([{ id: "new-plan", code: "pro" }]);
    expect(await service.upsertPlan("admin-299", plan)).toEqual({ ok: true, item: { id: "new-plan", code: "pro" } });
    expect(writes).toEqual([{ kind: "insert", table: monetizationPlans, values: {
      code: "pro", name: "전문가", description: "", intervalDays: 30, currency: "KRW", priceCents: 12000,
      perks: ["보관함", "협업"], isActive: true,
    } }]);
    expect(doubles.audit).toHaveBeenCalledWith("admin-299", "PLAN_CREATE", "plan", "new-plan", expect.objectContaining({ priceCents: 12000 }));
  });
  it("updates only the requested plan and excludes its own code from duplicate detection", async () => {
    readResults.push([{ id: "plan-existing" }], []); writeResults.push([{ id: "plan-existing", name: "전문가" }]);
    expect(await service.upsertPlan("admin-299", { ...plan, id: " plan-existing " })).toMatchObject({ item: { id: "plan-existing" } });
    expect(dialect.sqlToQuery(financialReads()[1]!.conditions[0]!).params).toEqual(["pro", "plan-existing"]);
    expect(dialect.sqlToQuery(writes[0]!.condition!).params).toEqual(["plan-existing"]);
    expect(writes[0]!.values).toMatchObject({ updatedAt: NOW, name: "전문가" });
    expect(doubles.audit).toHaveBeenCalledWith("admin-299", "PLAN_UPDATE", "plan", "plan-existing", expect.any(Object));
  });
  it.each([
    ["missing update target", { ...plan, id: "absent" }, [[]], /수정 대상/],
    ["duplicate update code", { ...plan, id: "p1" }, [[{ id: "p1" }], [{ id: "p2" }]], /동일한/],
    ["duplicate create code", plan, [[{ id: "p2" }]], /중복/],
    ["invalid plan", { ...plan, name: " " }, [], /플랜 이름/],
  ])("rejects %s without changing plans", async (_name, payload, rows, error) => {
    readResults.push(...rows);
    await expect(service.upsertPlan("admin-299", payload)).rejects.toThrow(error);
    expect(writes).toEqual([]); expect(doubles.audit).not.toHaveBeenCalled();
  });
  it("returns an explicit empty insertion result without claiming an audit event", async () => {
    readResults.push([]); writeResults.push([]);
    expect(await service.upsertPlan("admin-299", plan)).toEqual({ ok: true, item: null });
    expect(doubles.audit).not.toHaveBeenCalled();
  });
});

describe("revenue calculations and ledger filters", () => {
  it("totals every state, normalizes DB numeric values, and filters only the visible event list", async () => {
    readResults.push([{ pendingAmount: "100", approvedAmount: "200", paidAmount: "300", rejectedAmount: "40", revokedAmount: null,
      pendingEvents: "1", approvedEvents: 2, paidEvents: "3", rejectedEvents: 4, revokedEvents: "5" }],
    [{ planId: "p", planName: null, events: "6", amountCents: "700" }],
    [event({ status: "unknown", reviewedBy: 42, reviewedAt: NOW, reviewNote: "완료", settledAt: NOW, metadata: null })]);
    const result = await service.getRevenue("admin-299", 7, { status: "paid" });
    expect(result.period).toEqual({ from: "2026-08-31T12:00:00.000Z", to: NOW.toISOString(), days: 7 });
    expect(result.summary).toEqual({ pendingAmountCents: 100, approvedAmountCents: 200, paidAmountCents: 300, rejectedAmountCents: 40, revokedAmountCents: 0,
      pendingEvents: 1, approvedEvents: 2, paidEvents: 3, rejectedEvents: 4, revokedEvents: 5, totalEvents: 15 });
    expect(result.plans).toEqual([{ planId: "p", planName: null, events: 6, amountCents: 700 }]);
    expect(result.events[0]).toMatchObject({ status: "pending", reviewedBy: "42", reviewedAt: NOW.toISOString(), settledAt: NOW.toISOString(), metadata: {} });
    expect(dialect.sqlToQuery(financialReads()[0]!.conditions[0]!).params).toHaveLength(1);
    expect(dialect.sqlToQuery(financialReads()[2]!.conditions[0]!).params.at(-1)).toBe("paid");
    expect(financialReads()[2]!.limit).toBe(24);
  });
  it("returns an empty zero summary, defaults an invalid period, and accepts absent optional event fields", async () => {
    readResults.push([], [], [event({ createdAt: null, reviewedBy: null, reviewedAt: null, settledAt: null })]);
    const result = await service.getRevenue("admin-299", 0);
    expect(result.period.days).toBe(30);
    expect(Object.values(result.summary)).toEqual(Array(11).fill(0));
    expect(result.events[0]).toMatchObject({ status: "approved", createdAt: NOW.toISOString(), reviewNote: null, reviewedBy: null, reviewedAt: null, settledAt: null });
    expect(dialect.sqlToQuery(financialReads()[2]!.conditions[0]!).params).toHaveLength(1);
  });
  it("exports escaped cells with neutralized spreadsheet formulas and complete date columns", async () => {
    readResults.push([event({ id: '=HYPERLINK("url")', payerId: "\t=1", recipientId: " +2", kind: "-3", status: "@cmd", currency: null, settledAt: NOW }),
      event({ id: "ordinary", payerId: "quoted,\"name\"", settledAt: null, createdAt: null })]);
    const csv = await service.exportRevenueCsv("admin-299");
    expect(csv.split("\n")[0]).toBe('"ID","PayerID","RecipientID","Kind","Status","AmountCents","Currency","SettledAt","CreatedAt"');
    expect(csv).toContain('"\'=HYPERLINK(""url"")","\'\t=1","\' +2","\'-3","\'@cmd","12000","","2026-09-07T12:00:00.000Z"');
    expect(csv).toContain('"quoted,""name"""');
    expect(financialReads()[0]!.limit).toBe(5000);
    expect(doubles.audit).toHaveBeenCalledWith("admin-299", "REVENUE_EXPORT_CSV", "revenue", null, { exportedCount: 2 });
  });
});

describe("revenue review and settlement mutations", () => {
  it.each(["approved", "paid"] as const)("applies a valid %s transition and returns the normalized acknowledged event", async (status) => {
    readResults.push([{ id: "event-1", status: status === "paid" ? "approved" : "pending" }], [event({ status })]);
    writeResults.push([{ id: "event-1" }]);
    const result = await service.setRevenueStatus("admin-299", "event-1", { status, note: "  검증 완료  " });
    expect(result).toMatchObject({ ok: true, event: { id: "event-1", status, amountCents: 12000 } });
    expect(writes[0]!.table).toBe(revenueLedger);
    expect(writes[0]!.values).toMatchObject({ status, reviewedBy: "admin-299", reviewedAt: NOW, reviewNote: "검증 완료" });
    expect(Object.hasOwn(writes[0]!.values!, "settledAt")).toBe(status !== "paid");
    expect(dialect.sqlToQuery(writes[0]!.condition!).params).toEqual(["event-1"]);
    expect(doubles.audit).toHaveBeenCalledWith("admin-299", "REVENUE_STATUS_CHANGE", "revenue", "event-1", expect.objectContaining({ nextStatus: status }));
  });
  it.each([
    ["missing event", [], /찾을 수/], ["corrupt status", [{ id: "event-1", status: "nonsense" }], /손상/],
    ["illegal transition", [{ id: "event-1", status: "pending" }], /바로 변경/],
  ])("refuses %s before writing", async (_name, rows, message) => {
    readResults.push(rows);
    await expect(service.setRevenueStatus("admin-299", "event-1", { status: "paid" })).rejects.toThrow(message);
    expect(writes).toEqual([]); expect(doubles.audit).not.toHaveBeenCalled();
  });
  it.each(["update", "readback"])("does not claim review success after %s failure", async (failure) => {
    readResults.push([{ id: "event-1", status: "pending" }], []);
    writeResults.push(failure === "update" ? [] : [{ id: "event-1" }]);
    await expect(service.setRevenueStatus("admin-299", "event-1", { status: "approved" })).rejects.toBeInstanceOf(BadRequestException);
    expect(doubles.audit).not.toHaveBeenCalled();
  });
  it("records a settlement only for paid revenue, preserving its provided timestamp", async () => {
    readResults.push([{ id: "event-1", status: "paid" }], [event({ status: "paid", settledAt: NOW })]);
    writeResults.push([{ id: "event-1" }]);
    expect(await service.settleRevenueEvent("admin-299", "event-1", { settledAt: NOW.toISOString(), note: "입금 확인" })).toMatchObject({ event: { settledAt: NOW.toISOString() } });
    expect(writes[0]!.values).toEqual({ settledAt: NOW, reviewedBy: "admin-299", reviewedAt: NOW, reviewNote: "입금 확인" });
    expect(doubles.audit).toHaveBeenCalledWith("admin-299", "REVENUE_SETTLEMENT_CHANGE", "revenue", "event-1", { settledAt: NOW.toISOString(), note: "입금 확인" });
  });
  it.each([undefined, "corrupt", "approved"])("rejects settlement from %s without a write", async (status) => {
    readResults.push(status ? [{ id: "event-1", status }] : []);
    await expect(service.settleRevenueEvent("admin-299", "event-1", {})).rejects.toBeInstanceOf(BadRequestException);
    expect(writes).toEqual([]);
  });
  it.each(["update", "readback"])("does not audit a settlement with failed %s", async (failure) => {
    readResults.push([{ id: "event-1", status: "paid" }], []); writeResults.push(failure === "update" ? [] : [{ id: "event-1" }]);
    await expect(service.settleRevenueEvent("admin-299", "event-1", {})).rejects.toBeInstanceOf(BadRequestException);
    expect(doubles.audit).not.toHaveBeenCalled();
  });
  it.each([{ label: "empty", ids: [] }, { label: "blank ID", ids: [" "] }, { label: "over 200 IDs", ids: Array<string>(201).fill("event-1") }])("refuses a bulk target list with $label", async ({ ids }) => {
    await expect(service.bulkSetRevenueStatus("admin-299", ids, "approved")).rejects.toBeInstanceOf(BadRequestException);
    expect(writes).toEqual([]);
  });
  it("deduplicates trimmed bulk IDs and dispatches each actual review mutation once", async () => {
    readResults.push([{ id: "event-1", status: "pending" }], [event()]); writeResults.push([{ id: "event-1" }]);
    expect(await service.bulkSetRevenueStatus("admin-299", [" event-1 ", "event-1"], "approved", "검토")).toEqual({ ok: true, count: 1 });
    expect(writes).toHaveLength(1);
    expect(doubles.audit).toHaveBeenLastCalledWith("admin-299", "REVENUE_BULK_STATUS_CHANGE", "revenue", null, { eventIds: ["event-1"], status: "approved", note: "검토" });
  });
});
