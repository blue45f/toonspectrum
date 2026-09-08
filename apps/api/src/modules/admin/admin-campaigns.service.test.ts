import { SQL, sql, type SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { creatorCampaigns } from "../../db";

import { AdminCampaignsService } from "./admin-campaigns.service";

const mocks = vi.hoisted(() => {
  const state = {
    columns: null as Record<string, unknown> | null,
    rows: [] as Record<string, unknown>[],
  };
  const query = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(async () => state.rows),
  };
  query.from.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return {
    state,
    select: vi.fn((columns: Record<string, unknown>) => {
      state.columns = columns;
      return query;
    }),
    ensureAdminSchema: vi.fn(async () => undefined),
    requireAdminUser: vi.fn(async () => undefined),
  };
});

vi.mock("../../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../db")>(),
  db: { select: mocks.select },
}));
vi.mock("./admin-types", async (importOriginal) => ({
  ...await importOriginal<typeof import("./admin-types")>(),
  ensureAdminSchema: mocks.ensureAdminSchema,
  requireAdminUser: mocks.requireAdminUser,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.columns = null;
  mocks.state.rows = [];
});

async function raisedAmountExpression(): Promise<SQLWrapper> {
  await new AdminCampaignsService().getCampaigns("admin-1");
  const expression = mocks.state.columns?.raisedAmountCents;
  if (!expression || typeof expression !== "object" || !("getSQL" in expression)) {
    throw new Error("Campaign raised amount must have a SQL projection.");
  }
  return expression as SQLWrapper;
}

describe("admin campaign ledger totals", () => {
  it("selects a ledger expression rather than the unmaintained stored total", async () => {
    expect(await raisedAmountExpression()).toBeInstanceOf(SQL);
    expect(mocks.ensureAdminSchema).toHaveBeenCalledOnce();
    expect(mocks.requireAdminUser).toHaveBeenCalledWith("admin-1");
  });

  it("normalizes PostgreSQL aggregate strings in the API response", async () => {
    mocks.state.rows = [{
      id: "campaign-1", creatorId: "creator-1", title: "Campaign", description: "",
      targetAmountCents: "1000", raisedAmountCents: "300", isActive: true,
      createdAt: "2026-09-08", updatedAt: "2026-09-08",
    }];
    const response = await new AdminCampaignsService().getCampaigns("admin-1");
    expect(response.currency).toBe("KRW");
    expect(response.items[0]).toMatchObject({ targetAmountCents: 1000, raisedAmountCents: 300 });
  });
});

const integrationUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !integrationUrl) {
  throw new Error("CI must provide PostgreSQL for campaign ledger projection tests.");
}

describe.skipIf(!integrationUrl)("campaign totals against PostgreSQL", () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  const dialect = new PgDialect();

  function connection(): PoolClient {
    if (!client) throw new Error("The isolated PostgreSQL session is unavailable.");
    return client;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationUrl, max: 1 });
    client = await pool.connect();
    await client.query("BEGIN");
    // Shadow only these names in this one session. No public tables or rows change.
    await client.query(`
      CREATE TEMP TABLE creator_campaign (id text PRIMARY KEY, "raisedAmountCents" bigint NOT NULL) ON COMMIT DROP;
      CREATE TEMP TABLE revenue_ledger (
        id text PRIMARY KEY, "campaignId" text, "amountCents" bigint NOT NULL,
        status text NOT NULL, currency text NOT NULL
      ) ON COMMIT DROP;
    `);
  });
  afterAll(async () => {
    try {
      await client?.query("ROLLBACK");
    } finally {
      client?.release();
      await pool?.end();
    }
  });

  async function total(campaignId: string, expression: SQLWrapper): Promise<number> {
    const query = dialect.sqlToQuery(sql`
      SELECT ${expression} AS total FROM ${creatorCampaigns}
      WHERE ${creatorCampaigns.id} = ${campaignId}
    `);
    const result = await connection().query<{ total: string }>(query.sql, query.params);
    return Number(result.rows[0]?.total);
  }

  it("counts only the campaign's paid KRW entries and follows ledger corrections", async () => {
    await connection().query(`
      INSERT INTO pg_temp.creator_campaign VALUES ('campaign-1', 999999), ('campaign-2', 0), ('empty-campaign', 1000);
      INSERT INTO pg_temp.revenue_ledger VALUES
        ('paid-1', 'campaign-1', 100, 'paid', 'KRW'),
        ('paid-2', 'campaign-1', 200, 'paid', 'KRW'),
        ('pending', 'campaign-1', 50, 'pending', 'KRW'),
        ('approved', 'campaign-1', 60, 'approved', 'KRW'),
        ('rejected', 'campaign-1', 70, 'rejected', 'KRW'),
        ('revoked', 'campaign-1', 80, 'revoked', 'KRW'),
        ('dollars', 'campaign-1', 900, 'paid', 'USD'),
        ('another-campaign', 'campaign-2', 999, 'paid', 'KRW'),
        ('no-campaign', NULL, 777, 'paid', 'KRW');
    `);
    const expression = await raisedAmountExpression();
    expect(await total("campaign-1", expression)).toBe(300);
    expect(await total("campaign-2", expression)).toBe(999);
    expect(await total("empty-campaign", expression)).toBe(0);
    await connection().query("UPDATE pg_temp.revenue_ledger SET status = 'revoked' WHERE id = 'paid-1'");
    expect(await total("campaign-1", expression)).toBe(200);
    await connection().query("UPDATE pg_temp.revenue_ledger SET \"amountCents\" = 225 WHERE id = 'paid-2'");
    expect(await total("campaign-1", expression)).toBe(225);
  });
});
