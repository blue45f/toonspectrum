import { randomUUID } from "node:crypto";

import { Client, types as pgTypes } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCampaignsService } from "./admin-campaigns.service";

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  parsePayload: vi.fn(),
  requireAdmin: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../../db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { creatorCampaigns, monetizationPlans, revenueLedger } = await import("../../db/schema/admin.schema");
  const { users } = await import("../../db/schema/auth.schema");
  return {
    creatorCampaigns,
    monetizationPlans,
    revenueLedger,
    users,
    db: drizzle((query, parameters, method) => boundary.query(query, parameters, method)),
  };
});

vi.mock("./admin-types", () => ({
  ensureAdminSchema: vi.fn().mockResolvedValue(undefined),
  requireAdminUser: boundary.requireAdmin,
  ensureCreatorExists: vi.fn().mockResolvedValue(undefined),
  ensureCampaignPlanExists: vi.fn().mockResolvedValue(undefined),
  logAuditAction: boundary.audit,
  parseCampaignPayload: boundary.parsePayload,
  parseCampaignQuery: (query: Record<string, unknown>) => ({
    creatorId: query.creatorId ?? null,
    isActive: query.isActive ?? null,
    title: query.title ?? null,
  }),
  parseString: (value: unknown) => String(value ?? ""),
  escapeLike: (value: string) => value.replace(/[\\%_]/g, "\\$&"),
  toNumber: (value: unknown) => Number(value ?? 0),
}));

const service = new AdminCampaignsService();
const payload = { creatorId: "creator-a", planId: "plan-a", title: "Launch", targetAmountCents: 20_000 };

function campaignValues(id: string, raisedAmountCents: string) {
  return [id, "creator-a", null, "plan-a", "Launch", "", 20_000, raisedAmountCents, true, null, null,
    "2026-09-08 09:00:00", "2026-09-08 09:00:00"];
}

function expectLedgerSum(query: string, parameters: unknown[]) {
  expect(query).toMatch(/coalesce\(sum\((?:"revenue_ledger"\.)?"amountCents"\),\s*0\)/);
  expect(query).toContain('from "revenue_ledger"');
  expect(query).toContain('"revenue_ledger"."campaignId" = "creator_campaign"."id"');
  expect(query).not.toMatch(/join\s+"revenue_ledger"/i);
  const status = /"revenue_ledger"\."status" = \$(\d+)/.exec(query);
  const currency = /"revenue_ledger"\."currency" = \$(\d+)/.exec(query);
  expect(status).not.toBeNull();
  expect(currency).not.toBeNull();
  expect(parameters[Number(status?.[1]) - 1]).toBe("paid");
  expect(parameters[Number(currency?.[1]) - 1]).toBe("KRW");
}

beforeEach(() => {
  boundary.query.mockReset();
  boundary.requireAdmin.mockReset().mockResolvedValue({ id: "admin" });
  boundary.audit.mockReset().mockResolvedValue(undefined);
  boundary.parsePayload.mockReset().mockImplementation((input: Record<string, unknown>) => ({
    titleId: null,
    planId: null,
    description: "",
    targetAmountCents: 0,
    raisedAmountCents: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...input,
  }));
});

describe("AdminCampaignsService ledger-derived totals", () => {
  it("selects the paid KRW sum per campaign without joining ledger rows", async () => {
    boundary.query.mockResolvedValue({ rows: [
      [...campaignValues("campaign-a", "3500"), "Creator", "creator@example.test", "Plan", "plan"],
      [...campaignValues("campaign-empty", "0"), "Creator", "creator@example.test", "Plan", "plan"],
    ] });

    const result = await service.getCampaigns("admin");
    expect(result.currency).toBe("KRW");
    expect(result.items.map(({ id, raisedAmountCents }) => ({ id, raisedAmountCents }))).toEqual([
      { id: "campaign-a", raisedAmountCents: 3500 },
      { id: "campaign-empty", raisedAmountCents: 0 },
    ]);
    expect(boundary.query).toHaveBeenCalledTimes(1);
    const [query, parameters] = boundary.query.mock.calls[0];
    expectLedgerSum(query, parameters);
    expect(query).not.toContain('"creator_campaign"."raisedAmountCents"');
  });

  it("retains campaign filters outside the independent ledger sum", async () => {
    boundary.query.mockResolvedValue({ rows: [] });
    await service.getCampaigns("admin", { creatorId: "creator-a", isActive: true, title: "Launch" });
    const [query, parameters] = boundary.query.mock.calls[0];
    expectLedgerSum(query, parameters);
    expect(query).toContain('"creator_campaign"."creatorId"');
    expect(query).toContain('"creator_campaign"."isActive"');
    expect(parameters).toEqual(expect.arrayContaining(["creator-a", true, "%launch%"]));
  });

  it("ignores an administrator aggregate and derives the create response", async () => {
    boundary.query.mockResolvedValue({ rows: [campaignValues("campaign-new", "0")] });
    const result = await service.upsertCampaign("admin", { ...payload, raisedAmountCents: 999_999 });
    expect(boundary.parsePayload).toHaveBeenCalledWith({ ...payload, raisedAmountCents: 0 });
    expect(result.item).toMatchObject({ id: "campaign-new", raisedAmountCents: 0 });
    expect(boundary.query).toHaveBeenCalledTimes(1);
    const [query, parameters] = boundary.query.mock.calls[0];
    expect(query).toMatch(/^insert into "creator_campaign"/);
    expect(query).toContain(" returning ");
    expectLedgerSum(query, parameters);
  });

  it("does not write the aggregate and derives the update response", async () => {
    boundary.query.mockResolvedValueOnce({ rows: [["campaign-a"]] })
      .mockResolvedValueOnce({ rows: [campaignValues("campaign-a", "5500")] });
    const result = await service.upsertCampaign("admin", { ...payload, id: "campaign-a", raisedAmountCents: 999_999 });
    expect(result.item).toMatchObject({ id: "campaign-a", raisedAmountCents: 5500 });
    expect(boundary.query).toHaveBeenCalledTimes(2);
    const [query, parameters] = boundary.query.mock.calls[1];
    expect(query).toMatch(/^update "creator_campaign" set /);
    expect(query.split(" returning ")[0]).not.toContain('"raisedAmountCents"');
    expectLedgerSum(query, parameters);
  });

  it("still rejects updating a campaign that does not exist", async () => {
    boundary.query.mockResolvedValue({ rows: [] });
    await expect(service.upsertCampaign("admin", { ...payload, id: "missing" })).rejects.toThrow();
    expect(boundary.query).toHaveBeenCalledTimes(1);
  });
});

