import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PostgresHealthReadinessRepository,
  REQUIRED_DATABASE_RELATIONS,
} from "./health-readiness.repository";

const INTEGRATION_URL =
  process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
const INTEGRATION_RUNTIME_ROLE =
  process.env.STUDIO_LIVE_POSTGRES_RUNTIME_ROLE?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; deployment readiness cannot be skipped",
  );
}
if (process.env.CI && !INTEGRATION_RUNTIME_ROLE) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_RUNTIME_ROLE; readiness must run as the application role",
  );
}
if (
  INTEGRATION_RUNTIME_ROLE &&
  !/^[a-z_][a-z0-9_]{0,62}$/u.test(INTEGRATION_RUNTIME_ROLE)
) {
  throw new Error(
    "STUDIO_LIVE_POSTGRES_RUNTIME_ROLE must be a lowercase PostgreSQL role name",
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

describeWithDirectPostgres("Health PostgreSQL readiness contract", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    if (!INTEGRATION_URL) {
      throw new Error("integration URL was not provided");
    }
    pool = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
    // Pin one session so the runtime-role boundary cannot disappear behind a pool reconnect.
    client = await pool.connect();
    if (INTEGRATION_RUNTIME_ROLE) {
      await client.query(`SET ROLE "${INTEGRATION_RUNTIME_ROLE}"`);
      const identity = await client.query<{ currentUser: string }>(
        `SELECT current_user::text AS "currentUser"`,
      );
      if (identity.rows[0]?.currentUser !== INTEGRATION_RUNTIME_ROLE) {
        throw new Error("readiness integration runtime role was not activated");
      }
    }
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("recognizes the complete migrated schema through the real pg type parser", async () => {
    const repository = new PostgresHealthReadinessRepository(client);

    await expect(repository.isDatabaseReachable()).resolves.toBe(true);
    await expect(repository.isSchemaReady()).resolves.toBe(true);
  });

  it("casts PostgreSQL catalog names to a driver-supported text array", async () => {
    const result = await client.query<{ relationNames: string[] }>(
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
