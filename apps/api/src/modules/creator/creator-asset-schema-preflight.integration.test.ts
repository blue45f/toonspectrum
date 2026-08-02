import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildCreatorAssetObjectStorageRuntimeAclSql } from "../../../../../scripts/run-production-database-migrations.mjs";

import { preflightCreatorAssetSchema } from "./creator-asset-schema-preflight";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Creator Asset schema invariants cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

function forwardMigrationBody(source: string, migrationName: string): string {
  const beginAt = source.indexOf("BEGIN;");
  const commitAt = source.lastIndexOf("COMMIT;");
  if (beginAt < 0 || commitAt <= beginAt) {
    throw new Error(`${migrationName} must keep one explicit outer transaction`);
  }
  return source.slice(beginAt + "BEGIN;".length, commitAt);
}

describeWithDirectPostgres("Creator Asset PostgreSQL schema contract", () => {
  const runtimeRoles: string[] = [];
  const userIds: string[] = [];
  let pool: Pool;

  beforeAll(() => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");
    pool = new Pool({ connectionString: INTEGRATION_URL, max: 2 });
  });

  afterEach(async () => {
    for (const role of runtimeRoles.splice(0)) {
      await pool.query(`DROP OWNED BY "${role}"`);
      await pool.query(`DROP ROLE "${role}"`);
    }
    const ids = userIds.splice(0);
    if (ids.length > 0) {
      await pool.query('DELETE FROM "user" WHERE "id" = ANY($1::text[])', [ids]);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await pool.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
      userId,
      "Creator Asset schema integration",
    ]);
    userIds.push(userId);
    return userId;
  }

  it("accepts the exact migrated constraints and index definitions", async () => {
    await expect(preflightCreatorAssetSchema(pool)).resolves.toBeUndefined();
  });

  it("grants the runtime role only object-storage lifecycle mutations", async () => {
    const role = `creator_storage_runtime_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE ROLE "${role}" NOLOGIN`);
    runtimeRoles.push(role);
    await pool.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await pool.query(buildCreatorAssetObjectStorageRuntimeAclSql(role));

    const [privileges] = (await pool.query<{
      objectDelete: boolean;
      objectDigestUpdate: boolean;
      objectInsert: boolean;
      objectPurposeInsert: boolean;
      objectSelect: boolean;
      objectStateInsert: boolean;
      objectStateUpdate: boolean;
      objectUpdate: boolean;
      referenceDelete: boolean;
      referenceInsert: boolean;
      referenceSelect: boolean;
      referenceStateInsert: boolean;
      referenceStateUpdate: boolean;
      referenceUpdate: boolean;
      referenceWorkInsert: boolean;
      referenceWorkUpdate: boolean;
    }>(`
      SELECT
        has_table_privilege($1, 'public.creator_asset_storage_object', 'DELETE')
          AS "objectDelete",
        has_column_privilege(
          $1,
          'public.creator_asset_storage_object',
          'digest',
          'UPDATE'
        ) AS "objectDigestUpdate",
        has_table_privilege($1, 'public.creator_asset_storage_object', 'INSERT')
          AS "objectInsert",
        has_column_privilege(
          $1,
          'public.creator_asset_storage_object',
          'purpose',
          'INSERT'
        ) AS "objectPurposeInsert",
        has_table_privilege($1, 'public.creator_asset_storage_object', 'SELECT')
          AS "objectSelect",
        has_column_privilege(
          $1,
          'public.creator_asset_storage_object',
          'state',
          'INSERT'
        ) AS "objectStateInsert",
        has_column_privilege(
          $1,
          'public.creator_asset_storage_object',
          'state',
          'UPDATE'
        ) AS "objectStateUpdate",
        has_table_privilege($1, 'public.creator_asset_storage_object', 'UPDATE')
          AS "objectUpdate",
        has_table_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'DELETE'
        ) AS "referenceDelete",
        has_table_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'INSERT'
        ) AS "referenceInsert",
        has_table_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'SELECT'
        ) AS "referenceSelect",
        has_column_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'state',
          'INSERT'
        ) AS "referenceStateInsert",
        has_column_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'state',
          'UPDATE'
        ) AS "referenceStateUpdate",
        has_table_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'UPDATE'
        ) AS "referenceUpdate",
        has_column_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'workId',
          'INSERT'
        ) AS "referenceWorkInsert",
        has_column_privilege(
          $1,
          'public.creator_work_asset_storage_reference',
          'workId',
          'UPDATE'
        ) AS "referenceWorkUpdate"
    `, [role])).rows;

    expect(privileges).toEqual({
      objectDelete: false,
      objectDigestUpdate: false,
      objectInsert: false,
      objectPurposeInsert: true,
      objectSelect: true,
      objectStateInsert: false,
      objectStateUpdate: true,
      objectUpdate: false,
      referenceDelete: true,
      referenceInsert: false,
      referenceSelect: true,
      referenceStateInsert: false,
      referenceStateUpdate: true,
      referenceUpdate: false,
      referenceWorkInsert: true,
      referenceWorkUpdate: false,
    });
  });

  it("transactionally repairs a weak same-name CHECK and wrong-shape index on reapply", async () => {
    const migration = forwardMigrationBody(
      await readFile(
        new URL(
          "../../../../../lib/db/migrations/0013_creator_asset_marketplace.sql",
          import.meta.url
        ),
        "utf8"
      ),
      "0013_creator_asset_marketplace.sql"
    );
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      // DDL remains invisible until commit and AccessExclusive-locks affected tables. The
      // transaction advisory lock also serializes another copy of this destructive repair audit.
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        ["toonspectrum-schema-repair-0013"]
      );
      await client.query("SAVEPOINT creator_asset_schema_repair");
      await client.query(`
        ALTER TABLE "creator_asset"
          DROP CONSTRAINT "creator_asset_license_check";
        ALTER TABLE "creator_asset"
          ADD CONSTRAINT "creator_asset_license_check"
          CHECK (
            "license" IN (
              'toonspectrum-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0'
            ) OR true
          );
        DROP INDEX "idx_creator_asset_catalog";
        CREATE UNIQUE INDEX "idx_creator_asset_catalog"
          ON "creator_asset" ("createdAt" ASC)
          WHERE "hidden" = false;
      `);

      await expect(preflightCreatorAssetSchema(client)).rejects.toThrow(
        /0013_creator_asset_marketplace\.sql/u
      );

      await client.query(migration);
      await expect(preflightCreatorAssetSchema(client)).resolves.toBeUndefined();

      const userId = randomUUID();
      await client.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
        userId,
        "Creator Asset migration repair",
      ]);
      await client.query("SAVEPOINT creator_asset_invalid_row");
      let rejection: { code?: string; constraint?: string } | undefined;
      try {
        await client.query(
          `INSERT INTO "creator_asset" (
             "id", "userId", "name", "dataUrl", "width", "height", "kind", "license"
           ) VALUES ($1, $2, $3, $4, 1, 1, 'image', 'unbounded-commercial-license')`,
          [
            randomUUID(),
            userId,
            "Invalid repaired constraint probe",
            "data:image/png;base64,AA==",
          ]
        );
      } catch (error) {
        rejection = error as { code?: string; constraint?: string };
        await client.query("ROLLBACK TO SAVEPOINT creator_asset_invalid_row");
      }
      expect(rejection).toMatchObject({
        code: "23514",
        constraint: "creator_asset_license_check",
      });

      await expect(client.query<{
        accessMethod: string;
        columns: string[];
        expressionFree: boolean;
        keyCount: number;
        predicate: string | null;
        ready: boolean;
        sortOptions: number[];
        storedColumnCount: number;
        unique: boolean;
        valid: boolean;
      }>(`
        SELECT
          access_method.amname::text AS "accessMethod",
          ARRAY(
            SELECT attribute.attname::text
            FROM unnest(index_record.indkey::smallint[]) WITH ORDINALITY
              AS key_column(attnum, position)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = index_record.indrelid
             AND attribute.attnum = key_column.attnum
            WHERE key_column.position <= index_record.indnkeyatts
            ORDER BY key_column.position
          ) AS "columns",
          index_record.indexprs IS NULL AS "expressionFree",
          index_record.indnkeyatts::integer AS "keyCount",
          pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid) AS "predicate",
          index_record.indisready AS "ready",
          ARRAY(
            SELECT option_value::integer
            FROM unnest(index_record.indoption::smallint[]) WITH ORDINALITY
              AS option_record(option_value, position)
            WHERE option_record.position <= index_record.indnkeyatts
            ORDER BY option_record.position
          ) AS "sortOptions",
          index_record.indnatts::integer AS "storedColumnCount",
          index_record.indisunique AS "unique",
          index_record.indisvalid AS "valid"
        FROM pg_catalog.pg_index AS index_record
        JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_record.indexrelid
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
        WHERE index_record.indexrelid = 'public.idx_creator_asset_catalog'::regclass
      `)).resolves.toMatchObject({
        rows: [{
          accessMethod: "btree",
          columns: ["moderationStatus", "hidden", "createdAt"],
          expressionFree: true,
          keyCount: 3,
          predicate: null,
          ready: true,
          sortOptions: [0, 0, 3],
          storedColumnCount: 3,
          unique: false,
          valid: true,
        }],
      });

      await client.query("ROLLBACK TO SAVEPOINT creator_asset_schema_repair");
      await client.query("COMMIT");
      transactionOpen = false;
    } finally {
      if (transactionOpen) await client.query("ROLLBACK");
      client.release();
    }
  });

  it("rejects a preview with any missing integrity field instead of accepting SQL UNKNOWN", async () => {
    const userId = await createUser();
    let rejection: { code?: string; constraint?: string } | undefined;
    try {
      await pool.query(
        `INSERT INTO "creator_asset" (
           "id", "userId", "name", "dataUrl", "width", "height", "kind",
           "previewDataUrl", "previewWidth", "previewHeight", "previewMimeType",
           "previewByteSize", "previewContentHash"
         ) VALUES (
           $1, $2, $3, $4, 1, 1, 'image',
           $5, NULL, 1, 'image/png', 1, $6
         )`,
        [
          randomUUID(),
          userId,
          "Partial preview",
          "data:image/png;base64,AA==",
          "data:image/png;base64,AA==",
          "a".repeat(64),
        ]
      );
    } catch (error) {
      rejection = error as { code?: string; constraint?: string };
    }
    expect(rejection).toMatchObject({
      code: "23514",
      constraint: "creator_asset_preview_check",
    });
  });
});