// Optional real PostgreSQL proof. Never connect to a remote or production host.
const databaseUrl = process.env.STUDIO_CAMPAIGN_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Campaign SQL tests require an explicitly configured localhost PostgreSQL URL");
  }
}

describe.skipIf(!databaseUrl)("AdminCampaignsService isolated PostgreSQL execution", () => {
  const schema = `campaign_test_${randomUUID().replaceAll("-", "")}`;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      types: { getTypeParser: (oid) => [1082, 1114, 1184].includes(oid)
        ? (value: string) => value
        : pgTypes.getTypeParser(oid) },
    });
    await client.connect();
    await client.query(`create schema "${schema}"; set search_path to "${schema}"`);
    await client.query(`
      create table "user" (id text primary key, name text, email text);
      create table monetization_plan (id text primary key, name text, code text);
      create table creator_campaign (
        id text primary key, "creatorId" text not null, "titleId" text, "planId" text,
        title text not null, description text not null default '',
        "targetAmountCents" bigint not null default 0, "raisedAmountCents" bigint not null default 0,
        "isActive" boolean not null default true, "startsAt" timestamp, "endsAt" timestamp,
        "createdAt" timestamp default now(), "updatedAt" timestamp default now()
      );
      create table revenue_ledger (
        id text primary key, "campaignId" text, "amountCents" bigint not null,
        status text not null, currency text not null
      );
      insert into "user" values ('creator-a', 'Creator', 'creator@example.test');
      insert into monetization_plan values ('plan-a', 'Plan', 'plan');
    `);
  });

  beforeEach(async () => {
    await client.query(`truncate revenue_ledger, creator_campaign;
      insert into creator_campaign (id, "creatorId", "planId", title, "raisedAmountCents") values
        ('campaign-a', 'creator-a', 'plan-a', 'Launch', 999999),
        ('campaign-b', 'creator-a', 'plan-a', 'Other', 888888),
        ('campaign-empty', 'creator-a', null, 'Empty', 777777);
      insert into revenue_ledger values
        ('paid-1', 'campaign-a', 1000, 'paid', 'KRW'),
        ('paid-2', 'campaign-a', 2500, 'paid', 'KRW'),
        ('pending', 'campaign-a', 100000, 'pending', 'KRW'),
        ('refunded', 'campaign-a', 100000, 'refunded', 'KRW'),
        ('failed', 'campaign-a', 100000, 'failed', 'KRW'),
        ('usd', 'campaign-a', 100000, 'paid', 'USD'),
        ('other', 'campaign-b', 9000, 'paid', 'KRW'),
        ('unassigned', null, 100000, 'paid', 'KRW');
    `);
    boundary.query.mockImplementation(async (text: string, parameters: unknown[]) => {
      const result = await client.query({ text, values: parameters, rowMode: "array" });
      return { rows: result.rows };
    });
  });

  afterAll(async () => {
    if (client) {
      try { await client.query(`drop schema if exists "${schema}" cascade`); }
      finally { await client.end(); }
    }
  });

  it("executes the correlated sum with empty, foreign-campaign, status and currency exclusions", async () => {
    const result = await service.getCampaigns("admin");
    expect(Object.fromEntries(result.items.map((item) => [item.id, item.raisedAmountCents])))
      .toEqual({ "campaign-a": 3500, "campaign-b": 9000, "campaign-empty": 0 });
    expect(result.items).toHaveLength(3);
  });

  it("executes UPDATE RETURNING without replacing the stored aggregate", async () => {
    const result = await service.upsertCampaign("admin", { ...payload, id: "campaign-a", raisedAmountCents: 123456 });
    expect(result.item?.raisedAmountCents).toBe(3500);
    const stored = await client.query('select "raisedAmountCents" from creator_campaign where id = $1', ["campaign-a"]);
    expect(Number(stored.rows[0].raisedAmountCents)).toBe(999999);
  });

  it("executes INSERT RETURNING with a zero ledger sum despite an injected aggregate", async () => {
    const result = await service.upsertCampaign("admin", { ...payload, raisedAmountCents: 123456 });
    expect(result.item?.raisedAmountCents).toBe(0);
    const stored = await client.query('select "raisedAmountCents" from creator_campaign where id = $1', [result.item?.id]);
    expect(Number(stored.rows[0].raisedAmountCents)).toBe(0);
  });
});
