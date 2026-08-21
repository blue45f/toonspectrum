import { dbPool } from "../../db";

import type { Pool } from "pg";

export const STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT = Symbol(
  "STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT"
);

const LIVE_LOCK_REVISION_MIGRATION_ID = "0017_creator_work_live_lock_revision";

interface LiveLockSchemaRow {
  lockTable: string | null;
  clockTable: string | null;
  ledgerTable: string | null;
  revisionNotNull: boolean | null;
  revisionDefault: string | null;
  revisionType: string | null;
}

type QueryablePool = Pick<Pool, "query">;

/**
 * Refuse API boot before Socket.IO can accept Studio traffic when the coordinated revision
 * cutover has not completed. `drizzle-kit push` can create the final-looking tables but cannot
 * prove that legacy writers were drained or that the one-time lease eviction ran, so the durable
 * migration ledger is part of the runtime contract.
 */
export async function preflightStudioLiveLockSchema(
  pool: QueryablePool = dbPool
): Promise<void> {
  const schema = await pool.query<LiveLockSchemaRow>(`
    SELECT
      to_regclass('public.creator_work_live_lock')::text AS "lockTable",
      to_regclass('public.creator_work_live_lock_clock')::text AS "clockTable",
      to_regclass('public.toonspectrum_schema_migration')::text AS "ledgerTable",
      (
        SELECT attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.creator_work_live_lock')
          AND attribute.attname = 'revision'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS "revisionNotNull",
      (
        SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS default_record
          ON default_record.adrelid = attribute.attrelid
         AND default_record.adnum = attribute.attnum
        WHERE attribute.attrelid = to_regclass('public.creator_work_live_lock')
          AND attribute.attname = 'revision'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS "revisionDefault",
      (
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = to_regclass('public.creator_work_live_lock')
          AND attribute.attname = 'revision'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS "revisionType"
  `);
  const state = schema.rows[0];
  if (
    !state ||
    !state.lockTable ||
    !state.clockTable ||
    !state.ledgerTable ||
    state.revisionNotNull !== true ||
    state.revisionDefault !== null ||
    state.revisionType !== "bigint"
  ) {
    throw new Error(
      "Studio live-lock revision schema is incomplete; drain Studio API writers and apply migration 0017 before starting the API"
    );
  }

  const ledger = await pool.query<{ applied: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM public.toonspectrum_schema_migration
       WHERE "id" = $1
     ) AS "applied"`,
    [LIVE_LOCK_REVISION_MIGRATION_ID]
  );
  if (ledger.rows[0]?.applied !== true) {
    throw new Error(
      "Studio live-lock revision cutover is not recorded; drain Studio API writers and apply migration 0017 before starting the API"
    );
  }
}

export const studioLiveLockSchemaPreflightProvider = {
  provide: STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT,
  useFactory: async (): Promise<true> => {
    await preflightStudioLiveLockSchema();
    return true;
  },
};
