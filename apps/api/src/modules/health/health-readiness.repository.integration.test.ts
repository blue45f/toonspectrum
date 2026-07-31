import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PostgresHealthReadinessRepository,
  REQUIRED_DATABASE_RELATIONS,
} from "./health-readiness.repository";

const INTEGRATION_URL =
  process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; deployment readiness cannot be skipped",
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

describeWithDirectPostgres("Health PostgreSQL readiness contract", () => {
  let pool: Pool;

  beforeAll(() => {
    if (!INTEGRATION_URL) {
      throw new Error("integration URL was not provided");
    }
    pool = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("recognizes the complete migrated schema through the real pg type parser", async () => {
    const repository = new PostgresHealthReadinessRepository(pool);

    await expect(repository.isDatabaseReachable()).resolves.toBe(true);
    await expect(repository.isSchemaReady()).resolves.toBe(true);
  });

  it("casts PostgreSQL catalog names to a driver-supported text array", async () => {
    const result = await pool.query<{ relationNames: string[] }>(
      `
        SELECT array_agg(
          relation.relname::text
          ORDER BY relation.relname::text
        ) AS "relationNames"
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND relation.relname = ANY($1::text[])
      `,
      [[...REQUIRED_DATABASE_RELATIONS]],
    );

    expect(Array.isArray(result.rows[0]?.relationNames)).toBe(true);
    expect(result.rows[0]?.relationNames).toEqual(
      [...REQUIRED_DATABASE_RELATIONS],
    );
  });
});
